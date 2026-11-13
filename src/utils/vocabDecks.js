import { supabase } from '../supabase/client'

// Pet training games only use words the student has learned (saved_words linked to
// pet_word_bank). Below this many, the game picker is locked behind the learn page.
export const MIN_LEARNED_WORDS = 10

export const LEARN_PATH = '/review/vocab/learn'

const DECK_INFO = {
  sat: { name: 'SAT', desc: 'Từ vựng học thuật thường gặp trong đề SAT' },
  ielts: { name: 'IELTS', desc: 'Từ vựng theo chủ đề cho IELTS' },
}

export const deckInfo = (deck) => DECK_INFO[deck] || { name: deck.toUpperCase(), desc: '' }

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

// The bank words this user has learned, in the shape the pet games expect.
// Returns null when the query fails (e.g. migration not applied) so callers can fall back.
export async function fetchLearnedBankWords(userId) {
  const { data, error } = await supabase
    .from('saved_words')
    .select('bank:pet_word_bank(word, hint, image_url)')
    .eq('user_id', userId)
    .not('bank_word_id', 'is', null)
  if (error) {
    console.error('Error loading learned words:', error)
    return null
  }
  // Inactive bank rows come back as null through RLS.
  return (data || []).map((r) => r.bank).filter(Boolean)
}
