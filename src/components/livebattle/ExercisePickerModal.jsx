import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import { useExerciseBankAccess } from '../../hooks/useExerciseBankAccess'
import { getExerciseBankFolderScope } from '../../utils/exerciseBankAccess'
import { X, Search, BookOpen, HelpCircle, Edit3, Mic, Copy, Brain, Image, FileText, Eye } from 'lucide-react'
import FolderTree from '../admin/ExerciseBank/FolderTree'

const exerciseTypes = [
  { value: 'all', label: 'All Types' },
  { value: 'flashcard', label: 'Flashcard', icon: BookOpen },
  { value: 'multiple_choice', label: 'Multiple Choice', icon: HelpCircle },
  { value: 'fill_blank', label: 'Fill in the Blank', icon: Edit3 },
  { value: 'dropdown', label: 'Dropdown', icon: Copy },
  { value: 'drag_drop', label: 'Drag & Drop', icon: Copy },
  { value: 'ai_fill_blank', label: 'AI Fill Blank', icon: Brain },
  { value: 'pronunciation', label: 'Pronunciation', icon: Mic },
  { value: 'image_hotspot', label: 'Image Hotspot', icon: Image },
  { value: 'pdf_worksheet', label: 'PDF Worksheet', icon: FileText },
  { value: 'listening_dictation', label: 'Listening Dictation', icon: BookOpen },
]

const supportedTypes = ['multiple_choice', 'fill_blank', 'dropdown', 'flashcard', 'listening_dictation']

const getExerciseIcon = (type) => {
  const t = exerciseTypes.find(t => t.value === type)
  return t?.icon || BookOpen
}

const getExerciseTypeLabel = (type) => {
  const t = exerciseTypes.find(t => t.value === type)
  return t?.label || type
}

