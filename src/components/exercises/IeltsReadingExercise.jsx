import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { ArrowLeft, CheckCircle, Clock, LayoutGrid, X } from 'lucide-react'
import IeltsInlineFillBlank from './IeltsInlineFillBlank'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import { useProgress } from '../../hooks/useProgress'
import { useFeedback } from '../../hooks/useFeedback'
import CelebrationScreen from '../../components/ui/CelebrationScreen'
import { splitAnswers } from '../../utils/splitAnswers'

const IeltsReadingExercise = () => {
  const [searchParams] = useSearchParams()
  const exerciseId = searchParams.get('exerciseId')
  const sessionId = searchParams.get('sessionId')
  const courseId = searchParams.get('courseId')
  const unitId = searchParams.get('unitId')
  const navigate = useNavigate()

  const handleBackNavigation = () => {
    const path = window.location.pathname;
    if (path.includes('/admin')) navigate('/admin/exercise-bank');
    else if (path.includes('/teacher')) navigate('/teacher/exercise-bank');
    else navigate('/study');
  };

  const { canCreateContent } = usePermissions()
  const isTeacher = canCreateContent()
  const { user } = useAuth()
  const { startExercise, completeExerciseWithXP } = useProgress()
  const { passGif } = useFeedback()
  const [result, setResult] = useState(null) // { correct, total, score }
  const [xpEarned, setXpEarned] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const [exercise, setExercise] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState({})
  const [fibAnswers, setFibAnswers] = useState({})
  const [timeLeft, setTimeLeft] = useState(60 * 60)
  const [showPalette, setShowPalette] = useState(true)
  const [highlightPopup, setHighlightPopup] = useState(null) // { x, y, savedRange }
  const [passageHtml, setPassageHtml] = useState('')
  const timerRef = useRef(null)
  const passageRef = useRef(null)
  const savedRangeRef = useRef(null)

  useEffect(() => {
    fetchExercise()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId])

  useEffect(() => {
    if (exerciseId && user && !isTeacher) startExercise(exerciseId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId, user])

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  // Hide highlight popup when clicking anywhere outside
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (e.target.closest('.highlight-toolbar-popup')) return
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setHighlightPopup(null)
      }
    }
    document.addEventListener('mousedown', handleGlobalClick)
    return () => document.removeEventListener('mousedown', handleGlobalClick)
  }, [])

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const fetchExercise = async () => {
    if (!exerciseId) { setError('No exercise ID provided'); setLoading(false); return }
    try {
      const { data, error: fetchErr } = await supabase
        .from('exercises').select('*').eq('id', exerciseId).single()
      if (fetchErr) throw fetchErr
      if (!data) throw new Error('Exercise not found')
      setExercise(data)
      setPassageHtml((data.content?.passage?.text_html || '').replace(/\n/g, '<br/>'))
    } catch (err) {
      console.error(err)
      setError('Failed to load exercise')
    } finally {
      setLoading(false)
    }
  }

  // Helper for color comparison
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgb(${r}, ${g}, ${b})`
  }

  const handlePassageMouseUp = () => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setHighlightPopup(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!passageRef.current?.contains(range.commonAncestorContainer)) return
    
    // Check active states
    passageRef.current.contentEditable = 'true'
    const activeColor = document.queryCommandValue('backColor')
    const isU = document.queryCommandState('underline')
    const isI = document.queryCommandState('italic')
    const isS = document.queryCommandState('strikeThrough')
    passageRef.current.contentEditable = 'false'

    const rect = range.getBoundingClientRect()
    savedRangeRef.current = range.cloneRange()
    setHighlightPopup({
      x: rect.left + rect.width / 2,
      y: rect.top + window.scrollY - 8,
      activeColor,
      isU,
      isI,
      isS
    })
  }

  const applyFormat = (command, value = null) => {
    if (!passageRef.current || !savedRangeRef.current) return

    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(savedRangeRef.current)

    // Make editable temporarily to use browser's native robust formatting
    passageRef.current.contentEditable = 'true'
    
    if (command === 'hiliteColor') {
      let applyValue = value
      try {
        const currentColor = document.queryCommandValue('backColor')
        if (currentColor === hexToRgb(value) || currentColor === value) {
          applyValue = 'transparent'
        }
      } catch (e) { 
        console.debug('Ignore color parsing error:', e)
      }
      document.execCommand('hiliteColor', false, applyValue) || document.execCommand('backColor', false, applyValue)
    } else {
      document.execCommand(command, false, value)
    }
    
    passageRef.current.contentEditable = 'false'

    // Add dataset attribute for double-click removal and hover effects
    const elements = passageRef.current.querySelectorAll('*')
    elements.forEach(el => {
      const isFormatNode = el.tagName === 'SPAN' || el.tagName === 'FONT' || el.tagName === 'I' || el.tagName === 'U' || el.tagName === 'STRIKE'
      if (isFormatNode && !el.dataset.highlight) {
        el.dataset.highlight = 'true'
        if (el.tagName === 'SPAN' || el.tagName === 'FONT') {
          el.style.borderRadius = '2px'
          el.style.padding = '0 1px'
        }
      }
    })

    setPassageHtml(passageRef.current.innerHTML)
    setHighlightPopup(null)
    sel.removeAllRanges()
    savedRangeRef.current = null
  }

  // Double-click on highlighted text removes the highlight
  const handlePassageDblClick = (e) => {
    const target = e.target.closest?.('[data-highlight="true"]')
    if (!target) return
    const fragment = document.createDocumentFragment()
    while (target.firstChild) fragment.appendChild(target.firstChild)
    target.parentNode.replaceChild(fragment, target)
    if (passageRef.current) setPassageHtml(passageRef.current.innerHTML)
  }

  const handleAnswerChange = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  const backToSession = () => {
    if (sessionId && unitId && courseId) {
      navigate(`/study/course/${courseId}/unit/${unitId}/session/${sessionId}`)
    } else {
      handleBackNavigation()
    }
  }

  const gradeAnswers = () => {
    const mcQuestions = exercise.content?.questions || []
    const fibQuestions = exercise.content?.fillBlankQuestions || []
    let correct = 0
    let total = 0

    mcQuestions.forEach((q, idx) => {
      total++
      if (answers[q.id || `q_${idx}`] === q.correct_answer) correct++
    })

    fibQuestions.forEach((q, qIdx) => {
      q.blanks?.forEach((blank, bIdx) => {
        total++
        const rawUserAns = (fibAnswers[`${qIdx}-${bIdx}`] || '').trim()
        const userAnswer = rawUserAns.replace(/\s+/g, ' ')
        const accepted = splitAnswers(blank.answer).map(a => a.replace(/\s+/g, ' '))
        const isCorrect = blank.case_sensitive
          ? accepted.some(a => userAnswer === a)
          : accepted.some(a => userAnswer.toLowerCase() === a.toLowerCase())
        if (isCorrect) correct++
      })
    })

    return { correct, total, score: total ? Math.round((correct / total) * 100) : 0 }
  }

  const handleSubmit = async () => {
    if (submitting || !window.confirm('Are you sure you want to submit your answers?')) return
    clearInterval(timerRef.current)
    setSubmitting(true)
    const graded = gradeAnswers()
    setResult(graded)

    if (user && !isTeacher) {
      try {
        const baseXP = exercise.xp_reward || 10
        const bonusXP = graded.score >= 95 ? Math.round(baseXP * 0.5) : graded.score >= 90 ? Math.round(baseXP * 0.3) : 0
        const res = await completeExerciseWithXP(exerciseId, baseXP + bonusXP, {
          score: graded.score,
          max_score: 100,
          time_spent: 60 * 60 - timeLeft
        })
        if (res?.xpAwarded > 0) setXpEarned(res.xpAwarded)
      } catch (err) {
        console.error('Failed to save IELTS Reading progress:', err)
      }
    }
    setSubmitting(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Loading exercise...</p>
      </div>
    </div>
  )
  if (error) return <div className="text-red-500 text-center mt-10">{error}</div>
  if (!exercise) return null

  const content = exercise.content || {}
  const passage = content.passage || {}
  const questions = content.questions || []
  const fillBlankQuestions = content.fillBlankQuestions || []
  const mcCount = questions.length
  const isUrgent = timeLeft < 5 * 60

  // Build the Question Palette
  const palette = []
  questions.forEach((q, idx) => {
    const qId = q.id || `q_${idx}`
    palette.push({
      num: idx + 1,
      isAnswered: answers[qId] !== undefined,
      domId: `question-${idx + 1}`
    })
  })
  
  let currentNum = mcCount + 1
  fillBlankQuestions.forEach((q, qIdx) => {
    q.blanks?.forEach((blank, bIdx) => {
      const key = `${qIdx}-${bIdx}`
      palette.push({
        num: currentNum,
        isAnswered: !!fibAnswers[key] && fibAnswers[key].trim() !== '',
        domId: `question-${currentNum}`
      })
      currentNum++
    })
  })

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 overflow-hidden overscroll-none">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={backToSession} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{exercise.title}</h1>
            <p className="text-xs text-gray-500">IELTS Reading Practice</p>
          </div>
        </div>

        <div className="flex items-center gap-3 relative">
          {/* Question Palette Toggle */}
          <button
            onClick={() => setShowPalette(!showPalette)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all border ${
              showPalette ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            {palette.filter(p => p.isAnswered).length}/{palette.length}
          </button>

          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-bold text-sm ${
            isUrgent ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-700'
          }`}>
            <Clock className="w-4 h-4" />
            <span>{formatTime(timeLeft)}</span>
          </div>
          
          <button
            onClick={handleSubmit}
            disabled={submitting || !!result}
            className="flex items-center gap-2 disabled:opacity-60 bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold text-sm hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
          >
            <CheckCircle className="w-4 h-4" />
            Submit Test
          </button>
        </div>
      </header>

      {/* Split Pane */}
      <div className="flex-1 flex overflow-hidden overscroll-none">

        {/* Left: Passage */}
        <div
          className="w-1/2 border-r border-gray-200 bg-white overflow-y-auto overscroll-none"
          onMouseUp={handlePassageMouseUp}
          onDoubleClick={handlePassageDblClick}
        >
          {/* CSS for highlight hover effect */}
          <style>{`
            [data-highlight="true"] {
              cursor: pointer;
              position: relative;
            }
            [data-highlight="true"]:hover {
              filter: brightness(0.93);
            }
          `}</style>
          <div className="p-8 md:p-10 max-w-2xl mx-auto">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6">
              <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">Reading Passage</p>
              {(mcCount + fillBlankQuestions.length) > 0 && (
                <p className="text-xs text-blue-600 mt-0.5">
                  You should spend about 20 minutes on Questions 1–{mcCount + fillBlankQuestions.reduce((s, q) => s + (q.blanks?.length || 0), 0)}.
                </p>
              )}
            </div>
            {passage.title && (
              <h2 className="text-2xl font-bold text-gray-900 mb-6">{passage.title}</h2>
            )}
            {passageHtml ? (
              <div
                ref={passageRef}
                className="text-gray-800 leading-relaxed text-base select-text cursor-text"
                dangerouslySetInnerHTML={{ __html: passageHtml }}
              />
            ) : (
              <div className="text-center text-gray-500 italic py-20">
                No reading passage provided for this exercise.
              </div>
            )}
          </div>
        </div>

        {/* Highlight Toolbar */}
        {highlightPopup && (
          <div
            className="highlight-toolbar-popup fixed z-[100] transform -translate-x-1/2"
            style={{ left: highlightPopup.x, top: highlightPopup.y - 60 }}
            onMouseDown={e => e.preventDefault()}
          >
            <div className="bg-gray-800 rounded-xl shadow-2xl px-3 py-2 flex items-center gap-1.5 border border-gray-700">
              {/* Color swatches */}
              {[
                { color: '#fef08a', label: 'Vàng' },
                { color: '#fbcfe8', label: 'Hồng' },
                { color: '#bfdbfe', label: 'Xanh dương' },
                { color: '#bbf7d0', label: 'Xanh lá' },
              ].map(({ color, label }) => {
                const isActive = highlightPopup.activeColor === hexToRgb(color) || highlightPopup.activeColor === color
                return (
                  <button
                    key={color}
                    title={label}
                    onClick={() => applyFormat('hiliteColor', color)}
                    className="relative w-5 h-5 rounded border-2 border-white/30 hover:scale-125 transition-transform shadow"
                    style={{ backgroundColor: color }}
                  >
                    {isActive && <div className="absolute -top-1.5 left-0 right-0 h-[2.5px] bg-red-400 rounded-full" />}
                  </button>
                )
              })}
              <div className="w-px h-4 bg-gray-600 mx-1" />
              {/* Underline */}
              <button
                title="Gạch chân"
                onClick={() => applyFormat('underline')}
                className="relative text-blue-300 hover:text-white text-sm font-bold px-1.5 underline transition-colors"
              >
                U
                {highlightPopup.isU && <div className="absolute -top-1 left-1.5 right-1.5 h-[2.5px] bg-red-400 rounded-full" />}
              </button>
              {/* Italic */}
              <button
                title="In nghiêng"
                onClick={() => applyFormat('italic')}
                className="relative text-purple-300 hover:text-white text-sm font-bold italic px-1.5 transition-colors"
              >
                I
                {highlightPopup.isI && <div className="absolute -top-1 left-1.5 right-1.5 h-[2.5px] bg-red-400 rounded-full" />}
              </button>
              {/* Strikethrough */}
              <button
                title="Gạch ngang"
                onClick={() => applyFormat('strikeThrough')}
                className="relative text-gray-300 hover:text-white text-sm font-bold px-1.5 line-through transition-colors"
              >
                S
                {highlightPopup.isS && <div className="absolute -top-1 left-1.5 right-1.5 h-[2.5px] bg-red-400 rounded-full" />}
              </button>
            </div>
            {/* Arrow pointing down */}
            <div className="flex justify-center">
              <div className="w-2.5 h-2.5 bg-gray-800 rotate-45 -mt-1.5 border-r border-b border-gray-700" />
            </div>
          </div>
        )}

        {/* Right: Questions */}
        <div className="w-1/2 bg-gray-50 overflow-y-auto overscroll-none">
          <div className="p-6 max-w-2xl mx-auto space-y-5 pb-20">

            {questions.length === 0 && fillBlankQuestions.length === 0 && (
              <div className="text-center text-gray-500 py-10 bg-white rounded-lg border border-gray-200">
                No questions have been added yet.
              </div>
            )}

            {(questions.length > 0 || fillBlankQuestions.length > 0) && (
              <div className="space-y-3">
                {/* Single unified header */}
                <div className="bg-gray-100 border border-gray-200 rounded-xl px-5 py-3">
                  <p className="text-sm font-bold text-gray-800">
                    Questions 1–{mcCount + fillBlankQuestions.reduce((s, q) => s + (q.blanks?.length || 0), 0)}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Read the passage and answer all questions below.
                  </p>
                </div>

                {/* Multiple Choice questions */}
                {questions.map((q, index) => {
                  const qId = q.id || `q_${index}`
                  return (
                  <div id={`question-${index + 1}`} key={qId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 scroll-mt-24">
                    <div className="flex items-start gap-3 mb-4">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-sm">
                        {index + 1}
                      </span>
                      <div className="text-sm text-gray-900 font-medium leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: q.question }} />
                    </div>
                    <div className="space-y-2 ml-10">
                      {q.options?.map((opt, optIdx) => {
                        const letter = ['A', 'B', 'C', 'D'][optIdx] || optIdx
                        const selected = answers[qId] === optIdx
                        return (
                          <div
                            key={optIdx}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAnswerChange(qId, optIdx) }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAnswerChange(qId, optIdx) } }}
                            className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all select-none ${
                              selected ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-400' : 'border-gray-200 hover:bg-gray-50 hover:border-blue-300'
                            }`}
                          >
                            <span className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                              selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-400 text-gray-500'
                            }`}>{letter}</span>
                            <span className="text-sm text-gray-700 leading-relaxed">{opt}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  )
                })}

                {/* Fill in the Blank — inline IELTS style, continues numbering after MC */}
                {fillBlankQuestions.length > 0 && (
                  <IeltsInlineFillBlank
                    questions={fillBlankQuestions}
                    onAnswersChange={setFibAnswers}
                    isTeacher={isTeacher}
                    startNumber={mcCount + 1}
                    fibIntro={content.fibIntro || ''}
                    fibInstruction={content.fibInstruction || ''}
                    hideHeader={true}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Question Palette (Floating Top Right) */}
      {palette.length > 0 && showPalette && (
        <div className="fixed top-20 right-6 bg-white rounded-xl shadow-xl border border-gray-200 p-3 w-[340px] z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between mb-2 border-b border-gray-100 pb-2">
            <p className="text-sm font-bold text-gray-800">Danh sách câu hỏi</p>
            <button onClick={() => setShowPalette(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-10 gap-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
            {palette.map(p => (
              <button
                key={p.num}
                onClick={() => {
                  const el = document.getElementById(p.domId)
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
                className={`w-full aspect-square rounded flex items-center justify-center text-xs font-semibold transition-all
                  ${p.isAnswered 
                    ? 'bg-blue-600 text-white shadow-sm border-transparent' 
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-blue-400 hover:text-blue-600'
                  }
                `}
              >
                {p.num}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4">
          <CelebrationScreen
            score={result.score}
            correctAnswers={result.correct}
            totalQuestions={result.total}
            passThreshold={80}
            xpAwarded={xpEarned}
            passGif={passGif}
            isRetryMode={false}
            wrongQuestionsCount={result.total - result.correct}
            onBackToList={backToSession}
            exerciseId={exerciseId}
          />
        </div>
      )}
    </div>
  )
}

export default IeltsReadingExercise
