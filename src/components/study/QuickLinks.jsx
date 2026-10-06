import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronUp, ChevronDown } from 'lucide-react'

/**
 * QuickLinks component - displays collapsible next exercise quick links matching the design image.
 * 
 * @param {Object} props
 * @param {string} props.currentExerciseId - Current active exercise ID
 * @param {Array} props.siblingExercises - List of all exercises in the current session/unit
 * @param {string} [props.sessionId] - Active session ID if available
 * @param {Function} [props.onSelectExercise] - Optional callback when an exercise is clicked
 */
export default function QuickLinks({
  currentExerciseId,
  siblingExercises = [],
  sessionId,
  onSelectExercise
}) {
  const [isOpen, setIsOpen] = useState(true)
  const navigate = useNavigate()

  // Find index of current exercise
  const currentIndex = siblingExercises.findIndex(ex => ex.id === currentExerciseId)

  // Determine next exercises (all exercises in sibling list after current)
  const nextExercises = currentIndex >= 0 
    ? siblingExercises.slice(currentIndex + 1)
    : siblingExercises.filter(ex => ex.id !== currentExerciseId)

  const handleExerciseClick = (exercise) => {
    if (onSelectExercise) {
      onSelectExercise(exercise)
    } else {
      navigate(`/study/listening-dictation?exerciseId=${exercise.id}${sessionId ? `&sessionId=${sessionId}` : ''}`)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#cbe0ff] shadow-xs overflow-hidden mt-4 transition-all">
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-[#dce7ff] hover:bg-[#d4e2ff] transition-colors select-none text-left"
      >
        <span className="text-[16px] font-medium text-[#0f2942] tracking-tight">
          Quick links
        </span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-[#0f2942]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[#0f2942]" />
        )}
      </button>

      {/* Content body */}
      {isOpen && (
        <div className="p-5 md:p-6 bg-white border-t border-[#dbeafc]">
          {nextExercises.length > 0 ? (
            <ul className="space-y-3 font-normal text-[15px] text-[#1e293b]">
              {nextExercises.map((exercise) => (
                <li key={exercise.id} className="flex items-baseline gap-2.5">
                  <span className="text-[#1e293b] font-bold text-lg leading-none select-none">•</span>
                  <span>
                    Next exercise:{' '}
                    <button
                      type="button"
                      onClick={() => handleExerciseClick(exercise)}
                      className="text-[#2563eb] hover:underline font-normal text-[15px] cursor-pointer inline-block text-left focus:outline-none"
                    >
                      {exercise.title}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-baseline gap-2.5 font-normal text-[15px] text-[#64748b]">
              <span className="text-[#64748b] font-bold text-lg leading-none select-none">•</span>
              <span>Next exercise: No further exercises in this unit</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
