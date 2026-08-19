import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import { useProgress } from '../../hooks/useProgress'
import { supabase } from '../../supabase/client'
import { saveRecentExercise } from '../../utils/recentExercise'
import LoadingSpinner from '../ui/LoadingSpinner'
import RichTextRenderer from '../ui/RichTextRenderer'
import { Upload, ArrowRight, ArrowLeft, Star, RefreshCw, CheckCircle, Video, X, Clock, Lock, Play } from 'lucide-react'
import { assetUrl } from '../../hooks/useBranding'
import TeacherExerciseNav from '../ui/TeacherExerciseNav'
import { LEVELS, scoreSpeechWithLLM } from './SpeakingAssessmentExercise'

const themeSideImages = {
  blue: { left: assetUrl('/image/theme_question/ice_left.png'), right: assetUrl('/image/theme_question/ice_right.png') },
  green: { left: assetUrl('/image/theme_question/forest_left.png'), right: assetUrl('/image/theme_question/forest_right.png') },
  purple: { left: assetUrl('/image/theme_question/pirate.png'), right: assetUrl('/image/theme_question/pirate.png') },
  orange: { left: assetUrl('/image/theme_question/ninja_left.png'), right: assetUrl('/image/theme_question/ninja_right.png') },
  red: { left: assetUrl('/image/theme_question/dino_left.png'), right: assetUrl('/image/theme_question/dino_right.png') },
  yellow: { left: assetUrl('/image/theme_question/desert_left.png'), right: assetUrl('/image/theme_question/desert_right.png') },
}
const getThemeSideImages = (theme) => themeSideImages[theme] || themeSideImages.blue

const getLevelConfig = (value) => LEVELS.find(l => l.value === value) || LEVELS[2]

const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']

const fallbackResult = (msg = '') => ({
  overall_score: 50,
  content_score: 50,
  vocabulary_score: 50,
  grammar_score: 50,
  fluency_score: 50,
  strengths: 'Your video was uploaded successfully.',
  suggestions: msg || 'AI analysis is temporarily unavailable. Please try again.',
  sample_improvement: '',
})

const VideoUploadExercise = () => {
  const location = useLocation()
  const navigate = useNavigate()
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
  const [questionResults, setQuestionResults] = useState([])
  const [isQuizComplete, setIsQuizComplete] = useState(false)
  const [xpAwarded, setXpAwarded] = useState(0)

  // Video upload state
  const [selectedFile, setSelectedFile] = useState(null)
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null)
  const [uploadPhase, setUploadPhase] = useState('idle') // idle | uploading | transcribing | scoring | results
  const [uploadProgress, setUploadProgress] = useState(0)
  const [transcription, setTranscription] = useState('')
  const [aiResult, setAiResult] = useState(null)
  const fileInputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [classVideos, setClassVideos] = useState([])
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [playingVideoId, setPlayingVideoId] = useState(null)

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

  // Fetch class videos
  useEffect(() => {
    if (exerciseId && user) fetchClassVideos()
  }, [exerciseId, user])

  const fetchClassVideos = async () => {
    try {
      const { data } = await supabase
        .from('video_submissions')
        .select('id, user_id, video_url, ai_score, created_at, question_index')
        .eq('exercise_id', exerciseId)
        .order('created_at', { ascending: false })

      if (!data || data.length === 0) return

      // Check if current user has submitted
      const userHasSubmitted = data.some(v => v.user_id === user.id)
      setHasSubmitted(userHasSubmitted)

      // Get unique user IDs for profiles
      const userIds = [...new Set(data.map(v => v.user_id))]
      const { data: profiles } = await supabase
        .from('users')
        .select('id, full_name, avatar_url')
        .in('id', userIds)

      const profileMap = {}
      ;(profiles || []).forEach(p => { profileMap[p.id] = p })

      // Keep only the latest submission per user
      const seen = new Set()
      const unique = data.filter(v => {
        if (seen.has(v.user_id)) return false
        seen.add(v.user_id)
        return true
      })

      setClassVideos(unique.map(v => ({
        ...v,
        profile: profileMap[v.user_id] || { full_name: 'Student', avatar_url: null },
      })))
    } catch (err) {
      console.error('Error fetching class videos:', err)
    }
  }

  // Clean up video preview URL
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl)
    }
  }, [videoPreviewUrl])

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
        .eq('exercise_type', 'video_upload')
        .single()
      if (error) throw error
      setExercise(data)
      const qs = data?.content?.questions || []
      setQuestions(qs)
      if (qs.length) {
        try {
          saveRecentExercise({ ...data, continuePath: `/study/video-upload?exerciseId=${data.id}&sessionId=${sessionId}` })
        } catch { }
      }
    } catch (err) {
      console.error('Error fetching exercise:', err)
      setError('Unable to load exercise data')
    } finally {
      setLoading(false)
    }
  }

  const validateFile = (file) => {
    if (!file) return 'No file selected'
    if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
      return 'Invalid file type. Please upload an MP4, WebM, or MOV video.'
    }
    const maxSizeMb = questions[currentQuestionIndex]?.max_file_size_mb || 50
    if (file.size > maxSizeMb * 1024 * 1024) {
      return `File too large. Maximum size is ${maxSizeMb} MB.`
    }
    return null
  }

  const handleFileSelect = (file) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setSelectedFile(file)
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl)
    setVideoPreviewUrl(URL.createObjectURL(file))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const clearFile = () => {
    setSelectedFile(null)
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl)
    setVideoPreviewUrl(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmitVideo = async () => {
    if (!selectedFile || !user) return
    setError(null)

    try {
      // Phase 1: Upload to Supabase Storage
      setUploadPhase('uploading')
      setUploadProgress(0)

      const ext = selectedFile.name.split('.').pop() || 'mp4'
      const filePath = `${user.id}/${Date.now()}.${ext}`

      // Simulate progress since Supabase JS doesn't expose it
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 5, 90))
      }, 300)

      const { error: uploadError } = await supabase.storage
        .from('exercise-videos')
        .upload(filePath, selectedFile, { contentType: selectedFile.type })

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('exercise-videos')
        .getPublicUrl(filePath)

      const publicUrl = urlData?.publicUrl
      if (!publicUrl) throw new Error('Failed to get video URL')

      const skipScoring = exercise?.content?.skip_scoring

      if (skipScoring) {
        // Upload only — save submission without transcription/scoring
        try {
          await supabase.from('video_submissions').insert({
            user_id: user.id,
            exercise_id: exerciseId,
            session_id: sessionId || null,
            question_index: currentQuestionIndex,
            video_url: publicUrl,
            transcription: null,
            ai_result: null,
            ai_score: null,
            status: 'pending',
          })
        } catch (err) {
          console.error('Error saving submission:', err)
        }

        setHasSubmitted(true)
        fetchClassVideos()

        // Move to next question or finish
        if (currentQuestionIndex < questions.length - 1) {
          setQuestionResults(prev => [...prev, { questionIndex: currentQuestionIndex, transcription: '', overallScore: 0, aiResult: null }])
          setUploadPhase('idle')
          clearFile()
          setCurrentQuestionIndex(prev => prev + 1)
        } else {
          // Last question — complete exercise
          try {
            const baseXP = exercise?.xp_reward || 10
            const result = await completeExerciseWithXP(exerciseId, baseXP, { score: 100, max_score: 100, xp_earned: baseXP })
            if (result?.xpAwarded > 0) setXpAwarded(result.xpAwarded)
          } catch (e) {
            console.error('Failed to complete exercise:', e)
          }
          setUploadPhase('done')
        }
        return
      }

      // Phase 2: Transcribe via AssemblyAI
      setUploadPhase('transcribing')

      const transcribeRes = await fetch('/api/transcribe-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: publicUrl }),
      })

      if (!transcribeRes.ok) {
        const errData = await transcribeRes.json().catch(() => ({}))
        throw new Error(errData.error || 'Transcription failed')
      }

      const transcribeData = await transcribeRes.json()
      if (!transcribeData.success) throw new Error(transcribeData.error || 'Transcription failed')

      const spokenText = transcribeData.text || ''
      setTranscription(spokenText)

      if (!spokenText.trim()) {
        setAiResult(fallbackResult('No speech detected in your video. Please upload a video with clear spoken audio.'))
        setUploadPhase('results')
        return
      }

      // Phase 3: AI scoring
      setUploadPhase('scoring')
      const q = questions[currentQuestionIndex]

      let aiScoreResult
      try {
        aiScoreResult = await scoreSpeechWithLLM(
          q.prompt, spokenText, q.key_points, q.evaluation_criteria,
          exercise?.content?.level
        )
        setAiResult(aiScoreResult)
      } catch (err) {
        console.error('AI scoring error:', err)
        aiScoreResult = fallbackResult()
        setAiResult(aiScoreResult)
      }

      // Phase 4: Save submission to DB for teacher review
      try {
        await supabase.from('video_submissions').insert({
          user_id: user.id,
          exercise_id: exerciseId,
          session_id: sessionId || null,
          question_index: currentQuestionIndex,
          video_url: publicUrl,
          transcription: spokenText,
          ai_result: aiScoreResult,
          ai_score: Math.round(aiScoreResult?.overall_score || 0),
          status: 'pending',
        })
      } catch (err) {
        console.error('Error saving submission:', err)
      }

      // Refresh class videos after submission
      setHasSubmitted(true)
      fetchClassVideos()

      setUploadPhase('results')
    } catch (err) {
      console.error('Video processing error:', err)
      setError(err.message || 'An error occurred. Please try again.')
      setUploadPhase('idle')
    }
  }

  const handleNextQuestion = () => {
    setQuestionResults(prev => [...prev, {
      questionIndex: currentQuestionIndex,
      transcription,
      overallScore: aiResult?.overall_score || 0,
      aiResult,
    }])
    // Reset state for next question
    setTranscription('')
    setAiResult(null)
    setUploadPhase('idle')
    clearFile()

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    } else {
      setIsQuizComplete(true)
    }
  }

  const handleRetry = () => {
    setTranscription('')
    setAiResult(null)
    setUploadPhase('idle')
    clearFile()
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

  if (error && uploadPhase === 'idle' && !selectedFile) {
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
            <h2 className="text-2xl font-bold text-gray-900">{exercise?.title || 'Video Upload'}</h2>
            {exercise?.content?.level && (() => { const lc = getLevelConfig(exercise.content.level); return (
              <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium border ${lc.color}`}>
                {lc.emoji} {lc.label} · {lc.ageRange}
              </span>
            )})()}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTeacherPreview(false)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium"
            >
              <Video className="w-4 h-4" /> Attempt Exercise
            </button>
            <button onClick={() => session?.units ? navigate(`/study/course/${session.units.course_id}/unit/${session.units.id}/session/${sessionId}`) : navigate(-1)} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border rounded-lg">
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
                <span className="flex-shrink-0 w-8 h-8 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center font-bold text-sm">{idx + 1}</span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-teal-600 uppercase tracking-wide mb-1">Video Upload Task</p>
                  <div className="text-lg font-semibold text-gray-900 mb-2">
                    <RichTextRenderer content={q.prompt} allowImages={true} />
                  </div>
                  {q.instructions && <p className="text-sm text-gray-600 mb-2">{q.instructions}</p>}
                  {q.key_points?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {q.key_points.map((kp, i) => (
                        <span key={i} className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs rounded-full">{kp}</span>
                      ))}
                    </div>
                  )}
                  {q.max_file_size_mb && <p className="text-xs text-gray-500 mt-2">Max file size: {q.max_file_size_mb} MB</p>}
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
  const sideImages = getThemeSideImages(colorTheme)

  return (
    <>
      <div className="hidden md:block fixed left-0 bottom-0 w-48 lg:w-64 xl:w-80 pointer-events-none z-10">
        <img src={sideImages.left} alt="" className="w-full h-auto object-contain" style={{ maxHeight: '80vh' }} />
      </div>
      <div className="hidden md:block fixed right-0 bottom-0 w-48 lg:w-64 xl:w-80 pointer-events-none z-10">
        <img src={sideImages.right} alt="" className="w-full h-auto object-contain" style={{ maxHeight: '80vh' }} />
      </div>

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
              {exercise?.content?.level && (() => { const lc = getLevelConfig(exercise.content.level); return (
                <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${lc.color}`}>
                  {lc.emoji} {lc.label}
                </span>
              )})()}
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600">Progress</span>
                <span className="text-xs font-semibold text-teal-600">{currentQuestionIndex + 1} / {totalQuestions}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-teal-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Complete screen */}
          {isQuizComplete && (
            <div className="bg-white rounded-lg shadow-md p-8 text-center border border-gray-200">
              <div className="w-20 h-20 mx-auto mb-4 bg-teal-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-teal-500" />
              </div>
              <h2 className="text-2xl font-bold text-teal-800 mb-2">Exercise Complete!</h2>
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
                className="w-full max-w-sm mx-auto block px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium"
              >
                Back to Exercise List
              </button>
            </div>
          )}

          {/* Question card */}
          {!isQuizComplete && currentQuestion && (
            <div className="bg-white rounded-lg shadow-md p-4 md:p-8 border border-gray-200 border-l-4 border-l-teal-400 relative">
              <div className="absolute top-4 right-6 flex gap-2 z-20">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>

              <div className="space-y-5 pt-4">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-teal-600" />
                  <span className="text-xs font-semibold text-teal-600 uppercase tracking-wide">
                    Video Task {currentQuestionIndex + 1}
                  </span>
                </div>

                {/* Prompt */}
                <div className="p-4 bg-teal-50 rounded-lg border border-teal-100">
                  <div className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
                    <RichTextRenderer content={currentQuestion.prompt} />
                  </div>
                  {currentQuestion.instructions && (
                    <p className="text-sm text-gray-600 mt-2">{currentQuestion.instructions}</p>
                  )}
                </div>

                {/* Key points */}
                {currentQuestion.key_points?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Points to cover:</p>
                    <div className="flex flex-wrap gap-2">
                      {currentQuestion.key_points.map((kp, i) => (
                        <span key={i} className="px-3 py-1 bg-teal-100 text-teal-700 text-sm rounded-full">{kp}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload section */}
                {uploadPhase === 'idle' && (
                  <div className="space-y-4">
                    {error && (
                      <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-center">
                        {error}
                      </div>
                    )}

                    {!selectedFile ? (
                      <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={() => fileInputRef.current?.click()}
                        className={`flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                          isDragOver
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'
                        }`}
                      >
                        <Upload className={`w-12 h-12 mb-3 ${isDragOver ? 'text-teal-500' : 'text-gray-400'}`} />
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          {isDragOver ? 'Drop your video here' : 'Click or drag & drop to upload'}
                        </p>
                        <p className="text-xs text-gray-500">
                          MP4, WebM, or MOV · Max {currentQuestion.max_file_size_mb || 50} MB
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                          className="hidden"
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Video preview */}
                        <div className="relative rounded-xl overflow-hidden bg-black">
                          <video
                            src={videoPreviewUrl}
                            controls
                            className="w-full max-h-80 object-contain"
                          />
                          <button
                            onClick={clearFile}
                            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                            title="Remove video"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <span className="truncate max-w-xs">{selectedFile.name}</span>
                          <span>{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                        </div>
                        <button
                          onClick={handleSubmitVideo}
                          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
                        >
                          <Upload className="w-5 h-5" />
                          Submit Video for Review
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Uploading */}
                {uploadPhase === 'uploading' && (
                  <div className="flex flex-col items-center py-8 space-y-4">
                    <Upload className="w-10 h-10 text-teal-500 animate-bounce" />
                    <p className="text-gray-600 font-medium">Uploading video...</p>
                    <div className="w-full max-w-xs bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-teal-500 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500">{uploadProgress}%</p>
                  </div>
                )}

                {/* Transcribing */}
                {uploadPhase === 'transcribing' && (
                  <div className="flex flex-col items-center py-8 space-y-3">
                    <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
                    <p className="text-gray-600 font-medium">Transcribing speech from your video...</p>
                    <p className="text-xs text-gray-400">This may take up to a minute</p>
                  </div>
                )}

                {/* Scoring */}
                {uploadPhase === 'scoring' && (
                  <div className="flex flex-col items-center py-8 space-y-3">
                    <RefreshCw className="w-10 h-10 text-teal-600 animate-spin" />
                    <p className="text-gray-600 font-medium">AI is scoring your response...</p>
                  </div>
                )}

                {/* Results */}
                {uploadPhase === 'results' && aiResult && (
                  <div className="space-y-4">
                    {/* Pending teacher review banner */}
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                      <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800">Submitted for teacher review</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          The AI score below is a reference. Your teacher will review your video and give the final score.
                        </p>
                      </div>
                    </div>

                    {transcription && (
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-xs font-semibold text-gray-500 mb-1">Transcription:</p>
                        <p className="text-sm text-gray-800 italic">"{transcription}"</p>
                      </div>
                    )}

                    {/* AI score (reference only) */}
                    <p className="text-xs text-center text-gray-400 uppercase tracking-wide">AI Reference Score</p>
                    <div className="flex flex-col items-center py-4">
                      <div className="relative w-36 h-36">
                        <svg className="w-36 h-36 transform -rotate-90">
                          <circle cx="72" cy="72" r="60" stroke="#e5e7eb" strokeWidth="14" fill="none" />
                          <circle
                            cx="72" cy="72" r="60"
                            stroke={aiResult.overall_score >= 80 ? '#0d9488' : aiResult.overall_score >= 60 ? '#eab308' : '#ef4444'}
                            strokeWidth="14" fill="none"
                            strokeDasharray={`${2 * Math.PI * 60}`}
                            strokeDashoffset={`${2 * Math.PI * 60 * (1 - (aiResult.overall_score || 0) / 100)}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-bold text-gray-900">{Math.round(aiResult.overall_score || 0)}</span>
                          <span className="text-xs text-gray-500">Overall</span>
                        </div>
                      </div>
                    </div>

                    {/* Sub-scores */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Content', score: aiResult.content_score },
                        { label: 'Vocabulary', score: aiResult.vocabulary_score },
                        { label: 'Grammar', score: aiResult.grammar_score },
                        { label: 'Fluency', score: aiResult.fluency_score },
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
                    {aiResult.suggestions && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm font-semibold text-blue-800 mb-1">Suggestions</p>
                        <p className="text-sm text-blue-700">{aiResult.suggestions}</p>
                      </div>
                    )}
                    {aiResult.sample_improvement && (
                      <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
                        <p className="text-sm font-semibold text-teal-800 mb-1">Example improvement</p>
                        <p className="text-sm text-teal-700 italic">"{aiResult.sample_improvement}"</p>
                      </div>
                    )}

                    <div className="flex gap-3 justify-between pt-2">
                      <button
                        onClick={handleRetry}
                        className="flex items-center gap-2 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        <RefreshCw className="w-4 h-4" /> Try Again
                      </button>
                      <button
                        onClick={handleNextQuestion}
                        className="flex items-center gap-2 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium"
                      >
                        {currentQuestionIndex < questions.length - 1
                          ? <><span>Next</span><ArrowRight className="w-4 h-4" /></>
                          : <span>Finish</span>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Upload-only done state */}
                {uploadPhase === 'done' && (
                  <div className="flex flex-col items-center py-10 space-y-4">
                    <CheckCircle className="w-16 h-16 text-green-500" />
                    <h3 className="text-lg font-semibold text-gray-900">Video Submitted!</h3>
                    <p className="text-sm text-gray-500 text-center">Your video has been uploaded. Your teacher will review it.</p>
                    {xpAwarded > 0 && (
                      <div className="flex items-center gap-1 px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
                        <Star className="w-4 h-4" /> +{xpAwarded} XP
                      </div>
                    )}
                    <button
                      onClick={() => navigate(-1)}
                      className="flex items-center gap-2 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium mt-2"
                    >
                      <ArrowLeft className="w-4 h-4" /> Go Back
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Class Videos Section */}
          {classVideos.length > 0 && !isTeacherView && (
            <div className="relative">
              <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 text-teal-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Class Videos</h3>
                  <span className="text-xs text-gray-400 ml-auto">{classVideos.length}</span>
                </div>

                <div className="relative">
                  {/* Lock overlay - only covers classmate videos, user's own always visible */}
                  {!hasSubmitted && classVideos.some(v => v.user_id !== user?.id) && (
                    <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-sm flex items-center justify-center gap-2 rounded-b-lg">
                      <Lock className="w-4 h-4 text-gray-400" />
                      <p className="text-sm text-gray-500">Submit your video to unlock</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-2 max-h-[400px] overflow-y-auto">
                    {classVideos.map(v => {
                      const isMe = v.user_id === user?.id
                      return (
                        <div key={v.id} className={`rounded-lg overflow-hidden border ${isMe ? 'border-teal-300 ring-1 ring-teal-200' : 'border-gray-100'}`}>
                          {playingVideoId === v.id ? (
                            <video
                              src={v.video_url}
                              controls
                              autoPlay
                              className="w-full aspect-video bg-black object-contain"
                            />
                          ) : (
                            <button
                              onClick={() => setPlayingVideoId(v.id)}
                              className="w-full aspect-video bg-gray-900 flex items-center justify-center group hover:bg-gray-800 transition-colors relative"
                            >
                              <Play className="w-8 h-8 text-white/60 group-hover:text-white/90 transition-colors" />
                            </button>
                          )}
                          <div className={`flex items-center gap-1.5 px-2 py-1.5 ${isMe ? 'bg-teal-50' : 'bg-gray-50'}`}>
                            <div className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {v.profile.avatar_url ? (
                                <img src={v.profile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                              ) : (
                                <span className="text-teal-700 font-bold text-[10px]">
                                  {v.profile.full_name?.charAt(0).toUpperCase() || 'S'}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-700 truncate flex-1">
                              {isMe ? 'You' : v.profile.full_name}
                            </span>
                            {v.ai_score != null && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                v.ai_score >= 80 ? 'bg-green-100 text-green-700' : v.ai_score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {v.ai_score}%
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {classVideos.length === 0 && (
                      <div className="col-span-full py-6 text-center text-gray-400 text-xs">
                        No submissions yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default VideoUploadExercise
