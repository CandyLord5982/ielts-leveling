import React, { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import { useProgress } from '../../hooks/useProgress'
import { useFeedback } from '../../hooks/useFeedback'
import { ArrowLeft, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import LoadingSpinner from '../ui/LoadingSpinner'
import { callAIScoring as localAIScoring } from '../../utils/aiScoringService'
import RichTextRenderer from '../ui/RichTextRenderer'
import ExerciseHeader from '../ui/ExerciseHeader'
import AudioPlayer from '../ui/AudioPlayer'
import CelebrationScreen from '../ui/CelebrationScreen'
import TeacherExerciseNav from '../ui/TeacherExerciseNav'
import QuestionReportButton from '../reports/QuestionReportButton'

import { assetUrl } from '../../hooks/useBranding';
// Theme-based side decoration images for PC
const themeSideImages = {
  blue: {
    left: assetUrl('/image/theme_question/ice_left.png'),
    right: assetUrl('/image/theme_question/ice_right.png'),
  },
  green: {
    left: assetUrl('/image/theme_question/forest_left.png'),
    right: assetUrl('/image/theme_question/forest_right.png')
  },
  purple: {
    left: assetUrl('/image/theme_question/pirate.png'),
    right: assetUrl('/image/theme_question/pirate.png')
  },
  orange: {
    left: assetUrl('/image/theme_question/ninja_left.png'),
    right: assetUrl('/image/theme_question/ninja_right.png')
  },
  red: {
    left: assetUrl('/image/theme_question/dino_left.png'),
    right: assetUrl('/image/theme_question/dino_right.png')
  },
  yellow: {
    left: assetUrl('/image/theme_question/desert_left.png'),
    right: assetUrl('/image/theme_question/desert_right.png')
  }
}

const getThemeSideImages = (theme) => {
  return themeSideImages[theme] || themeSideImages.blue
}

const AIFillBlankExercise = ({ testMode = false, exerciseData = null, onAnswersCollected = null, initialAnswers = null }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { canCreateContent } = usePermissions()
  const { completeExerciseWithXP } = useProgress()
  const isTeacherView = canCreateContent()
  const { playCelebration, passGif } = useFeedback()

  const [exercise, setExercise] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [userAnswers, setUserAnswers] = useState(() => (testMode && initialAnswers) ? initialAnswers : {})
  const [aiScores, setAiScores] = useState({})
  const [isChecking, setIsChecking] = useState(false)
  const [showResults, setShowResults] = useState({})
  const [exerciseCompleted, setExerciseCompleted] = useState(false)
  const [language, setLanguage] = useState('en') // 'en' | 'vi'
  const [attempts, setAttempts] = useState(0)
  const [startTime, setStartTime] = useState(null)
  const [colorTheme, setColorTheme] = useState('blue')
  const [session, setSession] = useState(null)
  const [xpAwarded, setXpAwarded] = useState(0)
  const [questionStartTimes, setQuestionStartTimes] = useState({})
  const [teacherMode, setTeacherMode] = useState('review') // 'review' or 'do'

  // Keep language in sync with exercise settings (must be before any early returns)
  const exerciseLanguage = exercise?.content?.settings?.language
  useEffect(() => {
    if (exerciseLanguage && (exerciseLanguage === 'en' || exerciseLanguage === 'vi')) {
      setLanguage(exerciseLanguage)
    }
  }, [exerciseLanguage])

  // testMode: load exercise data from props
  useEffect(() => {
    if (!testMode || !exerciseData) return
    setExercise(exerciseData)
    setLoading(false)
  }, [testMode, exerciseData])

  // testMode: notify parent of answer changes
  const onAnswersCollectedRef = useRef(onAnswersCollected)
  onAnswersCollectedRef.current = onAnswersCollected
  useEffect(() => {
    if (testMode && onAnswersCollectedRef.current) {
      onAnswersCollectedRef.current(userAnswers)
    }
  }, [userAnswers, testMode])

  // Get exerciseId and sessionId from URL params
  const searchParams = new URLSearchParams(location.search)
  const exerciseId = searchParams.get('exerciseId')
  const sessionId = searchParams.get('sessionId')

  useEffect(() => {
    if (testMode) return
    if (exerciseId) {
      fetchExercise()
    }
  }, [exerciseId])

  useEffect(() => {
    if (testMode) return
    if (sessionId) {
      fetchSessionInfo()
    }
  }, [sessionId])

  const fetchSessionInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          units:unit_id (
            id,
            title,
            course_id,
            color_theme
          )
        `)
        .eq('id', sessionId)
        .single()

      if (error) throw error
      setSession(data)

      // Set color theme from session or unit
      const theme = data?.color_theme || data?.units?.color_theme || 'blue'
      setColorTheme(theme)
    } catch (err) {
      console.error('Error fetching session info:', err)
    }
  }

  // Start time tracking when exercise loads
  useEffect(() => {
    if (exercise && !startTime) {
      setStartTime(Date.now())
    }
  }, [exercise, startTime])

  // Track when each question starts
  useEffect(() => {
    if (!questionStartTimes[currentQuestionIndex]) {
      setQuestionStartTimes(prev => ({
        ...prev,
        [currentQuestionIndex]: Date.now()
      }))
    }
  }, [currentQuestionIndex])

  const fetchExercise = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exerciseId)
        .eq('exercise_type', 'ai_fill_blank')
        .single()

      if (error) throw error
      setExercise(data)
    } catch (error) {
      console.error('Error fetching exercise:', error)
      setError('Failed to load exercise')
    } finally {
      setLoading(false)
    }
  }

  const callAIScoreAPI = async (question, userAnswer, expectedAnswers) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch('/api/ai-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, userAnswer, expectedAnswers, context: 'educational assessment', language }),
        signal: controller.signal
      })
      clearTimeout(timeout)
      if (!response.ok) throw new Error(`AI API ${response.status}`)
      const result = await response.json()
      return {
        score: result.score || 0,
        explanation: result.explanation || 'No explanation provided',
        confidence: result.confidence || 0
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  const checkAnswer = async (questionIndex) => {
    if (!exercise) return

    const question = exercise.content.questions[questionIndex]
    const userAnswer = userAnswers[questionIndex] || ''

    if (!userAnswer.trim()) {
      alert('Please enter an answer before checking')
      return
    }

    setIsChecking(true)
    setAttempts(prev => prev + 1)

    const questionStartTime = questionStartTimes[questionIndex] || Date.now()

    try {
      let aiResult
      try {
        // Try production API first
        aiResult = await callAIScoreAPI(
          question.question,
          userAnswer,
          question.expected_answers || []
        )
      } catch (err) {
        console.warn('AI API failed, using local scoring fallback:', err?.message || err)
        aiResult = await localAIScoring(
          question.question,
          userAnswer,
          question.expected_answers || [],
          'educational assessment',
          language
        )
      }

      setAiScores(prev => ({
        ...prev,
        [questionIndex]: aiResult
      }))

      setShowResults(prev => ({
        ...prev,
        [questionIndex]: true
      }))

      // Save question attempt to database
      if (user && exerciseId) {
        try {
          const responseTime = Date.now() - questionStartTime
          const expectedAnswers = (question.expected_answers || []).join(', ')

          await supabase.from('question_attempts').insert({
            user_id: user.id,
            exercise_id: exerciseId,
            exercise_type: 'ai_fill_blank',
            question_id: question.id || `q${questionIndex}`,
            selected_answer: userAnswer,
            correct_answer: expectedAnswers,
            is_correct: aiResult.score >= 70,
            attempt_number: 1,
            response_time: responseTime
          })
        } catch (err) {
          console.log('⚠️ Could not save question attempt:', err.message)
        }
      }

    } catch (error) {
      console.error('Error checking answer:', error)
      alert('Error checking answer. Please try again.')
    } finally {
      setIsChecking(false)
    }
  }

  const nextQuestion = async () => {
    if (currentQuestionIndex < exercise.content.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1)
    } else {
      // Last question - complete the exercise (allow completion with any score)
      if (!exerciseCompleted) {
        // Calculate final score and complete
        const totalScore = Object.values(aiScores).reduce((sum, score) => sum + (score?.score || 0), 0)
        const averageScore = totalScore / exercise.content.questions.length
        const currentTime = Date.now()
        const totalTimeSpent = startTime ? Math.floor((currentTime - startTime) / 1000) : 0

        // Play celebration if passed
        if (averageScore >= 70) {
          playCelebration()
        }

        try {
          const roundedScore = Math.round(averageScore)
          const baseXP = exercise?.xp_reward || 10
          const bonusXP = roundedScore >= 95 ? Math.round(baseXP * 0.5) : roundedScore >= 90 ? Math.round(baseXP * 0.3) : 0
          const totalXP = baseXP + bonusXP

          const searchParams = new URLSearchParams(location.search)
          const exerciseId = searchParams.get('exerciseId')

          if (exerciseId && user && !isTeacherView) {
            const result = await completeExerciseWithXP(exerciseId, totalXP, {
              score: roundedScore,
              max_score: 100,
              time_spent: totalTimeSpent
            })
            // Use the actual XP awarded (may be 0 on retry with no improvement)
            setXpAwarded(result?.xpAwarded || 0)
          }

          setExerciseCompleted(true)
        } catch (error) {
          console.error('Error completing exercise:', error)
        }
      }
    }
  }

  const prevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1)
    }
  }

  const handleBackToSession = () => {
    const searchParams = new URLSearchParams(location.search)
    const sessionId = searchParams.get('sessionId')
    const courseId = searchParams.get('courseId') || session?.units?.course_id
    const unitId = searchParams.get('unitId') || session?.unit_id

    if (sessionId && courseId && unitId) {
      navigate(`/study/course/${courseId}/unit/${unitId}/session/${sessionId}`)
    } else if (sessionId) {
      navigate(`/session?id=${sessionId}`)
    } else if (courseId && unitId) {
      navigate(`/course/${courseId}/unit/${unitId}`)
    } else if (courseId) {
      navigate(`/course/${courseId}`)
    } else {
      navigate('/dashboard')
    }
  }

  // Extract <audio> tags from rich-text content so we can render AudioPlayer separately
  const extractAudioUrls = (htmlContent) => {
    if (!htmlContent) return []
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlContent, 'text/html')
    const audioElements = doc.querySelectorAll('audio')
    const audioData = []
    audioElements.forEach(el => {
      const src = el.getAttribute('src') || el.querySelector('source')?.getAttribute('src')
      if (src) {
        audioData.push({
          url: src,
          seekable: el.getAttribute('data-seekable') !== 'false',
          maxPlays: parseInt(el.getAttribute('data-max-plays') || '0', 10)
        })
      }
    })
    return audioData
  }

  // Strip audio tags from HTML to avoid duplicate players
  const stripAudioTags = (htmlContent) => {
    if (!htmlContent) return ''
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlContent, 'text/html')
    doc.querySelectorAll('audio').forEach(el => el.remove())
    return doc.body.innerHTML
  }

  const resetQuestion = (questionIndex) => {
    setUserAnswers(prev => ({
      ...prev,
      [questionIndex]: ''
    }))
    setAiScores(prev => {
      const newScores = { ...prev }
      delete newScores[questionIndex]
      return newScores
    })
    setShowResults(prev => ({
      ...prev,
      [questionIndex]: false
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  if (!exercise || !exercise.content.questions || exercise.content.questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">No Questions</h2>
          <p className="text-gray-600 mb-4">This exercise has no questions available.</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const currentQuestion = exercise.content.questions[currentQuestionIndex]
  const userAnswer = userAnswers[currentQuestionIndex] || ''
  const aiScore = aiScores[currentQuestionIndex]
  const showResult = showResults[currentQuestionIndex]

  // Audio embedded in rich-text content
  const exerciseIntroAudio = extractAudioUrls(exercise?.content?.intro)
  const currentQuestionAudio = extractAudioUrls(currentQuestion?.question)

  // testMode: simplified render for TestRunner
  if (testMode) {
    const questions = exercise?.content?.questions || []
    return (
      <div className="space-y-6">
        {exercise?.content?.intro && String(exercise.content.intro).trim() && (
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <RichTextRenderer content={stripAudioTags(exercise.content.intro)} allowImages allowLinks />
            {exerciseIntroAudio.length > 0 && (
              <div className="mt-3 space-y-2">
                {exerciseIntroAudio.map((audio, index) => (
                  <AudioPlayer key={index} audioUrl={audio.url} seekable={audio.seekable} maxPlays={audio.maxPlays} variant="outline" />
                ))}
              </div>
            )}
          </div>
        )}
        {questions.map((q, idx) => {
          const qAudio = extractAudioUrls(q.question)
          return (
          <div key={idx} className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-xs">{idx + 1}</span>
              <div className="flex-1">
                <RichTextRenderer content={stripAudioTags(q.question)} allowImages allowLinks />
                {qAudio.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {qAudio.map((audio, index) => (
                      <AudioPlayer key={index} audioUrl={audio.url} seekable={audio.seekable} maxPlays={audio.maxPlays} variant="outline" />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <textarea
              value={userAnswers[idx] || ''}
              onChange={(e) => setUserAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              rows={4}
              placeholder="Type your answer here..."
            />
          </div>
          )})}
      </div>
    )
  }

  // Teacher view: show all questions at once
  if (isTeacherView && teacherMode === 'review') {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{exercise?.title || 'AI Fill Blank'}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => session?.units ? navigate(`/study/course/${session.units.course_id}/unit/${session.units.id}/session/${sessionId}`) : navigate(-1)} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border rounded-lg">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setTeacherMode('review')}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-white shadow text-blue-700"
              >
                Review
              </button>
              <button
                onClick={() => setTeacherMode('do')}
                className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:text-gray-800"
              >
                Do
              </button>
            </div>
          </div>
        </div>
        {exercise?.content?.intro && String(exercise.content.intro).trim() && (
          <div className="mb-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <RichTextRenderer content={stripAudioTags(exercise.content.intro)} allowImages={true} allowLinks={false} />
            {exerciseIntroAudio.length > 0 && (
              <div className="mt-4 space-y-2">
                {exerciseIntroAudio.map((audio, index) => (
                  <AudioPlayer key={index} audioUrl={audio.url} seekable={audio.seekable} maxPlays={audio.maxPlays} variant="outline" />
                ))}
              </div>
            )}
          </div>
        )}
        <div className="space-y-6">
          {exercise.content.questions.map((q, idx) => {
            const qAudio = extractAudioUrls(q.question)
            return (
            <div key={idx} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-start gap-3 mb-3">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">{idx + 1}</span>
                <div className="flex-1">
                  <RichTextRenderer content={stripAudioTags(q.question)} allowImages={true} allowLinks={true} />
                  {qAudio.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {qAudio.map((audio, index) => (
                        <AudioPlayer key={index} audioUrl={audio.url} seekable={audio.seekable} maxPlays={audio.maxPlays} variant="outline" />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {q.expected_answers && q.expected_answers.length > 0 && (
                <div className="ml-11 mt-2 text-sm text-gray-500">
                  <span className="font-medium">Expected answers:</span> {q.expected_answers.join(', ')}
                </div>
              )}
            </div>
          )})}
        </div>
      </div>
    )
  }

  const sideImages = getThemeSideImages(colorTheme)

  return (
    <>
      {/* Left side image - only visible on desktop (md and up) - Fixed to viewport */}
      <div className="hidden md:block fixed left-0 bottom-[0%] w-48 lg:w-64 xl:w-80 pointer-events-none z-10">
        <img
          src={sideImages.left}
          alt="Theme decoration left"
          className="w-full h-auto object-contain"
          style={{ maxHeight: '80vh' }}
        />
      </div>

      {/* Right side image - only visible on desktop (md and up) - Fixed to viewport */}
      <div className="hidden md:block fixed right-0 bottom-[0%] w-48 lg:w-64 xl:w-80 pointer-events-none z-10">
        <img
          src={sideImages.right}
          alt="Theme decoration right"
          className="w-full h-auto object-contain"
          style={{ maxHeight: '80vh' }}
        />
      </div>

      <div className="relative min-h-screen bg-white">
        <div className="relative z-20">
      {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}

      {/* Teacher Do Mode Banner */}
      {isTeacherView && teacherMode === 'do' && (
        <div className="max-w-4xl mx-auto mt-4 px-4">
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            <span className="text-sm text-amber-800 font-medium">Teacher Preview — No XP will be awarded</span>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setTeacherMode('review')}
                className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:text-gray-800"
              >
                Review
              </button>
              <button
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-white shadow text-blue-700"
              >
                Do
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-4xl mx-auto py-8 px-4">
        <ExerciseHeader
          title={exercise?.title}
          progressPercentage={
            (Object.values(aiScores).filter(s => s && s.score >= 70).length / exercise.content.questions.length) * 100
          }
          showBatman={true}
          showProgressLabel={false}
          showQuestionCounter={false}
          targetInfo="AI sẽ chấm điểm"
          colorTheme={colorTheme}
        />
        {/* Exercise Intro */}
        {exercise?.content?.intro && String(exercise.content.intro).trim() && (
          <div className="mb-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <RichTextRenderer
              content={stripAudioTags(exercise.content.intro)}
              allowImages={true}
              allowLinks={false}
              style={{ whiteSpace: 'pre-wrap' }}
            />
            {exerciseIntroAudio.length > 0 && (
              <div className="mt-4 space-y-2">
                {exerciseIntroAudio.map((audio, index) => (
                  <AudioPlayer key={index} audioUrl={audio.url} seekable={audio.seekable} maxPlays={audio.maxPlays} variant="outline" />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 mt-8">
          {/* Question */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="text-lg text-gray-800 leading-relaxed flex-1 min-w-0">
                <RichTextRenderer
                  content={stripAudioTags(currentQuestion.question)}
                  allowImages={true}
                  allowLinks={true}
                  style={{ whiteSpace: 'pre-wrap' }}
                />
                {currentQuestionAudio.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {currentQuestionAudio.map((audio, index) => (
                      <AudioPlayer key={index} audioUrl={audio.url} seekable={audio.seekable} maxPlays={audio.maxPlays} variant="outline" />
                    ))}
                  </div>
                )}
              </div>
              <QuestionReportButton
                exercise={exercise}
                question={currentQuestion}
                questionIndex={currentQuestionIndex}
                userAnswer={userAnswer}
                className="flex-shrink-0"
              />
            </div>
            
            {/* Answer Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Answer:
              </label>
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswers(prev => ({
                  ...prev,
                  [currentQuestionIndex]: e.target.value
                }))}
                placeholder="Type your answer here..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                rows={3}
                disabled={showResult}
              />
            </div>

            {/* AI Score Result */}
            {showResult && aiScore && (
              <div className={`mb-4 p-4 rounded-lg border ${
                aiScore.score >= 70 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {aiScore.score >= 70 ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                  <span className={`font-medium ${
                    aiScore.score >= 70 ? 'text-green-800' : 'text-red-800'
                  }`}>
                    AI Score: {Math.round(aiScore.score)}%
                  </span>

                </div>
                <p className="text-sm text-gray-700">
                  <strong>AI Explanation:</strong> {aiScore.explanation}
                </p>
                {currentQuestion.expected_answers && currentQuestion.expected_answers.length > 0 && (
                  <p className="text-sm text-gray-700 mt-2">
                    <strong>{language === 'vi' ? 'Đáp án gợi ý:' : 'Suggested answer:'}</strong>{' '}
                    {currentQuestion.expected_answers.join(', ')}
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 items-center">
              <div className="ml-auto flex items-center gap-2">
                <label className="text-sm text-gray-600">Language:</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="en">English</option>
                  <option value="vi">Tiếng Việt</option>
                </select>
              </div>
              {!showResult ? (
                <button
                  onClick={() => checkAnswer(currentQuestionIndex)}
                  disabled={isChecking || !userAnswer.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isChecking ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      AI is checking...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Check with AI
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => resetQuestion(currentQuestionIndex)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <button
              onClick={prevQuestion}
              disabled={currentQuestionIndex === 0}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </button>

            <button
              onClick={nextQuestion}
              disabled={!showResult}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {currentQuestionIndex < exercise.content.questions.length - 1 ? 'Next' : 'Finish Exercise'}
              <ArrowLeft className="w-4 h-4 rotate-180" />
            </button>
          </div>

          {/* Celebration Screen */}
          {exerciseCompleted && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <CelebrationScreen
                score={Math.round(Object.values(aiScores).reduce((sum, score) => sum + (score?.score || 0), 0) / exercise.content.questions.length)}
                correctAnswers={Object.values(aiScores).filter(s => s && s.score >= 70).length}
                totalQuestions={exercise.content.questions.length}
                passThreshold={70}
                xpAwarded={xpAwarded}
                passGif={passGif}
                isRetryMode={false}
                wrongQuestionsCount={0}
                onRetryWrongQuestions={() => {}}
                onBackToList={handleBackToSession}
                exerciseId={new URLSearchParams(location.search).get('exerciseId')}
              />
            </div>
          )}
        </div>
      </div>
      </div>
      </div>
    </>
  )
}

export default AIFillBlankExercise
