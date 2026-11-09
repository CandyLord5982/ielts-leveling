// Free, keyless sources. dictionaryapi.dev gives phonetics but has a small
// word list; Wiktionary covers function words and inflected forms.
const DICTIONARY_API = 'https://api.dictionaryapi.dev/api/v2/entries/en'
const WIKTIONARY_API = 'https://en.wiktionary.org/api/rest_v1/page/definition'

// Normalized entry: { word, phonetic, meanings: [{ partOfSpeech, definitions: [{ definition, example }] }] }
const cache = new Map()

const htmlToText = (html) =>
  new DOMParser().parseFromString(html || '', 'text/html').body.textContent.trim()

// dictionaryapi.dev is a free hobby service: it sometimes hangs, rate-limits or 5xx's.
// Time out instead of waiting forever so we can fall through to the next source.
const FETCH_TIMEOUT_MS = 6000
async function timedFetch(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fromDictionaryApi(word) {
  const res = await timedFetch(`${DICTIONARY_API}/${encodeURIComponent(word)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('LOOKUP_FAILED')
  const [entry] = await res.json()
  return {
    word: entry.word,
    phonetic: entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || null,
    meanings: (entry.meanings || []).map((m) => ({
      partOfSpeech: m.partOfSpeech,
      definitions: (m.definitions || []).map((d) => ({ definition: d.definition, example: d.example || null })),
    })),
  }
}

async function fromWiktionary(word) {
  const res = await timedFetch(`${WIKTIONARY_API}/${encodeURIComponent(word)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('LOOKUP_FAILED')
  const data = await res.json()
  const meanings = (data.en || [])
    .map((m) => ({
      partOfSpeech: m.partOfSpeech?.toLowerCase(),
      definitions: (m.definitions || [])
        .map((d) => ({ definition: htmlToText(d.definition), example: htmlToText(d.examples?.[0]) || null }))
        .filter((d) => d.definition && !/^misspelling of/i.test(d.definition)),
    }))
    .filter((m) => m.definitions.length)
  return meanings.length ? { word, phonetic: null, meanings } : null
}

// Crude base forms for when both sources miss an inflected word.
const baseForms = (word) => {
  const forms = []
  if (word.endsWith('ies')) forms.push(word.slice(0, -3) + 'y')
  if (word.endsWith('es')) forms.push(word.slice(0, -2))
  if (word.endsWith('s')) forms.push(word.slice(0, -1))
  if (word.endsWith('ed')) forms.push(word.slice(0, -2), word.slice(0, -1))
  if (word.endsWith('ing')) forms.push(word.slice(0, -3), word.slice(0, -3) + 'e')
  return [...new Set(forms)].filter((f) => f.length > 1)
}

// Run one source; a failure (timeout, 5xx, network) retries once, then is recorded rather than
// thrown, so a flaky source can't stop the next one from being tried.
async function trySource(source, word, state) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await source(word)
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 300))
    }
  }
  state.failed = true
  return null
}

async function resolve(word) {
  const state = { failed: false }
  const direct =
    (await trySource(fromDictionaryApi, word, state)) || (await trySource(fromWiktionary, word, state))
  if (direct) return direct
  for (const form of baseForms(word)) {
    const entry = await trySource(fromDictionaryApi, form, state)
    if (entry) return entry
  }
  // Nothing found: only call it "not found" if no source actually errored out,
  // otherwise report a failure so the popup offers a retry instead of a false "not found".
  if (state.failed) throw new Error('LOOKUP_FAILED')
  return null
}

export function lookupWord(word) {
  const key = word.trim().toLowerCase()
  if (!key) return Promise.reject(new Error('NOT_FOUND'))

  if (!cache.has(key)) {
    const pending = resolve(key)
      .then((entry) => {
        if (!entry) throw new Error('NOT_FOUND')
        return entry
      })
      .catch((err) => {
        // Keep "not found" cached, but let network failures be retried.
        if (err.message !== 'NOT_FOUND') cache.delete(key)
        throw err
      })
    cache.set(key, pending)
  }
  return cache.get(key)
}
