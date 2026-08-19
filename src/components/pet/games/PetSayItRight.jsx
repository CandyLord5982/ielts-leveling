import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Trophy, Mic, Square, Loader2, Heart } from 'lucide-react'

import { assetUrl } from '../../../hooks/useBranding'

const ASSEMBLYAI_KEY = import.meta.env.VITE_ASSEMBLYAI_API_KEY || ''

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Transcribe audio directly via AssemblyAI API
const transcribeAudio = async (audioBlob) => {
  // If we have a client-side key, go direct (local dev)
  // Otherwise try the server proxy (production)
  if (!ASSEMBLYAI_KEY) {
    const proxyRes = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
      body: audioBlob,
    })
    if (!proxyRes.ok) throw new Error('Transcription failed')
    return await proxyRes.json()
  }

  // Step 1: Upload
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      'Authorization': ASSEMBLYAI_KEY,
      'Content-Type': 'application/octet-stream',
    },
    body: audioBlob,
  })
  if (!uploadRes.ok) throw new Error('Upload failed')
  const { upload_url } = await uploadRes.json()

  // Step 2: Create transcript
  const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      'Authorization': ASSEMBLYAI_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ audio_url: upload_url, language_code: 'en_us' }),
  })
  if (!transcriptRes.ok) throw new Error('Transcript creation failed')
  const { id } = await transcriptRes.json()

  // Step 3: Poll for result
  for (let i = 0; i < 20; i++) {
    await sleep(1000)
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { 'Authorization': ASSEMBLYAI_KEY },
    })
    const result = await pollRes.json()
    if (result.status === 'completed') {
      return {
        text: result.text || '',
        confidence: result.confidence || 0,
        words: (result.words || []).map(w => ({ text: w.text, confidence: w.confidence })),
      }
    }
    if (result.status === 'error') throw new Error(result.error || 'Transcription failed')
  }
  throw new Error('Transcription timed out')
}

const WORDS_PER_GAME = 10
const MAX_ATTEMPTS = 5
const PASS_SCORE = 70 // score threshold to pass a word
const PET_MAX_HP = 5

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const pickGameWords = (source) => {
  const shuffled = shuffle(source)
  return shuffled.slice(0, WORDS_PER_GAME)
}

// Calculate pronunciation score by comparing transcribed text to expected word
const calculateScore = (expectedWord, transcribedText, confidence) => {
  if (!transcribedText) return 0
  const expected = expectedWord.toLowerCase().trim()
  const spoken = transcribedText.toLowerCase().trim().replace(/[.,!?]/g, '')

  // Exact match — score based on confidence
  if (spoken === expected) {
    return Math.round(Math.max(70, confidence * 100))
  }

  // Check if spoken text contains the expected word
  const spokenWords = spoken.split(/\s+/)
  const matchingWord = spokenWords.find(w => w === expected)
  if (matchingWord) {
    return Math.round(Math.max(60, confidence * 90))
  }

  // Fuzzy match — Levenshtein distance
  const distance = levenshtein(expected, spoken)
  const maxLen = Math.max(expected.length, spoken.length)
  const similarity = 1 - distance / maxLen
  return Math.round(similarity * 100)
}

const levenshtein = (a, b) => {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = a[i - 1] === b[j - 1]
        ? matrix[i - 1][j - 1]
        : 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1])
    }
  }
  return matrix[a.length][b.length]
}

