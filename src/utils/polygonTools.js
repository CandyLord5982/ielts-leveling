// Geometry helpers for the Color Fill editor.
// Magic wand = flood fill on the image pixels, trace the outline of the filled area,
// then simplify it into a polygon the teacher can still edit. Freehand uses the same simplifier.

// Neighbours in clockwise order on screen (y grows downwards), starting east.
const RING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]

const WAND_MAX_DIMENSION = 1200
// Slider value (0-100) to RGB distance (0-250).
const TOLERANCE_UNIT = 2.5
// If the fill covers more than this share of the image, the outline almost certainly has a gap.
const MAX_COVERAGE = 0.85
const MAX_POLYGON_POINTS = 120

export const MIN_REGION_AREA = 400

export const polygonArea = (points) => {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export const simplifyEpsilon = ({ w, h }) => Math.max(1.5, Math.max(w, h) * 0.0025)

const perpendicularDistance = (p, a, b) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / Math.sqrt(lengthSquared)
}

// Ramer-Douglas-Peucker on an open polyline (iterative, contours can be thousands of points).
const simplifyOpen = (points, epsilon) => {
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]

  while (stack.length > 0) {
    const [start, end] = stack.pop()
    let maxDistance = 0
    let index = -1
    for (let i = start + 1; i < end; i++) {
      const distance = perpendicularDistance(points[i], points[start], points[end])
      if (distance > maxDistance) {
        maxDistance = distance
        index = i
      }
    }
    if (index !== -1 && maxDistance > epsilon) {
      keep[index] = 1
      stack.push([start, index], [index, end])
    }
  }

  return points.filter((_, i) => keep[i] === 1)
}

// Simplify a closed polygon by splitting it at the point farthest from the first one.
export const simplifyPolygon = (points, epsilon) => {
  if (points.length <= 3) return points

  let far = 0
  let farDistance = -1
  points.forEach((p, i) => {
    const distance = Math.hypot(p.x - points[0].x, p.y - points[0].y)
    if (distance > farDistance) {
      farDistance = distance
      far = i
    }
  })

  const first = simplifyOpen(points.slice(0, far + 1), epsilon)
  const second = simplifyOpen([...points.slice(far), points[0]], epsilon)
  return [...first, ...second.slice(1, -1)]
}

// Simplify, loosening the tolerance until the polygon is small enough to edit by hand.
export const reducePolygon = (points, epsilon, maxPoints = MAX_POLYGON_POINTS) => {
  let currentEpsilon = epsilon
  let result = simplifyPolygon(points, currentEpsilon)
  while (result.length > maxPoints) {
    currentEpsilon *= 1.5
    result = simplifyPolygon(points, currentEpsilon)
  }
  return result
}

// Pixels within `tolerance` (RGB distance) of the seed pixel, connected to it.
// Transparent pixels are treated as white.
export const floodFillMask = (data, width, height, seedX, seedY, tolerance) => {
  const mask = new Uint8Array(width * height)
  const seedOffset = (seedY * width + seedX) * 4
  const seedAlpha = data[seedOffset + 3] / 255
  const seedBlend = 255 * (1 - seedAlpha)
  const seedR = data[seedOffset] * seedAlpha + seedBlend
  const seedG = data[seedOffset + 1] * seedAlpha + seedBlend
  const seedB = data[seedOffset + 2] * seedAlpha + seedBlend
  const limitSquared = tolerance * tolerance

  const matches = (index) => {
    const offset = index * 4
    const alpha = data[offset + 3] / 255
    const blend = 255 * (1 - alpha)
    const dr = data[offset] * alpha + blend - seedR
    const dg = data[offset + 1] * alpha + blend - seedG
    const db = data[offset + 2] * alpha + blend - seedB
    return dr * dr + dg * dg + db * db <= limitSquared
  }
  const fillable = (x, y) => mask[y * width + x] === 0 && matches(y * width + x)

  let count = 0
  const stack = [seedX, seedY]
  while (stack.length > 0) {
    const y = stack.pop()
    let x = stack.pop()

    while (x >= 0 && fillable(x, y)) x--
    x++

    let spanAbove = false
    let spanBelow = false
    while (x < width && fillable(x, y)) {
      mask[y * width + x] = 1
      count++

      if (y > 0) {
        const open = fillable(x, y - 1)
        if (open && !spanAbove) stack.push(x, y - 1)
        spanAbove = open
      }
      if (y < height - 1) {
        const open = fillable(x, y + 1)
        if (open && !spanBelow) stack.push(x, y + 1)
        spanBelow = open
      }
      x++
    }
  }

  return { mask, count }
}

// Outer boundary of the first connected shape found in raster order (Moore-neighbour tracing).
export const traceContour = (mask, width, height) => {
  const isSet = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1

  const first = mask.indexOf(1)
  if (first < 0) return []

  // The first pixel in raster order has empty west, north-west, north and north-east neighbours.
  const startX = first % width
  const startY = Math.floor(first / width)
  let x = startX
  let y = startY
  let back = 4
  const points = [{ x, y }]

  const maxSteps = width * height * 4
  for (let step = 0; step < maxSteps; step++) {
    let moved = false
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8
      const nextX = x + RING[d][0]
      const nextY = y + RING[d][1]
      if (!isSet(nextX, nextY)) continue

      // The neighbour examined just before is empty and becomes the new backtrack pixel.
      const previous = RING[(d + 7) % 8]
      const dx = x + previous[0] - nextX
      const dy = y + previous[1] - nextY
      back = RING.findIndex(([rx, ry]) => rx === dx && ry === dy)
      x = nextX
      y = nextY
      moved = true
      break
    }

    if (!moved) break // single isolated pixel
    // Back at the start pixel, arriving from the empty top-left side: the loop is closed.
    if (x === startX && y === startY && back >= 4 && back <= 7) break
    points.push({ x, y })
  }

  return points
}

export const loadImagePixels = (src, maxDimension = WAND_MAX_DIMENSION) => (
  new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
        const w = Math.max(1, Math.round(image.naturalWidth * scale))
        const h = Math.max(1, Math.round(image.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(image, 0, 0, w, h)
        // Throws a SecurityError if the host does not allow cross-origin pixel access.
        const { data } = context.getImageData(0, 0, w, h)
        resolve({ data, w, h, scale })
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => reject(new Error('Image failed to load'))
    image.src = src
  })
)

// pixels: { data, w, h, scale } from loadImagePixels; point and natural size are in image pixels.
// Returns { polygon } or { error: 'too_large' | 'too_small' }.
export const magicWandPolygon = (pixels, point, tolerance, natural) => {
  const { data, w, h, scale } = pixels
  const seedX = Math.min(w - 1, Math.max(0, Math.floor(point.x * scale)))
  const seedY = Math.min(h - 1, Math.max(0, Math.floor(point.y * scale)))

  const { mask, count } = floodFillMask(data, w, h, seedX, seedY, tolerance * TOLERANCE_UNIT)
  if (count / (w * h) > MAX_COVERAGE) return { error: 'too_large' }

  const contour = traceContour(mask, w, h).map(p => ({
    x: Math.round((p.x + 0.5) / scale),
    y: Math.round((p.y + 0.5) / scale)
  }))
  const polygon = reducePolygon(contour, simplifyEpsilon(natural))
  if (polygon.length < 3 || polygonArea(polygon) < MIN_REGION_AREA) return { error: 'too_small' }

  return { polygon }
}
