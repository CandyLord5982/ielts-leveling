import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Volume2, X, Loader2 } from 'lucide-react'
import { lookupWord } from '../../utils/dictionaryApi'

const WORD_RE = /^[a-zA-Z][a-zA-Z'-]*$/

// Global, mounted once in Layout. Double-click any plain word on the page to
// look it up via the free dictionaryapi.dev API.
const WordLookupPopup = () => {
  const [state, setState] = useState(null) // { word, x, y, status, entry, error }
  const popupRef = useRef(null)

  useEffect(() => {
    const handleDblClick = (e) => {
      const target = e.target
      if (target.closest('input, textarea, [contenteditable="true"], button, a, [data-no-lookup]')) return

      const selection = window.getSelection()
      const word = selection?.toString().trim()
      if (!word || !WORD_RE.test(word)) return

      setState({ word, x: e.clientX, y: e.clientY, status: 'loading', entry: null, error: null })

      lookupWord(word)
        .then((data) => {
          setState((s) => (s && s.word === word ? { ...s, status: 'done', entry: data[0] } : s))
        })
        .catch((err) => {
          const error = err.message === 'NOT_FOUND' ? 'Không tìm thấy từ này.' : 'Không thể tải định nghĩa.'
          setState((s) => (s && s.word === word ? { ...s, status: 'error', error } : s))
        })
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

  const { word, x, y, status, entry, error } = state

  const popupWidth = 320
  const left = Math.min(Math.max(8, x - popupWidth / 2), window.innerWidth - popupWidth - 8)
  const top = Math.min(y + 16, window.innerHeight - 16)

  const audioUrl = entry?.phonetics?.find((p) => p.audio)?.audio
  const phoneticText = entry?.phonetic || entry?.phonetics?.find((p) => p.text)?.text

  const playAudio = () => {
    if (audioUrl) new Audio(audioUrl).play().catch(() => {})
  }

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
          {audioUrl && (
            <button onClick={playAudio} className="text-blue-500 hover:text-blue-700" aria-label="Play pronunciation">
              <Volume2 className="w-4 h-4" />
            </button>
          )}
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

      {status === 'error' && <p className="text-gray-500 py-1">{error}</p>}

      {status === 'done' && entry && (
        <div className="space-y-3">
          {(entry.meanings || []).map((meaning, i) => (
            <div key={i}>
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">
                {meaning.partOfSpeech}
              </p>
              <ol className="list-decimal list-inside space-y-1">
                {(meaning.definitions || []).slice(0, 3).map((def, j) => (
                  <li key={j} className="text-gray-800">
                    {def.definition}
                    {def.example && <div className="text-gray-400 italic pl-1">&ldquo;{def.example}&rdquo;</div>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}

export default WordLookupPopup
