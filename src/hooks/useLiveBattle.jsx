import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../supabase/client'
import { assetUrl } from './useBranding'

// Power-up definitions
export const POWERUPS = {
  double: { name: 'Double', icon: '⚡', image: assetUrl('/class-battle/double.png'), description: 'Next point add is 2x', color: 'from-yellow-400 to-orange-500' },
  shield: { name: 'Shield', icon: '🛡️', image: assetUrl('/class-battle/shield.png'), description: 'Block next steal or freeze', color: 'from-blue-400 to-blue-600' },
  steal:  { name: 'Steal', icon: '🦊', image: assetUrl('/class-battle/steal.png'), description: 'Steal points from opponent', color: 'from-red-400 to-red-600' },
  swap:   { name: 'Swap', icon: '🔄', image: assetUrl('/class-battle/swap.png'), description: 'Swap team scores', color: 'from-purple-400 to-purple-600' },
  mystery:{ name: 'Mystery', icon: '🎁', image: assetUrl('/class-battle/spell.png'), description: 'Random effect!', color: 'from-pink-400 to-pink-600' },
  random: { name: 'Random', icon: '🎲', image: assetUrl('/class-battle/randomspell.png'), description: 'Pick a random power-up!', color: 'from-emerald-400 to-teal-500' },
}

const resolvePetImage = (userPet) => {
  if (!userPet?.pets?.image_url) return null
  let img = userPet.pets.image_url
  if (userPet.evolution_stage > 0 && userPet.pets.evolution_stages) {
    const stage = userPet.pets.evolution_stages.find(s => s.stage === userPet.evolution_stage)
    if (stage?.image_url) img = stage.image_url
  }
  return img.startsWith('http') ? img : assetUrl(img)
}

export function useLiveBattle() {
  const [session, setSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [teamScores, setTeamScores] = useState({ a: 0, b: 0 })

  // Power-up state (local only)
  const [activePowerups, setActivePowerups] = useState({ a: [], b: [] })
  const freezeTimerRef = useRef({})

  // Auto-save participants to DB whenever scores change (debounced)
  const saveTimerRef = useRef(null)
  useEffect(() => {
    if (!session?.id || participants.length === 0) return
    if (session.status === 'finished') return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      // Persist each participant's team
      for (const p of participants) {
        supabase
          .from('live_battle_participants')
          .update({ team: p.team })
          .eq('id', p.id)
          .then(() => {})
      }
      // Persist session team names and scores
      supabase
        .from('live_battle_sessions')
        .update({
          team_a_name: session.team_a_name,
          team_b_name: session.team_b_name,
          team_a_score: teamScores.a,
          team_b_score: teamScores.b,
        })
        .eq('id', session.id)
        .then(() => {})
    }, 500)

    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [participants, session, teamScores])


  // Enrich participant rows with student/pet display info
  const enrichParticipants = useCallback(async (parts) => {
    const userIds = parts.map(p => p.user_id)
    if (userIds.length === 0) return []

    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, avatar_url')
      .in('id', userIds)

    const petIds = parts.map(p => p.user_pet_id).filter(Boolean)
    let petData = []
    if (petIds.length > 0) {
      const { data } = await supabase
        .from('user_pets')
        .select('id, user_id, nickname, evolution_stage, level, pets(name, image_url, evolution_stages, rarity)')
        .in('id', petIds)
      petData = data || []
    }

    const usersMap = {}
    ;(users || []).forEach(u => { usersMap[u.id] = u })
    const petsMap = {}
    petData.forEach(p => { petsMap[p.id] = p })

    return parts.map(p => {
      const user = usersMap[p.user_id]
      const pet = petsMap[p.user_pet_id]
      return {
        ...p,
        student_name: user?.full_name || 'Unknown',
        avatar_url: user?.avatar_url,
        pet_name: pet?.nickname || pet?.pets?.name || null,
        pet_image: resolvePetImage(pet),
        pet_rarity: pet?.pets?.rarity || null,
        pet_level: pet?.level || 0,
      }
    })
  }, [])

  const createSession = useCallback(async (courseId, teacherId) => {
    // Skip if we already have an active session for this course
    if (session && session.course_id === courseId && ['setup', 'active', 'finished'].includes(session.status)) return session

    setLoading(true)
    setError(null)
    try {
      // Check for existing active session (setup or active)
      const { data: existing } = await supabase
        .from('live_battle_sessions')
        .select('*')
        .eq('course_id', courseId)
        .in('status', ['setup', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (existing) {
        // Resume existing session
        const { data: existingParts } = await supabase
          .from('live_battle_participants')
          .select('*')
          .eq('session_id', existing.id)

        // Check for new enrollments not yet in the session
        const existingUserIds = (existingParts || []).map(p => p.user_id)
        const { data: enrollments } = await supabase
          .from('course_enrollments')
          .select('student_id')
          .eq('course_id', courseId)
          .eq('is_active', true)

        const newStudentIds = (enrollments || [])
          .map(e => e.student_id)
          .filter(id => !existingUserIds.includes(id))

        let allParts = existingParts || []

        if (newStudentIds.length > 0) {
          // Fetch active pets for new students
          const { data: petData } = await supabase
            .from('user_pets')
            .select('id, user_id')
            .in('user_id', newStudentIds)
            .eq('is_active', true)
          const petsByUser = {}
          ;(petData || []).forEach(p => { petsByUser[p.user_id] = p })

          // Assign new students to the smaller team
          const teamACount = allParts.filter(p => p.team === 'a').length
          const teamBCount = allParts.filter(p => p.team === 'b').length

          const newRows = newStudentIds.map((id, idx) => {
            const nextTeam = (teamACount + idx - (teamBCount > teamACount ? 1 : 0)) % 2 === 0 && teamACount <= teamBCount ? 'a' : 'b'
            return {
              session_id: existing.id,
              user_id: id,
              user_pet_id: petsByUser[id]?.id || null,
              team: (teamACount <= teamBCount) ? (idx % 2 === 0 ? 'a' : 'b') : (idx % 2 === 0 ? 'b' : 'a'),
            }
          })

          const { data: inserted } = await supabase
            .from('live_battle_participants')
            .insert(newRows)
            .select()

          allParts = [...allParts, ...(inserted || [])]
        }

        const enriched = await enrichParticipants(allParts)

        setSession(existing)
        setParticipants(enriched)
        setEvents([])
        setActivePowerups({ a: [], b: [] })
        setLoading(false)
        return existing
      }

      // 1. Create new session
      const { data: sessionData, error: sessionErr } = await supabase
        .from('live_battle_sessions')
        .insert({ course_id: courseId, teacher_id: teacherId })
        .select()
        .single()
      if (sessionErr) throw sessionErr

      // 2. Fetch enrolled students
      const { data: enrollments, error: enrollErr } = await supabase
        .from('course_enrollments')
        .select(`
          student_id,
          student:users!student_id(id, full_name, avatar_url)
        `)
        .eq('course_id', courseId)
        .eq('is_active', true)
      if (enrollErr) throw enrollErr

      const studentIds = (enrollments || []).map(e => e.student_id)
      if (studentIds.length === 0) {
        setSession(sessionData)
        setParticipants([])
        setLoading(false)
        return sessionData
      }

      // 3. Fetch active pets for these students
      const { data: petData } = await supabase
        .from('user_pets')
        .select('id, user_id, nickname, evolution_stage, level, pets(name, image_url, evolution_stages, rarity)')
        .in('user_id', studentIds)
        .eq('is_active', true)

      const petsByUser = {}
      ;(petData || []).forEach(p => { petsByUser[p.user_id] = p })

      // 4. Auto-assign teams alternating
      const sortedStudents = [...(enrollments || [])].sort((a, b) =>
        (a.student?.full_name || '').localeCompare(b.student?.full_name || '')
      )

      const participantRows = sortedStudents.map((enrollment, idx) => ({
        session_id: sessionData.id,
        user_id: enrollment.student_id,
        user_pet_id: petsByUser[enrollment.student_id]?.id || null,
        team: idx % 2 === 0 ? 'a' : 'b',
      }))

      const { data: insertedParts, error: partErr } = await supabase
        .from('live_battle_participants')
        .insert(participantRows)
        .select()
      if (partErr) throw partErr

      // 5. Enrich participants with student/pet info
      const enriched = await enrichParticipants(insertedParts || [])

      setSession(sessionData)
      setParticipants(enriched)
      setEvents([])
      setActivePowerups({ a: [], b: [] })
      setLoading(false)
      return sessionData
    } catch (e) {
      setError(e.message)
      setLoading(false)
      return null
    }
  }, [enrichParticipants])

  const updateTeam = useCallback((participantId, newTeam) => {
    setParticipants(prev => {
      const updated = prev.map(p =>
        p.id === participantId ? { ...p, team: newTeam } : p
      )
      return updated
    })
  }, [])

  const shuffleTeams = useCallback(() => {
    setParticipants(prev => {
      const shuffled = [...prev].sort(() => Math.random() - 0.5)
      return shuffled.map((p, idx) => ({ ...p, team: idx % 2 === 0 ? 'a' : 'b' }))
    })
  }, [])

  const pullTeamsFromWar = useCallback(async (courseId) => {
    if (!courseId) return false

    // Fetch active class war for this course
    const { data: warData } = await supabase
      .from('class_wars')
      .select('id, team_a_name, team_b_name')
      .eq('course_id', courseId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!warData) return false

    // Fetch war members
    const { data: members } = await supabase
      .from('class_war_members')
      .select('user_id, team')
      .eq('war_id', warData.id)

    if (!members || members.length === 0) return false

    // Build a map: user_id -> 'a' or 'b' (war uses 'A'/'B', live battle uses 'a'/'b')
    const warTeamMap = {}
    members.forEach(m => { warTeamMap[m.user_id] = m.team.toLowerCase() })

    // Reassign participants based on war teams
    setParticipants(prev => prev.map(p => ({
      ...p,
      team: warTeamMap[p.user_id] || p.team,
    })))

    // Update team names from war
    setSession(prev => prev ? {
      ...prev,
      team_a_name: warData.team_a_name || prev.team_a_name,
      team_b_name: warData.team_b_name || prev.team_b_name,
    } : prev)

    return true
  }, [])

  const updateTeamName = useCallback((team, name) => {
    setSession(prev => prev ? {
      ...prev,
      [team === 'a' ? 'team_a_name' : 'team_b_name']: name,
    } : prev)
  }, [])

  const isFrozen = useCallback((team) => {
    return activePowerups[team]?.some(p => p.type === 'freeze' && Date.now() < p.expiresAt)
  }, [activePowerups])

  const hasShield = useCallback((team) => {
    return activePowerups[team]?.some(p => p.type === 'shield')
  }, [activePowerups])

  const removeShield = useCallback((team) => {
    setActivePowerups(prev => ({
      ...prev,
      [team]: prev[team].filter(p => p.type !== 'shield'),
    }))
  }, [])

  const hasDouble = useCallback((team) => {
    return activePowerups[team]?.some(p => p.type === 'double')
  }, [activePowerups])

  const removeDouble = useCallback((team) => {
    setActivePowerups(prev => ({
      ...prev,
      [team]: prev[team].filter(p => p.type !== 'double'),
    }))
  }, [])

  const addEventRef = useRef()
  const addEvent = useCallback((event) => {
    // Use ref to avoid duplicate events from React strict mode double-invoke
    if (addEventRef.current === event.ts) return
    addEventRef.current = event.ts
    setEvents(prev => [event, ...prev].slice(0, 50))
  }, [])

  const addTeamPoints = useCallback((team, amount) => {
    if (amount > 0 && isFrozen(team)) {
      addEvent({ type: 'blocked', text: `❄️ Team is frozen! Can't add points.`, team, ts: Date.now() })
      return
    }

    let finalAmount = amount
    let doubled = false
    if (amount > 0 && hasDouble(team)) {
      finalAmount = amount * 2
      doubled = true
      removeDouble(team)
    }

    setTeamScores(prev => ({
      ...prev,
      [team]: Math.max(0, prev[team] + finalAmount)
    }))

    addEvent({
      type: doubled ? 'powerup' : finalAmount > 0 ? 'team_add' : 'team_remove',
      text: doubled
        ? `⚡ Double! Team gets +${finalAmount}`
        : `${finalAmount > 0 ? '+' : ''}${finalAmount} to team`,
      team,
      ts: Date.now(),
    })
  }, [isFrozen, hasDouble, removeDouble, addEvent])

  const activatePowerup = useCallback((type, targetTeam) => {
    const opponentTeam = targetTeam === 'a' ? 'b' : 'a'

    switch (type) {
      case 'double':
        setActivePowerups(prev => ({
          ...prev,
          [targetTeam]: [...prev[targetTeam], { type: 'double', ts: Date.now() }],
        }))
        addEvent({ type: 'powerup', text: `Double activated!`, team: targetTeam, ts: Date.now() })
        break

      case 'shield':
        setActivePowerups(prev => ({
          ...prev,
          [targetTeam]: [...prev[targetTeam], { type: 'shield', ts: Date.now() }],
        }))
        addEvent({ type: 'powerup', text: `Shield activated!`, team: targetTeam, ts: Date.now() })
        break

      case 'steal': {
        const stealAmount = 5
        if (hasShield(opponentTeam)) {
          removeShield(opponentTeam)
          addEvent({ type: 'powerup', text: `Shield blocked the steal!`, team: opponentTeam, ts: Date.now() })
          return
        }
        setTeamScores(prev => ({
          ...prev,
          [opponentTeam]: Math.max(0, prev[opponentTeam] - stealAmount),
          [targetTeam]: prev[targetTeam] + Math.min(stealAmount, prev[opponentTeam]),
        }))
        addEvent({ type: 'powerup', text: `Steal ${stealAmount} points!`, team: targetTeam, ts: Date.now() })
        break
      }

      case 'swap': {
        setTeamScores(prev => ({ a: prev.b, b: prev.a }))
        addEvent({ type: 'powerup', text: `Swap scores!`, team: targetTeam, ts: Date.now() })
        break
      }

      case 'mystery': {
        const effects = [
          { text: '+5 points!', apply: () => addTeamPoints(targetTeam, 5) },
          { text: '-3 points!', apply: () => addTeamPoints(targetTeam, -3) },
          { text: 'Steal 2 points!', apply: () => activatePowerup('steal', targetTeam) },
          { text: 'Nothing happened!', apply: () => {} },
          { text: '+10 points!', apply: () => addTeamPoints(targetTeam, 10) },
          { text: 'Shield granted!', apply: () => activatePowerup('shield', targetTeam) },
        ]
        const effect = effects[Math.floor(Math.random() * effects.length)]
        addEvent({ type: 'powerup', text: `Mystery Box: ${effect.text}`, team: targetTeam, ts: Date.now() })
        setTimeout(() => effect.apply(), 500)
        break
      }

      case 'random': {
        const powerupKeys = ['double', 'shield', 'steal', 'swap', 'mystery']
        const randomKey = powerupKeys[Math.floor(Math.random() * powerupKeys.length)]
        addEvent({ type: 'powerup', text: `Random picked: ${POWERUPS[randomKey].name}!`, team: targetTeam, ts: Date.now() })
        setTimeout(() => activatePowerup(randomKey, targetTeam), 500)
        break
      }
      default:
        break
    }

  }, [session, hasShield, removeShield, addTeamPoints, addEvent])

  const startGame = useCallback(async () => {
    if (!session) return

    // Persist team assignments to DB
    for (const p of participants) {
      await supabase
        .from('live_battle_participants')
        .update({ team: p.team })
        .eq('id', p.id)
    }

    const { error: err } = await supabase
      .from('live_battle_sessions')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', session.id)

    if (!err) {
      setSession(prev => prev ? { ...prev, status: 'active', started_at: new Date().toISOString() } : prev)
    }
  }, [session, participants])

  const endGame = useCallback(async () => {
    if (!session) return

    const teamA = teamScores.a
    const teamB = teamScores.b
    const winnerTeam = teamA > teamB ? 'a' : teamB > teamA ? 'b' : 'draw'
    const xpWinner = session.xp_winner || 30
    const xpLoser = session.xp_loser || 10
    const xpDraw = Math.floor((xpWinner + xpLoser) / 2)

    // Award XP and update participants
    const updatedParts = participants.map(p => {
      let xp = 0
      if (winnerTeam === 'draw') xp = xpDraw
      else if (p.team === winnerTeam) xp = xpWinner
      else xp = xpLoser
      return { ...p, xp_awarded: xp }
    })

    // Award XP to each participant
    for (const p of updatedParts) {
      if (p.xp_awarded > 0) {
        await supabase.rpc('increment_user_currency', { p_user_id: p.user_id, p_xp: p.xp_awarded, p_gems: 0 })
      }

      // Update participant record
      await supabase
        .from('live_battle_participants')
        .update({ xp_awarded: p.xp_awarded })
        .eq('id', p.id)
    }

    // Update session
    await supabase
      .from('live_battle_sessions')
      .update({
        status: 'finished',
        team_a_score: teamA,
        team_b_score: teamB,
        winner_team: winnerTeam,
        finished_at: new Date().toISOString(),
      })
      .eq('id', session.id)

    setSession(prev => prev ? {
      ...prev,
      status: 'finished',
      team_a_score: teamA,
      team_b_score: teamB,
      winner_team: winnerTeam,
    } : prev)
    setParticipants(updatedParts)

    // Clear freeze timers
    Object.values(freezeTimerRef.current).forEach(t => clearTimeout(t))
    freezeTimerRef.current = {}
  }, [session, participants, teamScores])

  const updateXpRewards = useCallback((xpWinner, xpLoser) => {
    setSession(prev => prev ? { ...prev, xp_winner: xpWinner, xp_loser: xpLoser } : prev)
  }, [])

  const resetScores = useCallback(() => {
    setTeamScores({ a: 0, b: 0 })
  }, [])

  const getTeamScore = useCallback((team) => {
    return teamScores[team]
  }, [teamScores])

  return {
    session,
    participants,
    events,
    loading,
    error,
    activePowerups,
    createSession,
    updateTeam,
    shuffleTeams,
    updateTeamName,
    addTeamPoints,
    activatePowerup,
    startGame,
    endGame,
    updateXpRewards,
    getTeamScore,
    resetScores,
    isFrozen,
    hasShield,
    hasDouble,
    pullTeamsFromWar,
  }
}
