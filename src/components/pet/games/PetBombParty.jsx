import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Heart, Loader2, Volume2, VolumeX, Star } from 'lucide-react'

import { assetUrl } from '../../../hooks/useBranding'
import wordsDictUrl from '../../../assets/bombparty/words.dict?url'
import promptsUrl from '../../../assets/bombparty/prompts.json?url'

const MAX_LIVES = 3
const LIVES_CAP = 5
const POINTS_PER_WORD = 10
const STREAK_BONUS = 5
const BANK_BONUS = 8 // word also appears in the pet word bank (curriculum hit)
// J, Q, X and Z are omitted: they gate the free life behind a handful of words
// a learner is unlikely to reach for, which stalls the meter instead of
// pushing for variety. 22 letters.
const ALPHABET = 'abcdefghiklmnoprstuvwy'.split('')

const BOMB_IMG = '/pet-game/bomb/bomb.png'
// 480x323, 2 frames on a 340ms infinite loop — it is always mid-animation when
// shown, so it needs no restart trick between explosions.
const BOOM_GIF = '/pet-game/bomb/Explosion Boom Sticker by macniten.gif'
const BG_MUSIC = '/pet-game/bomb/bg-bomb-mi.mp3'
const BG_VOLUME = 0.25

const STAR_THRESHOLDS = {
  1: [6, 10, 15],
  2: [8, 12, 18],
  3: [10, 15, 21],
  4: [12, 18, 24],
}

// Fuse shortens as rounds go up, floored so it never becomes impossible.
const fuseForRound = (r) => Math.max(5, 12 - r * 0.3)

const tierForRound = (r) => {
  if (r <= 4) return 'easy'
  if (r <= 10) return Math.random() < 0.6 ? 'easy' : 'medium'
  if (r <= 18) return Math.random() < 0.5 ? 'medium' : 'hard'
  return Math.random() < 0.3 ? 'medium' : 'hard'
}

// Module-level so re-opening the game inside one session doesn't refetch 155 KB.
let DICT_CACHE = null
let PROMPTS_CACHE = null

// Imported with ?url so Vite emits them as hashed files under /assets/ and
// gives us back the URL. They must NOT live in public/: vercel.json rewrites
// /(.*) to /index.html, so every public/ passthrough returns the HTML shell
// with a 200 instead of the file. /assets/ is exempt because it is emitted by
// the build. These imports are just strings — the bytes are still fetched
// lazily at runtime, not bundled into the JS.

// words.dict is prefix-delta encoded by scripts/build-bombparty-words.mjs: the
// list is sorted, so each line is (number of chars shared with the previous
// word, as '0' + n) followed by the differing suffix.
function decodeDict(text) {
  const out = new Set()
  let prev = ''
  for (const line of text.split('\n')) {
    if (!line) continue
    prev = prev.slice(0, line.charCodeAt(0) - 48) + line.slice(1)
    out.add(prev)
  }
  return out
}

async function loadWordAssets() {
  if (DICT_CACHE && PROMPTS_CACHE) return { dict: DICT_CACHE, prompts: PROMPTS_CACHE }
  const [wordsRes, promptsRes] = await Promise.all([fetch(wordsDictUrl), fetch(promptsUrl)])
  if (!wordsRes.ok || !promptsRes.ok) throw new Error('word assets unavailable')

  const text = await wordsRes.text()
  // A misrouted request can return the SPA shell with a 200, so res.ok is not
  // enough — parsing that as a dictionary yields garbage and silently rejects
  // every word the player types. Fail loudly instead.
  if (text.startsWith('<')) throw new Error('word list returned HTML, not the dictionary')
  const dict = decodeDict(text)
  if (dict.size < 1000) throw new Error(`word list looks truncated (${dict.size} entries)`)

  const prompts = await promptsRes.json()
  if (!Array.isArray(prompts) || prompts.length === 0) throw new Error('prompt table is empty')

  DICT_CACHE = dict
  PROMPTS_CACHE = prompts
  return { dict: DICT_CACHE, prompts: PROMPTS_CACHE }
}

