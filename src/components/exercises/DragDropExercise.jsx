import React, { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { RotateCcw, CheckCircle, XCircle, ArrowLeft } from 'lucide-react'
import LoadingSpinner from '../ui/LoadingSpinner'
import Button3D from '../ui/Button3D'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import { useProgress } from '../../hooks/useProgress'
import { useFeedback } from '../../hooks/useFeedback'
import ExerciseHeader from '../ui/ExerciseHeader'
import RichTextRenderer, { RichTextWithAudio } from '../ui/RichTextRenderer'
import AudioPlayer from '../ui/AudioPlayer'
import CelebrationScreen from '../ui/CelebrationScreen'
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

// Helper function to parse content and extract audio tags
const parseContentWithAudio = (content) => {
  if (!content || typeof content !== 'string') {
    return [{ type: 'text', content }]
  }

  const segments = []
  const audioRegex = /<audio[^>]*>.*?<\/audio>|<audio[^>]*\/>/gis
  let lastIndex = 0
  let match

  while ((match = audioRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: content.substring(lastIndex, match.index)
      })
    }

    const audioTag = match[0]
    const srcMatch = audioTag.match(/src\s*=\s*["']([^"']+)["']/)

    if (srcMatch) {
      const maxPlaysMatch = audioTag.match(/data-max-plays\s*=\s*["'](\d+)["']/)
      const maxPlays = maxPlaysMatch ? parseInt(maxPlaysMatch[1]) : 0

      segments.push({
        type: 'audio',
        url: srcMatch[1],
        maxPlays: maxPlays
      })
    }

    lastIndex = audioRegex.lastIndex
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.substring(lastIndex)
    })
  }

  return segments.length > 0 ? segments : [{ type: 'text', content }]
}

// Render question text with inline audio and drop zones
const renderQuestionWithDropZones = (questionText, dropZones, renderDropZone) => {
  const parts = questionText.split(/\[DROP_ZONE_(\w+)\]/)
  return parts.map((part, index) => {
    if (index % 2 === 0) {
      // This is regular text - parse for audio and render inline
      const segments = parseContentWithAudio(part)
      return (
        <span key={index} style={{ whiteSpace: 'pre-wrap' }}>
          {segments.map((segment, segIndex) => {
            if (segment.type === 'audio') {
              return (
                <span key={segIndex} className="inline-block align-middle mx-1">
                  <AudioPlayer
                    audioUrl={segment.url}
                    maxPlays={segment.maxPlays}
                    variant="outline"
                  />
                </span>
              )
            } else {
              return (
                <RichTextRenderer
                  key={segIndex}
                  content={segment.content}
                  allowImages={true}
                  allowLinks={true}
                  style={{ display: 'inline' }}
                />
              )
            }
          })}
        </span>
      )
    } else {
      // This is a drop zone ID
      const zoneId = part
      return renderDropZone(zoneId, index)
    }
  })
}

