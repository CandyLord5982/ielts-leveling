import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Star, Clock, Heart } from 'lucide-react'

import { assetUrl } from '../../../hooks/useBranding';

// Physics
const GRAVITY = 0.4
const JUMP_VELOCITY = -7
const MAX_FALL_SPEED = 9

// Fruit
const FRUIT_SIZE = 48
const FRUIT_SPEED_START = 2.0
const FRUIT_SPEED_MAX = 3.7
// Seconds to reach top speed. Deliberately shorter than GAME_DURATION so the
// last stretch of the run is played at full pace instead of still ramping
// toward it — the old ramp was spread over 90s and never finished.
const SPEED_RAMP_SECONDS = 45
const FRUIT_SPAWN_DISTANCE = 260 // px between fruit waves, at the start
const FRUIT_SPAWN_DISTANCE_MIN = 240 // …and once the ramp tops out
const FRUITS_PER_WAVE = 4
// Fruit centres closer than this leave the pet (56px wide, ~42px hit radius)
// no gap to weave through, so a short viewport drops back to three fruits
// rather than serving a wave that cannot be flown cleanly.
const MIN_FRUIT_SPACING = 90

// Pet
const PET_SIZE = 56
const PET_X_PERCENT = 0.18

// Game
const GAME_DURATION = 61 // seconds
const PET_MAX_HP = 5
const STAR_THRESHOLDS = {
  1: [8, 14, 18],
  2: [10, 15, 21],
  3: [13, 17, 23],
  4: [16, 20, 25],
}

const FRUIT_EMOJIS = ['🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🍅', '🍆', '🌽', '🥑', '🍕', '🍔', '🌭', '🥨', '🥐', '🍞', '🌮', '🥪', '🥠', '🥩', '🍗', '🍖', '🍘', '🍤', '🍩', '🍰', '🧁']

function pickWrongWords(wordBank, correctWord, count) {
  const pool = wordBank.filter(w => w.word !== correctWord)
  const shuffled = pool.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count).map(w => w.word)
}

function pickWord(wordBank, usedWords) {
  const unused = wordBank.filter(w => !usedWords.has(w.word))
  const pool = unused.length > 0 ? unused : wordBank
  return pool[Math.floor(Math.random() * pool.length)]
}

