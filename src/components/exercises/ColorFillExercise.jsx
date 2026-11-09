import { useState, useEffect, useRef } from 'react'
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
import {
  COLOR_FILL_PASS_SCORE,
  gradeColorFill,
  getUnansweredTextFields,
  isQuestionField,
  polygonPoints,
  polygonCentroid
} from '../../utils/colorFill'

import { firstAnswer, splitAnswers } from '../../utils/splitAnswers'

import { assetUrl, useBranding } from '../../hooks/useBranding';

// Board options for the "View answers" screen: correct colors and answers, no teacher area names
const ANSWER_VIEW = { answerKey: true, interactive: false, showLabels: false }

// Below this board width the questions collapse into pills until tapped
const COMPACT_WIDTH = 560

// Questions have no background, so a soft white glow keeps them readable over the picture
const QUESTION_TEXT_SHADOW = '0 0 3px #fff, 0 0 6px #fff, 0 0 10px #fff'

// Extract media elements from question HTML
const extractMediaFromQuestion = (questionHtml) => {
  if (!questionHtml) return { textOnly: '', imageHtml: '', audioUrls: [] }

  const parser = new DOMParser()
  const doc = parser.parseFromString(questionHtml, 'text/html')

  let imageHtml = ''
  doc.querySelectorAll('img').forEach(el => {
    imageHtml += el.outerHTML
    el.remove()
  })

  const audioUrls = []
  doc.querySelectorAll('audio').forEach(el => {
    const src = el.getAttribute('src') || el.querySelector('source')?.getAttribute('src')
    if (src) audioUrls.push(src)
    el.remove()
  })

  return { textOnly: doc.body.innerHTML.trim(), imageHtml, audioUrls }
}

