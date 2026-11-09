import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { createPortal } from 'react-dom'
import { Eraser } from 'lucide-react'

// Temporary, in-memory text highlighter. Select text inside the wrapped area and pick a colour.
// Uses the CSS Custom Highlight API, so the DOM is never touched (safe with React) and nothing is
// saved: highlights vanish on reload or when the marked text is re-rendered away.
// The ::highlight(sel-hl-N) colours live in index.css.
const COLORS = [
  { color: '#fef08a', label: 'Vàng' },
  { color: '#fbcfe8', label: 'Hồng' },
  { color: '#bfdbfe', label: 'Xanh dương' },
  { color: '#bbf7d0', label: 'Xanh lá' },
]

const supported = typeof CSS !== 'undefined' && !!CSS.highlights && typeof window.Highlight !== 'undefined'
const nameOf = (i) => `sel-hl-${i}`

const intersects = (a, b) =>
  a.compareBoundaryPoints(Range.END_TO_START, b) < 0 && a.compareBoundaryPoints(Range.START_TO_END, b) > 0

// Remove `cut` from range `r`, returning the 0-2 leftover pieces.
const subtract = (r, cut) => {
  const out = []
  if (r.compareBoundaryPoints(Range.START_TO_START, cut) < 0) {
    const left = r.cloneRange()
    left.setEnd(cut.startContainer, cut.startOffset)
    out.push(left)
  }
  if (r.compareBoundaryPoints(Range.END_TO_END, cut) > 0) {
    const right = r.cloneRange()
    right.setStart(cut.endContainer, cut.endOffset)
    out.push(right)
  }
  return out
}

const SelectionHighlighter = ({ children, className = '' }) => {
  const rootRef = useRef(null)
  const rangesRef = useRef(COLORS.map(() => [])) // ranges per colour
  const savedRangeRef = useRef(null)
  const [popup, setPopup] = useState(null) // { x, y }

  // Register one Highlight per colour; drop them when the exercise unmounts.
  useEffect(() => {
    if (!supported) return
    const ranges = rangesRef.current
    COLORS.forEach((_, i) => CSS.highlights.set(nameOf(i), new window.Highlight()))
    return () => {
      COLORS.forEach((_, i) => CSS.highlights.delete(nameOf(i)))
      ranges.forEach((list) => { list.length = 0 })
    }
  }, [])

  const sync = () => {
    COLORS.forEach((_, i) => {
      rangesRef.current[i] = rangesRef.current[i].filter((r) => !r.collapsed)
      const h = CSS.highlights.get(nameOf(i))
      if (!h) return
      h.clear()
      rangesRef.current[i].forEach((r) => h.add(r))
    })
  }

  // Show the toolbar when a non-empty selection sits inside the wrapped area.
  useEffect(() => {
    if (!supported) return
    const onSelectionEnd = () => {
      // Wait a tick so the browser has finalised the selection (double-click, touch handles).
      setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) {
          setPopup(null)
          return
        }
        // A plain click on already-highlighted text reopens the toolbar for that highlight
        // so it can be recoloured or removed.
        if (sel.isCollapsed) {
          const node = sel.anchorNode
          const host = node?.nodeType === 1 ? node : node?.parentElement
          let found = null
          let foundColor = -1
          if (node && rootRef.current?.contains(node) && !host?.closest('input, textarea, button:not([aria-disabled="true"])')) {
            rangesRef.current.forEach((list, i) => {
              list.forEach((r) => {
                if (!found && !r.collapsed && r.isPointInRange(node, sel.anchorOffset)) { found = r; foundColor = i }
              })
            })
          }
          if (!found) {
            setPopup(null)
            return
          }
          const rect = found.getBoundingClientRect()
          savedRangeRef.current = found.cloneRange()
          setPopup({ x: rect.left + rect.width / 2, y: rect.top, active: foundColor })
          return
        }
        if (!sel.toString().trim()) {
          setPopup(null)
          return
        }
        const range = sel.getRangeAt(0)
        const root = rootRef.current
        const anchor = range.commonAncestorContainer
        const el = anchor.nodeType === 1 ? anchor : anchor.parentElement
        // Skip clickable answer buttons (selecting there would also pick the answer) and inputs.
        if (!root || !root.contains(anchor) || el?.closest('input, textarea, [data-no-highlight], button:not([aria-disabled="true"])')) {
          setPopup(null)
          return
        }
        const rect = range.getBoundingClientRect()
        savedRangeRef.current = range.cloneRange()
        setPopup({ x: rect.left + rect.width / 2, y: rect.top })
      }, 0)
    }
    const onPointerDown = (e) => {
      if (e.target.closest?.('.sel-highlight-toolbar')) return
      setPopup(null)
    }
    document.addEventListener('mouseup', onSelectionEnd)
    document.addEventListener('touchend', onSelectionEnd)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('mouseup', onSelectionEnd)
      document.removeEventListener('touchend', onSelectionEnd)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [])

  // colorIndex === null erases highlights under the selection.
  const apply = (colorIndex) => {
    const target = savedRangeRef.current
    if (!target) return
    rangesRef.current = rangesRef.current.map((list) =>
      list.flatMap((r) => (intersects(r, target) ? subtract(r, target) : [r]))
    )
    if (colorIndex !== null) rangesRef.current[colorIndex].push(target)
    sync()
    window.getSelection()?.removeAllRanges()
    savedRangeRef.current = null
    setPopup(null)
  }

  // ::highlight() can't set a cursor, so hit-test the highlight rects on hover instead.
  const onMouseMove = (e) => {
    const root = e.currentTarget
    const { clientX: x, clientY: y } = e
    const over = rangesRef.current.some((list) =>
      list.some((r) => Array.from(r.getClientRects()).some(
        (c) => x >= c.left && x <= c.right && y >= c.top && y <= c.bottom
      ))
    )
    const want = over ? 'pointer' : ''
    if (root.style.cursor !== want) root.style.cursor = want
  }

  return (
    <div ref={rootRef} className={className} onMouseMove={supported ? onMouseMove : undefined}>
      {children}
      {supported && popup && createPortal(
        <div
          className="sel-highlight-toolbar fixed z-[100] -translate-x-1/2 -translate-y-full pb-2"
          style={{ left: Math.min(Math.max(popup.x, 90), window.innerWidth - 90), top: Math.max(popup.y, 48) }}
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="bg-gray-800 rounded-xl shadow-2xl px-3 py-2 flex items-center gap-2 border border-gray-700">
            {COLORS.map(({ color, label }, i) => (
              <button
                key={color}
                type="button"
                title={label}
                onClick={() => apply(i)}
                className={`cursor-pointer w-6 h-6 rounded border-2 hover:scale-125 transition-transform shadow ${popup.active === i ? 'border-white' : 'border-white/30'}`}
                style={{ backgroundColor: color }}
              />
            ))}
            <div className="w-px h-4 bg-gray-600" />
            <button
              type="button"
              title="Xóa highlight"
              onClick={() => apply(null)}
              className="cursor-pointer text-gray-300 hover:text-white"
            >
              <Eraser className="w-4 h-4" />
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

SelectionHighlighter.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
}

export default SelectionHighlighter