const PetFlappyGame = ({ petImageUrl, petName, wordBank: wordBankProp, onGameEnd, onClose, leaderboard = [], isPvP = false, chestEnabled = false, currentLevel = 1 }) => {
  const thresholds = STAR_THRESHOLDS[currentLevel] || [7, 10, 14]
  const [star1Goal, star2Goal, star3Goal] = thresholds
  const passGoal = star1Goal
  const [phase, setPhase] = useState('ready') // 'ready' | 'playing' | 'results'
  const [displayScore, setDisplayScore] = useState(0)
  const [displayTime, setDisplayTime] = useState(GAME_DURATION)
  const [streak, setStreak] = useState(0)
  const [chestCollected, setChestCollected] = useState(false)
  const [chestPopup, setChestPopup] = useState(false)
  const [isChestRound, setIsChestRound] = useState(false)
  const [petHp, setPetHp] = useState(PET_MAX_HP)
  const [wordsCompleted, setWordsCompleted] = useState(0)
  const starsEarned = wordsCompleted >= star3Goal ? 3 : wordsCompleted >= star2Goal ? 2 : wordsCompleted >= star1Goal ? 1 : 0

  const wordBank = wordBankProp || []

  const gameAreaRef = useRef(null)
  const animFrameRef = useRef(null)
  const lastFrameTimeRef = useRef(0)
  const timerRef = useRef(null)
  const bgMusicRef = useRef(null)
  const audioCache = useRef({})

  const playSound = useCallback((url, volume = 0.5) => {
    try {
      if (!audioCache.current[url]) audioCache.current[url] = new Audio(url)
      const sound = audioCache.current[url]
      sound.volume = volume
      sound.currentTime = 0
      sound.play().catch(() => {})
    } catch {}
  }, [])

  // DOM refs for direct manipulation
  const petElRef = useRef(null)
  const fruitsContainerRef = useRef(null)
  const floatsContainerRef = useRef(null)
  const hintTextRef = useRef(null)
  const flashElRef = useRef(null)

  // Game state refs
  const petYRef = useRef(0)
  const petVelocityRef = useRef(0)
  const petRotationRef = useRef(0)
  const fruitsRef = useRef([])
  const scoreRef = useRef(0)
  const streakRef = useRef(0)
  const gameOverRef = useRef(false)
  const nextWaveIdRef = useRef(0)
  const distanceSinceLastWaveRef = useRef(0)
  const gameStartTimeRef = useRef(0)
  const currentWordRef = useRef(null)
  const usedWordsRef = useRef(new Set())
  const currentHintRef = useRef('')
  const nextFloatIdRef = useRef(0)
  const floatingTextsRef = useRef([])
  const chestSpawnedRef = useRef(false)
  const chestWaveRef = useRef(0)
  const petHpRef = useRef(PET_MAX_HP)
  const speedTierRef = useRef(0)

  // Flap / jump
  const flap = useCallback(() => {
    if (gameOverRef.current) return
    petVelocityRef.current = JUMP_VELOCITY
  }, [])

  // Handle tap/click
  const handleInteraction = useCallback((e) => {
    e.preventDefault()
    if (phase === 'ready') {
      setPhase('playing')
      return
    }
    if (phase === 'playing') {
      flap()
    }
  }, [phase, flap])

  // Set a new target word
  const setNewWord = useCallback(() => {
    const entry = pickWord(wordBank, usedWordsRef.current)
    usedWordsRef.current.add(entry.word)
    currentWordRef.current = entry
    currentHintRef.current = entry.hint
  }, [wordBank])

  // Spawn a wave of fruits
  const spawnWave = useCallback((gameHeight) => {
    const currentWord = currentWordRef.current
    if (!currentWord) return null

    const groundY = gameHeight - 60
    const minY = 60
    const usableHeight = groundY - minY
    // A thin word bank can't fill four fruits — build the wave from however
    // many distractors actually exist rather than spawning blank labels.
    const wrongWords = pickWrongWords(wordBank, currentWord.word, FRUITS_PER_WAVE - 1)
    const fitsInHeight = Math.max(2, Math.floor(usableHeight / MIN_FRUIT_SPACING) - 1)
    const fruitCount = Math.min(FRUITS_PER_WAVE, wrongWords.length + 1, fitsInHeight)
    const correctIndex = Math.floor(Math.random() * fruitCount)

    let wrongIdx = 0
    const fruits = []
    for (let i = 0; i < fruitCount; i++) {
      const yNorm = (minY + (usableHeight / (fruitCount + 1)) * (i + 1)) / gameHeight
      const emoji = FRUIT_EMOJIS[Math.floor(Math.random() * FRUIT_EMOJIS.length)]
      fruits.push({
        y: yNorm,
        word: i === correctIndex ? currentWord.word : wrongWords[wrongIdx++],
        isCorrect: i === correctIndex,
        eaten: false,
        emoji,
        el: null, // DOM element reference
      })
    }

    // Mark correct fruit as chest on the chosen wave
    if (chestEnabled && !chestSpawnedRef.current && nextWaveIdRef.current === chestWaveRef.current) {
      const correctFruit = fruits.find(f => f.isCorrect)
      if (correctFruit) {
        correctFruit.isChest = true
        setIsChestRound(true)
      }
    }

    return {
      id: nextWaveIdRef.current++,
      x: 1.1,
      fruits,
      resolved: false,
    }
  }, [wordBank])

  // Stop background music
  const stopMusic = useCallback(() => {
    if (bgMusicRef.current) {
      bgMusicRef.current.pause()
      bgMusicRef.current = null
    }
  }, [])

  // Stop music on results
  useEffect(() => {
    if (phase === 'results' || phase === 'defeated') stopMusic()
  }, [phase, stopMusic])

  // Play end-of-game sounds
  useEffect(() => {
    if (phase === 'results') {
      if (displayScore >= passGoal) {
        playSound(assetUrl('/pet-game/angry/angry-birds-level-complete.mp3'), 0.5)
      } else {
        playSound(assetUrl('/sound/craft_fail.mp3'), 0.5)
      }
    }
    if (phase === 'defeated') {
      playSound(assetUrl('/sound/craft_fail.mp3'), 0.5)
    }
  }, [phase, playSound, displayScore, passGoal])

  // Cleanup music on unmount
  useEffect(() => {
    return () => stopMusic()
  }, [stopMusic])

  // Timer countdown
  useEffect(() => {
    if (phase !== 'playing') return
    setDisplayTime(GAME_DURATION)
    timerRef.current = setInterval(() => {
      setDisplayTime(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          gameOverRef.current = true
          setPhase('results')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  // Create a fruit DOM element
  const createFruitEl = useCallback((fruit) => {
    const wrapper = document.createElement('div')
    wrapper.className = 'absolute pointer-events-none'
    wrapper.style.cssText = 'left:0;top:0;will-change:transform;'

    const label = document.createElement('div')
    label.className = 'text-center'
    label.style.marginBottom = '2px'
    const span = document.createElement('span')
    span.className = 'inline-block bg-white text-gray-800 text-[11px] font-bold px-2 py-0.5 rounded-full shadow-md border border-gray-200 whitespace-nowrap'
    span.style.cssText = 'max-width:120px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;'
    span.textContent = fruit.word
    label.appendChild(span)
    wrapper.appendChild(label)

    const emojiDiv = document.createElement('div')
    emojiDiv.className = 'text-center'
    emojiDiv.style.cssText = `font-size:${FRUIT_SIZE - 8}px;line-height:1;`
    emojiDiv.textContent = fruit.emoji
    wrapper.appendChild(emojiDiv)

    return wrapper
  }, [])

  // Create a floating text DOM element
  const createFloatEl = useCallback((text, x, y, color) => {
    const el = document.createElement('div')
    el.className = 'absolute pointer-events-none z-50 font-black text-lg'
    el.style.cssText = `left:${x}px;top:${y}px;color:${color};opacity:1;transform:translateX(-50%);text-shadow:0 1px 2px rgba(0,0,0,0.2);`
    el.textContent = text
    return el
  }, [])

  // Main game loop
  useEffect(() => {
    if (phase !== 'playing') return

    const gameArea = gameAreaRef.current
    if (!gameArea) return

    const gameWidth = gameArea.clientWidth
    const gameHeight = gameArea.clientHeight

    // Clear containers
    if (fruitsContainerRef.current) fruitsContainerRef.current.innerHTML = ''
    if (floatsContainerRef.current) floatsContainerRef.current.innerHTML = ''

    // Initialize
    petYRef.current = 0.45
    petVelocityRef.current = JUMP_VELOCITY * 0.6
    petRotationRef.current = 0
    scoreRef.current = 0
    streakRef.current = 0
    gameOverRef.current = false
    usedWordsRef.current = new Set()
    nextFloatIdRef.current = 0
    floatingTextsRef.current = []
    chestSpawnedRef.current = false
    chestWaveRef.current = 3 + Math.floor(Math.random() * 6)
    petHpRef.current = PET_MAX_HP
    speedTierRef.current = 0
    setPetHp(PET_MAX_HP)
    setChestCollected(false)
    setChestPopup(false)
    setIsChestRound(false)

    // Pick first word
    setNewWord()
    // Update hint immediately
    if (hintTextRef.current) hintTextRef.current.textContent = currentHintRef.current

    // Pre-spawn first wave
    const firstWave = spawnWave(gameHeight)
    if (firstWave) {
      firstWave.fruits.forEach(fruit => {
        const el = createFruitEl(fruit)
        fruit.el = el
        fruitsContainerRef.current?.appendChild(el)
      })
      fruitsRef.current = [firstWave]
    } else {
      fruitsRef.current = []
    }

    distanceSinceLastWaveRef.current = 0
    gameStartTimeRef.current = performance.now()
    setDisplayScore(0)
    setStreak(0)
    setWordsCompleted(0)

    lastFrameTimeRef.current = performance.now()

    // Start background music
    try {
      const music = new Audio(assetUrl('/sound/pet-word-scamble.mp3'))
      music.loop = true
      music.volume = 0.3
      bgMusicRef.current = music
      music.play().catch(() => {})
    } catch {}

    const gameLoop = (timestamp) => {
      if (gameOverRef.current) return

      const deltaMs = timestamp - lastFrameTimeRef.current
      lastFrameTimeRef.current = timestamp
      const dt = Math.min(deltaMs / 16.67, 3)

      const groundY = 1 - 60 / gameHeight

      const elapsed = (timestamp - gameStartTimeRef.current) / 1000
      const progress = Math.min(elapsed / SPEED_RAMP_SECONDS, 1)
      const fruitSpeed = FRUIT_SPEED_START + (FRUIT_SPEED_MAX - FRUIT_SPEED_START) * progress
      // Waves also arrive closer together as the run speeds up
      const spawnDistance = FRUIT_SPAWN_DISTANCE - (FRUIT_SPAWN_DISTANCE - FRUIT_SPAWN_DISTANCE_MIN) * progress

      // Announce each speed step so the ramp is something the player feels
      // rather than just quietly suffers.
      const speedTier = progress >= 1 ? 3 : progress >= 0.66 ? 2 : progress >= 0.33 ? 1 : 0
      if (speedTier > speedTierRef.current) {
        speedTierRef.current = speedTier
        const y = gameHeight * 0.28
        const el = createFloatEl(speedTier === 3 ? 'MAX SPEED!' : 'SPEED UP!', gameWidth / 2, y, '#f97316')
        el.style.fontSize = '22px'
        floatsContainerRef.current?.appendChild(el)
        floatingTextsRef.current.push({ el, y, opacity: 1 })
      }

      // --- Update pet physics ---
      petVelocityRef.current += GRAVITY * dt
      petVelocityRef.current = Math.min(petVelocityRef.current, MAX_FALL_SPEED)
      petYRef.current += (petVelocityRef.current / gameHeight) * dt
      petRotationRef.current = Math.max(-25, Math.min(70, petVelocityRef.current * 5))

      // --- Ceiling & ground: bounce back instead of death ---
      if (petYRef.current >= groundY) {
        petYRef.current = groundY - 0.01
        petVelocityRef.current = JUMP_VELOCITY * 0.4 // bounce up
      }
      if (petYRef.current <= 0.02) {
        petYRef.current = 0.02
        petVelocityRef.current = 0.5
      }

      // --- Direct DOM update for pet ---
      if (petElRef.current) {
        petElRef.current.style.top = petYRef.current * 100 + '%'
        petElRef.current.style.transform = `translate(-50%, -50%) rotate(${petRotationRef.current}deg)`
      }

      // --- Move fruits & check collisions ---
      const fruitSpeedNorm = (fruitSpeed / gameWidth) * dt
      const petPixelX = PET_X_PERCENT * gameWidth
      const petPixelY = petYRef.current * gameHeight
      const petRadius = PET_SIZE / 2 - 4

      fruitsRef.current.forEach(wave => {
        wave.x -= fruitSpeedNorm

        // Direct DOM update for each fruit in wave
        const wavePixelX = wave.x * gameWidth
        wave.fruits.forEach(fruit => {
          if (fruit.eaten || !fruit.el) return
          const fruitPixelY = fruit.y * gameHeight
          fruit.el.style.transform = `translate3d(${Math.round(wavePixelX - FRUIT_SIZE / 2)}px, ${Math.round(fruitPixelY - FRUIT_SIZE / 2 - 12)}px, 0)`
        })

        if (wave.resolved) return

        wave.fruits.forEach(fruit => {
          if (fruit.eaten) return

          const fruitPixelX = wave.x * gameWidth
          const fruitPixelY = fruit.y * gameHeight
          const dx = petPixelX - fruitPixelX
          const dy = petPixelY - fruitPixelY
          const dist = Math.sqrt(dx * dx + dy * dy)
          const hitRadius = petRadius + FRUIT_SIZE / 2 - 6

          if (dist < hitRadius) {
            fruit.eaten = true
            wave.resolved = true

            // Hide fruit DOM element
            if (fruit.el) fruit.el.style.display = 'none'

            if (fruit.isCorrect) {
              // Chest round — correct fruit grants chest
              if (fruit.isChest && !chestSpawnedRef.current) {
                chestSpawnedRef.current = true
                setChestCollected(true)
                setIsChestRound(false)
                setChestPopup(true)
                setTimeout(() => setChestPopup(false), 1500)
              }
              // Correct fruit!
              streakRef.current += 1
              setStreak(streakRef.current)
              const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1))
              const points = streakRef.current >= 3 ? rand(16, 18) : streakRef.current >= 2 ? rand(13, 15) : rand(10, 12)
              scoreRef.current += points
              setDisplayScore(scoreRef.current)
              setWordsCompleted(prev => prev + 1)

              // Add floating text via DOM
              const floatText = streakRef.current >= 2 ? `+${points}` : `+${points}`
              const floatColor = streakRef.current >= 2 ? '#f59e0b' : '#22c55e'
              const floatEl = createFloatEl(floatText, fruitPixelX, fruitPixelY, floatColor)
              floatsContainerRef.current?.appendChild(floatEl)
              floatingTextsRef.current.push({ el: floatEl, y: fruitPixelY, opacity: 1 })

              playSound(assetUrl('/sound/flappy-point.mp3'), 0.4)
              // Pick new word
              setNewWord()
              if (hintTextRef.current) hintTextRef.current.textContent = currentHintRef.current
            } else {
              // Wrong fruit — streak reset, brief flash, no death
              streakRef.current = 0
              setStreak(0)

              const floatEl = createFloatEl('Wrong!', fruitPixelX, fruitPixelY, '#ef4444')
              floatsContainerRef.current?.appendChild(floatEl)
              floatingTextsRef.current.push({ el: floatEl, y: fruitPixelY, opacity: 1 })

              if (flashElRef.current) {
                flashElRef.current.style.display = ''
                flashElRef.current.style.animation = 'none'
                // force reflow
                flashElRef.current.offsetHeight
                flashElRef.current.style.animation = 'flappyFlash 0.15s ease-out forwards'
                setTimeout(() => {
                  if (flashElRef.current) flashElRef.current.style.display = 'none'
                }, 150)
              }

              playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)

              // HP loss on wrong fruit
              petHpRef.current -= 1
              setPetHp(petHpRef.current)
              if (petHpRef.current <= 0) {
                gameOverRef.current = true
                clearInterval(timerRef.current)
                setTimeout(() => setPhase('defeated'), 800)
                return
              }
            }
          }
        })
      })

      // Check for missed waves (scrolled off-screen without eating correct fruit)
      for (const wave of fruitsRef.current) {
        if (!wave.resolved && wave.x < -0.05) {
          wave.resolved = true
          // Chest wave missed
          if (wave.fruits.some(f => f.isChest && !f.eaten)) {
            chestSpawnedRef.current = true
            setIsChestRound(false)
          }
          streakRef.current = 0
          setStreak(0)

          // HP loss on missed wave
          petHpRef.current -= 1
          setPetHp(petHpRef.current)
          if (petHpRef.current <= 0) {
            gameOverRef.current = true
            clearInterval(timerRef.current)
            setTimeout(() => setPhase('defeated'), 800)
            return
          }
          setNewWord()
          if (hintTextRef.current) hintTextRef.current.textContent = currentHintRef.current
        }
      }

      // Remove off-screen waves and their DOM elements
      fruitsRef.current = fruitsRef.current.filter(w => {
        if (w.x <= -0.15) {
          w.fruits.forEach(f => { if (f.el && f.el.parentNode) f.el.parentNode.removeChild(f.el) })
          return false
        }
        return true
      })

      // --- Spawn next wave only after current is resolved ---
      const allResolved = fruitsRef.current.length === 0 || fruitsRef.current.every(w => w.resolved)
      distanceSinceLastWaveRef.current += fruitSpeedNorm * gameWidth
      if (allResolved && distanceSinceLastWaveRef.current >= spawnDistance) {
        const wave = spawnWave(gameHeight)
        if (wave) {
          wave.fruits.forEach(fruit => {
            const el = createFruitEl(fruit)
            fruit.el = el
            fruitsContainerRef.current?.appendChild(el)
          })
          fruitsRef.current.push(wave)
        }
        distanceSinceLastWaveRef.current = 0
      }

      // --- Animate floating texts via DOM ---
      floatingTextsRef.current = floatingTextsRef.current.filter(ft => {
        ft.y -= 1.5
        ft.opacity -= 0.025
        if (ft.opacity <= 0) {
          if (ft.el && ft.el.parentNode) ft.el.parentNode.removeChild(ft.el)
          return false
        }
        ft.el.style.top = ft.y + 'px'
        ft.el.style.opacity = ft.opacity
        return true
      })

      animFrameRef.current = requestAnimationFrame(gameLoop)
    }

    animFrameRef.current = requestAnimationFrame(gameLoop)
    return () => {
      gameOverRef.current = true
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [phase, spawnWave, setNewWord, createFruitEl, createFloatEl])

  return createPortal(
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black/70 flex items-center justify-center">
      <style>{`
        @keyframes flappyResultsFadeIn {
          0% { opacity: 0; transform: translateY(30px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes flappyScorePopIn {
          0% { transform: scale(0); }
          70% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes flappyFlash {
          0% { opacity: 0.8; }
          100% { opacity: 0; }
        }
        @keyframes flappyCloudDrift {
          0% { transform: translateX(400px); }
          100% { transform: translateX(-200px); }
        }
        @keyframes flappyFloat {
          0%, 100% { transform: translateY(-6px); }
          50% { transform: translateY(6px); }
        }
        @keyframes chestPopupAnim {
          0% { transform: scale(0) translateY(0); opacity: 0; }
          20% { transform: scale(1.2) translateY(0); opacity: 1; }
          40% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(-80px); opacity: 0; }
        }
        @keyframes bbHeartLose {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
          100% { transform: scale(0); opacity: 0; }
        }
        @keyframes hintPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        @keyframes timerUrgent {
          0%, 100% { transform: scale(1) rotate(0deg); }
          15% { transform: scale(1.1) rotate(-3deg); }
          30% { transform: scale(1) rotate(3deg); }
          45% { transform: scale(1.05) rotate(-2deg); }
          60% { transform: scale(1) rotate(0deg); }
        }
      `}</style>

      {/* Narrow portrait game container */}
      <div className="relative w-full max-w-[400px] h-full max-h-[100dvh] overflow-hidden rounded-none sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl">

        {/* Sky background */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to bottom, #38bdf8, #7dd3fc 40%, #bae6fd 70%, #e0f2fe)'
        }} />

        {/* Clouds (decorative) */}
        <div className="absolute top-[15%] text-6xl opacity-30 pointer-events-none"
          style={{ animation: 'flappyCloudDrift 12s linear infinite' }}>
          ☁️
        </div>
        <div className="absolute top-[35%] text-4xl opacity-20 pointer-events-none"
          style={{ animation: 'flappyCloudDrift 18s linear 4s infinite' }}>
          ☁️
        </div>
        <div className="absolute top-[8%] text-5xl opacity-25 pointer-events-none"
          style={{ animation: 'flappyCloudDrift 15s linear 8s infinite' }}>
          ☁️
        </div>

        {/* Ground */}
        <div className="absolute bottom-0 left-0 right-0 h-[60px] z-10"
          style={{
            background: 'linear-gradient(to bottom, #65a30d, #4d7c0f 30%, #3f6212)',
            borderTop: '4px solid #84cc16',
          }}
        />

        {/* Close Button */}
        {phase !== 'results' && phase !== 'defeated' && !isPvP && (
          <button
            onClick={() => { stopMusic(); onClose(); }}
            className="absolute top-4 left-4 z-50 bg-white/80 backdrop-blur rounded-full p-2 shadow-lg hover:bg-white transition-colors"
          >
            <X className="w-6 h-6 text-gray-700" />
          </button>
        )}

        {/* HUD - Score + Timer + Streak */}
        {phase === 'playing' && (
          <div className="absolute top-4 left-0 right-0 z-40 pl-14 pr-4">
            <div className="flex items-center justify-between">
              {/* Score */}
              <div className="bg-white/15 backdrop-blur rounded-2xl px-4 py-2">
                <span className="text-xl font-black text-white">{displayScore}</span>
              </div>
              {/* HP Hearts */}
              <div className="flex gap-0.5 items-center">
                {Array.from({ length: PET_MAX_HP }).map((_, i) => (
                  <Heart key={i} className={`w-4 h-4 transition-all ${i < petHp ? 'text-red-400 fill-red-400' : 'text-gray-400/40'}`}
                    style={i === petHp ? { animation: 'bbHeartLose 0.5s ease-out' } : {}}
                  />
                ))}
              </div>
              {/* Circular Timer */}
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
                    <svg width="48" height="48" className="drop-shadow-lg" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="24" cy="24" r={radius} fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
                      <circle cx="24" cy="24" r={radius} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                      />
                    </svg>
                    <span className="absolute font-black text-white"
                      style={{ fontSize: displayTime < 10 ? '16px' : '14px', textShadow: `0 0 8px ${color}80, 0 1px 2px rgba(0,0,0,0.3)` }}
                    >
                      {displayTime}
                    </span>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* Hint + Streak */}
        {phase === 'playing' && (
          <div className="absolute top-16 left-0 right-0 z-40 pointer-events-none px-4">
            {/* Progress bar */}
            <div className="flex items-center gap-2 w-full max-w-[280px] mx-auto">
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
                    background: 'linear-gradient(180deg, #67e8f9 0%, #0891b2 50%, #0e7490 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 0 6px rgba(34,211,238,0.6)',
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
            {/* Hint + Streak */}
            <div className="w-full flex items-center gap-2 mt-2">
              <div className={`rounded-full px-2.5 py-1 text-xs font-bold flex items-center gap-1 shrink-0 ${
                streak >= 3 ? 'bg-yellow-400 text-yellow-900' : 'bg-white/15 text-white/70'
              }`}>
                <img src={assetUrl('/icon/profile/streak.svg')} alt="streak" className="w-3.5 h-3.5" />{streak}x
              </div>
              <div className="flex-1 bg-white/10 backdrop-blur rounded-xl px-4 py-2 text-center min-w-0"
                style={{ animation: currentHintRef.current ? 'hintPulse 2s ease-in-out infinite' : 'none' }}
              >
                <span className="text-base text-white/50 mr-1">Find:</span>
                <span ref={hintTextRef} className="text-2xl font-bold text-white">{currentHintRef.current}</span>
              </div>
            </div>
            {isChestRound && !chestCollected && (
              <div className="flex items-center justify-center mt-2">
                <div className="flex items-center gap-1.5 bg-amber-500/30 backdrop-blur rounded-full px-3 py-1" style={{ animation: 'flappyFloat 1s ease-in-out infinite' }}>
                  <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-6 h-6 object-contain" />
                  <span className="text-amber-700 text-xs font-bold">Chest round!</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Game Area (tap target) */}
        <div
          ref={gameAreaRef}
          className="absolute inset-0 z-20"
          onMouseDown={handleInteraction}
          onTouchStart={handleInteraction}
          style={{ cursor: phase === 'ready' ? 'pointer' : 'default' }}
        >
        {/* Ready Phase */}
        {phase === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
            <div style={{ animation: 'flappyFloat 1.5s ease-in-out infinite' }}>
              {petImageUrl ? (
                <img src={petImageUrl} alt={petName} className="w-20 h-20 object-contain drop-shadow-lg"
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = ''; }}
                />
              ) : null}
              <img src={assetUrl('/image/dashboard/flap.png')} alt="Flappy Pet" className="w-20 h-20 object-contain drop-shadow-lg" style={{ display: petImageUrl ? 'none' : '' }} />
            </div>
            <div className="flex gap-1 justify-center">
              {Array.from({ length: PET_MAX_HP }).map((_, i) => (
                <Heart key={i} className="w-5 h-5 text-red-400 fill-red-400" />
              ))}
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-black text-white mb-2"
                style={{ textShadow: '0 2px 0 rgba(0,0,0,0.15)' }}
              >
                Flappy {petName}
              </h2>
              <p className="text-base font-bold text-white/90 mb-1"
                style={{ textShadow: '0 1px 0 rgba(0,0,0,0.1)' }}
              >
                Tap to fly!
              </p>
              <p className="text-sm text-white/70 max-w-[260px]"
                style={{ textShadow: '0 1px 0 rgba(0,0,0,0.1)' }}
              >
                Eat the fruit with the correct English meaning!
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 text-white/60" />
                <span className="text-sm text-white/60">{GAME_DURATION} seconds</span>
              </div>
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
          </div>
        )}

        {/* Playing Phase - Fruits container (DOM-managed) */}
        {phase === 'playing' && <div ref={fruitsContainerRef} />}

        {/* Floating texts container (DOM-managed) */}
        {phase === 'playing' && <div ref={floatsContainerRef} />}

        {/* Chest collected popup */}
        {chestPopup && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-2" style={{ animation: 'chestPopupAnim 1.5s ease-out forwards' }}>
              <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-16 h-16 object-contain" />
              <div className="bg-amber-500 text-white rounded-full px-4 py-1.5 font-bold text-sm shadow-lg">
                Chest Found!
              </div>
            </div>
          </div>
        )}

        {/* Playing Phase - Pet */}
        {phase === 'playing' && (
          <div
            ref={petElRef}
            className="absolute z-30 pointer-events-none"
            style={{
              left: PET_X_PERCENT * 100 + '%',
              top: petYRef.current * 100 + '%',
              transform: `translate(-50%, -50%) rotate(${petRotationRef.current}deg)`,
              width: PET_SIZE,
              height: PET_SIZE,
              transition: 'none',
              willChange: 'top, transform',
            }}
          >
            {petImageUrl ? (
              <img
                src={petImageUrl}
                alt={petName}
                className="w-full h-full object-contain drop-shadow-lg"
                draggable={false}
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = ''; }}
              />
            ) : null}
            <img src={assetUrl('/image/dashboard/flap.png')} alt="Flappy Pet" className="w-full h-full object-contain drop-shadow-lg" style={{ display: petImageUrl ? 'none' : '' }} />
          </div>
        )}

        {/* Death flash */}
        <div
          ref={flashElRef}
          className="absolute inset-0 bg-red-500 z-40 pointer-events-none"
          style={{ display: 'none' }}
        />
      </div>

      {/* Defeated Phase */}
      {phase === 'defeated' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center"
            style={{ animation: 'flappyResultsFadeIn 0.5s ease-out' }}
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-4"
              style={{ animation: 'flappyScorePopIn 0.6s ease-out 0.3s both' }}
            >
              <Heart className="w-10 h-10 text-red-400" />
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-1">Defeated!</h2>
            <p className="text-gray-500 mb-5">{petName} ran out of lives!</p>

            <div className="rounded-2xl p-5 mb-5 border bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200"
              style={{ animation: 'flappyScorePopIn 0.6s ease-out 0.5s both' }}
            >
              <p className="text-5xl font-black text-gray-400">{wordsCompleted}</p>
              <p className="text-sm font-semibold mt-1 text-gray-400">words</p>
            </div>

            <p className="text-sm text-gray-600 mb-6">Try to keep your lives! Wrong fruits cost a heart.</p>

            <div className="flex flex-col gap-2">
              {isPvP ? (
                <button
                  onClick={() => onGameEnd(displayScore, { chestCollected: false, stars: 0 })}
                  className="w-full py-3.5 bg-gradient-to-b from-cyan-400 to-cyan-500 hover:from-cyan-500 hover:to-cyan-600 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-cyan-600 active:border-b-0 active:mt-1 transition-all"
                >
                  Submit Score
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { setPhase('ready'); setDisplayScore(0); setStreak(0); setWordsCompleted(0) }}
                    className="w-full py-3.5 bg-gradient-to-b from-cyan-400 to-cyan-500 hover:from-cyan-500 hover:to-cyan-600 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-cyan-600 active:border-b-0 active:mt-1 transition-all"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={onClose}
                    className="w-full py-2.5 text-gray-400 hover:text-gray-600 font-medium transition-colors"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results Phase */}
      {phase === 'results' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-50">
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center"
            style={{ animation: 'flappyResultsFadeIn 0.5s ease-out' }}
          >
            {/* Star display */}
            <div className="flex justify-center gap-1 mb-4">
              {[1, 2, 3].map(s => (
                <Star
                  key={s}
                  className={`w-12 h-12 transition-all ${starsEarned >= s ? 'text-yellow-400 fill-yellow-400 drop-shadow-lg' : 'text-gray-300'}`}
                  style={{ animation: starsEarned >= s ? `flappyScorePopIn 0.5s ease-out ${0.2 + s * 0.15}s both` : 'flappyScorePopIn 0.5s ease-out 0.3s both' }}
                />
              ))}
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-1">
              {starsEarned >= 3 ? 'Perfect Flight!' : starsEarned >= 2 ? 'Great Job!' : starsEarned >= 1 ? 'Time\'s Up!' : 'Not Enough Points!'}
            </h2>
            <p className="text-gray-500 mb-5">
              {starsEarned >= 1
                ? `${petName} completed ${wordsCompleted} words!`
                : `${petName} only completed ${wordsCompleted}/${passGoal} words`}
            </p>

            <div
              className={`rounded-2xl p-5 mb-5 border ${
                starsEarned >= 3 ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200'
                : starsEarned >= 1 ? 'bg-gradient-to-br from-sky-50 to-blue-50 border-sky-100'
                : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'
              }`}
              style={{ animation: 'flappyScorePopIn 0.6s ease-out 0.5s both' }}
            >
              <p className={`text-5xl font-black ${
                starsEarned >= 3 ? 'text-yellow-500' : starsEarned >= 1 ? 'text-sky-600' : 'text-gray-400'
              }`}>{wordsCompleted}</p>
              <p className={`text-sm font-semibold mt-1 ${
                starsEarned >= 3 ? 'text-yellow-400' : starsEarned >= 1 ? 'text-sky-400' : 'text-gray-400'
              }`}>words</p>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              {starsEarned >= 3
                ? 'Vocabulary master! Perfect performance!'
                : starsEarned >= 2
                  ? `Great word skills! Get ${star3Goal} words for 3 stars!`
                  : starsEarned >= 1
                    ? `Good job! Get ${star2Goal} words for 2 stars!`
                    : `Need at least ${star1Goal} words to earn a star. Try again!`}
            </p>

            {chestCollected && (
              <div className="mb-4 flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5"
                style={{ animation: 'flappyScorePopIn 0.6s ease-out 0.7s both' }}
              >
                <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-8 h-8 object-contain" />
                <span className="font-bold text-amber-700 text-sm">Chest collected!</span>
              </div>
            )}

            {starsEarned >= 1 || isPvP ? (
              <button
                onClick={() => onGameEnd(displayScore, { chestCollected, stars: starsEarned })}
                className="w-full py-3.5 bg-gradient-to-b from-cyan-400 to-cyan-500 hover:from-cyan-500 hover:to-cyan-600 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-cyan-600 active:border-b-0 active:mt-1 transition-all"
              >
                {isPvP ? 'Submit Score' : 'Collect Rewards'}
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setPhase('ready')
                    setDisplayScore(0)
                    setStreak(0)
                    setWordsCompleted(0)
                  }}
                  className="w-full py-3.5 bg-gradient-to-b from-cyan-400 to-cyan-500 hover:from-cyan-500 hover:to-cyan-600 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-cyan-600 active:border-b-0 active:mt-1 transition-all"
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

export default PetFlappyGame
