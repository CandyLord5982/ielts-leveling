import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabase/client'
import LoadingSpinner from '../ui/LoadingSpinner'
import { nextSchedule, dueDateFromInterval, ratingFromCorrectness, RATING } from '../../utils/srs'
import { ArrowLeft, CheckCircle, XCircle, RotateCcw } from 'lucide-react'

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
  const [results, setResults] = useState({}) // id -> { choice, type }
  const inputRef = useRef(null)

  useEffect(() => {
    if (user) load()
  }, [user])

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
      setPhase(all.length >= MIN_WORDS_FOR_CHOICE ? 'choice' : 'type')
      setIndex(0)
      setResults({})
    } catch (err) {
      console.error('Error loading saved words:', err)
      setWords([])
    } finally {
      setLoading(false)
    }
  }

  const current = words[index]

  const options = useMemo(() => {
    if (!current || phase !== 'choice') return []
    const distractors = shuffle(pool.filter((w) => w.id !== current.id)).slice(0, 3)
    return shuffle([current, ...distractors])
  }, [current, phase, pool])

  useEffect(() => {
    if (phase === 'type' && !revealed) inputRef.current?.focus()
  }, [phase, index, revealed])

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
    setResults((r) => ({ ...r, [current.id]: { ...r[current.id], choice: opt.id === current.id } }))
  }

  const handleType = (e) => {
    e?.preventDefault()
    if (revealed || !typed.trim()) return
    const ok = typed.trim().toLowerCase() === current.word
    setRevealed(true)
    const res = { ...results[current.id], type: ok }
    setResults((r) => ({ ...r, [current.id]: res }))
    // Phase 1 may have been skipped (too few words), so undefined choice counts as fine.
    saveResult(current, res.choice !== false && ok)
  }

  const handleNext = () => {
    setSelected(null)
    setTyped('')
    setRevealed(false)
    if (index + 1 < words.length) {
      setIndex((i) => i + 1)
    } else if (phase === 'choice') {
      setPhase('type')
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
            {phase === 'choice' ? 'Chọn từ' : 'Gõ từ'} · {index + 1} / {words.length}
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

  const lastCorrect = revealed && phase === 'type' ? results[current.id]?.type : null

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {header}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        {current.part_of_speech && (
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-2">{current.part_of_speech}</p>
        )}
        <p data-no-lookup className="text-base font-medium text-gray-900 mb-5">
          {maskWord(current.definition, current.word)}
        </p>

        {phase === 'choice' ? (
          <div className="space-y-2">
            {options.map((opt) => {
              const isAnswer = opt.id === current.id
              let style = 'border-gray-200 hover:border-gray-300'
              if (revealed) {
                if (isAnswer) style = 'border-green-400 bg-green-50'
                else if (selected === opt.id) style = 'border-red-400 bg-red-50'
              }
              return (
                <button
                  key={opt.id}
                  onClick={() => handleChoice(opt)}
                  disabled={revealed}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors flex items-center justify-between gap-3 ${style}`}
                >
                  <span>{opt.word}</span>
                  {revealed && isAnswer && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
                  {revealed && selected === opt.id && !isAnswer && <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
                </button>
              )
            })}
          </div>
        ) : (
          <form onSubmit={handleType}>
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={revealed}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Gõ từ tiếng Anh..."
              className={`w-full px-4 py-3 rounded-xl border-2 outline-none transition-colors ${
                revealed
                  ? lastCorrect ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'
                  : 'border-gray-200 focus:border-blue-500'
              }`}
            />
            {revealed && !lastCorrect && (
              <p className="mt-2 text-sm text-gray-600">
                Đáp án: <span className="font-semibold text-green-700">{current.word}</span>
              </p>
            )}
          </form>
        )}

        {revealed && current.example && (
          <p className="mt-4 text-sm text-gray-400 italic">&ldquo;{current.example}&rdquo;</p>
        )}

        <div className="mt-6 flex justify-end">
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
              autoFocus
              onClick={handleNext}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Tiếp theo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default VocabReview
