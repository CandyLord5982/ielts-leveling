import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabase/client'
import LoadingSpinner from '../ui/LoadingSpinner'
import { nextSchedule, dueDateFromInterval, ratingFromCorrectness, RATING } from '../../utils/srs'
import { clearReviewDueCache } from '../../utils/reviewDue'
import { playReviewCorrect, playReviewWrong } from '../../utils/reviewSounds'
import { ArrowLeft, CheckCircle, XCircle, RotateCcw, Plus, Lightbulb } from 'lucide-react'

// Quizlet-style review of words saved from the dictionary popup.
// Phase 1: show meaning -> pick the word. Phase 2: show meaning -> type the word.
// A word counts as "good" for SM-2 only if both answers were right.
const BATCH_SIZE = 20
const MIN_WORDS_FOR_CHOICE = 4 // 1 answer + 3 distractors

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Hide the answer if the definition happens to contain it (or a simple inflection).
const maskWord = (text, word) => {
  const stem = word.replace(/(e|y)$/, '')
  const re = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'gi')
  return text.replace(re, '_____')
}

const VocabReview = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [words, setWords] = useState([]) // due words
  const [pool, setPool] = useState([]) // every saved word, for distractors
  const [phase, setPhase] = useState('choice') // choice | type | done
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [typed, setTyped] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [results, setResults] = useState({}) // id -> { choice, type } — first attempt only
  const [queue, setQueue] = useState([]) // words still to answer this phase; missed words get re-added
  const [mastered, setMastered] = useState(0) // words answered correctly this phase
  const [hintCount, setHintCount] = useState(0) // letters revealed by the hint button
  const inputRef = useRef(null)

  useEffect(() => {
    if (user) load()
  }, [user])

  // Dashboard red dot should re-check after a review session
  useEffect(() => () => { if (user) clearReviewDueCache(user.id) }, [user])

  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('saved_words')
        .select('*')
        .eq('user_id', user.id)
        .order('due_at', { ascending: true })
      if (error) throw error

      const all = data || []
      const due = shuffle(all.filter((w) => new Date(w.due_at).getTime() <= Date.now())).slice(0, BATCH_SIZE)
      setPool(all)
      setWords(due)
      setQueue(due)
      setPhase(all.length >= MIN_WORDS_FOR_CHOICE ? 'choice' : 'type')
      setIndex(0)
      setMastered(0)
      setResults({})
    } catch (err) {
      console.error('Error loading saved words:', err)
      setWords([])
    } finally {
      setLoading(false)
    }
  }

  const current = queue[index]

  // index is a dep so a re-queued word gets freshly shuffled options.
  const options = useMemo(() => {
    if (!current || phase !== 'choice') return []
    const distractors = shuffle(pool.filter((w) => w.id !== current.id)).slice(0, 3)
    return shuffle([current, ...distractors])
  }, [current, phase, pool, index]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === 'type' && !revealed) inputRef.current?.focus()
  }, [phase, index, revealed])

  // A-D or 1-4 picks an option in the multiple-choice phase.
  useEffect(() => {
    if (phase !== 'choice' || revealed) return
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      const i = '1234'.includes(k) ? Number(k) - 1 : 'abcd'.indexOf(k)
      if (i >= 0 && options[i]) handleChoice(options[i])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Enter = "Tiếp theo" once the answer is shown. A window listener instead of autoFocus:
  // the Next button replaces "Trả lời" in the same spot, so React reuses that node and
  // autoFocus never fires in the typing phase.
  useEffect(() => {
    if (!revealed || phase === 'done') return
    const onKey = (e) => {
      if (e.key !== 'Enter' || e.repeat) return
      e.preventDefault()
      handleNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const saveResult = async (word, ok) => {
    const rating = ratingFromCorrectness(ok)
    const next = nextSchedule(
      { repetitions: word.repetitions, intervalDays: Number(word.interval_days), easeFactor: Number(word.ease_factor) },
      rating,
    )
    const { error } = await supabase
      .from('saved_words')
      .update({
        ease_factor: next.easeFactor,
        interval_days: next.intervalDays,
        repetitions: next.repetitions,
        lapses: word.lapses + (rating === RATING.AGAIN ? 1 : 0),
        due_at: dueDateFromInterval(next.intervalDays).toISOString(),
        last_reviewed_at: new Date().toISOString(),
      })
      .eq('id', word.id)
    if (error) console.error('Error saving review result:', error)
  }

  const handleChoice = (opt) => {
    if (revealed) return
    setSelected(opt.id)
    setRevealed(true)
    if (opt.id === current.id) playReviewCorrect()
    else playReviewWrong()
    // Only the first attempt counts toward the score / SRS.
    if (results[current.id]?.choice === undefined) {
      setResults((r) => ({ ...r, [current.id]: { ...r[current.id], choice: opt.id === current.id } }))
    }
  }

  const handleType = (e) => {
    e?.preventDefault()
    if (revealed || !typed.trim()) return
    const ok = typed.trim().toLowerCase() === current.word.toLowerCase()
    setRevealed(true)
    if (ok) playReviewCorrect()
    else playReviewWrong()
    if (results[current.id]?.type === undefined) {
      // Using a hint means it wasn't recalled on its own.
      const res = { ...results[current.id], type: ok && hintCount === 0 }
      setResults((r) => ({ ...r, [current.id]: res }))
      // Phase 1 may have been skipped (too few words), so undefined choice counts as fine.
      saveResult(current, res.choice !== false && res.type)
    }
  }

  const showHint = () => {
    if (revealed) return
    setHintCount((n) => Math.min(n + 1, current.word.length - 1))
    inputRef.current?.focus()
  }

  // Quizlet-style: a missed word comes back a few cards later until it's answered right.
  const REQUEUE_GAP = 3
  const handleNext = () => {
    const wasRight = phase === 'choice' ? selected === current.id : typed.trim().toLowerCase() === current.word.toLowerCase()
    let nextQueue = queue
    if (wasRight) {
      setMastered((m) => m + 1)
    } else {
      nextQueue = [...queue]
      nextQueue.splice(Math.min(index + 1 + REQUEUE_GAP, nextQueue.length), 0, current)
      setQueue(nextQueue)
    }

    setSelected(null)
    setTyped('')
    setHintCount(0)
    setRevealed(false)
    if (index + 1 < nextQueue.length) {
      setIndex((i) => i + 1)
    } else if (phase === 'choice') {
      setPhase('type')
      setQueue(shuffle(words))
      setMastered(0)
      setIndex(0)
    } else {
      setPhase('done')
    }
  }

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
      <div className="flex items-center gap-4">
        {words.length > 0 && phase !== 'done' && (
          <span className="text-sm text-gray-500">
            {phase === 'choice' ? 'Chọn từ' : 'Gõ từ'} · Đã thuộc {mastered} / {words.length}
          </span>
        )}
        <button onClick={() => navigate('/review/vocab/words')} className="text-sm text-blue-600 hover:text-blue-800">
          Danh sách từ
        </button>
      </div>
    </div>
  )

  if (words.length === 0) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        {header}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">
            {pool.length === 0 ? 'Chưa có từ nào được lưu' : 'Không có từ nào cần ôn tập!'}
          </h2>
          <p className="text-sm text-gray-500">
            {pool.length === 0
              ? 'Nhấp đúp vào một từ bất kỳ để tra nghĩa, rồi bấm "Lưu từ".'
              : 'Các từ đã lưu của bạn chưa đến hạn ôn lại.'}
          </p>
          <button
            onClick={() => navigate('/review/vocab/words', { state: { add: true } })}
            className="mt-5 inline-flex items-center gap-1 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Thêm từ
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    const total = words.length
    const correct = words.filter((w) => results[w.id]?.choice !== false && results[w.id]?.type).length
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        {header}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <RotateCcw className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Hoàn thành!</h2>
          <p className="text-sm text-gray-500 mb-4">Đúng cả hai phần: {correct}/{total} từ.</p>
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

  // Judge what's on screen by this attempt's answer. `results` holds the first attempt
  // (hint-adjusted) for SRS, so using it here marked hinted or retried correct answers as wrong.
  const lastCorrect = revealed && phase === 'type'
    ? typed.trim().toLowerCase() === current.word.toLowerCase()
    : null
  const usedHint = hintCount > 0
  const wasCorrect = !revealed ? null : phase === 'choice' ? selected === current.id : lastCorrect
  const progress = ((mastered + (wasCorrect ? 1 : 0)) / words.length) * 100
  const isRetry = queue.indexOf(current) < index // same word appeared earlier this phase

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {header}

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-6">
        <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden">
        {/* Question */}
        <div className="px-6 pt-6 pb-5 bg-gradient-to-b from-blue-50 to-white border-b border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <span className="px-2.5 py-1 rounded-full bg-blue-600 text-white text-xs font-semibold">
              Câu {index + 1}
            </span>
            {isRetry && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                <RotateCcw className="w-3 h-3" /> Thử lại
              </span>
            )}
            {current.part_of_speech && (
              <span className="px-2.5 py-1 rounded-full bg-white border border-blue-200 text-blue-700 text-xs font-medium italic">
                {current.part_of_speech}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-500 mb-2">
            {phase === 'choice' ? 'Từ nào có nghĩa sau?' : 'Gõ từ tiếng Anh có nghĩa sau:'}
          </p>
          <p data-no-lookup className="text-xl sm:text-2xl font-semibold text-gray-900 leading-snug">
            {maskWord(current.definition, current.word)}
          </p>
        </div>

        {/* Answer area */}
        <div className="p-6">
          {phase === 'choice' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {options.map((opt, i) => {
                const isAnswer = opt.id === current.id
                let style = 'border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 hover:-translate-y-0.5 hover:shadow-sm'
                let badge = 'bg-gray-100 text-gray-600'
                if (revealed) {
                  if (isAnswer) {
                    style = 'border-green-500 bg-green-50'
                    badge = 'bg-green-500 text-white'
                  } else if (selected === opt.id) {
                    style = 'border-red-400 bg-red-50'
                    badge = 'bg-red-500 text-white'
                  } else {
                    style = 'border-gray-200 bg-white opacity-50'
                  }
                }
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleChoice(opt)}
                    disabled={revealed}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all flex items-center gap-3 ${style}`}
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${badge}`}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex-1 text-base font-medium text-gray-900">{opt.word}</span>
                    {revealed && isAnswer && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
                    {revealed && selected === opt.id && !isAnswer && <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          ) : (
            <form onSubmit={handleType}>
              <div className="flex justify-center gap-1.5 mb-4 flex-wrap" aria-hidden>
                {current.word.split('').map((ch, i) => {
                  const hinted = !revealed && i < hintCount
                  // Ghost: what the student has typed so far, shown faintly in the blanks.
                  // Only hinted positions are checked, so the ghost never gives the answer away.
                  const ghost = !revealed ? typed[i] : undefined
                  const ghostClash = hinted && ghost && ghost.toLowerCase() !== ch.toLowerCase()
                  const isCursor = !revealed && i === typed.length
                  let style = 'border-gray-300 text-transparent'
                  let shown = '·'
                  if (ch === ' ') {
                    style = 'border-transparent'
                  } else if (revealed) {
                    style = 'border-green-500 text-green-700'
                    shown = ch
                  } else if (ghostClash) {
                    style = 'border-red-400 text-red-500'
                    shown = ghost
                  } else if (hinted) {
                    style = 'border-amber-400 text-amber-600'
                    shown = ch
                  } else if (ghost) {
                    style = 'border-blue-300 text-gray-400'
                    shown = ghost
                  } else if (isCursor) {
                    style = 'border-blue-500 text-transparent'
                  }
                  return (
                    <span
                      key={i}
                      className={`w-7 h-9 flex items-end justify-center pb-1 border-b-2 text-lg font-semibold transition-colors ${style}`}
                    >
                      {shown}
                    </span>
                  )
                })}
              </div>
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={revealed}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Gõ từ tiếng Anh..."
                className={`w-full px-4 py-3.5 rounded-xl border-2 outline-none transition-colors text-lg text-center font-medium ${
                  revealed
                    ? lastCorrect ? 'border-green-500 bg-green-50 text-green-800' : 'border-red-400 bg-red-50 text-red-700 line-through'
                    : 'border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
                }`}
              />
            </form>
          )}

          {revealed && (
            <div
              className={`mt-5 rounded-xl px-4 py-3 border ${
                wasCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}
            >
              <p className={`flex items-center gap-2 font-semibold ${wasCorrect ? 'text-green-700' : 'text-red-700'}`}>
                {wasCorrect ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                {wasCorrect ? (usedHint && phase === 'type' ? 'Chính xác! (có dùng gợi ý)' : 'Chính xác!') : <>Chưa đúng — đáp án là <span className="underline">{current.word}</span></>}
              </p>
              {current.example && (
                <p className="mt-1.5 text-sm text-gray-600 italic">&ldquo;{current.example}&rdquo;</p>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            {!revealed && phase === 'type' && (
              <button
                type="button"
                onClick={showHint}
                disabled={hintCount >= current.word.length - 1}
                className="mr-auto flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-amber-200 text-amber-700 font-medium hover:bg-amber-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Lightbulb className="w-4 h-4" /> Gợi ý
              </button>
            )}
            {!revealed ? (
              phase === 'type' && (
                <button
                  onClick={handleType}
                  disabled={!typed.trim()}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Trả lời
                </button>
              )
            ) : (
              <button
                onClick={handleNext}
                className={`px-6 py-2.5 text-white rounded-xl font-medium transition-colors ${
                  wasCorrect ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Tiếp theo <span className="ml-1 text-xs opacity-70">↵</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default VocabReview
