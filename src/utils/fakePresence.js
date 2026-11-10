// Made-up students added to the "online users" lists so the community doesn't look empty.
//
// - They exist only on screen: nothing is stored, so they never appear on leaderboards,
//   in reports or in classes. Their profile page shows made-up stats (buildFakeProfile);
//   they can't be challenged (is_fake: true).
// - Who is online is worked out from the clock alone, so every student sees the same
//   people online at the same time, and it changes gradually: each fake has its own
//   session length and offset, with more people online in the evening (Vietnam time).
//
// Turn the whole thing off with FAKE_PRESENCE_ENABLED = false.

import { supabase } from '../supabase/client'

export const FAKE_PRESENCE_ENABLED = true

// Display names, written the way students write them. Each one's position in this list
// decides their ID, avatar, stats and online times, so add new names at the end.
const FAKE_NAMES = [
  'Mỹ Uyên', 'Zacha', '15thanggg05', 'Bảo Trâm', 'Minh Nhat',
  'Thanh Phong', 'Bảo Ngọc', 'Bảo Ngân', 'Bích Phương', 'Khánh Vy',
  'Quang Huy', 'Bảo Anh', 'Dương', 'Gà Công Nghiệp x9', 'Khánh',
  'Kim Bảo (đẹp trai)', 'Bảo Ngọc Mint', 'Bảo Lân (đep trai)', 'Hà Giang', 'Minh Anh A',
  'Đình Cường', 'Huyền My', 'Huyền Anh', 'FCMOBILE IS BEST GAME', 'Gia Long',
  'Ngọc Hân', 'Hoàng An', 'Tuệ Minh', 'An Phú', 'Hải Long',
  'Nhật minh', 'Bảo Quân', 'Thảo nguyên', 'U_U', 'Hải Hà',
  'npc_vn', 'minhchau', 'Nhật Long', 'Tina', 'Bruhh',
  'Minh Khang', 'Gia Nhi :))))🇻🇳', 'mai Nhi🇻🇳❤️', 'Hoàng Nam', 'Hoàng Quân',
  'Minh Châu', 'Minh Đức', 'Ha Uyen', 'Tuan Hien', 'meo',
  // 51-200
  'Phương Linh', 'Thùy Dương', 'Gia Hân', 'Anh Thư', 'Ngọc Ánh',
  'Đức Anh', 'Tuấn Kiệt', 'Minh Quân', 'Quốc Bảo', 'Thành Đạt',
  'Khôi Nguyên', 'Hà My', 'Bảo Châu', 'Yến Nhi', 'Thu Trang',
  'Phương Thảo', 'Diệu Linh', 'Mai Anh', 'Hồng Nhung', 'Cẩm Tú',
  'Trung Kiên', 'Văn Toàn', 'Hữu Phước', 'Nhật Nam', 'Gia Bảo',
  'Hoàng Long', 'Duy Khánh', 'Tiến Dũng', 'Bảo Long', 'Đăng Khoa',
  'Linh Chi', 'Ngọc Diệp', 'Thanh Hương', 'Minh Thư', 'Ánh Dương',
  'Kim Ngân', 'Trúc Linh', 'Hải Yến', 'Quỳnh Anh', 'Thảo Vy',
  'Minh Tuấn', 'Quang Minh', 'Đức Huy', 'Tấn Phát', 'Gia Huy',
  'Hoàng Phúc', 'Thiên Ân', 'Phúc Lâm', 'Bảo Khang', 'Nam Khánh',
  'minh anh', 'thu ha', 'bao ngoc 2k12', 'Nhi Nhi', 'Su Su',
  'Bơ', 'Mít', 'Bin', 'Ken', 'Bống',
  'Chíp Chíp', 'Tôm', 'Cún', 'Na Na', 'Mochi',
  'Bông', 'Sóc', 'Kem Dâu', 'Mèo Ú', 'Gấu Trúc',
  'Pikachu Vn', 'Doraemon fan', 'Naruto20', 'Goku Đen', 'Sasuke_vn',
  'Free Fire Pro', 'Liên Quân Top 1', 'Roblox kid', 'minecraft_master', 'pubg_noob',
  'Tiểu Long', 'Hắc Long', 'Vua Tiếng Anh', 'Thánh IELTS', 'IELTS 9.0 :)))',
  'hoc sinh gioi', 'Không Biết Tên', 'Ai Đó', 'Người Qua Đường', 'Ẩn Danh 123',
  ' Minh Khôi', ' Thu Hà', 'Gia Hưng', 'Bảo Ngọc', 'D2 Hoàng Anh',
  'Mai', 'Huy', 'Thảo', 'Tuấn', 'A1 Quỳnh Như',
  'Bảo Hân 🌸', 'Ngọc Trâm 💕', 'Thanh Tâm ✨', 'Kim Anh 🌷', 'Hạ Vy 🐰',
  'Gia Hưng 😎', 'Minh Hiếu 🔥', 'Tuấn Anh ⚽', 'Đức Minh 🎮', 'Quốc Anh 🇻🇳',
  'Anh Khoa (cute)', 'Thành Nam (pro)', 'Bé Na', 'Minh Tú (học giỏi)', 'Hoàng Hải (vip)',
  'NgocLan', 'BaoTran', 'ThuyTien', 'MinhKhoi', 'GiaNghi',
  'xuanmai', 'thanhtruc', 'khanhlinh_', 'nguyenvana', 'tran.minh',
  'Hà Phương', 'Thu Thủy', 'Mai Phương', 'Ngọc Hà', 'Lan Anh',
  'Việt Anh', 'Hùng Cường', 'Mạnh Hùng', 'Đức Thịnh', 'Trọng Nghĩa',
  'Cá Viên Chiên', 'Bánh Bao', 'Trà Sữa Trân Châu', 'Xôi Gấc', 'Bún Chả',
  'abcxyz', 'hello123', 'zzz', 'kkk', 'hihi',
  'Pháp Sư Tiếng Anh', 'Học Mãi Không Giỏi', 'Chill Guy', 'sad boy 2k11', 'girl phố',
]

