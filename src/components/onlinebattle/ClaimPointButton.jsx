import { useState } from 'react'
import { supabase } from '../../supabase/client'
import { assetUrl } from '../../hooks/useBranding'
import { POWERUPS, playPowerUpSound } from './onlineBattleShared'

// Student's bonus buttons, the same two as the team buttons in Live Battle:
//   +3      - a safe 3 points for their team
//   Random  - a random -1 to 7 points (rolled on the server)
// Both stay dim until the student has answered a live question correctly and the teacher
// has revealed it; then they light up and the student taps one. Each correct answer is
// one tap, on top of the automatic team points.
// Power-up (⚡) - only shows for ~25% of correct answers, as an extra on top of the tap
// above. Opening it gives Steal, Swap or Double, to use before the next question.

const BUTTONS = [
  { kind: 'three', image: assetUrl('/class-battle/meat.png'), label: '+3', hint: 'Add 3 points to your team' },
  { kind: 'random', image: assetUrl('/class-battle/random.png'), label: '?', hint: 'Random: -1 to 7 points for your team' },
]

const sounds = {
  add1: assetUrl('/class-battle/add1.mp3'),
  add2: assetUrl('/class-battle/add2.mp3'),
  add3: assetUrl('/class-battle/add3.mp3'),
  minus1: assetUrl('/class-battle/minus1.mp3'),
}
const playPointSound = (points) => {
  const key = points < 0 ? 'minus1' : points >= 3 ? 'add3' : points === 2 ? 'add2' : 'add1'
  try { new Audio(sounds[key]).play().catch(() => {}) } catch { /* sound is optional */ }
}

// `inHeader`: compact look for the coloured team header (no label, yellow glow)
const ClaimPointButton = ({ roomId, claimable, powerupOffers = 0, team, teamLabel, onClaimed, inHeader = false }) => {
  const [claiming, setClaiming] = useState(false)
  const [result, setResult] = useState(null) // { points, powerup } from the last tap, shown briefly
  const lit = claimable > 0 && !claiming

  const claim = async (kind) => {
    if (!lit) return
    setClaiming(true)
    setResult(null)
    try {
      const { data, error } = await supabase.rpc('online_battle_claim_point', { p_room_id: roomId, p_kind: kind })
      if (!error && data?.claimed) {
        setResult({ points: data.points, powerup: null })
        playPointSound(data.points)
        setTimeout(() => setResult(null), 2500)
      }
    } finally {
      await onClaimed() // refetch the score and how many taps are left
      setClaiming(false)
    }
  }

  const openPowerUp = async () => {
    if (claiming || powerupOffers <= 0) return
    setClaiming(true)
    setResult(null)
    try {
      const { data, error } = await supabase.rpc('online_battle_claim_powerup', { p_room_id: roomId })
      if (!error && data?.claimed) {
        setResult({ points: 0, powerup: data.powerup })
        playPowerUpSound()
        setTimeout(() => setResult(null), 2500)
      }
    } finally {
      await onClaimed() // the power-up card shows up after this refetch
      setClaiming(false)
    }
  }

  // The header is already the team colour, so the glow there is yellow
  const glow = inHeader
    ? 'ring-yellow-300 shadow-yellow-300/80'
    : team === 'a' ? 'ring-red-400 shadow-red-400/70' : 'ring-blue-400 shadow-blue-400/70'
  const dim = inHeader ? 'bg-white/20 opacity-60 grayscale' : 'bg-gray-100 opacity-50 grayscale'
  const size = inHeader ? 'w-8 h-8' : 'w-10 h-10'
  const imageSize = inHeader ? 'w-6 h-6' : 'w-7 h-7'

  return (
    // A plain row, sized like the team buttons in Live Battle; the parent supplies the background
    <div className={`flex items-center justify-center gap-2 ${inHeader ? '' : 'flex-wrap'}`}>
      {!inHeader && (
        <span className={`text-xs font-semibold mr-1 ${lit ? 'text-gray-800' : 'text-gray-400'}`}>
          {lit ? 'Pick one!' : 'Bonus:'}
        </span>
      )}
      {BUTTONS.map(btn => (
        <button
          key={btn.kind}
          onClick={() => claim(btn.kind)}
          disabled={!lit}
          title={lit ? btn.hint : 'Lights up when you answer a live question correctly'}
          className={`${size} rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
            lit ? `bg-white ring-4 shadow-lg animate-pulse hover:scale-110 active:scale-95 ${glow}` : dim
          }`}
        >
          <img src={btn.image} alt={btn.label} className={`${imageSize} object-contain`} />
        </button>
      ))}
      {powerupOffers > 0 && (
        <button
          onClick={openPowerUp}
          disabled={claiming}
          title="Power-up! Extra on top of your bonus: Steal, Swap or Double"
          className={`${size} rounded-full flex items-center justify-center flex-shrink-0 transition-all bg-gradient-to-br from-purple-500 to-pink-500 ring-4 ring-yellow-300 shadow-lg shadow-pink-400/70 animate-bounce hover:scale-110 active:scale-95 disabled:opacity-60`}
        >
          <span className={inHeader ? 'text-base' : 'text-xl'}>⚡</span>
        </button>
      )}
      {claimable > 1 && !claiming && (
        <span className="h-6 px-2 rounded-full bg-yellow-400 text-yellow-900 text-xs font-black flex items-center justify-center" title="Taps you have left">
          x{claimable}
        </span>
      )}
      {result?.powerup && (
        <span className="h-6 px-2 rounded-full text-xs font-black text-white flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500">
          <img src={POWERUPS[result.powerup].image} alt="" className="w-4 h-4 object-contain mr-1" />
          {inHeader ? '' : `Power-up: ${POWERUPS[result.powerup].name}!`}
        </span>
      )}
      {result && !result.powerup && (
        <span className={`h-6 px-2 rounded-full text-xs font-black text-white flex items-center justify-center ${result.points > 0 ? 'bg-green-500' : result.points < 0 ? 'bg-red-500' : 'bg-gray-500'}`}>
          {result.points > 0 ? `+${result.points}` : result.points}{inHeader ? '' : ` for ${teamLabel}`}
        </span>
      )}
    </div>
  )
}

export default ClaimPointButton
