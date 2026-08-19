import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Star, Volume2, VolumeX, Heart } from 'lucide-react'
import { assetUrl } from '../../../hooks/useBranding'

const GAME_DURATION = 76
const POINTS_PER_Q = 10
const STREAK_BONUS = 5
const PET_MAX_HP = 5
const STAR_THRESHOLDS = {
  1: [7, 10, 14],
  2: [10, 13, 17],
  3: [13, 17, 20],
  4: [16, 20, 22],
}

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const pickQuestions = (source) => shuffle(source).slice(0, 30)

const shuffleChoices = (choices) => {
  const mapped = choices.map((text, i) => ({ text, originalIndex: i }))
  return shuffle(mapped)
}

// Target positions for 2/3/4 choices - spread across right side
// All options in a horizontal row at the top
const TARGET_LAYOUTS = {
  2: [
    { x: 30, y: 18 },
    { x: 70, y: 18 },
  ],
  3: [
    { x: 20, y: 18 },
    { x: 50, y: 18 },
    { x: 80, y: 18 },
  ],
  4: [
    { x: 12, y: 18 },
    { x: 37, y: 18 },
    { x: 62, y: 18 },
    { x: 87, y: 18 },
  ],
}

const PIG_DEFAULT = (i) => assetUrl(`/pet-game/angry/pig${i + 1}.png`)
const PIG_CORRECT = (i) => assetUrl(`/pet-game/angry/pig${i + 1}-correct.png`)
const PIG_WRONG = (i) => assetUrl(`/pet-game/angry/pig${i + 1}-wrong.png`)

