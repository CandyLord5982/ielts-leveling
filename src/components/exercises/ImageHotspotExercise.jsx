import React, { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { CheckCircle, XCircle, RotateCcw, ArrowLeft } from 'lucide-react'
import LoadingSpinner from '../ui/LoadingSpinner'
import Button3D from '../ui/Button3D'
import AudioPlayer from '../ui/AudioPlayer'
import CelebrationScreen from '../ui/CelebrationScreen'
import { useAuth } from '../../hooks/useAuth'
import { useProgress } from '../../hooks/useProgress'
import { useFeedback } from '../../hooks/useFeedback'
import ExerciseHeader from '../ui/ExerciseHeader'
import { usePermissions } from '../../hooks/usePermissions'
import TeacherExerciseNav from '../ui/TeacherExerciseNav'

import { assetUrl, useBranding } from '../../hooks/useBranding';
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

const ImageHotspotExercise = ({ testMode = false, exerciseData = null, onAnswersCollected = null, initialAnswers = null }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { branding } = useBranding()

  const searchParams = new URLSearchParams(location.search)
  const exerciseId = searchParams.get('exerciseId')
  const sessionId = searchParams.get('sessionId')
  const challengeId = searchParams.get('challengeId') || null
  const isChallenge = searchParams.get('isChallenge') === 'true'

  const { user } = useAuth()
  const { startExercise, completeExerciseWithXP } = useProgress()
  const { playFeedback, showMeme, currentMeme, playCelebration, passGif } = useFeedback()
  const { canCreateContent } = usePermissions()
  const isTeacherView = canCreateContent()

  const [exercise, setExercise] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [teacherMode, setTeacherMode] = useState('review') // 'review' or 'do'
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [userAnswers, setUserAnswers] = useState(() => (testMode && initialAnswers) ? initialAnswers : {}) // { hotspot_id: label_id }
  const [hotspotFeedback, setHotspotFeedback] = useState({}) // { hotspot_id: { correct, attempts, showFeedback } }
  const [shuffledLabels, setShuffledLabels] = useState([])
  const [exerciseComplete, setExerciseComplete] = useState(false)
  const [xpEarned, setXpEarned] = useState(0)
  const [startTime, setStartTime] = useState(null)
  const [challengeStartTime, setChallengeStartTime] = useState(null)
  const [imageScale, setImageScale] = useState(1)
  const [isBatmanMoving, setIsBatmanMoving] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [prevProgress, setPrevProgress] = useState(0)
  const [session, setSession] = useState(null)
  const [colorTheme, setColorTheme] = useState('blue')
  const [hasPlayedPassAudio, setHasPlayedPassAudio] = useState(false)
  const [hasEarnedXP, setHasEarnedXP] = useState(false)

  const imageRef = useRef(null)
  const containerRef = useRef(null)

  // Extract media elements from question HTML
  const extractMediaFromQuestion = (questionHtml) => {
    if (!questionHtml) return { textOnly: '', imageHtml: '', audioUrls: [] }

    const parser = new DOMParser()
    const doc = parser.parseFromString(questionHtml, 'text/html')

    // Find all img elements
    const imgElements = doc.querySelectorAll('img')
    let imageHtml = ''
    imgElements.forEach(el => {
      imageHtml += el.outerHTML
      el.remove()
    })

    // Find all audio elements and extract src
    const audioElements = doc.querySelectorAll('audio')
    const audioUrls = []
    audioElements.forEach(el => {
      const src = el.getAttribute('src') || el.querySelector('source')?.getAttribute('src')
      if (src) {
        audioUrls.push(src)
      }
      el.remove()
    })

    // Get remaining text content
    const textOnly = doc.body.innerHTML.trim()

    return { textOnly, imageHtml, audioUrls }
  }

  const { textOnly: questionText, imageHtml: questionImages, audioUrls: questionAudio } = exercise
    ? extractMediaFromQuestion(exercise.content.question)
    : { textOnly: '', imageHtml: '', audioUrls: [] }

  // Play celebration when exercise is completed
  useEffect(() => {
    if (testMode) return
    if (exerciseComplete && !hasPlayedPassAudio) {
      playCelebration()
      setHasPlayedPassAudio(true)
    }
  }, [exerciseComplete, hasPlayedPassAudio, playCelebration, testMode])

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

  // Fetch exercise
  useEffect(() => {
    if (testMode) return
    const initExercise = async () => {
      if (exerciseId && user) {
        await fetchExercise()
        setStartTime(Date.now())
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

  useEffect(() => {
    if (testMode) return
    const fetchSessionInfo = async () => {
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
  }, [sessionId])

  // Calculate responsive scale
  useEffect(() => {
    const image = imageRef.current
    const container = containerRef.current
    if (!image || !container) return

    const updateScale = () => {
      if (image.complete && image.naturalWidth > 0) {
        const containerWidth = container.clientWidth
        if (!containerWidth) return // still hidden (display: none)
        const naturalWidth = image.naturalWidth
        const scale = containerWidth / naturalWidth
        setImageScale(scale)
      }
    }

    image.addEventListener('load', updateScale)
    window.addEventListener('resize', updateScale)
    updateScale()

    // Use ResizeObserver to recalculate when container becomes visible
    // (e.g. switching tabs in TestRunner changes display from none to block)
    const observer = new ResizeObserver(updateScale)
    observer.observe(container)

    return () => {
      image.removeEventListener('load', updateScale)
      window.removeEventListener('resize', updateScale)
      observer.disconnect()
    }
  }, [exercise, teacherMode])

  // Shuffle labels on load
  useEffect(() => {
    if (exercise?.content?.labels) {
      const labels = exercise.content.labels
      if (exercise.content.settings?.shuffle_labels !== false) {
        const shuffled = [...labels].sort(() => Math.random() - 0.5)
        setShuffledLabels(shuffled)
      } else {
        setShuffledLabels(labels)
      }
    }
  }, [exercise])

  // Trigger Batman movement when progress increases
  useEffect(() => {
    const totalCorrectHotspots = (exercise?.content?.hotspots || []).filter(hs => hs.type !== 'distractor').length
    const filledHotspots = (exercise?.content?.hotspots || []).filter(hs => hs.type !== 'distractor' && userAnswers[hs.id]).length
    const completedHotspots = Object.keys(userAnswers).filter(
      hsId => hotspotFeedback[hsId]?.correct
    ).length

    const currentProgress = isSubmitted
      ? (totalCorrectHotspots > 0 ? (completedHotspots / totalCorrectHotspots) * 100 : 0)
      : (totalCorrectHotspots > 0 ? (filledHotspots / totalCorrectHotspots) * 100 : 0)

    if (currentProgress > prevProgress) {
      setIsBatmanMoving(true)
      setTimeout(() => setIsBatmanMoving(false), 3000)
    }

    setPrevProgress(currentProgress)
  }, [userAnswers, hotspotFeedback, isSubmitted, exercise, prevProgress])

  const fetchExercise = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exerciseId)
        .eq('exercise_type', 'image_hotspot')
        .single()

      if (error) throw error

      if (!data) {
        setError('Exercise not found')
        return
      }

      setExercise(data)
    } catch (err) {
      console.error('Error fetching exercise:', err)
      setError(err.message || 'Failed to load exercise')
    } finally {
      setLoading(false)
    }
  }

  const handleLabelClick = (label) => {
    if (exerciseComplete) return

    // Check if this label is already placed - if so, don't allow selecting it
    const hotspotId = Object.keys(userAnswers).find(hsId => userAnswers[hsId] === label.id)
    if (hotspotId) {
      // Label is already placed, user must click hotspot on image to remove
      return
    }

    // Select label (no toggle - must click hotspot on image to deselect)
    setSelectedLabel(label)
  }

  const handleHotspotClick = (hotspot) => {
    if (exerciseComplete || isSubmitted) return

    // If hotspot already has a label and no label is selected, remove it
    if (userAnswers[hotspot.id] && !selectedLabel) {
      const newAnswers = { ...userAnswers }
      delete newAnswers[hotspot.id]
      setUserAnswers(newAnswers)

      // Clear feedback for that hotspot
      const newFeedback = { ...hotspotFeedback }
      delete newFeedback[hotspot.id]
      setHotspotFeedback(newFeedback)
      return
    }

    if (!selectedLabel) {
      // No label selected and hotspot is empty - do nothing
      return
    }

    // Play whoosh sound
    try {
      const audio = new Audio(assetUrl('/sound/pop.mp3'))
      audio.volume = 0.5
      audio.play().catch(e => console.log('Could not play sound:', e))
    } catch (e) {
      console.log('Sound not supported:', e)
    }

    // Update answers
    const newAnswers = { ...userAnswers, [hotspot.id]: selectedLabel.id }
    setUserAnswers(newAnswers)

    // Clear selection
    setSelectedLabel(null)
  }

  const handleSubmit = async () => {
    if (isSubmitted || exerciseComplete) return

    const hotspots = exercise.content.hotspots
    const correctHotspots = hotspots.filter(hs => hs.type !== 'distractor')
    const distractorHotspots = hotspots.filter(hs => hs.type === 'distractor')

    // Check if all correct hotspots are filled (distractor hotspots are optional)
    const allCorrectFilled = correctHotspots.every(hs => userAnswers[hs.id])
    if (!allCorrectFilled) {
      alert('Please fill all hotspots before submitting!')
      return
    }

    setIsSubmitted(true)

    // Grade all answers
    const newFeedback = {}
    let correctCount = 0

    // Grade correct hotspots
    correctHotspots.forEach(hotspot => {
      const selectedLabelId = userAnswers[hotspot.id]
      const selectedLabel = exercise.content.labels.find(l => l.id === selectedLabelId)
      const isDistractor = selectedLabel?.type === 'distractor'
      const isCorrect = !isDistractor && selectedLabel?.hotspot_id === hotspot.id

      if (isCorrect) correctCount++

      newFeedback[hotspot.id] = {
        correct: isCorrect,
        attempts: 1,
        showFeedback: true
      }
    })

    // Grade distractor hotspots — any label placed on them is wrong
    distractorHotspots.forEach(hotspot => {
      if (userAnswers[hotspot.id]) {
        newFeedback[hotspot.id] = {
          correct: false,
          attempts: 1,
          showFeedback: true
        }
      }
    })

    setHotspotFeedback(newFeedback)

    // Play feedback — also check that no distractor hotspots were filled
    const noDistractorsFilled = distractorHotspots.every(hs => !userAnswers[hs.id])
    const allCorrect = correctCount === correctHotspots.length && noDistractorsFilled
    playFeedback(allCorrect)

    if (allCorrect) {
      setExerciseComplete(true)

      // Calculate XP - only award if not already earned
      const baseXP = exercise.xp_reward || 10
      const earnedXP = Math.round(baseXP)

      // Complete exercise and award XP only once
      const timeSpent = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0

      if (user && !hasEarnedXP && !isTeacherView) {
        const result = await completeExerciseWithXP(exerciseId, earnedXP, {
          score: 100,
          max_score: 100,
          attempts: correctHotspots.length,
          time_spent: timeSpent,
          challengeId: challengeId,  // Pass for daily challenge tracking
          challengeStartedAt: challengeStartTime  // Pass challenge start time for accurate timing
        })
        if (result?.xpAwarded > 0) {
          setXpEarned(result.xpAwarded)
          setHasEarnedXP(true)
        }
      } else {
        setXpEarned(0) // No XP on retry
      }
    }
  }

  const resetExercise = () => {
    setUserAnswers({})
    setHotspotFeedback({})
    setSelectedLabel(null)
    setExerciseComplete(false)
    setXpEarned(0)
    setStartTime(Date.now())
    setIsSubmitted(false)

    // Re-shuffle labels if needed
    if (exercise?.content?.labels && exercise.content.settings?.shuffle_labels !== false) {
      const shuffled = [...exercise.content.labels].sort(() => Math.random() - 0.5)
      setShuffledLabels(shuffled)
    }
  }

  const renderHotspots = () => {
    if (!exercise?.content?.hotspots) return null

    return exercise.content.hotspots.map(hotspot => {
      const { x, y, width, height } = hotspot.coordinates
      const scaledX = x * imageScale
      const scaledY = y * imageScale
      const scaledWidth = width * imageScale
      const scaledHeight = height * imageScale

      const answer = userAnswers[hotspot.id]
      const feedback = hotspotFeedback[hotspot.id]
      const isAnswered = !!answer
      const isCorrect = feedback?.correct

      let fillColor = 'rgba(243, 242, 242, 0.1)'
      let strokeColor = '#1522368f'
      let strokeWidth = 2

      if (selectedLabel && !isSubmitted) {
        fillColor = 'rgba(59, 130, 246, 0.15)'
        strokeColor = '#3b82f6'
      }

      if (isAnswered && !isSubmitted) {
        fillColor = 'rgba(13, 81, 197, 0.47)'
        strokeColor = '#0e59f0ff'
        strokeWidth = 2
      }

      if (isSubmitted && isAnswered && isCorrect) {
        fillColor = 'rgba(34, 197, 94, 0.2)'
        strokeColor = '#22c55e'
        strokeWidth = 3
      } else if (isSubmitted && isAnswered && !isCorrect) {
        fillColor = 'rgba(239, 68, 68, 0.2)'
        strokeColor = '#ef4444'
        strokeWidth = 3
      }

      return (
        <g key={hotspot.id}>
          <rect
            x={scaledX}
            y={scaledY}
            width={scaledWidth}
            height={scaledHeight}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            onClick={() => handleHotspotClick(hotspot)}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            style={{ pointerEvents: 'all' }}
          />

          {/* Label text if answered */}
          {isAnswered && (
            <text
              x={scaledX + scaledWidth / 2}
              y={scaledY + scaledHeight / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize="14"
              fontWeight="bold"
              className="pointer-events-none select-none"
              style={{ textShadow: '0 0 3px rgba(0,0,0,0.8)' }}
            >
              {shuffledLabels.find(l => l.id === answer)?.text}
            </text>
          )}

          {/* Feedback icon */}
          {isSubmitted && feedback?.showFeedback && (
            <g>
              <circle
                cx={scaledX + scaledWidth - 15}
                cy={scaledY + 15}
                r="12"
                fill={isCorrect ? '#22c55e' : '#ef4444'}
              />
              <text
                x={scaledX + scaledWidth - 15}
                y={scaledY + 15}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize="16"
                fontWeight="bold"
              >
                {isCorrect ? '✓' : '✗'}
              </text>
            </g>
          )}
        </g>
      )
    })
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
          <Button3D onClick={() => navigate(-1)} color="blue">
            Go Back
          </Button3D>
        </div>
      </div>
    )
  }

  if (!exercise || !exercise.content) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">No Content</h2>
          <p className="text-gray-600 mb-4">This exercise has no content available.</p>
          <Button3D onClick={() => navigate(-1)} color="blue">
            Go Back
          </Button3D>
        </div>
      </div>
    )
  }

  const allHotspots = exercise.content.hotspots || []
  const totalCorrectHotspots = allHotspots.filter(hs => hs.type !== 'distractor').length
  const filledCorrectHotspots = allHotspots.filter(hs => hs.type !== 'distractor' && userAnswers[hs.id]).length
  const completedHotspots = Object.keys(userAnswers).filter(
    hsId => hotspotFeedback[hsId]?.correct
  ).length
  const progress = isSubmitted
    ? (totalCorrectHotspots > 0 ? (completedHotspots / totalCorrectHotspots) * 100 : 0)
    : (totalCorrectHotspots > 0 ? (filledCorrectHotspots / totalCorrectHotspots) * 100 : 0)

  // Teacher view: toggle between review (answer key) and do (try exercise)
  if (isTeacherView && teacherMode === 'review') {
    const hotspots = exercise.content.hotspots || []
    const labels = exercise.content.labels || []
    const distractors = labels.filter(l => l.type === 'distractor')

    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{exercise.title || 'Image Hotspot'}</h2>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setTeacherMode('review')}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-white shadow text-blue-700"
              >
                Review
              </button>
              <button
                onClick={() => { setTeacherMode('do'); resetExercise() }}
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

        {/* Question */}
        {questionText && (
          <div className="mb-4 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-sm text-gray-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: questionText }} />
          </div>
        )}
        {questionAudio && questionAudio.length > 0 && (
          <div className="mb-4 space-y-2">
            {questionAudio.map((audioUrl, index) => (
              <AudioPlayer key={index} audioUrl={audioUrl} variant="outline" className="w-full" />
            ))}
          </div>
        )}

        {/* Image with hotspots showing correct labels */}
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 mb-6">
          <div ref={containerRef} className="relative">
            <img
              ref={imageRef}
              src={exercise.content.image_url}
              alt="Exercise"
              className="w-full h-auto rounded"
            />
            <svg className="absolute top-0 left-0 w-full h-full" style={{ pointerEvents: 'none' }}>
              {hotspots.map(hotspot => {
                const { x, y, width, height } = hotspot.coordinates
                const scaledX = x * imageScale
                const scaledY = y * imageScale
                const scaledWidth = width * imageScale
                const scaledHeight = height * imageScale
                const isDistractorHotspot = hotspot.type === 'distractor'
                const correctLabel = !isDistractorHotspot
                  ? labels.find(l => l.hotspot_id === hotspot.id && l.type !== 'distractor')
                  : null

                return (
                  <g key={hotspot.id}>
                    <rect
                      x={scaledX}
                      y={scaledY}
                      width={scaledWidth}
                      height={scaledHeight}
                      fill={isDistractorHotspot ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.2)'}
                      stroke={isDistractorHotspot ? '#ef4444' : '#22c55e'}
                      strokeWidth={3}
                      strokeDasharray={isDistractorHotspot ? '6,4' : 'none'}
                    />
                    {correctLabel && (
                      <text
                        x={scaledX + scaledWidth / 2}
                        y={scaledY + scaledHeight / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize="14"
                        fontWeight="bold"
                        className="select-none"
                        style={{ textShadow: '0 0 4px rgba(0,0,0,0.9)' }}
                      >
                        {correctLabel.text}
                      </text>
                    )}
                    {isDistractorHotspot && (
                      <text
                        x={scaledX + scaledWidth / 2}
                        y={scaledY + scaledHeight / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#ef4444"
                        fontSize="12"
                        fontWeight="bold"
                        className="select-none"
                        style={{ textShadow: '0 0 3px rgba(255,255,255,0.9)' }}
                      >
                        Distractor
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        {/* Answer key */}
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-3">Answer Key</h3>
          <div className="space-y-2">
            {hotspots.filter(hs => hs.type !== 'distractor').map((hotspot, index) => {
              const correctLabel = labels.find(l => l.hotspot_id === hotspot.id && l.type !== 'distractor')
              return (
                <div key={hotspot.id} className="flex items-center gap-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold text-xs">{index + 1}</span>
                  <span className="font-medium text-green-800 bg-green-50 px-2 py-1 rounded">{correctLabel?.text || 'N/A'}</span>
                </div>
              )
            })}
          </div>
          {hotspots.filter(hs => hs.type === 'distractor').length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-500 mb-2">Distractor Hotspots</h4>
              <p className="text-xs text-gray-400">These areas on the image are traps — no label should be placed here.</p>
            </div>
          )}
          {distractors.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-500 mb-2">Distractors</h4>
              <div className="flex flex-wrap gap-2">
                {distractors.map(d => (
                  <span key={d.id} className="px-2 py-1 bg-red-50 text-red-600 rounded text-sm border border-red-200">{d.text}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // testMode: render image with hotspots and labels, no gamification
  if (testMode) {
    return (
      <div className="space-y-4">
        {/* Question text */}
        {questionText && (
          <div className="text-sm text-gray-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: questionText }} />
        )}
        {/* Question Audio */}
        {questionAudio && questionAudio.length > 0 && (
          <div className="space-y-2">
            {questionAudio.map((audioUrl, index) => (
              <AudioPlayer key={index} audioUrl={audioUrl} variant="outline" className="w-full" />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Image with hotspots */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 space-y-4">
              {questionImages && (
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: questionImages }} />
              )}
              <div ref={containerRef} className="relative">
                <img
                  ref={imageRef}
                  src={exercise.content.image_url.replace(branding.baseSiteUrl, '/proxy-image')}
                  alt="Exercise"
                  className="w-full h-auto rounded"
                />
                <svg className="absolute top-0 left-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                  <g style={{ pointerEvents: 'all' }}>
                    {renderHotspots()}
                  </g>
                </svg>
              </div>
              {selectedLabel && (
                <p className="mt-4 text-sm text-blue-600 font-medium text-center">
                  Click on the image to place "{selectedLabel.text}"
                </p>
              )}
            </div>
          </div>

          {/* Labels sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
              <h2 className="text-lg font-semibold mb-4">
                {selectedLabel ? `Selected: ${selectedLabel.text}` : 'Select a label'}
              </h2>
              <div className="grid grid-cols-4 lg:grid-cols-1 gap-2">
                {shuffledLabels.map(label => {
                  const isUsed = Object.values(userAnswers).includes(label.id)
                  const isSelected = selectedLabel?.id === label.id
                  return (
                    <button
                      key={label.id}
                      onClick={() => handleLabelClick(label)}
                      className={`
                        w-full px-4 py-3 rounded-lg font-medium transition-all cursor-pointer
                        ${isSelected ? 'bg-blue-500 text-white scale-105 shadow-lg' : ''}
                        ${isUsed && !isSelected ? 'bg-green-100 text-green-800 opacity-50' : ''}
                        ${!isSelected && !isUsed ? 'bg-gray-100 hover:bg-gray-200 text-gray-800' : ''}
                      `}
                    >
                      {label.text}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
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
        <div className="max-w-6xl mx-auto space-y-6 relative z-20">
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
          title={exercise.title}
          progressPercentage={progress}
          isBatmanMoving={isBatmanMoving}
          showProgressLabel={false}
          showQuestionCounter={false}
          colorTheme={colorTheme}
          customContent={
            questionText && (
              <div
                className="text-sm text-gray-700 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: questionText }}
              />
            )
          }
        />

        {/* Meme Overlay */}
        {showMeme && currentMeme && (
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
            <img
              src={currentMeme}
              alt="Reaction meme"
              className="rounded-lg shadow-2xl"
              style={{ width: '200px', height: 'auto' }}
            />
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Image with hotspots */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 space-y-4">
              {/* Question Images from question HTML */}
              {questionImages && (
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: questionImages }}
                />
              )}

              {/* Question Audio using AudioPlayer component */}
              {questionAudio && questionAudio.length > 0 && (
                <div className="space-y-2">
                  {questionAudio.map((audioUrl, index) => (
                    <AudioPlayer
                      key={index}
                      audioUrl={audioUrl}
                      variant="outline"
                      className="w-full"
                    />
                  ))}
                </div>
              )}

              <div ref={containerRef} className="relative">
                <img
                  ref={imageRef}
                  src={exercise.content.image_url.replace(branding.baseSiteUrl, '/proxy-image')}
                  alt="Exercise"
                  className="w-full h-auto rounded"
                />
                <svg
                  className="absolute top-0 left-0 w-full h-full"
                  style={{ pointerEvents: 'none' }}
                >
                  <g style={{ pointerEvents: 'all' }}>
                    {renderHotspots()}
                  </g>
                </svg>
              </div>
              {selectedLabel && !isSubmitted && (
                <p className="mt-4 text-sm text-blue-600 font-medium text-center">
                  Click on the image to place "{selectedLabel.text}"
                </p>
              )}
              {isSubmitted && !exerciseComplete && (
                <p className="mt-4 text-sm text-red-600 font-medium text-center">
                  Some answers are incorrect. Click Reset to try again.
                </p>
              )}
            </div>
          </div>

          {/* Labels sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
              <h2 className="text-lg font-semibold mb-4">
                {selectedLabel ? `Selected: ${selectedLabel.text}` : 'Select a label'}
              </h2>
              <div className="grid grid-cols-4 lg:grid-cols-1 gap-2">
                {shuffledLabels.map(label => {
                  const isUsed = Object.values(userAnswers).includes(label.id)
                  const isSelected = selectedLabel?.id === label.id
                  const isDistractor = label.type === 'distractor'

                  return (
                    <button
                      key={label.id}
                      onClick={() => handleLabelClick(label)}
                      disabled={exerciseComplete}
                      className={`
                        w-full px-4 py-3 rounded-lg font-medium transition-all
                        ${isSelected ? 'bg-blue-500 text-white scale-105 shadow-lg' : ''}
                        ${isUsed && !isSelected ? 'bg-green-100 text-green-800 opacity-50' : ''}
                        ${
                          !isSelected && !isUsed && !isDistractor
                            ? 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                            : ''
                        }
                        ${isDistractor && !isSelected && !isUsed ? 'bg-gray-100 hover:bg-gray-200 text-gray-800' : ''}
                        ${!exerciseComplete ? 'cursor-pointer' : ''}
                      `}
                    >
                      {label.text}
                      {isUsed && !isSelected}
                    </button>
                  )
                })}
              </div>

              {/* Submit and Reset Buttons */}
              <div className="mt-4 flex gap-3">
                {!isSubmitted && (
                  <Button3D
                    onClick={handleSubmit}
                    color="blue"
                    size="sm"
                    className="flex-1 flex items-center justify-center gap-2"
                    disabled={filledCorrectHotspots !== totalCorrectHotspots}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Submit
                  </Button3D>
                )}
                <Button3D
                  onClick={resetExercise}
                  color="gray"
                  size="sm"
                  className={`${isSubmitted ? 'w-full' : 'flex-1'} flex items-center justify-center gap-2`}
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </Button3D>
              </div>
            </div>
          </div>
        </div>

        </div>
      </div>

      {/* Completion Modal */}
      {exerciseComplete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <CelebrationScreen
            score={100}
            correctAnswers={totalCorrectHotspots}
            totalQuestions={totalCorrectHotspots}
            passThreshold={100}
            xpAwarded={xpEarned}
            passGif={passGif}
            isRetryMode={false}
            wrongQuestionsCount={0}
            onBackToList={() => {
              const courseId = session?.units?.course_id
              const unitId = session?.unit_id
              if (sessionId && unitId && courseId) {
                navigate(`/study/course/${courseId}/unit/${unitId}/session/${sessionId}`)
              } else {
                navigate(-1)
              }
            }}
            exerciseId={exerciseId}
          />
        </div>
      )}
    </>
  )
}

export default ImageHotspotExercise
