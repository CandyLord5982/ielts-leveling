import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Star, Volume2, VolumeX, Heart } from 'lucide-react'

import { assetUrl } from '../../../hooks/useBranding';
const PET_MAX_HP = 5
const GAME_DURATION = 76
const POINTS_PER_WORD = 10
const STREAK_BONUS = 5
const EMPTY_ARRAY = []


// Shuffle array (Fisher-Yates)
const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Pick words for a game session, ordered by difficulty
const pickGameWords = (source, level = 1) => {
  const filtered = source.filter(w => !w.min_level || w.min_level <= level)
  const short = shuffle(filtered.filter(w => w.word.length <= 4)).slice(0, 5)
  const medium = shuffle(filtered.filter(w => w.word.length === 5)).slice(0, 5)
  const long = shuffle(filtered.filter(w => w.word.length === 6)).slice(0, 5)
  const longer = shuffle(filtered.filter(w => w.word.length >= 7)).slice(0, 5)
  // Interleave: one from each bucket per round
  const buckets = [short, medium, long, longer]
  const picked = []
  const maxLen = Math.max(...buckets.map(b => b.length))
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of buckets) {
      if (i < bucket.length) picked.push(bucket[i])
    }
  }
  // If not enough words, fill from remaining pool
  if (picked.length < 20) {
    const pickedWords = new Set(picked.map(w => w.word))
    const remaining = shuffle(source.filter(w => !pickedWords.has(w.word)))
    picked.push(...remaining.slice(0, 20 - picked.length))
  }
  return picked
}

const STAR_THRESHOLDS = {
  1: [8, 10, 12],
  2: [10, 12, 15],
  3: [14, 16, 18],
  4: [16, 18, 20],
}

