import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import { useProgress } from '../../hooks/useProgress'
import { supabase } from '../../supabase/client'
import { saveRecentExercise } from '../../utils/recentExercise'
import Button from '../ui/Button'
import LoadingSpinner from '../ui/LoadingSpinner'
import RichTextRenderer from '../ui/RichTextRenderer'
import { Mic, Square, CheckCircle, XCircle, ArrowRight, ArrowLeft, Star } from 'lucide-react'
import AudioPlayer from '../ui/AudioPlayer'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import TeacherExerciseNav from '../ui/TeacherExerciseNav'

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

const PronunciationExercise = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { canCreateContent } = usePermissions()
  const { startExercise, completeExerciseWithXP } = useProgress()
  const isTeacherView = canCreateContent()
  const [teacherMode, setTeacherMode] = useState('review') // 'review' or 'do'

  // URL params
  const searchParams = new URLSearchParams(location.search)
  const exerciseId = searchParams.get('exerciseId')
  const sessionId = searchParams.get('sessionId')
  const challengeId = searchParams.get('challengeId') || null
  const isChallenge = searchParams.get('isChallenge') === 'true'

  // Track when student enters the exercise
  useEffect(() => {
    const initExercise = async () => {
      if (exerciseId && user) {
        // For challenges, capture exact start time
        if (isChallenge && challengeId) {
          const { startedAt } = await startExercise(exerciseId)
          setChallengeStartTime(startedAt)
          console.log('🏆 Challenge attempt started at:', startedAt)
        } else {
          await startExercise(exerciseId)
        }
      }
    }

    initExercise()
  }, [exerciseId, user])

  // Exercise state
  const [exercise, setExercise] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [session, setSession] = useState(null)
  const [colorTheme, setColorTheme] = useState('blue')

  // Quiz state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [questionResults, setQuestionResults] = useState([])
  const [isQuizComplete, setIsQuizComplete] = useState(false)
  const [startTime, setStartTime] = useState(null)
  const [challengeStartTime, setChallengeStartTime] = useState(null)
  const [xpAwarded, setXpAwarded] = useState(0)

  // Pronunciation state
  const [isRecording, setIsRecording] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [pronunciationScore, setPronunciationScore] = useState(null)
  const [accuracyScore, setAccuracyScore] = useState(null)
  const [fluencyScore, setFluencyScore] = useState(null)
  const [completenessScore, setCompletenessScore] = useState(null)
  const [wordScores, setWordScores] = useState([])
  const [audioUrl, setAudioUrl] = useState(null)
  const [showExplanation, setShowExplanation] = useState(false)

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [timerActive, setTimerActive] = useState(false)
  const timerIntervalRef = useRef(null)

  // Azure Speech SDK refs
  const recognizerRef = useRef(null)
  const audioConfigRef = useRef(null)

  // Azure Speech Service configuration (should be in environment variables)
  const AZURE_SPEECH_KEY = import.meta.env.VITE_AZURE_SPEECH_KEY || ''
  const AZURE_SPEECH_REGION = import.meta.env.VITE_AZURE_SPEECH_REGION || 'southeastasia'

  useEffect(() => {
    if (exerciseId) {
      fetchExercise()
      setStartTime(Date.now())
    } else {
      setLoading(false)
      setError('Exercise ID not found')
    }
  }, [exerciseId])

  useEffect(() => {
    if (sessionId) {
      fetchSessionInfo()
    }
  }, [sessionId])

  useEffect(() => {
    if (isQuizComplete && questionResults.length > 0) {
      markExerciseCompleted()
    }
  }, [isQuizComplete, questionResults.length])

  // Timer management - start timer when question changes
  useEffect(() => {
    if (questions.length > 0 && currentQuestionIndex < questions.length) {
      const currentQuestion = questions[currentQuestionIndex]
      const timeLimit = currentQuestion?.time_limit || 0

      // Clear any existing timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }

      if (timeLimit > 0) {
        setTimeRemaining(timeLimit)
        setTimerActive(true)
      } else {
        setTimeRemaining(null)
        setTimerActive(false)
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [currentQuestionIndex, questions])

  // Timer countdown
  useEffect(() => {
    if (timerActive && timeRemaining !== null && timeRemaining > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current)
            setTimerActive(false)
            // Auto-submit when time runs out
            handleTimeUp()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [timerActive, timeRemaining])

  const handleTimeUp = () => {
    // Auto-submit with current scores (or 0 if not recorded)
    handleNextQuestion()
  }

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

  const fetchExercise = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exerciseId)
        .eq('exercise_type', 'pronunciation')
        .single()

      if (error) throw error

      if (data && data.content && data.content.questions) {
        setExercise(data)
        setQuestions(data.content.questions)

        // Save recent exercise
        try {
          const continuePath = `/study/pronunciation?exerciseId=${data.id}&sessionId=${sessionId}`
          saveRecentExercise({
            ...data,
            continuePath
          })
        } catch { }
      } else {
        setError('No questions found in this exercise')
      }
    } catch (err) {
      console.error('Error fetching exercise:', err)
      setError('Unable to load exercise data')
    } finally {
      setLoading(false)
    }
  }

  const currentQuestion = questions[currentQuestionIndex]
  const totalQuestions = questions.length
  const currentQuestionNumber = currentQuestionIndex + 1

  const startPronunciationAssessment = async () => {
    if (!AZURE_SPEECH_KEY) {
      console.error('Azure Speech API key not configured')
      alert('Azure Speech Service not configured. Please add VITE_AZURE_SPEECH_KEY to your .env file')
      return
    }

    try {
      // Clean up any existing recognizer
      if (recognizerRef.current) {
        recognizerRef.current.close()
        recognizerRef.current = null
      }
      if (audioConfigRef.current) {
        audioConfigRef.current.close()
        audioConfigRef.current = null
      }

      setIsRecording(true)
      setPronunciationScore(null)
      setAccuracyScore(null)
      setFluencyScore(null)
      setCompletenessScore(null)
      setWordScores([])
      setTranscription('')
      setShowExplanation(false)

      const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION)
      speechConfig.speechRecognitionLanguage = 'en-US'

      audioConfigRef.current = sdk.AudioConfig.fromDefaultMicrophoneInput()

      // Configure pronunciation assessment
      // Strip HTML tags from reference text
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = currentQuestion.text
      const referenceText = (tempDiv.textContent || tempDiv.innerText || '').trim()

      console.log('Reference text being sent to Azure:', referenceText)
      console.log('Current question text:', currentQuestion.text)

      const pronunciationAssessmentConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme,
        true
      )

      // Create speech recognizer
      recognizerRef.current = new sdk.SpeechRecognizer(speechConfig, audioConfigRef.current)

      // Apply pronunciation assessment config
      pronunciationAssessmentConfig.applyTo(recognizerRef.current)

      // Use recognizeOnceAsync for single-phrase pronunciation assessment
      // This properly handles completeness scoring unlike continuous recognition
      recognizerRef.current.recognizeOnceAsync(
        (result) => {
          console.log('Recognition completed')
          if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            const pronunciationResult = sdk.PronunciationAssessmentResult.fromResult(result)

            console.log('Azure Pronunciation Result:', {
              pronunciationScore: pronunciationResult.pronunciationScore,
              accuracyScore: pronunciationResult.accuracyScore,
              fluencyScore: pronunciationResult.fluencyScore,
              completenessScore: pronunciationResult.completenessScore,
              prosodyScore: pronunciationResult.prosodyScore
            })

            setTranscription(result.text)
            setPronunciationScore(pronunciationResult.pronunciationScore)
            setAccuracyScore(pronunciationResult.accuracyScore)
            setFluencyScore(pronunciationResult.fluencyScore)
            setCompletenessScore(pronunciationResult.completenessScore)

            // Get word-level scores
            const words = result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)
            if (words) {
              const parsedWords = JSON.parse(words)
              console.log('Full Azure Response:', parsedWords)
              if (parsedWords.NBest && parsedWords.NBest[0] && parsedWords.NBest[0].Words) {
                setWordScores(parsedWords.NBest[0].Words)
              }
            }

            setShowExplanation(true)
            setIsRecording(false)
          } else if (result.reason === sdk.ResultReason.NoMatch) {
            setTranscription('Could not understand speech. Please try again.')
            setIsRecording(false)
          }
        },
        (err) => {
          console.error('Failed to recognize speech:', err)
          setTranscription('Error: ' + err)
          setIsRecording(false)
        }
      )

    } catch (error) {
      console.error('Error starting pronunciation assessment:', error)
      alert('Failed to start pronunciation assessment: ' + error.message)
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    if (recognizerRef.current) {
      recognizerRef.current.close()
      recognizerRef.current = null
    }
    if (audioConfigRef.current) {
      audioConfigRef.current.close()
      audioConfigRef.current = null
    }
    setIsRecording(false)
  }

  // Removed playAudio function - now using AudioPlayer component

  const handleNextQuestion = () => {
    // Save current question result
    const result = {
      questionId: currentQuestion.id,
      questionIndex: currentQuestionIndex,
      pronunciationScore: pronunciationScore || 0,
      accuracyScore: accuracyScore || 0,
      fluencyScore: fluencyScore || 0,
      completenessScore: completenessScore || 0,
      transcription: transcription
    }

    setQuestionResults([...questionResults, result])

    // Reset pronunciation state
    setPronunciationScore(null)
    setAccuracyScore(null)
    setFluencyScore(null)
    setCompletenessScore(null)
    setWordScores([])
    setTranscription('')
    setShowExplanation(false)

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setStartTime(Date.now())
    } else {
      setIsQuizComplete(true)
    }
  }

  const markExerciseCompleted = async () => {
    if (!user || !exerciseId || isTeacherView) return

    // Calculate average pronunciation score
    const avgScore = questionResults.reduce((sum, r) => sum + (r.pronunciationScore || 0), 0) / questionResults.length
    const score = Math.round(avgScore)

    console.log(`Completing pronunciation exercise: ${score}% average`)

    try {
      const baseXP = exercise?.xp_reward || 15
      const bonusXP = score >= 95 ? Math.round(baseXP * 0.5) : score >= 90 ? Math.round(baseXP * 0.3) : 0
      const totalXP = baseXP + bonusXP

      const result = await completeExerciseWithXP(exerciseId, totalXP, {
        score: score,
        max_score: 100,
        xp_earned: totalXP,
        challengeId: challengeId,  // Pass for daily challenge tracking
        challengeStartedAt: challengeStartTime  // Pass challenge start time for accurate timing
      })

      if (result.error && result.error !== 'Exercise already completed') {
        console.log('Exercise completion failed:', result.error)
        return
      }

      if (result.error === 'Exercise already completed') {
        console.log('Exercise was already completed')
        return
      }

      if (result.xpAwarded > 0) {
        setXpAwarded(result.xpAwarded)

      }
    } catch (err) {
      console.error('Error marking exercise completed:', err)
    }
  }


  const getScoreMessage = (score) => {
    if (score >= 90) return 'Excellent!'
    if (score >= 80) return 'Great!'
    if (score >= 70) return 'Okay!'
    if (score >= 60) return 'Fair'
    return 'Keep practicing!'
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">{error}</div>
        <Button onClick={fetchExercise} variant="outline">
          Try Again
        </Button>
      </div>
    )
  }

  if (!currentQuestion && !isTeacherView) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600 mb-4">No questions available</div>
        <Link to="/study">
          <Button variant="outline">Back to Study</Button>
        </Link>
      </div>
    )
  }

  // Teacher view: show all pronunciation questions at once
  if (isTeacherView && teacherMode === 'review') {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{exercise?.title || 'Pronunciation'}</h2>
          <div className="flex items-center gap-2">
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
            <button onClick={() => session?.units ? navigate(`/study/course/${session.units.course_id}/unit/${session.units.id}/session/${sessionId}`) : navigate(-1)} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border rounded-lg">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </div>
        </div>
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={idx} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">{idx + 1}</span>
                <div className="flex-1">
                  <div className="text-lg font-medium text-gray-900">
                    <RichTextRenderer content={q.text} allowImages={true} />
                  </div>
                  {q.phonetic && (
                    <p className="text-gray-500 mt-1">/{q.phonetic}/</p>
                  )}
                  {q.audio_url && (
                    <div className="mt-2">
                      <AudioPlayer audioUrl={q.audio_url} maxPlays={q.max_audio_plays || 0} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
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

      <div className="relative px-4">
        <div className="max-w-4xl mx-auto space-y-6 relative z-20">
        {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}

        {isTeacherView && teacherMode === 'do' && (
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
        )}

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4 md:p-5 border border-gray-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm font-medium text-gray-500 truncate mb-1">
                {exercise?.title}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs md:text-sm text-gray-600">Progress</span>
              <span className="text-xs md:text-sm font-semibold text-blue-600">
                {Math.round((currentQuestionNumber / totalQuestions) * 100)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${(currentQuestionNumber / totalQuestions) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Timer */}
          {timeRemaining !== null && (
            <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-orange-800">Time Remaining</span>
                <span className={`text-2xl font-bold ${timeRemaining <= 10 ? 'text-red-600 animate-pulse' : 'text-orange-600'}`}>
                  {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
                </span>
              </div>
              {timeRemaining <= 10 && (
                <p className="text-xs text-red-600 mt-1">⚠️ Question will auto-submit soon!</p>
              )}
            </div>
          )}
        </div>

        {/* Quiz Complete Screen */}
        {isQuizComplete && (
          <div className="bg-white rounded-lg shadow-md p-4 md:p-8 text-center border border-gray-200">
            <div className="mb-4">
              {(() => {
                const avgScore = questionResults.reduce((sum, r) => sum + (r.pronunciationScore || 0), 0) / questionResults.length
                const score = Math.round(avgScore)
                const passed = score >= 70

                return (
                  <>
                    <div className={`w-16 h-16 md:w-20 md:h-20 mx-auto mb-3 ${passed ? 'bg-green-100' : 'bg-orange-100'} rounded-full flex items-center justify-center`}>
                      {passed ? (
                        <CheckCircle className="w-8 h-8 md:w-10 md:h-10 text-green-500" />
                      ) : (
                        <XCircle className="w-8 h-8 md:w-10 md:h-10 text-orange-500" />
                      )}
                    </div>
                    <h2 className={`text-lg md:text-2xl font-bold mb-2 ${passed ? 'text-green-800' : 'text-orange-800'}`}>
                      {passed ? 'Great Job!' : 'Keep Practicing!'}
                    </h2>
                    <p className="text-sm md:text-base text-gray-600 mb-2">
                      Average Pronunciation Score: {score}%
                    </p>
                    {xpAwarded > 0 && (
                      <div className="flex items-center justify-center space-x-2 text-yellow-600 font-semibold text-sm md:text-base">
                        <Star className="w-4 h-4 md:w-5 md:h-5" />
                        <span>+{xpAwarded} XP earned!</span>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            <div className="space-y-4">
              <Button
                onClick={() => {
                  if (session && session.units) {
                    navigate(`/study/course/${session.units.course_id}/unit/${session.unit_id}/session/${sessionId}`)
                  } else {
                    navigate('/study')
                  }
                }}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white"
              >
                Back to Exercise List
              </Button>
            </div>
          </div>
        )}

        {/* Question Display */}
        {!isQuizComplete && (
          <div className="w-full max-w-4xl mx-auto rounded-lg p-4 md:p-8 bg-white shadow-md border border-gray-200 border-l-4 border-l-blue-400 relative">
            {/* Colored circles on top right */}
            <div className="absolute top-4 right-6 md:right-10 flex gap-2 z-20">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div className="space-y-4 md:space-y-6 pt-4">
              {/* Question Text */}
              <div className="mb-6">
                <div className="text-center">
                  <div className="text-xl md:text-3xl font-bold text-gray-900 mb-4">
                    <RichTextRenderer content={currentQuestion.text} />
                  </div>
                  {currentQuestion.phonetic && (
                    <p className="text-lg md:text-xl text-gray-600 mb-4">
                      /{currentQuestion.phonetic}/
                    </p>
                  )}
                  {currentQuestion.audio_url && (
                    <AudioPlayer
                      audioUrl={currentQuestion.audio_url}
                      maxPlays={currentQuestion.max_audio_plays || 0}
                      className="mb-4"
                      variant="outline"
                    />
                  )}
                </div>
              </div>

              {/* Recording Controls */}
              <div className="flex flex-col items-center space-y-4">
                <button
                  onClick={isRecording ? stopRecording : startPronunciationAssessment}
                  className={`w-20 h-20 rounded-full flex items-center justify-center transition-all transform hover:scale-105 ${
                    isRecording
                      ? 'bg-red-500 animate-pulse shadow-lg'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-md'
                  }`}
                >
                  {isRecording ? (
                    <Square className="w-8 h-8 text-white" />
                  ) : (
                    <Mic className="w-8 h-8 text-white" />
                  )}
                </button>
              </div>

              {/* Pronunciation Results */}
              {showExplanation && (
                <div className="space-y-4">
                  {pronunciationScore !== null && typeof pronunciationScore === 'number' && !isNaN(pronunciationScore) ? (
                    <>
                      {/* Expected text with Azure word-level scores */}
                      {transcription && (
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                          <h3 className="font-semibold text-gray-900 mb-3">Pronunciation Assessment:</h3>
                          <div className="text-lg leading-relaxed">
                            {(() => {
                              // Strip HTML tags from expected text
                              const tempDiv = document.createElement('div')
                              tempDiv.innerHTML = currentQuestion.text
                              const plainText = tempDiv.textContent || tempDiv.innerText || ''
                              const expectedWords = plainText.trim().split(/\s+/).filter(w => w.length > 0)

                              // Create a map of spoken words with their scores (case-insensitive)
                              const spokenWordsMap = {}
                              wordScores.forEach(word => {
                                const wordText = word.Word.toLowerCase()
                                if (!spokenWordsMap[wordText]) {
                                  spokenWordsMap[wordText] = []
                                }
                                spokenWordsMap[wordText].push(word.PronunciationAssessment?.AccuracyScore || 0)
                              })

                              return expectedWords.map((expectedWord, index) => {
                                let score = 0
                                let textColor = 'text-red-600' // Missing or not pronounced

                                // Check if this word was spoken (case-insensitive)
                                const expectedWordLower = expectedWord.toLowerCase()
                                if (spokenWordsMap[expectedWordLower] && spokenWordsMap[expectedWordLower].length > 0) {
                                  score = spokenWordsMap[expectedWordLower].shift() // Get first occurrence
                                  if (score >= 80) {
                                    textColor = 'text-green-600'
                                  } else if (score >= 60) {
                                    textColor = 'text-yellow-600'
                                  }
                                }

                                return (
                                  <span
                                    key={index}
                                    className={`inline-block px-1 font-semibold ${textColor}`}
                                    title={score > 0 ? `${Math.round(score)}% accuracy` : 'Not pronounced or missing'}
                                  >
                                    {expectedWord}
                                  </span>
                                )
                              })
                            })()}
                          </div>
                          <p className="text-sm text-gray-600 mt-2">You said: "{transcription}"</p>
                        </div>
                      )}

                      <div className="p-6 rounded-lg text-center">
                        <h3 className="font-semibold text-blue-900 mb-4">Pronunciation Score</h3>
                        <div className="flex justify-center items-center mb-4">
                          <div className="relative w-40 h-40">
                            <svg className="w-40 h-40 transform -rotate-90">
                              {/* Background circle */}
                              <circle
                                cx="80"
                                cy="80"
                                r="70"
                                stroke="#e5e7eb"
                                strokeWidth="16"
                                fill="none"
                              />
                              {/* Progress circle */}
                              <circle
                                cx="80"
                                cy="80"
                                r="70"
                                stroke={
                                  pronunciationScore >= 90 ? '#22c55e' :
                                  pronunciationScore >= 80 ? '#3b82f6' :
                                  pronunciationScore >= 70 ? '#eab308' :
                                  '#ef4444'
                                }
                                strokeWidth="16"
                                fill="none"
                                strokeDasharray={`${2 * Math.PI * 70}`}
                                strokeDashoffset={`${2 * Math.PI * 70 * (1 - pronunciationScore / 100)}`}
                                strokeLinecap="round"
                              />
                            </svg>
                            {/* Score text in center */}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-4xl font-bold text-gray-900">
                                {Math.round(pronunciationScore)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <p className="text-lg text-blue-800 font-medium">{getScoreMessage(pronunciationScore)}</p>
                      </div>
                    </>
                  ) : (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <h3 className="font-semibold text-red-900 mb-2">Recording Issue</h3>
                      <p className="text-sm text-red-700">
                        {transcription || 'Could not analyze your pronunciation. Please try recording again.'}
                      </p>
                      <p className="text-xs text-red-600 mt-2">
                        Make sure your microphone is working and you spoke clearly.
                      </p>
                    </div>
                  )}

                  {/* Next Button */}
                  <div className="flex justify-center md:justify-end">
                    <Button
                      onClick={handleNextQuestion}
                      className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white text-base md:text-lg px-6 md:px-8 py-3 md:py-4"
                    >
                      {currentQuestionIndex < questions.length - 1 ? (
                        <>
                          Next Question
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      ) : (
                        'Finish'
                      )}
                    </Button>
                  </div>
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

export default PronunciationExercise
