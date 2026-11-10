import { useEffect, useRef, useState, useCallback } from 'react'
import { assetUrl } from '../../../../hooks/useBranding'
import {
  LANE_WIDTH, LANE_LENGTH, GUTTER, PIT_DEPTH, BALL_R, PIN_R, BALL_START_Y, HEAD_PIN_Y, START_POSITIONS,
  createPins, createSimulation, stepSimulation, countPinsDown, planThrow, seededRandom,
} from './bowlingPhysics'

// Ball artwork — upload to the ui-assets bucket at this path. Falls back to a drawn ball if missing.
const BALL_IMAGE_PATH = '/game-zone/bowling-ball.png'
// Pin artwork — a side view of a standing pin, base at the bottom, transparent background.
const PIN_IMAGE_PATH = '/game-zone/bowling-pin.png'
const PIN_IMAGE_WIDTH = PIN_R * 5 // world units; height follows the image's own aspect ratio

// World → canvas mapping. Vertical lane, seen from behind the bowler:
// pins at the top, start line at the bottom.
const MARGIN = 4
const VIEW_LEFT = -GUTTER - MARGIN
const VIEW_TOP = -PIT_DEPTH
const VIEW_W = LANE_WIDTH + (GUTTER + MARGIN) * 2
const VIEW_H = LANE_LENGTH + 20 + PIT_DEPTH
const SCALE = 4
const CANVAS_W = VIEW_W * SCALE
const CANVAS_H = VIEW_H * SCALE
const STEP_MS = 1000 / 60

const applyWorldTransform = (ctx) =>
  ctx.setTransform(SCALE, 0, 0, SCALE, -VIEW_LEFT * SCALE, -VIEW_TOP * SCALE)

// Where the clickable start zone sits, as % of the canvas (for the DOM buttons)
const PICK_ZONE_LEFT = ((0 - VIEW_LEFT) / VIEW_W) * 100
const PICK_ZONE_WIDTH = (LANE_WIDTH / VIEW_W) * 100
const PICK_ZONE_TOP = ((BALL_START_Y - 40 - VIEW_TOP) / VIEW_H) * 100

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawLane(ctx) {
  ctx.fillStyle = '#1e1b2e'
  ctx.fillRect(VIEW_LEFT, VIEW_TOP, VIEW_W, VIEW_H)

  // Pit
  ctx.fillStyle = '#05040a'
  ctx.fillRect(-GUTTER, -PIT_DEPTH, LANE_WIDTH + GUTTER * 2, PIT_DEPTH)

  // Gutters
  ctx.fillStyle = '#3f3d4f'
  roundRect(ctx, -GUTTER, 0, GUTTER, LANE_LENGTH, 5); ctx.fill()
  roundRect(ctx, LANE_WIDTH, 0, GUTTER, LANE_LENGTH, 5); ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(-GUTTER + 3, 0, GUTTER - 6, LANE_LENGTH)
  ctx.fillRect(LANE_WIDTH + 3, 0, GUTTER - 6, LANE_LENGTH)

  // Wood
  const wood = ctx.createLinearGradient(0, 0, LANE_WIDTH, 0)
  wood.addColorStop(0, '#d9a066')
  wood.addColorStop(0.5, '#f0c38e')
  wood.addColorStop(1, '#d9a066')
  ctx.fillStyle = wood
  ctx.fillRect(0, 0, LANE_WIDTH, LANE_LENGTH)

  // Boards
  ctx.strokeStyle = 'rgba(120, 72, 30, 0.18)'
  ctx.lineWidth = 0.35
  const boards = 20
  for (let i = 1; i < boards; i++) {
    const x = (LANE_WIDTH / boards) * i
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, LANE_LENGTH); ctx.stroke()
  }

  // Pin deck tint
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(0, 0, LANE_WIDTH, HEAD_PIN_Y + 25)

  // Target arrows
  ctx.fillStyle = 'rgba(120, 50, 20, 0.55)'
  const arrowsY = HEAD_PIN_Y + (BALL_START_Y - HEAD_PIN_Y) * 0.55
  for (let i = 0; i < 7; i++) {
    const x = 14 + i * 12
    const y = arrowsY + Math.abs(i - 3) * 6
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.closePath(); ctx.fill()
  }

  // Foul line
  ctx.fillStyle = '#b91c1c'
  ctx.fillRect(0, BALL_START_Y + 22, LANE_WIDTH, 1.5)

  // Pin spots
  ctx.fillStyle = 'rgba(90, 50, 20, 0.35)'
  for (const p of createPins()) {
    ctx.beginPath(); ctx.arc(p.x0, p.y0, 1.2, 0, Math.PI * 2); ctx.fill()
  }
}

