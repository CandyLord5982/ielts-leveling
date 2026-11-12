import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { assetUrl } from '../../hooks/useBranding'
import { useInventory } from '../../hooks/useInventory'
import { usePet } from '../../hooks/usePet'
import { getZone } from '../../utils/wildZones'

const rarityColors = {
  common: 'from-gray-300 to-gray-400',
  uncommon: 'from-green-300 to-green-500',
  rare: 'from-blue-300 to-blue-500',
  epic: 'from-purple-400 to-purple-600',
  legendary: 'from-yellow-300 to-amber-500',
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

const raritySolidColor = {
  common: '#9CA3AF',
  uncommon: '#4ADE80',
  rare: '#60A5FA',
  epic: '#C084FC',
  legendary: '#FACC15',
}

// CATCH_RATE[ballRarity][petRarity] = percent chance
const CATCH_RATE = {
  //                 common  uncommon  rare  epic  legendary
  common:          { common: 75, uncommon: 60, rare: 40, epic: 25, legendary: 15 },
  uncommon:        { common: 90, uncommon: 75, rare: 55, epic: 40, legendary: 30 },
  rare:            { common: 100, uncommon: 95, rare: 75, epic: 60, legendary: 45 },
  epic:            { common: 100, uncommon: 100, rare: 90, epic: 75, legendary: 60 },
  legendary:       { common: 100, uncommon: 100, rare: 100, epic: 95, legendary: 90 },
}

const getCatchRate = (ballRarity, petRarity) => {
  return CATCH_RATE[ballRarity]?.[petRarity] ?? 50
}

const BallImage = ({ ball, className = '' }) => {
  if (ball?.image_url) {
    return <img src={ball.image_url} alt={ball.name} className={`object-contain ${className}`} />
  }
  return (
    <div className={`rounded-full bg-gradient-to-b from-red-500 to-white border-4 border-gray-800 flex items-center justify-center ${className}`}>
      <div className="w-1/4 h-1/4 rounded-full bg-white border-2 border-gray-800" />
    </div>
  )
}

/* ---- Particle System ---- */
const Particles = ({ count = 20, color = '#fff', burst = false, spread = 120 }) => {
  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      angle: (360 / count) * i + (Math.random() * 20 - 10),
      distance: spread * (0.5 + Math.random() * 0.5),
      size: 2 + Math.random() * 4,
      delay: burst ? 0 : Math.random() * 2,
      duration: 0.6 + Math.random() * 0.8,
      shape: Math.random() > 0.5 ? 'circle' : 'star',
    }))
  , [count, spread, burst])

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map(p => {
        const rad = (p.angle * Math.PI) / 180
        const tx = Math.cos(rad) * p.distance
        const ty = Math.sin(rad) * p.distance
        return (
          <div
            key={p.id}
            className="absolute left-1/2 top-1/2"
            style={{
              width: p.size,
              height: p.size,
              background: color,
              borderRadius: p.shape === 'circle' ? '50%' : '2px',
              transform: p.shape === 'star' ? 'rotate(45deg)' : undefined,
              animation: burst
                ? `particleBurst ${p.duration}s ease-out ${p.delay}s forwards`
                : `particleFloat ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
              '--tx': `${tx}px`,
              '--ty': `${ty}px`,
              opacity: 0,
            }}
          />
        )
      })}
    </div>
  )
}

/* ---- Gold dust: glowing specks that keep rising around the pet after a catch ---- */
const GoldDust = ({ color, count = 28 }) => {
  const specks = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 240,
      y: 30 + Math.random() * 60,
      size: 2 + Math.random() * 3.5,
      rise: 120 + Math.random() * 120,
      drift: (Math.random() - 0.5) * 40,
      duration: 1.8 + Math.random() * 1.6,
      delay: 0.4 + Math.random() * 2.2,
      gold: i % 3 !== 0,
    }))
  , [count])

  return (
    <div className="absolute left-1/2 top-1/2 w-0 h-0 pointer-events-none z-20">
      {specks.map(s => (
        <div
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: s.x, top: s.y,
            width: s.size, height: s.size,
            background: s.gold ? '#FFE680' : color,
            boxShadow: `0 0 ${s.size * 2}px ${s.gold ? 'rgba(255,215,0,0.9)' : color}`,
            '--rise': `${-s.rise}px`,
            '--drift': `${s.drift}px`,
            animation: `dustRise ${s.duration}s ease-out ${s.delay}s infinite both`,
          }}
        />
      ))}
    </div>
  )
}

/* ---- Confetti cannons ----
 * Two volleys fired from both bottom corners: each piece arcs up over the pet, then flutters down
 * while flipping in 3D. Colours stay on-theme (rarity colour, gold, white).
 */
const Confetti = ({ color, intensity = 1 }) => {
  const pieces = useMemo(() => {
    const palette = [color, color, '#FFD700', '#FFE680', '#FFFFFF']
    const count = Math.round(220 * intensity)
    return Array.from({ length: count }, (_, i) => {
      const fromLeft = i % 2 === 0
      const strip = Math.random() > 0.35
      return {
        id: i,
        fromLeft,
        vx: (fromLeft ? 1 : -1) * (12 + Math.random() * 40), // vw sideways
        peak: 45 + Math.random() * 35,                        // vh up
        fall: 25 + Math.random() * 45,                        // vh back down from the peak
        delay: (i % 12) * 0.025 + Math.floor((i / count) * 3) * 0.45, // three volleys
        duration: 2.4 + Math.random() * 1.4,
        w: strip ? 5 : 8,
        h: strip ? 13 : 8,
        round: !strip && Math.random() > 0.5,
        color: palette[Math.floor(Math.random() * palette.length)],
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720),
      }
    })
  }, [color, intensity])

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ perspective: 600 }}>
      {pieces.map(p => (
        <div
          key={p.id}
          className="absolute"
          style={{
            bottom: '-2%',
            left: p.fromLeft ? '2%' : '98%',
            '--vx': `${p.vx}vw`,
            '--peak': `${p.peak}vh`,
            '--fall': `${p.fall}vh`,
            animation: `confettiArc ${p.duration}s linear ${p.delay}s both`,
          }}
        >
          <div
            style={{
              width: p.w,
              height: p.h,
              background: p.color,
              borderRadius: p.round ? '50%' : '1px',
              boxShadow: p.color === '#FFD700' ? '0 0 6px rgba(255,215,0,0.7)' : undefined,
              '--spin': `${p.spin}deg`,
              animation: `confettiFlutter ${p.duration}s linear ${p.delay}s both`,
            }}
          />
        </div>
      ))}
    </div>
  )
}

/**
 * WildEncounterModal - Full-screen Pokemon-style encounter
 * Pet at top, ball selector + drag-to-throw at bottom
 *
 * Phases: entrance -> encounter -> throwing -> impact -> shaking -> result -> done
 */
const WildEncounterModal = ({ pet, zoneId = null, onClose, onCatchComplete }) => {
  const { getBallsInInventory, fetchInventory } = useInventory()
  const { attemptCatch } = usePet()

  const [phase, setPhase] = useState('entrance')
  const [selectedBallIndex, setSelectedBallIndex] = useState(0)
  const [catchResult, setCatchResult] = useState(null)
  const [shakeCount, setShakeCount] = useState(0)
  const [nickname, setNickname] = useState('')
  const [screenShake, setScreenShake] = useState(false)
  const [flashOpacity, setFlashOpacity] = useState(0)
  const [attemptsLeft, setAttemptsLeft] = useState(2)

  // Drag state — use refs for smooth rAF dragging (no React re-renders)
  const [isDragging, setIsDragging] = useState(false)
  const [throwTrajectory, setThrowTrajectory] = useState(null)
  const ballRef = useRef(null)
  const trailRef = useRef(null)
  const petRef = useRef(null)
  const containerRef = useRef(null)
  const dragStartRef = useRef(null)
  const dragPosRef = useRef({ x: 0, y: 0 })
  const ballStartPosRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef(null)
  const totalShakesRef = useRef(null)

  const balls = getBallsInInventory()
  const rarity = pet?.rarity || 'common'
  const selectedBall = balls[selectedBallIndex]?.item
  const caught = catchResult?.caught
  const isDuplicate = catchResult?.duplicate

  // Pre-calculate total shakes once when result arrives
  if (catchResult && totalShakesRef.current === null) {
    totalShakesRef.current = caught ? 3 : Math.floor(Math.random() * 2) + 1
  }
  const totalShakes = totalShakesRef.current ?? 3
  // The throw in progress is the last one (attemptsLeft drops when the ball is thrown)
  const isLastThrow = attemptsLeft <= 0

  // Background: the art of the zone the pet was found in (darkened), else the default night field
  const zone = getZone(zoneId)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const zoneBg = zone ? (zone.mapImage || (isMobile ? zone.bgMobile : zone.bgDesktop)) : null

  // Random decoration is rolled once, so it doesn't jump around every time the phase changes
  const grassBlades = useMemo(() => Array.from({ length: 8 }, (_, i) => ({ left: i * 13 + Math.random() * 5 })), [])
  const ambientDots = useMemo(() => Array.from({ length: 15 }, (_, i) => ({
    w: 2 + Math.random() * 3, h: 2 + Math.random() * 3,
    left: Math.random() * 100, top: Math.random() * 70,
    dur: 4 + Math.random() * 4, delay: Math.random() * 5, green: i % 3 === 0,
  })), [])
  const stars = useMemo(() => Array.from({ length: 20 }, () => ({
    size: 1 + Math.random() * 2, dur: 1.5 + Math.random() * 2,
  })), [])
  const shards = useMemo(() => Array.from({ length: 6 }, () => ({
    x: (Math.random() - 0.5) * 120, y: (Math.random() - 0.5) * 120, r: Math.random() * 360,
  })), [])

  // Sound effects for the throw → hit → shakes build-up
  const sfxCache = useRef({})
  const playSfx = useCallback((path, volume = 0.5) => {
    try {
      const url = assetUrl(path)
      if (!sfxCache.current[url]) sfxCache.current[url] = new Audio(url)
      const a = sfxCache.current[url]
      a.volume = volume
      a.currentTime = 0
      a.play().catch(() => {})
    } catch { /* audio may fail */ }
  }, [])

  // Entrance phase — silhouette intro then encounter
  useEffect(() => {
    const timer = setTimeout(() => setPhase('encounter'), 1500)
    return () => clearTimeout(timer)
  }, [])

  const getPointerPos = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    return { x: e.clientX, y: e.clientY }
  }

  // Update ball DOM directly via rAF — no React re-renders during drag
  const updateBallTransform = useCallback(() => {
    const el = ballRef.current
    if (!el) return
    const { x, y } = dragPosRef.current
    el.style.transform = `translate(calc(-50% + ${x}px), ${y}px)`
    // Update trail
    const trail = trailRef.current
    if (trail) {
      if (y < -20) {
        trail.style.height = `${Math.min(Math.abs(y) * 0.5, 60)}px`
        trail.style.opacity = '1'
      } else {
        trail.style.opacity = '0'
      }
    }
  }, [])

  const handleDragStart = useCallback((e) => {
    if (phase !== 'encounter' || !selectedBall) return
    e.preventDefault()
    const pos = getPointerPos(e)
    const ballRect = ballRef.current?.getBoundingClientRect()
    if (ballRect) {
      ballStartPosRef.current = { x: ballRect.left + ballRect.width / 2, y: ballRect.top + ballRect.height / 2 }
    }
    dragStartRef.current = pos
    dragPosRef.current = { x: 0, y: 0 }
    // Remove snap-back transition during drag
    if (ballRef.current) ballRef.current.style.transition = 'none'
    setIsDragging(true)
  }, [phase, selectedBall])

  const handleDragMove = useCallback((e) => {
    if (!dragStartRef.current) return
    e.preventDefault()
    const pos = getPointerPos(e)
    dragPosRef.current = {
      x: pos.x - dragStartRef.current.x,
      y: pos.y - dragStartRef.current.y,
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(updateBallTransform)
  }, [updateBallTransform])

  const handleDragEnd = useCallback(async (e) => {
    if (!dragStartRef.current) return
    e.preventDefault()

    const dragPos = { ...dragPosRef.current }
    const throwDistance = -dragPos.y
    dragStartRef.current = null
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    if (throwDistance < 80) {
      // Snap back with smooth transition
      if (ballRef.current) {
        ballRef.current.style.transition = 'transform 0.3s ease-out'
        ballRef.current.style.transform = 'translate(-50%, 0px)'
      }
      dragPosRef.current = { x: 0, y: 0 }
      setIsDragging(false)
      return
    }

    const ballStart = ballStartPosRef.current
    const petRect = petRef.current?.getBoundingClientRect()
    const petCenter = petRect
      ? { x: petRect.left + petRect.width / 2, y: petRect.top + petRect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight * 0.25 }

    setThrowTrajectory({
      startX: ballStart.x + dragPos.x,
      startY: ballStart.y + dragPos.y,
      endX: petCenter.x,
      endY: petCenter.y,
    })

    dragPosRef.current = { x: 0, y: 0 }
    setIsDragging(false)
    setPhase('throwing')
    playSfx('/sound/woosh.mp3', 0.5)
    setAttemptsLeft(prev => prev - 1)

    const result = await attemptCatch(pet.id, selectedBall.id)
    await fetchInventory()
    setCatchResult(result)
  }, [pet, selectedBall, attemptCatch, fetchInventory, playSfx])

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e) => handleDragMove(e)
    const onEnd = (e) => handleDragEnd(e)
    window.addEventListener('mousemove', onMove, { passive: false })
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [isDragging, handleDragMove, handleDragEnd])

  // Throwing -> impact
  useEffect(() => {
    if (phase !== 'throwing') return
    const timer = setTimeout(() => {
      if (catchResult) {
        setPhase('impact')
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [phase, catchResult])

  useEffect(() => {
    if (phase === 'throwing' && catchResult) {
      const timer = setTimeout(() => setPhase('impact'), 200)
      return () => clearTimeout(timer)
    }
  }, [phase, catchResult])

  // Impact -> screen flash + shake -> shaking
  useEffect(() => {
    if (phase !== 'impact') return
    setScreenShake(true)
    setFlashOpacity(0.6)
    const t1 = setTimeout(() => setFlashOpacity(0), 200)
    const t2 = setTimeout(() => setScreenShake(false), 400)
    const t3 = setTimeout(() => setPhase('shaking'), 500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [phase])

  // Shaking phase — dramatic pauses between each shake
  useEffect(() => {
    if (phase !== 'shaking') return
    if (shakeCount >= totalShakes) {
      const timer = setTimeout(() => setPhase('result'), 600)
      return () => clearTimeout(timer)
    }
    // Increasing tension — each shake takes longer (much longer on the last throw), and each
    // click is louder than the one before
    const delay = isLastThrow ? 900 + shakeCount * 300 : 600 + shakeCount * 150
    const timer = setTimeout(() => {
      playSfx('/sound/pop2.mp3', Math.min(1, 0.4 + shakeCount * 0.2))
      setShakeCount(prev => prev + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [phase, shakeCount, totalShakes, isLastThrow, playSfx])

  // Result phase
  useEffect(() => {
    if (phase === 'result') {
      if (caught) {
        try { new Audio(assetUrl('/sound/pet-caught.mp3')).play() } catch {}
        setFlashOpacity(0.4)
        setTimeout(() => setFlashOpacity(0), 300)
      } else {
        try { new Audio(assetUrl('/sound/escape.mp3')).play() } catch {}
        setScreenShake(true)
        setTimeout(() => setScreenShake(false), 300)
      }
      const timer = setTimeout(() => setPhase('done'), 1000)
      return () => clearTimeout(timer)
    }
  }, [phase, caught])

  const handleCollect = () => {
    if (onCatchComplete) onCatchComplete(catchResult)
    onClose()
  }

  if (!pet) return null

  const isLegendary = rarity === 'legendary'
  const isEpic = rarity === 'epic'

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 select-none overflow-hidden"
      style={{
        touchAction: 'none',
        animation: screenShake ? 'screenShake 0.1s ease-in-out 3' : undefined,
      }}
    >
      {/* ---- Background ---- */}
      <div className={`absolute inset-0 ${zoneBg ? 'bg-black' : 'bg-gradient-to-b from-slate-950 via-emerald-950 to-black'}`}>
        {/* Zone art from the adventure, darkened so the silhouette and UI stand out */}
        {zoneBg && (
          <>
            <div className="absolute inset-0"
              style={{ backgroundImage: `url(${zoneBg})`, backgroundSize: 'cover', backgroundPosition: 'center bottom' }} />
            <div className="absolute inset-0 bg-black/55" />
          </>
        )}

        {/* Last throw: red edges */}
        {(attemptsLeft === 1 && phase === 'encounter') || (isLastThrow && ['throwing', 'impact', 'shaking'].includes(phase)) ? (
          <div className="absolute inset-0 pointer-events-none animate-pulse"
            style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(220,38,38,0.35) 100%)' }} />
        ) : null}

        {/* Animated grass blades */}
        <div className="absolute bottom-0 left-0 right-0 h-1/3">
          {grassBlades.map((g, i) => (
            <div
              key={i}
              className="absolute bottom-0 bg-gradient-to-t from-green-900/60 to-transparent rounded-t-full"
              style={{
                left: `${g.left}%`,
                width: '3px',
                height: `${40 + i * 8}px`,
                animation: `grassSway ${2 + i * 0.3}s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.2}s`,
                transformOrigin: 'bottom center',
              }}
            />
          ))}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-green-900/30 to-transparent" />
        </div>

        {/* Floating ambient particles */}
        <div className="absolute inset-0">
          {ambientDots.map((d, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: d.w,
                height: d.h,
                background: d.green ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.15)',
                left: `${d.left}%`,
                top: `${d.top}%`,
                animation: `floatUp ${d.dur}s ease-in-out infinite`,
                animationDelay: `${d.delay}s`,
              }}
            />
          ))}
        </div>

        {/* Stars (night field only; zone art brings its own sky) */}
        {!zoneBg && stars.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: s.size,
              height: s.size,
              background: 'rgba(255,255,255,0.4)',
              left: `${5 + (i * 4.7) % 90}%`,
              top: `${3 + (i * 11) % 30}%`,
              animation: `twinkle ${s.dur}s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}

        {/* Legendary/Epic atmosphere */}
        {isLegendary && (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-yellow-900/10 to-transparent animate-pulse" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-yellow-500/5 rounded-full blur-3xl animate-pulse" />
          </>
        )}
        {isEpic && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-purple-500/5 rounded-full blur-3xl animate-pulse" />
        )}
      </div>

      {/* ---- Screen Flash Overlay ---- */}
      <div
        className="absolute inset-0 bg-white pointer-events-none z-40 transition-opacity duration-200"
        style={{ opacity: flashOpacity }}
      />

      {/* ---- ENTRANCE PHASE: Silhouette only ---- */}
      {phase === 'entrance' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* "!" alert */}
          <div className="flex flex-col items-center animate-[entrancePulse_1s_ease-out] mb-6">
            <div className="text-4xl font-black tracking-wider animate-[slideDown_0.6s_ease-out]"
              style={{ color: raritySolidColor[rarity], textShadow: `0 0 30px ${rarityLightColor[rarity]}` }}>
              !
            </div>
            <p className="text-lg font-bold mt-2 animate-[fadeSlideUp_0.8s_ease-out_0.3s_both]" style={{ color: raritySolidColor[rarity] }}>
              A wild {rarity} pet appeared!
            </p>
          </div>

          {/* Silhouette, glowing in the rarity colour */}
          <div className="relative animate-[fadeSlideUp_0.6s_ease-out_0.6s_both]">
            <img
              src={pet?.image_url}
              alt="???"
              className="w-32 h-32 sm:w-40 sm:h-40 object-contain relative z-10"
              style={{ filter: `brightness(0) drop-shadow(0 0 18px ${raritySolidColor[rarity]})` }}
            />
          </div>

          <p className="mt-4 text-gray-500 text-sm tracking-widest animate-pulse">Who's that pet...?</p>
        </div>
      )}

      {/* ---- ENCOUNTER PHASE ---- */}
      {phase === 'encounter' && (
        <>
          {/* Pet silhouette - top area */}
          <div className="absolute top-[10%] left-0 right-0 flex flex-col items-center animate-[slideInFromRight_0.5s_ease-out]" ref={petRef}>
            <div className="relative">
              {/* Subtle mysterious glow */}
              <div
                className="absolute -inset-10 rounded-full blur-2xl animate-pulse opacity-60"
                style={{ background: `radial-gradient(circle, ${rarityLightColor[rarity]}, transparent 70%)` }}
              />
              {/* Silhouette */}
              <img
                src={pet.image_url}
                alt="???"
                className="w-28 h-28 sm:w-36 sm:h-36 object-contain relative z-10"
                style={{
                  animation: 'petBob 2s ease-in-out infinite',
                  filter: `brightness(0) drop-shadow(0 0 15px ${raritySolidColor[rarity]})`,
                }}
              />
            </div>

            {/* Mystery info: the pet stays a secret, its rarity doesn't */}
            <div className="mt-4 flex flex-col items-center">
              <h2 className="text-gray-300 text-2xl font-bold tracking-widest">???</h2>
              <span className={`mt-1.5 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${rarityBadge[rarity]}`}>
                {rarity}
              </span>
              {attemptsLeft === 1 && (
                <p className="mt-3 text-red-400 text-sm font-black uppercase tracking-widest animate-pulse"
                  style={{ textShadow: '0 0 12px rgba(239,68,68,0.7)' }}>
                  ⚠️ Last chance!
                </p>
              )}
            </div>
          </div>

          {/* Drag hint */}
          <div className="absolute bottom-[38%] left-0 right-0 flex justify-center pointer-events-none">
            {selectedBall && !isDragging && (
              <div className="flex flex-col items-center text-gray-400 animate-[floatHint_1.5s_ease-in-out_infinite]">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="drop-shadow-lg">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
                <span className="text-xs mt-1 font-medium tracking-wide">Swipe up to throw</span>
              </div>
            )}
          </div>

          {/* Draggable ball */}
          {selectedBall && (
            <div
              ref={ballRef}
              className="absolute bottom-[22%] left-1/2 z-30 cursor-grab active:cursor-grabbing will-change-transform"
              style={{
                transform: 'translate(-50%, 0px)',
                transition: isDragging ? 'none' : 'transform 0.3s ease-out',
              }}
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
            >
              <div className={`w-16 h-16 sm:w-20 sm:h-20 ${isDragging ? 'scale-90 opacity-80' : 'hover:scale-110'} transition-all`}>
                <BallImage ball={selectedBall} className="w-full h-full" />
                {/* Ball glow when idle */}
                {!isDragging && (
                  <div className="absolute -inset-2 rounded-full bg-white/5 blur-md animate-pulse" />
                )}
              </div>
              {/* Drag trail — updated via ref, no re-renders */}
              <div
                ref={trailRef}
                className="absolute left-1/2 top-full -translate-x-1/2 w-1 bg-gradient-to-b from-white/30 to-transparent rounded-full transition-opacity duration-100"
                style={{ height: 0, opacity: 0 }}
              />
              {/* Catch rate */}
              <div className="text-center mt-1">
                <span className={`text-xs font-bold ${
                  getCatchRate(selectedBall.rarity, rarity) >= 90 ? 'text-green-400' :
                  getCatchRate(selectedBall.rarity, rarity) >= 70 ? 'text-yellow-400' :
                  getCatchRate(selectedBall.rarity, rarity) >= 50 ? 'text-orange-400' : 'text-red-400'
                }`}>
                  {getCatchRate(selectedBall.rarity, rarity)}%
                </span>
              </div>
            </div>
          )}

          {/* Ball selector - bottom */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-md border-t border-white/10 p-4">
            {balls.length === 0 ? (
              <div className="text-center py-2">
                <p className="text-gray-500 text-sm">No balls! Buy some from the shop.</p>
              </div>
            ) : (
              <div className="flex justify-center gap-3">
                {balls.map((ballItem, index) => {
                  const isSelected = index === selectedBallIndex
                  const catchRate = getCatchRate(ballItem.item.rarity, rarity)
                  return (
                    <button
                      key={ballItem.item.id}
                      onClick={() => setSelectedBallIndex(index)}
                      className={`relative flex flex-col items-center p-2 rounded-xl transition-all duration-200 ${
                        isSelected
                          ? 'bg-white/15 ring-2 ring-white/40 scale-110 shadow-lg shadow-white/5'
                          : 'bg-white/5 hover:bg-white/10 hover:scale-105'
                      }`}
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12">
                        <BallImage ball={ballItem.item} className="w-full h-full" />
                      </div>
                      <span className="text-white text-[10px] font-medium mt-1 truncate max-w-[60px]">
                        {ballItem.item.name}
                      </span>
                      <span className="text-gray-400 text-[10px]">x{ballItem.quantity}</span>
                      <div className={`w-2 h-2 rounded-full mt-0.5 ${
                        catchRate >= 90 ? 'bg-green-400 shadow-sm shadow-green-400/50' :
                        catchRate >= 70 ? 'bg-yellow-400 shadow-sm shadow-yellow-400/50' :
                        catchRate >= 50 ? 'bg-orange-400 shadow-sm shadow-orange-400/50' : 'bg-red-400 shadow-sm shadow-red-400/50'
                      }`} />
                    </button>
                  )
                })}
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full mt-3 py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Run Away
            </button>
          </div>
        </>
      )}

      {/* ---- THROWING PHASE ---- */}
      {phase === 'throwing' && throwTrajectory && (
        <>
          <div className="absolute top-[12%] left-0 right-0 flex flex-col items-center">
            <div className="relative mt-8">
              <img
                src={pet.image_url}
                alt="???"
                className="w-28 h-28 sm:w-36 sm:h-36 object-contain"
                style={{
                  animation: 'petBob 2s ease-in-out infinite',
                  filter: `brightness(0) drop-shadow(0 0 15px ${raritySolidColor[rarity]})`,
                }}
              />
            </div>
          </div>

          {/* Flying ball: a smooth parabola. The outer layers move it in a straight line to the
              pet (x and y separately, constant speed); the inner layer adds the rise-and-fall arc
              and shrinks it into the distance. */}
          <div
            className="absolute z-40"
            style={{
              left: throwTrajectory.startX - 28,
              top: throwTrajectory.startY - 28,
              '--fly-x': `${throwTrajectory.endX - throwTrajectory.startX}px`,
              '--fly-y': `${throwTrajectory.endY - throwTrajectory.startY}px`,
              '--arc': `${-Math.min(170, 70 + Math.abs(throwTrajectory.endY - throwTrajectory.startY) * 0.25)}px`,
              animation: 'ballFlyX 0.55s linear forwards',
            }}
          >
            <div style={{ animation: 'ballFlyY 0.55s linear forwards' }}>
              <div style={{ animation: 'ballArc 0.55s forwards' }}>
                {/* Motion trail */}
                <div className="absolute inset-0 w-14 h-14 rounded-full bg-white/10 blur-md scale-150" />
                <div className="w-14 h-14 relative z-10">
                  <BallImage ball={selectedBall} className="w-full h-full animate-[spin_0.35s_linear_infinite]" />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ---- IMPACT PHASE ---- */}
      {phase === 'impact' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Particles count={12} color="#fff" burst spread={100} />
          <div className="w-20 h-20">
            <BallImage ball={selectedBall} className="w-full h-full animate-[impactBounce_0.4s_ease-out]" />
          </div>
        </div>
      )}

      {/* ---- SHAKING PHASE ---- */}
      {phase === 'shaking' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* Suspense vignette */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30 pointer-events-none" />

          <div
            className="w-20 h-20 sm:w-24 sm:h-24 relative"
            style={{
              animation: `ballShake 0.5s ease-in-out`,
              animationIterationCount: 1,
              transform: shakeCount % 2 === 0 ? 'rotate(-20deg)' : 'rotate(20deg)',
              transition: 'transform 0.15s ease-in-out',
            }}
          >
            <BallImage ball={selectedBall} className="w-full h-full" />
            {/* Impact sparks on each shake */}
            {shakeCount > 0 && (
              <div className="absolute -inset-4 pointer-events-none">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={`${shakeCount}-${i}`}
                    className="absolute w-1 h-1 bg-yellow-300 rounded-full"
                    style={{
                      left: '50%',
                      top: '50%',
                      animation: `sparkFly 0.3s ease-out forwards`,
                      '--spark-x': `${(Math.random() - 0.5) * 40}px`,
                      '--spark-y': `${(Math.random() - 0.5) * 40}px`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Shake progress dots with heartbeat */}
          <div className="flex gap-4 mt-10">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="relative"
              >
                <div
                  className={`w-4 h-4 rounded-full transition-all duration-500 ${
                    i < shakeCount
                      ? 'bg-yellow-400 scale-125'
                      : i === shakeCount && phase === 'shaking'
                        ? 'bg-gray-600 animate-[heartbeat_0.8s_ease-in-out_infinite]'
                        : 'bg-gray-700'
                  }`}
                />
                {/* Glow ring for filled dots */}
                {i < shakeCount && (
                  <div className="absolute -inset-1.5 rounded-full bg-yellow-400/30 animate-ping" style={{ animationDuration: '1.5s' }} />
                )}
              </div>
            ))}
          </div>

          {/* Tension text */}
          <p className={`text-xs mt-6 animate-pulse tracking-widest uppercase ${isLastThrow ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
            {shakeCount === 0 ? (isLastThrow ? 'Last ball...' : '...') : shakeCount === 1 ? 'Holding...' : shakeCount === 2 ? 'Almost...' : 'Come on...'}
          </p>
        </div>
      )}

      {/* ---- RESULT / DONE PHASE ---- */}
      {(phase === 'result' || phase === 'done') && catchResult && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
          {caught ? (
            <div className="flex flex-col items-center text-center">
              {/* Confetti */}
              <Confetti color={raritySolidColor[rarity]} intensity={isLegendary ? 1.6 : isEpic ? 1.3 : 1} />

              {/* Success burst */}
              <div className="relative">
                {/* Expanding ring */}
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 animate-[expandRing_1s_ease-out_forwards]"
                  style={{ borderColor: raritySolidColor[rarity] }}
                />
                {/* Light rays: open up behind the pet, then turn slowly */}
                <div className="absolute left-1/2 top-1/2 w-0 h-0 pointer-events-none">
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 560, height: 560, left: -280, top: -280,
                      background: `repeating-conic-gradient(from 0deg, ${raritySolidColor[rarity]}55 0deg 7deg, transparent 7deg 22deg)`,
                      WebkitMaskImage: 'radial-gradient(circle, black 12%, transparent 62%)',
                      maskImage: 'radial-gradient(circle, black 12%, transparent 62%)',
                      animation: 'raysOpen 0.9s ease-out both, slowSpin 16s linear infinite',
                    }}
                  />
                </div>

                {/* Gold sparkles twinkling in a ring around the pet */}
                <div className="absolute left-1/2 top-1/2 w-0 h-0 pointer-events-none z-20">
                  {[...Array(8)].map((_, i) => {
                    const a = (i / 8) * Math.PI * 2
                    const r = i % 2 === 0 ? 112 : 92
                    return (
                      <span
                        key={i}
                        className="absolute text-yellow-300"
                        style={{
                          left: Math.cos(a) * r - 7, top: Math.sin(a) * r - 10,
                          fontSize: i % 2 === 0 ? 18 : 12,
                          textShadow: '0 0 8px rgba(255,215,0,0.9)',
                          animation: `sparkleTwinkle 1.4s ease-in-out ${0.3 + i * 0.12}s infinite both`,
                        }}
                      >
                        ✦
                      </span>
                    )
                  })}
                </div>
                {/* Glow */}
                <div
                  className="absolute -inset-16 rounded-full blur-3xl animate-pulse"
                  style={{ background: `radial-gradient(circle, ${rarityLightColor[rarity]}, transparent 60%)` }}
                />
                {/* Particles */}
                <Particles count={36} color={raritySolidColor[rarity]} burst spread={140} />
                <Particles count={32} color="#FFD700" burst spread={220} />
                <GoldDust color={raritySolidColor[rarity]} count={isLegendary ? 40 : 28} />
                {/* Pet image */}
                <img
                  src={pet.image_url}
                  alt={pet.name}
                  className="w-36 h-36 sm:w-44 sm:h-44 object-contain relative z-10 animate-[catchReveal_0.8s_ease-out]"
                  style={{ filter: `drop-shadow(0 0 20px ${rarityLightColor[rarity]})` }}
                />
              </div>

              <span className={`mt-5 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${rarityBadge[rarity]} animate-[fadeSlideUp_0.5s_ease-out_0.3s_both]`}>
                {rarity}
              </span>

              <h2 className="text-white text-3xl font-black mt-3 animate-[fadeSlideUp_0.5s_ease-out_0.4s_both]" style={{ textShadow: `0 0 30px ${rarityLightColor[rarity]}` }}>
                {isDuplicate ? 'Already Owned!' : 'Gotcha!'}
              </h2>
              <p className={`text-xl font-bold bg-gradient-to-r ${rarityColors[rarity]} bg-clip-text text-transparent animate-[fadeSlideUp_0.5s_ease-out_0.5s_both]`}>
                {pet.name}
              </p>

              {isDuplicate && catchResult?.refund_xp > 0 && (
                <p className="text-yellow-400 mt-2 text-sm animate-[fadeSlideUp_0.5s_ease-out_0.6s_both]">
                  +{catchResult.refund_xp} XP refund
                </p>
              )}

              {phase === 'done' && !isDuplicate && (
                <input
                  type="text"
                  placeholder="Nickname (optional)"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={20}
                  className="mt-5 w-64 px-4 py-2.5 rounded-xl bg-white/10 text-white placeholder-white/30 border border-white/20 text-center focus:outline-none focus:border-white/40 animate-[fadeSlideUp_0.3s_ease-out]"
                />
              )}

              {phase === 'done' && (
                <button
                  onClick={handleCollect}
                  className={`mt-5 px-12 py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r ${rarityColors[rarity]} hover:scale-105 active:scale-95 transition-all shadow-xl text-lg animate-[fadeSlideUp_0.3s_ease-out] relative overflow-hidden group`}
                >
                  <span className="relative z-10">{isDuplicate ? 'OK' : 'Collect!'}</span>
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center text-center">
              {/* Escape effect — cracks then pet escapes */}
              <div className="relative">
                {/* Shattered ball pieces */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {shards.map((s, i) => (
                    <div
                      key={i}
                      className="absolute w-3 h-3 bg-red-400/60 rounded-sm"
                      style={{
                        animation: `shardFly 0.8s ease-out forwards`,
                        '--shard-x': `${s.x}px`,
                        '--shard-y': `${s.y}px`,
                        '--shard-r': `${s.r}deg`,
                      }}
                    />
                  ))}
                </div>
                {/* Last ball gone: the pet dashes straight off the right side of the screen */}
                <img
                  src={pet.image_url}
                  alt="???"
                  className={`w-32 h-32 object-contain ${isLastThrow
                    ? 'animate-[escapeRunOff_0.5s_ease-in_0.3s_both]'
                    : 'animate-[escapeJump_1.2s_ease-out_forwards]'}`}
                  style={{ filter: `brightness(0) drop-shadow(0 0 10px ${raritySolidColor[rarity]})` }}
                />
              </div>

              <h2 className="text-red-400 text-3xl font-black mt-6 animate-[headShake_0.5s_ease-in-out]">
                {isLastThrow ? 'It got away…' : 'Oh no!'}
              </h2>
              <p className="text-gray-300 text-lg mt-2">
                {isLastThrow ? 'The wild pet ran off into the wild.' : 'The mystery pet broke free!'}
              </p>
              <p className="text-gray-600 text-xs mt-2">Catch rate was {catchResult?.catch_rate}%</p>

              {phase === 'done' && attemptsLeft > 0 && (
                <div className="flex flex-col items-center">
                  <p className="text-amber-400 text-sm mt-3">{attemptsLeft} throw{attemptsLeft !== 1 ? 's' : ''} left!</p>
                  <button
                    onClick={() => {
                      setCatchResult(null)
                      setShakeCount(0)
                      totalShakesRef.current = null
                      setThrowTrajectory(null)
                      setPhase('encounter')
                    }}
                    className="mt-4 px-10 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 transition-all hover:scale-105 active:scale-95 text-lg"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {phase === 'done' && attemptsLeft <= 0 && (
                <button
                  onClick={onClose}
                  className="mt-8 px-10 py-3 rounded-xl font-bold text-white bg-gray-700 hover:bg-gray-600 transition-all hover:scale-105 active:scale-95 text-lg"
                >
                  Leave
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- ALL KEYFRAMES ---- */}
      <style>{`
        @keyframes petBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        /* Ball throw: straight-line travel (x and y on separate layers) + a parabolic arc on top.
           The arc uses quadratic ease-out up and ease-in down, which together trace a parabola. */
        @keyframes ballFlyX {
          from { transform: translateX(0); }
          to { transform: translateX(var(--fly-x)); }
        }
        @keyframes ballFlyY {
          from { transform: translateY(0); }
          to { transform: translateY(var(--fly-y)); }
        }
        @keyframes ballArc {
          0% { transform: translateY(0) scale(1); animation-timing-function: cubic-bezier(0.333, 0.667, 0.667, 1); }
          50% { transform: translateY(var(--arc)) scale(0.72); animation-timing-function: cubic-bezier(0.333, 0, 0.667, 0.333); }
          100% { transform: translateY(0) scale(0.45); }
        }
        @keyframes ballShake {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(-25deg) scale(1.05); }
          30% { transform: rotate(25deg) scale(1.05); }
          45% { transform: rotate(-18deg); }
          60% { transform: rotate(18deg); }
          75% { transform: rotate(-8deg); }
          90% { transform: rotate(8deg); }
        }
        @keyframes impactBounce {
          0% { transform: scale(0.3); opacity: 0; }
          40% { transform: scale(1.3); opacity: 1; }
          60% { transform: scale(0.9); }
          80% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        @keyframes catchReveal {
          0% { transform: scale(0) rotate(-15deg); opacity: 0; }
          40% { transform: scale(1.2) rotate(5deg); opacity: 1; }
          60% { transform: scale(0.9) rotate(-2deg); }
          80% { transform: scale(1.05); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes bounceIn {
          0% { transform: scale(0) rotate(-10deg); opacity: 0; }
          50% { transform: scale(1.15) rotate(3deg); opacity: 1; }
          70% { transform: scale(0.95); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes escapeJump {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          30% { opacity: 1; transform: translateY(-30px) scale(1.1); }
          60% { opacity: 0.6; transform: translateY(-60px) scale(0.8); }
          100% { opacity: 0; transform: translateY(-100px) scale(0.3); }
        }
        @keyframes escapeRunOff {
          0% { transform: translateX(0); }
          100% { transform: translateX(110vw); }
        }
        @keyframes expandRing {
          0% { width: 0; height: 0; opacity: 1; }
          100% { width: 300px; height: 300px; opacity: 0; }
        }
        @keyframes screenShake {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(-4px, 2px); }
          50% { transform: translate(4px, -2px); }
          75% { transform: translate(-2px, 4px); }
        }
        @keyframes particleBurst {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
        }
        @keyframes particleFloat {
          0% { transform: translate(0, 0); opacity: 0.6; }
          100% { transform: translate(var(--tx), var(--ty)); opacity: 0; }
        }
        @keyframes confettiArc {
          0% { transform: translate(0, 0); opacity: 0; animation-timing-function: cubic-bezier(0.12, 0.75, 0.3, 1); }
          4% { opacity: 1; }
          32% { transform: translate(calc(var(--vx) * 0.6), calc(var(--peak) * -1)); animation-timing-function: cubic-bezier(0.45, 0, 0.75, 0.6); }
          85% { opacity: 1; }
          100% { transform: translate(var(--vx), calc(var(--peak) * -1 + var(--fall))); opacity: 0; }
        }
        @keyframes confettiFlutter {
          0% { transform: rotateZ(0deg) rotateX(0deg) rotateY(0deg); }
          100% { transform: rotateZ(var(--spin)) rotateX(1080deg) rotateY(360deg); }
        }
        @keyframes dustRise {
          0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translate(var(--drift), var(--rise)) scale(1); opacity: 0; }
        }
        @keyframes raysOpen {
          0% { opacity: 0; transform: scale(0.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes sparkleTwinkle {
          0%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.15) rotate(90deg); }
        }
        @keyframes sparkFly {
          0% { transform: translate(0, 0); opacity: 1; }
          100% { transform: translate(var(--spark-x), var(--spark-y)); opacity: 0; }
        }
        @keyframes shardFly {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--shard-x), var(--shard-y)) rotate(var(--shard-r)); opacity: 0; }
        }
        @keyframes heartbeat {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.3); }
        }
        @keyframes slideDown {
          0% { transform: translateY(-30px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeSlideUp {
          0% { transform: translateY(15px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideInFromRight {
          0% { transform: translateX(100px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes entrancePulse {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes revealGlow {
          0% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 0.7; transform: scale(1); }
        }
        @keyframes floatHint {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes grassSway {
          0% { transform: rotate(-5deg); }
          100% { transform: rotate(5deg); }
        }
        @keyframes floatUp {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          20% { opacity: 0.6; }
          80% { opacity: 0.3; }
          100% { transform: translateY(-60px) translateX(10px); opacity: 0; }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.5); }
        }
        @keyframes slowSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes auraRotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes headShake {
          0% { transform: translateX(0); }
          15% { transform: translateX(-8px) rotateY(-10deg); }
          30% { transform: translateX(6px) rotateY(8deg); }
          45% { transform: translateX(-4px) rotateY(-5deg); }
          60% { transform: translateX(2px) rotateY(2deg); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>,
    document.body
  )
}

export default WildEncounterModal
