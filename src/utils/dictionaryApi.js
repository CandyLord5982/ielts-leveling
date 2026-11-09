// Free Dictionary API client (https://dictionaryapi.dev) - no key required.
const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en'

const cache = new Map()

export async function lookupWord(word) {
  const key = word.trim().toLowerCase()
  if (!key) throw new Error('Empty word')

  if (cache.has(key)) return cache.get(key)

  const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}`)
  if (!res.ok) {
    if (res.status === 404) throw new Error('NOT_FOUND')
    throw new Error('LOOKUP_FAILED')
  }

  const data = await res.json()
  cache.set(key, data)
  return data
}
