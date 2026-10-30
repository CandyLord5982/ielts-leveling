const STORAGE_KEY = 'petDash.muted'

export const readDashMuted = () => {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

export const writeDashMuted = (muted) => {
  try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0') } catch { /* private mode */ }
}

// [frequency, start, duration, wave, volume, slideTo]
const SOUNDS = {
  correct: [[660, 0, 0.09, 'triangle', 0.22], [990, 0.07, 0.16, 'triangle', 0.22]],
  combo: [[660, 0, 0.07, 'triangle', 0.2], [880, 0.06, 0.07, 'triangle', 0.2], [1320, 0.12, 0.2, 'triangle', 0.2]],
  wrong: [[220, 0, 0.22, 'sawtooth', 0.16, 110]],
  hit: [[140, 0, 0.25, 'square', 0.18, 50]],
  dodge: [[520, 0, 0.06, 'sine', 0.1, 700]],
  pickup: [[523, 0, 0.08, 'sine', 0.2], [659, 0.07, 0.08, 'sine', 0.2], [784, 0.14, 0.18, 'sine', 0.2]],
  tick: [[440, 0, 0.1, 'sine', 0.16]],
  go: [[880, 0, 0.32, 'triangle', 0.22]],
  win: [[523, 0, 0.14, 'triangle', 0.22], [659, 0.14, 0.14, 'triangle', 0.22], [784, 0.28, 0.14, 'triangle', 0.22], [1047, 0.42, 0.4, 'triangle', 0.22]],
  lose: [[392, 0, 0.18, 'triangle', 0.2], [330, 0.18, 0.18, 'triangle', 0.2], [262, 0.36, 0.4, 'triangle', 0.2]],
}

// Tiny synthesized sound kit + word pronunciation. Nothing is downloaded; both parts silently
// do nothing when the browser lacks Web Audio or speech synthesis.
export const createDashAudio = (initialMuted = false) => {
  let muted = initialMuted
  let context = null

  const ensureContext = () => {
    if (context) return context
    const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
    if (!Ctor) return null
    try { context = new Ctor() } catch { context = null }
    return context
  }

  const resume = () => {
    const ctx = ensureContext()
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
  }

  const play = (name) => {
    if (muted) return
    const ctx = ensureContext()
    const notes = SOUNDS[name]
    if (!ctx || !notes) return
    const now = ctx.currentTime
    for (const [freq, start, duration, wave, volume, slideTo] of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = wave
      osc.frequency.setValueAtTime(freq, now + start)
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + start + duration)
      gain.gain.setValueAtTime(0.0001, now + start)
      gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + start)
      osc.stop(now + start + duration + 0.02)
    }
  }

  // force: the player asked to hear the word (e.g. a tap on the results card), so play it even when muted.
  const speak = (text, { force = false } = {}) => {
    if ((muted && !force) || !text || typeof window === 'undefined' || !window.speechSynthesis) return
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-US'
      utterance.rate = 0.95
      utterance.volume = 0.9
      window.speechSynthesis.speak(utterance)
    } catch { /* speech is a bonus */ }
  }

  return {
    play,
    speak,
    resume,
    get muted() { return muted },
    setMuted(value) {
      muted = Boolean(value)
      if (muted) { try { window.speechSynthesis?.cancel() } catch { /* noop */ } }
    },
    dispose() {
      try { window.speechSynthesis?.cancel() } catch { /* noop */ }
      context?.close?.().catch(() => {})
      context = null
    },
  }
}
