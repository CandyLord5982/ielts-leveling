import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import { useProgress } from '../../hooks/useProgress'
import { supabase } from '../../supabase/client'
import { saveRecentExercise } from '../../utils/recentExercise'
import LoadingSpinner from '../ui/LoadingSpinner'
import { RichTextWithAudio } from '../ui/RichTextRenderer'
import { Mic, Square, ArrowRight, ArrowLeft, Star, RefreshCw, CheckCircle, MessageSquare, X } from 'lucide-react'
import TeacherExerciseNav from '../ui/TeacherExerciseNav'

const isMobileDevice = () =>
  /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// Send recorded audio blob to Groq Whisper via the /api/transcribe-whisper proxy
const transcribeAudio = async (audioBlob) => {
  const response = await fetch('/api/transcribe-whisper', {
    method: 'POST',
    headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
    body: audioBlob,
  })
  if (!response.ok) throw new Error('Transcription request failed')
  const data = await response.json()
  if (!data.success) throw new Error(data.error || 'Transcription failed')
  return data.text || ''
}

export const LEVELS = [
  {
    value: 'kindergarten',
    label: 'Kindergarten',
    emoji: '🧒',
    color: 'bg-pink-100 text-pink-700 border-pink-200',
    ageRange: 'Ages 4–6',
    aiContext: `The student is a kindergarten child (age 4-6). Judge ONLY on: did they understand the question, did they try to answer, are they confident. Use very simple, encouraging language. Even a few words is a good response. Do NOT penalize for grammar or complex vocabulary. Scores should be generous (60-100 range for any genuine attempt).`,
  },
  {
    value: 'primary',
    label: 'Primary School',
    emoji: '📚',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    ageRange: 'Grades 2–5 · Ages 7–11',
    aiContext: `The student is a primary school child (age 7-11). Expect simple sentences, basic vocabulary, and some grammar errors. Focus feedback on communication success, topic relevance, and simple vocabulary use. Keep suggestions simple and encouraging. Scores in the 50-90 range are typical.`,
  },
  {
    value: 'middle',
    label: 'Middle School',
    emoji: '🎒',
    color: 'bg-green-100 text-green-700 border-green-200',
    ageRange: 'Grades 6–8 · Ages 11–14',
    aiContext: `The student is a middle school student (age 11-14). Expect developing grammar, moderate vocabulary, and some sentence variety. Assess content relevance, basic grammar accuracy, and growing vocabulary. Provide constructive feedback appropriate for a teen learner.`,
  },
  {
    value: 'high_school',
    label: 'High School',
    emoji: '🏫',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    ageRange: 'Grades 9–12 · Ages 14–18',
    aiContext: `The student is a high school student (age 14-18). Apply standard English speaking assessment. Expect grammatical accuracy, varied vocabulary, logical organisation, and coherent answers. Provide detailed, specific feedback to help them improve toward academic/exam readiness.`,
  },
  {
    value: 'adult',
    label: 'Adult / College',
    emoji: '🎓',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    ageRange: 'Age 18+',
    aiContext: `The student is an adult or college-level learner. Apply full IELTS speaking band standards. Assess lexical resource, grammatical range and accuracy, coherence, fluency, and content depth. Provide professional, detailed feedback suitable for exam or professional preparation.`,
  },
]

const getLevelConfig = (value) => LEVELS.find(l => l.value === value) || LEVELS[2]

// Levels for IELTS speaking assessment. Unknown/old values fall back to Advanced.
export const IELTS_LEVELS = [
  {
    value: 'beginner',
    label: 'IELTS Beginner',
    emoji: '🌱',
    color: 'bg-green-100 text-green-700 border-green-200',
    bandRange: 'Target band 3.5–5.0',
    aiContext: `The student is an IELTS beginner (target band 3.5–5.0). Score honestly against the official IELTS band descriptors, but explain mistakes in simple, clear English. Focus feedback on the most basic errors first (tenses, word order, missing words, very limited vocabulary).`,
  },
  {
    value: 'intermediate',
    label: 'IELTS Intermediate',
    emoji: '📘',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    bandRange: 'Target band 5.0–6.5',
    aiContext: `The student is an IELTS intermediate learner (target band 5.0–6.5). Score against the official IELTS band descriptors. Point out grammar and word-choice errors, weak linking, and underdeveloped ideas, and show how to move up toward band 7.`,
  },
  {
    value: 'advanced',
    label: 'IELTS Advanced',
    emoji: '🎓',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    bandRange: 'Target band 6.5–8.0+',
    aiContext: `The student is an IELTS advanced learner (target band 6.5–8.0+). Score strictly like a real IELTS examiner. Point out even subtle errors, unnatural collocations, repetition, and lack of idiomatic or less common vocabulary needed for band 7–9.`,
  },
]

export const DEFAULT_IELTS_LEVEL = 'advanced'