const ExercisePickerModal = ({ onSelect, onClose }) => {
  const { user } = useAuth()
  const { access, loading: accessLoading, error: accessError, canAccess } = useExerciseBankAccess()
  const accessKey = JSON.stringify([user?.id, accessLoading, access])
  const accessAllowed = !accessLoading && !accessError && canAccess
  const accessKeyRef = useRef(accessKey)
  accessKeyRef.current = accessKey
  const [folderResult, setFolderResult] = useState({ key: null, rows: [] })
  const scope = useMemo(() => getExerciseBankFolderScope(
    folderResult.key === accessKey ? folderResult.rows : [], access
  ), [folderResult, accessKey, access])
  const foldersLoaded = accessAllowed && folderResult.key === accessKey
  const folders = foldersLoaded ? scope.folders : []
  const folderIdsKey = JSON.stringify(scope.folderIds)
  const [exerciseResult, setExerciseResult] = useState({ key: null, rows: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [folderCounts, setFolderCounts] = useState({})
  const exerciseKey = JSON.stringify([accessKey, folderIdsKey, selectedFolder?.id])
  const exerciseKeyRef = useRef(exerciseKey)
  exerciseKeyRef.current = exerciseKey
  const exercises = useMemo(() => (
    accessAllowed && exerciseResult.key === exerciseKey ? exerciseResult.rows : []
  ), [accessAllowed, exerciseResult, exerciseKey])

  useEffect(() => {
    let cancelled = false
    setSelectedFolder(null)
    setFolderCounts({})
    setError('')
    if (!accessAllowed) return

    const loadFolders = async () => {
      const { data, error: folderError } = await supabase
        .from('exercise_folders').select('*').order('sort_order')
      if (cancelled || accessKeyRef.current !== accessKey) return
      if (folderError) throw folderError
      setFolderResult({ key: accessKey, rows: data || [] })
    }
    loadFolders().catch(() => {
      if (!cancelled && accessKeyRef.current === accessKey) setError('Failed to load Exercise Bank folders')
    })
    return () => { cancelled = true }
  }, [accessKey, accessAllowed])

  useEffect(() => {
    let cancelled = false
    const folderIds = JSON.parse(folderIdsKey)
    setFolderCounts({})
    if (!foldersLoaded || (folderIds && folderIds.length === 0)) return

    const loadCounts = async () => {
      let query = supabase.from('exercises').select('folder_id')
        .eq('is_in_bank', true).eq('is_active', true)
      if (folderIds) query = query.in('folder_id', folderIds)
      const { data, error: countError } = await query
      if (cancelled || accessKeyRef.current !== accessKey) return
      if (countError) throw countError
      const counts = { all: data?.length || 0 }
      data?.forEach(exercise => {
        if (exercise.folder_id) counts[exercise.folder_id] = (counts[exercise.folder_id] || 0) + 1
      })
      setFolderCounts(counts)
    }
    loadCounts().catch(() => {
      if (!cancelled && accessKeyRef.current === accessKey) setError('Failed to load Exercise Bank counts')
    })
    return () => { cancelled = true }
  }, [accessKey, foldersLoaded, folderIdsKey])

  useEffect(() => {
    let cancelled = false
    const folderIds = JSON.parse(folderIdsKey)
    const folderId = selectedFolder?.id
    if (!foldersLoaded || !folderId || (folderIds && !folderIds.includes(folderId))) {
      setLoading(false)
      return
    }

    setLoading(true)
    const loadExercises = async () => {
      let query = supabase.from('exercises').select('*, folder:exercise_folders(id, name, color)')
        .eq('is_in_bank', true).eq('is_active', true).eq('folder_id', folderId)
      if (folderIds) query = query.in('folder_id', folderIds)
      const { data, error: exerciseError } = await query.order('created_at', { ascending: false })
      if (cancelled || exerciseKeyRef.current !== exerciseKey) return
      if (exerciseError) throw exerciseError
      setExerciseResult({ key: exerciseKey, rows: data || [] })
    }
    loadExercises().catch(() => {
      if (!cancelled && exerciseKeyRef.current === exerciseKey) setError('Failed to load exercises from bank')
    }).finally(() => {
      if (!cancelled && exerciseKeyRef.current === exerciseKey) setLoading(false)
    })
    return () => { cancelled = true }
  }, [accessKey, exerciseKey, foldersLoaded, folderIdsKey, selectedFolder?.id])

  const filteredExercises = useMemo(() => {
    let filtered = exercises.filter(ex => {
      if (!supportedTypes.includes(ex.exercise_type)) return false
      const questions = ex.content?.questions
      return questions && questions.length > 0
    })

    if (searchTerm) {
      filtered = filtered.filter(ex =>
        ex.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ex.category?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter(ex => ex.exercise_type === selectedType)
    }

    return filtered
  }, [exercises, searchTerm, selectedType])

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
      listening_dictation: 'listening-dictation',
    }
    const route = typeToRoute[exercise.exercise_type]
    if (route) {
      window.open(`/study/${route}?exerciseId=${exercise.id}`, '_blank')
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl mx-4 h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Pick Exercise</h2>
              <p className="text-sm text-gray-500">Select a folder, then pick an exercise</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Folder sidebar */}
          <div className="w-64 border-r border-gray-200 overflow-y-auto flex-shrink-0 bg-white">
            <FolderTree
              folders={folders}
              folderCounts={foldersLoaded ? folderCounts : {}}
              selectedFolder={foldersLoaded ? selectedFolder : null}
              onSelectFolder={setSelectedFolder}
              readOnly
              selectableFolderIds={scope.folderIds}
            />
          </div>

          {/* Exercise list */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Search + filter */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              <div className="flex space-x-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search exercises..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
                <select
                  value={selectedType}
                  onChange={e => setSelectedType(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {exerciseTypes.filter(t => t.value === 'all' || supportedTypes.includes(t.value)).map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4">
              {error && (
                <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
              )}
              {accessLoading ? (
                <p className="text-center py-12 text-sm text-gray-500">Checking Exercise Bank access...</p>
              ) : accessError || !canAccess ? (
                <p className="text-center py-12 text-sm text-gray-600">{accessError ? 'Unable to check Exercise Bank access. Please try again.' : 'You do not have access to the Exercise Bank. Contact an administrator.'}</p>
              ) : !foldersLoaded && !error ? (
                <p className="text-center py-12 text-sm text-gray-500">Loading folders...</p>
              ) : !selectedFolder ? (
                <div className="text-center py-12">
                  <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-base font-medium text-gray-900 mb-1">Select a folder</h3>
                  <p className="text-sm text-gray-500">Choose a folder from the left to browse exercises</p>
                </div>
              ) : loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="animate-pulse flex items-center p-3 border border-gray-200 rounded-lg">
                      <div className="w-10 h-10 bg-gray-200 rounded-lg mr-3" />
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-1/3 mb-1" />
                        <div className="h-3 bg-gray-100 rounded w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredExercises.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-base font-medium text-gray-900 mb-1">No exercises found</h3>
                  <p className="text-sm text-gray-500">
                    {searchTerm || selectedType !== 'all' ? 'Try adjusting your search or filters' : 'No supported exercises in this folder'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredExercises.map(ex => {
                    const IconComponent = getExerciseIcon(ex.exercise_type)
                    const qCount = ex.content?.questions?.length || 0
                    return (
                      <button
                        key={ex.id}
                        onClick={() => onSelect(ex)}
                        className="w-full flex items-center p-3 border border-gray-200 rounded-lg hover:border-indigo-400 hover:bg-indigo-50/50 transition-all text-left group"
                      >
                        <div className="flex-shrink-0 w-10 h-10 mr-3">
                          <div className="w-full h-full rounded-lg bg-indigo-100 flex items-center justify-center">
                            <IconComponent className="w-5 h-5 text-indigo-600" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-700">
                            {ex.title}
                          </h4>
                          <div className="flex items-center space-x-3 mt-0.5 text-xs text-gray-500">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                              {getExerciseTypeLabel(ex.exercise_type)}
                            </span>
                            <span>{qCount} question{qCount !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div
                          onClick={(e) => handlePreview(e, ex)}
                          className="flex-shrink-0 p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Preview"
                        >
                          <Eye className="w-4 h-4" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ExercisePickerModal
