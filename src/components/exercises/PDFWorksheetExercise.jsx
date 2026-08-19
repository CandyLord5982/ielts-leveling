import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { supabase } from '../../supabase/client'
import { CheckCircle, XCircle, RotateCcw, ArrowLeft, Highlighter, Trash2 } from 'lucide-react'
import AudioPlayer from '../ui/AudioPlayer'
import LoadingSpinner from '../ui/LoadingSpinner'
import Button3D from '../ui/Button3D'
import CelebrationScreen from '../ui/CelebrationScreen'
import { useAuth } from '../../hooks/useAuth'
import { useProgress } from '../../hooks/useProgress'
import { useFeedback } from '../../hooks/useFeedback'
import ExerciseHeader from '../ui/ExerciseHeader'
import { usePermissions } from '../../hooks/usePermissions'
import TeacherExerciseNav from '../ui/TeacherExerciseNav'
import { assetUrl } from '../../hooks/useBranding'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

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

// Memoized so it never re-renders when answer state changes
const PassagePDFRenderer = React.memo(({ url, pageNumber, width, onLoadSuccess }) => (
  <Document file={url} onLoadSuccess={onLoadSuccess}>
    <Page pageNumber={pageNumber} width={width} renderTextLayer={false} renderAnnotationLayer={false} />
  </Document>
))

