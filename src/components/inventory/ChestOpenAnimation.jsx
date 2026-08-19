import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, Package, ShoppingBag } from 'lucide-react'

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

const ChestOpenAnimation = ({ result, chestType, onClose }) => {
  // phases: revealing -> done (video removed)
  const [phase, setPhase] = useState('revealing')
  const [revealedCount, setRevealedCount] = useState(0)

  const items = result?.items || []
  // Use the highest rarity item for the glow effect
  const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary']
  const bestRarity = items.reduce((best, item) => {
    const idx = rarityOrder.indexOf(item.rarity)
    const bestIdx = rarityOrder.indexOf(best)
    return idx > bestIdx ? item.rarity : best
  }, 'common')

  // Play reveal audio when revealing starts
  useEffect(() => {
    if (phase === 'revealing') {
      new Audio(assetUrl('/sound/pet-reveal.mp3')).play().catch(() => {})
    }
  }, [phase])

  // Reveal items one by one
  useEffect(() => {
    if (phase === 'revealing' && revealedCount < items.length) {
      const revealTimer = setTimeout(() => {
        setRevealedCount(prev => prev + 1)
      }, 400)
      return () => clearTimeout(revealTimer)
    } else if (phase === 'revealing' && revealedCount >= items.length) {
      const doneTimer = setTimeout(() => setPhase('done'), 500)
      return () => clearTimeout(doneTimer)
    }
  }, [phase, revealedCount, items.length])

  return createPortal(
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="bg-black rounded-2xl max-w-sm w-full p-8 text-center">
        {/* Revealed Items */}
        {(phase === 'revealing' || phase === 'done') && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-center gap-1 text-yellow-400 mb-2">
              <Sparkles className="w-5 h-5" />
              <span className="text-sm font-medium">{result.chest_name || 'Chest'}</span>
              <Sparkles className="w-5 h-5" />
            </div>

            {/* Items grid with light rays */}
            <div className="relative flex items-center justify-center mx-auto" style={{ minHeight: 200 }}>
              {/* Pulsing glow */}
              <div
                className="absolute animate-pulse-glow rounded-2xl"
                style={{
                  inset: 0,
                  boxShadow: `0 0 40px 10px ${rarityLightColor[bestRarity]}, 0 0 80px 20px ${rarityLightColor[bestRarity]}`,
                }}
              />

              <div className="relative grid grid-cols-3 gap-3 w-full px-3">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl border-2 p-3 transition-all duration-500 ${
                      idx < revealedCount
                        ? `border-transparent bg-gradient-to-br ${rarityColors[item.rarity]} shadow-2xl ${rarityGlow[item.rarity]} opacity-100 scale-100`
                        : 'border-gray-700 bg-gray-800 opacity-30 scale-75'
                    }`}
                  >
                    <div className="aspect-square bg-white/20 rounded-lg flex items-center justify-center overflow-hidden mb-1.5">
                      {item.reward_type === 'xp' ? (
                        <img src={assetUrl('/icon/profile/XP.svg')} alt="XP" className="w-10 h-10" />
                      ) : item.reward_type === 'gems' ? (
                        <img src={assetUrl('/image/study/gem.png')} alt="Gems" className="w-10 h-10" />
                      ) : item.reward_type === 'shop_item' && !item.image_url ? (
                        <ShoppingBag className="w-8 h-8 text-purple-300" />
                      ) : item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                      ) : (
                        <Package className="w-6 h-6 text-gray-300" />
                      )}
                    </div>
                    <p className="text-white text-[10px] font-medium truncate text-center">
                      {idx < revealedCount ? item.name : '???'}
                    </p>
                    {idx < revealedCount && (
                      <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold ${rarityBadge[item.rarity]}`}>
                        {item.rarity?.toUpperCase()}
                      </span>
                    )}
                    {idx < revealedCount && item.quantity > 1 && !item.reward_type?.match(/^(xp|gems)$/) && (
                      <p className="text-[10px] text-white/75 text-center">x{item.quantity}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Collect button */}
            {phase === 'done' && (
              <button
                onClick={onClose}
                className="mt-4 px-8 py-2.5 rounded-lg font-medium transition-colors bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white"
              >
                Collect
              </button>
            )}
          </div>
        )}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes fadeIn {
          0% { opacity: 0; transform: translateY(20px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out forwards;
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .animate-pulse-glow {
          animation: pulseGlow 2s ease-in-out infinite;
        }
      `}</style>
    </div>,
    document.body
  )
}

export default ChestOpenAnimation
