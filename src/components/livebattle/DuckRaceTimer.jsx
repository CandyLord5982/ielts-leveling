import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { assetUrl } from '../../hooks/useBranding'
import { X, Play, RotateCcw } from 'lucide-react'

const LANE_COLORS = ['#facc15', '#fb923c', '#4ade80', '#60a5fa', '#c084fc', '#f87171', '#f472b6', '#34d399', '#a78bfa', '#fbbf24']
const PRESET_TIMES = [10, 15, 20, 30, 45, 60, 90, 120]
const FINISH_LINE = 88 // % from left

const DuckRaceTimer = ({ onClose, participants = [] }) => {
  const allRacers = useMemo(() => {
    return participants
      .map((p, i) => ({
        id: p.id || i,
        name: p.pet_name || p.student_name || `Racer ${i + 1}`,
        ownerName: p.student_name || '',
        image: p.pet_image || null,
        color: LANE_COLORS[i % LANE_COLORS.length],
      }))
  }, [participants])

  const [phase, setPhase] = useState('setup')
  const [duration, setDuration] = useState(30)
  const [customTime, setCustomTime] = useState('')
  const [selectedRacers, setSelectedRacers] = useState([])
  const [positions, setPositions] = useState([])
  const [winner, setWinner] = useState(null)
  const [raceProgress, setRaceProgress] = useState(0)
  const [speeds, setSpeeds] = useState([])
  const [showResults, setShowResults] = useState(false)

  const animFrameRef = useRef(null)
  const musicRef = useRef(null)

  const racerDataRef = useRef([])
  const gameOverRef = useRef(false)
  const durationRef = useRef(duration)

  useEffect(() => {
    if (allRacers.length > 0 && selectedRacers.length === 0) {
      setSelectedRacers(allRacers.slice(0, Math.min(6, allRacers.length)).map(r => r.id))
    }
  }, [allRacers])

  const racers = useMemo(() => allRacers.filter(r => selectedRacers.includes(r.id)), [allRacers, selectedRacers])

  const toggleRacer = (id) => {
    setSelectedRacers(prev => {
      if (prev.includes(id)) return prev.length <= 2 ? prev : prev.filter(r => r !== id)
      return [...prev, id]
    })
  }

  const startRace = useCallback(() => {
    const time = customTime ? parseInt(customTime) : duration
    if (!time || time < 1 || racers.length < 2) return
    durationRef.current = time

    gameOverRef.current = false
    setWinner(null)

    // Determine random finishing order ahead of time
    const indices = racers.map((_, i) => i)
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]]
    }

    // Generate unique speed profiles for each racer — random "fast" and "slow" segments
    // that create dramatic overtaking throughout the race
    const NUM_SEGMENTS = 6 + Math.floor(Math.random() * 4)

    racerDataRef.current = racers.map((_, i) => {
      const rank = indices.indexOf(i)

      // Create random speed multipliers for each segment of the race
      // Each racer has genuinely different fast/slow periods
      const segments = []
      for (let s = 0; s < NUM_SEGMENTS; s++) {
        segments.push(0.4 + Math.random() * 1.2) // speed multiplier 0.4x to 1.6x
      }
      // Normalize so total distance is consistent (everyone covers the same ground overall)
      const avg = segments.reduce((a, b) => a + b, 0) / segments.length
      const normalized = segments.map(s => s / avg)

      return {
        rank,
        segments: normalized,
        numSegments: NUM_SEGMENTS,
        // Wobble for visual jitter
        wobbleFreq: 2 + Math.random() * 3,
        wobbleAmp: 2 + Math.random() * 3,
        wobblePhase: Math.random() * Math.PI * 2,
        // Additional surge for mid-race drama
        surgePhase: Math.random() * Math.PI * 2,
        surgeFreq: 0.5 + Math.random() * 0.8,
        surgeAmp: 8 + Math.random() * 7,
      }
    })

    setPositions(Array(racers.length).fill(0))
    setPhase('racing')
  }, [duration, customTime, racers])

  // Music: play on race start, fade out on finish
  const fadeRef = useRef(null)
  const fadeTimeoutRef = useRef(null)

  const killMusic = useCallback(() => {
    if (fadeRef.current) { clearInterval(fadeRef.current); fadeRef.current = null }
    if (fadeTimeoutRef.current) { clearTimeout(fadeTimeoutRef.current); fadeTimeoutRef.current = null }
    if (musicRef.current) {
      musicRef.current.pause()
      musicRef.current.currentTime = 0
      musicRef.current = null
    }
  }, [])

  useEffect(() => {
    if (phase === 'racing') {
      killMusic()
      const audio = new Audio(assetUrl('/class-battle/race-bgmusic.mp3'))
      audio.loop = true
      audio.volume = 0.5
      audio.play().catch(() => {})
      musicRef.current = audio
    } else if (phase === 'finished') {
      if (musicRef.current) {
        const audio = musicRef.current
        fadeTimeoutRef.current = setTimeout(() => {
          let vol = audio.volume
          fadeRef.current = setInterval(() => {
            vol -= 0.05
            if (vol <= 0) {
              clearInterval(fadeRef.current)
              fadeRef.current = null
              audio.pause()
              audio.currentTime = 0
              if (musicRef.current === audio) musicRef.current = null
            } else {
              audio.volume = vol
            }
          }, 100)
        }, 5000)
      }
      const applause = new Audio(assetUrl('/class-battle/Applause.mp3'))
      applause.volume = 0.6
      applause.play().catch(() => {})
    }
  }, [phase, killMusic])

  // Clean up music on unmount
  useEffect(() => {
    return () => killMusic()
  }, [killMusic])

  useEffect(() => {
    if (phase !== 'racing') return

    const totalDuration = durationRef.current * 1000
    const startTs = performance.now()

    const loop = () => {
      if (gameOverRef.current) return
      const now = performance.now()
      const elapsed = now - startTs
      const progress = Math.min(elapsed / totalDuration, 1)
      const time = elapsed / 1000

      // First pass: compute raw positions with full surge/wobble energy
      const rawPositions = racerDataRef.current.map(r => {
        const segDuration = 1 / r.numSegments
        let distance = 0
        for (let s = 0; s < r.numSegments; s++) {
          const segStart = s * segDuration
          const segEnd = (s + 1) * segDuration
          if (progress <= segStart) break
          const segProgress = Math.min(progress, segEnd) - segStart
          distance += segProgress * r.segments[s]
        }

        const base = distance * FINISH_LINE

        // Sprint push — everyone accelerates together
        const sprint = progress > 0.75 ? Math.pow((progress - 0.75) * 4, 2) * 5 : 0

        // Surge + wobble at full strength throughout
        const surgeFade = Math.min(progress * 3, 1)
        const surge = Math.sin(time * r.surgeFreq + r.surgePhase) * r.surgeAmp * surgeFade
        const wobble = Math.sin(time * r.wobbleFreq + r.wobblePhase) * r.wobbleAmp * 0.3

        return Math.max(1, Math.min(base + surge + wobble + sprint, FINISH_LINE))
      })

      // Second pass: enforce rank order in the final stretch by swapping positions
      // No dampening — pets keep full energy, just reassigned to correct ranking
      let newPositions = [...rawPositions]
      const blendStart = 0.8
      if (progress > blendStart) {
        const blend = (progress - blendStart) / (1 - blendStart)
        const easeBlend = blend * blend * blend * blend // quartic

        // Sort positions descending — highest position = 1st place
        const sorted = [...rawPositions].sort((a, b) => b - a)

        newPositions = racerDataRef.current.map((r, i) => {
          const rankPos = sorted[r.rank]
          return rawPositions[i] * (1 - easeBlend) + rankPos * easeBlend
        })
      }

      // Winner gets a huge solo boost AFTER everything — clear breakaway, NOT capped
      if (progress > 0.7) {
        const winIdx = racerDataRef.current.findIndex(r => r.rank === 0)
        if (winIdx !== -1) {
          newPositions[winIdx] += Math.pow((progress - 0.7) * 3.33, 2) * 30
        }
      }

      // Compute per-racer speed — boost in the final stretch (sprint to finish)
      const newSpeeds = racerDataRef.current.map(r => {
        const segIdx = Math.min(Math.floor(progress * r.numSegments), r.numSegments - 1)
        const baseSpeed = r.segments[segIdx]
        const sprintBoost = progress > 0.85 ? 1 + (progress - 0.85) * 4 : 1 // ramps up to 1.6x
        return baseSpeed * sprintBoost
      })

      // Check if any pet has crossed the finish line
      let raceEnded = false
      let winnerIdx = -1

      if (progress >= 0.65) {
        const FINISH_LEFT = 78
        const t = Math.min((progress - 0.65) / 0.35, 1)
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        const finishLineLeft = 110 - eased * (110 - FINISH_LEFT)

        const PET_WIDTH_PCT = 3
        const crossedIdx = newPositions.findIndex(pos => {
          const displayLeft = 5 + pos * 0.85
          return (displayLeft + PET_WIDTH_PCT) >= finishLineLeft
        })

        if (crossedIdx !== -1) {
          raceEnded = true
          winnerIdx = crossedIdx
        }
      }

      if (!raceEnded && elapsed >= totalDuration) {
        raceEnded = true
        winnerIdx = racerDataRef.current.findIndex(r => r.rank === 0)
      }

      // Set all state in one batch — positions, speeds, progress, and if ended, winner + phase
      setPositions(newPositions)
      setSpeeds(newSpeeds)
      setRaceProgress(progress)

      if (raceEnded) {
        gameOverRef.current = true
        setWinner(winnerIdx)
        setPhase('finished')
        return
      }

      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(animFrameRef.current) }
  }, [phase])

  const resetRace = () => {
    gameOverRef.current = true
    cancelAnimationFrame(animFrameRef.current)
    setPhase('setup')
    setWinner(null)
    setPositions([])
    setSpeeds([])
    setRaceProgress(0)
    setShowResults(false)
  }

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${s}s`
  }

  const isRunning = phase === 'racing'

  return createPortal(
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black/70 flex items-center justify-center">
      <style>{`
        @keyframes petRun {
          0%, 100% { transform: translateY(-3px) rotate(-3deg); }
          25% { transform: translateY(2px) rotate(2deg); }
          50% { transform: translateY(-2px) rotate(3deg); }
          75% { transform: translateY(3px) rotate(-2deg); }
        }
        @keyframes petSprint {
          0%, 100% { transform: translateY(-1px) rotate(2deg); }
          50% { transform: translateY(1px) rotate(2deg); }
        }
        @keyframes winnerBounce {
          0%, 100% { transform: scale(1) translateY(0); }
          30% { transform: scale(1.3) translateY(-15px); }
          60% { transform: scale(1.1) translateY(-5px); }
        }
        @keyframes crownFloat {
          0%, 100% { transform: translateY(0) rotate(-5deg); }
          50% { transform: translateY(-8px) rotate(5deg); }
        }
        @keyframes splashIn {
          0% { opacity: 0; transform: scale(0.3) translateY(40px); }
          60% { transform: scale(1.1) translateY(-5px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes confettiFall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes countdownPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes timerGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(255,255,255,0.2); }
          50% { box-shadow: 0 0 25px rgba(255,255,255,0.5); }
        }
        @keyframes cloudDrift {
          0% { transform: translateX(110vw); }
          100% { transform: translateX(-200px); }
        }
        @keyframes petPreviewBob {
          0%, 100% { transform: translateY(-4px); }
          50% { transform: translateY(4px); }
        }
        @keyframes idleBob {
          0%, 100% { transform: translateY(-2px); }
          50% { transform: translateY(2px); }
        }
        @keyframes scrollGround {
          0% { background-position-x: 0; }
          100% { background-position-x: -60px; }
        }
      `}</style>

      <div className="relative w-full max-w-[95vw] h-full max-h-[100dvh] overflow-hidden rounded-none sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl flex flex-col">

        {/* Sky */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, #0ea5e9 0%, #38bdf8 30%, #7dd3fc 60%, #bae6fd 85%, #67e8f9 100%)'
        }} />

        {[0, 1, 2].map(i => (
          <div key={i} className="absolute pointer-events-none opacity-30"
            style={{ top: `${8 + i * 12}%`, fontSize: `${40 + i * 15}px`, animation: `cloudDrift ${18 + i * 7}s linear ${i * 5}s infinite` }}>
            ☁️
          </div>
        ))}

        <div className="absolute top-4 right-8 pointer-events-none">
          <div className="text-5xl" style={{ filter: 'drop-shadow(0 0 20px rgba(250,204,21,0.6))' }}>☀️</div>
        </div>

        <button onClick={() => { gameOverRef.current = true; cancelAnimationFrame(animFrameRef.current); onClose() }}
          className="absolute top-3 left-3 z-50 bg-white/80 backdrop-blur rounded-full p-2 shadow-lg hover:bg-white transition-colors">
          <X className="w-5 h-5 text-gray-700" />
        </button>

        <div className="relative z-10 text-center pt-12 pb-2">
          <h2 className="text-3xl font-black text-white drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
            🏁 Pet Race Timer 🏁
          </h2>
        </div>

        {/* SETUP */}
        {phase === 'setup' && (
          <div className="relative z-10 flex-1 flex flex-col items-center gap-4 px-6 overflow-y-auto pb-6" style={{ animation: 'splashIn 0.4s ease-out' }}>
            {allRacers.length > 0 && (
              <div className="bg-white/20 backdrop-blur rounded-2xl px-4 py-3 w-full max-w-[500px]">
                <div className="text-white/80 text-sm font-bold mb-2 text-center">Pick Racers (min 2)</div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {allRacers.map((racer, i) => {
                    const selected = selectedRacers.includes(racer.id)
                    return (
                      <button key={racer.id} onClick={() => toggleRacer(racer.id)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${selected ? 'bg-yellow-400/80 shadow-lg scale-105' : 'bg-white/10 opacity-50 hover:opacity-80'}`}
                        style={{ minWidth: 64 }}>
                        <div style={{ animation: selected ? 'petPreviewBob 1.5s ease-in-out infinite' : 'none', animationDelay: `${i * 0.15}s` }}>
                          {racer.image
                            ? <img src={racer.image} alt={racer.name} className="w-10 h-10 object-contain" onError={e => { e.target.style.display = 'none' }} />
                            : <span className="text-3xl">🐾</span>}
                        </div>
                        <span className={`text-[9px] font-bold truncate max-w-[56px] ${selected ? 'text-yellow-900' : 'text-white/70'}`}>{racer.name}</span>
                        <span className={`text-[8px] truncate max-w-[56px] ${selected ? 'text-yellow-800' : 'text-white/50'}`}>{racer.ownerName}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {allRacers.length === 0 && (
              <div className="bg-white/20 backdrop-blur rounded-2xl px-5 py-4 w-full max-w-[400px] text-center">
                <div className="text-white/80 text-sm">No participants found.</div>
                <div className="text-white/50 text-xs mt-1">Students need to join the session first.</div>
              </div>
            )}

            <div className="bg-white/20 backdrop-blur rounded-2xl px-5 py-3 w-full max-w-[400px]">
              <div className="text-white/80 text-sm font-bold mb-2 text-center">Timer Duration</div>
              <div className="grid grid-cols-4 gap-2">
                {PRESET_TIMES.map(t => (
                  <button key={t} onClick={() => { setDuration(t); setCustomTime('') }}
                    className={`px-3 py-2 rounded-xl font-bold text-sm transition-all ${duration === t && !customTime ? 'bg-yellow-400 text-yellow-900 scale-105 shadow-lg' : 'bg-white/20 text-white hover:bg-white/30'}`}>
                    {formatTime(t)}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2 justify-center">
                <span className="text-white/60 text-xs">Custom:</span>
                <input type="number" placeholder="seconds" value={customTime} onChange={e => setCustomTime(e.target.value)}
                  className="w-24 bg-white/20 text-white text-center rounded-lg px-2 py-1.5 text-sm placeholder-white/40 border border-white/20 focus:outline-none focus:border-yellow-400" />
              </div>
            </div>

            <button onClick={startRace} disabled={racers.length < 2}
              className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-black text-lg shadow-lg transition-all ${racers.length < 2 ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-green-500 hover:bg-green-400 text-white hover:shadow-xl hover:scale-105 active:scale-95'}`}>
              <Play className="w-6 h-6" />
              Start Race!
            </button>
          </div>
        )}

        {/* RACING / FINISHED */}
        {(phase === 'racing' || phase === 'finished') && (
          <div className="relative z-10 flex-1 flex flex-col">

            {/* Spacer where timer used to be */}
            <div className="py-2" />

            {/* Race track — scrolling camera follows the pack */}
            <div className="flex-1 relative overflow-hidden" style={{
              background: '#3f6212',
              boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.3)',
            }}>

              {/* Scrolling ground dashes — creates sense of speed */}
              <div className="absolute inset-0 pointer-events-none z-0" style={{
                background: 'repeating-linear-gradient(90deg, transparent 0px, transparent 28px, rgba(255,255,255,0.06) 28px, rgba(255,255,255,0.06) 30px)',
                animation: isRunning ? 'scrollGround 0.5s linear infinite' : 'none',
              }} />

              {/* Distance markers scrolling past */}
              {isRunning && [0, 1, 2, 3].map(m => {
                const offset = ((raceProgress * 400 + m * 100) % 400) / 4
                return (
                  <div key={m} className="absolute top-0 bottom-0 w-px pointer-events-none z-0"
                    style={{ left: `${100 - offset}%`, background: 'rgba(255,255,255,0.08)' }} />
                )
              })}

              {/* Scrolling scenery — grass, flowers, rocks fly past */}
              {[
                { emoji: '🌿', y: 10, speed: 3, offset: 0 },
                { emoji: '🪨', y: 35, speed: 2.5, offset: 25 },
                { emoji: '🌱', y: 58, speed: 3.5, offset: 50 },
                { emoji: '🍃', y: 82, speed: 2.8, offset: 75 },
                { emoji: '🌼', y: 22, speed: 3.2, offset: 15 },
                { emoji: '🪨', y: 72, speed: 2.6, offset: 60 },
                { emoji: '🌿', y: 48, speed: 3, offset: 40 },
                { emoji: '🌱', y: 90, speed: 2.7, offset: 85 },
                { emoji: '🍃', y: 5, speed: 3.3, offset: 35 },
                { emoji: '🌼', y: 65, speed: 2.9, offset: 90 },
                { emoji: '🪨', y: 18, speed: 2.4, offset: 55 },
                { emoji: '🌿', y: 78, speed: 3.1, offset: 10 },
              ].map((item, idx) => {
                // Each item scrolls right-to-left, wrapping around
                const totalTravel = item.offset + raceProgress * item.speed * 150
                const x = totalTravel % 140 // wraps every 140%
                return (
                  <div key={`scenery-${idx}`} className="absolute pointer-events-none z-[1]"
                    style={{
                      left: `${120 - x}%`,
                      top: `${item.y}%`,
                      fontSize: '14px',
                      opacity: 0.35,
                      transform: 'translateY(-50%)',
                    }}>
                    {item.emoji}
                  </div>
                )
              })}

              {/* Finish line — scrolls in from right, pets cross through it */}
              {(() => {
                // Finish line scrolls from off-screen right (110%) to left (48%)
                // Appears at progress 0.65, arrives at final position at progress 1.0
                const FINISH_LEFT = 78
                if (raceProgress < 0.65 && phase !== 'finished') return null
                const t = Math.min((raceProgress - 0.65) / 0.35, 1)
                const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
                const leftPct = 110 - eased * (110 - FINISH_LEFT) // 110% → 48%
                return (
                  <>
                    <div className="absolute top-0 bottom-0 z-[2] pointer-events-none" style={{
                      left: `${leftPct}%`,
                      width: '6px',
                      background: 'repeating-linear-gradient(180deg, #fff 0px, #fff 8px, #222 8px, #222 16px)',
                      opacity: 0.85,
                      boxShadow: '0 0 12px rgba(255,255,255,0.3)',
                    }} />
                    <div className="absolute z-[2] pointer-events-none" style={{ left: `${leftPct + 1}%`, top: 2 }}>
                      <span className="text-lg">🏁</span>
                    </div>
                    <div className="absolute z-[2] pointer-events-none" style={{ left: `${leftPct + 1}%`, bottom: 2 }}>
                      <span className="text-lg">🏁</span>
                    </div>
                  </>
                )
              })()}

              {/* Lanes */}
              {racers.map((racer, i) => {
                const laneHeight = 100 / racers.length
                const pos = positions[i] || 0
                const isWinner = winner === i
                const speed = speeds[i] || 1
                const isSprinting = speed > 1.2
                const isSlow = speed < 0.6
                // Compress positions into a narrower band — camera follows the pack
                const displayLeft = 5 + pos * 0.85

                return (
                  <div key={racer.id} className="absolute left-0 right-0" style={{
                    top: `${(i / racers.length) * 100}%`,
                    height: `${laneHeight}%`,
                    background: i % 2 === 0
                      ? 'linear-gradient(180deg, #4d7c0f 0%, #3f6212 100%)'
                      : 'linear-gradient(180deg, #365314 0%, #2d4a0e 100%)',
                  }}>
                    {/* Lane separator */}
                    {i > 0 && (
                      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
                    )}

                    {/* Lane number */}
                    <div className="absolute left-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black z-10"
                      style={{ background: racer.color, color: '#fff', textShadow: '0 1px 1px rgba(0,0,0,0.3)' }}>
                      {i + 1}
                    </div>

                    {/* Pet */}
                    <div className="absolute top-1/2" style={{
                      left: `${displayLeft}%`,
                      transform: 'translateY(-50%)',
                      zIndex: isWinner ? 20 : 10,
                    }}>
                      {/* Dust — bigger when sprinting */}
                      {isRunning && (
                        <div className="absolute right-full top-1/2 -translate-y-1/2 flex items-center pr-1 gap-0.5"
                          style={{ opacity: isSprinting ? 0.6 : isSlow ? 0.1 : 0.3 }}>
                          <span className={isSprinting ? 'text-sm' : 'text-xs'}>💨</span>
                          <span className="text-[8px]">💨</span>
                          {isSprinting && <span className="text-[10px]">💨</span>}
                        </div>
                      )}

                      {/* Crown */}
                      {isWinner && phase === 'finished' && (
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xl"
                          style={{ animation: 'crownFloat 1s ease-in-out infinite' }}>
                          👑
                        </div>
                      )}

                      {/* Pet image — animation speed reacts to current racer speed */}
                      <div style={{
                        animation: isRunning
                          ? (raceProgress > 0.75
                            ? 'petSprint 0.3s ease-in-out infinite'
                            : `petRun ${Math.max(0.25, 0.6 / Math.min(speed || 1, 1.8))}s ease-in-out infinite`)
                          : isWinner
                            ? 'winnerBounce 0.8s ease-in-out infinite'
                            : 'idleBob 2s ease-in-out infinite',
                        animationDelay: `${i * 0.08}s`,
                        filter: isWinner && phase === 'finished' ? 'drop-shadow(0 0 10px rgba(250,204,21,0.8))' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))',
                      }}>
                        {racer.image
                          ? <img src={racer.image} alt={racer.name}
                              className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
                              onError={e => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = '') }} />
                          : null}
                        <span className={`text-2xl ${racer.image ? 'hidden' : ''}`}>🐾</span>
                      </div>

                      {/* Name */}
                      <div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                          isWinner && phase === 'finished' ? 'bg-yellow-400 text-yellow-900' : 'bg-black/30 text-white/80'
                        }`}>
                          {racer.ownerName || racer.name}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Confetti */}
              {phase === 'finished' && Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="absolute pointer-events-none" style={{
                  left: `${Math.random() * 100}%`, top: 0,
                  fontSize: `${12 + Math.random() * 16}px`,
                  animation: `confettiFall ${2 + Math.random() * 3}s linear ${Math.random()}s forwards`,
                }}>
                  {['🎉', '🎊', '⭐', '✨', '🌟', '🏆'][Math.floor(Math.random() * 6)]}
                </div>
              ))}
            </div>

            {/* Winner banner + buttons — overlaid so they don't push the track */}
            {phase === 'finished' && winner !== null && racers[winner] && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-end pb-6 pointer-events-none">
                <div className="pointer-events-auto text-center mb-3" style={{ animation: 'splashIn 0.5s ease-out' }}>
                  <div className="inline-flex items-center gap-3 bg-yellow-400/90 backdrop-blur rounded-2xl px-5 py-3 shadow-xl">
                    {racers[winner].image
                      ? <img src={racers[winner].image} alt={racers[winner].name} className="w-12 h-12 object-contain" />
                      : <span className="text-4xl">🐾</span>}
                    <div>
                      <div className="text-yellow-900 font-black text-lg">🏆 {racers[winner].ownerName || racers[winner].name} Wins!</div>
                      <div className="text-yellow-800 text-xs font-bold">{racers[winner].name} finishes first!</div>
                    </div>
                    <span className="text-3xl">🏆</span>
                  </div>
                </div>
                <div className="pointer-events-auto flex items-center gap-3">
                  <button onClick={() => setShowResults(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/30 hover:bg-white/40 text-white rounded-xl font-bold text-sm transition-all">
                    🏅 Results
                  </button>
                  <button onClick={resetRace}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl font-bold text-sm transition-all">
                    <RotateCcw className="w-4 h-4" /> New Race
                  </button>
                  <button onClick={() => {
                    gameOverRef.current = true; cancelAnimationFrame(animFrameRef.current)
                    setPositions([]); setWinner(null); setShowResults(false)
                    setTimeout(() => startRace(), 50)
                  }} className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-400 text-white rounded-xl font-bold text-sm transition-all">
                    <Play className="w-4 h-4" /> Race Again!
                  </button>
                </div>
              </div>
            )}

            {/* Results leaderboard */}
            {showResults && phase === 'finished' && positions.length > 0 && (() => {
              const ranked = racers.map((r, i) => ({ ...r, idx: i, pos: positions[i] || 0 }))
                .sort((a, b) => b.pos - a.pos)
              const medals = ['🥇', '🥈', '🥉']
              return (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                  onClick={() => setShowResults(false)}>
                  <div className="bg-white/95 rounded-2xl px-6 py-5 shadow-2xl min-w-[250px]"
                    onClick={e => e.stopPropagation()}
                    style={{ animation: 'splashIn 0.4s ease-out' }}>
                    <div className="text-center font-black text-lg text-gray-800 mb-3">🏁 Race Results</div>
                    {ranked.map((r, rank) => (
                      <div key={r.id} className={`flex items-center gap-3 py-2 px-3 rounded-xl mb-1 ${
                        rank === 0 ? 'bg-yellow-100' : rank === 1 ? 'bg-gray-100' : rank === 2 ? 'bg-orange-50' : ''
                      }`}>
                        <span className="text-lg w-6 text-center">{medals[rank] || `${rank + 1}.`}</span>
                        {r.image
                          ? <img src={r.image} alt="" className="w-8 h-8 object-contain" />
                          : <span className="text-2xl">🐾</span>}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-gray-800 truncate">{r.ownerName || r.name}</div>
                          <div className="text-[10px] text-gray-500">{r.name}</div>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setShowResults(false)}
                      className="mt-3 w-full py-2 bg-gray-200 hover:bg-gray-300 rounded-xl text-sm font-bold text-gray-700 transition-colors">
                      Close
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default DuckRaceTimer
