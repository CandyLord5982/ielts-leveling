/**
 * Builds the Bomb Party word assets.
 *
 *   node scripts/build-bombparty-words.mjs
 *
 * Sources (downloaded to scripts/.cache on first run):
 *   enable1.txt  - ENABLE1 lexicon, public domain, built for word games
 *                  (no proper nouns / abbreviations / hyphens). 172k words.
 *   20k.txt      - google-10000-english, MIT. Frequency-ranked web corpus.
 *
 * The two lists do two DIFFERENT jobs, and conflating them is a bug:
 *
 *   validation  - must accept any real English word, or the game tells a child
 *                 that "roar" isn't a word. Uses all of ENABLE1.
 *   prompts     - must only ask for syllables a learner can actually answer,
 *                 so difficulty tiers are counted over the *common* subset
 *                 (ENABLE1 ∩ frequency list). A prompt rated "easy" therefore
 *                 has 150+ answers a learner plausibly knows, even though far
 *                 more obscure answers are also accepted.
 *
 * Outputs to src/assets/bombparty/ (NOT public/ — vercel.json rewrites every
 * public passthrough to index.html, so those files 404 into the SPA shell):
 *   words.dict   - full validation dictionary, prefix-delta encoded (see below)
 *   prompts.json - [{ s, n, tier }] syllables with their COMMON answer counts
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE = path.join(__dirname, '.cache')
const OUT = path.join(__dirname, '..', 'src', 'assets', 'bombparty')

const SOURCES = {
  'enable1.txt': 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt',
  '20k.txt': 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/20k.txt',
}

// Minimum answers a syllable needs before we'll ever show it as a prompt.
const MIN_ANSWERS = 25
// Tier boundaries, by how many valid answers exist.
const TIER_EASY = 150
const TIER_MEDIUM = 60

const MIN_WORD_LEN = 3

/**
 * The frequency list is raw web n-grams, so the top 20k carries profanity,
 * slurs and adult-topic terms. This app ships to children, so anything
 * containing these fragments is dropped from both answers and prompts.
 * Substring matching is deliberately blunt — a few false positives (e.g.
 * "grasses") cost us nothing at 15k words, a false negative is a real problem.
 */
const BLOCK_FRAGMENTS = [
  'anal', 'anus', 'arse',  'bastard', 'bukkake',
  'cocaine', 'cock',  'cum', 'cunt', 'dick', 'dildo', 'douche',
  'dyke', 'ejacul', 'erotic', 'fetish', 'fuck',  'genital',
  'hooker', 'horny', 'incest', 'jerkoff', 'jizz', 'kike', 'lesbian',
  'masturb', 'milf',  'negro', 'nigg', 'nipple', 'orgasm', 'orgy',
  'porn', 'prostitut', 'pube', 'pussy', 'queer', 'rape', 'rapist',
  'rectum',  'scrotum',   'spic',
  'testicl',  'viagra', 'vulva',
  'whore', 'xxx',
]

const isClean = (w) => !BLOCK_FRAGMENTS.some((frag) => w.includes(frag))

async function ensureSource(name) {
  const dest = path.join(CACHE, name)
  if (fs.existsSync(dest)) return dest
  fs.mkdirSync(CACHE, { recursive: true })
  process.stdout.write(`  downloading ${name} ... `)
  const res = await fetch(SOURCES[name])
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  console.log('ok')
  return dest
}

const readWords = (file) =>
  fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)

async function main() {
  console.log('Bomb Party word build\n')

  const enablePath = await ensureSource('enable1.txt')
  const freqPath = await ensureSource('20k.txt')

  const enable = new Set(readWords(enablePath).filter((w) => /^[a-z]+$/.test(w) && w.length >= MIN_WORD_LEN))
  const freq = readWords(freqPath).filter((w) => /^[a-z]+$/.test(w) && w.length >= MIN_WORD_LEN)

  // Everything a player is allowed to type.
  const validation = [...enable].filter(isClean).sort()
  // The subset used to judge whether a prompt is fair.
  const common = freq.filter((w) => enable.has(w) && isClean(w))
  console.log(`\n  ENABLE1: ${enable.size}  freq: ${freq.length}`)
  console.log(`  validation dictionary: ${validation.length}   common subset: ${common.length}`)

  // Count, for every 2- and 3-letter substring, how many distinct COMMON words
  // contain it — tiers must reflect what a learner can reach, not raw ENABLE1.
  const counts = new Map()
  for (const w of common) {
    const seen = new Set()
    for (const n of [2, 3]) {
      for (let i = 0; i + n <= w.length; i++) {
        const s = w.slice(i, i + n)
        if (!seen.has(s)) {
          seen.add(s)
          counts.set(s, (counts.get(s) || 0) + 1)
        }
      }
    }
  }

  const prompts = [...counts]
    .filter(([s, n]) => n >= MIN_ANSWERS && isClean(s))
    .map(([s, n]) => ({
      s,
      n,
      tier: n >= TIER_EASY ? 'easy' : n >= TIER_MEDIUM ? 'medium' : 'hard',
    }))
    .sort((a, b) => b.n - a.n)

  const byTier = (t) => prompts.filter((p) => p.tier === t).length
  console.log(`  prompts: ${prompts.length}  (easy ${byTier('easy')} / medium ${byTier('medium')} / hard ${byTier('hard')})`)

  // Prefix-delta encoding: the list is sorted, so each entry stores only how
  // many leading characters it shares with the previous one (as a single char,
  // '0' + n, capped at 35) plus the differing suffix. Halves the gzipped size
  // and decodes in a few lines on the client.
  let prev = ''
  const encoded = validation
    .map((w) => {
      let i = 0
      while (i < prev.length && i < w.length && i < 35 && prev[i] === w[i]) i++
      prev = w
      return String.fromCharCode(48 + i) + w.slice(i)
    })
    .join('\n')

  fs.mkdirSync(OUT, { recursive: true })
  const wordsFile = path.join(OUT, 'words.dict')
  const promptsFile = path.join(OUT, 'prompts.json')
  fs.writeFileSync(wordsFile, encoded)
  fs.writeFileSync(promptsFile, JSON.stringify(prompts))

  // Guard against an encoder/decoder mismatch shipping silently.
  let check = ''
  const decoded = encoded.split('\n').map((line) => {
    check = check.slice(0, line.charCodeAt(0) - 48) + line.slice(1)
    return check
  })
  const ok = decoded.length === validation.length && decoded.every((w, i) => w === validation[i])
  console.log(`  round-trip decode: ${ok ? 'ok' : 'MISMATCH'}`)
  if (!ok) process.exit(1)

  // Old filename from a previous build — remove so stale copies can't be served.
  const legacy = path.join(OUT, 'words.txt')
  if (fs.existsSync(legacy)) fs.rmSync(legacy)

  const kb = (f) => `${(fs.statSync(f).size / 1024).toFixed(0)} KB`
  console.log(`\n  wrote ${path.relative(process.cwd(), wordsFile)}  (${kb(wordsFile)})`)
  console.log(`  wrote ${path.relative(process.cwd(), promptsFile)}  (${kb(promptsFile)})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
