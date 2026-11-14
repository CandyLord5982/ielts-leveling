import React from 'react'
import DOMPurify from 'dompurify'
import { CheckCircle, XCircle, Edit3, RefreshCw } from 'lucide-react'

// Shows one try of one exercise. `questionAttempts` are that try's question_attempts rows:
// one row per graded item (question, blank, dropdown, drop zone, region, worksheet field),
// with readable selected/correct answers and is_correct already reflecting teacher overrides.

// Question text is authored HTML (teachers can write it), so sanitize before rendering
const safeHtml = (html) => ({ __html: DOMPurify.sanitize(html || '') })

// Same fallback id the exercise components use when a question has no id
const questionKey = (question, index) => question.id || `q${index}`

const byItemIndex = (a, b) => (a.item_index || 0) - (b.item_index || 0)

const OverrideButton = ({ row, onOverride, overriding, compact = false }) => {
  if (!row || !onOverride) return null
  const busy = overriding === row.id
  if (compact) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onOverride(row.id, row.is_correct) }}
        disabled={busy}
        className="ml-1 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
        title={row.is_correct ? 'Mark incorrect' : 'Mark correct'}
      >
        {busy ? <RefreshCw size={10} className="animate-spin" /> : <Edit3 size={10} />}
      </button>
    )
  }
  return (
    <button
      onClick={() => onOverride(row.id, row.is_correct)}
      disabled={busy}
      className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors disabled:opacity-50 shrink-0"
    >
      {busy ? <RefreshCw size={11} className="animate-spin" /> : <Edit3 size={11} />}
      {row.is_correct ? 'Mark incorrect' : 'Mark correct'}
    </button>
  )
}

const OverriddenBadge = ({ row }) => row?.manually_overridden ? (
  <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full flex items-center gap-1 shrink-0">
    <Edit3 size={9} /> Overridden
  </span>
) : null

// One answer line: ✓/✗, optional label, student answer, → correct answer when wrong, override
const AnswerRow = ({ row, label, onOverride, overriding }) => {
  const ok = row.is_correct
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      {ok ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
      {label && <span className="text-gray-500 shrink-0">{label}:</span>}
      <span className={`font-medium ${ok ? 'text-green-800' : 'text-red-800'}`}>{row.selected_answer || '(no answer)'}</span>
      {!ok && row.correct_answer && (
        <><span className="text-gray-400">→</span><span className="font-medium text-green-800">{firstAccepted(row.correct_answer)}</span></>
      )}
      <OverriddenBadge row={row} />
      <OverrideButton row={row} onOverride={onOverride} overriding={overriding} />
    </div>
  )
}

// Fill-blank answers may list several accepted answers separated by |
const firstAccepted = (answer) => String(answer).split('|')[0].trim()

// --- Type-specific renderers ---