export const getIeltsLevel = (value) =>
  IELTS_LEVELS.find(l => l.value === value) || IELTS_LEVELS.find(l => l.value === DEFAULT_IELTS_LEVEL)

// Rate an IELTS speaking answer and explain what's wrong / what to improve
export const scoreIeltsSpeakingWithLLM = async (prompt, spokenText, level) => {
  const levelConfig = getIeltsLevel(level)

  const userPrompt = `Rate this IELTS speaking answer and give feedback on what's wrong and what to improve.

Student level: ${levelConfig.label} (${levelConfig.bandRange})
Guidance: ${levelConfig.aiContext}

IELTS speaking question: "${prompt}"

Student's answer (auto-transcribed from speech): "${spokenText}"

IMPORTANT — this is a SPOKEN answer. Judge it the way an IELTS examiner hears it, not as written text:
- NEVER comment on punctuation, commas, full stops, run-on sentences, capitalization, or spelling. The transcript adds or drops these at random; the student did not produce them.
- The speech recognizer often mishears words. If a word looks wrong but sounds like a word that fits (e.g. "mail" for "meal", "discourse" for "Discord", "it were" for "if we're"), assume the student said the right word and do NOT list it as a mistake.
- Only list a mistake when you can quote the exact words and you are confident the student really said them wrong: wrong tense, wrong verb form, subject-verb agreement, wrong word choice, wrong preposition, or a clearly missing word that would be audible.
- Do not list optional style choices (e.g. "could add 'the'", "could add 'some'") as mistakes. Put those in suggestions if useful.
- No vague items like "inconsistent tenses throughout" — every mistake must quote the student's words and give the correction.
- If there are no real mistakes, say so in "mistakes" and keep the score high.

Respond ONLY in valid JSON:
{
  "band_score": number from 0 to 9 in steps of 0.5 (estimated overall IELTS speaking band),
  "overall_score": number 0-100 (band_score / 9 * 100, rounded),
  "content_score": number 0-100 (task response: does it answer the question, are ideas developed),
  "fluency_score": number 0-100 (Fluency & Coherence),
  "vocabulary_score": number 0-100 (Lexical Resource),
  "grammar_score": number 0-100 (Grammatical Range & Accuracy),
  "strengths": "1-2 sentences on what the student did well",
  "mistakes": "What's wrong: only real spoken grammar/vocabulary mistakes, quoting what the student said and giving the correction plus a short reason, e.g. \\"I go there yesterday\\" → \\"I went there yesterday\\" (past tense). One per line, starting with '- '. Never punctuation or capitalization.",
  "suggestions": "What to improve: 2-4 specific, actionable tips to reach a higher band. One per line, starting with '- '.",
  "sample_improvement": "A short improved version of the student's answer (2-4 sentences) at about one band higher"
}`

  const response = await fetch('/api/pet-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are an experienced IELTS speaking examiner. You rate answers using the official IELTS band descriptors and give clear, specific feedback. Always respond in valid JSON.' },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    }),
  })

  if (!response.ok) throw new Error('LLM request failed')
  const data = await response.json()
  const content = data.choices[0].message.content
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in response')
  const parsed = JSON.parse(jsonMatch[0])
  if (parsed.overall_score === undefined && parsed.band_score === undefined) throw new Error('Invalid response shape')
  if (parsed.overall_score === undefined) parsed.overall_score = Math.round((parsed.band_score / 9) * 100)
  return parsed
}

// Call AI with level-aware scoring prompt (via Groq proxy)
export const scoreSpeechWithLLM = async (prompt, spokenText, keyPoints, evaluationCriteria, level) => {
  const kp = keyPoints?.join(', ') || ''
  const criteria = evaluationCriteria || 'content relevance, vocabulary, grammar, fluency'
  const levelConfig = getLevelConfig(level)

  const userPrompt = `You are a speaking assessment examiner. Evaluate the following spoken response.

Student level: ${levelConfig.label} (${levelConfig.ageRange})
Scoring guidance: ${levelConfig.aiContext}

Topic/Prompt: "${prompt}"
${kp ? `Key points to cover: ${kp}` : ''}
Evaluation criteria: ${criteria}

Student's spoken response: "${spokenText}"

Provide evaluation in JSON calibrated to the student's level:
{
  "overall_score": number (0-100),
  "content_score": number (0-100),
  "vocabulary_score": number (0-100),
  "grammar_score": number (0-100),
  "fluency_score": number (0-100),
  "strengths": "2-3 sentences about what the student did well (age-appropriate tone)",
  "suggestions": "2-3 specific, actionable suggestions suitable for this age/level",
  "sample_improvement": "One example sentence showing improvement appropriate for this level"
}`

  const response = await fetch('/api/pet-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are an expert speaking examiner who adapts feedback to student age and level. Always respond in valid JSON.' },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1200,
      temperature: 0.3,
    }),
  })

  if (!response.ok) throw new Error('LLM request failed')
  const data = await response.json()
  const content = data.choices[0].message.content
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in response')
  const parsed = JSON.parse(jsonMatch[0])
  if (parsed.overall_score === undefined) throw new Error('Invalid response shape')
  return parsed
}

