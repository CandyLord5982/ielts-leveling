// AssemblyAI Pronunciation Assessment Service
//
// AssemblyAI is a speech-to-text engine, not a pronunciation scorer: it returns
// what it heard, a per-word confidence, and word timings. This module derives
// the scores the pronunciation exercise renders by aligning the transcript
// against the reference text and reading the signals AssemblyAI does give us.
//
//   accuracy      - per-word similarity to the reference, weighted by confidence
//   completeness  - how much of the reference was actually spoken
//   fluency       - pausing behaviour, from word timings
//   pronunciation - weighted blend of the three

const MATCH_THRESHOLD = 0.6    // similarity at/above which a word counts as "said"
const PAUSE_TOLERANCE_MS = 250 // gaps shorter than this are normal speech rhythm
const GAP_PENALTY = -0.5       // alignment cost of an inserted/omitted word

/** Strip HTML and punctuation, lowercase, and split into comparable tokens. */
export const tokenize = (text) => {
  const div = document.createElement('div')
  div.innerHTML = text || ''
  const plain = div.textContent || div.innerText || ''
  return plain
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Levenshtein edit distance between two short strings. */
const editDistance = (a, b) => {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = new Array(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    const swap = prev
    prev = curr
    curr = swap
  }
  return prev[b.length]
}

/** 0..1 similarity. 1 means identical, 0 means nothing in common. */
export const similarity = (a, b) => {
  const longest = Math.max(a.length, b.length)
  if (!longest) return 0
  return 1 - editDistance(a, b) / longest
}

/**
 * Needleman-Wunsch alignment of reference tokens to spoken tokens.
 * Returns one entry per reference word, each holding the spoken word it was
 * matched to (or null when the word was skipped entirely).
 */
export const alignWords = (reference, spoken) => {
  const n = reference.length
  const m = spoken.length

  // score[i][j] = best alignment score for reference[0..i) against spoken[0..j)
  const score = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) score[i][0] = i * GAP_PENALTY
  for (let j = 1; j <= m; j++) score[0][j] = j * GAP_PENALTY

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = similarity(reference[i - 1], spoken[j - 1].text)
      score[i][j] = Math.max(
        score[i - 1][j - 1] + sim,     // pair them up
        score[i - 1][j] + GAP_PENALTY, // reference word omitted
        score[i][j - 1] + GAP_PENALTY  // spoken word inserted
      )
    }
  }

  // Walk back through the matrix to recover the pairing.
  const pairs = []
  let i = n
  let j = m
  while (i > 0) {
    if (j > 0) {
      const sim = similarity(reference[i - 1], spoken[j - 1].text)
      if (score[i][j] === score[i - 1][j - 1] + sim) {
        pairs.push({ reference: reference[i - 1], spoken: spoken[j - 1], sim })
        i--
        j--
        continue
      }
      if (score[i][j] === score[i][j - 1] + GAP_PENALTY) {
        j--
        continue
      }
    }
    pairs.push({ reference: reference[i - 1], spoken: null, sim: 0 })
    i--
  }

  return pairs.reverse()
}

/**
 * Fluency from word timings: long silences mid-utterance drag the score down.
 * Returns a neutral score when there is too little to measure.
 */
export const scoreFluency = (spoken) => {
  if (spoken.length < 2) return 100

  const first = spoken[0]
  const last = spoken[spoken.length - 1]
  const span = last.end - first.start
  if (!span || span <= 0) return 100

  let pausedMs = 0
  for (let i = 1; i < spoken.length; i++) {
    const gap = spoken[i].start - spoken[i - 1].end
    if (gap > PAUSE_TOLERANCE_MS) pausedMs += gap - PAUSE_TOLERANCE_MS
  }

  const pauseRatio = pausedMs / span
  return Math.round(Math.max(40, Math.min(100, 100 - pauseRatio * 150)))
}

/**
 * Score a recording against the reference text. Word entries come back in the
 * shape the exercise renders.
 */
export const scoreAgainstReference = (referenceText, transcript, spokenWords) => {
  const reference = tokenize(referenceText)

  if (!reference.length) {
    return { words: [], accuracyScore: 0, completenessScore: 0, fluencyScore: 0, pronunciationScore: 0 }
  }

  // Prefer AssemblyAI's word objects (they carry confidence and timings), but
  // fall back to splitting the plain transcript if they are missing.
  const spoken = (spokenWords && spokenWords.length)
    ? spokenWords
        .map(w => ({
          text: tokenize(w.text)[0] || '',
          confidence: typeof w.confidence === 'number' ? w.confidence : 1,
          start: w.start ?? 0,
          end: w.end ?? 0
        }))
        .filter(w => w.text)
    : tokenize(transcript).map(text => ({ text, confidence: 1, start: 0, end: 0 }))

  const pairs = alignWords(reference, spoken)

  const words = pairs.map(({ reference: ref, spoken: match, sim }) => {
    let accuracy = 0
    let errorType = 'Omission'

    if (match && sim >= MATCH_THRESHOLD) {
      // A confident recognition of the right word scores full marks; a hesitant
      // or partial one is scaled down rather than failed outright.
      accuracy = Math.round(100 * sim * (0.6 + 0.4 * match.confidence))
      errorType = sim === 1 ? 'None' : 'Mispronunciation'
    } else if (match) {
      accuracy = Math.round(100 * sim * 0.5)
      errorType = 'Mispronunciation'
    }

    return {
      Word: ref,
      PronunciationAssessment: { AccuracyScore: accuracy, ErrorType: errorType }
    }
  })

  const matched = words.filter(w => w.PronunciationAssessment.AccuracyScore >= MATCH_THRESHOLD * 100)
  const accuracyScore = Math.round(
    words.reduce((sum, w) => sum + w.PronunciationAssessment.AccuracyScore, 0) / words.length
  )
  const completenessScore = Math.round((matched.length / reference.length) * 100)
  const fluencyScore = scoreFluency(spoken)
  const pronunciationScore = Math.round(
    accuracyScore * 0.6 + completenessScore * 0.2 + fluencyScore * 0.2
  )

  return { words, accuracyScore, completenessScore, fluencyScore, pronunciationScore }
}

/**
 * Transcribe a recording via the /api/transcribe proxy and score it against
 * the reference text.
 */
export const assessPronunciation = async (referenceText, audioBlob) => {
  if (!audioBlob || audioBlob.size < 1000) {
    return { success: false, error: 'AUDIO_TOO_SHORT', message: 'Recording too short — try again' }
  }

  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
      body: audioBlob
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: 'SERVICE_ERROR',
        message: data.error || 'Transcription failed'
      }
    }

    if (!data.text || !data.text.trim()) {
      return {
        success: false,
        error: 'NO_SPEECH',
        message: 'Could not understand speech. Please try again.'
      }
    }

    return {
      success: true,
      text: data.text,
      ...scoreAgainstReference(referenceText, data.text, data.words)
    }
  } catch (error) {
    console.error('Pronunciation assessment error:', error)
    return { success: false, error: 'SERVICE_ERROR', message: error.message }
  }
}
