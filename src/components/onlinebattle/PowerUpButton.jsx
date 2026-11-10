import { useState } from 'react'
import { Zap } from 'lucide-react'
import { supabase } from '../../supabase/client'
import { POWERUPS, playPowerUpSound } from './onlineBattleShared'

// Power-ups a student won from the Random bonus button (25% chance). Use it or lose it:
// each one expires when the teacher opens the next question. The effect is applied in
// the database (online_battle_use_powerup); this only shows what it would do.

const USE_ERRORS = {
  expired: 'Too late - a new question started.',
  already_used: 'Already used.',
  not_revealed: 'Wait for the answer to be revealed first.',
}

const PowerUpButton = ({ powerups, room, myTeam, teamLabel, otherTeamLabel, onUsed }) => {
  const [using, setUsing] = useState(null) // power-up id
  const [message, setMessage] = useState('')
  const list = Array.isArray(powerups) ? powerups : []
  if (list.length === 0 && !message) return null

  const mine = myTeam === 'a' ? room.team_a_score : room.team_b_score
  const theirs = myTeam === 'a' ? room.team_b_score : room.team_a_score

  const preview = (pu) => {
    if (pu.kind === 'steal') {
      // The amount (3 to 7) is rolled when used, and can't be more than they have
      const max = Math.min(7, theirs)
      const min = Math.min(3, theirs)
      const range = min === max ? `${max}` : `${min} to ${max}`
      return { text: max > 0 ? `Take ${range} points from ${otherTeamLabel}` : `${otherTeamLabel} has no points to steal`, good: max > 0 }
    }
    if (pu.kind === 'swap') {
      const diff = theirs - mine
      return { text: `${teamLabel}: ${mine} → ${theirs}`, good: diff > 0, warn: diff < 0 ? 'This would LOWER your score!' : '' }
    }
    // boost: +10 when ahead or level, otherwise 10 ahead of the other team
    const next = mine >= theirs ? mine + 10 : theirs + 10
    return { text: `${teamLabel}: ${mine} → ${next}`, good: true }
  }

  const use = async (pu) => {
    if (using) return
    setUsing(pu.id)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('online_battle_use_powerup', { p_powerup_id: pu.id })
      if (error) setMessage(`Could not use it: ${error.message}`)
      else if (!data?.used) setMessage(USE_ERRORS[data?.reason] || 'Could not use the power-up.')
      else {
        playPowerUpSound()
        setMessage(`${POWERUPS[data.kind].name} used! ${data.points > 0 ? `+${data.points}` : data.points} for ${teamLabel}`)
        setTimeout(() => setMessage(''), 3000)
      }
    } finally {
      await onUsed()
      setUsing(null)
    }
  }

  return (
    <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 p-3 text-white shadow-lg">
      {list.length > 0 && (
        <div className="flex items-center gap-1.5 text-sm font-black mb-2">
          <Zap className="w-4 h-4" />
          Power-up! Use it before the next question or lose it
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {list.map(pu => {
          const info = POWERUPS[pu.kind]
          const p = preview(pu)
          return (
            <button
              key={pu.id}
              onClick={() => use(pu)}
              disabled={!!using || p.wait}
              title={info.hint}
              className="flex-1 min-w-[12rem] flex items-center gap-3 rounded-xl bg-white text-gray-800 px-3 py-2 text-left shadow hover:scale-[1.02] active:scale-95 transition disabled:opacity-60 disabled:hover:scale-100 animate-pulse disabled:animate-none"
            >
              <img src={info.image} alt={info.name} className="w-10 h-10 object-contain flex-shrink-0" />
              <span className="min-w-0">
                <span className="block font-black text-purple-700">{using === pu.id ? 'Using...' : `Use ${info.name}`}</span>
                <span className={`block text-xs ${p.good ? 'text-green-700' : 'text-gray-500'}`}>{p.text}</span>
                {p.warn && <span className="block text-xs font-bold text-red-600">{p.warn}</span>}
              </span>
            </button>
          )
        })}
      </div>
      {message && <p className={`${list.length > 0 ? 'mt-2' : ''} text-sm font-bold`}>{message}</p>}
    </div>
  )
}

export default PowerUpButton
