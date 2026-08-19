import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Users, CheckCircle, XCircle, Clock } from 'lucide-react';

/**
 * A hover popover that shows student completion details.
 * Renders via portal to avoid z-index issues.
 *
 * Props:
 * - stats: { completed: number, total: number, students: [{ id, name, status }] }
 *     status: 'completed' | 'in_progress' | 'not_started'
 * - size: 'sm' | 'md' (default: 'sm')
 * - children: optional custom trigger (if not provided, renders default badge)
 */
const StudentStatsPopover = ({ stats, size = 'sm', children, courseId, sessionId }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const timeoutRef = useRef(null);

  if (!stats) return null;

  const { completed, total, students = [] } = stats;

  const completedStudents = students.filter(s => s.status === 'completed');
  const inProgressStudents = students.filter(s => s.status === 'in_progress');
  const notStartedStudents = students.filter(s => s.status === 'not_started');

  const handleStudentClick = (studentId) => {
    if (!courseId) return;
    const params = new URLSearchParams({ view: 'matrix' });
    if (sessionId) params.set('sessionId', sessionId);
    navigate(`/teacher/course-report/${courseId}?${params.toString()}`);
  };

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 256; // w-64 = 16rem = 256px
    const popoverHeight = 320; // max-h-80 = 20rem = 320px
    const gap = 8;

    let top = rect.bottom + gap;
    let left = rect.left + rect.width / 2 - popoverWidth / 2;

    // Flip to top if overflowing bottom
    if (top + popoverHeight > window.innerHeight) {
      top = rect.top - gap - popoverHeight;
    }
    // Keep within horizontal bounds
    if (left < 8) left = 8;
    if (left + popoverWidth > window.innerWidth - 8) {
      left = window.innerWidth - popoverWidth - 8;
    }
    // If flipped top is also off-screen, just pin to top
    if (top < 8) top = 8;

    setCoords({ top, left });
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    updatePosition();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 200);
  };

  const handlePopoverEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  const handlePopoverLeave = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 200);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const badgeColor = completed === total && total > 0
    ? 'bg-green-100 text-green-700 border-green-200'
    : completed > 0
      ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
      : 'bg-gray-100 text-gray-500 border-gray-200';

  return (
    <>
      <div
        className="relative inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        ref={triggerRef}
      >
        {children || (
          <div className={`flex items-center space-x-1 px-2 py-1 rounded-full border cursor-default ${badgeColor} ${
            size === 'sm' ? 'text-xs' : 'text-sm'
          } font-bold`}>
            <Users className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
            <span>{completed}/{total}</span>
          </div>
        )}
      </div>

      {/* Portal popover - renders at document.body level, above everything */}
      {isOpen && students.length > 0 && createPortal(
        <div
          ref={popoverRef}
          className="fixed"
          style={{ top: coords.top, left: coords.left, zIndex: 99999 }}
          onMouseEnter={handlePopoverEnter}
          onMouseLeave={handlePopoverLeave}
        >
          <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-64 max-h-80 overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Student Progress</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  completed === total && total > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {completed}/{total}
                </span>
              </div>
              {/* Mini progress bar */}
              <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    completed === total && total > 0 ? 'bg-green-500' : 'bg-yellow-400'
                  }`}
                  style={{ width: total > 0 ? `${(completed / total) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {/* Student list */}
            <div className="overflow-y-auto max-h-60 divide-y divide-gray-100">
              {/* Completed */}
              {completedStudents.length > 0 && (
                <div>
                  <div className="px-3 py-1 bg-green-50">
                    <span className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">
                      Completed ({completedStudents.length})
                    </span>
                  </div>
                  {completedStudents.map(student => (
                    <div
                      key={student.id}
                      className={`flex items-center px-3 py-1.5 hover:bg-gray-50 ${courseId ? 'cursor-pointer hover:bg-green-50' : ''}`}
                      onClick={() => handleStudentClick(student.id)}
                    >
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      <span className="ml-2 text-sm text-gray-700 truncate flex-1">{student.name}</span>
                      {student.score != null && (
                        <span className="ml-1 text-[10px] text-green-600 font-bold whitespace-nowrap">
                          {student.score}%
                        </span>
                      )}
                      {student.totalExercises > 0 && (
                        <span className="ml-1 text-[10px] text-green-600 font-medium whitespace-nowrap">
                          {student.completedExercises}/{student.totalExercises}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* In Progress */}
              {inProgressStudents.length > 0 && (
                <div>
                  <div className="px-3 py-1 bg-yellow-50">
                    <span className="text-[10px] font-semibold text-yellow-700 uppercase tracking-wide">
                      In Progress ({inProgressStudents.length})
                    </span>
                  </div>
                  {inProgressStudents.map(student => (
                    <div
                      key={student.id}
                      className={`flex items-center px-3 py-1.5 hover:bg-gray-50 ${courseId ? 'cursor-pointer hover:bg-yellow-50' : ''}`}
                      onClick={() => handleStudentClick(student.id)}
                    >
                      <Clock className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                      <span className="ml-2 text-sm text-gray-700 truncate flex-1">{student.name}</span>
                      {student.score != null && (
                        <span className="ml-1 text-[10px] text-yellow-600 font-bold whitespace-nowrap">
                          {student.score}%
                        </span>
                      )}
                      {student.totalExercises > 0 && (
                        <span className="ml-1 text-[10px] text-yellow-600 font-medium whitespace-nowrap">
                          {student.completedExercises}/{student.totalExercises}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Not Started */}
              {notStartedStudents.length > 0 && (
                <div>
                  <div className="px-3 py-1 bg-gray-50">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Not Started ({notStartedStudents.length})
                    </span>
                  </div>
                  {notStartedStudents.map(student => (
                    <div
                      key={student.id}
                      className={`flex items-center px-3 py-1.5 hover:bg-gray-50 ${courseId ? 'cursor-pointer' : ''}`}
                      onClick={() => handleStudentClick(student.id)}
                    >
                      <XCircle className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="ml-2 text-sm text-gray-500 truncate flex-1">{student.name}</span>
                      {student.totalExercises > 0 && (
                        <span className="ml-1 text-[10px] text-gray-400 font-medium whitespace-nowrap">
                          {student.completedExercises}/{student.totalExercises}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default StudentStatsPopover;
