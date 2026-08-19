import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import MultipleChoiceExercise from '../exercises/MultipleChoiceExercise'
import FillBlankExercise from '../exercises/FillBlankExercise'
import { splitAnswers } from '../../utils/splitAnswers'
import DragDropExercise from '../exercises/DragDropExercise'
import DropdownExercise from '../exercises/DropdownExercise'
import ImageHotspotExercise from '../exercises/ImageHotspotExercise'
import AIFillBlankExercise from '../exercises/AIFillBlankExercise'
import PDFWorksheetExercise from '../exercises/PDFWorksheetExercise'
import { Clock, AlertTriangle, Send, CheckCircle, XCircle, ChevronRight, ChevronDown, FileText, Play, ArrowLeft, UserPlus } from 'lucide-react'
import RichTextRenderer from '../ui/RichTextRenderer'
import { callAIScoring } from '../../utils/aiScoringService'
import { REGISTER_PATH } from '../../config/registration'

const exerciseTypeLabels = {
  multiple_choice: 'Multiple Choice',
  fill_blank: 'Fill Blank',
  drag_drop: 'Drag & Drop',
  dropdown: 'Dropdown',
  image_hotspot: 'Image Hotspot',
  ai_fill_blank: 'AI Fill Blank',
  pdf_worksheet: 'PDF Worksheet'
}

