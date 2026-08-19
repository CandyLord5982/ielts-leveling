import { useRef, useState, useEffect } from 'react'
import { Trophy, User, Minus, Users } from 'lucide-react'

// ─── Countdown to 10 PM ─────────────────────────────────────
const useCountdownTo10PM = () => {
  const getRemaining = () => {
    const now = new Date()
    const target = new Date(now)
    target.setHours(22, 0, 0, 0)
    if (now >= target) target.setDate(target.getDate() + 1)
    return Math.max(0, Math.floor((target - now) / 1000))
  }

  const [seconds, setSeconds] = useState(getRemaining)

  useEffect(() => {
    const id = setInterval(() => setSeconds(getRemaining()), 1000)
    return () => clearInterval(id)
  }, [])

  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function getRoundLabel(round, totalRounds) {
  const fromFinal = totalRounds - round
  if (fromFinal === 0) return 'Chung kết'
  if (fromFinal === 1) return 'Bán kết'
  if (fromFinal === 2) return 'Tứ kết'
  return `Vòng ${round}`
}

const shortName = (fullName) => fullName?.split(' ').pop() || fullName

const PlayerRow = ({ player, score, isWinner, participants, currentUserId }) => {
  const p = participants?.find(pp => pp.user_id === player)
  const name = shortName(p?.user?.full_name) || 'TBD'
  const avatar = p?.user?.avatar_url
  const seed = p?.seed
  const isCurrentUser = currentUserId && player === currentUserId

  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 ${isWinner ? 'bg-green-50' : isCurrentUser ? 'bg-purple-50' : ''}`}>
      {avatar ? (
        <img src={avatar} alt="" className={`w-6 h-6 rounded-full object-cover flex-shrink-0 ${isCurrentUser ? 'ring-2 ring-purple-400' : ''}`} />
      ) : (
        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isCurrentUser ? 'bg-purple-200 ring-2 ring-purple-400' : 'bg-gray-200'}`}>
          {player ? <User className={`w-3 h-3 ${isCurrentUser ? 'text-purple-500' : 'text-gray-400'}`} /> : <Minus className="w-3 h-3 text-gray-300" />}
        </div>
      )}
      <span className={`text-xs truncate flex-1 ${isWinner ? 'font-bold text-green-700' : isCurrentUser ? 'font-bold text-purple-700' : player ? 'text-gray-700' : 'text-gray-400 italic'}`}>
        {player ? name : 'TBD'}
        {seed && <span className="text-[10px] text-gray-400 ml-1">#{seed}</span>}
      </span>
      {score != null && (
        <span className={`text-xs font-mono font-bold ${isWinner ? 'text-green-600' : 'text-gray-500'}`}>
          {score}
        </span>
      )}
    </div>
  )
}

