import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Heart, Zap } from 'lucide-react'
import { assetUrl } from '../../../hooks/useBranding'
import { getZone } from '../../../utils/wildZones'

/* ---- Constants ---- */
const RARITY_CONFIG = {
  common:    { stops: 2 },
  uncommon:  { stops: 2 },
  rare:      { stops: 3 },
  epic:      { stops: 4 },
  legendary: { stops: 5 },
}

const RC = {
  common:    { solid: '#9CA3AF', light: 'rgba(156,163,175,0.5)', glow: 'rgba(156,163,175,0.25)', gradient: 'from-gray-300 to-gray-400', trail: '#4B5563' },
  uncommon:  { solid: '#4ADE80', light: 'rgba(74,222,128,0.5)',  glow: 'rgba(74,222,128,0.25)',  gradient: 'from-green-300 to-green-500', trail: '#166534' },
  rare:      { solid: '#60A5FA', light: 'rgba(96,165,250,0.5)',  glow: 'rgba(96,165,250,0.25)',  gradient: 'from-blue-300 to-blue-500', trail: '#1e3a5f' },
  epic:      { solid: '#C084FC', light: 'rgba(192,132,252,0.5)', glow: 'rgba(192,132,252,0.25)', gradient: 'from-purple-400 to-purple-600', trail: '#3b1f6e' },
  legendary: { solid: '#FACC15', light: 'rgba(250,204,21,0.5)',  glow: 'rgba(250,204,21,0.25)',  gradient: 'from-yellow-300 to-amber-500', trail: '#713f12' },
}

// Biomes are the Wild Area zones (src/utils/wildZones.js), in the original cycling order
const BIOMES = ['forest', 'caves', 'volcano', 'swamp', 'ruins'].map(getZone)

// World map layout. Spots are % of the world box (x: left→right, y: top→bottom) and mark where
// each thing's feet stand. A zone can hand-place them via `layout` in wildZones.js (admins:
// "Edit layout" on the map); otherwise they sit evenly on one row.
// Background for every battle scene (stage intro, fight, victory), whatever the zone
const FIGHT_BG = assetUrl('/adventure/pet-adventure-fight-bg.jpg')

// Side-scrolling is off for now: the world is exactly one screen. Set to true to bring back the
// wide, scrolling world (map image at full height with its own width; narrow screens scroll).
const MAP_SCROLLING = false
const WORLD_MIN_W = 900 // (scrolling only) narrower screens scroll sideways instead of squashing the spots
const LAYOUT_SPOTS = 5  // monster spots per layout (the most a run can have)
const worldWidth = (viewW) => Math.max(viewW, WORLD_MIN_W)

const defaultLayout = (n) => ({
  camp: { x: 6, y: 62 },
  monsters: Array.from({ length: n }, (_, i) => ({ x: Math.round((6 + (88 * (i + 1)) / (n + 1)) * 2) / 2, y: 62 })),
  prize: { x: 94, y: 62 },
})

// Points in walking order: camp, monsters…, prize. Shorter runs use spots spread across the
// layout, always ending on the last spot (the final boss).
const worldPoints = (layout, n) => {
  if (!layout || !(layout.monsters?.length >= n)) {
    const d = defaultLayout(n)
    return [d.camp, ...d.monsters, d.prize]
  }
  const spots = layout.monsters
  const picked = Array.from({ length: n }, (_, i) =>
    spots[Math.round((i * (spots.length - 1)) / Math.max(1, n - 1))])
  return [layout.camp, ...picked, layout.prize]
}

const layoutSnippet = (layout) => {
  const pt = (p) => `{ x: ${p.x}, y: ${p.y} }`
  return [
    '    layout: {',
    `      camp: ${pt(layout.camp)},`,
    `      monsters: [${layout.monsters.map(pt).join(', ')}],`,
    `      prize: ${pt(layout.prize)},`,
    '    },',
  ].join('\n')
}

const MONSTER_IMAGES = [
  assetUrl('/pet-game/astro/alien1.png'),
  assetUrl('/pet-game/astro/alien2.png'),
  assetUrl('/pet-game/astro/alien3.png'),
  assetUrl('/pet-game/astro/alien4.png'),
  assetUrl('/pet-game/astro/alien5.png'),
]

const BOSS_IMAGES = [
  assetUrl('/pet-game/boss/boss1.png'),
  assetUrl('/pet-game/boss/boss2.png'),
  assetUrl('/pet-game/boss/boss3.png'),
  assetUrl('/pet-game/boss/boss4.png'),
  assetUrl('/pet-game/boss/boss5.png'),
]

const BOSS_NAMES = ['Stone Golem', 'Forest Troll', 'Frost Giant', 'Shadow Demon', 'Dragon King']
const BOSS_ATTACK_NAMES = ['Rock Slam', 'Vine Whip', 'Ice Crush', 'Dark Pulse', 'Golden Fire']

const bossHpForStop = (i) => 10 + i * 5
const PET_MAX_HP = 3
const QUESTION_TIME_LIMIT = 8
const POINTS_PER_HIT = 10
const SPEED_BONUS_FAST = 5
const SPEED_BONUS_MEDIUM = 3
const SPEED_BONUS_SLOW = 1
const STREAK_BONUS_3 = 5
const STREAK_BONUS_5 = 8
const INTERACTION_MODES = ['grid', 'falling', 'letters', 'matchup']
const FALLING_SPEED_BASE = 1.8
const FALLING_SPEED_VARIANCE = 0.8
const LETTER_BOUNCE_SPEED = 1.5

/* ---- Helpers ---- */
const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function scrambleWord(word) {
  if (word.length <= 1) return word
  const arr = word.split('')
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  const scrambled = arr.join('')
  return scrambled === word ? scrambleWord(word) : scrambled
}

