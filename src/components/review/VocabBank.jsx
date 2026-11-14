import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabase/client'
import LoadingSpinner from '../ui/LoadingSpinner'
import { clearReviewDueCache } from '../../utils/reviewDue'
import { deckInfo, cardDefinition, cardSynonyms, savedDefinition, frequencyLevel, speakWord } from '../../utils/vocabDecks'
import VocabFlashcards, { FrequencyDots } from './VocabFlashcards'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Search, Plus, Check, Volume2, ArrowRight, Loader2, EyeOff, RotateCcw, Layers, List, Shuffle, ChevronDown } from 'lucide-react'

// Browse a word deck (pet_word_bank) as Quizlet-style flashcards (or a searchable list) and
// add the words you want to your own list (saved_words). Added words are due right away,
// so /review/vocab quizzes them next.
const PAGE_SIZE = 50
const FETCH_SIZE = 1000 // PostgREST caps a response at 1000 rows
// labelKey → review.json (bank.*); 'A → Z' needs no translation.
const SORTS = [
  { id: 'freq', labelKey: 'bank.sortFreq' },
  { id: 'az', label: 'A → Z' },
  { id: 'shuffle', labelKey: 'bank.sortShuffle' },
]
const VIEWS = [
  { id: 'cards', labelKey: 'bank.viewCards', icon: Layers },
  { id: 'list', labelKey: 'bank.viewList', icon: List },
]
const VIEW_KEY = 'vocab_bank_view'
// "Known" words (dismissed) only show under their own tab, so "All" means everything
// still worth looking at.
const FILTERS = [
  { id: 'all', labelKey: 'bank.filterAll' },
  { id: 'new', labelKey: 'bank.filterNew' },
  { id: 'added', labelKey: 'bank.filterAdded' },
  { id: 'known', labelKey: 'bank.filterKnown' },
]
const UNDO_MS = 5000
const SORT_KEY = 'vocab_bank_sort'

// Per-viewer conveniences; any storage failure just falls back to the default.
const readPref = (key, options, fallback) => {
  try {
    const v = localStorage.getItem(key)
    return options.some((x) => x.id === v) ? v : fallback
  } catch {
    return fallback
  }
}
const writePref = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* storage blocked */ }
}

