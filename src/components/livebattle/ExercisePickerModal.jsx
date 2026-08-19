import { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
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
]

const supportedTypes = ['multiple_choice', 'fill_blank', 'dropdown', 'flashcard']

const getExerciseIcon = (type) => {
  const t = exerciseTypes.find(t => t.value === type)
  return t?.icon || BookOpen
}

const getExerciseTypeLabel = (type) => {
  const t = exerciseTypes.find(t => t.value === type)
  return t?.label || type
}

const ExercisePickerModal = ({ onSelect, onClose }) => {
  const [exercises, setExercises] = useState([])
  const [filteredExercises, setFilteredExercises] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [folders, setFolders] = useState([])
  const [folderCounts, setFolderCounts] = useState({})

  useEffect(() => {
    fetchFolders()
    fetchFolderCounts()
  }, [])

  useEffect(() => {
    if (selectedFolder) {
      fetchExercises()
    } else {
      setExercises([])
    }
  }, [selectedFolder])

  useEffect(() => {
    filterExercises()
  }, [exercises, searchTerm, selectedType])

  const fetchExercises = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('exercises')
        .select(`*, folder:exercise_folders(id, name, color)`)
        .eq('is_in_bank', true)
        .eq('is_active', true)

      if (selectedFolder) {
        query = query.eq('folder_id', selectedFolder.id)
      }

      query = query.order('created_at', { ascending: false })
      const { data, error } = await query
      if (error) throw error
      setExercises(data || [])
    } catch (err) {
      console.error('Error fetching exercises:', err)
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
      data?.forEach(ex => {
        totalCount++
        if (ex.folder_id) {
          counts[ex.folder_id] = (counts[ex.folder_id] || 0) + 1
        }
      })
      counts['all'] = totalCount
      setFolderCounts(counts)
    } catch (err) {
      console.error('Error fetching folder counts:', err)
    }
  }

  const filterExercises = () => {
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

    setFilteredExercises(filtered)
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
              folderCounts={folderCounts}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
              readOnly
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
