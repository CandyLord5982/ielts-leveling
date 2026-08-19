import { useState, useCallback } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from './useAuth'

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function useTournament() {
  const { user } = useAuth()
  const [tournaments, setTournaments] = useState([])
  const [tournament, setTournament] = useState(null)
  const [participants, setParticipants] = useState([])
  const [matches, setMatches] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(false)

  // Fetch all tournaments (admin list)
  const fetchTournaments = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*, creator:users!tournaments_created_by_fkey(full_name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      setTournaments(data || [])
    } catch (err) {
      console.error('fetchTournaments error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch single tournament with participants + matches + teams
  const fetchTournament = useCallback(async (id) => {
    setLoading(true)
    try {
      const [tRes, pRes, mRes] = await Promise.all([
        supabase.from('tournaments').select('*').eq('id', id).single(),
        supabase
          .from('tournament_participants')
          .select('*, user:users!tournament_participants_user_fkey(id, full_name, avatar_url, xp, level)')
          .eq('tournament_id', id)
          .order('seed'),
        supabase
          .from('tournament_matches')
          .select('*')
          .eq('tournament_id', id)
          .order('round')
          .order('match_position'),
      ])
      if (tRes.error) throw tRes.error
      setTournament(tRes.data)
      setParticipants(pRes.data || [])
      setMatches(mRes.data || [])

      // Fetch teams if team mode
      let teamsData = []
      if (tRes.data?.mode === 'team') {
        const { data: tTeams } = await supabase
          .from('tournament_teams')
          .select('*, members:tournament_team_members(*, user:users!tournament_team_members_user_id_fkey(id, full_name, avatar_url))')
          .eq('tournament_id', id)
          .order('seed')
        teamsData = tTeams || []
      }
      setTeams(teamsData)

      return { tournament: tRes.data, participants: pRes.data || [], matches: mRes.data || [], teams: teamsData }
    } catch (err) {
      console.error('fetchTournament error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Create tournament with bracket
  const createTournament = useCallback(async ({ name, info = null, bracket_size, game_type, studentIds, round_rewards = {}, entry_fee = 0, mode = 'solo', team_size = 1, teamAssignments = [], best_of = 1 }) => {
    const total_rounds = Math.log2(bracket_size)

    if (mode === 'team') {
      // ── Team mode ──
      // teamAssignments: [{ name: 'Team A', memberIds: ['uid1','uid2',...] }, ...]
      const allMemberIds = teamAssignments.flatMap(t => t.memberIds)

      // Deduct entry fee from all members
      if (entry_fee > 0) {
        for (const uid of allMemberIds) {
          const { data: u } = await supabase.from('users').select('xp, full_name').eq('id', uid).single()
          if (!u || (u.xp || 0) < entry_fee) {
            throw new Error(`${u?.full_name || 'Học sinh'} không đủ ${entry_fee} XP (hiện có ${u?.xp || 0})`)
          }
        }
        for (const uid of allMemberIds) {
          await supabase.rpc('spend_user_xp', { p_user_id: uid, p_amount: entry_fee })
        }
      }

      // 1. Insert tournament
      const { data: t, error: tErr } = await supabase.from('tournaments').insert({
        name,
        info,
        bracket_size,
        game_type,
        total_rounds,
        current_round: 1,
        status: 'active',
        created_by: user.id,
        round_rewards,
        entry_fee,
        mode: 'team',
        team_size,
        best_of,
      }).select().single()
      if (tErr) throw tErr

      // 2. Insert teams
      const teamRows = teamAssignments.map((team, i) => ({
        tournament_id: t.id,
        name: team.name,
        seed: i + 1,
      }))
      const { data: insertedTeams, error: teamErr } = await supabase.from('tournament_teams').insert(teamRows).select()
      if (teamErr) throw teamErr

      // 3. Insert team members + participants
      const memberRows = []
      const participantRows = []
      for (let ti = 0; ti < teamAssignments.length; ti++) {
        const team = teamAssignments[ti]
        const dbTeam = insertedTeams.find(dt => dt.seed === ti + 1)
        for (const uid of team.memberIds) {
          memberRows.push({ team_id: dbTeam.id, user_id: uid })
          participantRows.push({ tournament_id: t.id, user_id: uid, seed: ti * team_size + participantRows.filter(p => p.tournament_id === t.id).length + 1 })
        }
      }
      if (memberRows.length > 0) {
        await supabase.from('tournament_team_members').insert(memberRows)
      }
      // Use a simple incrementing seed for participants
      const finalParticipantRows = []
      let seedCounter = 1
      for (const team of teamAssignments) {
        const dbTeam = insertedTeams.find(dt => dt.name === team.name)
        for (const uid of team.memberIds) {
          finalParticipantRows.push({ tournament_id: t.id, user_id: uid, seed: seedCounter++ })
        }
      }
      if (finalParticipantRows.length > 0) {
        await supabase.from('tournament_participants').insert(finalParticipantRows)
      }

      // 4. Generate match slots using team IDs
      const allMatches = []
      const r1Count = bracket_size / 2
      const nowIso = new Date().toISOString()
      for (let i = 0; i < r1Count; i++) {
        allMatches.push({
          tournament_id: t.id,
          round: 1,
          match_position: i,
          team1_id: insertedTeams[i * 2]?.id || null,
          team2_id: insertedTeams[i * 2 + 1]?.id || null,
          status: 'ready',
          ready_at: nowIso,
        })
      }
      for (let r = 2; r <= total_rounds; r++) {
        const matchCount = bracket_size / Math.pow(2, r)
        for (let i = 0; i < matchCount; i++) {
          allMatches.push({ tournament_id: t.id, round: r, match_position: i, status: 'pending' })
        }
      }
      const { error: mErr } = await supabase.from('tournament_matches').insert(allMatches)
      if (mErr) throw mErr

      return t
    }

    // ── Solo mode (unchanged) ──
    const shuffled = studentIds

    if (entry_fee > 0) {
      for (const uid of shuffled) {
        const { data: u } = await supabase.from('users').select('xp, full_name').eq('id', uid).single()
        if (!u || (u.xp || 0) < entry_fee) {
          throw new Error(`${u?.full_name || 'Học sinh'} không đủ ${entry_fee} XP (hiện có ${u?.xp || 0})`)
        }
      }
      for (const uid of shuffled) {
        await supabase.rpc('spend_user_xp', { p_user_id: uid, p_amount: entry_fee })
      }
    }

    const { data: t, error: tErr } = await supabase.from('tournaments').insert({
      name,
      info,
      bracket_size,
      game_type,
      total_rounds,
      current_round: 1,
      status: 'active',
      created_by: user.id,
      round_rewards,
      entry_fee,
      best_of,
    }).select().single()
    if (tErr) throw tErr

    const participantRows = shuffled.map((uid, i) => ({
      tournament_id: t.id,
      user_id: uid,
      seed: i + 1,
    }))
    const { error: pErr } = await supabase.from('tournament_participants').insert(participantRows)
    if (pErr) throw pErr

    const allMatches = []
    const r1Count = bracket_size / 2
    const nowIso = new Date().toISOString()
    for (let i = 0; i < r1Count; i++) {
      allMatches.push({
        tournament_id: t.id,
        round: 1,
        match_position: i,
        player1_id: shuffled[i * 2],
        player2_id: shuffled[i * 2 + 1],
        status: 'ready',
        ready_at: nowIso,
      })
    }
    for (let r = 2; r <= total_rounds; r++) {
      const matchCount = bracket_size / Math.pow(2, r)
      for (let i = 0; i < matchCount; i++) {
        allMatches.push({ tournament_id: t.id, round: r, match_position: i, status: 'pending' })
      }
    }
    const { error: mErr } = await supabase.from('tournament_matches').insert(allMatches)
    if (mErr) throw mErr

    return t
  }, [user])

  // Record a match result
  const recordMatchResult = useCallback(async (matchId, { player1_score, player2_score, winner_id, team_winner_id }) => {
    const updateData = {
      player1_score,
      player2_score,
      status: 'completed',
      updated_at: new Date().toISOString(),
    }
    if (team_winner_id) {
      updateData.team_winner_id = team_winner_id
    } else {
      updateData.winner_id = winner_id
    }

    const { error: mErr } = await supabase.from('tournament_matches').update(updateData).eq('id', matchId)
    if (mErr) throw mErr

    const { data: match } = await supabase.from('tournament_matches')
      .select('tournament_id, round, player1_id, player2_id, team1_id, team2_id')
      .eq('id', matchId)
      .single()

    if (match) {
      if (team_winner_id) {
        // Team mode: mark losing team
        const loserTeamId = match.team1_id === team_winner_id ? match.team2_id : match.team1_id
        await supabase.from('tournament_teams')
          .update({ eliminated_in_round: match.round })
          .eq('id', loserTeamId)
      } else {
        // Solo mode: mark loser
        const loserId = match.player1_id === winner_id ? match.player2_id : match.player1_id
        await supabase.from('tournament_participants')
          .update({ eliminated_in_round: match.round })
          .eq('tournament_id', match.tournament_id)
          .eq('user_id', loserId)
      }
    }
  }, [])

  // Advance to next round
  const advanceRound = useCallback(async (tournamentId) => {
    const { data: t } = await supabase.from('tournaments')
      .select('*').eq('id', tournamentId).single()
    if (!t) throw new Error('Tournament not found')

    const isTeamMode = t.mode === 'team'
    const currentRound = t.current_round

    // Auto-finalize ready matches
    const { data: pendingFinalize } = await supabase.from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('round', currentRound)
      .eq('status', 'ready')

    for (const m of (pendingFinalize || [])) {
      if (m.player1_score != null && m.player2_score != null) {
        if (isTeamMode) {
          const winnerTeamId = m.player1_score >= m.player2_score ? m.team1_id : m.team2_id
          const loserTeamId = winnerTeamId === m.team1_id ? m.team2_id : m.team1_id
          await supabase.from('tournament_matches').update({
            team_winner_id: winnerTeamId,
            status: 'completed',
            updated_at: new Date().toISOString(),
          }).eq('id', m.id)
          await supabase.from('tournament_teams')
            .update({ eliminated_in_round: m.round })
            .eq('id', loserTeamId)
        } else {
          const winnerId = m.player1_score >= m.player2_score ? m.player1_id : m.player2_id
          const loserId = winnerId === m.player1_id ? m.player2_id : m.player1_id
          await supabase.from('tournament_matches').update({
            winner_id: winnerId,
            status: 'completed',
            updated_at: new Date().toISOString(),
          }).eq('id', m.id)
          await supabase.from('tournament_participants')
            .update({ eliminated_in_round: m.round })
            .eq('tournament_id', tournamentId)
            .eq('user_id', loserId)
        }
      }
    }

    // Check all matches in current round are completed
    const { data: currentMatches } = await supabase.from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('round', currentRound)
      .order('match_position')

    const allCompleted = currentMatches?.every(m => m.status === 'completed')
    if (!allCompleted) throw new Error('Not all matches in current round are completed')

    // If final round, complete tournament
    if (currentRound >= t.total_rounds) {
      const finalMatch = currentMatches[0]
      const winnerId = isTeamMode ? null : finalMatch.winner_id
      const winningTeamId = isTeamMode ? finalMatch.team_winner_id : null
      await distributeTournamentRewards(tournamentId, winnerId, winningTeamId, t)
      await supabase.from('tournaments').update({
        status: 'completed',
        winner_id: winnerId,
        winning_team_id: winningTeamId,
        current_round: currentRound,
        updated_at: new Date().toISOString(),
      }).eq('id', tournamentId)
      return { completed: true, winner_id: winnerId, winning_team_id: winningTeamId }
    }

    // Feed winners into next round
    const nextRound = currentRound + 1
    for (const match of currentMatches) {
      const nextPos = Math.floor(match.match_position / 2)
      const isSlot1 = match.match_position % 2 === 0

      if (isTeamMode) {
        const updateField = isSlot1 ? 'team1_id' : 'team2_id'
        await supabase.from('tournament_matches')
          .update({ [updateField]: match.team_winner_id, updated_at: new Date().toISOString() })
          .eq('tournament_id', tournamentId)
          .eq('round', nextRound)
          .eq('match_position', nextPos)
      } else {
        const updateField = isSlot1 ? 'player1_id' : 'player2_id'
        await supabase.from('tournament_matches')
          .update({ [updateField]: match.winner_id, updated_at: new Date().toISOString() })
          .eq('tournament_id', tournamentId)
          .eq('round', nextRound)
          .eq('match_position', nextPos)
      }
    }

    // Set next round matches to 'ready' if both sides filled
    const { data: nextMatches } = await supabase.from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('round', nextRound)

    for (const nm of (nextMatches || [])) {
      const hasBoth = isTeamMode
        ? (nm.team1_id && nm.team2_id)
        : (nm.player1_id && nm.player2_id)
      if (hasBoth) {
        const nowIso = new Date().toISOString()
        await supabase.from('tournament_matches')
          .update({ status: 'ready', ready_at: nowIso, updated_at: nowIso })
          .eq('id', nm.id)
      }
    }

    await supabase.from('tournaments').update({
      current_round: nextRound,
      updated_at: new Date().toISOString(),
    }).eq('id', tournamentId)

    return { completed: false, nextRound }
  }, [])

  // Distribute rewards
  const distributeTournamentRewards = async (tournamentId, winnerId, winningTeamId, tournament) => {
    const rewards = tournament.round_rewards || {}
    const isTeamMode = tournament.mode === 'team'

    if (isTeamMode) {
      // Get all teams with members
      const { data: allTeams } = await supabase.from('tournament_teams')
        .select('id, eliminated_in_round, members:tournament_team_members(user_id)')
        .eq('tournament_id', tournamentId)

      for (const team of (allTeams || [])) {
        const key = team.id === winningTeamId ? 'winner' : String(team.eliminated_in_round || 1)
        const r = rewards[key] || {}
        const xpReward = r.xp || 0
        const gemReward = r.gems || 0
        const memberIds = (team.members || []).map(m => m.user_id)

        for (const uid of memberIds) {
          if (xpReward > 0 || gemReward > 0) {
            await supabase.rpc('increment_user_currency', { p_user_id: uid, p_xp: xpReward, p_gems: gemReward })
          }
          if (r.item_id) {
            const qty = r.item_quantity || 1
            const { data: uName } = await supabase.from('users').select('full_name').eq('id', uid).single()
            const { data: itemInfo } = await supabase.from('collectible_items').select('name').eq('id', r.item_id).single()
            const { data: existing } = await supabase.from('user_inventory')
              .select('id, quantity').eq('user_id', uid).eq('item_id', r.item_id).single()
            if (existing) {
              await supabase.from('user_inventory')
                .update({ quantity: existing.quantity + qty, updated_at: new Date().toISOString() })
                .eq('id', existing.id)
            } else {
              await supabase.from('user_inventory').insert({
                user_id: uid, user_name: uName?.full_name, item_id: r.item_id, item_name: itemInfo?.name, quantity: qty,
              })
            }
          }
          if (r.chest_id) {
            await supabase.from('user_chests').insert({
              user_id: uid, chest_id: r.chest_id, source: 'tournament', source_ref: tournamentId,
            })
          }
        }
      }
    } else {
      // Solo mode (unchanged)
      const { data: allParticipants } = await supabase.from('tournament_participants')
        .select('user_id, eliminated_in_round')
        .eq('tournament_id', tournamentId)

      for (const p of (allParticipants || [])) {
        const key = p.user_id === winnerId ? 'winner' : String(p.eliminated_in_round || 1)
        const r = rewards[key] || {}
        const xpReward = r.xp || 0
        const gemReward = r.gems || 0

        if (xpReward > 0 || gemReward > 0) {
          await supabase.rpc('increment_user_currency', { p_user_id: p.user_id, p_xp: xpReward, p_gems: gemReward })
        }
        if (r.item_id) {
          const qty = r.item_quantity || 1
          const { data: uName } = await supabase.from('users').select('full_name').eq('id', p.user_id).single()
          const { data: itemInfo } = await supabase.from('collectible_items').select('name').eq('id', r.item_id).single()
          const { data: existing } = await supabase.from('user_inventory')
            .select('id, quantity').eq('user_id', p.user_id).eq('item_id', r.item_id).single()
          if (existing) {
            await supabase.from('user_inventory')
              .update({ quantity: existing.quantity + qty, updated_at: new Date().toISOString() })
              .eq('id', existing.id)
          } else {
            await supabase.from('user_inventory').insert({
              user_id: p.user_id, user_name: uName?.full_name, item_id: r.item_id, item_name: itemInfo?.name, quantity: qty,
            })
          }
        }
        if (r.chest_id) {
          await supabase.from('user_chests').insert({
            user_id: p.user_id, chest_id: r.chest_id, source: 'tournament', source_ref: tournamentId,
          })
        }
      }
    }
  }

  // Check training_scores to auto-resolve ready matches
  const checkMatchScores = useCallback(async (tournamentId) => {
    const { data: t } = await supabase.from('tournaments')
      .select('*').eq('id', tournamentId).single()
    if (!t || t.status !== 'active') return { updated: 0 }

    const isTeamMode = t.mode === 'team'
    const bestOf = t.best_of || 1

    const { data: readyMatches } = await supabase.from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('status', 'ready')

    if (!readyMatches?.length) return { updated: 0 }

    let updated = 0

    if (isTeamMode) {
      // Fetch all teams with members for this tournament
      const { data: allTeams } = await supabase.from('tournament_teams')
        .select('id, members:tournament_team_members(user_id)')
        .eq('tournament_id', tournamentId)
      const teamMemberMap = {}
      for (const team of (allTeams || [])) {
        teamMemberMap[team.id] = (team.members || []).map(m => m.user_id)
      }

      for (const match of readyMatches) {
        if (!match.team1_id || !match.team2_id) continue
        const since = match.ready_at || match.created_at
        const team1Members = teamMemberMap[match.team1_id] || []
        const team2Members = teamMemberMap[match.team2_id] || []

        if (bestOf > 1) {
          // Best-of-N: for each round, sum each member's Nth play
          const getTeamPlays = async (memberIds) => {
            const allPlays = {}
            for (const uid of memberIds) {
              const { data } = await supabase.from('training_scores')
                .select('score, played_at')
                .eq('user_id', uid)
                .eq('game_type', t.game_type)
                .gte('played_at', since)
                .gt('score', 0)
                .order('played_at', { ascending: true })
                .limit(bestOf)
              allPlays[uid] = (data || []).map(d => d.score)
            }
            return allPlays
          }

          const [t1Plays, t2Plays] = await Promise.all([
            getTeamPlays(team1Members),
            getTeamPlays(team2Members),
          ])

          // A round is "complete" for a team only when ALL members have played that round
          const t1Arrays = Object.values(t1Plays)
          const t2Arrays = Object.values(t2Plays)
          const t1CompletedRounds = t1Arrays.length === 0 ? 0 : Math.min(...t1Arrays.map(p => p.length))
          const t2CompletedRounds = t2Arrays.length === 0 ? 0 : Math.min(...t2Arrays.map(p => p.length))
          const completedRounds = Math.min(t1CompletedRounds, t2CompletedRounds)
          if (completedRounds === 0) continue

          const roundScores = []
          let t1Wins = 0, t2Wins = 0
          const needed = Math.floor(bestOf / 2) + 1
          for (let i = 0; i < completedRounds; i++) {
            const s1 = t1Arrays.reduce((sum, p) => sum + p[i], 0)
            const s2 = t2Arrays.reduce((sum, p) => sum + p[i], 0)
            const winner = s1 > s2 ? 1 : s2 > s1 ? 2 : 0
            roundScores.push({ p1: s1, p2: s2, winner })
            if (winner === 1) t1Wins++
            if (winner === 2) t2Wins++
            if (t1Wins >= needed || t2Wins >= needed) break
          }

          const partial = {}
          if (t1Wins !== match.player1_score) partial.player1_score = t1Wins
          if (t2Wins !== match.player2_score) partial.player2_score = t2Wins
          if (JSON.stringify(roundScores) !== JSON.stringify(match.round_scores)) partial.round_scores = roundScores
          if (Object.keys(partial).length > 0) {
            await supabase.from('tournament_matches').update(partial).eq('id', match.id)
            updated++
          }
        } else {
          // Single best score per member, then sum
          const getTeamScore = async (memberIds) => {
            if (memberIds.length === 0) return null
            let total = 0
            let anyPlayed = false
            for (const uid of memberIds) {
              const { data } = await supabase.from('training_scores')
                .select('score')
                .eq('user_id', uid)
                .eq('game_type', t.game_type)
                .gte('played_at', since)
                .gt('score', 0)
                .order('score', { ascending: false })
                .limit(1)
              if (data?.[0]) {
                total += data[0].score
                anyPlayed = true
              }
            }
            return anyPlayed ? total : null
          }

          const [t1Score, t2Score] = await Promise.all([
            getTeamScore(team1Members),
            getTeamScore(team2Members),
          ])

          if (t1Score == null && t2Score == null) continue

          const partial = {}
          if (t1Score != null && t1Score !== match.player1_score) partial.player1_score = t1Score
          if (t2Score != null && t2Score !== match.player2_score) partial.player2_score = t2Score
          if (Object.keys(partial).length > 0) {
            await supabase.from('tournament_matches').update(partial).eq('id', match.id)
            updated++
          }
        }
      }
    } else if (bestOf > 1) {
      // Solo mode – best-of-N rounds
      for (const match of readyMatches) {
        if (!match.player1_id || !match.player2_id) continue
        const since = match.ready_at || match.created_at

        const [p1Res, p2Res] = await Promise.all([
          supabase.from('training_scores')
            .select('score, played_at')
            .eq('user_id', match.player1_id)
            .eq('game_type', t.game_type)
            .gte('played_at', since)
            .gt('score', 0)
            .order('played_at', { ascending: true })
            .limit(bestOf),
          supabase.from('training_scores')
            .select('score, played_at')
            .eq('user_id', match.player2_id)
            .eq('game_type', t.game_type)
            .gte('played_at', since)
            .gt('score', 0)
            .order('played_at', { ascending: true })
            .limit(bestOf),
        ])

        const p1Plays = p1Res.data || []
        const p2Plays = p2Res.data || []
        if (p1Plays.length === 0 && p2Plays.length === 0) continue

        // Only count rounds where BOTH players have played
        const roundScores = []
        let p1Wins = 0, p2Wins = 0
        const completedRounds = Math.min(p1Plays.length, p2Plays.length)
        const needed = Math.floor(bestOf / 2) + 1
        for (let i = 0; i < completedRounds; i++) {
          const s1 = p1Plays[i].score
          const s2 = p2Plays[i].score
          const winner = s1 > s2 ? 1 : s2 > s1 ? 2 : 0
          roundScores.push({ p1: s1, p2: s2, winner })
          if (winner === 1) p1Wins++
          if (winner === 2) p2Wins++
          if (p1Wins >= needed || p2Wins >= needed) break
        }

        const partial = {}
        if (p1Wins !== match.player1_score) partial.player1_score = p1Wins
        if (p2Wins !== match.player2_score) partial.player2_score = p2Wins
        if (JSON.stringify(roundScores) !== JSON.stringify(match.round_scores)) partial.round_scores = roundScores
        if (Object.keys(partial).length > 0) {
          await supabase.from('tournament_matches').update(partial).eq('id', match.id)
          updated++
        }
      }
    } else {
      // Solo mode – single best score (best_of = 1)
      for (const match of readyMatches) {
        if (!match.player1_id || !match.player2_id) continue
        const since = match.ready_at || match.created_at

        const [p1Res, p2Res] = await Promise.all([
          supabase.from('training_scores')
            .select('score')
            .eq('user_id', match.player1_id)
            .eq('game_type', t.game_type)
            .gte('played_at', since)
            .gt('score', 0)
            .order('score', { ascending: false })
            .limit(1),
          supabase.from('training_scores')
            .select('score')
            .eq('user_id', match.player2_id)
            .eq('game_type', t.game_type)
            .gte('played_at', since)
            .gt('score', 0)
            .order('score', { ascending: false })
            .limit(1),
        ])

        const p1Best = p1Res.data?.[0]?.score ?? null
        const p2Best = p2Res.data?.[0]?.score ?? null

        if (p1Best == null && p2Best == null) continue

        const partial = {}
        if (p1Best != null && p1Best !== match.player1_score) partial.player1_score = p1Best
        if (p2Best != null && p2Best !== match.player2_score) partial.player2_score = p2Best
        if (Object.keys(partial).length > 0) {
          await supabase.from('tournament_matches').update(partial).eq('id', match.id)
          updated++
        }
      }
    }

    return { updated }
  }, [])

  // Delete tournament
  const deleteTournament = useCallback(async (id) => {
    const { error } = await supabase.from('tournaments').delete().eq('id', id)
    if (error) throw error
  }, [])

  // Fetch tournaments for a student
  const fetchMyTournaments = useCallback(async () => {
    const { data } = await supabase
      .from('tournaments')
      .select('*')
      .in('status', ['active', 'completed'])
      .order('created_at', { ascending: false })

    const all = data || []
    const active = all.filter(t => t.status === 'active')
    if (active.length > 0) return active
    const latestCompleted = all.find(t => t.status === 'completed')
    return latestCompleted ? [latestCompleted] : []
  }, [])

  // Fetch open-for-registration tournaments (for students)
  const fetchOpenTournaments = useCallback(async (userLevel) => {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*, creator:users!tournaments_created_by_fkey(full_name), participant_count:tournament_participants(count)')
      .eq('status', 'registration')
      .order('created_at', { ascending: false })
    if (error) { console.error('fetchOpenTournaments:', error); return [] }
    return (data || []).filter(t =>
      !t.allowed_levels || t.allowed_levels.length === 0 || t.allowed_levels.includes(userLevel)
    )
  }, [])

  // Register current user for a tournament (solo mode)
  const registerForTournament = useCallback(async (tournamentId) => {
    if (!user?.id) throw new Error('Not logged in')
    const { data: t } = await supabase.from('tournaments').select('entry_fee, bracket_size, mode').eq('id', tournamentId).single()
    if (!t) throw new Error('Tournament not found')
    const { count } = await supabase.from('tournament_participants').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId)
    if (count >= t.bracket_size) throw new Error('Giải đấu đã đầy')
    if (t.entry_fee > 0) {
      const { data: u } = await supabase.from('users').select('xp').eq('id', user.id).single()
      if ((u?.xp || 0) < t.entry_fee) throw new Error(`Không đủ XP (cần ${t.entry_fee}, hiện có ${u?.xp || 0})`)
    }
    const { error } = await supabase.from('tournament_participants').insert({ tournament_id: tournamentId, user_id: user.id, seed: count + 1 })
    if (error) throw error
  }, [user])

  // ── Team registration helpers ──

  // Create a new team and join it
  const createTeam = useCallback(async (tournamentId, teamName) => {
    if (!user?.id) throw new Error('Not logged in')
    const { data: t } = await supabase.from('tournaments').select('bracket_size, team_size, entry_fee').eq('id', tournamentId).single()
    if (!t) throw new Error('Tournament not found')

    // Check team count
    const { count: teamCount } = await supabase.from('tournament_teams').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId)
    if (teamCount >= t.bracket_size) throw new Error('Đã đủ đội')

    // Check XP
    if (t.entry_fee > 0) {
      const { data: u } = await supabase.from('users').select('xp').eq('id', user.id).single()
      if ((u?.xp || 0) < t.entry_fee) throw new Error(`Không đủ XP (cần ${t.entry_fee}, hiện có ${u?.xp || 0})`)
    }

    // Create team
    const { data: team, error: teamErr } = await supabase.from('tournament_teams').insert({
      tournament_id: tournamentId,
      name: teamName,
      seed: teamCount + 1,
    }).select().single()
    if (teamErr) throw teamErr

    // Add self as member
    await supabase.from('tournament_team_members').insert({ team_id: team.id, user_id: user.id })
    // Also add as participant
    const { count: pCount } = await supabase.from('tournament_participants').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId)
    await supabase.from('tournament_participants').insert({ tournament_id: tournamentId, user_id: user.id, seed: pCount + 1 })

    return team
  }, [user])

  // Join an existing team
  const joinTeam = useCallback(async (teamId) => {
    if (!user?.id) throw new Error('Not logged in')

    // Get team info
    const { data: team } = await supabase.from('tournament_teams').select('tournament_id').eq('id', teamId).single()
    if (!team) throw new Error('Team not found')

    const { data: t } = await supabase.from('tournaments').select('team_size, entry_fee').eq('id', team.tournament_id).single()
    if (!t) throw new Error('Tournament not found')

    // Check team not full
    const { count: memberCount } = await supabase.from('tournament_team_members').select('*', { count: 'exact', head: true }).eq('team_id', teamId)
    if (memberCount >= t.team_size) throw new Error('Đội đã đầy')

    // Check XP
    if (t.entry_fee > 0) {
      const { data: u } = await supabase.from('users').select('xp').eq('id', user.id).single()
      if ((u?.xp || 0) < t.entry_fee) throw new Error(`Không đủ XP (cần ${t.entry_fee}, hiện có ${u?.xp || 0})`)
    }

    // Join
    const { error } = await supabase.from('tournament_team_members').insert({ team_id: teamId, user_id: user.id })
    if (error) throw error

    // Also add as participant
    const { count: pCount } = await supabase.from('tournament_participants').select('*', { count: 'exact', head: true }).eq('tournament_id', team.tournament_id)
    await supabase.from('tournament_participants').insert({ tournament_id: team.tournament_id, user_id: user.id, seed: pCount + 1 })
  }, [user])

  // Admin: start a registration-phase tournament
  const startTournament = useCallback(async (tournamentId) => {
    const { data: t } = await supabase.from('tournaments').select('*').eq('id', tournamentId).single()
    if (!t) throw new Error('Tournament not found')
    if (t.status !== 'registration') throw new Error('Tournament not in registration phase')

    const isTeamMode = t.mode === 'team'

    if (isTeamMode) {
      // Validate teams
      const { data: tTeams } = await supabase.from('tournament_teams')
        .select('id, seed, members:tournament_team_members(user_id)')
        .eq('tournament_id', tournamentId)
        .order('seed')
      if (!tTeams || tTeams.length !== t.bracket_size) {
        throw new Error(`Cần đúng ${t.bracket_size} đội (hiện có ${tTeams?.length || 0})`)
      }

      // Deduct entry fee from all members
      if (t.entry_fee > 0) {
        const allMemberIds = tTeams.flatMap(team => (team.members || []).map(m => m.user_id))
        for (const uid of allMemberIds) {
          const { data: u } = await supabase.from('users').select('xp, full_name').eq('id', uid).single()
          if (!u || (u.xp || 0) < t.entry_fee) throw new Error(`${u?.full_name || 'Học sinh'} không đủ ${t.entry_fee} XP`)
          await supabase.rpc('spend_user_xp', { p_user_id: uid, p_amount: t.entry_fee })
        }
      }

      // Generate matches using team IDs
      const total_rounds = Math.log2(t.bracket_size)
      const allMatches = []
      const r1Count = t.bracket_size / 2
      const nowIso = new Date().toISOString()
      for (let i = 0; i < r1Count; i++) {
        allMatches.push({
          tournament_id: t.id, round: 1, match_position: i,
          team1_id: tTeams[i * 2]?.id, team2_id: tTeams[i * 2 + 1]?.id,
          status: 'ready', ready_at: nowIso,
        })
      }
      for (let r = 2; r <= total_rounds; r++) {
        const matchCount = t.bracket_size / Math.pow(2, r)
        for (let i = 0; i < matchCount; i++) {
          allMatches.push({ tournament_id: t.id, round: r, match_position: i, status: 'pending' })
        }
      }
      const { error: mErr } = await supabase.from('tournament_matches').insert(allMatches)
      if (mErr) throw mErr

      await supabase.from('tournaments').update({ status: 'active', current_round: 1, total_rounds, updated_at: new Date().toISOString() }).eq('id', tournamentId)
    } else {
      // Solo mode (unchanged)
      const { data: parts } = await supabase.from('tournament_participants')
        .select('user_id').eq('tournament_id', tournamentId).order('seed')
      const playerIds = (parts || []).map(p => p.user_id)
      if (playerIds.length !== t.bracket_size) throw new Error(`Cần đúng ${t.bracket_size} người chơi (hiện có ${playerIds.length})`)

      if (t.entry_fee > 0) {
        for (const uid of playerIds) {
          const { data: u } = await supabase.from('users').select('xp, full_name').eq('id', uid).single()
          if (!u || (u.xp || 0) < t.entry_fee) throw new Error(`${u?.full_name || 'Học sinh'} không đủ ${t.entry_fee} XP`)
          await supabase.rpc('spend_user_xp', { p_user_id: uid, p_amount: t.entry_fee })
        }
      }

      const total_rounds = Math.log2(t.bracket_size)
      const allMatches = []
      const r1Count = t.bracket_size / 2
      const nowIso = new Date().toISOString()
      for (let i = 0; i < r1Count; i++) {
        allMatches.push({ tournament_id: t.id, round: 1, match_position: i, player1_id: playerIds[i * 2], player2_id: playerIds[i * 2 + 1], status: 'ready', ready_at: nowIso })
      }
      for (let r = 2; r <= total_rounds; r++) {
        const matchCount = t.bracket_size / Math.pow(2, r)
        for (let i = 0; i < matchCount; i++) {
          allMatches.push({ tournament_id: t.id, round: r, match_position: i, status: 'pending' })
        }
      }
      const { error: mErr } = await supabase.from('tournament_matches').insert(allMatches)
      if (mErr) throw mErr

      await supabase.from('tournaments').update({ status: 'active', current_round: 1, total_rounds, updated_at: new Date().toISOString() }).eq('id', tournamentId)
    }
  }, [])

  return {
    tournaments,
    tournament,
    participants,
    matches,
    teams,
    loading,
    fetchTournaments,
    fetchTournament,
    createTournament,
    recordMatchResult,
    advanceRound,
    deleteTournament,
    fetchMyTournaments,
    fetchOpenTournaments,
    registerForTournament,
    createTeam,
    joinTeam,
    startTournament,
    checkMatchScores,
  }
}
