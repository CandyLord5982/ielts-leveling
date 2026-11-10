import { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import RichTextRenderer from '../ui/RichTextRenderer'
import { teamName, optionLetter } from './onlineBattleShared'

// What a student sees while the teacher is showing a live question: question on the
// left, options on the right (stacked on phones). The first tap is the final answer;
// it is graded on the server and the correct answer only arrives after the reveal.

const OnlineQuestionView = ({ question, room, myTeam, serverOffsetMs, onAnswered, onRefresh, onClose, claimButton, powerUps }) => {
  const [picked, setPicked] = useState(null) // { questionId, option } - shown before the server confirms
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState(null) // { questionId, text }
  const [nowMs, setNowMs] = useState(Date.now())

  const isOpen = question.status === 'open'
  const isRevealed = question.status === 'revealed'

  useEffect(() => {
    if (!isOpen) return
    setNowMs(Date.now())
    const tick = setInterval(() => setNowMs(Date.now()), 250)
    return () => clearInterval(tick)
  }, [isOpen, question.id])

  const content = question.question || {}
  const options = Array.isArray(content.options) ? content.options : []
  const myAnswer = question.my_answer ?? (picked?.questionId === question.id ? picked.option : null)
  const hasAnswered = myAnswer !== null && myAnswer !== undefined
  const remaining = isOpen
    ? Math.max(0, Math.ceil((new Date(question.closes_at).getTime() - (nowMs + serverOffsetMs)) / 1000))
    : 0
  const timeUp = isOpen && remaining <= 0
  const noticeText = notice?.questionId === question.id ? notice.text : ''

  const choose = async (option) => {
    if (!isOpen || hasAnswered || submitting || timeUp) return
    const id = question.id
    setPicked({ questionId: id, option })
    setSubmitting(true)
    setNotice(null)
    try {
      const { data, error } = await supabase.rpc('online_battle_submit_answer', {
        p_question_id: id,
        p_selected_option: option,
      })
      if (error) throw error
      if (data?.saved) {
        onAnswered()
      } else if (data?.reason !== 'already_answered') {
        setPicked(null)
        setNotice({
          questionId: id,
          text: data?.reason === 'closed'
            ? 'Too late - this question has closed.'
            : 'You are not on a team in this battle.',
        })
      }
    } catch {
      setPicked(null)
      setNotice({ questionId: id, text: 'Could not send your answer. Tap again.' })
    } finally {
      setSubmitting(false)
      onRefresh()
    }
  }

  const optionStyle = (idx) => {
    if (isRevealed) {
      if (idx === question.correct_answer) return 'bg-green-500 border-green-500 text-white'
      if (idx === myAnswer) return 'bg-red-500 border-red-500 text-white'
      return 'bg-white border-gray-200 text-gray-400'
    }
    if (hasAnswered) {
      return idx === myAnswer
        ? 'bg-indigo-600 border-indigo-600 text-white'
        : 'bg-white border-gray-200 text-gray-400'
    }
    if (timeUp) return 'bg-white border-gray-200 text-gray-400'
    return 'bg-white border-gray-300 text-gray-800 hover:border-indigo-500 hover:bg-indigo-50 active:scale-[0.99]'
  }

  let status = null
  if (isRevealed) {
    const total = question[`team_${myTeam}_total`] ?? 0
    const correct = question[`team_${myTeam}_correct`] ?? 0
    const points = question[`team_${myTeam}_points`] ?? 0
    status = (
      <div className={`rounded-xl p-4 text-center ${question.my_correct ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
        <div className="text-2xl font-black">
          {!hasAnswered ? 'You did not answer' : question.my_correct ? 'Correct!' : 'Not this time'}
        </div>
        <div className="text-sm font-semibold mt-1">
          {teamName(room, myTeam)}: {correct} of {total} correct · +{points} points
        </div>
      </div>
    )
  } else if (hasAnswered) {
    status = (
      <div className="rounded-xl bg-indigo-50 text-indigo-700 p-4 text-center font-bold">
        Answer locked in. Wait for the reveal!
      </div>
    )
  } else if (timeUp) {
    status = (
      <div className="rounded-xl bg-gray-100 text-gray-600 p-4 text-center font-bold">
        Time is up! Wait for the reveal.
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-indigo-950/90 overflow-y-auto p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1600px] my-auto overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-900 text-white">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold truncate ${myTeam === 'a' ? 'bg-red-500' : 'bg-blue-500'}`}>
              {teamName(room, myTeam)}
            </span>
            <span className="text-sm font-bold">Live Question</span>
          </div>
          {isOpen && (
            <span className={`text-3xl font-black tabular-nums ${remaining <= 5 ? 'text-red-400' : ''}`}>{remaining}</span>
          )}
        </div>

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
                  onClick={() => choose(idx)}
                  disabled={!isOpen || hasAnswered || submitting || timeUp}
                  className={`flex items-center text-left px-4 py-3 rounded-xl border-2 text-base font-medium transition-all ${optionStyle(idx)}`}
                >
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-300 text-gray-700 text-sm font-bold mr-3 flex-shrink-0">
                    {optionLetter(idx)}
                  </span>
                  <span className="min-w-0"><RichTextRenderer content={opt} /></span>
                </button>
              ))}
            </div>

            {noticeText && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 text-center">{noticeText}</p>
            )}
            {status}

            {/* Bonus point button: lit when this student got it right */}
            {isRevealed && claimButton && <div className="flex justify-center">{claimButton}</div>}
            {isRevealed && powerUps}

            {isRevealed && (
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors"
              >
                Back to scoreboard
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default OnlineQuestionView
