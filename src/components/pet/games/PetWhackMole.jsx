import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Star, Heart } from 'lucide-react'

import { assetUrl } from '../../../hooks/useBranding';
const GAME_DURATION = 61
const MOLE_SHOW_MIN = 3500
const MOLE_SHOW_MAX = 4500
const GRID_COLS = 3
const GRID_ROWS = 3
const HOLES = GRID_COLS * GRID_ROWS
const PET_MAX_HP = 5
const STAR_THRESHOLDS = {
  1: [15, 18, 20],
  2: [18, 22, 25],
  3: [20, 25, 30],
  4: [25, 30, 35],
}


const FRENZY_DURATION = 3000
const POWERUPS = [
  { type: 'slow', img: assetUrl('/pet-game/fish/freeze.png'), label: 'Slow', duration: 0 },
  { type: 'double', img: assetUrl('/pet-game/fish/double-fish.png'), label: '2x', duration: 8000 },
  { type: 'heal', img: assetUrl('/pet-game/fish/heart.png'), label: '+1 HP', duration: 0 },
  { type: 'frenzy', img: assetUrl('/pet-game/fish/frenzy.png'), label: '🎣 Frenzy!', duration: FRENZY_DURATION },
]
const POWERUP_CHANCE = 0.15

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const PetWhackMole = ({ petImageUrl, petName, onGameEnd, onClose, hammerSkinUrl, leaderboard = [], wordBank: wordBankProp = [], hideClose = false, chestEnabled = false, pvpOpponentPetUrl = null, currentLevel = 1 }) => {
  const thresholds = STAR_THRESHOLDS[currentLevel] || [15, 20, 26]
  const [star1Goal, star2Goal, star3Goal] = thresholds
  const passGoal = star1Goal
  const [phase, setPhase] = useState('ready')
  const [displayTime, setDisplayTime] = useState(GAME_DURATION)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [targetWord, setTargetWord] = useState(null)
  // Each hole: { id, word, visible, hit, wrong, hiding, isChest }
  const [holes, setHoles] = useState(Array.from({ length: HOLES }, (_, i) => ({
    id: i, word: null, visible: false, hit: false, wrong: false, hiding: false, isChest: false,
  })))
  const [screenShake, setScreenShake] = useState(0)
  const [floatingTexts, setFloatingTexts] = useState([])
  const [hammerPos, setHammerPos] = useState({ x: -100, y: -100 })
  const [hammerSwing, setHammerSwing] = useState(false)
  const [wordHistory, setWordHistory] = useState([])
  const [impacts, setImpacts] = useState([])
  const [roundsCompleted, setRoundsCompleted] = useState(0)
  const starsEarned = roundsCompleted >= star3Goal ? 3 : roundsCompleted >= star2Goal ? 2 : roundsCompleted >= star1Goal ? 1 : 0
  const [wordPopup, setWordPopup] = useState(null)
  const [chestCollected, setChestCollected] = useState(false)
  const [chestPopup, setChestPopup] = useState(false)
  const [isChestRound, setIsChestRound] = useState(false)
  const [petHp, setPetHp] = useState(PET_MAX_HP)

  // Power-ups
  const [powerupHole, setPowerupHole] = useState(null) // { holeIndex, ...powerup }
  const [activePowerup, setActivePowerup] = useState(null)
  const activePowerupRef = useRef(null)

  const timerRef = useRef(null)
  const moleTimersRef = useRef([])
  const scoreRef = useRef(0)
  const streakRef = useRef(0)
  const targetRef = useRef(null)
  const animFrameRef = useRef(null)
  const gameContainerRef = useRef(null)
  const roundHitRef = useRef(false)
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
  const chestSpawnedRef = useRef(false)
  const chestRoundRef = useRef(0)
  const roundCountRef = useRef(0)

  // Pick a new target word and spawn moles
  const spawnRound = useCallback(() => {
    // Clear round-scoped power-ups (slow)
    if (activePowerupRef.current?.type === 'slow') {
      activePowerupRef.current = null
      setActivePowerup(null)
    }
    setPowerupHole(null)
    roundCountRef.current += 1
    const words = wordBankProp
    const pair = words[Math.floor(Math.random() * words.length)]
    setTargetWord(pair)
    targetRef.current = pair
    roundHitRef.current = false
    setWordHistory(prev => [...prev, { word: pair.word, hint: pair.hint, correct: false }])

    // Pick 2-4 moles to show (one correct, rest wrong)
    const moleCount = Math.min(HOLES, 2 + Math.floor(Math.random() * 3))
    const positions = shuffle(Array.from({ length: HOLES }, (_, i) => i)).slice(0, moleCount)
    const correctPos = positions[Math.floor(Math.random() * positions.length)]

    // Pick distractor words (different from target)
    const distractors = shuffle(words.filter(w => w.word !== pair.word))

    const newHoles = Array.from({ length: HOLES }, (_, i) => {
      const posIndex = positions.indexOf(i)
      if (posIndex === -1) {
        return { id: i, word: null, visible: false, hit: false, wrong: false, hiding: false, isChest: false }
      }
      const word = i === correctPos ? pair.word : distractors[posIndex % distractors.length].word
      return { id: i, word, visible: true, hit: false, wrong: false, hiding: false, isChest: false }
    })

    // Mark chest on the correct mole for the chosen round
    if (chestEnabled && !chestSpawnedRef.current && roundCountRef.current === chestRoundRef.current) {
      const correctHole = newHoles.find(h => h.word === pair.word && h.visible)
      if (correctHole) {
        correctHole.isChest = true
        setIsChestRound(true)
      }
    }

    setHoles(newHoles)

    // Maybe spawn a power-up in an empty hole
    if (Math.random() < POWERUP_CHANCE && !activePowerupRef.current) {
      const emptyHoles = newHoles.filter(h => !h.visible).map(h => h.id)
      if (emptyHoles.length > 0) {
        const pu = POWERUPS[Math.floor(Math.random() * POWERUPS.length)]
        const holeIdx = emptyHoles[Math.floor(Math.random() * emptyHoles.length)]
        setPowerupHole({ holeIndex: holeIdx, ...pu })
      }
    }

    // Auto-hide moles after a delay (slower if power-up active, longer at lower levels)
    const slowMul = activePowerupRef.current?.type === 'slow' ? 2.5 : 1
    // Level 4 = original speed; each level below adds 20% more show time
    const levelMul = 1 + (4 - Math.min(currentLevel, 4)) * 0.2
    const showTime = (MOLE_SHOW_MIN + Math.random() * (MOLE_SHOW_MAX - MOLE_SHOW_MIN)) * slowMul * levelMul + 1000
    const hideTimer = setTimeout(() => {
      // If chest mole is still visible and not hit, chest is lost
      setHoles(prev => {
        if (prev.some(h => h.isChest && h.visible && !h.hit)) {
          chestSpawnedRef.current = true
          setIsChestRound(false)
        }
        return prev.map(h => h.visible && !h.hit ? { ...h, hiding: true } : h)
      })
      // If player missed the correct one, break streak and lose HP
      streakRef.current = 0
      setStreak(0)

      setPetHp(prev => {
        const newHp = prev - 1
        if (newHp <= 0) {
          moleTimersRef.current.forEach(t => clearTimeout(t))
          moleTimersRef.current = []
          setTimeout(() => {
            clearInterval(timerRef.current)
            setPhase('defeated')
          }, 800)
        }
        return newHp
      })

      // After animation finishes, fully remove and spawn next
      const removeTimer = setTimeout(() => {
        setHoles(prev => prev.map(h => h.hiding ? { ...h, visible: false, hiding: false, word: null } : h))
        const nextTimer = setTimeout(() => spawnRound(), 200)
        moleTimersRef.current.push(nextTimer)
      }, 300)
      moleTimersRef.current.push(removeTimer)
    }, showTime)
    moleTimersRef.current.push(hideTimer)
  }, [currentLevel, chestEnabled, wordBankProp])

  const startGame = useCallback(() => {
    scoreRef.current = 0
    streakRef.current = 0
    roundCountRef.current = 0
    chestSpawnedRef.current = false
    chestRoundRef.current = 4 + Math.floor(Math.random() * 7) // chest appears between round 4-10
    setScore(0)
    setStreak(0)
    setDisplayTime(GAME_DURATION)
    setFloatingTexts([])
    setWordHistory([])
    setRoundsCompleted(0)
    setWordPopup(null)
    setChestCollected(false)
    setChestPopup(false)
    setIsChestRound(false)
    setPetHp(PET_MAX_HP)
    setPowerupHole(null)
    setActivePowerup(null)
    activePowerupRef.current = null
    setPhase('playing')

    // Start background music
    try {
      const music = new Audio(assetUrl('/sound/pet-word-scamble.mp3'))
      music.loop = true
      music.volume = 0.3
      bgMusicRef.current = music
      music.play().catch(() => {})
    } catch {}
  }, [])

  // Stop background music when game ends
  useEffect(() => {
    if ((phase === 'results' || phase === 'defeated') && bgMusicRef.current) {
      bgMusicRef.current.pause()
      bgMusicRef.current = null
    }
  }, [phase])

  // Play end-of-game sounds
  useEffect(() => {
    if (phase === 'results') {
      if (starsEarned >= 1) {
        playSound(assetUrl('/pet-game/angry/angry-birds-level-complete.mp3'), 0.5)
      } else {
        playSound(assetUrl('/sound/craft_fail.mp3'), 0.5)
      }
    }
    if (phase === 'defeated') {
      playSound(assetUrl('/sound/craft_fail.mp3'), 0.5)
    }
  }, [phase, playSound, starsEarned])

  // Cleanup music on unmount
  useEffect(() => {
    return () => {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause()
        bgMusicRef.current = null
      }
    }
  }, [])

  // Start spawning when playing begins
  useEffect(() => {
    if (phase !== 'playing') return
    const startTimer = setTimeout(() => spawnRound(), 500)
    moleTimersRef.current.push(startTimer)
    return () => {
      moleTimersRef.current.forEach(t => clearTimeout(t))
      moleTimersRef.current = []
    }
  }, [phase, spawnRound])

  // Timer countdown
  useEffect(() => {
    if (phase !== 'playing') return
    timerRef.current = setInterval(() => {
      setDisplayTime(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          moleTimersRef.current.forEach(t => clearTimeout(t))
          moleTimersRef.current = []
          setPhase('results')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  // Hammer cursor tracking
  useEffect(() => {
    if (phase !== 'playing') return
    const container = gameContainerRef.current
    if (!container) return
    const handleMove = (e) => {
      const rect = container.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      setHammerPos({ x: clientX - rect.left, y: clientY - rect.top })
    }
    container.addEventListener('mousemove', handleMove)
    container.addEventListener('touchmove', handleMove, { passive: true })
    return () => {
      container.removeEventListener('mousemove', handleMove)
      container.removeEventListener('touchmove', handleMove)
    }
  }, [phase])

  // Screen shake decay
  useEffect(() => {
    if (phase !== 'playing') return
    const animate = () => {
      // Expire timed power-ups + update progress
      const now = performance.now()
      if (activePowerupRef.current?.expiresAt) {
        if (now >= activePowerupRef.current.expiresAt) {
          const wasFrenzy = activePowerupRef.current.type === 'frenzy'
          activePowerupRef.current = null
          setActivePowerup(null)
          if (wasFrenzy) {
            spawnRound()
          }
        } else {
          const remaining = activePowerupRef.current.expiresAt - now
          const duration = activePowerupRef.current.duration
          setActivePowerup(prev => prev ? { ...prev, progress: remaining / duration } : null)
        }
      }

      setScreenShake(prev => Math.max(0, prev - 1))
      setFloatingTexts(prev => prev.map(ft => ({
        ...ft,
        y: ft.y - 1.5,
        opacity: ft.opacity - 0.025,
      })).filter(ft => ft.opacity > 0))
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [phase])

  // Handle tapping a power-up
  const handlePowerupTap = useCallback((holeIndex) => {
    if (phase !== 'playing' || !powerupHole || powerupHole.holeIndex !== holeIndex) return
    const pu = powerupHole
    setPowerupHole(null)
    playSound(assetUrl('/pet-game/whack/mole-correct.mp3'), 0.3)

    if (pu.type === 'heal') {
      if (petHp >= PET_MAX_HP) {
        scoreRef.current += 5
        setScore(scoreRef.current)
        setWordPopup({ points: 5, streak: 0 })
        setTimeout(() => setWordPopup(null), 1200)
      } else {
        setPetHp(prev => Math.min(prev + 1, PET_MAX_HP))
        setFloatingTexts(prev => [...prev, { id: Date.now(), text: '+1 HP', x: 50, y: 50, opacity: 1, color: '#22c55e' }])
      }
    } else if (pu.type === 'frenzy') {
      const active = { type: 'frenzy', img: pu.img, label: pu.label, duration: pu.duration, expiresAt: performance.now() + pu.duration }
      activePowerupRef.current = active
      setActivePowerup(active)
      setFloatingTexts(prev => [...prev, { id: Date.now(), text: '🎣 Frenzy!', x: 50, y: 50, opacity: 1, color: '#f59e0b' }])
      setTargetWord({ word: '', hint: '🎣 Frenzy! Đập tất cả!' })

      // Clear mole timers — frenzy manages its own spawning
      moleTimersRef.current.forEach(t => clearTimeout(t))
      moleTimersRef.current = []

      // Spawn frenzy round — all holes show correct words
      const words = wordBankProp
      const frenzyCount = 4
      const frenzyWords = shuffle([...words]).slice(0, frenzyCount)
      const frenzyPositions = shuffle(Array.from({ length: HOLES }, (_, i) => i)).slice(0, frenzyCount)
      const frenzyHoles = Array.from({ length: HOLES }, (_, i) => {
        const posIdx = frenzyPositions.indexOf(i)
        if (posIdx === -1) return { id: i, word: null, visible: false, hit: false, wrong: false, hiding: false, isChest: false, isFrenzy: false }
        return {
          id: i,
          word: frenzyWords[posIdx].word,
          visible: true,
          hit: false,
          wrong: false,
          hiding: false,
          isChest: false,
          isFrenzy: true,
        }
      })
      setHoles(frenzyHoles)
    } else if (pu.type === 'slow') {
      const active = { type: 'slow', img: pu.img, label: pu.label, roundIndex: roundCountRef.current }
      activePowerupRef.current = active
      setActivePowerup(active)
      setFloatingTexts(prev => [...prev, { id: Date.now(), text: 'Slow!', x: 50, y: 50, opacity: 1, color: '#3b82f6' }])
    } else {
      const active = { type: pu.type, img: pu.img, label: pu.label, duration: pu.duration, expiresAt: performance.now() + pu.duration }
      activePowerupRef.current = active
      setActivePowerup(active)
      setFloatingTexts(prev => [...prev, { id: Date.now(), text: '2x!', x: 50, y: 50, opacity: 1, color: '#f59e0b' }])
    }
  }, [phase, powerupHole, petHp, playSound, wordBankProp])

  // Handle whacking a mole or chest
  const handleWhack = useCallback((holeIndex) => {
    if (phase !== 'playing') return

    // Check if tapping a power-up hole
    if (powerupHole && powerupHole.holeIndex === holeIndex) {
      handlePowerupTap(holeIndex)
      return
    }

    const hole = holes[holeIndex]
    if (!hole.visible || hole.hit || hole.hiding) return

    const target = targetRef.current
    if (!target) return

    if (hole.isFrenzy) {
      // FRENZY — every whack is correct, no dismissing others
      const newStreak = streakRef.current + 1
      streakRef.current = newStreak
      setStreak(newStreak)
      const doubleMul = activePowerupRef.current?.type === 'double' ? 2 : 1
      const points = (newStreak >= 5 ? 3 : newStreak >= 3 ? 2 : 1) * doubleMul
      scoreRef.current += points
      setScore(scoreRef.current)

      setHoles(prev => prev.map((h, i) =>
        i === holeIndex ? { ...h, hit: true } : h
      ))
      setRoundsCompleted(prev => prev + 1)
      setWordPopup({ points, streak: newStreak })
      setTimeout(() => setWordPopup(null), 1200)
      playSound(assetUrl('/pet-game/whack/mole-correct.mp3'), 0.4)

      // End frenzy early if all frenzy moles whacked
      setHoles(prev => {
        const remaining = prev.filter(h => h.isFrenzy && h.visible && !h.hit && h.id !== holeIndex)
        if (remaining.length === 0) {
          activePowerupRef.current = null
          setActivePowerup(null)
          setTimeout(() => spawnRound(), 300)
        }
        return prev
      })
      return

    } else if (hole.word === target.word) {
      // CORRECT!
      // Chest round — correct word grants chest
      if (hole.isChest && !chestSpawnedRef.current) {
        chestSpawnedRef.current = true
        setChestCollected(true)
        setIsChestRound(false)
        setChestPopup(true)
        setTimeout(() => setChestPopup(false), 1500)
      }
      roundHitRef.current = true
      setWordHistory(prev => prev.map((w, i) => i === prev.length - 1 ? { ...w, correct: true } : w))
      const newStreak = streakRef.current + 1
      streakRef.current = newStreak
      setStreak(newStreak)
      const doubleMul = activePowerupRef.current?.type === 'double' ? 2 : 1
      const points = (newStreak >= 5 ? 3 : newStreak >= 3 ? 2 : 1) * doubleMul
      scoreRef.current += points
      setScore(scoreRef.current)

      setHoles(prev => prev.map((h, i) =>
        i === holeIndex ? { ...h, hit: true } : h.visible ? { ...h, hiding: true } : h
      ))
      // Clean up hiding moles after animation
      setTimeout(() => {
        setHoles(prev => prev.map(h => h.hiding ? { ...h, visible: false, hiding: false, word: null } : h))
      }, 300)

      setRoundsCompleted(prev => prev + 1)
      setWordPopup({ points, streak: newStreak })
      setTimeout(() => setWordPopup(null), 1200)

      playSound(assetUrl('/pet-game/whack/mole-correct.mp3'), 0.4)

      // Clear mole timers and spawn next round
      moleTimersRef.current.forEach(t => clearTimeout(t))
      moleTimersRef.current = []
      const nextTimer = setTimeout(() => spawnRound(), 600)
      moleTimersRef.current.push(nextTimer)

    } else {
      // WRONG!
      streakRef.current = 0
      setStreak(0)
      setScreenShake(10)
      setHoles(prev => prev.map((h, i) =>
        i === holeIndex ? { ...h, wrong: true } : h
      ))

      playSound(assetUrl('/pet-game/whack/mole-incorrect.mp3'), 0.4)

      const newPetHp = petHp - 1
      setPetHp(newPetHp)

      if (newPetHp <= 0) {
        moleTimersRef.current.forEach(t => clearTimeout(t))
        moleTimersRef.current = []
        setTimeout(() => {
          clearInterval(timerRef.current)
          setPhase('defeated')
        }, 800)
        return
      }

      setTimeout(() => {
        setHoles(prev => prev.map((h, i) =>
          i === holeIndex ? { ...h, wrong: false } : h
        ))
      }, 300)
    }
  }, [phase, holes, spawnRound, petHp, powerupHole, handlePowerupTap, playSound])

  // Find the person just ahead of current score (lowest score still above current)
  const nextToBeat = [...leaderboard].reverse().find(e => e.score > score) || null

  const timerPct = displayTime / GAME_DURATION
  const timerRadius = 22
  const timerCircumference = 2 * Math.PI * timerRadius
  const timerOffset = timerCircumference * (1 - timerPct)
  const timerColor = displayTime <= 5 ? '#ef4444' : displayTime <= 10 ? '#f97316' : displayTime <= 20 ? '#eab308' : '#22c55e'

  return createPortal(
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black/70 flex items-center justify-center">
      <style>{`
        @keyframes molePopUp {
          0% { transform: translateY(100%) scale(0.8); opacity: 0; }
          60% { transform: translateY(-10%) scale(1.05); }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes moleHide {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(100%) scale(0.8); opacity: 0; }
        }
        @keyframes moleWhacked {
          0% { transform: scale(1) rotate(0deg); }
          30% { transform: scale(1.3) rotate(-10deg); }
          60% { transform: scale(0.5) rotate(15deg); opacity: 0.5; }
          100% { transform: scale(0) rotate(30deg); opacity: 0; }
        }
        @keyframes moleWrong {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes moleFloat {
          0%, 100% { transform: translateY(-5px); }
          50% { transform: translateY(5px); }
        }
        @keyframes moleResultsFadeIn {
          0% { opacity: 0; transform: translateY(30px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes moleScorePopIn {
          0% { transform: scale(0); }
          70% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes timerUrgentMole {
          0%, 100% { transform: scale(1) rotate(0deg); }
          15% { transform: scale(1.1) rotate(-3deg); }
          30% { transform: scale(1) rotate(3deg); }
          45% { transform: scale(1.05) rotate(-2deg); }
          60% { transform: scale(1) rotate(0deg); }
        }
        @keyframes hintPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
        @keyframes wordPopupAnimMole {
          0% { transform: scale(0.5) translateY(0); opacity: 0; }
          15% { transform: scale(1.1) translateY(0); opacity: 1; }
          30% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(-60px); opacity: 0; }
        }
        @keyframes moleStreakPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        .whack-game-playing, .whack-game-playing * {
          cursor: none !important;
        }
        @keyframes whackImpact {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
        }
        @keyframes hammerSwing {
          0% { transform: translate(-30%, -70%) rotate(-15deg); }
          40% { transform: translate(-30%, -70%) rotate(40deg) scale(1.1); }
          100% { transform: translate(-30%, -70%) rotate(-15deg); }
        }
        @keyframes chestBounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-6px) scale(1.05); }
        }
        @keyframes chestCollected {
          0% { transform: scale(1) rotate(0deg); opacity: 1; }
          30% { transform: scale(1.4) rotate(-10deg); opacity: 1; }
          100% { transform: scale(0) rotate(20deg); opacity: 0; }
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
      `}</style>

      {/* Narrow portrait game container */}
      <div
        ref={gameContainerRef}
        className={`relative w-full max-w-[400px] h-full max-h-[100dvh] overflow-hidden rounded-none sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl ${phase === 'playing' ? 'whack-game-playing' : ''}`}
        onPointerDown={(e) => {
          if (phase === 'playing') {
            setHammerSwing(true)
            setTimeout(() => setHammerSwing(false), 100)
            const rect = gameContainerRef.current.getBoundingClientRect()
            const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
            const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
            const id = Date.now() + Math.random()
            setImpacts(prev => [...prev, { id, x, y }])
            setTimeout(() => setImpacts(prev => prev.filter(imp => imp.id !== id)), 300)
          }
        }}
        style={{
          backgroundImage: `url(${assetUrl('/image/pet/whack.png')})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: screenShake > 0 ? `translate(${Math.sin(screenShake) * 4}px, ${Math.cos(screenShake) * 4}px)` : 'none',
          cursor: phase === 'playing' ? 'none' : 'default',
        }}
      >
        {/* Close Button */}
        {phase !== 'results' && phase !== 'defeated' && !hideClose && (
          <button
            onClick={onClose}
            className="absolute top-4 left-4 z-50 bg-white/80 backdrop-blur rounded-full p-2 shadow-lg hover:bg-white transition-colors"
          >
            <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Ready Phase */}
        {phase === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="flex items-center gap-4" style={{ animation: 'moleFloat 1.5s ease-in-out infinite' }}>
              {petImageUrl ? (
                <img src={petImageUrl} alt={petName} className="w-24 h-24 object-contain drop-shadow-lg"
                  onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = ''; }}
                />
              ) : null}
              <span className="text-7xl" style={{ display: petImageUrl ? 'none' : '' }}>🐹</span>
              {pvpOpponentPetUrl && (
                <>
                  <span className="text-2xl font-black text-red-400" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>VS</span>
                  <img src={pvpOpponentPetUrl} alt="Opponent" className="w-24 h-24 object-contain drop-shadow-lg" style={{ transform: 'scaleX(-1)' }} />
                </>
              )}
            </div>

            <div>
              <h2 className="text-3xl font-black text-white mb-2"
                style={{ textShadow: '0 2px 0 rgba(0,0,0,0.2)' }}
              >
                Whack-a-Mole
              </h2>
              <p className="text-lg text-white/80 mb-1">
                Whack the correct word!
              </p>
              <p className="text-sm text-white/60">
                Train {petName}&apos;s reflexes!
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
              className="px-10 py-4 bg-white text-green-700 rounded-full font-bold text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform border-b-4 border-green-200"
            >
              Start!
            </button>
          </div>
        )}

        {/* Playing Phase */}
        {phase === 'playing' && (
          <div className="absolute inset-0 flex flex-col">
            {/* Top HUD */}
            <div className="p-4 z-10">
              <div className="flex items-center justify-between mb-3 pl-12">
                {/* Score */}
                <div className="bg-white/20 backdrop-blur rounded-2xl px-4 py-2">
                  <span className="text-xl font-black text-white">{score}</span>
                </div>

                {/* Streak */}
                <div className="flex items-center gap-2">
                  {streak >= 3 && (
                    <div className="bg-yellow-400 text-yellow-900 rounded-full px-3 py-1 text-sm font-bold shadow-lg"
                      style={{ animation: 'hintPulse 0.6s ease-in-out' }}
                    >
                      {streak}x
                    </div>
                  )}
                  <div className="flex flex-col items-center gap-0.5">
                    {petImageUrl && (
                      <img src={petImageUrl} alt={petName}
                        className="w-10 h-10 object-contain drop-shadow-md"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    )}
                    <div className="flex gap-0.5">
                      {Array.from({ length: PET_MAX_HP }).map((_, i) => (
                        <Heart key={i} className={`w-3.5 h-3.5 transition-all ${i < petHp ? 'text-red-400 fill-red-400' : 'text-gray-600/40'}`}
                          style={i === petHp ? { animation: 'bbHeartLose 0.5s ease-out' } : {}}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Timer ring */}
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    animation: displayTime <= 5
                      ? 'timerUrgentMole 0.5s ease-in-out infinite'
                      : displayTime <= 10
                        ? 'timerUrgentMole 1s ease-in-out infinite'
                        : 'none'
                  }}
                >
                  <svg width="56" height="56" className="drop-shadow-lg" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="28" cy="28" r={timerRadius} fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
                    <circle
                      cx="28" cy="28" r={timerRadius}
                      fill="none"
                      stroke={timerColor}
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={timerCircumference}
                      strokeDashoffset={timerOffset}
                      style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                    />
                  </svg>
                  <span
                    className="absolute font-black text-white"
                    style={{
                      fontSize: displayTime < 10 ? '18px' : '16px',
                      textShadow: `0 0 8px ${timerColor}80, 0 1px 2px rgba(0,0,0,0.3)`,
                    }}
                  >
                    {displayTime}
                  </span>
                </div>
              </div>

              {/* Target hint */}
              {targetWord && (
                <div
                  className="bg-white/90 backdrop-blur rounded-2xl px-5 py-3 text-center shadow-lg border-2 border-yellow-300"
                  style={{ animation: 'hintPulse 2s ease-in-out infinite' }}
                >
                  <p className="text-xs text-gray-500 font-semibold mb-0.5">Find the word for:</p>
                  <p className="text-2xl font-black text-gray-800">{targetWord.hint}</p>
                </div>
              )}

              {/* Progress bar */}
              <div className="flex items-center gap-1.5 w-full max-w-[280px] mx-auto mt-2">
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
                      width: `${Math.min(100, (roundsCompleted / star3Goal) * 100)}%`,
                      background: 'linear-gradient(180deg, #f0b27a 0%, #8B4513 50%, #6b3410 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 0 6px rgba(139,69,19,0.6)',
                      transition: 'width 0.4s ease',
                    }} />
                    {[star1Goal, star2Goal].map((goal, i) => (
                      <div key={i} className="absolute top-0 bottom-0 flex items-center justify-center" style={{ left: `${(goal / star3Goal) * 100}%`, transform: 'translateX(-50%)' }}>
                        <div className="w-0.5 h-3 rounded-full" style={{ background: roundsCompleted >= goal ? 'rgba(250,204,21,0.9)' : 'rgba(255,255,255,0.3)' }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex -space-x-0.5">
                  {thresholds.map((goal, i) => (
                    <Star key={i} className={`w-5 h-5 transition-all ${roundsCompleted >= goal ? 'text-yellow-400 fill-yellow-400 drop-shadow-sm' : 'text-white/25'}`} />
                  ))}
                </div>
              </div>

              {/* Chest indicator under progress dots */}
              {isChestRound && !chestCollected && (
                <div className="flex items-center justify-center mt-2">
                  <div className="flex items-center gap-1.5 bg-amber-500/30 rounded-full px-3 py-1" style={{ animation: 'hintPulse 1s ease-in-out infinite' }}>
                    <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-6 h-6 object-contain" />
                    <span className="text-amber-300 text-xs font-bold">Chest round!</span>
                  </div>
                </div>
              )}


              {/* Next to beat */}
              {nextToBeat && (() => {
                const gap = nextToBeat.score - score
                const isClose = gap <= 3
                const pct = Math.min(100, Math.round((score / nextToBeat.score) * 100))
                return (
                  <div className="mt-1 mx-1" style={{ animation: isClose ? 'hintPulse 0.6s ease-in-out infinite' : 'none' }}>
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px]">⚔️</span>
                        <span className="text-white/60 text-[10px]">Beat</span>
                        <span className="text-white font-bold text-[10px] truncate max-w-[70px]">{nextToBeat.name}</span>
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

            {/* Word popup animation */}
            {wordPopup && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-1" style={{ animation: 'wordPopupAnimMole 1.2s ease-out forwards' }}>
                  <div className="text-3xl font-black text-white drop-shadow-lg">+{wordPopup.points}</div>
                  {wordPopup.streak > 1 && (
                    <div className="flex items-center gap-1 bg-yellow-400 text-yellow-900 rounded-full px-3 py-1 text-sm font-bold">
                      {wordPopup.streak}x streak
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

            {/* Mole Grid */}
            <div className="flex-1 flex items-center justify-center px-4 pb-6">
              <div
                className="grid gap-x-2 gap-y-0 w-full max-w-[380px]"
                style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}
              >
                {holes.map((hole, i) => (
                  <button
                    key={i}
                    onPointerDown={() => handleWhack(i)}
                    className="relative flex flex-col items-center justify-center cursor-none touch-none"
                    style={{ height: 140, overflow: 'visible' }}
                  >
                    {/* Mole popping out */}
                    {hole.visible && !hole.hit && (
                      <div
                        className="flex flex-col items-center"
                        style={{
                          animation: hole.hiding
                            ? 'moleHide 0.3s ease-in forwards'
                            : hole.wrong
                              ? 'moleWrong 0.3s ease-out'
                              : 'molePopUp 0.3s ease-out forwards',
                        }}
                      >
                        {/* Word label above mole */}
                        <div className={`rounded-lg px-2 py-0.5 mb-1 ${
                          hole.wrong ? 'bg-red-500' : 'bg-white/90 border border-amber-300'
                        }`}
                          style={{
                            boxShadow: hole.wrong
                              ? '0 0 10px rgba(239,68,68,0.5)'
                              : '0 2px 8px rgba(0,0,0,0.2)',
                          }}
                        >
                          <span className={`text-xs font-black uppercase tracking-wide ${
                            hole.wrong ? 'text-white' : 'text-gray-800'
                          }`}>
                            {hole.word}
                          </span>
                        </div>
                        {/* Mole image */}
                        <img src={assetUrl('/pet-game/whack/mole-normal.png')} alt="mole" className="w-16 h-16 object-contain drop-shadow-lg" />
                      </div>
                    )}

                    {/* Power-up in hole */}
                    {powerupHole && powerupHole.holeIndex === i && !hole.visible && (
                      <div
                        className="flex items-center justify-center"
                        style={{ animation: 'molePopUp 0.3s ease-out forwards' }}
                      >
                        <div className="w-14 h-14 rounded-full bg-white/90 border-2 border-yellow-400 flex items-center justify-center shadow-lg"
                          style={{ boxShadow: '0 0 12px rgba(250,204,21,0.5)' }}
                        >
                          <img src={powerupHole.img} alt={powerupHole.label} className="w-10 h-10 object-contain" />
                        </div>
                      </div>
                    )}

                    {/* Whacked animation */}
                    {hole.hit && (
                      <div
                        className="flex flex-col items-center"
                        style={{ animation: 'moleWhacked 0.4s ease-out forwards' }}
                      >
                        <img src={assetUrl('/pet-game/whack/mole-whacked.png')} alt="whacked" className="w-16 h-16 object-contain drop-shadow-lg" />
                      </div>
                    )}

                  </button>
                ))}
              </div>
            </div>

            {/* Impact effects */}
            {impacts.map(imp => (
              <div
                key={imp.id}
                className="absolute pointer-events-none z-20"
                style={{
                  left: imp.x,
                  top: imp.y,
                  width: 60,
                  height: 60,
                  animation: 'whackImpact 0.3s ease-out forwards',
                }}
              >
                <svg viewBox="0 0 60 60" width="60" height="60">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
                    <line
                      key={angle}
                      x1="30" y1="30"
                      x2={30 + 25 * Math.cos(angle * Math.PI / 180)}
                      y2={30 + 25 * Math.sin(angle * Math.PI / 180)}
                      stroke="#fbbf24"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  ))}
                  <circle cx="30" cy="30" r="8" fill="#fbbf24" opacity="0.6" />
                </svg>
              </div>
            ))}

            {/* Hammer cursor + active power-up */}
            {hammerPos.x > 0 && (
              <>
                <img
                  src={hammerSkinUrl || assetUrl('/pet-game/whack/mole-hammer.png')}
                  alt="hammer"
                  className="absolute pointer-events-none z-30"
                  style={{
                    height: 48,
                    left: hammerPos.x,
                    top: hammerPos.y,
                    transformOrigin: '50% 50%',
                    transform: hammerSwing
                      ? 'translate(-50%, -50%) rotate(-20deg) scale(1.2)'
                      : 'translate(-50%, -50%) rotate(45deg)',
                    transition: hammerSwing ? 'transform 0.03s ease-in' : 'transform 0.06s ease-out',
                    filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.4))',
                  }}
                />
                {activePowerup && (
                  <div className="absolute pointer-events-none z-30" style={{ left: hammerPos.x + 20, top: hammerPos.y - 30 }}>
                    <div className="relative" style={{ width: 32, height: 32 }}>
                      {activePowerup.expiresAt ? (() => {
                        const circumference = 2 * Math.PI * 13
                        const progress = activePowerup.progress ?? 1
                        return (
                          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 28 28">
                            <circle cx="14" cy="14" r="13" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                            <circle cx="14" cy="14" r="13" fill="none" stroke="#facc15" strokeWidth="2"
                              strokeDasharray={circumference}
                              strokeDashoffset={circumference * (1 - progress)}
                              strokeLinecap="round"
                            />
                          </svg>
                        )
                      })() : null}
                      <img src={activePowerup.img} alt={activePowerup.label} className="absolute inset-0 m-auto w-5 h-5 object-contain" />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Floating texts */}
            {floatingTexts.map(ft => (
              <div
                key={ft.id}
                className="absolute left-1/2 -translate-x-1/2 font-black text-2xl pointer-events-none z-20"
                style={{
                  top: `${ft.y}%`,
                  color: ft.color,
                  opacity: ft.opacity,
                  textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                }}
              >
                {ft.text}
              </div>
            ))}
          </div>
        )}

        {/* Defeated Phase */}
        {phase === 'defeated' && (
          <div className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto p-6 z-50">
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center my-auto"
              style={{ animation: 'moleResultsFadeIn 0.5s ease-out' }}
            >
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-4"
                style={{ animation: 'moleScorePopIn 0.6s ease-out 0.3s both' }}
              >
                <Heart className="w-10 h-10 text-red-400" />
              </div>

              <h2 className="text-2xl font-bold text-gray-800 mb-1">Defeated!</h2>
              <p className="text-gray-500 mb-5">{petName} ran out of lives!</p>

              <div className="rounded-2xl p-5 mb-5 border bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200"
                style={{ animation: 'moleScorePopIn 0.6s ease-out 0.5s both' }}
              >
                <p className="text-5xl font-black text-gray-400">{roundsCompleted}</p>
                <p className="text-sm font-semibold mt-1 text-gray-400">correct hits</p>
              </div>

              <p className="text-sm text-gray-600 mb-6">Try to keep your lives! Wrong whacks cost a heart.</p>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { setPhase('ready'); setScore(0); setStreak(0) }}
                  className="w-full py-3.5 bg-gradient-to-b from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-green-700 active:border-b-0 active:mt-1 transition-all"
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
              style={{ animation: 'moleResultsFadeIn 0.5s ease-out' }}
            >
              <div className="flex justify-center gap-1 mb-4">
                {[1, 2, 3].map(s => (
                  <Star key={s} className={`w-12 h-12 transition-all ${starsEarned >= s ? 'text-yellow-400 fill-yellow-400 drop-shadow-lg' : 'text-gray-300'}`}
                    style={{ animation: starsEarned >= s ? `moleScorePopIn 0.5s ease-out ${0.2 + s * 0.15}s both` : 'moleScorePopIn 0.5s ease-out 0.3s both' }}
                  />
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-800 mb-1">
                {starsEarned >= 3 ? 'Perfect Whacking!' : starsEarned >= 2 ? 'Great Job!' : starsEarned >= 1 ? 'Training Complete!' : 'Not Enough Hits!'}
              </h2>
              <p className="text-gray-500 mb-5">
                {starsEarned >= 1
                  ? `${petName} got ${roundsCompleted} correct hits!`
                  : `${petName} only got ${roundsCompleted}/${passGoal} correct hits`}
              </p>

              <div
                className={`rounded-2xl p-5 mb-5 border ${starsEarned >= 3 ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200' : starsEarned >= 1 ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-100' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}
                style={{ animation: 'moleScorePopIn 0.6s ease-out 0.5s both' }}
              >
                <p className={`text-5xl font-black ${starsEarned >= 3 ? 'text-amber-500' : starsEarned >= 1 ? 'text-green-600' : 'text-gray-400'}`}>{roundsCompleted}</p>
                <p className={`text-sm font-semibold mt-1 ${starsEarned >= 3 ? 'text-amber-400' : starsEarned >= 1 ? 'text-green-400' : 'text-gray-400'}`}>correct hits</p>
              </div>

              {/* Missed Words */}
              {wordHistory.some(w => !w.correct) && (
                <div className="mb-5 text-left">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">Words to Practice</p>
                  <div className="max-h-[180px] overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {wordHistory.filter(w => !w.correct).map((w, i) => (
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
                  style={{ animation: 'moleScorePopIn 0.6s ease-out 0.7s both' }}
                >
                  <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-8 h-8 object-contain" />
                  <span className="font-bold text-amber-700 text-sm">Chest collected!</span>
                </div>
              )}

              <p className="text-sm text-gray-600 mb-6">
                {starsEarned >= 3
                  ? `All 3 stars! You hit ${star3Goal}+ correct!`
                  : starsEarned >= 2
                    ? `Almost there! ${star3Goal} hits for 3 stars!`
                    : starsEarned >= 1
                      ? `Good start! ${star2Goal} hits for 2 stars, ${star3Goal} for 3!`
                      : `Need at least ${star1Goal} correct hits to earn a star. Try again!`}
              </p>

              {starsEarned >= 1 ? (
                <button
                  onClick={() => onGameEnd(score, { chestCollected, molesWhacked: roundsCompleted, stars: starsEarned })}
                  className="w-full py-3.5 bg-gradient-to-b from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-green-700 active:border-b-0 active:mt-1 transition-all"
                >
                  Collect Rewards
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setPhase('ready')
                      setScore(0)
                      setStreak(0)
                    }}
                    className="w-full py-3.5 bg-gradient-to-b from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-green-700 active:border-b-0 active:mt-1 transition-all"
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

export default PetWhackMole
