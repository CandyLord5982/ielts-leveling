import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, BookmarkPlus, Check } from 'lucide-react'
import { lookupWord } from '../../utils/dictionaryApi'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabase/client'
import MeaningPicker, { firstChoice, resolveChoice } from './MeaningPicker'

const WORD_RE = /^[a-zA-Z][a-zA-Z'-]*$/

// Global, mounted once in Layout. Double-click any plain word on the page to
// look it up via the free dictionaryapi.dev API.
const WordLookupPopup = () => {
  const [state, setState] = useState(null) // { word, x, y, status, entry, error }
  const popupRef = useRef(null)
  const { user } = useAuth()
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [choice, setChoice] = useState(null) // which definition "Lưu từ" saves

  // Default to the first definition whenever a new entry arrives.
  const entry = state?.entry
  useEffect(() => {
    setChoice(firstChoice(entry?.meanings))
  }, [entry])

  // Reset / pre-check whether the looked-up word is already saved.
  const entryWord = entry?.word?.toLowerCase()
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

  const handleSave = async () => {
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
        definition: def.definition,
        example: def.example || null,
      },
      { onConflict: 'user_id,word', ignoreDuplicates: true },
    )
    if (error) console.error('Error saving word:', error)
    setSaveState(error ? 'error' : 'saved')
  }

  // setState is stable, so this is safe to call from the mount-only listener effect below.
  const runLookup = (word) => {
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

  const retry = () => {
    setState((s) => (s ? { ...s, status: 'loading', error: null, retryable: false } : s))
    runLookup(state.word)
  }

  useEffect(() => {
    const handleDblClick = (e) => {
      const target = e.target
      if (target.closest('input, textarea, [contenteditable="true"], button:not([aria-disabled="true"]), a, [data-no-lookup]')) return

      const selection = window.getSelection()
      const word = selection?.toString().trim()
      if (!word || !WORD_RE.test(word)) return

      setState({ word, x: e.clientX, y: e.clientY, status: 'loading', entry: null, error: null, retryable: false })
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
  const top = Math.min(y + 16, window.innerHeight - 16)

  const phoneticText = entry?.phonetic

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-[9999] bg-white rounded-xl border border-gray-200 shadow-xl p-4 text-sm"
      style={{ left, top, width: popupWidth, maxHeight: '60vh', overflowY: 'auto' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">{word}</span>
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

      {status === 'done' && entry && (
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
          {user && (
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
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}

export default WordLookupPopup
