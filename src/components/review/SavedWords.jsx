import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabase/client'
import LoadingSpinner from '../ui/LoadingSpinner'
import MeaningPicker, { firstChoice, resolveChoice } from '../ui/MeaningPicker'
import { lookupWord } from '../../utils/dictionaryApi'
import { ArrowLeft, Pencil, Trash2, Check, X, Search, Plus, BookOpen, Loader2, Layers } from 'lucide-react'
import { BANK_PATH } from '../../utils/vocabDecks'
import { useTranslation } from 'react-i18next'

const EMPTY_ADD = { word: '', definition: '', example: '', part_of_speech: null, phonetic: null }

// Manage saved words: add one by hand (optionally filled from the dictionary),
// edit the meaning/example, rename, or delete.
// Error states hold translation keys (review.json), so they follow a language switch.
const SavedWords = () => {
  const { t } = useTranslation('review')
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [adding, setAdding] = useState(!!location.state?.add)
  const [addDraft, setAddDraft] = useState(EMPTY_ADD)
  const [lookup, setLookup] = useState(null) // { status: loading | done | error, entry, error }
  const [choice, setChoice] = useState(null)
  const [addError, setAddError] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [words, setWords] = useState([])
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({ word: '', definition: '', example: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('saved_words')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) console.error('Error loading saved words:', err)
        setWords(data || [])
        setLoading(false)
      })
  }, [user])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return words
    return words.filter((w) => w.word.includes(q) || w.definition.toLowerCase().includes(q))
  }, [words, search])

  const startEdit = (w) => {
    setEditingId(w.id)
    setDraft({ word: w.word, definition: w.definition, example: w.example || '' })
    setError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setError('')
  }

  const saveEdit = async () => {
    const word = draft.word.trim().toLowerCase()
    const definition = draft.definition.trim()
    if (!word || !definition) {
      setError('saved.emptyFields')
      return
    }
    setBusy(true)
    const updates = { word, definition, example: draft.example.trim() || null }
    const { error: err } = await supabase.from('saved_words').update(updates).eq('id', editingId)
    setBusy(false)
    if (err) {
      // 23505 = unique violation (another saved word already has this spelling)
      setError(err.code === '23505' ? 'saved.alreadySaved' : 'saved.saveFailed')
      return
    }
    setWords((list) => list.map((w) => (w.id === editingId ? { ...w, ...updates } : w)))
    setEditingId(null)
    setError('')
  }

  const openAdd = () => {
    setAdding(true)
    setAddDraft(EMPTY_ADD)
    setLookup(null)
    setChoice(null)
    setAddError('')
  }

  const closeAdd = () => {
    setAdding(false)
    setAddError('')
  }

  // Editing the word invalidates the dictionary results (but keeps a hand-typed meaning).
  const changeAddWord = (value) => {
    setAddDraft((d) => ({ ...d, word: value, part_of_speech: null, phonetic: null }))
    setLookup(null)
    setChoice(null)
  }

  const applyChoice = (entry, c) => {
    const picked = resolveChoice(entry?.meanings, c)
    setChoice(c)
    if (!picked) return
    setAddDraft((d) => ({
      ...d,
      definition: picked.def.definition,
      example: picked.def.example || '',
      part_of_speech: picked.meaning.partOfSpeech || null,
    }))
  }

  const runLookup = async () => {
    const word = addDraft.word.trim()
    if (!word || lookup?.status === 'loading') return
    setLookup({ status: 'loading' })
    setAddError('')
    try {
      const entry = await lookupWord(word)
      // The dictionary may resolve an inflection to its base form ("running" -> "run").
      setAddDraft((d) => ({ ...d, word: entry.word.toLowerCase(), phonetic: entry.phonetic || null }))
      setLookup({ status: 'done', entry })
      applyChoice(entry, firstChoice(entry.meanings))
    } catch (err) {
      setLookup({ status: 'error', error: err.message === 'NOT_FOUND' ? 'saved.notFound' : 'saved.lookupFailed' })
    }
  }

  const saveAdd = async () => {
    const word = addDraft.word.trim().toLowerCase()
    const definition = addDraft.definition.trim()
    if (!word || !definition) {
      setAddError('saved.emptyFields')
      return
    }
    setAddBusy(true)
    const { data, error: err } = await supabase
      .from('saved_words')
      .insert({
        user_id: user.id,
        word,
        definition,
        example: addDraft.example.trim() || null,
        part_of_speech: addDraft.part_of_speech,
        phonetic: addDraft.phonetic,
      })
      .select()
      .single()
    setAddBusy(false)
    if (err) {
      if (err.code !== '23505') console.error('Error adding word:', err)
      setAddError(err.code === '23505' ? 'saved.alreadySaved' : 'saved.addFailed')
      return
    }
    setWords((list) => [data, ...list])
    setAdding(false)
  }

  const handleDelete = async (w) => {
    if (!window.confirm(t('saved.confirmDelete', { word: w.word }))) return
    const { error: err } = await supabase.from('saved_words').delete().eq('id', w.id)
    if (err) {
      console.error('Error deleting word:', err)
      alert(t('saved.deleteFailed'))
      return
    }
    setWords((list) => list.filter((x) => x.id !== w.id))
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <button onClick={() => navigate('/review/vocab')} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> {t('vocabReview')}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{t('wordCount', { count: words.length })}</span>
          <button
            onClick={() => navigate(BANK_PATH)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50"
          >
            <Layers className="w-4 h-4" /> {t('wordBank')}
          </button>
          {!adding && (
            <button
              onClick={openAdd}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> {t('vocab.addWord')}
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div data-no-lookup className="bg-white rounded-xl border border-blue-200 shadow-sm p-4 mb-4 space-y-3">
          <div className="flex gap-2">
            <input
              autoFocus
              value={addDraft.word}
              onChange={(e) => changeAddWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  runLookup()
                }
              }}
              placeholder={t('saved.englishWord')}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-blue-500 font-semibold"
            />
            <button
              onClick={runLookup}
              disabled={!addDraft.word.trim() || lookup?.status === 'loading'}
              className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 flex-shrink-0"
            >
              {lookup?.status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              {t('saved.lookUp')}
            </button>
          </div>

          {lookup?.status === 'error' && <p className="text-sm text-gray-500">{t(lookup.error)}</p>}

          {lookup?.status === 'done' && (
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <p className="text-xs text-gray-400">{t('saved.pickMeaning')}</p>
                {addDraft.phonetic && <span className="text-xs text-gray-400">{addDraft.phonetic}</span>}
              </div>
              <div className="max-h-72 overflow-y-auto text-sm pr-1">
                <MeaningPicker
                  meanings={lookup.entry.meanings}
                  selected={choice}
                  onSelect={(c) => applyChoice(lookup.entry, c)}
                />
              </div>
            </div>
          )}

          <textarea
            value={addDraft.definition}
            onChange={(e) => setAddDraft((d) => ({ ...d, definition: e.target.value }))}
            placeholder={t('saved.meaning')}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
          />
          <input
            value={addDraft.example}
            onChange={(e) => setAddDraft((d) => ({ ...d, example: e.target.value }))}
            placeholder={t('saved.examplePlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
          />
          {addError && <p className="text-sm text-red-600">{t(addError)}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={closeAdd} className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <X className="w-4 h-4" /> {t('common:cancel')}
            </button>
            <button
              onClick={saveAdd}
              disabled={addBusy}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Check className="w-4 h-4" /> {t('common:add')}
            </button>
          </div>
        </div>
      )}

      {words.length > 0 && (
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 outline-none focus:border-blue-500"
          />
        </div>
      )}

      {words.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <h2 className="text-lg font-bold text-gray-900 mb-1">{t('saved.emptyTitle')}</h2>
          <p className="text-sm text-gray-500">{t('saved.emptyBody')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">{t('noMatches')}</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((w) => (
            <li key={w.id} data-no-lookup className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              {editingId === w.id ? (
                <div className="space-y-2">
                  <input
                    value={draft.word}
                    onChange={(e) => setDraft((d) => ({ ...d, word: e.target.value }))}
                    placeholder={t('saved.word')}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-blue-500 font-semibold"
                  />
                  <textarea
                    value={draft.definition}
                    onChange={(e) => setDraft((d) => ({ ...d, definition: e.target.value }))}
                    placeholder={t('saved.meaning')}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
                  />
                  <input
                    value={draft.example}
                    onChange={(e) => setDraft((d) => ({ ...d, example: e.target.value }))}
                    placeholder={t('saved.examplePlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
                  />
                  {error && <p className="text-sm text-red-600">{t(error)}</p>}
                  <div className="flex justify-end gap-2">
                    <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <X className="w-4 h-4" /> {t('common:cancel')}
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={busy}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" /> {t('common:save')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-gray-900">{w.word}</span>
                      {w.part_of_speech && <span className="text-xs text-blue-600 uppercase">{w.part_of_speech}</span>}
                      {w.phonetic && <span className="text-xs text-gray-400">{w.phonetic}</span>}
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{w.definition}</p>
                    {w.example && <p className="text-sm text-gray-400 italic mt-1">&ldquo;{w.example}&rdquo;</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(w)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title={t('common:edit')}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(w)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title={t('common:delete')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SavedWords
