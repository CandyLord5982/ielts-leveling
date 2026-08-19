import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import { useProgress } from '../../hooks/useProgress'
import { useFeedback } from '../../hooks/useFeedback'
import { usePet } from '../../hooks/usePet'
import { saveRecentExercise } from '../../utils/recentExercise'
import { splitAnswers, firstAnswer } from '../../utils/splitAnswers'
import LoadingSpinner from '../ui/LoadingSpinner'
import { Check, X, RotateCcw, HelpCircle, ArrowLeft, MessageCircle } from 'lucide-react'
import RichTextRenderer from '../ui/RichTextRenderer'
import ExerciseHeader from '../ui/ExerciseHeader'
import AudioPlayer from '../ui/AudioPlayer'
import CelebrationScreen from '../ui/CelebrationScreen'
import PetTutorBubble from '../pet/PetTutorBubble'
import { FEATURES } from '../../config/features'
import { getPetTutorExplanation } from '../../utils/petChatService'
import TeacherExerciseNav from '../ui/TeacherExerciseNav'
import QuestionReportButton from '../reports/QuestionReportButton'

import { assetUrl } from '../../hooks/useBranding';
// Theme-based side decoration images for PC c
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

const FillBlankExercise = ({ testMode = false, exerciseData = null, onAnswersCollected = null, initialAnswers = null }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { canCreateContent } = usePermissions()
  const { startExercise, completeExerciseWithXP } = useProgress()
  const isTeacherView = canCreateContent()
  const urlParams = new URLSearchParams(location.search)
  const exerciseId = urlParams.get('exerciseId')
  const sessionId = urlParams.get('sessionId')
  const challengeId = urlParams.get('challengeId') || null
  const isChallenge = urlParams.get('isChallenge') === 'true'
  const { currentMeme, showMeme, playFeedback, playCelebration, passGif } = useFeedback()
  const { activePet, drainPetEnergy, userEnergy } = usePet()
  const [exercise, setExercise] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [userAnswers, setUserAnswers] = useState(() => (testMode && initialAnswers) ? initialAnswers : {})
  const [showResults, setShowResults] = useState(false)
  const [score, setScore] = useState(0)
  const [showExplanation, setShowExplanation] = useState(false)
  const [exerciseCompleted, setExerciseCompleted] = useState(false)
  const [totalScore, setTotalScore] = useState(0)
  const [questionScores, setQuestionScores] = useState([])
  const [hasEdited, setHasEdited] = useState(false)
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false)
  const [retryMode, setRetryMode] = useState(false)
  const [retryQuestions, setRetryQuestions] = useState([])
  const [isBatmanMoving, setIsBatmanMoving] = useState(false)
  const [attemptNumber, setAttemptNumber] = useState(1)
  const [challengeStartTime, setChallengeStartTime] = useState(null)
  const [session, setSession] = useState(null)
  const [colorTheme, setColorTheme] = useState('blue')
  const [hasPlayedPassAudio, setHasPlayedPassAudio] = useState(false)
  const [xpAwarded, setXpAwarded] = useState(0)
  const [wrongQuestionIndices, setWrongQuestionIndices] = useState([])
  const [startTime, setStartTime] = useState(Date.now())
  const [teacherMode, setTeacherMode] = useState('review') // 'review' or 'do'

  // Pet tutor state
  const [showPetTutor, setShowPetTutor] = useState(false)
  const [petTutorLoading, setPetTutorLoading] = useState(false)
  const [petTutorMessage, setPetTutorMessage] = useState('')

  const inputRefs = useRef({})

  const questions = exercise?.content?.questions || []
  const currentQuestion = questions[currentQuestionIndex]
  const showAllQuestions = exercise?.content?.settings?.show_all_questions || false

  // Extract audio data from question content
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

  // Get audio URLs for current question
  const currentQuestionAudio = currentQuestion?.question
    ? extractAudioUrls(currentQuestion.question)
    : []
  const currentQuestionIntroAudio = currentQuestion?.intro
    ? extractAudioUrls(currentQuestion.intro)
    : []

  // Get audio URLs for global exercise intro
  const exerciseIntroAudio = exercise?.content?.intro
    ? extractAudioUrls(exercise.content.intro)
    : []

  // Play celebration when exercise is completed and passed
  useEffect(() => {
    if (testMode) return
    if (exerciseCompleted && !hasPlayedPassAudio && totalScore >= 80) {
      playCelebration()
      setHasPlayedPassAudio(true)
    }
  }, [exerciseCompleted, hasPlayedPassAudio, totalScore, playCelebration, testMode])

  // testMode: load exercise data from props
  useEffect(() => {
    if (!testMode || !exerciseData) return
    setExercise(exerciseData)
    setLoading(false)
  }, [testMode, exerciseData])

  // testMode: notify parent of answer changes (use ref to avoid infinite loops)
  const onAnswersCollectedRef = useRef(onAnswersCollected)
  onAnswersCollectedRef.current = onAnswersCollected
  useEffect(() => {
    if (testMode && onAnswersCollectedRef.current) {
      onAnswersCollectedRef.current(userAnswers)
    }
  }, [userAnswers, testMode])

  useEffect(() => {
    if (testMode) return
    loadExercise()
  }, [])

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

  useEffect(() => {
    if (testMode) return
    // Track when student enters the exercise
    const initExercise = async () => {
      const urlParams = new URLSearchParams(location.search)
      const exerciseId = urlParams.get('exerciseId')
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
  }, [user])

  useEffect(() => {
    if (testMode) return
    const fetchSessionInfo = async () => {
      const urlParams = new URLSearchParams(location.search)
      const sessionId = urlParams.get('sessionId')
      if (!sessionId) return

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

    fetchSessionInfo()
  }, [location])

  useEffect(() => {
    // Initialize user answers when questions change
    if (questions.length > 0) {
      const initialAnswers = {}
      questions.forEach((question, qIndex) => {
        initialAnswers[qIndex] = question.blanks.map(() => '')
      })
      setUserAnswers(initialAnswers)
    }
  }, [questions])

  useEffect(() => {
    // Auto-focus the first blank when entering a question
    if (!showResults && !exerciseCompleted && !showAllQuestions) {
      const firstInput = inputRefs.current[currentQuestionIndex]?.[0]
      if (firstInput) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          firstInput.focus()
        }, 100)
      }
    }
  }, [currentQuestionIndex, showResults, exerciseCompleted, showAllQuestions])

  const loadExercise = async () => {
    try {
      setLoading(true)
      setError(null)

      const urlParams = new URLSearchParams(location.search)
      const exerciseId = urlParams.get('exerciseId')
      const sessionId = urlParams.get('sessionId')

      if (!exerciseId) {
        throw new Error('Exercise ID not found')
      }

      console.log('🔍 Loading fill blank exercise:', exerciseId)

      const { data: exerciseData, error: exerciseError } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exerciseId)
        .eq('exercise_type', 'fill_blank')
        .single()

      if (exerciseError) {
        console.error('❌ Error loading exercise:', exerciseError)
        throw exerciseError
      }

      if (!exerciseData) {
        throw new Error('Exercise not found')
      }

      console.log('✅ Exercise loaded:', exerciseData.title)
      setExercise(exerciseData)

      // Save to recent exercises
      if (user) {
        await saveRecentExercise(user.id, exerciseData.id, exerciseData.title, 'fill_blank')
      }

    } catch (err) {
      console.error('❌ Error loading exercise:', err)
      setError(err.message || 'Failed to load exercise')
    } finally {
      setLoading(false)
    }
  }

  const handleAnswerChange = (blankIndex, value) => {
    setUserAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: {
        ...prev[currentQuestionIndex],
        [blankIndex]: value
      }
    }))

    // If results are shown and user changes answer, mark as edited
    if (showResults) {
      setHasEdited(true)
    }
  }

  const checkAnswer = (blankIndex) => {
    const userAnswer = (userAnswers[currentQuestionIndex]?.[blankIndex] || '').trim()
    const correctAnswers = splitAnswers(currentQuestion.blanks[blankIndex].answer)
    const caseSensitive = currentQuestion.blanks[blankIndex].case_sensitive

    if (caseSensitive) {
      return correctAnswers.some(answer => userAnswer === answer)
    } else {
      return correctAnswers.some(answer => userAnswer.toLowerCase() === answer.toLowerCase())
    }
  }

  const getBlankStatus = (blankIndex) => {
    if (!showResults) return 'neutral'
    return checkAnswer(blankIndex) ? 'correct' : 'incorrect'
  }

  const calculateBlankWidth = (blankIndex) => {
    const blank = currentQuestion?.blanks?.[blankIndex]
    if (!blank) return 64 // Default 64px (w-16)

    // Get all possible answers and find the longest one
    const answers = splitAnswers(blank.answer)

    const longestAnswer = answers.reduce((longest, current) =>
      current.length > longest.length ? current : longest, ''
    )

    // Calculate width: 16px per character + 32px padding
    const calculatedWidth = Math.max(64, Math.min(400, longestAnswer.length * 16 + 32))

    return calculatedWidth
  }

  const handleSubmit = async () => {
    setShowResults(true)
    setHasEdited(false)
    setShowCorrectAnswers(false)

    // Calculate score for current question
    const correctBlanks = currentQuestion.blanks.filter((_, blankIndex) =>
      checkAnswer(blankIndex)
    ).length
    const questionScore = (correctBlanks / currentQuestion.blanks.length) * 100
    setScore(questionScore)

    // Play feedback based on score
    playFeedback(questionScore >= 80)

    // Save question attempt to database (one row per blank for per-blank override)
    try {
      const urlParams = new URLSearchParams(location.search)
      const exerciseId = urlParams.get('exerciseId')

      if (exerciseId && user) {
        const blankAttempts = currentQuestion.blanks.map((blank, blankIndex) => {
          const userAnswer = (userAnswers[currentQuestionIndex]?.[blankIndex] || '').trim()
          const correctAnswersList = splitAnswers(blank.answer)
          const isBlankCorrect = blank.case_sensitive
            ? correctAnswersList.some(a => userAnswer === a)
            : correctAnswersList.some(a => userAnswer.toLowerCase() === a.toLowerCase())
          return {
            exercise_id: exerciseId,
            exercise_type: 'fill_blank',
            question_id: currentQuestion.id || `q${currentQuestionIndex}`,
            question_index: currentQuestionIndex * 100 + blankIndex,
            user_id: user.id,
            selected_answer: userAnswer,
            correct_answer: blank.answer,
            is_correct: isBlankCorrect,
            attempt_number: attemptNumber,
            response_time: Date.now() - startTime
          }
        })
        const { error: insertError } = await supabase.from('question_attempts').insert(blankAttempts)
        if (insertError) console.error('⚠️ Fill blank insert error:', insertError)
      }
    } catch (err) {
      console.error('⚠️ Could not save question attempt:', err.message)
    }
  }

  const handleKeyDown = (e, questionIndex, blankIndex) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation() // Stop event from bubbling to global listener

      // In testMode, just move to next blank/question without submitting
      if (testMode) {
        const currentQ = questions[questionIndex]
        const totalBlanks = currentQ.blanks.length
        const nextBlankIndex = blankIndex + 1
        if (nextBlankIndex < totalBlanks) {
          const nextInput = inputRefs.current[questionIndex]?.[nextBlankIndex]
          if (nextInput) nextInput.focus()
        } else {
          const nextQuestionIndex = questionIndex + 1
          if (nextQuestionIndex < questions.length) {
            const nextInput = inputRefs.current[nextQuestionIndex]?.[0]
            if (nextInput) nextInput.focus()
          }
        }
        return
      }

      // Don't do anything if results are already showing
      if (showResults) return

      // Get current question's blank count
      const currentQ = questions[questionIndex]
      const totalBlanks = currentQ.blanks.length

      if (totalBlanks === 1) {
        // Single blank: submit if filled
        const value = userAnswers[questionIndex]?.[blankIndex]
        if (value && value.trim()) {
          if (showAllQuestions) {
            // In show all mode, can't submit individual questions
            // Move to next question's first blank if available
            const nextQuestionIndex = questionIndex + 1
            if (nextQuestionIndex < questions.length) {
              const nextInput = inputRefs.current[nextQuestionIndex]?.[0]
              if (nextInput) nextInput.focus()
            }
          } else {
            // Single question mode: submit
            handleSubmit()
          }
        }
      } else {
        // Multiple blanks: move to next blank
        const nextBlankIndex = blankIndex + 1

        if (nextBlankIndex < totalBlanks) {
          // Focus next blank in same question
          const nextInput = inputRefs.current[questionIndex]?.[nextBlankIndex]
          if (nextInput) nextInput.focus()
        } else {
          // Last blank in question
          // In "show all" mode, move to next question's first blank
          if (showAllQuestions) {
            const nextQuestionIndex = questionIndex + 1
            if (nextQuestionIndex < questions.length) {
              const nextInput = inputRefs.current[nextQuestionIndex]?.[0]
              if (nextInput) nextInput.focus()
            }
          }
        }
      }
    }
  }

  const handleSubmitAll = async () => {
    setShowResults(true)
    setHasEdited(false)
    setShowCorrectAnswers(true) // Show correct answers immediately

    // Calculate scores for all questions
    const scores = questions.map((question, qIndex) => {
      const correctAnswers = question.blanks.filter((_, blankIndex) => {
        const userAnswer = userAnswers[qIndex]?.[blankIndex] || ''
        const correctAnswers = splitAnswers(question.blanks[blankIndex].answer)
        const caseSensitive = question.blanks[blankIndex].case_sensitive

        if (caseSensitive) {
          return correctAnswers.some(answer => userAnswer === answer)
        } else {
          return correctAnswers.some(answer => userAnswer.toLowerCase() === answer.toLowerCase())
        }
      }).length
      return (correctAnswers / question.blanks.length) * 100
    })

    setQuestionScores(scores)
    const averageScore = scores.reduce((sum, s) => sum + s, 0) / scores.length
    setTotalScore(averageScore)

    // Play feedback based on overall score
    playFeedback(averageScore >= 80)

    const urlParams = new URLSearchParams(location.search)
    const exerciseId = urlParams.get('exerciseId')

    // Save all question attempts to database
    if (exerciseId && user) {
      try {
        const attempts = questions.flatMap((question, qIndex) =>
          question.blanks.map((blank, blankIndex) => {
            const userAnswer = (userAnswers[qIndex]?.[blankIndex] || '').trim()
            const correctAnswersList = splitAnswers(blank.answer)
            const isBlankCorrect = blank.case_sensitive
              ? correctAnswersList.some(a => userAnswer === a)
              : correctAnswersList.some(a => userAnswer.toLowerCase() === a.toLowerCase())
            return {
              exercise_id: exerciseId,
              exercise_type: 'fill_blank',
              question_id: question.id || `q${qIndex}`,
              question_index: qIndex * 100 + blankIndex,
              user_id: user.id,
              selected_answer: userAnswer,
              correct_answer: blank.answer,
              is_correct: isBlankCorrect,
              attempt_number: attemptNumber,
              response_time: Date.now() - startTime
            }
          })
        )
        const { error: insertError } = await supabase.from('question_attempts').insert(attempts)
        if (insertError) console.error('⚠️ Fill blank submitAll insert error:', insertError)
      } catch (err) {
        console.error('⚠️ Could not save question attempts:', err.message)
      }
    }

    // Save progress
    try {
      const roundedScore = Math.round(averageScore)
      const baseXP = exercise?.xp_reward || 10
      const bonusXP = roundedScore >= 95 ? Math.round(baseXP * 0.5) : roundedScore >= 90 ? Math.round(baseXP * 0.3) : 0
      const totalXP = baseXP + bonusXP

      if (exerciseId && user && !isTeacherView) {
        await completeExerciseWithXP(exerciseId, totalXP, {
          score: roundedScore,
          max_score: 100,
          challengeId: challengeId, // Pass challengeId for daily challenge tracking
          challengeStartedAt: challengeStartTime // Pass challenge start time for accurate timing
        })
        setXpAwarded(totalXP)
      }
    } catch (err) {
      console.error('Error marking fill_blank exercise completed:', err)
    }

    setExerciseCompleted(true)
  }

  const handleRecheck = () => {
    setHasEdited(false)

    // Recalculate score - only show feedback, not answers
    const correctAnswers = currentQuestion.blanks.filter((_, blankIndex) =>
      checkAnswer(blankIndex)
    ).length
    const questionScore = (correctAnswers / currentQuestion.blanks.length) * 100
    setScore(questionScore)
  }

  const handleShowAnswers = () => {
    setShowCorrectAnswers(true)
    setShowExplanation(true)
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
      // Build question context for fill blank
      const userFilledAnswers = currentQuestion.blanks.map((_, blankIndex) =>
        userAnswers[currentQuestionIndex]?.[blankIndex] || '(empty)'
      ).join(', ')

      const correctAnswersList = currentQuestion.blanks.map(blank =>
        firstAnswer(blank.answer)
      ).join(', ')

      // Strip HTML tags from question for cleaner prompt
      const questionText = currentQuestion.question.replace(/<[^>]*>/g, '').replace(/(_____|\[blank\])/gi, '___')

      const questionData = {
        question: questionText,
        selectedAnswer: userFilledAnswers,
        correctAnswer: correctAnswersList
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

  const handleNext = useCallback(async () => {
    // Save current question score
    const currentScore = score

    if (retryMode) {
      // In retry mode, update the specific question score
      const newScores = [...questionScores]
      newScores[currentQuestionIndex] = currentScore
      setQuestionScores(newScores)

      // Find next retry question
      const currentRetryIndex = retryQuestions.indexOf(currentQuestionIndex)
      if (currentRetryIndex < retryQuestions.length - 1) {
        // Trigger Batman movement
        setIsBatmanMoving(true)
        setTimeout(() => setIsBatmanMoving(false), 3000)

        // Move to next retry question
        setCurrentQuestionIndex(retryQuestions[currentRetryIndex + 1])
        setShowResults(false)
        setShowExplanation(false)
        setHasEdited(false)
        setShowCorrectAnswers(false)
        // Reset pet tutor state
        setShowPetTutor(false)
        setPetTutorMessage('')
        return
      } else {
        // Finished all retry questions, calculate final score
        const finalScores = newScores
        const averageScore = finalScores.reduce((sum, s) => sum + s, 0) / finalScores.length
        setTotalScore(averageScore)
        setExerciseCompleted(true)
        setRetryMode(false)
        setRetryQuestions([])

        // Update user_progress with the new score after retry
        const urlParams = new URLSearchParams(location.search)
        const exerciseId = urlParams.get('exerciseId')
        try {
          const roundedScore = Math.round(averageScore)
          const baseXP = exercise?.xp_reward || 10
          const bonusXP = roundedScore >= 95 ? Math.round(baseXP * 0.5) : roundedScore >= 90 ? Math.round(baseXP * 0.3) : 0
          const totalXP = baseXP + bonusXP

          if (exerciseId && user) {
            await completeExerciseWithXP(exerciseId, totalXP, {
              score: roundedScore,
              max_score: 100,
              challengeId: challengeId,
              challengeStartedAt: challengeStartTime
            })
            setXpAwarded(totalXP)
          }
        } catch (err) {
          console.error('Error updating score after retry:', err)
        }
        return
      }
    }

    // Normal mode navigation
    if (currentQuestionIndex < questions.length - 1) {
      // Trigger Batman movement
      setIsBatmanMoving(true)
      setTimeout(() => setIsBatmanMoving(false), 3000)

      setQuestionScores(prev => [...prev, currentScore])

      setCurrentQuestionIndex(prev => prev + 1)
      setShowResults(false)
      setShowExplanation(false)
      setHasEdited(false)
      setShowCorrectAnswers(false)
      // Reset pet tutor state for next question
      setShowPetTutor(false)
      setPetTutorMessage('')
    } else {
      // Exercise completed - show results screen
      const currentScore = score
      const finalScores = [...questionScores, currentScore]
      const averageScore = finalScores.reduce((sum, s) => sum + s, 0) / finalScores.length

      setQuestionScores(finalScores)
      setTotalScore(averageScore)
      setExerciseCompleted(true)
      setShowResults(false)
      setShowExplanation(false)

      // Play celebration if passed
      if (averageScore >= 80) {
        playCelebration()
      }

      const urlParams = new URLSearchParams(location.search)
      const exerciseId = urlParams.get('exerciseId')

      // Mark exercise completed with XP
      try {
        const roundedScore = Math.round(averageScore)
        const baseXP = exercise?.xp_reward || 10
        const bonusXP = roundedScore >= 95 ? Math.round(baseXP * 0.5) : roundedScore >= 90 ? Math.round(baseXP * 0.3) : 0
        const totalXP = baseXP + bonusXP

        if (exerciseId && user) {
          await completeExerciseWithXP(exerciseId, totalXP, {
            score: roundedScore,
            max_score: 100,
            challengeId: challengeId, // Pass challengeId for daily challenge tracking
            challengeStartedAt: challengeStartTime // Pass challenge start time for accurate timing
          })
          setXpAwarded(totalXP)
        }
      } catch (err) {
        console.error('Error marking fill_blank exercise completed:', err)
      }
    }
  }, [score, retryMode, questionScores, currentQuestionIndex, retryQuestions, questions.length, location.search, exercise?.xp_reward, user, completeExerciseWithXP, playCelebration])

  useEffect(() => {
    // Handle Enter key to move to next question when results are showing
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Enter' && showResults && !showAllQuestions) {
        e.preventDefault()
        handleNext()
      }
    }

    if (showResults && !showAllQuestions) {
      window.addEventListener('keydown', handleGlobalKeyDown)
    }

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [showResults, showAllQuestions, handleNext])

  const handleBackToSession = () => {
    const urlParams = new URLSearchParams(location.search)
    const sessionId = urlParams.get('sessionId')
    const courseId = urlParams.get('courseId')
    const unitId = urlParams.get('unitId')
    
    if (sessionId && unitId && courseId) {
      navigate(`/study/course/${courseId}/unit/${unitId}/session/${sessionId}`)
    } else {
      navigate(-1)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-8">
          <LoadingSpinner />
          <p className="text-gray-500 mt-4">Loading exercise...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Exercise</h3>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 mx-auto px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!exercise || questions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-8">
          <p className="text-gray-500">No questions available</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    )
  }


  // Calculate correct answers and wrong questions for celebration screen
  const correctAnswersCount = questionScores.filter(s => s >= 80).length
  const wrongQuestionsForRetry = questionScores
    .map((score, index) => ({ score, index }))
    .filter(q => q.score < 80)
    .map(q => q.index)

  const handleRetryWrongQuestions = () => {
    if (wrongQuestionsForRetry.length > 0) {
      setAttemptNumber(prev => prev + 1)

      const newScores = [...questionScores]
      wrongQuestionsForRetry.forEach(qIndex => {
        newScores[qIndex] = 0
      })
      setQuestionScores(newScores)

      setRetryMode(true)
      setRetryQuestions(wrongQuestionsForRetry)

      setExerciseCompleted(false)
      setCurrentQuestionIndex(wrongQuestionsForRetry[0])
      setShowResults(false)
      setShowExplanation(false)
      setShowCorrectAnswers(false)
      setHasEdited(false)
      setTotalScore(0)
      setHasPlayedPassAudio(false)
    }
  }

  const renderQuestionText = (questionIndex = currentQuestionIndex) => {
    const question = questions[questionIndex]
    let text = question.question || ''
    let blankIndex = 0

    // Replace blanks with input fields - handle multiple blanks per question
    return text.split(/(_____|\[blank\])/gi).map((part, index) => {
      if (part.match(/^(_____|\[blank\])$/gi)) {
        const currentBlankIndex = blankIndex++
        const status = showResults ? (checkAnswerForQuestion(questionIndex, currentBlankIndex) ? 'correct' : 'incorrect') : 'neutral'
        const blank = question.blanks[currentBlankIndex]

        // If we have more blanks than expected, create a placeholder
        if (!blank) {
          return (
            <span key={index} className="inline-block mx-1">
              <div className="relative">
                <input
                  type="text"
                  value=""
                  disabled
                  style={{ width: '64px' }}
                  className="px-1 py-1 border-0 border-b-2 border-b-gray-300 bg-transparent text-center cursor-not-allowed"
                  placeholder="?"
                />
                <div className="absolute -bottom-6 left-0 text-xs text-red-500 whitespace-nowrap">
                  Missing blank data
                </div>
              </div>
            </span>
          )
        }

        return (
          <span key={index} className="inline-block mx-1">
            <div className="relative">
              <input
                ref={(el) => {
                  if (!inputRefs.current[questionIndex]) {
                    inputRefs.current[questionIndex] = {}
                  }
                  inputRefs.current[questionIndex][currentBlankIndex] = el
                }}
                type="text"
                value={userAnswers[questionIndex]?.[currentBlankIndex] || ''}
                onChange={(e) => {
                  setUserAnswers(prev => ({
                    ...prev,
                    [questionIndex]: {
                      ...prev[questionIndex],
                      [currentBlankIndex]: e.target.value
                    }
                  }))
                }}
                onKeyDown={(e) => handleKeyDown(e, questionIndex, currentBlankIndex)}
                disabled={showResults}
                style={{ width: `${calculateBlankWidthForQuestion(questionIndex, currentBlankIndex)}px` }}
                className={`px-1 py-1 border-0 border-b-2 bg-transparent text-center focus:outline-none ${
                  status === 'correct'
                    ? 'border-b-green-500 text-green-700'
                    : status === 'incorrect'
                    ? 'border-b-red-500 text-red-700'
                    : 'border-b-gray-400 focus:border-b-blue-500'
                } ${showResults ? 'cursor-not-allowed opacity-75' : ''}`}
                placeholder=" "
              />
            </div>
          </span>
        )
      }
      // Non-blank parts: render rich text (images/audio/html/link)
      const html = markdownToHtml(part)
      return (
        <span key={index} className="inline">
          <RichTextRenderer content={html} allowImages allowLinks className="prose inline max-w-none" />
        </span>
      )
    })
  }

  const checkAnswerForQuestion = (questionIndex, blankIndex) => {
    const question = questions[questionIndex]
    const userAnswer = (userAnswers[questionIndex]?.[blankIndex] || '').trim()
    const correctAnswers = splitAnswers(question.blanks[blankIndex].answer)
    const caseSensitive = question.blanks[blankIndex].case_sensitive

    if (caseSensitive) {
      return correctAnswers.some(answer => userAnswer === answer)
    } else {
      return correctAnswers.some(answer => userAnswer.toLowerCase() === answer.toLowerCase())
    }
  }

  const calculateBlankWidthForQuestion = (questionIndex, blankIndex) => {
    const question = questions[questionIndex]
    const blank = question?.blanks?.[blankIndex]
    if (!blank) return 64

    const answers = splitAnswers(blank.answer)

    const longestAnswer = answers.reduce((longest, current) =>
      current.length > longest.length ? current : longest, ''
    )

    return Math.max(64, Math.min(400, longestAnswer.length * 16 + 32))
  }

  // Convert simple markdown/HTML to safe HTML similar to editors
  const markdownToHtml = (text) => {
    if (!text) return ''
    let html = text
    // Images markdown ![](url)
    html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, url) => `<img src="${url}" alt="${alt || ''}" class="max-w-full h-auto align-middle" />`)
    // HTML <img>
    html = html.replace(/<img([^>]*?)>/g, (m, attrs) => `<img${attrs} class="max-w-full h-auto align-middle" />`)
    // HTML <audio>
    html = html.replace(/<audio([^>]*?)>/g, (m, attrs) => `<audio${attrs} class="w-full align-middle"></audio>`)
    // Links [text](url)
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, (m, t, url) => `<a href="${url}" target="_blank" rel="noreferrer">${t || url}</a>`)
    // Preserve line breaks
    html = html.replace(/\n/g, '<br/>')
    return html
  }

  // Teacher view: read-only preview showing all questions with correct answers filled in
  if (isTeacherView && teacherMode === 'review') {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{exercise?.title || 'Fill in the Blank'}</h2>
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
        {exercise?.content?.intro && String(exercise.content.intro).trim() && (
          <div className="mb-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <RichTextRenderer content={stripAudioTags(exercise.content.intro)} allowImages={true} allowLinks={false} />
            {extractAudioUrls(exercise.content.intro).map((audio, i) => (
              <AudioPlayer key={i} audioUrl={audio.url} maxPlays={audio.maxPlays} />
            ))}
          </div>
        )}
        <div className="space-y-6">
          {questions.map((question, qIndex) => {
            let blankIdx = 0
            const text = question.question || ''
            const questionAudio = extractAudioUrls(text)
            const strippedText = stripAudioTags(text)
            const introAudio = question.intro ? extractAudioUrls(question.intro) : []
            return (
              <div key={qIndex} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                {question.intro && String(question.intro).trim() && (
                  <div className="mb-3 ml-11">
                    <RichTextRenderer content={stripAudioTags(question.intro)} allowImages={true} allowLinks={false} />
                    {introAudio.map((audio, i) => (
                      <AudioPlayer key={i} audioUrl={audio.url} maxPlays={audio.maxPlays} />
                    ))}
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">{qIndex + 1}</span>
                  <div className="text-lg leading-relaxed flex-1">
                    {strippedText.split(/(_{3,}|\[blank\])/gi).map((part, index) => {
                      if (part.match(/^_{3,}$/) || part.toLowerCase() === '[blank]') {
                        const currentBlankIdx = blankIdx++
                        const blank = question.blanks?.[currentBlankIdx]
                        if (!blank) return <span key={index}>_____</span>
                        const answer = firstAnswer(blank.answer) || '_____'
                        return (
                          <span key={index} className="inline-block mx-1 px-2 py-0.5 rounded font-bold bg-green-100 text-green-800 border border-green-300">
                            {answer}
                          </span>
                        )
                      }
                      return (
                        <span key={index} className="inline">
                          <RichTextRenderer content={part} allowImages allowLinks className="prose inline max-w-none" />
                        </span>
                      )
                    })}
                    {questionAudio.length > 0 && (
                      <div className="mt-2 flex gap-2">
                        {questionAudio.map((audio, i) => (
                          <AudioPlayer key={i} audioUrl={audio.url} maxPlays={audio.maxPlays} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {question.explanation && (
                  <div className="ml-11 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                    <strong>Explanation:</strong> {question.explanation}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // testMode: render all questions without gamification
  if (testMode) {
    return (
      <div className="space-y-6">
        {/* Global Intro */}
        {exercise?.content?.intro && String(exercise.content.intro).trim() && (
          <div className="w-full max-w-4xl min-w-0 mx-auto rounded-lg p-4 md:p-6 bg-white shadow-sm border border-gray-200">
            <RichTextRenderer
              content={stripAudioTags(exercise.content.intro)}
              allowImages={true}
              allowLinks={false}
              style={{ whiteSpace: 'pre-wrap' }}
            />
            {exerciseIntroAudio.length > 0 && (
              <div className="mt-4 space-y-2">
                {exerciseIntroAudio.map((audioUrl, index) => (
                  <AudioPlayer key={index} audioUrl={audioUrl.url} seekable={audioUrl.seekable} maxPlays={audioUrl.maxPlays} variant="outline" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Questions */}
        <div className="space-y-8">
          {questions.map((question, qIndex) => {
            const questionIntroAudio = question.intro ? extractAudioUrls(question.intro) : []
            const questionAudio = question.question ? extractAudioUrls(question.question) : []

            return (
              <div key={qIndex} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm font-semibold text-blue-600">Question {qIndex + 1}</span>
                </div>
                {question.intro && String(question.intro).trim() && (
                  <div className="mb-4">
                    <RichTextRenderer content={stripAudioTags(question.intro)} allowImages={true} allowLinks={false} />
                  </div>
                )}
                {questionIntroAudio.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {questionIntroAudio.map((audioUrl, index) => (
                      <AudioPlayer key={index} audioUrl={audioUrl.url} seekable={audioUrl.seekable} maxPlays={audioUrl.maxPlays} variant="outline" />
                    ))}
                  </div>
                )}
                <div className="text-lg leading-relaxed">
                  {renderQuestionText(qIndex)}
                </div>
                {questionAudio.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {questionAudio.map((audioUrl, index) => (
                      <AudioPlayer key={index} audioUrl={audioUrl.url} seekable={audioUrl.seekable} maxPlays={audioUrl.maxPlays} variant="outline" />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Render all questions on one page
  if (showAllQuestions) {
    const allAnswersFilled = questions.every((question, qIndex) =>
      question.blanks.every((_, blankIndex) =>
        (userAnswers[qIndex]?.[blankIndex] || '').trim() !== ''
      )
    )

    return (
      <div className="px-4 pt-6 pb-12">
        {/* Celebration Screen Overlay */}
        {exerciseCompleted && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <CelebrationScreen
              score={Math.round(totalScore)}
              correctAnswers={correctAnswersCount}
              totalQuestions={questions.length}
              passThreshold={80}
              xpAwarded={xpAwarded}
              passGif={passGif}
              isRetryMode={retryMode}
              wrongQuestionsCount={retryMode ? 0 : wrongQuestionsForRetry.length}
              onRetryWrongQuestions={handleRetryWrongQuestions}
              onBackToList={handleBackToSession}
              exerciseId={exerciseId}
            />
          </div>
        )}
        {/* Meme Overlay */}
        {showMeme && currentMeme && (
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
            <img
              src={currentMeme}
              alt="Feedback meme"
              className="max-w-xs max-h-64 rounded-lg shadow-2xl"
            />
          </div>
        )}
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Teacher Do Mode Banner */}
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
          <div className="bg-white rounded-lg shadow-sm p-4 md:p-5 border border-gray-200 mb-6">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-lg md:text-2xl font-bold text-gray-900">{exercise.title}</h1>
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
            </div>
          </div>

          {/* Global Intro (exercise.content.intro) */}
          {exercise?.content?.intro && String(exercise.content.intro).trim() && (
            <div className="w-full max-w-4xl min-w-0 mx-auto rounded-lg p-4 md:p-6 bg-white shadow-sm border border-gray-200">
              <RichTextRenderer
                content={stripAudioTags(exercise.content.intro)}
                allowImages={true}
                allowLinks={false}
                style={{ whiteSpace: 'pre-wrap' }}
              />
              {/* Audio players for global intro */}
              {exerciseIntroAudio.length > 0 && (
                <div className="mt-4 space-y-2">
                  {exerciseIntroAudio.map((audioUrl, index) => (
                    <AudioPlayer
                      key={index}
                      audioUrl={audioUrl.url}
                      seekable={audioUrl.seekable}
                      maxPlays={audioUrl.maxPlays}
                      variant="outline"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* All Questions */}
          <div className="space-y-8">
            {questions.map((question, qIndex) => {
              const questionIntroAudio = question.intro ? extractAudioUrls(question.intro) : []
              const questionAudio = question.question ? extractAudioUrls(question.question) : []

              return (
                <div key={qIndex} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-sm font-semibold text-blue-600">Question {qIndex + 1}</span>
                    {showResults && questionScores[qIndex] !== undefined && (
                      <span className={`text-sm font-medium ${
                        questionScores[qIndex] >= 80 ? 'text-green-600' :
                        questionScores[qIndex] >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        ({Math.round(questionScores[qIndex])}%)
                      </span>
                    )}
                  </div>
                  {/* Intro above question (optional) */}
                  {question.intro && String(question.intro).trim() && (
                    <div className="mb-4">
                      <RichTextRenderer
                        content={stripAudioTags(question.intro)}
                        allowImages={true}
                        allowLinks={false}
                      />
                    </div>
                  )}

                  {/* Audio players for intro */}
                  {questionIntroAudio.length > 0 && (
                    <div className="mb-4 space-y-2">
                      {questionIntroAudio.map((audioUrl, index) => (
                        <AudioPlayer
                          key={index}
                          audioUrl={audioUrl.url}
                          seekable={audioUrl.seekable}
                          maxPlays={audioUrl.maxPlays}
                          variant="outline"
                        />
                      ))}
                    </div>
                  )}

                  <div className="text-lg leading-relaxed">
                    {renderQuestionText(qIndex)}
                  </div>

                  {/* Audio players for question */}
                  {questionAudio.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {questionAudio.map((audioUrl, index) => (
                        <AudioPlayer
                          key={index}
                          audioUrl={audioUrl.url}
                          seekable={audioUrl.seekable}
                          maxPlays={audioUrl.maxPlays}
                          variant="outline"
                        />
                      ))}
                    </div>
                  )}

                  {/* Correct answers for each question after submission */}
                  {showResults && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-2">
                      <h4 className="font-medium text-gray-700 text-sm">Correct Answers:</h4>
                      {question.blanks.map((blank, blankIndex) => {
                        const correctAns = splitAnswers(blank.answer)
                        return (
                          <div key={blankIndex} className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-gray-600">Blank {blankIndex + 1}:</span>
                            <div className="flex gap-1 flex-wrap">
                              {correctAns.map((answer, answerIndex) => (
                                <span key={answerIndex} className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                                  {answer}
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Explanation for each question after submission */}
                  {showResults && question.explanation && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-1 text-sm">Explanation</h4>
                      <p className="text-blue-800 text-sm">{question.explanation}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Results Summary and Actions */}
          {showResults && (
            <div className="mt-8 bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="text-center mb-6">
                <div className={`text-5xl font-bold mb-2 ${
                  totalScore >= 80 ? 'text-green-600' :
                  totalScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {Math.round(totalScore)}%
                </div>
                <p className="text-gray-600 text-lg">Overall Score</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <button
                  onClick={handleBackToSession}
                  className="w-full sm:w-auto px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Back to Session
                </button>
                <button
                  onClick={() => {
                    // Clear only wrong answers
                    const newUserAnswers = {}
                    questions.forEach((question, qIndex) => {
                      newUserAnswers[qIndex] = {}
                      question.blanks.forEach((blank, blankIndex) => {
                        const userAnswer = userAnswers[qIndex]?.[blankIndex] || ''
                        const correctAnswers = splitAnswers(blank.answer)
                        const caseSensitive = blank.case_sensitive

                        // Check if answer is correct
                        const isCorrect = caseSensitive
                          ? correctAnswers.some(answer => userAnswer === answer)
                          : correctAnswers.some(answer => userAnswer.toLowerCase() === answer.toLowerCase())

                        // Keep correct answers, clear wrong ones
                        newUserAnswers[qIndex][blankIndex] = isCorrect ? userAnswer : ''
                      })
                    })

                    setUserAnswers(newUserAnswers)
                    setShowResults(false)
                    setShowCorrectAnswers(false)
                    setQuestionScores([])
                    setTotalScore(0)
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* Submit Button */}
          {!showResults && (
            <div className="text-center mt-8">
              <button
                onClick={handleSubmitAll}
                disabled={!allAnswersFilled}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-lg"
              >
                Submit All Answers
              </button>
              <p className="text-sm text-gray-500 mt-2">
                {allAnswersFilled ? 'All blanks filled!' : 'Please fill in all blanks before submitting'}
              </p>
            </div>
          )}
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

      <div className="relative px-4 pt-6 pb-12">
      {/* Celebration Screen Overlay */}
      {exerciseCompleted && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <CelebrationScreen
            score={Math.round(totalScore)}
            correctAnswers={correctAnswersCount}
            totalQuestions={questions.length}
            passThreshold={80}
            xpAwarded={xpAwarded}
            passGif={passGif}
            isRetryMode={retryMode}
            wrongQuestionsCount={retryMode ? 0 : wrongQuestionsForRetry.length}
            onRetryWrongQuestions={handleRetryWrongQuestions}
            onBackToList={handleBackToSession}
          />
        </div>
      )}
      {/* Meme Overlay */}
      {showMeme && currentMeme && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <img
            src={currentMeme}
            alt="Feedback meme"
            className="max-w-xs max-h-64 rounded-lg shadow-2xl"
          />
        </div>
      )}
      <div className="max-w-4xl mx-auto space-y-6">
      {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}
      {/* Teacher Do Mode Banner */}
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
      <ExerciseHeader
        title={exercise?.title}
        totalQuestions={questions.length}
        progressPercentage={
          retryMode
            ? (questionScores.filter(score => score >= 80).length / retryQuestions.length) * 100
            : (questionScores.filter(score => score >= 80).length / questions.length) * 100
        }
        isBatmanMoving={isBatmanMoving}
        isRetryMode={retryMode}
        showProgressLabel={false}
        colorTheme={colorTheme}
      />

      {/* Global Intro (exercise.content.intro) */}
      {exercise?.content?.intro && String(exercise.content.intro).trim() && (
        <div className="w-full max-w-4xl min-w-0 mx-auto rounded-lg p-4 md:p-6 bg-white shadow-sm border border-gray-200">
          <RichTextRenderer
            content={exercise.content.intro}
            allowImages={true}
            allowLinks={false}
            style={{ whiteSpace: 'pre-wrap' }}
          />
          {/* Audio players for global intro */}
          {exerciseIntroAudio.length > 0 && (
            <div className="mt-4 space-y-2">
              {exerciseIntroAudio.map((audioUrl, index) => (
                <AudioPlayer
                  key={index}
                  audioUrl={audioUrl.url}
                  seekable={audioUrl.seekable}
                  maxPlays={audioUrl.maxPlays}
                  variant="outline"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Question */}
      <div className="w-full max-w-4xl min-w-0 mx-auto rounded-lg p-4 md:p-8 bg-white shadow-md border border-gray-200">
        <div className="flex justify-end -mt-1 -mr-1 mb-2">
          <QuestionReportButton
            exercise={exercise}
            question={currentQuestion}
            questionIndex={currentQuestionIndex}
            userAnswer={userAnswers?.[currentQuestionIndex]}
          />
        </div>
        {/* Intro above question (optional) */}
        {currentQuestion.intro && String(currentQuestion.intro).trim() && (
          <div className="mb-4">
            <RichTextRenderer
              content={stripAudioTags(currentQuestion.intro)}
              allowImages={true}
              allowLinks={false}
            />
          </div>
        )}

        {/* Audio players for intro */}
        {currentQuestionIntroAudio.length > 0 && (
          <div className="mb-4 space-y-2">
            {currentQuestionIntroAudio.map((audioUrl, index) => (
              <AudioPlayer
                key={index}
                audioUrl={audioUrl.url}
                seekable={audioUrl.seekable}
                maxPlays={audioUrl.maxPlays}
                variant="outline"
              />
            ))}
          </div>
        )}

        <div className="text-lg leading-relaxed mb-4">
          {renderQuestionText()}
        </div>

        {/* Audio players for question */}
        {currentQuestionAudio.length > 0 && (
          <div className="mt-4 space-y-2">
            {currentQuestionAudio.map((audioUrl, index) => (
              <AudioPlayer
                key={index}
                audioUrl={audioUrl.url}
                seekable={audioUrl.seekable}
                maxPlays={audioUrl.maxPlays}
                variant="outline"
              />
            ))}
          </div>
        )}

        {/* Results */}
        {showResults && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <span className="text-lg font-medium text-gray-700">Score: </span>
                <span className={`text-xl font-bold ml-2 ${
                  score >= 80 ? 'text-green-600' :
                  score >= 60 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {Math.round(score)}%
                </span>
              </div>
              <div className="flex gap-2">
                {hasEdited && !showCorrectAnswers && (
                  <button
                    onClick={handleRecheck}
                    className="flex items-center gap-1 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Check className="w-4 h-4" />
                    Check Answer
                  </button>
                )}
                {showResults && !showCorrectAnswers && (
                  <button
                    onClick={handleShowAnswers}
                    className="flex items-center gap-1 px-4 py-2 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
                  >

                    Show Key
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {currentQuestionIndex < questions.length - 1 ? 'Next' : 'Finish Exercise'}
                </button>
              </div>
            </div>

            {/* Pet Tutor - Ask Pet button (only for wrong answers) */}
            {FEATURES.pets && score < 100 && activePet && (
              <div className="mb-3">
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

             {/* Correct Answers - only show when answers are revealed */}
             {showCorrectAnswers && (
               <div className="space-y-2">
                 <h4 className="font-medium text-gray-700">Correct Answers:</h4>
                 {currentQuestion.blanks.map((blank, blankIndex) => {
                 const correctAnswers = splitAnswers(blank.answer)
                 
                 return (
                   <div key={blankIndex} className="flex items-center gap-2 flex-wrap">
                     <span className="text-sm text-gray-600">Blank {blankIndex + 1}:</span>
                     <div className="flex gap-1 flex-wrap">
                       {correctAnswers.map((answer, answerIndex) => (
                         <span key={answerIndex} className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                           {answer}
                         </span>
                       ))}
                     </div>
                     {blank.text && (
                       <span className="text-xs text-gray-500">(Hint: {blank.text})</span>
                     )}
                     {blank.case_sensitive && (
                       <span className="text-xs text-gray-500">(case sensitive)</span>
                     )}
                   </div>
                 )
               })}
               </div>
             )}
          </div>
        )}

        {/* Explanation */}
        {showExplanation && currentQuestion.explanation && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-blue-900 mb-1">Explanation</h4>
                <p className="text-blue-800 text-sm">{currentQuestion.explanation}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submit Button */}
      {!showResults && (
        <div className="text-center">
          <button
            onClick={handleSubmit}
            disabled={!userAnswers[currentQuestionIndex] || 
              Object.values(userAnswers[currentQuestionIndex] || {}).some(answer => !answer.trim())}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
          >
            Check Answer
          </button>
        </div>
      )}
      </div>
      </div>
    </>
  )
}

export default FillBlankExercise
