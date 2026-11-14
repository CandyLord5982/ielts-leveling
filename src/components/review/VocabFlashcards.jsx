import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Volume2, Plus, Check, EyeOff, RotateCcw, Loader2, X } from 'lucide-react'
import { cardDefinition, cardSynonyms, frequencyLevel, speakWord } from '../../utils/vocabDecks'

export const FrequencyDots = ({ level }) => {
  const { t } = useTranslation('review')
  if (!level) return null
  return (
    <span className="flex items-center gap-0.5" title={t('cards.frequency')}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i <= level ? 'bg-emerald-500' : 'bg-gray-200'}`} />
      ))}
    </span>
  )
}

FrequencyDots.propTypes = {
  level: PropTypes.number,
}

const SWIPE_PX = 50

// Quizlet-style browsing of the word bank: one card at a time, flip for the meaning, then
// add it to your list or mark it "Đã biết". `words` is the already filtered + sorted deck.
const VocabFlashcards = ({ words, saved, busy, filter, resetKey, onAdd, onRemove, onDismiss, onRestore }) => {
  const { t } = useTranslation('review')
  const [index, setIndex] = useState(0)
  // Which card is flipped, by id — so a new card always starts face up without a
  // reset-then-animate flash.
  const [flippedId, setFlippedId] = useState(null)
  const touchX = useRef(null)
  const swiped = useRef(false)

  useEffect(() => {
    setIndex(0)
    setFlippedId(null)
  }, [resetKey])

  // When a card leaves the list (added / dismissed), the same index shows the next one.
  const i = Math.min(index, Math.max(words.length - 1, 0))
  const current = words[i]
  const flipped = !!current && flippedId === current.id
  const isAdded = !!current && !!saved[current.word]
  const isBusy = !!current && !!busy[current.id]

  const go = (delta) => {
    const n = i + delta
    if (n >= 0 && n < words.length) setIndex(n)
  }
  const flip = () => current && setFlippedId((f) => (f === current.id ? null : current.id))

  // Primary = the green button; secondary = the grey one. Depends on the tab.
  const primary = () => {
    if (!current || isBusy) return
    if (filter === 'known') onRestore(current)
    else if (isAdded) onRemove(current)
    else {
      onAdd(current)
      if (filter === 'all') go(1) // it stays in "Tất cả", so move on ourselves
    }
  }
  const secondary = () => {
    if (!current || isBusy || isAdded || filter === 'known') return
    onDismiss(current)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (e.target.closest?.('input, textarea, select')) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        flip()
      } else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowUp' || e.key === '2') {
        e.preventDefault()
        primary()
      } else if (e.key === 'ArrowDown' || e.key === '1') {
        e.preventDefault()
        secondary()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!current) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center">
        <p className="text-4xl mb-3">🎉</p>
        <p className="font-semibold text-gray-800">{t('cards.emptyTitle')}</p>
        <p className="text-sm text-gray-500 mt-1">{t('cards.emptyBody')}</p>
      </div>
    )
  }

  const synonyms = cardSynonyms(current)
  const faceStyle = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }
  const level = frequencyLevel(current.frequency)

  let primaryLabel = <><Plus className="w-5 h-5" /> {t('cards.addToList')}</>
  let primaryStyle = 'bg-emerald-600 text-white hover:bg-emerald-700'
  if (filter === 'known') {
    primaryLabel = <><RotateCcw className="w-5 h-5" /> {t('bank.restore')}</>
    primaryStyle = 'bg-blue-600 text-white hover:bg-blue-700'
  } else if (isAdded) {
    primaryLabel = <><X className="w-5 h-5" /> {t('cards.removeFromList')}</>
    primaryStyle = 'border-2 border-red-200 text-red-600 hover:bg-red-50'
  }

  return (
    <div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${((i + 1) / words.length) * 100}%` }} />
      </div>

      {/* key remounts per word so the next card never shows its back mid-rotation */}
      <div
        key={current.id}
        data-no-lookup
        className="h-80 sm:h-96"
        style={{ perspective: '1200px' }}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; swiped.current = false }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > SWIPE_PX) {
            swiped.current = true
            go(dx < 0 ? 1 : -1)
          }
        }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={flipped ? t('cards.showFront') : t('cards.showMeaning')}
          onClick={() => { if (!swiped.current) flip() }}
          className="relative w-full h-full cursor-pointer select-none transition-transform duration-300 ease-out outline-none"
          style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'none' }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 bg-white rounded-2xl border border-gray-200 shadow-md flex flex-col items-center justify-center px-6"
            style={faceStyle}
          >
            {isAdded && filter !== 'known' && (
              <span className="absolute top-4 left-4 flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                <Check className="w-3 h-3" /> {t('bank.added')}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); speakWord(current.word) }}
              className="absolute top-3 right-3 p-2 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title={t('bank.listen')}
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
            {level && <div className="mt-4"><FrequencyDots level={level} /></div>}
            <p className="absolute bottom-4 text-xs text-gray-400">{t('cards.tapToFlip')}</p>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 bg-gradient-to-b from-blue-50 to-white rounded-2xl border border-blue-200 shadow-md flex flex-col justify-center px-6 sm:px-8 py-6 overflow-y-auto"
            style={{ ...faceStyle, transform: 'rotateY(180deg)' }}
          >
            <p className="text-sm font-semibold text-blue-600 mb-2">{current.word}</p>
            <p className="text-xl sm:text-2xl font-semibold text-gray-900 leading-snug">{cardDefinition(current)}</p>
            {synonyms.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">{t('cards.synonyms')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {synonyms.map((s) => (
                    <span key={s} className="px-2.5 py-1 rounded-full bg-white border border-blue-200 text-blue-700 text-sm">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {current.example && <p className="mt-4 text-sm text-gray-600 italic">&ldquo;{current.example}&rdquo;</p>}
          </div>
        </div>
      </div>

      <div className={`mt-5 grid gap-3 ${filter === 'known' || isAdded ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {filter !== 'known' && !isAdded && (
          <button
            onClick={secondary}
            disabled={isBusy}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <EyeOff className="w-5 h-5" /> {t('bank.known')}
            <span className="hidden sm:inline text-xs font-normal opacity-60">↓</span>
          </button>
        )}
        <button
          onClick={primary}
          disabled={isBusy}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 ${primaryStyle}`}
        >
          {isBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : primaryLabel}
          <span className="hidden sm:inline text-xs font-normal opacity-70">↑</span>
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => go(-1)}
          disabled={i === 0}
          className="p-2.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
          title={t('cards.prev')}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-medium text-gray-500 tabular-nums">
          {i + 1} / {words.length}
        </span>
        <button
          onClick={() => go(1)}
          disabled={i >= words.length - 1}
          className="p-2.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
          title={t('cards.next')}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      <p className="hidden sm:block mt-3 text-center text-xs text-gray-400">
        {t('cards.keysHint', { primary: filter === 'known' ? t('cards.keyRestore') : t('cards.keyAdd') })}
      </p>
    </div>
  )
}

const wordShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  word: PropTypes.string.isRequired,
  hint: PropTypes.string,
  definition: PropTypes.string,
  synonyms: PropTypes.arrayOf(PropTypes.string),
  part_of_speech: PropTypes.string,
  phonetic: PropTypes.string,
  example: PropTypes.string,
  frequency: PropTypes.number,
})

VocabFlashcards.propTypes = {
  words: PropTypes.arrayOf(wordShape).isRequired,
  saved: PropTypes.object.isRequired,
  busy: PropTypes.object.isRequired,
  filter: PropTypes.oneOf(['all', 'new', 'added', 'known']).isRequired,
  resetKey: PropTypes.string.isRequired,
  onAdd: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
  onRestore: PropTypes.func.isRequired,
}

export default VocabFlashcards
