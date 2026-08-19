import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useTests } from '../../hooks/useTests'
import { useAuth } from '../../hooks/useAuth'
import MultipleChoiceExercise from '../exercises/MultipleChoiceExercise'
import FillBlankExercise from '../exercises/FillBlankExercise'
import { splitAnswers } from '../../utils/splitAnswers'
import DragDropExercise from '../exercises/DragDropExercise'
import DropdownExercise from '../exercises/DropdownExercise'
import ImageHotspotExercise from '../exercises/ImageHotspotExercise'
import AIFillBlankExercise from '../exercises/AIFillBlankExercise'
import PDFWorksheetExercise from '../exercises/PDFWorksheetExercise'
import { Clock, AlertTriangle, Send, CheckCircle, ChevronRight, FileText, Play } from 'lucide-react'

const exerciseTypeLabels = {
  multiple_choice: 'Multiple Choice',
  fill_blank: 'Fill Blank',
  drag_drop: 'Drag & Drop',
  dropdown: 'Dropdown',
  image_hotspot: 'Image Hotspot',
  ai_fill_blank: 'AI Fill Blank',
  pdf_worksheet: 'PDF Worksheet'
}

const TestRunner = () => {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')
  const courseId = searchParams.get('courseId')
  const unitId = searchParams.get('unitId')
  const navigate = useNavigate()
  const { user } = useAuth()
  const { startTestAttempt, submitTestAttempt, saveDraftAnswers, fetchMyAttempts } = useTests()

  const [session, setSession] = useState(null)
  const [exercises, setExercises] = useState([])
  const [attempt, setAttempt] = useState(null)
  const [activeTab, setActiveTab] = useState(0)
  const [answers, setAnswers] = useState({}) // { exerciseId: answersFromComponent }
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState(null)
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const [previousAttempts, setPreviousAttempts] = useState([])
  const [showInfo, setShowInfo] = useState(false)
  const [initialAnswers, setInitialAnswers] = useState(null) // restored from draft_answers
  const autoSubmitRef = useRef(false)
  const answersRef = useRef({})
  const loadingRef = useRef(false)

  useEffect(() => {
    if (sessionId && !loadingRef.current) loadTest()
  }, [sessionId])

  const loadTest = async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      setLoading(true)

      // Fetch session data
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (sessionError) throw sessionError
      setSession(sessionData)

      // Fetch exercises via exercise_assignments
      const { data: assignments, error: assignError } = await supabase
        .from('exercise_assignments')
        .select(`
          id, exercise_id, order_index,
          exercise:exercises (id, title, exercise_type, content, xp_reward)
        `)
        .eq('session_id', sessionId)
        .order('order_index')

      if (assignError) throw assignError

      const exList = (assignments || [])
        .map(a => a.exercise)
        .filter(Boolean)
      setExercises(exList)

      // Check if there's an existing in-progress attempt to resume
      const att = await startTestAttempt(sessionId, sessionData.max_attempts)

      if (att.limitReached) {
        const prev = await fetchMyAttempts(sessionId)
        setPreviousAttempts(prev)
        setLimitReached(true)
        return
      }

      // If resuming an existing attempt, go straight to the test
      if (att.draft_answers && Object.keys(att.draft_answers).length > 0) {
        setAttempt(att)
        setAnswers(att.draft_answers)
        answersRef.current = att.draft_answers
        setInitialAnswers(att.draft_answers)

        const startedAt = new Date(att.started_at).getTime()
        const totalSeconds = (sessionData.time_limit_minutes || 30) * 60
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        const remaining = Math.max(0, totalSeconds - elapsed)
        setTimeRemaining(remaining)

        if (remaining <= 0 && att.status === 'in_progress') {
          autoSubmitRef.current = true
        }
        return
      }

      // New attempt — show info screen first
      setAttempt(att)
      setShowInfo(true)
    } catch (error) {
      console.error('Error loading test:', error)
    } finally {
      setLoading(false)
    }
  }

  const beginTest = () => {
    setShowInfo(false)
    // Start the timer now
    const totalSeconds = (session.time_limit_minutes || 30) * 60
    setTimeRemaining(totalSeconds)
  }

  // Timer countdown
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0 || results) return

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [timeRemaining, results])

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (timeRemaining === 0 && !results && !submitting) {
      handleSubmit(true)
    }
  }, [timeRemaining])

  // Auto-submit if loaded with expired time
  useEffect(() => {
    if (autoSubmitRef.current && attempt && !results && !submitting) {
      autoSubmitRef.current = false
      handleSubmit(true)
    }
  }, [attempt])

  // Keep answersRef in sync
  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  // Auto-save draft answers every 10 seconds
  useEffect(() => {
    if (!attempt || results) return

    const interval = setInterval(() => {
      const current = answersRef.current
      if (Object.keys(current).length > 0) {
        saveDraftAnswers(attempt.id, current)
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [attempt, results, saveDraftAnswers])

  // Save draft on page unload (best-effort)
  useEffect(() => {
    if (!attempt) return

    const handleBeforeUnload = () => {
      const current = answersRef.current
      if (Object.keys(current).length > 0) {
        saveDraftAnswers(attempt.id, current)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [attempt, saveDraftAnswers])

  // Handle answers from exercise components
  const handleAnswersCollected = useCallback((exerciseId, exerciseAnswers) => {
    setAnswers(prev => ({ ...prev, [exerciseId]: exerciseAnswers }))
  }, [])

  // Grading logic - now grades from exercise-level answers
  const gradeTest = useCallback(() => {
    let totalCorrect = 0
    let totalQuestions = 0
    const questionAttempts = []

    exercises.forEach(ex => {
      const exerciseAnswers = answers[ex.id]

      if (ex.exercise_type === 'image_hotspot') {
        const content = ex.content || {}
        const hotspots = content.hotspots || []
        const labels = content.labels || []
        const userAnswer = exerciseAnswers || {}

        hotspots.forEach((hotspot, hi) => {
          totalQuestions++
          const selectedLabelId = userAnswer[hotspot.id]
          const selectedLabel = labels.find(l => l.id === selectedLabelId)
          const isDistractor = selectedLabel?.type === 'distractor'
          const isCorrect = !isDistractor && selectedLabel?.hotspot_id === hotspot.id

          if (isCorrect) totalCorrect++
          questionAttempts.push({
            exercise_id: ex.id,
            question_index: hi,
            exercise_type: ex.exercise_type,
            selected_answer: selectedLabelId || null,
            correct_answer: labels.find(l => l.hotspot_id === hotspot.id && l.type !== 'distractor')?.id || null,
            is_correct: isCorrect
          })
        })
        return
      }

      if (ex.exercise_type === 'pdf_worksheet') {
        const content = ex.content || {}
        const allPages = content.pages || []
        const userAnswer = exerciseAnswers || {}

        allPages.forEach(page => {
          const fields = page.fields || []
          fields.forEach((field, fi) => {
            totalQuestions++
            let isCorrect = false
            const fieldAnswer = userAnswer[field.id]

            switch (field.type) {
              case 'text': {
                const typed = (fieldAnswer || '').trim()
                const correct = (field.correct_answer || '').trim()
                if (field.case_sensitive) {
                  isCorrect = typed === correct
                } else {
                  isCorrect = typed.toLowerCase() === correct.toLowerCase()
                }
                break
              }
              case 'dropdown': {
                isCorrect = fieldAnswer === field.correct_option
                break
              }
              case 'checkbox': {
                const expected = field.correct_answer === 'true'
                isCorrect = fieldAnswer === expected
                break
              }
            }

            if (isCorrect) totalCorrect++
            questionAttempts.push({
              exercise_id: ex.id,
              question_index: page.page_number * 1000 + fi,
              exercise_type: ex.exercise_type,
              selected_answer: fieldAnswer ?? null,
              correct_answer: field.type === 'dropdown' ? field.correct_option : field.correct_answer,
              is_correct: isCorrect
            })
          })
        })
        return
      }

      const questions = ex.content?.questions || []
      questions.forEach((q, qi) => {
        switch (ex.exercise_type) {
          case 'multiple_choice': {
            totalQuestions++
            // exerciseAnswers is allAnswers: { questionIndex: selectedOptionIndex }
            const userAnswer = exerciseAnswers?.[qi]
            const isCorrect = userAnswer === q.correct_answer
            if (isCorrect) totalCorrect++
            questionAttempts.push({
              exercise_id: ex.id,
              question_index: qi,
              exercise_type: ex.exercise_type,
              selected_answer: userAnswer ?? null,
              correct_answer: q.correct_answer,
              is_correct: isCorrect
            })
            break
          }
          case 'fill_blank': {
            const blanks = q.blanks || []
            blanks.forEach((blank, bi) => {
              totalQuestions++
              // exerciseAnswers is userAnswers: { questionIndex: { blankIndex: value } }
              const typed = ((exerciseAnswers?.[qi] || {})[bi] || '').trim()
              const correctAnswers = splitAnswers(blank.answer)
              const caseSensitive = blank.case_sensitive
              const isCorrect = caseSensitive
                ? correctAnswers.some(a => typed === a)
                : correctAnswers.some(a => typed.toLowerCase() === a.toLowerCase())
              if (isCorrect) totalCorrect++
              questionAttempts.push({
                exercise_id: ex.id,
                question_index: qi * 100 + bi,
                exercise_type: ex.exercise_type,
                selected_answer: typed,
                correct_answer: blank.answer,
                is_correct: isCorrect
              })
            })
            break
          }
          case 'drag_drop': {
            const dropZones = q.drop_zones || []
            const correctOrder = q.correct_order || []
            const items = q.items || []
            const userPlacements = exerciseAnswers?.[qi] || {}

            dropZones.forEach((zone, zi) => {
              totalQuestions++
              const studentItemId = userPlacements[zone.id]
              const correctItemId = correctOrder[zi]
              const isCorrect = !!(studentItemId && studentItemId === correctItemId)
              if (isCorrect) totalCorrect++
              questionAttempts.push({
                exercise_id: ex.id,
                question_index: qi * 100 + zi,
                exercise_type: ex.exercise_type,
                selected_answer: studentItemId || null,
                correct_answer: correctItemId || null,
                is_correct: isCorrect
              })
            })
            break
          }
          case 'dropdown': {
            const dropdowns = q.dropdowns || []
            dropdowns.forEach((dd, di) => {
              totalQuestions++
              // exerciseAnswers is userAnswers: { questionIndex: { dropdownIndex: value } }
              const selected = ((exerciseAnswers?.[qi] || {})[di] || '').trim()
              const correct = (dd.correct_answer || '').trim()
              const isCorrect = selected === correct
              if (isCorrect) totalCorrect++
              questionAttempts.push({
                exercise_id: ex.id,
                question_index: qi * 100 + di,
                exercise_type: ex.exercise_type,
                selected_answer: selected,
                correct_answer: correct,
                is_correct: isCorrect
              })
            })
            break
          }
          case 'ai_fill_blank': {
            totalQuestions++
            // exerciseAnswers is userAnswers: { questionIndex: textAnswer }
            const userAnswer = (exerciseAnswers?.[qi] || '').trim().toLowerCase()
            const expectedAnswers = q.expected_answers || []
            // Simple match: check if user answer contains any expected answer
            const isCorrect = expectedAnswers.length > 0 && expectedAnswers.some(ea =>
              userAnswer.includes(ea.trim().toLowerCase())
            )
            if (isCorrect) totalCorrect++
            questionAttempts.push({
              exercise_id: ex.id,
              question_index: qi,
              exercise_type: ex.exercise_type,
              selected_answer: exerciseAnswers?.[qi] || '',
              correct_answer: expectedAnswers.join(', '),
              is_correct: isCorrect
            })
            break
          }
          default:
            break
        }
      })
    })

    const score = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0
    const passed = score >= (session?.passing_score || 70)

    return { score, passed, totalCorrect, totalQuestions, questionAttempts }
  }, [exercises, answers, session])

  const handleSubmit = async (timedOut = false) => {
    if (submitting || results) return
    setSubmitting(true)
    setShowConfirmSubmit(false)

    try {
      const gradeResult = gradeTest()
      const startedAt = new Date(attempt.started_at).getTime()
      const timeUsed = Math.floor((Date.now() - startedAt) / 1000)

      await submitTestAttempt(attempt.id, {
        score: gradeResult.score,
        passed: gradeResult.passed,
        time_used_seconds: timeUsed,
        status: timedOut ? 'timed_out' : 'completed',
        questionAttempts: gradeResult.questionAttempts
      })

      setResults({
        ...gradeResult,
        timeUsed,
        timedOut
      })
    } catch (error) {
      console.error('Error submitting test:', error)
      setSubmitting(false)
    }
  }

  const formatTime = (seconds) => {
    if (seconds === null) return '--:--'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const goBack = () => {
    if (courseId) {
      navigate(`/study/course/${courseId}`)
    } else {
      navigate('/study')
    }
  }

  // Stable callbacks per exercise to avoid infinite re-render loops
  const onCollectCallbacks = useRef({})
  const getOnCollect = useCallback((exerciseId) => {
    if (!onCollectCallbacks.current[exerciseId]) {
      onCollectCallbacks.current[exerciseId] = (exerciseAnswers) => {
        setAnswers(prev => ({ ...prev, [exerciseId]: exerciseAnswers }))
      }
    }
    return onCollectCallbacks.current[exerciseId]
  }, [])

  const renderExercise = (ex) => {
    const onCollect = getOnCollect(ex.id)
    const saved = initialAnswers?.[ex.id] || undefined

    switch (ex.exercise_type) {
      case 'multiple_choice':
        return <MultipleChoiceExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} initialAnswers={saved} />
      case 'fill_blank':
        return <FillBlankExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} initialAnswers={saved} />
      case 'drag_drop':
        return <DragDropExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} initialAnswers={saved} />
      case 'dropdown':
        return <DropdownExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} initialAnswers={saved} />
      case 'image_hotspot':
        return <ImageHotspotExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} initialAnswers={saved} />
      case 'ai_fill_blank':
        return <AIFillBlankExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} initialAnswers={saved} />
      case 'pdf_worksheet':
        return <PDFWorksheetExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} initialAnswers={saved} />
      default:
        return <p className="text-gray-500">Unsupported exercise type: {ex.exercise_type}</p>
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading test...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Test not found</p>
          <button onClick={goBack} className="mt-4 text-blue-600 hover:underline">
            Go back
          </button>
        </div>
      </div>
    )
  }

  // Limit reached screen
  if (limitReached) {
    return (
      <div className="min-h-screen bg-white p-4">
        <div className="max-w-md mx-auto mt-12">
          <div className="rounded-2xl p-8 text-center bg-blue-50 border-2 border-blue-200">
            <CheckCircle className="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Test Completed</h2>
            <p className="text-gray-500 text-sm">
              You have completed this test. Results are available from your teacher.
            </p>
            <button
              onClick={goBack}
              className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Info screen before starting
  if (showInfo) {
    return (
      <div className="min-h-screen bg-white p-4">
        <div className="max-w-md mx-auto mt-12">
          <div className="rounded-2xl p-8 bg-white border-2 border-gray-200 shadow-sm">
            <FileText className="w-14 h-14 text-blue-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-6">{session.title}</h2>

            <div className="space-y-3 mb-8">
              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Tasks</span>
                <span className="text-sm font-bold text-gray-900">{exercises.length}</span>
              </div>
              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Time Limit</span>
                <span className="text-sm font-bold text-gray-900">{session.time_limit_minutes || 30} minutes</span>
              </div>
              {session.max_attempts && session.max_attempts > 0 && (
                <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Attempts</span>
                  <span className="text-sm font-bold text-gray-900">{session.max_attempts}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 text-center mb-6">
              The timer starts when you press the button below. Good luck!
            </p>

            <button
              onClick={beginTest}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              <Play className="w-5 h-5" />
              Start Test
            </button>

            <button
              onClick={goBack}
              className="w-full mt-3 px-6 py-3 text-gray-500 text-sm hover:text-gray-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Results screen — just show completed, no pass/fail
  if (results) {
    return (
      <div className="min-h-screen bg-white p-4">
        <div className="max-w-md mx-auto mt-12">
          <div className="rounded-2xl p-8 text-center bg-blue-50 border-2 border-blue-200">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 bg-blue-100">
              <CheckCircle className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-blue-700">Test Completed</h2>
            {results.timedOut && (
              <p className="text-orange-600 text-sm mb-2 flex items-center justify-center gap-1">
                <Clock size={14} /> Time expired — auto-submitted
              </p>
            )}
            <p className="text-sm text-gray-500 mt-4">
              Your test has been submitted. Results are available from your teacher.
            </p>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={goBack}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isLowTime = timeRemaining !== null && timeRemaining <= 60
  const activeExercise = exercises[activeTab]

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Sticky header with timer */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 truncate">{session.title}</h1>
            <p className="text-xs text-gray-500">
              {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-bold ${
            isLowTime ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-blue-100 text-blue-700'
          }`}>
            <Clock size={18} />
            {formatTime(timeRemaining)}
          </div>
        </div>

        {/* Exercise tabs */}
        <div className="max-w-4xl mx-auto px-4 pb-0 flex gap-0 overflow-x-auto">
          {exercises.map((ex, i) => {
            const isActive = i === activeTab
            const label = exerciseTypeLabels[ex.exercise_type] || ex.exercise_type
            return (
              <button
                key={ex.id}
                onClick={() => setActiveTab(i)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-700 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {i + 1}. {ex.title || label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Exercise content - render all, show only active to preserve state */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {exercises.map((ex, i) => (
          <div key={ex.id} style={{ display: i === activeTab ? 'block' : 'none' }}>
            {renderExercise(ex)}
          </div>
        ))}
      </div>

      {/* Bottom bar with next/submit */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-center">
          {activeTab < exercises.length - 1 ? (
            <button
              onClick={() => setActiveTab(prev => prev + 1)}
              className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Next <ChevronRight size={18} />
            </button>
          ) : (
            <button
              onClick={() => setShowConfirmSubmit(true)}
              disabled={submitting}
              className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Send size={18} /> Submit Test
            </button>
          )}
        </div>
      </div>

      {/* Confirm submit modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Submit Test?</h3>
            <p className="text-gray-600 text-sm mb-4">
              Are you sure you want to submit? Make sure you've answered all questions.
            </p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmit(false)}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TestRunner
