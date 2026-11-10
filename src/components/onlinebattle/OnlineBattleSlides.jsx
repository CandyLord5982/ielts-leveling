import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, X, Presentation, Pause } from 'lucide-react'
import SlideInk from './SlideInk'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

// Full-screen slides (a PDF) for an Online Battle room.
//   Teacher (onPageChange set): arrow buttons / keyboard to change page,
//     Pause (back to the scoreboard, keeps file and page) and Stop showing.
//   Student: no controls; the page follows whatever the teacher shows.
// The slide is sized to fit the screen in both directions.

// `ink`: { roomId, sendInk, inkHandlerRef } - turns on drawing / laser (see SlideInk)
const OnlineBattleSlides = ({ url, page, onPageChange, onPause, onClose, header, ink, keyboard = true }) => {
  const isTeacher = !!onPageChange
  const [drawing, setDrawing] = useState(false) // teacher has a pen / laser tool picked
  const [numPages, setNumPages] = useState(null)
  const [aspect, setAspect] = useState(4 / 3) // width / height of the current page
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [failed, setFailed] = useState(false)
  const areaRef = useRef(null)

  // Track the space available for the slide
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => { setFailed(false); setNumPages(null) }, [url])

  const lastPage = numPages || page
  const shown = Math.min(Math.max(1, page), lastPage)

  const go = useCallback((delta) => {
    if (!isTeacher) return
    const next = Math.min(Math.max(1, shown + delta), lastPage)
    if (next !== shown) onPageChange(next)
  }, [isTeacher, shown, lastPage, onPageChange])

  // Teacher: arrow keys and Page Up/Down (what slideshow clickers send)
  useEffect(() => {
    if (!isTeacher || !keyboard) return
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return
      if (['ArrowRight', 'PageDown'].includes(e.key)) { e.preventDefault(); go(1) }
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isTeacher, keyboard, go])

  const pad = 16
  const availW = Math.max(0, box.w - pad * 2)
  const availH = Math.max(0, box.h - pad * 2)
  const width = Math.floor(Math.min(availW, availH * aspect))

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-gray-900 text-white">
        <div className="flex items-center gap-2 min-w-0">
          <Presentation className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-bold">Slides</span>
          {numPages && <span className="text-sm text-gray-400 tabular-nums">{shown} / {numPages}</span>}
          {header}
        </div>
        {isTeacher && (
          <div className="flex items-center gap-2">
            <button onClick={() => go(-1)} disabled={shown <= 1} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30" aria-label="Previous slide">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => go(1)} disabled={!numPages || shown >= numPages} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30" aria-label="Next slide">
              <ChevronRight className="w-5 h-5" />
            </button>
            {onPause && (
              <button
                onClick={onPause}
                className="flex items-center gap-1 ml-2 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-sm font-bold"
                title="Back to the scoreboard (for a question etc.). Resume later on the same slide."
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}
            <button onClick={onClose} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-bold">
              <X className="w-4 h-4" />
              Stop showing
            </button>
          </div>
        )}
      </div>

      <div ref={areaRef} className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        {failed ? (
          <p className="text-gray-300 text-sm">Could not open the slides.</p>
        ) : (
          <Document
            file={url}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={() => setFailed(true)}
            loading={<div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />}
          >
            {width > 0 && (
              // The drawing layer sits exactly on top of the page
              <div className="relative shadow-2xl">
                <Page
                  pageNumber={shown}
                  width={width}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  onLoadSuccess={(p) => { if (p.originalHeight) setAspect(p.originalWidth / p.originalHeight) }}
                  loading={null}
                />
                {ink && numPages && (
                  <SlideInk
                    roomId={ink.roomId}
                    url={url}
                    page={shown}
                    width={width}
                    height={Math.round(width / aspect)}
                    isTeacher={isTeacher}
                    sendInk={ink.sendInk}
                    inkHandlerRef={ink.inkHandlerRef}
                    onDrawingChange={setDrawing}
                  />
                )}
              </div>
            )}
          </Document>
        )}

        {/* Teacher: tap the left / right edge to change slide (handy on a touch screen) */}
        {isTeacher && !drawing && (
          <>
            <button onClick={() => go(-1)} className="absolute inset-y-0 left-0 w-16 opacity-0" aria-label="Previous slide" tabIndex={-1} />
            <button onClick={() => go(1)} className="absolute inset-y-0 right-0 w-16 opacity-0" aria-label="Next slide" tabIndex={-1} />
          </>
        )}
      </div>
    </div>
  )
}

export default OnlineBattleSlides