const ColorFillExercise = ({ testMode = false, exerciseData = null, onAnswersCollected = null, initialAnswers = null }) => {
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
  const [selectedColorId, setSelectedColorId] = useState(null)
  const [userAnswers, setUserAnswers] = useState(() => (testMode && initialAnswers) ? initialAnswers : {}) // { region_id: color_id, text_id: text }
  const [itemFeedback, setItemFeedback] = useState({}) // { region_id | text_field_id: boolean }
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [lastScore, setLastScore] = useState(0)
  const [exerciseComplete, setExerciseComplete] = useState(false)
  const [xpEarned, setXpEarned] = useState(0)
  const [startTime, setStartTime] = useState(null)
  const [challengeStartTime, setChallengeStartTime] = useState(null)
  const [imageScale, setImageScale] = useState(1)
  const [isBatmanMoving, setIsBatmanMoving] = useState(false)
  const [prevProgress, setPrevProgress] = useState(0)
  const [session, setSession] = useState(null)
  const [colorTheme, setColorTheme] = useState('blue')
  const [hasPlayedPassAudio, setHasPlayedPassAudio] = useState(false)

  const [activeTextId, setActiveTextId] = useState(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [showAnswers, setShowAnswers] = useState(false)
  const [celebrationDismissed, setCelebrationDismissed] = useState(false)

  const imageRef = useRef(null)
  const containerRef = useRef(null)
  const inputRefs = useRef({}) // { text_field_id: <input> }

  const handleBackNavigation = () => {
    if (session?.units) {
      navigate(`/study/course/${session.units.course_id}/unit/${session.units.id}/session/${sessionId || session.id}`)
    } else {
      const path = window.location.pathname
      if (path.includes('/admin')) navigate('/admin/exercise-bank')
      else if (path.includes('/teacher')) navigate('/teacher/exercise-bank')
      else navigate('/study')
    }
  }

  const content = exercise?.content
  const regions = content?.regions || []
  const textFields = content?.text_fields || []
  // Only questions are answered and graded; text-only boxes are just shown on the image
  const questionFields = textFields.filter(isQuestionField)
  // The teacher decides per exercise whether students may see the correct answers after submitting
  const canRevealAnswers = content?.settings?.reveal_answers === 'after_submit'
  const palette = content?.palette || []

  const { textOnly: questionText, imageHtml: questionImages, audioUrls: questionAudio } = exercise
    ? extractMediaFromQuestion(content?.question)
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
        setColorTheme(data?.color_theme || data?.units?.color_theme || 'blue')
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
        const width = container.clientWidth
        if (!width) return // still hidden (display: none)
        setContainerWidth(width)
        setImageScale(width / image.naturalWidth)
      }
    }

    image.addEventListener('load', updateScale)
    window.addEventListener('resize', updateScale)
    updateScale()

    // Recalculate when the container becomes visible
    // (e.g. switching tabs in TestRunner changes display from none to block)
    const observer = new ResizeObserver(updateScale)
    observer.observe(container)

    return () => {
      image.removeEventListener('load', updateScale)
      window.removeEventListener('resize', updateScale)
      observer.disconnect()
    }
  }, [exercise, teacherMode, loading])

  // Focus the input of the question card the student just opened (or moved to with Enter)
  useEffect(() => {
    if (activeTextId) inputRefs.current[activeTextId]?.focus({ preventScroll: true })
  }, [activeTextId])

  // Regions and text boxes are graded items of equal weight
  const totalItems = regions.length + questionFields.length
  const filledRegions = regions.filter(r => userAnswers[r.id]).length
  const unansweredText = getUnansweredTextFields(content, userAnswers).length
  const filledItems = filledRegions + (questionFields.length - unansweredText)
  const correctItems = [...regions, ...questionFields].filter(item => itemFeedback[item.id]).length
  const progress = totalItems > 0
    ? ((isSubmitted ? correctItems : filledItems) / totalItems) * 100
    : 0

  // Trigger Batman movement when progress increases
  useEffect(() => {
    if (progress > prevProgress) {
      setIsBatmanMoving(true)
      setTimeout(() => setIsBatmanMoving(false), 3000)
    }
    setPrevProgress(progress)
  }, [progress])

  const fetchExercise = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exerciseId)
        .eq('exercise_type', 'color_fill')
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

  const playPop = () => {
    try {
      const audio = new Audio(assetUrl('/sound/pop.mp3'))
      audio.volume = 0.5
      audio.play().catch(e => console.log('Could not play sound:', e))
    } catch (e) {
      console.log('Sound not supported:', e)
    }
  }

  const handleRegionClick = (region) => {
    if (isSubmitted) return

    if (selectedColorId) {
      playPop()
      setUserAnswers(prev => ({ ...prev, [region.id]: selectedColorId }))
    } else if (userAnswers[region.id]) {
      // No color selected: clicking a colored region clears it
      setUserAnswers(prev => {
        const next = { ...prev }
        delete next[region.id]
        return next
      })
    }
  }

  const handleTextChange = (fieldId, value) => {
    setUserAnswers(prev => ({ ...prev, [fieldId]: value }))
  }

  const missingRegions = regions.length - filledRegions
  const canSubmit = missingRegions === 0 && unansweredText === 0

  const saveAttempts = async (result, attemptNumber, timeSpent) => {
    if (!user || !exerciseId || isTeacherView) return

    const base = {
      user_id: user.id,
      exercise_id: exerciseId,
      exercise_type: 'color_fill',
      attempt_number: attemptNumber,
      response_time: timeSpent
    }
    const rows = [
      ...regions.map((region, index) => ({
        ...base,
        question_id: region.id,
        question_index: index,
        selected_answer: userAnswers[region.id] || null,
        correct_answer: region.correct_color_id || null,
        is_correct: result.byRegion[region.id]
      })),
      ...questionFields.map((field, index) => ({
        ...base,
        question_id: field.id,
        question_index: regions.length + index,
        selected_answer: userAnswers[field.id] || null,
        correct_answer: field.answer || null,
        is_correct: result.byText[field.id]
      }))
    ]
    if (rows.length === 0) return

    const { error } = await supabase.from('question_attempts').insert(rows)
    if (error) console.log('⚠️ Could not save question attempt:', error.message)
  }

  const handleSubmit = async () => {
    if (isSubmitted || exerciseComplete || !canSubmit) return

    const result = gradeColorFill(content, userAnswers)
    const passed = result.score >= COLOR_FILL_PASS_SCORE
    const attemptNumber = attempts + 1
    const timeSpent = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0

    setItemFeedback({ ...result.byRegion, ...result.byText })
    setLastScore(result.score)
    setAttempts(attemptNumber)
    setIsSubmitted(true)
    playFeedback(passed)

    await saveAttempts(result, attemptNumber, timeSpent)

    if (!passed) return

    setExerciseComplete(true)
    if (user && !isTeacherView) {
      const awarded = await completeExerciseWithXP(exercise.id, exercise.xp_reward || 10, {
        score: result.score,
        max_score: 100,
        time_spent: timeSpent,
        challengeId: challengeId,  // Pass for daily challenge tracking
        challengeStartedAt: challengeStartTime  // Pass challenge start time for accurate timing
      })
      if (awarded?.xpAwarded > 0) setXpEarned(awarded.xpAwarded)
    }
  }

  const handleBackToList = () => {
    const courseId = session?.units?.course_id
    const unitId = session?.unit_id
    if (sessionId && unitId && courseId) {
      navigate(`/study/course/${courseId}/unit/${unitId}/session/${sessionId}`)
    } else {
      handleBackNavigation()
    }
  }

  const resetExercise = () => {
    setShowAnswers(false)
    setCelebrationDismissed(false)
    setUserAnswers({})
    setItemFeedback({})
    setSelectedColorId(null)
    setIsSubmitted(false)
    setExerciseComplete(false)
    setXpEarned(0)
    setStartTime(Date.now())
  }

  const colorById = (colorId) => palette.find(c => c.id === colorId)

  // Narrow boards (phones) show idle question cards as small pills
  const compact = containerWidth > 0 && containerWidth < COMPACT_WIDTH
  const displayedHeight = (imageRef.current?.naturalHeight || 0) * imageScale

  // Image + region polygons + question cards. answerKey paints each region with its correct color.
  const renderBoard = ({ answerKey = false, interactive = true, showLabels = answerKey }) => (
    <div ref={containerRef} className="relative">
      <img
        ref={imageRef}
        src={content.image_url.replace(branding.baseSiteUrl, '/proxy-image')}
        alt="Exercise"
        className="w-full h-auto rounded select-none"
        draggable={false}
      />
      <svg className="absolute top-0 left-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        {regions.map(region => {
          const answered = !!userAnswers[region.id]
          const color = colorById(answerKey ? region.correct_color_id : userAnswers[region.id])
          const isCorrect = itemFeedback[region.id]
          const center = polygonCentroid(region.points, imageScale)

          let fill = 'rgba(243, 242, 242, 0.1)'
          let fillOpacity = 1
          let stroke = '#1522368f'
          let strokeWidth = 2

          if (color) {
            fill = color.hex
            fillOpacity = 0.6
          } else if (selectedColorId && !isSubmitted && !answerKey) {
            fill = 'rgba(59, 130, 246, 0.15)'
            stroke = '#3b82f6'
          }

          if (answerKey) {
            stroke = '#22c55e'
            strokeWidth = 3
          } else if (isSubmitted && answered) {
            stroke = isCorrect ? '#22c55e' : '#ef4444'
            strokeWidth = 3
          }

          return (
            <g key={region.id}>
              <polygon
                points={polygonPoints(region.points, imageScale)}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={stroke}
                strokeWidth={strokeWidth}
                onClick={() => interactive && handleRegionClick(region)}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                style={{ pointerEvents: interactive ? 'all' : 'none' }}
              />

              {showLabels && (
                <text
                  x={center.x}
                  y={center.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize="14"
                  fontWeight="bold"
                  className="pointer-events-none select-none"
                  style={{ textShadow: '0 0 4px rgba(0,0,0,0.9)' }}
                >
                  {region.label}
                </text>
              )}

              {/* Feedback icon */}
              {isSubmitted && answered && !answerKey && (
                <g>
                  <circle cx={center.x} cy={center.y} r="12" fill={isCorrect ? '#22c55e' : '#ef4444'} />
                  <text
                    x={center.x}
                    y={center.y}
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
        })}
      </svg>

      {/* Question + answer input sit directly on the image where the teacher placed them */}
      {textFields.map((field) => {
        const { x, y, height } = field.coordinates
        const graded = isSubmitted && !answerKey
        const isCorrect = itemFeedback[field.id]
        const isActive = activeTextId === field.id
        const typed = answerKey ? firstAnswer(field.answer) : (userAnswers[field.id] || '')
        const question = field.question || field.label

        let inputClass = 'border-gray-400/70 bg-white/45 focus:border-blue-500 focus:bg-white/90 focus:ring-blue-500'
        if (answerKey) inputClass = 'border-green-500 bg-green-50/50'
        else if (graded) inputClass = isCorrect ? 'border-green-500 bg-green-50/60' : 'border-red-500 bg-red-50/60'

        // Cards in the lower half of the picture grow upwards so they stay inside it
        const boxTop = y * imageScale
        const boxBottom = (y + height) * imageScale
        const lowerHalf = displayedHeight > 0 && (boxTop + boxBottom) / 2 > displayedHeight / 2
        const vertical = lowerHalf
          ? { bottom: Math.max(4, displayedHeight - boxBottom) }
          : { top: Math.max(4, boxTop) }
        const fitLeft = (itemWidth) => (
          Math.max(8, Math.min(x * imageScale, containerWidth - itemWidth - 8))
        )

        // Text-only box: just words on the picture, never blocks clicks on the areas below
        if (!isQuestionField(field)) {
          const labelWidth = Math.min(Math.max(field.coordinates.width * imageScale, 120), Math.max(120, containerWidth - 16))
          return (
            <div
              key={field.id}
              className="absolute pointer-events-none select-none whitespace-pre-line text-sm font-semibold leading-snug text-gray-900"
              style={{ left: fitLeft(labelWidth), width: labelWidth, ...vertical, textShadow: QUESTION_TEXT_SHADOW }}
            >
              {field.question}
            </div>
          )
        }

        // On narrow screens an idle question shrinks to a pill so it does not hide the picture
        if (compact && !isActive) {
          return (
            <button
              key={field.id}
              type="button"
              onClick={() => interactive && setActiveTextId(field.id)}
              className="absolute max-w-[168px] truncate rounded-full bg-white/60 px-3 py-1 text-xs text-gray-900 shadow-sm ring-1 ring-black/10"
              style={{ left: fitLeft(168), ...vertical }}
            >
              {typed || question}
            </button>
          )
        }

        const cardWidth = compact
          ? Math.max(160, Math.min(containerWidth - 16, 280))
          : Math.min(Math.max(field.coordinates.width * imageScale, 220), 320)

        return (
          <div
            key={field.id}
            className="absolute"
            style={{ left: fitLeft(cardWidth), width: cardWidth, ...vertical }}
          >
            <label
              htmlFor={`color-fill-${field.id}`}
              className="mb-1 block text-sm font-semibold leading-snug text-gray-900"
              style={{ textShadow: QUESTION_TEXT_SHADOW }}
            >
              {question}
            </label>
            <div className="relative">
              <input
                id={`color-fill-${field.id}`}
                ref={(el) => { inputRefs.current[field.id] = el }}
                type="text"
                value={typed}
                onChange={(e) => handleTextChange(field.id, e.target.value)}
                onFocus={() => setActiveTextId(field.id)}
                onBlur={() => setActiveTextId(current => (current === field.id ? null : current))}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  const next = questionFields[questionFields.indexOf(field) + 1]
                  if (next) setActiveTextId(next.id)
                  else e.currentTarget.blur()
                }}
                disabled={!interactive || isSubmitted}
                placeholder="Your answer"
                autoComplete="off"
                className={`w-full rounded-lg border px-2.5 py-1.5 text-[16px] sm:text-sm text-gray-900 focus:outline-none focus:ring-2 disabled:text-gray-800 ${
                  graded ? 'pr-8' : ''
                } ${inputClass}`}
              />
              {graded && (
                isCorrect
                  ? <CheckCircle className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-green-600" />
                  : <XCircle className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-red-600" />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderPalette = ({ showActions }) => {
    const selectedColor = colorById(selectedColorId)

    return (
      <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
        <h2 className="text-lg font-semibold mb-4">
          {selectedColor ? `Selected: ${selectedColor.name}` : 'Pick a color'}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
          {palette.map(color => {
            const isSelected = selectedColorId === color.id
            return (
              <button
                key={color.id}
                onClick={() => setSelectedColorId(isSelected ? null : color.id)}
                disabled={exerciseComplete || isSubmitted}
                className={`
                  flex items-center gap-3 w-full px-4 py-3 rounded-lg font-medium transition-all
                  ${isSelected ? 'bg-blue-500 text-white scale-105 shadow-lg' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}
                  ${!exerciseComplete && !isSubmitted ? 'cursor-pointer' : ''}
                `}
              >
                <span
                  className="w-6 h-6 rounded-full border-2 border-white shadow flex-shrink-0"
                  style={{ backgroundColor: color.hex }}
                />
                <span className="truncate">{color.name}</span>
              </button>
            )
          })}
        </div>

        {showActions && (
          <>
            {!isSubmitted && !canSubmit && (
              <p className="mt-4 text-xs text-gray-500">
                {missingRegions > 0 && `Color ${missingRegions} more area${missingRegions !== 1 ? 's' : ''}. `}
                {unansweredText > 0 && `Answer ${unansweredText} more question${unansweredText !== 1 ? 's' : ''}.`}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              {!isSubmitted && (
                <Button3D
                  onClick={handleSubmit}
                  color="blue"
                  size="sm"
                  className="flex-1 flex items-center justify-center gap-2"
                  disabled={!canSubmit}
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
              {isSubmitted && canRevealAnswers && (
                <Button3D
                  onClick={() => setShowAnswers(shown => !shown)}
                  color="green"
                  size="sm"
                  className="w-full flex items-center justify-center gap-2"
                >
                  {showAnswers ? 'My answers' : 'View answers'}
                </Button3D>
              )}
              {exerciseComplete && celebrationDismissed && (
                <Button3D
                  onClick={handleBackToList}
                  color="blue"
                  size="sm"
                  className="w-full flex items-center justify-center gap-2"
                >
                  Finish
                </Button3D>
              )}
            </div>
          </>
        )}
      </div>
    )
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
          <Button3D onClick={handleBackNavigation} color="blue">
            Go Back
          </Button3D>
        </div>
      </div>
    )
  }

  if (!exercise || !content || !content.image_url || regions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">No Content</h2>
          <p className="text-gray-600 mb-4">This exercise has no content available.</p>
          <Button3D onClick={handleBackNavigation} color="blue">
            Go Back
          </Button3D>
        </div>
      </div>
    )
  }

  const questionBlock = (
    <>
      {questionAudio.length > 0 && (
        <div className="space-y-2">
          {questionAudio.map((audioUrl, index) => (
            <AudioPlayer key={index} audioUrl={audioUrl} variant="outline" className="w-full" />
          ))}
        </div>
      )}
      {questionImages && (
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: questionImages }}
        />
      )}
    </>
  )

  // Teacher view: toggle between review (answer key) and do (try exercise)
  if (!testMode && isTeacherView && teacherMode === 'review') {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        {sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{exercise.title || 'Color Fill'}</h2>
          <div className="flex items-center gap-2">
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
            <button onClick={handleBackNavigation} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border rounded-lg">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </div>
        </div>

        {questionText && (
          <div className="mb-4 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-sm text-gray-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: questionText }} />
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 mb-6 space-y-4">
          {questionBlock}
          {renderBoard({ answerKey: true, interactive: false })}
        </div>

        {/* Answer key */}
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-3">Answer Key</h3>
          <div className="space-y-2">
            {regions.map((region, index) => {
              const correct = colorById(region.correct_color_id)
              const accepted = (region.accepted_color_ids || []).map(colorById).filter(Boolean)
              return (
                <div key={region.id} className="flex flex-wrap items-center gap-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold text-xs">{index + 1}</span>
                  <span className="text-sm text-gray-700">{region.label}</span>
                  <span className="flex items-center gap-1.5 font-medium text-green-800 bg-green-50 px-2 py-1 rounded">
                    <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: correct?.hex }} />
                    {correct?.name || 'N/A'}
                  </span>
                  {accepted.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      also accepts
                      {accepted.map(color => (
                        <span key={color.id} title={color.name} className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: color.hex }} />
                      ))}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {questionFields.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-500 mb-2">Questions</h4>
              <div className="space-y-2">
                {questionFields.map((field, index) => (
                  <div key={field.id} className="flex flex-wrap items-center gap-2">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold text-xs">{regions.length + index + 1}</span>
                    <span className="text-sm text-gray-700">{field.question || field.label}</span>
                    <span className="font-medium text-green-800 bg-green-50 px-2 py-1 rounded">
                      {splitAnswers(field.answer).join(' / ') || 'N/A'}
                    </span>
                    {field.case_sensitive && <span className="text-xs text-gray-500">case sensitive</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // testMode: render board and palette, no gamification
  if (testMode) {
    return (
      <div className="space-y-4">
        {questionText && (
          <div className="text-sm text-gray-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: questionText }} />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 space-y-4">
              {questionBlock}
              {renderBoard({})}
              {selectedColorId && (
                <p className="mt-4 text-sm text-blue-600 font-medium text-center">
                  Click an area to color it {colorById(selectedColorId)?.name}
                </p>
              )}
            </div>
          </div>
          <div className="lg:col-span-1">
            {renderPalette({ showActions: false })}
          </div>
        </div>
      </div>
    )
  }

  const incorrectCount = totalItems - correctItems

  return (
    <>
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
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 space-y-4">
                {questionBlock}
                {renderBoard(showAnswers ? ANSWER_VIEW : {})}
                {selectedColorId && !isSubmitted && (
                  <p className="mt-4 text-sm text-blue-600 font-medium text-center">
                    Click an area to color it {colorById(selectedColorId)?.name}
                  </p>
                )}
                {isSubmitted && !exerciseComplete && (
                  <p className="mt-4 text-sm text-red-600 font-medium text-center">
                    {correctItems}/{totalItems} correct ({lastScore}%). You need {COLOR_FILL_PASS_SCORE}% to pass. Click Reset to try again.
                  </p>
                )}
              </div>
            </div>

            <div className="lg:col-span-1">
              {renderPalette({ showActions: true })}
            </div>
          </div>
        </div>
      </div>

      {/* Completion Modal */}
      {exerciseComplete && !celebrationDismissed && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <CelebrationScreen
            score={lastScore}
            correctAnswers={correctItems}
            totalQuestions={totalItems}
            passThreshold={COLOR_FILL_PASS_SCORE}
            xpAwarded={xpEarned}
            passGif={passGif}
            isRetryMode={false}
            wrongQuestionsCount={incorrectCount}
            onReviewAnswers={canRevealAnswers ? () => {
              setShowAnswers(true)
              setCelebrationDismissed(true)
            } : undefined}
            onBackToList={handleBackToList}
            exerciseId={exerciseId}
          />
        </div>
      )}
    </>
  )
}

export default ColorFillExercise
