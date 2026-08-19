import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Star, Volume2, VolumeX, Heart } from 'lucide-react'

import { assetUrl } from '../../../hooks/useBranding';

const POINTS_PER_WORD = 10
const STREAK_BONUS = 5
const START_LIVES = 3
const LIVES_CAP = 5
// Words typed with no hint and no wrong letter that refill a life.
const COMBO_FOR_LIFE = 8
// Revealing a letter now burns clock as well as points.
const HINT_TIME_COST = 1.5
// Survival: the per-word clock shrinks as the run goes on. Long words start
// with proportionally more time — a 9-letter word on an early 12s clock would
// otherwise be pure luck — but the floor applies to the total, so every word
// converges on the same 3s however long it is.
const FIRST_WORD_SECONDS = 12
const MIN_WORD_SECONDS = 3
const fuseForWord = (n, wordLen = 5) =>
  Math.max(MIN_WORD_SECONDS, FIRST_WORD_SECONDS + Math.max(0, wordLen - 4) * 0.4 - (n - 1) * 0.3)
// Realtime PvP compares two scores head to head, so both players still have to
// stop at the same moment — that mode keeps a hard cap on top of survival.
const PVP_TIME_CAP = 76

const fuseColor = (remaining) =>
  remaining <= 3 ? '#ef4444' : remaining <= 5 ? '#f97316' : remaining <= 8 ? '#eab308' : '#22c55e'

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const pickGameWords = (source, level = 1) => {
  const filtered = source.filter(w => !w.min_level || w.min_level <= level)
  const short = shuffle(filtered.filter(w => w.word.length <= 4)).slice(0, 6)
  const medium = shuffle(filtered.filter(w => w.word.length === 5)).slice(0, 5)
  const long = shuffle(filtered.filter(w => w.word.length === 6)).slice(0, 5)
  const longer = shuffle(filtered.filter(w => w.word.length >= 7)).slice(0, 4)
  const buckets = [short, medium, long, longer]
  const picked = []
  const maxLen = Math.max(...buckets.map(b => b.length))
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of buckets) {
      if (i < bucket.length) picked.push(bucket[i])
    }
  }
  if (picked.length < 20) {
    const pickedWords = new Set(picked.map(w => w.word))
    const remaining = shuffle(source.filter(w => !pickedWords.has(w.word)))
    picked.push(...remaining.slice(0, 20 - picked.length))
  }
  return picked
}

// Words typed before the pet runs out of lives.
const STAR_THRESHOLDS = {
  1: [12, 20, 28],
  2: [15, 24, 32],
  3: [18, 28, 36],
  4: [20, 32, 40],
}