// Splits a mistake line like `- "I go" → "I went" (past tense)` into its parts
const parseMistake = (line) => {
  const text = line.replace(/^\s*[-•*]\s*/, '').trim()
  const arrow = text.match(/\s*(?:→|->|=>)\s*/)
  if (!arrow) return { plain: text }
  const wrong = text.slice(0, arrow.index).trim()
  let right = text.slice(arrow.index + arrow[0].length).trim()
  let reason = ''
  const reasonMatch = right.match(/\s*\(([^()]*)\)\s*$/)
  if (reasonMatch) {
    reason = reasonMatch[1].trim()
    right = right.slice(0, reasonMatch.index).trim()
  }
  return { wrong, right, reason }
}

const MistakeList = ({ mistakes }) => {
  const lines = (Array.isArray(mistakes) ? mistakes : String(mistakes).split('\n'))
    .map(l => String(l).trim())
    .filter(Boolean)
  return (
    <ul className="space-y-2">
      {lines.map((line, i) => {
        const m = parseMistake(line)
        if (m.plain !== undefined) {
          return <li key={i} className="text-sm text-red-700">{m.plain}</li>
        }
        return (
          <li key={i} className="text-sm leading-relaxed">
            <span className="text-red-600">{m.wrong}</span>
            <span className="mx-1.5 text-gray-400">→</span>
            <span className="font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">{m.right}</span>
            {m.reason && <span className="ml-2 text-xs text-gray-500">({m.reason})</span>}
          </li>
        )
      })}
    </ul>
  )
}

MistakeList.propTypes = {
  mistakes: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]).isRequired,
}

const fallbackResult = (msg = '') => ({
  overall_score: 50,
  content_score: 50,
  vocabulary_score: 50,
  grammar_score: 50,
  fluency_score: 50,
  strengths: 'Your response was recorded successfully.',
  suggestions: msg || 'AI analysis is temporarily unavailable. Please try again.',
  sample_improvement: '',
})

