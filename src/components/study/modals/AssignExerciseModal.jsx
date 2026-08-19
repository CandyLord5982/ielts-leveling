import React, { useState, useEffect } from 'react'
import { supabase } from '../../../supabase/client'
import { X, Search, BookOpen, Mic, Edit3, HelpCircle, Plus, Check, Copy, Brain, Image, FileText, Eye } from 'lucide-react'
import FolderTree from '../../admin/ExerciseBank/FolderTree'

const AssignExerciseModal = ({ sessionId, courseId, onClose, onAssigned }) => {
  const [exercises, setExercises] = useState([])
  const [filteredExercises, setFilteredExercises] = useState([])
  const [assignedExercises, setAssignedExercises] = useState([])
  const [courseAssignedMap, setCourseAssignedMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [folders, setFolders] = useState([])
  const [folderCounts, setFolderCounts] = useState({})
  const [selectedExercises, setSelectedExercises] = useState(new Set())
  const [previewUrl, setPreviewUrl] = useState(null)

  const exerciseTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'flashcard', label: 'Flashcard', icon: BookOpen },
    { value: 'multiple_choice', label: 'Multiple Choice', icon: HelpCircle },
    { value: 'pronunciation', label: 'Pronunciation', icon: Mic },
    { value: 'fill_blank', label: 'Fill in the Blank', icon: Edit3 },
    { value: 'drag_drop', label: 'Drag & Drop', icon: Copy },
    { value: 'ai_fill_blank', label: 'Fill in AI Score', icon: Brain },
    { value: 'image_hotspot', label: 'Image Hotspot', icon: Image },
    { value: 'pdf_worksheet', label: 'PDF Worksheet', icon: FileText }
  ]

  useEffect(() => {
    fetchFolders()
    fetchFolderCounts()
    fetchAssignedExercises()
    if (courseId) fetchCourseAssignedExercises()
  }, [sessionId, courseId])

  useEffect(() => {
    if (selectedFolder) {
      fetchExercises()
    } else {
      setExercises([])
    }
  }, [selectedFolder])

  useEffect(() => {
    filterExercises()
  }, [exercises, searchTerm, selectedType, assignedExercises])

  const fetchExercises = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('exercises')
        .select(`
          *,
          folder:exercise_folders(id, name, color)
        `)
        .eq('is_in_bank', true)
        .eq('is_active', true)

      if (selectedFolder) {
        query = query.eq('folder_id', selectedFolder.id)
      }

      query = query.order('created_at', { ascending: true })

      const { data, error } = await query

      if (error) throw error
      setExercises(data || [])
    } catch (err) {
      console.error('Error fetching exercises:', err)
      setError('Failed to load exercises from bank')
    } finally {
      setLoading(false)
    }
  }

  const fetchFolders = async () => {
    try {
      const { data, error } = await supabase
        .from('exercise_folders')
        .select('*')
        .order('sort_order')

      if (error) throw error
      setFolders(data || [])
    } catch (err) {
      console.error('Error fetching folders:', err)
    }
  }

  const fetchFolderCounts = async () => {
    try {
      const { data, error } = await supabase
        .from('exercises')
        .select('folder_id')
        .eq('is_in_bank', true)
        .eq('is_active', true)

      if (error) throw error

      const counts = {}
      let totalCount = 0
      data?.forEach(exercise => {
        totalCount++
        if (exercise.folder_id) {
          counts[exercise.folder_id] = (counts[exercise.folder_id] || 0) + 1
        }
      })
      counts['all'] = totalCount
      setFolderCounts(counts)
    } catch (err) {
      console.error('Error fetching folder counts:', err)
    }
  }

  const fetchAssignedExercises = async () => {
    try {
      const { data, error } = await supabase
        .from('exercise_assignments')
        .select('exercise_id')
        .eq('session_id', sessionId)

      if (error) throw error
      setAssignedExercises(data?.map(a => a.exercise_id) || [])
    } catch (err) {
      console.error('Error fetching assigned exercises:', err)
    }
  }

  const fetchCourseAssignedExercises = async () => {
    try {
      // Get all units in this course
      const { data: units, error: unitsError } = await supabase
        .from('units')
        .select('id')
        .eq('course_id', courseId)

      if (unitsError) throw unitsError

      // Get all sessions in those units
      const unitIds = units?.map(u => u.id) || []
      if (unitIds.length === 0) return

      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, title, unit_id')
        .in('unit_id', unitIds)

      if (sessionsError) throw sessionsError

      const sessionIds = sessions?.map(s => s.id).filter(id => id !== sessionId) || []
      if (sessionIds.length === 0) return

      // Get all assignments in other sessions of this course
      const { data: assignments, error: assignError } = await supabase
        .from('exercise_assignments')
        .select('exercise_id, session_id')
        .in('session_id', sessionIds)

      if (assignError) throw assignError

      // Build a map: exerciseId -> session title
      const sessionMap = {}
      sessions.forEach(s => { sessionMap[s.id] = s.title })

      const map = {}
      assignments?.forEach(a => {
        if (!map[a.exercise_id]) map[a.exercise_id] = []
        const sessionTitle = sessionMap[a.session_id]
        if (sessionTitle && !map[a.exercise_id].includes(sessionTitle)) {
          map[a.exercise_id].push(sessionTitle)
        }
      })
      setCourseAssignedMap(map)
    } catch (err) {
      console.error('Error fetching course assigned exercises:', err)
    }
  }

  const filterExercises = () => {
    let filtered = [...exercises]

    if (searchTerm) {
      filtered = filtered.filter(exercise =>
        exercise.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exercise.category?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter(exercise => exercise.exercise_type === selectedType)
    }

    // Sort: unassigned first, then assigned
    filtered.sort((a, b) => {
      const aAssigned = assignedExercises.includes(a.id)
      const bAssigned = assignedExercises.includes(b.id)
      if (aAssigned === bAssigned) return 0
      return aAssigned ? 1 : -1
    })

    setFilteredExercises(filtered)
  }

  const toggleExerciseSelection = (exerciseId) => {
    const newSelected = new Set(selectedExercises)
    if (newSelected.has(exerciseId)) {
      newSelected.delete(exerciseId)
    } else {
      newSelected.add(exerciseId)
    }
    setSelectedExercises(newSelected)
  }

  const handleAssignExercises = async () => {
    if (selectedExercises.size === 0) {
      alert('Please select at least one exercise to assign')
      return
    }

    setAssigning(true)
    setError('')

    try {
      const { data: existingAssignments, error: countError } = await supabase
        .from('exercise_assignments')
        .select('order_index')
        .eq('session_id', sessionId)
        .order('order_index', { ascending: false })
        .limit(1)

      if (countError) throw countError

      let nextOrderIndex = existingAssignments.length > 0 ? existingAssignments[0].order_index + 1 : 1

      const assignmentsToCreate = Array.from(selectedExercises).map(exerciseId => ({
        exercise_id: exerciseId,
        session_id: sessionId,
        order_index: nextOrderIndex++
      }))

      const { data, error } = await supabase
        .from('exercise_assignments')
        .insert(assignmentsToCreate)
        .select(`
          *,
          exercises (*)
        `)

      if (error) throw error

      onAssigned(data)
    } catch (err) {
      console.error('Error assigning exercises:', err)
      setError(err.message || 'Failed to assign exercises')
    } finally {
      setAssigning(false)
    }
  }

  const getExerciseIcon = (type) => {
    const typeObj = exerciseTypes.find(t => t.value === type)
    return typeObj?.icon || BookOpen
  }

  const getExerciseTypeLabel = (type) => {
    const typeObj = exerciseTypes.find(t => t.value === type)
    return typeObj?.label || type
  }

  const handlePreview = (e, exercise) => {
    e.stopPropagation()
    const typeToRoute = {
      flashcard: 'flashcard',
      pronunciation: 'pronunciation',
      fill_blank: 'fill-blank',
      multiple_choice: 'multiple-choice',
      dropdown: 'dropdown',
      drag_drop: 'drag-drop',
      ai_fill_blank: 'ai-fill-blank',
      image_hotspot: 'image-hotspot',
      pdf_worksheet: 'pdf-worksheet',
      speaking_assessment: 'speaking-assessment'
    }
    const route = typeToRoute[exercise.exercise_type]
    if (route) {
      setPreviewUrl(`/study/${route}?exerciseId=${exercise.id}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl mx-4 h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Plus className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Assign Exercises from Bank
              </h2>
              <p className="text-sm text-gray-600">
                Select a folder, then pick exercises to assign
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: Folder Tree + Exercise List */}
        <div className="flex flex-1 min-h-0">
          {/* Folder Sidebar */}
          <div className="w-72 border-r border-gray-200 overflow-y-auto flex-shrink-0 bg-white">
            <FolderTree
              folders={folders}
              folderCounts={folderCounts}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
              readOnly
            />
          </div>

          {/* Right Panel: Search + Exercises */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Search and Filters */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              <div className="flex space-x-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search exercises..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  {exerciseTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Exercise List */}
            <div className="flex-1 overflow-y-auto p-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                  {error}
                </div>
              )}

              {!selectedFolder ? (
                <div className="text-center py-12">
                  <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-base font-medium text-gray-900 mb-1">Select a folder</h3>
                  <p className="text-sm text-gray-500">Choose a folder from the left to browse exercises</p>
                </div>
              ) : loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="animate-pulse flex items-center p-3 border border-gray-200 rounded-lg">
                      <div className="w-10 h-10 bg-gray-200 rounded-lg mr-3"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-1/3 mb-1"></div>
                        <div className="h-3 bg-gray-100 rounded w-1/4"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredExercises.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-base font-medium text-gray-900 mb-1">No exercises found</h3>
                  <p className="text-sm text-gray-500">
                    {searchTerm || selectedType !== 'all'
                      ? 'Try adjusting your search or filters'
                      : 'No exercises in this folder'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredExercises.map((exercise) => {
                    const IconComponent = getExerciseIcon(exercise.exercise_type)
                    const isSelected = selectedExercises.has(exercise.id)
                    const isAlreadyAssigned = assignedExercises.includes(exercise.id)
                    const otherSessions = courseAssignedMap[exercise.id] || []

                    return (
                      <div
                        key={exercise.id}
                        onClick={() => !isAlreadyAssigned && toggleExerciseSelection(exercise.id)}
                        className={`flex items-center p-3 border rounded-lg transition-all duration-150 ${
                          isAlreadyAssigned
                            ? 'border-gray-200 bg-gray-50 opacity-60 cursor-default'
                            : isSelected
                              ? 'border-green-500 bg-green-50 cursor-pointer'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border-2 mr-3 flex items-center justify-center flex-shrink-0 ${
                          isAlreadyAssigned
                            ? 'bg-blue-500 border-blue-500'
                            : isSelected
                              ? 'bg-green-500 border-green-500'
                              : 'border-gray-300'
                        }`}>
                          {(isAlreadyAssigned || isSelected) && <Check className="w-3 h-3 text-white" />}
                        </div>

                        <div className="flex-shrink-0 w-10 h-10 mr-3">
                          <div className={`w-full h-full rounded-lg flex items-center justify-center ${
                            isAlreadyAssigned ? 'bg-gray-100' : 'bg-blue-100'
                          }`}>
                            <IconComponent className={`w-5 h-5 ${isAlreadyAssigned ? 'text-gray-400' : 'text-blue-600'}`} />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h4 className={`text-sm font-medium truncate ${isAlreadyAssigned ? 'text-gray-500' : 'text-gray-900'}`}>
                              {exercise.title}
                            </h4>
                            {isAlreadyAssigned && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex-shrink-0">
                                Assigned
                              </span>
                            )}
                            {otherSessions.length > 0 && !isAlreadyAssigned && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium flex-shrink-0" title={`Also in: ${otherSessions.join(', ')}`}>
                                In {otherSessions.length} other session{otherSessions.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-3 mt-0.5 text-xs text-gray-500">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                              {getExerciseTypeLabel(exercise.exercise_type)}
                            </span>
                            <span>{exercise.xp_reward} XP</span>
                            <span>{exercise.estimated_duration} min</span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => handlePreview(e, exercise)}
                          className="flex-shrink-0 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Preview exercise"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="text-sm text-gray-600">
            {selectedExercises.size} exercise{selectedExercises.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleAssignExercises}
              disabled={assigning || selectedExercises.size === 0}
              className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300 rounded-lg transition-colors flex items-center space-x-2 text-sm"
            >
              {assigning ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>
                {assigning
                  ? 'Assigning...'
                  : `Assign ${selectedExercises.size} Exercise${selectedExercises.size !== 1 ? 's' : ''}`
                }
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]">
          <div className="relative w-full max-w-5xl h-[90vh] mx-4 bg-white rounded-lg overflow-hidden shadow-2xl">
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute top-3 right-3 z-10 bg-white shadow-md border border-gray-200 rounded-full p-2 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title="Exercise Preview"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default AssignExerciseModal
