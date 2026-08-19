import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { assetUrl } from '../../hooks/useBranding'

const rarityColors = {
  common: 'from-gray-300 to-gray-400',
  uncommon: 'from-green-300 to-green-500',
  rare: 'from-blue-300 to-blue-500',
  epic: 'from-purple-400 to-purple-600',
  legendary: 'from-yellow-300 to-amber-500',
}

const rarityGlow = {
  common: 'shadow-gray-300',
  uncommon: 'shadow-green-400',
  rare: 'shadow-blue-400',
  epic: 'shadow-purple-500',
  legendary: 'shadow-yellow-400',
}

const rarityBadge = {
  common: 'bg-gray-200 text-gray-700',
  uncommon: 'bg-green-200 text-green-800',
  rare: 'bg-blue-200 text-blue-800',
  epic: 'bg-purple-200 text-purple-800',
  legendary: 'bg-yellow-200 text-yellow-800',
}

const rarityLightColor = {
  common: 'rgba(156,163,175,0.5)',
  uncommon: 'rgba(74,222,128,0.5)',
  rare: 'rgba(96,165,250,0.5)',
  epic: 'rgba(192,132,252,0.5)',
  legendary: 'rgba(250,204,21,0.5)',
}

/**
 * CatchAnimation - Pokemon-style catch animation
 * Phases: throwing -> shaking -> result -> done
 *
 * @param {object} result - catch result from attempt_catch_pet RPC
 * @param {object} ball - the ball item used { image_url, name, rarity }
 * @param {function} onClose - called when animation completes
 * @param {function} onNickname - called with nickname if user names their new pet
 */