function generateWrongSpellings(word, count) {
  const wrongs = new Set()
  let attempts = 0
  while (wrongs.size < count && attempts < 50) {
    attempts++
    const arr = word.split('')
    const swaps = 1 + Math.floor(Math.random() * 2)
    for (let s = 0; s < swaps; s++) {
      const i = Math.floor(Math.random() * arr.length)
      const j = Math.floor(Math.random() * arr.length)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    const wrong = arr.join('')
    if (wrong !== word) wrongs.add(wrong)
  }
  return [...wrongs]
}

function pickInteractionMode(type) {
  // words can use all 4 modes, questions only grid or falling
  const pool = type === 'word' ? INTERACTION_MODES : ['grid', 'falling']
  return pool[Math.floor(Math.random() * pool.length)]
}

function buildMatchupChallenge(wordBank, count = 4) {
  const pairs = shuffle(wordBank).slice(0, count)
  if (pairs.length < 2) return null
  const words = pairs.map(p => p.word)
  const hints = shuffle(pairs.map(p => ({ word: p.word, hint: p.hint || p.word })))
  return {
    type: 'word',
    interactionMode: 'matchup',
    matchupPairs: pairs.map(p => ({ word: p.word, hint: p.hint || p.word })),
    shuffledWords: shuffle([...words]),
    shuffledHints: hints,
    word: null,
    prompt: 'Match the words!',
    display: null,
    choices: [],
    correctIndex: 0,
  }
}

function wordsToChallenges(wordBank, count = 6) {
  const words = shuffle(wordBank).slice(0, count)
  const results = []
  let usedMatchup = false
  for (const w of words) {
    let mode = pickInteractionMode('word')
    // Only one matchup per batch, and need enough words
    if (mode === 'matchup') {
      if (usedMatchup || wordBank.length < 3) {
        mode = 'grid'
      } else {
        usedMatchup = true
        const mc = buildMatchupChallenge(wordBank, Math.min(4, wordBank.length))
        if (mc) { results.push(mc); continue }
        mode = 'grid'
      }
    }
    const wrongChoices = generateWrongSpellings(w.word, 3)
    const choices = shuffle([w.word, ...wrongChoices])
    results.push({
      type: 'word',
      interactionMode: mode,
      word: w.word,
      prompt: w.hint || 'What word is this?',
      display: scrambleWord(w.word),
      choices,
      correctIndex: choices.indexOf(w.word),
    })
  }
  return results
}

function questionsToChallenges(questionBank, count = 6) {
  const qs = shuffle(questionBank).slice(0, count)
  return qs.map(q => {
    const mapped = q.choices.map((text, i) => ({ text, originalIndex: i }))
    const mixed = shuffle(mapped)
    return {
      type: 'question',
      interactionMode: pickInteractionMode('question'),
      word: null,
      prompt: q.question,
      display: null,
      choices: mixed.map(m => m.text),
      correctIndex: mixed.findIndex(m => m.originalIndex === q.answer_index),
    }
  })
}

function pickChallengesForStop(wordBank, questionBank, stopIndex) {
  const count = 3 + stopIndex
  const hasWords = wordBank && wordBank.length > 0
  const hasQuestions = questionBank && questionBank.length > 0

  if (hasWords && hasQuestions) {
    const wCount = Math.ceil(count / 2)
    const qCount = count - wCount
    return shuffle([
      ...wordsToChallenges(wordBank, wCount + 2),
      ...questionsToChallenges(questionBank, qCount + 2),
    ])
  } else if (hasWords) {
    return wordsToChallenges(wordBank, count + 4)
  } else if (hasQuestions) {
    return questionsToChallenges(questionBank, count + 4)
  }
  return []
}

/* ---- Generate adventure path ---- */
// With a zone, every stop is themed to that zone; otherwise cycle through all biomes.
function buildAdventure(stopCount, zone = null) {
  const stops = []
  for (let i = 0; i < stopCount; i++) {
    const biome = zone || BIOMES[i % BIOMES.length]
    const bossIdx = Math.floor(Math.random() * BOSS_IMAGES.length)
    stops.push({
      id: i,
      biome,
      bossImage: BOSS_IMAGES[bossIdx],
      bossName: BOSS_NAMES[bossIdx],
      bossAttack: BOSS_ATTACK_NAMES[bossIdx],
      bossHp: bossHpForStop(i),
      completed: false,
      score: 0,
    })
  }
  return stops
}

/* ---- Main Component ---- */
const PetMazeAdventure = ({
  mode = 'standalone',
  encounterPet = null,
  rarity = 'common',
  zoneId = null,
  activePet,
  wordBank,
  questionBank,
  currentLevel: _currentLevel = 1,
  chestEnabled: _chestEnabled = false,
  profile,
  onGameEnd,
  onMazeComplete,
  onClose,
}) => {
  const config = RARITY_CONFIG[rarity] || RARITY_CONFIG.common
  const rc = RC[rarity] || RC.common
  const zone = getZone(zoneId)
  const petMaxHp = zone?.petHp ?? PET_MAX_HP

  // Build adventure once
  const [stops, setStops] = useState(() => buildAdventure(config.stops, zone))
  const [currentStop, setCurrentStop] = useState(0)
  // map (world) → entrance (stage intro) → playing → victory → back to map … → complete | failed
  const [phase, setPhase] = useState('map')
  const [entranceStep, setEntranceStep] = useState(0)
  const [totalScore, setTotalScore] = useState(0)
  const [showConfirmClose, setShowConfirmClose] = useState(false)
  const [victoryScore, setVictoryScore] = useState(0)
  // World map point the pet stands on: 0 = camp, k = k-th beaten monster, stops+1 = prize
  const [pathPetPos, setPathPetPos] = useState(0)
  const [mapShake, setMapShake] = useState(false)
  const bossShakenRef = useRef(false)
  const [worldSize, setWorldSize] = useState(() => ({ w: typeof window !== 'undefined' ? window.innerWidth : 400, h: 400 }))
  // Layout editor (admins): editLayout is the layout being dragged; layoutOverride previews it after "Done"
  const isAdminUser = profile?.role === 'admin'
  const [editLayout, setEditLayout] = useState(null)
  const [layoutOverride, setLayoutOverride] = useState(null)
  const [layoutCopied, setLayoutCopied] = useState(false)
  const dragSpotRef = useRef(null)
  const worldScrollRef = useRef(null)
  const worldInnerRef = useRef(null)
  const startBattleRef = useRef(null)
  const entranceAudioRef = useRef(null)

  // Battle state
  const [battleChallenges, setBattleChallenges] = useState([])
  const [challengeIndex, setChallengeIndex] = useState(0)
  const [bossHp, setBossHp] = useState(0)
  const [petHp, setPetHp] = useState(petMaxHp)
  const [streak, setStreak] = useState(0)
  const [stopScore, setStopScore] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [qTimeLeft, setQTimeLeft] = useState(QUESTION_TIME_LIMIT)
  const [bossAnim, setBossAnim] = useState('idle')
  const [petAnim, setPetAnim] = useState('idle')
  const [damagePopup, setDamagePopup] = useState(null)
  const [petDamagePopup, setPetDamagePopup] = useState(null)
  const [slashEffect, setSlashEffect] = useState(false)
  const [screenShake, setScreenShake] = useState(0)
  const [particles, setParticles] = useState([])
  const [comboAnim, setComboAnim] = useState(false)

  // Falling orbs state (interactionMode === 'falling')
  const fallingOrbsRef = useRef([])
  const [fallingOrbs, setFallingOrbs] = useState([])
  const fallingDoneRef = useRef(false)

  // Floating letters state (interactionMode === 'letters')
  const floatingLettersRef = useRef([])
  const [floatingLetters, setFloatingLetters] = useState([])
  const [placedLetters, setPlacedLetters] = useState([])
  const floatingDoneRef = useRef(false)

  // Matchup state (interactionMode === 'matchup')
  const [matchupSelected, setMatchupSelected] = useState(null) // { side: 'word'|'hint', index }
  const [matchupMatched, setMatchupMatched] = useState([]) // array of matched word strings
  const [matchupWrong, setMatchupWrong] = useState(null) // { word, hint } — flash wrong pair
  const matchupDoneRef = useRef(false)

  const streakRef = useRef(0)
  const scoreRef = useRef(0)
  const qStartRef = useRef(Date.now())
  const qTimerRef = useRef(null)
  const audioCache = useRef({})
  const containerRef = useRef(null)
  const animFrameRef = useRef(null)
  const shakeRef = useRef(0)
  const uidRef = useRef(0)
  const uid = () => ++uidRef.current

  const completedCount = stops.filter(s => s.completed).length
  const currentBiome = stops[currentStop]?.biome || BIOMES[0]

  const playSound = useCallback((url, volume = 0.5) => {
    try {
      if (!audioCache.current[url]) audioCache.current[url] = new Audio(url)
      const sound = audioCache.current[url]
      sound.volume = volume
      sound.currentTime = 0
      sound.play().catch(() => {})
    } catch { /* audio may fail */ }
  }, [])

  const spawnParticles = useCallback((x, y, colors, count = 12) => {
    const newParticles = Array.from({ length: count }, () => ({
      id: `p-${uid()}`,
      x: x + (Math.random() - 0.5) * 60,
      y,
      vx: (Math.random() - 0.5) * 10,
      vy: -Math.random() * 7 - 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 1,
      size: 4 + Math.random() * 6,
    }))
    setParticles(prev => [...prev, ...newParticles])
  }, [])

  // Spawn falling orbs for a challenge (centered in max 320px zone)
  const spawnFallingOrbs = useCallback((challenge) => {
    const zoneW = 280
    const count = challenge.choices.length
    const spacing = zoneW / (count + 1)
    const orbs = challenge.choices.map((text, i) => ({
      id: uid(),
      text,
      choiceIndex: i,
      x: spacing * (i + 1) + (Math.random() - 0.5) * 15,
      y: -40 - i * 50 - Math.random() * 30,
      vx: (Math.random() - 0.5) * 1.2,
      vy: FALLING_SPEED_BASE + Math.random() * FALLING_SPEED_VARIANCE,
      hit: false,
      skinIdx: Math.floor(Math.random() * MONSTER_IMAGES.length),
    }))
    fallingOrbsRef.current = orbs
    fallingDoneRef.current = false
    setFallingOrbs(orbs)
  }, [])

  // Spawn floating letters for a challenge (88px bubbles, centered in max 320px zone)
  const spawnFloatingLetters = useCallback((challenge) => {
    const zoneW = 280
    const word = challenge.word || ''
    const letters = shuffle(word.split('')).map((letter, i) => {
      const cols = Math.min(word.length, 3)
      const row = Math.floor(i / cols)
      const col = i % cols
      return {
        id: uid(),
        letter,
        x: 50 + (zoneW / (cols + 1)) * (col + 1) + (Math.random() - 0.5) * 20,
        y: 50 + row * 100 + (Math.random() - 0.5) * 15,
        vx: (Math.random() - 0.5) * LETTER_BOUNCE_SPEED * 2,
        vy: (Math.random() - 0.5) * LETTER_BOUNCE_SPEED * 2,
        captured: false,
      }
    })
    floatingLettersRef.current = letters
    floatingDoneRef.current = false
    setFloatingLetters(letters)
    setPlacedLetters([])
  }, [])

  // Particle + shake + falling/floating animation loop (delta-time based)
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'victory') return

    let lastTime = performance.now()

    const animate = (now) => {
      const rawDt = (now - lastTime) / 16.667 // normalize to 60fps (1.0 = one 60fps frame)
      const dt = Math.min(rawDt, 3) // cap to prevent huge jumps on tab switch
      lastTime = now

      shakeRef.current = Math.max(0, shakeRef.current - 0.5 * dt)
      setScreenShake(shakeRef.current)
      setParticles(prev => prev
        .map(p => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + 0.18 * dt, opacity: p.opacity - 0.018 * dt }))
        .filter(p => p.opacity > 0)
      )

      // Falling orbs physics (380px tall container, miss at 360)
      if (fallingOrbsRef.current.length > 0 && !fallingDoneRef.current) {
        let missed = false
        const orbs = fallingOrbsRef.current
        for (const o of orbs) {
          if (o.hit) continue
          o.x += (o.vx || 0) * dt
          o.y += o.vy * dt
          // Bounce off side walls
          if (o.x < 30) { o.x = 30; o.vx = Math.abs(o.vx || 0) * 0.8 }
          if (o.x > 290) { o.x = 290; o.vx = -Math.abs(o.vx || 0) * 0.8 }
          if (o.y > 360) missed = true
        }
        // Orb-to-orb collisions (same as AstroBlast)
        const ORB_R = 45
        const active = orbs.filter(o => !o.hit)
        for (let i = 0; i < active.length; i++) {
          for (let j = i + 1; j < active.length; j++) {
            const a = active[i], b = active[j]
            const dx = b.x - a.x, dy = b.y - a.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            const minDist = ORB_R * 2
            if (dist < minDist && dist > 0) {
              const nx = dx / dist, ny = dy / dist
              const overlap = (minDist - dist) / 2
              a.x -= nx * overlap; a.y -= ny * overlap
              b.x += nx * overlap; b.y += ny * overlap
              const dvx = (a.vx || 0) - (b.vx || 0)
              const dvy = a.vy - b.vy
              const dot = dvx * nx + dvy * ny
              if (dot > 0) {
                a.vx = (a.vx || 0) - dot * nx * 0.8
                a.vy -= dot * ny * 0.8
                b.vx = (b.vx || 0) + dot * nx * 0.8
                b.vy += dot * ny * 0.8
              }
            }
          }
        }
        setFallingOrbs([...orbs])
        if (missed && !fallingDoneRef.current) {
          fallingDoneRef.current = true
          clearInterval(qTimerRef.current)
          setQTimeLeft(0)
        }
      }

      // Floating letters physics (88px bubbles, bounded to ~320px centered zone)
      if (floatingLettersRef.current.length > 0 && !floatingDoneRef.current) {
        const bubs = floatingLettersRef.current
        for (const l of bubs) {
          if (l.captured) continue
          l.x += l.vx * dt
          l.y += l.vy * dt
          if (l.x < 50) { l.x = 50; l.vx = Math.abs(l.vx) }
          if (l.x > 320) { l.x = 320; l.vx = -Math.abs(l.vx) }
          if (l.y < 50) { l.y = 50; l.vy = Math.abs(l.vy) }
          if (l.y > 230) { l.y = 230; l.vy = -Math.abs(l.vy) }
        }
        // Letter-to-letter collisions (same as PetWordScramble)
        const minDist = 88
        const active = bubs.filter(b => !b.captured)
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
        setFloatingLetters([...bubs])
      }

      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [phase])

  // Entrance cinematic sequence
  useEffect(() => {
    if (phase !== 'entrance') return
    const timers = [
      setTimeout(() => setEntranceStep(1), 400),
      setTimeout(() => setEntranceStep(2), 1200),
      setTimeout(() => setEntranceStep(3), 2000),
      setTimeout(() => setEntranceStep(4), 2800),
      setTimeout(() => { setEntranceStep(0); startBattleRef.current?.() }, 3500),
    ]
    try {
      entranceAudioRef.current = new Audio(assetUrl('/sound/adventure-start.mp3'))
      entranceAudioRef.current.volume = 0.4
      entranceAudioRef.current.play().catch(() => {})
    } catch {}
    return () => timers.forEach(clearTimeout)
  }, [phase])

  // Victory phase after winning a battle
  useEffect(() => {
    if (phase !== 'victory') return
    const laserTimer = setTimeout(() => {
      try {
        const s = new Audio(assetUrl('/sound/laser.mp3'))
        s.volume = 0.3
        s.play().catch(() => {})
      } catch {}
    }, 1700)
    // Back to the world map; the pet then walks forward (to the prize after the last monster)
    const timer = setTimeout(() => {
      if (currentStop < stops.length - 1) setCurrentStop(prev => prev + 1)
      setPhase('map')
    }, 7000)
    return () => { clearTimeout(laserTimer); clearTimeout(timer) }
  }, [phase, currentStop, stops.length])

  // World map camera + walking: show the pet where it stood, then walk it to its new point
  useEffect(() => {
    if (phase !== 'map') return
    const target = completedCount >= stops.length ? stops.length + 1 : completedCount
    const focus = (pt, smooth) => {
      const scroller = worldScrollRef.current
      const inner = worldInnerRef.current
      if (!scroller || !inner) return
      const p = worldPoints(layoutOverride || currentBiome.layout, stops.length)[pt]
      if (!p) return
      const x = (p.x / 100) * inner.clientWidth
      scroller.scrollTo({ left: inner.offsetLeft + x - scroller.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto' })
    }
    setMapShake(false)
    focus(pathPetPos, false)
    const timers = []
    const walking = pathPetPos !== target
    if (walking) {
      timers.push(setTimeout(() => { setPathPetPos(target); focus(target, true) }, 600))
    }
    // The first time the final boss is next up, shake the world once it's in view
    const n = stops.length
    if (!bossShakenRef.current && currentStop === n - 1 && !stops[n - 1]?.completed) {
      timers.push(setTimeout(() => {
        bossShakenRef.current = true
        setMapShake(true)
      }, walking ? 1900 : 400))
    }
    return () => timers.forEach(clearTimeout)
    // pathPetPos is read only as the starting point; re-running on its change would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, completedCount, stops.length])

  // Pet image
  const petImageUrl = useMemo(() => {
    if (!activePet) return ''
    let img = activePet.image_url
    if (activePet.evolution_stages && activePet.evolution_stage > 0) {
      const s = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage)
      if (s?.image_url) img = s.image_url
    }
    return img
  }, [activePet])

  const petName = activePet?.nickname || activePet?.name || 'Pet'

  const handleGameComplete = useCallback((score, extra) => {
    setTotalScore(prev => prev + score)
    setVictoryScore(score)
    setStops(prev => prev.map((s, i) =>
      i === currentStop ? { ...s, completed: true, score } : s
    ))
    if (onGameEnd) onGameEnd(score, 'adventure-battle', extra)
    setPhase('victory')
  }, [currentStop, onGameEnd])

  const [showQuitWarning, setShowQuitWarning] = useState(false)

  const handleGameClose = useCallback(() => {
    setShowQuitWarning(true)
  }, [])

  // Stars
  const stars = useMemo(() =>
    Array.from({ length: 15 }, (_, i) => ({
      id: i,
      size: 1 + Math.random() * 2,
      left: `${5 + (i * 6.2) % 90}%`,
      top: `${2 + (i * 5.3) % 20}%`,
      dur: 1.5 + Math.random() * 2,
      delay: i * 0.2,
    }))
  , [])

  /* ---- Battle logic ---- */
  const startQTimer = useCallback(() => {
    clearInterval(qTimerRef.current)
    setQTimeLeft(QUESTION_TIME_LIMIT)
    const start = Date.now()
    qTimerRef.current = setInterval(() => {
      const remaining = QUESTION_TIME_LIMIT - (Date.now() - start) / 1000
      if (remaining <= 0) {
        clearInterval(qTimerRef.current)
        setQTimeLeft(0)
      } else {
        setQTimeLeft(remaining)
      }
    }, 50)
  }, [])

  // Init the right interaction mode visuals for a challenge
  const initChallengeMode = useCallback((challenge) => {
    // Clear previous mode state
    fallingOrbsRef.current = []
    setFallingOrbs([])
    fallingDoneRef.current = false
    floatingLettersRef.current = []
    setFloatingLetters([])
    setPlacedLetters([])
    floatingDoneRef.current = false
    setMatchupSelected(null)
    setMatchupMatched([])
    setMatchupWrong(null)
    matchupDoneRef.current = false

    if (challenge.interactionMode === 'falling') {
      // Small delay so containerRef dimensions are ready
      setTimeout(() => spawnFallingOrbs(challenge), 50)
    } else if (challenge.interactionMode === 'letters') {
      setTimeout(() => spawnFloatingLetters(challenge), 50)
    }
  }, [spawnFallingOrbs, spawnFloatingLetters])

  const advanceChallenge = useCallback(() => {
    setFeedback(null)
    setSelectedChoice(null)
    qStartRef.current = Date.now()
    startQTimer()
    let nextChallenge
    const nextIdx = challengeIndex + 1
    if (nextIdx < battleChallenges.length) {
      setChallengeIndex(nextIdx)
      nextChallenge = battleChallenges[nextIdx]
    } else {
      const more = pickChallengesForStop(wordBank, questionBank, currentStop)
      setBattleChallenges(more)
      setChallengeIndex(0)
      nextChallenge = more[0]
    }
    if (nextChallenge) initChallengeMode(nextChallenge)
  }, [challengeIndex, battleChallenges, wordBank, questionBank, currentStop, startQTimer, initChallengeMode])

  const startBattle = useCallback(() => {
    const stop = stops[currentStop]
    const challenges = pickChallengesForStop(wordBank, questionBank, currentStop)
    setBattleChallenges(challenges)
    setChallengeIndex(0)
    setBossHp(stop.bossHp)
    setPetHp(petMaxHp)
    setStreak(0)
    streakRef.current = 0
    setStopScore(0)
    scoreRef.current = 0
    setSelectedChoice(null)
    setFeedback(null)
    setBossAnim('idle')
    setPetAnim('idle')
    setDamagePopup(null)
    setPetDamagePopup(null)
    setSlashEffect(false)
    shakeRef.current = 0
    setScreenShake(0)
    setParticles([])
    qStartRef.current = Date.now()
    setPhase('playing')
    startQTimer()
    if (challenges[0]) initChallengeMode(challenges[0])
  }, [currentStop, stops, wordBank, questionBank, startQTimer, initChallengeMode, petMaxHp])

  // The world fills the map area (spots are % of it), so track that area's size
  useEffect(() => {
    if (phase !== 'map') return
    const el = worldScrollRef.current
    if (!el) return
    const measure = () => setWorldSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase])

  /* ---- Layout editor (admins): drag spots, then copy the snippet into wildZones.js ---- */
  const openLayoutEditor = () => {
    const base = layoutOverride || currentBiome.layout
    const full = base && base.monsters?.length === LAYOUT_SPOTS ? base : defaultLayout(LAYOUT_SPOTS)
    setEditLayout(JSON.parse(JSON.stringify(full)))
    setLayoutCopied(false)
  }
  const onSpotPointerDown = (key) => (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragSpotRef.current = key
  }
  const onSpotPointerMove = (e) => {
    const key = dragSpotRef.current
    const inner = worldInnerRef.current
    if (key == null || !inner) return
    const r = inner.getBoundingClientRect()
    const clamp = (v) => Math.min(100, Math.max(0, Math.round(v * 2) / 2))
    const p = { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) }
    setEditLayout(prev => key === 'camp' ? { ...prev, camp: p }
      : key === 'prize' ? { ...prev, prize: p }
      : { ...prev, monsters: prev.monsters.map((m, i) => (i === key ? p : m)) })
    setLayoutCopied(false)
  }
  const onSpotPointerUp = () => { dragSpotRef.current = null }
  const copyLayout = () => {
    navigator.clipboard?.writeText(layoutSnippet(editLayout)).then(() => setLayoutCopied(true)).catch(() => {})
  }

  // The stage intro (entrance) starts the battle when it ends
  useEffect(() => { startBattleRef.current = startBattle }, [startBattle])

  const handleAnswer = useCallback((choiceIndex) => {
    if (phase !== 'playing' || feedback || selectedChoice !== null) return
    clearInterval(qTimerRef.current)
    setSelectedChoice(choiceIndex)

    const challenge = battleChallenges[challengeIndex]
    if (!challenge) return
    const isCorrect = choiceIndex === challenge.correctIndex
    const elapsed = (Date.now() - qStartRef.current) / 1000

    if (isCorrect) {
      const newStreak = streakRef.current + 1
      streakRef.current = newStreak
      setStreak(newStreak)

      let points = POINTS_PER_HIT
      const isCritical = elapsed < 3
      if (isCritical) points += SPEED_BONUS_FAST
      else if (elapsed < 5) points += SPEED_BONUS_MEDIUM
      else if (elapsed < 8) points += SPEED_BONUS_SLOW

      if (newStreak >= 5) points += STREAK_BONUS_5
      else if (newStreak >= 3) points += STREAK_BONUS_3

      scoreRef.current += points
      setStopScore(scoreRef.current)

      const dmg = isCritical ? 2 : 1
      const newBossHp = Math.max(0, bossHp - dmg)
      setBossHp(newBossHp)

      setPetAnim(isCritical ? 'critical' : 'attack')
      setTimeout(() => setPetAnim('idle'), 600)
      setSlashEffect(true)
      setTimeout(() => setSlashEffect(false), 400)
      setBossAnim('hit')
      setTimeout(() => setBossAnim('idle'), 500)
      setDamagePopup({ dmg, isCritical, points })
      setTimeout(() => setDamagePopup(null), 1200)

      if (newStreak >= 3) {
        setComboAnim(true)
        setTimeout(() => setComboAnim(false), 600)
      }

      setFeedback('correct')
      shakeRef.current = isCritical ? 12 : 6
      setScreenShake(shakeRef.current)

      const cw = containerRef.current?.clientWidth || 400
      const ch = containerRef.current?.clientHeight || 700
      const hitColors = isCritical
        ? ['#facc15', '#f59e0b', '#ffffff', '#fde68a']
        : ['#a78bfa', '#f472b6', '#34d399', '#60a5fa']
      spawnParticles(cw / 2, ch * 0.22, hitColors, isCritical ? 18 : 10)

      playSound(assetUrl('/sound/scram-correct.mp3'), 0.4)

      if (newBossHp <= 0) {
        setBossAnim('defeated')
        setTimeout(() => handleGameComplete(scoreRef.current, { bossDefeated: true }), 700)
      } else {
        setTimeout(() => advanceChallenge(), 700)
      }
    } else {
      streakRef.current = 0
      setStreak(0)
      setFeedback('wrong')

      const newPetHp = petHp - 1
      setPetHp(newPetHp)

      setBossAnim('attack')
      setTimeout(() => setBossAnim('idle'), 600)
      setPetAnim('hit')
      setTimeout(() => setPetAnim('idle'), 600)
      setPetDamagePopup({ text: stops[currentStop]?.bossAttack || 'Attack' })
      setTimeout(() => setPetDamagePopup(null), 1200)

      shakeRef.current = 10
      setScreenShake(10)
      playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)

      if (newPetHp <= 0) {
        setTimeout(() => { clearInterval(qTimerRef.current); setPhase('failed') }, 800)
      } else {
        setTimeout(() => advanceChallenge(), 1000)
      }
    }
  }, [phase, feedback, selectedChoice, battleChallenges, challengeIndex, bossHp, petHp, stops, currentStop, advanceChallenge, handleGameComplete, playSound, spawnParticles])

  // Handle tapping a falling orb
  const handleFallingTap = useCallback((orb) => {
    if (feedback || fallingDoneRef.current) return
    fallingDoneRef.current = true
    fallingOrbsRef.current = fallingOrbsRef.current.map(o =>
      o.id === orb.id ? { ...o, hit: true } : o
    )
    setFallingOrbs([...fallingOrbsRef.current])
    handleAnswer(orb.choiceIndex)
  }, [feedback, handleAnswer])

  // Handle tapping a floating letter
  const handleLetterTap = useCallback((letter) => {
    if (feedback || floatingDoneRef.current) return
    const challenge = battleChallenges[challengeIndex]
    if (!challenge?.word) return
    const nextLetterIndex = placedLetters.length
    const expectedLetter = challenge.word[nextLetterIndex]

    if (letter.letter === expectedLetter) {
      floatingLettersRef.current = floatingLettersRef.current.map(l =>
        l.id === letter.id ? { ...l, captured: true } : l
      )
      setFloatingLetters([...floatingLettersRef.current])
      const newPlaced = [...placedLetters, { id: letter.id, letter: letter.letter }]
      setPlacedLetters(newPlaced)
      playSound(assetUrl('/sound/pop2.mp3'), 0.3, 1)

      if (newPlaced.length === challenge.word.length) {
        floatingDoneRef.current = true
        handleAnswer(challenge.correctIndex)
      }
    } else {
      floatingDoneRef.current = true
      playSound(assetUrl('/sound/flappy-hit.mp3'), 0.3)
      const wrongIdx = challenge.choices.findIndex((_, i) => i !== challenge.correctIndex)
      handleAnswer(wrongIdx >= 0 ? wrongIdx : 0)
    }
  }, [feedback, battleChallenges, challengeIndex, placedLetters, handleAnswer, playSound])

  // Handle tapping a matchup item (word or hint)
  const handleMatchupTap = useCallback((side, index, value) => {
    if (feedback || matchupDoneRef.current) return
    const challenge = battleChallenges[challengeIndex]
    if (!challenge?.matchupPairs) return

    if (!matchupSelected) {
      // First tap — select it
      setMatchupSelected({ side, index, value })
      return
    }

    // Second tap — must be opposite side
    if (matchupSelected.side === side) {
      // Same side, just re-select
      setMatchupSelected({ side, index, value })
      return
    }

    const wordVal = side === 'word' ? value : matchupSelected.value
    const hintVal = side === 'hint' ? value : matchupSelected.value
    const pair = challenge.matchupPairs.find(p => p.word === wordVal && p.hint === hintVal)

    if (pair) {
      // Correct match
      const newMatched = [...matchupMatched, wordVal]
      setMatchupMatched(newMatched)
      setMatchupSelected(null)
      playSound(assetUrl('/sound/scram-correct.mp3'), 0.4)

      // Only hit boss when all pairs are matched
      if (newMatched.length >= challenge.matchupPairs.length) {
        const dmg = 1
        const newBossHp = Math.max(0, bossHp - dmg)
        setBossHp(newBossHp)
        const newStreak = streakRef.current + 1
        streakRef.current = newStreak
        setStreak(newStreak)
        const points = POINTS_PER_HIT + (newStreak >= 5 ? STREAK_BONUS_5 : newStreak >= 3 ? STREAK_BONUS_3 : 0)
        scoreRef.current += points
        setStopScore(scoreRef.current)

        setPetAnim('attack')
        setTimeout(() => setPetAnim('idle'), 600)
        setSlashEffect(true)
        setTimeout(() => setSlashEffect(false), 400)
        setBossAnim('hit')
        setTimeout(() => setBossAnim('idle'), 500)
        setDamagePopup({ dmg, isCritical: false, points })
        setTimeout(() => setDamagePopup(null), 1200)
        shakeRef.current = 6
        setScreenShake(6)

        if (newStreak >= 3) {
          setComboAnim(true)
          setTimeout(() => setComboAnim(false), 600)
        }

        const cw = containerRef.current?.clientWidth || 400
        const ch = containerRef.current?.clientHeight || 700
        spawnParticles(cw / 2, ch * 0.22, ['#a78bfa', '#f472b6', '#34d399', '#60a5fa'], 10)

        if (newBossHp <= 0) {
          matchupDoneRef.current = true
          setBossAnim('defeated')
          setTimeout(() => handleGameComplete(scoreRef.current, { bossDefeated: true }), 700)
        } else {
          // All pairs matched, boss still alive — advance
          matchupDoneRef.current = true
          setTimeout(() => advanceChallenge(), 600)
        }
      }
    } else {
      // Wrong match
      setMatchupWrong({ word: wordVal, hint: hintVal })
      setTimeout(() => setMatchupWrong(null), 600)
      setMatchupSelected(null)
      streakRef.current = 0
      setStreak(0)

      const newPetHp = petHp - 1
      setPetHp(newPetHp)
      setBossAnim('attack')
      setTimeout(() => setBossAnim('idle'), 600)
      setPetAnim('hit')
      setTimeout(() => setPetAnim('idle'), 600)
      setPetDamagePopup({ text: stops[currentStop]?.bossAttack || 'Attack' })
      setTimeout(() => setPetDamagePopup(null), 1200)
      shakeRef.current = 10
      setScreenShake(10)
      playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)

      if (newPetHp <= 0) {
        matchupDoneRef.current = true
        setTimeout(() => { clearInterval(qTimerRef.current); setPhase('failed') }, 800)
      }
    }
  }, [feedback, battleChallenges, challengeIndex, matchupSelected, matchupMatched, bossHp, petHp, stops, currentStop, advanceChallenge, handleGameComplete, playSound, spawnParticles])

  // Timeout: boss attacks when timer expires
  useEffect(() => {
    if (phase !== 'playing' || feedback || !battleChallenges[challengeIndex] || qTimeLeft > 0) return
    clearInterval(qTimerRef.current)

    streakRef.current = 0
    setStreak(0)
    setFeedback('timeout')

    const newPetHp = petHp - 1
    setPetHp(newPetHp)

    setBossAnim('attack')
    setTimeout(() => setBossAnim('idle'), 600)
    setPetAnim('hit')
    setTimeout(() => setPetAnim('idle'), 600)
    setPetDamagePopup({ text: '⏰ Too slow!' })
    setTimeout(() => setPetDamagePopup(null), 1200)

    shakeRef.current = 10
    setScreenShake(10)
    playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)

    if (newPetHp <= 0) {
      setTimeout(() => { clearInterval(qTimerRef.current); setPhase('failed') }, 800)
    } else {
      setTimeout(() => advanceChallenge(), 1000)
    }
  }, [qTimeLeft, phase, feedback, battleChallenges, challengeIndex, petHp, advanceChallenge, playSound])

  // Cleanup
  useEffect(() => {
    return () => {
      clearInterval(qTimerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  // The map uses the zone's own art; the battle scenes (intro, fight, victory) share one fight background
  const biomeBg = phase === 'map'
    ? (isMobile ? currentBiome.bgMobile : currentBiome.bgDesktop)
    : FIGHT_BG
  const currentChallenge = battleChallenges[challengeIndex]

  const portal = createPortal(
    <div
      className={`fixed inset-0 z-50 select-none overflow-hidden bg-gradient-to-b ${currentBiome.bg}`}
      style={{
        touchAction: 'none',
        backgroundImage: biomeBg ? `url(${biomeBg})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Stars */}
      <div className="absolute inset-0 pointer-events-none">
        {stars.map(s => (
          <div key={s.id} className="absolute rounded-full"
            style={{
              width: s.size, height: s.size,
              background: 'rgba(255,255,255,0.4)',
              left: s.left, top: s.top,
              animation: `advtwinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="absolute rounded-full"
            style={{
              width: 2 + (i % 3),
              height: 2 + (i % 3),
              background: `${currentBiome.accent}40`,
              left: `${10 + i * 11}%`,
              top: `${20 + (i * 17) % 60}%`,
              animation: `advfloat ${3 + i * 0.5}s ease-in-out ${i * 0.3}s infinite alternate`,
            }}
          />
        ))}
      </div>

      {/* HUD */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3" style={{ opacity: phase === 'entrance' || phase === 'victory' || phase === 'playing' ? 0 : 1, transition: 'opacity 0.3s' }}>
        <div className="flex items-center gap-3">
          <h1 className="text-white font-bold text-lg">
            {mode === 'encounter' ? '🗺️ Wild Adventure' : '🗺️ Adventure'}
          </h1>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{ background: rc.light, color: rc.solid }}>
            {rarity}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-gray-400 text-sm">
            <span className="text-white font-bold">{completedCount}</span>
            <span className="text-gray-600">/{config.stops}</span>
          </div>
          <button onClick={() => setShowConfirmClose(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-gray-400 hover:text-white hover:bg-white/20 transition-colors text-sm">
            ✕
          </button>
        </div>
      </div>

      {/* Entrance cinematic */}
      {phase === 'entrance' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-black" style={{
            animation: 'advFadeOut 3.5s ease-out forwards',
            opacity: 0.7,
          }} />

          {/* Biome name reveal */}
          <div className="relative z-10 flex flex-col items-center" style={{
            opacity: entranceStep >= 1 ? 1 : 0,
            transform: entranceStep >= 1 ? 'translateY(0)' : 'translateY(30px)',
            transition: 'all 0.6s ease-out',
          }}>
            <p className="text-white/40 text-xs uppercase tracking-[0.3em] mb-2">
              Stage {currentStop + 1}
            </p>
            <h2 className="text-white text-3xl sm:text-4xl font-black mb-1" style={{
              textShadow: `0 0 40px ${currentBiome.accent}80`,
            }}>
              {currentBiome.emoji} {currentBiome.name}
            </h2>
            <div className="h-0.5 rounded-full mt-3" style={{
              width: entranceStep >= 1 ? 120 : 0,
              background: `linear-gradient(90deg, transparent, ${currentBiome.accent}, transparent)`,
              transition: 'width 0.8s ease-out 0.2s',
            }} />
          </div>

          {/* Pet slides in from left */}
          <div className="absolute bottom-32 left-1/4 sm:left-1/3" style={{
            transform: entranceStep >= 2 ? 'translateX(0)' : 'translateX(-200px)',
            opacity: entranceStep >= 2 ? 1 : 0,
            transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}>
            <img src={petImageUrl} alt={petName}
              className="w-20 h-20 sm:w-28 sm:h-28 object-contain"
              style={{ filter: `drop-shadow(0 0 15px ${rc.light})` }}
            />
          </div>

          {/* Boss appears from right */}
          <div className="absolute bottom-32 right-1/4 sm:right-1/3" style={{
            transform: entranceStep >= 3 ? 'translateX(0) scale(1)' : 'translateX(200px) scale(0.5)',
            opacity: entranceStep >= 3 ? 1 : 0,
            transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}>
            <img src={stops[currentStop]?.bossImage} alt="Boss"
              className="w-20 h-20 sm:w-28 sm:h-28 object-contain"
              style={{ filter: `drop-shadow(0 0 15px ${currentBiome.accent})` }}
            />
          </div>

          {/* READY text */}
          {entranceStep >= 4 && (
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <h1 className="text-white text-5xl sm:text-7xl font-black uppercase tracking-widest"
                style={{
                  animation: 'advReadyPulse 0.6s ease-out',
                  textShadow: `0 0 60px ${rc.solid}, 0 0 120px ${rc.light}`,
                }}>
                READY!
              </h1>
            </div>
          )}
        </div>
      )}

      {/* Victory phase */}
      {phase === 'victory' && (
        <div className="absolute inset-0 z-30">
          <div className="absolute inset-0 bg-white" style={{ opacity: 0, animation: 'advVictoryFlash 0.5s ease-out 1.6s forwards' }} />

          {/* Pet dashes forward toward boss */}
          <div className="absolute bottom-32 left-[15%] sm:left-[20%] z-20" style={{
            animation: 'advPetLeap 0.5s cubic-bezier(0.4, 0, 0.2, 1) 1.2s both, advFadeOut 0.3s ease-out 1.9s forwards',
          }}>
            <img src={petImageUrl} alt={petName}
              className="w-24 h-24 sm:w-32 sm:h-32 object-contain"
              style={{ filter: `drop-shadow(0 0 20px ${rc.light})` }}
            />
          </div>

          {/* Boss standing on the right, then knocked back on impact */}
          <div className="absolute bottom-32 right-[15%] sm:right-[20%] z-20" style={{
            animation: 'advMonsterKnockback 0.8s ease-in 1.6s both',
          }}>
            <img src={stops[currentStop]?.bossImage} alt="Boss"
              className="w-20 h-20 sm:w-28 sm:h-28 object-contain"
            />
          </div>

          {/* Energy shockwave rings at boss position */}
          <div className="absolute bottom-32 right-[15%] sm:right-[20%] pointer-events-none z-30">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{
              width: 0, height: 0,
              border: `3px solid ${rc.solid}`,
              boxShadow: `0 0 30px 10px ${rc.light}, 0 0 60px 20px ${rc.glow}`,
              animation: 'advShockwave 0.8s ease-out 1.6s forwards',
              opacity: 0,
            }} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{
              width: 0, height: 0,
              border: `2px solid white`,
              boxShadow: `0 0 20px 5px rgba(255,255,255,0.4)`,
              animation: 'advShockwave 0.6s ease-out 1.7s forwards',
              opacity: 0,
            }} />
          </div>

          {/* Impact sparks at boss position */}
          <div className="absolute bottom-36 right-[15%] sm:right-[20%] pointer-events-none z-30">
            {[...Array(16)].map((_, i) => {
              const angle = (i * 360 / 16) * Math.PI / 180
              const dist = 50 + Math.random() * 60
              return (
                <div key={i} className="absolute rounded-full"
                  style={{
                    width: 4 + Math.random() * 4,
                    height: 4 + Math.random() * 4,
                    background: i % 3 === 0 ? 'white' : rc.solid,
                    boxShadow: `0 0 6px ${rc.light}`,
                    animation: `advSparkFly 0.7s ease-out ${1.6 + i * 0.02}s both`,
                    '--spark-x': `${Math.cos(angle) * dist}px`,
                    '--spark-y': `${Math.sin(angle) * dist}px`,
                    opacity: 0,
                  }}
                />
              )
            })}
          </div>

          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <div className="relative z-10 flex flex-col items-center" style={{ animation: 'advScaleIn 0.8s ease-out 2.3s both' }}>
              <div className="relative mb-4">
                <div className="absolute -inset-12 rounded-full blur-2xl" style={{
                  background: `radial-gradient(circle, ${rc.light}, transparent 60%)`,
                  animation: 'advGlowPulse 1.5s ease-in-out 2.3s infinite',
                }} />
                <img src={petImageUrl} alt={petName}
                  className="w-28 h-28 sm:w-36 sm:h-36 object-contain relative z-10"
                  style={{
                    animation: 'advVictoryBounce 0.8s ease-out 2.3s both',
                    filter: `drop-shadow(0 0 20px ${rc.light})`,
                  }}
                />
              </div>

              <div className="absolute inset-0 pointer-events-none">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="absolute left-1/2 top-1/2 text-yellow-400"
                    style={{
                      animation: `advStarBurst 1.2s ease-out ${2.5 + i * 0.08}s forwards`,
                      '--star-x': `${Math.cos(i * 30 * Math.PI / 180) * (80 + Math.random() * 40)}px`,
                      '--star-y': `${Math.sin(i * 30 * Math.PI / 180) * (80 + Math.random() * 40)}px`,
                      opacity: 0,
                    }}>
                    ✦
                  </div>
                ))}
              </div>

              <h2 className="text-white text-3xl font-black" style={{
                animation: 'advScaleIn 0.6s ease-out 2.7s both',
                textShadow: `0 0 30px ${rc.light}`,
              }}>
                Victory!
              </h2>
              <p className="text-white/60 text-sm mt-2" style={{ animation: 'advScaleIn 0.6s ease-out 3.1s both' }}>
                +{victoryScore} points
              </p>

              {currentStop < stops.length - 1 && (
                <p className="text-white/30 text-xs mt-4" style={{ animation: 'advScaleIn 0.6s ease-out 3.5s both' }}>
                  Moving to next stage...
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Map phase: side-scrolling world map. Camp → monsters → prize, at the zone's layout spots */}
      {phase === 'map' && (() => {
        const n = stops.length
        // One screen (MAP_SCROLLING off): the world is the screen and the map image covers it.
        // Scrolling: with a map image the world is the image (full height, width from its aspect),
        // otherwise the screen at least WORLD_MIN_W wide.
        const mapImage = currentBiome.mapImage
        const worldH = worldSize.h
        const worldW = !MAP_SCROLLING
          ? worldSize.w
          : mapImage
            ? Math.max(worldSize.w, Math.round(worldH * (currentBiome.mapAspect || 3)))
            : worldWidth(worldSize.w)
        const toPx = (p) => ({ x: (p.x / 100) * worldW, y: (p.y / 100) * worldH })
        const pts = worldPoints(layoutOverride || currentBiome.layout, n).map(toPx)
        const allDone = completedCount >= n
        const camp = pts[0]
        const goal = pts[pts.length - 1]
        const petPt = pts[pathPetPos] || camp
        const accent = currentBiome.accent
        const editing = !!editLayout
        const spotHandlers = (key) => ({
          onPointerDown: onSpotPointerDown(key),
          onPointerMove: onSpotPointerMove,
          onPointerUp: onSpotPointerUp,
          onPointerCancel: onSpotPointerUp,
        })

        return (
          <div className="absolute inset-0 z-10" style={{ animation: 'advMapSlideIn 0.5s ease-out' }}>
            {/* Scrollable world: fills the whole screen; title and buttons float on top */}
            <div className="absolute inset-0"
              style={{ animation: mapShake ? 'advMapShake 0.6s ease-in-out' : undefined }}>
              <div ref={worldScrollRef}
                className="w-full h-full overflow-x-auto overflow-y-hidden"
                style={{ touchAction: 'pan-x', scrollbarWidth: 'none' }}
                onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY }}>
                <div ref={worldInnerRef} className="relative h-full mx-auto"
                  style={{
                    width: worldW,
                    backgroundImage: mapImage ? `url(${mapImage})` : undefined,
                    backgroundSize: MAP_SCROLLING ? '100% 100%' : 'cover',
                    backgroundPosition: 'center bottom',
                  }}>

                  {editing ? (
                    /* ---- Layout editor: drag every spot; the yellow dot is where feet stand ---- */
                    <>
                      {[
                        { key: 'camp', p: toPx(editLayout.camp) },
                        ...editLayout.monsters.map((m, i) => ({ key: i, p: toPx(m) })),
                        { key: 'prize', p: toPx(editLayout.prize) },
                      ].map(({ key, p }) => {
                        const isBoss = key === LAYOUT_SPOTS - 1
                        return (
                          <div key={String(key)}>
                            <div {...spotHandlers(key)}
                              className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center cursor-grab active:cursor-grabbing rounded-xl border-2 border-dashed border-yellow-300/70 bg-black/30 px-1 pt-1"
                              style={{ left: p.x, top: p.y, touchAction: 'none' }}>
                              {key === 'camp' ? (
                                <span className="text-4xl leading-none select-none">🏕️</span>
                              ) : key === 'prize' ? (
                                <span className="w-12 h-12 rounded-full flex items-center justify-center text-2xl font-black text-white border-2 select-none"
                                  style={{ borderColor: rc.solid }}>?</span>
                              ) : (
                                <img src={stops[0]?.bossImage} alt="" draggable={false}
                                  className={`${isBoss ? 'w-20 h-20' : 'w-16 h-16'} object-contain pointer-events-none`}
                                  style={{ filter: isBoss ? 'drop-shadow(0 0 8px #ef4444)' : undefined }} />
                              )}
                              <span className={`text-[10px] font-bold mb-0.5 ${isBoss ? 'text-red-300' : 'text-yellow-200'}`}>
                                {key === 'camp' ? 'Camp' : key === 'prize' ? 'Prize' : isBoss ? '5 · Boss' : `${key + 1}`}
                              </span>
                            </div>
                            <div className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-yellow-300 pointer-events-none"
                              style={{ left: p.x, top: p.y }} />
                          </div>
                        )
                      })}
                    </>
                  ) : (
                    <>
                      {/* Camp */}
                      <div className="absolute -translate-x-1/2 -translate-y-full text-4xl select-none" style={{ left: camp.x - 30, top: camp.y + 8 }}>🏕️</div>
                      <p className="absolute -translate-x-1/2 text-[11px] font-bold text-white/50" style={{ left: camp.x, top: camp.y + 18 }}>Start</p>

                      {/* Monsters */}
                      {stops.map((s, k) => {
                        const p = pts[k + 1]
                        const isNext = !s.completed && k === currentStop
                        const isLast = k === n - 1
                        return (
                          <div key={s.id}>
                            <div className="absolute -translate-x-1/2 -translate-y-1/2 w-20 h-6 rounded-full bg-black/50" style={{ left: p.x, top: p.y }} />
                            {s.completed ? (
                              <div className="absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center font-black text-black"
                                style={{ left: p.x, top: p.y, background: accent, boxShadow: `0 0 12px ${accent}` }}>
                                ✓
                              </div>
                            ) : (
                              <button type="button" disabled={!isNext} onClick={() => setPhase('entrance')}
                                className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center disabled:cursor-default"
                                style={{ left: p.x, top: p.y + 10 }}>
                                {isNext && (
                                  <span className="text-xl mb-1" style={{ animation: 'advBubble 1s ease-in-out infinite' }}>⚔️</span>
                                )}
                                {isLast && <span className="text-2xl leading-none -mb-1" title="Final boss">👑</span>}
                                <div className="relative">
                                  {/* Final boss: red aura, even while still a silhouette */}
                                  {isLast && (
                                    <div className="absolute -inset-3 rounded-full blur-xl animate-pulse" style={{ background: 'rgba(239,68,68,0.45)' }} />
                                  )}
                                  <img src={s.bossImage} alt={isNext ? s.bossName : 'Unknown monster'} draggable={false}
                                    className={`relative ${isLast ? (isNext ? 'w-28 h-28' : 'w-20 h-20') : (isNext ? 'w-20 h-20' : 'w-16 h-16')} object-contain`}
                                    style={{
                                      filter: isNext
                                        ? (isLast ? 'drop-shadow(0 0 18px #ef4444) drop-shadow(0 0 6px #ef4444)' : `drop-shadow(0 0 14px ${accent})`)
                                        : (isLast ? 'brightness(0) drop-shadow(0 0 8px #ef4444)' : 'brightness(0)'),
                                      opacity: isNext ? 1 : isLast ? 0.85 : 0.55,
                                      animation: isNext ? 'advMonsterIdle 1.5s ease-in-out infinite' : undefined,
                                    }} />
                                </div>
                              </button>
                            )}
                            <p className={`absolute -translate-x-1/2 text-[11px] font-bold whitespace-nowrap ${isLast && !s.completed ? 'text-red-400' : isNext ? 'text-white' : 'text-white/50'}`}
                              style={{ left: p.x, top: p.y + 18 }}>
                              {s.completed ? 'Cleared' : isNext ? s.bossName : isLast ? 'BOSS' : `Stage ${k + 1}`}
                            </p>
                          </div>
                        )
                      })}

                      {/* Prize at the end */}
                      <div className="absolute -translate-x-1/2 -translate-y-1/2 w-20 h-6 rounded-full bg-black/50" style={{ left: goal.x, top: goal.y }} />
                      <div className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center" style={{ left: goal.x, top: goal.y + 10 }}>
                        {allDone && (
                          <div className="absolute -inset-4 rounded-full blur-xl animate-pulse" style={{ background: rc.light }} />
                        )}
                        {mode === 'encounter' ? (
                          <div className="relative w-14 h-14 mb-1 rounded-full flex items-center justify-center text-3xl font-black text-white border-2"
                            style={{ borderColor: rc.solid, background: 'rgba(0,0,0,0.55)', boxShadow: `0 0 16px ${rc.light}`, animation: 'advBubble 1.6s ease-in-out infinite' }}>
                            ?
                          </div>
                        ) : (
                          <span className="relative text-5xl">🎁</span>
                        )}
                      </div>
                      <p className="absolute -translate-x-1/2 text-[11px] font-bold whitespace-nowrap" style={{ left: goal.x, top: goal.y + 18, color: rc.solid }}>
                        {mode === 'encounter' ? 'Wild pet' : 'Treasure'}
                      </p>

                      {/* Pet */}
                      <div className="absolute z-20 -translate-x-1/2 -translate-y-full pointer-events-none"
                        style={{ left: petPt.x, top: petPt.y + 6, transition: 'left 1.2s ease-in-out, top 1.2s ease-in-out' }}>
                        <div key={pathPetPos} style={{ animation: pathPetPos > 0 ? 'advWalkBob 0.3s ease-in-out 4' : 'advPetIdle 2s ease-in-out infinite' }}>
                          <img src={petImageUrl} alt={petName} draggable={false} className="w-14 h-14 object-contain"
                            style={{ filter: `drop-shadow(0 0 10px ${rc.light})` }} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Shade so the HUD and buttons stay readable over bright map art */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 22%, transparent 80%, rgba(0,0,0,0.45) 100%)' }} />

            {/* Top overlay: zone, stage, layout editor */}
            <div className="absolute top-14 left-0 right-0 flex flex-col items-center gap-2 px-4 pointer-events-none">
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                <p className="text-white text-sm font-bold uppercase tracking-widest" style={{ textShadow: `0 0 12px ${accent}, 0 1px 3px rgba(0,0,0,0.8)` }}>
                  {currentBiome.emoji} {currentBiome.name}
                </p>
                {!editing && !allDone && (
                  <p className="text-white/80 text-xs" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                    Stage {currentStop + 1} of {n} · <span className="text-white font-bold">{stops[currentStop]?.bossName}</span>
                  </p>
                )}
                {isAdminUser && !editing && (
                  <button type="button" onClick={openLayoutEditor}
                    className="pointer-events-auto px-2.5 py-1 rounded-lg bg-black/40 hover:bg-black/60 text-white/90 text-[11px] font-bold">
                    ✏️ Edit layout{layoutOverride ? ' (preview, not saved)' : ''}
                  </button>
                )}
              </div>

              {editing && (
                <div className="pointer-events-auto w-full max-w-xl flex flex-col items-center gap-2 rounded-xl bg-black/70 border border-white/10 p-3">
                  <p className="text-white/80 text-xs text-center">
                    Drag the camp, the 5 monster spots and the prize (scroll sideways to reach them all).
                    Shorter runs use spots spread out from these; spot 5 is always the boss.
                  </p>
                  {layoutCopied && (
                    <p className="text-emerald-300 text-xs font-bold text-center">
                      Copied! Paste it into the &apos;{currentBiome.id}&apos; zone in src/utils/wildZones.js
                    </p>
                  )}
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={copyLayout}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">📋 Copy code</button>
                    <button type="button" onClick={() => { setEditLayout(defaultLayout(LAYOUT_SPOTS)); setLayoutCopied(false) }}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold">Reset</button>
                    <button type="button" onClick={() => setEditLayout(null)}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold">Cancel</button>
                    <button type="button" onClick={() => { setLayoutOverride(editLayout); setEditLayout(null) }}
                      className="px-4 py-2 rounded-xl bg-white/90 hover:bg-white text-gray-900 text-sm font-bold">Done (preview)</button>
                  </div>
                  <details className="w-full">
                    <summary className="text-white/50 text-[11px] cursor-pointer text-center">Show code</summary>
                    <pre className="mt-1 w-full max-h-24 overflow-auto rounded-lg bg-black/60 p-2 text-[10px] text-emerald-200 select-text">
                      {layoutSnippet(editLayout)}
                    </pre>
                  </details>
                </div>
              )}
            </div>

            {/* Bottom overlay: one compact button, so it doesn't cover the ground */}
            {!editing && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                {!allDone ? (
                  <button onClick={() => setPhase('entrance')}
                    className={`pointer-events-auto px-8 py-3 rounded-2xl font-bold text-white text-base bg-gradient-to-r ${rc.gradient} hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center justify-center gap-2`}
                    style={{ boxShadow: `0 0 30px ${rc.glow}` }}>
                    ⚔️ Battle!
                  </button>
                ) : (
                  <button onClick={() => setPhase('complete')}
                    className={`pointer-events-auto px-8 py-3 rounded-2xl font-bold text-white text-base bg-gradient-to-r ${rc.gradient} hover:scale-105 active:scale-95 transition-all shadow-xl animate-pulse`}
                    style={{ boxShadow: `0 0 30px ${rc.glow}` }}>
                    {mode === 'encounter' ? '✨ Encounter Pet!' : '🏆 Claim Reward!'}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Battle phase */}
      {phase === 'playing' && currentChallenge && (
        <div className="absolute inset-0 z-20" ref={containerRef}
          style={{ transform: screenShake ? `translate(${(Math.random()-0.5)*screenShake}px, ${(Math.random()-0.5)*screenShake}px)` : 'none' }}>

          {/* Particles */}
          {particles.map(p => (
            <div key={p.id} className="absolute rounded-full pointer-events-none z-40"
              style={{ left: p.x, top: p.y, width: p.size, height: p.size, backgroundColor: p.color, opacity: p.opacity }} />
          ))}

          {/* === TOP SECTION: HUD + Quiz === */}
          <div className="absolute top-0 left-0 right-0 z-30 flex flex-col">

            {/* Battle HUD */}
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-center justify-between">
                <div className="bg-black/40 backdrop-blur rounded-2xl px-3 py-1.5 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span className="text-lg font-black text-white">{stopScore}</span>
                </div>

                <div className="flex-1 mx-4 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-100"
                    style={{
                      width: `${(qTimeLeft / QUESTION_TIME_LIMIT) * 100}%`,
                      background: qTimeLeft <= 2 ? '#ef4444' : qTimeLeft <= 4 ? '#f97316' : '#22c55e',
                    }} />
                </div>

                <div className={`rounded-full px-2.5 py-1 text-xs font-bold flex items-center gap-1 transition-all ${
                  streak >= 3 ? 'bg-yellow-400 text-yellow-900' : 'bg-black/40 text-white/70'
                } ${comboAnim ? 'scale-125' : 'scale-100'}`}>
                  🔥 {streak}x
                </div>
              </div>
            </div>

            {/* Close button */}
            <div className="absolute top-3 right-4 z-20">
              <button onClick={handleGameClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-gray-400 hover:text-white hover:bg-black/60 transition-colors text-sm">
                ✕
              </button>
            </div>

            {/* HP bars row */}
            <div className="flex items-center justify-between px-6 pt-2 pb-3">
              {/* Pet HP */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-white/60">{petName}</span>
                <div className="flex gap-0.5">
                  {Array.from({ length: petMaxHp }).map((_, i) => (
                    <Heart key={i} className={`w-4 h-4 transition-all ${i < petHp ? 'text-red-400 fill-red-400' : 'text-gray-600/40'}`} />
                  ))}
                </div>
              </div>
              {/* Boss HP */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-white/60">{stops[currentStop]?.bossName}</span>
                <div className="w-20">
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full transition-all duration-300" style={{ width: `${(bossHp / (stops[currentStop]?.bossHp || 1)) * 100}%` }} />
                  </div>
                </div>
                <span className="text-[10px] text-white/40">{bossHp}/{stops[currentStop]?.bossHp}</span>
              </div>
            </div>

            {/* Challenge interaction area */}
            <div className="flex flex-col items-center px-4 pb-4">

              {/* === GRID MODE (default multiple choice) === */}
              {currentChallenge.interactionMode === 'grid' && (
                <>
                  <div className="text-center mb-4 px-2">
                    {currentChallenge.type === 'word' ? (
                      <>
                        <p className="text-white/50 text-xs mb-2 uppercase tracking-wider">Unscramble the word</p>
                        <p className="text-white text-3xl sm:text-4xl font-black tracking-widest mb-1"
                          style={{ textShadow: `0 0 20px ${rc.light}` }}>
                          {currentChallenge.display}
                        </p>
                        <div className="bg-white/90 backdrop-blur rounded-2xl px-5 py-3 mt-2 w-full max-w-xs mx-auto shadow-lg border-2 border-yellow-300">
                          <p className="text-xs text-gray-500 font-semibold mb-0.5">Hint</p>
                          <p className="text-2xl font-black text-gray-700">{currentChallenge.prompt}</p>
                        </div>
                      </>
                    ) : (
                      <div className="bg-white/90 backdrop-blur rounded-2xl px-5 py-3 w-full max-w-xs mx-auto shadow-lg border-2 border-yellow-300">
                        <p className="text-2xl font-black text-gray-700">{currentChallenge.prompt}</p>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm">
                    {currentChallenge.choices.map((choice, i) => {
                      const isSelected = selectedChoice === i
                      const isCorrect = i === currentChallenge.correctIndex
                      let bg = 'bg-white/10 hover:bg-white/20 border-white/10'
                      let textColor = 'text-white'
                      if (feedback) {
                        if (isCorrect) { bg = 'bg-green-500/30 border-green-400/50'; textColor = 'text-green-200' }
                        else if (isSelected && !isCorrect) { bg = 'bg-red-500/30 border-red-400/50'; textColor = 'text-red-200' }
                        else { bg = 'bg-white/5 border-white/5'; textColor = 'text-white/40' }
                      }
                      return (
                        <button key={i} onClick={() => handleAnswer(i)} disabled={!!feedback}
                          className={`${bg} ${textColor} backdrop-blur border rounded-xl px-3 py-3 font-semibold text-sm transition-all active:scale-95`}>
                          {choice}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              {/* === FALLING MODE — Astro Blast style asteroids === */}
              {currentChallenge.interactionMode === 'falling' && (
                <>
                  <div className="text-center mb-2 px-2">
                    {currentChallenge.type === 'word' ? (
                      <>
                        <p className="text-white/50 text-xs mb-1 uppercase tracking-wider">Slash the right word!</p>
                        <div className="bg-white/90 backdrop-blur rounded-2xl px-5 py-3 mt-1 w-full max-w-xs mx-auto shadow-lg border-2 border-yellow-300">
                          <p className="text-xs text-gray-500 font-semibold mb-0.5">Hint</p>
                          <p className="text-2xl font-black text-gray-700">{currentChallenge.prompt}</p>
                        </div>
                      </>
                    ) : (
                      <div className="bg-white/90 backdrop-blur rounded-2xl px-5 py-3 w-full max-w-xs mx-auto shadow-lg border-2 border-yellow-300">
                        <p className="text-2xl font-black text-gray-700">{currentChallenge.prompt}</p>
                      </div>
                    )}
                  </div>
                  <div className="relative w-full max-w-sm mx-auto" style={{ height: 380, overflow: 'visible' }}>
                    {/* Fall zone line */}
                    <div className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.4), transparent)' }} />
                    {/* Falling asteroids */}
                    {fallingOrbs.map(orb => (
                      <button key={orb.id}
                        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleFallingTap(orb) }}
                        disabled={!!feedback || orb.hit}
                        className="absolute touch-none cursor-pointer"
                        style={{
                          left: orb.x - 45,
                          top: orb.y,
                          opacity: orb.hit ? (orb.choiceIndex === currentChallenge.correctIndex ? 1 : 0.4) : 1,
                          transform: orb.hit
                            ? orb.choiceIndex === currentChallenge.correctIndex ? 'scale(1.15)' : 'scale(0.7)'
                            : 'scale(1)',
                          transition: orb.hit ? 'all 0.3s ease-out' : 'none',
                          pointerEvents: orb.hit ? 'none' : 'auto',
                          zIndex: orb.hit ? 10 : 1,
                        }}>
                        <div className="relative flex flex-col items-center" style={{ minWidth: 90, animation: !orb.hit ? 'advAsteroidEntry 0.4s ease-out' : 'none' }}>
                          <img
                            src={MONSTER_IMAGES[orb.skinIdx % MONSTER_IMAGES.length]}
                            alt=""
                            className="w-16 h-16 object-contain pointer-events-none"
                            style={{
                              filter: orb.hit
                                ? orb.choiceIndex === currentChallenge.correctIndex
                                  ? 'brightness(1.5) hue-rotate(90deg)'
                                  : 'brightness(0.5) saturate(2) hue-rotate(-30deg)'
                                : 'drop-shadow(0 0 8px rgba(251,146,60,0.3))',
                            }}
                          />
                          <div className={`px-3 py-1 font-bold text-base uppercase tracking-wide whitespace-nowrap text-center ${
                            orb.hit && orb.choiceIndex === currentChallenge.correctIndex ? 'text-green-200' :
                            orb.hit ? 'text-red-300/50 line-through' : 'text-white'
                          }`} style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.5)' }}>
                            {orb.text}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* === LETTERS MODE — Word Scramble style bubbles === */}
              {currentChallenge.interactionMode === 'letters' && (
                <>
                  <div className="text-center mb-2 px-2">
                    <p className="text-white/50 text-xs mb-1 uppercase tracking-wider">Tap the letters in order!</p>
                    <div className="bg-white/90 backdrop-blur rounded-2xl px-5 py-3 mt-1 w-full max-w-xs mx-auto shadow-lg border-2 border-yellow-300">
                      <p className="text-xs text-gray-500 font-semibold mb-0.5">Hint</p>
                      <p className="text-2xl font-black text-gray-700">{currentChallenge.prompt}</p>
                    </div>
                  </div>

                  {/* Word progress slots — matches Word Scramble */}
                  <div className="flex gap-2 justify-center flex-wrap mb-3">
                    {(currentChallenge.word || '').split('').map((letter, i) => {
                      const placed = placedLetters[i]
                      return (
                        <div key={i}
                          className={`w-11 h-12 rounded-xl font-bold text-xl uppercase flex items-center justify-center transition-all ${
                            placed
                              ? 'bg-green-400 text-white border-2 border-green-500 shadow-lg'
                              : i === placedLetters.length
                                ? 'bg-white/20 border-2 border-white/50'
                                : 'bg-white/10 border-2 border-dashed border-white/30'
                          }`}
                          style={placed ? { animation: 'advLetterBounceIn 0.25s ease-out' } : undefined}>
                          {placed ? placed.letter : ''}
                        </div>
                      )
                    })}
                  </div>

                  {/* Floating letter bubbles — matches Word Scramble */}
                  <div className="relative w-full max-w-sm mx-auto" style={{ height: 280 }}>
                    {floatingLetters.map(l => {
                      const isNext = !l.captured && (currentChallenge.word || '')[placedLetters.length] === l.letter
                        && !floatingLetters.some(o => !o.captured && o.id < l.id && o.letter === l.letter)
                      return (
                        <button key={l.id}
                          onPointerDown={(e) => { e.preventDefault(); handleLetterTap(l) }}
                          disabled={!!feedback || l.captured}
                          className={`absolute rounded-full font-bold text-3xl uppercase flex items-center justify-center cursor-pointer touch-none ${
                            l.captured
                              ? 'opacity-0 scale-0'
                              : 'bg-gradient-to-br from-yellow-300 to-orange-400 text-white shadow-2xl border-4 border-white/50 hover:scale-110 active:scale-90'
                          }`}
                          style={{
                            left: l.x - 44,
                            top: l.y - 44,
                            width: 88,
                            height: 88,
                            zIndex: isNext ? 5 : 1,
                            transition: l.captured ? 'all 0.3s ease-out' : 'transform 0.15s ease-out',
                            boxShadow: l.captured ? 'none' : '0 8px 20px rgba(0,0,0,0.3), inset 0 -4px 8px rgba(0,0,0,0.2)',
                            textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                            pointerEvents: l.captured ? 'none' : 'auto',
                          }}>
                          {!l.captured && l.letter}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              {/* === MATCHUP MODE — Match words to hints === */}
              {currentChallenge.interactionMode === 'matchup' && currentChallenge.matchupPairs && (
                <>
                  <div className="text-center mb-3 px-2">
                    <p className="text-white/50 text-xs mb-1 uppercase tracking-wider">Match the words to their meanings!</p>
                  </div>
                  <div className="flex gap-3 w-full max-w-sm mx-auto">
                    {/* Words column */}
                    <div className="flex-1 flex flex-col gap-2.5">
                      {currentChallenge.shuffledWords.map((word, i) => {
                        const isMatched = matchupMatched.includes(word)
                        const isSelected = matchupSelected?.side === 'word' && matchupSelected?.value === word
                        const isWrong = matchupWrong?.word === word
                        return (
                          <button key={`w-${i}`}
                            onClick={() => !isMatched && handleMatchupTap('word', i, word)}
                            disabled={isMatched || matchupDoneRef.current}
                            className="rounded-2xl px-2 py-2 font-bold text-sm text-white text-center transition-all select-none"
                            style={{
                              height: 64,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                              borderTop: isMatched ? '2px solid rgba(74,222,128,0.5)' : isSelected ? '2px solid #fef08a' : '2px solid rgba(255,255,255,0.15)',
                              borderLeft: isMatched ? '2px solid rgba(74,222,128,0.5)' : isSelected ? '2px solid #fef08a' : '2px solid rgba(255,255,255,0.15)',
                              borderRight: isMatched ? '2px solid rgba(74,222,128,0.5)' : isSelected ? '2px solid #fef08a' : '2px solid rgba(255,255,255,0.15)',
                              borderBottom: 'none',
                              background: isMatched
                                ? 'linear-gradient(to bottom, #4ade80 0%, #22c55e 40%, #16a34a 100%)'
                                : isSelected
                                  ? 'linear-gradient(to bottom, #fde047 0%, #facc15 40%, #eab308 100%)'
                                  : 'linear-gradient(to bottom, #60a5fa 0%, #3b82f6 40%, #2563eb 100%)',
                              boxShadow: isMatched
                                ? '0 4px 0 #166534, 0 6px 12px rgba(0,0,0,0.2)'
                                : isSelected
                                  ? '0 4px 0 #92400e, 0 0 16px rgba(250,204,21,0.4), inset 0 1px 0 rgba(255,255,255,0.4)'
                                  : '0 4px 0 #1e40af, 0 6px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.3)',
                              transform: isMatched ? 'scale(0.9)' : isSelected ? 'translateY(-2px)' : 'translateY(0)',
                              opacity: isMatched ? 0.6 : 1,
                              animation: isMatched ? 'advMatchCorrect 0.4s ease-out' : isWrong ? 'advMatchWrong 0.4s ease-out' : `advMatchTileIn 0.3s ease-out ${i * 0.05}s both`,
                            }}
                          >
                            {word}
                          </button>
                        )
                      })}
                    </div>
                    {/* Hints column */}
                    <div className="flex-1 flex flex-col gap-2.5">
                      {currentChallenge.shuffledHints.map((h, i) => {
                        const isMatched = matchupMatched.includes(h.word)
                        const isSelected = matchupSelected?.side === 'hint' && matchupSelected?.value === h.hint
                        const isWrong = matchupWrong?.hint === h.hint
                        return (
                          <button key={`h-${i}`}
                            onClick={() => !isMatched && handleMatchupTap('hint', i, h.hint)}
                            disabled={isMatched || matchupDoneRef.current}
                            className="rounded-2xl px-2 py-2 font-semibold text-sm text-white text-center transition-all select-none"
                            style={{
                              height: 64,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                              borderTop: isMatched ? '2px solid rgba(74,222,128,0.5)' : isSelected ? '2px solid #fef08a' : '2px solid rgba(255,255,255,0.15)',
                              borderLeft: isMatched ? '2px solid rgba(74,222,128,0.5)' : isSelected ? '2px solid #fef08a' : '2px solid rgba(255,255,255,0.15)',
                              borderRight: isMatched ? '2px solid rgba(74,222,128,0.5)' : isSelected ? '2px solid #fef08a' : '2px solid rgba(255,255,255,0.15)',
                              borderBottom: 'none',
                              background: isMatched
                                ? 'linear-gradient(to bottom, #4ade80 0%, #22c55e 40%, #16a34a 100%)'
                                : isSelected
                                  ? 'linear-gradient(to bottom, #fde047 0%, #facc15 40%, #eab308 100%)'
                                  : 'linear-gradient(to bottom, #60a5fa 0%, #3b82f6 40%, #2563eb 100%)',
                              boxShadow: isMatched
                                ? '0 4px 0 #166534, 0 6px 12px rgba(0,0,0,0.2)'
                                : isSelected
                                  ? '0 4px 0 #92400e, 0 0 16px rgba(250,204,21,0.4), inset 0 1px 0 rgba(255,255,255,0.4)'
                                  : '0 4px 0 #1e40af, 0 6px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.3)',
                              transform: isMatched ? 'scale(0.9)' : isSelected ? 'translateY(-2px)' : 'translateY(0)',
                              opacity: isMatched ? 0.6 : 1,
                              animation: isMatched ? 'advMatchCorrect 0.4s ease-out' : isWrong ? 'advMatchWrong 0.4s ease-out' : `advMatchTileIn 0.3s ease-out ${i * 0.05}s both`,
                            }}
                          >
                            {h.hint}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* === BOTTOM SECTION: Pet & Boss at same positions as entrance/map === */}

          {/* Pet — same position as entrance */}
          <div className="absolute bottom-32 left-1/4 sm:left-1/3 flex flex-col items-center z-10">
            <div className="relative">
              <div className="absolute -inset-4 rounded-full blur-xl animate-pulse" style={{ background: rc.glow }} />
              <div style={{
                animation: petAnim === 'attack' ? 'bbPetAttack 0.5s ease-out' :
                  petAnim === 'critical' ? 'bbPetCritical 0.5s ease-out' :
                  petAnim === 'hit' ? 'bbPetHit 0.5s ease-out' : 'advPetIdle 2s ease-in-out infinite',
              }}>
                <img src={petImageUrl} alt={petName}
                  className="w-20 h-20 sm:w-28 sm:h-28 object-contain relative z-10"
                  style={{ filter: `drop-shadow(0 0 15px ${rc.light})` }} />
              </div>
            </div>
            <p className="text-white text-sm font-bold mt-1">{petName}</p>
            <div className="flex gap-0.5 mt-1">
              {Array.from({ length: petMaxHp }).map((_, i) => (
                <Heart key={i} className={`w-4 h-4 transition-all ${i < petHp ? 'text-red-400 fill-red-400' : 'text-gray-600/40'}`} />
              ))}
            </div>
            {petDamagePopup && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-20 text-sm font-bold text-red-400 whitespace-nowrap"
                style={{ animation: 'bbDmgFloat 1.2s ease-out forwards' }}>
                {petDamagePopup.text}
              </div>
            )}
          </div>

          {/* Slash effect between pet and boss */}
          {slashEffect && (
            <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
              style={{ animation: 'bbSlash 0.4s ease-out forwards' }}>
              <svg width="120" height="60" viewBox="0 0 120 60">
                <line x1="10" y1="50" x2="110" y2="10" stroke="#facc15" strokeWidth="4" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px #facc15)' }} />
                <line x1="20" y1="55" x2="100" y2="5" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 4px #fbbf24)' }} />
              </svg>
            </div>
          )}

          {/* VS */}
          <div className="absolute bottom-36 left-1/2 -translate-x-1/2 text-2xl sm:text-3xl font-black text-white/20 z-10" style={{ textShadow: '0 0 20px rgba(255,255,255,0.1)' }}>
            VS
          </div>

          {/* Boss — same position as entrance */}
          <div className="absolute bottom-32 right-1/4 sm:right-1/3 flex flex-col items-center z-10">
            <div className="relative">
              <div className="absolute -inset-4 rounded-full blur-xl animate-pulse" style={{ background: `${currentBiome.accent}30` }} />
              <div style={{
                animation: bossAnim === 'hit' ? 'bbBossHit 0.5s ease-out' :
                  bossAnim === 'attack' ? 'bbBossAttack 0.5s ease-out' :
                  bossAnim === 'defeated' ? 'bbBossDefeated 0.7s ease-out forwards' :
                  'advMonsterIdle 1.5s ease-in-out infinite',
              }}>
                <img src={stops[currentStop]?.bossImage} alt="Boss"
                  className="w-20 h-20 sm:w-28 sm:h-28 object-contain relative z-10"
                  style={{ filter: `drop-shadow(0 0 15px ${currentBiome.accent})` }} />
              </div>
            </div>
            <p className="text-white/70 text-sm font-bold mt-1">{stops[currentStop]?.bossName}</p>
            <div className="w-20 mt-1">
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full transition-all duration-300" style={{ width: `${(bossHp / (stops[currentStop]?.bossHp || 1)) * 100}%` }} />
              </div>
              <p className="text-[10px] text-white/40 text-center mt-0.5">{bossHp}/{stops[currentStop]?.bossHp}</p>
            </div>
            {damagePopup && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-20 text-lg font-black whitespace-nowrap"
                style={{ color: damagePopup.isCritical ? '#facc15' : '#f87171', animation: 'bbDmgFloat 1.2s ease-out forwards' }}>
                -{damagePopup.dmg} {damagePopup.isCritical && '💥'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Completion */}
      {phase === 'complete' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.9)' }}>
          <div className="flex flex-col items-center text-center px-6 animate-[advScaleIn_0.5s_ease-out]">
            <div className="relative mb-6">
              <div className="absolute -inset-16 rounded-full blur-3xl animate-pulse"
                style={{ background: `radial-gradient(circle, ${rc.light}, transparent 60%)` }} />
            </div>

            <h2 className="text-white text-3xl font-black mb-3">
              {mode === 'encounter' ? 'Pet Found!' : 'Adventure Complete!'}
            </h2>

            {mode === 'encounter' && encounterPet && (
              <div className="my-3">
                <img src={encounterPet.image_url} alt="?"
                  className="w-28 h-28 object-contain mx-auto mb-2"
                  style={{ filter: 'brightness(0) drop-shadow(0 0 20px rgba(255,255,255,0.3))' }} />
                <p className="text-gray-400 text-sm">A wild pet awaits...</p>
              </div>
            )}

            <div className="mt-4 flex gap-8 text-center">
              <div>
                <p className="text-3xl font-bold text-white">{totalScore}</p>
                <p className="text-gray-500 text-xs">Total Score</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{completedCount}</p>
                <p className="text-gray-500 text-xs">Bosses Slain</p>
              </div>
            </div>

            <button onClick={onMazeComplete}
              className={`mt-8 px-12 py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r ${rc.gradient} hover:scale-105 active:scale-95 transition-all shadow-xl text-lg`}>
              {mode === 'encounter' ? 'Encounter Pet!' : 'Collect Rewards!'}
            </button>
          </div>
        </div>
      )}

      {/* Failed */}
      {phase === 'failed' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.9)' }}>
          <div className="flex flex-col items-center text-center px-6 animate-[advScaleIn_0.5s_ease-out]">
            <div className="text-7xl mb-6">💀</div>
            <h2 className="text-white text-3xl font-black mb-3">Adventure Failed!</h2>
            <p className="text-gray-400 text-sm mb-6">You were defeated and sent back home.</p>

            <div className="mt-2 flex gap-8 text-center">
              <div>
                <p className="text-3xl font-bold text-white">{totalScore}</p>
                <p className="text-gray-500 text-xs">Total Score</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{completedCount}/{stops.length}</p>
                <p className="text-gray-500 text-xs">Bosses Slain</p>
              </div>
            </div>

            <button onClick={onClose}
              className="mt-8 px-12 py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-gray-600 to-gray-700 hover:scale-105 active:scale-95 transition-all shadow-xl text-lg">
              Go Home
            </button>
          </div>
        </div>
      )}

      {/* Confirm close */}
      {showConfirmClose && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-xs mx-4 text-center">
            <h3 className="text-white font-bold text-lg mb-2">Leave Adventure?</h3>
            <p className="text-gray-400 text-sm mb-6">Your progress will be lost.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmClose(false)}
                className="flex-1 py-2.5 rounded-xl font-medium text-white bg-gray-700 hover:bg-gray-600 transition-colors">
                Stay
              </button>
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl font-medium text-white bg-red-600 hover:bg-red-500 transition-colors">
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes advtwinkle {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.5); }
        }
        @keyframes advfloat {
          0% { transform: translateY(0); opacity: 0.3; }
          100% { transform: translateY(-20px); opacity: 0.6; }
        }
        @keyframes advScaleIn {
          0% { opacity: 0; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes advPetIdle {
          0%, 100% { transform: translateY(0) scaleX(1); }
          50% { transform: translateY(-8px) scaleX(1); }
        }
        @keyframes advMonsterIdle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes advFadeOut {
          0% { opacity: 0.9; }
          70% { opacity: 0.6; }
          100% { opacity: 0; }
        }
        @keyframes advReadyPulse {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes advPetLeap {
          0%   { transform: translateX(0)    scale(1);   }
          80%  { transform: translateX(48vw) scale(1.1); }
          90%  { transform: translateX(48vw) scale(1.2); }
          100% { transform: translateX(48vw) scale(1);   }
        }
        @keyframes advShockwave {
          0% { width: 0; height: 0; opacity: 1; }
          60% { opacity: 0.6; }
          100% { width: 250px; height: 250px; opacity: 0; }
        }
        @keyframes advSparkFly {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--spark-x), var(--spark-y)) scale(0); opacity: 0; }
        }
        @keyframes advFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes advMonsterKnockback {
          0% { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 1; }
          8% { transform: translate(-10px, 5px) rotate(-10deg) scale(1.05); opacity: 1; }
          100% { transform: translate(80vw, -80vh) rotate(1440deg) scale(0.2); opacity: 0; }
        }
        @keyframes advFadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; pointer-events: none; }
        }
        @keyframes advVictoryFlash {
          0% { opacity: 0.9; }
          100% { opacity: 0; }
        }
        @keyframes advVictoryBounce {
          0% { transform: scale(0.5) translateY(40px); }
          50% { transform: scale(1.15) translateY(-20px); }
          70% { transform: scale(0.95) translateY(0); }
          100% { transform: scale(1) translateY(0); }
        }
        @keyframes advGlowPulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.2); }
        }
        @keyframes advStarBurst {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--star-x)), calc(-50% + var(--star-y))) scale(1); opacity: 0; }
        }
        @keyframes advWalkBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes advMapShake {
          0%, 100% { transform: translate(0, 0); }
          15% { transform: translate(-8px, 3px); }
          30% { transform: translate(7px, -4px); }
          45% { transform: translate(-6px, 2px); }
          60% { transform: translate(5px, -2px); }
          80% { transform: translate(-2px, 1px); }
        }
        @keyframes advBubble {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes advMapSlideIn {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes bbPetAttack {
          0% { transform: translateX(0); }
          40% { transform: translateX(30px) scale(1.1); }
          100% { transform: translateX(0) scale(1); }
        }
        @keyframes bbPetCritical {
          0% { transform: translateX(0); filter: brightness(1); }
          30% { transform: translateX(40px) scale(1.2); filter: brightness(1.5); }
          100% { transform: translateX(0) scale(1); filter: brightness(1); }
        }
        @keyframes bbPetHit {
          0% { transform: translateX(0); }
          20% { transform: translateX(-15px) rotate(-5deg); }
          60% { transform: translateX(-10px) rotate(-3deg); }
          100% { transform: translateX(0) rotate(0); }
        }
        @keyframes bbBossHit {
          0% { transform: translateX(0); filter: brightness(1); }
          20% { transform: translateX(15px) rotate(5deg); filter: brightness(2); }
          60% { transform: translateX(10px) rotate(3deg); filter: brightness(1.3); }
          100% { transform: translateX(0) rotate(0); filter: brightness(1); }
        }
        @keyframes bbBossAttack {
          0% { transform: translateX(0); }
          40% { transform: translateX(-30px) scale(1.1); }
          100% { transform: translateX(0) scale(1); }
        }
        @keyframes bbBossDefeated {
          0% { transform: scale(1); opacity: 1; filter: brightness(1); }
          30% { transform: scale(1.1); opacity: 0.8; filter: brightness(2); }
          100% { transform: scale(0.3) translateY(30px); opacity: 0; filter: brightness(0.5); }
        }
        @keyframes bbSlash {
          0% { opacity: 0; transform: scale(0.5) rotate(-10deg); }
          30% { opacity: 1; transform: scale(1.1) rotate(0deg); }
          100% { opacity: 0; transform: scale(1.2) rotate(5deg); }
        }
        @keyframes bbDmgFloat {
          0% { transform: translate(-50%, 0) scale(0.5); opacity: 0; }
          20% { transform: translate(-50%, -10px) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%, -40px) scale(1); opacity: 0; }
        }
        @keyframes advAsteroidEntry {
          0% { opacity: 0; transform: scale(0.5); }
          20% { opacity: 1; transform: scale(1); }
        }
        @keyframes advLetterBounceIn {
          0% { transform: scale(0) rotate(-10deg); }
          60% { transform: scale(1.15) rotate(3deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes advMatchTileIn {
          0% { transform: scale(0) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.1) rotate(2deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes advMatchCorrect {
          0% { transform: scale(1); }
          30% { transform: scale(1.15); }
          60% { transform: scale(0.9); opacity: 0.7; }
          100% { transform: scale(0.9); opacity: 0.6; }
        }
        @keyframes advMatchWrong {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-5px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
      `}</style>
    </div>,
    document.body
  )

  return (
    <>
      {portal}
      {showQuitWarning && createPortal(
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
          <div className="bg-gray-900 border border-red-500/30 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-white text-lg font-bold mb-2">Quit Adventure?</h3>
            <p className="text-gray-400 text-sm mb-5">
              You will lose all progress and the wild pet will escape!
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowQuitWarning(false)}
                className="flex-1 py-2.5 rounded-xl font-medium text-white bg-gray-700 hover:bg-gray-600 transition-colors"
              >
                Continue
              </button>
              <button
                onClick={() => { setShowQuitWarning(false); clearInterval(qTimerRef.current); setPhase('failed'); }}
                className="flex-1 py-2.5 rounded-xl font-medium text-white bg-red-600 hover:bg-red-500 transition-colors"
              >
                Quit
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default PetMazeAdventure
