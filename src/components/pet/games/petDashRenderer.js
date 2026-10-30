import { DASH_DURATION, getDashChoiceLabel } from '../../../utils/petDash'

// Everything on screen is drawn in "reference units" at the depth of the pet (scale 1) and then
// scaled by the row's perspective factor, so text layout is computed once per label.
export const DASH_LANE_COLORS = [
  { main: '#ff6b5b', dark: '#c94538', glow: '#ffb1a8' },
  { main: '#16b8a6', dark: '#0c8174', glow: '#8ef0e3' },
  { main: '#8a63ff', dark: '#5a37d1', glow: '#c8b5ff' },
]

const Z_NEAR_ROW = 3.4
const BAND = 0.45
const BAND_FAR = 12
const BAND_NEAR = 0.7
const TREE_SPACING = 1.15
const SCROLL_PER_METER = (Z_NEAR_ROW - 1) / (6 * 4.2)
const TEXT_FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif'
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
const PICKUP_ICON = { shield: '🛡️', heart: '❤️', clock: '⏱️', sniff: '🔍' }
const PICKUP_COLOR = { shield: ['#d8fbff', '#35b7d8'], heart: ['#ffe0e8', '#ff5c85'], clock: ['#fff1c2', '#ffb627'], sniff: ['#efe6ff', '#8a63ff'] }
const CLOSED_LANE = { main: '#aaa3c4', dark: '#7d7699', glow: '#d9d4ea' }
// Resolved rows keep moving past the pet for a moment instead of vanishing on the spot.
const PASS_SECONDS = 0.24
const JUMP_SECONDS = 0.32
const STUMBLE_SECONDS = 0.6

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
export const getDashRowScale = (progress) => 1 / (Z_NEAR_ROW - (Z_NEAR_ROW - 1) * progress)