// The 5 start positions, each covering 20% of the lane
function drawStartZones(ctx, hover, chosen, color) {
  const zoneW = LANE_WIDTH / START_POSITIONS.length
  START_POSITIONS.forEach((x, i) => {
    const left = i * zoneW
    const isHover = hover === i && chosen === null
    const isChosen = chosen === i
    if (isHover || isChosen) {
      ctx.fillStyle = isChosen ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.18)'
      ctx.fillRect(left, BALL_START_Y - 40, zoneW, 62)
    }
    // Divider lines between zones
    if (i > 0) {
      ctx.strokeStyle = 'rgba(90, 50, 20, 0.35)'
      ctx.lineWidth = 0.6
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(left, BALL_START_Y - 40); ctx.lineTo(left, BALL_START_Y + 22); ctx.stroke()
      ctx.setLineDash([])
    }
    if (chosen !== null) return
    // Number badge
    ctx.fillStyle = isHover ? color : 'rgba(30, 27, 46, 0.75)'
    ctx.beginPath(); ctx.arc(x, BALL_START_Y, 7, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 9px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), x, BALL_START_Y + 0.5)
  })
}

function drawPinImage(ctx, pin, image) {
  const w = PIN_IMAGE_WIDTH
  const h = w * (image.naturalHeight / image.naturalWidth)
  ctx.save()
  ctx.translate(pin.x, pin.y)
  if (!pin.down) {
    // Standing: upright, base sitting on the pin spot
    ctx.drawImage(image, -w / 2, PIN_R * 0.4 - h, w, h)
  } else {
    // Fallen: lying flat, head pointing the way it was knocked
    ctx.rotate(pin.angle + Math.PI / 2)
    ctx.globalAlpha = 0.9
    ctx.drawImage(image, -w / 2, -h / 2, w, h)
  }
  ctx.restore()
}

function drawPin(ctx, pin, image) {
  if (pin.gone) return
  if (image) return drawPinImage(ctx, pin, image)
  ctx.save()
  ctx.translate(pin.x, pin.y)
  if (!pin.down) {
    const g = ctx.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, PIN_R)
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d4d4d8')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(0, 0, PIN_R, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.1
    ctx.beginPath(); ctx.arc(0, 0, PIN_R * 0.55, 0, Math.PI * 2); ctx.stroke()
  } else {
    // Fallen: lying on its side, pointing the way it was knocked
    ctx.rotate(pin.angle)
    ctx.fillStyle = '#e4e4e7'
    ctx.beginPath(); ctx.ellipse(0, 0, PIN_R * 1.6, PIN_R * 0.7, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#dc2626'
    ctx.fillRect(PIN_R * 0.5, -PIN_R * 0.55, 1.4, PIN_R * 1.1)
  }
  ctx.restore()
}

