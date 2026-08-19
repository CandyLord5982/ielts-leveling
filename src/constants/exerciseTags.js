export const EXERCISE_CATEGORIES = [
  { value: 'grammar', label: 'Grammar' },
  { value: 'vocabulary', label: 'Vocabulary' },
  { value: 'pronunciation', label: 'Pronunciation' },
  { value: 'listening', label: 'Listening' },
  { value: 'reading', label: 'Reading' },
]

export const EXERCISE_TAGS = {
  grammar: [
    'present-simple', 'past-simple', 'present-continuous', 'past-continuous',
    'present-perfect', 'future', 'conditionals', 'passive-voice',
    'comparatives', 'articles', 'prepositions', 'word-order', 'modals',
    'relative-clauses', 'reported-speech',
  ],
  vocabulary: [
    'animals', 'food', 'family', 'school', 'travel', 'body',
    'clothing', 'weather', 'jobs', 'daily-routine', 'emotions',
  ],
  pronunciation: [
    'vowels', 'consonants', 'stress', 'intonation', 'minimal-pairs',
  ],
  listening: [
    'dictation', 'comprehension',
  ],
  reading: [
    'main-idea', 'detail', 'inference',
  ],
}

// Flat list of all tags for when no category is selected
export const ALL_TAGS = Object.values(EXERCISE_TAGS).flat()
