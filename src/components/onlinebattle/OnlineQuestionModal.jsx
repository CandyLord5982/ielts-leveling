import { useState, useEffect, useRef, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Radio, Eye, LayoutDashboard, Minimize2 } from 'lucide-react'
import { supabase } from '../../supabase/client'
import { QuestionContent } from '../livebattle/QuestionModal'
import { TEAMS, teamName, optionLetter } from './onlineBattleShared'

// Teacher side of a live question in an Online Battle: show one multiple choice question
// on every student's screen, watch answers arrive, then reveal and award team points.
//
// A team earns points_max x (members who answered correctly / members in the room),
// so a bigger team has no advantage and everyone needs to answer.
//
// Hide (`hidden` / `onHide`): tucks this window away on the teacher's screen only, keeping
// the exercise, the question number and the settings. It stays mounted while hidden, so an
// open question keeps counting answers; the students' screens don't change.

const TIME_OPTIONS = [10, 15, 20, 30, 45, 60, 90]
const POINT_OPTIONS = [5, 10, 20, 50]

const OnlineQuestionModal = ({
  exercise, room, participants, answeredTick, saveRoom, awardPoints, onClose,
  hidden = false, onHide, onStatus,
}) => {
  const questions = exercise?.content?.questions || []
  const roomId = room.id
  const [index, setIndex] = useState(0)
  const [live, setLive] = useState(null) // the online_battle_questions row for the current question
  const [answers, setAnswers] = useState([])
  const [timeLimit, setTimeLimit] = useState(30)
  const [pointsMax, setPointsMax] = useState(10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [nowMs, setNowMs] = useState(Date.now())

  const serverOffsetRef = useRef(0) // server clock minus this computer's clock
  const liveRef = useRef(null)
  liveRef.current = live

  const q = questions[index]
  const isOpen = live?.status === 'open'
  const isRevealed = live?.status === 'revealed'

  const loadAnswers = useCallback(async (questionId) => {
    const { data, error: err } = await supabase
      .from('online_battle_answers')
      .select('user_id, team, selected_option, is_correct')
      .eq('question_id', questionId)
    if (err) throw err
    // Ignore a slow response for a question we've already moved on from
    if (liveRef.current?.id === questionId) setAnswers(data || [])
    return data || []
  }, [])

  // A student pinged that they answered
  useEffect(() => {
    const current = liveRef.current
    if (answeredTick > 0 && current?.status === 'open') loadAnswers(current.id).catch(() => {})
  }, [answeredTick, loadAnswers])

  // While a question is open: tick the countdown and poll answers (a ping can be missed)
  useEffect(() => {
    if (!isOpen) return
    const questionId = live.id
    const tick = setInterval(() => setNowMs(Date.now()), 250)
    // Backup only: each student's 'answered' ping already triggers a reload
    const poll = setInterval(() => { loadAnswers(questionId).catch(() => {}) }, 5000)
    return () => { clearInterval(tick); clearInterval(poll) }
  }, [isOpen, live?.id, loadAnswers])

  // Lets the teacher page label its "Resume" button (question number, still open?)
  useEffect(() => {
    onStatus?.({ index, total: questions.length, isOpen })
  }, [index, questions.length, isOpen, onStatus])

  const remaining = isOpen
    ? Math.max(0, Math.ceil((new Date(live.closes_at).getTime() - (nowMs + serverOffsetRef.current)) / 1000))
    : 0

  const cancelOpenQuestions = async () => {
    const { error: err } = await supabase
      .from('online_battle_questions')
      .update({ status: 'cancelled' })
      .eq('room_id', roomId)
      .eq('status', 'open')
    if (err) throw err
  }

  const goLive = async () => {
    if (busy || !q) return
    if (!Number.isInteger(q.correct_answer) || !Array.isArray(q.options) || q.options.length < 2
      || q.correct_answer < 0 || q.correct_answer >= q.options.length) {
      setError('This question has no valid correct answer set, so it cannot go live.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await cancelOpenQuestions() // anything left open, e.g. after a page refresh

      const { data, error: insertErr } = await supabase
        .from('online_battle_questions')
        .insert({
          room_id: roomId,
          exercise_id: exercise.id,
          exercise_title: exercise.title,
          question_index: index,
          question: { question: q.question ?? '', options: q.options, image_url: q.image_url || null },
          correct_answer: q.correct_answer,
          time_limit_seconds: timeLimit,
          points_max: pointsMax,
        })
        .select()
        .single()
      if (insertErr) throw insertErr

      serverOffsetRef.current = new Date(data.opened_at).getTime() - Date.now()
      setNowMs(Date.now())
      setAnswers([])
      setLive(data)
      await saveRoom({ current_question_id: data.id }) // switches the students' screens
    } catch (e) {
      setError(`Could not start the question: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const reveal = async () => {
    if (busy || !isOpen) return
    setBusy(true)
    setError('')
    try {
      const rows = await loadAnswers(live.id)
      const teamOf = {}
      participants.forEach(p => { teamOf[p.user_id] = p.team })
      const answerTeam = (r) => teamOf[r.user_id] ?? r.team

      const tally = {}
      TEAMS.forEach(team => {
        const answered = rows.filter(r => answerTeam(r) === team)
        const members = participants.filter(p => p.team === team).length
        const total = Math.max(members, answered.length)
        const correct = answered.filter(r => r.is_correct).length
        const points = total > 0 ? Math.round(live.points_max * correct / total) : 0
        tally[team] = { total, correct, points }
      })

      // `status = open` guard: a second click (or a second tab) must not award points twice
      const { data, error: updateErr } = await supabase
        .from('online_battle_questions')
        .update({
          status: 'revealed',
          team_a_total: tally.a.total, team_a_correct: tally.a.correct, team_a_points: tally.a.points,
          team_b_total: tally.b.total, team_b_correct: tally.b.correct, team_b_points: tally.b.points,
        })
        .eq('id', live.id)
        .eq('status', 'open')
        .select()
        .maybeSingle()
      if (updateErr) throw updateErr
      if (!data) {
        setError('This question was already closed.')
        setLive(null)
        return
      }

      setLive(data)
      // Also logs the activity and tells the students to refresh
      await awardPoints({ a: tally.a.points, b: tally.b.points, questionId: live.id })
    } catch (e) {
      setError(`Could not reveal the answer: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  // Send the students back to the scoreboard, closing whatever is on screen
  const backToScoreboard = async () => {
    if (liveRef.current?.status === 'open') await cancelOpenQuestions()
    await saveRoom({ current_question_id: null })
    setLive(null)
    setAnswers([])
  }

  const handleClose = async () => {
    if (isOpen && !window.confirm('A question is still open. Close it without awarding points?')) return
    try { if (liveRef.current) await backToScoreboard() } catch { /* closing anyway */ }
    onClose()
  }

  const goTo = async (nextIndex) => {
    if (isOpen || busy || nextIndex < 0 || nextIndex >= questions.length) return
    try { if (liveRef.current) await backToScoreboard() } catch { /* next Go Live retries */ }
    setIndex(nextIndex)
    setError('')
  }

  if (questions.length === 0) return null

  const teamOfUser = {}
  participants.forEach(p => { teamOfUser[p.user_id] = p.team })
  const answeredBy = (team) => answers.filter(a => (teamOfUser[a.user_id] ?? a.team) === team).length
  const membersOf = (team) => participants.filter(p => p.team === team).length
  const optionCounts = (q?.options || []).map((_, i) => answers.filter(a => a.selected_option === i).length)

  return (
    // z-[57]: above the slides (z-50) and their drawing toolbar, below the chat (z-60)
    <div className={`fixed inset-0 z-[57] items-center justify-center bg-black/40 ${hidden ? 'hidden' : 'flex'}`}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col w-[90%] max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50 rounded-t-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <Radio className={`w-4 h-4 flex-shrink-0 ${isOpen ? 'text-red-500 animate-pulse' : 'text-rose-500'}`} />
            <span className="font-bold text-gray-800 truncate text-sm">Live Question · {exercise.title}</span>
            <span className="text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full flex-shrink-0">
              {index + 1} / {questions.length}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onHide && (
              <button
                onClick={onHide}
                className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-gray-200 rounded-lg text-sm font-semibold text-gray-600"
                title="Hide this window and keep your place. Students' screens don't change."
              >
                <Minimize2 className="w-4 h-4" />
                Hide
              </button>
            )}
            <button onClick={handleClose} className="p-1.5 hover:bg-gray-200 rounded-lg" title="Close (pick an exercise again next time)">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Question */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <QuestionContent exerciseType="multiple_choice" q={q} showAnswer={isRevealed} />

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          {!live && (
            <p className="text-center text-sm text-gray-500">
              Students are looking at the scoreboard. Press Go Live to put this question on their screens.
            </p>
          )}

          {isOpen && (
            <div className="flex items-center justify-center gap-8 rounded-xl bg-gray-900 text-white px-6 py-4">
              <div className="text-center">
                <div className="text-xs uppercase text-gray-400 font-semibold">Time left</div>
                <div className={`text-5xl font-black tabular-nums ${remaining <= 5 ? 'text-red-400' : ''}`}>{remaining}</div>
              </div>
              <div className="text-center">
                <div className="text-xs uppercase text-gray-400 font-semibold">Answered</div>
                <div className="text-2xl font-black">
                  <span className="text-red-400">{teamName(room, 'a')} {answeredBy('a')}/{membersOf('a')}</span>
                  <span className="text-gray-500 mx-3">·</span>
                  <span className="text-blue-400">{teamName(room, 'b')} {answeredBy('b')}/{membersOf('b')}</span>
                </div>
              </div>
            </div>
          )}

          {isRevealed && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                {TEAMS.map(team => {
                  const total = live[`team_${team}_total`] ?? 0
                  const correct = live[`team_${team}_correct`] ?? 0
                  const points = live[`team_${team}_points`] ?? 0
                  const color = team === 'a' ? 'border-red-200 bg-red-50 text-red-600' : 'border-blue-200 bg-blue-50 text-blue-600'
                  return (
                    <div key={team} className={`rounded-xl border-2 p-4 text-center ${color}`}>
                      <div className="text-sm font-bold">{teamName(room, team)}</div>
                      <div className="text-4xl font-black">+{points}</div>
                      <div className="text-sm font-semibold text-gray-600">
                        {total > 0 ? `${correct} of ${total} correct (${Math.round(100 * correct / total)}%)` : 'Nobody on this team'}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-wrap justify-center gap-2 text-sm">
                {optionCounts.map((count, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-full font-bold ${i === live.correct_answer ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {optionLetter(i)}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
          <button
            onClick={() => goTo(index - 1)}
            disabled={isOpen || busy || index === 0}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 rounded-lg text-sm font-semibold text-gray-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>

          <div className="flex items-center gap-3">
            {!live && (
              <>
                <label className="flex items-center gap-1 text-sm text-gray-600">
                  Time
                  <select
                    value={timeLimit}
                    onChange={e => setTimeLimit(Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  >
                    {TIME_OPTIONS.map(s => <option key={s} value={s}>{s}s</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-sm text-gray-600" title="Points a team earns when everyone on it answers correctly">
                  Max points
                  <select
                    value={pointsMax}
                    onChange={e => setPointsMax(Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  >
                    {POINT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <button
                  onClick={goLive}
                  disabled={busy}
                  className="flex items-center gap-2 px-5 py-1.5 rounded-lg text-sm font-bold bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50 transition-colors"
                >
                  <Radio className="w-4 h-4" />
                  {busy ? 'Starting...' : 'Go Live'}
                </button>
              </>
            )}
            {isOpen && (
              <button
                onClick={reveal}
                disabled={busy}
                className="flex items-center gap-2 px-5 py-1.5 rounded-lg text-sm font-bold bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
              >
                <Eye className="w-4 h-4" />
                {busy ? 'Revealing...' : remaining === 0 ? 'Time is up · Reveal Answer' : 'Reveal Answer'}
              </button>
            )}
            {isRevealed && (
              <button
                onClick={() => backToScoreboard().catch(e => setError(`Could not switch back: ${e.message}`))}
                className="flex items-center gap-2 px-5 py-1.5 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
              >
                <LayoutDashboard className="w-4 h-4" />
                Show Scoreboard
              </button>
            )}
          </div>

          <button
            onClick={() => goTo(index + 1)}
            disabled={isOpen || busy || index === questions.length - 1}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 rounded-lg text-sm font-semibold text-gray-700 transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default OnlineQuestionModal