const PetAngryPet = ({ petImageUrl, petName, onGameEnd, onClose, questionBank: questionBankProp = [], hideClose = false, scoreToBeat = null, leaderboard = [], chestEnabled = false, currentLevel = 1 }) => {
  const thresholds = STAR_THRESHOLDS[currentLevel] || [7, 10, 14]
  const [star1Goal, star2Goal, star3Goal] = thresholds
  const passGoal = star1Goal
  const [phase, setPhase] = useState('ready')
  const [displayScore, setDisplayScore] = useState(0)
  const [displayTime, setDisplayTime] = useState(GAME_DURATION)
  const [questions, setQuestions] = useState([])
  const [qIndex, setQIndex] = useState(0)
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [selectedChoice, setSelectedChoice] = useState(null)
  const [shuffledChoices, setShuffledChoices] = useState([])
  const [questionsCorrect, setQuestionsCorrect] = useState(0)
  const starsEarned = questionsCorrect >= star3Goal ? 3 : questionsCorrect >= star2Goal ? 2 : questionsCorrect >= star1Goal ? 1 : 0
  const [wrongQuestions, setWrongQuestions] = useState([])
  const [muted, setMuted] = useState(false)
  const [screenShake, setScreenShake] = useState(0)
  const [particles, setParticles] = useState([])
  const [chestCollected, setChestCollected] = useState(false)
  const [chestPopup, setChestPopup] = useState(false)
  const [comboAnim, setComboAnim] = useState(false)
  const [petHp, setPetHp] = useState(PET_MAX_HP)


  // Slingshot / launch state
  const [isDragging, setIsDragging] = useState(false)
  const [dragPos, setDragPos] = useState(null) // { x, y } relative to container
  const [petLaunch, setPetLaunch] = useState(null) // { targetX, targetY } flying animation
  const [petOnSling, setPetOnSling] = useState(true)
  const [impactEffect, setImpactEffect] = useState(null) // { x, y, correct }
  const [petFalling, setPetFalling] = useState(false)

  const scoreRef = useRef(0)
  const timerRef = useRef(null)
  const streakRef = useRef(0)
  const audioCache = useRef({})
  const containerRef = useRef(null)
  const bgMusicRef = useRef(null)
  const animFrameRef = useRef(null)
  const shakeRef = useRef(0)
  const qStartRef = useRef(Date.now())

  const chestSpawnedRef = useRef(false)
  const uidRef = useRef(0)
  const uid = () => ++uidRef.current

  // Sling anchor point (percentage based)
  const SLING_X = 50
  const SLING_Y = 55

  const currentQ = questions[qIndex]

  const playSound = useCallback((url, volume = 0.5) => {
    try {
      if (muted) return
      if (!audioCache.current[url]) audioCache.current[url] = new Audio(url)
      const sound = audioCache.current[url]
      sound.volume = volume
      sound.currentTime = 0
      sound.play().catch(() => {})
    } catch {}
  }, [muted])

  const spawnParticles = useCallback((x, y, colors, count = 12) => {
    const newP = Array.from({ length: count }, () => ({
      id: `p-${uid()}`,
      x: x + (Math.random() - 0.5) * 40,
      y,
      vx: (Math.random() - 0.5) * 10,
      vy: -Math.random() * 7 - 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 1,
      size: 4 + Math.random() * 6,
    }))
    setParticles(prev => [...prev, ...newP])
  }, [])

  const advanceQuestion = useCallback(() => {
    setFeedback(null)
    setSelectedChoice(null)
    setPetOnSling(true)
    setPetLaunch(null)
    setPetFalling(false)
    setImpactEffect(null)
    setDragPos(null)
    qStartRef.current = Date.now()
    const nextIdx = qIndex + 1
    if (nextIdx < questions.length) {
      setQIndex(nextIdx)
      setShuffledChoices(shuffleChoices(questions[nextIdx].choices))
    } else {
      const more = pickQuestions(questionBankProp)
      setQuestions(more)
      setQIndex(0)
      setShuffledChoices(shuffleChoices(more[0].choices))
    }
  }, [qIndex, questionBankProp, questions])


  const handleAnswer = useCallback((originalIndex, targetPos) => {
    if (phase !== 'playing' || !currentQ || feedback || selectedChoice !== null) return
    setSelectedChoice(originalIndex)

    const isCorrect = originalIndex === currentQ.answer_index
    const elapsed = (Date.now() - qStartRef.current) / 1000

    // Impact effect at target
    setImpactEffect({ x: targetPos.x, y: targetPos.y, correct: isCorrect })

    if (isCorrect) {
      const newStreak = streakRef.current + 1
      streakRef.current = newStreak
      setStreak(newStreak)

      let points = POINTS_PER_Q
      if (elapsed < 3) points += 5
      else if (elapsed < 5) points += 3
      else if (elapsed < 8) points += 1

      if (newStreak >= 5) points += STREAK_BONUS + 3
      else if (newStreak >= 3) points += STREAK_BONUS

      scoreRef.current += points
      setDisplayScore(scoreRef.current)
      setQuestionsCorrect(prev => prev + 1)

      if (chestEnabled && !chestSpawnedRef.current && questionsCorrect + 1 >= 5) {
        chestSpawnedRef.current = true
        setChestCollected(true)
        setChestPopup(true)
        setTimeout(() => setChestPopup(false), 1500)
      }

      setFeedback('correct')

      if (newStreak >= 3) {
        setComboAnim(true)
        setTimeout(() => setComboAnim(false), 600)
      }

      shakeRef.current = 8
      setScreenShake(8)

      const cw = containerRef.current?.clientWidth || 400
      const ch = containerRef.current?.clientHeight || 700
      spawnParticles(
        (targetPos.x / 100) * cw,
        (targetPos.y / 100) * ch,
        ['#facc15', '#f59e0b', '#34d399', '#60a5fa', '#a78bfa'],
        16
      )

      playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)
      setTimeout(() => advanceQuestion(), 900)
    } else {
      streakRef.current = 0
      setStreak(0)
      setFeedback('wrong')
      shakeRef.current = 10
      setScreenShake(10)

      setWrongQuestions(prev => [...prev, { word: currentQ.choices[currentQ.answer_index], hint: currentQ.question }])
      playSound(assetUrl('/pet-game/angry/oink.wav'), 0.4)
      // Pet falls to the ground after hitting wrong target
      setTimeout(() => setPetFalling(true), 300)

      const newPetHp = petHp - 1
      setPetHp(newPetHp)
      if (newPetHp <= 0) {
        setTimeout(() => {
          clearInterval(timerRef.current)
          if (bgMusicRef.current) { bgMusicRef.current.pause(); bgMusicRef.current = null }
          setPhase('defeated')
        }, 800)
        return
      }

      setTimeout(() => advanceQuestion(), 1500)
    }
  }, [phase, currentQ, feedback, selectedChoice, advanceQuestion, questionsCorrect, chestEnabled, playSound, spawnParticles, petHp])

  // Launch the pet towards a target position, then resolve answer
  const launchPet = useCallback((targetX, targetY, choiceIndex, choice) => {
    if (phase !== 'playing' || feedback) return
    setPetOnSling(false)
    setPetLaunch({ targetX, targetY })
    playSound(assetUrl('/sound/flappy-wing.mp3'), 0.4)

    // After flight animation completes, handle the answer
    setTimeout(() => {
      const layout = TARGET_LAYOUTS[shuffledChoices.length] || TARGET_LAYOUTS[4]
      const pos = layout[choiceIndex] || { x: targetX, y: targetY }
      handleAnswer(choice.originalIndex, pos)
    }, 400)
  }, [phase, feedback, shuffledChoices, handleAnswer, playSound])

  // Drag handlers for slingshot - only start from near the pet
  const handleDragStart = useCallback((e) => {
    if (phase !== 'playing' || feedback || !petOnSling) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    // Only start drag if touching near the pet/slingshot area
    const dx = x - SLING_X
    const dy = y - (SLING_Y - 8)
    if (Math.sqrt(dx * dx + dy * dy) > 20) return
    e.preventDefault()
    setIsDragging(true)
    setDragPos({ x, y: SLING_Y - 8 }) // Lock Y to sling position
  }, [phase, feedback, petOnSling])

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const x = ((clientX - rect.left) / rect.width) * 100
    // Horizontal only - lock Y to sling position to avoid pull-to-refresh on mobile
    setDragPos({ x: Math.max(5, Math.min(95, x)), y: SLING_Y - 8 })
  }, [isDragging])

  const handleDragEnd = useCallback(() => {
    if (!isDragging || !dragPos) { setIsDragging(false); return }
    setIsDragging(false)

    const dragDist = Math.abs(dragPos.x - SLING_X)
    if (dragDist < 5) {
      // Too small a drag / just a tap, reset
      setDragPos(null)
      return
    }

    // Find closest target by X position (horizontal aim)
    const aimX = dragPos.x
    const layout = TARGET_LAYOUTS[shuffledChoices.length] || TARGET_LAYOUTS[4]
    let closestIdx = 0
    let minDist = Infinity
    shuffledChoices.forEach((_, i) => {
      const pos = layout[i]
      if (!pos) return
      const dist = Math.abs(aimX - pos.x)
      if (dist < minDist) { minDist = dist; closestIdx = i }
    })

    const pos = layout[closestIdx]
    launchPet(pos.x, pos.y, closestIdx, shuffledChoices[closestIdx])
  }, [isDragging, dragPos, shuffledChoices, launchPet])



  const startGame = useCallback(() => {
    const gameQs = pickQuestions(questionBankProp)
    setQuestions(gameQs)
    if (gameQs.length > 0) setShuffledChoices(shuffleChoices(gameQs[0].choices))
    setSelectedChoice(null)
    setQIndex(0)
    setDisplayScore(0)
    setDisplayTime(GAME_DURATION)
    setQuestionsCorrect(0)
    setWrongQuestions([])
    setFeedback(null)
    setPetOnSling(true)
    setPetLaunch(null)
    setPetFalling(false)
    setImpactEffect(null)
    setDragPos(null)

    scoreRef.current = 0
    streakRef.current = 0
    setStreak(0)
    chestSpawnedRef.current = false
    setChestCollected(false)
    setChestPopup(false)
    setPetHp(PET_MAX_HP)
    qStartRef.current = Date.now()
    setPhase('playing')

    try {
      const music = new Audio(assetUrl('/sound/pet-word-scamble-2-faster.mp3'))
      music.loop = true
      music.volume = 0.3
      bgMusicRef.current = music
      music.play().catch(() => {})
    } catch {}
  }, [questionBankProp])

  // Game timer
  useEffect(() => {
    if (phase !== 'playing') return
    timerRef.current = setInterval(() => {
      setDisplayTime(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          if (bgMusicRef.current) { bgMusicRef.current.pause(); bgMusicRef.current = null }
          setPhase('results')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  // Play level-complete sound on successful results
  useEffect(() => {
    if (phase === 'results') {
      if (questionsCorrect >= passGoal) {
        playSound(assetUrl('/pet-game/angry/angry-birds-level-complete.mp3'), 0.5)
      } else {
        playSound(assetUrl('/sound/craft_fail.mp3'), 0.5)
      }
    }
    if (phase === 'defeated') {
      playSound(assetUrl('/sound/craft_fail.mp3'), 0.5)
    }
  }, [phase, playSound, questionsCorrect, passGoal])

  // Cleanup
  useEffect(() => {
    return () => {
      if (bgMusicRef.current) { bgMusicRef.current.pause(); bgMusicRef.current = null }
      if (timerRef.current) clearInterval(timerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // Animation loop for particles + shake
  useEffect(() => {
    if (phase !== 'playing') return
    const animate = () => {
      shakeRef.current = Math.max(0, shakeRef.current - 0.5)
      setScreenShake(shakeRef.current)
      setParticles(prev => prev
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.3, opacity: p.opacity - 0.02 }))
        .filter(p => p.opacity > 0)
      )
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [phase])

  // Global mouse/touch handlers for drag
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e) => handleDragMove(e)
    const onEnd = () => handleDragEnd()
    window.addEventListener('mousemove', onMove)
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

  // Pet position during various states - pet stays on slingshot while aiming
  // Pet sits low on the slingshot but pivots from below the slingshot base
  const PET_REST_Y = SLING_Y - 3 // pet sits 3% above slingshot origin
  const PIVOT_ARM = 16 // distance from pivot (below slingshot) to pet — controls arc size
  const getPetPos = () => {
    if (petFalling) return { x: petLaunch?.targetX ?? SLING_X, y: 60 }
    if (petLaunch) return { x: petLaunch.targetX, y: petLaunch.targetY }
    if (isDragging && dragPos) {
      const angle = (dragPos.x - SLING_X) * 0.4 * (Math.PI / 180)
      return {
        x: SLING_X + Math.sin(angle) * PIVOT_ARM,
        y: (SLING_Y + PIVOT_ARM - (SLING_Y - PET_REST_Y)) - Math.cos(angle) * PIVOT_ARM,
      }
    }
    return { x: SLING_X, y: PET_REST_Y }
  }

  const petPos = getPetPos()

  // Slingshot image
  const renderSlingshot = () => {
    const rotation = isDragging && dragPos ? (dragPos.x - SLING_X) * 0.4 : 0
    return (
      <div className="absolute pointer-events-none" style={{
        left: `${SLING_X}%`,
        top: `${SLING_Y}%`,
        transform: `translate(-50%, -40%) rotate(${rotation}deg)`,
        transition: isDragging ? 'none' : 'transform 0.3s ease-out',
        transformOrigin: 'center bottom',
        zIndex: 4,
      }}>
        <img src={assetUrl('/pet-game/angry/Slingshot.png')} alt="Slingshot" className="w-24 h-28 object-contain" />
      </div>
    )
  }

  // Aim indicator - dots from pet to crosshair at target row
  const renderTrajectory = () => {
    if (!isDragging || !dragPos) return null
    const aimX = dragPos.x
    const startX = SLING_X
    const startY = SLING_Y - 12
    const endY = 18
    const steps = 6
    const dots = []
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const dotX = startX + (aimX - startX) * t
      const dotY = startY - (startY - endY) * t
      dots.push(
        <circle key={i} cx={`${dotX}%`} cy={`${dotY}%`} r={3 - i * 0.3} fill="white" opacity={0.5 - i * 0.06} />
      )
    }
    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 15 }}>
        {dots}
        {/* Crosshair at target row */}
        <circle cx={`${aimX}%`} cy={`${endY}%`} r={8} fill="none" stroke="white" strokeWidth={2} opacity={0.7} />
        <line x1={`${aimX - 2}%`} y1={`${endY}%`} x2={`${aimX + 2}%`} y2={`${endY}%`} stroke="white" strokeWidth={2} opacity={0.7} />
        <line x1={`${aimX}%`} y1={`${endY - 2}%`} x2={`${aimX}%`} y2={`${endY + 2}%`} stroke="white" strokeWidth={2} opacity={0.7} />
      </svg>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <style>{`
        @keyframes alPopIn { 0% { transform: scale(0); opacity: 0 } 60% { transform: scale(1.1) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes alShake { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-8px) } 40% { transform: translateX(6px) } 60% { transform: translateX(-4px) } 80% { transform: translateX(2px) } }
        @keyframes alFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
        @keyframes alResultsFadeIn { 0% { opacity: 0; transform: translateY(30px) scale(0.95) } 100% { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes alScorePopIn { 0% { transform: scale(0) } 70% { transform: scale(1.15) } 100% { transform: scale(1) } }
        @keyframes alPetFly { 0% { transform: scale(1) } 50% { transform: scale(1.3) rotate(-15deg) } 100% { transform: scale(1) rotate(0deg) } }
        @keyframes alImpactCorrect { 0% { transform: scale(0); opacity: 1 } 50% { transform: scale(2); opacity: 0.8 } 100% { transform: scale(3); opacity: 0 } }
        @keyframes alImpactWrong { 0% { transform: scale(1); opacity: 1 } 100% { transform: scale(0.5) rotate(20deg); opacity: 0 } }
        @keyframes alTargetIdle { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
        @keyframes alCombo { 0% { transform: scale(1) } 50% { transform: scale(1.3) } 100% { transform: scale(1) } }
        @keyframes alQuestionIn { 0% { opacity: 0; transform: translateY(-15px) } 100% { opacity: 1; transform: translateY(0) } }
        @keyframes alPetBounce { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes alPetFall { 0% { transform: translate(-50%,-50%) rotate(0deg) } 100% { transform: translate(-50%,-50%) rotate(720deg) } }
        @keyframes chestPopupAnim { 0% { opacity: 0; transform: scale(0.5) translateY(20px) } 50% { opacity: 1; transform: scale(1.1) translateY(-10px) } 100% { opacity: 0; transform: scale(1) translateY(-30px) } }
        @keyframes alTargetDestroy { 0% { transform: scale(1); opacity: 1 } 30% { transform: scale(1.2); opacity: 0.8 } 100% { transform: scale(1.2) rotate(15deg); opacity: 0 } }
        @keyframes alTargetWrong { 0% { transform: translateX(0) } 20% { transform: translateX(-5px) } 40% { transform: translateX(5px) } 60% { transform: translateX(-3px) } 80% { transform: translateX(3px) } 100% { transform: translateX(0) } }
        @keyframes bbHeartLose { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.5; } 100% { transform: scale(0); opacity: 0; } }
        @keyframes hintPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.03); } }
        @keyframes timerUrgent { 0%, 100% { transform: scale(1) rotate(0deg); } 15% { transform: scale(1.1) rotate(-3deg); } 30% { transform: scale(1) rotate(3deg); } 45% { transform: scale(1.05) rotate(-2deg); } 60% { transform: scale(1) rotate(0deg); } }
      `}</style>

      <div
        ref={containerRef}
        className="relative w-full max-w-[420px] h-[100dvh] sm:h-[92vh] sm:rounded-3xl overflow-hidden shadow-2xl select-none"
        style={{
          transform: screenShake > 0 ? `translate(${(Math.random() - 0.5) * screenShake}px, ${(Math.random() - 0.5) * screenShake}px)` : undefined,
        }}
      >
        {/* Background image */}
        <img src={assetUrl('/pet-game/angry/angry-background.png')} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />

        {/* Close button */}
        {!hideClose && phase !== 'results' && phase !== 'defeated' && (
          <button onClick={onClose} className="absolute top-3 left-3 z-40 bg-black/30 rounded-full p-1.5 text-white/80 hover:text-white hover:bg-black/50 transition-colors">
            <X size={18} />
          </button>
        )}

        {/* ═══ READY PHASE ═══ */}
        {phase === 'ready' && (
          <div className="flex flex-col items-center justify-center h-full gap-5 p-6 relative z-10">
            <div style={{ animation: 'alFloat 2s ease-in-out infinite' }}>
              {petImageUrl ? (
                <img src={petImageUrl} alt={petName} className="w-24 h-24 object-contain drop-shadow-lg" />
              ) : (
                <span className="text-7xl">🐾</span>
              )}
            </div>
            <h2 className="text-3xl font-black text-white drop-shadow-lg">Angry Pet!</h2>
            <p className="text-white/80 text-sm text-center max-w-[260px]">
              Swipe left or right to aim {petName}, then release to launch at the correct answer!
            </p>

            {leaderboard.length > 0 && (
              <div className="bg-white/15 backdrop-blur-md rounded-xl p-3 w-full max-w-[260px] border border-white/20">
                <p className="text-xs font-bold text-yellow-300 mb-2 text-center">Top Scores</p>
                {leaderboard.slice(0, 3).map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-white/80 py-1">
                    <span className="font-bold text-yellow-300">{i + 1}.</span>
                    <span className="font-semibold truncate">{entry.nickname || entry.name}</span>
                    <span className="ml-auto font-mono text-white">{entry.score}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={startGame}
              className="mt-2 px-10 py-4 bg-gradient-to-b from-orange-400 to-red-500 text-white rounded-full font-black text-xl shadow-xl border-b-4 border-red-700 active:border-b-0 active:mt-3 transition-all hover:from-orange-500 hover:to-red-600"
            >
              Launch! 🚀
            </button>
          </div>
        )}

        {/* ═══ PLAYING PHASE ═══ */}
        {phase === 'playing' && currentQ && (
          <div className="flex flex-col h-full relative">
            {/* Top HUD */}
            <div className="flex items-center justify-between pl-12 pr-4 pt-3 pb-2 z-20 relative">
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
              <button onClick={() => setMuted(!muted)} className="text-white/60 hover:text-white">
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </div>

            {/* Question + Streak */}
            <div className="px-4 pb-2 z-20 relative">
              <div className="w-full flex items-center gap-2">
                <div className={`rounded-full px-2.5 py-1 text-xs font-bold flex items-center gap-1 shrink-0 ${
                  streak >= 3 ? 'bg-yellow-400 text-yellow-900' : 'bg-white/15 text-white/70'
                }`}
                  style={comboAnim ? { animation: 'alCombo 0.6s ease-out' } : {}}
                >
                  <img src={assetUrl('/icon/profile/streak.svg')} alt="streak" className="w-3.5 h-3.5" />{streak}x
                </div>
                <div className="flex-1 bg-white/10 backdrop-blur rounded-xl px-4 py-2 text-center min-w-0"
                  key={qIndex}
                  style={{ animation: 'alQuestionIn 0.3s ease-out' }}
                >
                  <span className="text-xs text-white/50 mr-1">Hit:</span>
                  <span className="text-base font-bold text-white">{currentQ.question}</span>
                  {currentQ.image_url && (
                    <img src={currentQ.image_url} alt="" className="w-10 h-10 object-contain mx-auto mt-1 rounded-lg" />
                  )}
                </div>
              </div>
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
                      width: `${Math.min(100, (questionsCorrect / star3Goal) * 100)}%`,
                      background: 'linear-gradient(180deg, #67e8f9 0%, #0891b2 50%, #0e7490 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 0 6px rgba(34,211,238,0.6)',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  {[star1Goal, star2Goal].map((goal, i) => (
                    <div key={i} className="absolute top-0 bottom-0 flex items-center justify-center" style={{ left: `${(goal / star3Goal) * 100}%`, transform: 'translateX(-50%)' }}>
                      <div className="w-0.5 h-3 rounded-full" style={{ background: questionsCorrect >= goal ? 'rgba(250,204,21,0.9)' : 'rgba(255,255,255,0.3)' }} />
                    </div>
                  ))}
                </div>
                <div className="flex -space-x-0.5">
                  {thresholds.map((goal, i) => (
                    <Star key={i} className={`w-5 h-5 transition-all ${questionsCorrect >= goal ? 'text-yellow-400 fill-yellow-400 drop-shadow-sm' : 'text-white/25'}`} />
                  ))}
                </div>
              </div>
            </div>

            {/* Battlefield area */}
            <div className="flex-1 relative"
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              style={{ touchAction: 'none' }}
            >
              {/* Slingshot */}
              {renderSlingshot()}

              {/* Trajectory dots */}
              {renderTrajectory()}

              {/* Pet on slingshot or flying */}
              <div
                className="absolute z-10 flex items-center justify-center"
                style={{
                  left: `${petPos.x}%`,
                  top: `${petPos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  transition: petFalling ? 'left 0.5s ease-in, top 0.5s ease-in' : petLaunch ? 'left 0.35s ease-out, top 0.35s ease-out' : isDragging ? 'none' : 'left 0.2s, top 0.2s',
                  animation: petFalling ? 'alPetFall 0.5s ease-in' : petLaunch ? 'alPetFly 0.4s ease-out' : petOnSling && !isDragging ? 'alPetBounce 1.5s ease-in-out infinite' : undefined,
                  cursor: petOnSling && !isDragging ? 'grab' : isDragging ? 'grabbing' : 'default',
                }}
              >
                {petImageUrl ? (
                  <img src={petImageUrl} alt={petName} className="w-12 h-12 object-contain drop-shadow-lg" />
                ) : (
                  <span className="text-4xl">🐾</span>
                )}
              </div>

              {/* Answer targets */}
              {shuffledChoices.map((choice, i) => {
                const layout = TARGET_LAYOUTS[shuffledChoices.length] || TARGET_LAYOUTS[4]
                const pos = layout[i]
                if (!pos) return null

                const isSelected = selectedChoice === choice.originalIndex
                const isCorrectAnswer = choice.originalIndex === currentQ.answer_index
                const showResult = feedback !== null

                let targetStyle = {}
                if (showResult && isCorrectAnswer && isSelected) {
                  targetStyle.animation = 'alTargetDestroy 0.6s ease-out forwards'
                } else if (showResult && isSelected && !isCorrectAnswer) {
                  targetStyle.animation = 'alTargetWrong 0.4s ease-out'
                } else if (!showResult) {
                  targetStyle.animation = `alTargetIdle ${1.5 + i * 0.3}s ease-in-out infinite`
                }

                let bgClass = 'bg-amber-100 border-amber-300 text-amber-900'
                if (showResult && isCorrectAnswer) {
                  bgClass = 'bg-green-200 border-green-500 text-green-800'
                } else if (showResult && isSelected && !isCorrectAnswer) {
                  bgClass = 'bg-red-200 border-red-500 text-red-800'
                }

                const pigImg = showResult && isSelected && isCorrectAnswer ? PIG_CORRECT(i)
                  : showResult && isSelected && !isCorrectAnswer ? PIG_WRONG(i)
                  : PIG_DEFAULT(i)

                return (
                  <div
                    key={i}
                    className="absolute z-10"
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <div
                      className={`flex flex-col items-center gap-1 pointer-events-none ${feedback ? '' : ''}`}
                      style={targetStyle}
                    >
                      <img src={pigImg} alt="" className="w-14 h-14 object-contain drop-shadow-md" />
                      <div className={`rounded-lg border-2 px-3 py-1.5 shadow-md text-center ${bgClass}`}>
                        <span className="text-xs font-bold leading-tight block max-w-[80px]">{choice.text}</span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Impact effect */}
              {impactEffect && (
                <div
                  className="absolute z-20 pointer-events-none"
                  style={{
                    left: `${impactEffect.x}%`,
                    top: `${impactEffect.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div
                    className="w-16 h-16 rounded-full"
                    style={{
                      background: impactEffect.correct
                        ? 'radial-gradient(circle, rgba(250,204,21,0.8) 0%, transparent 70%)'
                        : 'radial-gradient(circle, rgba(239,68,68,0.6) 0%, transparent 70%)',
                      animation: impactEffect.correct ? 'alImpactCorrect 0.5s ease-out forwards' : 'alImpactWrong 0.4s ease-out forwards',
                    }}
                  />
                </div>
              )}

              {/* Particles */}
              {particles.map(p => (
                <div key={p.id} className="absolute rounded-full pointer-events-none z-30"
                  style={{
                    left: p.x, top: p.y,
                    width: p.size || 6, height: p.size || 6,
                    background: p.color,
                    opacity: p.opacity,
                  }}
                />
              ))}

              {/* Chest popup */}
              {chestPopup && (
                <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                  <div className="flex flex-col items-center gap-2" style={{ animation: 'chestPopupAnim 1.5s ease-out forwards' }}>
                    <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-16 h-16 object-contain" />
                    <div className="bg-amber-500 text-white rounded-full px-4 py-1.5 font-bold text-sm shadow-lg">Chest Found!</div>
                  </div>
                </div>
              )}

              {/* Drag instruction hint */}
              {petOnSling && !feedback && !isDragging && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20 pointer-events-none">
                  <div className="bg-black/40 backdrop-blur-sm text-white/90 text-xs font-semibold rounded-full px-4 py-1.5">
                    Swipe left/right to aim, release to launch!
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ DEFEATED PHASE ═══ */}
        {phase === 'defeated' && (
          <div className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto p-6 z-50">
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center my-auto"
              style={{ animation: 'alResultsFadeIn 0.5s ease-out' }}
            >
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-4"
                style={{ animation: 'alScorePopIn 0.6s ease-out 0.3s both' }}
              >
                <Heart className="w-10 h-10 text-red-500" fill="#ef4444" />
              </div>

              <h2 className="text-2xl font-bold text-gray-800 mb-1">Defeated!</h2>
              <p className="text-gray-500 mb-5">{petName} ran out of lives!</p>

              <div className="rounded-2xl p-5 mb-5 border bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200"
                style={{ animation: 'alScorePopIn 0.6s ease-out 0.5s both' }}
              >
                <p className="text-5xl font-black text-gray-400">{displayScore}</p>
                <p className="text-sm font-semibold mt-1 text-gray-400">score</p>
              </div>

              <p className="text-sm text-gray-600 mb-6">
                Try to keep your lives! Wrong answers cost a heart.
              </p>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { setPhase('ready'); setDisplayScore(0) }}
                  className="w-full py-3.5 bg-gradient-to-b from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-red-700 active:border-b-0 active:mt-1 transition-all"
                >
                  Try Again
                </button>
                <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  Exit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ RESULTS PHASE ═══ */}
        {phase === 'results' && (
          <div className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto p-6 z-50">
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center my-auto"
              style={{ animation: 'alResultsFadeIn 0.5s ease-out' }}
            >
              {/* Star display */}
              <div className="flex justify-center gap-1 mb-4">
                {[1, 2, 3].map(s => (
                  <Star key={s} className={`w-12 h-12 transition-all ${starsEarned >= s ? 'text-yellow-400 fill-yellow-400 drop-shadow-lg' : 'text-gray-300'}`}
                    style={{ animation: starsEarned >= s ? `alScorePopIn 0.5s ease-out ${0.2 + s * 0.15}s both` : 'alScorePopIn 0.5s ease-out 0.3s both' }}
                  />
                ))}
              </div>

              <h2 className="text-2xl font-bold text-gray-800 mb-1">
                {starsEarned >= 3 ? 'Perfect Aim!' : starsEarned >= 2 ? 'Great Aim!' : starsEarned >= 1 ? 'Training Complete!' : 'Not Enough Hits!'}
              </h2>
              <p className="text-gray-500 mb-5">
                {starsEarned >= 1
                  ? `${petName} hit ${questionsCorrect} targets!`
                  : `${petName} only hit ${questionsCorrect}/${passGoal} targets`}
              </p>

              <div className={`rounded-2xl p-5 mb-5 border ${
                starsEarned >= 3 ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200'
                : starsEarned >= 1 ? 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-100'
                : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'
              }`}
                style={{ animation: 'alScorePopIn 0.6s ease-out 0.5s both' }}
              >
                <p className={`text-5xl font-black ${
                  starsEarned >= 3 ? 'text-yellow-500' : starsEarned >= 1 ? 'text-orange-600' : 'text-gray-400'
                }`}>{questionsCorrect}</p>
                <p className={`text-sm font-semibold mt-1 ${
                  starsEarned >= 3 ? 'text-yellow-400' : starsEarned >= 1 ? 'text-orange-400' : 'text-gray-400'
                }`}>targets hit</p>
              </div>

              {wrongQuestions.length > 0 && (
                <div className="mb-5 text-left">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">Questions to Review</p>
                  <div className="max-h-[180px] overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {wrongQuestions.map((w, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2">
                        <span className="font-bold text-sm text-green-600">{w.word}</span>
                        <span className="text-xs text-gray-400 ml-auto truncate max-w-[160px]">{w.hint}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-sm text-gray-600 mb-6">
                {starsEarned >= 3
                  ? 'Sharpshooter! Perfect performance!'
                  : starsEarned >= 2
                    ? `Nice aim! Get ${star3Goal} hits for 3 stars!`
                    : starsEarned >= 1
                      ? `Good job! Get ${star2Goal} hits for 2 stars!`
                      : `Need at least ${star1Goal} hits to earn a star. Try again!`}
              </p>

              {chestCollected && (
                <div className="mb-4 flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-8 h-8 object-contain" />
                  <span className="font-bold text-amber-700">Chest collected!</span>
                </div>
              )}

              {starsEarned >= 1 ? (
                <button
                  onClick={() => onGameEnd(displayScore, { chestCollected, wordsCompleted: questionsCorrect, stars: starsEarned })}
                  className="w-full py-3.5 bg-gradient-to-b from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-red-700 active:border-b-0 active:mt-1 transition-all"
                >
                  Collect Rewards
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { setPhase('ready'); setDisplayScore(0) }}
                    className="w-full py-3.5 bg-gradient-to-b from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-red-700 active:border-b-0 active:mt-1 transition-all"
                  >
                    Try Again
                  </button>
                  <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                    Exit
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

export default PetAngryPet