const CatchAnimation = ({ result, ball, onClose, onNickname }) => {
  // phases: throwing -> shaking -> result -> done
  const [phase, setPhase] = useState('throwing')
  const [shakeCount, setShakeCount] = useState(0)
  const [nickname, setNickname] = useState('')

  const caught = result?.caught
  const isDuplicate = result?.duplicate
  const pet = result?.pet
  const rarity = pet?.rarity || 'common'
  const totalShakes = caught ? 3 : Math.floor(Math.random() * 2) + 1 // 1-2 shakes before fail, 3 for success

  // Phase: throwing -> ball flies to center
  useEffect(() => {
    if (phase === 'throwing') {
      const timer = setTimeout(() => setPhase('shaking'), 800)
      return () => clearTimeout(timer)
    }
  }, [phase])

  // Phase: shaking -> ball shakes 1-3 times
  useEffect(() => {
    if (phase !== 'shaking') return

    if (shakeCount >= totalShakes) {
      const timer = setTimeout(() => setPhase('result'), 500)
      return () => clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      setShakeCount(prev => prev + 1)
    }, 600)
    return () => clearTimeout(timer)
  }, [phase, shakeCount, totalShakes])

  // Phase: result -> show outcome
  useEffect(() => {
    if (phase === 'result') {
      if (caught) {
        new Audio(assetUrl('/sound/pet-reveal.mp3')).play().catch(() => {})
      }
      const timer = setTimeout(() => setPhase('done'), 800)
      return () => clearTimeout(timer)
    }
  }, [phase, caught])

  const handleCollect = () => {
    if (caught && !isDuplicate && nickname && onNickname) {
      onNickname(nickname)
    }
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="max-w-sm w-full p-8 text-center">

        {/* Throwing Phase - ball flies up */}
        {phase === 'throwing' && (
          <div className="flex flex-col items-center animate-bounce">
            <div className="w-20 h-20 animate-[spin_0.5s_linear_infinite]">
              {ball?.image_url ? (
                <img src={ball.image_url} alt={ball.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full rounded-full bg-gradient-to-b from-red-500 to-white border-4 border-gray-800 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-white border-2 border-gray-800" />
                </div>
              )}
            </div>
            <p className="text-white text-lg mt-4 animate-pulse">Throwing...</p>
          </div>
        )}

        {/* Shaking Phase - ball wobbles */}
        {phase === 'shaking' && (
          <div className="flex flex-col items-center">
            <div
              className="w-24 h-24 transition-transform duration-200"
              style={{
                animation: 'catch-shake 0.4s ease-in-out',
                animationIterationCount: 1,
                transform: shakeCount % 2 === 0 ? 'rotate(-15deg)' : 'rotate(15deg)',
              }}
            >
              {ball?.image_url ? (
                <img src={ball.image_url} alt={ball.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full rounded-full bg-gradient-to-b from-red-500 to-white border-4 border-gray-800 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-white border-2 border-gray-800" />
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-6">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    i < shakeCount ? 'bg-yellow-400 scale-110' : 'bg-gray-600'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Result Phase - success or fail reveal */}
        {(phase === 'result' || phase === 'done') && (
          <div className="flex flex-col items-center">
            {caught ? (
              <>
                {/* Success - sparkle burst and pet reveal */}
                <div className="relative">
                  {/* Light rays */}
                  <div
                    className="absolute inset-0 rounded-full blur-3xl animate-pulse"
                    style={{
                      background: `radial-gradient(circle, ${rarityLightColor[rarity]}, transparent 70%)`,
                      width: '200px',
                      height: '200px',
                      top: '-40px',
                      left: '-40px',
                    }}
                  />
                  <img
                    src={pet?.image_url}
                    alt={pet?.name}
                    className={`w-32 h-32 object-contain relative z-10 animate-[bounceIn_0.6s_ease-out] drop-shadow-2xl ${rarityGlow[rarity]}`}
                  />
                </div>

                <span className={`mt-4 px-3 py-1 rounded-full text-xs font-bold uppercase ${rarityBadge[rarity]}`}>
                  {rarity}
                </span>

                <h2 className="text-white text-2xl font-bold mt-2">
                  {isDuplicate ? 'Already Owned!' : 'Caught!'}
                </h2>
                <p className={`text-lg font-semibold bg-gradient-to-r ${rarityColors[rarity]} bg-clip-text text-transparent`}>
                  {pet?.name}
                </p>

                {isDuplicate && result?.refund_xp > 0 && (
                  <p className="text-yellow-400 mt-2 text-sm">
                    Received {result.refund_xp} XP as refund
                  </p>
                )}

                {phase === 'done' && !isDuplicate && (
                  <div className="mt-4 w-full">
                    <input
                      type="text"
                      placeholder="Give a nickname (optional)"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      maxLength={20}
                      className="w-full px-4 py-2 rounded-lg bg-white/10 text-white placeholder-white/40 border border-white/20 text-center focus:outline-none focus:border-white/50"
                    />
                  </div>
                )}

                {phase === 'done' && (
                  <button
                    onClick={handleCollect}
                    className={`mt-4 px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r ${rarityColors[rarity]} hover:scale-105 active:scale-95 transition-transform shadow-lg`}
                  >
                    {isDuplicate ? 'OK' : 'Collect!'}
                  </button>
                )}
              </>
            ) : (
              <>
                {/* Fail - pet escapes */}
                <div className="relative">
                  <img
                    src={pet?.image_url}
                    alt={pet?.name}
                    className="w-28 h-28 object-contain opacity-50 animate-[fadeOutUp_1s_ease-out_forwards]"
                  />
                </div>

                <h2 className="text-red-400 text-2xl font-bold mt-4">Broke free!</h2>
                <p className="text-gray-400 mt-1">{pet?.name} escaped...</p>
                <p className="text-gray-500 text-xs mt-1">Catch rate was {result?.catch_rate}%</p>

                {phase === 'done' && (
                  <button
                    onClick={onClose}
                    className="mt-6 px-8 py-3 rounded-xl font-bold text-white bg-gray-700 hover:bg-gray-600 transition-colors"
                  >
                    OK
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* CSS keyframes */}
      <style>{`
        @keyframes catch-shake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-20deg); }
          75% { transform: rotate(20deg); }
        }
        @keyframes bounceIn {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeOutUp {
          0% { opacity: 0.5; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-60px); }
        }
      `}</style>
    </div>,
    document.body
  )
}

export default CatchAnimation