const SpeakingAssessmentExercise = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const handleBackNavigation = () => {
    if (typeof session !== 'undefined' && session?.units) {
      navigate(`/study/course/${session.units.course_id}/unit/${session.units.id}/session/${typeof sessionId !== 'undefined' ? sessionId : session.id}`);
    } else {
      const path = window.location.pathname;
      if (path.includes('/admin')) navigate('/admin/exercise-bank');
      else if (path.includes('/teacher')) navigate('/teacher/exercise-bank');
      else navigate('/study');
    }
  };

  const { user } = useAuth()
  const { canCreateContent } = usePermissions()
  const { startExercise, completeExerciseWithXP } = useProgress()
  const isAdmin = canCreateContent()
  const [teacherPreview, setTeacherPreview] = useState(true)
  const isTeacherView = isAdmin && teacherPreview

  const searchParams = new URLSearchParams(location.search)
  const exerciseId = searchParams.get('exerciseId')
  const sessionId = searchParams.get('sessionId')

  const [exercise, setExercise] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [session, setSession] = useState(null)
  const [colorTheme, setColorTheme] = useState('blue')

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  // Latest scored answer per question index: { [idx]: { questionIndex, transcription, overallScore, aiResult } }
  const [answers, setAnswers] = useState({})
  const questionResults = Object.values(answers)
  const [isQuizComplete, setIsQuizComplete] = useState(false)
  const [xpAwarded, setXpAwarded] = useState(0)

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [interimTranscription, setInterimTranscription] = useState('')
  const [aiResult, setAiResult] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [showResults, setShowResults] = useState(false)

  // Timer
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [timerActive, setTimerActive] = useState(false)
  const timerIntervalRef = useRef(null)

  // Refs for recording
  const recognitionRef = useRef(null)       // Web Speech API (desktop)
  const mediaRecorderRef = useRef(null)     // MediaRecorder (mobile)
  const audioChunksRef = useRef([])
  const finalTranscriptRef = useRef('')
  // Background audio capture (for teacher review)
  const bgRecorderRef = useRef(null)
  const bgChunksRef = useRef([])
  const bgStreamRef = useRef(null)
  const lastAudioBlobRef = useRef(null)
  const cancelledRef = useRef(false) // true when the student cancels mid-recording

  // Local playback of the student's last recording (in-memory only, cleared per question)
  const [playbackUrl, setPlaybackUrl] = useState(null)
  const playbackUrlRef = useRef(null)
  const showPlayback = (blob) => {
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current)
    const url = blob && blob.size > 1000 ? URL.createObjectURL(blob) : null
    playbackUrlRef.current = url
    setPlaybackUrl(url)
  }
  const clearPlayback = () => showPlayback(null)
  useEffect(() => () => { if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current) }, [])

  const isMobile = isMobileDevice()

  useEffect(() => {
    if (exerciseId && user) startExercise(exerciseId)
  }, [exerciseId, user])

  useEffect(() => {
    if (exerciseId) fetchExercise()
    else { setLoading(false); setError('Exercise ID not found') }
  }, [exerciseId])

  useEffect(() => {
    if (sessionId) fetchSessionInfo()
  }, [sessionId])

  useEffect(() => {
    if (isQuizComplete && questionResults.length > 0) markExerciseCompleted()
  }, [isQuizComplete])

  // Reset timer when question changes
  useEffect(() => {
    if (questions.length === 0 || currentQuestionIndex >= questions.length) return
    // No countdown when revisiting a question that already has an answer
    const timeLimit = answers[currentQuestionIndex] ? 0 : (questions[currentQuestionIndex]?.time_limit || 0)
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    if (timeLimit > 0) { setTimeRemaining(timeLimit); setTimerActive(true) }
    else { setTimeRemaining(null); setTimerActive(false) }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current) }
  }, [currentQuestionIndex, questions])

  // Countdown
  useEffect(() => {
    if (!timerActive || !timeRemaining) return
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current)
          setTimerActive(false)
          stopRecording()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current) }
  }, [timerActive])

  const fetchSessionInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, units:unit_id (id, title, course_id, color_theme)')
        .eq('id', sessionId)
        .single()
      if (error) throw error
      setSession(data)
      setColorTheme(data?.color_theme || data?.units?.color_theme || 'blue')
    } catch (err) {
      console.error('Error fetching session info:', err)
    }
  }

  const fetchExercise = async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exerciseId)
        .eq('exercise_type', 'speaking_assessment')
        .single()
      if (error) throw error
      setExercise(data)
      const qs = data?.content?.questions || []
      setQuestions(qs)
      if (qs.length) {
        try {
          saveRecentExercise({ ...data, continuePath: `/study/speaking-assessment?exerciseId=${data.id}&sessionId=${sessionId}` })
        } catch { }
      }
    } catch (err) {
      console.error('Error fetching exercise:', err)
      setError('Unable to load exercise data')
    } finally {
      setLoading(false)
    }
  }

  // ── Background audio capture (for teacher review) ─────────────────────────
  const startBgRecorder = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      bgStreamRef.current = stream
      bgChunksRef.current = []
      let options = {}
      if (MediaRecorder.isTypeSupported('audio/mp4')) options.mimeType = 'audio/mp4'
      else if (MediaRecorder.isTypeSupported('audio/webm')) options.mimeType = 'audio/webm'
      const recorder = new MediaRecorder(stream, options)
      recorder.ondataavailable = (e) => { if (e.data.size > 0) bgChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        if (cancelledRef.current) return
        const blob = new Blob(bgChunksRef.current, { type: options.mimeType || 'audio/webm' })
        lastAudioBlobRef.current = blob
        showPlayback(blob)
      }
      bgRecorderRef.current = recorder
      recorder.start()
    } catch (err) {
      console.error('Background audio capture failed:', err)
    }
  }

  const stopBgRecorder = () => {
    if (bgRecorderRef.current && bgRecorderRef.current.state !== 'inactive') {
      bgRecorderRef.current.stop()
    }
  }

  const saveSubmission = async (spokenText, aiScoreResult) => {
    if (!user || !exerciseId) return
    try {
      let audioUrl = null
      const blob = lastAudioBlobRef.current
      if (blob && blob.size > 1000) {
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
        const filePath = `speaking/${user.id}/${exerciseId}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('exercise-videos')
          .upload(filePath, blob, { contentType: blob.type })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('exercise-videos').getPublicUrl(filePath)
          audioUrl = urlData?.publicUrl
        }
      }
      await supabase.from('video_submissions').insert({
        user_id: user.id,
        exercise_id: exerciseId,
        session_id: sessionId || null,
        question_index: currentQuestionIndex,
        video_url: audioUrl,
        transcription: spokenText || null,
        ai_result: aiScoreResult || null,
        ai_score: Math.round(aiScoreResult?.overall_score || 0),
        status: 'pending',
      })
      lastAudioBlobRef.current = null
    } catch (err) {
      console.error('Error saving speaking submission:', err)
    }
  }

  // ── Desktop recording: Web Speech API ─────────────────────────────────────
  const startWebSpeech = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return false

    if (recognitionRef.current) recognitionRef.current.abort()
    finalTranscriptRef.current = ''

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + t.trim()
        } else {
          interim += t
        }
      }
      setTranscription(finalTranscriptRef.current)
      setInterimTranscription(interim)
    }

    recognition.onerror = (e) => {
      console.error('Speech recognition error:', e.error)
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
      setInterimTranscription('')
      if (cancelledRef.current) return
      const text = finalTranscriptRef.current.trim()
      if (text) analyzeWithAI(text)
    }

    recognitionRef.current = recognition
    recognition.start()
    return true
  }

  // ── Mobile recording: MediaRecorder → Groq Whisper─────────────────────────
  const startMobileRecording = async () => {
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      console.error('Microphone permission denied:', err)
      setError('Microphone access denied. Please allow microphone access and try again.')
      return false
    }

    audioChunksRef.current = []
    let options = {}
    if (MediaRecorder.isTypeSupported('audio/mp4')) options.mimeType = 'audio/mp4'
    else if (MediaRecorder.isTypeSupported('audio/webm')) options.mimeType = 'audio/webm'

    const recorder = new MediaRecorder(stream, options)
    recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      if (cancelledRef.current) return
      const blob = new Blob(audioChunksRef.current, { type: options.mimeType || 'audio/webm' })
      lastAudioBlobRef.current = blob
      showPlayback(blob)
      setIsTranscribing(true)
      try {
        const text = await transcribeAudio(blob)
        setTranscription(text)
        if (text.trim()) analyzeWithAI(text.trim())
        else setError('No speech detected. Please try again.')
      } catch (err) {
        console.error('Whisper transcription error:', err)
        setError('Transcription failed. Please try again.')
      } finally {
        setIsTranscribing(false)
      }
    }

    mediaRecorderRef.current = recorder
    recorder.start()
    return true
  }

  const startRecording = async () => {
    cancelledRef.current = false
    clearPlayback()
    setTranscription('')
    setInterimTranscription('')
    setAiResult(null)
    setShowResults(false)
    setError(null)

    let started
    if (isMobile) {
      started = await startMobileRecording()
    } else {
      started = startWebSpeech()
      if (!started) {
        started = await startMobileRecording()
      }
      // Start background audio capture for teacher review (desktop)
      if (started) startBgRecorder()
    }
    if (started) setIsRecording(true)
  }

  const stopRecording = () => {
    if (isMobile || !recognitionRef.current) {
      // Stop MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    } else {
      // Stop Web Speech
      if (recognitionRef.current) {
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
    }
    stopBgRecorder()
    setIsRecording(false)
  }

  // Throw away the current attempt: no transcription, scoring or saving
  const cancelRecording = () => {
    cancelledRef.current = true
    if (recognitionRef.current) {
      recognitionRef.current.abort()
      recognitionRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    stopBgRecorder()
    lastAudioBlobRef.current = null
    setIsRecording(false)
    finalTranscriptRef.current = ''
    setInterimTranscription('')
    // Show the previous answer for this question again, if there was one
    const saved = answers[currentQuestionIndex]
    setTranscription(saved?.transcription || '')
    setAiResult(saved?.aiResult || null)
    setShowResults(!!saved)
  }

  const analyzeWithAI = async (spokenText) => {
    const idx = currentQuestionIndex
    const q = questions[idx]
    if (!spokenText || !q) return
    setIsAnalyzing(true)
    let aiScoreResult
    try {
      aiScoreResult = await scoreIeltsSpeakingWithLLM(q.prompt, spokenText, exercise?.content?.level)
    } catch (err) {
      console.error('AI scoring error:', err)
      aiScoreResult = fallbackResult()
    } finally {
      setAiResult(aiScoreResult)
      setIsAnalyzing(false)
      setShowResults(true)
      // Keep the latest attempt for this question so students can come back to it
      setAnswers(prev => ({
        ...prev,
        [idx]: { questionIndex: idx, transcription: spokenText, overallScore: aiScoreResult?.overall_score || 0, aiResult: aiScoreResult },
      }))
      // Save audio + submission for teacher review
      saveSubmission(spokenText, aiScoreResult)
    }
  }

  const isBusy = isRecording || isTranscribing || isAnalyzing
  const answeredCount = Object.keys(answers).length
  const allAnswered = questions.length > 0 && answeredCount === questions.length

  const goToQuestion = (idx) => {
    if (isBusy || idx < 0 || idx >= questions.length || idx === currentQuestionIndex) return
    clearPlayback()
    const saved = answers[idx]
    setTranscription(saved?.transcription || '')
    setInterimTranscription('')
    setAiResult(saved?.aiResult || null)
    setShowResults(!!saved)
    setError(null)
    finalTranscriptRef.current = ''
    setCurrentQuestionIndex(idx)
  }

  // Next unanswered question after the current one (wrapping around), or the next index
  const nextUnansweredIndex = () => {
    for (let step = 1; step <= questions.length; step++) {
      const i = (currentQuestionIndex + step) % questions.length
      if (!answers[i]) return i
    }
    return Math.min(currentQuestionIndex + 1, questions.length - 1)
  }

  const handleNextQuestion = () => {
    if (allAnswered) {
      clearPlayback()
      setIsQuizComplete(true)
      return
    }
    goToQuestion(nextUnansweredIndex())
  }

  const markExerciseCompleted = async () => {
    if (!user || !exerciseId) return
    const allResults = [...questionResults]
    const avgScore = allResults.length
      ? Math.round(allResults.reduce((s, r) => s + (r.overallScore || 0), 0) / allResults.length)
      : 0
    try {
      const baseXP = exercise?.xp_reward || 15
      const bonusXP = avgScore >= 90 ? Math.round(baseXP * 0.5) : avgScore >= 80 ? Math.round(baseXP * 0.3) : 0
      const totalXP = baseXP + bonusXP
      const result = await completeExerciseWithXP(exerciseId, totalXP, { score: avgScore, max_score: 100, xp_earned: totalXP })
      if (result?.xpAwarded > 0) setXpAwarded(result.xpAwarded)
    } catch (err) {
      console.error('Error marking exercise completed:', err)
    }
  }

  const getScoreColor = (s) => s >= 80 ? 'text-green-600' : s >= 60 ? 'text-yellow-600' : 'text-red-600'
  const getScoreBg = (s) => s >= 80 ? 'bg-green-50 border-green-200' : s >= 60 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'

  // ── Loading / Error states ─────────────────────────────────────────────────
  if (loading) return <div className="flex justify-center items-center min-h-64"><LoadingSpinner size="lg" /></div>

  if (error && !isRecording && !isTranscribing && !showResults) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">{error}</div>
        <button onClick={fetchExercise} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Try Again</button>
      </div>
    )
  }

  if (!questions.length && !isTeacherView) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600 mb-4">No questions available</div>
        <Link to="/study"><button className="px-4 py-2 bg-blue-600 text-white rounded-lg">Back to Study</button></Link>
      </div>
    )
  }

  // ── Teacher preview ────────────────────────────────────────────────────────
  if (isTeacherView) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{exercise?.title || 'Speaking Assessment'}</h2>
            {(() => { const lc = getIeltsLevel(exercise?.content?.level); return (
              <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium border ${lc.color}`}>
                {lc.emoji} {lc.label} · {lc.bandRange}
              </span>
            )})()}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTeacherPreview(false)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
            >
              <Mic className="w-4 h-4" /> Attempt Exercise
            </button>
            <button onClick={handleBackNavigation} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border rounded-lg">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </div>
        </div>
        <div className="space-y-4">
          {questions.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg text-gray-400">
              No questions yet. Edit this exercise to add questions.
            </div>
          )}
          {questions.map((q, idx) => (
            <div key={idx} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center font-bold text-sm">{idx + 1}</span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-purple-600 uppercase tracking-wide mb-1">Speaking Prompt</p>
                  <div className="text-lg font-semibold text-gray-900 mb-2">
                    <RichTextWithAudio content={q.prompt} allowImages={true} />
                  </div>
                  {q.instructions && <p className="text-sm text-gray-600 mb-2">{q.instructions}</p>}
                  {q.time_limit > 0 && <p className="text-xs text-gray-500 mt-2">Time limit: {q.time_limit}s</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Student view ───────────────────────────────────────────────────────────
  const currentQuestion = questions[currentQuestionIndex]
  const totalQuestions = questions.length
  return (
    <>
      <div className="relative px-4">
        <div className="max-w-4xl mx-auto space-y-6 relative z-20">
          {isAdmin && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}

          {/* Admin banner */}
          {isAdmin && (
            <div className="flex items-center justify-between bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-2 text-sm text-yellow-800">
              <span>Previewing as student</span>
              <button onClick={() => setTeacherPreview(true)} className="underline font-medium hover:text-yellow-900">
                Back to overview
              </button>
            </div>
          )}

          {/* Header / Progress */}
          <div className="bg-white rounded-lg shadow-sm p-4 md:p-5 border border-gray-200">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs md:text-sm font-medium text-gray-500 truncate">{exercise?.title}</p>
              {(() => { const lc = getIeltsLevel(exercise?.content?.level); return (
                <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${lc.color}`}>
                  {lc.emoji} {lc.label}
                </span>
              )})()}
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600">Answered</span>
                <span className="text-xs font-semibold text-purple-600">{answeredCount} / {totalQuestions}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${totalQuestions ? (answeredCount / totalQuestions) * 100 : 0}%` }}
                />
              </div>
              {!isQuizComplete && totalQuestions > 1 && (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => goToQuestion(currentQuestionIndex - 1)}
                    disabled={isBusy || currentQuestionIndex === 0}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    title="Previous question"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {questions.map((_, i) => {
                      const isCurrent = i === currentQuestionIndex
                      const done = !!answers[i]
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => goToQuestion(i)}
                          disabled={isBusy && !isCurrent}
                          title={done ? `Question ${i + 1} (answered)` : `Question ${i + 1}`}
                          className={`w-8 h-8 rounded-full text-xs font-semibold border-2 transition-colors disabled:opacity-50 ${
                            isCurrent
                              ? 'border-purple-600 bg-purple-600 text-white'
                              : done
                                ? 'border-green-400 bg-green-50 text-green-700 hover:bg-green-100'
                                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {i + 1}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => goToQuestion(currentQuestionIndex + 1)}
                    disabled={isBusy || currentQuestionIndex === totalQuestions - 1}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    title="Next question"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
              {!isQuizComplete && allAnswered && !showResults && (
                <button
                  type="button"
                  onClick={handleNextQuestion}
                  disabled={isBusy}
                  className="mt-3 w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  All questions answered — Finish
                </button>
              )}
            </div>
            {timeRemaining !== null && (
              <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-orange-800">Time Remaining</span>
                  <span className={`text-2xl font-bold ${timeRemaining <= 10 ? 'text-red-600 animate-pulse' : 'text-orange-600'}`}>
                    {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
                  </span>
                </div>
                {timeRemaining <= 10 && <p className="text-xs text-red-600 mt-1">Recording will stop soon!</p>}
              </div>
            )}
          </div>

          {/* Complete screen */}
          {isQuizComplete && (
            <div className="bg-white rounded-lg shadow-md p-8 text-center border border-gray-200">
              <div className="w-20 h-20 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-purple-500" />
              </div>
              <h2 className="text-2xl font-bold text-purple-800 mb-2">Exercise Complete!</h2>
              {questionResults.length > 0 && (
                <p className="text-gray-600 mb-2">
                  Average Score: {Math.round(questionResults.reduce((s, r) => s + (r.overallScore || 0), 0) / questionResults.length)}%
                </p>
              )}
              {xpAwarded > 0 && (
                <div className="flex items-center justify-center gap-2 text-yellow-600 font-semibold mb-6">
                  <Star className="w-5 h-5" />
                  <span>+{xpAwarded} XP earned!</span>
                </div>
              )}
              <button
                onClick={() => {
                  if (session?.units) navigate(`/study/course/${session.units.course_id}/unit/${session.unit_id}/session/${sessionId}`)
                  else navigate('/study')
                }}
                className="w-full max-w-sm mx-auto block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
              >
                Back to Exercise List
              </button>
            </div>
          )}

          {/* Question card */}
          {!isQuizComplete && currentQuestion && (
            <div className="bg-white rounded-lg shadow-md p-4 md:p-8 border border-gray-200 border-l-4 border-l-purple-400 relative">
              <div className="absolute top-4 right-6 flex gap-2 z-20">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>

              <div className="space-y-5 pt-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
                    Speaking Task {currentQuestionIndex + 1}
                  </span>
                </div>

                {/* Prompt */}
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                  <div className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
                    <RichTextWithAudio content={currentQuestion.prompt} allowImages={true} />
                  </div>
                  {currentQuestion.instructions && (
                    <p className="text-sm text-gray-600 mt-2">{currentQuestion.instructions}</p>
                  )}
                </div>

                {/* Recording section */}
                {!showResults && !isAnalyzing && !isTranscribing && (
                  <div className="flex flex-col items-center space-y-4 py-4">
                    {error && (
                      <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-center">
                        {error}
                      </div>
                    )}

                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`w-24 h-24 rounded-full flex items-center justify-center transition-all transform hover:scale-105 ${
                        isRecording
                          ? 'bg-red-500 animate-pulse shadow-xl shadow-red-200'
                          : 'bg-purple-600 hover:bg-purple-700 shadow-lg'
                      }`}
                    >
                      {isRecording
                        ? <Square className="w-9 h-9 text-white" />
                        : <Mic className="w-9 h-9 text-white" />}
                    </button>
                    <p className="text-sm text-gray-500">
                      {isRecording ? 'Recording… tap to stop and get feedback' : 'Tap to start speaking'}
                    </p>
                    {isRecording && (
                      <button
                        type="button"
                        onClick={cancelRecording}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                        title="Discard this attempt without scoring it"
                      >
                        <X className="w-4 h-4" /> Cancel
                      </button>
                    )}

                    {/* Live transcription (desktop only — mobile gets it after stop) */}
                    {(transcription || interimTranscription) && (
                      <div className="w-full p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-xs font-semibold text-gray-500 mb-2">Your speech:</p>
                        <p className="text-gray-800">
                          {transcription}
                          <span className="text-gray-400 italic">{interimTranscription}</span>
                        </p>
                      </div>
                    )}

                    {/* Manual re-analyze button */}
                    {transcription && !isRecording && (
                      <button
                        onClick={() => analyzeWithAI(transcription)}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                      >
                        <CheckCircle className="w-4 h-4" /> Analyze My Response
                      </button>
                    )}
                  </div>
                )}

                {/* Transcribing (Groq Whisper) */}
                {isTranscribing && (
                  <div className="flex flex-col items-center py-8 space-y-3">
                    <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
                    <p className="text-gray-600 font-medium">Transcribing your audio…</p>
                  </div>
                )}

                {/* Analyzing */}
                {isAnalyzing && (
                  <div className="flex flex-col items-center py-8 space-y-3">
                    <RefreshCw className="w-10 h-10 text-purple-600 animate-spin" />
                    <p className="text-gray-600 font-medium">AI is scoring your response…</p>
                  </div>
                )}

                {/* Results */}
                {showResults && aiResult && (
                  <div className="space-y-4">
                    {transcription && (
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-xs font-semibold text-gray-500 mb-1">You said:</p>
                        <p className="text-sm text-gray-800 italic">"{transcription}"</p>
                        {playbackUrl && (
                          <audio src={playbackUrl} controls className="w-full mt-2 h-10" />
                        )}
                      </div>
                    )}

                    {/* Overall score ring */}
                    <div className="flex flex-col items-center py-4">
                      <div className="relative w-36 h-36">
                        <svg className="w-36 h-36 transform -rotate-90">
                          <circle cx="72" cy="72" r="60" stroke="#e5e7eb" strokeWidth="14" fill="none" />
                          <circle
                            cx="72" cy="72" r="60"
                            stroke={aiResult.overall_score >= 80 ? '#9333ea' : aiResult.overall_score >= 60 ? '#eab308' : '#ef4444'}
                            strokeWidth="14" fill="none"
                            strokeDasharray={`${2 * Math.PI * 60}`}
                            strokeDashoffset={`${2 * Math.PI * 60 * (1 - (aiResult.overall_score || 0) / 100)}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          {aiResult.band_score !== undefined ? (
                            <>
                              <span className="text-3xl font-bold text-gray-900">{Number(aiResult.band_score).toFixed(1)}</span>
                              <span className="text-xs text-gray-500">IELTS band</span>
                            </>
                          ) : (
                            <>
                              <span className="text-3xl font-bold text-gray-900">{Math.round(aiResult.overall_score || 0)}</span>
                              <span className="text-xs text-gray-500">Overall</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Sub-scores */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Task Response', score: aiResult.content_score },
                        { label: 'Fluency & Coherence', score: aiResult.fluency_score },
                        { label: 'Lexical Resource', score: aiResult.vocabulary_score },
                        { label: 'Grammar', score: aiResult.grammar_score },
                      ].map(({ label, score }) => (
                        <div key={label} className={`p-3 rounded-lg border text-center ${getScoreBg(score || 0)}`}>
                          <div className={`text-xl font-bold ${getScoreColor(score || 0)}`}>{Math.round(score || 0)}</div>
                          <div className="text-xs text-gray-600 mt-0.5">{label}</div>
                        </div>
                      ))}
                    </div>

                    {aiResult.strengths && (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm font-semibold text-green-800 mb-1">Strengths</p>
                        <p className="text-sm text-green-700">{aiResult.strengths}</p>
                      </div>
                    )}
                    {aiResult.mistakes && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm font-semibold text-red-800 mb-1">{"What's wrong"}</p>
                        <MistakeList mistakes={aiResult.mistakes} />
                      </div>
                    )}
                    {aiResult.suggestions && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm font-semibold text-blue-800 mb-1">What to improve</p>
                        <p className="text-sm text-blue-700 whitespace-pre-line">{aiResult.suggestions}</p>
                      </div>
                    )}
                    {aiResult.sample_improvement && (
                      <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <p className="text-sm font-semibold text-purple-800 mb-1">Improved answer</p>
                        <p className="text-sm text-purple-700 italic">"{aiResult.sample_improvement}"</p>
                      </div>
                    )}

                    <div className="flex gap-3 justify-between pt-2">
                      <button
                        onClick={() => { clearPlayback(); setTranscription(''); setAiResult(null); setShowResults(false); finalTranscriptRef.current = '' }}
                        className="flex items-center gap-2 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        <RefreshCw className="w-4 h-4" /> Try Again
                      </button>
                      <button
                        onClick={handleNextQuestion}
                        className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
                      >
                        {allAnswered
                          ? <span>Finish</span>
                          : <><span>Next</span><ArrowRight className="w-4 h-4" /></>}
                      </button>
                    </div>
                    {!allAnswered && (
                      <p className="text-xs text-gray-500 text-right">
                        Answer all questions to finish ({totalQuestions - answeredCount} left)
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default SpeakingAssessmentExercise
