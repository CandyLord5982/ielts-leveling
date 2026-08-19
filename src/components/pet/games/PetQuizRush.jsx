import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Trophy, Volume2, VolumeX, Heart } from 'lucide-react'
import { assetUrl } from '../../../hooks/useBranding'

const GAME_DURATION = 76
const PET_MAX_HP = 5
const POINTS_PER_Q = 10
const STREAK_BONUS = 5
const QUESTION_TIME_LIMIT = 5

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const pickQuestions = (source) => shuffle(source).slice(0, 20)

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

const PetQuizRush = ({ petImageUrl, petName, onGameEnd, onClose, questionBank: questionBankProp = [], hideClose = false, scoreToBeat = null, leaderboard = [], chestEnabled = false }) => {
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
  const [wrongQuestions, setWrongQuestions] = useState([])
  const [muted, setMuted] = useState(false)
  const [wordPopup, setWordPopup] = useState(null)
  const [screenShake, setScreenShake] = useState(0)
  const [particles, setParticles] = useState([])
  const [chestCollected, setChestCollected] = useState(false)
  const [chestPopup, setChestPopup] = useState(false)
  const [isChestQ, setIsChestQ] = useState(false)
  const [chestTimer, setChestTimer] = useState(0)
  const [comboAnim, setComboAnim] = useState(false)
  const [petHp, setPetHp] = useState(PET_MAX_HP)

  const scoreRef = useRef(0)
  const timerRef = useRef(null)
  const streakRef = useRef(0)
  const audioCache = useRef({})
  const containerRef = useRef(null)
  const bgMusicRef = useRef(null)
  const animFrameRef = useRef(null)
  const shakeRef = useRef(0)
  const chestSpawnedRef = useRef(false)
  const chestQRef = useRef(0)
  const qStartRef = useRef(Date.now())
  const qTimerRef = useRef(null)
  const [qTimeLeft, setQTimeLeft] = useState(QUESTION_TIME_LIMIT)
  const uidRef = useRef(0)
  const uid = () => ++uidRef.current

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

  const currentQ = questions[qIndex]

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

      let points = POINTS_PER_Q
      if (newStreak >= 5) points += STREAK_BONUS + 3
      else if (newStreak >= 3) points += STREAK_BONUS

      // Speed bonus
      if (elapsed < 3) points += 5
      else if (elapsed < 5) points += 3
      else if (elapsed < 8) points += 1

      scoreRef.current += points
      setDisplayScore(scoreRef.current)
      setQuestionsCorrect(prev => prev + 1)

      if (chestEnabled && !chestSpawnedRef.current && questionsCorrect + 1 >= chestQRef.current) {
        chestSpawnedRef.current = true
        setChestCollected(true)
        setIsChestQ(false)
        setChestTimer(0)
        setChestPopup(true)
        setTimeout(() => setChestPopup(false), 1500)
      }

      setFeedback('correct')
      setWordPopup({ points, streak: newStreak })
      setTimeout(() => setWordPopup(null), 1200)

      if (newStreak >= 3) {
        setComboAnim(true)
        setTimeout(() => setComboAnim(false), 600)
      }

      // Particles
      const colors = ['#a78bfa', '#f472b6', '#facc15', '#34d399', '#60a5fa']
      const celebParticles = Array.from({ length: 12 }, (_, i) => ({
        id: `p-${uid()}`,
        x: (containerRef.current?.clientWidth || 400) / 2 + (Math.random() - 0.5) * 100,
        y: (containerRef.current?.clientHeight || 700) * 0.4,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: 1,
      }))
      setParticles(prev => [...prev, ...celebParticles])

      playSound(assetUrl('/sound/scram-correct.mp3'), 0.4)
      setTimeout(() => advanceQuestion(), 700)
    } else {
      streakRef.current = 0
      setStreak(0)
      setFeedback('wrong')
      shakeRef.current = 10
      setScreenShake(10)

      setWrongQuestions(prev => [...prev, { word: currentQ.choices[currentQ.answer_index], hint: currentQ.question }])

      const newPetHp = petHp - 1
      setPetHp(newPetHp)

      playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)

      if (newPetHp <= 0) {
        setTimeout(() => {
          clearInterval(timerRef.current)
          setPhase('defeated')
        }, 800)
        return
      }

      setTimeout(() => advanceQuestion(), 1200)
    }
  }, [phase, currentQ, feedback, selectedChoice, advanceQuestion, questionsCorrect, chestEnabled, playSound])

  // Timeout: wrong answer if player doesn't answer in time
  useEffect(() => {
    if (phase !== 'playing' || feedback || !currentQ || qTimeLeft > 0) return
    clearInterval(qTimerRef.current)

    streakRef.current = 0
    setStreak(0)
    setFeedback('timeout')
    shakeRef.current = 10
    setScreenShake(10)

    setWrongQuestions(prev => [...prev, { word: currentQ.choices[currentQ.answer_index], hint: currentQ.question }])

    const newPetHp = petHp - 1
    setPetHp(newPetHp)

    playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)

    if (newPetHp <= 0) {
      setTimeout(() => {
        clearInterval(timerRef.current)
        setPhase('defeated')
      }, 800)
    } else {
      setTimeout(() => advanceQuestion(), 1200)
    }
  }, [qTimeLeft, phase, feedback, currentQ, advanceQuestion, playSound, petHp])

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

    scoreRef.current = 0
    streakRef.current = 0
    setStreak(0)
    setPetHp(PET_MAX_HP)
    chestSpawnedRef.current = false
    chestQRef.current = 3 + Math.floor(Math.random() * 5)
    setChestCollected(false)
    setChestPopup(false)
    setIsChestQ(false)
    setChestTimer(0)
    qStartRef.current = Date.now()
    setPhase('playing')
    startQTimer()

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

  // Chest timer
  useEffect(() => {
    if (phase === 'playing' && chestEnabled && !chestSpawnedRef.current && questionsCorrect >= chestQRef.current - 1) {
      setIsChestQ(true)
      setChestTimer(5)
    }
  }, [phase, questionsCorrect, chestEnabled])

  useEffect(() => {
    if (chestTimer <= 0) return
    const interval = setInterval(() => {
      setChestTimer(prev => {
        if (prev <= 1) {
          chestSpawnedRef.current = true
          setIsChestQ(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [chestTimer])

  // Stop music on results
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

  // Cleanup
  useEffect(() => {
    return () => {
      if (bgMusicRef.current) { bgMusicRef.current.pause(); bgMusicRef.current = null }
      if (timerRef.current) clearInterval(timerRef.current)
      if (qTimerRef.current) clearInterval(qTimerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // Particle + shake animation
  useEffect(() => {
    if (phase !== 'playing') return
    const animate = () => {
      shakeRef.current = Math.max(0, shakeRef.current - 0.5)
      setScreenShake(shakeRef.current)
      setParticles(prev => prev
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.15, opacity: p.opacity - 0.02 }))
        .filter(p => p.opacity > 0)
      )
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [phase])

  return createPortal(
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black/70 flex items-center justify-center">
      <style>{`
        @keyframes qrPopIn {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes qrCorrect {
          0% { transform: scale(1); }
          50% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        @keyframes qrShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        @keyframes qrFloat {
          0%, 100% { transform: translateY(-4px); }
          50% { transform: translateY(4px); }
        }
        @keyframes qrResultsFadeIn {
          0% { opacity: 0; transform: translateY(30px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes qrScorePopIn {
          0% { transform: scale(0); }
          70% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes qrWordPopup {
          0% { transform: scale(0.5) translateY(0); opacity: 0; }
          15% { transform: scale(1.1) translateY(0); opacity: 1; }
          30% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(-60px); opacity: 0; }
        }
        @keyframes qrTimerUrgent {
          0%, 100% { transform: scale(1) rotate(0deg); }
          15% { transform: scale(1.1) rotate(-3deg); }
          30% { transform: scale(1) rotate(3deg); }
          45% { transform: scale(1.05) rotate(-2deg); }
          60% { transform: scale(1) rotate(0deg); }
        }
        @keyframes qrCombo {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes qrSlideIn {
          0% { opacity: 0; transform: translateX(20px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes chestPopupAnim {
          0% { transform: scale(0) translateY(0); opacity: 0; }
          20% { transform: scale(1.2) translateY(0); opacity: 1; }
          40% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(-80px); opacity: 0; }
        }
        @keyframes qrQuestionIn {
          0% { opacity: 0; transform: translateY(15px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bbHeartLose {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
          100% { transform: scale(0); opacity: 0; }
        }
      `}</style>

      <div
        ref={containerRef}
        className="relative w-full max-w-[400px] h-full max-h-[100dvh] overflow-hidden rounded-none sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 40%, #0ea5e9 100%)',
          transform: screenShake > 0 ? `translate(${Math.sin(screenShake * 2) * 3}px, ${Math.cos(screenShake * 2) * 3}px)` : 'none',
        }}
      >

      {/* Decorative bg */}
      <div className="absolute top-[-10%] right-[-5%] w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[-10%] w-80 h-80 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute top-[30%] left-[50%] w-40 h-40 rounded-full bg-white/[0.03] pointer-events-none" />

      {/* Close */}
      {phase !== 'results' && phase !== 'defeated' && !hideClose && (
        <button onClick={onClose} className="absolute top-4 left-4 z-50 bg-white/80 backdrop-blur rounded-full p-2 shadow-lg hover:bg-white transition-colors">
          <X className="w-6 h-6 text-gray-700" />
        </button>
      )}

      {/* ═══ READY PHASE ═══ */}
      {phase === 'ready' && (
        <div className="flex flex-col items-center gap-6 p-8 text-center h-full justify-center">
          <div className="flex items-center gap-4" style={{ animation: 'qrFloat 1.5s ease-in-out infinite' }}>
            {petImageUrl ? (
              <img src={petImageUrl} alt={petName} className="w-24 h-24 object-contain drop-shadow-lg"
                onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = '' }}
              />
            ) : null}
            <span className="text-7xl" style={{ display: petImageUrl ? 'none' : '' }}>🧠</span>
          </div>

          <div>
            <h2 className="text-3xl font-black text-white mb-2" style={{ textShadow: '0 2px 0 rgba(0,0,0,0.2)' }}>
              Quiz Rush
            </h2>
            <p className="text-lg text-white/80 mb-1">Answer fast, score big!</p>
            <p className="text-sm text-white/60">Test {petName}'s knowledge!</p>
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
            className="px-10 py-4 bg-white text-violet-700 rounded-full font-bold text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform border-b-4 border-violet-200"
          >
            Start!
          </button>
        </div>
      )}

      {/* ═══ PLAYING PHASE ═══ */}
      {phase === 'playing' && currentQ && (
        <div className="w-full h-full relative flex flex-col">

          {/* Particles */}
          {particles.map(p => (
            <div key={p.id} className="absolute w-3 h-3 rounded-full pointer-events-none z-30"
              style={{ left: `${p.x}px`, top: `${p.y}px`, backgroundColor: p.color, opacity: p.opacity, transform: 'translate(-50%, -50%)' }}
            />
          ))}

          {/* TOP HUD */}
          <div className="px-4 pt-3 pb-1 z-10">
            <div className="w-full max-w-md mx-auto flex flex-col items-center gap-2">
              <div className="w-full flex items-center justify-between">
                {/* Score */}
                <div className="flex flex-col items-start gap-1 ml-10">
                  <div className="bg-white/20 backdrop-blur rounded-2xl px-4 py-2 flex items-center gap-2">
                    <span className="text-xl font-black text-white">{displayScore}</span>
                  </div>
                  {/* Score-to-beat */}
                  {(() => {
                    const nextToBeat = leaderboard.length > 0
                      ? [...leaderboard].reverse().find(e => e.score > displayScore) || null
                      : scoreToBeat
                    if (!nextToBeat) return null
                    const gap = nextToBeat.score - displayScore
                    const isClose = gap > 0 && gap <= 3
                    const pct = Math.min(100, Math.round((displayScore / nextToBeat.score) * 100))
                    return (
                      <div className="w-28 ml-1">
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

                {/* Pet + HP */}
                <div className="flex flex-col items-center gap-0.5">
                  {petImageUrl && (
                    <img src={petImageUrl} alt={petName} className="w-10 h-10 object-contain drop-shadow-md"
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

                {/* Timer */}
                {(() => {
                  const pct = displayTime / GAME_DURATION
                  const radius = 22
                  const circumference = 2 * Math.PI * radius
                  const offset = circumference * (1 - pct)
                  const color = displayTime <= 5 ? '#ef4444' : displayTime <= 10 ? '#f97316' : displayTime <= 20 ? '#eab308' : '#22c55e'
                  return (
                    <div className="relative flex items-center justify-center"
                      style={{ animation: displayTime <= 5 ? 'qrTimerUrgent 0.5s ease-in-out infinite' : displayTime <= 10 ? 'qrTimerUrgent 1s ease-in-out infinite' : 'none' }}
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
                      >{displayTime}</span>
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

              {/* Streak + Questions answered */}
              <div className="w-full flex items-center gap-2">
                <div className={`rounded-full px-2.5 py-1 text-xs font-bold flex items-center gap-1 shrink-0 ${
                  streak >= 3 ? 'bg-yellow-400 text-yellow-900' : 'bg-white/20 text-white/70'
                }`} style={comboAnim ? { animation: 'qrCombo 0.4s ease-out' } : {}}>
                  <img src={assetUrl('/icon/profile/streak.svg')} alt="streak" className="w-3.5 h-3.5" />{streak}x
                </div>
                <div className="bg-white/10 rounded-full px-2.5 py-1 text-xs font-semibold text-white/70">
                  {questionsCorrect} correct
                </div>
              </div>
            </div>
          </div>

          {/* CENTER: Question + Choices */}
          <div className="flex-1 flex flex-col items-center justify-start pt-4 px-5 gap-4 relative">

            {/* Points popup */}
            {wordPopup && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-1" style={{ animation: 'qrWordPopup 1.2s ease-out forwards' }}>
                  <div className="text-3xl font-black text-white drop-shadow-lg">+{wordPopup.points}</div>
                  {wordPopup.streak > 1 && (
                    <div className="flex items-center gap-1 bg-yellow-400 text-yellow-900 rounded-full px-3 py-1 text-sm font-bold">
                      <img src={assetUrl('/icon/profile/streak.svg')} alt="streak" className="w-4 h-4" />{wordPopup.streak}x streak
                    </div>
                  )}
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

            {/* Chest indicator */}
            {isChestQ && (
              <div className="flex items-center gap-2 bg-amber-500/30 border border-amber-400/50 rounded-full px-3 py-1">
                <img src={assetUrl('/image/chest/legendary-chest.png')} alt="chest" className="w-5 h-5 object-contain" />
                <span className="text-amber-200 text-xs font-bold">Chest! {chestTimer}s</span>
              </div>
            )}

            {/* Category badge */}
            {currentQ.category && (
              <div className={`rounded-full px-3 py-1 text-xs font-bold ${CATEGORY_COLORS[currentQ.category]?.bg || 'bg-white/20'} ${CATEGORY_COLORS[currentQ.category]?.text || 'text-white/70'}`}
                style={{ animation: 'qrSlideIn 0.3s ease-out' }}
              >
                {CATEGORY_COLORS[currentQ.category]?.label || currentQ.category}
              </div>
            )}

            {/* Question card */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-5 py-5 w-full max-w-xs text-center border border-white/20"
              key={qIndex}
              style={{ animation: 'qrQuestionIn 0.3s ease-out' }}
            >
              <p className="text-xl font-bold text-white leading-snug" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                {currentQ.question}
              </p>
              {currentQ.image_url && (
                <img src={currentQ.image_url} alt="" className="w-16 h-16 object-contain mx-auto mt-3 rounded-lg" />
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
            <div className="w-full max-w-xs flex flex-col gap-2.5"
              style={feedback === 'wrong' || feedback === 'timeout' ? { animation: 'qrShake 0.4s ease-out' } : {}}
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
                    className={`w-full py-3 px-4 rounded-xl border-2 font-semibold text-left transition-all flex items-center gap-3 ${btnBg}`}
                    style={showResult && isCorrectAnswer ? { animation: 'qrCorrect 0.4s ease-out' } : {}}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      showResult && isCorrectAnswer ? 'bg-green-600 text-white' :
                      showResult && isSelected ? 'bg-red-600 text-white' :
                      'bg-white/20 text-white/80'
                    }`}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-base">{choice.text}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ DEFEATED PHASE ═══ */}
      {phase === 'defeated' && (
        <div className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto p-6 z-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center my-auto"
            style={{ animation: 'qrResultsFadeIn 0.5s ease-out' }}
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-4"
              style={{ animation: 'qrScorePopIn 0.6s ease-out 0.3s both' }}
            >
              <Heart className="w-10 h-10 text-red-400" />
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-1">Defeated!</h2>
            <p className="text-gray-500 mb-5">{petName} ran out of lives!</p>

            <div className="rounded-2xl p-5 mb-5 border bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200"
              style={{ animation: 'qrScorePopIn 0.6s ease-out 0.5s both' }}
            >
              <p className="text-5xl font-black text-gray-400">{questionsCorrect}</p>
              <p className="text-sm font-semibold mt-1 text-gray-400">questions correct</p>
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

            <p className="text-sm text-gray-600 mb-6">Try to keep your lives! Wrong answers cost a heart.</p>

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
          </div>
        </div>
      )}

      {/* ═══ RESULTS PHASE ═══ */}
      {phase === 'results' && (
        <div className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto p-6 z-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center my-auto"
            style={{ animation: 'qrResultsFadeIn 0.5s ease-out' }}
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-violet-100 mb-4"
              style={{ animation: 'qrScorePopIn 0.6s ease-out 0.3s both' }}
            >
              <Trophy className="w-10 h-10 text-violet-500" />
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-1">
              {questionsCorrect >= 10 ? 'Quiz Complete!' : 'Not Enough Answers!'}
            </h2>
            <p className="text-gray-500 mb-5">
              {questionsCorrect >= 10
                ? `${petName} answered ${questionsCorrect} questions!`
                : `${petName} only answered ${questionsCorrect}/10 correctly`}
            </p>

            <div className={`rounded-2xl p-5 mb-5 border ${questionsCorrect >= 10 ? 'bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}
              style={{ animation: 'qrScorePopIn 0.6s ease-out 0.5s both' }}
            >
              <p className={`text-5xl font-black ${questionsCorrect >= 10 ? 'text-violet-600' : 'text-gray-400'}`}>{questionsCorrect}</p>
              <p className={`text-sm font-semibold mt-1 ${questionsCorrect >= 10 ? 'text-violet-400' : 'text-gray-400'}`}>questions correct</p>
            </div>

            {/* Wrong questions to review */}
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
              {questionsCorrect >= 15 ? 'Quiz master!' : questionsCorrect >= 10 ? 'Great knowledge!' : 'Need at least 10 correct answers to earn XP. Try again!'}
            </p>

            {chestCollected && (
              <div className="mb-4 flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                <img src={assetUrl('/image/chest/legendary-chest.png')} alt="Chest" className="w-8 h-8 object-contain" />
                <span className="font-bold text-amber-700">Chest collected!</span>
              </div>
            )}

            {questionsCorrect >= 10 ? (
              <button
                onClick={() => onGameEnd(displayScore, { chestCollected, wordsCompleted: questionsCorrect })}
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

export default PetQuizRush