const PetWordScramble = ({ petImageUrl, petName, onGameEnd, onClose, wordBank: wordBankProp = EMPTY_ARRAY, hideClose = false, scoreToBeat = null, leaderboard = [], chestEnabled = false, pvpOpponentPetUrl = null, initialWords = null, onProgressUpdate = null, opponentProgress = null, isRealtimePvP = false, currentLevel = 1 }) => {
  const thresholds = STAR_THRESHOLDS[currentLevel] || [7, 10, 14]
  const [star1Goal, star2Goal, star3Goal] = thresholds
  const passGoal = star1Goal
  const [phase, setPhase] = useState('ready') // 'ready' | 'playing' | 'results'
  const [displayScore, setDisplayScore] = useState(0)
  const [displayTime, setDisplayTime] = useState(GAME_DURATION)
  const [words, setWords] = useState([])
  const [wordIndex, setWordIndex] = useState(0)
  const [bubbles, setBubbles] = useState([]) // { id, letter, x, y, vx, vy, popping, captured }
  const [placedLetters, setPlacedLetters] = useState([]) // { id, letter }
  const [combo, setCombo] = useState(0)
  const [feedback, setFeedback] = useState(null) // 'correct' | 'wrong' | null
  const [wordsCompleted, setWordsCompleted] = useState(0)
  const starsEarned = wordsCompleted >= star3Goal ? 3 : wordsCompleted >= star2Goal ? 2 : wordsCompleted >= star1Goal ? 1 : 0
  // particles are DOM-managed via particlesRef for perf
  // screenShake is handled via ref + direct DOM for perf
  const [skippedWords, setSkippedWords] = useState([])
  const [muted, setMuted] = useState(false)
  const [wordPopup, setWordPopup] = useState(null) // { points, streak, combo }
  const [chestCollected, setChestCollected] = useState(false)
  const [chestPopup, setChestPopup] = useState(false)
  const [chestMissed, setChestMissed] = useState(false)
  const [chestTimer, setChestTimer] = useState(0)
  const [petHp, setPetHp] = useState(PET_MAX_HP)

  const scoreRef = useRef(0)
  const timerRef = useRef(null)
  const streakRef = useRef(0)
  const scoredWordIndexRef = useRef(-1)
  const screenShakeRef = useRef(0)
  const animationFrameRef = useRef(null)
  const gameAreaRef = useRef(null)
  const containerRef = useRef(null)
  const bgMusicRef = useRef(null)
  const audioCache = useRef({})
  const chestSpawnedRef = useRef(false)
  const chestWordRef = useRef(0)
  const [chestWordIndex, setChestWordIndex] = useState(-1)

  const playSound = useCallback((url, volume = 0.5, rate = 1) => {
    try {
      if (!audioCache.current[url]) {
        audioCache.current[url] = new Audio(url)
      }
      const sound = audioCache.current[url]
      sound.volume = volume
      sound.playbackRate = rate
      sound.currentTime = 0
      sound.play().catch(() => {})
    } catch {}
  }, [])

  // Spawn particles via DOM (no React state)
  const spawnParticles = useCallback((items) => {
    const container = gameAreaRef.current
    if (!container) return
    for (const p of items) {
      const el = document.createElement('div')
      el.className = 'absolute w-3 h-3 rounded-full pointer-events-none'
      el.style.cssText = `left:${p.x}px;top:${p.y}px;background:${p.color};opacity:1;transform:translate(-50%,-50%);z-index:30;`
      container.appendChild(el)
      particlesRef.current.push({ ...p, el, opacity: 1 })
    }
  }, [])

  // Create floating bubbles for a word, spread out in a grid-ish layout
  const createBubbles = useCallback((word, containerWidth, containerHeight) => {
    const letters = word.split('')
    let scrambled
    let attempts = 0
    do {
      scrambled = shuffle(letters)
      attempts++
    } while (scrambled.join('') === word && attempts < 10)

    const bubbleSize = 70
    const padding = 30
    const safeTop = 140
    const safeBottom = containerHeight - 220
    const safeLeft = padding
    const safeRight = containerWidth - padding
    const availableW = safeRight - safeLeft
    const availableH = safeBottom - safeTop

    const total = scrambled.length
    const cols = Math.min(total, Math.floor(availableW / (bubbleSize + 20)))
    const rows = Math.ceil(total / cols)
    const cellW = availableW / cols
    const cellH = availableH / Math.max(rows, 1)

    return scrambled.map((letter, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      return {
        id: `${letter}-${i}-${Date.now()}`,
        letter,
        x: safeLeft + col * cellW + cellW / 2 + (Math.random() - 0.5) * 30,
        y: safeTop + row * cellH + cellH / 2 + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        popping: false,
        captured: false,
      }
    })
  }, [])

  // Setup a new word
  const setupWord = useCallback((gameWords, index, width, height) => {
    if (index >= gameWords.length) return false
    const w = gameWords[index]
    setBubbles(createBubbles(w.word, width, height))
    setPlacedLetters([])
    setFeedback(null)
    return true
  }, [createBubbles])

  // Start the game
  const startGame = useCallback(() => {
    const gameWords = initialWords || pickGameWords(wordBankProp, currentLevel)
    setWords(gameWords)
    setWordIndex(0)
    setDisplayScore(0)
    setDisplayTime(GAME_DURATION)
    setWordsCompleted(0)
    setSkippedWords([])

    scoreRef.current = 0
    streakRef.current = 0
    scoredWordIndexRef.current = -1
    setCombo(0)
    chestSpawnedRef.current = false
    // Pick a long word (6+ letters) for chest, fallback to random 3-7
    const longWordIndices = gameWords
      .map((w, i) => ({ i, len: w.word.length }))
      .filter(w => w.len >= 6 && w.i >= 3 && w.i <= 9)
    const chestIdx = longWordIndices.length > 0
      ? longWordIndices[Math.floor(Math.random() * longWordIndices.length)].i + 1
      : 3 + Math.floor(Math.random() * 5)
    chestWordRef.current = chestIdx
    setChestWordIndex(chestEnabled ? chestIdx : -1)
    setChestCollected(false)
    setChestPopup(false)
    setChestMissed(false)
    setPetHp(PET_MAX_HP)

    // Use container dimensions for initial setup
    const width = containerRef.current?.clientWidth || 400
    const height = containerRef.current?.clientHeight || 700
    setupWord(gameWords, 0, width, height)
    setPhase('playing')

    // Start background music
    try {
      const music = new Audio(assetUrl('/sound/pet-word-scamble-2-faster.mp3'))
      music.loop = true
      music.volume = 0.3
      bgMusicRef.current = music
      music.play().catch(() => {})
    } catch {}
  }, [setupWord])

  // Auto-start for realtime PvP (skip the ready screen)
  useEffect(() => {
    if (isRealtimePvP && phase === 'ready') {
      startGame()
    }
  }, [isRealtimePvP])

  // Timer
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

  // Start chest timer when reaching the chest word
  useEffect(() => {
    if (phase === 'playing' && chestWordIndex >= 0 && !chestSpawnedRef.current && wordsCompleted === chestWordIndex - 1) {
      setChestTimer(10)
    }
  }, [phase, wordsCompleted, chestWordIndex])

  // Chest word countdown
  useEffect(() => {
    if (chestTimer <= 0) return
    const interval = setInterval(() => {
      setChestTimer(prev => {
        if (prev <= 1) {
          if (!chestSpawnedRef.current) {
            chestSpawnedRef.current = true
            setChestMissed(true)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [chestTimer])

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
      playSound(assetUrl('/pet-game/angry/angry-birds-level-complete.mp3'), 0.5)
    }
    if (phase === 'defeated') {
      playSound(assetUrl('/sound/craft_fail.mp3'), 0.5)
    }
  }, [phase, playSound])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause()
        bgMusicRef.current = null
      }
    }
  }, [])

  // Bubble physics animation loop — uses direct DOM updates to avoid React re-renders
  const bubblesRef = useRef([])
  const particlesRef = useRef([])
  const bubbleElsRef = useRef({})

  // Sync React bubbles state to ref when bubbles change (e.g. new word setup)
  useEffect(() => {
    bubblesRef.current = bubbles
  }, [bubbles])

  useEffect(() => {
    if (phase !== 'playing') return

    const animate = () => {
      const bubs = bubblesRef.current
      const width = containerRef.current?.clientWidth || 400
      const height = containerRef.current?.clientHeight || 700
      const safeLeft = 30
      const safeRight = width - 30
      const safeTop = 140
      const safeBottom = height - 220

      // Update positions in-place (no React state)
      for (const bubble of bubs) {
        if (bubble.captured || bubble.popping) continue
        bubble.x += bubble.vx
        bubble.y += bubble.vy
        if (bubble.x <= safeLeft || bubble.x >= safeRight) {
          bubble.vx = -bubble.vx
          bubble.x = bubble.x <= safeLeft ? safeLeft : safeRight
        }
        if (bubble.y <= safeTop || bubble.y >= safeBottom) {
          bubble.vy = -bubble.vy
          bubble.y = bubble.y <= safeTop ? safeTop : safeBottom
        }
      }

      // Bubble-to-bubble collisions
      const minDist = 88
      const active = bubs.filter(b => !b.captured && !b.popping)
      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          const a = active[i], b = active[j]
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < minDist && dist > 0.01) {
            const nx = dx / dist, ny = dy / dist
            const dvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
            if (dvn <= 0) continue
            a.vx -= dvn * nx; a.vy -= dvn * ny
            b.vx += dvn * nx; b.vy += dvn * ny
            const overlap = (minDist - dist) / 2
            a.x -= nx * overlap; a.y -= ny * overlap
            b.x += nx * overlap; b.y += ny * overlap
          }
        }
      }

      // Direct DOM update for bubbles
      for (const bubble of bubs) {
        const el = bubbleElsRef.current[bubble.id]
        if (el) {
          el.style.left = `${bubble.x - 44}px`
          el.style.top = `${bubble.y - 44}px`
        }
      }

      // Update particles via DOM
      const parts = particlesRef.current
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.3
        p.opacity -= 0.02
        if (p.opacity <= 0) {
          if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el)
          parts.splice(i, 1)
        } else if (p.el) {
          p.el.style.left = `${p.x}px`
          p.el.style.top = `${p.y}px`
          p.el.style.opacity = p.opacity
        }
      }

      // Decay screen shake via DOM
      if (screenShakeRef.current > 0) {
        screenShakeRef.current = Math.max(0, screenShakeRef.current - 1)
        if (containerRef.current) {
          const s = screenShakeRef.current
          containerRef.current.style.transform = s > 0
            ? `translate(${Math.sin(s * 2) * 3}px, ${Math.cos(s * 2) * 3}px)`
            : 'none'
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      // Clean up DOM particles
      for (const p of particlesRef.current) {
        if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el)
      }
      particlesRef.current = []
    }
  }, [phase])

  // Handle bubble pop
  const handleBubblePop = useCallback((bubble, currentWordObj) => {
    if (phase !== 'playing' || bubble.captured || bubble.popping || feedback === 'correct') return

    const currentWord = currentWordObj.word
    const nextIndex = placedLetters.length

    // Check if this is the correct next letter
    if (bubble.letter === currentWord[nextIndex]) {
      // CORRECT! Pop and capture
      setBubbles(prev => prev.map(b =>
        b.id === bubble.id ? { ...b, popping: true, captured: true } : b
      ))
      setPlacedLetters(prev => [...prev, { id: bubble.id, letter: bubble.letter }])
      setCombo(prev => prev + 1)

      // Pop sound
      playSound(assetUrl('/sound/pop2.mp3'), 0.3, 1)

      // Create pop particles
      const colors = ['#fbbf24', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6']
      spawnParticles(Array.from({ length: 8 }, (_, i) => ({
        x: bubble.x, y: bubble.y,
        vx: Math.cos(i * Math.PI / 4) * 3,
        vy: Math.sin(i * Math.PI / 4) * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
      })))

    } else {
      // WRONG! Explode and respawn
      setBubbles(prev => prev.map(b =>
        b.id === bubble.id ? { ...b, popping: true } : b
      ))
      setCombo(0)
      screenShakeRef.current = 10

      // Wrong letter on chest word = chest lost
      if (chestEnabled && !chestSpawnedRef.current && wordsCompleted === chestWordRef.current - 1) {
        chestSpawnedRef.current = true
        setChestMissed(true)
        setChestTimer(0)
      }

      // Wrong sound
      playSound(assetUrl('/sound/flappy-hit.mp3'), 0.3)

      // HP loss
      const newPetHp = petHp - 1
      setPetHp(newPetHp)

      if (newPetHp <= 0) {
        setTimeout(() => {
          clearInterval(timerRef.current)
          setPhase('defeated')
        }, 800)
        return
      }

      // Red explosion particles
      spawnParticles(Array.from({ length: 12 }, (_, i) => ({
        x: bubble.x, y: bubble.y,
        vx: Math.cos(i * Math.PI / 6) * 5,
        vy: Math.sin(i * Math.PI / 6) * 5,
        color: '#ef4444',
      })))

      // Respawn bubble after delay in safe zone
      setTimeout(() => {
        const w = containerRef.current?.clientWidth || 400
        const h = containerRef.current?.clientHeight || 700
        setBubbles(prev => prev.map(b =>
          b.id === bubble.id
            ? {
                ...b,
                popping: false,
                x: Math.random() * (w - 60) + 30,
                y: Math.random() * (h - 400) + 140,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5,
              }
            : b
        ))
      }, 300)
    }
  }, [phase, feedback, placedLetters, chestEnabled, wordsCompleted, playSound])

  // Skip current word
  const handleSkip = useCallback(() => {
    if (phase !== 'playing' || feedback === 'correct') return
    streakRef.current = Math.max(0, streakRef.current - 1)

    // If skipping the chest word, chest is lost
    if (chestEnabled && !chestSpawnedRef.current && wordsCompleted === chestWordRef.current - 1) {
      chestSpawnedRef.current = true
      setChestMissed(true)
      setChestTimer(0)
    }

    setCombo(0)
    setSkippedWords(prev => [...prev, words[wordIndex]])

    const newPetHp = petHp - 1
    setPetHp(newPetHp)

    if (newPetHp <= 0) {
      setTimeout(() => {
        clearInterval(timerRef.current)
        setPhase('defeated')
      }, 800)
      return
    }

    const nextIdx = wordIndex + 1
    if (nextIdx < words.length) {
      setWordIndex(nextIdx)
      const width = containerRef.current?.clientWidth || 400
      const height = containerRef.current?.clientHeight || 700
      setupWord(words, nextIdx, width, height)
    } else {
      const source = wordBankProp
      const moreWords = pickGameWords(source, currentLevel)
      setWords(moreWords)
      setWordIndex(0)
      scoredWordIndexRef.current = -1
      const width = containerRef.current?.clientWidth || 400
      const height = containerRef.current?.clientHeight || 700
      setupWord(moreWords, 0, width, height)
    }
  }, [phase, feedback, wordIndex, words, setupWord, wordBankProp, chestEnabled, wordsCompleted])

  // Handle tapping a placed letter to remove it
  const handlePlacedTap = useCallback((letterObj) => {
    if (phase !== 'playing' || feedback === 'correct') return

    // Remove from placed
    setPlacedLetters(prev => prev.filter(l => l.id !== letterObj.id))
    // Un-capture bubble
    setBubbles(prev => prev.map(b =>
      b.id === letterObj.id ? { ...b, captured: false, popping: false } : b
    ))
  }, [phase, feedback])

  // Check if word is complete
  useEffect(() => {
    if (phase !== 'playing' || !words[wordIndex]) return

    const currentWord = words[wordIndex].word
    if (placedLetters.length !== currentWord.length) return

    const attempt = placedLetters.map(l => l.letter).join('')

    if (attempt === currentWord) {
      // Guard: don't score the same word twice
      if (scoredWordIndexRef.current === wordIndex) return
      scoredWordIndexRef.current = wordIndex

      // Correct! Word complete!
      const newStreak = streakRef.current + 1
      streakRef.current = newStreak

      const lengthBonus = Math.max(0, currentWord.length - 4) * 5
      const bonus = newStreak > 1 ? STREAK_BONUS * (newStreak - 1) : 0
      const points = POINTS_PER_WORD + lengthBonus + bonus
      scoreRef.current += points
      setDisplayScore(scoreRef.current)
      setWordsCompleted(prev => prev + 1)

      // Broadcast progress for realtime PvP
      if (onProgressUpdate) {
        onProgressUpdate({ score: scoreRef.current, wordsCompleted: wordsCompleted + 1, wordIndex: wordIndex + 1 })
      }

      setFeedback('correct')
      screenShakeRef.current = 15
      setWordPopup({ points, streak: newStreak, combo })
      setTimeout(() => setWordPopup(null), 1200)

      // Victory sound
      playSound(assetUrl('/sound/scram-correct.mp3'), 0.5, 1.2)

      // Big celebration particles
      const colors = ['#fbbf24', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981']
      spawnParticles(Array.from({ length: 30 }, (_, i) => ({
        x: (containerRef.current?.clientWidth || 400) / 2,
        y: (containerRef.current?.clientHeight || 700) / 2,
        vx: Math.cos(i * Math.PI / 15) * (5 + Math.random() * 3),
        vy: Math.sin(i * Math.PI / 15) * (5 + Math.random() * 3),
        color: colors[Math.floor(Math.random() * colors.length)],
      })))

      // Chest check
      if (chestEnabled && !chestSpawnedRef.current && wordsCompleted === chestWordRef.current - 1) {
        chestSpawnedRef.current = true
        setChestCollected(true)
        setChestTimer(0)
        setChestPopup(true)
        setTimeout(() => setChestPopup(false), 1500)
      }

      // Advance to next word after brief delay
      setTimeout(() => {
        const nextIdx = wordIndex + 1
        if (nextIdx < words.length) {
          setWordIndex(nextIdx)
          const width = containerRef.current?.clientWidth || 400
          const height = containerRef.current?.clientHeight || 700
          setupWord(words, nextIdx, width, height)
        } else {
          // Pick more words and continue — replace array to avoid unbounded growth
          const source = wordBankProp
          const moreWords = pickGameWords(source, currentLevel)
          setWords(moreWords)
          setWordIndex(0)
          scoredWordIndexRef.current = -1
          const width = containerRef.current?.clientWidth || 400
          const height = containerRef.current?.clientHeight || 700
          setupWord(moreWords, 0, width, height)
        }
      }, 800)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedLetters, phase, words, wordIndex, setupWord])

  const currentWord = words[wordIndex]
  return createPortal(
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black/70 flex items-center justify-center">
      <style>{`
        @keyframes scramblePopIn {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes scrambleCorrect {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        @keyframes scrambleShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        @keyframes scrambleFloat {
          0%, 100% { transform: translateY(-4px); }
          50% { transform: translateY(4px); }
        }
        @keyframes scrambleResultsFadeIn {
          0% { opacity: 0; transform: translateY(30px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes scrambleScorePopIn {
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
        @keyframes streakPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes timerUrgent {
          0%, 100% { transform: scale(1) rotate(0deg); }
          15% { transform: scale(1.1) rotate(-3deg); }
          30% { transform: scale(1) rotate(3deg); }
          45% { transform: scale(1.05) rotate(-2deg); }
          60% { transform: scale(1) rotate(0deg); }
        }
        @keyframes timerRingSpin {
          0% { filter: hue-rotate(0deg); }
          100% { filter: hue-rotate(360deg); }
        }
        @keyframes letterBounceIn {
          0% { transform: scale(0) rotate(-10deg); }
          60% { transform: scale(1.15) rotate(3deg); }
          100% { transform: scale(1) rotate(0deg); }
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
        ref={containerRef}
        className="relative w-full max-w-[400px] h-full max-h-[100dvh] overflow-hidden rounded-none sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl"
        style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
      >

      {/* Decorative circles */}
      <div className="absolute top-[-10%] right-[-5%] w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[-10%] w-80 h-80 rounded-full bg-white/5 pointer-events-none" />

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
        <div className="flex flex-col items-center gap-6 p-8 text-center">
          {/* Pet */}
          <div className="flex items-center gap-4" style={{ animation: 'scrambleFloat 1.5s ease-in-out infinite' }}>
            {petImageUrl ? (
              <img src={petImageUrl} alt={petName} className="w-24 h-24 object-contain drop-shadow-lg"
                onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = ''; }}
              />
            ) : null}
            <span className="text-7xl" style={{ display: petImageUrl ? 'none' : '' }}>🔤</span>
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
              Word Scramble
            </h2>
            <p className="text-lg text-white/80 mb-1">
              Pop the bubbles in the right order!
            </p>
            <p className="text-sm text-white/60">
              Train {petName}&apos;s brain!
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
            className="px-10 py-4 bg-white text-purple-700 rounded-full font-bold text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform border-b-4 border-purple-200"
          >
            Start!
          </button>
        </div>
      )}

      {/* Playing Phase */}
      {phase === 'playing' && currentWord && (
        <div
          ref={(el) => { gameAreaRef.current = el; containerRef.current = el }}
          className="w-full h-full relative"
        >
          {/* Floating Bubbles */}
          {bubbles.map(bubble => {
            const nextLetter = currentWord?.word?.[placedLetters.length]
            const isNext = !bubble.captured && !bubble.popping && bubble.letter === nextLetter
            return (
            <button
              key={bubble.id}
              ref={(el) => { if (el) bubbleElsRef.current[bubble.id] = el; else delete bubbleElsRef.current[bubble.id] }}
              onPointerDown={(e) => { e.preventDefault(); handleBubblePop(bubble, currentWord) }}
              disabled={bubble.captured || bubble.popping}
              className={`absolute rounded-full font-bold text-3xl uppercase flex items-center justify-center cursor-pointer touch-none ${
                bubble.captured
                  ? 'opacity-0 scale-0'
                  : bubble.popping
                    ? 'scale-150 opacity-0'
                    : 'bg-gradient-to-br from-yellow-300 to-orange-400 text-white shadow-2xl border-4 border-white/50 hover:scale-110 active:scale-90'
              }`}
              style={{
                left: `${bubble.x - 44}px`,
                top: `${bubble.y - 44}px`,
                width: '88px',
                height: '88px',
                zIndex: isNext ? 5 : 1,
                transition: bubble.popping ? 'all 0.3s ease-out' : 'transform 0.15s ease-out',
                boxShadow: bubble.captured || bubble.popping ? 'none' : '0 8px 20px rgba(0,0,0,0.3), inset 0 -4px 8px rgba(0,0,0,0.2)',
                textShadow: '0 2px 4px rgba(0,0,0,0.3)',
              }}
            >
              {!bubble.popping && bubble.letter}
            </button>
            )
          })}

          {/* Particles are DOM-managed via particlesRef */}

          {/* === TOP HUD === */}
          <div className="absolute top-0 left-0 right-0 p-4 z-10 pointer-events-none">
            <div className="w-full max-w-md mx-auto flex flex-col items-center gap-2 pointer-events-auto">
              {/* Score / Pet / Timer row */}
              <div className="w-full flex items-center justify-between pl-12">
                <div className="flex flex-col items-start gap-1">
                  <div className="bg-white/20 backdrop-blur rounded-2xl px-4 py-2 flex items-center gap-2">
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

                {(() => {
                  const pct = displayTime / GAME_DURATION
                  const radius = 22
                  const circumference = 2 * Math.PI * radius
                  const offset = circumference * (1 - pct)
                  const color = displayTime <= 5 ? '#ef4444' : displayTime <= 10 ? '#f97316' : displayTime <= 20 ? '#eab308' : '#22c55e'
                  return (
                    <div
                      className="relative flex items-center justify-center"
                      style={{
                        animation: displayTime <= 5
                          ? 'timerUrgent 0.5s ease-in-out infinite'
                          : displayTime <= 10
                            ? 'timerUrgent 1s ease-in-out infinite'
                            : 'none'
                      }}
                    >
                      <svg width="56" height="56" className="drop-shadow-lg" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="28" cy="28" r={radius} fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
                        <circle
                          cx="28" cy="28" r={radius}
                          fill="none"
                          stroke={color}
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={offset}
                          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                        />
                      </svg>
                      <span
                        className="absolute font-black text-white"
                        style={{
                          fontSize: displayTime < 10 ? '18px' : '16px',
                          textShadow: `0 0 8px ${color}80, 0 1px 2px rgba(0,0,0,0.3)`,
                        }}
                      >
                        {displayTime}
                      </span>
                    </div>
                  )
                })()}

                {/* Mute Button */}
                <button
                  onClick={() => {
                    setMuted(prev => {
                      const next = !prev
                      if (bgMusicRef.current) bgMusicRef.current.muted = next
                      return next
                    })
                  }}
                  className="bg-white/20 backdrop-blur rounded-full p-1.5"
                >
                  {muted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
                </button>
              </div>

              {/* Realtime PvP scoreboard */}
              {isRealtimePvP && opponentProgress && (
                <div className="flex items-center justify-center gap-3 w-full max-w-xs mx-auto">
                  <div className="flex items-center gap-2 flex-1 justify-end">
                    {petImageUrl && <img src={petImageUrl} alt={petName} className="w-10 h-10 object-contain drop-shadow-lg" />}
                    <span className={`text-2xl font-black ${displayScore > opponentProgress.score ? 'text-green-300' : displayScore < opponentProgress.score ? 'text-white/60' : 'text-white'}`}
                      style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>{displayScore}</span>
                  </div>
                  <span className="text-white/30 font-black text-sm">vs</span>
                  <div className="flex items-center gap-2 flex-1">
                    <span className={`text-2xl font-black ${opponentProgress.score > displayScore ? 'text-red-300' : opponentProgress.score < displayScore ? 'text-white/60' : 'text-white'}`}
                      style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>{opponentProgress.score}</span>
                    {pvpOpponentPetUrl && <img src={pvpOpponentPetUrl} alt="Opponent" className="w-10 h-10 object-contain drop-shadow-lg" style={{ transform: 'scaleX(-1)' }} />}
                  </div>
                </div>
              )}

              {/* Hint + Streak/Combo */}
              <div className="w-full flex items-center gap-2">
                <div className={`rounded-full px-2.5 py-1 text-xs font-bold flex items-center gap-1 shrink-0 ${
                  streakRef.current >= 3 ? 'bg-yellow-400 text-yellow-900' : 'bg-white/20 text-white/70'
                }`}>
                  <img src={assetUrl('/icon/profile/streak.svg')} alt="streak" className="w-3.5 h-3.5" />{streakRef.current}x
                </div>
                <div className="flex-1 bg-white/10 backdrop-blur rounded-xl px-4 py-2 text-center min-w-0">
                  <span className="text-sm text-white/60 mr-2">Hint:</span>
                  <span className="text-xl font-bold text-white">{currentWord.hint}</span>
                </div>
                <div className={`rounded-full px-2.5 py-1 text-xs font-bold shrink-0 ${
                  combo > 5 ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' : 'bg-white/20 text-white/70'
                }`}>
                  {combo}x
                </div>
              </div>

            </div>

            {/* Progress bar - outside pointer-events-auto wrapper */}
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
                    width: `${Math.min(100, (wordsCompleted / star3Goal) * 100)}%`,
                    background: 'linear-gradient(180deg, #c4b5fd 0%, #7c3aed 50%, #6d28d9 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 0 6px rgba(139,92,246,0.6)',
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

            {/* Chest indicator - only show on the chest word */}
            {chestWordIndex >= 0 && !chestCollected && !chestMissed && wordsCompleted === chestWordIndex - 1 && chestTimer > 0 && (
              <div className="flex flex-col items-center mt-2 gap-1">
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${chestTimer <= 3 ? 'bg-red-500/40' : 'bg-amber-500/30'}`} style={{ animation: chestTimer <= 3 ? 'hintPulse 0.5s ease-in-out infinite' : 'hintPulse 1s ease-in-out infinite' }}>
                  <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-6 h-6 object-contain" />
                  <span className={`text-xs font-bold ${chestTimer <= 3 ? 'text-red-300' : 'text-amber-300'}`}>{chestTimer}s</span>
                </div>
                <div className="w-24 h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${chestTimer <= 3 ? 'bg-red-400' : 'bg-amber-400'}`}
                    style={{ width: `${(chestTimer / 10) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* === CHEST POPUP === */}
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

          {/* === CHEST MISSED POPUP === */}
          {chestMissed && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-2" style={{ animation: 'chestPopupAnim 1.5s ease-out forwards' }}
                onAnimationEnd={() => setChestMissed(false)}
              >
                <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-16 h-16 object-contain opacity-50 grayscale" />
                <div className="bg-red-500 text-white rounded-full px-4 py-1.5 font-bold text-sm shadow-lg">
                  Chest Lost!
                </div>
              </div>
            </div>
          )}

          {/* === WORD COMPLETE POPUP === */}
          {wordPopup && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-1" style={{ animation: 'wordPopupAnim 1.2s ease-out forwards' }}>
                <div className="text-3xl font-black text-white drop-shadow-lg">+{wordPopup.points}</div>
                {wordPopup.streak > 1 && (
                  <div className="flex items-center gap-1 bg-yellow-400 text-yellow-900 rounded-full px-3 py-1 text-sm font-bold">
                    <img src={assetUrl('/icon/profile/streak.svg')} alt="streak" className="w-4 h-4" />{wordPopup.streak}x streak
                  </div>
                )}
                {wordPopup.combo > 5 && (
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full px-3 py-1 text-sm font-bold">
                    {wordPopup.combo}x combo
                  </div>
                )}
              </div>
            </div>
          )}

          {/* === BOTTOM: Answer Slots === */}
          <div className="absolute bottom-0 left-0 right-0 pb-8 pt-4 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 100%)' }}
          >
            <div className="w-full max-w-md mx-auto flex flex-col items-center gap-3 pointer-events-auto">
              {/* Answer slots */}
              <div
                className="flex gap-2 justify-center flex-wrap"
                style={{
                  animation: feedback === 'correct'
                    ? 'scrambleCorrect 0.4s ease-out'
                    : 'none'
                }}
              >
                {currentWord.word.split('').map((_, i) => {
                  const placed = placedLetters[i]
                  return (
                    <button
                      key={i}
                      onClick={() => placed && handlePlacedTap(placed)}
                      className={`w-11 h-12 rounded-xl font-bold text-xl uppercase flex items-center justify-center transition-all ${
                        placed
                          ? feedback === 'correct'
                            ? 'bg-green-400 text-white border-2 border-green-500 shadow-lg'
                            : 'bg-white text-purple-800 border-2 border-purple-200 shadow-md cursor-pointer hover:scale-105 active:scale-95'
                          : 'bg-white/20 border-2 border-dashed border-white/40'
                      }`}
                      disabled={!placed || feedback === 'correct'}
                      style={placed ? { animation: 'letterBounceIn 0.25s ease-out' } : {}}
                    >
                      {placed?.letter || ''}
                    </button>
                  )
                })}
              </div>

              {/* Skip + Instruction */}
              <div className="flex items-center gap-3">

                <button
                  onClick={handleSkip}
                  className="text-xs text-white/50 hover:text-white/80 underline transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Defeated Phase */}
      {phase === 'defeated' && (
        <div className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto p-6 z-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center my-auto"
            style={{ animation: 'scrambleResultsFadeIn 0.5s ease-out' }}
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-4"
              style={{ animation: 'scrambleScorePopIn 0.6s ease-out 0.3s both' }}
            >
              <Heart className="w-10 h-10 text-red-400" />
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-1">Defeated!</h2>
            <p className="text-gray-500 mb-5">{petName} ran out of lives!</p>

            <div className="rounded-2xl p-5 mb-5 border bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200"
              style={{ animation: 'scrambleScorePopIn 0.6s ease-out 0.5s both' }}
            >
              <p className="text-5xl font-black text-gray-400">{wordsCompleted}</p>
              <p className="text-sm font-semibold mt-1 text-gray-400">words completed</p>
            </div>

            {skippedWords.length > 0 && (
              <div className="mb-5 text-left">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">Words to Practice</p>
                <div className="max-h-[180px] overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {skippedWords.map((w, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <span className="font-bold text-sm text-gray-800">{w.word}</span>
                      <span className="text-xs text-gray-400 ml-auto">{w.hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-sm text-gray-600 mb-6">Try to keep your lives! Wrong pops cost a heart.</p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setPhase('ready'); setDisplayScore(0); setWordsCompleted(0) }}
                className="w-full py-3.5 bg-gradient-to-b from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-purple-700 active:border-b-0 active:mt-1 transition-all"
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
            style={{ animation: 'scrambleResultsFadeIn 0.5s ease-out' }}
          >
            {/* Star display */}
            <div className="flex justify-center gap-1 mb-4">
              {[1, 2, 3].map(s => (
                <Star key={s} className={`w-12 h-12 transition-all ${starsEarned >= s ? 'text-yellow-400 fill-yellow-400 drop-shadow-lg' : 'text-gray-300'}`}
                  style={{ animation: starsEarned >= s ? `scrambleScorePopIn 0.5s ease-out ${0.2 + s * 0.15}s both` : 'scrambleScorePopIn 0.5s ease-out 0.3s both' }}
                />
              ))}
            </div>

            {isRealtimePvP && opponentProgress ? (
              <>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">
                  {displayScore > opponentProgress.score ? 'You Win!' : displayScore < opponentProgress.score ? 'You Lose!' : "It's a Tie!"}
                </h2>
                <p className="text-gray-500 mb-5">
                  {displayScore > opponentProgress.score ? 'Great scrambling skills!' : displayScore < opponentProgress.score ? 'Better luck next time!' : 'Evenly matched!'}
                </p>
                <div className="flex items-center justify-center gap-4 mb-5">
                  <div className={`rounded-2xl p-4 border flex-1 ${displayScore >= opponentProgress.score ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}
                    style={{ animation: 'scrambleScorePopIn 0.6s ease-out 0.5s both' }}>
                    <p className="text-xs font-semibold text-gray-400 mb-1">You</p>
                    <p className={`text-3xl font-black ${displayScore >= opponentProgress.score ? 'text-green-600' : 'text-gray-400'}`}>{displayScore}</p>
                    <p className="text-xs text-gray-400 mt-1">{wordsCompleted} words</p>
                  </div>
                  <span className="text-gray-300 font-bold text-lg">VS</span>
                  <div className={`rounded-2xl p-4 border flex-1 ${opponentProgress.score >= displayScore ? 'bg-gradient-to-br from-red-50 to-pink-50 border-red-200' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}
                    style={{ animation: 'scrambleScorePopIn 0.6s ease-out 0.7s both' }}>
                    <p className="text-xs font-semibold text-gray-400 mb-1">Opponent</p>
                    <p className={`text-3xl font-black ${opponentProgress.score >= displayScore ? 'text-red-600' : 'text-gray-400'}`}>{opponentProgress.score}</p>
                    <p className="text-xs text-gray-400 mt-1">{opponentProgress.wordsCompleted} words</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">
                  {starsEarned >= 3 ? 'Perfect Score!' : starsEarned >= 2 ? 'Great Job!' : starsEarned >= 1 ? 'Training Complete!' : 'Not Enough Words!'}
                </h2>
                <p className="text-gray-500 mb-5">
                  {starsEarned >= 1
                    ? `${petName} learned ${wordsCompleted} words!`
                    : `${petName} only learned ${wordsCompleted}/${passGoal} words`}
                </p>

                <div
                  className={`rounded-2xl p-5 mb-5 border ${
                    starsEarned >= 3 ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200'
                    : starsEarned >= 1 ? 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-100'
                    : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'
                  }`}
                  style={{ animation: 'scrambleScorePopIn 0.6s ease-out 0.5s both' }}
                >
                  <p className={`text-5xl font-black ${
                    starsEarned >= 3 ? 'text-yellow-500' : starsEarned >= 1 ? 'text-purple-600' : 'text-gray-400'
                  }`}>{wordsCompleted}</p>
                  <p className={`text-sm font-semibold mt-1 ${
                    starsEarned >= 3 ? 'text-yellow-400' : starsEarned >= 1 ? 'text-purple-400' : 'text-gray-400'
                  }`}>words completed</p>
                </div>
              </>
            )}

            {/* Skipped Words */}
            {skippedWords.length > 0 && (
              <div className="mb-5 text-left">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">Words to Practice</p>
                <div className="max-h-[180px] overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {skippedWords.map((w, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <span className="font-bold text-sm text-gray-800">{w.word}</span>
                      <span className="text-xs text-gray-400 ml-auto">{w.hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isRealtimePvP && (
              <p className="text-sm text-gray-600 mb-6">
                {starsEarned >= 3
                  ? 'Vocabulary master! Perfect performance!'
                  : starsEarned >= 2
                    ? `Amazing speller! Get ${star3Goal} words for 3 stars!`
                    : starsEarned >= 1
                      ? `Good job! Get ${star2Goal} words for 2 stars!`
                      : `Need at least ${star1Goal} words to earn a star. Try again!`}
              </p>
            )}

            {chestCollected && (
              <div className="mb-4 flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-8 h-8 object-contain" />
                <span className="font-bold text-amber-700">Chest collected!</span>
              </div>
            )}

            {isRealtimePvP || starsEarned >= 1 ? (
              <button
                onClick={() => onGameEnd(displayScore, { chestCollected, wordsCompleted, stars: starsEarned })}
                className="w-full py-3.5 bg-gradient-to-b from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-purple-700 active:border-b-0 active:mt-1 transition-all"
              >
                {isRealtimePvP ? 'Done' : 'Collect Rewards'}
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setPhase('ready')
                    setDisplayScore(0)
                    setWordsCompleted(0)
                  }}
                  className="w-full py-3.5 bg-gradient-to-b from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-purple-700 active:border-b-0 active:mt-1 transition-all"
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

export default PetWordScramble
