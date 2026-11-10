// Top-down 2D bowling simulation. World units:
//   x: 0..LANE_WIDTH is the lane, gutters extend GUTTER units either side
//   y: 0 is the far end (pit), LANE_LENGTH is the foul line / start
// The renderer is free to scale these however it likes.

export const LANE_WIDTH = 100
export const LANE_LENGTH = 380
export const GUTTER = 12
export const PIT_DEPTH = 24

export const BALL_R = 10
export const PIN_R = 5.5

export const BALL_START_Y = 340
export const HEAD_PIN_Y = 110
const PIN_SPACING = 15 // centre to centre; pins are 11 wide, so a 4-unit gap
const ROW_GAP = PIN_SPACING * 0.866

const BALL_MASS = 7
const PIN_MASS = 1
const BALL_PIN_RESTITUTION = 0.65
const PIN_PIN_RESTITUTION = 0.75
const PIN_FRICTION = 0.965 // per tick
const BALL_FRICTION = 0.9993 // per tick
const KNOCKDOWN_DISTANCE = 3
const AIM_REACH = 63 // sideways offset at the head pin for aim = ±1 — the edges end in the gutter
const SUBSTEPS = 4
const MAX_TICKS = 60 * 7

const mid = LANE_WIDTH / 2

export function createPins() {
  const pins = []
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      const x = mid + (i - row / 2) * PIN_SPACING
      const y = HEAD_PIN_Y - row * ROW_GAP
      pins.push({ x, y, x0: x, y0: y, vx: 0, vy: 0, down: false, gone: false, angle: 0 })
    }
  }
  return pins
}

// The start line is split into 5 equal positions (each 20% of the lane width)
export const START_POSITIONS = [0.1, 0.3, 0.5, 0.7, 0.9].map(f => f * LANE_WIDTH)

// aim: -1..1 (left..right), power: 0..1, startX: where on the start line the ball is released.
// `aim` decides where the ball arrives at the head pin, so the outcome odds are the same
// whichever start position is used — the position is cosmetic.
export function createBall(aim, power, rand = Math.random, startX = mid) {
  const jitter = (rand() - 0.5) * 0.08
  const travel = BALL_START_Y - HEAD_PIN_Y
  const targetX = mid + (aim + jitter) * AIM_REACH
  const angle = Math.atan2(targetX - startX, travel)
  const speed = 4 + power * 6
  // Random hook so dead-centre throws don't always behave the same.
  // Weak throws spend longer on the lane, so the hook drifts them further.
  const hook = (rand() - 0.5) * (0.004 + (1 - power) * 0.012)
  return {
    x: startX,
    y: BALL_START_Y,
    vx: Math.sin(angle) * speed,
    vy: -Math.cos(angle) * speed,
    hook,
    gutter: false,
    inPit: false,
    distance: 0,
  }
}

export function createSimulation(aim, power, rand = Math.random, startX = mid) {
  return { ball: createBall(aim, power, rand, startX), pins: createPins(), ticks: 0, settled: false, rand }
}

function resolveCollision(a, ma, ra, b, mb, rb, restitution, rand) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const distSq = dx * dx + dy * dy
  const minDist = ra + rb
  if (distSq >= minDist * minDist || distSq === 0) return false
  const dist = Math.sqrt(distSq)
  const nx = dx / dist
  const ny = dy / dist

  // Push apart (inverse-mass weighted)
  const overlap = minDist - dist
  const invA = 1 / ma
  const invB = 1 / mb
  const total = invA + invB
  a.x -= nx * overlap * (invA / total)
  a.y -= ny * overlap * (invA / total)
  b.x += nx * overlap * (invB / total)
  b.y += ny * overlap * (invB / total)

  const rvx = b.vx - a.vx
  const rvy = b.vy - a.vy
  const velAlongNormal = rvx * nx + rvy * ny
  if (velAlongNormal > 0) return true

  const j = (-(1 + restitution) * velAlongNormal) / total
  a.vx -= j * nx * invA
  a.vy -= j * ny * invA
  b.vx += j * nx * invB
  b.vy += j * ny * invB

  // Small sideways scatter so pins don't fly in perfectly predictable lines
  const scatter = (rand() - 0.5) * 0.25 * Math.abs(j) * invB
  b.vx += -ny * scatter
  b.vy += nx * scatter
  return true
}