const TeamRow = ({ teamId, score, isWinner, teams, currentUserId }) => {
  const team = teams?.find(t => t.id === teamId)
  const name = team?.name || 'TBD'
  const members = team?.members || []
  const isCurrentUserTeam = currentUserId && members.some(m => m.user_id === currentUserId)

  return (
    <div className={`px-2 py-1.5 ${isWinner ? 'bg-green-50' : isCurrentUserTeam ? 'bg-purple-50' : ''}`}>
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
          isCurrentUserTeam ? 'bg-purple-200 ring-2 ring-purple-400'
          : isWinner ? 'bg-green-200'
          : teamId ? 'bg-indigo-100' : 'bg-gray-200'
        }`}>
          {teamId ? <Users className={`w-3 h-3 ${isCurrentUserTeam ? 'text-purple-500' : isWinner ? 'text-green-600' : 'text-indigo-500'}`} /> : <Minus className="w-3 h-3 text-gray-300" />}
        </div>
        <span className={`text-xs truncate flex-1 ${
          isWinner ? 'font-bold text-green-700'
          : isCurrentUserTeam ? 'font-bold text-purple-700'
          : teamId ? 'text-gray-700' : 'text-gray-400 italic'
        }`}>
          {teamId ? name : 'TBD'}
        </span>
        {score != null && (
          <span className={`text-xs font-mono font-bold ${isWinner ? 'text-green-600' : 'text-gray-500'}`}>
            {score}
          </span>
        )}
      </div>
      {teamId && members.length > 0 && (
        <div className="text-[9px] text-gray-400 mt-0.5 pl-8 truncate">
          {members.map(m => shortName(m.user?.full_name)).filter(Boolean).join(', ')}
        </div>
      )}
    </div>
  )
}

const RoundScoresBar = ({ roundScores, bestOf }) => {
  if (!roundScores?.length) return null
  const needed = bestOf > 1 ? Math.floor(bestOf / 2) + 1 : null
  let visible = roundScores
  if (needed) {
    let p1 = 0, p2 = 0
    for (let i = 0; i < roundScores.length; i++) {
      if (roundScores[i].winner === 1) p1++
      else if (roundScores[i].winner === 2) p2++
      if (p1 >= needed || p2 >= needed) {
        visible = roundScores.slice(0, i + 1)
        break
      }
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 px-1 py-0.5 bg-gray-100 border-t border-gray-200">
      {visible.map((rs, i) => (
        <span key={i} className={`text-[9px] font-mono px-1 rounded ${rs.winner === 1 ? 'text-emerald-700 bg-emerald-100' : rs.winner === 2 ? 'text-sky-700 bg-sky-100' : 'text-gray-500 bg-gray-200'}`}>
          {rs.p1}-{rs.p2}
        </span>
      ))}
    </div>
  )
}

const MatchCard = ({ match, participants, teams, onRecordScore, compact, currentUserId, bestOf }) => {
  const isTeamMode = !!(match.team1_id || match.team2_id)
  const hasRoundScores = match.round_scores?.length > 0
  const [expanded, setExpanded] = useState(false)
  const statusColors = {
    pending: 'border-gray-200 bg-gray-50',
    ready: 'border-amber-300 bg-amber-50',
    completed: 'border-green-300 bg-white',
  }

  const cap = bestOf > 1 ? Math.floor(bestOf / 2) + 1 : null
  const capScore = (s) => (s != null && cap != null ? Math.min(s, cap) : s)
  const showBreakdown = hasRoundScores && expanded

  return (
    <div
      onClick={hasRoundScores ? () => setExpanded(e => !e) : undefined}
      className={`border-2 rounded-lg overflow-hidden ${statusColors[match.status] || statusColors.pending} ${compact ? 'w-36' : isTeamMode ? 'w-48' : 'w-44'} ${hasRoundScores ? 'cursor-pointer' : ''}`}
    >
      {isTeamMode ? (
        <>
          <TeamRow
            teamId={match.team1_id}
            score={capScore(match.player1_score)}
            isWinner={(match.team_winner_id || match.winner_id) && (match.team_winner_id === match.team1_id)}
            teams={teams}
            currentUserId={currentUserId}
          />
          {showBreakdown && <RoundScoresBar roundScores={match.round_scores} bestOf={bestOf} />}
          <div className={showBreakdown ? '' : 'border-t border-gray-200'} />
          <TeamRow
            teamId={match.team2_id}
            score={capScore(match.player2_score)}
            isWinner={(match.team_winner_id || match.winner_id) && (match.team_winner_id === match.team2_id)}
            teams={teams}
            currentUserId={currentUserId}
          />
        </>
      ) : (
        <>
          <PlayerRow
            player={match.player1_id}
            score={capScore(match.player1_score)}
            isWinner={match.winner_id && match.winner_id === match.player1_id}
            participants={participants}
            currentUserId={currentUserId}
          />
          {showBreakdown && <RoundScoresBar roundScores={match.round_scores} bestOf={bestOf} />}
          <div className={showBreakdown ? '' : 'border-t border-gray-200'} />
          <PlayerRow
            player={match.player2_id}
            score={capScore(match.player2_score)}
            isWinner={match.winner_id && match.winner_id === match.player2_id}
            participants={participants}
            currentUserId={currentUserId}
          />
        </>
      )}
      {onRecordScore && (match.status === 'ready' || match.status === 'completed') && (
        <button
          onClick={(e) => { e.stopPropagation(); onRecordScore(match) }}
          className="w-full text-[10px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 py-1 transition-colors"
        >
          {match.status === 'completed' ? 'Sửa điểm' : 'Nhập điểm'}
        </button>
      )}
    </div>
  )
}

const TournamentBracket = ({ matches, participants, teams = [], totalRounds, currentRound, onRecordScore, compact, currentUserId, bestOf }) => {
  const countdown = useCountdownTo10PM()
  const roundRefs = useRef({})
  const scrollToRound = (roundNum) => {
    roundRefs.current[roundNum]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  const isTeamMode = matches.some(m => m.team1_id || m.team2_id)

  const finalMatch = matches.find(m => m.round === totalRounds)
  const isTournamentEnded = finalMatch && (finalMatch.winner_id || finalMatch.team_winner_id)

  if (isTournamentEnded && !isTeamMode) {
    const winnerId = finalMatch.winner_id
    const runnerUpId = winnerId === finalMatch.player1_id ? finalMatch.player2_id : finalMatch.player1_id
    const semiMatches = matches.filter(m => m.round === totalRounds - 1)
    const semiLoserIds = semiMatches.map(m => m.winner_id === m.player1_id ? m.player2_id : m.player1_id).filter(Boolean)

    const winner = participants.find(p => p.user_id === winnerId)
    const runnerUp = participants.find(p => p.user_id === runnerUpId)
    const semiLosers = semiLoserIds.map(id => participants.find(p => p.user_id === id)).filter(Boolean)

    return (
      <div className={`w-full flex flex-col md:flex-row items-center md:items-end justify-center gap-6 md:gap-8 ${compact ? 'p-4' : 'p-8'}`}>
        
        {/* Runner Up - Left on PC, middle on mobile */}
        {runnerUp && (
          <div className="order-2 md:order-1 flex flex-col items-center">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 md:mb-4">Á quân</div>
            <div className={`bg-gradient-to-br from-slate-100 to-gray-200 border border-slate-300 rounded-xl ${compact ? 'p-3' : 'p-4'} text-center shadow-sm w-28 sm:w-32`}>
              <div className="text-2xl mb-2">🥈</div>
              {runnerUp.user?.avatar_url ? (
                <img src={runnerUp.user.avatar_url} alt="" className="w-10 h-10 sm:w-12 sm:h-12 rounded-full mx-auto mb-2 border-2 border-slate-300 object-cover" />
              ) : (
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full mx-auto mb-2 bg-slate-200 flex items-center justify-center">
                  <User className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400" />
                </div>
              )}
              <div className="text-xs sm:text-sm font-bold text-slate-700 truncate w-full">
                {shortName(runnerUp.user?.full_name) || 'Runner-up'}
              </div>
            </div>
          </div>
        )}

        {/* Winner - Center on PC, top on mobile */}
        <div className="order-1 md:order-2 flex flex-col items-center justify-center">
          <div className="text-sm font-bold text-yellow-600 uppercase tracking-wider mb-4">
            Nhà vô địch
          </div>
          <div className={`bg-gradient-to-br from-yellow-100 to-amber-100 border-2 border-yellow-400 rounded-2xl ${compact ? 'p-4' : 'p-6'} text-center shadow-md min-w-[160px]`}>
            <Trophy className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            {winner?.user?.avatar_url ? (
              <img src={winner.user.avatar_url} alt="" className="w-16 h-16 rounded-full mx-auto mb-3 border-2 border-yellow-400 object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full mx-auto mb-3 bg-yellow-200 border-2 border-yellow-400 flex items-center justify-center">
                <User className="w-8 h-8 text-yellow-500" />
              </div>
            )}
            <div className="text-lg font-bold text-yellow-800">
              {shortName(winner?.user?.full_name) || 'Winner'}
            </div>
          </div>
        </div>

        {/* Semi-finalists - Right on PC, bottom on mobile */}
        {semiLosers.length > 0 && (
          <div className="order-3 md:order-3 flex justify-center gap-4 sm:gap-6">
            {semiLosers.map((p, idx) => (
              <div key={p.user_id || idx} className="flex flex-col items-center">
                <div className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-2 md:mb-4">Hạng 3-4</div>
                <div className={`bg-gradient-to-br from-orange-50 to-amber-100 border border-orange-200 rounded-xl ${compact ? 'p-3' : 'p-4'} text-center shadow-sm w-28 sm:w-32`}>
                  <div className="text-2xl mb-2">🥉</div>
                  {p.user?.avatar_url ? (
                    <img src={p.user.avatar_url} alt="" className="w-10 h-10 sm:w-12 sm:h-12 rounded-full mx-auto mb-2 border-2 border-orange-200 object-cover" />
                  ) : (
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full mx-auto mb-2 bg-orange-200 flex items-center justify-center">
                      <User className="w-5 h-5 sm:w-6 sm:h-6 text-orange-400" />
                    </div>
                  )}
                  <div className="text-xs sm:text-sm font-bold text-orange-800 truncate w-full">
                    {shortName(p.user?.full_name) || 'Semi-finalist'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    )
  }

  // Group matches by round
  const rounds = []
  for (let r = 1; r <= totalRounds; r++) {
    rounds.push(
      matches
        .filter(m => m.round === r)
        .sort((a, b) => a.match_position - b.match_position)
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      {/* Desktop: horizontal bracket */}
      <div className="hidden md:flex gap-4 items-stretch min-w-max p-4">
        {rounds.map((roundMatches, rIdx) => {
          const roundNum = rIdx + 1
          const matchSpacing = Math.pow(2, rIdx)
          return (
            <div key={roundNum} ref={el => roundRefs.current[roundNum] = el} className="flex flex-col items-center">
              <button
                onClick={() => scrollToRound(roundNum)}
                className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 hover:text-purple-600 transition-colors cursor-pointer"
              >
                {getRoundLabel(roundNum, totalRounds)}
                {roundNum === currentRound && (
                  <span className="ml-1.5 text-[10px] font-mono font-semibold text-red-500 normal-case">
                    ⏳ {countdown}
                  </span>
                )}
              </button>
              <div className="flex flex-col justify-around flex-1" style={{ gap: `${matchSpacing * 16}px` }}>
                {roundMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    participants={participants}
                    teams={teams}
                    onRecordScore={onRecordScore}
                    compact={compact}
                    currentUserId={currentUserId}
                    bestOf={bestOf}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {isTeamMode && finalMatch?.team_winner_id && (() => {
          const winnerTeam = teams.find(t => t.id === finalMatch.team_winner_id)
          return (
            <div className="flex flex-col items-center justify-center ml-2">
              <div className="text-xs font-bold text-yellow-600 uppercase tracking-wider mb-3">
                Đội vô địch
              </div>
              <div className="bg-gradient-to-br from-yellow-100 to-amber-100 border-2 border-yellow-400 rounded-xl p-3 text-center shadow-sm">
                <Trophy className="w-8 h-8 text-yellow-500 mx-auto mb-1" />
                <div className="text-sm font-bold text-yellow-800">
                  {winnerTeam?.name || 'Winner'}
                </div>
                {winnerTeam?.members && (
                  <div className="text-[10px] text-yellow-700 mt-1">
                    {winnerTeam.members.map(m => shortName(m.user?.full_name)).filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      {/* Mobile: stacked rounds */}
      <div className="md:hidden space-y-4 p-2">
        {rounds.map((roundMatches, rIdx) => {
          const roundNum = rIdx + 1
          return (
            <div key={roundNum} ref={el => roundRefs.current[`m${roundNum}`] = el}>
              <button
                onClick={() => roundRefs.current[`m${roundNum}`]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className={`text-xs font-bold uppercase tracking-wider mb-2 px-1 ${roundNum === currentRound ? 'text-blue-600' : 'text-gray-400'} hover:text-purple-600 transition-colors cursor-pointer`}
              >
                {getRoundLabel(roundNum, totalRounds)}
                {roundNum === currentRound && (
                  <>
                    <span className="ml-2 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium normal-case">
                      Đang diễn ra
                    </span>
                    <span className="ml-1.5 text-[10px] font-mono font-semibold text-red-500">
                      ⏳ {countdown}
                    </span>
                  </>
                )}
              </button>
              <div className="space-y-2">
                {roundMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    participants={participants}
                    teams={teams}
                    onRecordScore={onRecordScore}
                    currentUserId={currentUserId}
                    bestOf={bestOf}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TournamentBracket
