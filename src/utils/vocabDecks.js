import { supabase } from '../supabase/client'

// Pet training games only use bank words the student has added to their list AND reviewed
// at least once in /review/vocab. Below this many, the game picker is locked.
export const MIN_LEARNED_WORDS = 10

// Browse a deck and add words to your own list.
export const BANK_PATH = '/review/vocab/bank'

// Deck names are proper nouns, so they aren't translated.
const DECK_INFO = {
  sat: { name: 'SAT' },
  ielts: { name: 'IELTS' },
}

export const deckInfo = (deck) => DECK_INFO[deck] || { name: deck.toUpperCase() }

// `hint` is "definition; syn1, syn2". definition/synonyms columns override it when an
// import fills them in; otherwise split the hint.
export const cardDefinition = (w) => w.definition || w.hint?.split(';')[0].trim() || ''

export const cardSynonyms = (w) => {
  if (w.synonyms?.length) return w.synonyms
  const rest = w.hint?.split(';')[1]
  return rest ? rest.split(',').map((s) => s.trim()).filter(Boolean) : []
}

// What goes into saved_words.definition — the review quiz shows it as the prompt,
// so keep the synonyms (they help recall and never contain the answer itself).
export const savedDefinition = (w) => {
  const syn = cardSynonyms(w)
  return syn.length ? `${cardDefinition(w)}; ${syn.join(', ')}` : cardDefinition(w)
}

// The active bank word for a word seen in text, trying its exact form first and then simple
// base forms ("mitigated" → "mitigate"). null when it isn't in any deck or the query fails.
export async function findBankWord(word, baseForms = () => []) {
  const key = word.trim().toLowerCase()
  const forms = [key, ...baseForms(key)]
  const { data, error } = await supabase
    .from('pet_word_bank')
    .select('id, word, deck, hint, definition, synonyms, part_of_speech, phonetic, example')
    .in('word', forms)
    .eq('is_active', true)
  if (error) {
    console.error('Error looking up bank word:', error)
    return null
  }
  if (!data?.length) return null
  return forms.map((f) => data.find((w) => w.word === f)).find(Boolean) || null
}

// Browser text-to-speech; silently does nothing where unsupported.
export const speakWord = (text) => {
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.9
    synth.speak(u)
  } catch { /* no speech support */ }
}

// 1–5 from the wordfreq Zipf score (3 ≈ once per million words). null when unscored.
export const frequencyLevel = (f) => {
  if (f == null) return null
  if (f >= 4) return 5
  if (f >= 3.5) return 4
  if (f >= 3) return 3
  if (f >= 2.75) return 2
  return 1
}

// The student's bank words: how many they've added, and the reviewed ones in the shape the
// pet games expect. Returns null when the query fails so callers can fall back.
export async function fetchLearnedBankWords(userId) {
  const { data, error } = await supabase
    .from('saved_words')
    .select('last_reviewed_at, bank:pet_word_bank(word, hint, image_url)')
    .eq('user_id', userId)
    .not('bank_word_id', 'is', null)
  if (error) {
    console.error('Error loading learned words:', error)
    return null
  }
  // Inactive bank rows come back as null through RLS.
  const rows = (data || []).filter((r) => r.bank)
  return {
    added: rows.length,
    reviewed: rows.filter((r) => r.last_reviewed_at).map((r) => r.bank),
  }
}