function stepOnce(sim, dt) {
  const { ball, pins, rand } = sim

  // --- Ball ---
  if (!ball.inPit) {
    ball.vx += ball.hook * dt
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt
    ball.distance += Math.hypot(ball.vx, ball.vy) * dt
    const f = Math.pow(BALL_FRICTION, dt)
    ball.vx *= f
    ball.vy *= f

    if (!ball.gutter && (ball.x < 1 || ball.x > LANE_WIDTH - 1)) {
      ball.gutter = true
      ball.x = ball.x < mid ? -GUTTER / 2 : LANE_WIDTH + GUTTER / 2
      ball.vx = 0
    }
    if (!ball.gutter) {
      // Bounce off the kickback walls if the ball wanders after hitting pins
      if (ball.y < HEAD_PIN_Y + 20) {
        if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * 0.4 }
        if (ball.x > LANE_WIDTH - BALL_R) { ball.x = LANE_WIDTH - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.4 }
      }
      for (const pin of pins) {
        if (pin.gone) continue
        resolveCollision(ball, BALL_MASS, BALL_R, pin, PIN_MASS, PIN_R, BALL_PIN_RESTITUTION, rand)
      }
    }
    if (ball.y < -PIT_DEPTH / 2) ball.inPit = true
  }

  // --- Pins ---
  const pf = Math.pow(PIN_FRICTION, dt)
  for (const pin of pins) {
    if (pin.gone) continue
    pin.x += pin.vx * dt
    pin.y += pin.vy * dt
    pin.vx *= pf
    pin.vy *= pf
    const speed = Math.hypot(pin.vx, pin.vy)
    if (speed > 0.05) pin.angle = Math.atan2(pin.vy, pin.vx)
    if (!pin.down && Math.hypot(pin.x - pin.x0, pin.y - pin.y0) > KNOCKDOWN_DISTANCE) pin.down = true
    // Off the deck: into the gutters or the pit
    if (pin.x < -PIN_R || pin.x > LANE_WIDTH + PIN_R || pin.y < -PIN_R) {
      pin.down = true
      pin.gone = true
    }
  }
  for (let i = 0; i < pins.length; i++) {
    if (pins[i].gone) continue
    for (let k = i + 1; k < pins.length; k++) {
      if (pins[k].gone) continue
      resolveCollision(pins[i], PIN_MASS, PIN_R, pins[k], PIN_MASS, PIN_R, PIN_PIN_RESTITUTION, rand)
    }
  }
}

// Advance one frame (≈1/60 s). Returns true once everything has stopped.
export function stepSimulation(sim) {
  if (sim.settled) return true
  const dt = 1 / SUBSTEPS
  for (let s = 0; s < SUBSTEPS; s++) stepOnce(sim, dt)
  sim.ticks++

  const ballDone = sim.ball.inPit || Math.hypot(sim.ball.vx, sim.ball.vy) < 0.05
  const pinsStill = sim.pins.every(p => p.gone || Math.hypot(p.vx, p.vy) < 0.04)
  if ((ballDone && pinsStill) || sim.ticks > MAX_TICKS) sim.settled = true
  return sim.settled
}

export function countPinsDown(sim) {
  return sim.pins.filter(p => p.down).length
}

// Run a whole roll instantly — used to plan throws, and for tuning / tests
export function simulateRoll(aim, power, rand = Math.random, startX = mid) {
  const sim = createSimulation(aim, power, rand, startX)
  while (!stepSimulation(sim)) { /* run to completion */ }
  return countPinsDown(sim)
}

// Small seedable PRNG so a planned throw can be replayed exactly
export function seededRandom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Outcome odds in % (pins knocked down → chance). Edit these to change how lucky the game is.
export const OUTCOME_ODDS = { 10: 20, 9: 20, 8: 18, 7: 13, 6: 9, 5: 6, 4: 4, 3: 3, 2: 2, 1: 2, 0: 3 }

function pickTarget(rand) {
  const entries = Object.entries(OUTCOME_ODDS)
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [pins, w] of entries) {
    r -= w
    if (r < 0) return Number(pins)
  }
  return 10
}

/**
 * Luck-based throw. Picks the outcome from OUTCOME_ODDS first, then searches random
 * throws (simulated instantly) for one that really produces it, so the animation is
 * genuine physics. Replay with createSimulation(aim, power, seededRandom(seed), startX).
 */
export function planThrow(startX = mid, rand = Math.random, maxAttempts = 400) {
  const target = pickTarget(rand)
  let best = null
  for (let i = 0; i < maxAttempts; i++) {
    const seed = Math.floor(rand() * 2 ** 32)
    const aim = target === 0 && rand() < 0.7 ? (rand() < 0.5 ? -1 : 1) : (rand() * 2 - 1)
    const power = 0.3 + rand() * 0.7
    const pins = simulateRoll(aim, power, seededRandom(seed), startX)
    if (pins === target) return { aim, power, seed, pins }
    if (!best || Math.abs(pins - target) < Math.abs(best.pins - target)) best = { aim, power, seed, pins }
  }
  return best
}
