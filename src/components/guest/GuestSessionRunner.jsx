import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import MultipleChoiceExercise from '../exercises/MultipleChoiceExercise'
import FillBlankExercise from '../exercises/FillBlankExercise'
import { splitAnswers, firstAnswer } from '../../utils/splitAnswers'
import DragDropExercise from '../exercises/DragDropExercise'
import DropdownExercise from '../exercises/DropdownExercise'
import ImageHotspotExercise from '../exercises/ImageHotspotExercise'
import ColorFillExercise from '../exercises/ColorFillExercise'
import { gradeColorFill, getQuestionFields } from '../../utils/colorFill'
import AIFillBlankExercise from '../exercises/AIFillBlankExercise'
import PDFWorksheetExercise from '../exercises/PDFWorksheetExercise'
import { Clock, AlertTriangle, Send, CheckCircle, XCircle, ChevronRight, ChevronLeft, ChevronDown, FileText, Play, ArrowLeft, UserPlus, RotateCcw } from 'lucide-react'
import RichTextRenderer from '../ui/RichTextRenderer'
import { callAIScoring } from '../../utils/aiScoringService'
import { REGISTER_PATH } from '../../config/registration'

const exerciseTypeLabels = {
  multiple_choice: 'Multiple Choice',
  fill_blank: 'Fill Blank',
  drag_drop: 'Drag & Drop',
  dropdown: 'Dropdown',
  image_hotspot: 'Image Hotspot',
  color_fill: 'Color Fill',
  ai_fill_blank: 'AI Fill Blank',
  pdf_worksheet: 'PDF Worksheet'
}

