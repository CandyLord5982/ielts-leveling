import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Star, Volume2, VolumeX, Heart } from 'lucide-react'

import { assetUrl } from '../../../hooks/useBranding'

const GAME_DURATION = 76
const FISH_PER_ROUND = 4
const PET_MAX_HP = 5
const STAR_THRESHOLDS = {
  1: [10, 12, 15],
  2: [13, 15, 18],
  3: [15, 18, 21],
  4: [18, 21, 24],
}
const BASE_FISH_SPEED = 0.7
const SPEED_BY_LEVEL = { 1: 1, 2: 1.15, 3: 1.3, 4: 1.5 }

// ── Difficulty waves ──────────────────────────────────────────────────────
// The run ramps with rounds spawned rather than with the clock, so a player
// who is clearing rounds quickly is the one who gets the harder game. These
// stack on top of the per-account SPEED_BY_LEVEL multiplier.
const ROUNDS_PER_WAVE = 4
const MAX_WAVE = 6
const EXTRA_FISH_FROM_WAVE = 3 // a fifth fish joins the shoal here
const waveForRound = (r) => Math.min(MAX_WAVE, 1 + Math.floor((r - 1) / ROUNDS_PER_WAVE))
// Fish swim faster…
const speedMulForWave = (w) => 1 + (w - 1) * 0.13
// …the water gets choppier, so they are harder to tap accurately…
const wobbleForWave = (w) => 6 + (w - 1) * 1.6
// …and help gets rarer.
const powerupChanceForWave = (w) => Math.max(0.06, POWERUP_CHANCE - (w - 1) * 0.018)
const FISH_EMOJIS = ['🐟', '🐠', '🐡', '🦈', '🐙', '🦀', '🦞', '🦐', '🐳', '🐋']
const FISH_BASE_POINTS = {
  '🐟': 10, '🐠': 10, '🐡': 10, 
  '🦀': 11, '🦞': 11, '🦐': 11,'🐙': 10,
  '🐬': 12, '🦈': 12, '🐳': 12, '🐋': 12,
}

