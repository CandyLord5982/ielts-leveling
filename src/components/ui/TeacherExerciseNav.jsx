import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { ChevronLeft, ChevronRight, BookOpen, Mic, Edit3, HelpCircle, Copy, Brain, Image, FileText, Layers, MessageSquare } from 'lucide-react'

const typeToRoute = {
  flashcard: '/study/flashcard',
  pronunciation: '/study/pronunciation',
  fill_blank: '/study/fill-blank',
  multiple_choice: '/study/multiple-choice',
  dropdown: '/study/dropdown',
  drag_drop: '/study/drag-drop',
  ai_fill_blank: '/study/ai-fill-blank',
  image_hotspot: '/study/image-hotspot',
  pdf_worksheet: '/study/pdf-worksheet',
  speaking_assessment: '/study/speaking-assessment'
}

const typeIcons = {
  flashcard: BookOpen,
  pronunciation: Mic,
  fill_blank: Edit3,
  multiple_choice: HelpCircle,
  dropdown: Layers,
  drag_drop: Copy,
  ai_fill_blank: Brain,
  image_hotspot: Image,
  pdf_worksheet: FileText,
  speaking_assessment: MessageSquare
}

const typeLabels = {
  flashcard: 'Flashcard',
  pronunciation: 'Pronunciation',
  fill_blank: 'Fill Blank',
  multiple_choice: 'Multiple Choice',
  dropdown: 'Dropdown',
  drag_drop: 'Drag & Drop',
  ai_fill_blank: 'AI Fill Blank',
  image_hotspot: 'Image Hotspot',
  pdf_worksheet: 'PDF Worksheet',
  speaking_assessment: 'Speaking'
}

const TeacherExerciseNav = ({ sessionId, currentExerciseId }) => {
  const [exercises, setExercises] = useState([])
  const [collapsed, setCollapsed] = useState(window.innerWidth < 768)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!sessionId) return
    const fetchExercises = async () => {
      const { data } = await supabase
        .from('exercise_assignments')
        .select('order_index, exercise:exercises(id, title, exercise_type)')
        .eq('session_id', sessionId)
        .order('order_index')

      if (data) {
        setExercises(data.filter(a => a.exercise).map(a => ({ ...a.exercise, order_index: a.order_index })))
      }
    }
    fetchExercises()
  }, [sessionId])

  if (!sessionId || exercises.length === 0) return null

  const currentIndex = exercises.findIndex(e => e.id === currentExerciseId)
  const searchParams = new URLSearchParams(location.search)
  const courseId = searchParams.get('courseId') || ''
  const unitId = searchParams.get('unitId') || ''

  const navigateToExercise = (exercise) => {
    const route = typeToRoute[exercise.exercise_type]
    if (!route) return
    const params = new URLSearchParams({ exerciseId: exercise.id, sessionId })
    if (courseId) params.set('courseId', courseId)
    if (unitId) params.set('unitId', unitId)
    navigate(`${route}?${params.toString()}`)
  }

  const goPrev = () => {
    if (currentIndex > 0) navigateToExercise(exercises[currentIndex - 1])
  }

  const goNext = () => {
    if (currentIndex < exercises.length - 1) navigateToExercise(exercises[currentIndex + 1])
  }

  if (collapsed) {
    return (
      <div className="fixed left-0 top-1/2 -translate-y-1/2 z-40">
        <button
          onClick={() => setCollapsed(false)}
          className="bg-white shadow-lg border border-gray-200 rounded-r-lg p-2 hover:bg-gray-50 transition-colors"
          title="Show exercise list"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>
    )
  }

  return (
    <div className="fixed left-0 top-0 h-full z-40 flex">
      <div className="w-64 bg-white shadow-xl border-r border-gray-200 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-700">
            Exercises ({currentIndex + 1}/{exercises.length})
          </span>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto py-1">
          {exercises.map((exercise, index) => {
            const isCurrent = exercise.id === currentExerciseId
            const Icon = typeIcons[exercise.exercise_type] || BookOpen

            return (
              <button
                key={exercise.id}
                onClick={() => navigateToExercise(exercise)}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${
                  isCurrent
                    ? 'bg-blue-50 border-r-3 border-blue-500'
                    : 'hover:bg-gray-50'
                }`}
              >
                <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  isCurrent
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${isCurrent ? 'font-semibold text-blue-700' : 'text-gray-700'}`}>
                    {exercise.title}
                  </p>
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Icon className="w-3 h-3" />
                    {typeLabels[exercise.exercise_type] || exercise.exercise_type}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Prev / Next */}
        <div className="flex border-t border-gray-200 flex-shrink-0">
          <button
            onClick={goPrev}
            disabled={currentIndex <= 0}
            className="flex-1 flex items-center justify-center gap-1 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r border-gray-200"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <button
            onClick={goNext}
            disabled={currentIndex >= exercises.length - 1}
            className="flex-1 flex items-center justify-center gap-1 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default TeacherExerciseNav