function drawBall(ctx, ball, color, image, alpha = 1) {
  if (ball.inPit) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(ball.x, ball.y)
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.arc(1.5, 2, BALL_R, 0, Math.PI * 2); ctx.fill()
  ctx.rotate(ball.distance / BALL_R)

  if (image) {
    const s = BALL_R * 2
    ctx.drawImage(image, -s / 2, -s / 2, s, s)
  } else {
    const g = ctx.createRadialGradient(-3, -3, 1, 0, 0, BALL_R)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.25, color)
    g.addColorStop(1, '#111827')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.beginPath(); ctx.arc(-2.5, -3, 1.4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(2.5, -3, 1.4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(0, 2.5, 1.7, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

/**
 * One lane whose start line is split into 5 positions. The student picks a position
 * (click or 1–5), then the ball is thrown with a random aim/power — the outcome is pure
 * luck and identical in odds for every position.
 * Mount with a fresh `key` for every roll. Calls onSettled(pinsDown, positionNumber).
 */
const BowlingLane = ({ ballColor = '#6366f1', ballImageUrl, onSettled }) => {
  // Resolved at render time so it picks up the branding base URL once that has loaded
  const imageUrl = ballImageUrl || assetUrl(BALL_IMAGE_PATH)
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const chosenRef = useRef(null)
  const simRef = useRef(null)
  const [chosen, setChosen] = useState(null)
  const [hover, setHover] = useState(null)
  const hoverRef = useRef(null)
  hoverRef.current = hover
  const onSettledRef = useRef(onSettled)
  onSettledRef.current = onSettled

  useEffect(() => {
    imageRef.current = null
    const img = new Image()
    img.onload = () => { imageRef.current = img }
    img.src = imageUrl
  }, [imageUrl])

  const pinImageUrl = assetUrl(PIN_IMAGE_PATH)
  const pinImageRef = useRef(null)
  useEffect(() => {
    pinImageRef.current = null
    const img = new Image()
    img.onload = () => { pinImageRef.current = img }
    img.src = pinImageUrl
  }, [pinImageUrl])

  // Plan a throw for each spot in the background while the student is choosing,
  // one per timer tick so the page never freezes. Clicking before it's ready just plans on the spot.
  const plansRef = useRef([])
  useEffect(() => {
    const timers = START_POSITIONS.map((x, i) => setTimeout(() => {
      if (chosenRef.current === null) plansRef.current[i] = planThrow(x)
    }, 50 + i * 30))
    return () => timers.forEach(clearTimeout)
  }, [])

  const pick = useCallback((index) => {
    if (chosenRef.current !== null || index < 0 || index >= START_POSITIONS.length) return
    const x = START_POSITIONS[index]
    const plan = plansRef.current[index] || planThrow(x)
    simRef.current = createSimulation(plan.aim, plan.power, seededRandom(plan.seed), x)
    chosenRef.current = index
    setChosen(index)
  }, [])

  // Number keys 1–5
  useEffect(() => {
    const onKey = (e) => {
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= START_POSITIONS.length) pick(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pick])

  // Render + simulation loop
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    let raf
    let last = performance.now()
    let acc = 0
    let settled = false
    let settledTimer = null
    const idlePins = createPins()

    const loop = (now) => {
      const sim = simRef.current
      if (sim && !settled) {
        acc += Math.min(now - last, 100)
        while (acc >= STEP_MS) {
          acc -= STEP_MS
          if (stepSimulation(sim)) {
            settled = true
            const pins = countPinsDown(sim)
            const position = chosenRef.current + 1
            settledTimer = setTimeout(() => onSettledRef.current?.(pins, position), 700)
            break
          }
        }
      }
      last = now

      applyWorldTransform(ctx)
      drawLane(ctx)
      drawStartZones(ctx, hoverRef.current, chosenRef.current, ballColor)
      // Back row first (top of screen) so nearer upright pin images overlap the ones behind
      const pinsToDraw = [...(sim ? sim.pins : idlePins)].sort((p, q) => p.y - q.y)
      for (const pin of pinsToDraw) drawPin(ctx, pin, pinImageRef.current)
      if (sim) {
        drawBall(ctx, sim.ball, ballColor, imageRef.current)
      } else if (hoverRef.current !== null) {
        // Preview the ball on the hovered position
        drawBall(ctx, { x: START_POSITIONS[hoverRef.current], y: BALL_START_Y, distance: 0, inPit: false }, ballColor, imageRef.current, 0.85)
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      if (settledTimer) clearTimeout(settledTimer)
    }
  }, [ballColor])

  return (
    <div className="h-full flex flex-col items-center gap-2 px-2 pb-2">
      <div className={`text-white text-2xl font-black drop-shadow animate-pulse ${chosen === null ? '' : 'invisible'}`}>
        Pick a spot 1–5! <span className="text-white/60 text-base font-semibold">(click or press a number)</span>
      </div>
      <div className="relative min-h-0 flex-1 flex items-end justify-center" style={{ perspective: '1200px' }}>
        {/* Tall lane: height-bound, so fill the height and let the width follow */}
        <div className="relative h-full" style={{ transform: 'rotateX(22deg)', transformOrigin: '50% 100%' }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="block h-full w-auto rounded-xl shadow-2xl"
          />
          {/* Click targets for the 5 start positions, side by side across the start line */}
          <div
            className="absolute flex"
            style={{ left: `${PICK_ZONE_LEFT}%`, width: `${PICK_ZONE_WIDTH}%`, top: `${PICK_ZONE_TOP}%`, bottom: 0 }}
          >
            {START_POSITIONS.map((_, i) => (
              <button
                key={i}
                onClick={() => pick(i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(h => (h === i ? null : h))}
                disabled={chosen !== null}
                className="flex-1 h-full cursor-pointer disabled:cursor-default focus:outline-none"
                aria-label={`Start position ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BowlingLane