const POWERUPS = [
  { type: 'slow', img: assetUrl('/pet-game/fish/freeze.png'), label: 'Slow', duration: 0 },
  { type: 'double', img: assetUrl('/pet-game/fish/double-fish.png'), label: '2x', duration: 8000 },
  { type: 'heal', img: assetUrl('/pet-game/fish/heart.png'), label: '+1 HP', duration: 0 },
]
const POWERUP_CHANCE = 0.15 // 15% chance per round

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const PetFishingGame = ({ petImageUrl, petName, onGameEnd, onClose, wordBank: wordBankProp = [], hideClose = false, scoreToBeat = null, leaderboard = [], chestEnabled = false, pvpOpponentPetUrl = null, currentLevel = 1, boatSkinUrl = null }) => {
  const thresholds = STAR_THRESHOLDS[currentLevel] || [10, 14, 18]
  const [star1Goal, star2Goal, star3Goal] = thresholds
  const passGoal = star1Goal
  const speedMul = SPEED_BY_LEVEL[currentLevel] || 1

  const [phase, setPhase] = useState('ready')
  const [displayScore, setDisplayScore] = useState(0)
  const [displayTime, setDisplayTime] = useState(GAME_DURATION)
  const [wordsCompleted, setWordsCompleted] = useState(0)
  const starsEarned = wordsCompleted >= star3Goal ? 3 : wordsCompleted >= star2Goal ? 2 : wordsCompleted >= star1Goal ? 1 : 0
  const [currentHint, setCurrentHint] = useState(null)
  const [fish, setFish] = useState([])
  const [particles, setParticles] = useState([])
  const [screenShake, setScreenShake] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [streak, setStreak] = useState(0)
  const [petHp, setPetHp] = useState(PET_MAX_HP)
  const [muted, setMuted] = useState(false)
  const [missedWords, setMissedWords] = useState([])
  const [wordPopup, setWordPopup] = useState(null)
  const [chestCollected, setChestCollected] = useState(false)
  const [chestPopup, setChestPopup] = useState(false)
  const [isChestRound, setIsChestRound] = useState(false)
  const [chestTimer, setChestTimer] = useState(0)
  const [wave, setWave] = useState(1)
  const [waveFlash, setWaveFlash] = useState(null)

  // Power-ups
  const [powerups, setPowerups] = useState([]) // floating power-up items
  const [activePowerup, setActivePowerup] = useState(null) // { type, expiresAt }
  const activePowerupRef = useRef(null)

  // Hook state: null | { phase: 'dropping'|'reeling', fishId, targetX, targetY, hookY, startTime }
  const [hook, setHook] = useState(null)
  const hookRef = useRef(null) // keep in sync for animation loop

  const scoreRef = useRef(0)
  const streakRef = useRef(0)
  const timerRef = useRef(null)
  const spawnTimerRef = useRef(null)
  const animFrameRef = useRef(null)
  const containerRef = useRef(null)
  const bgMusicRef = useRef(null)
  const audioCache = useRef({})
  const currentTargetRef = useRef(null)
  const roundIndexRef = useRef(0)
  const waveRef = useRef(1)
  const maxWaveRef = useRef(1)
  const chestSpawnedRef = useRef(false)
  const evaluateCatchRef = useRef(null)
  const pendingMissRef = useRef(null) // fish that swam off, pending penalty
  const chestRoundRef = useRef(0)
  const uidRef = useRef(0)
  const uid = () => ++uidRef.current
  const lastSpawnTimeRef = useRef(0)

  const playSound = useCallback((url, volume = 0.5) => {
    try {
      if (!audioCache.current[url]) audioCache.current[url] = new Audio(url)
      const sound = audioCache.current[url]
      sound.volume = volume
      sound.currentTime = 0
      sound.play().catch(() => {})
    } catch {}
  }, [])

  // Spawn a round of fish
  const spawnRound = useCallback(() => {
    // Clear round-scoped power-ups (slow)
    if (activePowerupRef.current?.type === 'slow') {
      activePowerupRef.current = null
      setActivePowerup(null)
    }

    const containerW = containerRef.current?.clientWidth || 400
    const containerH = containerRef.current?.clientHeight || 700

    const words = wordBankProp
    if (words.length === 0) return

    // Advance the wave before building the round so speed, shoal size and
    // chop all come from the same difficulty step.
    const round = roundIndexRef.current + 1
    roundIndexRef.current = round
    // Local, not the `wave` state — that value is a render behind this spawn.
    const waveNow = waveForRound(round)
    if (waveNow !== waveRef.current) {
      waveRef.current = waveNow
      maxWaveRef.current = Math.max(maxWaveRef.current, waveNow)
      setWave(waveNow)
      if (round > 1) {
        setWaveFlash(waveNow)
        setTimeout(() => setWaveFlash(null), 1300)
      }
    }
    const waveSpeed = speedMulForWave(waveNow)
    const wobbleAmp = wobbleForWave(waveNow)

    const target = words[Math.floor(Math.random() * words.length)]
    currentTargetRef.current = target
    setCurrentHint(target.hint)

    const fishThisRound = waveNow >= EXTRA_FISH_FROM_WAVE ? FISH_PER_ROUND + 1 : FISH_PER_ROUND
    const count = Math.min(fishThisRound, words.length)
    const distractors = shuffle(words.filter(w => w.word !== target.word)).slice(0, count - 1)
    const allWords = shuffle([target, ...distractors])

    const roundId = Date.now()

    // Water zone: 45%-90% of container height (below the dock/pet at top)
    const waterTop = containerH * 0.45
    const waterBottom = containerH * 0.90
    const laneHeight = (waterBottom - waterTop) / allWords.length

    const emojiPool = shuffle([...FISH_EMOJIS])

    allWords.forEach((w, i) => {
      // Later waves send the shoal in tighter together, leaving less time to scan
      const delay = i * Math.max(90, 150 - (waveNow - 1) * 15)
      setTimeout(() => {
        // Alternate direction
        const goingRight = i % 2 === 0
        const startX = goingRight ? -100 : containerW + 100
        const laneY = waterTop + laneHeight * i + laneHeight / 2 + (Math.random() - 0.5) * 20
        const speed = (BASE_FISH_SPEED + Math.random() * 1.0) * speedMul * waveSpeed
        const vx = goingRight ? speed : -speed

        const isCorrect = w.word === target.word
        const isChestFish = isCorrect && chestEnabled && !chestSpawnedRef.current && roundIndexRef.current === chestRoundRef.current

        const newFish = {
          id: `${w.word}-${roundId}-${i}`,
          word: w.word,
          hint: w.hint,
          isCorrect,
          isChest: isChestFish,
          x: startX,
          y: laneY,
          baseY: laneY,
          vx,
          direction: goingRight ? 1 : -1,
          caught: false,
          wrong: false,
          opacity: 1,
          scale: 1,
          emoji: emojiPool[i % emojiPool.length],
          wiggleOffset: Math.random() * Math.PI * 2,
          wobbleAmp,
          spawnTime: performance.now(),
        }
        if (isChestFish) {
          setIsChestRound(true)
          setChestTimer(3)
        }
        setFish(prev => [...prev, newFish])
      }, delay)
    })

    // Maybe spawn a power-up
    if (Math.random() < powerupChanceForWave(waveNow) && !activePowerupRef.current) {
      const pu = POWERUPS[Math.floor(Math.random() * POWERUPS.length)]
      const goingRight = Math.random() > 0.5
      const puY = waterTop + Math.random() * (waterBottom - waterTop)
      const puSpeed = (BASE_FISH_SPEED + 0.5) * speedMul * waveSpeed
      setPowerups(prev => [...prev, {
        id: `pu-${Date.now()}`,
        ...pu,
        x: goingRight ? -60 : containerW + 60,
        y: puY,
        baseY: puY,
        vx: goingRight ? puSpeed : -puSpeed,
        direction: goingRight ? 1 : -1,
        opacity: 1,
        wiggleOffset: Math.random() * Math.PI * 2,
      }])
    }
  }, [wordBankProp, chestEnabled, speedMul])

  // Start game
  const startGame = useCallback(() => {
    setDisplayScore(0)
    setDisplayTime(GAME_DURATION)
    setWordsCompleted(0)
    setMissedWords([])
    setStreak(0)
    setPetHp(PET_MAX_HP)
    setFish([])
    setParticles([])
    setFeedback(null)
    setCurrentHint(null)
    scoreRef.current = 0
    streakRef.current = 0
    roundIndexRef.current = 0
    waveRef.current = 1
    maxWaveRef.current = 1
    setWave(1)
    setWaveFlash(null)
    chestSpawnedRef.current = false
    chestRoundRef.current = 5 + Math.floor(Math.random() * 10)
    setChestCollected(false)
    setChestPopup(false)
    setIsChestRound(false)
    setChestTimer(0)
    setHook(null)
    hookRef.current = null
    setPowerups([])
    setActivePowerup(null)
    activePowerupRef.current = null
    lastSpawnTimeRef.current = 0
    setPhase('playing')

    try {
      const music = new Audio(assetUrl('/sound/pet-word-scamble-2-faster.mp3'))
      music.loop = true
      music.volume = 0.3
      bgMusicRef.current = music
      music.play().catch(() => {})
    } catch {}
  }, [])

  // Spawn first round when game starts
  useEffect(() => {
    if (phase !== 'playing') return
    const firstTimer = setTimeout(() => spawnRound(), 300)
    return () => {
      clearTimeout(firstTimer)
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current)
    }
  }, [phase, spawnRound])

  // Chest timer countdown
  useEffect(() => {
    if (chestTimer <= 0) return
    const interval = setInterval(() => {
      setChestTimer(prev => {
        if (prev <= 1) {
          chestSpawnedRef.current = true
          setIsChestRound(false)
          setFish(prev => prev.map(f => f.isChest && !f.caught ? { ...f, isChest: false } : f))
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [chestTimer])

  // Spawn next round immediately (with guard against double-spawn in the same frame)
  const scheduleNextRound = useCallback(() => {
    const now = performance.now()
    if (now - lastSpawnTimeRef.current < 50) return
    lastSpawnTimeRef.current = now
    if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current)
    spawnRound()
  }, [spawnRound])

  // Timer countdown
  useEffect(() => {
    if (phase !== 'playing') return
    timerRef.current = setInterval(() => {
      setDisplayTime(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setPhase('results')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  // Stop music on results/defeated
  useEffect(() => {
    if ((phase === 'results' || phase === 'defeated') && bgMusicRef.current) {
      bgMusicRef.current.pause()
      bgMusicRef.current = null
    }
  }, [phase])

  // Play end sounds
  useEffect(() => {
    if (phase === 'results') {
      if (wordsCompleted >= passGoal) {
        playSound(assetUrl('/pet-game/angry/angry-birds-level-complete.mp3'), 0.5)
      } else {
        playSound(assetUrl('/sound/craft_fail.mp3'), 0.5)
      }
    }
    if (phase === 'defeated') {
      playSound(assetUrl('/sound/craft_fail.mp3'), 0.5)
    }
  }, [phase, playSound, wordsCompleted, passGoal])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause()
        bgMusicRef.current = null
      }
    }
  }, [])

  // Animation loop
  useEffect(() => {
    if (phase !== 'playing') return

    const containerW = () => containerRef.current?.clientWidth || 400
    let lastTime = performance.now()

    const animate = (now) => {
      const rawDt = (now - lastTime) / 16.667
      const dt = Math.min(rawDt, 3)
      lastTime = now

      // Hook animation — move hookX/hookY toward target (dropping) or anchor (reeling)
      const currentHook = hookRef.current
      if (currentHook) {
        const HOOK_SPEED = 14

        if (currentHook.phase === 'dropping') {
          // Track the fish's live position as it swims
          setFish(prev => {
            const targetFish = prev.find(f => f.id === currentHook.fishId)
            if (targetFish && !targetFish.caught && !targetFish.wrong) {
              currentHook.targetX = targetFish.x
              currentHook.targetY = targetFish.y
            }
            return prev // no mutation
          })

          // Move hook toward fish position
          const dx = currentHook.targetX - currentHook.hookX
          const dy = currentHook.targetY - currentHook.hookY
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < HOOK_SPEED * dt + 5) {
            // Arrived at fish — start reeling
            currentHook.hookX = currentHook.targetX
            currentHook.hookY = currentHook.targetY
            currentHook.phase = 'reeling'
          } else {
            // Move along the direction vector
            currentHook.hookX += (dx / dist) * HOOK_SPEED * dt
            currentHook.hookY += (dy / dist) * HOOK_SPEED * dt
          }
          hookRef.current = { ...currentHook }
          setHook({ ...currentHook })
        } else if (currentHook.phase === 'reeling') {
          // Move hook + fish back toward anchor
          const dx = currentHook.anchorX - currentHook.hookX
          const dy = currentHook.anchorY - currentHook.hookY
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < HOOK_SPEED * dt + 5) {
            // Reeled in — evaluate the catch
            const caughtFish = currentHook._fishObj
            hookRef.current = null
            setHook(null)
            if (evaluateCatchRef.current) evaluateCatchRef.current(caughtFish)
          } else {
            currentHook.hookX += (dx / dist) * HOOK_SPEED * dt
            currentHook.hookY += (dy / dist) * HOOK_SPEED * dt
            // Move the hooked fish with the hook
            setFish(prev => prev.map(f => {
              if (f.id === currentHook.fishId && f.hooked) {
                return { ...f, x: currentHook.hookX, y: currentHook.hookY, baseY: currentHook.hookY }
              }
              return f
            }))
            hookRef.current = { ...currentHook }
            setHook({ ...currentHook })
          }
        }
      }

      setFish(prev => {
        const updated = prev.map(f => {
          if (f.caught) {
            return {
              ...f,
              y: f.y - 6 * dt,
              opacity: Math.max(0, f.opacity - 0.04 * dt),
              scale: f.scale + 0.02 * dt,
            }
          }
          if (f.wrong) {
            return {
              ...f,
              opacity: Math.max(0, f.opacity - 0.05 * dt),
              scale: f.scale * 0.98,
            }
          }
          // Hooked fish — crawl slowly while waiting for hook
          if (f.hooked) {
            const wobble = Math.sin(now / 500 + f.wiggleOffset) * 3
            return { ...f, x: f.x + f.vx * 0.5 * dt, y: f.baseY + wobble }
          }
          // Normal swimming (slow if power-up active). The wobble amplitude is
          // baked in per fish at spawn, so it rises with the wave.
          const slowMul = activePowerupRef.current?.type === 'slow' ? 0.35 : 1
          const wobble = Math.sin(now / 500 + f.wiggleOffset) * (f.wobbleAmp ?? 6)
          return {
            ...f,
            x: f.x + f.vx * dt * slowMul,
            y: f.baseY + wobble,
          }
        })

        return updated.filter(f => {
          if (f.opacity <= 0) return false
          if (!f.caught && !f.wrong && !f.hooked) {
            const offScreen = f.direction === 1 ? f.x > containerW() + 120 : f.x < -120
            if (offScreen) {
              if (f.isChest) {
                chestSpawnedRef.current = true
              }
              if (f.isCorrect && !pendingMissRef.current) {
                pendingMissRef.current = { word: f.word, hint: f.hint }
              }
              return false
            }
          }
          return true
        })
      })

      // Handle missed fish penalty (outside setFish to avoid StrictMode double-fire)
      if (pendingMissRef.current) {
        const missed = pendingMissRef.current
        pendingMissRef.current = null
        setMissedWords(p => {
          if (p.some(m => m.word === missed.word)) return p
          return [...p, { word: missed.word, hint: missed.hint }]
        })
        streakRef.current = 0
        setStreak(0)
        setIsChestRound(false)
        setChestTimer(0)
        setPetHp(prev => {
          const newHp = prev - 1
          if (newHp <= 0) {
            setTimeout(() => {
              clearInterval(timerRef.current)
              setPhase('defeated')
            }, 800)
          }
          return newHp
        })
        scheduleNextRound()
      }

      // Power-up movement
      setPowerups(prev => prev.map(p => {
        const wobble = Math.sin(now / 400 + p.wiggleOffset) * 8
        return { ...p, x: p.x + p.vx * dt, y: p.baseY + wobble }
      }).filter(p => {
        const offScreen = p.direction === 1 ? p.x > containerW() + 80 : p.x < -80
        return !offScreen
      }))

      // Expire timed power-ups + update progress
      if (activePowerupRef.current?.expiresAt) {
        if (now >= activePowerupRef.current.expiresAt) {
          activePowerupRef.current = null
          setActivePowerup(null)
        } else {
          const remaining = activePowerupRef.current.expiresAt - now
          const duration = activePowerupRef.current.duration
          setActivePowerup(prev => prev ? { ...prev, progress: remaining / duration } : null)
        }
      }

      // Particles
      setParticles(prev => prev.map(p => ({
        ...p,
        x: p.x + p.vx * dt,
        y: p.y + p.vy * dt,
        vy: p.vy + 0.3 * dt,
        opacity: p.opacity - 0.03 * dt,
      })).filter(p => p.opacity > 0))

      setScreenShake(prev => Math.max(0, prev - 1 * dt))

      animFrameRef.current = requestAnimationFrame(animate)
    }

    animFrameRef.current = requestAnimationFrame(animate)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [phase, scheduleNextRound])

  // Evaluate a fish after it's been reeled in
  const evaluateCatch = useCallback((fishObj) => {
    if (fishObj.isCorrect) {
      // Chest
      if (fishObj.isChest && !chestCollected) {
        setChestCollected(true)
        setIsChestRound(false)
        setChestTimer(0)
        setChestPopup(true)
        setTimeout(() => setChestPopup(false), 1500)
      }

      const newStreak = streakRef.current + 1
      streakRef.current = newStreak
      setStreak(newStreak)

      const streakTier = newStreak >= 5 ? 3 : newStreak >= 3 ? 2 : 1
      const base = FISH_BASE_POINTS[fishObj.emoji] || 10
      const cW = containerRef.current?.clientWidth || 400
      const distFromSpawn = Math.abs(fishObj.x - (fishObj.direction === 1 ? -100 : cW + 100))
      const travelPct = distFromSpawn / (cW + 200)
      const speedBonus = travelPct < 0.25 ? 3 : travelPct < 0.5 ? 2 : travelPct < 0.75 ? 1 : 0
      const doubleMul = activePowerupRef.current?.type === 'double' ? 2 : 1
      const points = (base + streakTier + speedBonus) * doubleMul
      scoreRef.current += points
      setDisplayScore(scoreRef.current)
      setWordsCompleted(prev => prev + 1)

      setWordPopup({ points, streak: newStreak })
      setTimeout(() => setWordPopup(null), 1000)

      const roundId = fishObj.id.split('-').slice(1, 2)[0]
      setFish(prev => prev.map(f => {
        if (f.id === fishObj.id) return { ...f, caught: true, hooked: false }
        const thisRoundId = f.id.split('-').slice(1, 2)[0]
        if (roundId === thisRoundId && !f.caught) return { ...f, opacity: 0.5, wrong: true }
        return f
      }))

      // Splash particles at the surface
      const containerH = containerRef.current?.clientHeight || 700
      const splashY = containerH * 0.38
      const colors = ['#60a5fa', '#3b82f6', '#93c5fd', '#2dd4bf', '#22d3ee', '#ffffff']
      const splashParticles = Array.from({ length: 12 }, (_, i) => ({
        id: `splash-${uid()}`,
        x: fishObj.x,
        y: splashY,
        vx: Math.cos(i * Math.PI / 6) * (3 + Math.random() * 3),
        vy: Math.sin(i * Math.PI / 6) * (3 + Math.random() * 3) - 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: 1,
      }))
      setParticles(prev => [...prev, ...splashParticles])

      playSound(assetUrl('/sound/scram-correct.mp3'), 0.4)
      setFeedback({ type: 'correct', word: fishObj.word, x: fishObj.x, y: splashY })
      setTimeout(() => setFeedback(null), 600)
      scheduleNextRound()

    } else {
      // Wrong fish reeled in
      streakRef.current = 0
      setStreak(0)

      const newHp = petHp - 1
      setPetHp(newHp)
      if (newHp <= 0) {
        setTimeout(() => {
          clearInterval(timerRef.current)
          setPhase('defeated')
        }, 800)
      }

      setScreenShake(10)

      const roundId = fishObj.id.split('-').slice(1, 2)[0]
      setFish(prev => prev.map(f => {
        if (f.id === fishObj.id) return { ...f, wrong: true, hooked: false }
        const thisRoundId = f.id.split('-').slice(1, 2)[0]
        if (roundId === thisRoundId && !f.caught) return { ...f, opacity: 0.5, wrong: true }
        return f
      }))

      const containerH = containerRef.current?.clientHeight || 700
      const splashY = containerH * 0.38
      const explosionParticles = Array.from({ length: 8 }, (_, i) => ({
        id: `wrong-${uid()}`,
        x: fishObj.x,
        y: splashY,
        vx: Math.cos(i * Math.PI / 4) * 4,
        vy: Math.sin(i * Math.PI / 4) * 4,
        color: '#ef4444',
        opacity: 1,
      }))
      setParticles(prev => [...prev, ...explosionParticles])

      playSound(assetUrl('/sound/flappy-hit.mp3'), 0.3)
      setFeedback({ type: 'wrong', word: fishObj.word, x: fishObj.x, y: splashY })
      setTimeout(() => setFeedback(null), 600)
      scheduleNextRound()
    }
  }, [scheduleNextRound, playSound, chestCollected, petHp])

  // Keep ref in sync so the animation loop can call it
  evaluateCatchRef.current = evaluateCatch

  // Handle tapping a power-up
  const handlePowerupTap = useCallback((pu) => {
    if (phase !== 'playing') return
    setPowerups(prev => prev.filter(p => p.id !== pu.id))
    playSound(assetUrl('/sound/power-up.mp3'), 0.3)

    if (pu.type === 'heal') {
      if (petHp >= PET_MAX_HP) {
        // Full HP — award 30 points instead
        scoreRef.current += 30
        setDisplayScore(scoreRef.current)
        setWordPopup({ points: 30, streak: 0 })
        setTimeout(() => setWordPopup(null), 1000)
        setFeedback({ type: 'correct', word: '+30', x: pu.x, y: pu.y })
      } else {
        setPetHp(prev => Math.min(prev + 1, PET_MAX_HP))
        setFeedback({ type: 'correct', word: '+1 HP', x: pu.x, y: pu.y })
      }
      setTimeout(() => setFeedback(null), 600)
    } else if (pu.type === 'slow') {
      // Slow applies to current round only — store the round index
      const active = { type: 'slow', img: pu.img, label: pu.label, roundIndex: roundIndexRef.current }
      activePowerupRef.current = active
      setActivePowerup(active)
      setFeedback({ type: 'correct', word: `${pu.label}!`, x: pu.x, y: pu.y })
      setTimeout(() => setFeedback(null), 600)
    } else {
      // Timed power-ups (slow, double)
      const active = { type: pu.type, img: pu.img, label: pu.label, duration: pu.duration, expiresAt: performance.now() + pu.duration }
      activePowerupRef.current = active
      setActivePowerup(active)
      setFeedback({ type: 'correct', word: `${pu.label}!`, x: pu.x, y: pu.y })
      setTimeout(() => setFeedback(null), 600)
    }
  }, [phase, playSound, petHp])

  // Handle tapping a fish — drop the hook
  const handleFishTap = useCallback((fishObj) => {
    if (phase !== 'playing' || fishObj.caught || fishObj.wrong || fishObj.hooked) return
    // Don't allow tapping while hook is already active
    if (hookRef.current) return

    const containerH = containerRef.current?.clientHeight || 700
    const hookStartY = containerH * 0.38 // where the dock/line starts

    const anchorX = (containerRef.current?.clientWidth || 400) / 2 + 10

    // Freeze the fish immediately so it doesn't swim away
    setFish(prev => prev.map(f => f.id === fishObj.id ? { ...f, hooked: true } : f))

    const newHook = {
      phase: 'dropping',
      fishId: fishObj.id,
      targetX: fishObj.x,
      targetY: fishObj.y,
      hookX: anchorX,
      hookY: hookStartY,
      anchorX,
      anchorY: hookStartY,
      startTime: performance.now(),
      _fishObj: fishObj, // stash for evaluateCatch
    }
    hookRef.current = newHook
    setHook(newHook)
  }, [phase])

  return createPortal(
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black/70 flex items-center justify-center">
      <style>{`
        @keyframes fishBob {
          0%, 100% { transform: translateY(-3px); }
          50% { transform: translateY(3px); }
        }
        @keyframes bobFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-8px) scale(1.1); }
        }
        @keyframes fishCaught {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-120px) scale(0.4); opacity: 0; }
        }
        @keyframes fishWrong {
          0% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
          90% { transform: translateX(3px); }
          100% { transform: translateX(0); }
        }
        @keyframes waveDrift1 {
          0% { transform: translateX(0) translateY(0) scaleY(1); }
          25% { transform: translateX(-20px) translateY(3px) scaleY(1.1); }
          50% { transform: translateX(-5px) translateY(-2px) scaleY(0.9); }
          75% { transform: translateX(15px) translateY(4px) scaleY(1.05); }
          100% { transform: translateX(0) translateY(0) scaleY(1); }
        }
        @keyframes waveDrift2 {
          0% { transform: translateX(0) translateY(0) scaleY(1); }
          30% { transform: translateX(18px) translateY(-3px) scaleY(1.15); }
          60% { transform: translateX(-12px) translateY(3px) scaleY(0.85); }
          100% { transform: translateX(0) translateY(0) scaleY(1); }
        }
        @keyframes waveDrift3 {
          0% { transform: translateX(0) translateY(0); }
          20% { transform: translateX(-10px) translateY(2px); }
          40% { transform: translateX(8px) translateY(-1px); }
          60% { transform: translateX(-15px) translateY(3px); }
          80% { transform: translateX(5px) translateY(-2px); }
          100% { transform: translateX(0) translateY(0); }
        }
        @keyframes waveScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes slasherFloat {
          0%, 100% { transform: translateY(-4px); }
          50% { transform: translateY(4px); }
        }
        @keyframes slasherPopIn {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes slasherResultsFadeIn {
          0% { opacity: 0; transform: translateY(30px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slasherScorePopIn {
          0% { transform: scale(0); }
          70% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes wordPopupAnim {
          0% { transform: scale(0.5) translateY(0); opacity: 0; }
          15% { transform: scale(1.1) translateY(0); opacity: 1; }
          30% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(-60px); opacity: 0; }
        }
        @keyframes chestPopupAnim {
          0% { transform: scale(0) translateY(0); opacity: 0; }
          20% { transform: scale(1.2) translateY(0); opacity: 1; }
          40% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(-80px); opacity: 0; }
        }
        @keyframes hintPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        @keyframes bbHeartLose { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.5; } 100% { transform: scale(0); opacity: 0; } }
        @keyframes waveFlashIn {
          0% { transform: scale(0.5); opacity: 0; letter-spacing: 0.5em; }
          20% { transform: scale(1.1); opacity: 1; letter-spacing: 0.15em; }
          70% { transform: scale(1); opacity: 1; letter-spacing: 0.15em; }
          100% { transform: scale(1.05); opacity: 0; letter-spacing: 0.3em; }
        }
        @keyframes timerUrgent {
          0%, 100% { transform: scale(1) rotate(0deg); }
          15% { transform: scale(1.1) rotate(-3deg); }
          30% { transform: scale(1) rotate(3deg); }
          45% { transform: scale(1.05) rotate(-2deg); }
          60% { transform: scale(1) rotate(0deg); }
        }
        @keyframes slashFeedback {
          0% { transform: scale(0.5); opacity: 0; }
          20% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1) translateY(-40px); opacity: 0; }
        }
        @keyframes bubbleRise {
          0% { transform: translateY(0) scale(1); opacity: 0.6; }
          100% { transform: translateY(-60px) scale(0.3); opacity: 0; }
        }
        @keyframes boatRock {
          0% { transform: translateX(-50%) translateY(0) rotate(0deg); }
          15% { transform: translateX(-50%) translateY(-3px) rotate(3deg); }
          30% { transform: translateX(-50%) translateY(1px) rotate(-2deg); }
          50% { transform: translateX(-50%) translateY(-4px) rotate(2deg); }
          70% { transform: translateX(-50%) translateY(2px) rotate(-3deg); }
          85% { transform: translateX(-50%) translateY(-1px) rotate(1deg); }
          100% { transform: translateX(-50%) translateY(0) rotate(0deg); }
        }
      `}</style>

      <div
        ref={containerRef}
        className="relative w-full max-w-[400px] h-full max-h-[100dvh] overflow-hidden rounded-none sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl"
        style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #87CEEB 25%, #5BA3D9 35%, #1a7ab5 42%, #0e5f8a 60%, #074060 80%, #042a40 100%)' }}
      >

      {/* Close Button */}
      {phase !== 'results' && phase !== 'defeated' && !hideClose && (
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-50 bg-white/80 backdrop-blur rounded-full p-2 shadow-lg hover:bg-white transition-colors"
        >
          <X className="w-6 h-6 text-gray-700" />
        </button>
      )}

      {/* Ready Phase */}
      {phase === 'ready' && (
        <div className="flex flex-col items-center gap-6 p-8 text-center h-full justify-center">
          <div className="flex items-center gap-4" style={{ animation: 'slasherFloat 1.5s ease-in-out infinite' }}>
            {petImageUrl ? (
              <img src={petImageUrl} alt={petName} className="w-24 h-24 object-contain drop-shadow-lg"
                onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = ''; }}
              />
            ) : null}
            <span className="text-7xl" style={{ display: petImageUrl ? 'none' : '' }}>🎣</span>
            {pvpOpponentPetUrl && (
              <>
                <span className="text-2xl font-black text-red-400" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>VS</span>
                <img src={pvpOpponentPetUrl} alt="Opponent" className="w-24 h-24 object-contain drop-shadow-lg" style={{ transform: 'scaleX(-1)' }} />
              </>
            )}
          </div>

          <div>
            <h2 className="text-3xl font-black text-white mb-2"
              style={{ textShadow: '0 2px 0 rgba(0,0,0,0.3)' }}
            >
              Fishing
            </h2>
            <p className="text-lg text-white/80 mb-1">
              Tap a fish to hook it and reel it in!
            </p>
            <p className="text-sm text-white/60">
              Every {ROUNDS_PER_WAVE} rounds the next wave rolls in: faster fish in
              choppier water — and a bigger shoal from wave {EXTRA_FISH_FROM_WAVE}.
            </p>
          </div>

          {leaderboard.length > 0 && (
            <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 w-full max-w-xs">
              <p className="text-xs font-bold text-yellow-300 mb-2">🏆 Top 10</p>
              {leaderboard.slice(0, 10).map((entry, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-white/90 py-0.5">
                  <span>{i + 1}. {entry.name}</span>
                  <span className="font-bold">{entry.score}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={startGame}
            className="px-10 py-4 bg-gradient-to-b from-cyan-500 to-cyan-600 text-white rounded-full font-bold text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform border-b-4 border-cyan-700"
          >
            Start!
          </button>
        </div>
      )}

      {/* Playing Phase */}
      {phase === 'playing' && (
        <div
          className="w-full h-full relative"
          style={{
            transform: screenShake > 0 ? `translate(${Math.sin(screenShake) * 4}px, ${Math.cos(screenShake) * 4}px)` : 'none'
          }}
        >
          {/* Water surface waves — layered, scrolling, bobbing */}
          <div className="absolute left-0 right-0 pointer-events-none z-[2]" style={{ top: '36%', height: 40, overflow: 'hidden' }}>
            {/* Main wave — medium blue, medium speed */}
            <div style={{ position: 'absolute', top: 2, left: 0, width: '200%', height: 32, animation: 'waveScroll 5s linear infinite' }}>
              <svg width="100%" height="32" viewBox="0 0 800 32" preserveAspectRatio="none">
                <path d="M0,16 C30,6 60,26 90,16 C120,6 150,26 180,16 C210,6 240,26 270,16 C300,6 330,26 360,16 C390,6 420,26 450,16 C480,6 510,26 540,16 C570,6 600,26 630,16 C660,6 690,26 720,16 C750,6 780,26 800,16 L800,32 L0,32 Z"
                  fill="rgba(26,122,181,0.8)"
                  style={{ animation: 'waveDrift1 3.5s ease-in-out infinite' }}
                />
              </svg>
            </div>
            {/* Front wave — lighter, faster */}
            <div style={{ position: 'absolute', top: -2, left: 0, width: '200%', height: 28, animation: 'waveScroll 3.5s linear infinite' }}>
              <svg width="100%" height="28" viewBox="0 0 800 28" preserveAspectRatio="none">
                <path d="M0,14 C20,6 45,22 70,14 C95,6 120,22 145,14 C170,6 195,22 220,14 C245,6 270,22 295,14 C320,6 345,22 370,14 C395,6 420,22 445,14 C470,6 495,22 520,14 C545,6 570,22 595,14 C620,6 645,22 670,14 C695,6 720,22 745,14 C770,6 800,22 800,14 L800,28 L0,28 Z"
                  fill="rgba(91,163,217,0.5)"
                  style={{ animation: 'waveDrift3 2.5s ease-in-out infinite' }}
                />
              </svg>
            </div>
            {/* Foam highlights — white caps */}
            <div style={{ position: 'absolute', top: -4, left: 0, width: '200%', height: 18, animation: 'waveScroll 4s linear infinite', animationDirection: 'reverse' }}>
              <svg width="100%" height="18" viewBox="0 0 800 18" preserveAspectRatio="none">
                <path d="M0,9 C15,4 35,14 55,9 C75,4 95,14 115,9 C135,4 155,14 175,9 C195,4 215,14 235,9 C255,4 275,14 295,9 C315,4 335,14 355,9 C375,4 395,14 415,9 C435,4 455,14 475,9 C495,4 515,14 535,9 C555,4 575,14 595,9 C615,4 635,14 655,9 C675,4 695,14 715,9 C735,4 755,14 775,9 C795,4 800,9 800,9"
                  fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round"
                  style={{ animation: 'waveDrift1 3s ease-in-out infinite' }}
                />
              </svg>
            </div>
          </div>

          {/* Bubbles decoration */}
          {Array.from({ length: 8 }, (_, i) => (
            <div key={`bubble-${i}`} className="absolute rounded-full pointer-events-none"
              style={{
                width: 4 + (i % 3) * 2,
                height: 4 + (i % 3) * 2,
                left: `${(i * 13 + 5) % 90}%`,
                top: `${55 + (i * 7) % 35}%`,
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.1)',
                animation: `bubbleRise ${3 + (i % 3) * 2}s ease-in infinite`,
                animationDelay: `${i * 0.7}s`,
              }}
            />
          ))}

          {/* Floating power-ups */}
          {powerups.map(pu => (
            <button
              key={pu.id}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handlePowerupTap(pu) }}
              className="absolute touch-none cursor-pointer z-10"
              style={{
                left: pu.x - 25,
                top: pu.y - 25,
                animation: 'bobFloat 1.5s ease-in-out infinite',
              }}
            >
              <div className="w-12 h-12 rounded-full bg-white/90 border-2 border-yellow-400 flex items-center justify-center shadow-lg"
                style={{ boxShadow: '0 0 12px rgba(250,204,21,0.5)' }}
              >
                <img src={pu.img} alt={pu.label} className="w-8 h-8 object-contain" />
              </div>
            </button>
          ))}

          {/* Swimming fish */}
          {fish.map(f => (
            <button
              key={f.id}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleFishTap(f) }}
              disabled={f.caught || f.wrong}
              className="absolute touch-none cursor-pointer"
              style={{
                left: f.x - 50,
                top: f.y - 25,
                opacity: f.opacity,
                transform: `scale(${f.scale})`,
                transition: f.caught ? 'none' : f.wrong ? 'none' : 'none',
                zIndex: f.isCorrect ? 5 : 1,
                animation: f.caught ? 'fishCaught 0.6s ease-out forwards' : f.wrong ? 'fishWrong 0.4s ease-out' : 'none',
              }}
            >
              <div className="flex flex-col items-center gap-0.5" style={{ minWidth: 90 }}>
                <span className="text-4xl" style={{
                  transform: f.direction === 1 ? 'scaleX(-1)' : 'none',
                  filter: f.isChest ? 'drop-shadow(0 0 8px #fbbf24)' : 'none',
                }}>
                  {f.isChest ? '🪙' : f.emoji}
                </span>
                <span className={`px-2 py-0.5 rounded-lg font-bold text-sm whitespace-nowrap ${
                  f.caught ? 'text-green-200' : f.wrong ? 'text-red-300/50 line-through' : 'text-white'
                }`}
                  style={{
                    textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5)',
                    background: f.isChest ? 'rgba(251,191,36,0.3)' : 'rgba(0,0,0,0.3)',
                  }}
                >
                  {f.word}
                </span>
              </div>
            </button>
          ))}

          {/* Particles */}
          {particles.map(p => (
            <div
              key={p.id}
              className="absolute w-2.5 h-2.5 rounded-full pointer-events-none"
              style={{
                left: p.x,
                top: p.y,
                backgroundColor: p.color,
                opacity: p.opacity,
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}

          {/* Feedback text */}
          {feedback && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{
                left: feedback.x,
                top: feedback.y - 30,
                animation: 'slashFeedback 0.6s ease-out forwards',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <span className={`text-2xl font-black ${feedback.type === 'correct' ? 'text-green-400' : 'text-red-400'}`}
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
              >
                {feedback.type === 'correct' ? 'CATCH!' : 'MISS!'}
              </span>
            </div>
          )}

          {/* Wave-up flash */}
          {waveFlash && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-1" style={{ animation: 'waveFlashIn 1.3s ease-out forwards' }}>
                <span className="text-4xl font-black text-cyan-200" style={{ textShadow: '0 0 18px rgba(34,211,238,0.8), 0 2px 6px rgba(0,0,0,0.6)' }}>
                  WAVE {waveFlash}
                </span>
                <span className="text-sm font-bold text-white/80">
                  {waveFlash === EXTRA_FISH_FROM_WAVE ? 'The shoal is growing!' : 'Faster fish, choppier water!'}
                </span>
              </div>
            </div>
          )}

          {/* TOP HUD */}
          <div className="absolute top-0 left-0 right-0 p-4 z-10 pointer-events-none">
            <div className="w-full max-w-md mx-auto flex flex-col items-center gap-2 pointer-events-auto">
              {/* Score / Pet / Timer row */}
              <div className="w-full flex items-center justify-between pl-12">
                <div className="flex flex-col items-start gap-1">
                  <div className="bg-white/15 backdrop-blur rounded-2xl px-4 py-2 flex items-center gap-2">
                    <span className="text-xl font-black text-white">{displayScore}</span>
                  </div>
                  {(() => {
                    const nextToBeat = leaderboard.length > 0
                      ? [...leaderboard].reverse().find(e => e.score > displayScore) || null
                      : scoreToBeat
                    if (!nextToBeat) return null
                    const gap = nextToBeat.score - displayScore
                    const isClose = gap > 0 && gap <= 3
                    const pct = Math.min(100, Math.round((displayScore / nextToBeat.score) * 100))
                    return (
                      <div className="w-28 ml-1" style={{ animation: isClose ? 'hintPulse 0.6s ease-in-out infinite' : 'none' }}>
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-[11px]">⚔️</span>
                            <span className="text-white font-bold text-[10px] truncate max-w-[50px]">{nextToBeat.name}</span>
                          </div>
                          <span className={`font-black text-[10px] ${isClose ? 'text-orange-300' : 'text-yellow-300'}`}>
                            {isClose ? `${gap} more!` : `+${gap}pts`}
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              background: isClose ? 'linear-gradient(90deg, #f97316, #ef4444)' : 'linear-gradient(90deg, #22c55e, #86efac)',
                            }}
                          />
                        </div>
                      </div>
                    )
                  })()}
                </div>

                <div className="flex flex-col items-center gap-1">
                  {petImageUrl && (
                    <img src={petImageUrl} alt={petName}
                      className="w-10 h-10 object-contain drop-shadow-md"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  )}
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: PET_MAX_HP }, (_, i) => (
                      <Heart
                        key={i}
                        className="w-3.5 h-3.5"
                        fill={i < petHp ? '#ef4444' : 'transparent'}
                        stroke={i < petHp ? '#ef4444' : '#6b7280'}
                        style={i >= petHp ? { animation: 'bbHeartLose 0.4s ease-out forwards' } : {}}
                      />
                    ))}
                  </div>
                </div>

                {/* Timer */}
                {(() => {
                  const pct = displayTime / GAME_DURATION
                  const radius = 22
                  const circumference = 2 * Math.PI * radius
                  const offset = circumference * (1 - pct)
                  const color = displayTime <= 5 ? '#ef4444' : displayTime <= 10 ? '#f97316' : displayTime <= 20 ? '#eab308' : '#22c55e'
                  return (
                    <div className="relative flex items-center justify-center"
                      style={{
                        animation: displayTime <= 5 ? 'timerUrgent 0.5s ease-in-out infinite'
                          : displayTime <= 10 ? 'timerUrgent 1s ease-in-out infinite' : 'none'
                      }}
                    >
                      <svg width="56" height="56" className="drop-shadow-lg" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="28" cy="28" r={radius} fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
                        <circle cx="28" cy="28" r={radius} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
                          strokeDasharray={circumference} strokeDashoffset={offset}
                          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                        />
                      </svg>
                      <span className="absolute font-black text-white"
                        style={{ fontSize: displayTime < 10 ? '18px' : '16px', textShadow: `0 0 8px ${color}80, 0 1px 2px rgba(0,0,0,0.3)` }}
                      >
                        {displayTime}
                      </span>
                    </div>
                  )
                })()}

                {/* Mute */}
                <button
                  onClick={() => {
                    setMuted(prev => {
                      const next = !prev
                      if (bgMusicRef.current) bgMusicRef.current.muted = next
                      return next
                    })
                  }}
                  className="bg-white/15 backdrop-blur rounded-full p-1.5"
                >
                  {muted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
                </button>
              </div>

              {/* Hint + Streak */}
              <div className="w-full flex items-center gap-2">
                <div className={`rounded-full px-2.5 py-1 text-xs font-bold flex items-center gap-1 shrink-0 ${
                  streak >= 3 ? 'bg-yellow-400 text-yellow-900' : 'bg-white/15 text-white/70'
                }`}>
                  <img src={assetUrl('/icon/profile/streak.svg')} alt="streak" className="w-3.5 h-3.5" />{streak}x
                </div>
                <div className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shrink-0 ${
                  wave >= MAX_WAVE ? 'bg-red-500/80 text-white' : wave >= EXTRA_FISH_FROM_WAVE ? 'bg-orange-500/70 text-white' : 'bg-white/15 text-white/70'
                }`}>
                  W{wave}
                </div>
                <div className="flex-1 bg-white/10 backdrop-blur rounded-xl px-4 py-2 text-center min-w-0"
                  style={{ animation: currentHint ? 'hintPulse 2s ease-in-out infinite' : 'none' }}
                >
                  <span className="text-xs text-white/50 mr-1">Catch:</span>
                  <span className="text-base font-bold text-white">{currentHint || '...'}</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-1.5 w-full max-w-[280px] mx-auto">
                <div className="flex-1 relative" style={{ height: 22 }}>
                  <div className="absolute inset-0 rounded-full" style={{
                    background: 'linear-gradient(180deg, #f0c040 0%, #c8940a 40%, #a07008 60%, #d4a820 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                  <div className="absolute rounded-full overflow-hidden" style={{
                    top: 3, bottom: 3, left: 4, right: 4,
                    background: 'linear-gradient(180deg, #7a5a10 0%, #5a4008 100%)',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                  }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, (wordsCompleted / star3Goal) * 100)}%`,
                      background: 'linear-gradient(180deg, #67e8f9 0%, #06b6d4 50%, #0891b2 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 0 6px rgba(6,182,212,0.6)',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  {[star1Goal, star2Goal].map((goal, i) => (
                    <div key={i} className="absolute top-0 bottom-0 flex items-center justify-center" style={{ left: `${(goal / star3Goal) * 100}%`, transform: 'translateX(-50%)' }}>
                      <div className="w-0.5 h-3 rounded-full" style={{ background: wordsCompleted >= goal ? 'rgba(250,204,21,0.9)' : 'rgba(255,255,255,0.3)' }} />
                    </div>
                  ))}
                </div>
                <div className="flex -space-x-0.5">
                  {thresholds.map((goal, i) => (
                    <Star key={i} className={`w-5 h-5 transition-all ${wordsCompleted >= goal ? 'text-yellow-400 fill-yellow-400 drop-shadow-sm' : 'text-white/25'}`} />
                  ))}
                </div>
              </div>

              {/* Chest indicator */}
              {isChestRound && !chestCollected && chestTimer > 0 && (
                <div className="flex flex-col items-center mt-2 gap-1">
                  <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${chestTimer <= 1 ? 'bg-red-500/40' : 'bg-amber-500/30'}`} style={{ animation: chestTimer <= 1 ? 'hintPulse 0.5s ease-in-out infinite' : 'hintPulse 1s ease-in-out infinite' }}>
                    <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-6 h-6 object-contain" />
                    <span className={`text-xs font-bold ${chestTimer <= 1 ? 'text-red-300' : 'text-amber-300'}`}>{chestTimer}s</span>
                  </div>
                  <div className="w-24 h-1.5 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${chestTimer <= 1 ? 'bg-red-400' : 'bg-amber-400'}`}
                      style={{ width: `${(chestTimer / 3) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Word Popup */}
          {wordPopup && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-1" style={{ animation: 'wordPopupAnim 1s ease-out forwards' }}>
                <div className="text-3xl font-black text-white drop-shadow-lg">+{wordPopup.points}</div>
                {wordPopup.streak > 1 && (
                  <div className="flex items-center gap-1 bg-yellow-400 text-yellow-900 rounded-full px-3 py-1 text-sm font-bold">
                    <img src={assetUrl('/icon/profile/streak.svg')} alt="streak" className="w-4 h-4" />{wordPopup.streak}x streak
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chest collected popup */}
          {chestPopup && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-2" style={{ animation: 'chestPopupAnim 1.5s ease-out forwards' }}>
                <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-16 h-16 object-contain" />
                <div className="bg-amber-500 text-white rounded-full px-4 py-1.5 font-bold text-sm shadow-lg">
                  Chest Found!
                </div>
              </div>
            </div>
          )}

          {/* Boat on water surface */}
          <div className="absolute left-1/2 z-[3] pointer-events-none" style={{ top: '32%', transform: 'translateX(-50%)', animation: 'boatRock 4s ease-in-out infinite' }}>
            {boatSkinUrl ? (
              <img src={boatSkinUrl} alt="boat" className="w-[80px] h-[80px] object-contain" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }} />
            ) : (
              <span style={{ fontSize: 64, filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}>⛵</span>
            )}
            {activePowerup && (
              <div className="absolute -right-10 top-1/2 -translate-y-1/2" style={{ width: 40, height: 40 }}>
                {activePowerup.expiresAt ? (() => {
                  const circumference = 2 * Math.PI * 16
                  const progress = activePowerup.progress ?? 1
                  return (
                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="16" fill="none" stroke="#facc15" strokeWidth="3"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - progress)}
                        strokeLinecap="round"
                      />
                    </svg>
                  )
                })() : null}
                <img src={activePowerup.img} alt={activePowerup.label} className="absolute inset-0 m-auto w-6 h-6 object-contain drop-shadow-lg animate-pulse" />
              </div>
            )}
          </div>

          {/* Fishing line + hook (dynamic) */}
          {(() => {
            const containerH = containerRef.current?.clientHeight || 700
            const anchorY = containerH * 0.38
            const anchorX = (containerRef.current?.clientWidth || 400) / 2 + 10
            if (hook) {
              // Active hook — line from anchor to hook position
              const lineEndX = hook.hookX
              const lineEndY = hook.hookY
              return (
                <svg className="absolute inset-0 z-[4] pointer-events-none" style={{ width: '100%', height: '100%' }}>
                  <line x1={anchorX} y1={anchorY} x2={lineEndX} y2={lineEndY}
                    stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
                  {/* Hook icon at end */}
                  <text x={lineEndX} y={lineEndY + 6} textAnchor="middle" fontSize="14" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
                    🪝
                  </text>
                </svg>
              )
            }
            // Idle — short dangling line
            return (
              <svg className="absolute inset-0 z-[4] pointer-events-none" style={{ width: '100%', height: '100%' }}>
                <line x1={anchorX} y1={anchorY} x2={anchorX} y2={anchorY + 40}
                  stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
                <text x={anchorX} y={anchorY + 50} textAnchor="middle" fontSize="12" style={{ opacity: 0.5 }}>
                  🪝
                </text>
              </svg>
            )
          })()}

          {/* Bottom instruction */}
          <div className="absolute bottom-1 left-0 right-0 z-10 pointer-events-none">
            <p className="text-center text-white/30 text-xs">{hook ? (hook.phase === 'dropping' ? 'Dropping hook...' : 'Reeling in...') : 'Tap a fish to cast your hook!'}</p>
          </div>
        </div>
      )}

      {/* Defeated Phase */}
      {phase === 'defeated' && (
        <div className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto p-6 z-50">
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center my-auto"
            style={{ animation: 'slasherResultsFadeIn 0.5s ease-out' }}
          >
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-4"
              style={{ animation: 'slasherScorePopIn 0.6s ease-out 0.3s both' }}
            >
              <Heart className="w-10 h-10 text-red-500" />
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-1">Defeated!</h2>
            <p className="text-gray-500 mb-5">{petName} ran out of lives!</p>

            <div
              className="rounded-2xl p-5 mb-5 border bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200"
              style={{ animation: 'slasherScorePopIn 0.6s ease-out 0.5s both' }}
            >
              <p className="text-5xl font-black text-gray-400">{wordsCompleted}</p>
              <p className="text-sm font-semibold mt-1 text-gray-400">fish caught</p>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Try to keep your lives! Wrong catches cost a heart.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setPhase('ready')
                  setDisplayScore(0)
                  setWordsCompleted(0)
                }}
                className="w-full py-3.5 bg-gradient-to-b from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-cyan-700 active:border-b-0 active:mt-1 transition-all"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 text-gray-400 hover:text-gray-600 font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Phase */}
      {phase === 'results' && (
        <div className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto p-6 z-50">
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center my-auto"
            style={{ animation: 'slasherResultsFadeIn 0.5s ease-out' }}
          >
            {/* Star display */}
            <div className="flex justify-center gap-1 mb-4">
              {[1, 2, 3].map(s => (
                <Star key={s} className={`w-12 h-12 transition-all ${starsEarned >= s ? 'text-yellow-400 fill-yellow-400 drop-shadow-lg' : 'text-gray-300'}`}
                  style={{ animation: starsEarned >= s ? `slasherScorePopIn 0.5s ease-out ${0.2 + s * 0.15}s both` : 'slasherScorePopIn 0.5s ease-out 0.3s both' }}
                />
              ))}
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-1">
              {starsEarned >= 3 ? 'Perfect Fishing!' : starsEarned >= 2 ? 'Great Catch!' : starsEarned >= 1 ? 'Training Complete!' : 'Not Enough Fish!'}
            </h2>
            <p className="text-gray-500 mb-5">
              {starsEarned >= 1
                ? `${petName} caught ${wordsCompleted} fish!`
                : `${petName} only caught ${wordsCompleted}/${passGoal} fish`}
            </p>

            <div
              className={`rounded-2xl p-5 mb-5 border ${
                starsEarned >= 3 ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200'
                : starsEarned >= 1 ? 'bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-100'
                : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'
              }`}
              style={{ animation: 'slasherScorePopIn 0.6s ease-out 0.5s both' }}
            >
              <p className={`text-5xl font-black ${
                starsEarned >= 3 ? 'text-yellow-500' : starsEarned >= 1 ? 'text-cyan-600' : 'text-gray-400'
              }`}>{wordsCompleted}</p>
              <p className={`text-sm font-semibold mt-1 ${
                starsEarned >= 3 ? 'text-yellow-400' : starsEarned >= 1 ? 'text-cyan-400' : 'text-gray-400'
              }`}>fish caught</p>
              <p className="text-xs text-gray-400 mt-1">
                {displayScore} points · reached wave {maxWaveRef.current}
              </p>
            </div>

            {/* Missed Words */}
            {missedWords.length > 0 && (
              <div className="mb-5 text-left">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">Words to Practice</p>
                <div className="max-h-[180px] overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {missedWords.map((w, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <span className="font-bold text-sm text-gray-800">{w.word}</span>
                      <span className="text-xs text-gray-400 ml-auto">{w.hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chest result */}
            {chestCollected && (
              <div className="mb-4 flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5"
                style={{ animation: 'slasherScorePopIn 0.6s ease-out 0.7s both' }}
              >
                <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-8 h-8 object-contain" />
                <span className="font-bold text-amber-700 text-sm">Chest collected!</span>
              </div>
            )}

            <p className="text-sm text-gray-600 mb-6">
              {starsEarned >= 3
                ? 'Master angler! Perfect performance!'
                : starsEarned >= 2
                  ? `Amazing catch! Get ${star3Goal} fish for 3 stars!`
                  : starsEarned >= 1
                    ? `Good job! Get ${star2Goal} fish for 2 stars!`
                    : `Need at least ${star1Goal} fish to earn a star. Try again!`}
            </p>

            {starsEarned >= 1 ? (
              <button
                onClick={() => onGameEnd(displayScore, { chestCollected, wordsCompleted, stars: starsEarned })}
                className="w-full py-3.5 bg-gradient-to-b from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-cyan-700 active:border-b-0 active:mt-1 transition-all"
              >
                Collect Rewards
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setPhase('ready')
                    setDisplayScore(0)
                    setWordsCompleted(0)
                  }}
                  className="w-full py-3.5 bg-gradient-to-b from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-cyan-700 active:border-b-0 active:mt-1 transition-all"
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2.5 text-gray-400 hover:text-gray-600 font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>,
    document.body
  )
}

export default PetFishingGame
