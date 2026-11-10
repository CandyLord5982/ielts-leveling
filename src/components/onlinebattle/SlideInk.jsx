import { useCallback, useEffect, useRef, useState } from 'react'
import { MousePointer2, Pen, Highlighter, Eraser, Crosshair, Trash2, Type } from 'lucide-react'
import { supabase } from '../../supabase/client'

// Drawing on top of a slide (never inside the PDF) + the teacher's laser pointer.
//
// Coordinates are fractions of the page (0..1), so a circle drawn on the teacher's laptop
// lands in the same place on a student's phone.
//   Finished strokes: saved in online_battle_slide_strokes (per room + file + page), and
//     announced right away over the room's realtime channel ('ink' event).
//   Live drawing and the laser: realtime only, batched into one message every TICK_MS,
//     because the realtime client sends at most 10 messages a second.
//
// 'ink' payloads (all carry url + page; screens on another page ignore them):
//   { t: 'tick', live: { id, stroke } | null, laser: { x, y } | null }   (keys optional)
//   { t: 'add', id, stroke }   { t: 'remove', ids }   { t: 'clear' }

const TICK_MS = 120
const RELOAD_MS = 60000 // students re-read the saved strokes, in case a message was missed (each read is logged)
const LASER_HIDE_MS = 2500

const COLORS = ['#ef4444', '#2563eb', '#16a34a', '#111827', '#facc15']
const WIDTH = { pen: 0.004, highlighter: 0.025 } // fraction of the page width
// Typed text: { tool: 'text', color, text, x, y (top-left), s: font size / page width }
const TEXT_SIZES = [{ label: 'S', s: 0.022 }, { label: 'M', s: 0.035 }, { label: 'L', s: 0.055 }]

const round = (n) => Math.round(n * 10000) / 10000
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

const pathOf = (pts, W, H) => pts
  .map(([x, y], i) => `${i ? 'L' : 'M'}${(x * W).toFixed(1)} ${(y * H).toFixed(1)}`)
  .join(' ')

// Does a point (page fractions) touch a stroke or a text? Used by the eraser.
const touches = (stroke, x, y, aspect) => {
  if (stroke.tool === 'text') {
    // Rough box around the text: ~0.55 em per character, one line high
    const pad = 0.01
    const w = stroke.text.length * stroke.s * 0.55
    const h = stroke.s * 1.2 * aspect // in fractions of the page height
    return x >= stroke.x - pad && x <= stroke.x + w + pad && y >= stroke.y - pad && y <= stroke.y + h + pad
  }
  const r = 0.015 + (stroke.w || 0) / 2
  return stroke.pts.some(([px, py]) => {
    const dx = px - x
    const dy = (py - y) / aspect // page height is 1/aspect of its width
    return dx * dx + dy * dy < r * r
  })
}

const StrokePath = ({ stroke, W, H }) => (stroke.tool === 'text' ? (
  <text
    x={stroke.x * W}
    y={stroke.y * H}
    fill={stroke.color}
    fontSize={stroke.s * W}
    fontWeight="600"
    fontFamily="system-ui, sans-serif"
    dominantBaseline="hanging"
    style={{ whiteSpace: 'pre' }}
  >
    {stroke.text}
  </text>
) : (
  <path
    d={pathOf(stroke.pts, W, H)}
    fill="none"
    stroke={stroke.color}
    strokeWidth={Math.max(1, stroke.w * W)}
    strokeOpacity={stroke.tool === 'highlighter' ? 0.4 : 1}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
))

