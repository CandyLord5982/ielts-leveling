import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles } from 'lucide-react'

import { assetUrl } from '../../hooks/useBranding';
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

// Egg hatching videos - portrait for mobile, landscape for PC
const EGG_HATCH_VIDEO_MOBILE = assetUrl('/image/pet/egg-hatch-mobile.mp4')
const EGG_HATCH_VIDEO_PC = assetUrl('/image/pet/egg-hatch.mp4')

const EggOpenAnimation = ({ result, eggRarity, allPets = [], onClose, onNickname }) => {
  // phases: video -> carousel -> reveal -> done
  const [phase, setPhase] = useState('video')
  const [nickname, setNickname] = useState('')
  const [carouselIndex, setCarouselIndex] = useState(0)
  const videoRef = useRef(null)

  const isMobile = window.innerWidth < 768
  const isDuplicate = result?.result_type === 'duplicate_gems'
  const pet = result?.pet
  const rarity = eggRarity || pet?.rarity || 'common'

  // Build carousel pool: all pets of this rarity, shuffled
  const carouselPets = useRef([])
  useEffect(() => {
    const petsOfRarity = allPets.filter(p => p.rarity === rarity && p.id !== pet?.id)
    const shuffled = [...petsOfRarity].sort(() => Math.random() - 0.5)
    carouselPets.current = [...shuffled.slice(0, 8), pet].filter(Boolean)
  }, [allPets, rarity, pet])

  // When video ends, go straight to reveal
  // To re-enable carousel: replace setPhase('reveal') with setPhase('carousel')
  const handleVideoEnded = () => {
    setPhase('reveal')
  }

  // Fallback: if video fails to load, skip to reveal after a delay
  const handleVideoError = () => {
    setTimeout(() => setPhase('reveal'), 500)
  }

  // Carousel: cycle through silhouettes, slowing down, then reveal
  useEffect(() => {
    if (phase !== 'carousel') return

    const total = carouselPets.current.length
    if (total === 0) {
      setPhase('reveal')
      return
    }

    let currentIdx = 0
    const baseDelay = 120
    const maxDelay = 600

    const tick = () => {
      currentIdx++
      setCarouselIndex(currentIdx)

      if (currentIdx >= total - 1) {
        setTimeout(() => setPhase('reveal'), 700)
        return
      }

      const progress = currentIdx / (total - 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const delay = baseDelay + eased * (maxDelay - baseDelay)
      setTimeout(tick, delay)
    }

    const startTimer = setTimeout(tick, baseDelay)
    return () => clearTimeout(startTimer)
  }, [phase])

  useEffect(() => {
    if (phase === 'reveal') {
      new Audio(assetUrl('/sound/pet-reveal.mp3')).play().catch(() => {})
      const timer = setTimeout(() => setPhase('done'), 600)
      return () => clearTimeout(timer)
    }
  }, [phase])

  const handleCollect = () => {
    if (!isDuplicate && nickname && onNickname) {
      onNickname(nickname)
    }
    onClose()
  }

  // eslint-disable-next-line no-unused-vars
  const currentCarouselPet = carouselPets.current[carouselIndex] || pet

  return createPortal(
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      {/* Video Phase - fills entire overlay */}
      {phase === 'video' && (
        <video
          ref={videoRef}
          src={isMobile ? EGG_HATCH_VIDEO_MOBILE : EGG_HATCH_VIDEO_PC}
          autoPlay
          playsInline
          onEnded={handleVideoEnded}
          onError={handleVideoError}
          className="max-w-full max-h-full object-contain"
        />
      )}

      <div className={`bg-black rounded-2xl max-w-sm w-full p-8 text-center ${phase === 'video' ? 'hidden' : ''}`}>

        {/* Carousel - uncomment to re-enable (also change handleVideoEnded to setPhase('carousel'))
        {phase === 'carousel' && (
          <div className="flex flex-col items-center justify-center py-6">
            <p className="text-gray-400 text-sm mb-4">Who could it be...?</p>
            <div className={`w-32 h-32 mx-auto rounded-2xl bg-gradient-to-br ${rarityColors[rarity]} shadow-2xl ${rarityGlow[rarity]} overflow-hidden relative`}>
              <div
                key={carouselIndex}
                className="absolute inset-0 flex items-center justify-center animate-carousel-slide"
              >
                {currentCarouselPet?.image_url ? (
                  <img
                    src={currentCarouselPet.image_url}
                    alt="?"
                    className="w-full h-full object-contain"
                    style={{ filter: 'brightness(0)' }}
                  />
                ) : (
                  <span className="text-6xl" style={{ filter: 'brightness(0)' }}>🐾</span>
                )}
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-3">???</p>
          </div>
        )}
        */}

        {/* Reveal & Done */}
        {(phase === 'reveal' || phase === 'done') && (
          <div className="space-y-4 animate-fade-in">
            {isDuplicate ? (
              <>
                <div className="flex items-center justify-center gap-1 text-yellow-400 mb-2">
                  <Sparkles className="w-5 h-5" />
                  <span className="text-sm font-medium">Duplicate!</span>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center shadow-xl ${
                  result.refund_type === 'xp'
                    ? 'bg-gradient-to-br from-blue-400 to-cyan-400 shadow-blue-500/30'
                    : 'bg-gradient-to-br from-purple-400 to-pink-400 shadow-purple-500/30'
                }`}>
                  <img
                    src={result.refund_type === 'xp'
                      ? assetUrl('/image/study/xp.png')
                      : assetUrl('/image/study/gem.png')
                    }
                    alt={result.refund_type === 'xp' ? 'XP' : 'Gems'}
                    className="w-14 h-14"
                  />
                </div>
                <p className="text-white text-lg font-bold">
                  +{result.refund_type === 'xp' ? result.xp_awarded : result.gems_awarded} {result.refund_type === 'xp' ? 'XP' : 'Gems'}
                </p>
                <p className="text-gray-400 text-sm">{result.message}</p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-1 text-yellow-400 mb-2">
                  <Sparkles className="w-5 h-5" />
                  <span className="text-sm font-medium">New Pet!</span>
                  <Sparkles className="w-5 h-5" />
                </div>

                {/* Pet Image with light rays */}
                <div className="relative flex items-center justify-center mx-auto" style={{ width: 280, height: 280 }}>
                  {/* Spinning light rays */}
                  <div
                    className="absolute inset-0 animate-light-rays"
                    style={{
                      background: `conic-gradient(from 0deg, transparent 0deg, ${rarityLightColor[rarity]} 15deg, transparent 30deg, transparent 45deg, ${rarityLightColor[rarity]} 60deg, transparent 75deg, transparent 90deg, ${rarityLightColor[rarity]} 105deg, transparent 120deg, transparent 135deg, ${rarityLightColor[rarity]} 150deg, transparent 165deg, transparent 180deg, ${rarityLightColor[rarity]} 195deg, transparent 210deg, transparent 225deg, ${rarityLightColor[rarity]} 240deg, transparent 255deg, transparent 270deg, ${rarityLightColor[rarity]} 285deg, transparent 300deg, transparent 315deg, ${rarityLightColor[rarity]} 330deg, transparent 345deg, transparent 360deg)`,
                      borderRadius: '50%',
                      filter: 'blur(8px)',
                    }}
                  />
                  {/* Pulsing glow ring */}
                  <div
                    className="absolute animate-pulse-glow rounded-2xl"
                    style={{ inset: 8, boxShadow: `0 0 40px 10px ${rarityLightColor[rarity]}, 0 0 80px 20px ${rarityLightColor[rarity]}` }}
                  />
                  {/* Pet container */}
                  <div className={`relative w-60 h-60 rounded-2xl bg-gradient-to-br ${rarityColors[rarity]} flex items-center justify-center shadow-2xl ${rarityGlow[rarity]} overflow-hidden animate-pet-pulse`}>
                    {pet?.image_url ? (
                      <img src={pet.image_url} alt={pet.name} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-6xl">
                        {rarity === 'legendary' ? '🐉' :
                         rarity === 'epic' ? '🦅' :
                         rarity === 'rare' ? '🦊' :
                         rarity === 'uncommon' ? '🐱' : '🐶'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Pet Info */}
                <h3 className="text-white text-xl font-bold">{pet?.name}</h3>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${rarityBadge[rarity]}`}>
                  {rarity?.toUpperCase()}
                </span>
                {pet?.description && (
                  <p className="text-gray-400 text-sm">{pet.description}</p>
                )}

                {/* Nickname Input */}
                {phase === 'done' && onNickname && (
                  <div className="mt-2">
                    <label className="block text-sm text-gray-400 mb-1">Give a nickname (optional)</label>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder={pet?.name}
                      maxLength={20}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none text-center"
                    />
                  </div>
                )}
              </>
            )}

            {/* Collect Button */}
            {phase === 'done' && (
              <button
                onClick={handleCollect}
                className={`mt-4 px-8 py-2.5 rounded-lg font-medium transition-colors ${
                  isDuplicate
                    ? 'bg-purple-500 hover:bg-purple-600 text-white'
                    : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white'
                }`}
              >
                {isDuplicate ? (result.refund_type === 'xp' ? 'Collect XP' : 'Collect Gems') : 'Collect'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes carouselSlide {
          0% { transform: translateX(80%); opacity: 0; }
          15% { opacity: 1; }
          20% { transform: translateX(0); }
          80% { transform: translateX(0); }
          85% { opacity: 1; }
          100% { transform: translateX(-80%); opacity: 0; }
        }
        .animate-carousel-slide {
          animation: carouselSlide 0.45s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
        }
        @keyframes fadeIn {
          0% { opacity: 0; transform: translateY(20px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out forwards;
        }
        @keyframes lightRays {
          0% { transform: rotate(0deg); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: rotate(360deg); opacity: 1; }
        }
        .animate-light-rays {
          animation: lightRays 8s linear infinite;
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        .animate-pulse-glow {
          animation: pulseGlow 2s ease-in-out infinite;
        }
        @keyframes petPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        .animate-pet-pulse {
          animation: petPulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>,
    document.body
  )
}

export default EggOpenAnimation