const hexToRgb = (hex) => {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
const mixHex = (a, b, t) => {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return `rgb(${Math.round(lerp(x[0], y[0], t))},${Math.round(lerp(x[1], y[1], t))},${Math.round(lerp(x[2], y[2], t))})`
}

// Morning -> golden hour -> twilight across the 75 seconds.
const PALETTES = [
  { skyTop: '#4fb3ff', skyBottom: '#eaf8ff', hillFar: '#9bd8bd', hillNear: '#63bf8f', grassA: '#80d86c', grassB: '#73cc61', road: '#e8cfa3', roadDark: '#d8b988', rumbleA: '#ffffff', rumbleB: '#ff6b5b', tree: '#3fa466', trunk: '#8a5d3b', sun: '#fff3b0', cloud: '#ffffff' },
  { skyTop: '#ff8f66', skyBottom: '#ffe2a6', hillFar: '#d99b8a', hillNear: '#9c6f84', grassA: '#97c75a', grassB: '#8bbd50', road: '#e6c39a', roadDark: '#cfa77d', rumbleA: '#fff4dc', rumbleB: '#ff7a54', tree: '#4f8d4a', trunk: '#7a4f36', sun: '#ffd27a', cloud: '#ffd9b8' },
  { skyTop: '#1b1948', skyBottom: '#ff7fa3', hillFar: '#5b4a8b', hillNear: '#33295f', grassA: '#2c7c6a', grassB: '#277060', road: '#8f7ba3', roadDark: '#7b678f', rumbleA: '#ffe9f4', rumbleB: '#ff5f8f', tree: '#1c5a56', trunk: '#3b2a4c', sun: '#ffb0a0', cloud: '#7e6aa8' },
]
let paletteMemo = { key: -1, value: null }
const getPalette = (phase) => {
  const key = Math.round(clamp(phase, 0, 1) * 60)
  if (paletteMemo.key === key) return paletteMemo.value
  const t = key / 60
  const [from, to, local] = t < 0.5 ? [PALETTES[0], PALETTES[1], t / 0.5] : [PALETTES[1], PALETTES[2], (t - 0.5) / 0.5]
  const value = {}
  for (const name of Object.keys(from)) value[name] = mixHex(from[name], to[name], local)
  value.night = clamp((t - 0.6) / 0.35, 0, 1)
  paletteMemo = { key, value }
  return value
}

const roundRect = (ctx, x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export const getDashGeometry = ({ w, top, bottom }) => {
  const fh = Math.max(1, bottom - top)
  const horizon = top + fh * 0.2
  const hitY = top + fh * 0.84
  const k = hitY - horizon
  const L = w * 0.3
  return {
    w, cx: w / 2, top, bottom, fh, horizon, hitY, k, L,
    laneX: (lane, s = 1) => w / 2 + (lane - 1) * L * s,
    rowY: (s) => horizon + k * s,
  }
}

// ---------------------------------------------------------------- effects
export const createDashFx = () => ({
  particles: [], floaters: [], passing: [], shake: 0, flash: 0, flashColor: '#ff3b30',
  laneVis: 1, velocity: 0, stride: 0, dustTimer: 0, runner: null, jump: 0, stumble: 0,
})

const burst = (fx, x, y, count, colors, { speed = 260, gravity = 520, life = 0.8, size = 7, shape = 'rect', up = 0.6 } = {}) => {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const power = speed * (0.35 + Math.random() * 0.65)
    fx.particles.push({
      x, y, vx: Math.cos(angle) * power, vy: Math.sin(angle) * power - speed * up,
      gravity, life, max: life * (0.7 + Math.random() * 0.5), size: size * (0.6 + Math.random() * 0.8),
      color: colors[i % colors.length], shape, spin: (Math.random() - 0.5) * 12, angle: Math.random() * 6,
    })
  }
  if (fx.particles.length > 260) fx.particles.splice(0, fx.particles.length - 260)
}

const floater = (fx, x, y, text, color, size = 26, emoji = false) => {
  fx.floaters.push({ x, y, text, color, size, emoji, life: 0.95, max: 0.95 })
  if (fx.floaters.length > 12) fx.floaters.shift()
}

export const applyDashEvents = (fx, events, geo, { reducedMotion = false } = {}) => {
  const density = reducedMotion ? 0.3 : 1
  for (const event of events) {
    const x = geo.laneX(event.lane ?? 1)
    const y = geo.hitY - geo.L * 0.35
    const lane = DASH_LANE_COLORS[event.lane ?? 1]
    if (event.labels) fx.passing.push({ kind: 'gate', labels: event.labels, mode: event.mode, eliminated: event.eliminated, through: event.lane, age: 0 })
    if (event.blocked) fx.passing.push({ kind: 'obstacle', blocked: event.blocked, through: event.type === 'hit' ? event.lane : -1, age: 0 })
    if (event.type === 'correct') {
      fx.jump = JUMP_SECONDS
      burst(fx, x, y, Math.round((event.streak % 5 === 0 ? 46 : 24) * density), [lane.main, '#ffd23f', '#ffffff', lane.glow], { speed: 330, size: 8 })
      floater(fx, x, y - geo.L * 0.2, `+${event.points}`, '#ffe066', event.streak >= 5 ? 34 : 28)
      if (event.redeemed) floater(fx, x, y - geo.L * 0.55, 'REDEEMED!', '#9dffb0', 18)
      if (event.healed) {
        floater(fx, x + geo.L * 0.35, y - geo.L * 0.45, '❤️', '#fff', 30, true)
        burst(fx, x, y - geo.L * 0.2, Math.round(14 * density), ['#ff5c85', '#ffd0dc', '#ffffff'], { speed: 220, size: 8, shape: 'star' })
      }
      if (event.streak > 0 && event.streak % 5 === 0) { fx.flash = 0.25; fx.flashColor = '#ffd23f' }
    } else if (event.type === 'wrong' || event.type === 'hit') {
      fx.stumble = STUMBLE_SECONDS
      if (!reducedMotion) fx.shake = Math.max(fx.shake, event.type === 'hit' ? 16 : 11)
      fx.flash = event.shielded ? 0.18 : 0.38
      fx.flashColor = event.shielded ? '#7fe9ff' : '#ff3b30'
      burst(fx, x, y, Math.round(18 * density), event.shielded ? ['#7fe9ff', '#ffffff'] : ['#ff5a4d', '#ffb199', '#6b3b2a'], { speed: 280, size: 7, shape: 'circle' })
      if (event.type === 'hit' && !event.shielded) burst(fx, x, y + geo.L * 0.1, Math.round(10 * density), ['#ff4b3e', '#fff6ee', '#5a3d32'], { speed: 360, size: 10, life: 0.7 })
      floater(fx, x, y - geo.L * 0.2, event.shielded ? 'BLOCKED' : event.type === 'hit' ? 'OUCH' : 'MISS', event.shielded ? '#9ff2ff' : '#ff8a7a', 26)
    } else if (event.type === 'star' || event.type === 'flawless') {
      const cx = geo.w / 2
      const cy = geo.top + geo.fh * (event.type === 'star' ? 0.42 : 0.5)
      burst(fx, cx, cy, Math.round(40 * density), ['#ffd23f', '#fff3a8', '#ffffff', '#ff9f1c'], { speed: 420, gravity: 380, size: 12, shape: 'star', life: 1.1 })
      floater(fx, cx, cy, event.type === 'star' ? `STAR ${event.stage + 1}!` : `FLAWLESS +${event.points}`, '#ffe066', event.type === 'star' ? 44 : 34)
      fx.flash = 0.3
      fx.flashColor = '#ffd23f'
    } else if (event.type === 'dodge') {
      burst(fx, x, y + geo.L * 0.2, Math.round(7 * density), ['#f6e3b4', '#e2c58b'], { speed: 120, gravity: 120, size: 8, shape: 'circle', up: 0.2 })
      floater(fx, x, y - geo.L * 0.1, `+${event.points}`, '#fff1c2', 18)
    } else if (event.type === 'pickup') {
      const colors = PICKUP_COLOR[event.kind] || ['#fff', '#fff']
      burst(fx, geo.laneX(event.lane), y, Math.round(20 * density), [colors[1], '#ffffff', '#ffe066'], { speed: 300, size: 7, shape: 'star' })
      floater(fx, geo.laneX(event.lane), y - geo.L * 0.2, PICKUP_ICON[event.kind] || '', '#fff', 30, true)
    }
  }
}

// speed is the 0-10 rating of the current stage: it drives the stride, lane agility and dust.
// pace drops below 1 while the pet stumbles after a mistake.
export const updateDashFx = (fx, dt, lane, speed = 0, running = false, reducedMotion = false, pace = 1) => {
  const target = clamp(lane, 0, 2)
  const next = fx.laneVis + (target - fx.laneVis) * Math.min(1, dt * (16 + speed * 2.4))
  fx.jump = Math.max(0, fx.jump - dt)
  fx.stumble = Math.max(0, fx.stumble - dt)
  for (const row of fx.passing) row.age += dt
  if (fx.passing.length && fx.passing[0].age >= PASS_SECONDS) fx.passing = fx.passing.filter((row) => row.age < PASS_SECONDS)
  if (running) {
    fx.stride += dt * (11 + speed * 1.8) * pace
    fx.dustTimer -= dt * pace
    if (fx.dustTimer <= 0 && fx.runner && !reducedMotion) {
      fx.dustTimer = Math.max(0.035, 0.12 - speed * 0.008)
      const { x, y, size } = fx.runner
      const count = speed >= 8 ? 2 : 1
      for (let i = 0; i < count; i++) {
        fx.particles.push({
          x: x + (Math.random() - 0.5) * size * 0.5, y: y - size * 0.02,
          vx: (Math.random() - 0.5) * 60 - fx.velocity * 8, vy: 90 + speed * 22 + Math.random() * 40,
          gravity: 0, life: 0.45, max: 0.3 + Math.random() * 0.25, size: size * (0.07 + Math.random() * 0.06),
          color: 'rgba(240,222,184,0.8)', shape: 'circle', spin: 0, angle: 0,
        })
      }
    }
  }
  fx.velocity = dt > 0 ? (next - fx.laneVis) / dt : 0
  fx.laneVis = Math.abs(target - next) < 0.003 ? target : next
  fx.shake *= Math.exp(-dt * 9)
  if (fx.shake < 0.1) fx.shake = 0
  fx.flash = Math.max(0, fx.flash - dt * 1.6)
  // Compact in place: this runs every frame, so avoid allocating new arrays.
  let alive = 0
  for (const p of fx.particles) {
    p.life -= dt
    p.vy += p.gravity * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.angle += p.spin * dt
    if (p.life > 0) fx.particles[alive++] = p
  }
  fx.particles.length = alive
  alive = 0
  for (const f of fx.floaters) {
    f.life -= dt
    f.y -= 46 * dt
    if (f.life > 0) fx.floaters[alive++] = f
  }
  fx.floaters.length = alive
}

// Nothing left to animate: idle screens (pause, results) can skip redraws.
export const isDashFxIdle = (fx) => !fx.particles.length && !fx.floaters.length && !fx.passing.length && fx.flash === 0 && fx.shake === 0

// ---------------------------------------------------------------- text fitting
const fitCache = new Map()
const fitLabel = (ctx, text, maxW, maxLines, maxSize, minSize) => {
  const key = `${text}|${Math.round(maxW)}|${maxLines}|${maxSize}`
  const cached = fitCache.get(key)
  if (cached) return cached
  let result = null
  for (let size = maxSize; size >= minSize && !result; size -= 1) {
    ctx.font = `800 ${size}px ${TEXT_FONT}`
    const words = text.split(/\s+/).filter(Boolean)
    const lines = []
    let line = ''
    let fits = true
    for (const word of words) {
      if (ctx.measureText(word).width > maxW) { fits = false; break }
      const attempt = line ? `${line} ${word}` : word
      if (ctx.measureText(attempt).width <= maxW) line = attempt
      else { lines.push(line); line = word }
    }
    if (line) lines.push(line)
    if (fits && lines.length <= maxLines) result = { size, lines }
  }
  if (!result) {
    ctx.font = `800 ${minSize}px ${TEXT_FONT}`
    const single = text.length > 14 ? `${text.slice(0, 13)}…` : text
    result = { size: minSize, lines: [single] }
  }
  if (fitCache.size > 300) fitCache.clear()
  fitCache.set(key, result)
  return result
}

// ---------------------------------------------------------------- scene pieces
const drawSky = (ctx, geo, pal, phase, t) => {
  const { w, horizon } = geo
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, pal.skyTop)
  sky.addColorStop(1, pal.skyBottom)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, horizon + 2)

  if (pal.night > 0) {
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 38; i++) {
      const twinkle = 0.55 + 0.45 * Math.sin(t * 2 + i * 1.7)
      ctx.globalAlpha = pal.night * twinkle * 0.9
      const r = 0.7 + hash(i + 9) * 1.3
      ctx.fillRect(hash(i) * w, hash(i + 40) * horizon * 0.85, r, r)
    }
    ctx.globalAlpha = 1
  }

  const sunX = w * lerp(0.74, 0.3, phase)
  const sunY = lerp(horizon * 0.42, horizon * 0.98, Math.pow(phase, 1.6))
  const radius = w * 0.085
  const glow = ctx.createRadialGradient(sunX, sunY, radius * 0.4, sunX, sunY, radius * 3.6)
  glow.addColorStop(0, pal.sun)
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.globalAlpha = 0.55
  ctx.fillStyle = glow
  ctx.fillRect(sunX - radius * 4, sunY - radius * 4, radius * 8, radius * 8)
  ctx.globalAlpha = 1
  ctx.fillStyle = pal.sun
  ctx.beginPath()
  ctx.arc(sunX, sunY, radius, 0, Math.PI * 2)
  ctx.fill()

  if (pal.night > 0) {
    ctx.globalAlpha = pal.night
    ctx.fillStyle = '#fff6d8'
    ctx.beginPath()
    ctx.arc(w * 0.18, horizon * 0.3, w * 0.04, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = pal.skyTop
    ctx.beginPath()
    ctx.arc(w * 0.18 + w * 0.022, horizon * 0.3 - w * 0.01, w * 0.037, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  ctx.fillStyle = pal.cloud
  ctx.globalAlpha = 0.72
  for (let i = 0; i < 4; i++) {
    const cx = ((hash(i + 3) + t * (0.004 + i * 0.0015)) % 1.3 - 0.15) * w
    const cy = horizon * (0.12 + hash(i + 11) * 0.5)
    const size = w * (0.05 + hash(i + 20) * 0.035)
    ctx.beginPath()
    ctx.arc(cx, cy, size, 0, Math.PI * 2)
    ctx.arc(cx + size * 1.1, cy + size * 0.15, size * 0.8, 0, Math.PI * 2)
    ctx.arc(cx - size * 1.1, cy + size * 0.2, size * 0.7, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

const drawHills = (ctx, geo, pal, offset) => {
  const { w, horizon } = geo
  const layers = [
    { color: pal.hillFar, amp: 0.2, freq: 0.011, base: 0.05, parallax: 10, phase: 1.2 },
    { color: pal.hillNear, amp: 0.13, freq: 0.019, base: 0.012, parallax: 22, phase: 4.1 },
  ]
  for (const layer of layers) {
    ctx.fillStyle = layer.color
    ctx.beginPath()
    ctx.moveTo(0, horizon + 2)
    for (let x = 0; x <= w + 14; x += 14) {
      const y = horizon - horizon * layer.base - horizon * layer.amp * (0.5 + 0.5 * Math.sin((x + offset * layer.parallax) * layer.freq + layer.phase)) * (0.7 + 0.3 * Math.sin(x * 0.037 + layer.phase))
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w + 14, horizon + 2)
    ctx.closePath()
    ctx.fill()
  }
}

const quad = (ctx, x1, y1, x2, y2, x3, y3, x4, y4) => {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.lineTo(x4, y4)
  ctx.closePath()
  ctx.fill()
}

const drawGround = (ctx, geo, pal, scroll, h) => {
  const { w, cx, horizon, k, L } = geo
  ctx.fillStyle = pal.grassA
  ctx.fillRect(0, horizon, w, h - horizon)
  const roadHalf = L * 1.5
  const yAt = (z) => horizon + k / z
  const start = Math.floor((scroll + BAND_NEAR) / BAND) - 1
  const end = Math.ceil((scroll + BAND_FAR) / BAND)
  const bottomZ = Math.max(0.4, k / Math.max(1, h - horizon))
  for (let n = end; n >= start; n--) {
    const za = Math.max(bottomZ, n * BAND - scroll)
    const zb = (n + 1) * BAND - scroll
    if (zb <= bottomZ) continue
    const yNear = yAt(za)
    const yFar = yAt(zb)
    const sNear = 1 / za
    const sFar = 1 / zb
    const even = ((n % 2) + 2) % 2 === 0
    if (!even) {
      ctx.fillStyle = pal.grassB
      ctx.fillRect(0, yFar, w, yNear - yFar + 1)
    }
    ctx.fillStyle = even ? pal.road : pal.roadDark
    quad(ctx, cx - roadHalf * sFar, yFar, cx + roadHalf * sFar, yFar, cx + roadHalf * sNear, yNear + 1, cx - roadHalf * sNear, yNear + 1)
    ctx.fillStyle = even ? pal.rumbleA : pal.rumbleB
    const rumble = 0.11
    quad(ctx, cx - roadHalf * sFar, yFar, cx - (roadHalf + L * rumble) * sFar, yFar, cx - (roadHalf + L * rumble) * sNear, yNear + 1, cx - roadHalf * sNear, yNear + 1)
    quad(ctx, cx + roadHalf * sFar, yFar, cx + (roadHalf + L * rumble) * sFar, yFar, cx + (roadHalf + L * rumble) * sNear, yNear + 1, cx + roadHalf * sNear, yNear + 1)
    if (even) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      for (const side of [-0.5, 0.5]) {
        const half = 0.028 * L
        quad(ctx, cx + side * L * sFar - half * sFar, yFar, cx + side * L * sFar + half * sFar, yFar, cx + side * L * sNear + half * sNear, yNear + 1, cx + side * L * sNear - half * sNear, yNear + 1)
      }
    }
  }
}

const drawTree = (ctx, x, y, size, pal, variant) => {
  ctx.fillStyle = 'rgba(0,0,0,0.16)'
  ctx.beginPath()
  ctx.ellipse(x, y, size * 0.42, size * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = pal.trunk
  ctx.fillRect(x - size * 0.06, y - size * 0.4, size * 0.12, size * 0.42)
  ctx.fillStyle = pal.tree
  if (variant > 0.5) {
    ctx.beginPath()
    ctx.moveTo(x, y - size * 1.15)
    ctx.lineTo(x + size * 0.36, y - size * 0.3)
    ctx.lineTo(x - size * 0.36, y - size * 0.3)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x, y - size * 0.9)
    ctx.lineTo(x + size * 0.45, y - size * 0.1)
    ctx.lineTo(x - size * 0.45, y - size * 0.1)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.arc(x, y - size * 0.62, size * 0.36, 0, Math.PI * 2)
    ctx.arc(x - size * 0.22, y - size * 0.42, size * 0.26, 0, Math.PI * 2)
    ctx.arc(x + size * 0.22, y - size * 0.42, size * 0.26, 0, Math.PI * 2)
    ctx.fill()
  }
}

const drawScenery = (ctx, geo, pal, scroll) => {
  const { w, cx, horizon, k, L } = geo
  const start = Math.floor((scroll + BAND_NEAR) / TREE_SPACING) - 1
  const end = Math.ceil((scroll + BAND_FAR) / TREE_SPACING)
  for (let n = end; n >= start; n--) {
    const z = n * TREE_SPACING - scroll
    if (z < 0.8) continue
    const s = 1 / z
    const y = horizon + k * s
    for (const side of [-1, 1]) {
      const id = n * 2 + (side > 0 ? 1 : 0)
      if (hash(id) < 0.22) continue
      const x = cx + side * (L * 1.5 + L * (0.32 + hash(id + 5) * 0.75)) * s
      if (x < -L || x > w + L) continue
      drawTree(ctx, x, y, L * (0.62 + hash(id + 9) * 0.4) * s, pal, hash(id + 2))
    }
  }
}

const drawFog = (ctx, geo, pal) => {
  const { w, horizon, k } = geo
  const fog = ctx.createLinearGradient(0, horizon - 4, 0, horizon + k * 0.34)
  fog.addColorStop(0, pal.skyBottom)
  fog.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.globalAlpha = 0.85
  ctx.fillStyle = fog
  ctx.fillRect(0, horizon - 4, w, k * 0.34 + 4)
  ctx.globalAlpha = 1
}

const gateView = (row) => ({ labels: [0, 1, 2].map((lane) => getDashChoiceLabel(row, lane)), mode: row.mode, eliminated: row.eliminated })

// view: { labels, mode, eliminated }. Only the active gate (the one the clue is about) is fully lit;
// a lane closed by a sniff is greyed out and crossed.
const drawGate = (ctx, geo, view, s, { selectedLane = -1, active = true, skipLane = -1, t = 0 } = {}) => {
  const pw = geo.L * 0.94
  const postH = geo.L * 0.66
  const bannerH = geo.L * 0.48
  const radius = geo.L * 0.07
  for (let lane = 0; lane < 3; lane++) {
    if (lane === skipLane) continue
    const closed = lane === view.eliminated
    const color = closed ? CLOSED_LANE : DASH_LANE_COLORS[lane]
    const selected = active && !closed && lane === selectedLane
    ctx.save()
    ctx.translate(geo.laneX(lane, s), geo.rowY(s))
    ctx.scale(s, s)
    ctx.fillStyle = 'rgba(30,20,50,0.22)'
    ctx.beginPath()
    ctx.ellipse(0, 0, pw * 0.5, geo.L * 0.07, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = color.dark
    ctx.fillRect(-pw * 0.43, -postH, geo.L * 0.045, postH)
    ctx.fillRect(pw * 0.43 - geo.L * 0.045, -postH, geo.L * 0.045, postH)
    const top = -postH - bannerH * 0.35
    if (selected) {
      // A soft halo instead of shadowBlur, which is very expensive on canvas.
      const pulse = geo.L * (0.05 + 0.015 * Math.sin(t * 9))
      const base = ctx.globalAlpha
      ctx.globalAlpha = base * 0.5
      ctx.fillStyle = '#ffe066'
      roundRect(ctx, -pw / 2 - pulse, top - pulse, pw + pulse * 2, bannerH + pulse * 2, radius + pulse)
      ctx.fill()
      ctx.globalAlpha = base
    }
    const grad = ctx.createLinearGradient(0, top, 0, top + bannerH)
    grad.addColorStop(0, color.main)
    grad.addColorStop(1, color.dark)
    ctx.fillStyle = grad
    roundRect(ctx, -pw / 2, top, pw, bannerH, radius)
    ctx.fill()
    ctx.lineWidth = selected ? geo.L * 0.035 : geo.L * (active ? 0.025 : 0.015)
    ctx.strokeStyle = selected ? '#ffe066' : active ? '#ffffff' : 'rgba(255,255,255,0.6)'
    ctx.stroke()
    const label = view.labels[lane] || ''
    const fit = fitLabel(ctx, label, pw * 0.84, view.mode === 'word' ? 3 : 2, geo.L * (view.mode === 'word' ? 0.14 : 0.19), geo.L * 0.09)
    ctx.font = `800 ${fit.size}px ${TEXT_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lineH = fit.size * 1.12
    const midY = top + bannerH * 0.52 - ((fit.lines.length - 1) * lineH) / 2
    ctx.lineJoin = 'round'
    ctx.lineWidth = fit.size * 0.18
    ctx.strokeStyle = 'rgba(30,15,60,0.45)'
    ctx.fillStyle = closed ? 'rgba(255,255,255,0.65)' : '#fff'
    fit.lines.forEach((line, i) => {
      ctx.strokeText(line, 0, midY + i * lineH)
      ctx.fillText(line, 0, midY + i * lineH)
    })
    if (closed) {
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'
      ctx.lineCap = 'round'
      ctx.lineWidth = geo.L * 0.05
      const cx = geo.L * 0.16
      const cy = top + bannerH / 2
      ctx.beginPath()
      ctx.moveTo(-cx, cy - cx)
      ctx.lineTo(cx, cy + cx)
      ctx.moveTo(cx, cy - cx)
      ctx.lineTo(-cx, cy + cx)
      ctx.stroke()
    }
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(-pw / 2 + geo.L * 0.02, top + geo.L * 0.02, geo.L * 0.085, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = color.dark
    ctx.font = `900 ${geo.L * 0.115}px ${TEXT_FONT}`
    ctx.fillText(String(lane + 1), -pw / 2 + geo.L * 0.02, top + geo.L * 0.028)
    ctx.restore()
  }
}

const drawObstacle = (ctx, geo, row, s, t, skipLane = -1) => {
  for (const lane of row.blocked) {
    if (lane === skipLane) continue
    ctx.save()
    ctx.translate(geo.laneX(lane, s), geo.rowY(s))
    ctx.scale(s, s)
    const w = geo.L * 0.9
    const pulse = 0.25 + 0.12 * Math.sin(t * 8)
    ctx.fillStyle = `rgba(255,70,60,${pulse})`
    ctx.beginPath()
    ctx.ellipse(0, geo.L * 0.02, w * 0.62, geo.L * 0.12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#5a3d32'
    ctx.fillRect(-w * 0.45, -geo.L * 0.5, geo.L * 0.07, geo.L * 0.5)
    ctx.fillRect(w * 0.45 - geo.L * 0.07, -geo.L * 0.5, geo.L * 0.07, geo.L * 0.5)
    const barY = -geo.L * 0.46
    const barH = geo.L * 0.22
    ctx.save()
    roundRect(ctx, -w / 2, barY, w, barH, barH * 0.35)
    ctx.clip()
    ctx.fillStyle = '#fff6ee'
    ctx.fillRect(-w / 2, barY, w, barH)
    ctx.fillStyle = '#ff4b3e'
    const stripe = barH * 1.1
    for (let x = -w; x < w; x += stripe * 2) {
      ctx.beginPath()
      ctx.moveTo(x, barY + barH)
      ctx.lineTo(x + stripe, barY + barH)
      ctx.lineTo(x + stripe + barH, barY)
      ctx.lineTo(x + barH, barY)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
    ctx.lineWidth = geo.L * 0.025
    ctx.strokeStyle = '#7a2a22'
    roundRect(ctx, -w / 2, barY, w, barH, barH * 0.35)
    ctx.stroke()
    ctx.restore()
  }
}

const drawPickup = (ctx, geo, row, s, t) => {
  const [light, strong] = PICKUP_COLOR[row.kind] || PICKUP_COLOR.shield
  ctx.save()
  ctx.translate(geo.laneX(row.lane, s), geo.rowY(s))
  ctx.scale(s, s)
  ctx.fillStyle = 'rgba(30,20,50,0.22)'
  ctx.beginPath()
  ctx.ellipse(0, 0, geo.L * 0.2, geo.L * 0.06, 0, 0, Math.PI * 2)
  ctx.fill()
  const bob = -geo.L * 0.38 + Math.sin(t * 5 + row.id) * geo.L * 0.05
  const r = geo.L * 0.22
  const glow = ctx.createRadialGradient(0, bob, r * 0.3, 0, bob, r * 2)
  glow.addColorStop(0, strong)
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  const base = ctx.globalAlpha
  ctx.globalAlpha = base * 0.6
  ctx.fillStyle = glow
  ctx.fillRect(-r * 2, bob - r * 2, r * 4, r * 4)
  ctx.globalAlpha = base
  ctx.fillStyle = light
  ctx.strokeStyle = strong
  ctx.lineWidth = geo.L * 0.035
  ctx.beginPath()
  ctx.arc(0, bob, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.font = `${r * 1.15}px ${EMOJI_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(PICKUP_ICON[row.kind] || '', 0, bob + r * 0.06)
  ctx.restore()
}

const drawRunner = (ctx, geo, run, fx, pet, t, running, speed) => {
  const x = geo.laneX(fx.laneVis)
  const y = geo.hitY
  const size = Math.min(geo.w * 0.25, 118)
  fx.runner = { x, y, size }
  // A happy jump through a correct gate; a wobble after a mistake.
  const jump = fx.jump > 0 ? Math.sin(Math.PI * (1 - fx.jump / JUMP_SECONDS)) * size * 0.32 : 0
  const wobble = fx.stumble > 0 ? Math.sin(t * 38) * 0.24 * (fx.stumble / STUMBLE_SECONDS) : 0
  const hop = jump + (running ? Math.abs(Math.sin(fx.stride)) * size * (0.07 + speed * 0.004) : Math.sin(t * 3) * size * 0.02)
  const lane = DASH_LANE_COLORS[clamp(Math.round(fx.laneVis), 0, 2)]
  const fever = run.streak >= 5

  ctx.fillStyle = lane.main
  ctx.globalAlpha = 0.28
  ctx.beginPath()
  ctx.ellipse(x, y + size * 0.02, size * 0.62, size * 0.16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(25,18,45,0.3)'
  ctx.beginPath()
  ctx.ellipse(x, y, size * (0.4 - hop / size * 0.8), size * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()

  if (fever) {
    const aura = ctx.createRadialGradient(x, y - size * 0.5, size * 0.1, x, y - size * 0.5, size * (0.95 + 0.08 * Math.sin(t * 10)))
    aura.addColorStop(0, 'rgba(255,224,102,0.75)')
    aura.addColorStop(1, 'rgba(255,224,102,0)')
    ctx.fillStyle = aura
    ctx.fillRect(x - size * 1.1, y - size * 1.6, size * 2.2, size * 2.2)
  }

  ctx.save()
  ctx.translate(x, y - hop)
  ctx.rotate(clamp(fx.velocity * 0.05, -0.28, 0.28) + wobble + (running ? Math.sin(fx.stride) * (0.04 + speed * 0.004) : 0))
  const stretch = 1 + (running ? Math.sin(fx.stride * 2) * 0.025 : 0) + (fx.jump > 0 ? 0.06 * Math.sin(Math.PI * (1 - fx.jump / JUMP_SECONDS)) : 0)
  ctx.scale(1 / stretch, stretch)
  if (pet?.ok && pet.img) {
    const ratio = pet.img.naturalWidth && pet.img.naturalHeight ? pet.img.naturalWidth / pet.img.naturalHeight : 1
    const ph = ratio > 1 ? size / ratio : size
    const pw = ph * ratio
    ctx.drawImage(pet.img, -pw / 2, -ph, pw, ph)
  } else {
    ctx.font = `${size * 0.8}px ${EMOJI_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('🐾', 0, -size * 0.1)
  }
  ctx.restore()

  if (run.shield) {
    const pulse = 0.85 + 0.15 * Math.sin(t * 6)
    const cy = y - size * 0.5 - hop
    const bubble = ctx.createRadialGradient(x, cy, size * 0.2, x, cy, size * 0.78 * pulse)
    bubble.addColorStop(0, 'rgba(140,235,255,0.05)')
    bubble.addColorStop(1, 'rgba(140,235,255,0.5)')
    ctx.fillStyle = bubble
    ctx.strokeStyle = 'rgba(210,252,255,0.95)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(x, cy, size * 0.78 * pulse, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  if (fx.stumble > 0) {
    // Dizzy stars circling the pet's head.
    ctx.fillStyle = '#ffe066'
    ctx.globalAlpha = Math.min(1, fx.stumble / (STUMBLE_SECONDS * 0.4))
    for (let i = 0; i < 3; i++) {
      const a = t * 9 + (i * Math.PI * 2) / 3
      ctx.save()
      ctx.translate(x + Math.cos(a) * size * 0.32, y - size * 1.02 - hop + Math.sin(a) * size * 0.09)
      drawStar(ctx, size * 0.07)
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }
}

const drawStar = (ctx, size) => {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? size : size * 0.4
    const a = (i * Math.PI) / 4
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
}

const drawParticles = (ctx, fx) => {
  for (const p of fx.particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1)
    ctx.fillStyle = p.color
    if (p.shape === 'circle') {
      // Round particles (dust, sparks) are the most numerous and need no rotation.
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.angle)
    if (p.shape === 'star') {
      drawStar(ctx, p.size)
    } else {
      ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6)
    }
    ctx.restore()
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  for (const f of fx.floaters) {
    const age = 1 - f.life / f.max
    ctx.globalAlpha = clamp(f.life / (f.max * 0.4), 0, 1)
    const pop = 1 + Math.max(0, 0.35 - age * 1.6)
    ctx.font = `900 ${f.size * pop}px ${f.emoji ? EMOJI_FONT : TEXT_FONT}`
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(40,20,70,0.55)'
    ctx.strokeText(f.text, f.x, f.y)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, f.y)
  }
  ctx.globalAlpha = 1
}

const drawSpeedLines = (ctx, geo, t, intensity) => {
  const { w, cx, horizon } = geo
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineCap = 'round'
  for (let i = 0; i < 16; i++) {
    const phase = (t * 1.6 + hash(i) * 3) % 1
    const angle = (hash(i + 30) - 0.5) * 2.6 + Math.PI / 2
    const r0 = (0.25 + phase * 0.9) * w
    const r1 = r0 + w * 0.12 * (0.3 + phase)
    ctx.globalAlpha = (1 - phase) * 0.4 * intensity
    ctx.lineWidth = 1 + phase * 3
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * r0, horizon + Math.sin(angle) * r0)
    ctx.lineTo(cx + Math.cos(angle) * r1, horizon + Math.sin(angle) * r1)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------- frame
export const drawDash = (ctx, scene) => {
  const { w, h, layout, run, fx, pet, t, running = false, reducedMotion = false, speed = 0 } = scene
  const geo = getDashGeometry({ w, top: layout.top, bottom: layout.bottom })
  const phase = clamp((scene.phase ?? run.elapsed / DASH_DURATION), 0, 1)
  const pal = getPalette(phase)
  const scroll = (scene.scroll ?? run.distance * SCROLL_PER_METER)

  ctx.save()
  ctx.clearRect(0, 0, w, h)
  if (fx.shake > 0 && !reducedMotion) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake)

  drawSky(ctx, geo, pal, phase, t)
  drawHills(ctx, geo, pal, fx.laneVis)
  drawGround(ctx, geo, pal, scroll, h)
  drawScenery(ctx, geo, pal, scroll)
  drawFog(ctx, geo, pal)

  // Rows are kept nearest-first by the simulation, so drawing in reverse paints far rows first.
  const front = run.rows.find((row) => row.type === 'gate')
  const lane = Math.round(clamp(run.lane, 0, 2))
  for (let i = run.rows.length - 1; i >= 0; i--) {
    const row = run.rows[i]
    const s = getDashRowScale(clamp(row.progress, 0, 1.02))
    const fade = clamp(row.progress / 0.14, 0, 1)
    if (row.type === 'gate') {
      // Gates behind the active one are dimmed so it is obvious which gate the clue is about.
      const active = row === front
      ctx.globalAlpha = fade * (active ? 1 : 0.5)
      drawGate(ctx, geo, gateView(row), s, { selectedLane: active ? lane : -1, active, t })
    } else {
      ctx.globalAlpha = fade
      if (row.type === 'obstacle') drawObstacle(ctx, geo, row, s, t)
      else drawPickup(ctx, geo, row, s, t)
    }
    ctx.globalAlpha = 1
  }

  drawRunner(ctx, geo, run, fx, pet, t, running, speed)

  // Rows that were just resolved sweep past the camera and fade; the lane the pet broke through is gone.
  for (const row of fx.passing) {
    const k = row.age / PASS_SECONDS
    const s = getDashRowScale(1 + k * 0.2)
    ctx.globalAlpha = (1 - k) * 0.7
    if (row.kind === 'gate') drawGate(ctx, geo, row, s, { active: false, skipLane: row.through })
    else drawObstacle(ctx, geo, row, s, t, row.through)
    ctx.globalAlpha = 1
  }
  const windy = running ? clamp((speed - 6) / 4, 0, 1) * 0.8 : 0
  const feverLines = run.streak >= 5 ? clamp((run.streak - 4) / 6, 0.4, 1) : 0
  if (!reducedMotion && Math.max(windy, feverLines) > 0) drawSpeedLines(ctx, geo, t, Math.max(windy, feverLines))
  drawParticles(ctx, fx)

  if (fx.flash > 0) {
    ctx.globalAlpha = fx.flash
    const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75)
    edge.addColorStop(0, 'rgba(255,255,255,0)')
    edge.addColorStop(1, fx.flashColor)
    ctx.fillStyle = edge
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
  }
  ctx.restore()
}