const PDFWorksheetExercise = ({ testMode = false, exerciseData = null, onAnswersCollected = null, initialAnswers = null }) => {
  const location = useLocation()
  const navigate = useNavigate()

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
  const [teacherMode, setTeacherMode] = useState('review')
  const [userAnswers, setUserAnswers] = useState(() => (testMode && initialAnswers) ? initialAnswers : {})
  const [fieldFeedback, setFieldFeedback] = useState({})
  const [exerciseComplete, setExerciseComplete] = useState(false)
  const [xpEarned, setXpEarned] = useState(0)
  const [startTime, setStartTime] = useState(null)
  const [challengeStartTime, setChallengeStartTime] = useState(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isBatmanMoving, setIsBatmanMoving] = useState(false)
  const [prevProgress, setPrevProgress] = useState(0)
  const [session, setSession] = useState(null)
  const [colorTheme, setColorTheme] = useState('blue')
  const [hasPlayedPassAudio, setHasPlayedPassAudio] = useState(false)
  const [hasEarnedXP, setHasEarnedXP] = useState(false)
  const [numPages, setNumPages] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageWidth, setPageWidth] = useState(700)

  const [highlights, setHighlights] = useState([])
  const [isHighlightMode, setIsHighlightMode] = useState(false)
  const [highlightColor, setHighlightColor] = useState('yellow')
  const [drawingHighlight, setDrawingHighlight] = useState(null)

  const containerRef = useRef(null)
  const pageContainerRef = useRef(null)
  const passageContainerRef = useRef(null)

  const pdfFile = useMemo(() => exercise?.content?.pdf_url, [exercise?.content?.pdf_url])
  const passagePdfUrl = useMemo(() => exercise?.content?.passage_pdf_url, [exercise?.content?.passage_pdf_url])
  const isSplitView = !!passagePdfUrl
  const imageUrls = useMemo(() => exercise?.content?.image_urls || [], [exercise?.content?.image_urls])
  const isImageMode = imageUrls.length > 0
  const onDocumentLoadSuccess = useCallback(({ numPages: n }) => setNumPages(n), [])
  const [passageNumPages, setPassageNumPages] = useState(null)
  const [passagePage, setPassagePage] = useState(1)
  const onPassageLoadSuccess = useCallback(({ numPages: n }) => setPassageNumPages(n), [])

  // Set numPages for image mode
  useEffect(() => {
    if (isImageMode) setNumPages(imageUrls.length)
  }, [isImageMode, imageUrls.length])

  // Measure container
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth - 8
        setPageWidth(Math.min(w, 900))
      }
    }
    // Delay slightly for split view so the grid has rendered
    const timer = setTimeout(updateWidth, 50)
    window.addEventListener('resize', updateWidth)
    return () => { clearTimeout(timer); window.removeEventListener('resize', updateWidth) }
  }, [exercise, isSplitView])

  // Play celebration only on pass
  useEffect(() => {
    if (testMode) return
    if (exerciseComplete && !hasPlayedPassAudio) {
      const allF = exercise?.content?.pages?.flatMap(p => p.fields || []) || []
      const correctF = allF.filter(f => fieldFeedback[f.id]?.correct).length
      const score = allF.length > 0 ? Math.round((correctF / allF.length) * 100) : 0
      if (score >= 80) {
        playCelebration()
        setHasPlayedPassAudio(true)
      }
    }
  }, [exerciseComplete, hasPlayedPassAudio, playCelebration, testMode, fieldFeedback, exercise?.content?.pages])

  // testMode: load from props
  useEffect(() => {
    if (!testMode || !exerciseData) return
    setExercise(exerciseData)
    setLoading(false)
  }, [testMode, exerciseData])

  // testMode: notify parent
  const onAnswersCollectedRef = useRef(onAnswersCollected)
  onAnswersCollectedRef.current = onAnswersCollected
  useEffect(() => {
    if (testMode && onAnswersCollectedRef.current) {
      onAnswersCollectedRef.current(userAnswers)
    }
  }, [userAnswers, testMode])

  // Fetch exercise (standalone)
  useEffect(() => {
    if (testMode) return
    const initExercise = async () => {
      if (exerciseId && user) {
        await fetchExercise()
        setStartTime(Date.now())
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

  // Fetch session info
  useEffect(() => {
    if (testMode) return
    const fetchSessionInfo = async () => {
      if (!sessionId) return
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
    fetchSessionInfo()
  }, [sessionId])

  // Progress tracking
  useEffect(() => {
    const allFields = getAllFields()
    const totalFields = allFields.length
    const filledFields = allFields.filter(f => {
      const a = userAnswers[f.id]
      if (f.type === 'checkbox') return a !== undefined
      return a !== undefined && a !== '' && a !== null
    }).length
    const correctFields = allFields.filter(f => fieldFeedback[f.id]?.correct).length

    const currentProgress = isSubmitted
      ? (totalFields > 0 ? (correctFields / totalFields) * 100 : 0)
      : (totalFields > 0 ? (filledFields / totalFields) * 100 : 0)

    if (currentProgress > prevProgress) {
      setIsBatmanMoving(true)
      setTimeout(() => setIsBatmanMoving(false), 3000)
    }
    setPrevProgress(currentProgress)
  }, [userAnswers, fieldFeedback, isSubmitted, exercise])

  const fetchExercise = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exerciseId)
        .eq('exercise_type', 'pdf_worksheet')
        .single()
      if (error) throw error
      if (!data) { setError('Exercise not found'); return }
      setExercise(data)
    } catch (err) {
      console.error('Error fetching exercise:', err)
      setError(err.message || 'Failed to load exercise')
    } finally {
      setLoading(false)
    }
  }

  const highlightColors = {
    yellow: 'rgba(250, 204, 21, 0.35)',
    green: 'rgba(74, 222, 128, 0.35)',
    blue: 'rgba(96, 165, 250, 0.35)',
    pink: 'rgba(244, 114, 182, 0.35)',
    orange: 'rgba(251, 146, 60, 0.35)',
  }

  const getRelativePos = (e, container) => {
    const rect = container.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    }
  }

  const handleHighlightMouseDown = (e, target) => {
    if (!isHighlightMode) return
    e.preventDefault()
    const container = target === 'passage' ? passageContainerRef.current : pageContainerRef.current
    if (!container) return
    const pos = getRelativePos(e, container)
    setDrawingHighlight({ startX: pos.x, startY: pos.y, x: pos.x, y: pos.y, w: 0, h: 0, target })
  }

  const handleHighlightMouseMove = (e, target) => {
    if (!drawingHighlight || drawingHighlight.target !== target) return
    const container = target === 'passage' ? passageContainerRef.current : pageContainerRef.current
    if (!container) return
    const pos = getRelativePos(e, container)
    setDrawingHighlight(prev => ({
      ...prev,
      x: Math.min(prev.startX, pos.x),
      y: Math.min(prev.startY, pos.y),
      w: Math.abs(pos.x - prev.startX),
      h: Math.abs(pos.y - prev.startY),
    }))
  }

  const handleHighlightMouseUp = () => {
    if (!drawingHighlight) return
    if (drawingHighlight.w > 0.5 && drawingHighlight.h > 0.5) {
      setHighlights(prev => [...prev, {
        id: Date.now(),
        x: drawingHighlight.x,
        y: drawingHighlight.y,
        w: drawingHighlight.w,
        h: drawingHighlight.h,
        color: highlightColor,
        page: drawingHighlight.target === 'passage' ? passagePage : currentPage,
        target: drawingHighlight.target,
      }])
    }
    setDrawingHighlight(null)
  }

  const removeHighlight = (id) => {
    setHighlights(prev => prev.filter(h => h.id !== id))
  }

  const clearHighlights = (target) => {
    setHighlights(prev => prev.filter(h => h.target !== target))
  }

  const renderHighlights = (target, page) => {
    const pageHighlights = highlights.filter(h => h.target === target && h.page === page)
    return (
      <>
        {pageHighlights.map(h => (
          <div
            key={h.id}
            style={{
              position: 'absolute',
              left: `${h.x}%`,
              top: `${h.y}%`,
              width: `${h.w}%`,
              height: `${h.h}%`,
              backgroundColor: highlightColors[h.color],
              borderRadius: 3,
              zIndex: 4,
              cursor: isHighlightMode ? 'pointer' : 'default',
              pointerEvents: isHighlightMode ? 'auto' : 'none',
            }}
            onClick={(e) => { if (isHighlightMode) { e.stopPropagation(); removeHighlight(h.id) } }}
            title={isHighlightMode ? 'Click to remove' : ''}
          />
        ))}
        {drawingHighlight && drawingHighlight.target === target && (
          <div
            style={{
              position: 'absolute',
              left: `${drawingHighlight.x}%`,
              top: `${drawingHighlight.y}%`,
              width: `${drawingHighlight.w}%`,
              height: `${drawingHighlight.h}%`,
              backgroundColor: highlightColors[highlightColor],
              borderRadius: 3,
              zIndex: 4,
              pointerEvents: 'none',
            }}
          />
        )}
      </>
    )
  }

  const HighlightToolbar = ({ target }) => (
    <div className="flex items-center gap-2 mb-2 justify-center flex-wrap">
      <button
        onClick={() => setIsHighlightMode(prev => !prev)}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
          isHighlightMode ? 'bg-yellow-100 text-yellow-800 ring-2 ring-yellow-400' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        <Highlighter className="w-3.5 h-3.5" />
        Highlight
      </button>
      {isHighlightMode && (
        <>
          {Object.keys(highlightColors).map(c => (
            <button
              key={c}
              onClick={() => setHighlightColor(c)}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${
                highlightColor === c ? 'border-gray-800 scale-125' : 'border-gray-300'
              }`}
              style={{ backgroundColor: highlightColors[c].replace('0.35', '0.7') }}
            />
          ))}
          <button
            onClick={() => clearHighlights(target)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        </>
      )}
    </div>
  )

  const getAllFields = () => {
    if (!exercise?.content?.pages) return []
    return exercise.content.pages.flatMap(p => p.fields || [])
  }

  const getCurrentPageFields = () => {
    const page = exercise?.content?.pages?.find(p => p.page_number === currentPage)
    return page?.fields || []
  }

  const updateAnswer = (fieldId, value) => {
    if (exerciseComplete || isSubmitted) return
    setUserAnswers(prev => ({ ...prev, [fieldId]: value }))
  }

  const gradeField = (field) => {
    const answer = userAnswers[field.id]
    switch (field.type) {
      case 'text': {
        const typed = (answer || '').trim()
        const correct = (field.correct_answer || '').trim()
        if (!correct) return false
        return field.case_sensitive
          ? typed === correct
          : typed.toLowerCase() === correct.toLowerCase()
      }
      case 'dropdown':
        return answer === field.correct_option
      case 'checkbox': {
        const expected = field.correct_answer === 'true'
        return answer === expected
      }
      default:
        return false
    }
  }

  const handleSubmit = async () => {
    if (isSubmitted || exerciseComplete) return

    const allFields = getAllFields()
    setIsSubmitted(true)

    const newFeedback = {}
    let correctCount = 0

    allFields.forEach(field => {
      const isCorrect = gradeField(field)
      if (isCorrect) correctCount++
      newFeedback[field.id] = { correct: isCorrect, showFeedback: true }
    })

    setFieldFeedback(newFeedback)

    const scorePercent = Math.round((correctCount / allFields.length) * 100)
    const passed = scorePercent >= 80
    playFeedback(passed)

    setExerciseComplete(true)
    const baseXP = exercise.xp_reward || 10
    const bonusXP = scorePercent >= 95 ? Math.round(baseXP * 0.5) : scorePercent >= 90 ? Math.round(baseXP * 0.3) : 0
    const totalXP = baseXP + bonusXP
    const timeSpent = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0

    // Save question_attempts for each field (so teacher reports can review them)
    if (user && !isTeacherView) {
      try {
        const attempts = []
        const allPages = exercise.content?.pages || []
        allPages.forEach(page => {
          const fields = page.fields || []
          fields.forEach((field) => {
            const fieldAnswer = userAnswers[field.id]
            attempts.push({
              user_id: user.id,
              exercise_id: exerciseId,
              question_id: field.id,
              exercise_type: 'pdf_worksheet',
              selected_answer: fieldAnswer != null ? String(fieldAnswer) : null,
              correct_answer: field.type === 'dropdown' ? String(field.correct_option) : field.correct_answer,
              is_correct: newFeedback[field.id]?.correct || false,
            })
          })
        })
        if (attempts.length > 0) {
          await supabase.from('question_attempts').insert(attempts)
        }
      } catch (err) {
        console.log('⚠️ Could not save question attempts:', err.message)
      }
    }

    if (user && !hasEarnedXP && !isTeacherView) {
      const result = await completeExerciseWithXP(exerciseId, totalXP, {
        score: scorePercent,
        max_score: 100,
        time_spent: timeSpent,
        challengeId,
        challengeStartedAt: challengeStartTime
      })
      if (result?.xpAwarded > 0) {
        setXpEarned(result.xpAwarded)
        setHasEarnedXP(true)
      }
    } else {
      setXpEarned(0)
    }
  }

  const resetExercise = () => {
    setUserAnswers({})
    setFieldFeedback({})
    setExerciseComplete(false)
    setXpEarned(0)
    setStartTime(Date.now())
    setIsSubmitted(false)
  }

  const renderField = (field) => {
    const { x, y, width, height } = field.coordinates
    const feedback = fieldFeedback[field.id]
    const isCorrect = feedback?.correct

    let borderColor = 'rgba(156, 163, 175, 0.6)'
    if (isSubmitted && feedback) {
      borderColor = isCorrect ? '#22c55e' : '#ef4444'
    }

    const style = {
      position: 'absolute',
      left: `${x}%`,
      top: `${y}%`,
      width: `${width}%`,
      height: `${height}%`,
      zIndex: 5
    }

    const inputClass = `w-full h-full text-sm rounded transition-colors`

    switch (field.type) {
      case 'text':
        return (
          <input
            key={field.id}
            type="text"
            style={{ ...style, border: `2px solid ${borderColor}`, padding: '0 4px' }}
            className={`${inputClass} bg-white/90 focus:ring-2 focus:ring-blue-400 focus:outline-none`}
            value={userAnswers[field.id] || ''}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
            placeholder={field.label}
            disabled={isSubmitted}
          />
        )
      case 'dropdown':
        return (
          <select
            key={field.id}
            style={{ ...style, border: `2px solid ${borderColor}` }}
            className={`${inputClass} bg-white/90 focus:ring-2 focus:ring-blue-400 focus:outline-none`}
            value={userAnswers[field.id] ?? ''}
            onChange={(e) => updateAnswer(field.id, e.target.value === '' ? '' : parseInt(e.target.value))}
            disabled={isSubmitted}
          >
            <option value="">{field.label || '-- Select --'}</option>
            {(field.options || []).map((opt, i) => (
              <option key={i} value={i}>{opt}</option>
            ))}
          </select>
        )
      case 'checkbox':
        return (
          <div key={field.id} style={style} className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={userAnswers[field.id] || false}
              onChange={(e) => updateAnswer(field.id, e.target.checked)}
              className="w-5 h-5 rounded"
              style={{ accentColor: isSubmitted ? (isCorrect ? '#22c55e' : '#ef4444') : undefined }}
              disabled={isSubmitted}
            />
          </div>
        )
      default:
        return null
    }
  }

  // Loading / Error states
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
          <Button3D onClick={() => navigate(-1)} color="blue">Go Back</Button3D>
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
          <Button3D onClick={() => navigate(-1)} color="blue">Go Back</Button3D>
        </div>
      </div>
    )
  }

  const allFields = getAllFields()
  const totalFields = allFields.length
  const filledFields = allFields.filter(f => {
    const a = userAnswers[f.id]
    if (f.type === 'checkbox') return a !== undefined
    return a !== undefined && a !== '' && a !== null
  }).length
  const correctFields = allFields.filter(f => fieldFeedback[f.id]?.correct).length
  const progress = isSubmitted
    ? (totalFields > 0 ? (correctFields / totalFields) * 100 : 0)
    : (totalFields > 0 ? (filledFields / totalFields) * 100 : 0)

  // Page navigation component
  const PageNav = () => numPages > 1 ? (
    <div className="flex items-center justify-center gap-1 mb-3">
      {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => {
        const pageFields = exercise.content.pages?.find(p => p.page_number === pageNum)?.fields || []
        const pageFieldCount = pageFields.length
        return (
          <button
            key={pageNum}
            onClick={() => setCurrentPage(pageNum)}
            className={`px-3 py-1 rounded-lg text-sm font-medium ${
              currentPage === pageNum
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {pageNum}
            {pageFieldCount > 0 && (
              <span className="ml-1 text-xs opacity-70">({pageFieldCount})</span>
            )}
          </button>
        )
      })}
    </div>
  ) : null

  // Passage page navigation
  const PassageNav = () => passageNumPages > 1 ? (
    <div className="flex items-center justify-center gap-1 mb-3">
      {Array.from({ length: passageNumPages }, (_, i) => i + 1).map(pageNum => (
        <button
          key={pageNum}
          onClick={() => setPassagePage(pageNum)}
          className={`px-3 py-1 rounded-lg text-sm font-medium ${
            passagePage === pageNum
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {pageNum}
        </button>
      ))}
    </div>
  ) : null

  // Per-page audio player
  const PageAudio = () => {
    const pageData = exercise?.content?.pages?.find(p => p.page_number === currentPage)
    const audioUrl = pageData?.audio_url
    if (!audioUrl) return null
    return (
      <div className="mb-3">
        <AudioPlayer audioUrl={audioUrl} seekable />
      </div>
    )
  }

  // PDF page with field overlays (non-split)
  const PDFPageWithFields = () => (
      <div ref={containerRef} className="bg-white rounded-lg shadow-md p-1 sm:p-4 border border-gray-200">
        <HighlightToolbar target="questions" />
        {PageNav()}
        {PageAudio()}
        <div
          className="relative"
          ref={pageContainerRef}
          style={{ cursor: isHighlightMode ? 'crosshair' : 'default' }}
          onMouseDown={(e) => handleHighlightMouseDown(e, 'questions')}
          onMouseMove={(e) => handleHighlightMouseMove(e, 'questions')}
          onMouseUp={handleHighlightMouseUp}
          onMouseLeave={handleHighlightMouseUp}
        >
          {isImageMode ? (
            <img src={imageUrls[currentPage - 1]} alt={`Page ${currentPage}`} style={{ width: pageWidth }} className="block" draggable={false} />
          ) : (
            <Document file={pdfFile} onLoadSuccess={onDocumentLoadSuccess}>
              <Page
                pageNumber={currentPage}
                width={pageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
          )}
          {renderHighlights('questions', currentPage)}
          {getCurrentPageFields().map(renderField)}
        </div>
      </div>
    )

  // Teacher review mode
  if (!testMode && isTeacherView && teacherMode === 'review') {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{exercise.title || 'PDF Worksheet'}</h2>
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
            <button onClick={() => session?.units ? navigate(`/study/course/${session.units.course_id}/unit/${session.units.id}/session/${sessionId}`) : navigate(-1)} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border rounded-lg">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </div>
        </div>

        {PDFPageWithFields()}

        {/* Answer key */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-3">Answer Key</h3>
          <div className="space-y-2">
            {allFields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold text-xs">{index + 1}</span>
                <span className="text-sm font-medium text-gray-700">{field.label}:</span>
                <span className="font-medium text-green-800 bg-green-50 px-2 py-1 rounded text-sm">
                  {field.type === 'text' && field.correct_answer}
                  {field.type === 'dropdown' && (field.options?.[field.correct_option] || 'N/A')}
                  {field.type === 'checkbox' && (field.correct_answer === 'true' ? 'Checked' : 'Unchecked')}
                </span>
                <span className="text-xs text-gray-400 capitalize">({field.type})</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // testMode rendering
  if (testMode) {
    return (
      <div className="space-y-4">
        {PDFPageWithFields()}
      </div>
    )
  }

  const sideImages = themeSideImages[colorTheme] || themeSideImages.blue

  // Full-screen split view for reading passage + questions
  if (isSplitView) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col bg-gray-100" style={{ width: '100vw', height: '100vh' }}>
        {/* Top bar: header + submit */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <ExerciseHeader
              title={exercise.title}
              progressPercentage={progress}
              isBatmanMoving={isBatmanMoving}
              showProgressLabel={false}
              showQuestionCounter={false}
              colorTheme={colorTheme}
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!exerciseComplete && !isSubmitted && (
              <Button3D
                onClick={handleSubmit}
                color="blue"
                size="sm"
                className="flex items-center gap-1"
                disabled={filledFields < totalFields}
              >
                <CheckCircle className="w-4 h-4" />
                Submit
              </Button3D>
            )}
            {!exerciseComplete && (
              <Button3D onClick={resetExercise} color="gray" size="sm" className="flex items-center gap-1">
                <RotateCcw className="w-4 h-4" />
                Reset
              </Button3D>
            )}
          </div>
        </div>

        {/* Split panes */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0">
          {/* Left: Reading passage */}
          <div className="bg-white border-r border-gray-300 overflow-y-auto p-2 sm:p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 text-center">Reading Passage</div>
            <HighlightToolbar target="passage" />
            {PassageNav()}
            <div
              className="relative"
              ref={passageContainerRef}
              style={{ cursor: isHighlightMode ? 'crosshair' : 'default' }}
              onMouseDown={(e) => handleHighlightMouseDown(e, 'passage')}
              onMouseMove={(e) => handleHighlightMouseMove(e, 'passage')}
              onMouseUp={handleHighlightMouseUp}
              onMouseLeave={handleHighlightMouseUp}
            >
              <PassagePDFRenderer
                url={passagePdfUrl}
                pageNumber={passagePage}
                width={typeof window !== 'undefined' ? Math.min(window.innerWidth / 2 - 40, 800) : 500}
                onLoadSuccess={onPassageLoadSuccess}
              />
              {renderHighlights('passage', passagePage)}
            </div>
          </div>
          {/* Right: Questions PDF with field overlays */}
          <div ref={containerRef} className="bg-white overflow-y-auto p-2 sm:p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 text-center">Questions</div>
            {PageNav()}
            {PageAudio()}
            <div className="relative" ref={pageContainerRef}>
              {isImageMode ? (
                <img src={imageUrls[currentPage - 1]} alt={`Page ${currentPage}`} style={{ width: '100%' }} className="block" />
              ) : (
                <Document file={pdfFile} onLoadSuccess={onDocumentLoadSuccess}>
                  <Page
                    pageNumber={currentPage}
                    width={typeof window !== 'undefined' ? Math.min(window.innerWidth / 2 - 40, 800) : 500}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Document>
              )}
              {getCurrentPageFields().map(renderField)}
            </div>
          </div>
        </div>

        {/* Meme Overlay */}
        {showMeme && currentMeme && (
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
            <img src={currentMeme} alt="Reaction meme" className="rounded-lg shadow-2xl" style={{ width: '200px', height: 'auto' }} />
          </div>
        )}

        {/* Completion Modal */}
        {exerciseComplete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <CelebrationScreen
              score={Math.round((correctFields / totalFields) * 100)}
              correctAnswers={correctFields}
              totalQuestions={totalFields}
              passThreshold={80}
              xpAwarded={xpEarned}
              passGif={passGif}
              isRetryMode={false}
              wrongQuestionsCount={totalFields - correctFields}
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
      </div>
    )
  }

  return (
    <>
      {/* Side decorations */}
      <div className="hidden md:block fixed left-0 bottom-[0%] w-48 lg:w-64 xl:w-80 pointer-events-none z-10">
        <img src={sideImages.left} alt="" className="w-full h-auto object-contain" style={{ maxHeight: '80vh' }} />
      </div>
      <div className="hidden md:block fixed right-0 bottom-[0%] w-48 lg:w-64 xl:w-80 pointer-events-none z-10">
        <img src={sideImages.right} alt="" className="w-full h-auto object-contain" style={{ maxHeight: '80vh' }} />
      </div>

      <div className="relative px-0 sm:px-2 md:pt-2 pb-12">
        <div className="max-w-4xl mx-auto space-y-6 relative z-20">
          {isTeacherView && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}
          {/* Teacher Do Mode Banner */}
          {isTeacherView && teacherMode === 'do' && (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
              <span className="text-sm text-amber-800 font-medium">Teacher Preview — No XP will be awarded</span>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button onClick={() => setTeacherMode('review')} className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:text-gray-800">Review</button>
                <button className="px-3 py-1.5 text-sm font-medium rounded-md bg-white shadow text-blue-700">Do</button>
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
          />

          {/* Meme Overlay */}
          {showMeme && currentMeme && (
            <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <img src={currentMeme} alt="Reaction meme" className="rounded-lg shadow-2xl" style={{ width: '200px', height: 'auto' }} />
            </div>
          )}

          {/* PDF with fields */}
          {PDFPageWithFields()}

          {/* Submit / Reset */}
          {!exerciseComplete && (
            <div className="flex gap-3 justify-center">
              {!isSubmitted && (
                <Button3D
                  onClick={handleSubmit}
                  color="blue"
                  size="md"
                  className="flex items-center gap-2"
                  disabled={filledFields < totalFields}
                >
                  <CheckCircle className="w-4 h-4" />
                  Submit
                </Button3D>
              )}
              <Button3D
                onClick={resetExercise}
                color="gray"
                size="md"
                className="flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </Button3D>
            </div>
          )}

          {isSubmitted && !exerciseComplete && (
            <p className="text-center text-sm text-red-600 font-medium">
              Some answers are incorrect. Click Reset to try again.
            </p>
          )}
        </div>
      </div>

      {/* Completion Modal */}
      {exerciseComplete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <CelebrationScreen
            score={Math.round((correctFields / totalFields) * 100)}
            correctAnswers={correctFields}
            totalQuestions={totalFields}
            passThreshold={80}
            xpAwarded={xpEarned}
            passGif={passGif}
            isRetryMode={false}
            wrongQuestionsCount={totalFields - correctFields}
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

export default PDFWorksheetExercise
