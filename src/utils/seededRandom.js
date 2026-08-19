// Mulberry32 seeded PRNG - deterministic random from a numeric seed
export function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fisher-Yates shuffle using a seeded RNG
export function seededShuffle(arr, rng) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Mirrors pickGameWords from PetWordType but uses seeded shuffle
// Generates a large pool (60+ words) so players don't run out in 76s
export function seededPickGameWords(source, seed) {
  const rng = mulberry32(seed)
  // Sort source alphabetically first to guarantee identical input order
  const sorted = [...source].sort((a, b) => a.word.localeCompare(b.word))

  const all = seededShuffle(sorted, rng)
  const short = all.filter(w => w.word.length <= 4)
  const medium = all.filter(w => w.word.length === 5)
  const long = all.filter(w => w.word.length === 6)
  const longer = all.filter(w => w.word.length >= 7)

  const buckets = [short, medium, long, longer]
  const picked = []
  const maxLen = Math.max(...buckets.map(b => b.length))
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of buckets) {
      if (i < bucket.length) picked.push(bucket[i])
    }
  }
  // Return up to 60 words - enough for 76 seconds
  return picked.slice(0, 60)
}

// Pick words for match game rounds using seeded shuffle
// Returns an array of arrays, one per round, each with PAIRS_PER_ROUND word-hint pairs
export function seededPickMatchWords(source, seed, pairsPerRound = 6, rounds = 10) {
  const rng = mulberry32(seed)
  const sorted = [...source].sort((a, b) => a.word.localeCompare(b.word))
  const all = seededShuffle(sorted, rng)
  const result = []
  for (let r = 0; r < rounds; r++) {
    const start = r * pairsPerRound
    const chunk = all.slice(start, start + pairsPerRound)
    if (chunk.length < pairsPerRound) {
      // Wrap around if we run out
      const extra = all.slice(0, pairsPerRound - chunk.length)
      chunk.push(...extra)
    }
    result.push(chunk)
  }
  return result
}
