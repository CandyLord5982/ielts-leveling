import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../supabase/client'
import {
  CheckCircle, XCircle, ChevronLeft, ChevronRight, X, Clock, Edit3
} from 'lucide-react'
import { RichTextWithAudio } from '../../ui/RichTextRenderer'
import { splitAnswers, firstAnswer } from '../../../utils/splitAnswers'

const decodeIndex = (type, idx) => {
  switch (type) {
    case 'fill_blank':
    case 'dropdown':
    case 'drag_drop':
      return { qi: Math.floor(idx / 100), sub: idx % 100 }
    case 'pdf_worksheet':
      return { qi: Math.floor(idx / 1000), sub: idx % 1000 }
    default:
      return { qi: idx, sub: 0 }
  }
}

// Group qas by qi, then by sub — returns { [qi]: { [sub]: qa } }
const groupQAs = (type, qas) => {
  const grouped = {}
  qas.forEach(qa => {
    const { qi, sub } = decodeIndex(type, qa.question_index || 0)
    if (!grouped[qi]) grouped[qi] = {}
    grouped[qi][sub] = qa
  })
  return grouped
}

// --- Exercise-level renderers ---

const MultipleChoiceExerciseReview = ({ exercise, qas }) => {
  const questions = exercise?.content?.questions || []
  const byQI = groupQAs('multiple_choice', qas)

  return (
    <div className="space-y-5">
      {questions.map((q, qi) => {
        const qa = byQI[qi]?.[0]
        if (!qa) return null
        const selected = qa.selected_answer
        const correct = qa.correct_answer
        return (
          <div key={qi} className="space-y-2">
            {questions.length > 1 && (
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Question {qi + 1}</p>
            )}
            {q.question && (
              <div className="text-sm text-gray-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: q.question }} />
            )}
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {(q.options || []).map((opt, i) => {
                const isCorrect = i === correct
                const isSelected = i === selected
                let cls = 'border-gray-200 bg-gray-50 text-gray-700'
                if (isCorrect) cls = 'border-green-400 bg-green-50 text-green-800'
                else if (isSelected) cls = 'border-red-400 bg-red-50 text-red-800'
                return (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg ${cls}`}>
                    <div className="shrink-0">
                      {isCorrect
                        ? <CheckCircle className="w-4 h-4 text-green-500" />
                        : isSelected
                          ? <XCircle className="w-4 h-4 text-red-500" />
                          : <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                      }
                    </div>
                    <span className="text-sm flex-1 truncate">{opt}</span>
                    {isCorrect && isSelected && <span className="text-xs text-green-600 font-medium shrink-0">✓</span>}
                    {isCorrect && !isSelected && <span className="text-xs text-green-600 font-medium shrink-0">Correct</span>}
                    {isSelected && !isCorrect && <span className="text-xs text-red-600 font-medium shrink-0">Your answer</span>}
                  </div>
                )
              })}
            </div>
            {q.explanation && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                <strong>Explanation:</strong> {q.explanation}
              </div>
            )}
            {qi < questions.length - 1 && <hr className="border-gray-100 mt-4" />}
          </div>
        )
      })}
    </div>
  )
}

const FillBlankSentence = ({ questionText, blanksQAs }) => {
  // Split on 3+ underscores or [blank] to find blank positions
  const parts = questionText.split(/_{3,}|\[blank\]/gi)
  return (
    <p className="text-sm text-gray-800 leading-loose">
      {parts.map((part, i) => {
        const qa = blanksQAs[i]
        return (
          <React.Fragment key={i}>
            <span dangerouslySetInnerHTML={{ __html: part }} />
            {qa && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded font-medium text-sm ${
                qa.is_correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {qa.selected_answer || '—'}
                {!qa.is_correct && (
                  <span className="text-green-700">
                    → {firstAnswer(qa.correct_answer)}
                  </span>
                )}
                {qa.is_correct
                  ? <CheckCircle size={11} className="text-green-500 shrink-0" />
                  : <XCircle size={11} className="text-red-500 shrink-0" />
                }
              </span>
            )}
          </React.Fragment>
        )
      })}
    </p>
  )
}

// Expand old-format fill_blank attempts (single row with comma-separated answers) into per-blank rows
const expandFillBlankQAs = (qas, questions) => {
  const expanded = []
  qas.forEach(qa => {
    const hasIndex = qa.question_index != null && qa.question_index > 0
    const selected = (qa.selected_answer || '').split(',').map(s => s.trim())
    const correct = (qa.correct_answer || '').split(',').map(s => s.trim())
    // Old format: single row with multiple comma-separated answers
    if (!hasIndex && selected.length > 1) {
      // Find which question index this belongs to
      const qId = qa.question_id
      const qi = questions.findIndex(q => q.id === qId) ?? 0
      selected.forEach((sel, bi) => {
        const corr = correct[bi] || ''
        const isCorrect = corr
          ? splitAnswers(corr).some(a => sel.toLowerCase() === a.toLowerCase())
          : qa.is_correct
        expanded.push({
          ...qa,
          question_index: qi * 100 + bi,
          selected_answer: sel,
          correct_answer: corr,
          is_correct: isCorrect
        })
      })
    } else {
      expanded.push(qa)
    }
  })
  return expanded
}

const FillBlankExerciseReview = ({ exercise, qas }) => {
  const questions = exercise?.content?.questions || []
  const expandedQAs = expandFillBlankQAs(qas, questions)
  const byQI = groupQAs('fill_blank', expandedQAs)

  return (
    <div className="space-y-5">
      {questions.map((q, qi) => {
        const blanksQAs = Object.values(byQI[qi] || {}).sort((a, b) =>
          decodeIndex('fill_blank', a.question_index).sub - decodeIndex('fill_blank', b.question_index).sub
        )
        if (!blanksQAs.length) return null
        return (
          <div key={qi} className="space-y-2">
            {questions.length > 1 && (
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Question {qi + 1}</p>
            )}
            {q.question
              ? <FillBlankSentence questionText={q.question} blanksQAs={blanksQAs} />
              : blanksQAs.map((qa, bi) => (
                <div key={bi} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Blank {bi + 1}:</span>
                  <span className={`px-2 py-0.5 rounded font-medium ${qa.is_correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {qa.selected_answer || '—'}
                  </span>
                  {!qa.is_correct && (
                    <>
                      <span className="text-gray-400">→</span>
                      <span className="px-2 py-0.5 rounded bg-green-50 text-green-800 font-medium">
                        {firstAnswer(qa.correct_answer)}
                      </span>
                    </>
                  )}
                </div>
              ))
            }
            {q.explanation && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800 mt-2">
                <strong>Explanation:</strong> {q.explanation}
              </div>
            )}
            {qi < questions.length - 1 && <hr className="border-gray-100 mt-4" />}
          </div>
        )
      })}
    </div>
  )
}

const DropdownExerciseReview = ({ exercise, qas }) => {
  const questions = exercise?.content?.questions || []
  const byQI = groupQAs('dropdown', qas)

  const boldBrackets = (text) =>
    text.replace(/(\[[^\]]+\])/g, '<strong>$1</strong>')

  return (
    <div className="space-y-5">
      {questions.map((q, qi) => {
        const dropdownQAs = Object.values(byQI[qi] || {}).sort((a, b) =>
          decodeIndex('dropdown', a.question_index).sub - decodeIndex('dropdown', b.question_index).sub
        )
        if (!dropdownQAs.length) return null
        return (
          <div key={qi} className="space-y-2">
            {questions.length > 1 && (
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Question {qi + 1}</p>
            )}
            {q.question && (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: boldBrackets(q.question) }} />
            )}
            <div className="space-y-1.5 mt-2">
              {dropdownQAs.map((qa, di) => {
                const dd = q.dropdowns?.[di]
                return (
                  <div key={di} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
                    qa.is_correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}>
                    {qa.is_correct
                      ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    }
                    {dd?.label && <span className="text-gray-500">{dd.label}:</span>}
                    <span className={`font-medium ${qa.is_correct ? 'text-green-800' : 'text-red-800'}`}>
                      {qa.selected_answer || '(none)'}
                    </span>
                    {!qa.is_correct && (
                      <>
                        <span className="text-gray-400">→</span>
                        <span className="font-medium text-green-800">{qa.correct_answer}</span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            {q.explanation && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800 mt-2">
                <strong>Explanation:</strong> {q.explanation}
              </div>
            )}
            {qi < questions.length - 1 && <hr className="border-gray-100 mt-4" />}
          </div>
        )
      })}
    </div>
  )
}

const DragDropSentence = ({ question, zoneQAs }) => {
  const items = question.items || []
  const dropZones = question.drop_zones || []

  const getItemText = (itemId) => items.find(it => it.id === itemId)?.text || null

  // Split on [DROP_ZONE_zoneId] placeholders — odd indices are zone IDs
  const parts = question.question.split(/\[DROP_ZONE_([^\]]+)\]/)

  return (
    <p className="text-sm text-gray-800 leading-loose">
      {parts.map((part, i) => {
        if (i % 2 === 0) {
          return <span key={i} dangerouslySetInnerHTML={{ __html: part }} />
        }
        const zoneId = part
        const zoneIndex = dropZones.findIndex(z => z.id === zoneId)
        const qa = zoneQAs[zoneIndex]
        const studentItemId = qa?.selected_answer
        const correctItemId = qa?.correct_answer
        const studentText = studentItemId ? getItemText(studentItemId) : null
        const correctText = correctItemId ? getItemText(correctItemId) : null
        const isCorrect = qa?.is_correct

        return (
          <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded font-medium ${
            isCorrect ? 'bg-green-100 text-green-800' : studentText ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-500'
          }`}>
            {studentText || '—'}
            {!isCorrect && correctText && (
              <span className="text-green-700 font-medium">→ {correctText}</span>
            )}
            {isCorrect
              ? <CheckCircle size={11} className="text-green-500 shrink-0" />
              : <XCircle size={11} className="text-red-500 shrink-0" />
            }
          </span>
        )
      })}
    </p>
  )
}

const DragDropExerciseReview = ({ exercise, qas }) => {
  const questions = exercise?.content?.questions || []
  const byQI = groupQAs('drag_drop', qas)

  return (
    <div className="space-y-5">
      {questions.map((q, qi) => {
        const zoneQAs = byQI[qi] || {}
        // Check if any zone has data
        if (Object.keys(zoneQAs).length === 0) return null
        const hasDropZonePlaceholders = q.question?.includes('[DROP_ZONE_')

        return (
          <div key={qi} className="space-y-2">
            {questions.length > 1 && (
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Question {qi + 1}</p>
            )}
            {hasDropZonePlaceholders
              ? <DragDropSentence question={q} zoneQAs={zoneQAs} />
              : (
                <>
                  {q.question && <p className="text-sm text-gray-800">{q.question}</p>}
                  <div className="space-y-1.5 mt-2">
                    {(q.drop_zones || []).map((zone, i) => {
                      const items = q.items || []
                      const getItemText = (id) => items.find(it => it.id === id)?.text || id
                      const qa = zoneQAs[i]
                      const studentId = qa?.selected_answer
                      const correctId = qa?.correct_answer
                      const isCorrect = qa?.is_correct
                      return (
                        <div key={zone.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
                          isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                        }`}>
                          {isCorrect ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500" /> }
                          <span className="text-gray-500 shrink-0">{zone.label || `Zone ${i + 1}`}:</span>
                          <span className={`font-medium ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>{studentId ? getItemText(studentId) : '(empty)'}</span>
                          {!isCorrect && correctId && <><span className="text-gray-400">→</span><span className="font-medium text-green-800">{getItemText(correctId)}</span></>}
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            }
            {qi < questions.length - 1 && <hr className="border-gray-100 mt-4" />}
          </div>
        )
      })}
    </div>
  )
}

const AIFillBlankExerciseReview = ({ exercise, qas }) => {
  const questions = exercise?.content?.questions || []
  const byQI = groupQAs('ai_fill_blank', qas)

  return (
    <div className="space-y-5">
      {questions.map((q, qi) => {
        const qa = byQI[qi]?.[0]
        if (!qa) return null
        const expected = splitAnswers(qa.correct_answer)
        return (
          <div key={qi} className="space-y-2">
            {questions.length > 1 && (
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Question {qi + 1}</p>
            )}
            {q.question && (
              <p className="text-sm text-gray-800 leading-relaxed">{q.question}</p>
            )}
            <div className={`p-3 rounded-lg border ${qa.is_correct ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
              <span className="text-xs font-medium text-gray-500 block mb-1">Student's answer</span>
              <span className={`text-sm ${qa.is_correct ? 'text-green-800' : 'text-red-800'}`}>
                {qa.selected_answer || '(no answer)'}
              </span>
            </div>
            {expected.length > 0 && (
              <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                <span className="text-xs font-medium text-gray-500 block mb-1">Expected answer(s)</span>
                <span className="text-sm text-gray-700">{expected.join(' / ')}</span>
              </div>
            )}
            {qi < questions.length - 1 && <hr className="border-gray-100 mt-4" />}
          </div>
        )
      })}
    </div>
  )
}

const ImageHotspotExerciseReview = ({ exercise, qas }) => {
  const hotspots = exercise?.content?.hotspots || []
  const labels = exercise?.content?.labels || []
  const imageUrl = exercise?.content?.image_url
  const byQI = groupQAs('image_hotspot', qas)

  const getLabelText = (labelId) => labels.find(l => l.id === labelId)?.text || null
  // Normalize coords: stored as 0–1 fraction or 0–100 percentage
  const toPercent = (val) => (val <= 1 ? val * 100 : val)

  // Image may be in image_url or embedded in the question HTML
  const extractImgSrc = (html) => {
    if (!html) return null
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
    return m ? m[1] : null
  }
  const resolvedImageUrl = imageUrl || extractImgSrc(exercise?.content?.question)

  return (
    <div className="space-y-3">
      {(() => {
        const textOnly = exercise?.content?.question?.replace(/<img[^>]*>/gi, '').trim()
        return textOnly
          ? <div className="text-sm text-gray-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: textOnly }} />
          : null
      })()}

      {resolvedImageUrl && (
        <div className="relative w-full">
          <img
            src={resolvedImageUrl}
            alt="Exercise"
            className="w-full rounded-lg border border-gray-200 object-contain"
          />
          {hotspots.map((hotspot, hi) => {
            const qa = byQI[hi]?.[0]
            if (!qa) return null
            return (
              <div
                key={hi}
                className={`absolute flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 ${
                  qa.is_correct ? 'bg-green-500' : 'bg-red-500'
                }`}
                style={{ left: `${toPercent(hotspot.x)}%`, top: `${toPercent(hotspot.y)}%` }}
                title={`Hotspot ${hi + 1}`}
              >
                {hi + 1}
              </div>
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="space-y-1.5">
        {hotspots.map((hotspot, hi) => {
          const qa = byQI[hi]?.[0]
          if (!qa) return null
          const correctLabel = labels.find(l => l.hotspot_id === hotspot.id && l.type !== 'distractor')
          const studentText = getLabelText(qa.selected_answer)
          const correctText = correctLabel?.text || getLabelText(qa.correct_answer)

          return (
            <div key={hi} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
              qa.is_correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
            }`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                qa.is_correct ? 'bg-green-500' : 'bg-red-500'
              }`}>
                {hi + 1}
              </div>
              <span className={`font-medium ${qa.is_correct ? 'text-green-800' : 'text-red-800'}`}>
                {studentText || '(no answer)'}
              </span>
              {!qa.is_correct && correctText && (
                <>
                  <span className="text-gray-400">→</span>
                  <span className="font-medium text-green-800">{correctText}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const PDFWorksheetExerciseReview = ({ exercise, qas }) => {
  const allPages = exercise?.content?.pages || []
  // Build a map from field.id -> qa for matching by question_id
  const byFieldId = {}
  qas.forEach(qa => { if (qa.question_id) byFieldId[qa.question_id] = qa })
  // Also group by question_index for test-runner path
  const byQI = groupQAs('pdf_worksheet', qas)

  return (
    <div className="space-y-4">
      {allPages.map((page, pi) => {
        const fields = page.fields || []
        if (fields.length === 0) return null
        return (
          <div key={pi}>
            {allPages.length > 1 && (
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Page {page.page_number}
              </p>
            )}
            <div className="space-y-1.5">
              {fields.map((field, fi) => {
                const qa = byFieldId[field.id] || byQI[pi]?.[fi]
                const isCorrect = qa?.is_correct
                const studentAnswer = qa?.selected_answer

                let correctDisplay = ''
                if (field.type === 'text') {
                  correctDisplay = field.correct_answer || ''
                } else if (field.type === 'dropdown') {
                  correctDisplay = field.options?.[field.correct_option] || ''
                } else if (field.type === 'checkbox') {
                  correctDisplay = field.correct_answer === 'true' ? 'Checked' : 'Unchecked'
                }

                let studentDisplay = ''
                if (field.type === 'dropdown') {
                  const idx = parseInt(studentAnswer)
                  studentDisplay = !isNaN(idx) ? (field.options?.[idx] || '(no answer)') : '(no answer)'
                } else if (field.type === 'checkbox') {
                  studentDisplay = studentAnswer === 'true' ? 'Checked' : 'Unchecked'
                } else {
                  studentDisplay = studentAnswer || '(no answer)'
                }

                return (
                  <div
                    key={field.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
                      qa
                        ? isCorrect
                          ? 'border-green-200 bg-green-50'
                          : 'border-red-200 bg-red-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="shrink-0">
                      {qa ? (
                        isCorrect
                          ? <CheckCircle className="w-4 h-4 text-green-500" />
                          : <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                      )}
                    </div>
                    <span className="text-xs text-gray-500 shrink-0 w-24 truncate" title={field.label}>
                      {field.label || `Field ${fi + 1}`}
                    </span>
                    <span className={`font-medium ${qa ? (isCorrect ? 'text-green-800' : 'text-red-800') : 'text-gray-500'}`}>
                      {studentDisplay}
                    </span>
                    {qa && !isCorrect && correctDisplay && (
                      <>
                        <span className="text-gray-400">→</span>
                        <span className="font-medium text-green-800">{correctDisplay}</span>
                      </>
                    )}
                    <span className="text-xs text-gray-400 ml-auto capitalize">({field.type})</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const GenericExerciseReview = ({ qas }) => {
  const fmt = (val) => {
    if (val === null || val === undefined) return '(no answer)'
    if (typeof val === 'object') return JSON.stringify(val, null, 2)
    return String(val)
  }
  return (
    <div className="space-y-3">
      {qas.map((qa, i) => (
        <div key={i} className="space-y-1.5">
          {qas.length > 1 && <p className="text-xs text-gray-400">Part {i + 1}</p>}
          <div className={`p-3 rounded-lg border ${qa.is_correct ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
            <span className="text-xs font-medium text-gray-500 block mb-1">Your answer</span>
            <pre className="text-sm whitespace-pre-wrap font-sans">{fmt(qa.selected_answer)}</pre>
          </div>
          {!qa.is_correct && (
            <div className="p-3 rounded-lg border border-green-300 bg-green-50">
              <span className="text-xs font-medium text-green-700 block mb-1">Correct answer</span>
              <pre className="text-sm whitespace-pre-wrap font-sans">{fmt(qa.correct_answer)}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// --- Main component ---

const ExerciseReviewMode = ({ attempt, passingScore = 70, onAttemptUpdate, onClose }) => {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [localQAs, setLocalQAs] = useState(attempt.test_question_attempts || [])
  const [savingOverride, setSavingOverride] = useState(null)

  useEffect(() => {
    const fetchAssignments = async () => {
      const { data } = await supabase
        .from('exercise_assignments')
        .select('exercise_id, order_index, exercise:exercises(id, title, exercise_type, content)')
        .eq('session_id', attempt.session_id)
        .order('order_index')
      setAssignments(data || [])
      setLoading(false)
    }
    fetchAssignments()
  }, [attempt.session_id])

  const handleOverride = async (qa, newIsCorrect) => {
    setSavingOverride(qa.id)
    try {
      const { error: qaErr } = await supabase
        .from('test_question_attempts')
        .update({
          is_correct: newIsCorrect,
          teacher_override: true,
          teacher_is_correct: newIsCorrect,
          overridden_at: new Date().toISOString()
        })
        .eq('id', qa.id)
      if (qaErr) throw qaErr

      const updatedQAs = localQAs.map(q =>
        q.id === qa.id ? { ...q, is_correct: newIsCorrect, teacher_override: true } : q
      )
      const total = updatedQAs.length
      const correct = updatedQAs.filter(q => q.is_correct).length
      const newScore = total > 0 ? Math.round((correct / total) * 100) : 0
      const newPassed = newScore >= passingScore

      const { error: attErr } = await supabase
        .from('test_attempts')
        .update({ score: newScore, passed: newPassed })
        .eq('id', attempt.id)
      if (attErr) throw attErr

      setLocalQAs(updatedQAs)
      if (onAttemptUpdate) onAttemptUpdate({ ...attempt, score: newScore, passed: newPassed, test_question_attempts: updatedQAs })
    } catch (err) {
      console.error('Override error:', err)
      alert('Failed to save override')
    } finally {
      setSavingOverride(null)
    }
  }

  // Group question attempts by exercise, sorted by exercise order
  const exerciseGroups = useMemo(() => {
    const exerciseMap = {}
    const orderMap = {}
    assignments.forEach(a => {
      exerciseMap[a.exercise_id] = a.exercise
      orderMap[a.exercise_id] = a.order_index
    })

    const groups = {}
    localQAs.forEach(qa => {
      const eid = qa.exercise_id
      if (!groups[eid]) {
        groups[eid] = {
          exercise: exerciseMap[eid],
          order: orderMap[eid] ?? 999,
          qas: []
        }
      }
      groups[eid].qas.push(qa)
    })

    return Object.values(groups)
      .sort((a, b) => a.order - b.order)
      .map(g => {
        const exType = g.exercise?.exercise_type || g.qas[0]?.exercise_type
        let sortedQAs = g.qas.sort((a, b) => (a.question_index || 0) - (b.question_index || 0))

        // Expand old drag_drop QAs (1 row per question) into per-zone rows
        if (exType === 'drag_drop') {
          const questions = g.exercise?.content?.questions || []
          const expanded = []
          sortedQAs.forEach(qa => {
            if (typeof qa.selected_answer === 'object' && qa.selected_answer !== null && !Array.isArray(qa.selected_answer)) {
              // Old format: expand into per-zone virtual rows
              const qiOld = qa.question_index || 0
              const question = questions[qiOld]
              if (question) {
                ;(question.drop_zones || []).forEach((zone, zi) => {
                  const studentItemId = qa.selected_answer?.[zone.id]
                  const correctItemId = Array.isArray(qa.correct_answer) ? qa.correct_answer[zi] : null
                  expanded.push({
                    ...qa,
                    question_index: qiOld * 100 + zi,
                    selected_answer: studentItemId || null,
                    correct_answer: correctItemId || null,
                    is_correct: !!(studentItemId && studentItemId === correctItemId)
                  })
                })
              } else {
                expanded.push(qa)
              }
            } else {
              expanded.push(qa)
            }
          })
          sortedQAs = expanded
        }

        return { ...g, qas: sortedQAs }
      })
  }, [assignments, localQAs])

  const renderExercise = (group) => {
    const type = group.exercise?.exercise_type || group.qas[0]?.exercise_type
    switch (type) {
      case 'multiple_choice':
        return <MultipleChoiceExerciseReview exercise={group.exercise} qas={group.qas} />
      case 'fill_blank':
        return <FillBlankExerciseReview exercise={group.exercise} qas={group.qas} />
      case 'dropdown':
        return <DropdownExerciseReview exercise={group.exercise} qas={group.qas} />
      case 'drag_drop':
        return <DragDropExerciseReview exercise={group.exercise} qas={group.qas} />
      case 'ai_fill_blank':
        return <AIFillBlankExerciseReview exercise={group.exercise} qas={group.qas} />
      case 'image_hotspot':
        return <ImageHotspotExerciseReview exercise={group.exercise} qas={group.qas} />
      case 'pdf_worksheet':
        return <PDFWorksheetExerciseReview exercise={group.exercise} qas={group.qas} />
      default:
        return <GenericExerciseReview qas={group.qas} />
    }
  }

  const getDotColor = (group) => {
    const allCorrect = group.qas.every(q => q.is_correct)
    const allWrong = group.qas.every(q => !q.is_correct)
    if (allCorrect) return { dot: 'bg-green-100 text-green-700 hover:bg-green-200', active: 'bg-green-500 text-white' }
    if (allWrong) return { dot: 'bg-red-100 text-red-700 hover:bg-red-200', active: 'bg-red-500 text-white' }
    return { dot: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200', active: 'bg-yellow-500 text-white' }
  }

  const formatTime = (s) => {
    if (!s) return '-'
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  }

  // Use expanded groups for counting (handles old drag_drop format)
  const allExpandedQAs = exerciseGroups.flatMap(g => g.qas)
  const correctCount = allExpandedQAs.filter(q => q.is_correct).length
  const totalCount = allExpandedQAs.length

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 text-sm">Loading review...</p>
        </div>
      </div>
    )
  }

  const current = exerciseGroups[currentIdx]
  const hasOverride = current?.qas.some(q => q.teacher_override)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <span className="text-blue-700 font-bold text-sm">
                {attempt.user?.full_name?.charAt(0)?.toUpperCase()}
              </span>
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">{attempt.user?.full_name}</div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className={`font-semibold ${attempt.passed ? 'text-green-600' : 'text-red-600'}`}>
                  {attempt.score}% — {attempt.passed ? 'Pass' : 'Fail'}
                </span>
                <span className="text-gray-300">·</span>
                <span>{correctCount}/{totalCount} correct</span>
                <span className="text-gray-300">·</span>
                <span className="flex items-center gap-0.5">
                  <Clock size={10} /> {formatTime(attempt.time_used_seconds)}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Exercise nav dots */}
        <div className="px-4 pt-3 shrink-0">
          <div className="flex items-center gap-1 flex-wrap mb-2">
            {exerciseGroups.map((group, i) => {
              const colors = getDotColor(group)
              const isActive = i === currentIdx
              return (
                <button
                  key={i}
                  onClick={() => setCurrentIdx(i)}
                  title={group.exercise?.title || `Exercise ${i + 1}`}
                  className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
                    isActive ? colors.active : colors.dot
                  }`}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1">
            <div
              className="bg-blue-500 h-1 rounded-full transition-all duration-300"
              style={{ width: `${((currentIdx + 1) / exerciseGroups.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Exercise body */}
        {current && (
          <div className="flex-1 overflow-y-auto p-4">
            {/* Exercise header */}
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">
                    {current.exercise?.title || `Exercise ${currentIdx + 1}`}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full capitalize">
                    {(current.exercise?.exercise_type || current.qas[0]?.exercise_type)?.replace(/_/g, ' ')}
                  </span>
                  {hasOverride && (
                    <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full flex items-center gap-1">
                      <Edit3 size={9} /> Overridden
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Exercise {currentIdx + 1} of {exerciseGroups.length}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-sm font-bold ${
                  current.qas.every(q => q.is_correct) ? 'text-green-600' :
                  current.qas.every(q => !q.is_correct) ? 'text-red-600' : 'text-yellow-600'
                }`}>
                  {current.qas.filter(q => q.is_correct).length}/{current.qas.length}
                </span>
                <p className="text-xs text-gray-400">correct</p>
              </div>
            </div>

            {current.exercise?.content?.intro && String(current.exercise.content.intro).trim() && (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-gray-700">
                <RichTextWithAudio content={current.exercise.content.intro} allowImages allowLinks />
              </div>
            )}

            <hr className="border-gray-100 mb-4" />

            {renderExercise(current)}

            {/* Override section */}
            {(() => {
              const exType = current.exercise?.exercise_type || current.qas[0]?.exercise_type
              const questions = current.exercise?.content?.questions || []
              const hotspots = current.exercise?.content?.hotspots || []
              const byQI = groupQAs(exType, current.qas)

              // Build list of relevant QAs matched to actual content
              const overrideQAs = []
              if (exType === 'image_hotspot') {
                hotspots.forEach((_, hi) => {
                  const qa = byQI[hi]?.[0]
                  if (qa) overrideQAs.push({ qa, label: `Q${hi + 1}` })
                })
              } else if (exType === 'multiple_choice' || exType === 'ai_fill_blank') {
                questions.forEach((_, qi) => {
                  const qa = byQI[qi]?.[0]
                  if (qa) overrideQAs.push({ qa, label: `Q${qi + 1}` })
                })
              } else if (exType === 'drag_drop') {
                questions.forEach((q, qi) => {
                  const zones = q.drop_zones || []
                  zones.forEach((_, zi) => {
                    const qa = (byQI[qi] || {})[zi]
                    if (qa) overrideQAs.push({ qa, label: `Q${qi + 1}.${zi + 1}` })
                  })
                })
              } else if (exType === 'fill_blank' || exType === 'dropdown') {
                questions.forEach((q, qi) => {
                  const subCount = exType === 'fill_blank' ? (q.blanks || []).length : (q.dropdowns || []).length
                  for (let si = 0; si < subCount; si++) {
                    const qa = (byQI[qi] || {})[si]
                    if (qa) overrideQAs.push({ qa, label: `Q${qi + 1}.${si + 1}` })
                  }
                })
              } else {
                // Fallback: show all QAs
                current.qas.forEach((qa, i) => overrideQAs.push({ qa, label: `Part ${i + 1}` }))
              }

              return (
                <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Grade Override</p>
                  <div className="space-y-1.5">
                    {overrideQAs.map(({ qa, label }, i) => (
                      <div key={`${currentIdx}-${label}`} className="flex items-center gap-2">
                        {overrideQAs.length > 1 && (
                          <span className="text-xs text-gray-400 w-12 shrink-0">{label}</span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          qa.is_correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {qa.is_correct ? 'Correct' : 'Incorrect'}
                        </span>
                        {qa.teacher_override && (
                          <span className="text-xs text-orange-500 italic">overridden</span>
                        )}
                        <button
                          onClick={() => handleOverride(qa, !qa.is_correct)}
                          disabled={savingOverride === qa.id}
                          className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
                        >
                          {savingOverride === qa.id
                            ? <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            : <Edit3 size={11} />
                          }
                          {qa.is_correct ? 'Mark incorrect' : 'Mark correct'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Navigation footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 shrink-0">
          <button
            onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={15} /> Previous
          </button>
          <span className="text-xs text-gray-400">
            {currentIdx + 1} / {exerciseGroups.length}
          </span>
          {currentIdx < exerciseGroups.length - 1 ? (
            <button
              onClick={() => setCurrentIdx(i => Math.min(exerciseGroups.length - 1, i + 1))}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Next <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded-lg transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ExerciseReviewMode
