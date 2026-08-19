import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import {
  FolderOpen,
  Plus,
  Search,
  Grid,
  List,
  BookOpen,
  Edit3,
  Mic,
  HelpCircle,
  Copy,
  Brain,
  Video
} from 'lucide-react'
import FolderTree from './ExerciseBank/FolderTree'
import ExerciseBankCard from './ExerciseBank/ExerciseBankCard'
import CreateExerciseModal from './ExerciseBank/CreateExerciseModal'
import CreateFolderModal from './ExerciseBank/CreateFolderModal'
import EditExerciseModal from './ExerciseBank/EditExerciseModal'

const ExerciseBank = ({ readOnly = false, allowedTypes = null, isAdmin = false }) => {
  const [folders, setFolders] = useState([])
  const [exercises, setExercises] = useState([])
  const [folderCounts, setFolderCounts] = useState({})
  const [selectedFolder, _setSelectedFolder] = useState(null)
  const savedFolderIdRef = React.useRef(localStorage.getItem('exerciseBank_selectedFolderId'))

  const setSelectedFolder = (folder) => {
    _setSelectedFolder(folder)
    if (folder) {
      localStorage.setItem('exerciseBank_selectedFolderId', folder.id)
    } else {
      localStorage.removeItem('exerciseBank_selectedFolderId')
    }
  }
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('list') // 'grid' or 'list'
  const [filterType, setFilterType] = useState('all')
  const [showCreateExercise, setShowCreateExercise] = useState(false)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [showEditExercise, setShowEditExercise] = useState(false)
  const [editingExercise, setEditingExercise] = useState(null)
  const [selectedExercises, setSelectedExercises] = useState([])
  const [foldersLoaded, setFoldersLoaded] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const PAGE_SIZE = 20

  useEffect(() => {
    fetchFolders()
    fetchFolderCounts()
  }, [])

  useEffect(() => {
    if (!foldersLoaded) return
    setCurrentPage(0)
  }, [selectedFolder, searchTerm, filterType])

  useEffect(() => {
    if (!foldersLoaded) return
    fetchExercises()
    fetchFolderCounts()
  }, [selectedFolder, searchTerm, filterType, currentPage])

  const fetchFolders = async () => {
    try {
      const { data, error } = await supabase
        .from('exercise_folders')
        .select('*')
        .order('sort_order')

      if (error) throw error
      setFolders(data || [])
      // Restore saved folder or default to the first root folder
      if (data?.length > 0 && !selectedFolder) {
        const savedId = savedFolderIdRef.current
        const savedFolder = savedId ? data.find(f => f.id === savedId) : null
        if (savedFolder) {
          setSelectedFolder(savedFolder)
        } else {
          const rootFolders = data.filter(f => !f.parent_folder_id).sort((a, b) => a.sort_order - b.sort_order)
          if (rootFolders.length > 0) {
            setSelectedFolder(rootFolders[0])
          }
        }
      }
      setFoldersLoaded(true)
    } catch (error) {
      console.error('Error fetching folders:', error)
    }
  }

  const fetchFolderCounts = async () => {
    try {
      // Get total count
      const { count: totalCount, error: totalError } = await supabase
        .from('exercises')
        .select('*', { count: 'exact', head: true })
        .eq('is_in_bank', true)
        .eq('is_active', true)

      if (totalError) throw totalError

      const counts = {}
      if (totalCount) counts['all'] = totalCount

      // Batch folder count queries (5 at a time to avoid 503)
      for (let i = 0; i < folders.length; i += 5) {
        const batch = folders.slice(i, i + 5)
        const results = await Promise.all(
          batch.map(folder =>
            supabase
              .from('exercises')
              .select('*', { count: 'exact', head: true })
              .eq('is_in_bank', true)
              .eq('is_active', true)
              .eq('folder_id', folder.id)
              .then(({ count }) => ({ id: folder.id, count }))
          )
        )
        results.forEach(({ id, count }) => {
          if (count) counts[id] = count
        })
      }

      setFolderCounts(counts)
    } catch (error) {
      console.error('Error fetching folder counts:', error)
    }
  }

  const fetchExercises = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('exercises')
        .select('*')
        .eq('is_in_bank', true)

      // Filter by folder
      if (selectedFolder) {
        query = query.eq('folder_id', selectedFolder.id)
      }

      // Filter by type
      if (filterType !== 'all') {
        query = query.eq('exercise_type', filterType)
      }

      // Search
      if (searchTerm) {
        query = query.ilike('title', `%${searchTerm}%`)
      }

      query = query.order('created_at', { ascending: false })

      const from = currentPage * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      query = query.range(from, to)

      const { data, error } = await query

      if (error) throw error
      setExercises(data || [])
    } catch (error) {
      console.error('Error fetching exercises:', error)
    } finally {
      setLoading(false)
    }
  }

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
      default:
        return BookOpen
    }
  }

  const handleCreateExercise = () => {
    setShowCreateExercise(true)
  }

  const handleCreateFolder = () => {
    setShowCreateFolder(true)
  }

  const handleEditExercise = (exercise) => {
    setEditingExercise(exercise)
    setShowEditExercise(true)
  }

  const handleCloseEditExercise = () => {
    setShowEditExercise(false)
    setEditingExercise(null)
  }

  const handleExerciseCreated = () => {
    fetchExercises()
    setShowCreateExercise(false)
  }

  const handleFolderCreated = () => {
    fetchFolders()
    setShowCreateFolder(false)
  }

  const exerciseTypes = [
    { value: 'all', label: 'All Types', icon: Grid },
    { value: 'flashcard', label: 'Flashcard', icon: BookOpen },
    { value: 'pronunciation', label: 'Pronunciation', icon: Mic },
    { value: 'fill_blank', label: 'Fill in the Blank', icon: Edit3 },
    { value: 'multiple_choice', label: 'Multiple Choice', icon: HelpCircle },
    { value: 'dropdown', label: 'Dropdown', icon: HelpCircle },
    { value: 'drag_drop', label: 'Drag & Drop', icon: Copy },
    { value: 'ai_fill_blank', label: 'Fill in AI Score', icon: Brain },
    { value: 'video_upload', label: 'Video Upload', icon: Video },
  ]

  const breadcrumbs = () => {
    if (!selectedFolder) return []

    const path = []
    let current = selectedFolder

    while (current) {
      path.unshift(current)
      current = folders.find(f => f.id === current.parent_folder_id)
    }

    return path
  }

  return (
    <div className="h-full bg-gray-50">
      <div className="flex h-full">
        {/* Sidebar - Folder Tree */}
        <div className="w-[28rem] bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Exercise Bank</h2>
              {!readOnly && (
                <button
                  onClick={handleCreateFolder}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Create Folder"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <FolderTree
              folders={folders}
              folderCounts={folderCounts}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
              onFolderUpdate={fetchFolders}
              readOnly={readOnly}
              isAdmin={isAdmin}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <FolderOpen className="w-5 h-5 text-gray-500" />
                <nav className="flex items-center space-x-2 text-sm">
                  <span className="text-gray-500">Exercise Bank</span>
                  {breadcrumbs().map((folder, index) => (
                    <React.Fragment key={folder.id}>
                      <span className="text-gray-400">/</span>
                      <button
                        onClick={() => setSelectedFolder(folder)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {folder.name}
                      </button>
                    </React.Fragment>
                  ))}
                </nav>
              </div>

              {(!readOnly || allowedTypes) && (
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleCreateExercise}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>New Exercise</span>
                  </button>
                </div>
              )}
            </div>

            {/* Search and Filters */}
            <div className="flex items-center space-x-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 bottom-[5%] transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search exercises..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {exerciseTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>

              <div className="flex items-center border border-gray-300 rounded-lg">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400'}`}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-400'}`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Exercise Grid/List */}
          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-lg border p-4 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
                    <div className="h-20 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            ) : exercises.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No exercises found</h3>
                <p className="text-gray-500 mb-4">
                  {selectedFolder
                    ? `No exercises in "${selectedFolder.name}" folder`
                    : 'Start by creating your first exercise'
                  }
                </p>
                <button
                  onClick={handleCreateExercise}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Exercise
                </button>
              </div>
            ) : (
              <>
                <div className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                    : 'space-y-2'
                }>
                  {exercises.map(exercise => (
                    <ExerciseBankCard
                      key={exercise.id}
                      exercise={exercise}
                      viewMode={viewMode}
                      onUpdate={fetchExercises}
                      onEdit={handleEditExercise}
                      readOnly={(readOnly && !allowedTypes) || (!isAdmin && selectedFolder?.read_only === true)}
                      allowedTypes={allowedTypes}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {(() => {
                  const totalForFolder = selectedFolder
                    ? (folderCounts[selectedFolder.id] || 0)
                    : (folderCounts['all'] || 0)
                  const totalPages = Math.ceil(totalForFolder / PAGE_SIZE)
                  if (totalPages <= 1) return null
                  return (
                    <div className="flex items-center justify-center space-x-4 mt-6 pb-4">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-gray-600">
                        Page {currentPage + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={currentPage >= totalPages - 1}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCreateExercise && (
        <CreateExerciseModal
          folders={folders}
          selectedFolder={selectedFolder}
          onClose={() => setShowCreateExercise(false)}
          onCreated={handleExerciseCreated}
          allowedTypes={allowedTypes}
        />
      )}

      {showCreateFolder && (
        <CreateFolderModal
          parentFolder={selectedFolder}
          onClose={() => setShowCreateFolder(false)}
          onCreated={handleFolderCreated}
        />
      )}

      {showEditExercise && editingExercise && (
        <EditExerciseModal
          isOpen={showEditExercise}
          onClose={handleCloseEditExercise}
          exercise={editingExercise}
          onUpdate={fetchExercises}
        />
      )}
    </div>
  )
}

export default ExerciseBank