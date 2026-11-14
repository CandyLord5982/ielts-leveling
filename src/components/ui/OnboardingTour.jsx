/* eslint-disable react/prop-types */
import { useEffect, useLayoutEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Step-by-step spotlight tour.
// Each step: { target?: 'data-tour value', title, body }. A step without a target
// (or whose target isn't on screen) shows as a centered card.
// Targets are found via [data-tour="..."]; the first visible match wins, so the same
// key can sit on both the desktop sidebar and the mobile bottom bar.

const PAD = 8 // space between the target and the spotlight edge
const GAP = 14 // space between the spotlight and the card
const CARD_W = 320

const findTarget = (key) => {
  if (!key) return null
  return [...document.querySelectorAll(`[data-tour="${key}"]`)].find((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }) || null
}

const OnboardingTour = ({ steps, onClose }) => {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const step = steps[index]
  const isLast = index === steps.length - 1

  // Scroll the target into view, then keep the spotlight glued to it.
  useLayoutEffect(() => {
    const el = findTarget(step?.target)
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    const fitsOnScreen = r.top >= 0 && r.bottom <= window.innerHeight
    // Fixed elements (nav bars) can't scroll; tall ones show their top.
    if (!fitsOnScreen && getComputedStyle(el).position !== 'fixed') {
      el.scrollIntoView({ behavior: 'smooth', block: r.height > window.innerHeight * 0.6 ? 'start' : 'center' })
    }

    let frame = null
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const b = el.getBoundingClientRect()
        setRect({ top: b.top, left: b.left, width: b.width, height: b.height })
      })
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [step?.target, index])

  const next = useCallback(() => (isLast ? onClose() : setIndex((i) => i + 1)), [isLast, onClose])
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      // Enter is handled by the autofocused Next button, so it isn't listed here (would double-step)
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, back, onClose])

  // Lock page scroll by the user while the tour is open (the tour itself scrolls via scrollIntoView).
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  if (!step) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const cardW = Math.min(CARD_W, vw - 32)

  // Spotlight box (clamped to the viewport so a tall target doesn't push the card off screen)
  const spot = rect && {
    top: Math.max(4, rect.top - PAD),
    left: Math.max(4, rect.left - PAD),
    right: Math.min(vw - 4, rect.left + rect.width + PAD),
    bottom: Math.min(vh - 4, rect.top + rect.height + PAD),
  }

  // Card placement: below if it fits, else above, else beside (for the tall sidebar), else centered.
  let cardStyle
  if (!spot) {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else {
    const CARD_H = 200 // rough estimate, enough to choose a side
    const centerX = Math.min(Math.max(16, (spot.left + spot.right) / 2 - cardW / 2), vw - cardW - 16)
    if (vh - spot.bottom >= CARD_H + GAP) {
      cardStyle = { top: spot.bottom + GAP, left: centerX }
    } else if (spot.top >= CARD_H + GAP) {
      cardStyle = { bottom: vh - spot.top + GAP, left: centerX }
    } else if (vw - spot.right >= cardW + GAP + 16) {
      cardStyle = { top: Math.max(16, Math.min(spot.top + 40, vh - CARD_H - 16)), left: spot.right + GAP }
    } else {
      cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-label={step.title}>
      {/* Click shield + dim. With a target, the spotlight's huge shadow does the dimming instead. */}
      <div className={`absolute inset-0 ${spot ? '' : 'bg-black/60'}`} />

      {spot && (
        <div
          className="absolute rounded-xl ring-2 ring-white/80 pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.right - spot.left,
            height: spot.bottom - spot.top,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          }}
        />
      )}

      <div
        key={index}
        className="absolute bg-white rounded-2xl shadow-2xl p-5 transition-opacity duration-200"
        style={{ width: cardW, ...cardStyle }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
          aria-label={t('tour.close')}
        >
          <X className="w-4 h-4" />
        </button>

        {step.emoji && <div className="text-3xl mb-2">{step.emoji}</div>}
        <h3 className="font-bold text-gray-900 pr-6">{step.title}</h3>
        <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{step.body}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          {/* Progress dots */}
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-blue-600' : 'w-1.5 bg-gray-300'}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button onClick={back} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800">
                {t('tour.back')}
              </button>
            ) : (
              <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600">
                {t('tour.skip')}
              </button>
            )}
            <button
              autoFocus
              onClick={next}
              className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              {isLast ? t('tour.start') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default OnboardingTour
