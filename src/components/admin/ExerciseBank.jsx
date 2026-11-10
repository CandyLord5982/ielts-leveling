import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import { supabase } from '../../supabase/client'
import { useExerciseBankAccess } from '../../hooks/useExerciseBankAccess'
import { getExerciseBankFolderScope } from '../../utils/exerciseBankAccess'
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
  Video,
  Shield,
  Lock,
  CheckSquare
} from 'lucide-react'
import FolderTree from './ExerciseBank/FolderTree'
import ExerciseBankCard from './ExerciseBank/ExerciseBankCard'
import CreateExerciseModal from './ExerciseBank/CreateExerciseModal'
import CreateFolderModal from './ExerciseBank/CreateFolderModal'
import EditExerciseModal from './ExerciseBank/EditExerciseModal'
import ExerciseBankAccessModal from './ExerciseBank/ExerciseBankAccessModal'
import BulkRenameModal from './ExerciseBank/BulkRenameModal'

// The list never needs `content` (can be large); edit/duplicate fetch the full row on demand
const LIST_COLUMNS = 'id, title, exercise_type, difficulty_level, estimated_duration, xp_reward, tags, folder_id, created_at'

const ExerciseBank = ({ readOnly = false, allowedTypes = null }) => {
  const { access, loading: accessLoading, error: accessError, canAccess, isAdmin, userId, accessKey, refreshAccess } = useExerciseBankAccess()
  const [folders, setFolders] = useState([])
  const [exercises, setExercises] = useState([])
  const [folderCounts, setFolderCounts] = useState({})
  const [selectedFolder, _setSelectedFolder] = useState(null)
  const storageKey = `exerciseBank_selectedFolderId:${userId || ''}`
  const scope = useMemo(() => getExerciseBankFolderScope(folders, access), [folders, access])
  const [dataKey, setDataKey] = useState('')
  const dataReady = dataKey === accessKey && !accessLoading

  const setSelectedFolder = (folder) => {
    if (folder && scope.folderIds !== null && !scope.folderIds.includes(folder.id)) return
    _setSelectedFolder(folder)
    if (folder) {
      localStorage.setItem(storageKey, folder.id)
    } else {
      localStorage.removeItem(storageKey)
    }
  }
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('list') // 'grid' or 'list'
  const [filterType, setFilterType] = useState('all')
  const [showCreateExercise, setShowCreateExercise] = useState(false)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [showEditExercise, setShowEditExercise] = useState(false)
  const [showAccess, setShowAccess] = useState(false)
  const [editingExercise, setEditingExercise] = useState(null)
  const [foldersLoaded, setFoldersLoaded] = useState(false)
  const [folderRevision, setFolderRevision] = useState(0)
  const [exerciseRevision, setExerciseRevision] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [totalExercises, setTotalExercises] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const PAGE_SIZE = 20
  const fetchFolders = useCallback(() => setFolderRevision(value => value + 1), [])
  // fetchExercises({ silent: true }) refreshes the list in place, without clearing it or showing the spinner
  const silentRefreshRef = useRef(false)
  const fetchExercises = useCallback((opts) => {
    if (opts?.silent) silentRefreshRef.current = true
    setExerciseRevision(value => value + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setFolders([])
    setExercises([])
    setFolderCounts({})
    setFoldersLoaded(false)
    setDataKey('')
    _setSelectedFolder(null)
    setShowCreateExercise(false)
    setShowCreateFolder(false)
    setShowEditExercise(false)
    setEditingExercise(null)
    setLoadError('')
    if (accessLoading || !canAccess) return

    const loadFolders = async () => {
      try {
        const { data, error } = await supabase.from('exercise_folders').select('*').order('sort_order')
        if (error) throw error
        if (cancelled) return
        const nextScope = getExerciseBankFolderScope(data || [], access)
        const savedId = localStorage.getItem(storageKey)
        const selectable = nextScope.folders.filter(folder => nextScope.folderIds === null || nextScope.folderIds.includes(folder.id))
        const nextFolder = selectable.find(folder => folder.id === savedId) || selectable[0] || null
        setFolders(nextScope.folders)
        _setSelectedFolder(nextFolder)
        if (nextFolder) localStorage.setItem(storageKey, nextFolder.id)
        else localStorage.removeItem(storageKey)
        setDataKey(accessKey)
        setFoldersLoaded(true)
      } catch (error) {
        if (!cancelled) setLoadError(error.message || 'Could not load folders.')
      }
    }
    loadFolders()
    return () => { cancelled = true }
  }, [accessLoading, canAccess, accessKey, access, folderRevision, storageKey])

  useEffect(() => {
    setCurrentPage(0)
  }, [selectedFolder, searchTerm, filterType, accessKey])

  useEffect(() => {
    if (!foldersLoaded || !dataReady || !canAccess) return
    let cancelled = false
    const silent = silentRefreshRef.current
    silentRefreshRef.current = false
    if (!silent) setExercises([])
    if (!scope.canAccess) {
      setTotalExercises(0)
      setLoading(false)
      return
    }
    const loadExercises = async () => {
      if (!silent) setLoading(true)
      setLoadError('')
      try {
        let query = supabase.from('exercises').select(LIST_COLUMNS, { count: 'exact' }).eq('is_in_bank', true).eq('is_active', true)
        if (scope.folderIds !== null) query = query.in('folder_id', scope.folderIds)
        if (selectedFolder) query = query.eq('folder_id', selectedFolder.id)
        if (filterType !== 'all') query = query.eq('exercise_type', filterType)
        if (searchTerm) query = query.ilike('title', `%${searchTerm}%`)
        const { data, count, error } = await query.order('created_at', { ascending: false }).range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1)
        if (error) throw error
        if (!cancelled) {
          setExercises(data || [])
          setTotalExercises(count || 0)
        }
      } catch (error) {
        if (!cancelled) setLoadError(error.message || 'Could not load exercises.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadExercises()
    return () => { cancelled = true }
  }, [foldersLoaded, dataReady, canAccess, scope, selectedFolder, searchTerm, filterType, currentPage, exerciseRevision])

  useEffect(() => {
    if (!foldersLoaded || !dataReady || !scope.canAccess) return
    let cancelled = false
    // One request for all counts: read just the folder_id of every bank exercise and count
    // here (it used to be one request per folder, each logged by Supabase). Paged in 1000s,
    // the most Supabase returns at once.
    const loadCounts = async () => {
      try {
        const folderIdsOfExercises = []
        for (let from = 0; !cancelled; from += 1000) {
          let query = supabase.from('exercises').select('folder_id').eq('is_in_bank', true).eq('is_active', true)
          if (scope.folderIds !== null) query = query.in('folder_id', scope.folderIds)
          const { data, error } = await query.order('id').range(from, from + 999)
          if (error) throw error
          ;(data || []).forEach(row => folderIdsOfExercises.push(row.folder_id))
          if (!data || data.length < 1000) break
        }
        const counts = { all: folderIdsOfExercises.length }
        scope.folders
          .filter(folder => scope.folderIds === null || scope.folderIds.includes(folder.id))
          .forEach(folder => { counts[folder.id] = 0 })
        folderIdsOfExercises.forEach(id => { if (id in counts) counts[id] += 1 })
        if (!cancelled) setFolderCounts(counts)
      } catch (error) {
        if (!cancelled) setLoadError(error.message || 'Could not load exercise counts.')
      }
    }
    loadCounts()
    return () => { cancelled = true }
  }, [foldersLoaded, dataReady, scope, exerciseRevision])

  // --- Bulk actions (select mode) ---
  const [selectMode, setSelectMode] = useState(false)
  const [selectedMap, setSelectedMap] = useState(() => new Map()) // id -> exercise (kept across pages)
  const [showBulkRename, setShowBulkRename] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const cardReadOnly = (readOnly && !allowedTypes) || (!isAdmin && selectedFolder?.read_only === true)
  const canEditExercise = (ex) => (allowedTypes ? allowedTypes.includes(ex.exercise_type) : !cardReadOnly)
  const canBulk = !readOnly || !!allowedTypes

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedMap(new Map())
  }

  const toggleSelected = (exercise) => {
    setSelectedMap(prev => {
      const next = new Map(prev)
      if (next.has(exercise.id)) next.delete(exercise.id)
      else next.set(exercise.id, exercise)
      return next
    })
  }

  const selectAllOnPage = () => {
    setSelectedMap(prev => {
      const next = new Map(prev)
      exercises.filter(canEditExercise).forEach(ex => next.set(ex.id, ex))
      return next
    })
  }

  const folderLabel = (folder) => {
    const names = []
    const seen = new Set()
    let cur = folder
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      names.unshift(cur.name)
      cur = scope.folders.find(f => f.id === cur.parent_folder_id)
    }
    return names.join(' / ')
  }

  // Folders the current user may move exercises into
  const moveTargets = scope.folders
    .filter(f => (scope.folderIds === null || scope.folderIds.includes(f.id)) && (isAdmin || f.read_only !== true))
    .map(f => ({ id: f.id, label: folderLabel(f) }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const afterBulk = () => {
    exitSelectMode()
    fetchExercises()
  }

  const bulkDelete = async () => {
    const ids = [...selectedMap.keys()]
    if (ids.length === 0) return
    setBulkBusy(true)
    try {
      // Same rule as single delete: exercises assigned to a session can't be deleted until unassigned
      const { data: assigned, error: assignErr } = await supabase
        .from('exercise_assignments')
        .select('exercise_id')
        .in('exercise_id', ids)
      if (assignErr) throw assignErr
      const blocked = new Set((assigned || []).map(a => a.exercise_id))
      const deletable = ids.filter(id => !blocked.has(id))

      if (deletable.length === 0) {
        alert('None of the selected exercises can be deleted: all are assigned to sessions. Unassign them first.')
        return
      }
      const skippedNote = blocked.size > 0
        ? `\n\n${blocked.size} assigned to sessions will be skipped:\n- ${[...blocked].map(id => selectedMap.get(id)?.title).slice(0, 8).join('\n- ')}`
        : ''
      if (!window.confirm(`Delete ${deletable.length} exercise(s)? This cannot be undone.${skippedNote}`)) return

      const { error } = await supabase.from('exercises').delete().in('id', deletable)
      if (error) throw error
      afterBulk()
    } catch (err) {
      console.error('Bulk delete failed:', err)
      alert('Failed to delete: ' + (err.message || 'Unknown error'))
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkMove = async (folderId) => {
    const ids = [...selectedMap.keys()]
    if (!folderId || ids.length === 0) return
    const target = moveTargets.find(f => f.id === folderId)
    if (!window.confirm(`Move ${ids.length} exercise(s) to "${target?.label}"?`)) return
    setBulkBusy(true)
    try {
      const { error } = await supabase.from('exercises').update({ folder_id: folderId }).in('id', ids)
      if (error) throw error
      afterBulk()
    } catch (err) {
      console.error('Bulk move failed:', err)
      alert('Failed to move: ' + (err.message || 'Unknown error'))
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkRename = async (changes) => {
    try {
      const results = await Promise.all(
        changes.map(c => supabase.from('exercises').update({ title: c.to }).eq('id', c.id))
      )
      const failed = results.filter(r => r.error)
      if (failed.length > 0) throw new Error(`${failed.length} of ${changes.length} failed: ${failed[0].error.message}`)
      setShowBulkRename(false)
      afterBulk()
    } catch (err) {
      console.error('Bulk rename failed:', err)
      alert('Failed to rename: ' + (err.message || 'Unknown error'))
      fetchExercises()
    }
  }

  const handleCreateExercise = () => {
    setShowCreateExercise(true)
  }

  const handleCreateFolder = () => {
    setShowCreateFolder(true)
  }

  const handleEditExercise = async (exercise) => {
    const { data, error } = await supabase.from('exercises').select('*').eq('id', exercise.id).single()
    if (error) {
      alert('Could not load exercise: ' + error.message)
      return
    }
    setEditingExercise(data)
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
    { value: 'ielts_reading', label: 'IELTS Reading', icon: BookOpen },
    { value: 'listening_dictation', label: 'Listening Dictation', icon: BookOpen },
  ]

  const breadcrumbs = () => {
    if (!selectedFolder) return []

    const path = []
    let current = selectedFolder
    const visited = new Set()

    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      path.unshift(current)
      current = folders.find(f => f.id === current.parent_folder_id)
    }

    return path
  }

  if (accessLoading || (canAccess && !dataReady && !loadError)) {
    return <div className="p-12 text-center text-gray-500" role="status">Loading Exercise Bank...</div>
  }

  if (accessError || (!dataReady && loadError)) {
    return (
      <div className="p-12 text-center">
        <Lock className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">Could not load Exercise Bank</h2>
        <p className="text-sm text-red-600 mt-2" role="alert">{accessError || loadError}</p>
        <button onClick={() => { refreshAccess(); fetchFolders() }} className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white">Try again</button>
      </div>
    )
  }

  if (!canAccess || (dataReady && !scope.canAccess)) {
    return (
      <div className="p-12 text-center">
        <Lock className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">Exercise Bank access required</h2>
        <p className="text-sm text-gray-500 mt-2">Ask an administrator to grant access to the bank or specific folders.</p>
      </div>
    )
  }

  return (
    <div className="h-full bg-gray-50">
      <div className="flex h-full">
        {/* Sidebar - Folder Tree */}
        <div className="w-[28rem] bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Exercise Bank</h2>
              {isAdmin && (
                <button onClick={() => setShowAccess(true)} className="flex items-center gap-1 px-2 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg" title="Manage teacher access">
                  <Shield className="w-4 h-4" />
                  Access
                </button>
              )}
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
              folders={scope.folders}
              folderCounts={folderCounts}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
              onFolderUpdate={fetchFolders}
              readOnly={readOnly}
              isAdmin={isAdmin}
              selectableFolderIds={scope.folderIds}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 p-4">
            {access.mode === 'folders' && (
              <p className="mb-3 flex items-center gap-2 text-sm text-gray-500"><Lock className="w-4 h-4" />Only folders shared with you are available.</p>
            )}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <FolderOpen className="w-5 h-5 text-gray-500" />
                <nav className="flex items-center space-x-2 text-sm">
                  <span className="text-gray-500">Exercise Bank</span>
                  {breadcrumbs().map(folder => (
                    <React.Fragment key={folder.id}>
                      <span className="text-gray-400">/</span>
                      <button
                        onClick={() => setSelectedFolder(folder)}
                        disabled={scope.folderIds !== null && !scope.folderIds.includes(folder.id)}
                        className="text-blue-600 hover:text-blue-800 disabled:text-gray-500 disabled:cursor-default"
                      >
                        {folder.name}
                      </button>
                    </React.Fragment>
                  ))}
                </nav>
              </div>

              {(!readOnly || allowedTypes) && (
                <div className="flex items-center space-x-3">
                  {exercises.length > 0 && (
                    <button
                      onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                      className={`px-4 py-2 rounded-lg border transition-colors flex items-center space-x-2 ${selectMode ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      <CheckSquare className="w-4 h-4" />
                      <span>{selectMode ? 'Done' : 'Select'}</span>
                    </button>
                  )}
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
            {loadError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm" role="alert">
                {loadError}
                <button onClick={fetchExercises} className="ml-3 underline">Try again</button>
              </div>
            )}
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
                {(!readOnly || allowedTypes) && scope.canAccess && <button
                  onClick={handleCreateExercise}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Exercise
                </button>}
              </div>
            ) : (
              <>
                {selectMode && canBulk && (
                  <div className="sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm">
                    <span className="font-medium text-indigo-900">{selectedMap.size} selected</span>
                    <button onClick={selectAllOnPage} className="px-2 py-1 text-indigo-700 hover:underline">Select page</button>
                    <button onClick={() => setSelectedMap(new Map())} className="px-2 py-1 text-indigo-700 hover:underline">Clear</button>
                    <span className="flex-1" />
                    <select
                      value=""
                      onChange={(e) => bulkMove(e.target.value)}
                      disabled={selectedMap.size === 0 || bulkBusy}
                      className="px-2 py-1.5 border border-indigo-200 rounded-lg bg-white text-gray-700 disabled:opacity-40 max-w-[14rem]"
                    >
                      <option value="">Move to folder…</option>
                      {moveTargets.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    <button
                      onClick={() => setShowBulkRename(true)}
                      disabled={selectedMap.size === 0 || bulkBusy}
                      className="px-3 py-1.5 bg-white text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-40"
                    >
                      Rename…
                    </button>
                    <button
                      onClick={bulkDelete}
                      disabled={selectedMap.size === 0 || bulkBusy}
                      className="px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                )}
                <div className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4'
                    : 'space-y-2'
                }>
                  {exercises.map(exercise => (
                    <ExerciseBankCard
                      key={exercise.id}
                      exercise={exercise}
                      viewMode={viewMode}
                      onUpdate={fetchExercises}
                      onEdit={handleEditExercise}
                      readOnly={cardReadOnly}
                      allowedTypes={allowedTypes}
                      selectMode={selectMode && canBulk}
                      isSelected={selectedMap.has(exercise.id)}
                      onToggleSelect={toggleSelected}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {(() => {
                  const totalPages = Math.ceil(totalExercises / PAGE_SIZE)
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
      {showAccess && isAdmin && (
        <ExerciseBankAccessModal
          folders={scope.folders}
          onClose={() => setShowAccess(false)}
          onSaved={() => window.dispatchEvent(new Event('exercise-bank-access-updated'))}
        />
      )}
      {showCreateExercise && (
        <CreateExerciseModal
          folders={scope.folders.filter(folder => scope.folderIds === null || scope.folderIds.includes(folder.id))}
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
          isAdmin={isAdmin}
        />
      )}

      {showBulkRename && (
        <BulkRenameModal
          exercises={[...selectedMap.values()]}
          onClose={() => setShowBulkRename(false)}
          onApply={bulkRename}
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

ExerciseBank.propTypes = {
  readOnly: PropTypes.bool,
  allowedTypes: PropTypes.arrayOf(PropTypes.string),
}

export default ExerciseBank
