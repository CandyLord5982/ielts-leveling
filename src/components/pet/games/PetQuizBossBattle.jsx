import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Volume2, VolumeX, Trophy, Heart, Swords, Shield, Zap } from 'lucide-react'
import { assetUrl } from '../../../hooks/useBranding'

const BOSSES = [
  { name: 'Stone Golem', hp: 4, img: assetUrl('/pet-game/boss/boss1.png'), color: '#9ca3af', bg: 'from-gray-800 to-gray-700', attackName: 'Rock Slam', accent: 'gray' },
  { name: 'Forest Troll', hp: 5, img: assetUrl('/pet-game/boss/boss2.png'), color: '#22c55e', bg: 'from-green-900 to-emerald-800', attackName: 'Vine Whip', accent: 'green' },
  { name: 'Frost Giant', hp: 7, img: assetUrl('/pet-game/boss/boss3.png'), color: '#3b82f6', bg: 'from-blue-900 to-cyan-900', attackName: 'Ice Crush', accent: 'blue' },
  { name: 'Shadow Demon', hp: 9, img: assetUrl('/pet-game/boss/boss4.png'), color: '#a855f7', bg: 'from-purple-900 to-indigo-900', attackName: 'Dark Pulse', accent: 'purple' },
  { name: 'Dragon King', hp: 12, img: assetUrl('/pet-game/boss/boss5.png'), color: '#eab308', bg: 'from-yellow-900 to-amber-800', attackName: 'Golden Fire', accent: 'gold' },
]

const POINTS_PER_HIT = 10
const STREAK_BONUS = 5
const PET_MAX_HP = 5
const GAME_DURATION = 150
const QUESTION_TIME_LIMIT = 5

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

const CATEGORY_COLORS = {
  prepositions: { bg: 'bg-blue-400/30', text: 'text-blue-200', label: 'Prepositions' },
  tenses: { bg: 'bg-purple-400/30', text: 'text-purple-200', label: 'Tenses' },
  grammar: { bg: 'bg-pink-400/30', text: 'text-pink-200', label: 'Grammar' },
  animals: { bg: 'bg-green-400/30', text: 'text-green-200', label: 'Animals' },
  colors: { bg: 'bg-yellow-400/30', text: 'text-yellow-200', label: 'Colors' },
  numbers: { bg: 'bg-orange-400/30', text: 'text-orange-200', label: 'Numbers' },
  food: { bg: 'bg-red-400/30', text: 'text-red-200', label: 'Food' },
  body: { bg: 'bg-teal-400/30', text: 'text-teal-200', label: 'Body' },
  family: { bg: 'bg-rose-400/30', text: 'text-rose-200', label: 'Family' },
  school: { bg: 'bg-indigo-400/30', text: 'text-indigo-200', label: 'School' },
  nature: { bg: 'bg-emerald-400/30', text: 'text-emerald-200', label: 'Nature' },
  verbs: { bg: 'bg-cyan-400/30', text: 'text-cyan-200', label: 'Verbs' },
  general: { bg: 'bg-slate-400/30', text: 'text-slate-200', label: 'General' },
  opposites: { bg: 'bg-amber-400/30', text: 'text-amber-200', label: 'Opposites' },
}

