import { assetUrl } from '../hooks/useBranding'

/**
 * Wild Area zones. Each zone is a maze biome the player picks before searching.
 *
 * `multipliers` scale the admin-configured base rarity weights
 * (drop_config.pet_encounter.rarity_weights). They are for DISPLAY ONLY here —
 * the authoritative copy lives in roll_wild_area_encounter()
 * (supabase/migrations/wild_area_zones.sql). Keep the two in sync.
 */
export const WILD_ZONES = [
  {
    id: 'forest',
    name: 'Enchanted Forest',
    tagline: 'Calm woods. Plenty of common pets.',
    emoji: '🌿',
    danger: 1,
    petHp: 3,
    multipliers: { common: 1.4, uncommon: 1, rare: 0.6, epic: 0.5, legendary: 0.5 },
    bg: 'from-emerald-950 via-green-950 to-slate-950',
    accent: '#22c55e',
    bgMobile: assetUrl('/adventure/forest-mb.jpg'),
    bgDesktop: assetUrl('/adventure/forest.jpg'),
  },
  {
    id: 'swamp',
    name: 'Mystic Swamp',
    tagline: 'Murky water hides uncommon finds.',
    emoji: '🍄',
    danger: 2,
    petHp: 3,
    multipliers: { common: 0.8, uncommon: 1.6, rare: 1, epic: 1, legendary: 1 },
    bg: 'from-teal-950 via-emerald-950 to-slate-950',
    accent: '#14b8a6',
    bgMobile: assetUrl('/adventure/swamp-mb.jpg'),
    bgDesktop: assetUrl('/adventure/swamp.jpg'),
  },
  {
    id: 'caves',
    name: 'Crystal Caves',
    tagline: 'Rare pets nest between the crystals.',
    emoji: '💎',
    danger: 2,
    petHp: 3,
    multipliers: { common: 0.6, uncommon: 1, rare: 2, epic: 1.2, legendary: 1 },
    bg: 'from-blue-950 via-indigo-950 to-slate-950',
    accent: '#6366f1',
    bgMobile: assetUrl('/adventure/cave-mb.jpg'),
    bgDesktop: assetUrl('/adventure/cave.jpg'),
  },
  {
    id: 'frozen',
    name: 'Frozen Peaks',
    tagline: 'Harsh cold, but epic pets roam here.',
    emoji: '❄️',
    danger: 3,
    petHp: 3,
    multipliers: { common: 0.4, uncommon: 0.8, rare: 1.6, epic: 2.5, legendary: 1.5 },
    bg: 'from-cyan-950 via-sky-950 to-slate-950',
    accent: '#22d3ee',
    bgMobile: assetUrl('/adventure/frozen-mb.jpg'),
    bgDesktop: assetUrl('/adventure/frozen.jpg'),
  },
  {
    id: 'volcano',
    name: 'Volcanic Ridge',
    tagline: 'Scorching. Your pet has only 2 hearts.',
    emoji: '🌋',
    danger: 4,
    petHp: 2,
    multipliers: { common: 0.3, uncommon: 0.6, rare: 1.4, epic: 4, legendary: 2 },
    bg: 'from-red-950 via-orange-950 to-slate-950',
    accent: '#ef4444',
    bgMobile: assetUrl('/adventure/volcano-mb.jpg'),
    bgDesktop: assetUrl('/adventure/volcano.jpg'),
  },
  {
    id: 'ruins',
    name: 'Shadow Ruins',
    tagline: 'Legends sleep here. Few return.',
    emoji: '🏚️',
    danger: 5,
    petHp: 2,
    multipliers: { common: 0.2, uncommon: 0.4, rare: 1.2, epic: 3, legendary: 5 },
    bg: 'from-violet-950 via-purple-950 to-slate-950',
    accent: '#a78bfa',
    bgMobile: assetUrl('/adventure/shadow-mb.jpg'),
    bgDesktop: assetUrl('/adventure/shadown%20ruin.jpg'),
  },
]

export const DEFAULT_ZONE_ID = 'forest'

export const getZone = (id) => WILD_ZONES.find((z) => z.id === id) || null

/** Rarities this zone boosts noticeably (multiplier >= 1.5), strongest first. */
export const boostedRarities = (zone) =>
  Object.entries(zone.multipliers)
    .filter(([, m]) => m >= 1.5)
    .sort((a, b) => b[1] - a[1])
    .map(([r]) => r)
