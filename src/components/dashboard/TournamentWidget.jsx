import { useState, useEffect } from 'react'
import { Trophy, Gamepad2, Gift, Users } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useTournament } from '../../hooks/useTournament'
import { supabase } from '../../supabase/client'
import { assetUrl } from '../../hooks/useBranding'
import TournamentBracket from '../admin/TournamentBracket'

const XP_IMG = assetUrl('/image/study/xp.png')
const GEM_IMG = assetUrl('/image/study/gem.png')
const CHEST_FALLBACK_IMG = assetUrl('/image/chest/legendary-chest.png')

const CLIP_CARD = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)'

const CornerBrackets = () => (
  <>
    <div className="absolute top-0 left-[10px] w-5 h-[1px] bg-gradient-to-r from-purple-300/40 to-transparent" />
    <div className="absolute top-0 left-[10px] w-[1px] h-5 bg-gradient-to-b from-purple-300/40 to-transparent" />
    <div className="absolute bottom-0 right-[10px] w-5 h-[1px] bg-gradient-to-l from-purple-300/40 to-transparent" />
    <div className="absolute bottom-0 right-[10px] w-[1px] h-5 bg-gradient-to-t from-purple-300/40 to-transparent" />
  </>
)

const GAME_TYPE_LABELS = {
  wordtype: 'Word Type',
  scramble: 'Word Scramble',
  matchgame: 'Match Game',
  whackmole: 'Whack-a-Mole',
  astroblast: 'Astro Blast',
  flappy: 'Flappy',
  sayitright: 'Say It Right',
  quizrush: 'Quiz Rush',
}

// ─── Reward line helper ──────────────────────────────────────
const RewardBadges = ({ r, itemsMap, chestsMap }) => {
  const parts = []
  if (r.xp) {
    parts.push(
      <strong key="xp" className="text-yellow-600 inline-flex items-center gap-1">
        +{r.xp}
        <img src={XP_IMG} alt="XP" className="w-4 h-4 object-contain" />
      </strong>
    )
  }
  if (r.gems) {
    parts.push(
      <strong key="gems" className="text-sky-600 inline-flex items-center gap-1">
        +{r.gems}
        <img src={GEM_IMG} alt="Gem" className="w-4 h-4 object-contain" />
      </strong>
    )
  }
  if (r.item_id && itemsMap[r.item_id]) {
    const item = itemsMap[r.item_id]
    parts.push(
      <strong key="item" className="text-emerald-600 inline-flex items-center gap-1">
        {item.image_url && <img src={item.image_url} alt={item.name} className="w-4 h-4 object-contain" />}
        {r.item_quantity > 1 && `${r.item_quantity}× `}{item.name}
      </strong>
    )
  }
  if (r.chest_id && chestsMap[r.chest_id]) {
    const chest = chestsMap[r.chest_id]
    parts.push(
      <strong key="chest" className="text-purple-600 inline-flex items-center gap-1">
        <img src={chest.image_url || CHEST_FALLBACK_IMG} alt={chest.name} className="w-4 h-4 object-contain" />
        {chest.name}
      </strong>
    )
  }
  return (
    <span className="inline-flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs text-gray-600">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && <span className="text-gray-300 mr-1.5">+</span>}
          {p}
        </span>
      ))}
    </span>
  )
}

// ─── Bounty / Rewards display (always expanded) ─────────────
const RANK_CONFIG = {
  winner: { label: '🏆 Vô địch', accent: 'from-yellow-400/90 to-amber-500/90', tint: 'bg-yellow-50/60' },
  runner: { label: '🥈 Á quân', accent: 'from-slate-300 to-slate-400', tint: 'bg-slate-50/60' },
  semi:   { label: '🥉 Bán kết', accent: 'from-orange-300 to-amber-400', tint: 'bg-orange-50/40' },
  quarter:{ label: 'Tứ kết',    accent: 'from-purple-300 to-indigo-300', tint: 'bg-white' },
  other:  { label: '',          accent: 'from-gray-200 to-gray-300',     tint: 'bg-white' },
}

const getRankConfig = (round, totalRounds) => {
  if (round === 'winner') return RANK_CONFIG.winner
  const fromFinal = totalRounds - round
  if (fromFinal === 0) return { ...RANK_CONFIG.runner, label: '🥈 Á quân' }
  if (fromFinal === 1) return { ...RANK_CONFIG.semi, label: '🥉 Bán kết' }
  if (fromFinal === 2) return { ...RANK_CONFIG.quarter, label: 'Tứ kết' }
  return { ...RANK_CONFIG.other, label: `Vòng ${round}` }
}