const GuestSessionRunner = () => {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')
  const guestId = searchParams.get('guestId')
  const courseId = searchParams.get('courseId')
  const guestName = decodeURIComponent(searchParams.get('guestName') || '')
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [exercises, setExercises] = useState([])
  const [activeTab, setActiveTab] = useState(0)
  const [answers, setAnswers] = useState({})
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState(null)
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false)
  const [showInfo, setShowInfo] = useState(true)
  const [startTime, setStartTime] = useState(null)
  const [showIncorrect, setShowIncorrect] = useState(false)
  const [aiScores, setAiScores] = useState({}) // { 'exerciseId_questionIndex': { score, explanation, confidence } }
  const [aiScoringInProgress, setAiScoringInProgress] = useState(false)

  useEffect(() => {
    if (sessionId) loadSession()
  }, [sessionId])

  const loadSession = async () => {
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
    } catch (error) {
      console.error('Error loading session:', error)
    } finally {
      setLoading(false)
    }
  }

  const beginSession = () => {
    setShowInfo(false)
    setStartTime(Date.now())
    if (session?.is_test && session?.time_limit_minutes) {
      setTimeRemaining(session.time_limit_minutes * 60)
    }
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

  // Warn before leaving a lesson in progress so an accidental refresh does not lose answers
  useEffect(() => {
    if (showInfo || results) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [showInfo, results])

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (timeRemaining === 0 && !results && !submitting) {
      handleSubmit(true)
    }
  }, [timeRemaining])

  // Grading logic - same as TestRunner
  const gradeSession = useCallback((aiScoresMap = {}) => {
    let totalCorrect = 0
    let totalQuestions = 0

    exercises.forEach(ex => {
      const exerciseAnswers = answers[ex.id]

      if (ex.exercise_type === 'image_hotspot') {
        const content = ex.content || {}
        const hotspots = content.hotspots || []
        const labels = content.labels || []
        const userAnswer = exerciseAnswers || {}

        hotspots.forEach((hotspot) => {
          totalQuestions++
          const selectedLabelId = userAnswer[hotspot.id]
          const selectedLabel = labels.find(l => l.id === selectedLabelId)
          const isDistractor = selectedLabel?.type === 'distractor'
          const isCorrect = !isDistractor && selectedLabel?.hotspot_id === hotspot.id
          if (isCorrect) totalCorrect++
        })
        return
      }

      if (ex.exercise_type === 'color_fill') {
        const content = ex.content || {}
        const result = gradeColorFill(content, exerciseAnswers || {})

        // Regions and text boxes are graded items of equal weight
        totalQuestions += result.total
        totalCorrect += result.correct
        return
      }

      if (ex.exercise_type === 'pdf_worksheet') {
        const content = ex.content || {}
        const allPages = content.pages || []
        const userAnswer = exerciseAnswers || {}

        allPages.forEach(page => {
          const fields = page.fields || []
          fields.forEach((field) => {
            totalQuestions++
            let isCorrect = false
            const fieldAnswer = userAnswer[field.id]

            switch (field.type) {
              case 'text': {
                const typed = (fieldAnswer || '').trim()
                const correct = (field.correct_answer || '').trim()
                isCorrect = field.case_sensitive
                  ? typed === correct
                  : typed.toLowerCase() === correct.toLowerCase()
                break
              }
              case 'dropdown':
                isCorrect = fieldAnswer === field.correct_option
                break
              case 'checkbox': {
                const expected = field.correct_answer === 'true'
                isCorrect = fieldAnswer === expected
                break
              }
            }
            if (isCorrect) totalCorrect++
          })
        })
        return
      }

      const questions = ex.content?.questions || []
      questions.forEach((q, qi) => {
        switch (ex.exercise_type) {
          case 'multiple_choice': {
            totalQuestions++
            const userAnswer = exerciseAnswers?.[qi]
            if (userAnswer === q.correct_answer) totalCorrect++
            break
          }
          case 'fill_blank': {
            const blanks = q.blanks || []
            blanks.forEach((blank, bi) => {
              totalQuestions++
              const typed = ((exerciseAnswers?.[qi] || {})[bi] || '').trim()
              const correctAnswers = splitAnswers(blank.answer)
              const isCorrect = blank.case_sensitive
                ? correctAnswers.some(a => typed === a)
                : correctAnswers.some(a => typed.toLowerCase() === a.toLowerCase())
              if (isCorrect) totalCorrect++
            })
            break
          }
          case 'drag_drop': {
            const dropZones = q.drop_zones || []
            const correctOrder = q.correct_order || []
            const userPlacements = exerciseAnswers?.[qi] || {}

            dropZones.forEach((zone, zi) => {
              totalQuestions++
              const studentItemId = userPlacements[zone.id]
              const correctItemId = correctOrder[zi]
              if (studentItemId && studentItemId === correctItemId) totalCorrect++
            })
            break
          }
          case 'dropdown': {
            const dropdowns = q.dropdowns || []
            dropdowns.forEach((dd, di) => {
              totalQuestions++
              const selected = ((exerciseAnswers?.[qi] || {})[di] || '').trim()
              const correct = (dd.correct_answer || '').trim()
              if (selected === correct) totalCorrect++
            })
            break
          }
          case 'ai_fill_blank': {
            totalQuestions++
            const aiKey = `${ex.id}_${qi}`
            const aiResult = aiScoresMap[aiKey]
            if (aiResult && aiResult.score >= 70) {
              totalCorrect++
            } else if (!aiResult) {
              // Fallback to simple matching if no AI score
              const userAnswer = (exerciseAnswers?.[qi] || '').trim().toLowerCase()
              const expectedAnswers = q.expected_answers || []
              const isCorrect = expectedAnswers.length > 0 && expectedAnswers.some(ea =>
                userAnswer.includes(ea.trim().toLowerCase())
              )
              if (isCorrect) totalCorrect++
            }
            break
          }
          default:
            break
        }
      })
    })

    const score = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0
    const passed = score >= (session?.passing_score || 70)

    return { score, passed, totalCorrect, totalQuestions }
  }, [exercises, answers, session])

  const handleSubmit = async (timedOut = false) => {
    if (submitting || results) return
    setSubmitting(true)
    setShowConfirmSubmit(false)

    try {
      // Run AI scoring for ai_fill_blank exercises first
      const newAiScores = {}
      const aiPromises = []

      exercises.forEach(ex => {
        if (ex.exercise_type !== 'ai_fill_blank') return
        const exerciseAnswers = answers[ex.id]
        const questions = ex.content?.questions || []
        questions.forEach((q, qi) => {
          const userAnswer = (exerciseAnswers?.[qi] || '').trim()
          if (!userAnswer) return
          const key = `${ex.id}_${qi}`
          aiPromises.push(
            callAIScoring(q.question, userAnswer, q.expected_answers || [], 'educational assessment', 'vi')
              .then(result => { newAiScores[key] = result })
              .catch(() => { newAiScores[key] = { score: 0, explanation: 'Không thể chấm điểm AI', confidence: 0 } })
          )
        })
      })

      if (aiPromises.length > 0) {
        setAiScoringInProgress(true)
        await Promise.all(aiPromises)
        setAiScoringInProgress(false)
        setAiScores(newAiScores)
      }

      const gradeResult = gradeSession(newAiScores)
      const timeUsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0

      // Save guest attempt to database
      try {
        await supabase.from('guest_attempts').insert({
          guest_id: guestId,
          session_id: sessionId,
          score: gradeResult.score,
          total_correct: gradeResult.totalCorrect,
          total_questions: gradeResult.totalQuestions,
          time_used_seconds: timeUsed,
          timed_out: timedOut,
          answers: answers
        })
      } catch (err) {
        console.error('Error saving guest attempt:', err)
      }

      setResults({
        ...gradeResult,
        timeUsed,
        timedOut
      })
    } catch (error) {
      console.error('Error submitting:', error)
      setSubmitting(false)
    }
  }

  const formatTime = (seconds) => {
    if (seconds === null) return '--:--'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Keep the course when the guest came from a course link
  const goBack = () => {
    navigate(courseId ? `/guest?course=${courseId}` : '/guest')
  }

  // Stable callbacks per exercise
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

    switch (ex.exercise_type) {
      case 'multiple_choice':
        return <MultipleChoiceExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} />
      case 'fill_blank':
        return <FillBlankExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} />
      case 'drag_drop':
        return <DragDropExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} />
      case 'dropdown':
        return <DropdownExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} />
      case 'image_hotspot':
        return <ImageHotspotExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} />
      case 'color_fill':
        return <ColorFillExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} />
      case 'ai_fill_blank':
        return <AIFillBlankExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} />
      case 'pdf_worksheet':
        return <PDFWorksheetExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} />
      default:
        return <p className="text-gray-500">Loại bài tập chưa được hỗ trợ: {ex.exercise_type}</p>
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Đang tải bài học...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Không tìm thấy bài học</p>
          <button onClick={goBack} className="mt-4 text-blue-600 hover:underline">
            Quay lại
          </button>
        </div>
      </div>
    )
  }

  // Info screen before starting
  if (showInfo) {
    const hasTimeLimit = session.is_test && session.time_limit_minutes

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-md mx-auto mt-6 sm:mt-12 rounded-3xl bg-white shadow-xl overflow-hidden">
          <div className={`px-8 pt-8 pb-10 text-center text-white bg-gradient-to-br ${
            session.is_test ? 'from-orange-500 to-red-500' : 'from-blue-600 to-indigo-600'
          }`}>
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4 text-3xl">
              {session.icon || <FileText className="w-8 h-8" />}
            </div>
            {session.is_test && (
              <span className="inline-block rounded-full bg-white/20 px-3 py-0.5 text-xs font-bold uppercase mb-2">
                Bài kiểm tra
              </span>
            )}
            <h2 className="text-2xl font-bold">{session.title}</h2>
            {guestName && <p className="mt-1 text-sm text-white/85">Xin chào, {guestName}!</p>}
          </div>

          <div className="p-6 -mt-4 bg-white rounded-t-3xl space-y-4">
            {session.description && (
              <p className="text-sm text-gray-600 leading-relaxed">{session.description}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{exercises.length}</p>
                <p className="text-xs text-gray-500">bài tập</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{hasTimeLimit ? session.time_limit_minutes : '∞'}</p>
                <p className="text-xs text-gray-500">{hasTimeLimit ? 'phút' : 'không giới hạn thời gian'}</p>
              </div>
            </div>

            {hasTimeLimit && (
              <p className="rounded-xl bg-orange-50 px-4 py-3 text-xs text-orange-700">
                Bài sẽ tự động nộp khi hết giờ. Hãy kiểm tra kỹ các câu trả lời trước khi nộp.
              </p>
            )}

            {exercises.length === 0 && (
              <p className="text-center text-sm text-gray-500">Bài học này chưa có bài tập.</p>
            )}

            <button
              onClick={beginSession}
              disabled={exercises.length === 0}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-5 h-5" />
              Bắt đầu
            </button>

            <button
              onClick={goBack}
              className="w-full px-6 py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Quay lại
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Build detailed incorrect answers list
  const getIncorrectDetails = () => {
    const incorrect = []

    exercises.forEach(ex => {
      const exerciseAnswers = answers[ex.id]

      if (ex.exercise_type === 'image_hotspot') {
        const content = ex.content || {}
        const hotspots = content.hotspots || []
        const labels = content.labels || []
        const userAnswer = exerciseAnswers || {}

        hotspots.forEach((hotspot, hi) => {
          const selectedLabelId = userAnswer[hotspot.id]
          const selectedLabel = labels.find(l => l.id === selectedLabelId)
          const isDistractor = selectedLabel?.type === 'distractor'
          const isCorrect = !isDistractor && selectedLabel?.hotspot_id === hotspot.id
          if (!isCorrect) {
            const correctLabel = labels.find(l => l.hotspot_id === hotspot.id && l.type !== 'distractor')
            incorrect.push({
              exercise: ex.title || 'Image Hotspot',
              question: `Hotspot ${hi + 1}`,
              yourAnswer: selectedLabel?.text || '(chưa trả lời)',
              correctAnswer: correctLabel?.text || '?'
            })
          }
        })
        return
      }

      if (ex.exercise_type === 'color_fill') {
        const content = ex.content || {}
        const palette = content.palette || []
        const colorName = (colorId) => palette.find(c => c.id === colorId)?.name
        const result = gradeColorFill(content, exerciseAnswers || {})

        ;(content.regions || []).forEach((region, ri) => {
          if (result.byRegion[region.id]) return
          incorrect.push({
            exercise: ex.title || 'Color Fill',
            question: region.label || `Area ${ri + 1}`,
            yourAnswer: colorName((exerciseAnswers || {})[region.id]) || '(chưa trả lời)',
            correctAnswer: colorName(region.correct_color_id) || '?'
          })
        })

        getQuestionFields(content).forEach((field) => {
          if (result.byText[field.id]) return
          incorrect.push({
            exercise: ex.title || 'Color Fill',
            question: field.question || field.label,
            yourAnswer: (exerciseAnswers || {})[field.id] || '(chưa trả lời)',
            correctAnswer: firstAnswer(field.answer) || '?'
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
          fields.forEach((field) => {
            const fieldAnswer = userAnswer[field.id]
            let isCorrect = false
            let correctText = ''

            switch (field.type) {
              case 'text': {
                const typed = (fieldAnswer || '').trim()
                const correct = (field.correct_answer || '').trim()
                isCorrect = field.case_sensitive
                  ? typed === correct
                  : typed.toLowerCase() === correct.toLowerCase()
                correctText = correct
                break
              }
              case 'dropdown':
                isCorrect = fieldAnswer === field.correct_option
                correctText = field.correct_option || ''
                break
              case 'checkbox': {
                const expected = field.correct_answer === 'true'
                isCorrect = fieldAnswer === expected
                correctText = expected ? 'Checked' : 'Unchecked'
                break
              }
            }
            if (!isCorrect) {
              incorrect.push({
                exercise: ex.title || 'PDF Worksheet',
                question: field.label || field.id,
                yourAnswer: fieldAnswer != null ? String(fieldAnswer) : '(chưa trả lời)',
                correctAnswer: correctText
              })
            }
          })
        })
        return
      }

      const questions = ex.content?.questions || []
      questions.forEach((q, qi) => {
        switch (ex.exercise_type) {
          case 'multiple_choice': {
            const userAnswer = exerciseAnswers?.[qi]
            if (userAnswer !== q.correct_answer) {
              const options = q.options || []
              incorrect.push({
                exercise: ex.title || 'Multiple Choice',
                question: q.question || `Câu ${qi + 1}`,
                yourAnswer: userAnswer != null ? (options[userAnswer] || userAnswer) : '(chưa trả lời)',
                correctAnswer: options[q.correct_answer] || q.correct_answer
              })
            }
            break
          }
          case 'fill_blank': {
            const blanks = q.blanks || []
            blanks.forEach((blank, bi) => {
              const typed = ((exerciseAnswers?.[qi] || {})[bi] || '').trim()
              const correctAnswers = splitAnswers(blank.answer)
              const isCorrect = blank.case_sensitive
                ? correctAnswers.some(a => typed === a)
                : correctAnswers.some(a => typed.toLowerCase() === a.toLowerCase())
              if (!isCorrect) {
                incorrect.push({
                  exercise: ex.title || 'Fill Blank',
                  question: q.text ? `${q.text.substring(0, 50)}...` : `Câu ${qi + 1}, ô ${bi + 1}`,
                  yourAnswer: typed || '(chưa trả lời)',
                  correctAnswer: correctAnswers[0] || '?'
                })
              }
            })
            break
          }
          case 'drag_drop': {
            const dropZones = q.drop_zones || []
            const correctOrder = q.correct_order || []
            const items = q.items || []
            const userPlacements = exerciseAnswers?.[qi] || {}

            dropZones.forEach((zone, zi) => {
              const studentItemId = userPlacements[zone.id]
              const correctItemId = correctOrder[zi]
              if (!studentItemId || studentItemId !== correctItemId) {
                const studentItem = items.find(it => it.id === studentItemId)
                const correctItem = items.find(it => it.id === correctItemId)
                incorrect.push({
                  exercise: ex.title || 'Drag & Drop',
                  question: zone.label || `Zone ${zi + 1}`,
                  yourAnswer: studentItem?.text || '(chưa trả lời)',
                  correctAnswer: correctItem?.text || '?'
                })
              }
            })
            break
          }
          case 'dropdown': {
            const dropdowns = q.dropdowns || []
            dropdowns.forEach((dd, di) => {
              const selected = ((exerciseAnswers?.[qi] || {})[di] || '').trim()
              const correct = (dd.correct_answer || '').trim()
              if (selected !== correct) {
                incorrect.push({
                  exercise: ex.title || 'Dropdown',
                  question: q.text ? `${q.text.substring(0, 50)}...` : `Câu ${qi + 1}, dropdown ${di + 1}`,
                  yourAnswer: selected || '(chưa trả lời)',
                  correctAnswer: correct
                })
              }
            })
            break
          }
          case 'ai_fill_blank': {
            const aiKey = `${ex.id}_${qi}`
            const aiResult = aiScores[aiKey]
            const isCorrect = aiResult ? aiResult.score >= 70 : false
            if (!isCorrect) {
              incorrect.push({
                exercise: ex.title || 'AI Fill Blank',
                question: q.question || `Câu ${qi + 1}`,
                yourAnswer: exerciseAnswers?.[qi] || '(chưa trả lời)',
                correctAnswer: (q.expected_answers || []).join(' / ') || '?',
                aiScore: aiResult || null
              })
            }
            break
          }
        }
      })
    })

    return incorrect
  }

  // Results screen
  if (results) {
    const tone = results.score >= 80
      ? { text: 'text-green-600', stroke: '#16a34a', message: 'Tuyệt vời! 🎉' }
      : results.score >= 50
        ? { text: 'text-yellow-600', stroke: '#ca8a04', message: 'Khá tốt! Cố gắng thêm nhé! 💪' }
        : { text: 'text-red-600', stroke: '#dc2626', message: 'Hãy thử lại nhé! 📚' }
    const incorrectDetails = getIncorrectDetails()
    const radius = 54
    const circumference = 2 * Math.PI * radius

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 pb-8">
        <div className="max-w-md mx-auto mt-6 space-y-4">
          {/* Score card */}
          <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900">
              {results.timedOut ? 'Hết giờ!' : 'Hoàn thành!'}
            </h2>
            {guestName && <p className="mt-1 text-sm text-gray-500">{guestName}</p>}

            <div className="relative mx-auto my-5 h-40 w-40">
              <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
                <circle cx="64" cy="64" r={radius} fill="none" strokeWidth="10" stroke="#e5e7eb" />
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  strokeWidth="10"
                  strokeLinecap="round"
                  stroke={tone.stroke}
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - results.score / 100)}
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div className={`absolute inset-0 flex items-center justify-center text-4xl font-bold ${tone.text}`}>
                {results.score}%
              </div>
            </div>

            <p className={`font-medium ${tone.text}`}>{tone.message}</p>

            <div className="mt-5 grid grid-cols-2 gap-3 text-left">
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Số câu đúng</p>
                <p className="text-lg font-bold text-gray-900">
                  {results.totalCorrect}/{results.totalQuestions}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Thời gian</p>
                <p className="flex items-center gap-1.5 text-lg font-bold text-gray-900">
                  <Clock size={16} className="text-gray-400" />
                  {formatTime(results.timeUsed)}
                </p>
              </div>
            </div>

            {session.is_test && (
              <p className={`mt-4 inline-block rounded-full px-4 py-1 text-sm font-semibold ${
                results.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {results.passed ? 'Đạt' : 'Chưa đạt'} (cần {session.passing_score || 70}%)
              </p>
            )}
          </div>

          {/* Incorrect answers */}
          {incorrectDetails.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <button
                onClick={() => setShowIncorrect(!showIncorrect)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <span className="font-medium text-gray-900 text-sm">
                    Các câu trả lời sai ({incorrectDetails.length})
                  </span>
                </div>
                {showIncorrect
                  ? <ChevronDown size={18} className="text-gray-400" />
                  : <ChevronRight size={18} className="text-gray-400" />
                }
              </button>

              {showIncorrect && (
                <div className="px-4 pb-4 space-y-2">
                  {incorrectDetails.map((item, i) => (
                    <div key={i} className="p-3 bg-red-50 rounded-lg text-sm">
                      <div className="font-medium text-gray-800 mb-1"><RichTextRenderer content={item.question} allowImages allowLinks /></div>
                      <p className="text-xs text-gray-500">{item.exercise}</p>
                      <div className="mt-2 space-y-1">
                        <div className="text-red-600 text-xs flex items-start gap-1">
                          <XCircle size={12} className="flex-shrink-0 mt-0.5" /><div>Bạn chọn: <RichTextRenderer content={item.yourAnswer} allowImages allowLinks /></div>
                        </div>
                        <div className="text-green-600 text-xs flex items-start gap-1">
                          <CheckCircle size={12} className="flex-shrink-0 mt-0.5" /><div>Đáp án đúng: <RichTextRenderer content={item.correctAnswer} allowImages allowLinks /></div>
                        </div>
                      </div>
                      {item.aiScore && (
                        <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-blue-700">Điểm AI: {Math.round(item.aiScore.score)}%</span>
                          </div>
                          <p className="text-xs text-gray-600">{item.aiScore.explanation}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Register CTA */}
          <div className="bg-white rounded-2xl shadow-sm border-2 border-blue-200 p-6 text-center">
            <UserPlus className="w-10 h-10 text-blue-600 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-1">Đăng ký tài khoản</h3>
            <p className="text-gray-500 text-sm mb-4">
              Tạo tài khoản để theo dõi tiến trình học tập và nhận XP!
            </p>
            <button
              onClick={() => navigate(REGISTER_PATH)}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <UserPlus size={18} /> Đăng ký ngay
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setResults(null)
                setAnswers({})
                setActiveTab(0)
                setShowInfo(true)
                setStartTime(null)
                setTimeRemaining(null)
                setSubmitting(false)
              }}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border-2 border-blue-600 text-blue-600 rounded-xl font-medium hover:bg-blue-50 transition-colors"
            >
              <RotateCcw size={16} /> Làm lại
            </button>
            <button
              onClick={goBack}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Chọn bài khác
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isLowTime = timeRemaining !== null && timeRemaining <= 60
  const hasTimer = session.is_test && timeRemaining !== null
  const hasAnswers = (ex) => Object.keys(answers[ex.id] || {}).length > 0
  const answeredCount = exercises.filter(hasAnswers).length
  const unansweredCount = exercises.length - answeredCount
  const isLastTab = activeTab >= exercises.length - 1

  const goToTab = (index) => {
    setActiveTab(index)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={goBack}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              aria-label="Quay lại"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{session.title}</h1>
              <p className="text-xs text-gray-500 truncate">
                {guestName} &bull; Đã làm {answeredCount}/{exercises.length} bài tập
              </p>
            </div>
          </div>
          {hasTimer && (
            <div className={`flex flex-shrink-0 items-center gap-2 px-3 py-1.5 rounded-xl font-mono text-lg font-bold ${
              isLowTime ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-blue-100 text-blue-700'
            }`}>
              <Clock size={18} />
              {formatTime(timeRemaining)}
            </div>
          )}
        </div>

        {/* Progress through the exercises */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${((activeTab + 1) / exercises.length) * 100}%` }}
          />
        </div>

        {/* Exercise tabs */}
        {exercises.length > 1 && (
          <div className="max-w-4xl mx-auto px-2 flex gap-1 overflow-x-auto">
            {exercises.map((ex, i) => {
              const isActive = i === activeTab
              const isAnswered = hasAnswers(ex)
              const label = exerciseTypeLabels[ex.exercise_type] || ex.exercise_type
              return (
                <button
                  key={ex.id}
                  onClick={() => goToTab(i)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-700 bg-blue-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    isAnswered
                      ? 'bg-green-500 text-white'
                      : isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-600'
                  }`}>
                    {isAnswered ? <CheckCircle size={12} /> : i + 1}
                  </span>
                  {ex.title || label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Exercise content */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {exercises.map((ex, i) => (
          <div key={ex.id} style={{ display: i === activeTab ? 'block' : 'none' }}>
            {renderExercise(ex)}
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="sticky bottom-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200 shadow-sm pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => goToTab(activeTab - 1)}
            disabled={activeTab === 0}
            className="flex items-center gap-1 px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} /> Trước
          </button>

          <span className="text-xs text-gray-500">
            Bài {activeTab + 1}/{exercises.length}
          </span>

          {!isLastTab ? (
            <button
              onClick={() => goToTab(activeTab + 1)}
              className="flex items-center gap-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Tiếp theo <ChevronRight size={18} />
            </button>
          ) : (
            <button
              onClick={() => setShowConfirmSubmit(true)}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Send size={18} /> Nộp bài
            </button>
          )}
        </div>
      </div>

      {/* Confirm submit modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nộp bài?</h3>
            <p className="text-gray-600 text-sm">
              Bạn chắc chắn muốn nộp bài? Sau khi nộp sẽ không sửa được câu trả lời.
            </p>
            {unansweredCount > 0 && (
              <p className="mt-3 rounded-xl bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                Bạn còn {unansweredCount} bài tập chưa làm.
              </p>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Làm tiếp
              </button>
              <button
                onClick={() => handleSubmit(false)}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {submitting ? (aiScoringInProgress ? 'AI đang chấm điểm...' : 'Đang nộp...') : 'Nộp bài'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GuestSessionRunner
