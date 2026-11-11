import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabase/client'
import RichTextRenderer, { RichTextWithAudio } from '../ui/RichTextRenderer'
import LoadingSpinner from '../ui/LoadingSpinner'
import { nextSchedule, dueDateFromInterval, ratingFromCorrectness, RATING } from '../../utils/srs'
import { ArrowLeft, CheckCircle, XCircle, RotateCcw } from 'lucide-react'

// Spaced-repetition review for previously-missed multiple-choice questions.
// Source of truth for "what's missed" is question_attempts (no new write paths
// added to the exercise components); question_reviews only holds SM-2 schedule state.
const BATCH_SIZE = 20

const ReviewQueue = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [sessionDone, setSessionDone] = useState(false)
  const [stats, setStats] = useState({ correct: 0, total: 0 })

  useEffect(() => {
    if (user) loadQueue()
  }, [user])

  const loadQueue = async () => {
    setLoading(true)
    try {
      // 1. Latest multiple-choice attempt per question, keep the ones currently wrong
      const { data: attempts, error: attemptsErr } = await supabase
        .from('question_attempts')
        .select('exercise_id, question_id, is_correct, created_at')
        .eq('user_id', user.id)
        .eq('exercise_type', 'multiple_choice')
        .order('created_at', { ascending: false })

      if (attemptsErr) throw attemptsErr

      const latestByKey = new Map()
      for (const a of attempts || []) {
        const key = `${a.exercise_id}:${a.question_id}`
        if (!latestByKey.has(key)) latestByKey.set(key, a)
      }
      const wrongAttempts = [...latestByKey.values()].filter((a) => a.is_correct === false)

      if (wrongAttempts.length === 0) {
        setQueue([])
        return
      }

      // 2. Existing SM-2 schedule state for those questions
      const exerciseIds = [...new Set(wrongAttempts.map((a) => a.exercise_id))]
      const { data: reviews, error: reviewsErr } = await supabase
        .from('question_reviews')
        .select('*')
        .eq('user_id', user.id)
        .in('exercise_id', exerciseIds)

      if (reviewsErr) throw reviewsErr
      const reviewByKey = new Map((reviews || []).map((r) => [`${r.exercise_id}:${r.question_id}`, r]))

      // 3. Due = never scheduled (new) or due_at has passed
      const now = Date.now()
      const dueAttempts = wrongAttempts
        .filter((a) => {
          const r = reviewByKey.get(`${a.exercise_id}:${a.question_id}`)
          return !r || new Date(r.due_at).getTime() <= now
        })
        .slice(0, BATCH_SIZE)

      if (dueAttempts.length === 0) {
        setQueue([])
        return
      }

      // 4. Reconstruct the actual question from the exercise's content
      const dueExerciseIds = [...new Set(dueAttempts.map((a) => a.exercise_id))]
      const { data: exercises, error: exErr } = await supabase
        .from('exercises')
        .select('id, title, content')
        .in('id', dueExerciseIds)

      if (exErr) throw exErr
      const exerciseById = new Map((exercises || []).map((e) => [e.id, e]))

      const items = []
      for (const a of dueAttempts) {
        const ex = exerciseById.get(a.exercise_id)
        const q = ex?.content?.questions?.find((cq) => cq.id === a.question_id)
        if (!ex || !q) continue // exercise or question was since deleted - skip

        const existing = reviewByKey.get(`${a.exercise_id}:${a.question_id}`)
        items.push({
          exerciseId: a.exercise_id,
          exerciseTitle: ex.title,
          exerciseIntro: ex.content?.intro,
          questionId: a.question_id,
          // Same layout setting as the original exercise: 'split' = question left, options right
          splitLayout: ex.content?.settings?.layout === 'split',
          questionIntro: q.intro,
          question: q.question,
          audioUrl: q.audio_url,
          maxAudioPlays: q.max_audio_plays || 0,
          options: q.options || [],
          correctAnswer: q.correct_answer,
          explanation: q.explanation,
          optionExplanations: q.option_explanations,
          schedule: existing
            ? { repetitions: existing.repetitions, intervalDays: existing.interval_days, easeFactor: existing.ease_factor }
            : { repetitions: 0, intervalDays: 0, easeFactor: 2.5 },
          lapses: existing?.lapses || 0,
        })
      }

      setQueue(items)
      setIndex(0)
      setSelected(null)
      setRevealed(false)
      setSessionDone(false)
      setStats({ correct: 0, total: 0 })
    } catch (err) {
      console.error('Error loading review queue:', err)
      setQueue([])
    } finally {
      setLoading(false)
    }
  }

  const current = queue[index]

  const handleSubmit = async () => {
    if (selected === null || !current) return
    const isCorrect = selected === current.correctAnswer
    setRevealed(true)
    setStats((s) => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }))

    const rating = ratingFromCorrectness(isCorrect)
    const next = nextSchedule(current.schedule, rating)
    const dueAt = dueDateFromInterval(next.intervalDays)
    const lapses = current.lapses + (rating === RATING.AGAIN ? 1 : 0)
    const nowIso = new Date().toISOString()

    try {
      await supabase.from('question_reviews').upsert(
        {
          user_id: user.id,
          exercise_id: current.exerciseId,
          question_id: current.questionId,
          ease_factor: next.easeFactor,
          interval_days: next.intervalDays,
          repetitions: next.repetitions,
          lapses,
          due_at: dueAt.toISOString(),
          last_reviewed_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'user_id,exercise_id,question_id' },
      )

      // Keep this consistent with the rest of the app's analytics trail
      await supabase.from('question_attempts').insert({
        user_id: user.id,
        exercise_id: current.exerciseId,
        exercise_type: 'multiple_choice',
        question_id: current.questionId,
        selected_answer: current.options[selected],
        correct_answer: current.options[current.correctAnswer],
        is_correct: isCorrect,
        attempt_number: current.schedule.repetitions + 1,
      })
    } catch (err) {
      console.error('Error saving review result:', err)
    }
  }

  const handleNext = () => {
    if (index + 1 >= queue.length) {
      setSessionDone(true)
      return
    }
    setIndex((i) => i + 1)
    setSelected(null)
    setRevealed(false)
  }

  // Keyboard: A-D / 1-4 pick an option, Enter submits, Enter again goes to the next question.
  useEffect(() => {
    if (!current || sessionDone) return
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return
      if (e.key === 'Enter') {
        e.preventDefault()
        if (revealed) handleNext()
        else if (selected !== null) handleSubmit()
        return
      }
      if (revealed) return
      const k = e.key.toLowerCase()
      const i = '1234'.includes(k) ? Number(k) - 1 : 'abcd'.indexOf(k)
      if (i >= 0 && i < current.options.length) setSelected(i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const header = (
    <div className="flex items-center justify-between mb-6">
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Trang chủ
      </button>
      {queue.length > 0 && !sessionDone && (
        <span className="text-sm text-gray-500">{index + 1} / {queue.length}</span>
      )}
    </div>
  )

  if (queue.length === 0) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        {header}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Không có gì cần ôn tập!</h2>
          <p className="text-sm text-gray-500">Mọi câu hỏi bạn từng làm sai đã được ôn lại hoặc chưa đến hạn.</p>
        </div>
      </div>
    )
  }

  if (sessionDone) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        {header}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <RotateCcw className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Hoàn thành!</h2>
          <p className="text-sm text-gray-500 mb-4">
            Đúng {stats.correct}/{stats.total} câu.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            Về trang chủ
          </button>
        </div>
      </div>
    )
  }

  const split = current.splitLayout
  const explanation = revealed
    ? current.optionExplanations?.[selected] || current.explanation
    : null

  return (
    // Width follows the original exercise: split layouts get room for two columns
    <div className={`${split ? 'max-w-6xl' : 'max-w-4xl'} mx-auto py-8 px-4`}>
      {header}

      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 truncate">{current.exerciseTitle}</p>

      {/* Passage / exercise intro in its own card, same as the original exercise */}
      {current.exerciseIntro && String(current.exerciseIntro).trim() && (
        <div className="mb-6 rounded-lg p-4 md:p-6 bg-white shadow-sm border border-gray-200">
          <RichTextWithAudio content={current.exerciseIntro} allowImages allowLinks={false} />
        </div>
      )}

      {/* Question card (same frame as MultipleChoiceExercise) */}
      <div className="relative bg-white rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.1),0_10px_20px_rgba(0,0,0,0.05)]">
        <div className="absolute top-4 right-6 md:right-10 flex gap-2 z-20">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <div className="w-3 h-3 rounded-full bg-purple-500" />
          <div className="w-3 h-3 rounded-full bg-pink-500" />
        </div>

        <div className="relative z-10 p-4 md:p-8 pt-8 border-l-4 border-blue-400 rounded-l-lg">
          <div className={split ? 'space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-6 md:items-start' : 'space-y-4 md:space-y-6'}>
            {/* Question */}
            <div className="mb-2">
              {current.questionIntro && String(current.questionIntro).trim() && (
                <div className="mb-4">
                  <RichTextWithAudio content={current.questionIntro} allowImages allowLinks={false} />
                </div>
              )}
              <RichTextWithAudio
                content={
                  current.audioUrl
                    ? `${current.question}<audio src="${current.audioUrl}" data-max-plays="${current.maxAudioPlays}"></audio>`
                    : current.question
                }
                allowImages
                allowLinks={false}
                style={{ fontSize: '1.125rem', fontWeight: 400, color: '#1f2937', lineHeight: 1.75 }}
              />
            </div>

            {/* Options: stacked on the right in split layout, 2 columns under the question otherwise */}
            <div className={split ? 'md:pt-4' : ''}>
              <div className={`grid grid-cols-1 ${split ? '' : 'md:grid-cols-2'} gap-3 md:gap-4`}>
                {current.options.map((option, optIndex) => {
                  const isSelected = selected === optIndex
                  const isAnswerCorrect = optIndex === current.correctAnswer
                  let face = 'bg-white border-gray-200 text-gray-900'
                  let base = '#e5e7eb'
                  if (revealed) {
                    if (isAnswerCorrect) { face = 'border-green-500 bg-green-50 text-green-900'; base = '#22c55e' }
                    else if (isSelected) { face = 'border-red-500 bg-red-50 text-red-900'; base = '#ef4444' }
                    else face = 'border-gray-200 bg-gray-50 text-gray-500 opacity-60'
                  } else if (isSelected) {
                    face = 'border-blue-500 bg-blue-50 text-blue-900'
                    base = '#3b82f6'
                  }

                  return (
                    <button
                      key={optIndex}
                      onClick={() => !revealed && setSelected(optIndex)}
                      // aria-disabled (not disabled) keeps text selectable for the double-click dictionary
                      aria-disabled={revealed}
                      className={`group w-full rounded-xl text-left ${revealed ? 'cursor-default select-text' : ''}`}
                      style={{ backgroundColor: base, borderRadius: '0.75em' }}
                    >
                      <div
                        className={`flex items-center gap-3 w-full border-2 rounded-xl px-5 py-3 md:py-4 text-base md:text-lg transition-transform duration-100 ${face} ${
                          revealed ? '' : '-translate-y-[0.2em] group-hover:-translate-y-[0.33em] group-active:translate-y-0'
                        }`}
                      >
                        <span className="flex-1">
                          <RichTextWithAudio content={option} allowImages allowLinks={false} />
                        </span>
                        {revealed && isAnswerCorrect && <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />}
                        {revealed && isSelected && !isAnswerCorrect && <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Explanation (from the exercise) + actions span both columns in split layout */}
            <div className={`space-y-4 ${split ? 'md:col-span-2' : ''}`}>
              {explanation && (
                <div className="p-4 md:p-5 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-2 text-sm md:text-base">Giải thích:</h3>
                  <RichTextRenderer
                    content={explanation}
                    className="text-blue-800 text-sm md:text-base leading-relaxed"
                    allowImages
                    allowLinks={false}
                  />
                </div>
              )}

              <div className="flex justify-end">
                {!revealed ? (
                  <button
                    onClick={handleSubmit}
                    disabled={selected === null}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Trả lời
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                  >
                    Tiếp theo <span className="ml-1 text-xs opacity-70">↵</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReviewQueue
