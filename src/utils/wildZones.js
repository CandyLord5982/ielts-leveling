import { assetUrl } from '../hooks/useBranding'

/**
 * Wild Area zones. Each zone is a maze biome the player picks before searching.
 * One zone per rarity, coloured like that rarity (gray, green, blue, purple, gold).
 *
 * Optional `layout` places the adventure map's spots by hand (in % of the map: x left→right,
 * y top→bottom, where feet stand): { camp, monsters: [5 spots], prize }. Shorter runs use spots
 * spread out from the 5; the last is always the final boss. Don't write it by hand: as an admin,
 * open the map, press "Edit layout", drag the spots, "Copy code", and paste it into the zone.
 * Without a layout the spots sit evenly on one row.
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
    rarity: 'common',
    multipliers: { common: 1.4, uncommon: 1, rare: 0.6, epic: 0.5, legendary: 0.5 },
    bg: 'from-zinc-900 via-neutral-950 to-slate-950',
    accent: '#9ca3af', // gray
    bgMobile: assetUrl('/adventure/forest-mb.jpg'),
    bgDesktop: assetUrl('/adventure/forest.jpg'),
    // Adventure map background. Covers one screen for now; with MAP_SCROLLING on
    // (PetMazeAdventure.jsx) it becomes a wide side-scrolling world using mapAspect.
    mapImage: assetUrl('/adventure/test.jpg'),
    mapAspect: 3825 / 1177,
    layout: {
      camp: { x: 4, y: 81 },
      monsters: [{ x: 30.5, y: 80 }, { x: 34, y: 81 }, { x: 50, y: 81 }, { x: 66, y: 81 }, { x: 80, y: 82 }],
      prize: { x: 96, y: 81 },
    },
  },
  {
    id: 'swamp',
    name: 'Mystic Swamp',
    tagline: 'Murky water hides uncommon finds.',
    emoji: '🍄',
    danger: 2,
    petHp: 3,
    rarity: 'uncommon',
    multipliers: { common: 0.8, uncommon: 1.6, rare: 1, epic: 1, legendary: 1 },
    bg: 'from-emerald-950 via-green-950 to-slate-950',
    accent: '#22c55e', // green
    bgMobile: assetUrl('/adventure/swamp-mb.jpg'),
    bgDesktop: assetUrl('/adventure/swamp.jpg'),
  },
  {
    id: 'caves',
    name: 'Crystal Caves',
    tagline: 'Rare pets nest between the crystals.',
    emoji: '💎',
    danger: 3,
    petHp: 3,
    rarity: 'rare',
    multipliers: { common: 0.6, uncommon: 1, rare: 2, epic: 1.2, legendary: 1 },
    bg: 'from-blue-950 via-indigo-950 to-slate-950',
    accent: '#3b82f6', // blue
    bgMobile: assetUrl('/adventure/cave-mb.jpg'),
    bgDesktop: assetUrl('/adventure/cave.jpg'),
  },
  {
    id: 'volcano',
    name: 'Volcanic Ridge',
    tagline: 'Scorching. Your pet has only 2 hearts.',
    emoji: '🌋',
    danger: 4,
    petHp: 2,
    rarity: 'epic',
    multipliers: { common: 0.3, uncommon: 0.6, rare: 1.4, epic: 4, legendary: 2 },
    bg: 'from-purple-950 via-violet-950 to-slate-950',
    accent: '#a855f7', // purple
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
    rarity: 'legendary',
    multipliers: { common: 0.2, uncommon: 0.4, rare: 1.2, epic: 3, legendary: 5 },
    bg: 'from-amber-950 via-yellow-950 to-slate-950',
    accent: '#facc15', // gold
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
