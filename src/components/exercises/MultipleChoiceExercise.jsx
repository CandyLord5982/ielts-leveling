import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { saveRecentExercise } from '../../utils/recentExercise'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import { useProgress } from '../../hooks/useProgress'
import { useFeedback } from '../../hooks/useFeedback'
import { usePet } from '../../hooks/usePet'
import { supabase } from '../../supabase/client'
import Button from '../ui/Button'
import LoadingSpinner from '../ui/LoadingSpinner'
import RichTextRenderer, { RichTextWithAudio } from '../ui/RichTextRenderer'
import { CheckCircle, XCircle, ArrowRight, ArrowLeft, Star, MessageCircle } from 'lucide-react'
import Button3D from '../ui/Button3D'
import ExerciseHeader from '../ui/ExerciseHeader'
import CelebrationScreen from '../ui/CelebrationScreen'
import PetTutorBubble from '../pet/PetTutorBubble'
import { getPetTutorExplanation } from '../../utils/petChatService'
import { FEATURES } from '../../config/features'
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

const MultipleChoiceExercise = ({ testMode = false, exerciseData = null, onAnswersCollected = null, initialAnswers = null }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { canCreateContent } = usePermissions()
  const { startExercise, completeExerciseWithXP } = useProgress()
  const { currentMeme, showMeme, playFeedback, playCelebration, passGif } = useFeedback()
  const { activePet, drainPetEnergy, userEnergy } = usePet()

  // URL params
  const searchParams = new URLSearchParams(location.search)
  const exerciseId = searchParams.get('exerciseId')
  const sessionId = searchParams.get('sessionId')
  const challengeId = searchParams.get('challengeId') || null
  const isChallenge = searchParams.get('isChallenge') === 'true'

  // Exercise state
  const [exercise, setExercise] = useState(null)
  const [questions, setQuestions] = useState([])
  const [originalQuestions, setOriginalQuestions] = useState([]) // Store original questions for retry
  const [shuffledQuestions, setShuffledQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [session, setSession] = useState(null)
  const [colorTheme, setColorTheme] = useState('blue')

  // Quiz state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const [questionResults, setQuestionResults] = useState([]) // Array of {questionId, isCorrect, selectedAnswer, correctAnswer}
  const [isQuizComplete, setIsQuizComplete] = useState(false)
  const [wrongQuestions, setWrongQuestions] = useState([])
  const [firstAttemptResults, setFirstAttemptResults] = useState([]) // Store first attempt results for merging after retry
  const [isRetryMode, setIsRetryMode] = useState(false)
  const [attemptNumber, setAttemptNumber] = useState(1)
  const [startTime, setStartTime] = useState(null)
  const [challengeStartTime, setChallengeStartTime] = useState(null)
  const [xpAwarded, setXpAwarded] = useState(0)
  const [isBatmanMoving, setIsBatmanMoving] = useState(false)

  // View mode state - read from exercise settings (force all-at-once in testMode)
  const isTeacherView = canCreateContent()
  const [teacherMode, setTeacherMode] = useState('review') // 'review' or 'do'
  const [viewMode, setViewMode] = useState(testMode ? 'all-at-once' : 'one-by-one')
  const [allAnswers, setAllAnswers] = useState(() => (testMode && initialAnswers) ? initialAnswers : {}) // Object to store all answers: {questionIndex: selectedAnswerIndex}
  const [showAllResults, setShowAllResults] = useState(false)

  // testMode: notify parent of answer changes (use ref to avoid infinite loops)
  const onAnswersCollectedRef = useRef(onAnswersCollected)
  onAnswersCollectedRef.current = onAnswersCollected
  useEffect(() => {
    if (testMode && onAnswersCollectedRef.current) {
      onAnswersCollectedRef.current(allAnswers)
    }
  }, [allAnswers, testMode])

  // Celebration state
  const [hasPlayedPassAudio, setHasPlayedPassAudio] = useState(false)

  // Pet tutor state
  const [showPetTutor, setShowPetTutor] = useState(false)
  const [petTutorLoading, setPetTutorLoading] = useState(false)
  const [petTutorMessage, setPetTutorMessage] = useState('')

  // Play pass audio and show GIF when quiz is completed and passed
  useEffect(() => {
    if (testMode) return
    if (isQuizComplete && !hasPlayedPassAudio) {
      const correctAnswers = questionResults.filter(r => r.isCorrect).length
      const totalQuestions = questionResults.length
      const score = Math.round((correctAnswers / totalQuestions) * 100)
      const passed = score >= 80

      if (passed) {
        playCelebration()
        setHasPlayedPassAudio(true)
      }
    }
  }, [isQuizComplete, hasPlayedPassAudio, questionResults, playCelebration, testMode])


  // testMode: load exercise data from props
  useEffect(() => {
    if (!testMode || !exerciseData) return
    setExercise(exerciseData)
    setViewMode('all-at-once')

    // In testMode: skip shuffling so indices match original correct_answer for grading
    const processedQuestions = (exerciseData.content?.questions || []).map(q => q)
    setQuestions(processedQuestions)
    setOriginalQuestions(processedQuestions)
    setLoading(false)
  }, [testMode, exerciseData])

  useEffect(() => {
    if (testMode) return
    const initExercise = async () => {
      if (exerciseId) {
        await fetchExercise()
        setStartTime(Date.now())
        // Track when student enters the exercise
        if (user) {
          // For challenges, capture exact start time
          if (isChallenge && challengeId) {
            const { startedAt } = await startExercise(exerciseId)
            setChallengeStartTime(startedAt)
            console.log('🏆 Challenge attempt started at:', startedAt)
          } else {
            await startExercise(exerciseId)
          }
        }
      } else {
        setLoading(false)
        setError('Không tìm thấy ID bài tập')
      }
    }

    initExercise()
  }, [exerciseId, user])

  // Fetch max attempt_number from database to continue from where we left off
  useEffect(() => {
    if (testMode) return
    const fetchMaxAttemptNumber = async () => {
      if (!exerciseId || !user) return

      try {
        const { data, error } = await supabase
          .from('question_attempts')
          .select('attempt_number')
          .eq('user_id', user.id)
          .eq('exercise_id', exerciseId)
          .order('attempt_number', { ascending: false })
          .limit(1)

        if (error) throw error

        if (data && data.length > 0) {
          // Start from the next attempt number
          setAttemptNumber(data[0].attempt_number + 1)
        }
      } catch (err) {
        console.log('Could not fetch attempt number:', err.message)
      }
    }

    fetchMaxAttemptNumber()
  }, [exerciseId, user])

  // Allow scrolling on all devices
  useEffect(() => {
    document.body.style.overflow = 'auto'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    if (testMode) return
    if (sessionId) {
      fetchSessionInfo()
    }
  }, [sessionId])

  // Handle quiz completion (both first attempt and retry)
  useEffect(() => {
    if (testMode) return
    if (isQuizComplete && questionResults.length > 0) {
      markExerciseCompleted()
    }
  }, [isQuizComplete, questionResults.length])

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
        .eq('exercise_type', 'multiple_choice')
        .single()

      if (error) throw error

      if (data && data.content && data.content.questions) {
        setExercise(data)

        // Set view mode from exercise settings
        const exerciseSettings = data.content.settings || {}
        const exerciseViewMode = exerciseSettings.view_mode || 'one-by-one'
        setViewMode(exerciseViewMode)

        // Shuffle options for each question if shuffle_options is enabled
        const processedQuestions = data.content.questions.map(q => {
          if (q.shuffle_options === false) {
            // Don't shuffle - keep original order
            return q
          }

          // Shuffle options
          const shuffledOptionsMap = q.options.map((opt, idx) => ({ option: opt, originalIndex: idx }))
          // Fisher-Yates shuffle
          for (let i = shuffledOptionsMap.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledOptionsMap[i], shuffledOptionsMap[j]] = [shuffledOptionsMap[j], shuffledOptionsMap[i]]
          }

          const shuffledOptions = shuffledOptionsMap.map(item => item.option)
          const newCorrectIndex = shuffledOptionsMap.findIndex(item => item.originalIndex === q.correct_answer)

          // Shuffle option_explanations in the same order as options
          const shuffledOptionExplanations = q.option_explanations
            ? shuffledOptionsMap.map(item => q.option_explanations[item.originalIndex])
            : undefined

          return {
            ...q,
            options: shuffledOptions,
            correct_answer: newCorrectIndex,
            option_explanations: shuffledOptionExplanations,
            _originalOptions: q.options, // Keep original for reference
            _originalCorrectAnswer: q.correct_answer
          }
        })

        setQuestions(processedQuestions)
        setOriginalQuestions(processedQuestions) // Store original questions for retry

        // Save recent exercise
        try {
          const continuePath = `/study/multiple-choice?exerciseId=${data.id}&sessionId=${sessionId}`
          saveRecentExercise({
            ...data,
            continuePath
          })
        } catch { }
      } else {
        setError('Không tìm thấy câu hỏi trong bài tập')
      }
    } catch (err) {
      console.error('Error fetching exercise:', err)
      setError('Không thể tải dữ liệu bài tập')
    } finally {
      setLoading(false)
    }
  }


  const currentQuestion = questions[currentQuestionIndex]
  const totalQuestions = questions.length
  const currentQuestionNumber = currentQuestionIndex + 1


  const handleAnswerSelect = async (answerIndex) => {
    if (selectedAnswer !== null || showExplanation) return

    const isCorrect = answerIndex === currentQuestion.correct_answer
    const responseTime = Date.now() - startTime

    // Add delay to see the click animation
    await new Promise(resolve => setTimeout(resolve, 200))

    setSelectedAnswer(answerIndex)
    setShowExplanation(true)

    // Trigger Batman movement if answer is correct
    if (isCorrect) {
      setIsBatmanMoving(true)
      setTimeout(() => setIsBatmanMoving(false), 3000)
    }

    // Play feedback (meme + sound)
    playFeedback(isCorrect)

    // Save question attempt to database (optional - for detailed analytics)
    if (user && exerciseId) {
      try {
        await supabase.from('question_attempts').insert({
          user_id: user.id,
          exercise_id: exerciseId,
          exercise_type: 'multiple_choice',
          question_id: currentQuestion.id,
          selected_answer: currentQuestion.options[answerIndex],
          correct_answer: currentQuestion.options[currentQuestion.correct_answer],
          is_correct: isCorrect,
          attempt_number: attemptNumber,
          response_time: responseTime
        })
      } catch (err) {
        // This is optional analytics - don't break the exercise if it fails
        console.log('⚠️ Could not save question attempt (table may not exist):', err.message)
      }
    }

    // Update question results
    const newResult = {
      questionId: currentQuestion.id,
      questionIndex: currentQuestionIndex,
      question: currentQuestion.question,
      isCorrect,
      selectedAnswer: answerIndex,
      correctAnswer: currentQuestion.correct_answer,
      explanation: currentQuestion.explanation
    }

    const updatedResults = [...questionResults, newResult]
    setQuestionResults(updatedResults)

    // If wrong answer, add to wrong questions for retry
    if (!isCorrect) {
      setWrongQuestions(prev => [...prev, {
        ...currentQuestion,
        originalIndex: currentQuestionIndex
      }])
    }
  }

  // Handle answer selection in all-at-once mode
  const handleAllAtOnceAnswerSelect = (questionIndex, answerIndex) => {
    setAllAnswers(prev => ({
      ...prev,
      [questionIndex]: answerIndex
    }))
  }

  // Submit all answers in all-at-once mode
  const handleSubmitAllAnswers = async () => {
    const answeredQuestions = Object.keys(allAnswers).length
    if (answeredQuestions < questions.length) {
      alert(`Bạn cần trả lời tất cả ${questions.length} câu hỏi trước khi nộp bài!`)
      return
    }

    setShowAllResults(true)
    
    // Process all answers
    const results = []
    const wrongQuestionsList = []
    
    questions.forEach((question, index) => {
      const selectedAnswerIndex = allAnswers[index]
      const isCorrect = selectedAnswerIndex === question.correct_answer
      
      const result = {
        questionId: question.id,
        questionIndex: index,
        question: question.question,
        isCorrect,
        selectedAnswer: selectedAnswerIndex,
        correctAnswer: question.correct_answer,
        explanation: question.explanation
      }
      
      results.push(result)
      
      if (!isCorrect) {
        wrongQuestionsList.push({
          ...question,
          originalIndex: index
        })
      }
    })
    
    // Merge results if retry mode
    let finalResults = results
    if (isRetryMode && firstAttemptResults.length > 0) {
      const retryResultByOriginalIndex = {}
      questions.forEach((q, i) => {
        if (results[i]) {
          retryResultByOriginalIndex[q.originalIndex] = results[i]
        }
      })
      finalResults = firstAttemptResults.map((firstResult, i) => {
        if (firstResult.isCorrect) return firstResult
        return retryResultByOriginalIndex[i] || firstResult
      })
      console.log(`🔄 Retry merge (all-at-once): ${finalResults.filter(r => r.isCorrect).length}/${finalResults.length} correct`)
    }

    setQuestionResults(finalResults)
    setWrongQuestions(isRetryMode ? [] : wrongQuestionsList)
    setIsQuizComplete(true)
    
    // Save all question attempts to database
    if (user && exerciseId) {
      try {
        const attempts = results.map(result => ({
          user_id: user.id,
          exercise_id: exerciseId,
          exercise_type: 'multiple_choice',
          question_id: result.questionId,
          selected_answer: questions[result.questionIndex].options[result.selectedAnswer],
          correct_answer: questions[result.questionIndex].options[result.correctAnswer],
          is_correct: result.isCorrect,
          attempt_number: attemptNumber,
          response_time: Date.now() - startTime
        }))
        
        await supabase.from('question_attempts').insert(attempts)
      } catch (err) {
        console.log('⚠️ Could not save question attempts (table may not exist):', err.message)
      }
    }
  }

  // Handle asking pet for tutoring help
  const handleAskPet = async () => {
    if (!activePet || petTutorLoading) return

    // Check and drain pet energy first
    const energyResult = await drainPetEnergy(5)
    if (!energyResult.success) {
      setShowPetTutor(true)
      setPetTutorMessage(`*${activePet.nickname || activePet.name} ngáp dài* Mình hơi mệt rồi... cho mình nghỉ ngơi hoặc ăn gì đó nhé! 😴`)
      return
    }

    setShowPetTutor(true)
    setPetTutorLoading(true)
    setPetTutorMessage('')

    try {
      const questionData = {
        question: currentQuestion.question,
        selectedAnswer: currentQuestion.options[selectedAnswer],
        correctAnswer: currentQuestion.options[currentQuestion.correct_answer]
      }

      const response = await getPetTutorExplanation(activePet, questionData, 'vi')
      setPetTutorMessage(response.message)
    } catch (error) {
      console.error('Pet tutor error:', error)
      setPetTutorMessage(`*${activePet.nickname || activePet.name} gãi đầu* Ừm, để mình nghĩ thêm nhé! 🤔`)
    } finally {
      setPetTutorLoading(false)
    }
  }

  const handleNextQuestion = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      const nextQuestionIndex = currentQuestionIndex + 1

      setCurrentQuestionIndex(nextQuestionIndex)
      setSelectedAnswer(null)
      setShowExplanation(false)
      setStartTime(Date.now())
      // Reset pet tutor state for next question
      setShowPetTutor(false)
      setPetTutorMessage('')
    } else {
      // Quiz completed - merge results if retry mode
      if (isRetryMode && firstAttemptResults.length > 0) {
        // Build map: originalIndex → retryResult (questions in retry mode have originalIndex from wrongQuestions)
        const retryResultByOriginalIndex = {}
        questions.forEach((q, i) => {
          if (questionResults[i]) {
            retryResultByOriginalIndex[q.originalIndex] = questionResults[i]
          }
        })
        const merged = firstAttemptResults.map((firstResult, i) => {
          if (firstResult.isCorrect) return firstResult
          return retryResultByOriginalIndex[i] || firstResult
        })
        console.log(`🔄 Retry merge: ${merged.filter(r => r.isCorrect).length}/${merged.length} correct`)
        setQuestionResults(merged)
      }
      setIsQuizComplete(true)
    }
  }


  const markExerciseCompleted = async () => {
    if (!user || !exerciseId || isTeacherView) return

    console.log(`🔍 markExerciseCompleted called - isRetryMode: ${isRetryMode}, questionResults.length: ${questionResults.length}`)

    // questionResults is already merged if retry mode (merge happens in handleNextQuestion/handleSubmitAllAnswers)
    const correctAnswers = questionResults.filter(r => r.isCorrect).length
    const totalQuestions = questionResults.length
    const score = Math.round((correctAnswers / totalQuestions) * 100)

    console.log(`🏁 Completing exercise: ${correctAnswers}/${totalQuestions} correct (${score}%)`)

    try {
      // Calculate XP
      const baseXP = exercise?.xp_reward || 10
      const bonusXP = score >= 95 ? Math.round(baseXP * 0.5) : score >= 90 ? Math.round(baseXP * 0.3) : 0 // +50% if >=95%, +30% if >=90%
      const totalXP = baseXP + bonusXP

      console.log(`💰 Calculating XP: ${baseXP} base + ${bonusXP} bonus = ${totalXP} total`)

      // Use useProgress hook to complete exercise (this will also check daily quest)
      const result = await completeExerciseWithXP(exerciseId, totalXP, {
        score: score,
        max_score: 100,
        xp_earned: totalXP,  // We'll calculate actual XP in the backend based on completion
        challengeId: challengeId,  // Pass for daily challenge tracking
        challengeStartedAt: challengeStartTime  // Pass challenge start time for accurate timing
      })

      if (result.error && result.error !== 'Exercise already completed') {
        console.log('⚠️ Exercise completion failed:', result.error)
        return
      }

      // If exercise was already completed, that's fine - daily quest still gets checked
      if (result.error === 'Exercise already completed') {
        console.log('ℹ️ Exercise was already completed, but daily quest was checked')
        return
      }

      // Set XP awarded if any
      if (result.xpAwarded > 0) {
        setXpAwarded(result.xpAwarded)
        console.log(`✅ Exercise completed successfully! Awarded ${result.xpAwarded} XP`)
      } else {
        console.log(`📝 Exercise attempted but not completed (score: ${score}%, required: 75%)`)
      }

    } catch (err) {
      console.error('❌ Error marking exercise completed:', err)
    }
  }

  const handleRetryWrongQuestions = () => {
    if (wrongQuestions.length === 0) return

    // Increment attempt number for retry
    setAttemptNumber(prev => prev + 1)

    // Save first attempt results before resetting so we can merge after retry
    setFirstAttemptResults(questionResults)

    // Set retry mode first
    setIsRetryMode(true)

    // Show only wrong questions for retry
    setQuestions(wrongQuestions)
    setCurrentQuestionIndex(0)
    setSelectedAnswer(null)
    setShowExplanation(false)
    setQuestionResults([])
    setIsQuizComplete(false)
    setWrongQuestions([])
    setStartTime(Date.now())
    setHasPlayedPassAudio(false) // Reset audio flag

    // Reset all answers for all-at-once mode
    setAllAnswers({})
    setShowAllResults(false)
  }



  // Handle bottom nav back
  useEffect(() => {
    if (testMode) return
    const handleBottomNavBack = () => {
      if (session && session.units) {
        const unitId = session.units.id
        navigate(`/study/course/${session.units.course_id}/unit/${unitId}/session/${sessionId}`)
      } else {
        navigate('/study')
      }
    }

    window.addEventListener('bottomNavBack', handleBottomNavBack)
    return () => window.removeEventListener('bottomNavBack', handleBottomNavBack)
  }, [session, sessionId, navigate])

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
          Thử lại
        </Button>
      </div>
    )
  }

  if (!currentQuestion) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600 mb-4">Không có câu hỏi nào</div>
        {!testMode && (
          <Link to="/study">
            <Button variant="outline">Quay lại</Button>
          </Link>
        )}
      </div>
    )
  }

  // Teacher view: read-only preview showing all questions with correct answers
  if (isTeacherView && teacherMode === 'review') {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{exercise?.title || 'Multiple Choice'}</h2>
          <div className="flex items-center gap-3">
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
        {exercise?.content?.intro && String(exercise.content.intro).trim() && (
          <div className="mb-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <RichTextWithAudio content={exercise.content.intro} allowImages={true} allowLinks={false} />
          </div>
        )}
        <div className="space-y-6">
          {questions.map((question, qIndex) => (
            <div key={qIndex} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-start gap-3 mb-4">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">{qIndex + 1}</span>
                <div className="flex-1">
                  <RichTextWithAudio
                    content={
                      question.audio_url
                        ? `${question.question}<audio src="${question.audio_url}" data-max-plays="${question.max_audio_plays || 0}"></audio>`
                        : question.question
                    }
                    allowImages={true}
                    allowLinks={true}
                  />
                </div>
              </div>
              <div className="ml-11 space-y-2">
                {question.options.map((option, oIndex) => {
                  const isCorrect = oIndex === question.correct_answer
                  return (
                    <div
                      key={oIndex}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        isCorrect
                          ? 'bg-green-50 border-green-300'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      {isCorrect ? (
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                      )}
                      <span className={isCorrect ? 'font-medium text-green-800' : 'text-gray-700'}>{option}</span>
                    </div>
                  )
                })}
              </div>
              {question.explanation && (
                <div className="ml-11 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  <strong>Explanation:</strong> {question.explanation}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // testMode: render only the all-at-once questions, no gamification
  if (testMode) {
    return (
      <div className="space-y-6">
        {/* Global Intro */}
        {exercise?.content?.intro && String(exercise.content.intro).trim() && (
          <div className="w-full max-w-4xl min-w-0 mx-auto rounded-lg p-4 md:p-6 bg-white shadow-sm border border-gray-200">
            <RichTextWithAudio content={exercise.content.intro} allowImages={true} allowLinks={false} />
          </div>
        )}

        {questions.map((question, questionIndex) => (
          <div key={questionIndex} className="w-full max-w-4xl min-w-0 mx-auto rounded-lg p-4 md:p-8 bg-white shadow-md border border-gray-200">
            <div className="space-y-4 md:space-y-6">
              <div className="mb-6">
                {question.intro && String(question.intro).trim() && (
                  <div className="mb-4">
                    <RichTextWithAudio content={question.intro} allowImages={true} allowLinks={false} />
                  </div>
                )}
                <RichTextWithAudio
                  content={
                    question.audio_url
                      ? `${question.question}<audio src="${question.audio_url}" data-max-plays="${question.max_audio_plays || 0}"></audio>`
                      : question.question
                  }
                  className="question-text"
                  allowImages={true}
                  allowLinks={false}
                  style={{ fontSize: '1.125rem', fontWeight: '400', color: '#1f2937', lineHeight: '1.75' }}
                />
              </div>

              <div className="space-y-3 md:space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  {question.options.map((option, optionIndex) => {
                    const isSelected = allAnswers[questionIndex] === optionIndex
                    let shadowColor = isSelected ? '#3b82f6' : '#e5e7eb'

                    return (
                      <button
                        key={optionIndex}
                        onClick={() => handleAllAtOnceAnswerSelect(questionIndex, optionIndex)}
                        className="w-full border-none rounded-lg transition-all duration-100 text-sm md:text-base font-medium"
                        style={{ padding: 0, borderRadius: '0.75em', backgroundColor: shadowColor }}
                      >
                        <div
                          className={`w-full p-3 md:p-4 text-left border-2 rounded-lg transition-all duration-200 text-sm md:text-base font-medium ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm'
                              : 'bg-white border-gray-200 cursor-pointer hover:shadow-sm'
                          }`}
                          style={{
                            display: 'flex', alignItems: 'center', boxSizing: 'border-box', height: '100%',
                            transform: 'translateY(-0.2em)', transition: 'transform 0.1s ease',
                            padding: '0.75em 1.5em', borderRadius: '0.75em'
                          }}
                        >
                          <div className="flex items-center gap-3 w-full">
                            <div className="flex-1">
                              <RichTextWithAudio content={option} allowImages={true} allowLinks={false} />
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
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

      <div className="relative px-2 md:pt-2 pb-12">
        <div className="max-w-4xl mx-auto space-y-6 relative z-20">
      {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}

      {/* Teacher Do mode banner */}
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

      {/* Header - hide on celebration screen */}
      {!isQuizComplete && (
        <ExerciseHeader
          title={exercise?.title}
          progressPercentage={
            (questionResults.filter(r => r.isCorrect).length / totalQuestions) * 100
          }
          isBatmanMoving={isBatmanMoving}
          isRetryMode={isRetryMode}
          retryModeText="Ôn lại câu sai"
          targetInfo="≥ 80% để hoàn thành"
          showBatman={viewMode === 'one-by-one'}
          showProgressLabel={false}
          showQuestionCounter={false}
          colorTheme={colorTheme}
        />
      )}

      {/* Global Intro (exercise.content.settings/intros) - hide on celebration screen */}
      {!isQuizComplete && exercise?.content?.intro && String(exercise.content.intro).trim() && (
        <div className="w-full max-w-4xl min-w-0 mx-auto rounded-lg p-4 md:p-6 bg-white shadow-sm border border-gray-200">
          <RichTextWithAudio content={exercise.content.intro} allowImages={true} allowLinks={false} />
        </div>
      )}


      {/* Meme Overlay */}
      {showMeme && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <img
            src={currentMeme}
            alt="Reaction meme"
            className="rounded-lg shadow-2xl"
            style={{ width: '200px', height: 'auto' }}
          />
        </div>
      )}

      {/* Questions Display */}
      <>
        {/* One-by-one mode */}
          {viewMode === 'one-by-one' && (
            <div className="w-full max-w-4xl min-w-0 mx-auto mt-6 bg-white rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.1),0_10px_20px_rgba(0,0,0,0.05)] relative before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-full before:bg-gradient-to-b before:from-gray-50 before:to-transparent before:opacity-30 before:pointer-events-none before:rounded-lg">
              
              {/* Colored circles on top right */}
              <div className="absolute top-4 right-6 md:right-10 flex gap-2 z-20">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                <div className="w-3 h-3 rounded-full bg-pink-500"></div>
              </div>
              <div className="relative z-10 p-4 md:p-8 pt-8 border-l-4 border-blue-400 rounded-l-lg">
              <div className="space-y-4 md:space-y-6">

                {/* Question - single unified version */}
                <div className="mb-6">

              {/* Intro above question (optional) */}
              {currentQuestion.intro && String(currentQuestion.intro).trim() && (
                <div className="mb-4">
                  <RichTextWithAudio
                    content={currentQuestion.intro}
                    allowImages={true}
                    allowLinks={false}
                  />
                </div>
              )}

                  <RichTextWithAudio
                    content={
                      currentQuestion.audio_url
                        ? `${currentQuestion.question}<audio src="${currentQuestion.audio_url}" data-max-plays="${currentQuestion.max_audio_plays || 0}"></audio>`
                        : currentQuestion.question
                    }
                    className="question-text"
                    allowImages={true}
                    allowLinks={false}
                    style={{
                      fontSize: '1.125rem',
                      fontWeight: '400',
                      color: '#1f2937',
                      lineHeight: '1.75'
                    }}
                  />
                </div>

                {/* Options - responsive grid */}
                <div className="space-y-3 md:space-y-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                      {currentQuestion.options.map((option, index) => {
                        let buttonClass = "w-full p-3 md:p-4 text-left border-2 rounded-lg transition-all duration-200 text-sm md:text-base font-medium "

                        if (selectedAnswer === null) {
                          buttonClass += `bg-white border-gray-200 cursor-pointer hover:shadow-sm`
                        } else {
                          if (index === selectedAnswer) {
                            // Show only the selected answer - green if correct, red if wrong
                            const isCorrect = index === currentQuestion.correct_answer
                            if (isCorrect) {
                              buttonClass += "border-green-500 bg-green-50 text-green-900 shadow-sm"
                            } else {
                              buttonClass += "border-red-500 bg-red-50 text-red-900 shadow-sm"
                            }
                          } else {
                            // Other options remain neutral
                            buttonClass += "border-gray-200 bg-gray-50 text-gray-500 opacity-60"
                          }
                        }

                        // Get border color for shadow - match the border colors from buttonClass
                        let shadowColor = '#e5e7eb' // gray-200 default (matches border-gray-200)
                        if (selectedAnswer !== null) {
                          if (index === selectedAnswer) {
                            const isCorrect = index === currentQuestion.correct_answer
                            shadowColor = isCorrect ? '#22c55e' : '#ef4444' // green-500 or red-500
                          } else {
                            shadowColor = '#e5e7eb' // gray-200
                          }
                        }

                        return (
                          <button
                            key={index}
                            onClick={() => handleAnswerSelect(index)}
                            disabled={selectedAnswer !== null}
                            className={`w-full border-none rounded-lg transition-all duration-100 text-sm md:text-base font-medium`}
                            style={{
                              padding: 0,
                              borderRadius: '0.75em',
                              backgroundColor: shadowColor
                            }}
                          >
                            <div
                              className={buttonClass}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                boxSizing: 'border-box',
                                height: '100%',
                                transform: selectedAnswer === null ? 'translateY(-0.2em)' : 'translateY(0)',
                                transition: 'transform 0.1s ease',
                                padding: '0.75em 1.5em',
                                borderRadius: '0.75em'
                              }}
                              onMouseEnter={(e) => {
                                if (selectedAnswer === null) {
                                  e.currentTarget.style.transform = 'translateY(-0.33em)'
                                  // Keep the same shadow color on hover
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (selectedAnswer === null) {
                                  e.currentTarget.style.transform = 'translateY(-0.2em)'
                                }
                              }}
                              onMouseDown={(e) => {
                                if (selectedAnswer === null) {
                                  e.currentTarget.style.transform = 'translateY(0)'
                                }
                              }}
                              onMouseUp={(e) => {
                                if (selectedAnswer === null) {
                                  e.currentTarget.style.transform = 'translateY(-0.33em)'
                                }
                              }}
                              onTouchStart={(e) => {
                                if (selectedAnswer === null) {
                                  e.currentTarget.style.transform = 'translateY(0)'
                                }
                              }}
                              onTouchEnd={(e) => {
                                if (selectedAnswer === null) {
                                  e.currentTarget.style.transform = 'translateY(-0.2em)'
                                }
                              }}
                            >
                            <div className="flex items-center justify-between gap-3 w-full">
                              <div className="flex-1">
                                <RichTextWithAudio
                                  content={option}
                                  allowImages={true}
                                  allowLinks={false}
                                />
                              </div>
                              <div className="flex-shrink-0">
                                {selectedAnswer !== null && index === selectedAnswer && (
                                  <>
                                    {index === currentQuestion.correct_answer ? (
                                      <CheckCircle className="w-6 h-6 text-green-600" />
                                    ) : (
                                      <XCircle className="w-6 h-6 text-red-600" />
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                </div>

                {/* Explanation and Next Button */}
                {showExplanation && selectedAnswer !== null && (
                  <div className="space-y-4">
                    {(currentQuestion.option_explanations?.[selectedAnswer] || currentQuestion.explanation) && (
                    <div className="p-4 md:p-5 bg-blue-50 border border-blue-200 rounded-lg">
                      <h3 className="font-semibold text-blue-900 mb-2 text-sm md:text-base">Giải thích:</h3>
                      <RichTextRenderer
                        content={currentQuestion.option_explanations?.[selectedAnswer] || currentQuestion.explanation}
                        className="text-blue-800 text-sm md:text-base leading-relaxed"
                        allowImages={true}
                        allowLinks={false}
                      />
                    </div>
                    )}

                    {/* Pet Tutor - Ask Pet button (only for wrong answers) */}
                    {FEATURES.pets && selectedAnswer !== currentQuestion.correct_answer && activePet && (
                      <div className="space-y-3">
                        {!showPetTutor ? (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={handleAskPet}
                              disabled={(userEnergy ?? 100) < 10}
                              className={`flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-all shadow-sm ${
                                (userEnergy ?? 100) < 10
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-purple-500 hover:bg-purple-600 text-white hover:shadow-md'
                              }`}
                            >
                              <MessageCircle className="w-5 h-5" />
                              Hỏi {activePet.nickname || activePet.name} giải thích
                            </button>
                            <span className="text-xs text-gray-500">
                              ⚡ {userEnergy ?? 100}/100
                              {(userEnergy ?? 100) < 10 && ' (Mệt rồi!)'}
                            </span>
                          </div>
                        ) : (
                          <PetTutorBubble
                            pet={activePet}
                            message={petTutorMessage}
                            isLoading={petTutorLoading}
                          />
                        )}
                      </div>
                    )}

                    {/* Next Button - full width on mobile, centered on desktop */}
                    <div className="flex justify-center md:justify-end">
                      <Button3D
                        onClick={handleNextQuestion}
                        color="blue"
                        size="md"
                        fullWidth={false}
                        className="flex items-center justify-center gap-2 md:w-auto"
                      >
                        {currentQuestionIndex < questions.length - 1 ? (
                          <>
                            Câu tiếp theo
                            <ArrowRight className="w-5 h-5" />
                          </>
                        ) : (
                          'Hoàn thành'
                        )}
                      </Button3D>
                    </div>
                  </div>
                )}
              </div>
              </div>
            </div>
          )}

          {/* All-at-once mode */}
          {viewMode === 'all-at-once' && (
            <div className="space-y-6">
              {questions.map((question, questionIndex) => (
                <div key={questionIndex} className="w-full max-w-4xl min-w-0 mx-auto rounded-lg p-4 md:p-8 bg-white shadow-md border border-gray-200">
                  <div className="space-y-4 md:space-y-6">

                    {/* Question */}
                    <div className="mb-6">
                      {/* Intro above question (optional) */}
                      {question.intro && String(question.intro).trim() && (
                        <div className="mb-4">
                          <RichTextWithAudio
                            content={question.intro}
                            allowImages={true}
                            allowLinks={false}
                          />
                        </div>
                      )}
                      <RichTextWithAudio
                        content={
                          question.audio_url
                            ? `${question.question}<audio src="${question.audio_url}" data-max-plays="${question.max_audio_plays || 0}"></audio>`
                            : question.question
                        }
                        className="question-text"
                        allowImages={true}
                        allowLinks={false}
                        style={{
                          fontSize: '1.125rem',
                          fontWeight: '400',
                          color: '#1f2937',
                          lineHeight: '1.75'
                        }}
                      />
                    </div>

                    {/* Options */}
                    <div className="space-y-3 md:space-y-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        {question.options.map((option, optionIndex) => {
                          const isSelected = allAnswers[questionIndex] === optionIndex
                          const isCorrect = optionIndex === question.correct_answer

                          let buttonClass = "w-full p-3 md:p-4 text-left border-2 rounded-lg transition-all duration-200 text-sm md:text-base font-medium "

                          if (showAllResults) {
                            if (isSelected && isCorrect) {
                              // Selected and correct - bright green
                              buttonClass += "border-green-500 bg-green-100 text-green-900 shadow-md"
                            } else if (isSelected && !isCorrect) {
                              // Selected but wrong - bright red
                              buttonClass += "border-red-500 bg-red-100 text-red-900 shadow-md"
                            } else if (!isSelected && isCorrect) {
                              // Not selected but this is the correct answer - show it clearly
                              buttonClass += "border-green-400 bg-green-50 text-green-800 shadow-sm"
                            } else {
                              // Not selected and not correct - fade out
                              buttonClass += "border-gray-200 bg-gray-50 text-gray-500 opacity-50"
                            }
                          } else {
                            if (isSelected) {
                              buttonClass += "border-blue-500 bg-blue-50 text-blue-900 shadow-sm"
                            } else {
                              buttonClass += `bg-white border-gray-200 cursor-pointer hover:shadow-sm`
                            }
                          }

                          // Get shadow color based on state - match border colors
                          let shadowColor = '#e5e7eb' // gray-200 default (matches border-gray-200)
                          if (showAllResults) {
                            if (isSelected && isCorrect) {
                              shadowColor = '#22c55e' // green-500
                            } else if (isSelected && !isCorrect) {
                              shadowColor = '#ef4444' // red-500
                            } else if (!isSelected && isCorrect) {
                              shadowColor = '#4ade80' // green-400
                            } else {
                              shadowColor = '#e5e7eb' // gray-200
                            }
                          } else if (isSelected) {
                            shadowColor = '#3b82f6' // blue-500 (matches border-blue-500)
                          }

                          return (
                            <button
                              key={optionIndex}
                              onClick={() => handleAllAtOnceAnswerSelect(questionIndex, optionIndex)}
                              disabled={showAllResults}
                              className={`w-full border-none rounded-lg transition-all duration-100 text-sm md:text-base font-medium`}
                              style={{
                                padding: 0,
                                borderRadius: '0.75em',
                                backgroundColor: shadowColor
                              }}
                            >
                              <div
                                className={buttonClass}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  boxSizing: 'border-box',
                                  height: '100%',
                                  transform: !showAllResults ? 'translateY(-0.2em)' : 'translateY(0)',
                                  transition: 'transform 0.1s ease',
                                  padding: '0.75em 1.5em',
                                  borderRadius: '0.75em'
                                }}
                                onMouseEnter={(e) => {
                                  if (!showAllResults) {
                                    e.currentTarget.style.transform = 'translateY(-0.33em)'
                                    // Keep the same shadow color on hover
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!showAllResults) {
                                    e.currentTarget.style.transform = 'translateY(-0.2em)'
                                  }
                                }}
                                onMouseDown={(e) => {
                                  if (!showAllResults) {
                                    e.currentTarget.style.transform = 'translateY(0)'
                                  }
                                }}
                                onMouseUp={(e) => {
                                  if (!showAllResults) {
                                    e.currentTarget.style.transform = 'translateY(-0.33em)'
                                  }
                                }}
                                onTouchStart={(e) => {
                                  if (!showAllResults) {
                                    e.currentTarget.style.transform = 'translateY(0)'
                                  }
                                }}
                                onTouchEnd={(e) => {
                                  if (!showAllResults) {
                                    e.currentTarget.style.transform = 'translateY(-0.2em)'
                                  }
                                }}
                              >
                              <div className="flex items-center justify-between gap-3 w-full">
                                <div className="flex-1">
                                  <RichTextWithAudio
                                    content={option}
                                    allowImages={true}
                                    allowLinks={false}
                                  />
                                </div>
                                <div className="flex-shrink-0">
                                  {showAllResults && (
                                    <>
                                      {isSelected && isCorrect && (
                                        <CheckCircle className="w-6 h-6 text-green-600" />
                                      )}
                                      {isSelected && !isCorrect && (
                                        <XCircle className="w-6 h-6 text-red-600" />
                                      )}
                                      {!isSelected && isCorrect && (
                                        <CheckCircle className="w-6 h-6 text-green-500" />
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Explanation for this question */}
                    {showAllResults && allAnswers[questionIndex] !== undefined && (question.option_explanations?.[allAnswers[questionIndex]] || question.explanation) && (
                      <div className="mt-4 p-4 md:p-5 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 className="font-semibold text-blue-900 mb-2 text-sm md:text-base">Giải thích:</h4>
                        <RichTextRenderer
                          content={question.option_explanations?.[allAnswers[questionIndex]] || question.explanation}
                          className="text-blue-800 text-sm md:text-base leading-relaxed"
                          allowImages={true}
                          allowLinks={false}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Submit Button */}
              {!showAllResults && (
                <div className="flex justify-center mt-8">
                  <Button3D
                    onClick={handleSubmitAllAnswers}
                    color="green"
                    size="lg"
                    fullWidth={false}
                    disabled={Object.keys(allAnswers).length < questions.length}
                    className="flex items-center justify-center gap-2"
                  >
                    Nộp bài ({Object.keys(allAnswers).length}/{questions.length})
                  </Button3D>
                </div>
              )}
            </div>
          )}
        </>
        </div>
      </div>

      {/* Quiz Complete Screen */}
      {isQuizComplete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <CelebrationScreen
            score={Math.round((questionResults.filter(r => r.isCorrect).length / questionResults.length) * 100)}
            correctAnswers={questionResults.filter(r => r.isCorrect).length}
            totalQuestions={questionResults.length}
            passThreshold={80}
            xpAwarded={xpAwarded}
            passGif={passGif}
            isRetryMode={isRetryMode}
            wrongQuestionsCount={isRetryMode ? 0 : wrongQuestions.length}
            onRetryWrongQuestions={handleRetryWrongQuestions}
            onBackToList={() => {
              if (session && session.units) {
                navigate(`/study/course/${session.units.course_id}/unit/${session.unit_id}/session/${sessionId}`)
              } else {
                navigate('/study')
              }
            }}
            exerciseId={exerciseId}
          />
        </div>
      )}
    </>
  )
}

export default MultipleChoiceExercise