const GuestSessionRunner = () => {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')
  const guestId = searchParams.get('guestId')
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

  const goBack = () => {
    navigate('/guest')
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
      case 'ai_fill_blank':
        return <AIFillBlankExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} />
      case 'pdf_worksheet':
        return <PDFWorksheetExercise key={ex.id} testMode={true} exerciseData={ex} onAnswersCollected={onCollect} />
      default:
        return <p className="text-gray-500">Unsupported exercise type: {ex.exercise_type}</p>
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Khong tim thay bai hoc</p>
          <button onClick={goBack} className="mt-4 text-blue-600 hover:underline">
            Quay lai
          </button>
        </div>
      </div>
    )
  }

  // Info screen before starting
  if (showInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-md mx-auto mt-12">
          <div className="rounded-2xl p-8 bg-white border-2 border-gray-200 shadow-sm">
            <FileText className="w-14 h-14 text-blue-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">{session.title}</h2>
            {guestName && (
              <p className="text-center text-gray-500 text-sm mb-6">Xin chao, {guestName}!</p>
            )}

            <div className="space-y-3 mb-8">
              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">So bai tap</span>
                <span className="text-sm font-bold text-gray-900">{exercises.length}</span>
              </div>
              {session.is_test && session.time_limit_minutes && (
                <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Thoi gian</span>
                  <span className="text-sm font-bold text-gray-900">{session.time_limit_minutes} phut</span>
                </div>
              )}
              {session.description && (
                <div className="py-3 px-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">{session.description}</p>
                </div>
              )}
            </div>

            <button
              onClick={beginSession}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              <Play className="w-5 h-5" />
              Bat dau
            </button>

            <button
              onClick={goBack}
              className="w-full mt-3 px-6 py-3 text-gray-500 text-sm hover:text-gray-700 transition-colors flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Quay lai
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
              yourAnswer: selectedLabel?.text || '(khong tra loi)',
              correctAnswer: correctLabel?.text || '?'
            })
          }
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
                yourAnswer: fieldAnswer != null ? String(fieldAnswer) : '(khong tra loi)',
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
                question: q.question || `Cau ${qi + 1}`,
                yourAnswer: userAnswer != null ? (options[userAnswer] || userAnswer) : '(khong tra loi)',
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
                  question: q.text ? `${q.text.substring(0, 50)}...` : `Cau ${qi + 1}, o ${bi + 1}`,
                  yourAnswer: typed || '(khong tra loi)',
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
                  yourAnswer: studentItem?.text || '(khong tra loi)',
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
                  question: q.text ? `${q.text.substring(0, 50)}...` : `Cau ${qi + 1}, dropdown ${di + 1}`,
                  yourAnswer: selected || '(khong tra loi)',
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
                question: q.question || `Cau ${qi + 1}`,
                yourAnswer: exerciseAnswers?.[qi] || '(khong tra loi)',
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
    const scoreColor = results.score >= 80 ? 'text-green-600' : results.score >= 50 ? 'text-yellow-600' : 'text-red-600'
    const scoreBg = results.score >= 80 ? 'bg-green-50 border-green-200' : results.score >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'
    const incorrectDetails = getIncorrectDetails()

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-md mx-auto mt-8 space-y-4">
          {/* Score card */}
          <div className={`rounded-2xl p-8 text-center border-2 ${scoreBg}`}>
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
              results.score >= 80 ? 'bg-green-100' : results.score >= 50 ? 'bg-yellow-100' : 'bg-red-100'
            }`}>
              <CheckCircle className={`w-10 h-10 ${scoreColor}`} />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900">Hoan thanh!</h2>
            {results.timedOut && (
              <p className="text-orange-600 text-sm mb-2 flex items-center justify-center gap-1">
                <Clock size={14} /> Het thoi gian
              </p>
            )}

            <div className={`text-5xl font-bold my-4 ${scoreColor}`}>
              {results.score}%
            </div>

            <p className="text-gray-600 text-sm">
              Dung {results.totalCorrect}/{results.totalQuestions} cau
            </p>

            {results.score >= 80 ? (
              <p className="text-green-600 font-medium mt-2">Tuyet voi! 🎉</p>
            ) : results.score >= 50 ? (
              <p className="text-yellow-600 font-medium mt-2">Kha tot! Co gang them nhe! 💪</p>
            ) : (
              <p className="text-red-600 font-medium mt-2">Hay thu lai nhe! 📚</p>
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
                    Cau tra loi sai ({incorrectDetails.length})
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
                          <XCircle size={12} className="flex-shrink-0 mt-0.5" /><div>Ban chon: <RichTextRenderer content={item.yourAnswer} allowImages allowLinks /></div>
                        </div>
                        <div className="text-green-600 text-xs flex items-start gap-1">
                          <CheckCircle size={12} className="flex-shrink-0 mt-0.5" /><div>Dap an dung: <RichTextRenderer content={item.correctAnswer} allowImages allowLinks /></div>
                        </div>
                      </div>
                      {item.aiScore && (
                        <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-blue-700">AI Score: {Math.round(item.aiScore.score)}%</span>
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
            <h3 className="font-bold text-gray-900 mb-1">Dang ky tai khoan</h3>
            <p className="text-gray-500 text-sm mb-4">
              Tao tai khoan de theo doi tien trinh hoc tap va nhan XP!
            </p>
            <button
              onClick={() => navigate(REGISTER_PATH)}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <UserPlus size={18} /> Dang ky ngay
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
              className="flex-1 px-6 py-3 border-2 border-blue-600 text-blue-600 rounded-xl font-medium hover:bg-blue-50 transition-colors"
            >
              Lam lai
            </button>
            <button
              onClick={goBack}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Chon bai khac
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isLowTime = timeRemaining !== null && timeRemaining <= 60
  const hasTimer = session.is_test && timeRemaining !== null

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={goBack}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{session.title}</h1>
              <p className="text-xs text-gray-500">
                {guestName} &bull; {exercises.length} bai tap
              </p>
            </div>
          </div>
          {hasTimer && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-bold ${
              isLowTime ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-blue-100 text-blue-700'
            }`}>
              <Clock size={18} />
              {formatTime(timeRemaining)}
            </div>
          )}
        </div>

        {/* Exercise tabs */}
        {exercises.length > 1 && (
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
      <div className="sticky bottom-0 bg-white border-t border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-center">
          {activeTab < exercises.length - 1 ? (
            <button
              onClick={() => setActiveTab(prev => prev + 1)}
              className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Tiep theo <ChevronRight size={18} />
            </button>
          ) : (
            <button
              onClick={() => setShowConfirmSubmit(true)}
              disabled={submitting}
              className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Send size={18} /> Nop bai
            </button>
          )}
        </div>
      </div>

      {/* Confirm submit modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nop bai?</h3>
            <p className="text-gray-600 text-sm mb-4">
              Ban chac chan muon nop bai? Hay kiem tra lai cac cau tra loi.
            </p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Huy
              </button>
              <button
                onClick={() => handleSubmit(false)}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {submitting ? (aiScoringInProgress ? 'AI dang cham diem...' : 'Dang nop...') : 'Nop bai'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GuestSessionRunner