const DragDropExercise = ({ testMode = false, exerciseData = null, onAnswersCollected = null, initialAnswers = null }) => {
  const location = useLocation()
  const navigate = useNavigate()

  // Get exerciseId and sessionId from URL search params
  const searchParams = new URLSearchParams(location.search)
  const exerciseId = searchParams.get('exerciseId')
  const sessionId = searchParams.get('sessionId')
  const challengeId = searchParams.get('challengeId') || null
  const isChallenge = searchParams.get('isChallenge') === 'true'
  const [exercise, setExercise] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [userAnswers, setUserAnswers] = useState({})
  const [isCorrect, setIsCorrect] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [draggedItem, setDraggedItem] = useState(null)
  const [dropZones, setDropZones] = useState({})
  const [randomizedItems, setRandomizedItems] = useState([])
  const [touchStartPos, setTouchStartPos] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [exerciseCompleted, setExerciseCompleted] = useState(false)
  const [xpEarnedThisSession, setXpEarnedThisSession] = useState(0)
  const [questionsChecked, setQuestionsChecked] = useState({})
  const [attempts, setAttempts] = useState(0)
  const [startTime, setStartTime] = useState(null)
  const [challengeStartTime, setChallengeStartTime] = useState(null)
  const [timeSpent, setTimeSpent] = useState(0)
  const [itemFeedback, setItemFeedback] = useState({}) // Track correct/incorrect for each item
  const [isBatmanMoving, setIsBatmanMoving] = useState(false)
  const [animatingItems, setAnimatingItems] = useState({}) // Track items being animated
  const [pendingPlacements, setPendingPlacements] = useState({}) // Track zones with pending placements (item flying to them)
  const { user } = useAuth()
  const { canCreateContent } = usePermissions()
  const { startExercise, completeExerciseWithXP } = useProgress()
  const isTeacherView = canCreateContent()
  const [teacherMode, setTeacherMode] = useState('review') // 'review' or 'do'
  const { currentMeme, showMeme, playFeedback, playCelebration, passGif } = useFeedback()
  const [showResultScreen, setShowResultScreen] = useState(false)
  const [questionResults, setQuestionResults] = useState([]) // Track results for each question
  const [session, setSession] = useState(null)
  const [hasPlayedPassAudio, setHasPlayedPassAudio] = useState(false)
  const [colorTheme, setColorTheme] = useState('blue')

  // testMode: load exercise data from props
  useEffect(() => {
    if (!testMode || !exerciseData) return
    setExercise(exerciseData)
    // Initialize user answers (restore from saved or empty)
    if (initialAnswers && Object.keys(initialAnswers).length > 0) {
      setUserAnswers(initialAnswers)
    } else {
      const emptyAnswers = {}
      if (exerciseData.content?.questions) {
        exerciseData.content.questions.forEach((_, index) => {
          emptyAnswers[index] = {}
        })
      }
      setUserAnswers(emptyAnswers)
    }
    setLoading(false)
  }, [testMode, exerciseData])

  // testMode: notify parent of answer changes (use ref to avoid infinite loops)
  const onAnswersCollectedRef = useRef(onAnswersCollected)
  const testShuffledRef = useRef(null)
  onAnswersCollectedRef.current = onAnswersCollected
  useEffect(() => {
    if (testMode && onAnswersCollectedRef.current) {
      onAnswersCollectedRef.current(userAnswers)
    }
  }, [userAnswers, testMode])

  useEffect(() => {
    if (testMode) return
    const initExercise = async () => {
      await fetchExercise()
      // Track when student enters the exercise
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

  // Fetch session info for navigation
  useEffect(() => {
    if (testMode) return
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

    if (sessionId) {
      fetchSessionInfo()
    }
  }, [sessionId])

  // Play celebration when result screen shows and passed
  useEffect(() => {
    if (testMode) return
    if (showResultScreen && !hasPlayedPassAudio && questionResults.length > 0) {
      const totalCorrectZones = questionResults.reduce((sum, r) => sum + (r.correctZones || 0), 0)
      const totalAllZones = questionResults.reduce((sum, r) => sum + (r.totalZones || 1), 0)
      const score = Math.round((totalCorrectZones / totalAllZones) * 100)
      const passed = score >= 75

      if (passed) {
        playCelebration()
        setHasPlayedPassAudio(true)
      }
    }
  }, [showResultScreen, hasPlayedPassAudio, questionResults, playCelebration])

  // Start time tracking when exercise loads
  useEffect(() => {
    if (exercise && !startTime) {
      setStartTime(Date.now())
    }
  }, [exercise, startTime])

  // Randomize items when question changes
  useEffect(() => {
    if (exercise && exercise.content.questions && exercise.content.questions.length > 0) {
      const currentQuestion = exercise.content.questions[currentQuestionIndex]
      if (currentQuestion && currentQuestion.items) {
        // Create a shuffled copy of items
        const shuffled = [...currentQuestion.items].sort(() => Math.random() - 0.5)
        setRandomizedItems(shuffled)
      }
    }
  }, [exercise?.id, currentQuestionIndex])

  const fetchExercise = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exerciseId)
        .eq('exercise_type', 'drag_drop')
        .single()

      if (error) throw error

      if (!data) {
        setError('Exercise not found')
        return
      }

      setExercise(data)
      
      // Initialize user answers
      const initialAnswers = {}
      if (data.content.questions) {
        data.content.questions.forEach((question, index) => {
          initialAnswers[index] = {}
        })
      }
      setUserAnswers(initialAnswers)
    } catch (err) {
      console.error('Error fetching exercise:', err)
      setError(err.message || 'Failed to load exercise')
    } finally {
      setLoading(false)
    }
  }

  const handleDragStart = (e, itemId, questionIndex) => {
    setDraggedItem({ itemId, questionIndex })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e, zoneId, questionIndex) => {
    e.preventDefault()
    
    if (!draggedItem || draggedItem.questionIndex !== questionIndex) return

    const newAnswers = { ...userAnswers }
    if (!newAnswers[questionIndex]) {
      newAnswers[questionIndex] = {}
    }
    
    // Remove item from previous zone if exists
    Object.keys(newAnswers[questionIndex]).forEach(zone => {
      if (newAnswers[questionIndex][zone] === draggedItem.itemId) {
        delete newAnswers[questionIndex][zone]
      }
    })
    
    // Add item to new zone
    newAnswers[questionIndex][zoneId] = draggedItem.itemId
    setUserAnswers(newAnswers)
    setDraggedItem(null)
  }

  // Touch event handlers for mobile
  const handleTouchStart = (e, itemId, questionIndex) => {
    e.preventDefault()
    const touch = e.touches[0]
    setTouchStartPos({ x: touch.clientX, y: touch.clientY })
    setDraggedItem({ itemId, questionIndex })
    setIsDragging(true)
  }

  const handleTouchMove = (e) => {
    if (!isDragging) return
    e.preventDefault()
  }

  const handleTouchEnd = (e) => {
    if (!isDragging || !draggedItem) return
    
    const touch = e.changedTouches[0]
    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    
    if (element && element.dataset.zoneId) {
      const zoneId = element.dataset.zoneId
      const questionIndex = parseInt(element.dataset.questionIndex)
      
      if (draggedItem.questionIndex === questionIndex) {
        const newAnswers = { ...userAnswers }
        if (!newAnswers[questionIndex]) {
          newAnswers[questionIndex] = {}
        }
        
        // Remove item from previous zone if exists
        Object.keys(newAnswers[questionIndex]).forEach(zone => {
          if (newAnswers[questionIndex][zone] === draggedItem.itemId) {
            delete newAnswers[questionIndex][zone]
          }
        })
        
        // Add item to new zone
        newAnswers[questionIndex][zoneId] = draggedItem.itemId
        setUserAnswers(newAnswers)
      }
    }
    
    setDraggedItem(null)
    setIsDragging(false)
    setTouchStartPos(null)
  }

  // Handle click on item - automatically place in next available zone
  const handleItemClick = (itemId, questionIndex, instanceKey) => {
    const userAnswer = userAnswers[questionIndex] || {}
    const question = exercise.content.questions[questionIndex]
    const pending = pendingPlacements[questionIndex] || {}

    // Count how many instances of this item ID exist in the items list
    const totalInstances = (question.items || []).filter(i => i.id === itemId).length
    // Count how many are already placed in zones
    const placedCount = Object.values(userAnswer).filter(id => id === itemId).length
    // Count how many have pending placements
    const pendingCount = Object.values(pending).filter(id => id === itemId).length
    // This specific instance is "used" if placed + pending >= total instances up to this one
    const isThisInstanceUsed = placedCount + pendingCount >= totalInstances

    if (isThisInstanceUsed && placedCount > 0) {
      // Remove ONE instance from zones (the last one placed)
      const newAnswers = { ...userAnswers }
      if (!newAnswers[questionIndex]) {
        newAnswers[questionIndex] = {}
      }

      // Find and remove only the first matching zone
      const zoneToRemove = Object.keys(newAnswers[questionIndex]).find(zone =>
        newAnswers[questionIndex][zone] === itemId
      )
      if (zoneToRemove) {
        delete newAnswers[questionIndex][zoneToRemove]
      }
      setUserAnswers(newAnswers)
    } else if (placedCount + pendingCount < totalInstances) {
      // Find next available drop zone (excluding zones with pending placements)
      const availableZone = question.drop_zones.find(zone =>
        !userAnswer[zone.id] && !pending[zone.id]
      )

      if (availableZone) {
        // Mark this zone as having a pending placement
        setPendingPlacements(prev => ({
          ...prev,
          [questionIndex]: {
            ...(prev[questionIndex] || {}),
            [availableZone.id]: itemId
          }
        }))

        // Play whoosh sound
        try {
          const audio = new Audio(assetUrl('/sound/whoosh_transition.mp3'))
          audio.volume = 0.5
          audio.play().catch(e => console.log('Could not play sound:', e))
        } catch (e) {
          console.log('Sound not supported:', e)
        }

        // Get positions for animation
        const itemElement = document.querySelector(`[data-item-id="${instanceKey || itemId}"]`)
        const zoneElement = document.querySelector(`[data-zone-id="${availableZone.id}"]`)

        if (itemElement && zoneElement) {
          const itemRect = itemElement.getBoundingClientRect()
          const zoneRect = zoneElement.getBoundingClientRect()

          // Create flying clone
          const clone = itemElement.cloneNode(true)
          clone.style.position = 'fixed'
          clone.style.left = `${itemRect.left}px`
          clone.style.top = `${itemRect.top}px`
          clone.style.width = `${itemRect.width}px`
          clone.style.height = `${itemRect.height}px`
          clone.style.margin = '0'
          clone.style.zIndex = '1000'
          clone.style.pointerEvents = 'none'
          clone.style.transition = 'none'
          clone.style.willChange = 'transform, left, top'
          document.body.appendChild(clone)

          // Force reflow to ensure element is rendered
          clone.offsetHeight

          // Add transition after element is rendered
          clone.style.transition = 'all 0.5s ease-in-out'

          // Trigger animation
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              clone.style.left = `${zoneRect.left}px`
              clone.style.top = `${zoneRect.top}px`
              clone.style.transform = 'scale(0.9)'
              clone.style.opacity = '0.8'
            })
          })

          // Remove clone and place item after animation
          setTimeout(() => {
            document.body.removeChild(clone)

            // Place item in next available zone
            setUserAnswers(prev => {
              const newAnswers = { ...prev }
              if (!newAnswers[questionIndex]) {
                newAnswers[questionIndex] = {}
              }
              newAnswers[questionIndex][availableZone.id] = itemId
              return newAnswers
            })

            // Clear the pending placement
            setPendingPlacements(prev => {
              const newPending = { ...prev }
              if (newPending[questionIndex]) {
                delete newPending[questionIndex][availableZone.id]
              }
              return newPending
            })
          }, 520)
        } else {
          // Fallback: place immediately if elements not found
          const newAnswers = { ...userAnswers }
          if (!newAnswers[questionIndex]) {
            newAnswers[questionIndex] = {}
          }

          newAnswers[questionIndex][availableZone.id] = itemId
          setUserAnswers(newAnswers)

          // Clear the pending placement
          setPendingPlacements(prev => {
            const newPending = { ...prev }
            if (newPending[questionIndex]) {
              delete newPending[questionIndex][availableZone.id]
            }
            return newPending
          })
        }
      }
    }
  }

  // Handle click on drop zone - return item to list
  const handleDropZoneClick = (zoneId, questionIndex) => {
    const userAnswer = userAnswers[questionIndex] || {}
    const itemId = userAnswer[zoneId]
    
    if (itemId) {
      // Return item to list
      const newAnswers = { ...userAnswers }
      if (!newAnswers[questionIndex]) {
        newAnswers[questionIndex] = {}
      }
      
      // Remove item from zone
      delete newAnswers[questionIndex][zoneId]
      setUserAnswers(newAnswers)
    }
  }

  const checkAnswer = async (questionIndex) => {
    const question = exercise.content.questions[questionIndex]
    const userAnswer = userAnswers[questionIndex] || {}

    // Convert user answer to array with text values
    const userOrder = question.drop_zones.map(zone => {
      const itemId = userAnswer[zone.id]
      if (!itemId) return null
      const item = question.items.find(i => i.id === itemId)
      return item ? item.text : null
    })

    // Convert correct order to text values
    const correctOrder = question.correct_order.map(itemId => {
      if (!itemId) return null
      const item = question.items.find(i => i.id === itemId)
      return item ? item.text : null
    })

    const isAnswerCorrect = JSON.stringify(userOrder) === JSON.stringify(correctOrder)
    setIsCorrect(isAnswerCorrect)
    setShowResult(true)

    // Trigger Batman movement if answer is correct
    if (isAnswerCorrect) {
      setIsBatmanMoving(true)
      setTimeout(() => setIsBatmanMoving(false), 3000)
    }

    // Play feedback (meme + sound)
    playFeedback(isAnswerCorrect)

    // Calculate feedback for each drop zone based on text values
    const feedback = {}
    question.drop_zones.forEach((zone, index) => {
      const userItemId = userAnswer[zone.id]
      const correctItemId = question.correct_order[index]

      if (userItemId) {
        const userItem = question.items.find(i => i.id === userItemId)
        const correctItem = question.items.find(i => i.id === correctItemId)

        // Compare by text content, not ID
        feedback[zone.id] = userItem?.text === correctItem?.text ? 'correct' : 'incorrect'
      }
    })

    setItemFeedback(prev => ({
      ...prev,
      [questionIndex]: feedback
    }))

    // Attempts will be incremented in saveProgress function

    // Mark question as checked
    setQuestionsChecked(prev => ({
      ...prev,
      [questionIndex]: true
    }))

    // Count correct drop zones for this question
    const correctZones = Object.values(feedback).filter(f => f === 'correct').length
    const totalZones = question.drop_zones.length

    // Track question result
    setQuestionResults(prev => {
      // Remove any existing result for this question index
      const filtered = prev.filter(r => r.questionIndex !== questionIndex)
      return [...filtered, {
        questionIndex,
        questionId: question.id,
        isCorrect: isAnswerCorrect,
        correctZones,
        totalZones
      }]
    })

    // Save progress on every question check, but don't increment attempts here
    if (user) {
      await saveProgress(questionIndex, isAnswerCorrect)
    }

    return isAnswerCorrect
  }

  const saveProgress = async (questionIndex, isCorrect) => {
    if (!user || !exercise) return

    try {
      const xpReward = exercise.xp_reward || 10

      // Calculate time spent
      const currentTime = Date.now()
      const totalTimeSpent = startTime ? Math.floor((currentTime - startTime) / 1000) : 0
      setTimeSpent(totalTimeSpent)

      // Check if all questions are completed (compare by text values)
      const allQuestionsCompleted = exercise.content.questions.every((_, index) => {
        const userAnswer = userAnswers[index] || {}
        const question = exercise.content.questions[index]
        const userOrder = question.drop_zones.map(zone => {
          const itemId = userAnswer[zone.id]
          if (!itemId) return null
          const item = question.items.find(i => i.id === itemId)
          return item ? item.text : null
        })
        const correctOrder = question.correct_order.map(itemId => {
          if (!itemId) return null
          const item = question.items.find(i => i.id === itemId)
          return item ? item.text : null
        })
        return JSON.stringify(userOrder) === JSON.stringify(correctOrder)
      })

      // Calculate score based on correct drop zones (each blank counts individually)
      let totalCorrectZones = 0
      let totalAllZones = 0
      exercise.content.questions.forEach((question, index) => {
        const userAnswer = userAnswers[index] || {}
        question.drop_zones.forEach((zone, zIdx) => {
          totalAllZones++
          const userItemId = userAnswer[zone.id]
          const correctItemId = question.correct_order[zIdx]
          if (userItemId && correctItemId) {
            const userItem = question.items.find(i => i.id === userItemId)
            const correctItem = question.items.find(i => i.id === correctItemId)
            if (userItem?.text === correctItem?.text) {
              totalCorrectZones++
            }
          }
        })
      })

      const scorePercentage = totalAllZones > 0 ? Math.round((totalCorrectZones / totalAllZones) * 100) : 0
      const score = allQuestionsCompleted ? scorePercentage : 0

      // Save question attempt per drop zone
      if (exerciseId) {
        try {
          const q = exercise.content.questions[questionIndex]
          const userAnswer = userAnswers[questionIndex] || {}
          const rows = (q.drop_zones || []).map((zone, zi) => {
            const studentItemId = userAnswer[zone.id]
            const correctItemId = (q.correct_order || [])[zi]
            return {
              user_id: user.id,
              exercise_id: exerciseId,
              exercise_type: 'drag_drop',
              question_id: `${q.id || `q${questionIndex}`}_zone${zi}`,
              selected_answer: studentItemId || null,
              correct_answer: correctItemId || null,
              is_correct: !!(studentItemId && studentItemId === correctItemId),
              attempt_number: 1,
              response_time: totalTimeSpent
            }
          })
          if (rows.length > 0) {
            await supabase.from('question_attempts').insert(rows)
          }
        } catch (err) {
          console.log('⚠️ Could not save question attempt:', err.message)
        }
      }

      // If exercise is completed, use proper XP awarding system
      if (allQuestionsCompleted && !isTeacherView) {
        const result = await completeExerciseWithXP(
          exercise.id,
          xpReward,
          {
            score: scorePercentage,
            max_score: 100,
            time_spent: totalTimeSpent,
            challengeId: challengeId,  // Pass for daily challenge tracking
            challengeStartedAt: challengeStartTime  // Pass challenge start time for accurate timing
          }
        )

        if (result.completed) {
          setExerciseCompleted(true)
          if (result.xpAwarded > 0) {
            setXpEarnedThisSession(result.xpAwarded)
          }
        }
      }
    } catch (error) {
      console.error('Error saving progress:', error)
    }
  }

  const handleFinishExercise = async () => {
    console.log('🏁 Finishing exercise');

    // Check if current question has been checked
    if (!questionsChecked[currentQuestionIndex]) {
      alert('Please check your answer before finishing.')
      return
    }

    // Trigger final save progress to complete the exercise
    if (user && exercise) {
      await saveProgress(currentQuestionIndex, true)
    }

    // Show result screen instead of navigating away
    setShowResultScreen(true)
  }

  const handleBackToList = () => {
    if (session && session.units) {
      navigate(`/study/course/${session.units.course_id}/unit/${session.unit_id}/session/${sessionId}`)
    } else {
      navigate(-1)
    }
  }

  const resetQuestion = (questionIndex) => {
    const newAnswers = { ...userAnswers }
    newAnswers[questionIndex] = {}
    setUserAnswers(newAnswers)
    setIsCorrect(null)
    setShowResult(false)

    // Reset checked status
    setQuestionsChecked(prev => ({
      ...prev,
      [questionIndex]: false
    }))

    // Reset feedback
    setItemFeedback(prev => ({
      ...prev,
      [questionIndex]: {}
    }))

    // Re-randomize items
    if (exercise && exercise.content.questions && exercise.content.questions[questionIndex]) {
      const question = exercise.content.questions[questionIndex]
      if (question && question.items) {
        const shuffled = [...question.items].sort(() => Math.random() - 0.5)
        setRandomizedItems(shuffled)
      }
    }
  }

  const nextQuestion = () => {
    if (currentQuestionIndex < exercise.content.questions.length - 1) {
      // Check if current question has been checked
      if (!questionsChecked[currentQuestionIndex]) {
        alert('Please check your answer before moving to the next question.')
        return
      }

      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setIsCorrect(null)
      setShowResult(false)
    }
  }

  const prevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
      setIsCorrect(null)
      setShowResult(false)
    }
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
  const userAnswer = userAnswers[currentQuestionIndex] || {}

  // Debug logging
  console.log('DragDropExercise render:', {
    exercise: !!exercise,
    currentQuestion: !!currentQuestion,
    currentQuestionIndex,
    totalQuestions: exercise?.content?.questions?.reduce((sum, q) => sum + (q.drop_zones?.length || 1), 0) || 0
  })

  // testMode: render all questions without gamification
  if (testMode) {
    const allQuestions = exercise.content.questions || []
    // Shuffle items once per render using a ref to keep stable order
    if (!testShuffledRef.current || testShuffledRef.current.length !== allQuestions.length) {
      testShuffledRef.current = allQuestions.map(q => [...(q.items || [])].sort(() => Math.random() - 0.5))
    }
    return (
      <div className="space-y-8" style={{ userSelect: 'none' }}>
        {exercise?.content?.intro && String(exercise.content.intro).trim() && (
          <div className="w-full max-w-4xl mx-auto rounded-lg p-4 md:p-6 bg-white shadow-sm border border-gray-200">
            <RichTextWithAudio content={exercise.content.intro} allowImages={true} allowLinks={false} />
          </div>
        )}
        {allQuestions.map((question, qIndex) => {
          const qAnswer = userAnswers[qIndex] || {}
          const qItems = testShuffledRef.current[qIndex] || question.items || []
          const placedItemIds = Object.values(qAnswer).filter(Boolean)

          return (
            <div key={qIndex} className="w-full max-w-4xl min-w-0 mx-auto rounded-lg p-4 md:p-8 bg-white shadow-md border border-gray-200">
              {/* Question with inline drop zones */}
              <div className="mb-6">
                <h2 className="text-lg font-normal text-gray-900 mb-4 leading-relaxed">
                  {renderQuestionWithDropZones(
                    question.question,
                    question.drop_zones,
                    (zoneId, index) => {
                      const itemId = qAnswer[zoneId]
                      const item = qItems.find(i => i.id === itemId)

                      return (
                        <span
                          key={index}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault()
                            if (!draggedItem || draggedItem.questionIndex !== qIndex) return
                            const newAnswers = { ...userAnswers }
                            if (!newAnswers[qIndex]) newAnswers[qIndex] = {}
                            Object.keys(newAnswers[qIndex]).forEach(zone => {
                              if (newAnswers[qIndex][zone] === draggedItem.itemId) delete newAnswers[qIndex][zone]
                            })
                            newAnswers[qIndex][zoneId] = draggedItem.itemId
                            setUserAnswers(newAnswers)
                            setDraggedItem(null)
                          }}
                          onClick={() => itemId && (() => {
                            const newAnswers = { ...userAnswers }
                            if (newAnswers[qIndex]) delete newAnswers[qIndex][zoneId]
                            setUserAnswers(newAnswers)
                          })()}
                          data-zone-id={zoneId}
                          data-question-index={qIndex}
                          className="inline-block relative mx-1 cursor-pointer"
                        >
                          {item ? (
                            <span className="px-2 py-1 rounded text-m font-medium bg-blue-100 text-blue-800">
                              {item.text}
                            </span>
                          ) : (
                            <span className="inline-block px-3 py-1 mx-1 min-w-[80px] text-center border-2 border-solid border-blue-200 bg-blue-50 rounded text-blue-400 font-medium">
                              _____
                            </span>
                          )}
                        </span>
                      )
                    }
                  )}
                </h2>
              </div>

              {/* Drag Items */}
              <div className="mb-4">
                <h3 className="text-lg font-medium text-gray-700 mb-3">Items to drag:</h3>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const placedCountsTest = {}
                    placedItemIds.forEach(id => { if (id) placedCountsTest[id] = (placedCountsTest[id] || 0) + 1 })
                    const seenCountsTest = {}
                    return qItems.map((item, itemIdx) => {
                    seenCountsTest[item.id] = (seenCountsTest[item.id] || 0) + 1
                    const isUsed = seenCountsTest[item.id] <= (placedCountsTest[item.id] || 0)
                    return (
                      <div
                        key={`${item.id}_${itemIdx}`}
                        draggable={!isUsed}
                        onDragStart={(e) => {
                          setDraggedItem({ itemId: item.id, questionIndex: qIndex })
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        data-item-id={`${item.id}_${itemIdx}`}
                        onClick={() => !isUsed && handleItemClick(item.id, qIndex, `${item.id}_${itemIdx}`)}
                        style={{
                          borderRadius: '0.75em', padding: 0, transition: 'all 0.1s',
                          cursor: isUsed ? 'default' : 'grab',
                          boxShadow: isUsed ? 'none' : '0 4px 0 0 #bfdbfe',
                          transform: isUsed ? 'none' : 'translateY(-0.2em)',
                        }}
                      >
                        <div
                          className={`select-none text-m rounded-lg ${
                            isUsed ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                          style={{ padding: '0.5em 1em', borderRadius: '0.75em' }}
                        >
                          {parseContentWithAudio(item.text).map((segment, segIndex) => {
                            if (segment.type === 'audio') {
                              return <span key={segIndex} className="inline-block align-middle mx-1"><AudioPlayer audioUrl={segment.url} maxPlays={segment.maxPlays} variant="outline" /></span>
                            }
                            return <span key={segIndex}>{segment.content}</span>
                          })}
                        </div>
                      </div>
                    )
                  })
                  })()}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Teacher view: show all questions with correct answers filled in
  if (isTeacherView && teacherMode === 'review') {
    const allQuestions = exercise.content.questions || []
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{exercise?.title || 'Drag & Drop'}</h2>
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
          <div className="w-full rounded-lg p-4 md:p-6 bg-white shadow-sm border border-gray-200 mb-4">
            <RichTextWithAudio content={exercise.content.intro} allowImages={true} allowLinks={false} />
          </div>
        )}
        <div className="space-y-6">
          {allQuestions.map((question, qIndex) => {
            const correctMapping = {}
            ;(question.drop_zones || []).forEach((zone, zIdx) => {
              if (question.correct_order && question.correct_order[zIdx]) {
                correctMapping[zone.id] = question.correct_order[zIdx]
              }
            })
            return (
              <div key={qIndex} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                <div className="flex items-start gap-3 mb-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">{qIndex + 1}</span>
                  <h3 className="text-lg font-normal text-gray-900 leading-relaxed">
                    {renderQuestionWithDropZones(
                      question.question,
                      question.drop_zones,
                      (zoneId, index) => {
                        const itemId = correctMapping[zoneId]
                        const item = (question.items || []).find(i => i.id === itemId)
                        return (
                          <span key={index} className="inline-block mx-1">
                            <span className="px-2 py-1 rounded text-m font-medium bg-green-100 text-green-800 border border-green-300">
                              {item ? item.text : '_____'}
                            </span>
                          </span>
                        )
                      }
                    )}
                  </h3>
                </div>
                <div className="ml-11 flex flex-wrap gap-2">
                  {(question.items || []).map((item, itemIdx) => (
                    <span key={`${item.id}_${itemIdx}`} className="px-2 py-1 rounded text-sm bg-gray-100 text-gray-600">
                      {item.text}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
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

      <div className="relative px-2 md:pt-2 pb-12">
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
        {/* Header - hidden when celebration screen is shown */}
        {!showResultScreen && (
          <ExerciseHeader
            title={exercise?.title}
            progressPercentage={(questionResults.filter(r => r.isCorrect).length / (exercise?.content?.questions?.length || 1)) * 100}
            isBatmanMoving={isBatmanMoving}
            showProgressLabel={false}
            showQuestionCounter={false}
            colorTheme={colorTheme}
          />
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


        {/* Global Intro */}
        {exercise?.content?.intro && String(exercise.content.intro).trim() && (
          <div className="w-full max-w-4xl min-w-0 mx-auto rounded-lg p-4 md:p-6 bg-white shadow-sm border border-gray-200 mb-4">
            <RichTextWithAudio content={exercise.content.intro} allowImages={true} allowLinks={false} />
          </div>
        )}

        {/* Main Content */}
        <div className="w-full max-w-4xl min-w-0 mx-auto rounded-lg p-4 md:p-8 bg-white shadow-md border border-gray-200 border-l-4 border-l-blue-400 relative" style={{ userSelect: 'none' }}>
          {/* Colored circles on top right */}
          <div className="absolute top-4 right-6 md:right-10 flex gap-2 z-20">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                <div className="w-3 h-3 rounded-full bg-pink-500"></div>
          </div>
          {/* Question with inline drop zones */}
          <div className="mb-8 p-4">
            <h2 className="text-lg font-normal text-gray-900 mb-4 leading-relaxed">
              {renderQuestionWithDropZones(
                currentQuestion.question,
                currentQuestion.drop_zones,
                (zoneId, index) => {
                  const zone = currentQuestion.drop_zones.find(z => z.id === zoneId)
                  const itemId = userAnswer[zoneId]
                  const item = currentQuestion.items.find(i => i.id === itemId)
                  const feedback = itemFeedback[currentQuestionIndex]?.[zoneId]

                  return (
                    <span
                      key={index}
                      onDragOver={!questionsChecked[currentQuestionIndex] ? handleDragOver : undefined}
                      onDrop={(e) => !questionsChecked[currentQuestionIndex] && handleDrop(e, zoneId, currentQuestionIndex)}
                      onTouchEnd={!questionsChecked[currentQuestionIndex] ? handleTouchEnd : undefined}
                      onClick={() => !questionsChecked[currentQuestionIndex] && handleDropZoneClick(zoneId, currentQuestionIndex)}
                      data-zone-id={zoneId}
                      data-question-index={currentQuestionIndex}
                      className={`inline-block relative mx-1 transition-all ${
                        questionsChecked[currentQuestionIndex]
                          ? 'cursor-default'
                          : 'cursor-pointer'
                      } ${
                        !questionsChecked[currentQuestionIndex] && itemId ? 'hover:bg-blue-50' :
                        !questionsChecked[currentQuestionIndex] && !itemId ? 'hover:bg-gray-50' : ''
                      }`}
                    >
                      {item ? (
                        <span className={`px-2 py-1 rounded text-m font-medium ${
                          feedback === 'correct'
                            ? 'bg-green-100 text-green-800 border-2 border-green-500'
                            : feedback === 'incorrect'
                              ? 'bg-red-100 text-red-800 border-2 border-red-500'
                              : 'bg-blue-100 text-blue-800'
                        }`}>
                          {item.text}
                        </span>
                      ) : (
                        <span className="inline-block px-3 py-1 mx-1 min-w-[80px] text-center border-2 border-solid border-blue-200 bg-blue-50 rounded text-blue-400 font-medium">
                          _____
                        </span>
                      )}
                    </span>
                  )
                }
              )}
            </h2>
          </div>

          {/* Drag Items */}
          <div className="mb-8 p-4">
            <div className="mb-4">
              <h3 className="text-lg font-medium text-gray-700">Items to drag:</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {(() => {
                // Count how many times each item ID is placed in zones
                const placedCounts = {}
                Object.values(userAnswer).forEach(id => {
                  if (id) placedCounts[id] = (placedCounts[id] || 0) + 1
                })
                // Track how many instances of each ID we've rendered so far
                const seenCounts = {}
                return randomizedItems.map((item, itemIdx) => {
                seenCounts[item.id] = (seenCounts[item.id] || 0) + 1
                const isUsed = seenCounts[item.id] <= (placedCounts[item.id] || 0)
                const isDisabled = isUsed || questionsChecked[currentQuestionIndex]

                // Determine shadow color based on state
                let shadowColor = '#93c5fd' // blue-300 default
                if (isUsed) {
                  shadowColor = '#e5e7eb' // gray-200
                }

                return (
                  <div
                    key={`${item.id}_${itemIdx}`}
                    data-item-id={`${item.id}_${itemIdx}`}
                    draggable={!isUsed && !questionsChecked[currentQuestionIndex]}
                    onDragStart={(e) => !questionsChecked[currentQuestionIndex] && handleDragStart(e, item.id, currentQuestionIndex)}
                    onTouchStart={(e) => !questionsChecked[currentQuestionIndex] && handleTouchStart(e, item.id, currentQuestionIndex)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onClick={() => !questionsChecked[currentQuestionIndex] && handleItemClick(item.id, currentQuestionIndex, `${item.id}_${itemIdx}`)}
                    className="border-none rounded-lg transition-all duration-100"
                    style={{
                      padding: 0,
                      borderRadius: '0.75em',
                      backgroundColor: shadowColor,
                      cursor: isUsed ? 'not-allowed' : questionsChecked[currentQuestionIndex] ? 'default' : 'pointer'
                    }}
                  >
                    <div
                      className={`select-none text-m rounded-lg ${
                        isUsed
                          ? 'bg-gray-100 text-gray-400'
                          : questionsChecked[currentQuestionIndex]
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                      style={{
                        display: 'block',
                        boxSizing: 'border-box',
                        transform: isDisabled ? 'translateY(0)' : 'translateY(-0.2em)',
                        transition: 'transform 0.1s ease',
                        padding: '0.5em 1em',
                        borderRadius: '0.75em'
                      }}
                      onMouseEnter={(e) => {
                        if (!isDisabled) {
                          e.currentTarget.style.transform = 'translateY(-0.33em)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isDisabled) {
                          e.currentTarget.style.transform = 'translateY(-0.2em)'
                        }
                      }}
                      onMouseDown={(e) => {
                        if (!isDisabled) {
                          e.currentTarget.style.transform = 'translateY(0)'
                        }
                      }}
                      onMouseUp={(e) => {
                        if (!isDisabled) {
                          e.currentTarget.style.transform = 'translateY(-0.33em)'
                        }
                      }}
                      onTouchStart={(e) => {
                        if (!isDisabled) {
                          e.currentTarget.style.transform = 'translateY(0)'
                        }
                      }}
                      onTouchEnd={(e) => {
                        if (!isDisabled) {
                          e.currentTarget.style.transform = 'translateY(-0.2em)'
                        }
                      }}
                    >
                      <div
                        className="flex items-center gap-2"
                        onClick={(e) => {
                          // Stop propagation if clicking on audio player
                          if (e.target.closest('button')) {
                            e.stopPropagation()
                          }
                        }}
                        onMouseDown={(e) => {
                          if (e.target.closest('button')) {
                            e.stopPropagation()
                          }
                        }}
                        onTouchStart={(e) => {
                          if (e.target.closest('button')) {
                            e.stopPropagation()
                          }
                        }}
                      >
                        {parseContentWithAudio(item.text).map((segment, segIndex) => {
                          if (segment.type === 'audio') {
                            return (
                              <span key={segIndex} className="inline-block align-middle mx-1">
                                <AudioPlayer
                                  audioUrl={segment.url}
                                  maxPlays={segment.maxPlays}
                                  variant="outline"
                                />
                              </span>
                            )
                          } else {
                            return <span key={segIndex}>{segment.content}</span>
                          }
                        })}
                      </div>
                    </div>
                  </div>
                )
              })
              })()}
            </div>
          </div>


          {/* Result */}
          {showResult && (
            <div className={`mb-6 p-4 rounded-lg ${
              isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {isCorrect ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <span className={`font-medium ${
                  isCorrect ? 'text-green-800' : 'text-red-800'
                }`}>
                  {isCorrect ? 'Correct!' : 'Incorrect. Try again.'}
                </span>
              </div>
              {currentQuestion.explanation && (
                <p className={`text-sm ${
                  isCorrect ? 'text-green-700' : 'text-red-700'
                }`}>
                  {currentQuestion.explanation}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 p-4">
            <Button3D
              onClick={() => checkAnswer(currentQuestionIndex)}
              color={questionsChecked[currentQuestionIndex] ? 'gray' : 'blue'}
              size="sm"
              className="flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {questionsChecked[currentQuestionIndex] ? 'Checked' : 'Check'}
            </Button3D>

            <Button3D
              onClick={() => resetQuestion(currentQuestionIndex)}
              color={showResult && !isCorrect ? 'green' : 'gray'}
              size="sm"
              className="flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button3D>

            {currentQuestionIndex > 0 && (
              <Button3D
                onClick={prevQuestion}
                color="gray"
                size="sm"
                className="flex items-center justify-center gap-2"
              >
                Previous
              </Button3D>
            )}

            {currentQuestionIndex < exercise.content.questions.length - 1 ? (
              <Button3D
                onClick={nextQuestion}
                disabled={!questionsChecked[currentQuestionIndex]}
                color="green"
                size="sm"
                className="flex items-center justify-center gap-2"
              >
                Next
              </Button3D>
            ) : (
              <Button3D
                onClick={handleFinishExercise}
                disabled={!questionsChecked[currentQuestionIndex]}
                color="blue"
                size="sm"
                className="flex items-center justify-center gap-2"
              >
                Finish
              </Button3D>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Result Screen */}
      {showResultScreen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <CelebrationScreen
            score={(() => {
              const cz = questionResults.reduce((sum, r) => sum + (r.correctZones || 0), 0)
              const tz = questionResults.reduce((sum, r) => sum + (r.totalZones || 1), 0)
              return Math.round((cz / tz) * 100)
            })()}
            correctAnswers={questionResults.reduce((sum, r) => sum + (r.correctZones || 0), 0)}
            totalQuestions={questionResults.reduce((sum, r) => sum + (r.totalZones || 1), 0)}
            passThreshold={75}
            xpAwarded={xpEarnedThisSession}
            passGif={passGif}
            isRetryMode={false}
            wrongQuestionsCount={0}
            onBackToList={handleBackToList}
            exerciseId={exerciseId}
          />
        </div>
      )}
    </>
  )
}

export default DragDropExercise