const MultipleChoiceReview = ({ question, row }) => {
  const options = question.options || []
  const correct = question.correct_answer
  const selected = options.findIndex(opt => opt === row.selected_answer)

  if (!options.length) return <AnswerRow row={row} />

  return (
    <div className="space-y-2">
      {question.question && (
        <div className="text-sm text-gray-800 leading-relaxed mb-2"
          dangerouslySetInnerHTML={safeHtml(question.question)} />
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

// Blanks shown inside the sentence when it has _____ markers, otherwise as a list
const FillBlankReview = ({ question, rows, onOverride, overriding }) => {
  const parts = (question.question || '').split(/_{3,}/)

  if (parts.length > 1) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-800 leading-loose">
          {parts.map((part, i) => {
            if (i >= parts.length - 1) return <span key={i} dangerouslySetInnerHTML={safeHtml(part)} />
            const row = rows.find(r => r.item_index === i)
            const ok = !!row?.is_correct
            return (
              <React.Fragment key={i}>
                <span dangerouslySetInnerHTML={safeHtml(part)} />
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded font-medium ${
                  ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {row?.selected_answer || '—'}
                  {!ok && row?.correct_answer && (
                    <span className="text-green-700 ml-1">→ {firstAccepted(row.correct_answer)}</span>
                  )}
                  {ok
                    ? <CheckCircle size={11} className="text-green-500 shrink-0" />
                    : <XCircle size={11} className="text-red-500 shrink-0" />
                  }
                  {row?.manually_overridden && <Edit3 size={9} className="text-orange-500 shrink-0" />}
                  <OverrideButton row={row} onOverride={onOverride} overriding={overriding} compact />
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

  return (
    <div className="space-y-2">
      {question.question && (
        <div className="text-sm text-gray-700 leading-relaxed" dangerouslySetInnerHTML={safeHtml(question.question)} />
      )}
      {rows.map(row => (
        <AnswerRow key={row.id} row={row} label={`Blank ${row.item_index + 1}`} onOverride={onOverride} overriding={overriding} />
      ))}
    </div>
  )
}

const DropdownReview = ({ question, rows, onOverride, overriding }) => {
  const boldBrackets = (text) => text.replace(/(\[[^\]]+\])/g, '<strong>$1</strong>')
  return (
    <div className="space-y-2">
      {question.question && (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={safeHtml(boldBrackets(question.question))} />
      )}
      <div className="space-y-1.5">
        {rows.map(row => (
          <AnswerRow
            key={row.id}
            row={row}
            label={question.dropdowns?.[row.item_index]?.label || `Dropdown ${row.item_index + 1}`}
            onOverride={onOverride}
            overriding={overriding}
          />
        ))}
      </div>
    </div>
  )
}

const DragDropReview = ({ question, rows, onOverride, overriding }) => (
  <div className="space-y-2">
    {question.question && (
      <div className="text-sm text-gray-800 mb-2"
        dangerouslySetInnerHTML={safeHtml(question.question.replace(/\[DROP_ZONE_[^\]]+\]/g, '_____'))} />
    )}
    <div className="space-y-1.5">
      {rows.map(row => {
        const zone = (question.drop_zones || []).find(z => z.id === row.item_key)
        return (
          <AnswerRow
            key={row.id}
            row={row}
            label={zone?.label || `Blank ${row.item_index + 1}`}
            onOverride={onOverride}
            overriding={overriding}
          />
        )
      })}
    </div>
  </div>
)

// --- Main component ---

const SingleExerciseReview = ({ exercise, questionAttempts, onOverride, overriding }) => {
  const type = exercise?.exercise_type
  const questions = exercise?.content?.questions || []

  const rowsFor = (id) => questionAttempts.filter(a => a.question_id === id).sort(byItemIndex)
  const used = new Set()
  const sections = []

  if (type === 'pdf_worksheet') {
    let n = 0
    ;(exercise?.content?.pages || []).forEach(page => {
      (page.fields || []).forEach(field => {
        n++
        const row = questionAttempts.find(a => a.question_id === field.id)
        if (!row) return
        used.add(row.id)
        sections.push({
          key: row.id,
          title: `Field ${n}`,
          body: <AnswerRow row={row} label={field.label || field.type} onOverride={onOverride} overriding={overriding} />
        })
      })
    })
  } else {
    questions.forEach((question, qi) => {
      const rows = rowsFor(questionKey(question, qi))
      if (rows.length === 0) return
      rows.forEach(r => used.add(r.id))

      let body
      switch (type) {
        case 'multiple_choice':
          body = <MultipleChoiceReview question={question} row={rows[0]} />
          break
        case 'fill_blank':
          body = <FillBlankReview question={question} rows={rows} onOverride={onOverride} overriding={overriding} />
          break
        case 'dropdown':
          body = <DropdownReview question={question} rows={rows} onOverride={onOverride} overriding={overriding} />
          break
        case 'drag_drop':
          body = <DragDropReview question={question} rows={rows} onOverride={onOverride} overriding={overriding} />
          break
        default:
          body = (
            <div className="space-y-2">
              {question.question && (
                <div className="text-sm text-gray-800" dangerouslySetInnerHTML={safeHtml(question.question)} />
              )}
              {rows.map(row => <AnswerRow key={row.id} row={row} onOverride={onOverride} overriding={overriding} />)}
            </div>
          )
      }

      // Single-answer questions get their override button in the header; multi-part ones per item
      const single = type === 'multiple_choice'
      sections.push({ key: rows[0].id, title: `Question ${qi + 1}`, body, headerRow: single ? rows[0] : null })
    })
  }

  // Anything not matched to the exercise content (color-fill regions, edited/removed questions)
  const leftovers = questionAttempts.filter(a => !used.has(a.id))
    .sort((a, b) => (a.question_index ?? 0) - (b.question_index ?? 0) || byItemIndex(a, b))
  if (leftovers.length > 0) {
    sections.push({
      key: 'other',
      title: type === 'color_fill' ? 'Answers' : 'Other answers',
      body: (
        <div className="space-y-1.5">
          {leftovers.map(row => (
            <AnswerRow
              key={row.id}
              row={row}
              label={`${(row.question_index ?? 0) + 1}${row.item_key ? `.${row.item_index + 1}` : ''}`}
              onOverride={onOverride}
              overriding={overriding}
            />
          ))}
        </div>
      )
    })
  }

  if (!sections.length) {
    return <p className="text-gray-500 text-sm text-center py-4">No question attempts to review.</p>
  }

  return (
    <div className="space-y-6">
      {sections.map((section, i) => (
        <div key={section.key}>
          <div className="flex items-center justify-between gap-2 mb-3">
            {sections.length > 1
              ? <span className="text-base font-semibold text-gray-700">{section.title}</span>
              : <span />
            }
            {section.headerRow && (
              <div className="flex items-center gap-2">
                <OverriddenBadge row={section.headerRow} />
                <OverrideButton row={section.headerRow} onOverride={onOverride} overriding={overriding} />
              </div>
            )}
          </div>
          {section.body}
          {i < sections.length - 1 && <hr className="border-gray-100 mt-4" />}
        </div>
      ))}
    </div>
  )
}

export default SingleExerciseReview
