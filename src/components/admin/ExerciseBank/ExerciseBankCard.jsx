import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../../supabase/client'
import {
  BookOpen,
  Edit3,
  Mic,
  HelpCircle,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Eye,
  Star,
  Clock,
  Tag,
  FolderOpen,
  Image,
  FileText,
  Video
} from 'lucide-react'

const ExerciseBankCard = ({ exercise, viewMode, onUpdate, onEdit, readOnly = false, allowedTypes = null }) => {
  const canEdit = allowedTypes ? allowedTypes.includes(exercise.exercise_type) : !readOnly
  const [showMenu, setShowMenu] = useState(false)
  const [showAssignments, setShowAssignments] = useState(false)
  const [assignments, setAssignments] = useState([])
  const [loadingAssignments, setLoadingAssignments] = useState(false)
  const menuRef = useRef(null)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showMenu])

  const getTypeIcon = (type) => {
    switch (type) {
      case 'flashcard':
        return BookOpen
      case 'pronunciation':
        return Mic
      case 'fill_blank':
        return Edit3
      case 'multiple_choice':
        return HelpCircle
      case 'image_hotspot':
        return Image
      case 'drag_drop':
        return Copy
      case 'dropdown':
        return HelpCircle
      case 'ai_fill_blank':
        return Edit3
      case 'pdf_worksheet':
        return FileText
      case 'video_upload':
        return Video
      default:
        return BookOpen
    }
  }

  const getTypeLabel = (type) => {
    switch (type) {
      case 'flashcard':
        return 'Flashcard'
      case 'pronunciation':
        return 'Pronunciation'
      case 'fill_blank':
        return 'Fill in the Blank'
      case 'multiple_choice':
        return 'Multiple Choice'
      case 'image_hotspot':
        return 'Image Hotspot'
      case 'drag_drop':
        return 'Drag & Drop'
      case 'dropdown':
        return 'Dropdown'
      case 'ai_fill_blank':
        return 'AI Fill Blank'
      case 'pdf_worksheet':
        return 'PDF Worksheet'
      case 'speaking_assessment':
        return 'Speaking Assessment'
      case 'video_upload':
        return 'Video Upload'
      default:
        return 'Exercise'
    }
  }

  const getContentPreview = (exercise) => {
    const c = exercise.content
    if (!c) return 'No content yet'
    const qs = c.questions || c.cards || c.flashcards || []
    const count = qs.length
    if (count === 0) return 'No questions yet'
    const first = qs[0]
    let firstText = ''
    switch (exercise.exercise_type) {
      case 'flashcard':
        firstText = first.front || first.term || ''
        break
      case 'pronunciation':
        firstText = first.text || ''
        break
      case 'speaking_assessment':
        firstText = first.prompt || ''
        break
      case 'pdf_worksheet':
        return c.pdf_url ? `PDF: ${count} question${count !== 1 ? 's' : ''}` : 'PDF worksheet'
      default:
        firstText = first.question || first.prompt || first.text || first.sentence || ''
    }
    // Strip HTML tags
    const clean = firstText.replace(/<[^>]*>/g, '').trim()
    const preview = clean.length > 80 ? clean.substring(0, 80) + '…' : clean
    return `${count} question${count !== 1 ? 's' : ''}${preview ? ` · ${preview}` : ''}`
  }

  const getDifficultyColor = (level) => {
    switch (level) {
      case 1:
        return 'bg-green-100 text-green-800'
      case 2:
        return 'bg-yellow-100 text-yellow-800'
      case 3:
        return 'bg-orange-100 text-orange-800'
      case 4:
        return 'bg-red-100 text-red-800'
      case 5:
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const handlePreview = () => {
    // Build the appropriate URL based on exercise type
    const getExerciseUrl = () => {
      switch (exercise.exercise_type) {
        case 'flashcard':
          return `/study/flashcard?exerciseId=${exercise.id}`
        case 'pronunciation':
          return `/study/pronunciation?exerciseId=${exercise.id}`
        case 'fill_blank':
          return `/study/fill-blank?exerciseId=${exercise.id}`
        case 'multiple_choice':
          return `/study/multiple-choice?exerciseId=${exercise.id}`
        case 'dropdown':
          return `/study/dropdown?exerciseId=${exercise.id}`
        case 'drag_drop':
          return `/study/drag-drop?exerciseId=${exercise.id}`
        case 'ai_fill_blank':
          return `/study/ai-fill-blank?exerciseId=${exercise.id}`
        case 'image_hotspot':
          return `/study/image-hotspot?exerciseId=${exercise.id}`
        case 'pdf_worksheet':
          return `/study/pdf-worksheet?exerciseId=${exercise.id}`
        case 'speaking_assessment':
          return `/study/speaking-assessment?exerciseId=${exercise.id}`
        case 'video_upload':
          return `/study/video-upload?exerciseId=${exercise.id}`
        default:
          return null
      }
    }

    const url = getExerciseUrl()
    if (url) {
      // Open in new tab
      window.open(url, '_blank')
    }
    setShowMenu(false)
  }

  const handleEdit = () => {
    if (onEdit) {
      onEdit(exercise)
    }
    setShowMenu(false)
  }

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete "${exercise.title}"? This action cannot be undone.`)) {
      try {
        // First check if exercise is assigned to any sessions
        const { data: assignRows, error: assignmentError } = await supabase
          .from('exercise_assignments')
          .select('id')
          .eq('exercise_id', exercise.id)

        if (assignmentError) throw assignmentError

        if (assignRows && assignRows.length > 0) {
          // Show where it's assigned and allow unassign
          await loadAssignments()
          setShowAssignments(true)
          setShowMenu(false)
          return
        }

        // Delete the exercise
        const { error } = await supabase
          .from('exercises')
          .delete()
          .eq('id', exercise.id)

        if (error) throw error

        // Refresh the list
        onUpdate()

        // Show success message
        alert('Exercise deleted successfully!')
      } catch (error) {
        console.error('Error deleting exercise:', error)
        alert('Failed to delete exercise: ' + error.message)
      }
    }
    setShowMenu(false)
  }
  const loadAssignments = async () => {
    try {
      setLoadingAssignments(true)
      const { data, error } = await supabase
        .from('exercise_assignments')
        .select(`id, session_id, sessions:session_id(id, title)`) // requires sessions FK
        .eq('exercise_id', exercise.id)
      if (error) throw error
      setAssignments(data || [])
    } catch (e) {
      console.error('Error loading assignments:', e)
      setAssignments([])
    } finally {
      setLoadingAssignments(false)
    }
  }

  const openAssignments = async () => {
    // Open modal immediately for better UX
    setShowAssignments(true)
    setShowMenu(false)
    // Then load data
    await loadAssignments()
  }

  const handleUnassign = async (assignmentId) => {
    try {
      const { error } = await supabase
        .from('exercise_assignments')
        .delete()
        .eq('id', assignmentId)
      if (error) throw error
      await loadAssignments()
      if (onUpdate) onUpdate()
    } catch (e) {
      console.error('Error unassigning:', e)
      alert('Failed to remove assignment: ' + (e.message || 'Unknown error'))
    }
  }

  const handleBulkUnassign = async () => {
    try {
      const ids = assignments.map(a => a.id)
      if (ids.length === 0) return
      const { error } = await supabase
        .from('exercise_assignments')
        .delete()
        .in('id', ids)
      if (error) throw error
      await loadAssignments()
      if (onUpdate) onUpdate()
    } catch (e) {
      console.error('Error bulk unassign:', e)
      alert('Failed to remove assignments: ' + (e.message || 'Unknown error'))
    }
  }


  const handleDuplicate = async () => {
    try {
      // Create duplicate with modified title
      const duplicate = {
        ...exercise,
        id: undefined, // Let Supabase generate new ID
        title: `${exercise.title} (Copy)`,
        created_at: undefined,
        updated_at: undefined
      }

      const { error } = await supabase
        .from('exercises')
        .insert(duplicate)

      if (error) throw error

      // Refresh the list
      onUpdate()

      alert('Exercise duplicated successfully!')
    } catch (error) {
      console.error('Error duplicating exercise:', error)
      alert('Failed to duplicate exercise: ' + error.message)
    }
    setShowMenu(false)
  }



  const TypeIcon = getTypeIcon(exercise.exercise_type)

  if (viewMode === 'list') {
    return (
      <div className="bg-white rounded-lg border hover:border-blue-200 transition-colors">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              {/* Type Icon */}
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                  <TypeIcon className="w-5 h-5 text-blue-600" />
                </div>
              </div>

              {/* Exercise Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {exercise.title}
                </h3>
                <div className="flex items-center space-x-4 mt-1">
                  <span className="text-xs text-gray-500">
                    {getTypeLabel(exercise.exercise_type)}
                  </span>
                  {exercise.exercise_folders && (
                    <div className="flex items-center space-x-1">
                      <FolderOpen className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {exercise.exercise_folders.name}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center space-x-1">
                    <Star className="w-3 h-3 text-orange-400" />
                    <span className="text-xs text-gray-500">
                      {exercise.xp_reward || 0} XP
                    </span>
                  </div>
                </div>
              </div>

              {/* Difficulty */}
              <div className="flex-shrink-0">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getDifficultyColor(exercise.difficulty_level)}`}>
                  Level {exercise.difficulty_level || 1}
                </span>
              </div>

              {/* Tags */}
              {exercise.tags && exercise.tags.length > 0 && (
                <div className="flex items-center space-x-1">
                  <Tag className="w-3 h-3 text-gray-400" />
                  <div className="flex space-x-1">
                    {exercise.tags.slice(0, 2).map((tag, index) => (
                      <span key={index} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                        {tag}
                      </span>
                    ))}
                    {exercise.tags.length > 2 && (
                      <span className="text-xs text-gray-500">+{exercise.tags.length - 2}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2 relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-10 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[160px]">
                  <button
                    onClick={handlePreview}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center space-x-2"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Preview</span>
                  </button>
                  {!readOnly && (
                    <button
                      onClick={openAssignments}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center space-x-2"
                    >
                      <FolderOpen className="w-3 h-3" />
                      <span>Assignments</span>
                    </button>
                  )}
                  {canEdit && (
                    <>
                      <button
                        onClick={handleEdit}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center space-x-2"
                      >
                        <Edit className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                      {!allowedTypes && (
                        <>
                          <button
                            onClick={handleDuplicate}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center space-x-2"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Duplicate</span>
                          </button>

                          <hr className="my-1" />
                          <button
                            onClick={handleDelete}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-red-600 flex items-center space-x-2"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Assignments Modal (list view) */}
        {showAssignments && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowAssignments(false)}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h4 className="font-medium text-gray-900">Assignments for "{exercise.title}"</h4>
                <button onClick={() => setShowAssignments(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="p-4">
                {loadingAssignments ? (
                  <div className="text-sm text-gray-500">Loading...</div>
                ) : assignments.length === 0 ? (
                  <div className="text-sm text-gray-600">This exercise is not assigned to any session.</div>
                ) : (
                  <>
                    <ul className="divide-y">
                      {assignments.map(a => (
                        <li key={a.id} className="py-2 flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-900">{a.sessions?.title || a.session_id}</div>
                            <div className="text-xs text-gray-500">Session ID: {a.session_id}</div>
                          </div>
                          <button
                            onClick={() => handleUnassign(a.id)}
                            className="px-3 py-1 text-sm bg-red-50 text-red-700 hover:bg-red-100 rounded"
                          >
                            Unassign
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm text-gray-600">Total: {assignments.length}</div>
                      <button onClick={handleBulkUnassign} className="px-3 py-1.5 text-sm bg-red-600 text-white hover:bg-red-700 rounded">
                        Remove all assignments
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 text-right">
                <button onClick={() => setShowAssignments(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Grid view
  return (
    <div className="bg-white rounded-lg border hover:border-blue-200 hover:shadow-md transition-all cursor-pointer group">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <TypeIcon className="w-4 h-4 text-blue-600" />
            </div>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getDifficultyColor(exercise.difficulty_level)}`}>
              Level {exercise.difficulty_level || 1}
            </span>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-6 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[140px]">
                <button
                  onClick={handlePreview}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center space-x-2"
                >
                  <Eye className="w-3 h-3" />
                  <span>Preview</span>
                </button>
                <button
                  onClick={openAssignments}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center space-x-2"
                >
                  <FolderOpen className="w-3 h-3" />
                  <span>Assignments</span>
                </button>
                {canEdit && (
                  <>
                    <button
                      onClick={handleEdit}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center space-x-2"
                    >
                      <Edit className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    {!allowedTypes && (
                      <>
                        <button
                          onClick={handleDuplicate}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center space-x-2"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Duplicate</span>
                        </button>

                        <hr className="my-1" />
                        <button
                          onClick={handleDelete}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-red-600 flex items-center space-x-2"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="font-medium text-gray-900 mb-2 line-clamp-2">
          {exercise.title}
        </h3>

        {/* Type */}
        <p className="text-sm text-gray-500 mb-3">
          {getTypeLabel(exercise.exercise_type)}
        </p>

        {/* Content Preview */}
        <div className="bg-gray-50 rounded-lg p-3 mb-3 min-h-[60px]">
          <p className="text-xs text-gray-600 line-clamp-3">
            {getContentPreview(exercise)}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-3">
            {exercise.exercise_folders && (
              <div className="flex items-center space-x-1">
                <FolderOpen className="w-3 h-3" />
                <span>{exercise.exercise_folders.name}</span>
              </div>
            )}
            <div className="flex items-center space-x-1">
              <Star className="w-3 h-3 text-orange-400" />
              <span>{exercise.xp_reward || 0} XP</span>
            </div>
          </div>

          {exercise.estimated_duration && (
            <div className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>{exercise.estimated_duration}m</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {exercise.tags && exercise.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {exercise.tags.slice(0, 3).map((tag, index) => (
              <span key={index} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded">
                {tag}
              </span>
            ))}
            {exercise.tags.length > 3 && (
              <span className="text-xs text-gray-500">+{exercise.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
      {/* Assignments Modal */}
      {showAssignments && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowAssignments(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Assignments for "{exercise.title}"</h4>
              <button onClick={() => setShowAssignments(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-4">
              {loadingAssignments ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : assignments.length === 0 ? (
                <div className="text-sm text-gray-600">This exercise is not assigned to any session.</div>
              ) : (
                <>
                  <ul className="divide-y">
                    {assignments.map(a => (
                      <li key={a.id} className="py-2 flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">{a.sessions?.title || a.session_id}</div>
                          <div className="text-xs text-gray-500">Session ID: {a.session_id}</div>
                        </div>
                        <button
                          onClick={() => handleUnassign(a.id)}
                          className="px-3 py-1 text-sm bg-red-50 text-red-700 hover:bg-red-100 rounded"
                        >
                          Unassign
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm text-gray-600">Total: {assignments.length}</div>
                    <button onClick={handleBulkUnassign} className="px-3 py-1.5 text-sm bg-red-600 text-white hover:bg-red-700 rounded">
                      Remove all assignments
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 text-right">
              <button onClick={() => setShowAssignments(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded">Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default ExerciseBankCard