const SlideInk = ({ roomId, url, page, width, height, isTeacher, sendInk, inkHandlerRef, onDrawingChange }) => {
  const [strokes, setStrokes] = useState([]) // [{ id, stroke }]
  const [live, setLive] = useState({}) // id -> stroke, other people's in-progress strokes
  const [laser, setLaser] = useState(null) // { x, y }
  const [tool, setTool] = useState('none') // none | pen | highlighter | eraser | laser
  const [color, setColor] = useState(COLORS[0])
  const [current, setCurrent] = useState(null) // teacher's stroke being drawn
  const [textSize, setTextSize] = useState(TEXT_SIZES[1].s)
  const [draft, setDraftState] = useState(null) // text being typed: { x, y, value }
  const draftRef = useRef(null) // same, readable from late blur events (saves each text once)
  const setDraft = (next) => { draftRef.current = next; setDraftState(next) }
  const pendingRef = useRef({})
  const currentRef = useRef(null)
  const laserTimerRef = useRef(null)
  const svgRef = useRef(null)

  const aspect = height ? width / height : 1
  const W = 1000
  const H = height ? (1000 * height) / width : 1000

  // ----- Saved strokes for this page -----
  const load = useCallback(async () => {
    if (!roomId || !url) return
    const { data, error } = await supabase.rpc('online_battle_slide_strokes', {
      p_room_id: roomId, p_slide_url: url, p_page: page,
    })
    if (!error && Array.isArray(data)) setStrokes(data)
  }, [roomId, url, page])

  useEffect(() => {
    setStrokes([])
    setLive({})
    setLaser(null)
    load()
  }, [load])

  useEffect(() => {
    if (isTeacher) return
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, RELOAD_MS)
    return () => clearInterval(timer)
  }, [isTeacher, load])

  // ----- Students: apply what the teacher sends -----
  useEffect(() => {
    if (isTeacher || !inkHandlerRef) return
    inkHandlerRef.current = (msg) => {
      if (!msg || msg.url !== url || msg.page !== page) return
      if (msg.t === 'tick') {
        if (msg.live) setLive(prev => ({ ...prev, [msg.live.id]: msg.live.stroke }))
        if ('laser' in msg) {
          setLaser(msg.laser)
          clearTimeout(laserTimerRef.current)
          if (msg.laser) laserTimerRef.current = setTimeout(() => setLaser(null), LASER_HIDE_MS)
        }
      } else if (msg.t === 'add') {
        setLive(prev => { const next = { ...prev }; delete next[msg.id]; return next })
        setStrokes(prev => (prev.some(s => s.id === msg.id) ? prev : [...prev, { id: msg.id, stroke: msg.stroke }]))
      } else if (msg.t === 'remove') {
        const gone = new Set(msg.ids)
        setStrokes(prev => prev.filter(s => !gone.has(s.id)))
      } else if (msg.t === 'clear') {
        setStrokes([])
        setLive({})
      }
    }
    return () => { inkHandlerRef.current = null; clearTimeout(laserTimerRef.current) }
  }, [isTeacher, inkHandlerRef, url, page])

  // ----- Teacher: batch live drawing + laser into one message per tick -----
  useEffect(() => {
    if (!isTeacher) return
    const timer = setInterval(() => {
      const pending = pendingRef.current
      if (!Object.keys(pending).length) return
      pendingRef.current = {}
      sendInk({ t: 'tick', url, page, ...pending })
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [isTeacher, sendInk, url, page])

  useEffect(() => { onDrawingChange?.(tool !== 'none') }, [tool, onDrawingChange])

  // Hide the laser everywhere when leaving laser mode or the page
  useEffect(() => {
    if (!isTeacher || tool === 'laser') return
    setLaser(null)
    pendingRef.current.laser = null
  }, [isTeacher, tool, page, url])

  const pointAt = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    return [
      round(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))),
      round(Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))),
    ]
  }

  const eraseAt = (x, y) => {
    const hit = strokes.filter(s => touches(s.stroke, x, y, aspect)).map(s => s.id)
    if (!hit.length) return
    const gone = new Set(hit)
    setStrokes(prev => prev.filter(s => !gone.has(s.id)))
    sendInk({ t: 'remove', url, page, ids: hit })
    supabase.from('online_battle_slide_strokes').delete().in('id', hit).then(() => {})
  }

  // Save a finished stroke or text: show it here, tell the students, store it
  const saveItem = (id, stroke) => {
    setStrokes(prev => [...prev, { id, stroke }])
    sendInk({ t: 'add', url, page, id, stroke })
    supabase.from('online_battle_slide_strokes')
      .insert({ id, room_id: roomId, slide_url: url, page, stroke })
      .then(({ error }) => { if (error) console.error('Could not save drawing:', error.message) })
  }

  const commitDraft = () => {
    const d = draftRef.current
    if (!d) return
    setDraft(null)
    const text = d?.value.trim()
    if (!text) return
    saveItem(newId(), { tool: 'text', color, text: text.slice(0, 200), x: d.x, y: d.y, s: textSize })
  }

  // Leaving the slide or the text tool keeps what was typed
  useEffect(() => { if (tool !== 'text') commitDraft() }, [tool]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setDraft(null), [url, page])

  const onPointerDown = (e) => {
    if (tool === 'none') return
    e.preventDefault()
    const [x, y] = pointAt(e)
    if (tool === 'text') {
      // Tap = start a new text there (and keep the one being typed, if any)
      commitDraft()
      setDraft({ x, y, value: '' })
      return
    }
    svgRef.current.setPointerCapture?.(e.pointerId)
    if (tool === 'eraser') { eraseAt(x, y); return }
    if (tool === 'laser') {
      setLaser({ x, y })
      pendingRef.current.laser = { x, y }
      return
    }
    const stroke = { tool, color, w: WIDTH[tool], pts: [[x, y]] }
    currentRef.current = { id: newId(), stroke }
    setCurrent(currentRef.current)
  }

  const onPointerMove = (e) => {
    if (tool === 'laser') {
      const [x, y] = pointAt(e)
      setLaser({ x, y })
      pendingRef.current.laser = { x, y }
      return
    }
    if (tool === 'eraser' && e.buttons) {
      const [x, y] = pointAt(e)
      eraseAt(x, y)
      return
    }
    const cur = currentRef.current
    if (!cur) return
    const [x, y] = pointAt(e)
    const [lx, ly] = cur.stroke.pts[cur.stroke.pts.length - 1]
    if (Math.abs(x - lx) + Math.abs(y - ly) < 0.002) return
    cur.stroke = { ...cur.stroke, pts: [...cur.stroke.pts, [x, y]] }
    setCurrent({ ...cur })
    pendingRef.current.live = { id: cur.id, stroke: cur.stroke }
  }

  const finishStroke = () => {
    const cur = currentRef.current
    if (!cur) return
    currentRef.current = null
    setCurrent(null)
    const stroke = cur.stroke.pts.length === 1
      ? { ...cur.stroke, pts: [cur.stroke.pts[0], cur.stroke.pts[0]] } // a dot
      : cur.stroke
    delete pendingRef.current.live
    saveItem(cur.id, stroke)
  }

  const clearPage = () => {
    if (!strokes.length || !window.confirm('Clear all drawings on this slide?')) return
    setStrokes([])
    sendInk({ t: 'clear', url, page })
    supabase.from('online_battle_slide_strokes').delete()
      .eq('room_id', roomId).eq('slide_url', url).eq('page', page).then(() => {})
  }

  const toolButton = (key, Icon, label) => (
    <button
      key={key}
      onClick={() => setTool(key)}
      title={label}
      aria-label={label}
      className={`p-2 rounded-lg transition-colors ${tool === key ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  )

  const liveStrokes = Object.entries(live)
  const cursor = tool === 'none' ? 'default' : tool === 'laser' ? 'none' : tool === 'text' ? 'text' : 'crosshair'

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: isTeacher && tool !== 'none' ? 'auto' : 'none', touchAction: 'none', cursor }}
        onPointerDown={isTeacher ? onPointerDown : undefined}
        onPointerMove={isTeacher ? onPointerMove : undefined}
        onPointerUp={isTeacher ? finishStroke : undefined}
        onPointerCancel={isTeacher ? finishStroke : undefined}
        onPointerLeave={isTeacher ? () => { finishStroke(); if (tool === 'laser') { setLaser(null); pendingRef.current.laser = null } } : undefined}
      >
        {strokes.map(s => <StrokePath key={s.id} stroke={s.stroke} W={W} H={H} />)}
        {liveStrokes.map(([id, stroke]) => <StrokePath key={id} stroke={stroke} W={W} H={H} />)}
        {current && <StrokePath stroke={current.stroke} W={W} H={H} />}
      </svg>

      {isTeacher && draft && (
        <input
          key={`${draft.x},${draft.y}`} // a new box for each tap, so it gets the focus
          autoFocus
          value={draft.value}
          onChange={e => { if (draftRef.current) setDraft({ ...draftRef.current, value: e.target.value.slice(0, 200) }) }}
          onKeyDown={e => {
            e.stopPropagation() // arrow keys move the cursor here, not the slide
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commitDraft() }
            else if (e.key === 'Escape') setDraft(null)
          }}
          onBlur={commitDraft}
          placeholder="Type, then Enter"
          className="absolute bg-white/80 border-2 border-dashed border-indigo-500 rounded px-1 outline-none font-semibold placeholder:text-gray-400 placeholder:font-normal"
          style={{
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            color,
            fontSize: `${Math.max(12, textSize * width)}px`,
            lineHeight: 1.1,
            minWidth: '8rem',
            width: `${Math.max(8, draft.value.length + 2)}ch`,
            maxWidth: `${Math.max(0, (1 - draft.x) * 100)}%`,
          }}
        />
      )}

      {laser && (
        <span
          className="absolute pointer-events-none w-4 h-4 -ml-2 -mt-2 rounded-full bg-red-500 ring-4 ring-red-400/50 shadow-[0_0_16px_6px_rgba(239,68,68,0.7)]"
          style={{
            left: `${laser.x * 100}%`,
            top: `${laser.y * 100}%`,
            transition: isTeacher ? 'none' : `left ${TICK_MS}ms linear, top ${TICK_MS}ms linear`,
          }}
        />
      )}

      {isTeacher && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[55] flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-white shadow-2xl border border-gray-200">
          {toolButton('none', MousePointer2, 'No tool (click edges to change slide)')}
          {toolButton('pen', Pen, 'Pen')}
          {toolButton('highlighter', Highlighter, 'Highlighter')}
          {toolButton('text', Type, 'Text (tap where to type)')}
          {tool === 'text' && TEXT_SIZES.map(sz => (
            <button
              key={sz.label}
              onClick={() => setTextSize(sz.s)}
              title={`Text size ${sz.label}`}
              className={`w-7 h-7 rounded-lg text-xs font-bold ${textSize === sz.s ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {sz.label}
            </button>
          ))}
          {toolButton('eraser', Eraser, 'Eraser (touch a line to remove it)')}
          {toolButton('laser', Crosshair, 'Laser pointer')}
          <span className="w-px h-6 bg-gray-200 mx-1" />
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => { setColor(c); if (tool === 'none' || tool === 'eraser' || tool === 'laser') setTool('pen') }}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? 'border-gray-800 scale-110' : 'border-white'}`}
              style={{ backgroundColor: c }}
              aria-label={`Colour ${c}`}
            />
          ))}
          <span className="w-px h-6 bg-gray-200 mx-1" />
          <button onClick={clearPage} disabled={!strokes.length} className="p-2 rounded-lg text-gray-700 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" title="Clear this slide" aria-label="Clear this slide">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  )
}

export default SlideInk
