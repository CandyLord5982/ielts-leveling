// Sounds for answers on the review pages (missed questions + vocab review).
// Each is loaded once and reused so it plays instantly.
import { assetUrl } from '../hooks/useBranding'

const cache = {}

const play = (path) => {
  try {
    if (!cache[path]) {
      cache[path] = new Audio(assetUrl(path))
      cache[path].volume = 0.7
    }
    const audio = cache[path]
    audio.currentTime = 0
    audio.play().catch(() => { /* autoplay blocked or file missing: stay silent */ })
  } catch { /* audio not supported */ }
}

export const playReviewCorrect = () => play('/sound/correct-review.mp3')
export const playReviewWrong = () => play('/sound/incorrect-review.mp3')