const PetSayItRight = ({ petImageUrl, petName, onGameEnd, onClose, wordBank: wordBankProp = [], hideClose = false, scoreToBeat = null, leaderboard = [], chestEnabled = false, pvpOpponentPetUrl = null }) => {
  const [phase, setPhase] = useState('ready') // ready | playing | defeated | results
  const [words, setWords] = useState([])
  const [wordIndex, setWordIndex] = useState(0)
  const [attempt, setAttempt] = useState(1)
  const [displayScore, setDisplayScore] = useState(0)
  const [wordsCorrect, setWordsCorrect] = useState(0)
  const [wordsFailed, setWordsFailed] = useState([])
  const [wordResults, setWordResults] = useState([]) // { word, score, passed }
  const muted = false

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [pronunciationScore, setPronunciationScore] = useState(null)
  const [transcription, setTranscription] = useState('')
  const [showResult, setShowResult] = useState(false)
  const [attemptScores, setAttemptScores] = useState([])

  // Animation
  const [screenShake, setScreenShake] = useState(0)
  const [particles, setParticles] = useState([])
  const [wordPopup, setWordPopup] = useState(null)
  const [chestCollected, setChestCollected] = useState(false)
  const [chestPopup, setChestPopup] = useState(false)
  const [petHp, setPetHp] = useState(PET_MAX_HP)

  const scoreRef = useRef(0)
  const containerRef = useRef(null)
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
  const animFrameRef = useRef(null)
  const shakeRef = useRef(0)
  const chestSpawnedRef = useRef(false)
  const chestWordRef = useRef(0)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)

  const currentWord = words[wordIndex]

  const cleanupRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    mediaRecorderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  const startRecording = useCallback(async () => {
    if (!currentWord) return

    cleanupRecorder()
    setIsRecording(true)
    setPronunciationScore(null)
    setTranscription('')
    setShowResult(false)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []

      let options = {}
      if (MediaRecorder.isTypeSupported('audio/mp4')) options.mimeType = 'audio/mp4'
      else if (MediaRecorder.isTypeSupported('audio/webm')) options.mimeType = 'audio/webm'

      const recorder = new MediaRecorder(stream, options)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        const blob = new Blob(audioChunksRef.current, { type: options.mimeType || 'audio/webm' })

        console.log('🎤 Recorded blob size:', blob.size)
        if (blob.size < 100) {
          setPronunciationScore(0)
          setTranscription('')
          setShowResult(true)
          setAttemptScores(prev => [...prev, 0])
          setIsTranscribing(false)
          return
        }

        setIsTranscribing(true)
        try {
          console.log('🎤 Sending audio blob:', blob.size, 'bytes, type:', blob.type)
          const data = await transcribeAudio(blob)
          console.log('🎤 AssemblyAI response:', JSON.stringify(data))
          const transcribedText = data.text || ''
          const confidence = data.confidence || 0

          const score = calculateScore(currentWord.word, transcribedText, confidence)
          console.log('🎤 Expected:', currentWord.word, '| Got:', transcribedText, '| Confidence:', confidence, '| Score:', score)

          setTranscription(transcribedText)
          setPronunciationScore(score)
          setShowResult(true)
          setAttemptScores(prev => [...prev, score])
        } catch (err) {
          console.error('Transcription error:', err)
          setPronunciationScore(0)
          setTranscription('')
          setShowResult(true)
          setAttemptScores(prev => [...prev, 0])
        } finally {
          setIsTranscribing(false)
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start()
    } catch (err) {
      console.error('Failed to start recording:', err)
      setIsRecording(false)
    }
  }, [currentWord, cleanupRecorder])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }, [])

  const handleNext = useCallback(() => {
    const score = pronunciationScore || 0
    const passed = score >= PASS_SCORE

    if (passed) {
      // Word passed — use pronunciation score as points
      scoreRef.current += score
      setDisplayScore(scoreRef.current)
      setWordsCorrect(prev => prev + 1)
      setWordResults(prev => [...prev, { word: currentWord.word, hint: currentWord.hint, score, passed: true }])

      setWordPopup({ points: score, passed: true })
      setTimeout(() => setWordPopup(null), 1200)

      // Particles
      const colors = ['#22c55e', '#86efac', '#facc15', '#34d399', '#60a5fa']
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

      if (chestEnabled && !chestSpawnedRef.current && wordsCorrect + 1 === chestWordRef.current) {
        chestSpawnedRef.current = true
        setChestCollected(true)
        setChestPopup(true)
        setTimeout(() => setChestPopup(false), 1500)
      }

      if (!muted) playSound(assetUrl('/sound/scram-correct.mp3'), 0.4)

      advanceToNextWord()
    } else if (attempt < MAX_ATTEMPTS) {
      // Try again
      setAttempt(prev => prev + 1)
      setPronunciationScore(null)
      setTranscription('')
      setShowResult(false)
    } else {
      // Failed after max attempts - take best score
      const bestScore = Math.max(...attemptScores, score)
      setWordsFailed(prev => [...prev, currentWord])
      setWordResults(prev => [...prev, { word: currentWord.word, hint: currentWord.hint, score: bestScore, passed: false }])

      // Give the best score as partial points
      if (bestScore > 0) {
        scoreRef.current += bestScore
        setDisplayScore(scoreRef.current)
      }

      shakeRef.current = 10
      setScreenShake(10)

      if (!muted) playSound(assetUrl('/sound/flappy-hit.mp3'), 0.4)

      const newPetHp = petHp - 1
      setPetHp(newPetHp)
      if (newPetHp <= 0) {
        setTimeout(() => {
          setPhase('defeated')
        }, 800)
        return
      }

      advanceToNextWord()
    }
  }, [pronunciationScore, attempt, currentWord, attemptScores, muted])

  const advanceToNextWord = useCallback(() => {
    const nextIdx = wordIndex + 1
    if (nextIdx < words.length) {
      setTimeout(() => {
        setWordIndex(nextIdx)
        setAttempt(1)
        setPronunciationScore(null)
        setTranscription('')
        setShowResult(false)
        setAttemptScores([])
      }, 800)
    } else {
      setTimeout(() => {
        setPhase('results')
      }, 800)
    }
  }, [wordIndex, words.length])

  const startGame = useCallback(() => {
    const source = wordBankProp
    const gameWords = pickGameWords(source)
    setWords(gameWords)
    setWordIndex(0)
    setAttempt(1)
    setDisplayScore(0)
    setWordsCorrect(0)
    setWordsFailed([])
    setWordResults([])
    setAttemptScores([])
    setPronunciationScore(null)
    setTranscription('')
    setShowResult(false)
    scoreRef.current = 0
    shakeRef.current = 0
    chestSpawnedRef.current = false
    chestWordRef.current = 2 + Math.floor(Math.random() * 5)
    setChestCollected(false)
    setChestPopup(false)
    setPetHp(PET_MAX_HP)
    setPhase('playing')

  }, [wordBankProp])


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
      cleanupRecorder()
      if (bgMusicRef.current) {
        bgMusicRef.current.pause()
        bgMusicRef.current = null
      }
    }
  }, [cleanupRecorder])

  // Particle + shake animation
  useEffect(() => {
    if (phase !== 'playing') return
    const animate = () => {
      shakeRef.current = Math.max(0, shakeRef.current - 0.5)
      setScreenShake(shakeRef.current)
      setParticles(prev => prev
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.15,
          opacity: p.opacity - 0.02,
        }))
        .filter(p => p.opacity > 0)
      )
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [phase])

  const getScoreColor = (score) => {
    if (score >= 90) return '#22c55e'
    if (score >= 70) return '#3b82f6'
    if (score >= 50) return '#eab308'
    return '#ef4444'
  }

  const getScoreMessage = (score) => {
    if (score >= 90) return 'Excellent!'
    if (score >= 70) return 'Good job!'
    if (score >= 50) return 'Almost there!'
    return 'Try again!'
  }

  return createPortal(
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-black/70 flex items-center justify-center">
      <style>{`
        @keyframes sayPopIn {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes sayFloat {
          0%, 100% { transform: translateY(-4px); }
          50% { transform: translateY(4px); }
        }
        @keyframes sayResultsFadeIn {
          0% { opacity: 0; transform: translateY(30px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes sayScorePopIn {
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
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 0 20px rgba(239,68,68,0); }
        }
        @keyframes hintPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes chestPopupAnim {
          0% { transform: scale(0) translateY(0); opacity: 0; }
          20% { transform: scale(1.2) translateY(0); opacity: 1; }
          40% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(-80px); opacity: 0; }
        }
        @keyframes bbHeartLose { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.5; } 100% { transform: scale(0); opacity: 0; } }
      `}</style>

      <div
        ref={containerRef}
        className="relative w-full max-w-[400px] h-full max-h-[100dvh] overflow-hidden rounded-none sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #c2410c 0%, #991b1b 50%, #9d174d 100%)',
          transform: screenShake > 0 ? `translate(${Math.sin(screenShake * 2) * 3}px, ${Math.cos(screenShake * 2) * 3}px)` : 'none',
        }}
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
        <div className="flex flex-col items-center gap-6 p-8 text-center h-full justify-center">
          <div className="flex items-center gap-4" style={{ animation: 'sayFloat 1.5s ease-in-out infinite' }}>
            {petImageUrl ? (
              <img src={petImageUrl} alt={petName} className="w-24 h-24 object-contain drop-shadow-lg"
                onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = '' }}
              />
            ) : null}
            <span className="text-7xl" style={{ display: petImageUrl ? 'none' : '' }}>🎤</span>
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
              Say It Right
            </h2>
            <p className="text-lg text-white/80 mb-1">
              Pronounce the word correctly!
            </p>
            <p className="text-sm text-white/60">
              {MAX_ATTEMPTS} attempts per word &bull; {WORDS_PER_GAME} words
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
            className="px-10 py-4 bg-white text-orange-600 rounded-full font-bold text-xl shadow-xl hover:scale-105 active:scale-95 transition-transform border-b-4 border-orange-200"
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

          {/* Word popup */}
          {wordPopup && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-1" style={{ animation: 'wordPopupAnim 1.2s ease-out forwards' }}>
                <div className="text-3xl font-black text-white drop-shadow-lg">+{wordPopup.points}</div>
              </div>
            </div>
          )}

          {chestPopup && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-2" style={{ animation: 'chestPopupAnim 1.5s ease-out forwards' }}>
                <span className="text-5xl">📦</span>
                <div className="bg-amber-500 text-white rounded-full px-4 py-1.5 font-bold text-sm shadow-lg">Chest Found!</div>
              </div>
            </div>
          )}

          {/* TOP HUD */}
          <div className="px-4 pt-3 pb-1 z-10">
            <div className="w-full max-w-md mx-auto flex flex-col items-center gap-2">
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {Array.from({ length: PET_MAX_HP }).map((_, i) => (
                    <Heart
                      key={i}
                      className="w-4 h-4"
                      fill={i < petHp ? '#ef4444' : 'none'}
                      stroke={i < petHp ? '#ef4444' : 'rgba(255,255,255,0.3)'}
                      style={i >= petHp ? { animation: 'bbHeartLose 0.4s ease-out forwards' } : {}}
                    />
                  ))}
                </div>

                {petImageUrl && (
                  <img src={petImageUrl} alt={petName}
                    className="w-10 h-10 object-contain drop-shadow-md"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                )}

                <div className="flex flex-col items-end gap-1">
                  <div className="bg-white/20 backdrop-blur rounded-2xl px-4 py-2 flex items-center gap-2">
                    <span className="text-xl font-black text-white">{displayScore}</span>
                  </div>
                  {/* Score-to-beat bar */}
                  {(() => {
                    const nextToBeat = leaderboard.length > 0
                      ? [...leaderboard].reverse().find(e => e.score > displayScore) || null
                      : scoreToBeat
                    if (!nextToBeat) return null
                    const gap = nextToBeat.score - displayScore
                    const isClose = gap > 0 && gap <= 15
                    const pct = Math.min(100, Math.round((displayScore / nextToBeat.score) * 100))
                    return (
                      <div className="w-28 mr-1" style={{ animation: isClose ? 'hintPulse 0.6s ease-in-out infinite' : 'none' }}>
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
              </div>

              {/* Progress dots */}
              <div className="w-full flex items-center justify-center gap-1.5">
                {words.map((_, i) => (
                  <div key={i} className="relative" style={{ width: 20, height: 20 }}>
                    {i < wordIndex ? (
                      <div className="w-full h-full rounded-full flex items-center justify-center text-xs"
                        style={{
                          background: wordResults[i]?.passed
                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                            : 'linear-gradient(135deg, #ef4444, #dc2626)',
                          boxShadow: wordResults[i]?.passed ? '0 0 8px rgba(34,197,94,0.5)' : '0 0 8px rgba(239,68,68,0.5)',
                        }}
                      >
                        <span className="text-white font-bold text-[10px]">{wordResults[i]?.passed ? '\u2713' : '\u2717'}</span>
                      </div>
                    ) : i === wordIndex ? (
                      <div className="w-full h-full rounded-full border-2 border-white/60 flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.15)', animation: 'hintPulse 1.5s ease-in-out infinite' }}
                      >
                        <span className="text-white/80 font-bold text-[9px]">{i + 1}</span>
                      </div>
                    ) : (
                      <div className="w-full h-full rounded-full border border-white/20 flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.08)' }}
                      >
                        <span className="text-white/30 text-[9px]">{i + 1}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CENTER: Word & Mic */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5 relative">

            {/* Attempt indicator */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50 uppercase tracking-wider font-semibold">
                Attempt {attempt}/{MAX_ATTEMPTS}
              </span>
            </div>

            {/* Word to pronounce */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 w-full max-w-xs text-center border border-white/20">
              <p className="text-xs text-white/50 uppercase tracking-wider mb-1 font-semibold">Say this word</p>
              <p className="text-4xl font-black text-white leading-snug" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                {currentWord.word}
              </p>
              <p className="text-sm text-white/60 mt-2">{currentWord.hint}</p>
            </div>

            {/* Mic button */}
            {!showResult && !isTranscribing && (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all transform hover:scale-105 ${
                  isRecording
                    ? 'bg-red-500 shadow-lg'
                    : 'bg-white/90 hover:bg-white shadow-md'
                }`}
                style={isRecording ? { animation: 'micPulse 1.5s ease-in-out infinite' } : {}}
              >
                {isRecording ? (
                  <Square className="w-8 h-8 text-white" />
                ) : (
                  <Mic className="w-8 h-8 text-orange-600" />
                )}
              </button>
            )}

            {isRecording && (
              <p className="text-sm text-white/70 animate-pulse">Listening... Tap to stop</p>
            )}

            {isTranscribing && (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
                <p className="text-sm text-white/70">Analyzing...</p>
              </div>
            )}

            {/* Result display */}
            {showResult && pronunciationScore !== null && (
              <div className="bg-white/15 backdrop-blur-md rounded-2xl px-5 py-4 w-full max-w-xs text-center border border-white/20"
                style={{ animation: 'sayPopIn 0.3s ease-out' }}
              >
                {/* Score ring */}
                <div className="flex justify-center mb-3">
                  <div className="relative w-24 h-24">
                    <svg className="w-24 h-24" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="48" cy="48" r="40" fill="rgba(0,0,0,0.2)" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
                      <circle
                        cx="48" cy="48" r="40"
                        fill="none"
                        stroke={getScoreColor(pronunciationScore)}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 40}`}
                        strokeDashoffset={`${2 * Math.PI * 40 * (1 - pronunciationScore / 100)}`}
                        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-black text-white">{pronunciationScore}</span>
                    </div>
                  </div>
                </div>

                <p className="text-lg font-bold text-white mb-1">{getScoreMessage(pronunciationScore)}</p>

                {transcription && (
                  <p className="text-xs text-white/50 mb-2">You said: &ldquo;{transcription}&rdquo;</p>
                )}

                {!transcription && pronunciationScore === 0 && (
                  <p className="text-xs text-white/50 mb-2">Could not hear you. Try speaking louder.</p>
                )}

                <button
                  onClick={handleNext}
                  className="w-full py-3 bg-white/20 hover:bg-white/30 rounded-xl font-bold text-white transition-colors"
                >
                  {pronunciationScore >= PASS_SCORE
                    ? (wordIndex < words.length - 1 ? 'Next Word' : 'See Results')
                    : attempt < MAX_ATTEMPTS
                      ? 'Try Again'
                      : (wordIndex < words.length - 1 ? 'Next Word' : 'See Results')}
                </button>
              </div>
            )}
          </div>

          {/* BOTTOM: Skip */}
          <div className="pb-8 pt-4 px-6 z-10 flex justify-center"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.2) 0%, transparent 100%)' }}
          >
            {!showResult && !isRecording && !isTranscribing && (
              <button
                onClick={() => {
                  setWordsFailed(prev => [...prev, currentWord])
                  setWordResults(prev => [...prev, { word: currentWord.word, hint: currentWord.hint, score: 0, passed: false }])
                  const newPetHp = petHp - 1
                  setPetHp(newPetHp)
                  if (newPetHp <= 0) {
                    setTimeout(() => {
                      setPhase('defeated')
                    }, 800)
                    return
                  }
                  advanceToNextWord()
                }}
                className="text-xs text-white/50 hover:text-white/80 underline transition-colors"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      )}

      {/* Defeated Phase */}
      {phase === 'defeated' && (
        <div className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto p-6 z-50">
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center my-auto"
            style={{ animation: 'sayResultsFadeIn 0.5s ease-out' }}
          >
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-4"
              style={{ animation: 'sayScorePopIn 0.6s ease-out 0.3s both' }}
            >
              <Heart className="w-10 h-10 text-red-500" fill="#ef4444" />
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-1">Defeated!</h2>
            <p className="text-gray-500 mb-5">{petName} ran out of lives!</p>

            <div
              className="rounded-2xl p-5 mb-5 border bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200"
              style={{ animation: 'sayScorePopIn 0.6s ease-out 0.5s both' }}
            >
              <p className="text-5xl font-black text-gray-400">{wordsCorrect}</p>
              <p className="text-sm font-semibold mt-1 text-gray-400">words completed</p>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Try to keep your lives! Failed words cost a heart.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setPhase('ready')
                  setDisplayScore(0)
                  setWordsCorrect(0)
                  setWordsFailed([])
                  setWordResults([])
                }}
                className="w-full py-3.5 bg-gradient-to-b from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-red-700 active:border-b-0 active:mt-1 transition-all"
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
            style={{ animation: 'sayResultsFadeIn 0.5s ease-out' }}
          >
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-orange-100 mb-4"
              style={{ animation: 'sayScorePopIn 0.6s ease-out 0.3s both' }}
            >
              <Trophy className="w-10 h-10 text-orange-500" />
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-1">
              {wordsCorrect >= Math.ceil(WORDS_PER_GAME / 2) ? 'Great Speaking!' : 'Keep Practicing!'}
            </h2>
            <p className="text-gray-500 mb-5">
              {wordsCorrect}/{WORDS_PER_GAME} words pronounced correctly
            </p>

            <div
              className={`rounded-2xl p-5 mb-5 border ${wordsCorrect >= Math.ceil(WORDS_PER_GAME / 2) ? 'bg-gradient-to-br from-orange-50 to-red-50 border-orange-100' : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200'}`}
              style={{ animation: 'sayScorePopIn 0.6s ease-out 0.5s both' }}
            >
              <p className={`text-5xl font-black ${wordsCorrect >= Math.ceil(WORDS_PER_GAME / 2) ? 'text-orange-600' : 'text-gray-400'}`}>{displayScore}</p>
              <p className={`text-sm font-semibold mt-1 ${wordsCorrect >= Math.ceil(WORDS_PER_GAME / 2) ? 'text-orange-400' : 'text-gray-400'}`}>points</p>
            </div>

            {/* Word results breakdown */}
            {wordResults.length > 0 && (
              <div className="mb-5 text-left">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">Word Breakdown</p>
                <div className="max-h-[200px] overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {wordResults.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold ${r.passed ? 'bg-green-500' : 'bg-red-400'}`}>
                        {r.passed ? '\u2713' : '\u2717'}
                      </span>
                      <span className="font-bold text-sm text-gray-800">{r.word}</span>
                      <span className="text-xs text-gray-400 ml-auto">{r.score}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-sm text-gray-600 mb-6">
              {wordsCorrect >= WORDS_PER_GAME
                ? 'Perfect pronunciation!'
                : wordsCorrect >= Math.ceil(WORDS_PER_GAME / 2)
                  ? 'Nice work!'
                  : `Need at least ${Math.ceil(WORDS_PER_GAME / 2)} correct words. Try again!`}
            </p>

            {chestCollected && (
              <div className="mb-4 flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                <span className="text-2xl">📦</span>
                <span className="font-bold text-amber-700">Chest collected!</span>
              </div>
            )}

            {wordsCorrect >= Math.ceil(WORDS_PER_GAME / 2) ? (
              <button
                onClick={() => onGameEnd(displayScore, { chestCollected, wordsPronounced: wordsCorrect })}
                className="w-full py-3.5 bg-gradient-to-b from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-red-700 active:border-b-0 active:mt-1 transition-all"
              >
                Collect Rewards
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setPhase('ready')
                    setDisplayScore(0)
                    setWordsCorrect(0)
                    setWordsFailed([])
                    setWordResults([])
                  }}
                  className="w-full py-3.5 bg-gradient-to-b from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-red-700 active:border-b-0 active:mt-1 transition-all"
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

export default PetSayItRight