const PetQuizBossBattle = ({
  petImageUrl,
  petName,
  onGameEnd,
  onClose,
  questionBank: questionBankProp = [],
  hideClose = false,
  leaderboard = [],
  chestEnabled = false,
}) => {
  const [phase, setPhase] = useState('ready') // ready | playing | boss-intro | victory | defeated | results
  const [displayScore, setDisplayScore] = useState(0)
  const [displayTime, setDisplayTime] = useState(GAME_DURATION)
  const [questions, setQuestions] = useState([])
  const [qIndex, setQIndex] = useState(0)
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [selectedChoice, setSelectedChoice] = useState(null)
  const [shuffledChoices, setShuffledChoices] = useState([])
  const [questionsCorrect, setQuestionsCorrect] = useState(0)
  const [wrongQuestions, setWrongQuestions] = useState([])
  const [muted, setMuted] = useState(false)
  const [screenShake, setScreenShake] = useState(0)
  const [particles, setParticles] = useState([])

  // Boss battle specific
  const [bossIndex, setBossIndex] = useState(0)
  const [bossHp, setBossHp] = useState(BOSSES[0].hp)
  const [petHp, setPetHp] = useState(PET_MAX_HP)
  const [bossAnim, setBossAnim] = useState('idle') // idle | hit | attack | defeated
  const [petAnim, setPetAnim] = useState('idle') // idle | attack | hit | critical
  const [damagePopup, setDamagePopup] = useState(null)
  const [petDamagePopup, setPetDamagePopup] = useState(null)
  const [bossesDefeated, setBossesDefeated] = useState(0)
  const [slashEffect, setSlashEffect] = useState(false)
  const [comboAnim, setComboAnim] = useState(false)
  const [chestCollected, setChestCollected] = useState(false)
  const [chestPopup, setChestPopup] = useState(false)
  const [bossIntroName, setBossIntroName] = useState('')

  const scoreRef = useRef(0)
  const timerRef = useRef(null)
  const streakRef = useRef(0)
  const audioCache = useRef({})
  const containerRef = useRef(null)
  const bgMusicRef = useRef(null)
  const animFrameRef = useRef(null)
  const shakeRef = useRef(0)
  const qStartRef = useRef(Date.now())
  const qTimerRef = useRef(null)
  const [qTimeLeft, setQTimeLeft] = useState(QUESTION_TIME_LIMIT)
  const uidRef = useRef(0)
  const chestSpawnedRef = useRef(false)
  const uid = () => ++uidRef.current

  const currentBoss = BOSSES[bossIndex] || BOSSES[0]
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

  const advanceQuestion = useCallback(() => {
    setFeedback(null)
    setSelectedChoice(null)
    qStartRef.current = Date.now()
    startQTimer()
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
  }, [qIndex, questionBankProp, questions, startQTimer])

  const handleBossDefeated = useCallback(() => {
    clearInterval(qTimerRef.current)
    setBossAnim('defeated')
    playSound(assetUrl('/sound/scram-correct.mp3'), 0.5)

    const cw = containerRef.current?.clientWidth || 400
    const ch = containerRef.current?.clientHeight || 700
    spawnParticles(cw / 2, ch * 0.25, ['#facc15', '#f59e0b', '#fbbf24', '#fde68a', '#ffffff'], 24)

    const nextBoss = bossIndex + 1
    const newDefeated = bossesDefeated + 1
    setBossesDefeated(newDefeated)

    // Chest on first boss defeat
    if (chestEnabled && !chestSpawnedRef.current && newDefeated >= 1) {
      chestSpawnedRef.current = true
      setChestCollected(true)
      setChestPopup(true)
      setTimeout(() => setChestPopup(false), 1500)
    }

    if (nextBoss < BOSSES.length) {
      setTimeout(() => {
        setBossIndex(nextBoss)
        setBossHp(BOSSES[nextBoss].hp)
        setBossAnim('idle')
        setBossIntroName(BOSSES[nextBoss].name)
        setPhase('boss-intro')
        setTimeout(() => {
          advanceQuestion()
          setPhase('playing')
        }, 1800)
      }, 1200)
    } else {
      setTimeout(() => {
        clearInterval(timerRef.current)
        setPhase('victory')
      }, 1200)
    }
  }, [bossIndex, bossesDefeated, chestEnabled, playSound, spawnParticles, advanceQuestion])

  const handleChoice = useCallback((originalIndex) => {
    if (phase !== 'playing' || !currentQ || feedback || selectedChoice !== null) return
    clearInterval(qTimerRef.current)
    setSelectedChoice(originalIndex)

    const isCorrect = originalIndex === currentQ.answer_index
    const elapsed = (Date.now() - qStartRef.current) / 1000

    if (isCorrect) {
      const newStreak = streakRef.current + 1
      streakRef.current = newStreak
      setStreak(newStreak)

      let points = POINTS_PER_HIT
      const isCritical = elapsed < 3
      if (isCritical) points += 5
      else if (elapsed < 5) points += 3
      else if (elapsed < 8) points += 1

      if (newStreak >= 5) points += STREAK_BONUS + 3
      else if (newStreak >= 3) points += STREAK_BONUS

      scoreRef.current += points
      setDisplayScore(scoreRef.current)
      setQuestionsCorrect(prev => prev + 1)

      // Damage to boss
      const dmg = isCritical ? 2 : 1
      const newBossHp = Math.max(0, bossHp - dmg)
      setBossHp(newBossHp)

      // Animations
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
        setTimeout(() => handleBossDefeated(), 500)
      } else {
        setTimeout(() => advanceQuestion(), 700)
      }
    } else {
      streakRef.current = 0
      setStreak(0)
      setFeedback('wrong')

      // Boss attacks pet
      const newPetHp = petHp - 1
      setPetHp(newPetHp)

      setBossAnim('attack')
      setTimeout(() => setBossAnim('idle'), 600)

      setPetAnim('hit')
      setTimeout(() => setPetAnim('idle'), 600)

      setPetDamagePopup({ text: currentBoss.attackName })
      setTimeout(() => setPetDamagePopup(null), 1200)

      shakeRef.current = 10
      setScreenShake(10)

      setWrongQuestions(prev => [...prev, { word: currentQ.choices[currentQ.answer_index], hint: currentQ.question }])

      playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)

      if (newPetHp <= 0) {
        setTimeout(() => {
          clearInterval(timerRef.current)
          setPhase('defeated')
        }, 800)
      } else {
        setTimeout(() => advanceQuestion(), 1000)
      }
    }
  }, [phase, currentQ, feedback, selectedChoice, bossHp, petHp, currentBoss, advanceQuestion, handleBossDefeated, playSound, spawnParticles])

  // Timeout: boss attacks if player doesn't answer in time
  useEffect(() => {
    if (phase !== 'playing' || feedback || !currentQ || qTimeLeft > 0) return
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

    setWrongQuestions(prev => [...prev, { word: currentQ.choices[currentQ.answer_index], hint: currentQ.question }])
    playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)

    if (newPetHp <= 0) {
      setTimeout(() => {
        clearInterval(timerRef.current)
        setPhase('defeated')
      }, 800)
    } else {
      setTimeout(() => advanceQuestion(), 1000)
    }
  }, [qTimeLeft, phase, feedback, currentQ, petHp, advanceQuestion, playSound])


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
    setBossIndex(0)
    setBossHp(BOSSES[0].hp)
    setPetHp(PET_MAX_HP)
    setBossAnim('idle')
    setPetAnim('idle')
    setBossesDefeated(0)
    setChestCollected(false)
    setChestPopup(false)
    chestSpawnedRef.current = false
    scoreRef.current = 0
    streakRef.current = 0
    setStreak(0)
    qStartRef.current = Date.now()

    setBossIntroName(BOSSES[0].name)
    setPhase('boss-intro')
    setTimeout(() => {
      setPhase('playing')
      startQTimer()
    }, 1800)

    try {
      const music = new Audio(assetUrl('/sound/pet-word-scamble-2-faster.mp3'))
      music.loop = true
      music.volume = 0.3
      bgMusicRef.current = music
      music.play().catch(() => {})
    } catch {}
  }, [questionBankProp, startQTimer])

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

  // Stop music on end phases
  useEffect(() => {
    if ((phase === 'results' || phase === 'victory' || phase === 'defeated') && bgMusicRef.current) {
      bgMusicRef.current.pause()
      bgMusicRef.current = null
    }
  }, [phase])

  // Play end-of-game sounds
  useEffect(() => {
    if (phase === 'results' || phase === 'victory') {
      playSound(assetUrl('/pet-game/angry/angry-birds-level-complete.mp3'), 0.5)
    }
    if (phase === 'defeated') {
      playSound(assetUrl('/sound/craft_fail.mp3'), 0.5)
    }
  }, [phase, playSound])

  // Cleanup
  useEffect(() => {
    return () => {
      if (bgMusicRef.current) { bgMusicRef.current.pause(); bgMusicRef.current = null }
      if (timerRef.current) clearInterval(timerRef.current)
      if (qTimerRef.current) clearInterval(qTimerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // Particle + shake animation loop
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'boss-intro' && phase !== 'victory') return
    const animate = () => {
      shakeRef.current = Math.max(0, shakeRef.current - 0.5)
      setScreenShake(shakeRef.current)
      setParticles(prev => prev
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.18, opacity: p.opacity - 0.018 }))
        .filter(p => p.opacity > 0)
      )
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [phase])

  const endPhase = phase === 'results' || phase === 'victory' || phase === 'defeated'
  const didWin = phase === 'victory'
  const didLose = phase === 'defeated'

  return createPortal(
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black/70 flex items-center justify-center">
      <style>{`
        @keyframes bbFloat { 0%, 100% { transform: translateY(-6px); } 50% { transform: translateY(6px); } }
        @keyframes bbPopIn { 0% { transform: scale(0); opacity: 0; } 70% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes bbBossHit { 0% { transform: scale(1) translateX(0); } 20% { transform: scale(0.9) translateX(15px); } 50% { transform: scale(1.05) translateX(-5px); } 100% { transform: scale(1) translateX(0); } }
        @keyframes bbBossAttack { 0% { transform: scale(1) translateX(0); } 30% { transform: scale(1.15) translateX(-30px); } 60% { transform: scale(1.1) translateX(-20px); } 100% { transform: scale(1) translateX(0); } }
        @keyframes bbBossDefeat { 0% { transform: scale(1) rotate(0deg); opacity: 1; } 50% { transform: scale(1.2) rotate(10deg); opacity: 0.7; } 100% { transform: scale(0) rotate(45deg); opacity: 0; } }
        @keyframes bbBossIdle { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.02); } }
        @keyframes bbPetAttack { 0% { transform: translateX(0) scale(1); } 30% { transform: translateX(40px) scale(1.1); } 100% { transform: translateX(0) scale(1); } }
        @keyframes bbPetCritical { 0% { transform: translateX(0) scale(1); } 20% { transform: translateX(60px) scale(1.2); } 40% { transform: translateX(30px) scale(1.15); } 100% { transform: translateX(0) scale(1); } }
        @keyframes bbPetHit { 0% { transform: translateX(0); } 20% { transform: translateX(-20px); } 40% { transform: translateX(10px); } 60% { transform: translateX(-5px); } 100% { transform: translateX(0); } }
        @keyframes bbSlash { 0% { clip-path: inset(0 100% 0 0); opacity: 1; } 40% { clip-path: inset(0 0 0 0); opacity: 1; } 100% { clip-path: inset(0 0 0 0); opacity: 0; } }
        @keyframes bbDmgPopup { 0% { transform: scale(0.5) translateY(0); opacity: 0; } 15% { transform: scale(1.2) translateY(0); opacity: 1; } 30% { transform: scale(1) translateY(0); } 100% { transform: scale(1) translateY(-70px); opacity: 0; } }
        @keyframes bbPetDmg { 0% { transform: scale(0.5) translateY(0); opacity: 0; } 15% { transform: scale(1.1) translateY(0); opacity: 1; } 30% { transform: scale(1) translateY(0); } 100% { transform: scale(1) translateY(-50px); opacity: 0; } }
        @keyframes bbCombo { 0% { transform: scale(1); } 50% { transform: scale(1.3); } 100% { transform: scale(1); } }
        @keyframes bbShake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(6px); } }
        @keyframes bbQuestionIn { 0% { opacity: 0; transform: translateY(12px) scale(0.95); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes bbResultsFade { 0% { opacity: 0; transform: translateY(30px) scale(0.9); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes bbScorePop { 0% { transform: scale(0); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }
        @keyframes bbTimerUrgent { 0%, 100% { transform: scale(1) rotate(0deg); } 15% { transform: scale(1.1) rotate(-3deg); } 30% { transform: scale(1) rotate(3deg); } 45% { transform: scale(1.05) rotate(-2deg); } 60% { transform: scale(1) rotate(0deg); } }
        @keyframes bbBossIntro { 0% { transform: scale(0) rotate(-20deg); opacity: 0; } 60% { transform: scale(1.2) rotate(5deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes bbIntroText { 0% { opacity: 0; transform: translateY(20px); } 30% { opacity: 1; transform: translateY(0); } }
        @keyframes bbHpDrain { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        @keyframes chestPopupAnim { 0% { transform: scale(0) translateY(0); opacity: 0; } 20% { transform: scale(1.2) translateY(0); opacity: 1; } 40% { transform: scale(1) translateY(0); opacity: 1; } 100% { transform: scale(1) translateY(-80px); opacity: 0; } }
        @keyframes bbSlideIn { 0% { opacity: 0; transform: translateX(20px); } 100% { opacity: 1; transform: translateX(0); } }
        @keyframes bbHeartLose { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.5; } 100% { transform: scale(0); opacity: 0; } }
        @keyframes bbVictoryPet { 0% { transform: translateY(0) scale(1); } 30% { transform: translateY(-30px) scale(1.1); } 60% { transform: translateY(-10px) scale(1.05); } 100% { transform: translateY(0) scale(1); } }
      `}</style>

      <div
        ref={containerRef}
        className={`relative w-full max-w-[400px] h-full max-h-[100dvh] overflow-hidden rounded-none sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl bg-gradient-to-b ${currentBoss.bg}`}
        style={{
          transform: screenShake > 0 ? `translate(${Math.sin(screenShake * 2) * 3}px, ${Math.cos(screenShake * 2) * 3}px)` : 'none',
        }}
      >
        {/* Decorative bg */}
        <div className="absolute top-[-10%] right-[-5%] w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute bottom-[-15%] left-[-10%] w-80 h-80 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute top-[40%] left-[60%] w-32 h-32 rounded-full bg-white/[0.03] pointer-events-none" />

        {/* Close */}
        {!endPhase && !hideClose && phase !== 'boss-intro' && (
          <button onClick={onClose} className="absolute top-4 left-4 z-50 bg-white/80 backdrop-blur rounded-full p-2 shadow-lg hover:bg-white transition-colors">
            <X className="w-6 h-6 text-gray-700" />
          </button>
        )}

        {/* ═══ READY PHASE ═══ */}
        {phase === 'ready' && (
          <div className="flex flex-col items-center gap-6 p-8 text-center h-full justify-center">
            <div className="flex items-center gap-4" style={{ animation: 'bbFloat 1.5s ease-in-out infinite' }}>
              {petImageUrl ? (
                <img src={petImageUrl} alt={petName} className="w-20 h-20 object-contain drop-shadow-lg"
                  onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = '' }}
                />
              ) : null}
              <span className="text-6xl" style={{ display: petImageUrl ? 'none' : '' }}>🐾</span>
              <Swords className="w-10 h-10 text-yellow-400 mx-2" />
              <span className="text-6xl">👾</span>
            </div>

            <div>
              <h2 className="text-3xl font-black text-white mb-2" style={{ textShadow: '0 2px 0 rgba(0,0,0,0.3)' }}>
                Boss Battle
              </h2>
              <p className="text-lg text-white/80 mb-1">Answer to attack!</p>
              <p className="text-sm text-white/60">Defeat {BOSSES.length} bosses with {petName}!</p>
            </div>

            <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 w-full max-w-xs text-left">
              <p className="text-xs font-bold text-yellow-300 mb-2 text-center">Bosses</p>
              {BOSSES.map((boss, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-white/80 py-1">
                  <img src={boss.img} alt={boss.name} className="w-7 h-7 object-contain" />
                  <span className="font-semibold">{boss.name}</span>
                  <span className="ml-auto text-xs text-white/50">{boss.hp} HP</span>
                </div>
              ))}
            </div>

            {leaderboard.length > 0 && (
              <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 w-full max-w-xs">
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
              className="px-10 py-4 bg-white text-red-600 rounded-full font-bold text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform border-b-4 border-red-200"
            >
              Fight!
            </button>
          </div>
        )}

        {/* ═══ BOSS INTRO ═══ */}
        {phase === 'boss-intro' && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div style={{ animation: 'bbBossIntro 0.8s ease-out' }}>
              <img src={(BOSSES.find(b => b.name === bossIntroName) || currentBoss).img} alt="" className="w-32 h-32 object-contain" />
            </div>
            <div style={{ animation: 'bbIntroText 0.6s ease-out 0.3s both' }}>
              <p className="text-white/60 text-sm font-bold uppercase tracking-widest">Boss {bossIndex + 1}</p>
              <h2 className="text-4xl font-black text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                {bossIntroName}
              </h2>
              <p className="text-white/50 text-sm mt-1">HP: {currentBoss.hp}</p>
            </div>
          </div>
        )}

        {/* ═══ PLAYING PHASE ═══ */}
        {phase === 'playing' && currentQ && (
          <div className="w-full h-full relative flex flex-col">

            {/* Particles */}
            {particles.map(p => (
              <div key={p.id} className="absolute rounded-full pointer-events-none z-30"
                style={{ left: `${p.x}px`, top: `${p.y}px`, width: `${p.size}px`, height: `${p.size}px`, backgroundColor: p.color, opacity: p.opacity, transform: 'translate(-50%, -50%)' }}
              />
            ))}

            {/* TOP HUD */}
            <div className="px-4 pt-3 pb-1 z-10">
              <div className="w-full max-w-md mx-auto flex items-center justify-between">
                {/* Score */}
                <div className="flex flex-col items-start ml-10">
                  <div className="bg-white/20 backdrop-blur rounded-2xl px-3 py-1.5 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-lg font-black text-white">{displayScore}</span>
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
                      style={{ animation: displayTime <= 5 ? 'bbTimerUrgent 0.5s ease-in-out infinite' : displayTime <= 10 ? 'bbTimerUrgent 1s ease-in-out infinite' : 'none' }}
                    >
                      <svg width="52" height="52" className="drop-shadow-lg" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="26" cy="26" r={radius} fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
                        <circle cx="26" cy="26" r={radius} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
                          strokeDasharray={circumference} strokeDashoffset={offset}
                          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                        />
                      </svg>
                      <span className="absolute font-black text-white" style={{ fontSize: displayTime < 10 ? '17px' : '15px', textShadow: `0 0 8px ${color}80` }}>{displayTime}</span>
                    </div>
                  )
                })()}

                {/* Mute */}
                <button onClick={() => {
                  setMuted(prev => {
                    const next = !prev
                    if (bgMusicRef.current) bgMusicRef.current.muted = next
                    return next
                  })
                }} className="bg-white/20 backdrop-blur rounded-full p-1.5">
                  {muted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
                </button>
              </div>

              {/* Streak + correct count */}
              <div className="w-full max-w-md mx-auto flex items-center gap-2 mt-2">
                <div className={`rounded-full px-2.5 py-1 text-xs font-bold flex items-center gap-1 shrink-0 ${
                  streak >= 3 ? 'bg-yellow-400 text-yellow-900' : 'bg-white/20 text-white/70'
                }`} style={comboAnim ? { animation: 'bbCombo 0.4s ease-out' } : {}}>
                  <img src={assetUrl('/icon/profile/streak.svg')} alt="streak" className="w-3.5 h-3.5" />{streak}x
                </div>
                <div className="bg-white/10 rounded-full px-2.5 py-1 text-xs font-semibold text-white/70">
                  {questionsCorrect} hits
                </div>
                <div className="bg-white/10 rounded-full px-2.5 py-1 text-xs font-semibold text-white/70 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Boss {bossIndex + 1}/{BOSSES.length}
                </div>
              </div>
            </div>

            {/* BATTLE ARENA */}
            <div className="flex-shrink-0 px-4 pt-2 pb-1">
              <div className="relative flex items-end justify-between w-full max-w-xs mx-auto" style={{ height: '140px' }}>

                {/* Pet side */}
                <div className="flex flex-col items-center gap-1 z-10">
                  {/* Pet HP */}
                  <div className="flex gap-0.5">
                    {Array.from({ length: PET_MAX_HP }).map((_, i) => (
                      <Heart key={i} className={`w-4 h-4 transition-all ${i < petHp ? 'text-red-400 fill-red-400' : 'text-gray-600/40'}`}
                        style={i === petHp ? { animation: 'bbHeartLose 0.5s ease-out' } : {}}
                      />
                    ))}
                  </div>
                  <div style={{
                    animation: petAnim === 'attack' ? 'bbPetAttack 0.5s ease-out' :
                      petAnim === 'critical' ? 'bbPetCritical 0.6s ease-out' :
                      petAnim === 'hit' ? 'bbPetHit 0.5s ease-out' : 'none'
                  }}>
                    {petImageUrl ? (
                      <img src={petImageUrl} alt={petName} className="w-16 h-16 object-contain drop-shadow-lg"
                        style={{ filter: petAnim === 'hit' ? 'brightness(2) saturate(0)' : 'none', transition: 'filter 0.15s' }}
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <span className="text-5xl">🐾</span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-white/70 truncate max-w-[80px]">{petName}</span>

                  {/* Pet damage popup */}
                  {petDamagePopup && (
                    <div className="absolute -top-2 left-0 z-20 pointer-events-none" style={{ animation: 'bbPetDmg 1.2s ease-out forwards' }}>
                      <div className="text-sm font-bold text-red-400 whitespace-nowrap">{petDamagePopup.text}!</div>
                    </div>
                  )}
                </div>

                {/* Slash effect */}
                {slashEffect && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none" style={{ animation: 'bbSlash 0.4s ease-out forwards' }}>
                    <svg width="120" height="60" viewBox="0 0 120 60">
                      <line x1="10" y1="50" x2="110" y2="10" stroke="#facc15" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
                      <line x1="5" y1="35" x2="115" y2="25" stroke="#fde68a" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                      <line x1="20" y1="55" x2="100" y2="5" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
                    </svg>
                  </div>
                )}

                {/* Boss side */}
                <div className="flex flex-col items-center gap-1 z-10">
                  {/* Boss HP bar */}
                  <div className="w-24">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-bold text-white/60">{currentBoss.name}</span>
                      <span className="text-[10px] font-bold text-white/80">{bossHp}/{currentBoss.hp}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-black/30 overflow-hidden border border-white/10">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(bossHp / currentBoss.hp) * 100}%`,
                          background: bossHp <= currentBoss.hp * 0.3
                            ? 'linear-gradient(90deg, #ef4444, #f87171)'
                            : bossHp <= currentBoss.hp * 0.6
                            ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                            : `linear-gradient(90deg, ${currentBoss.color}, ${currentBoss.color}dd)`,
                          animation: bossHp <= currentBoss.hp * 0.3 ? 'bbHpDrain 0.5s ease-in-out infinite' : 'none',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{
                    animation: bossAnim === 'hit' ? 'bbBossHit 0.5s ease-out' :
                      bossAnim === 'attack' ? 'bbBossAttack 0.6s ease-out' :
                      bossAnim === 'defeated' ? 'bbBossDefeat 0.8s ease-out forwards' :
                      'bbBossIdle 2s ease-in-out infinite'
                  }}>
                    <img src={currentBoss.img} alt={currentBoss.name} className="w-20 h-20 object-contain drop-shadow-lg" />
                  </div>

                  {/* Boss damage popup */}
                  {damagePopup && (
                    <div className="absolute -top-2 right-0 z-20 pointer-events-none" style={{ animation: 'bbDmgPopup 1.2s ease-out forwards' }}>
                      <div className={`flex flex-col items-center gap-0.5 ${damagePopup.isCritical ? 'text-yellow-300' : 'text-white'}`}>
                        <div className={`font-black drop-shadow-lg ${damagePopup.isCritical ? 'text-3xl' : 'text-2xl'}`}>
                          -{damagePopup.dmg}
                        </div>
                        {damagePopup.isCritical && (
                          <div className="bg-yellow-400 text-yellow-900 rounded-full px-2 py-0.5 text-[10px] font-bold">
                            CRITICAL!
                          </div>
                        )}
                        <div className="text-sm font-bold text-green-400">+{damagePopup.points} pts</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Chest popup */}
            {chestPopup && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-2" style={{ animation: 'chestPopupAnim 1.5s ease-out forwards' }}>
                  <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-16 h-16 object-contain" />
                  <div className="bg-amber-500 text-white rounded-full px-4 py-1.5 font-bold text-sm shadow-lg">Chest Found!</div>
                </div>
              </div>
            )}

            {/* QUESTION + CHOICES */}
            <div className="flex-1 flex flex-col items-center justify-start pt-2 px-5 gap-3 relative overflow-y-auto">

              {/* Category badge */}
              {currentQ.category && (
                <div className={`rounded-full px-3 py-1 text-xs font-bold ${CATEGORY_COLORS[currentQ.category]?.bg || 'bg-white/20'} ${CATEGORY_COLORS[currentQ.category]?.text || 'text-white/70'}`}
                  style={{ animation: 'bbSlideIn 0.3s ease-out' }}
                >
                  {CATEGORY_COLORS[currentQ.category]?.label || currentQ.category}
                </div>
              )}

              {/* Question card */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl px-5 py-4 w-full max-w-xs text-center border border-white/20"
                key={qIndex}
                style={{ animation: 'bbQuestionIn 0.3s ease-out' }}
              >
                <p className="text-lg font-bold text-white leading-snug" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                  {currentQ.question}
                </p>
                {currentQ.image_url && (
                  <img src={currentQ.image_url} alt="" className="w-14 h-14 object-contain mx-auto mt-2 rounded-lg" />
                )}
                {/* Question countdown bar */}
                <div className="mt-3 w-full h-2 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-100"
                    style={{
                      width: `${(qTimeLeft / QUESTION_TIME_LIMIT) * 100}%`,
                      background: qTimeLeft <= 1.5 ? '#ef4444' : qTimeLeft <= 3 ? '#f59e0b' : '#22c55e',
                    }}
                  />
                </div>
              </div>

              {/* Choices */}
              <div className="w-full max-w-xs flex flex-col gap-2"
                style={feedback === 'wrong' || feedback === 'timeout' ? { animation: 'bbShake 0.4s ease-out' } : {}}
              >
                {shuffledChoices.map((choice, i) => {
                  const isSelected = selectedChoice === choice.originalIndex
                  const isCorrectAnswer = choice.originalIndex === currentQ.answer_index
                  const showResult = feedback !== null

                  let btnBg = 'bg-white/15 border-white/30 text-white hover:bg-white/25 active:scale-[0.97]'
                  if (showResult && isCorrectAnswer) {
                    btnBg = 'bg-green-400/80 border-green-400 text-white'
                  } else if (showResult && isSelected && !isCorrectAnswer) {
                    btnBg = 'bg-red-400/80 border-red-400 text-white'
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => handleChoice(choice.originalIndex)}
                      disabled={feedback !== null}
                      className={`w-full py-2.5 px-4 rounded-xl border-2 font-semibold text-left transition-all flex items-center gap-3 ${btnBg}`}
                      style={showResult && isCorrectAnswer ? { animation: 'qrCorrect 0.4s ease-out' } : {}}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        showResult && isCorrectAnswer ? 'bg-green-600 text-white' :
                        showResult && isSelected ? 'bg-red-600 text-white' :
                        'bg-white/20 text-white/80'
                      }`}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-sm">{choice.text}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══ END PHASES (victory / defeated / results) ═══ */}
        {endPhase && (
          <div className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto p-6 z-50">
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center my-auto"
              style={{ animation: 'bbResultsFade 0.5s ease-out' }}
            >
              {/* Icon */}
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4"
                style={{ animation: 'bbScorePop 0.6s ease-out 0.3s both', backgroundColor: didWin ? '#f0fdf4' : didLose ? '#fef2f2' : '#f5f3ff' }}
              >
                {didWin ? (
                  <Trophy className="w-10 h-10 text-yellow-500" />
                ) : didLose ? (
                  <Heart className="w-10 h-10 text-red-400" />
                ) : (
                  <Trophy className="w-10 h-10 text-violet-500" />
                )}
              </div>

              <h2 className="text-2xl font-bold text-gray-800 mb-1">
                {didWin ? 'Victory!' : didLose ? 'Defeated!' : 'Time\'s Up!'}
              </h2>
              <p className="text-gray-500 mb-4">
                {didWin
                  ? `${petName} defeated all ${BOSSES.length} bosses!`
                  : didLose
                  ? `${petName} was defeated by ${currentBoss.name}...`
                  : `${petName} defeated ${bossesDefeated} boss${bossesDefeated !== 1 ? 'es' : ''}`}
              </p>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100" style={{ animation: 'bbScorePop 0.5s ease-out 0.4s both' }}>
                  <p className="text-2xl font-black text-violet-600">{displayScore}</p>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Score</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100" style={{ animation: 'bbScorePop 0.5s ease-out 0.5s both' }}>
                  <p className="text-2xl font-black text-green-600">{questionsCorrect}</p>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Hits</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100" style={{ animation: 'bbScorePop 0.5s ease-out 0.6s both' }}>
                  <p className="text-2xl font-black text-red-500">{bossesDefeated}</p>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Bosses</p>
                </div>
              </div>

              {/* Bosses defeated visual */}
              <div className="flex items-center justify-center gap-3 mb-4">
                {BOSSES.map((boss, i) => (
                  <div key={i} className={`flex flex-col items-center gap-1 ${i < bossesDefeated ? 'opacity-100' : 'opacity-30'}`}>
                    <img src={boss.img} alt={boss.name} className="w-8 h-8 object-contain" />
                    {i < bossesDefeated ? (
                      <span className="text-[10px] font-bold text-green-500">✓</span>
                    ) : i === bossIndex && !didWin ? (
                      <span className="text-[10px] font-bold text-red-400">✗</span>
                    ) : (
                      <span className="text-[10px] font-bold text-gray-300">—</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Wrong questions */}
              {wrongQuestions.length > 0 && (
                <div className="mb-4 text-left">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">Questions to Review</p>
                  <div className="max-h-[140px] overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {wrongQuestions.map((w, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2">
                        <span className="font-bold text-sm text-green-600">{w.word}</span>
                        <span className="text-xs text-gray-400 ml-auto truncate max-w-[160px]">{w.hint}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {chestCollected && (
                <div className="mb-4 flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-8 h-8 object-contain" />
                  <span className="font-bold text-amber-700">Chest collected!</span>
                </div>
              )}

              <p className="text-sm text-gray-600 mb-5">
                {didWin ? 'Champion! All bosses defeated!' :
                  questionsCorrect >= 10 ? 'Great battle!' :
                  'Need at least 10 correct hits to earn XP. Try again!'}
              </p>

              {(didWin || questionsCorrect >= 10) ? (
                <button
                  onClick={() => onGameEnd(displayScore, { chestCollected, wordsCompleted: questionsCorrect, bossesDefeated })}
                  className="w-full py-3.5 bg-gradient-to-b from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-violet-700 active:border-b-0 active:mt-1 transition-all"
                >
                  Collect Rewards
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { setPhase('ready'); setDisplayScore(0) }}
                    className="w-full py-3.5 bg-gradient-to-b from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-violet-700 active:border-b-0 active:mt-1 transition-all"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={onClose}
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
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

export default PetQuizBossBattle
