import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabase/client'
import LoadingSpinner from '../ui/LoadingSpinner'
import { clearReviewDueCache } from '../../utils/reviewDue'
import { MIN_LEARNED_WORDS, deckInfo, cardDefinition, cardSynonyms, savedDefinition } from '../../utils/vocabDecks'
import { ArrowLeft, Volume2, Check, X, RotateCcw, Layers, Sparkles, Gamepad2 } from 'lucide-react'

// Quizlet-style flashcards for words a student hasn't seen yet, drawn from pet_word_bank decks.
// Flip a card, then sort it: "Đã thuộc" saves it to saved_words (due now, so it shows up in
// the /review/vocab quiz right away); "Chưa thuộc" brings it back a few cards later.
const SIZES = [10, 20]
const REQUEUE_GAP = 3
const SIZE_KEY = 'vocab_learn_size'

const readSize = () => {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY))
    return SIZES.includes(n) ? n : SIZES[0]
  } catch {
    return SIZES[0]
  }
}

const speak = (text) => {
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.9
    synth.speak(u)
  } catch { /* no speech support */ }
}

const VocabLearn = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stage, setStage] = useState('decks') // decks | cards | done
  const [decks, setDecks] = useState(null) // [{ deck, total, learned }]
  const [deckError, setDeckError] = useState(false)
  const [size, setSize] = useState(readSize)
  const [deck, setDeck] = useState(null)
  const [starting, setStarting] = useState(false)
  const [batch, setBatch] = useState([])
  const [queue, setQueue] = useState([]) // cards still to sort; "Chưa thuộc" re-inserts
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [known, setKnown] = useState([]) // word ids saved this session
  const [saveError, setSaveError] = useState(false)
  const [learnedTotal, setLearnedTotal] = useState(null)

  const loadDecks = async () => {
    const { data, error } = await supabase.rpc('vocab_deck_progress')
    if (error) {
      console.error('Error loading decks:', error)
      setDeckError(true)
      setDecks([])
      return
    }
    setDeckError(false)
    setDecks((data || []).map((d) => ({ ...d, total: Number(d.total), learned: Number(d.learned) })))
  }

  useEffect(() => {
    if (user) loadDecks()
  }, [user])

  // Dashboard red dot should re-check: newly learned words are due immediately.
  useEffect(() => () => { if (user) clearReviewDueCache(user.id) }, [user])

  const chooseSize = (n) => {
    setSize(n)
    try { localStorage.setItem(SIZE_KEY, String(n)) } catch { /* storage blocked */ }
  }

  const startDeck = async (deckId) => {
    setStarting(true)
    const { data, error } = await supabase.rpc('pick_new_vocab_words', { p_deck: deckId, p_count: size })
    setStarting(false)
    if (error) {
      console.error('Error picking words:', error)
      alert('Không thể tải từ mới. Thử lại sau nhé.')
      return
    }
    if (!data?.length) {
      // Deck finished — back to the picker, which shows it as done.
      setStage('decks')
      loadDecks()
      return
    }
    setDeck(deckId)
    setBatch(data)
    setQueue(data)
    setIndex(0)
    setFlipped(false)
    setKnown([])
    setSaveError(false)
    setStage('cards')
  }

  const saveWord = async (w) => {
    const { error } = await supabase.from('saved_words').upsert(
      {
        user_id: user.id,
        word: w.word.toLowerCase(),
        definition: savedDefinition(w),
        example: w.example || null,
        part_of_speech: w.part_of_speech || null,
        phonetic: w.phonetic || null,
        bank_word_id: w.id,
      },
      // Already saved (e.g. from the dictionary popup) — keep their copy and its SRS state.
      { onConflict: 'user_id,word', ignoreDuplicates: true },
    )
    if (error) {
      console.error('Error saving learned word:', error)
      setSaveError(true)
    }
  }

  const finish = async () => {
    setStage('done')
    clearReviewDueCache(user.id)
    const { count } = await supabase
      .from('saved_words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('bank_word_id', 'is', null)
    setLearnedTotal(count ?? null)
  }

  const current = queue[index]

  const advance = (q) => {
    setFlipped(false)
    if (index + 1 < q.length) setIndex((i) => i + 1)
    else finish()
  }

  const markKnown = () => {
    if (!current) return
    if (!known.includes(current.id)) {
      setKnown((k) => [...k, current.id])
      saveWord(current)
    }
    advance(queue)
  }

  const markAgain = () => {
    if (!current) return
    const next = [...queue]
    next.splice(Math.min(index + 1 + REQUEUE_GAP, next.length), 0, current)
    setQueue(next)
    advance(next)
  }

  const stopEarly = () => {
    if (known.length > 0) finish()
    else {
      setStage('decks')
      loadDecks()
    }
  }

  // Space/Enter flips; ← or 1 = Chưa thuộc; → or 2 = Đã thuộc.
  useEffect(() => {
    if (stage !== 'cards') return
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (e.target.closest?.('input, textarea')) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (e.key === 'ArrowLeft' || e.key === '1') {
        markAgain()
      } else if (e.key === 'ArrowRight' || e.key === '2') {
        markKnown()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!decks) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // ── Deck picker ────────────────────────────────────────────────
  if (stage === 'decks') {
    return (
      <div className="max-w-xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate('/review/vocab')} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" /> Ôn tập từ vựng
          </button>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-500 mr-1">Mỗi lượt</span>
            {SIZES.map((n) => (
              <button
                key={n}
                onClick={() => chooseSize(n)}
                className={`px-3 py-1 rounded-lg border transition-colors ${
                  size === n ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {n} từ
              </button>
            ))}
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Học từ mới</h1>
        <p className="text-sm text-gray-500 mb-6">
          Lật thẻ để xem nghĩa. Từ bạn đã thuộc sẽ được thêm vào danh sách ôn tập và dùng trong trò chơi của thú cưng.
        </p>

        {decks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-500">
            {deckError ? 'Không thể tải bộ từ. Thử lại sau nhé.' : 'Chưa có bộ từ nào.'}
          </div>
        ) : (
          <div className="space-y-3">
            {decks.map((d) => {
              const info = deckInfo(d.deck)
              const pct = d.total ? Math.round((d.learned / d.total) * 100) : 0
              const remaining = d.total - d.learned
              return (
                <div key={d.deck} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Layers className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <h2 className="text-lg font-bold text-gray-900">{info.name}</h2>
                        <span className="text-sm text-gray-500 flex-shrink-0">
                          {d.learned} / {d.total} từ
                        </span>
                      </div>
                      {info.desc && <p className="text-sm text-gray-500">{info.desc}</p>}
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    {remaining > 0 ? (
                      <button
                        onClick={() => startDeck(d.deck)}
                        disabled={starting}
                        className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {starting ? 'Đang tải…' : `Học ${Math.min(size, remaining)} từ`}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
                        <Check className="w-4 h-4" /> Đã học hết bộ này
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Done ───────────────────────────────────────────────────────
  if (stage === 'done') {
    const learnedNow = batch.filter((w) => known.includes(w.id))
    const before = learnedTotal == null ? null : learnedTotal - learnedNow.length
    const justUnlocked = before != null && before < MIN_LEARNED_WORDS && learnedTotal >= MIN_LEARNED_WORDS
    const toUnlock = learnedTotal == null ? null : MIN_LEARNED_WORDS - learnedTotal
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <Sparkles className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Hoàn thành!</h2>
          <p className="text-sm text-gray-500 mb-4">Bạn vừa học {learnedNow.length} từ mới.</p>
          {learnedNow.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-5">
              {learnedNow.map((w) => (
                <span key={w.id} className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium">
                  {w.word}
                </span>
              ))}
            </div>
          )}
          {saveError && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">Một số từ chưa lưu được. Thử học lại nhé.</p>
          )}
          {justUnlocked ? (
            <p className="mb-5 flex items-center justify-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
              <Gamepad2 className="w-4 h-4" /> Đã mở khoá trò chơi luyện tập cho thú cưng!
            </p>
          ) : toUnlock > 0 ? (
            <p className="mb-5 text-sm text-gray-500">Học thêm {toUnlock} từ nữa để mở khoá trò chơi cho thú cưng.</p>
          ) : null}
          <div className="flex flex-col gap-2">
            {learnedNow.length > 0 && (
              <button
                onClick={() => navigate('/review/vocab')}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                Kiểm tra ngay
              </button>
            )}
            <button
              onClick={() => startDeck(deck)}
              disabled={starting}
              className="px-6 py-2.5 border-2 border-blue-200 text-blue-700 rounded-xl font-medium hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              {starting ? 'Đang tải…' : 'Học tiếp'}
            </button>
            <button onClick={() => navigate('/')} className="px-6 py-2 text-sm text-gray-500 hover:text-gray-700">
              Về trang chủ
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Flashcards ─────────────────────────────────────────────────
  const progress = (known.length / batch.length) * 100
  const isRetry = queue.indexOf(current) < index
  const synonyms = cardSynonyms(current)
  const faceStyle = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <button onClick={stopEarly} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> Kết thúc
        </button>
        <span className="text-sm text-gray-500">
          {deckInfo(deck).name} · Đã thuộc {known.length} / {batch.length}
        </span>
      </div>

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-6">
        <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* key remounts the card unflipped, so the next word's back never shows mid-rotation */}
      <div key={index} data-no-lookup className="h-80 sm:h-96" style={{ perspective: '1200px' }}>
        <div
          role="button"
          tabIndex={0}
          aria-label={flipped ? 'Xem mặt trước' : 'Xem nghĩa'}
          onClick={() => setFlipped((f) => !f)}
          className="relative w-full h-full cursor-pointer select-none transition-transform duration-500 outline-none"
          style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'none' }}
        >
          {/* Front: the word */}
          <div
            className="absolute inset-0 bg-white rounded-2xl border border-gray-200 shadow-md flex flex-col items-center justify-center px-6"
            style={faceStyle}
          >
            {isRetry && (
              <span className="absolute top-4 left-4 flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                <RotateCcw className="w-3 h-3" /> Học lại
              </span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); speak(current.word) }}
              className="absolute top-3 right-3 p-2 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Nghe phát âm"
            >
              <Volume2 className="w-5 h-5" />
            </button>
            <p className="text-4xl sm:text-5xl font-bold text-gray-900 text-center break-words max-w-full">{current.word}</p>
            {(current.part_of_speech || current.phonetic) && (
              <p className="mt-3 text-sm text-gray-400">
                {current.part_of_speech && <span className="italic text-blue-600">{current.part_of_speech}</span>}
                {current.part_of_speech && current.phonetic && ' · '}
                {current.phonetic}
              </p>
            )}
            <p className="absolute bottom-4 text-xs text-gray-400">Chạm hoặc nhấn Space để lật</p>
          </div>

          {/* Back: meaning */}
          <div
            className="absolute inset-0 bg-gradient-to-b from-blue-50 to-white rounded-2xl border border-blue-200 shadow-md flex flex-col justify-center px-6 sm:px-8 py-6 overflow-y-auto"
            style={{ ...faceStyle, transform: 'rotateY(180deg)' }}
          >
            <p className="text-sm font-semibold text-blue-600 mb-2">{current.word}</p>
            <p className="text-xl sm:text-2xl font-semibold text-gray-900 leading-snug">{cardDefinition(current)}</p>
            {synonyms.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Đồng nghĩa</p>
                <div className="flex flex-wrap gap-1.5">
                  {synonyms.map((s) => (
                    <span key={s} className="px-2.5 py-1 rounded-full bg-white border border-blue-200 text-blue-700 text-sm">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {current.example && (
              <p className="mt-4 text-sm text-gray-600 italic">&ldquo;{current.example}&rdquo;</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={markAgain}
          className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-orange-200 text-orange-700 font-semibold hover:bg-orange-50 transition-colors"
        >
          <X className="w-5 h-5" /> Chưa thuộc
          <span className="hidden sm:inline text-xs font-normal opacity-60">←</span>
        </button>
        <button
          onClick={markKnown}
          className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
        >
          <Check className="w-5 h-5" /> Đã thuộc
          <span className="hidden sm:inline text-xs font-normal opacity-70">→</span>
        </button>
      </div>
    </div>
  )
}

export default VocabLearn