const BountyDisplay = ({ roundRewards, totalRounds, itemsMap = {}, chestsMap = {} }) => {
  if (!roundRewards || Object.keys(roundRewards).length === 0) return null

  const winnerR = roundRewards.winner || {}
  const hasWinnerReward = winnerR.xp || winnerR.gems || winnerR.item_id || winnerR.chest_id

  const rows = []
  if (hasWinnerReward) {
    rows.push({ key: 'winner', config: RANK_CONFIG.winner, rewards: winnerR })
  }
  for (let i = 0; i < totalRounds; i++) {
    const round = totalRounds - i
    const r = roundRewards[String(round)]
    if (!r || (!r.xp && !r.gems && !r.item_id && !r.chest_id)) continue
    rows.push({ key: `r${round}`, config: getRankConfig(round, totalRounds), rewards: r })
  }

  if (rows.length === 0) return null

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <Gift className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">Phần thưởng</span>
        <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
      </div>
      <div className="space-y-1.5">
        {rows.map(row => (
          <div
            key={row.key}
            className={`relative flex items-center gap-2.5 pl-3 pr-2.5 py-1.5 rounded-md ${row.config.tint} overflow-hidden`}
          >
            <span className={`absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b ${row.config.accent}`} />
            <span className="text-[11px] font-semibold text-gray-700 whitespace-nowrap shrink-0 w-20">
              {row.config.label}
            </span>
            <div className="flex-1 min-w-0 flex justify-end">
              <RewardBadges r={row.rewards} itemsMap={itemsMap} chestsMap={chestsMap} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Registration Card (open tournament) ─────────────────────
const RegistrationCard = ({ tournament, onRegister, onCreateTeam, onJoinTeam, isRegistered, registering, itemsMap, chestsMap, regTeams }) => {
  const participantCount = tournament.participant_count?.[0]?.count || 0
  const isTeamMode = tournament.mode === 'team'
  const [newTeamName, setNewTeamName] = useState('')
  const [showCreateTeam, setShowCreateTeam] = useState(false)

  // For team mode: find the user's team
  const myTeam = isTeamMode ? (regTeams || []).find(t => t.tournamentId === tournament.id && t.isMine) : null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
            <Trophy className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-800">{tournament.name}</div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-purple-600 font-medium">
                <Gamepad2 className="w-3 h-3 inline mr-0.5" />
                {GAME_TYPE_LABELS[tournament.game_type] || tournament.game_type}
              </span>
              {isTeamMode ? (
                <span className="text-[10px] text-indigo-600 font-bold">
                  Team {tournament.team_size}v{tournament.team_size}
                </span>
              ) : (
                <span className="text-[10px] text-gray-500">
                  <Users className="w-3 h-3 inline mr-0.5" />
                  {participantCount}/{tournament.bracket_size}
                </span>
              )}
              {tournament.best_of > 1 && (
                <span className="text-[10px] text-orange-600 font-bold">
                  Bo{tournament.best_of}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          {tournament.entry_fee > 0 && (
            <div className="text-[10px] text-amber-600 font-bold">{tournament.entry_fee} XP</div>
          )}
          <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold uppercase">
            Đăng ký
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-purple-200 rounded-full h-1.5">
        <div className="bg-purple-500 h-1.5 rounded-full transition-all" style={{ width: `${(participantCount / tournament.bracket_size) * 100}%` }} />
      </div>

      {/* Info / Description */}
      {tournament.info && (
        <div className="text-[11px] text-gray-600 whitespace-pre-wrap bg-purple-50/70 border border-purple-100 rounded-md px-2.5 py-1.5">
          {tournament.info}
        </div>
      )}

      {/* Bounty */}
      <BountyDisplay roundRewards={tournament.round_rewards} totalRounds={Math.log2(tournament.bracket_size)} itemsMap={itemsMap} chestsMap={chestsMap} />

      {/* Solo registration */}
      {!isTeamMode && (
        isRegistered ? (
          <div className="w-full text-xs font-bold py-2 rounded-lg bg-green-100 text-green-700 text-center">
            Đã đăng ký ✓
          </div>
        ) : (
          <button
            onClick={() => onRegister(tournament.id)}
            disabled={registering || participantCount >= tournament.bracket_size}
            className="w-full text-xs font-bold py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {registering ? 'Đang xử lý...' : participantCount >= tournament.bracket_size ? 'Đã đầy' : 'Đăng ký tham gia'}
          </button>
        )
      )}

      {/* Team registration */}
      {isTeamMode && (
        myTeam ? (
          <div className="w-full text-xs font-bold py-2 rounded-lg bg-green-100 text-green-700 text-center">
            Đội: {myTeam.teamName} ✓
          </div>
        ) : (
          <div className="space-y-2">
            {/* Existing teams to join */}
            {(regTeams || []).filter(t => t.tournamentId === tournament.id && t.memberCount < tournament.team_size).length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-gray-500">Tham gia đội:</span>
                {regTeams
                  .filter(t => t.tournamentId === tournament.id && t.memberCount < tournament.team_size)
                  .map(t => (
                    <button
                      key={t.teamId}
                      onClick={() => onJoinTeam(t.teamId)}
                      disabled={registering}
                      className="w-full flex items-center justify-between px-3 py-1.5 border rounded-lg hover:bg-indigo-50 transition-colors text-xs disabled:opacity-50"
                    >
                      <span className="font-medium text-gray-700">{t.teamName}</span>
                      <span className="text-[10px] text-gray-400">{t.memberCount}/{tournament.team_size}</span>
                    </button>
                  ))}
              </div>
            )}

            {/* Create new team */}
            {showCreateTeam ? (
              <div className="flex gap-2">
                <input
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder="Tên đội..."
                  className="flex-1 text-xs border rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-indigo-300 outline-none"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newTeamName.trim()) {
                      onCreateTeam(tournament.id, newTeamName.trim())
                      setNewTeamName('')
                      setShowCreateTeam(false)
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (newTeamName.trim()) {
                      onCreateTeam(tournament.id, newTeamName.trim())
                      setNewTeamName('')
                      setShowCreateTeam(false)
                    }
                  }}
                  disabled={registering || !newTeamName.trim()}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  Tạo
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCreateTeam(true)}
                disabled={registering}
                className="w-full text-xs font-bold py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                + Tạo đội mới
              </button>
            )}
          </div>
        )
      )}
    </div>
  )
}

// ─── Inline Bracket (active tournament) ──────────────────────
const InlineBracket = ({ tournamentId, itemsMap, chestsMap, currentUserId }) => {
  const { tournament, participants, matches, teams, fetchTournament, loading } = useTournament()

  useEffect(() => {
    if (tournamentId) fetchTournament(tournamentId)
  }, [tournamentId, fetchTournament])

  if (loading && !tournament) {
    return <div className="text-center text-gray-400 py-6 text-sm">Đang tải...</div>
  }

  if (!tournament) return null

  return (
    <div className="overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Trophy className="w-4 h-4 text-purple-600 shrink-0" />
          <span className="text-sm font-bold text-gray-800">{tournament.name}</span>
          <span className="text-gray-300">·</span>
          <span className="text-[11px] text-purple-600 font-medium inline-flex items-center gap-0.5">
            <Gamepad2 className="w-3 h-3" />
            {GAME_TYPE_LABELS[tournament.game_type] || tournament.game_type}
          </span>
          <span className="text-gray-300">·</span>
          <span className="text-[11px] text-gray-500">
            Vòng {tournament.current_round}/{tournament.total_rounds}
          </span>
          {tournament.mode === 'team' && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
                Team {tournament.team_size}v{tournament.team_size}
              </span>
            </>
          )}
          {tournament.best_of > 1 && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                Bo{tournament.best_of}
              </span>
            </>
          )}
        </div>
        {tournament.info && (
          <div className="mt-2 text-[11px] text-gray-600 whitespace-pre-wrap bg-purple-50/70 border border-purple-100 rounded-md px-2.5 py-1.5">
            {tournament.info}
          </div>
        )}
        <BountyDisplay roundRewards={tournament.round_rewards} totalRounds={tournament.total_rounds} itemsMap={itemsMap} chestsMap={chestsMap} />
      </div>

      {/* Bracket */}
      <div className="overflow-x-auto">
        <TournamentBracket
          matches={matches}
          participants={participants}
          teams={teams}
          totalRounds={tournament.total_rounds}
          currentRound={tournament.current_round}
          bestOf={tournament.best_of}
          compact
          currentUserId={currentUserId}
        />
      </div>
    </div>
  )
}

