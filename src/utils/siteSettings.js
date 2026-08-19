import { supabase } from '../supabase/client'

// ============================================================
// Shared site_settings cache
//
// site_settings holds a few dozen tiny, rarely-changing config rows
// (branding, pvp/chest/maze schedules, leaderboard competition, class war
// rewards, demo/register course ids, ...). They change a handful of times a
// week but were being re-fetched on nearly every page/component mount across
// 15 files — one of the top sources of PostgREST egress.
//
// This fetches ALL settings once and serves every reader from an in-memory
// cache (shared across the whole tab) backed by localStorage with a short
// TTL. Concurrent callers during a cold load share a single in-flight request.
//
// Admin write screens call invalidateSiteSettings() after saving so edits
// show up immediately instead of waiting out the TTL.
// ============================================================

const TTL_MS = 5 * 60 * 1000 // 5 minutes
const LS_KEY = 'site_settings_cache_v1'

let cache = null // { [setting_key]: setting_value }
let cacheTime = 0
let inflight = null // dedupe concurrent cold loads

const readLS = () => {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.t !== 'number' || !parsed.v) return null
    if (Date.now() - parsed.t > TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

const writeLS = (map, t) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ t, v: map }))
  } catch {
    /* storage full / unavailable — in-memory cache still works */
  }
}

const load = async () => {
  const { data, error } = await supabase
    .from('site_settings')
    .select('setting_key, setting_value')

  if (error) throw error

  const map = {}
  data?.forEach((row) => {
    map[row.setting_key] = row.setting_value
  })

  cache = map
  cacheTime = Date.now()
  writeLS(map, cacheTime)
  return map
}

/**
 * Get the full settings map: { [setting_key]: setting_value }.
 * Serves from memory, then localStorage, then the network.
 * @param {{ force?: boolean }} [opts] force a fresh network fetch
 */
export const getSiteSettings = async ({ force = false } = {}) => {
  if (!force) {
    if (cache && Date.now() - cacheTime < TTL_MS) return cache
    if (!cache) {
      const ls = readLS()
      if (ls) {
        cache = ls.v
        cacheTime = ls.t
        return cache
      }
    } else {
      // cache present but stale — fall through to refetch
    }
  }

  if (inflight) return inflight
  inflight = load().finally(() => {
    inflight = null
  })
  return inflight
}

/**
 * Get a subset of settings as a map. Pass an array of keys.
 * Missing keys come back as undefined.
 */
export const getSettings = async (keys, opts) => {
  const all = await getSiteSettings(opts)
  if (!keys) return all
  const out = {}
  keys.forEach((k) => {
    out[k] = all[k]
  })
  return out
}

/**
 * Get a single setting value (string) by key.
 */
export const getSetting = async (key, opts) => {
  const all = await getSiteSettings(opts)
  return all[key]
}

/**
 * Drop the cache (memory + localStorage). Call after writing settings so the
 * next read pulls fresh values.
 */
export const invalidateSiteSettings = () => {
  cache = null
  cacheTime = 0
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}