const PetBombParty = ({
  petImageUrl,
  petName,
  onGameEnd,
  onClose,
  wordBank: wordBankProp = [],
  hideClose = false,
  scoreToBeat = null,
  leaderboard = [],
  pvpOpponentPetUrl = null,
  onProgressUpdate = null,
  isRealtimePvP = false,
  currentLevel = 1,
}) => {
  const thresholds = STAR_THRESHOLDS[currentLevel] || [6, 10, 15]
  const [star1Goal, star2Goal, star3Goal] = thresholds
  const passGoal = star1Goal

  const [phase, setPhase] = useState('loading')
  const [loadError, setLoadError] = useState(false)
  const [prompt, setPrompt] = useState(null)
  const [typedValue, setTypedValue] = useState('')
  // The fuse animates at 60fps, so it is written straight to the DOM in the rAF
  // loop rather than through state — a setState per frame does not commit
  // reliably and re-rendered the whole game (including the input) every frame.
  // `danger` is the only part that becomes state, and it flips once per round.
  const [danger, setDanger] = useState(false)
  const [lives, setLives] = useState(MAX_LIVES)
  const [displayScore, setDisplayScore] = useState(0)
  const [wordsDefused, setWordsDefused] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [usedLetters, setUsedLetters] = useState(new Set())
  const [feedback, setFeedback] = useState(null) // { kind, text }
  const [wordPopup, setWordPopup] = useState(null)
  const [exploding, setExploding] = useState(false)
  const [lifeGained, setLifeGained] = useState(false)
  const [muted, setMuted] = useState(false)
  const [screenShake, setScreenShake] = useState(0)
  const [particles, setParticles] = useState([])
  const [missedPrompts, setMissedPrompts] = useState([])
  // Visible viewport, tracked so the on-screen keyboard doesn't cover the bomb
  // and the input. 100dvh excludes browser chrome but NOT the virtual keyboard.
  const [viewport, setViewport] = useState(null)

  const dictRef = useRef(null)
  const promptsRef = useRef([])
  const bankRef = useRef(new Set())
  const usedWordsRef = useRef(new Set())
  const usedLettersRef = useRef(new Set())
  const recentPromptsRef = useRef([])
  const livesRef = useRef(MAX_LIVES)
  const scoreRef = useRef(0)
  const streakRef = useRef(0)
  const roundRef = useRef(0)
  const wordsDefusedRef = useRef(0)
  const promptRef = useRef(null)
  const fuseEndRef = useRef(0)
  const fuseMaxRef = useRef(12)
  const fuseBarRef = useRef(null)
  const fuseNumRef = useRef(null)
  const bombRef = useRef(null)
  const beatRef = useRef(0)
  const dangerRef = useRef(false)
  const runningRef = useRef(false)
  const bestStreakRef = useRef(0)
  const mountedRef = useRef(true)
  const rafRef = useRef(null)
  const shakeRef = useRef(0)
  const roundStartRef = useRef(Date.now())

  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const audioCache = useRef({})
  const bgMusicRef = useRef(null)

  const starsEarned =
    wordsDefused >= star3Goal ? 3 : wordsDefused >= star2Goal ? 2 : wordsDefused >= star1Goal ? 1 : 0

  const playSound = useCallback((url, volume = 0.5, rate = 1) => {
    try {
      if (!audioCache.current[url]) audioCache.current[url] = new Audio(url)
      const sound = audioCache.current[url]
      sound.volume = volume
      sound.playbackRate = rate
      sound.currentTime = 0
      sound.play().catch(() => {})
    } catch { /* audio is best-effort */ }
  }, [])

  // Load dictionary + prompt table
  useEffect(() => {
    let cancelled = false
    // Warm the explosion GIF so the first bomb doesn't blink an empty frame.
    try {
      new Image().src = assetUrl(BOOM_GIF)
    } catch { /* preload is best-effort */ }
    loadWordAssets()
      .then(({ dict, prompts }) => {
        if (cancelled) return
        dictRef.current = dict
        promptsRef.current = prompts
        setPhase('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Words from the pet word bank score a bonus, so the game still pulls toward
  // the curriculum even though any real English word is accepted.
  useEffect(() => {
    bankRef.current = new Set(
      (wordBankProp || []).map((w) => String(w.word || '').toLowerCase()).filter(Boolean)
    )
  }, [wordBankProp])

  // When the keyboard opens, visualViewport.height shrinks to the region the
  // student can actually see, and offsetTop shifts if the page scrolled. Pin
  // the overlay to that box so the layout reflows above the keyboard instead
  // of sliding underneath it.
  useEffect(() => {
    const vp = window.visualViewport
    if (!vp) return
    const update = () => setViewport({ h: vp.height, top: vp.offsetTop })
    update()
    vp.addEventListener('resize', update)
    vp.addEventListener('scroll', update)
    return () => {
      vp.removeEventListener('resize', update)
      vp.removeEventListener('scroll', update)
    }
  }, [])

  const spawnParticles = useCallback((count, colors) => {
    const spawned = Array.from({ length: count }, (_, i) => ({
      id: `bp-${Date.now()}-${i}-${Math.random()}`,
      x: (containerRef.current?.clientWidth || 400) / 2 + (Math.random() - 0.5) * 120,
      y: (containerRef.current?.clientHeight || 700) * 0.42,
      vx: (Math.random() - 0.5) * 10,
      vy: -Math.random() * 7 - 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 1,
    }))
    setParticles((prev) => [...prev, ...spawned])
  }, [])

  const pickPrompt = useCallback((r) => {
    const tier = tierForRound(r)
    const pool = promptsRef.current.filter((p) => p.tier === tier)
    const source = pool.length ? pool : promptsRef.current
    const recent = recentPromptsRef.current
    // Avoid repeating any of the last 20 syllables.
    const fresh = source.filter((p) => !recent.includes(p.s))
    const candidates = fresh.length ? fresh : source
    const picked = candidates[Math.floor(Math.random() * candidates.length)]
    recentPromptsRef.current = [...recent, picked.s].slice(-20)
    return picked
  }, [])

  const nextRound = useCallback(() => {
    const r = roundRef.current + 1
    roundRef.current = r
    const next = pickPrompt(r)
    promptRef.current = next
    setPrompt(next)
    const duration = fuseForRound(r)
    fuseMaxRef.current = duration
    fuseEndRef.current = performance.now() + duration * 1000
    // Paint a full fuse immediately so the new round doesn't flash the old width.
    if (fuseBarRef.current) fuseBarRef.current.style.width = '100%'
    if (fuseNumRef.current) fuseNumRef.current.textContent = duration.toFixed(1)
    dangerRef.current = false
    setDanger(false)
    // Force the loop to re-apply the tempo — React's re-render resets the
    // animation shorthand (and with it the duration) back to 1.1s.
    beatRef.current = 0
    roundStartRef.current = Date.now()
    setTypedValue('')
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [pickPrompt])

  const endGame = useCallback((nextPhase) => {
    runningRef.current = false
    setPhase(nextPhase)
    if (bgMusicRef.current) {
      bgMusicRef.current.pause()
      bgMusicRef.current = null
    }
  }, [])

  const handleExplode = useCallback(() => {
    if (!runningRef.current) return
    runningRef.current = false // pause the fuse during the explosion beat

    const missed = promptRef.current
    if (missed) setMissedPrompts((prev) => [...prev, missed])

    streakRef.current = 0
    setStreak(0)
    setExploding(true)
    shakeRef.current = 18
    setScreenShake(18)
    spawnParticles(24, ['#f97316', '#ef4444', '#facc15', '#fb923c'])
    if (!muted) playSound(assetUrl('/sound/flappy-hit.mp3'), 0.5)

    const remaining = livesRef.current - 1
    livesRef.current = remaining
    setLives(remaining)

    setTimeout(() => {
      if (!mountedRef.current) return
      setExploding(false)
      if (remaining <= 0) {
        endGame('results')
      } else {
        runningRef.current = true
        nextRound()
      }
    }, 900)
  }, [muted, playSound, spawnParticles, nextRound, endGame])

  // Fuse countdown
  useEffect(() => {
    if (phase !== 'playing') return
    const tick = () => {
      shakeRef.current = Math.max(0, shakeRef.current - 0.6)
      setScreenShake(shakeRef.current)
      // Returning `prev` unchanged lets React bail out instead of re-rendering
      // every frame on an empty particle list.
      setParticles((prev) =>
        prev.length === 0
          ? prev
          : prev
              .map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.18, opacity: p.opacity - 0.02 }))
              .filter((p) => p.opacity > 0)
      )
      if (runningRef.current) {
        const remaining = Math.max(0, (fuseEndRef.current - performance.now()) / 1000)
        const pct = fuseMaxRef.current > 0 ? Math.max(0, Math.min(1, remaining / fuseMaxRef.current)) : 0
        if (fuseBarRef.current) fuseBarRef.current.style.width = `${pct * 100}%`
        if (fuseNumRef.current) fuseNumRef.current.textContent = remaining.toFixed(1)

        // Heartbeat tempo: calm 1.1s cycle at a full fuse, frantic 0.32s at zero.
        // Quantised to 50ms because rewriting animation-duration every frame
        // makes the beat stutter (the elapsed time remaps mid-cycle).
        const beat = Math.round((0.32 + 0.78 * pct) * 20) / 20
        if (beat !== beatRef.current) {
          beatRef.current = beat
          if (bombRef.current) bombRef.current.style.animationDuration = `${beat}s`
        }

        const isDanger = remaining <= 3
        if (isDanger !== dangerRef.current) {
          dangerRef.current = isDanger
          setDanger(isDanger)
        }
        if (remaining <= 0) handleExplode()
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [phase, handleExplode])

  const flashFeedback = useCallback((kind, text) => {
    setFeedback({ kind, text })
    setTimeout(() => setFeedback(null), 1100)
  }, [])

  const handleSubmit = useCallback(() => {
    if (phase !== 'playing' || !runningRef.current || exploding) return
    const answer = typedValue.trim().toLowerCase()
    const syllable = promptRef.current?.s
    if (!answer || !syllable) return

    if (!answer.includes(syllable)) {
      flashFeedback('nomatch', `Needs "${syllable.toUpperCase()}"`)
      shakeRef.current = 8
      return
    }
    if (usedWordsRef.current.has(answer)) {
      flashFeedback('used', 'Already used!')
      shakeRef.current = 8
      return
    }
    if (!dictRef.current?.has(answer)) {
      flashFeedback('invalid', 'Not a word')
      shakeRef.current = 8
      setTypedValue('')
      return
    }

    // ── valid answer ──
    usedWordsRef.current.add(answer)

    const newStreak = streakRef.current + 1
    streakRef.current = newStreak
    setStreak(newStreak)
    if (newStreak > bestStreakRef.current) {
      bestStreakRef.current = newStreak
      setBestStreak(newStreak)
    }

    let points = POINTS_PER_WORD
    if (newStreak >= 3) points += STREAK_BONUS
    if (answer.length >= 9) points += 12
    else if (answer.length >= 7) points += 8
    else if (answer.length >= 5) points += 4
    const elapsed = (Date.now() - roundStartRef.current) / 1000
    if (elapsed < 2.5) points += 6
    else if (elapsed < 4.5) points += 3
    const inBank = bankRef.current.has(answer)
    if (inBank) points += BANK_BONUS

    scoreRef.current += points
    setDisplayScore(scoreRef.current)
    wordsDefusedRef.current += 1
    setWordsDefused(wordsDefusedRef.current)

    // Alphabet meter — using every letter once refills a life, which is what
    // pushes players toward unusual words instead of the same safe answers.
    let gainedLife = false
    const letters = new Set(usedLettersRef.current)
    for (const ch of answer) if (ALPHABET.includes(ch)) letters.add(ch)
    if (letters.size >= ALPHABET.length) {
      letters.clear()
      if (livesRef.current < LIVES_CAP) {
        livesRef.current += 1
        setLives(livesRef.current)
        gainedLife = true
        setLifeGained(true)
        setTimeout(() => setLifeGained(false), 1600)
      }
    }
    usedLettersRef.current = letters
    setUsedLetters(new Set(letters))

    setWordPopup({ points, streak: newStreak, inBank, gainedLife })
    setTimeout(() => setWordPopup(null), 1200)
    spawnParticles(14, ['#a78bfa', '#f472b6', '#facc15', '#34d399', '#60a5fa'])
    if (!muted) playSound(assetUrl('/sound/scram-correct.mp3'), 0.4)

    if (onProgressUpdate) {
      onProgressUpdate({ score: scoreRef.current, wordsCompleted: wordsDefusedRef.current })
    }

    nextRound()
  }, [
    phase,
    typedValue,
    exploding,
    flashFeedback,
    muted,
    playSound,
    spawnParticles,
    nextRound,
    onProgressUpdate,
  ])

  const startGame = useCallback(() => {
    usedWordsRef.current = new Set()
    usedLettersRef.current = new Set()
    recentPromptsRef.current = []
    livesRef.current = MAX_LIVES
    scoreRef.current = 0
    streakRef.current = 0
    roundRef.current = 0
    wordsDefusedRef.current = 0
    bestStreakRef.current = 0

    setBestStreak(0)
    setUsedLetters(new Set())
    setLives(MAX_LIVES)
    setDisplayScore(0)
    setStreak(0)
    setWordsDefused(0)
    setMissedPrompts([])
    setFeedback(null)
    setWordPopup(null)
    setExploding(false)
    setParticles([])
    setPhase('playing')
    runningRef.current = true
    nextRound()

    try {
      const music = new Audio(assetUrl(BG_MUSIC))
      music.loop = true
      music.volume = muted ? 0 : BG_VOLUME
      bgMusicRef.current = music
      music.play().catch(() => {})
    } catch { /* audio is best-effort */ }
  }, [nextRound, muted])

  // Auto-start for realtime PvP (skip the ready screen)
  useEffect(() => {
    if (isRealtimePvP && phase === 'ready') startGame()
  }, [isRealtimePvP, phase, startGame])

  // End-of-game sounds
  useEffect(() => {
    if (phase === 'results') {
      if (wordsDefusedRef.current >= passGoal) {
        playSound(assetUrl('/pet-game/angry/angry-birds-level-complete.mp3'), 0.5)
      } else {
        playSound(assetUrl('/sound/craft_fail.mp3'), 0.5)
      }
    }
  }, [phase, playSound, passGoal])

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

  // Below this the bomb + fuse + input + meter no longer fit at full size,
  // which is exactly the situation once a phone keyboard is up.
  const compact = viewport ? viewport.h < 620 : false
  // Everything except the bomb costs ~220px in compact mode, so the bomb gets
  // whatever is left. Continuous rather than stepped, so a 667px phone with the
  // keyboard up (~317px visible) still fits instead of overflowing.
  const bombPx = compact ? Math.max(88, Math.min(160, viewport.h - 228)) : 208
  const syllable = prompt?.s?.toUpperCase() || ''
  const syllablePx = Math.round(bombPx * (syllable.length > 2 ? 0.125 : 0.15))
  const typedLower = typedValue.trim().toLowerCase()
  const matchesSyllable = prompt && typedLower.includes(prompt.s)

  return createPortal(
    <div
      className="fixed left-0 right-0 z-50 select-none overflow-hidden bg-black/70 flex items-center justify-center"
      style={{
        top: viewport ? `${viewport.top}px` : 0,
        height: viewport ? `${viewport.h}px` : '100dvh',
      }}
    >
      <style>{`
        @keyframes bpFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
        @keyframes bpPopIn { 0% { transform: scale(0.4); opacity: 0 } 60% { transform: scale(1.15) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes bpScorePop { 0% { transform: scale(0.5) translateY(0); opacity: 0 } 25% { transform: scale(1.2) translateY(-6px); opacity: 1 } 100% { transform: scale(1) translateY(-70px); opacity: 0 } }
        @keyframes bpHeartLose { 0% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.4); opacity: .5 } 100% { transform: scale(0); opacity: 0 } }
        @keyframes bpPulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.06) } }
        @keyframes bpDangerPulse { 0%,100% { transform: scale(1); filter: brightness(1) } 50% { transform: scale(1.09); filter: brightness(1.35) } }
        /* lub-dub, then rest — the cycle length is set from the fuse in the rAF loop */
        @keyframes bpHeartbeat {
          0%   { transform: scale(1) }
          9%   { transform: scale(1.14) }
          19%  { transform: scale(1) }
          28%  { transform: scale(1.07) }
          40%  { transform: scale(1) }
          100% { transform: scale(1) }
        }
        @keyframes bpBoom { 0% { transform: scale(0.3); opacity: 1 } 70% { transform: scale(1.9); opacity: .85 } 100% { transform: scale(2.4); opacity: 0 } }
        /* Sized for the BOOM sticker: overshoot, settle, then fade out over the
           900ms the explosion beat lasts. Kept under ~1.2x so a 256px-wide
           sticker cannot overflow the 400px game frame. */
        @keyframes bpBoomImg {
          0%   { transform: scale(0.35) rotate(-9deg); opacity: 0 }
          22%  { transform: scale(1.18) rotate(4deg);  opacity: 1 }
          50%  { transform: scale(1)    rotate(0deg);  opacity: 1 }
          80%  { transform: scale(1.04) rotate(0deg);  opacity: 1 }
          100% { transform: scale(1.15) rotate(0deg);  opacity: 0 }
        }
        @keyframes bpShakeIn { 0% { transform: translateX(0) } 25% { transform: translateX(-7px) } 75% { transform: translateX(7px) } 100% { transform: translateX(0) } }
        @keyframes bpLifeUp { 0% { transform: scale(0.5) translateY(0); opacity: 0 } 30% { transform: scale(1.2); opacity: 1 } 100% { transform: scale(1) translateY(-40px); opacity: 0 } }
      `}</style>

      <div
        ref={containerRef}
        className="relative w-full max-w-[400px] h-full max-h-[100dvh] overflow-hidden rounded-none sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl"
        style={{
          background: danger && phase === 'playing'
            ? 'linear-gradient(135deg, #7f1d1d 0%, #b91c1c 50%, #ea580c 100%)'
            : 'linear-gradient(135deg, #1e293b 0%, #4c1d95 50%, #7c3aed 100%)',
          transition: 'background 0.4s ease',
          transform: screenShake > 0
            ? `translate(${Math.sin(screenShake * 2) * 3}px, ${Math.cos(screenShake * 2) * 3}px)`
            : 'none',
        }}
      >
        {/* Decorative circles */}
        <div className="absolute top-[-10%] right-[-5%] w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute bottom-[-15%] left-[-10%] w-80 h-80 rounded-full bg-white/5 pointer-events-none" />

        {/* Close */}
        {phase !== 'results' && !hideClose && (
          <button
            onClick={onClose}
            className="absolute top-4 left-4 z-50 bg-white/80 backdrop-blur rounded-full p-2 shadow-lg hover:bg-white transition-colors"
          >
            <X className="w-6 h-6 text-gray-700" />
          </button>
        )}

        {/* Mute */}
        {phase !== 'results' && (
          <button
            onClick={() => {
              setMuted((m) => {
                const next = !m
                if (bgMusicRef.current) bgMusicRef.current.volume = next ? 0 : BG_VOLUME
                return next
              })
            }}
            className="absolute top-4 right-4 z-50 bg-white/80 backdrop-blur rounded-full p-2 shadow-lg hover:bg-white transition-colors"
          >
            {muted ? <VolumeX className="w-5 h-5 text-gray-700" /> : <Volume2 className="w-5 h-5 text-gray-700" />}
          </button>
        )}

        {/* Loading */}
        {phase === 'loading' && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
            {loadError ? (
              <>
                <span className="text-6xl">💣</span>
                <p className="text-white/90 font-semibold">Couldn&apos;t load the dictionary.</p>
                <p className="text-white/60 text-sm">Check your connection and try again.</p>
                <button
                  onClick={onClose}
                  className="mt-2 px-8 py-3 bg-white text-purple-700 rounded-full font-bold shadow-xl"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <Loader2 className="w-10 h-10 text-white animate-spin" />
                <p className="text-white/70 text-sm">Loading dictionary…</p>
              </>
            )}
          </div>
        )}

        {/* Ready */}
        {phase === 'ready' && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8 text-center overflow-y-auto">
            <div className="flex items-center gap-4" style={{ animation: 'bpFloat 1.5s ease-in-out infinite' }}>
              {petImageUrl ? (
                <img
                  src={petImageUrl}
                  alt={petName}
                  className="w-24 h-24 object-contain drop-shadow-lg"
                  onError={(e) => {
                    e.target.style.display = 'none'
                    if (e.target.nextSibling) e.target.nextSibling.style.display = ''
                  }}
                />
              ) : null}
              <img
                src={assetUrl(BOMB_IMG)}
                alt=""
                draggable={false}
                className="w-24 h-24 object-contain drop-shadow-lg select-none"
                style={{ display: petImageUrl ? 'none' : '' }}
              />
              {pvpOpponentPetUrl && (
                <>
                  <span className="text-2xl font-black text-red-400" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>VS</span>
                  <img src={pvpOpponentPetUrl} alt="Opponent" className="w-24 h-24 object-contain drop-shadow-lg" style={{ transform: 'scaleX(-1)' }} />
                </>
              )}
            </div>

            <div>
              <h2 className="text-3xl font-black text-white mb-2" style={{ textShadow: '0 2px 0 rgba(0,0,0,0.2)' }}>
                Bomb Defuse
              </h2>
              <p className="text-lg text-white/80 mb-1">Type a word containing the syllable — before it blows!</p>
              <p className="text-sm text-white/60">Use every letter A–Z to earn a life back.</p>
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
              className="px-10 py-4 bg-white text-purple-700 rounded-full font-bold text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform border-b-4 border-purple-200"
            >
              Start!
            </button>
          </div>
        )}

        {/* Playing */}
        {phase === 'playing' && (
          <div className="w-full h-full relative flex flex-col">
            {particles.map((p) => (
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

            {/* === TOP HUD === */}
            <div className="px-4 pt-3 pb-1 z-10">
              <div className="w-full max-w-md mx-auto flex items-start justify-between">
                <div className={`flex flex-col items-start gap-1 ${isRealtimePvP ? '' : 'ml-10'}`}>
                  <div className="bg-white/20 backdrop-blur rounded-2xl px-4 py-2 flex items-center gap-2">
                    <span className="text-xl font-black text-white">{displayScore}</span>
                  </div>
                  {/* Score-to-beat progress bar */}
                  {(() => {
                    const nextToBeat = leaderboard.length > 0
                      ? [...leaderboard].reverse().find((e) => e.score > displayScore) || null
                      : scoreToBeat
                    if (!nextToBeat) return null
                    const gap = nextToBeat.score - displayScore
                    const isClose = gap > 0 && gap <= 20
                    const pct = Math.min(100, Math.round((displayScore / nextToBeat.score) * 100))
                    return (
                      <div className="w-28 ml-1" style={{ animation: isClose ? 'bpPulse 0.6s ease-in-out infinite' : 'none' }}>
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
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              background: isClose
                                ? 'linear-gradient(90deg, #f97316, #ef4444)'
                                : 'linear-gradient(90deg, #22c55e, #86efac)',
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
                      <img
                        src={petImageUrl}
                        alt={petName}
                        className="w-10 h-10 object-contain drop-shadow-md"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    )}
                    <div className="flex gap-0.5">
                      {Array.from({ length: Math.max(MAX_LIVES, lives) }).map((_, i) => (
                        <Heart
                          key={i}
                          className={`w-3.5 h-3.5 transition-all ${i < lives ? 'text-red-400 fill-red-400' : 'text-gray-600/40'}`}
                          style={i === lives ? { animation: 'bpHeartLose 0.5s ease-out' } : {}}
                        />
                      ))}
                    </div>
                    {lifeGained && (
                      <div
                        className="absolute -top-2 left-1/2 -translate-x-1/2 text-green-300 font-black text-sm whitespace-nowrap pointer-events-none"
                        style={{ animation: 'bpLifeUp 1.6s ease-out forwards' }}
                      >
                        +1 LIFE!
                      </div>
                    )}
                  </div>
                )}

                {/* Fuse count now lives under the bomb; this slot keeps the streak badge. */}
                <div className={`flex flex-col items-end gap-1 ${isRealtimePvP ? '' : 'mr-10'}`}>
                  {streak >= 3 && (
                    <div className="bg-orange-500/80 rounded-full px-2 py-0.5 text-[10px] font-black text-white">
                      🔥 {streak}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* === BOMB === */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 relative">
              {exploding && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                  <img
                    src={assetUrl(BOOM_GIF)}
                    alt="Boom"
                    draggable={false}
                    className="w-64 max-w-full h-auto select-none"
                    style={{ animation: 'bpBoomImg 0.9s ease-out forwards' }}
                  />
                </div>
              )}

              <div
                ref={bombRef}
                className="relative flex items-center justify-center"
                style={{
                  // Duration is overwritten each round by the rAF loop so the
                  // beat accelerates as the fuse burns down.
                  animation: exploding ? 'none' : 'bpHeartbeat 1.1s ease-in-out infinite',
                  filter: danger
                    ? 'brightness(1.25) drop-shadow(0 0 14px rgba(239,68,68,0.7))'
                    : 'none',
                  transition: 'filter 0.3s ease',
                  opacity: exploding ? 0.15 : 1,
                }}
              >
                <img
                  src={assetUrl(BOMB_IMG)}
                  alt=""
                  draggable={false}
                  className="object-contain drop-shadow-2xl select-none pointer-events-none"
                  style={{ width: `${bombPx}px`, height: `${bombPx}px`, transition: 'width .2s, height .2s' }}
                />
                {/* The bomb body is low-left in the 700x700 frame (the fuse and
                    spark fill the upper right), so the syllable is centred on
                    the body rather than on the image box. */}
                <span
                  className="absolute font-black text-white tracking-widest"
                  style={{
                    left: '42.5%',
                    top: '59.5%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: `${syllablePx}px`,
                    textShadow: '0 2px 6px rgba(0,0,0,0.9)',
                  }}
                >
                  {syllable}
                </span>
              </div>

              {/* Fuse bar */}
              <div className={`w-full max-w-[260px] h-2.5 rounded-full bg-black/30 overflow-hidden ${compact ? 'mt-2' : 'mt-5'}`}>
                {/* width is driven imperatively by the rAF loop — no transition,
                    or it would fight the per-frame writes */}
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

              {/* Fuse count — textContent is driven imperatively by the rAF loop */}
              <div
                ref={fuseNumRef}
                className={`font-black tabular-nums leading-none transition-colors ${compact ? 'mt-1' : 'mt-2'} ${
                  danger ? 'text-red-300' : 'text-white'
                }`}
                style={{
                  fontSize: compact ? '1.4rem' : '2rem',
                  textShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  animation: danger ? 'bpPulse 0.4s ease-in-out infinite' : 'none',
                }}
              />

              {/* Word popup */}
              {wordPopup && (
                <div
                  className="absolute z-30 pointer-events-none flex flex-col items-center"
                  style={{ animation: 'bpScorePop 1.2s ease-out forwards', top: '18%' }}
                >
                  <span className="text-3xl font-black text-yellow-300" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>
                    +{wordPopup.points}
                  </span>
                  {wordPopup.inBank && (
                    <span className="text-[11px] font-bold text-emerald-300">📚 vocab bonus!</span>
                  )}
                </div>
              )}

              {/* Feedback */}
              <div className={`h-6 ${compact ? 'mt-1' : 'mt-3'}`}>
                {feedback && (
                  <span
                    className={`text-sm font-bold ${
                      feedback.kind === 'used' ? 'text-amber-300' : 'text-red-300'
                    }`}
                    style={{ animation: 'bpShakeIn 0.35s ease-out' }}
                  >
                    {feedback.text}
                  </span>
                )}
              </div>
            </div>

            {/* === INPUT === */}
            <div className={`px-5 z-10 ${compact ? 'pb-2' : 'pb-4'}`}>
              <input
                ref={inputRef}
                type="text"
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value.replace(/[^a-zA-Z]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                disabled={exploding}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={`a word with "${syllable}"…`}
                className={`w-full text-center text-2xl font-black tracking-wide rounded-2xl px-4 bg-white/95 outline-none border-4 transition-colors lowercase ${compact ? 'py-2' : 'py-3.5'} ${
                  typedLower.length === 0
                    ? 'border-white/30 text-gray-800'
                    : matchesSyllable
                      ? 'border-emerald-400 text-emerald-700'
                      : 'border-red-400 text-red-600'
                }`}
              />

              {/* Alphabet meter */}
              <div className={`flex flex-wrap justify-center gap-[3px] ${compact ? 'mt-1.5' : 'mt-3'}`}>
                {ALPHABET.map((ch) => (
                  <span
                    key={ch}
                    className={`w-[11px] h-[14px] rounded-[2px] text-[8px] font-black flex items-center justify-center uppercase transition-colors ${
                      usedLetters.has(ch) ? 'bg-emerald-400 text-emerald-950' : 'bg-white/15 text-white/40'
                    }`}
                  >
                    {ch}
                  </span>
                ))}
              </div>
              {/* Dropped when the keyboard is up — the meter itself still reads fine. */}
              {!compact && (
                <p className="text-center text-[10px] text-white/50 mt-1.5">
                  {ALPHABET.length - usedLetters.size} letters to a free life
                </p>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {phase === 'results' && (
          <div className="w-full h-full flex items-center justify-center p-5 overflow-y-auto">
            <div
              className="bg-white rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl"
              style={{ animation: 'bpPopIn 0.4s ease-out' }}
            >
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3].map((s) => (
                  <Star
                    key={s}
                    className={`w-12 h-12 transition-all ${starsEarned >= s ? 'text-yellow-400 fill-yellow-400 drop-shadow-lg' : 'text-gray-300'}`}
                    style={{ animation: starsEarned >= s ? `bpPopIn 0.5s ease-out ${0.2 + s * 0.15}s both` : 'bpPopIn 0.5s ease-out 0.3s both' }}
                  />
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-800 mb-1">
                {starsEarned >= 3
                  ? 'Bomb Defused!'
                  : starsEarned >= 2
                    ? 'Great Job!'
                    : starsEarned >= 1
                      ? 'Training Complete!'
                      : 'Boom!'}
              </h2>
              <p className="text-gray-500 mb-5">
                {starsEarned >= 1
                  ? `${petName} defused ${wordsDefused} bombs!`
                  : `${petName} only defused ${wordsDefused}/${passGoal} bombs`}
              </p>

              <div
                className={`rounded-2xl p-5 mb-5 border ${
                  starsEarned >= 3
                    ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200'
                    : starsEarned >= 1
                      ? 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-100'
                      : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'
                }`}
              >
                <p
                  className={`text-5xl font-black ${
                    starsEarned >= 3 ? 'text-yellow-500' : starsEarned >= 1 ? 'text-purple-600' : 'text-gray-400'
                  }`}
                >
                  {displayScore}
                </p>
                <p className="text-sm font-semibold mt-1 text-gray-400">
                  {wordsDefused} words · best streak {bestStreak}
                </p>
              </div>

              {missedPrompts.length > 0 && (
                <div className="mb-5 text-left">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">
                    Syllables to practice
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {missedPrompts.map((p, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg bg-red-50 border border-red-100 text-sm font-black text-red-500">
                        {p.s.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-sm text-gray-600 mb-6">
                {starsEarned >= 3
                  ? 'Word master! Nothing gets past you.'
                  : starsEarned >= 2
                    ? `Amazing! Defuse ${star3Goal} for 3 stars!`
                    : starsEarned >= 1
                      ? `Good job! Defuse ${star2Goal} for 2 stars!`
                      : `Defuse at least ${star1Goal} bombs to earn a star. Try again!`}
              </p>

              {isRealtimePvP || starsEarned >= 1 ? (
                <button
                  onClick={() => onGameEnd(displayScore, { wordsCompleted: wordsDefused, stars: starsEarned })}
                  className="w-full py-3.5 bg-gradient-to-b from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-purple-700 active:border-b-0 active:mt-1 transition-all"
                >
                  {isRealtimePvP ? 'Done' : 'Collect Rewards'}
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setPhase('ready')}
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

export default PetBombParty
