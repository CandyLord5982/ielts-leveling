import React, { useState, useRef, useEffect } from 'react'

/**
 * IeltsInlineFillBlank - IELTS-style fill-in-the-blank
 * Each question shown as a numbered row with the blank input inline inside the sentence.
 * Has Review / Do toggle for teacher.
 */
const IeltsInlineFillBlank = ({
  questions = [],
  onAnswersChange,
  isTeacher = false,
  startNumber = 1,
  fibIntro = '',
  fibInstruction = '',
  hideHeader = false,
}) => {
  const [answers, setAnswers] = useState({})
  const [mode, setMode] = useState(isTeacher ? 'review' : 'do') // teacher defaults to review
  const [focused, setFocused] = useState(null)
  const inputRefs = useRef({})

  useEffect(() => {
    onAnswersChange?.(answers)
  }, [answers])

  const handleChange = (key, value) => {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  const totalBlanks = questions.reduce((s, q) => s + (q.blanks?.length || 0), 0)
  const endNumber = startNumber + totalBlanks - 1
  const rangeLabel = totalBlanks <= 1
    ? `Question ${startNumber}`
    : `Questions ${startNumber}–${endNumber}`

  // Render a single question row
  const renderRow = (question, qIdx) => {
    const text = question.question || ''
    const parts = text.split(/(_{5,})/g)
    let localBlankIdx = 0
    let blankNumInQuestion = startNumber + questions.slice(0, qIdx).reduce((s, q) => s + (q.blanks?.length || 0), 0)

    const inlineContent = parts.map((part, pIdx) => {
      if (part.match(/^_{5,}$/)) {
        const blankIdx = localBlankIdx++
        const key = `${qIdx}-${blankIdx}`
        const blankNum = blankNumInQuestion++
        const correctAnswer = question.blanks?.[blankIdx]?.answer || ''
        const userValue = answers[key] || ''
        const isFocused = focused === key
        const showReview = mode === 'review'

        if (showReview) {
          return (
            <span key={pIdx} className="inline-flex items-center mx-1 align-baseline">
              <span className="inline-block px-3 py-0.5 bg-green-100 text-green-800 border border-green-400 rounded-md font-semibold text-sm min-w-[80px] text-center">
                {correctAnswer || '—'}
              </span>
            </span>
          )
        }

        return (
          <span key={pIdx} id={`question-${blankNum}`} className="inline-flex items-center mx-1 align-baseline">
            <input
              ref={el => {
                if (!inputRefs.current[qIdx]) inputRefs.current[qIdx] = {}
                inputRefs.current[qIdx][blankIdx] = el
              }}
              type="text"
              value={userValue}
              onChange={e => handleChange(key, e.target.value)}
              onFocus={() => setFocused(key)}
              onBlur={() => setFocused(null)}
              placeholder="Type your answer..."
              className={`
                inline-block align-baseline text-sm text-center text-gray-800
                border rounded-md px-2 py-0.5 outline-none transition-all
                placeholder:text-gray-400
                ${isFocused
                  ? 'border-blue-500 ring-2 ring-blue-100 bg-white shadow-sm'
                  : userValue
                    ? 'border-blue-400 bg-blue-50 text-blue-800'
                    : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-white'}
              `}
              style={{ width: Math.max(140, (userValue.length || 16) * 8 + 32) + 'px' }}
            />
          </span>
        )
      }

      return (
        <span key={pIdx} className="leading-loose">
          {part}
        </span>
      )
    })

    // Question's own blank number (first blank of this question)
    const questionNum = startNumber + questions.slice(0, qIdx).reduce((s, q) => s + (q.blanks?.length || 0), 0)

    return (
      <div key={question.id || qIdx} className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
        {/* Number Badge */}
        <span className="flex-shrink-0 mt-1 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          {questionNum}
        </span>

        {/* Sentence with inline blank */}
        <p className="text-sm text-gray-800 leading-loose flex-1 flex flex-wrap items-baseline gap-y-1">
          {inlineContent}
        </p>
      </div>
    )
  }

  if (questions.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Section Header — hidden when embedded in unified list */}
      {!hideHeader && (
        <div className="border-b border-gray-200">
          <div className="bg-green-50 px-5 pt-4 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-base font-bold text-green-800">{rangeLabel}</p>
                {fibIntro ? (
                  <p className="text-sm italic text-green-700 mt-0.5">{fibIntro}</p>
                ) : (
                  <>
                    <p className="text-sm italic text-green-700 mt-0.5">Complete the sentences below.</p>
                    <p className="text-sm text-green-700">
                      {fibInstruction
                        ? fibInstruction
                        : (<>Choose <span className="font-bold">NO MORE THAN TWO WORDS</span> from the passage for each answer.</>) 
                      }
                    </p>
                  </>
                )}
              </div>
              {/* Review / Do Toggle */}
              {isTeacher && (
                <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm flex-shrink-0 ml-4">
                  <button type="button" onClick={() => setMode('review')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${ mode === 'review' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    Review
                  </button>
                  <button type="button" onClick={() => setMode('do')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${ mode === 'do' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    Do
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* When hideHeader=true, still show instruction hint + Review/Do toggle */}
      {hideHeader && isTeacher && (
        <div className="flex items-center justify-between px-4 py-2 bg-green-50 border-b border-green-100">
          <p className="text-xs italic text-green-700">
            {fibInstruction || 'Fill in the Blank — Choose NO MORE THAN TWO WORDS'}
          </p>
          <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm flex-shrink-0 ml-4">
            <button type="button" onClick={() => setMode('review')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${ mode === 'review' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Review
            </button>
            <button type="button" onClick={() => setMode('do')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${ mode === 'do' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Do
            </button>
          </div>
        </div>
      )}

      {/* When hideHeader=true + not teacher, show small instruction */}
      {hideHeader && !isTeacher && (
        <div className="px-4 py-2 bg-green-50 border-b border-green-100">
          <p className="text-xs italic text-green-600">
            {fibInstruction || 'Fill in the blank — Choose NO MORE THAN TWO WORDS from the passage.'}
          </p>
        </div>
      )}
      {/* Questions List */}
      <div className="px-5 py-2 divide-y divide-gray-100">
        {questions.map((q, qIdx) => renderRow(q, qIdx))}
      </div>
    </div>
  )
}

export default IeltsInlineFillBlank
