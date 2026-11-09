// Free, keyless sources. dictionaryapi.dev gives phonetics but has a small
// word list; Wiktionary covers function words and inflected forms.
const DICTIONARY_API = 'https://api.dictionaryapi.dev/api/v2/entries/en'
const WIKTIONARY_API = 'https://en.wiktionary.org/api/rest_v1/page/definition'

// Normalized entry: { word, phonetic, meanings: [{ partOfSpeech, definitions: [{ definition, example }] }] }
const cache = new Map()

const htmlToText = (html) =>
  new DOMParser().parseFromString(html || '', 'text/html').body.textContent.trim()

async function fromDictionaryApi(word) {
  const res = await fetch(`${DICTIONARY_API}/${encodeURIComponent(word)}`)
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
  const res = await fetch(`${WIKTIONARY_API}/${encodeURIComponent(word)}`)
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

async function resolve(word) {
  const direct = (await fromDictionaryApi(word)) || (await fromWiktionary(word))
  if (direct) return direct
  for (const form of baseForms(word)) {
    const entry = await fromDictionaryApi(form)
    if (entry) return entry
  }
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
