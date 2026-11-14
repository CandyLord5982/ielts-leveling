import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, BookmarkPlus, Check } from 'lucide-react'
import { lookupWord, baseForms } from '../../utils/dictionaryApi'
import { findBankWord, cardDefinition, cardSynonyms, savedDefinition, deckInfo } from '../../utils/vocabDecks'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabase/client'
import MeaningPicker, { firstChoice, resolveChoice } from './MeaningPicker'

const WORD_RE = /^[a-zA-Z][a-zA-Z'-]*$/

// Global, mounted once in Layout. Double-click any plain word on the page to look it up.
// Words in the word bank show the bank's meaning (so saved words match the bank and
// count as bank words); everything else comes from the free dictionary APIs.
const WordLookupPopup = () => {
  // { word, x, y, status, entry, error, retryable, bank, source: 'bank' | 'dict' }
  const [state, setState] = useState(null)
  const popupRef = useRef(null)
  const { user } = useAuth()
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [choice, setChoice] = useState(null) // which definition "Lưu từ" saves

  // Default to the first definition whenever a new entry arrives.
  const entry = state?.entry
  useEffect(() => {
    setChoice(firstChoice(entry?.meanings))
  }, [entry])

  // Editable copy of the picked definition — refilled whenever a different meaning is picked.
  const [customDef, setCustomDef] = useState('')
  useEffect(() => {
    setCustomDef(resolveChoice(entry?.meanings, choice)?.def.definition || '')
  }, [entry, choice])

  // Reset / pre-check whether the looked-up word is already saved.
  const bank = state?.bank
  const showingBank = state?.source === 'bank' && !!bank
  const entryWord = (showingBank ? bank.word : entry?.word)?.toLowerCase()
  useEffect(() => {
    setSaveState('idle')
    if (!user || !entryWord) return
    let cancelled = false
    supabase
      .from('saved_words')
      .select('id')
      .eq('user_id', user.id)
      .eq('word', entryWord)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setSaveState('saved')
      })
    return () => { cancelled = true }
  }, [user, entryWord])

  // Same row the bank page's "Add" creates.
  const saveBankWord = async () => {
    setSaveState('saving')
    const { error } = await supabase.from('saved_words').upsert(
      {
        user_id: user.id,
        word: bank.word.toLowerCase(),
        definition: savedDefinition(bank),
        example: bank.example || null,
        part_of_speech: bank.part_of_speech || null,
        phonetic: bank.phonetic || null,
        bank_word_id: bank.id,
      },
      { onConflict: 'user_id,word', ignoreDuplicates: true },
    )
    if (error) console.error('Error saving word:', error)
    setSaveState(error ? 'error' : 'saved')
  }

  const handleSave = async () => {
    if (showingBank) {
      if (user) await saveBankWord()
      return
    }
    const picked = resolveChoice(entry?.meanings, choice)
    if (!user || !entry || !picked) return
    const { meaning, def } = picked
    setSaveState('saving')
    const { error } = await supabase.from('saved_words').upsert(
      {
        user_id: user.id,
        word: entry.word.toLowerCase(),
        phonetic: entry.phonetic || null,
        part_of_speech: meaning.partOfSpeech || null,
        definition: customDef.trim() || def.definition,
        example: def.example || null,
      },
      { onConflict: 'user_id,word', ignoreDuplicates: true },
    )
    if (error) console.error('Error saving word:', error)
    setSaveState(error ? 'error' : 'saved')
  }

  // setState is stable, so these are safe to call from the mount-only listener effect below.
  const runDictionary = (word) => {
    lookupWord(word)
      .then((entry) => {
        setState((s) => (s && s.word === word ? { ...s, status: 'done', entry } : s))
      })
      .catch((err) => {
        const notFound = err.message === 'NOT_FOUND'
        const error = notFound ? 'Không tìm thấy từ này.' : 'Không thể tải định nghĩa.'
        setState((s) => (s && s.word === word ? { ...s, status: 'error', error, retryable: !notFound } : s))
      })
  }

  // Bank first; the dictionary is only fetched when the word isn't in the bank.
  const runLookup = (word) => {
    findBankWord(word, baseForms).catch(() => null).then((bank) => {
      if (bank) {
        setState((s) => (s && s.word === word ? { ...s, status: 'done', bank, source: 'bank' } : s))
      } else {
        runDictionary(word)
      }
    })
  }

  const showDictionary = () => {
    setState((s) => (s ? { ...s, source: 'dict', status: s.entry ? 'done' : 'loading', error: null } : s))
    if (!state.entry) runDictionary(state.word)
  }

  const showBank = () => setState((s) => (s ? { ...s, source: 'bank', status: 'done', error: null } : s))

  const retry = () => {
    setState((s) => (s ? { ...s, status: 'loading', error: null, retryable: false } : s))
    runDictionary(state.word)
  }

  useEffect(() => {
    const handleDblClick = (e) => {
      const target = e.target
      if (target.closest('input, textarea, [contenteditable="true"], button:not([aria-disabled="true"]), a, [data-no-lookup]')) return

      const selection = window.getSelection()
      const word = selection?.toString().trim()
      if (!word || !WORD_RE.test(word)) return

      setState({ word, x: e.clientX, y: e.clientY, status: 'loading', entry: null, error: null, retryable: false, bank: null, source: 'dict' })
      runLookup(word)
    }

    const handlePointerDown = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setState(null)
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setState(null)
    }

    document.addEventListener('dblclick', handleDblClick)
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('dblclick', handleDblClick)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  if (!state) return null

  const { word, x, y, status, error } = state

  const popupWidth = 320
  const left = Math.min(Math.max(8, x - popupWidth / 2), window.innerWidth - popupWidth - 8)
  // Open below the cursor unless there's more room above; anchor by `bottom`
  // when flipped so the popup grows upward as content loads. Cap height to the
  // space actually available so the save button is always reachable.
  const gap = 16
  const margin = 8
  const spaceBelow = window.innerHeight - y - gap - margin
  const spaceAbove = y - gap - margin
  const placeBelow = spaceBelow >= 320 || spaceBelow >= spaceAbove
  const maxHeight = Math.min(window.innerHeight * 0.6, placeBelow ? spaceBelow : spaceAbove)
  const vertical = placeBelow
    ? { top: y + gap }
    : { bottom: window.innerHeight - y + gap }

  const phoneticText = showingBank ? bank.phonetic : entry?.phonetic
  // For "mitigated" the bank entry is "mitigate" — show the word that will be saved.
  const headword = showingBank ? bank.word : word
  const saveButton = user && (
    <button
      onClick={handleSave}
      disabled={saveState === 'saving' || saveState === 'saved'}
      className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
        saveState === 'saved'
          ? 'bg-green-50 text-green-700 cursor-default'
          : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60'
      }`}
    >
      {saveState === 'saved' ? <Check className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
      {saveState === 'saved' ? 'Đã lưu để ôn tập' : saveState === 'saving' ? 'Đang lưu...' : saveState === 'error' ? 'Lỗi, thử lại' : 'Lưu từ'}
    </button>
  )

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-[9999] bg-white rounded-xl border border-gray-200 shadow-xl p-4 text-sm"
      style={{ left, ...vertical, width: popupWidth, maxHeight, overflowY: 'auto' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">{headword}</span>
          {phoneticText && <span className="text-gray-400">{phoneticText}</span>}
        </div>
        <button onClick={() => setState(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {status === 'loading' && (
        <div className="flex items-center gap-2 text-gray-400 py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
        </div>
      )}

      {status === 'error' && (
        <div className="py-1">
          <p className="text-gray-500">{error}</p>
          {state.retryable && (
            <button onClick={retry} className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
              Thử lại
            </button>
          )}
        </div>
      )}

      {status === 'done' && showingBank && (
        <div className="space-y-3">
          <div>
            <span className="inline-block mb-1.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-semibold uppercase tracking-wider">
              Kho từ {deckInfo(bank.deck).name}
            </span>
            <p className="text-gray-800">{cardDefinition(bank)}</p>
            {cardSynonyms(bank).length > 0 && (
              <p className="mt-1 text-xs text-gray-500">≈ {cardSynonyms(bank).join(', ')}</p>
            )}
            {bank.example && <p className="mt-1.5 text-gray-500 italic">&ldquo;{bank.example}&rdquo;</p>}
          </div>
          {saveButton}
          <button onClick={showDictionary} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Xem nghĩa khác trong từ điển
          </button>
        </div>
      )}

      {bank && !showingBank && (
        <button onClick={showBank} className="mb-2 text-xs text-blue-600 hover:text-blue-800 font-medium">
          ← Nghĩa trong kho từ
        </button>
      )}

      {status === 'done' && !showingBank && entry && (
        <div className="space-y-3">
          {user && saveState !== 'saved' && (
            <p className="text-xs text-gray-400">Chọn nghĩa muốn lưu:</p>
          )}
          <MeaningPicker
            meanings={entry.meanings}
            selected={user && saveState !== 'saved' ? choice : null}
            onSelect={setChoice}
            limit={3}
          />
          {user && saveState !== 'saved' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nghĩa sẽ lưu (có thể sửa):</label>
              <textarea
                value={customDef}
                onChange={(e) => setCustomDef(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 resize-none outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}
          {saveButton}
        </div>
      )}
    </div>,
    document.body,
  )
}

export default WordLookupPopup
