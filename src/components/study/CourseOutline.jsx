import { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, FileText, Lock } from 'lucide-react'
import { CLIP } from '../ui/hudClip'

const pad = (n) => String(n).padStart(2, '0')

/**
 * Course outline for the left side of the exercise list page (Moodle / Khan Academy style):
 * every unit of the course with its sessions, status marks, and the current session highlighted.
 * Presentational: the page owns the data and the open/closed state.
 */
const CourseOutline = ({
  open,
  onOpen,
  onClose,
  course,
  units,
  sessions,
  sessionProgress,
  currentSessionId,
  currentUnitId,
  isStudent,
  onBack,
  onSelectSession,
}) => {
  const [expanded, setExpanded] = useState(() => new Set(currentUnitId ? [currentUnitId] : []))
  const navRef = useRef(null)
  const currentRowRef = useRef(null)

  // Keep the current unit open when the page moves to another session
  useEffect(() => {
    if (!currentUnitId) return
    setExpanded((prev) => (prev.has(currentUnitId) ? prev : new Set(prev).add(currentUnitId)))
  }, [currentUnitId])

  const groups = useMemo(() => {
    const courseUnits = units
      .filter((u) => u.course_id === course?.id)
      .sort((a, b) => (a.unit_number || 0) - (b.unit_number || 0))
    return courseUnits.map((unit) => ({
      unit,
      list: sessions
        .filter((s) => s.unit_id === unit.id)
        .filter((s) => (isStudent ? true : !s.assigned_student_id))
        .sort((a, b) => (a.session_number || 0) - (b.session_number || 0)),
    }))
  }, [units, sessions, course?.id, isStudent])

  const sessionState = (session) => {
    const now = new Date()
    if (isStudent) {
      if (session.open_date && new Date(session.open_date) > now) return { key: 'scheduled', locked: true }
      if (session.close_date && new Date(session.close_date) < now) return { key: 'closed', locked: true }
    }
    const status = sessionProgress[session.id]?.status
    if (status === 'completed') return { key: 'completed', locked: false }
    if (status === 'in_progress') return { key: 'in_progress', locked: false }
    return { key: 'not_started', locked: false }
  }

  const total = groups.reduce((n, g) => n + g.list.length, 0)
  const done = groups.reduce((n, g) => n + g.list.filter((s) => sessionState(s).key === 'completed').length, 0)
  const pct = total ? Math.round((done / total) * 100) : 0

  // Scroll the current session into the middle of the list (only the list, never the page)
  useEffect(() => {
    if (!open || !navRef.current || !currentRowRef.current) return
    navRef.current.scrollTop = currentRowRef.current.offsetTop - navRef.current.clientHeight / 2
  }, [open, currentSessionId, expanded])

  if (total === 0) return null

  const toggleUnit = (unitId) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })

  const diamond = (session, isCurrent) => {
    if (isCurrent) return 'bg-blue-500 border-blue-500'
    const { key } = sessionState(session)
    if (key === 'completed') return 'bg-emerald-500 border-emerald-500'
    if (key === 'in_progress') return 'bg-amber-400 border-amber-400'
    return 'bg-white border-gray-300'
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        title="Show course outline"
        aria-label="Show course outline"
        className="absolute left-0 top-1/2 z-40 flex h-14 w-7 -translate-y-1/2 items-center justify-center border border-l-0 border-gray-200 bg-white text-gray-500 shadow-md hover:text-gray-900"
        style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)' }}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    )
  }

  return (
    <>
      {/* Phones/tablets: tap outside to close the drawer */}
      <div className="absolute inset-0 z-[55] bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      <aside
        className="absolute inset-y-0 left-0 z-[60] flex w-72 max-w-[85vw] flex-col border-r border-gray-200 bg-white shadow-xl lg:z-40 lg:shadow-none"
        aria-label="Course outline"
      >
        <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Back to course</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-shrink-0 p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              title="Hide course outline"
              aria-label="Hide course outline"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <h2 className="mt-2 truncate text-sm font-bold tracking-tight text-gray-900">{course?.title || 'Course'}</h2>
          <div className="mt-2 flex items-center gap-2">
            <div
              className="relative h-2 flex-1 overflow-hidden border border-gray-200 bg-gray-100"
              style={{ clipPath: CLIP.bar }}
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin={0}
              aria-valuemax={total}
            >
              <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-xs font-bold tabular-nums text-gray-500">
              {done}/{total}
            </span>
          </div>
        </div>

        <nav ref={navRef} className="relative flex-1 overflow-y-auto py-1">
          {groups.map(({ unit, list }, unitIndex) => {
            const isOpen = expanded.has(unit.id)
            const unitDone = list.filter((s) => sessionState(s).key === 'completed').length
            const isCurrentUnit = unit.id === currentUnitId
            return (
              <div key={unit.id}>
                <button
                  type="button"
                  onClick={() => toggleUnit(unit.id)}
                  aria-expanded={isOpen}
                  className="relative flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50"
                >
                  {isCurrentUnit && <span className="absolute left-0 top-0 h-full w-[3px] bg-blue-500" />}
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center border font-mono text-xs font-bold ${isCurrentUnit ? 'border-blue-500 text-blue-600' : 'border-gray-300 text-gray-600'}`}
                    style={{ clipPath: CLIP.icon }}
                  >
                    {pad(unitIndex + 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{unit.title || `Unit ${unitIndex + 1}`}</span>
                    <span className="font-mono text-[11px] text-gray-400">
                      {unitDone}/{list.length}
                    </span>
                  </span>
                  <ChevronDown className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                </button>

                {isOpen &&
                  list.map((session) => {
                    const isCurrent = session.id === currentSessionId
                    const { locked, key } = sessionState(session)
                    return (
                      <button
                        key={session.id}
                        ref={isCurrent ? currentRowRef : undefined}
                        type="button"
                        disabled={locked}
                        onClick={() => onSelectSession(session)}
                        aria-current={isCurrent ? 'page' : undefined}
                        className={`relative flex w-full items-center gap-3 py-2 pl-6 pr-3 text-left transition-colors ${
                          locked ? 'cursor-not-allowed opacity-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        {isCurrent && <span className="absolute left-0 top-0 h-full w-[3px] bg-blue-500" />}
                        <span className={`h-2.5 w-2.5 flex-shrink-0 border ${diamond(session, isCurrent)}`} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm ${isCurrent ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                            {session.title}
                          </span>
                          {(session.is_test || key === 'scheduled' || key === 'closed') && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              {session.is_test && (
                                <>
                                  <FileText className="h-3 w-3" />
                                  <span className="text-orange-600">Test</span>
                                </>
                              )}
                              {key === 'scheduled' && <span>Not open yet</span>}
                              {key === 'closed' && <span>Closed</span>}
                            </span>
                          )}
                        </span>
                        {locked && <Lock className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />}
                      </button>
                    )
                  })}
                {isOpen && list.length === 0 && (
                  <p className="py-2 pl-6 pr-3 text-xs text-gray-400">No sessions yet</p>
                )}
              </div>
            )
          })}
        </nav>
      </aside>
    </>
  )
}

CourseOutline.propTypes = {
  open: PropTypes.bool.isRequired,
  onOpen: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  course: PropTypes.object,
  units: PropTypes.array.isRequired,
  sessions: PropTypes.array.isRequired,
  sessionProgress: PropTypes.object.isRequired,
  currentSessionId: PropTypes.string,
  currentUnitId: PropTypes.string,
  isStudent: PropTypes.bool,
  onBack: PropTypes.func.isRequired,
  onSelectSession: PropTypes.func.isRequired,
}

export default CourseOutline
