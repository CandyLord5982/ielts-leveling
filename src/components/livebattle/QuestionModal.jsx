import { useState } from 'react'
import { X, Eye, EyeOff, ChevronLeft, ChevronRight, BookOpen, Minimize2, Maximize2 } from 'lucide-react'
import RichTextRenderer from '../ui/RichTextRenderer'

const QuestionModal = ({ exercise, onClose }) => {
  const questions = exercise?.content?.questions || []
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [minimized, setMinimized] = useState(false)

  if (questions.length === 0) return null

  const q = questions[currentIndex]
  const exerciseType = exercise.exercise_type

  const goNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setShowAnswer(false)
    }
  }

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setShowAnswer(false)
    }
  }

  const renderQuestion = () => {
    switch (exerciseType) {
      case 'multiple_choice':
        return <MultipleChoiceQuestion q={q} showAnswer={showAnswer} />
      case 'fill_blank':
        return <FillBlankQuestion q={q} showAnswer={showAnswer} />
      case 'dropdown':
        return <DropdownQuestion q={q} showAnswer={showAnswer} />
      case 'flashcard':
        return <FlashcardQuestion q={q} showAnswer={showAnswer} />
      default:
        return <div className="text-gray-500 text-center">Unsupported question type</div>
    }
  }

  // Minimized: floating bar at bottom
  if (minimized) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white rounded-full shadow-2xl px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-indigo-500 transition-colors"
        onClick={() => setMinimized(false)}
      >
        <BookOpen className="w-4 h-4" />
        <span className="font-bold text-sm truncate max-w-[200px]">{exercise.title}</span>
        <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">Q{currentIndex + 1}/{questions.length}</span>
        <Maximize2 className="w-4 h-4 ml-1" />
      </div>
    )
  }

  // Expanded: floating panel (not blocking — no backdrop overlay)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col w-[80%] max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50 rounded-t-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span className="font-bold text-gray-800 truncate text-sm">{exercise.title}</span>
            <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full flex-shrink-0">
              {currentIndex + 1} / {questions.length}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setMinimized(true)} className="p-1.5 hover:bg-gray-200 rounded-lg" title="Minimize">
              <Minimize2 className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg" title="Close exercise">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Question content */}
        <div className="flex-1 overflow-y-auto p-5">
          {renderQuestion()}
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-100 rounded-lg text-sm font-semibold text-gray-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>

          <button
            onClick={() => setShowAnswer(!showAnswer)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
              showAnswer
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
            }`}
          >
            {showAnswer ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showAnswer ? 'Hide Answer' : 'Show Answer'}
          </button>

          <button
            onClick={goNext}
            disabled={currentIndex === questions.length - 1}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-100 rounded-lg text-sm font-semibold text-gray-700 transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// === Question type renderers ===

const MultipleChoiceQuestion = ({ q, showAnswer }) => {
  const correctIndex = q.correct_answer

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold text-gray-800">
        <RichTextRenderer content={q.question} />
      </div>

      {q.image_url && (
        <div className="flex justify-center">
          <img src={q.image_url} alt="" className="max-h-60 rounded-xl object-contain" />
        </div>
      )}

      <div className="grid gap-2">
        {(q.options || []).map((opt, idx) => {
          const isCorrect = idx === correctIndex
          let style = 'bg-gray-50 border-gray-200 text-gray-700'
          if (showAnswer && isCorrect) {
            style = 'bg-green-50 border-green-400 text-green-800 ring-2 ring-green-300'
          }

          return (
            <div
              key={idx}
              className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${style}`}
            >
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white border text-xs font-bold mr-3">
                {String.fromCharCode(65 + idx)}
              </span>
              <RichTextRenderer content={opt} />
            </div>
          )
        })}
      </div>

      {showAnswer && q.explanation && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          <span className="font-bold">Explanation:</span> <RichTextRenderer content={q.explanation} />
        </div>
      )}
    </div>
  )
}

const FillBlankQuestion = ({ q, showAnswer }) => {
  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold text-gray-800">
        <RichTextRenderer content={q.question} />
      </div>

      {q.image_url && (
        <div className="flex justify-center">
          <img src={q.image_url} alt="" className="max-h-60 rounded-xl object-contain" />
        </div>
      )}

      {showAnswer && (
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
          <div className="text-xs text-green-600 font-semibold mb-1 uppercase">Answer</div>
          <div className="text-lg font-bold text-green-800">
            {Array.isArray(q.answers) ? q.answers.join(' / ') : q.answer || q.correct_answer || '—'}
          </div>
        </div>
      )}

      {showAnswer && q.explanation && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          <span className="font-bold">Explanation:</span> <RichTextRenderer content={q.explanation} />
        </div>
      )}
    </div>
  )
}

const DropdownQuestion = ({ q, showAnswer }) => {
  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold text-gray-800">
        <RichTextRenderer content={q.question} />
      </div>

      {q.image_url && (
        <div className="flex justify-center">
          <img src={q.image_url} alt="" className="max-h-60 rounded-xl object-contain" />
        </div>
      )}

      {showAnswer && (
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
          <div className="text-xs text-green-600 font-semibold mb-1 uppercase">Answer</div>
          {q.blanks ? (
            <div className="space-y-1">
              {q.blanks.map((blank, idx) => (
                <div key={idx} className="text-base font-bold text-green-800">
                  {blank.label || `Blank ${idx + 1}`}: {blank.correct || blank.answer || '—'}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-lg font-bold text-green-800">
              {q.correct_answer || q.answer || '—'}
            </div>
          )}
        </div>
      )}

      {showAnswer && q.explanation && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          <span className="font-bold">Explanation:</span> <RichTextRenderer content={q.explanation} />
        </div>
      )}
    </div>
  )
}

const FlashcardQuestion = ({ q, showAnswer }) => {
  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-6 text-center">
        <div className="text-xs text-indigo-500 font-semibold mb-2 uppercase">Front</div>
        <div className="text-xl font-bold text-gray-800">
          <RichTextRenderer content={q.front || q.question} />
        </div>
        {q.image_url && (
          <div className="flex justify-center mt-3">
            <img src={q.image_url} alt="" className="max-h-48 rounded-xl object-contain" />
          </div>
        )}
      </div>

      {showAnswer && (
        <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-6 text-center">
          <div className="text-xs text-green-600 font-semibold mb-2 uppercase">Back</div>
          <div className="text-xl font-bold text-green-800">
            <RichTextRenderer content={q.back || q.answer} />
          </div>
        </div>
      )}
    </div>
  )
}

export default QuestionModal