const PetWordType = ({ petImageUrl, petName, onGameEnd, onClose, wordBank: wordBankProp = [], hideClose = false, scoreToBeat = null, leaderboard = [], chestEnabled = false, pvpOpponentPetUrl = null, initialWords = null, onProgressUpdate = null, opponentProgress = null, isRealtimePvP = false, currentLevel = 1 }) => {
  const thresholds = STAR_THRESHOLDS[currentLevel] || [12, 20, 28]
  const [star1Goal, star2Goal, star3Goal] = thresholds
  const passGoal = star1Goal
  const [phase, setPhase] = useState('ready')
  const [displayScore, setDisplayScore] = useState(0)
  const [pvpTimeLeft, setPvpTimeLeft] = useState(PVP_TIME_CAP)
  const [words, setWords] = useState([])
  const [wordIndex, setWordIndex] = useState(0)
  const [typedValue, setTypedValue] = useState('')
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState(null) // 'correct' | 'wrong' | null

  const [wordsCompleted, setWordsCompleted] = useState(0)
  const starsEarned = wordsCompleted >= star3Goal ? 3 : wordsCompleted >= star2Goal ? 2 : wordsCompleted >= star1Goal ? 1 : 0
  const [skippedWords, setSkippedWords] = useState([])
  const [muted, setMuted] = useState(false)
  const [wordPopup, setWordPopup] = useState(null)
  const [screenShake, setScreenShake] = useState(0)
  const [particles, setParticles] = useState([])
  const [hintRevealed, setHintRevealed] = useState(0) // number of letters revealed
  const [chestCollected, setChestCollected] = useState(false)
  const [chestPopup, setChestPopup] = useState(false)
  const [isChestWord, setIsChestWord] = useState(false)
  const [chestTimer, setChestTimer] = useState(0)
  const [lives, setLives] = useState(START_LIVES)
  const [combo, setCombo] = useState(0)
  const [lifeGained, setLifeGained] = useState(false)
  const [timeUp, setTimeUp] = useState(false)
  // Flips once per word rather than per frame — the fuse itself is written
  // straight to the DOM in the rAF loop.
  const [danger, setDanger] = useState(false)

  const scoreRef = useRef(0)
  const streakRef = useRef(0)
  const audioCache = useRef({})
  const livesRef = useRef(START_LIVES)
  const comboRef = useRef(0)
  const wordsCompletedRef = useRef(0)
  // True once the player used a hint or typed a wrong letter on this word —
  // it breaks the clean run that buys a life back.
  const flawedRef = useRef(false)

  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const bgMusicRef = useRef(null)
  const animFrameRef = useRef(null)
  const shakeRef = useRef(0)
  const chestSpawnedRef = useRef(false)
  const chestWordRef = useRef(0)
  const wordStartRef = useRef(Date.now())
  // Fuse state lives in refs: it animates at 60fps and a setState per frame
  // would re-render the letter grid and restart its animations.
  const wordNumRef = useRef(0)
  const fuseEndRef = useRef(0)
  const fuseMaxRef = useRef(FIRST_WORD_SECONDS)
  const fuseBarRef = useRef(null)
  const fuseNumRef = useRef(null)
  const runningRef = useRef(false)
  const dangerRef = useRef(false)
  // Set once the run is over, so a pending word-transition timeout can't
  // restart the clock after the PvP cap (or the last life) ended the game.
  const endedRef = useRef(false)
  const mountedRef = useRef(true)

  const playSound = useCallback((url, volume = 0.5, rate = 1) => {
    try {
      if (!audioCache.current[url]) audioCache.current[url] = new Audio(url)
      const sound = audioCache.current[url]
      sound.volume = volume
      sound.playbackRate = rate
      sound.currentTime = 0
      sound.play().catch(() => {})
    } catch {}
  }, [])

  const currentWord = words[wordIndex]

  const paintFuse = useCallback((remaining, max) => {
    const pct = max > 0 ? Math.max(0, Math.min(1, remaining / max)) : 0
    const color = fuseColor(remaining)
    if (fuseBarRef.current) {
      fuseBarRef.current.style.width = `${pct * 100}%`
      fuseBarRef.current.style.background = color
    }
    if (fuseNumRef.current) {
      fuseNumRef.current.textContent = remaining >= 10 ? String(Math.ceil(remaining)) : remaining.toFixed(1)
      fuseNumRef.current.style.color = remaining <= 5 ? color : '#ffffff'
    }
  }, [])

  // Arm the clock for the word about to be shown.
  const startFuse = useCallback((wordLen) => {
    wordNumRef.current += 1
    const duration = fuseForWord(wordNumRef.current, wordLen)
    fuseMaxRef.current = duration
    fuseEndRef.current = performance.now() + duration * 1000
    // Paint a full clock immediately so the new word never flashes the old one.
    paintFuse(duration, duration)
    dangerRef.current = false
    setDanger(false)
    wordStartRef.current = Date.now()
    runningRef.current = true
  }, [paintFuse])

  const advanceWord = useCallback(() => {
    if (endedRef.current) return
    setTypedValue('')
    setFeedback(null)
    setHintRevealed(0)
    flawedRef.current = false

    const nextIdx = wordIndex + 1
    let nextWord
    if (nextIdx < words.length) {
      nextWord = words[nextIdx]
      setWordIndex(nextIdx)
    } else {
      const moreWords = pickGameWords(wordBankProp, currentLevel)
      nextWord = moreWords[0]
      setWords(moreWords)
      setWordIndex(0)
    }
    startFuse(nextWord?.word?.length || 5)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [wordIndex, words, wordBankProp, currentLevel, startFuse])

  const endGame = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true
    runningRef.current = false
    setPhase('results')
  }, [])

  // Every life loss funnels through here so the combo meter, the death check
  // and the heart animation stay in one place. Returns true if the run is over.
  const loseLife = useCallback(() => {
    comboRef.current = 0
    setCombo(0)
    flawedRef.current = true
    const remaining = livesRef.current - 1
    livesRef.current = remaining
    setLives(remaining)
    if (remaining <= 0) {
      runningRef.current = false
      return true
    }
    return false
  }, [])

  const handleCheck = useCallback(() => {
    if (phase !== 'playing' || !currentWord || !runningRef.current) return

    const answer = typedValue.trim().toLowerCase()
    const correct = currentWord.word.toLowerCase()

    if (answer === correct) {
      // CORRECT — freeze the clock for the celebration beat
      runningRef.current = false
      const newStreak = streakRef.current + 1
      streakRef.current = newStreak
      setStreak(newStreak)

      // Points: base + streak + speed + length + no-hint
      let points = POINTS_PER_WORD
      if (newStreak >= 3) points += STREAK_BONUS

      // Speed bonus
      const elapsed = (Date.now() - wordStartRef.current) / 1000
      if (elapsed < 3) points += 5
      else if (elapsed < 5) points += 3
      else if (elapsed < 8) points += 1

      // Word length bonus
      const len = currentWord.word.length
      if (len >= 7) points += 8
      else if (len >= 6) points += 5
      else if (len >= 5) points += 2

      // Bonus for no hints used
      if (hintRevealed === 0) points += 5

      scoreRef.current += points
      setDisplayScore(scoreRef.current)
      wordsCompletedRef.current += 1
      setWordsCompleted(wordsCompletedRef.current)

      // Clean-typing meter — a run of words with no hint and no wrong letter
      // buys a life back, which is the only way survival goes long.
      let gainedLife = false
      if (flawedRef.current) {
        comboRef.current = 0
        setCombo(0)
      } else {
        const newCombo = comboRef.current + 1
        if (newCombo >= COMBO_FOR_LIFE) {
          comboRef.current = 0
          setCombo(0)
          if (livesRef.current < LIVES_CAP) {
            livesRef.current += 1
            setLives(livesRef.current)
            gainedLife = true
            setLifeGained(true)
            setTimeout(() => setLifeGained(false), 1600)
          }
        } else {
          comboRef.current = newCombo
          setCombo(newCombo)
        }
      }

      if (chestEnabled && !chestSpawnedRef.current && wordsCompleted + 1 >= chestWordRef.current && currentWord.word.length >= 6) {
        chestSpawnedRef.current = true
        setChestCollected(true)
        setIsChestWord(false)
        setChestTimer(0)
        setChestPopup(true)
        setTimeout(() => setChestPopup(false), 1500)
      }

      // Broadcast progress for realtime PvP
      if (onProgressUpdate) {
        onProgressUpdate({ score: scoreRef.current, wordsCompleted: wordsCompleted + 1, wordIndex: wordIndex + 1 })
      }

      setFeedback('correct')

      setWordPopup({ points, streak: newStreak, gainedLife })
      setTimeout(() => setWordPopup(null), 1200)

      // Celebration particles
      const colors = ['#a78bfa', '#f472b6', '#facc15', '#34d399', '#60a5fa']
      const celebrationParticles = Array.from({ length: 12 }, (_, i) => ({
        id: `p-${Date.now()}-${i}`,
        x: (containerRef.current?.clientWidth || 400) / 2 + (Math.random() - 0.5) * 100,
        y: (containerRef.current?.clientHeight || 700) / 2,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: 1,
      }))
      setParticles(prev => [...prev, ...celebrationParticles])

      if (!muted) playSound(assetUrl('/sound/scram-correct.mp3'), 0.4)

      setTimeout(() => {
        if (!mountedRef.current || endedRef.current) return
        advanceWord()
      }, 600)
    } else {
      // WRONG
      streakRef.current = 0
      setStreak(0)
      setFeedback('wrong')
      shakeRef.current = 10
      setScreenShake(10)

      if (!muted) playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)

      if (loseLife()) {
        setTimeout(() => {
          if (mountedRef.current) endGame()
        }, 800)
        return
      }

      setTimeout(() => {
        // Reset to just the revealed prefix
        setTypedValue(currentWord.word.slice(0, hintRevealed))
        setFeedback(null)
        inputRef.current?.focus()
      }, 600)
    }
  }, [phase, currentWord, typedValue, hintRevealed, advanceWord, muted, loseLife, endGame, playSound, chestEnabled, wordsCompleted, wordIndex, onProgressUpdate])

  // Auto-submit when all letters are typed
  useEffect(() => {
    if (phase !== 'playing' || !currentWord || feedback) return
    if (typedValue.length === currentWord.word.length) {
      handleCheck()
    }
  }, [typedValue, phase, currentWord, feedback, handleCheck])

  const handleSkip = useCallback(() => {
    if (!currentWord || !runningRef.current) return
    runningRef.current = false
    // Skipping chest word = chest lost
    if (chestEnabled && !chestSpawnedRef.current && wordsCompleted === chestWordRef.current - 1) {
      chestSpawnedRef.current = true
      setIsChestWord(false)
      setChestTimer(0)
    }
    streakRef.current = 0
    setStreak(0)
    setSkippedWords(prev => [...prev, currentWord])

    if (loseLife()) {
      setTimeout(() => {
        if (mountedRef.current) endGame()
      }, 800)
      return
    }

    advanceWord()
  }, [currentWord, advanceWord, chestEnabled, wordsCompleted, loseLife, endGame])

  const handleRevealHint = useCallback(() => {
    if (!currentWord || !runningRef.current) return
    const maxReveal = Math.max(1, currentWord.word.length - 1)
    const newRevealed = Math.min(hintRevealed + 1, maxReveal)
    // A hint costs clock as well as the no-hint bonus, and breaks the clean run.
    fuseEndRef.current -= HINT_TIME_COST * 1000
    flawedRef.current = true
    shakeRef.current = 6
    setHintRevealed(newRevealed)
    // Pre-fill typed value with revealed letters
    const revealed = currentWord.word.slice(0, newRevealed)
    setTypedValue(prev => {
      const after = prev.slice(newRevealed)
      return revealed + after
    })
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [currentWord, hintRevealed])

  // The word clock ran out: lose a life, bank the word for practice, move on.
  const handleTimeUp = useCallback(() => {
    if (!runningRef.current) return
    runningRef.current = false
    setTimeUp(true)
    setTypedValue('')
    setFeedback(null)
    streakRef.current = 0
    setStreak(0)
    shakeRef.current = 16
    setScreenShake(16)
    if (currentWord) setSkippedWords(prev => [...prev, currentWord])
    // Timing out on the chest word loses the chest
    if (isChestWord && !chestSpawnedRef.current) {
      chestSpawnedRef.current = true
      setIsChestWord(false)
      setChestTimer(0)
    }
    if (!muted) playSound(assetUrl('/sound/flappy-hit.mp3'), 0.5)

    const dead = loseLife()
    setTimeout(() => {
      if (!mountedRef.current || endedRef.current) return
      setTimeUp(false)
      if (dead) endGame()
      else advanceWord()
    }, 1000)
  }, [currentWord, isChestWord, muted, playSound, loseLife, endGame, advanceWord])

  const startGame = useCallback(() => {
    const gameWords = initialWords || pickGameWords(wordBankProp, currentLevel)
    setWords(gameWords)
    setWordIndex(0)
    setDisplayScore(0)
    setPvpTimeLeft(PVP_TIME_CAP)
    setWordsCompleted(0)
    setSkippedWords([])
    setTypedValue('')
    setHintRevealed(0)
    setFeedback(null)
    setTimeUp(false)
    setLifeGained(false)

    endedRef.current = false
    scoreRef.current = 0
    streakRef.current = 0
    wordsCompletedRef.current = 0
    comboRef.current = 0
    flawedRef.current = false
    wordNumRef.current = 0
    livesRef.current = START_LIVES
    setStreak(0)
    setCombo(0)
    setLives(START_LIVES)
    chestSpawnedRef.current = false
    chestWordRef.current = 3 + Math.floor(Math.random() * 5)
    setChestCollected(false)
    setChestPopup(false)
    setIsChestWord(false)
    setChestTimer(0)
    startFuse(gameWords[0]?.word?.length || 5)
    setPhase('playing')

    try {
      const music = new Audio(assetUrl('/sound/pet-word-scamble-2-faster.mp3'))
      music.loop = true
      music.volume = 0.3
      bgMusicRef.current = music
      music.play().catch(() => {})
    } catch {}

    setTimeout(() => inputRef.current?.focus(), 200)
  }, [wordBankProp, currentLevel, initialWords, startFuse])

  // Auto-start for realtime PvP (skip the ready screen)
  useEffect(() => {
    if (isRealtimePvP && phase === 'ready') {
      startGame()
    }
  }, [isRealtimePvP])

  // Realtime PvP only: a shared wall clock so both players stop together.
  useEffect(() => {
    if (!isRealtimePvP || phase !== 'playing') return
    const deadline = Date.now() + PVP_TIME_CAP * 1000
    const interval = setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      setPvpTimeLeft(left)
      if (left <= 0) {
        clearInterval(interval)
        endGame()
      }
    }, 250)
    return () => clearInterval(interval)
  }, [isRealtimePvP, phase, endGame])

  // Start chest timer when reaching chest word
  useEffect(() => {
    if (phase === 'playing' && chestEnabled && !chestSpawnedRef.current && wordsCompleted >= chestWordRef.current - 1) {
      const nextWord = words[wordIndex]
      if (nextWord && nextWord.word.length >= 6) {
        setIsChestWord(true)
        setChestTimer(5)
      }
    }
  }, [phase, wordsCompleted, chestEnabled, words, wordIndex])

  // Chest timer countdown
  useEffect(() => {
    if (chestTimer <= 0) return
    const interval = setInterval(() => {
      setChestTimer(prev => {
        if (prev <= 1) {
          chestSpawnedRef.current = true
          setIsChestWord(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [chestTimer])

  // Stop music on results
  useEffect(() => {
    if (phase === 'results' && bgMusicRef.current) {
      bgMusicRef.current.pause()
      bgMusicRef.current = null
    }
  }, [phase])

  // Play end-of-game sounds
  useEffect(() => {
    if (phase !== 'results') return
    if (wordsCompletedRef.current >= passGoal) {
      playSound(assetUrl('/pet-game/angry/angry-birds-level-complete.mp3'), 0.5)
    } else {
      playSound(assetUrl('/sound/craft_fail.mp3'), 0.5)
    }
  }, [phase, playSound, passGoal])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      runningRef.current = false
      if (bgMusicRef.current) {
        bgMusicRef.current.pause()
        bgMusicRef.current = null
      }
    }
  }, [])

  // Word clock + shake + particle decay, all on one rAF loop
  useEffect(() => {
    if (phase !== 'playing') return
    const animate = () => {
      shakeRef.current = Math.max(0, shakeRef.current - 0.5)
      setScreenShake(shakeRef.current)
      // Returning `prev` unchanged lets React bail out instead of re-rendering
      // every frame on an empty particle list.
      setParticles(prev => (
        prev.length === 0
          ? prev
          : prev
              .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.15, opacity: p.opacity - 0.02 }))
              .filter(p => p.opacity > 0)
      ))
      if (runningRef.current) {
        const remaining = Math.max(0, (fuseEndRef.current - performance.now()) / 1000)
        paintFuse(remaining, fuseMaxRef.current)
        // Relative near the floor, or a 3s word would start fully red and the
        // danger tint would just stay on for the rest of the run.
        const isDanger = remaining <= Math.min(3, fuseMaxRef.current * 0.4)
        if (isDanger !== dangerRef.current) {
          dangerRef.current = isDanger
          setDanger(isDanger)
        }
        if (remaining <= 0) handleTimeUp()
      }
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [phase, paintFuse, handleTimeUp])

  // Focus input when playing starts
  useEffect(() => {
    if (phase === 'playing') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [phase])

  return createPortal(
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black/70 flex items-center justify-center">
      <style>{`
        @keyframes typePopIn {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes typeCorrect {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes typeShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        @keyframes typeFloat {
          0%, 100% { transform: translateY(-4px); }
          50% { transform: translateY(4px); }
        }
        @keyframes typeResultsFadeIn {
          0% { opacity: 0; transform: translateY(30px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes typeScorePopIn {
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
        @keyframes hintPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes letterReveal {
          0% { transform: scale(0) rotateY(90deg); }
          60% { transform: scale(1.1) rotateY(-10deg); }
          100% { transform: scale(1) rotateY(0deg); }
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
        @keyframes typeLifeUp {
          0% { transform: scale(0.5) translateY(0); opacity: 0; }
          30% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1) translateY(-40px); opacity: 0; }
        }
        @keyframes typeTimeUp {
          0% { transform: scale(0.6); opacity: 0; }
          25% { transform: scale(1.15); opacity: 1; }
          75% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.05); opacity: 0; }
        }
      `}</style>

      <div
        ref={containerRef}
        className="relative w-full max-w-[400px] h-full max-h-[100dvh] overflow-hidden rounded-none sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl"
        style={{
          background: danger && phase === 'playing'
            ? 'linear-gradient(135deg, #7f1d1d 0%, #b91c1c 50%, #ea580c 100%)'
            : 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #a855f7 100%)',
          transition: 'background 0.4s ease',
          transform: screenShake > 0 ? `translate(${Math.sin(screenShake * 2) * 3}px, ${Math.cos(screenShake * 2) * 3}px)` : 'none',
        }}
      >

      {/* Decorative circles */}
      <div className="absolute top-[-10%] right-[-5%] w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[-10%] w-80 h-80 rounded-full bg-white/5 pointer-events-none" />

      {/* Close Button */}
      {phase !== 'results' && !hideClose && (
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
          <div className="flex items-center gap-4" style={{ animation: 'typeFloat 1.5s ease-in-out infinite' }}>
            {petImageUrl ? (
              <img src={petImageUrl} alt={petName} className="w-24 h-24 object-contain drop-shadow-lg"
                onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = ''; }}
              />
            ) : null}
            <span className="text-7xl" style={{ display: petImageUrl ? 'none' : '' }}>⌨️</span>
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
              Word Type
            </h2>
            <p className="text-lg text-white/80 mb-1">
              See the meaning, type the word!
            </p>
            <p className="text-sm text-white/60">
              Survival: every word is faster. A timeout or a skip costs a heart —
              {' '}{COMBO_FOR_LIFE} clean words win one back.
            </p>
          </div>

          {leaderboard.length > 0 && (
            <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 w-full max-w-xs">
              <p className="text-xs font-bold text-yellow-300 mb-2">Top 10</p>
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
            className="px-10 py-4 bg-white text-indigo-700 rounded-full font-bold text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform border-b-4 border-indigo-200"
          >
            Start!
          </button>
        </div>
      )}

      {/* Playing Phase */}
      {phase === 'playing' && currentWord && (
        <div className="w-full h-full relative flex flex-col">

          {/* Particles */}
          {particles.map(particle => (
            <div
              key={particle.id}
              className="absolute w-3 h-3 rounded-full pointer-events-none z-30"
              style={{
                left: `${particle.x}px`,
                top: `${particle.y}px`,
                backgroundColor: particle.color,
                opacity: particle.opacity,
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}

          {/* === TOP HUD === */}
          <div className="px-4 pt-3 pb-1 z-10">
            <div className="w-full max-w-md mx-auto flex flex-col items-center gap-2">
              {/* Score / Pet / Timer row */}
              <div className="w-full flex items-center justify-between">
                  <div className={`flex flex-col items-start gap-1 ${isRealtimePvP ? '' : 'ml-10'}`}>
                    <div className="bg-white/20 backdrop-blur rounded-2xl px-4 py-2 flex items-center gap-2">
                      <span className="text-xl font-black text-white">{displayScore}</span>
                    </div>
                    {/* Score-to-beat progress bar */}
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
                              <span className="text-[11px]">&#x2694;&#xFE0F;</span>
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

                  {!isRealtimePvP && (
                    <div className="flex flex-col items-center gap-0.5 relative">
                      {petImageUrl && (
                        <img src={petImageUrl} alt={petName}
                          className="w-10 h-10 object-contain drop-shadow-md"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      )}
                      <div className="flex gap-0.5">
                        {Array.from({ length: Math.max(START_LIVES, lives) }).map((_, i) => (
                          <Heart key={i} className={`w-3.5 h-3.5 transition-all ${i < lives ? 'text-red-400 fill-red-400' : 'text-gray-600/40'}`}
                            style={i === lives ? { animation: 'bbHeartLose 0.5s ease-out' } : {}}
                          />
                        ))}
                      </div>
                      {/* Clean-typing meter → free life */}
                      <div className="w-12 h-1 rounded-full bg-white/15 overflow-hidden mt-0.5">
                        <div className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${(combo / COMBO_FOR_LIFE) * 100}%`,
                            background: 'linear-gradient(90deg, #34d399, #6ee7b7)',
                          }}
                        />
                      </div>
                      {lifeGained && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-green-300 font-black text-sm whitespace-nowrap pointer-events-none"
                          style={{ animation: 'typeLifeUp 1.6s ease-out forwards' }}
                        >
                          +1 LIFE!
                        </div>
                      )}
                    </div>
                  )}

                {/* Mute */}
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

              {/* Streak */}
              <div className="w-full flex items-center gap-2">
                <div className={`rounded-full px-2.5 py-1 text-xs font-bold flex items-center gap-1 shrink-0 ${
                  streak >= 3 ? 'bg-yellow-400 text-yellow-900' : 'bg-white/20 text-white/70'
                }`}>
                  <img src={assetUrl('/icon/profile/streak.svg')} alt="streak" className="w-3.5 h-3.5" />{streak}x
                </div>
                <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">
                  Word {wordsCompleted + 1}
                </span>
                {isRealtimePvP && (
                  <span className={`text-xs font-bold ml-auto ${pvpTimeLeft <= 10 ? 'text-red-300' : 'text-white/40'}`}>
                    ⏱ {pvpTimeLeft}s
                  </span>
                )}
              </div>

            </div>
          </div>

          {/* === CENTER: Hint & Word === */}
          <div className="flex-1 flex flex-col items-center justify-start pt-4 px-6 gap-4 relative">

            {/* Word complete popup */}
            {wordPopup && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-1" style={{ animation: 'wordPopupAnim 1.2s ease-out forwards' }}>
                  <div className="text-3xl font-black text-white drop-shadow-lg">+{wordPopup.points}</div>
                  {wordPopup.streak > 1 && (
                    <div className="flex items-center gap-1 bg-yellow-400 text-yellow-900 rounded-full px-3 py-1 text-sm font-bold">
                      <img src={assetUrl('/icon/profile/streak.svg')} alt="streak" className="w-4 h-4" />{wordPopup.streak}x streak
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Time-up banner */}
            {timeUp && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-2" style={{ animation: 'typeTimeUp 1s ease-out forwards' }}>
                  <div className="text-4xl font-black text-red-300 drop-shadow-lg">TIME UP!</div>
                  <div className="bg-white/90 rounded-xl px-4 py-1.5 text-lg font-black text-gray-800 uppercase tracking-wide">
                    {currentWord?.word}
                  </div>
                  <div className="flex items-center gap-1 bg-red-500 text-white rounded-full px-4 py-1.5 text-sm font-bold shadow-lg">
                    <Heart className="w-4 h-4 fill-white" /> -1 life
                  </div>
                </div>
              </div>
            )}

            {chestPopup && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-2" style={{ animation: 'chestPopupAnim 1.5s ease-out forwards' }}>
                  <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-16 h-16 object-contain" />
                  <div className="bg-amber-500 text-white rounded-full px-4 py-1.5 font-bold text-sm shadow-lg">Chest Found!</div>
                </div>
              </div>
            )}

            {/* Realtime PvP scoreboard */}
            {isRealtimePvP && opponentProgress && (
              <div className="flex items-center justify-center gap-3 w-full max-w-xs">
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

              <>
                {/* Meaning/Hint display */}
                <div className="bg-white/10 backdrop-blur-md rounded-2xl px-5 py-3 w-full max-w-xs text-center border border-white/20">
                  <p className="text-xs text-white/50 uppercase tracking-wider mb-1 font-semibold">Meaning</p>
                  <p className="text-2xl font-bold text-white leading-snug" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                    {currentWord.hint}
                  </p>
                  {currentWord.image_url && (
                    <img src={currentWord.image_url} alt="" className="w-12 h-12 object-contain mx-auto mt-2 rounded-lg" />
                  )}
                </div>

                {/* Letter blanks - typed letters appear here */}
                <div
                  className="flex items-center gap-1.5 justify-center flex-wrap cursor-text"
                  onClick={() => inputRef.current?.focus()}
                  style={feedback === 'wrong' ? { animation: 'typeShake 0.4s ease-out' } : feedback === 'correct' ? { animation: 'typeCorrect 0.4s ease-out' } : {}}
                >
                  {currentWord.word.split('').map((letter, i) => {
                    const isRevealed = i < hintRevealed
                    const typedLetter = typedValue[i]
                    const isCursor = i === typedValue.length
                    return (
                      <div
                        key={i}
                        className={`w-10 h-12 rounded-xl flex items-center justify-center font-bold text-xl uppercase transition-all ${
                          feedback === 'correct'
                            ? 'bg-green-400 text-white border-2 border-green-500 shadow-lg'
                            : isRevealed
                                ? 'bg-yellow-400/80 text-yellow-900 border-2 border-yellow-500'
                                : typedLetter
                                  ? 'bg-white text-indigo-800 border-2 border-indigo-200 shadow-md'
                                  : isCursor
                                    ? 'bg-white/25 border-2 border-white/60'
                                    : 'bg-white/10 border-2 border-dashed border-white/30'
                        }`}
                        style={typedLetter && !isRevealed ? { animation: 'letterReveal 0.15s ease-out' } : {}}
                      >
                        {typedLetter ? typedLetter.toUpperCase() : i === 0 ? <span className="text-white/40">{letter.toUpperCase()}</span> : isCursor ? <span className="w-0.5 h-5 bg-white/80 rounded-full" style={{ animation: 'hintPulse 1s ease-in-out infinite' }} /> : ''}
                      </div>
                    )
                  })}
                </div>
                {/* Word clock — width and text written imperatively by the rAF
                    loop, sitting right under the blanks so the countdown is in
                    the same glance as the letters being typed. */}
                <div
                  className="w-full max-w-xs flex items-center gap-2 -mt-1"
                  style={{ animation: danger ? 'timerUrgent 0.5s ease-in-out infinite' : 'none' }}
                >
                  <div className="flex-1 h-2.5 rounded-full bg-black/25 overflow-hidden shadow-inner">
                    <div
                      ref={fuseBarRef}
                      className="h-full rounded-full"
                      style={{ width: '100%', background: '#22c55e' }}
                    />
                  </div>
                  <span
                    ref={fuseNumRef}
                    className="font-black tabular-nums text-white text-lg min-w-[34px] text-right"
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
                  />
                </div>

                <span className="text-white/30 text-xs -mt-2">({currentWord.word.length} letters)</span>

                {/* Hidden input to capture keyboard */}
                <input
                  ref={inputRef}
                  type="text"
                  value={typedValue}
                  onChange={(e) => {
                    if (feedback) return
                    const val = e.target.value.replace(/\s/g, '')
                    // Don't allow editing revealed letters
                    if (val.length < hintRevealed) return
                    // Preserve revealed prefix
                    const prefix = currentWord.word.slice(0, hintRevealed)
                    const userPart = val.slice(hintRevealed)
                    const newVal = prefix + userPart
                    if (newVal.length > currentWord.word.length) return
                    // Validate all new characters one by one
                    if (newVal.length > typedValue.length) {
                      let accepted = typedValue
                      for (let ci = typedValue.length; ci < newVal.length; ci++) {
                        const expected = currentWord.word[ci].toLowerCase()
                        const typed = newVal[ci].toLowerCase()
                        if (typed !== expected) {
                          // A wrong letter costs no life — the clock is the
                          // punishment — but it does break the clean run.
                          flawedRef.current = true
                          // Wrong letter kills chest
                          if (isChestWord && !chestSpawnedRef.current) {
                            chestSpawnedRef.current = true
                            setIsChestWord(false)
                            setChestTimer(0)
                          }
                          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
                          if (isMobile) {
                            // Mobile: skip the word on wrong letter
                            shakeRef.current = 10
                            setScreenShake(10)
                            if (!muted) playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)
                            setFeedback('wrong')
                            setTypedValue(newVal.slice(0, ci + 1))
                            setTimeout(() => {
                              setTypedValue('')
                              setFeedback(null)
                              setHintRevealed(0)
                              inputRef.current?.focus()
                            }, 400)
                            return
                          }
                          // Desktop: clear all letters on wrong input
                          shakeRef.current = 10
                          setScreenShake(10)
                          if (!muted) playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)
                          setFeedback('wrong')
                          setTypedValue(newVal.slice(0, ci + 1))
                          setTimeout(() => {
                            setTypedValue('')
                            setFeedback(null)
                            setHintRevealed(0)
                            inputRef.current?.focus()
                          }, 400)
                          return
                        }
                        accepted += newVal[ci]
                      }
                      setTypedValue(accepted)
                    } else {
                      setTypedValue(newVal)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === ' ') {
                      e.preventDefault()
                      handleSkip()
                    }
                    // Prevent backspacing into revealed letters
                    if (e.key === 'Backspace' && typedValue.length <= hintRevealed) e.preventDefault()
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  className="absolute opacity-0 w-0 h-0 pointer-events-none"
                  style={{ position: 'absolute', left: '-9999px' }}
                />

                {/* Reveal hint button */}
                <button
                  onClick={handleRevealHint}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors"
                  disabled={hintRevealed >= currentWord.word.length - 1}
                >
                  Reveal letter −{HINT_TIME_COST}s ({hintRevealed}/{currentWord.word.length - 1})
                </button>
              </>
          </div>

          {/* === BOTTOM: Skip === */}
          <div className="pb-8 pt-4 px-6 z-10 flex justify-center"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.2) 0%, transparent 100%)' }}
          >
            <button
              onClick={handleSkip}
              className="text-xs text-white/50 hover:text-white/80 underline transition-colors"
            >
              Skip (−1 ♥)
            </button>
          </div>

          {/* Progress bar - hidden in PvP */}
          {!isRealtimePvP && (
          <div className="absolute top-[76px] left-0 right-0 flex items-center justify-center z-10 pointer-events-none px-10">
            <div className="flex items-center gap-1.5 w-full max-w-[280px]">
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
                {/* Star threshold markers */}
                {[star1Goal, star2Goal].map((goal, i) => (
                  <div key={i} className="absolute top-0 bottom-0 flex items-center justify-center" style={{ left: `${(goal / star3Goal) * 100}%`, transform: 'translateX(-50%)' }}>
                    <div className="w-0.5 h-3 rounded-full" style={{
                      background: wordsCompleted >= goal ? 'rgba(250,204,21,0.9)' : 'rgba(255,255,255,0.3)',
                    }} />
                  </div>
                ))}
              </div>
              {/* 3 Stars indicator */}
              <div className="flex -space-x-0.5">
                {thresholds.map((goal, i) => (
                  <Star key={i} className={`w-5 h-5 transition-all ${wordsCompleted >= goal ? 'text-yellow-400 fill-yellow-400 drop-shadow-sm' : 'text-white/25'}`} />
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Chest indicator under progress dots */}
          {isChestWord && !chestCollected && chestTimer > 0 && (
            <div className="absolute top-[100px] left-0 right-0 flex flex-col items-center gap-1 z-10 pointer-events-none">
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${chestTimer <= 3 ? 'bg-red-500/40' : 'bg-amber-500/30'}`} style={{ animation: chestTimer <= 3 ? 'hintPulse 0.5s ease-in-out infinite' : 'hintPulse 1s ease-in-out infinite' }}>
                <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-6 h-6 object-contain" />
                <span className={`text-xs font-bold ${chestTimer <= 3 ? 'text-red-300' : 'text-amber-300'}`}>{chestTimer}s</span>
              </div>
              <div className="w-24 h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${chestTimer <= 3 ? 'bg-red-400' : 'bg-amber-400'}`}
                  style={{ width: `${(chestTimer / 5) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results Phase */}
      {phase === 'results' && (
        <div className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto p-6 z-50">
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center my-auto"
            style={{ animation: 'typeResultsFadeIn 0.5s ease-out' }}
          >
            {/* Star display */}
            <div className="flex justify-center gap-1 mb-4">
              {[1, 2, 3].map(s => (
                <Star
                  key={s}
                  className={`w-12 h-12 transition-all ${starsEarned >= s ? 'text-yellow-400 fill-yellow-400 drop-shadow-lg' : 'text-gray-300'}`}
                  style={{ animation: starsEarned >= s ? `typeScorePopIn 0.5s ease-out ${0.2 + s * 0.15}s both` : 'typeScorePopIn 0.5s ease-out 0.3s both' }}
                />
              ))}
            </div>

            {isRealtimePvP && opponentProgress ? (
              <>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">
                  {displayScore > opponentProgress.score ? 'You Win!' : displayScore < opponentProgress.score ? 'You Lose!' : "It's a Tie!"}
                </h2>
                <p className="text-gray-500 mb-5">
                  {displayScore > opponentProgress.score ? 'Great typing skills!' : displayScore < opponentProgress.score ? 'Better luck next time!' : 'Evenly matched!'}
                </p>
                <div className="flex items-center justify-center gap-4 mb-5">
                  <div className={`rounded-2xl p-4 border flex-1 ${displayScore >= opponentProgress.score ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}
                    style={{ animation: 'typeScorePopIn 0.6s ease-out 0.5s both' }}>
                    <p className="text-xs font-semibold text-gray-400 mb-1">You</p>
                    <p className={`text-3xl font-black ${displayScore >= opponentProgress.score ? 'text-green-600' : 'text-gray-400'}`}>{displayScore}</p>
                    <p className="text-xs text-gray-400 mt-1">{wordsCompleted} words</p>
                  </div>
                  <span className="text-gray-300 font-bold text-lg">VS</span>
                  <div className={`rounded-2xl p-4 border flex-1 ${opponentProgress.score >= displayScore ? 'bg-gradient-to-br from-red-50 to-pink-50 border-red-200' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}
                    style={{ animation: 'typeScorePopIn 0.6s ease-out 0.7s both' }}>
                    <p className="text-xs font-semibold text-gray-400 mb-1">Opponent</p>
                    <p className={`text-3xl font-black ${opponentProgress.score >= displayScore ? 'text-red-600' : 'text-gray-400'}`}>{opponentProgress.score}</p>
                    <p className="text-xs text-gray-400 mt-1">{opponentProgress.wordsCompleted} words</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">
                  {starsEarned >= 3 ? 'Unstoppable!' : starsEarned >= 2 ? 'Great Survival!' : starsEarned >= 1 ? 'Training Complete!' : 'Out of Lives!'}
                </h2>
                <p className="text-gray-500 mb-5">
                  {starsEarned >= 1
                    ? `${petName} survived ${wordsCompleted} words!`
                    : `${petName} only typed ${wordsCompleted}/${passGoal} words`}
                </p>
                <div
                  className={`rounded-2xl p-5 mb-5 border ${
                    starsEarned >= 3 ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200'
                    : starsEarned >= 1 ? 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100'
                    : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'
                  }`}
                  style={{ animation: 'typeScorePopIn 0.6s ease-out 0.5s both' }}
                >
                  <p className={`text-5xl font-black ${
                    starsEarned >= 3 ? 'text-yellow-500'
                    : starsEarned >= 1 ? 'text-indigo-600'
                    : 'text-gray-400'
                  }`}>{wordsCompleted}</p>
                  <p className={`text-sm font-semibold mt-1 ${
                    starsEarned >= 3 ? 'text-yellow-400'
                    : starsEarned >= 1 ? 'text-indigo-400'
                    : 'text-gray-400'
                  }`}>words survived</p>
                <p className="text-xs text-gray-400 mt-1">{displayScore} points</p>
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

            <p className="text-sm text-gray-600 mb-6">
              {starsEarned >= 3
                ? 'Typing master! Nothing gets past you.'
                : starsEarned >= 2
                  ? `Amazing! Survive ${star3Goal} words for 3 stars!`
                  : starsEarned >= 1
                    ? `Good job! Survive ${star2Goal} words for 2 stars!`
                    : `Need at least ${star1Goal} words to earn a star. Try again!`}
            </p>

            {chestCollected && (
              <div className="mb-4 flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-8 h-8 object-contain" />
                <span className="font-bold text-amber-700">Chest collected!</span>
              </div>
            )}

            {isRealtimePvP || starsEarned >= 1 ? (
              <button
                onClick={() => onGameEnd(displayScore, { chestCollected, wordsCompleted, stars: starsEarned })}
                className="w-full py-3.5 bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-indigo-700 active:border-b-0 active:mt-1 transition-all"
              >
                {isRealtimePvP ? 'Done' : `Collect Rewards`}
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setPhase('ready')
                    setDisplayScore(0)
                    setWordsCompleted(0)
                  }}
                  className="w-full py-3.5 bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-indigo-700 active:border-b-0 active:mt-1 transition-all"
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

export default PetWordType
