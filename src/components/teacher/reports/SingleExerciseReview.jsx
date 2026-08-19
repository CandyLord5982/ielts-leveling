import React from 'react'
import { CheckCircle, XCircle, Edit3, RefreshCw } from 'lucide-react'

// --- Type-specific renderers ---

const MultipleChoiceReview = ({ question, attempt }) => {
  const options = question.options || []
  const correct = question.correct_answer

  // Try index first, then fall back to matching by option text
  let selected = typeof attempt.selected_answer === 'number'
    ? attempt.selected_answer
    : parseInt(attempt.selected_answer)
  if (isNaN(selected)) {
    selected = options.findIndex(opt => opt === attempt.selected_answer)
  }

  if (!options.length) return <GenericReview attempt={attempt} />

  return (
    <div className="space-y-2">
      {question.question && (
        <div className="text-sm text-gray-800 leading-relaxed mb-2"
          dangerouslySetInnerHTML={{ __html: question.question }} />
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((opt, i) => {
          const isCorrect = i === correct
          const isSelected = i === selected
          let cls = 'border-gray-200 bg-gray-50'
          if (isCorrect) cls = 'border-green-400 bg-green-50'
          else if (isSelected) cls = 'border-red-400 bg-red-50'
          return (
            <div key={i} className={`flex items-center gap-3 px-3 py-2 border rounded-lg ${cls}`}>
              <div className="shrink-0">
                {isCorrect
                  ? <CheckCircle className="w-4 h-4 text-green-500" />
                  : isSelected
                    ? <XCircle className="w-4 h-4 text-red-500" />
                    : <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                }
              </div>
              <span className={`text-sm flex-1 ${isCorrect ? 'text-green-800 font-medium' : isSelected ? 'text-red-800' : 'text-gray-700'}`}>
                {opt}
              </span>
              {isCorrect && isSelected && <span className="text-xs text-green-600 font-medium shrink-0">Your answer ✓</span>}
              {isCorrect && !isSelected && <span className="text-xs text-green-600 font-medium shrink-0">Correct</span>}
              {isSelected && !isCorrect && <span className="text-xs text-red-600 font-medium shrink-0">Your answer</span>}
            </div>
          )
        })}
      </div>
      {question.explanation && (
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800 mt-2">
          <strong>Explanation:</strong> {question.explanation}
        </div>
      )}
    </div>
  )
}

const FillBlankReview = ({ question, attempt }) => {
  // selected_answer stored as "ans1, ans2, ans3" (one per blank)
  const selectedParts = (attempt.selected_answer || '').split(', ')
  const correctParts = (attempt.correct_answer || '').split(', ')

  const isBlankCorrect = (ans, correctRaw) =>
    (correctRaw || '').split('|').some(a => a.trim().toLowerCase() === (ans || '').trim().toLowerCase())

  // Reconstruct sentence inline if question has _____ markers
  const parts = (question.question || '').split(/_{3,}/)
  if (parts.length > 1) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-800 leading-loose">
          {parts.map((part, i) => {
            const studentAns = selectedParts[i]
            const correctAns = correctParts[i]
            if (i >= parts.length - 1) return <span key={i} dangerouslySetInnerHTML={{ __html: part }} />
            const ok = isBlankCorrect(studentAns, correctAns)
            return (
              <React.Fragment key={i}>
                <span dangerouslySetInnerHTML={{ __html: part }} />
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded font-medium ${
                  ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {studentAns || '—'}
                  {!ok && correctAns && (
                    <span className="text-green-700">→ {correctAns.split('|')[0].trim()}</span>
                  )}
                  {ok
                    ? <CheckCircle size={11} className="text-green-500 shrink-0" />
                    : <XCircle size={11} className="text-red-500 shrink-0" />
                  }
                </span>
              </React.Fragment>
            )
          })}
        </p>
        {question.explanation && (
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
            <strong>Explanation:</strong> {question.explanation}
          </div>
        )}
      </div>
    )
  }

  // Fallback list
  return (
    <div className="space-y-2">
      {question.question && <p className="text-sm text-gray-700 leading-relaxed">{question.question}</p>}
      {selectedParts.map((ans, i) => {
        const correctAns = correctParts[i]
        const ok = isBlankCorrect(ans, correctAns)
        return (
          <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            {ok ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
            <span className={`font-medium ${ok ? 'text-green-800' : 'text-red-800'}`}>{ans || '—'}</span>
            {!ok && correctAns && <><span className="text-gray-400">→</span><span className="font-medium text-green-800">{correctAns.split('|')[0].trim()}</span></>}
          </div>
        )
      })}
    </div>
  )
}

const FillBlankReviewWithOverride = ({ question, attempt, blankAttempts, onOverride, overriding }) => {
  const selectedParts = (attempt.selected_answer || '').split(', ')
  const correctParts = (attempt.correct_answer || '').split(', ')
  const hasPerBlankAttempts = blankAttempts && blankAttempts.length > 0
  // For old format (single DB row), use the attempt itself for override
  const getOverrideTarget = (i) => hasPerBlankAttempts ? blankAttempts[i] : attempt

  const isBlankCorrect = (ans, correctRaw) =>
    (correctRaw || '').split('|').some(a => a.trim().toLowerCase() === (ans || '').trim().toLowerCase())

  const parts = (question.question || '').split(/_{3,}/)

  if (parts.length > 1) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-800 leading-loose">
          {parts.map((part, i) => {
            const studentAns = selectedParts[i]
            const correctAns = correctParts[i]
            if (i >= parts.length - 1) return <span key={i} dangerouslySetInnerHTML={{ __html: part }} />
            const ok = isBlankCorrect(studentAns, correctAns)
            const target = getOverrideTarget(i)
            return (
              <React.Fragment key={i}>
                <span dangerouslySetInnerHTML={{ __html: part }} />
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded font-medium ${
                  ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {studentAns || '—'}
                  {!ok && correctAns && (
                    <span className="text-green-700 ml-1">→ {correctAns.split('|')[0].trim()}</span>
                  )}
                  {ok
                    ? <CheckCircle size={11} className="text-green-500 shrink-0" />
                    : <XCircle size={11} className="text-red-500 shrink-0" />
                  }
                  {target && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onOverride(target.id, target.is_correct) }}
                      disabled={overriding === target.id}
                      className="ml-1 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                      title={hasPerBlankAttempts ? (ok ? 'Mark incorrect' : 'Mark correct') : 'Override entire question'}
                    >
                      {overriding === target.id
                        ? <RefreshCw size={10} className="animate-spin" />
                        : <Edit3 size={10} />
                      }
                    </button>
                  )}
                </span>
              </React.Fragment>
            )
          })}
        </p>
        {question.explanation && (
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
            <strong>Explanation:</strong> {question.explanation}
          </div>
        )}
      </div>
    )
  }

  // Fallback list with override buttons
  return (
    <div className="space-y-2">
      {question.question && <p className="text-sm text-gray-700 leading-relaxed">{question.question}</p>}
      {selectedParts.map((ans, i) => {
        const correctAns = correctParts[i]
        const ok = isBlankCorrect(ans, correctAns)
        const target = getOverrideTarget(i)
        return (
          <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            {ok ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
            <span className={`font-medium ${ok ? 'text-green-800' : 'text-red-800'}`}>{ans || '—'}</span>
            {!ok && correctAns && <><span className="text-gray-400">→</span><span className="font-medium text-green-800">{correctAns.split('|')[0].trim()}</span></>}
            {target && (
              <button
                onClick={() => onOverride(target.id, target.is_correct)}
                disabled={overriding === target.id}
                className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
              >
                {overriding === target.id
                  ? <RefreshCw size={11} className="animate-spin" />
                  : <Edit3 size={11} />
                }
                {ok ? 'Mark incorrect' : 'Mark correct'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

const DragDropReview = ({ question, attempt }) => {
  const items = question.items || []
  const dropZones = question.drop_zones || []
  const correctOrder = question.correct_order || []

  const getItemText = (itemId) => items.find(it => it.id === itemId)?.text || itemId

  let userPlacements = {}
  try {
    userPlacements = typeof attempt.selected_answer === 'object'
      ? attempt.selected_answer
      : JSON.parse(attempt.selected_answer || '{}')
  } catch { userPlacements = {} }

  const hasDropZonePlaceholders = question.question?.includes('[DROP_ZONE_')

  if (hasDropZonePlaceholders) {
    const parts = question.question.split(/\[DROP_ZONE_([^\]]+)\]/)
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-800 leading-loose">
          {parts.map((part, i) => {
            if (i % 2 === 0) return <span key={i} dangerouslySetInnerHTML={{ __html: part }} />
            const zoneId = part
            const zoneIndex = dropZones.findIndex(z => z.id === zoneId)
            const studentItemId = userPlacements[zoneId]
            const correctItemId = correctOrder[zoneIndex]
            const isCorrect = studentItemId === correctItemId
            return (
              <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded font-medium ${
                isCorrect ? 'bg-green-100 text-green-800' : studentItemId ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-500'
              }`}>
                {studentItemId ? getItemText(studentItemId) : '—'}
                {!isCorrect && correctItemId && <span className="text-green-700">→ {getItemText(correctItemId)}</span>}
                {isCorrect ? <CheckCircle size={11} className="text-green-500 shrink-0" /> : <XCircle size={11} className="text-red-500 shrink-0" />}
              </span>
            )
          })}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {question.question && <p className="text-sm text-gray-800 mb-2">{question.question}</p>}
      <div className="space-y-1.5">
        {dropZones.map((zone, i) => {
          const studentItemId = userPlacements[zone.id]
          const correctItemId = correctOrder[i]
          const isCorrect = studentItemId === correctItemId
          return (
            <div key={zone.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
              isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
            }`}>
              {isCorrect ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
              <span className="text-gray-500 shrink-0">{zone.label || `Zone ${i + 1}`}:</span>
              <span className={`font-medium ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>
                {studentItemId ? getItemText(studentItemId) : '(empty)'}
              </span>
              {!isCorrect && correctItemId && (
                <><span className="text-gray-400">→</span><span className="font-medium text-green-800">{getItemText(correctItemId)}</span></>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const DragDropZoneReview = ({ question, attempt, zoneIndex }) => {
  const items = question.items || []
  const dropZones = question.drop_zones || []
  const zone = dropZones[zoneIndex]
  const getItemText = (itemId) => items.find(it => it.id === itemId)?.text || itemId
  const studentItemId = attempt.selected_answer
  const correctItemId = attempt.correct_answer
  const isCorrect = attempt.is_correct

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
      isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
    }`}>
      {isCorrect ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
      <span className="text-gray-500 shrink-0">{zone?.label || `Blank ${zoneIndex + 1}`}:</span>
      <span className={`font-medium ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>
        {studentItemId ? getItemText(studentItemId) : '(empty)'}
      </span>
      {!isCorrect && correctItemId && (
        <><span className="text-gray-400">→</span><span className="font-medium text-green-800">{getItemText(correctItemId)}</span></>
      )}
    </div>
  )
}

const DropdownReview = ({ question, attempt }) => {
  const boldBrackets = (text) => text.replace(/(\[[^\]]+\])/g, '<strong>$1</strong>')
  const selectedParts = (attempt.selected_answer || '').split(', ')

  return (
    <div className="space-y-2">
      {question.question && (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: boldBrackets(question.question) }} />
      )}
      <div className="space-y-1.5">
        {(question.dropdowns || []).map((dd, i) => {
          const studentAns = (selectedParts[i] || '').trim()
          const correctAns = (dd.correct_answer || '').trim()
          const isCorrect = studentAns === correctAns
          return (
            <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              {isCorrect ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
              {dd.label && <span className="text-gray-500">{dd.label}:</span>}
              <span className={`font-medium ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>{studentAns || '(none)'}</span>
              {!isCorrect && correctAns && <><span className="text-gray-400">→</span><span className="font-medium text-green-800">{correctAns}</span></>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const GenericReview = ({ attempt }) => {
  const fmt = (val) => {
    if (!val) return '(no answer)'
    if (typeof val === 'object') return JSON.stringify(val, null, 2)
    return String(val)
  }
  return (
    <div className="space-y-2">
      <div className={`p-3 rounded-lg border ${attempt.is_correct ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
        <span className="text-xs font-medium text-gray-500 block mb-1">Your answer</span>
        <pre className="text-sm whitespace-pre-wrap font-sans">{fmt(attempt.selected_answer)}</pre>
      </div>
      {!attempt.is_correct && attempt.correct_answer && (
        <div className="p-3 rounded-lg border border-green-300 bg-green-50">
          <span className="text-xs font-medium text-green-700 block mb-1">Correct answer</span>
          <pre className="text-sm whitespace-pre-wrap font-sans">{fmt(attempt.correct_answer)}</pre>
        </div>
      )}
    </div>
  )
}

// --- Main component ---

const SingleExerciseReview = ({ exercise, questionAttempts, onOverride, overriding }) => {
  const questions = exercise?.content?.questions || []
  const type = exercise?.exercise_type

  const reviewItems = []
  questions.forEach(q => {
    if (type === 'drag_drop') {
      const dropZones = q.drop_zones || []
      // Check for per-zone attempts (new format: {q.id}_zone0, _zone1, ...)
      const zoneAttempts = dropZones.map((zone, zi) =>
        questionAttempts.find(a => a.question_id === `${q.id}_zone${zi}`)
      )
      if (zoneAttempts.some(a => a)) {
        // New format: one attempt per zone
        zoneAttempts.forEach((attempt, zi) => {
          if (attempt) {
            reviewItems.push({ question: q, attempt, zoneIndex: zi })
          }
        })
      } else {
        // Old format: one attempt per question
        const attempt = questionAttempts.find(a => a.question_id === q.id)
        if (attempt) {
          // Expand old attempt into per-zone virtual items
          let userPlacements = {}
          try {
            userPlacements = typeof attempt.selected_answer === 'object'
              ? attempt.selected_answer
              : JSON.parse(attempt.selected_answer || '{}')
          } catch { userPlacements = {} }
          let correctOrder = []
          try {
            correctOrder = typeof attempt.correct_answer === 'object'
              ? attempt.correct_answer
              : JSON.parse(attempt.correct_answer || '[]')
          } catch { correctOrder = [] }

          if (typeof userPlacements === 'object' && !Array.isArray(userPlacements)) {
            dropZones.forEach((zone, zi) => {
              const studentItemId = userPlacements[zone.id]
              const correctItemId = Array.isArray(correctOrder) ? correctOrder[zi] : null
              reviewItems.push({
                question: q,
                attempt: {
                  ...attempt,
                  selected_answer: studentItemId || null,
                  correct_answer: correctItemId || null,
                  is_correct: !!(studentItemId && studentItemId === correctItemId)
                },
                zoneIndex: zi
              })
            })
          } else {
            reviewItems.push({ question: q, attempt })
          }
        }
      }
    } else if (type === 'fill_blank') {
      const blankAttempts = questionAttempts
        .filter(a => a.question_id === q.id)
        .sort((a, b) => (a.question_index || 0) - (b.question_index || 0))
      if (blankAttempts.length > 1) {
        // New format: multiple DB rows per question — store all for inline rendering
        const combined = {
          ...blankAttempts[0],
          selected_answer: blankAttempts.map(a => a.selected_answer || '').join(', '),
          correct_answer: blankAttempts.map(a => a.correct_answer || '').join(', '),
          is_correct: blankAttempts.every(a => a.is_correct)
        }
        reviewItems.push({ question: q, attempt: combined, blankAttempts })
      } else if (blankAttempts.length === 1) {
        reviewItems.push({ question: q, attempt: blankAttempts[0] })
      }
    } else {
      const attempt = questionAttempts.find(a => a.question_id === q.id)
      if (attempt) reviewItems.push({ question: q, attempt })
    }
  })

  // For pdf_worksheet: build review items from pages/fields instead of questions
  if (type === 'pdf_worksheet') {
    const allPages = exercise?.content?.pages || []
    allPages.forEach(page => {
      const fields = page.fields || []
      fields.forEach((field) => {
        const attempt = questionAttempts.find(a => a.question_id === field.id)
        if (attempt) {
          reviewItems.push({ field, attempt, pageNumber: page.page_number })
        }
      })
    })
  }

  const renderQuestion = (question, attempt, zoneIndex, blankAttempts) => {
    switch (type) {
      case 'multiple_choice': return <MultipleChoiceReview question={question} attempt={attempt} />
      case 'fill_blank': return <FillBlankReviewWithOverride question={question} attempt={attempt} blankAttempts={blankAttempts} onOverride={onOverride} overriding={overriding} />
      case 'dropdown': return <DropdownReview question={question} attempt={attempt} />
      case 'drag_drop':
        if (zoneIndex !== undefined) {
          return <DragDropZoneReview question={question} attempt={attempt} zoneIndex={zoneIndex} />
        }
        return <DragDropReview question={question} attempt={attempt} />
      default: return <GenericReview attempt={attempt} />
    }
  }

  const renderPDFWorksheetField = (field, attempt) => {
    let correctDisplay = ''
    let studentDisplay = ''

    if (field.type === 'text') {
      correctDisplay = field.correct_answer || ''
      studentDisplay = attempt.selected_answer || '(no answer)'
    } else if (field.type === 'dropdown') {
      const idx = parseInt(attempt.selected_answer)
      studentDisplay = !isNaN(idx) ? (field.options?.[idx] || '(no answer)') : '(no answer)'
      correctDisplay = field.options?.[field.correct_option] || ''
    } else if (field.type === 'checkbox') {
      studentDisplay = attempt.selected_answer === 'true' ? 'Checked' : 'Unchecked'
      correctDisplay = field.correct_answer === 'true' ? 'Checked' : 'Unchecked'
    }

    return (
      <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
        attempt.is_correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
      }`}>
        {attempt.is_correct
          ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          : <XCircle className="w-4 h-4 text-red-500 shrink-0" />
        }
        <span className="text-xs text-gray-500 shrink-0 w-24 truncate" title={field.label}>
          {field.label || 'Field'}
        </span>
        <span className={`font-medium ${attempt.is_correct ? 'text-green-800' : 'text-red-800'}`}>
          {studentDisplay}
        </span>
        {!attempt.is_correct && correctDisplay && (
          <>
            <span className="text-gray-400">→</span>
            <span className="font-medium text-green-800">{correctDisplay}</span>
          </>
        )}
        <span className="text-xs text-gray-400 ml-auto capitalize">({field.type})</span>
      </div>
    )
  }

  if (!reviewItems.length) {
    return <p className="text-gray-500 text-sm text-center py-4">No question attempts to review.</p>
  }

  return (
    <div className="space-y-6">
      {reviewItems.map((item, i) => {
        const isFillBlank = type === 'fill_blank' && !item.field
        return (
          <div key={`${item.attempt.id}_${item.zoneIndex ?? ''}`}>
            <div className="flex items-center justify-between gap-2 mb-3">
              {reviewItems.length > 1
                ? <span className="text-base font-semibold text-gray-700">
                    {item.field
                      ? `Field ${i + 1}`
                      : item.zoneIndex !== undefined
                        ? `Blank ${i + 1}`
                        : `Question ${i + 1}`
                    }
                  </span>
                : <span />
              }
              {/* Hide top-level override for fill_blank — handled per-blank inside the component */}
              {!isFillBlank && (
                <div className="flex items-center gap-2">
                  {item.attempt.manually_overridden && (
                    <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full flex items-center gap-1">
                      <Edit3 size={9} /> Overridden
                    </span>
                  )}
                  <button
                    onClick={() => onOverride(item.attempt.id, item.attempt.is_correct)}
                    disabled={overriding === item.attempt.id}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
                  >
                    {overriding === item.attempt.id
                      ? <RefreshCw size={11} className="animate-spin" />
                      : <Edit3 size={11} />
                    }
                    {item.attempt.is_correct ? 'Mark incorrect' : 'Mark correct'}
                  </button>
                </div>
              )}
            </div>

            {item.field
              ? renderPDFWorksheetField(item.field, item.attempt)
              : renderQuestion(item.question, item.attempt, item.zoneIndex, item.blankAttempts)
            }

            {i < reviewItems.length - 1 && <hr className="border-gray-100 mt-4" />}
          </div>
        )
      })}
    </div>
  )
}

export default SingleExerciseReview