const VocabBank = () => {
  const { t } = useTranslation('review')
  const { user } = useAuth()
  const navigate = useNavigate()
  const [decks, setDecks] = useState(null)
  const [deck, setDeck] = useState(null)
  const [words, setWords] = useState(null) // bank words of the selected deck
  const [saved, setSaved] = useState({}) // word -> { id, last_reviewed_at }
  const [error, setError] = useState('') // translation key, so it follows a language switch
  const [sort, setSort] = useState(() => readPref(SORT_KEY, SORTS, 'freq'))
  const [shuffleSeed, setShuffleSeed] = useState(0) // bumped to reshuffle
  const [view, setView] = useState(() => readPref(VIEW_KEY, VIEWS, 'cards'))
  // Cards default to words not yet decided on; that's what you swipe through.
  const [filter, setFilter] = useState('new')
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [busy, setBusy] = useState({}) // bank word id -> true while saving/removing
  const [addedNow, setAddedNow] = useState(0)
  const [dismissed, setDismissed] = useState({}) // bank word id -> true ("Đã biết")
  const [undo, setUndo] = useState(null) // the word just dismissed, for the undo toast

  // Decks + the student's saved and dismissed words (small) once.
  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.rpc('vocab_deck_progress'),
      supabase.from('saved_words').select('id, word, last_reviewed_at').eq('user_id', user.id),
      supabase.from('dismissed_words').select('bank_word_id').eq('user_id', user.id),
    ]).then(([deckRes, savedRes, dismissedRes]) => {
      if (deckRes.error) console.error('Error loading decks:', deckRes.error)
      if (savedRes.error) console.error('Error loading saved words:', savedRes.error)
      if (dismissedRes.error) console.error('Error loading dismissed words:', dismissedRes.error)
      setDismissed(Object.fromEntries((dismissedRes.data || []).map((d) => [d.bank_word_id, true])))
      const list = deckRes.data || []
      setDecks(list)
      setDeck(list[0]?.deck || null)
      if (!list.length) setWords([])
      if (deckRes.error) setError('bank.loadFailed')
      setSaved(Object.fromEntries((savedRes.data || []).map((s) => [s.word, s])))
    })
  }, [user])

  // Dashboard red dot should re-check: added words are due immediately.
  useEffect(() => () => { if (user) clearReviewDueCache(user.id) }, [user])

  useEffect(() => {
    if (!deck) return
    let cancelled = false
    const load = async () => {
      setWords(null)
      const all = []
      for (let from = 0; ; from += FETCH_SIZE) {
        const { data, error: err } = await supabase
          .from('pet_word_bank')
          .select('id, word, hint, definition, synonyms, part_of_speech, phonetic, example, frequency')
          .eq('deck', deck)
          .eq('is_active', true)
          .order('word')
          .range(from, from + FETCH_SIZE - 1)
        if (err) {
          console.error('Error loading deck words:', err)
          if (!cancelled) setError('bank.loadFailed')
          break
        }
        all.push(...data)
        if (data.length < FETCH_SIZE) break
      }
      if (!cancelled) setWords(all)
    }
    load()
    return () => { cancelled = true }
  }, [deck])

  const chooseSort = (id) => {
    if (id === 'shuffle') setShuffleSeed((s) => s + 1) // pressing it again reshuffles
    setSort(id)
    setShown(PAGE_SIZE)
    writePref(SORT_KEY, id)
  }

  const chooseView = (id) => {
    setView(id)
    writePref(VIEW_KEY, id)
  }

  // A random rank per word, fixed until the next reshuffle so adding/dismissing a card
  // doesn't reorder the rest of the deck.
  const shuffleRank = useMemo(() => {
    const rank = new Map()
    for (const w of words || []) rank.set(w.id, Math.random())
    return rank
  }, [words, shuffleSeed]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    if (!words) return []
    const q = search.trim().toLowerCase()
    const list = words.filter((w) => {
      const isAdded = !!saved[w.word]
      // Being in their list wins over a dismissal (e.g. saved later from the dictionary).
      const isKnown = !isAdded && !!dismissed[w.id]
      if (filter === 'known' ? !isKnown : isKnown) return false
      if (filter === 'new' && isAdded) return false
      if (filter === 'added' && !isAdded) return false
      return !q || w.word.includes(q) || (w.hint || '').toLowerCase().includes(q)
    })
    if (sort === 'freq') list.sort((a, b) => (b.frequency ?? -1) - (a.frequency ?? -1) || a.word.localeCompare(b.word))
    else if (sort === 'shuffle') list.sort((a, b) => shuffleRank.get(a.id) - shuffleRank.get(b.id))
    return list // 'az': already A–Z from the query
  }, [words, saved, dismissed, filter, search, sort, shuffleRank])

  const addedInDeck = useMemo(() => (words || []).filter((w) => saved[w.word]).length, [words, saved])
  const knownInDeck = useMemo(
    () => (words || []).filter((w) => dismissed[w.id] && !saved[w.word]).length,
    [words, saved, dismissed],
  )

  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(null), UNDO_MS)
    return () => clearTimeout(timer)
  }, [undo])

  const setWordBusy = (id, on) => setBusy((b) => {
    const next = { ...b }
    if (on) next[id] = true
    else delete next[id]
    return next
  })

  const addWord = async (w) => {
    setWordBusy(w.id, true)
    const word = w.word.toLowerCase()
    let { data, error: err } = await supabase
      .from('saved_words')
      .insert({
        user_id: user.id,
        word,
        definition: savedDefinition(w),
        example: w.example || null,
        part_of_speech: w.part_of_speech || null,
        phonetic: w.phonetic || null,
        bank_word_id: w.id,
      })
      .select('id, word, last_reviewed_at')
      .single()
    // 23505: already in their list (saved from another tab or the dictionary) — just show it.
    if (err?.code === '23505') {
      ;({ data, error: err } = await supabase
        .from('saved_words')
        .select('id, word, last_reviewed_at')
        .eq('user_id', user.id)
        .eq('word', word)
        .single())
    } else if (!err) {
      setAddedNow((n) => n + 1)
    }
    setWordBusy(w.id, false)
    if (err) {
      console.error('Error adding word:', err)
      alert(t('bank.addFailed'))
      return
    }
    setSaved((s) => ({ ...s, [data.word]: data }))
  }

  const removeWord = async (w) => {
    const entry = saved[w.word]
    if (!entry) return
    if (entry.last_reviewed_at && !window.confirm(t('bank.confirmRemove', { word: w.word }))) return
    setWordBusy(w.id, true)
    const { error: err } = await supabase.from('saved_words').delete().eq('id', entry.id)
    setWordBusy(w.id, false)
    if (err) {
      console.error('Error removing word:', err)
      alert(t('bank.removeFailed'))
      return
    }
    setSaved((s) => {
      const next = { ...s }
      delete next[w.word]
      return next
    })
  }

  const setWordDismissed = (id, on) => setDismissed((d) => {
    const next = { ...d }
    if (on) next[id] = true
    else delete next[id]
    return next
  })

  // Optimistic: the row disappears at once; rolled back if the write fails.
  const dismissWord = async (w) => {
    setWordDismissed(w.id, true)
    setUndo(w)
    const { error: err } = await supabase
      .from('dismissed_words')
      .upsert({ user_id: user.id, bank_word_id: w.id }, { onConflict: 'user_id,bank_word_id', ignoreDuplicates: true })
    if (err) {
      console.error('Error dismissing word:', err)
      setWordDismissed(w.id, false)
      setUndo(null)
      alert(t('bank.dismissFailed'))
    }
  }

  const restoreWord = async (w) => {
    setWordDismissed(w.id, false)
    if (undo?.id === w.id) setUndo(null)
    const { error: err } = await supabase
      .from('dismissed_words')
      .delete()
      .eq('user_id', user.id)
      .eq('bank_word_id', w.id)
    if (err) {
      console.error('Error restoring word:', err)
      setWordDismissed(w.id, true)
      alert(t('bank.restoreFailed'))
    }
  }

  if (!decks || (deck && !words && !error)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <button onClick={() => navigate('/review/vocab')} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> {t('vocabReview')}
        </button>
        <button onClick={() => navigate('/review/vocab/words')} className="text-sm text-blue-600 hover:text-blue-800">
          {t('bank.myList')}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-gray-900">{t('bank.title')}</h1>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm flex-shrink-0">
          {VIEWS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              onClick={() => chooseView(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${view === id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <Icon className="w-4 h-4" /> {t(labelKey)}
            </button>
          ))}
        </div>
      </div>


      {decks.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {decks.map((d) => (
            <button
              key={d.deck}
              onClick={() => { setDeck(d.deck); setShown(PAGE_SIZE) }}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                deck === d.deck ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {deckInfo(d.deck).name}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-500">{t(error)}</div>
      ) : !deck ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-500">{t('bank.noDecks')}</div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-gray-900">{deckInfo(deck).name}</span>
              <span className="text-sm text-gray-500">
                {knownInDeck > 0
                  ? t('bank.deckStatsKnown', { added: addedInDeck, known: knownInDeck, total: words.length })
                  : t('bank.deckStats', { added: addedInDeck, total: words.length })}
              </span>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShown(PAGE_SIZE) }}
                placeholder={t('searchPlaceholder')}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => { setFilter(f.id); setShown(PAGE_SIZE) }}
                    className={`px-3 py-1.5 transition-colors ${filter === f.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    {t(f.labelKey)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="vocab-bank-sort" className="text-gray-400">{t('bank.sortLabel')}</label>
                <div className="relative">
                  <select
                    id="vocab-bank-sort"
                    value={sort}
                    onChange={(e) => chooseSort(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 font-medium cursor-pointer outline-none hover:bg-gray-50 focus:border-blue-500"
                  >
                    {SORTS.map(({ id, label, labelKey }) => (
                      <option key={id} value={id}>{labelKey ? t(labelKey) : label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {/* Re-picking the same option doesn't fire onChange, so reshuffling gets its own button */}
                {sort === 'shuffle' && (
                  <button
                    onClick={() => chooseSort('shuffle')}
                    title={t('bank.reshuffle')}
                    aria-label={t('bank.reshuffle')}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {view === 'cards' ? (
            <VocabFlashcards
              words={visible}
              saved={saved}
              busy={busy}
              filter={filter}
              resetKey={`${deck}|${filter}|${sort}|${shuffleSeed}|${search.trim()}`}
              onAdd={addWord}
              onRemove={removeWord}
              onDismiss={dismissWord}
              onRestore={restoreWord}
            />
          ) : visible.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">
              {filter === 'known' && !search.trim() ? t('bank.knownEmpty') : t('noMatches')}
            </p>
          ) : (
            <ul data-no-lookup className="space-y-2">
              {visible.slice(0, shown).map((w) => {
                const isAdded = !!saved[w.word]
                const synonyms = cardSynonyms(w)
                return (
                  <li
                    key={w.id}
                    className={`bg-white rounded-xl border shadow-sm p-4 flex items-start gap-3 transition-colors ${
                      isAdded ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-gray-900">{w.word}</span>
                        {w.part_of_speech && <span className="text-xs text-blue-600 italic">{w.part_of_speech}</span>}
                        <button
                          onClick={() => speakWord(w.word)}
                          className="p-1 -m-1 text-gray-300 hover:text-blue-600 rounded"
                          title={t('bank.listen')}
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <FrequencyDots level={frequencyLevel(w.frequency)} />
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{cardDefinition(w)}</p>
                      {synonyms.length > 0 && (
                        <p className="text-xs text-gray-400 mt-1">≈ {synonyms.join(', ')}</p>
                      )}
                    </div>
                    {filter === 'known' ? (
                      <button
                        onClick={() => restoreWord(w)}
                        title={t('bank.restoreTitle')}
                        className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" /> {t('bank.restore')}
                      </button>
                    ) : (
                      <div className="flex-shrink-0 flex flex-col items-stretch gap-1.5">
                        <button
                          onClick={() => (isAdded ? removeWord(w) : addWord(w))}
                          disabled={!!busy[w.id]}
                          title={isAdded ? t('bank.removeTitle') : t('bank.addTitle')}
                          className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                            isAdded
                              ? 'border-emerald-300 text-emerald-700 bg-white hover:border-red-300 hover:text-red-600'
                              : 'border-blue-200 text-blue-700 hover:bg-blue-50'
                          }`}
                        >
                          {busy[w.id] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : isAdded ? (
                            <><Check className="w-4 h-4" /> {t('bank.added')}</>
                          ) : (
                            <><Plus className="w-4 h-4" /> {t('bank.add')}</>
                          )}
                        </button>
                        {!isAdded && (
                          <button
                            onClick={() => dismissWord(w)}
                            disabled={!!busy[w.id]}
                            title={t('bank.knownTitle')}
                            className="flex items-center justify-center gap-1 px-3 py-1 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                          >
                            <EyeOff className="w-3.5 h-3.5" /> {t('bank.known')}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {view === 'list' && shown < visible.length && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setShown((n) => n + PAGE_SIZE)}
                className="px-5 py-2 text-sm text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-50"
              >
                {t('bank.showMore', { count: visible.length - shown })}
              </button>
            </div>
          )}
        </>
      )}

      {(addedNow > 0 || undo) && (
        <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 flex flex-col items-stretch sm:items-center gap-2">
          {undo && (
            <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-gray-900 text-white rounded-xl shadow-lg text-sm">
              <span>
                {t('bank.hidden')} <span className="font-semibold">{undo.word}</span>
              </span>
              <button onClick={() => restoreWord(undo)} className="font-semibold text-amber-300 hover:text-amber-200">
                {t('bank.undo')}
              </button>
            </div>
          )}
          {addedNow > 0 && (
            <button
              onClick={() => navigate('/review/vocab')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl shadow-lg font-semibold hover:bg-emerald-700 transition-colors"
            >
              {t('bank.addedNow', { count: addedNow })} <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default VocabBank
