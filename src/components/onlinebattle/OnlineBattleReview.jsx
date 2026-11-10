import { useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import RichTextRenderer from '../ui/RichTextRenderer'
import { optionLetter } from './onlineBattleShared'

// Student's practice run through the questions already revealed in this battle, one at
// a time. Nothing here is saved or scored: a tap is only checked on this device, and
// moving to another question clears it. The correct answer is never shown up front; a
// wrong tap turns red and the student can try again.
//
// The list is whatever this device has seen on screen (kept by OnlineBattleRoomPage),
// so it needs nothing from the database.

const OnlineBattleReview = ({ questions, onClose }) => {
  const revealed = questions.filter(q => q.status === 'revealed' && Number.isInteger(q.correct_answer))
  const [index, setIndex] = useState(0)
  const [picks, setPicks] = useState([]) // options tried on the question on screen

  const current = Math.min(index, Math.max(0, revealed.length - 1))
  const q = revealed[current]
  const content = q?.question || {}
  const options = Array.isArray(content.options) ? content.options : []
  const solved = !!q && picks.includes(q.correct_answer)

  const goTo = (next) => {
    if (next < 0 || next >= revealed.length) return
    setIndex(next)
    setPicks([]) // start fresh every time a question is opened
  }

  const optionStyle = (idx) => {
    if (picks.includes(idx)) {
      return idx === q.correct_answer
        ? 'bg-green-500 border-green-500 text-white'
        : 'bg-red-500 border-red-500 text-white'
    }
    if (solved) return 'bg-white border-gray-200 text-gray-400'
    return 'bg-white border-gray-300 text-gray-800 hover:border-indigo-500 hover:bg-indigo-50 active:scale-[0.99]'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-indigo-950/90 overflow-y-auto p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1600px] my-auto overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-900 text-white">
          <div className="text-sm font-bold">
            Past questions
            {revealed.length > 0 && (
              <span className="ml-2 font-semibold text-gray-300">{current + 1} / {revealed.length}</span>
            )}
            <span className="ml-3 font-normal text-gray-400 hidden sm:inline">Practice only - not saved, no points</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!q ? (
          <p className="text-center text-gray-500 py-16 px-4">No past questions yet. They appear here after your teacher reveals the answer.</p>
        ) : (
          <>
            <div className="p-4 sm:p-6 grid gap-6 md:grid-cols-2 items-start">
              <div className="space-y-4">
                <div className="text-lg sm:text-xl font-semibold text-gray-800 leading-relaxed">
                  <RichTextRenderer content={content.question} />
                </div>
                {content.image_url && (
                  <div className="flex justify-center">
                    <img src={content.image_url} alt="" className="max-h-72 rounded-xl object-contain" />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="grid gap-2">
                  {options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPicks(prev => (prev.includes(idx) ? prev : [...prev, idx]))}
                      disabled={solved || picks.includes(idx)}
                      className={`flex items-center text-left px-4 py-3 rounded-xl border-2 text-base font-medium transition-all ${optionStyle(idx)}`}
                    >
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-300 text-gray-700 text-sm font-bold mr-3 flex-shrink-0">
                        {optionLetter(idx)}
                      </span>
                      <span className="min-w-0"><RichTextRenderer content={opt} /></span>
                    </button>
                  ))}
                </div>

                {solved && (
                  <div className="rounded-xl bg-green-50 text-green-700 p-4 text-center text-xl font-black">Correct!</div>
                )}
                {!solved && picks.length > 0 && (
                  <div className="rounded-xl bg-gray-100 text-gray-700 p-4 text-center font-bold">Not that one. Try again.</div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t bg-gray-50">
              <button
                onClick={() => goTo(current - 1)}
                disabled={current === 0}
                className="flex items-center gap-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-30 rounded-lg text-sm font-bold text-gray-700 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={() => goTo(current + 1)}
                disabled={current === revealed.length - 1}
                className="flex items-center gap-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-30 rounded-lg text-sm font-bold text-gray-700 transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default OnlineBattleReview
