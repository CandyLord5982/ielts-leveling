import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Trophy, Volume2, VolumeX, Heart, Star } from 'lucide-react'

import { assetUrl } from '../../../hooks/useBranding'

const PAIRS_PER_ROUND = 6 // 6 pairs = 12 tiles (3x2 words above, 3x2 meanings below)
const POINTS_PER_MATCH = 10
const STREAK_BONUS = 5
const START_LIVES = 3
const LIVES_CAP = 5
// Correct matches without a mistake that refill a life — two flawless rounds.
// This is the survival pressure valve: it rewards clean play instead of luck.
const COMBO_FOR_LIFE = 12
// The round clock shrinks every round and floors so it never becomes
// impossible: round 1 = 16s, round 21 and beyond = 6s.
const FIRST_ROUND_SECONDS = 16
const MIN_ROUND_SECONDS = 6
const roundSecondsFor = (r) => Math.max(MIN_ROUND_SECONDS, FIRST_ROUND_SECONDS - (r - 1) * 0.5)
// Realtime PvP compares two scores head to head, so both players still have to
// stop at the same moment — that mode keeps a hard cap on top of survival.
const PVP_TIME_CAP = 76

// Rounds *cleared* (every pair matched before the clock ran out).
const STAR_THRESHOLDS = {
  1: [4, 7, 10],
  2: [5, 8, 12],
  3: [6, 10, 14],
  4: [7, 11, 16],
}

const TIMER_RADIUS = 22
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS

const fuseColor = (remaining) =>
  remaining <= 3 ? '#ef4444' : remaining <= 6 ? '#f97316' : remaining <= 9 ? '#eab308' : '#22c55e'

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const EMPTY_ARRAY = []
const PetMatchGame = ({ petImageUrl, petName, onGameEnd, onClose, wordBank: wordBankProp = EMPTY_ARRAY, hideClose = false, scoreToBeat = null, leaderboard = EMPTY_ARRAY, chestEnabled = false, pvpOpponentPetUrl = null, initialRounds = null, onProgressUpdate = null, opponentProgress = null, isRealtimePvP = false, currentLevel = 1 }) => {
  const thresholds = STAR_THRESHOLDS[currentLevel] || [4, 7, 10]
  const [star1Goal, star2Goal, star3Goal] = thresholds
  const passGoal = star1Goal
  const [phase, setPhase] = useState('ready')
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [combo, setCombo] = useState(0)
  const [tiles, setTiles] = useState([])
  const [roundPairs, setRoundPairs] = useState(PAIRS_PER_ROUND)
  const [selected, setSelected] = useState(null) // index of first selected tile
  const [matchedPairs, setMatchedPairs] = useState(0)
  const [totalMatched, setTotalMatched] = useState(0)
  const [screenShake, setScreenShake] = useState(0)
  const [particles, setParticles] = useState([])
  const [wordPopup, setWordPopup] = useState(null)
  const [roundBonus, setRoundBonus] = useState(null)
  const [wordHistory, setWordHistory] = useState([])
  const [roundNum, setRoundNum] = useState(0)
  const [roundsCleared, setRoundsCleared] = useState(0)
  // Flips once per round rather than per frame — the fuse itself is written
  // straight to the DOM in the rAF loop.
  const [danger, setDanger] = useState(false)
  const [timeUp, setTimeUp] = useState(false)
  const [lifeGained, setLifeGained] = useState(false)
  const [pvpTimeLeft, setPvpTimeLeft] = useState(PVP_TIME_CAP)
  const starsEarned = roundsCleared >= star3Goal ? 3 : roundsCleared >= star2Goal ? 2 : roundsCleared >= star1Goal ? 1 : 0
  const [muted, setMuted] = useState(false)
  const [wrongPair, setWrongPair] = useState(null) // [idx1, idx2]
  const [locked, setLocked] = useState(false) // lock input during wrong / time-up animation
  const [chestCollected, setChestCollected] = useState(false)
  const [chestPopup, setChestPopup] = useState(false)
  const [chestMissed, setChestMissed] = useState(false)
  const [chestRoundIndex, setChestRoundIndex] = useState(-1)
  const [chestTimer, setChestTimer] = useState(0)
  const [lives, setLives] = useState(START_LIVES)

  const scoreRef = useRef(0)
  const streakRef = useRef(0)
  const bestStreakRef = useRef(0)
  const comboRef = useRef(0)
  const livesRef = useRef(START_LIVES)
  const totalMatchedRef = useRef(0)
  const roundsClearedRef = useRef(0)
  const roundPairsRef = useRef(PAIRS_PER_ROUND)
  const roundNumRef = useRef(0)
  // Fuse state lives in refs: it animates at 60fps and a setState per frame
  // would re-render the whole grid (and restart the tile animations).
  const roundEndRef = useRef(0)
  const roundMaxRef = useRef(FIRST_ROUND_SECONDS)
  const runningRef = useRef(false)
  // Set once the run is over, so a pending round-transition timeout can't
  // restart the clock after the PvP cap (or the last life) ended the game.
  const endedRef = useRef(false)
  const dangerRef = useRef(false)
  const fuseRingRef = useRef(null)
  const fuseNumRef = useRef(null)
  const fuseBarRef = useRef(null)
  const rafRef = useRef(null)
  const shakeRef = useRef(0)
  const mountedRef = useRef(true)
  const containerRef = useRef(null)
  const bgMusicRef = useRef(null)
  const mutedRef = useRef(false)
  const audioCache = useRef({})
  const starsRef = useRef(Array.from({ length: 20 }, () => {
    const size = Math.random() * 3 + 1
    return {
      width: size,
      height: size,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      opacity: Math.random() * 0.5 + 0.2,
    }
  }))

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

  const spawnParticles = useCallback((count, colors) => {
    const spawned = Array.from({ length: count }, (_, i) => ({
      id: `pm-${Date.now()}-${i}-${Math.random()}`,
      x: (containerRef.current?.clientWidth || 400) / 2 + (Math.random() - 0.5) * 120,
      y: (containerRef.current?.clientHeight || 700) * 0.45,
      vx: (Math.random() - 0.5) * 10,
      vy: -Math.random() * 7 - 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 1,
    }))
    setParticles(prev => [...prev, ...spawned])
  }, [])

  // Build the tiles for round `r` (1-based)
  const buildRound = useCallback((r) => {
    const roundIdx = r - 1
    // Survival can outlast the seeded list, so wrap it instead of falling back
    // to an unseeded shuffle — realtime PvP must keep both grids identical.
    const picked = initialRounds && initialRounds.length
      ? initialRounds[roundIdx % initialRounds.length]
      : shuffle(wordBankProp).slice(0, PAIRS_PER_ROUND)
    const wordTiles = picked.map((pair, i) => ({ id: `r${r}-w-${i}`, pairId: i, text: pair.word, type: 'word', matched: false }))
    const hintTiles = picked.map((pair, i) => ({ id: `r${r}-h-${i}`, pairId: i, text: pair.hint, type: 'hint', matched: false }))
    roundPairsRef.current = picked.length
    setRoundPairs(picked.length)
    setTiles([...shuffle(wordTiles), ...shuffle(hintTiles)])
    setSelected(null)
    setMatchedPairs(0)
    setWrongPair(null)
    setLocked(false)
    // Track words for results
    setWordHistory(prev => [...prev, ...picked.map(p => ({ word: p.word, hint: p.hint, correct: false }))])
  }, [wordBankProp, initialRounds])

  const paintFuse = useCallback((remaining, max) => {
    const pct = max > 0 ? Math.max(0, Math.min(1, remaining / max)) : 0
    const color = fuseColor(remaining)
    if (fuseRingRef.current) {
      fuseRingRef.current.style.strokeDashoffset = `${TIMER_CIRCUMFERENCE * (1 - pct)}`
      fuseRingRef.current.style.stroke = color
    }
    if (fuseNumRef.current) {
      fuseNumRef.current.textContent = remaining >= 10 ? String(Math.ceil(remaining)) : remaining.toFixed(1)
      fuseNumRef.current.style.color = remaining <= 6 ? color : '#ffffff'
    }
    if (fuseBarRef.current) fuseBarRef.current.style.width = `${pct * 100}%`
  }, [])

  const nextRound = useCallback(() => {
    if (endedRef.current) return
    const r = roundNumRef.current + 1
    roundNumRef.current = r
    setRoundNum(r)
    buildRound(r)

    const duration = roundSecondsFor(r)
    roundMaxRef.current = duration
    roundEndRef.current = performance.now() + duration * 1000
    // Paint a full clock immediately so the new round never flashes the old one.
    paintFuse(duration, duration)
    dangerRef.current = false
    setDanger(false)
    runningRef.current = true

    if (chestEnabled && !chestSpawnedRef.current && r === chestRoundRef.current) {
      setChestTimer(10)
    }
  }, [buildRound, paintFuse, chestEnabled])

  const endGame = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true
    runningRef.current = false
    setLocked(true)
    setPhase('results')
  }, [])

  // Round clock ran out: lose a life, then either continue or finish.
  const handleTimeUp = useCallback(() => {
    if (!runningRef.current) return
    runningRef.current = false
    setLocked(true)
    setSelected(null)
    setTimeUp(true)
    streakRef.current = 0
    setStreak(0)
    comboRef.current = 0
    setCombo(0)
    shakeRef.current = 16
    setScreenShake(16)
    spawnParticles(18, ['#ef4444', '#f97316', '#fbbf24'])
    if (!mutedRef.current) playSound(assetUrl('/sound/flappy-hit.mp3'), 0.5)

    const remaining = livesRef.current - 1
    livesRef.current = remaining
    setLives(remaining)

    setTimeout(() => {
      if (!mountedRef.current || endedRef.current) return
      setTimeUp(false)
      if (remaining <= 0) endGame()
      else nextRound()
    }, 1000)
  }, [spawnParticles, playSound, endGame, nextRound])

  const startGame = useCallback(() => {
    endedRef.current = false
    scoreRef.current = 0
    streakRef.current = 0
    bestStreakRef.current = 0
    comboRef.current = 0
    livesRef.current = START_LIVES
    totalMatchedRef.current = 0
    roundsClearedRef.current = 0
    roundNumRef.current = 0
    setScore(0)
    setStreak(0)
    setBestStreak(0)
    setCombo(0)
    setLives(START_LIVES)
    setWordPopup(null)
    setRoundBonus(null)
    setWordHistory([])
    setTotalMatched(0)
    setRoundsCleared(0)
    setParticles([])
    setTimeUp(false)
    setLifeGained(false)
    setPvpTimeLeft(PVP_TIME_CAP)
    chestSpawnedRef.current = false
    const chestRound = 2 + Math.floor(Math.random() * 3)
    chestRoundRef.current = chestRound
    setChestRoundIndex(chestEnabled ? chestRound : -1)
    setChestCollected(false)
    setChestPopup(false)
    setChestMissed(false)
    setChestTimer(0)
    setPhase('playing')
    nextRound()

    // Background music
    if (!mutedRef.current) {
      try {
        const music = new Audio(assetUrl('/sound/pet-word-scamble-2-faster.mp3'))
        music.loop = true
        music.volume = 0.3
        bgMusicRef.current = music
        music.play().catch(() => {})
      } catch {}
    }
  }, [nextRound, chestEnabled])

  // Auto-start for realtime PvP (skip the ready screen)
  useEffect(() => {
    if (isRealtimePvP && phase === 'ready') {
      startGame()
    }
  }, [isRealtimePvP])

  // Toggle mute
  const toggleMute = useCallback(() => {
    const newMuted = !mutedRef.current
    mutedRef.current = newMuted
    setMuted(newMuted)
    if (bgMusicRef.current) {
      bgMusicRef.current.volume = newMuted ? 0 : 0.3
    }
  }, [])

  // Stop music on results
  useEffect(() => {
    if (phase === 'results' && bgMusicRef.current) {
      bgMusicRef.current.pause()
      bgMusicRef.current = null
    }
  }, [phase])

  // Play end-of-game sound
  useEffect(() => {
    if (phase !== 'results') return
    if (roundsClearedRef.current >= passGoal) {
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

  // Round clock + shake + particle decay, all on one rAF loop
  useEffect(() => {
    if (phase !== 'playing') return
    const tick = () => {
      shakeRef.current = Math.max(0, shakeRef.current - 0.6)
      setScreenShake(shakeRef.current)
      // Returning `prev` unchanged lets React bail out instead of re-rendering
      // every frame on an empty particle list.
      setParticles(prev => (
        prev.length === 0
          ? prev
          : prev
              .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.25, opacity: p.opacity - 0.02 }))
              .filter(p => p.opacity > 0)
      ))
      if (runningRef.current) {
        const remaining = Math.max(0, (roundEndRef.current - performance.now()) / 1000)
        paintFuse(remaining, roundMaxRef.current)
        const isDanger = remaining <= 3
        if (isDanger !== dangerRef.current) {
          dangerRef.current = isDanger
          setDanger(isDanger)
        }
        if (remaining <= 0) handleTimeUp()
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [phase, paintFuse, handleTimeUp])

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

  // Chest round countdown
  useEffect(() => {
    if (chestTimer <= 0) return
    const interval = setInterval(() => {
      setChestTimer(prev => {
        if (prev <= 1) {
          // Time's up — chest lost
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

  // Handle tile tap
  const handleTileTap = useCallback((index) => {
    if (phase !== 'playing' || locked || !runningRef.current) return
    const tile = tiles[index]
    if (!tile || tile.matched) return
    if (selected === index) { setSelected(null); return } // deselect

    if (selected === null) {
      // First selection
      setSelected(index)
      return
    }

    // Second selection — check match
    const firstTile = tiles[selected]
    if (firstTile.pairId === tile.pairId && firstTile.type !== tile.type) {
      // CORRECT MATCH
      const newStreak = streakRef.current + 1
      streakRef.current = newStreak
      setStreak(newStreak)
      if (newStreak > bestStreakRef.current) {
        bestStreakRef.current = newStreak
        setBestStreak(newStreak)
      }
      const points = POINTS_PER_MATCH + (newStreak >= 5 ? STREAK_BONUS * 2 : newStreak >= 3 ? STREAK_BONUS : 0)
      scoreRef.current += points
      setScore(scoreRef.current)

      totalMatchedRef.current += 1
      setTotalMatched(totalMatchedRef.current)

      // Clean-play meter — a run of matches with no mistake buys a life back,
      // which is the only way survival goes long.
      let gainedLife = false
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

      // Broadcast progress for realtime PvP
      if (onProgressUpdate) {
        onProgressUpdate({ score: scoreRef.current, wordsCompleted: totalMatchedRef.current })
      }

      // Mark matched
      setTiles(prev => prev.map((t, i) =>
        (i === selected || i === index) ? { ...t, matched: true } : t
      ))
      setSelected(null)
      const newMatched = matchedPairs + 1
      setMatchedPairs(newMatched)

      // Mark in word history
      setWordHistory(prev => prev.map(w =>
        w.word === firstTile.text || w.word === tile.text ? { ...w, correct: true } : w
      ))

      // Point popup + celebration particles
      setWordPopup({ points, streak: newStreak, gainedLife })
      setTimeout(() => setWordPopup(null), 1200)
      spawnParticles(16, ['#fbbf24', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981'])

      // Sound
      if (!mutedRef.current) playSound(assetUrl('/sound/scram-correct.mp3'), 0.4)

      // Check if round complete
      if (newMatched >= roundPairsRef.current) {
        runningRef.current = false
        setLocked(true)
        roundsClearedRef.current += 1
        setRoundsCleared(roundsClearedRef.current)

        // Survival bonus: whatever is left on the clock is worth points, so
        // clearing fast pays off even though the round ends either way.
        const left = Math.max(0, (roundEndRef.current - performance.now()) / 1000)
        const bonus = Math.round(left) * 2
        if (bonus > 0) {
          scoreRef.current += bonus
          setScore(scoreRef.current)
          if (onProgressUpdate) {
            onProgressUpdate({ score: scoreRef.current, wordsCompleted: totalMatchedRef.current })
          }
        }
        setRoundBonus({ round: roundNumRef.current, bonus })
        setTimeout(() => setRoundBonus(null), 1100)

        if (chestEnabled && !chestSpawnedRef.current && roundNumRef.current === chestRoundRef.current) {
          chestSpawnedRef.current = true
          setChestCollected(true)
          setChestPopup(true)
          setChestTimer(0)
          setTimeout(() => setChestPopup(false), 1500)
        }
        setTimeout(() => {
          if (!mountedRef.current || endedRef.current) return
          nextRound()
        }, 800)
      }
    } else {
      // WRONG MATCH — costs a life
      streakRef.current = 0
      setStreak(0)
      comboRef.current = 0
      setCombo(0)
      shakeRef.current = 12
      setScreenShake(12)
      setWrongPair([selected, index])
      setLocked(true)

      // Wrong match on chest round = chest lost
      if (chestEnabled && !chestSpawnedRef.current && roundNumRef.current === chestRoundRef.current) {
        chestSpawnedRef.current = true
        setChestMissed(true)
        setChestTimer(0)
      }

      if (!mutedRef.current) {
        playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)
      }

      const remaining = livesRef.current - 1
      livesRef.current = remaining
      setLives(remaining)

      if (remaining <= 0) {
        runningRef.current = false
        setTimeout(() => {
          if (mountedRef.current) endGame()
        }, 800)
        return
      }

      setTimeout(() => {
        if (!mountedRef.current) return
        setWrongPair(null)
        setSelected(null)
        setLocked(false)
      }, 450)
    }
  }, [phase, locked, tiles, selected, matchedPairs, chestEnabled, spawnParticles, playSound, onProgressUpdate, nextRound, endGame])

  const missedWords = wordHistory.filter(w => !w.correct)
    .filter((w, i, arr) => arr.findIndex(o => o.word === w.word) === i)

  return createPortal(
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black/70 flex items-center justify-center">
      <style>{`
        @keyframes matchTileIn {
          0% { transform: scale(0) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.1) rotate(2deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes matchTileMatched {
          0% { transform: scale(1); }
          30% { transform: scale(1.2); }
          60% { transform: scale(0.9); opacity: 0.7; }
          100% { transform: scale(0) rotate(15deg); opacity: 0; }
        }
        @keyframes matchTileWrong {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-5px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
        @keyframes matchFloat {
          0%, 100% { transform: translateY(-4px); }
          50% { transform: translateY(4px); }
        }
        @keyframes matchResultsFadeIn {
          0% { opacity: 0; transform: translateY(30px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes matchScorePopIn {
          0% { transform: scale(0); }
          70% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes matchTimerUrgent {
          0%, 100% { transform: scale(1) rotate(0deg); }
          15% { transform: scale(1.1) rotate(-3deg); }
          30% { transform: scale(1) rotate(3deg); }
          45% { transform: scale(1.05) rotate(-2deg); }
          60% { transform: scale(1) rotate(0deg); }
        }
        @keyframes matchHintPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
        @keyframes matchStreakPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes matchWordPopup {
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
        @keyframes matchTileSelected {
          0%, 100% { box-shadow: 0 0 0 3px rgba(59,130,246,0.5), 0 0 15px rgba(59,130,246,0.3); }
          50% { box-shadow: 0 0 0 3px rgba(59,130,246,0.8), 0 0 20px rgba(59,130,246,0.5); }
        }
        @keyframes bbHeartLose {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
          100% { transform: scale(0); opacity: 0; }
        }
        @keyframes matchLifeUp {
          0% { transform: scale(0.5) translateY(0); opacity: 0; }
          30% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1) translateY(-40px); opacity: 0; }
        }
        @keyframes matchTimeUp {
          0% { transform: scale(0.6); opacity: 0; }
          25% { transform: scale(1.15); opacity: 1; }
          75% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.05); opacity: 0; }
        }
        .match-tile-3d {
          transition: transform 0.08s ease, box-shadow 0.08s ease;
          transform-style: preserve-3d;
        }
        .match-tile-3d:active {
          transform: translateY(4px) !important;
          box-shadow: 0 2px 0 #1e40af, 0 3px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2) !important;
        }
        .match-tile-3d.tile-selected:active {
          transform: translateY(4px) !important;
          box-shadow: 0 2px 0 #92400e, 0 0 12px rgba(250,204,21,0.3), inset 0 1px 0 rgba(255,255,255,0.3) !important;
        }
      `}</style>

      {/* Game container */}
      <div
        ref={containerRef}
        className="relative w-full max-w-[400px] h-full max-h-[100dvh] overflow-hidden rounded-none sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl"
        style={{
          background: danger && phase === 'playing'
            ? 'linear-gradient(135deg, #4c1d1d 0%, #7f1d1d 40%, #b91c1c 100%)'
            : 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)',
          transition: 'background 0.4s ease',
          transform: screenShake > 0 ? `translate(${Math.sin(screenShake) * 3}px, ${Math.cos(screenShake) * 3}px)` : 'none',
        }}
      >
        {/* Decorative stars */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {starsRef.current.map((star, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white"
              style={star}
            />
          ))}
        </div>

        {/* Close & Mute buttons */}
        {phase !== 'results' && (
          <div className="absolute top-4 left-4 z-50 flex gap-2">
            {!hideClose && (
              <button
                onClick={onClose}
                className="bg-white/20 backdrop-blur rounded-full p-2 shadow-lg hover:bg-white/30 transition-colors"
              >
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <button
              onClick={toggleMute}
              className="bg-white/20 backdrop-blur rounded-full p-2 shadow-lg hover:bg-white/30 transition-colors"
            >
              {muted
                ? <VolumeX className="w-5 h-5 text-white/70" />
                : <Volume2 className="w-5 h-5 text-white" />
              }
            </button>
          </div>
        )}

        {/* Ready Phase */}
        {phase === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8 text-center overflow-y-auto">
            <div className="flex items-center gap-4" style={{ animation: 'matchFloat 1.5s ease-in-out infinite' }}>
              {petImageUrl ? (
                <img src={petImageUrl} alt={petName} className="w-24 h-24 object-contain drop-shadow-lg"
                  onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = '' }}
                />
              ) : null}
              <span className="text-7xl" style={{ display: petImageUrl ? 'none' : '' }}>🧩</span>
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
                Match Up!
              </h2>
              <p className="text-lg text-white/80 mb-1">
                Clear every pair before the clock runs out!
              </p>
              <p className="text-sm text-white/60">
                Survival: each round is faster. A miss or a timeout costs a heart —
                {' '}{COMBO_FOR_LIFE} clean matches win one back.
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
              className="px-10 py-4 bg-white text-indigo-700 rounded-full font-bold text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform border-b-4 border-indigo-200"
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
              <div className="flex items-center justify-between mb-3 pl-24">
                {/* Score */}
                <div className="flex flex-col items-start gap-1">
                  <div className="bg-white/20 backdrop-blur rounded-2xl px-4 py-2">
                    <span className="text-xl font-black text-white">{score}</span>
                  </div>
                  {(() => {
                    const nextToBeat = leaderboard.length > 0
                      ? [...leaderboard].reverse().find(e => e.score > score) || null
                      : scoreToBeat
                    if (!nextToBeat) return null
                    const gap = nextToBeat.score - score
                    const isClose = gap > 0 && gap <= 20
                    const pct = Math.min(100, Math.round((score / nextToBeat.score) * 100))
                    return (
                      <div className="w-28 ml-1" style={{ animation: isClose ? 'matchHintPulse 0.6s ease-in-out infinite' : 'none' }}>
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

                {/* Streak + lives */}
                <div className="flex items-center gap-2">
                  {streak >= 3 && (
                    <div className="bg-yellow-400 text-yellow-900 rounded-full px-3 py-1 text-sm font-bold shadow-lg"
                      style={{ animation: 'matchHintPulse 0.6s ease-in-out' }}
                    >
                      {streak}x
                    </div>
                  )}
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
                    {/* Clean-match meter → free life */}
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
                        style={{ animation: 'matchLifeUp 1.6s ease-out forwards' }}
                      >
                        +1 LIFE!
                      </div>
                    )}
                  </div>
                </div>

                {/* Round clock ring — written imperatively by the rAF loop */}
                <div
                  className="relative flex items-center justify-center"
                  style={{ animation: danger ? 'matchTimerUrgent 0.5s ease-in-out infinite' : 'none' }}
                >
                  <svg width="56" height="56" className="drop-shadow-lg" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="28" cy="28" r={TIMER_RADIUS} fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
                    <circle
                      ref={fuseRingRef}
                      cx="28" cy="28" r={TIMER_RADIUS}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={TIMER_CIRCUMFERENCE}
                      strokeDashoffset={0}
                    />
                  </svg>
                  <span
                    ref={fuseNumRef}
                    className="absolute font-black text-white tabular-nums"
                    style={{ fontSize: '16px', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                  />
                </div>
              </div>

              {/* Realtime PvP scoreboard */}
              {isRealtimePvP && opponentProgress && (
                <div className="flex items-center justify-center gap-3 w-full max-w-xs mx-auto mb-2">
                  <div className="flex items-center gap-2 flex-1 justify-end">
                    {petImageUrl && <img src={petImageUrl} alt={petName} className="w-10 h-10 object-contain drop-shadow-lg" />}
                    <span className={`text-2xl font-black ${score > opponentProgress.score ? 'text-green-300' : score < opponentProgress.score ? 'text-white/60' : 'text-white'}`}
                      style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>{score}</span>
                  </div>
                  <span className="text-white/30 font-black text-sm">vs</span>
                  <div className="flex items-center gap-2 flex-1">
                    <span className={`text-2xl font-black ${opponentProgress.score > score ? 'text-red-300' : opponentProgress.score < score ? 'text-white/60' : 'text-white'}`}
                      style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>{opponentProgress.score}</span>
                    {pvpOpponentPetUrl && <img src={pvpOpponentPetUrl} alt="Opponent" className="w-10 h-10 object-contain drop-shadow-lg" style={{ transform: 'scaleX(-1)' }} />}
                  </div>
                </div>
              )}

              {/* Round indicator */}
              <div className="text-center flex items-center justify-center gap-2">
                <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">
                  Round {roundNum}
                </span>
                {isRealtimePvP && (
                  <span className={`text-xs font-bold ${pvpTimeLeft <= 10 ? 'text-red-300' : 'text-white/40'}`}>
                    ⏱ {pvpTimeLeft}s
                  </span>
                )}
              </div>

              {/* Star progress bar */}
              <div className="flex items-center gap-1.5 w-full max-w-[280px] mx-auto mt-2">
                <div className="flex-1 relative" style={{ height: 22 }}>
                  <div className="absolute inset-0 rounded-full" style={{
                    background: 'linear-gradient(180deg, #818cf8 0%, #6366f1 40%, #4f46e5 60%, #7c7cf8 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                  <div className="absolute rounded-full overflow-hidden" style={{
                    top: 3, bottom: 3, left: 4, right: 4,
                    background: 'linear-gradient(180deg, #3730a3 0%, #312e81 100%)',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                  }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, (roundsCleared / star3Goal) * 100)}%`,
                      background: 'linear-gradient(180deg, #a78bfa 0%, #7c3aed 50%, #6d28d9 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 0 6px rgba(124,58,237,0.6)',
                      transition: 'width 0.4s ease',
                    }} />
                    {[star1Goal, star2Goal].map((goal, i) => (
                      <div key={i} className="absolute top-0 bottom-0 flex items-center justify-center" style={{ left: `${(goal / star3Goal) * 100}%`, transform: 'translateX(-50%)' }}>
                        <div className="w-0.5 h-3 rounded-full" style={{ background: roundsCleared >= goal ? 'rgba(250,204,21,0.9)' : 'rgba(255,255,255,0.3)' }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex -space-x-0.5">
                  {thresholds.map((goal, i) => (
                    <Star key={i} className={`w-5 h-5 transition-all ${roundsCleared >= goal ? 'text-yellow-400 fill-yellow-400 drop-shadow-sm' : 'text-white/25'}`} />
                  ))}
                </div>
              </div>

              {/* Chest indicator - only on chest round, hide when time runs out */}
              {chestRoundIndex >= 0 && !chestCollected && !chestMissed && roundNum === chestRoundIndex && chestTimer > 0 && (
                <div className="flex flex-col items-center mt-2 gap-1">
                  <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${chestTimer <= 3 ? 'bg-red-500/40' : 'bg-amber-500/30'}`} style={{ animation: chestTimer <= 3 ? 'matchHintPulse 0.5s ease-in-out infinite' : 'matchHintPulse 1s ease-in-out infinite' }}>
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

            {/* Tile Grid */}
            <div className="flex-1 flex items-center justify-center px-3 pb-4">
              <div className="w-full max-w-[380px] flex flex-col gap-2">
                {/* Round fuse bar — width written imperatively by the rAF loop */}
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mx-1">
                  <div
                    ref={fuseBarRef}
                    className="h-full rounded-full"
                    style={{
                      width: '100%',
                      background: danger
                        ? 'linear-gradient(90deg, #dc2626, #f97316)'
                        : 'linear-gradient(90deg, #22c55e, #a3e635)',
                    }}
                  />
                </div>
                {/* Words */}
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {tiles.slice(0, roundPairs).map((tile, i) => {
                    const isSelected = selected === i
                    const isWrong = wrongPair && (wrongPair[0] === i || wrongPair[1] === i)
                    const isMatched = tile.matched

                    if (isMatched) {
                      return (
                        <div key={tile.id} className="rounded-2xl" style={{ height: 72, animation: 'matchTileMatched 0.5s ease-out forwards' }} />
                      )
                    }

                    return (
                      <button
                        key={tile.id}
                        onPointerDown={() => handleTileTap(i)}
                        className={`match-tile-3d ${isSelected ? 'tile-selected' : ''} rounded-2xl px-2 py-2 text-center font-bold`}
                        style={{
                          height: 72,
                          animation: isWrong ? 'matchTileWrong 0.4s ease-out' : `matchTileIn 0.3s ease-out ${i * 0.03}s both`,
                          background: isSelected
                            ? 'linear-gradient(to bottom, #fde047 0%, #facc15 40%, #eab308 100%)'
                            : 'linear-gradient(to bottom, #60a5fa 0%, #3b82f6 40%, #2563eb 100%)',
                          boxShadow: isSelected
                            ? '0 6px 0 #92400e, 0 0 20px rgba(250,204,21,0.4), inset 0 1px 0 rgba(255,255,255,0.4)'
                            : '0 6px 0 #1e40af, 0 8px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.3)',
                          borderTop: isSelected ? '2px solid #fef08a' : '2px solid rgba(255,255,255,0.15)',
                          borderLeft: isSelected ? '2px solid #fef08a' : '2px solid rgba(255,255,255,0.15)',
                          borderRight: isSelected ? '2px solid #fef08a' : '2px solid rgba(255,255,255,0.15)',
                          borderBottom: 'none',
                          transform: 'none',
                        }}
                      >
                        <span className={`text-white leading-tight ${tile.text.length > 12 ? 'text-[11px]' : tile.text.length > 8 ? 'text-xs' : 'text-sm'}`}
                          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
                        >
                          {tile.text}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 px-2">
                  <div className="flex-1 h-px bg-white/20" />
                  <span className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">match</span>
                  <div className="flex-1 h-px bg-white/20" />
                </div>

                {/* Meanings */}
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {tiles.slice(roundPairs).map((tile, rawI) => {
                    const i = rawI + roundPairs
                    const isSelected = selected === i
                    const isWrong = wrongPair && (wrongPair[0] === i || wrongPair[1] === i)
                    const isMatched = tile.matched

                    if (isMatched) {
                      return (
                        <div key={tile.id} className="rounded-2xl" style={{ height: 72, animation: 'matchTileMatched 0.5s ease-out forwards' }} />
                      )
                    }

                    return (
                      <button
                        key={tile.id}
                        onPointerDown={() => handleTileTap(i)}
                        className={`match-tile-3d ${isSelected ? 'tile-selected' : ''} rounded-2xl px-2 py-2 text-center font-bold`}
                        style={{
                          height: 72,
                          animation: isWrong ? 'matchTileWrong 0.4s ease-out' : `matchTileIn 0.3s ease-out ${rawI * 0.03}s both`,
                          background: isSelected
                            ? 'linear-gradient(to bottom, #fde047 0%, #facc15 40%, #eab308 100%)'
                            : 'linear-gradient(to bottom, #60a5fa 0%, #3b82f6 40%, #2563eb 100%)',
                          boxShadow: isSelected
                            ? '0 6px 0 #92400e, 0 0 20px rgba(250,204,21,0.4), inset 0 1px 0 rgba(255,255,255,0.4)'
                            : '0 6px 0 #1e40af, 0 8px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.3)',
                          borderTop: isSelected ? '2px solid #fef08a' : '2px solid rgba(255,255,255,0.15)',
                          borderLeft: isSelected ? '2px solid #fef08a' : '2px solid rgba(255,255,255,0.15)',
                          borderRight: isSelected ? '2px solid #fef08a' : '2px solid rgba(255,255,255,0.15)',
                          borderBottom: 'none',
                          transform: 'none',
                        }}
                      >
                        <span className={`text-white leading-tight ${tile.text.length > 12 ? 'text-[11px]' : tile.text.length > 8 ? 'text-xs' : 'text-sm'}`}
                          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
                        >
                          {tile.text}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Particles */}
            {particles.map(p => (
              <div
                key={p.id}
                className="absolute w-3 h-3 rounded-full pointer-events-none z-30"
                style={{
                  left: `${p.x}px`,
                  top: `${p.y}px`,
                  backgroundColor: p.color,
                  opacity: p.opacity,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            ))}

            {/* Point popup */}
            {wordPopup && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-1" style={{ animation: 'matchWordPopup 1.2s ease-out forwards' }}>
                  <div className="text-3xl font-black text-white drop-shadow-lg">+{wordPopup.points}</div>
                  {wordPopup.streak >= 3 && (
                    <div className="flex items-center gap-1 bg-yellow-400 text-yellow-900 rounded-full px-3 py-1 text-sm font-bold"
                      style={{ animation: 'matchStreakPulse 0.4s ease-out' }}
                    >
                      <img src={assetUrl('/icon/profile/streak.svg')} alt="streak" className="w-4 h-4" />
                      {wordPopup.streak}x streak
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Round cleared banner */}
            {roundBonus && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-1" style={{ animation: 'matchTimeUp 1.1s ease-out forwards' }}>
                  <div className="text-2xl font-black text-emerald-300 drop-shadow-lg">Round {roundBonus.round} clear!</div>
                  {roundBonus.bonus > 0 && (
                    <div className="bg-emerald-400 text-emerald-950 rounded-full px-3 py-1 text-sm font-bold">
                      +{roundBonus.bonus} speed bonus
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Time-up banner */}
            {timeUp && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-2" style={{ animation: 'matchTimeUp 1s ease-out forwards' }}>
                  <div className="text-4xl font-black text-red-300 drop-shadow-lg">TIME UP!</div>
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
                  <div className="bg-amber-500 text-white rounded-full px-4 py-1.5 font-bold text-sm shadow-lg">
                    Chest Found!
                  </div>
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
              style={{ animation: 'matchResultsFadeIn 0.5s ease-out' }}
            >
              <div
                className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-100 mb-4"
                style={{ animation: 'matchScorePopIn 0.6s ease-out 0.3s both' }}
              >
                <Trophy className="w-10 h-10 text-indigo-500" />
              </div>

              {isRealtimePvP && opponentProgress ? (
                <>
                  <h2 className="text-2xl font-bold text-gray-800 mb-1">
                    {score > opponentProgress.score ? 'You Win!' : score < opponentProgress.score ? 'You Lose!' : "It's a Tie!"}
                  </h2>
                  <p className="text-gray-500 mb-5">
                    {score > opponentProgress.score ? 'Great matching skills!' : score < opponentProgress.score ? 'Better luck next time!' : 'Evenly matched!'}
                  </p>
                  <div className="flex items-center justify-center gap-4 mb-5">
                    <div className={`rounded-2xl p-4 border flex-1 ${score >= opponentProgress.score ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}
                      style={{ animation: 'matchScorePopIn 0.6s ease-out 0.5s both' }}>
                      <p className="text-xs font-semibold text-gray-400 mb-1">You</p>
                      <p className={`text-3xl font-black ${score >= opponentProgress.score ? 'text-green-600' : 'text-gray-400'}`}>{score}</p>
                      <p className="text-xs text-gray-400 mt-1">{totalMatched} pairs</p>
                    </div>
                    <span className="text-gray-300 font-bold text-lg">VS</span>
                    <div className={`rounded-2xl p-4 border flex-1 ${opponentProgress.score >= score ? 'bg-gradient-to-br from-red-50 to-pink-50 border-red-200' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}
                      style={{ animation: 'matchScorePopIn 0.6s ease-out 0.7s both' }}>
                      <p className="text-xs font-semibold text-gray-400 mb-1">Opponent</p>
                      <p className={`text-3xl font-black ${opponentProgress.score >= score ? 'text-red-600' : 'text-gray-400'}`}>{opponentProgress.score}</p>
                      <p className="text-xs text-gray-400 mt-1">{opponentProgress.wordsCompleted} pairs</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Stars */}
                  <div className="flex justify-center gap-2 mb-3">
                    {[1, 2, 3].map(s => (
                      <Star key={s} className={`w-12 h-12 transition-all ${starsEarned >= s ? 'text-yellow-400 fill-yellow-400 drop-shadow-lg' : 'text-gray-300'}`}
                        style={{ animation: starsEarned >= s ? `matchScorePopIn 0.5s ease-out ${0.2 + s * 0.15}s both` : 'matchScorePopIn 0.5s ease-out 0.3s both' }}
                      />
                    ))}
                  </div>

                  <h2 className="text-2xl font-bold text-gray-800 mb-1">
                    {starsEarned >= 3 ? 'Unstoppable!' : starsEarned >= 2 ? 'Great Survival!' : starsEarned >= 1 ? 'Training Complete!' : 'Out of Lives!'}
                  </h2>
                  <p className="text-gray-500 mb-5">
                    {starsEarned >= 1
                      ? `${petName} survived ${roundsCleared} round${roundsCleared > 1 ? 's' : ''}!`
                      : `${petName} only cleared ${roundsCleared}/${passGoal} rounds`}
                  </p>

                  <div
                    className={`rounded-2xl p-5 mb-5 border ${starsEarned >= 3 ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200' : starsEarned >= 1 ? 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}
                    style={{ animation: 'matchScorePopIn 0.6s ease-out 0.5s both' }}
                  >
                    <p className={`text-5xl font-black ${starsEarned >= 3 ? 'text-amber-500' : starsEarned >= 1 ? 'text-indigo-600' : 'text-gray-400'}`}>{roundsCleared}</p>
                    <p className={`text-sm font-semibold mt-1 ${starsEarned >= 3 ? 'text-amber-400' : starsEarned >= 1 ? 'text-indigo-400' : 'text-gray-400'}`}>rounds survived</p>
                    <p className="text-xs text-gray-400 mt-1">{score} points · {totalMatched} pairs · best streak {bestStreak}</p>
                  </div>
                </>
              )}

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

              {!isRealtimePvP && (
                <p className="text-sm text-gray-600 mb-6">
                  {starsEarned >= 3
                    ? 'Awesome memory!'
                    : starsEarned >= 2
                      ? `Amazing! Survive ${star3Goal} rounds for 3 stars!`
                      : starsEarned >= 1
                        ? `Good job! Survive ${star2Goal} rounds for 2 stars!`
                        : `Clear ${passGoal} rounds to earn a star. Try again!`}
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
                  onClick={() => onGameEnd(score, { chestCollected, pairsMatched: totalMatched, roundsCompleted: roundsCleared, stars: starsEarned })}
                  className="w-full py-3.5 bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-indigo-700 active:border-b-0 active:mt-1 transition-all"
                >
                  {isRealtimePvP ? 'Done' : 'Collect Rewards'}
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setPhase('ready')
                      setScore(0)
                      setStreak(0)
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

export default PetMatchGame