// Chance a fake is online at a given hour in Vietnam (0-23)
const onlineChanceAt = (hour) => {
  if (hour < 6) return 0.04
  if (hour < 11) return 0.18
  if (hour < 14) return 0.25
  if (hour < 17) return 0.2
  if (hour < 22) return 0.42
  return 0.15
}

// Small deterministic hash -> [0, 1)
const rand = (...parts) => {
  let h = 2166136261
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

const MIN = 60 * 1000
const vnHour = (ms) => new Date(ms + 7 * 60 * MIN).getUTCHours() // Vietnam is UTC+7, no DST

// Is fake #i online at time t? Each has a session length of 20-70 minutes and its own offset,
// so people come and go at different moments.
const isOnline = (i, t) => {
  const slotLen = (20 + Math.floor(rand('len', i) * 50)) * MIN
  const offset = Math.floor(rand('off', i) * slotLen)
  const slot = Math.floor((t + offset) / slotLen)
  const slotStart = slot * slotLen - offset
  return rand('on', i, slot) < onlineChanceAt(vnHour(slotStart))
}

// When fake #i was last online (within 24 h), checking back in 10-minute steps; null if not
const lastSeen = (i, t) => {
  for (let back = 10 * MIN; back <= 24 * 60 * MIN; back += 10 * MIN) {
    if (isOnline(i, t - back)) return new Date(t - back).toISOString()
  }
  return null
}

// ---------------------------------------------------------------------------
// Avatars: made-up students wear real avatars from the free list and the shop. The list is
// loaded once and remembered for a day (memory + localStorage), so it costs no requests
// after that. Every device sorts it the same way, so a fake wears the same avatar everywhere.
// ---------------------------------------------------------------------------
const AVATAR_POOL_KEY = 'fake_avatar_pool_v1'
const AVATAR_POOL_TTL = 24 * 60 * 60 * 1000
let avatarPool = null // { free: [url], shop: [url] }
let avatarPoolPromise = null

export const loadFakeAvatarPool = async () => {
  if (avatarPool) return avatarPool
  try {
    const saved = JSON.parse(localStorage.getItem(AVATAR_POOL_KEY) || 'null')
    if (saved && Date.now() - saved.t < AVATAR_POOL_TTL && saved.pool) {
      avatarPool = saved.pool
      return avatarPool
    }
  } catch { /* no saved copy: load it */ }
  if (!avatarPoolPromise) {
    avatarPoolPromise = Promise.all([
      supabase.from('avatars').select('image_url').eq('is_active', true),
      supabase.from('shop_items').select('image_url').eq('category', 'avatar').eq('is_active', true),
    ]).then(([free, shop]) => {
      const urls = (res) => [...new Set((res.data || []).map(r => r.image_url).filter(u => u && u.startsWith('http')))].sort()
      avatarPool = { free: urls(free), shop: urls(shop) }
      try { localStorage.setItem(AVATAR_POOL_KEY, JSON.stringify({ t: Date.now(), pool: avatarPool })) } catch { /* fine */ }
      return avatarPool
    }).catch(() => null).finally(() => { avatarPoolPromise = null })
  }
  return avatarPoolPromise
}

// ~15% keep the letter (like students who never picked one), ~25% a free avatar, the rest
// one from the shop
const fakeAvatarFor = (i) => {
  if (!avatarPool) return null
  const r = rand('avatarKind', i)
  const list = r < 0.15 ? null : (r < 0.4 && avatarPool.free.length ? avatarPool.free : avatarPool.shop)
  if (!list || list.length === 0) return null
  return list[Math.floor(rand('avatar', i) * list.length)]
}

// IDs look exactly like real ones (random-looking UUID v4), but are always the same for the
// same fake, so profile links keep working. Any database lookup for them finds nothing.
const hex = (n, ...seed) => {
  let out = ''
  for (let k = 0; out.length < n; k++) out += Math.floor(rand('uuid', ...seed, k) * 0x10000).toString(16).padStart(4, '0')
  return out.slice(0, n)
}
const fakeUserId = (i) => {
  const variant = '89ab'[Math.floor(rand('uuidVariant', i) * 4)]
  return `${hex(8, i, 'a')}-${hex(4, i, 'b')}-4${hex(3, i, 'c')}-${variant}${hex(3, i, 'd')}-${hex(12, i, 'e')}`
}
const FAKE_IDS = new Map(FAKE_NAMES.map((_, i) => [fakeUserId(i), i]))
export const isFakeUserId = (id) => FAKE_IDS.has(id)
const fakeIndexOf = (id) => FAKE_IDS.get(id) ?? -1

// ---------------------------------------------------------------------------
// Profile page data for a made-up user. Always the same for the same person, and it grows
// a little every day (XP, exercises, streak), so they look like they keep studying.
// ---------------------------------------------------------------------------
const DAY = 24 * 60 * MIN
const STATS_START = Date.UTC(2026, 9, 1) // growth is counted from 1 Oct 2026

export const buildFakeProfile = (id, now = Date.now()) => {
  const i = fakeIndexOf(id)
  if (!isFakeUserId(id) || !(i >= 0 && i < FAKE_NAMES.length)) return null
  const days = Math.max(0, Math.floor((now - STATS_START) / DAY))
  // Kept modest so made-up students don't look like the class's top players (they aren't
  // on the leaderboard): roughly 250-2000 XP by mid-November, growing 5-35 XP a day
  const dailyXp = 5 + Math.floor(rand('rate', i) * 30)
  const xp = 50 + Math.floor(rand('xp', i) * 600) + days * dailyXp
  const exercisesCompleted = Math.max(3, Math.round(xp / (10 + rand('xpPerEx', i) * 6)))
  // Streak runs in cycles of 5-40 days, then breaks and starts again
  const cycle = 5 + Math.floor(rand('cycle', i) * 35)
  const streak = (days + Math.floor(rand('cycleOff', i) * cycle)) % cycle
  const joined = new Date(STATS_START - Math.floor(rand('joined', i) * 75) * DAY)
  const level = 1 + Math.floor(rand('lvl', i) * 4)

  const userRow = {
    id,
    full_name: FAKE_NAMES[i],
    email: null,
    avatar_url: fakeAvatarFor(i),
    role: 'user',
    xp,
    gems: Math.floor(xp / 8),
    level,
    current_level: level,
    streak_count: streak,
    created_at: joined.toISOString(),
    is_banned: false,
    is_fake: true,
  }
  const stats = {
    totalXP: xp,
    exercisesCompleted,
    streakCount: streak,
    totalPracticeTime: Math.round(exercisesCompleted * (3 + rand('mins', i) * 5)), // minutes
    averageScore: 62 + Math.floor(rand('score', i) * 34), // 62-95
    levelsCompleted: 0,
    unitsCompleted: 0,
    sessionsCompleted: 0,
  }
  return { userRow, stats }
}

// 1-4 pets from the real pet catalog (rows of the `pets` table), mostly common ones
export const pickFakePets = (id, catalog) => {
  const i = fakeIndexOf(id)
  if (!Array.isArray(catalog) || catalog.length === 0) return []
  const weight = { common: 6, uncommon: 4, rare: 2, epic: 1, legendary: 0.3 }
  const pool = catalog.filter(p => (weight[p.rarity] ?? 1) > 0)
  const count = 1 + Math.floor(rand('petCount', i) * 4)
  const picked = []
  for (let n = 0; picked.length < count && n < 40; n++) {
    let r = rand('pet', i, n) * pool.reduce((s, p) => s + (weight[p.rarity] ?? 1), 0)
    const pet = pool.find(p => (r -= (weight[p.rarity] ?? 1)) < 0) || pool[0]
    if (!picked.some(x => x.id === pet.id)) picked.push(pet)
  }
  return picked.map((pet, n) => ({
    id: `${id}-pet-${n}`,
    pet,
    nickname: null,
    is_active: n === 0,
    level: 1 + Math.floor(rand('petLvl', i, n) * 15),
    evolution_stage: 0,
  }))
}

// Adds fakes to the real lists. Real users come first; fakes never replace them.
export const withFakePresence = (online, offline, now = Date.now()) => {
  if (!FAKE_PRESENCE_ENABLED) return { online, offline }
  const fakeOnline = []
  const fakeOffline = []
  FAKE_NAMES.forEach((full_name, i) => {
    const base = { id: fakeUserId(i), full_name, avatar_url: fakeAvatarFor(i), role: 'user', is_fake: true }
    if (isOnline(i, now)) {
      fakeOnline.push({ ...base, last_seen_at: new Date(now - rand('seen', i, Math.floor(now / MIN)) * 4 * MIN).toISOString() })
    } else {
      const seen = lastSeen(i, now)
      if (seen) fakeOffline.push({ ...base, last_seen_at: seen })
    }
  })
  fakeOffline.sort((a, b) => (a.last_seen_at < b.last_seen_at ? 1 : -1))
  return {
    online: [...online, ...fakeOnline],
    // Keep "recently online" from getting long: real ones first, then up to 12 fakes
    offline: [...offline, ...fakeOffline.slice(0, 12)],
  }
}
