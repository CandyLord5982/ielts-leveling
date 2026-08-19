import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X } from 'lucide-react'
import { assetUrl } from '../../hooks/useBranding'

/* ── Animated number counter ── */
const AnimatedNumber = ({ value, duration = 1200 }) => {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    if (!value) return
    const startTime = performance.now()
    const step = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.floor(eased * value))
      if (progress < 1) {
        ref.current = requestAnimationFrame(step)
      }
    }
    ref.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(ref.current)
  }, [value, duration])

  return <span>+{display}</span>
}

/* ── Confetti / sparkle particle ── */
const PARTICLE_COLORS = [
  '#FFD700', '#FF6B6B', '#4ECDC4', '#A78BFA',
  '#F472B6', '#FBBF24', '#34D399', '#60A5FA',
  '#FB923C', '#E879F9',
]

const Particle = ({ delay, color, style }) => (
  <div
    className="absolute rounded-sm animate-[confetti_1.8s_ease-out_forwards]"
    style={{
      width: Math.random() * 8 + 4,
      height: Math.random() * 8 + 4,
      backgroundColor: color,
      left: `${50 + (Math.random() - 0.5) * 20}%`,
      top: '45%',
      animationDelay: `${delay}s`,
      opacity: 0,
      ...style,
    }}
  />
)

/* ── Celebration overlay ── */
const ClaimCelebration = ({ result, onClose }) => {
  const [phase, setPhase] = useState('enter')
  const particles = useRef(
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      delay: Math.random() * 0.6,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      style: {
        '--confetti-x': `${(Math.random() - 0.5) * 500}px`,
        '--confetti-y': `${-Math.random() * 400 - 100}px`,
        '--confetti-r': `${Math.random() * 720 - 360}deg`,
      },
    }))
  ).current

  useEffect(() => {
    const t = setTimeout(() => setPhase('show'), 50)
    return () => clearTimeout(t)
  }, [])

  const handleClose = useCallback(() => {
    setPhase('exit')
    setTimeout(onClose, 400)
  }, [onClose])

  useEffect(() => {
    const t = setTimeout(handleClose, 4000)
    return () => clearTimeout(t)
  }, [handleClose])

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-400 ${
        phase === 'exit' ? 'opacity-0 scale-95' : phase === 'show' ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p) => (
          <Particle key={p.id} {...p} />
        ))}
      </div>

      <div
        className={`relative bg-gradient-to-b from-gray-900 to-gray-800 border border-amber-500/30 p-8 max-w-xs w-full mx-4 shadow-[0_0_60px_rgba(245,158,11,0.3)] transition-all duration-500 ${
          phase === 'show' ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
        }`}
        style={{ clipPath: 'polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-[16px] w-12 h-[2px] bg-gradient-to-r from-amber-400 to-transparent" />
        <div className="absolute top-0 left-[16px] w-[2px] h-12 bg-gradient-to-b from-amber-400 to-transparent" />
        <div className="absolute bottom-0 right-[16px] w-12 h-[2px] bg-gradient-to-l from-amber-400 to-transparent" />
        <div className="absolute bottom-0 right-[16px] w-[2px] h-12 bg-gradient-to-t from-amber-400 to-transparent" />

        <button onClick={handleClose} className="absolute top-3 right-3 text-gray-500 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="flex justify-center mb-5">
          <div className="relative">
            <div className="absolute inset-0 animate-ping bg-amber-400/20 rounded-full scale-150" />
            <div className="relative w-16 h-16 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.5)]">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>

        <div className="text-center mb-6">
          <p className="text-amber-400/80 text-xs tracking-[0.3em] uppercase mb-1">
            Hoàn thành
          </p>
          <h2 className="text-white text-lg font-bold tracking-wide">
            {result.title}
          </h2>
        </div>

        <div className="flex items-center justify-center gap-6">
          {result.xp > 0 && (
            <div className={`flex flex-col items-center gap-1 transition-all duration-700 ${
              phase === 'show' ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            }`} style={{ transitionDelay: '0.3s' }}>
              <div className="relative">
                <div className="absolute inset-0 animate-pulse bg-amber-400/20 rounded-full scale-125" />
                <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-12 h-12 relative" />
              </div>
              <span className="text-2xl font-black text-amber-400 tabular-nums">
                <AnimatedNumber value={result.xp} />
              </span>
              <span className="text-[10px] text-amber-400/60 tracking-widest uppercase">XP</span>
            </div>
          )}
          {result.gems > 0 && (
            <div className={`flex flex-col items-center gap-1 transition-all duration-700 ${
              phase === 'show' ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            }`} style={{ transitionDelay: '0.5s' }}>
              <div className="relative">
                <div className="absolute inset-0 animate-pulse bg-purple-400/20 rounded-full scale-125" />
                <img src={assetUrl('/image/study/gem.png')} alt="Gems" className="w-12 h-12 relative" />
              </div>
              <span className="text-2xl font-black text-purple-400 tabular-nums">
                <AnimatedNumber value={result.gems} />
              </span>
              <span className="text-[10px] text-purple-400/60 tracking-widest uppercase">Gems</span>
            </div>
          )}
        </div>

        <p className="text-center text-gray-600 text-[10px] mt-6 tracking-wider">
          Nhấn để đóng
        </p>
      </div>
    </div>,
    document.body
  )
}

export default ClaimCelebration
