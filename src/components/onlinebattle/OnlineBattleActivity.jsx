import { History } from 'lucide-react'
import { assetUrl } from '../../hooks/useBranding'
import { teamName, POWERUPS } from './onlineBattleShared'

// Recent activity board shown under the teams, on both the teacher's page and the
// students' room: who got how many points, and from what.

const ICONS = {
  bonus_three: assetUrl('/class-battle/meat.png'),
  bonus_random: assetUrl('/class-battle/random.png'),
  powerup_steal: POWERUPS.steal.image,
  powerup_swap: POWERUPS.swap.image,
  powerup_boost: POWERUPS.boost.image,
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const EMOJI = {
  powerup_won: '⚡',
}

const describe = (event, nameOf, room) => {
  const who = nameOf[event.user_id] || 'A student'
  switch (event.kind) {
    case 'question': {
      const d = event.detail || {}
      return d.total > 0
        ? `Question ${d.question_no}: ${d.correct} of ${d.total} correct`
        : `Question ${d.question_no}: nobody on this team`
    }
    case 'bonus_three':
      return `${who} used +3`
    case 'bonus_random':
      return event.detail?.powerup
        ? `${who} rolled Random: got ${POWERUPS[event.detail.powerup]?.name || 'a power-up'}!`
        : `${who} rolled Random`
    case 'powerup_won':
      return `${who} opened a power-up: ${POWERUPS[event.detail?.powerup]?.name || '?'}!`
    case 'powerup_steal':
      return `${who} stole from ${teamName(room, event.team === 'a' ? 'b' : 'a')}`
    case 'powerup_swap':
      return `${who} swapped the scores`
    case 'powerup_boost':
      return event.detail?.was_behind ? `${who} boosted past the other team` : `${who} used Boost`
    case 'manual':
      return event.points >= 0 ? 'Teacher gave points' : 'Teacher took points'
    default:
      return ''
  }
}

const OnlineBattleActivity = ({ events, participants, room, myUserId }) => {
  const nameOf = {}
  participants.forEach(p => { nameOf[p.user_id] = p.student_name })

  return (
    <div className="mt-4 rounded-2xl bg-white/95 border-2 border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50">
        <History className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-bold text-gray-700">Recent activity</span>
      </div>
      {events.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-6">Points will show up here as the battle goes.</p>
      ) : (
        <ul className="divide-y max-h-72 overflow-y-auto">
          {events.map(e => {
            const isMine = e.user_id && e.user_id === myUserId
            const teamColor = e.team === 'a' ? 'bg-red-500' : 'bg-blue-500'
            const pointsColor = e.points > 0 ? 'text-green-600' : e.points < 0 ? 'text-red-600' : 'text-gray-400'
            return (
              <li key={e.id} className={`flex items-center gap-3 px-4 py-2 text-sm ${isMine ? 'bg-yellow-50' : ''}`}>
                <span className="text-xs text-gray-400 tabular-nums w-16 flex-shrink-0">{timeOf(e.created_at)}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold text-white truncate max-w-[8rem] flex-shrink-0 ${teamColor}`}>
                  {teamName(room, e.team)}
                </span>
                {ICONS[e.kind] && <img src={ICONS[e.kind]} alt="" className="w-5 h-5 object-contain flex-shrink-0" />}
                {EMOJI[e.kind] && <span className="w-5 text-center flex-shrink-0">{EMOJI[e.kind]}</span>}
                <span className="flex-1 min-w-0 truncate text-gray-700">{describe(e, nameOf, room)}</span>
                <span className={`font-black tabular-nums flex-shrink-0 ${pointsColor}`}>
                  {e.points > 0 ? `+${e.points}` : e.points}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default OnlineBattleActivity