// ─── Main Widget ─────────────────────────────────────────────
const TournamentWidget = () => {
  const { user, profile } = useAuth()
  const { fetchMyTournaments, fetchOpenTournaments, registerForTournament, createTeam, joinTeam } = useTournament()
  const [activeTournaments, setActiveTournaments] = useState([])
  const [openTournaments, setOpenTournaments] = useState([])
  const [myRegistrations, setMyRegistrations] = useState(new Set())
  const [regTeams, setRegTeams] = useState([]) // [{ tournamentId, teamId, teamName, memberCount }]
  const [loaded, setLoaded] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [regError, setRegError] = useState('')
  const [itemsMap, setItemsMap] = useState({})
  const [chestsMap, setChestsMap] = useState({})

  const loadData = async () => {
    if (!user?.id) return
    const [active, open, itemsRes, chestsRes, myEntriesRes] = await Promise.all([
      fetchMyTournaments(),
      fetchOpenTournaments(profile?.current_level),
      supabase.from('collectible_items').select('id, name, image_url').eq('is_active', true),
      supabase.from('chests').select('id, name, image_url').eq('is_active', true),
      supabase.from('tournament_participants').select('tournament_id').eq('user_id', user.id),
    ])
    setActiveTournaments(active || [])
    setOpenTournaments(open || [])
    setMyRegistrations(new Set((myEntriesRes.data || []).map(e => e.tournament_id)))
    const im = {}; for (const i of (itemsRes.data || [])) im[i.id] = { name: i.name, image_url: i.image_url }
    const cm = {}; for (const c of (chestsRes.data || [])) cm[c.id] = { name: c.name, image_url: c.image_url }
    setItemsMap(im)
    setChestsMap(cm)

    // Fetch team info for team-mode registration tournaments
    const teamModeOpen = (open || []).filter(t => t.mode === 'team')
    if (teamModeOpen.length > 0) {
      const teamData = []
      for (const t of teamModeOpen) {
        const { data: tTeams } = await supabase
          .from('tournament_teams')
          .select('id, name, tournament_id, members:tournament_team_members(user_id)')
          .eq('tournament_id', t.id)
          .order('seed')
        for (const team of (tTeams || [])) {
          const members = team.members || []
          teamData.push({
            tournamentId: team.tournament_id,
            teamId: team.id,
            teamName: team.name,
            memberCount: members.length,
            isMine: members.some(m => m.user_id === user.id),
          })
        }
      }
      setRegTeams(teamData)
    } else {
      setRegTeams([])
    }

    setLoaded(true)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.current_level])

  const handleRegister = async (tournamentId) => {
    setRegError('')
    setRegistering(true)
    try {
      await registerForTournament(tournamentId)
      await loadData()
    } catch (err) {
      setRegError(err.message)
      setTimeout(() => setRegError(''), 4000)
    } finally {
      setRegistering(false)
    }
  }

  const handleCreateTeam = async (tournamentId, teamName) => {
    setRegError('')
    setRegistering(true)
    try {
      await createTeam(tournamentId, teamName)
      await loadData()
    } catch (err) {
      setRegError(err.message)
      setTimeout(() => setRegError(''), 4000)
    } finally {
      setRegistering(false)
    }
  }

  const handleJoinTeam = async (teamId) => {
    setRegError('')
    setRegistering(true)
    try {
      await joinTeam(teamId)
      await loadData()
    } catch (err) {
      setRegError(err.message)
      setTimeout(() => setRegError(''), 4000)
    } finally {
      setRegistering(false)
    }
  }


  if (!loaded) return null

  const hasContent = activeTournaments.length > 0 || openTournaments.length > 0

  if (!hasContent) {
    return (
      <div className="relative bg-white border border-gray-200 p-6 h-full overflow-hidden shadow-sm"
        style={{ clipPath: CLIP_CARD }}
      >
        <CornerBrackets />
        <h3 className="text-lg font-semibold text-gray-900 mb-1 uppercase tracking-wide">Giải đấu</h3>
        <div className="h-[2px] w-16 bg-gradient-to-r from-purple-400 to-transparent mb-4" />
        <div className="text-center py-8">
          <Trophy className="w-12 h-12 mx-auto mb-2 text-purple-300" />
          <div className="text-sm font-bold text-purple-700">Giải đấu mới sắp bắt đầu!</div>
          <div className="text-xs text-gray-500 mt-1">Hãy luyện tập thật nhiều để sẵn sàng nhé</div>
        </div>
      </div>
    )
  }

  // If there are open tournaments, only show active ones, not completed ones.
  const tournamentsToShow = openTournaments.length > 0
    ? activeTournaments.filter(t => t.status === 'active')
    : activeTournaments;

  return (
    <div className="relative bg-white border border-gray-200 p-6 h-full overflow-hidden shadow-sm"
      style={{ clipPath: CLIP_CARD }}
    >
      <CornerBrackets />
      <h3 className="text-lg font-semibold text-gray-900 mb-1 uppercase tracking-wide">Giải đấu</h3>
      <div className="h-[2px] w-16 bg-gradient-to-r from-purple-400 to-transparent mb-4" />

      {regError && (
        <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{regError}</div>
      )}

      <div className="space-y-4">
        {/* Open for registration */}
        {openTournaments.length > 0 && (
          <>
            {openTournaments.map(t => (
              <RegistrationCard
                key={t.id}
                tournament={t}
                isRegistered={myRegistrations.has(t.id)}
                onRegister={handleRegister}
                onCreateTeam={handleCreateTeam}
                onJoinTeam={handleJoinTeam}
                registering={registering}
                itemsMap={itemsMap}
                chestsMap={chestsMap}
                regTeams={regTeams}
              />
            ))}
          </>
        )}

        {/* Active tournaments */}
        {tournamentsToShow.map(t => (
          <InlineBracket key={t.id} tournamentId={t.id} itemsMap={itemsMap} chestsMap={chestsMap} currentUserId={user?.id} />
        ))}
      </div>
    </div>
  )
}

export default TournamentWidget
