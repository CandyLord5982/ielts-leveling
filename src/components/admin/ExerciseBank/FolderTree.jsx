import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../supabase/client'
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Edit,
  Trash2,
  Plus,
  BookOpen,
  Edit3,
  Mic,
  Headphones,
  HelpCircle,
  Lock
} from 'lucide-react'
import CreateFolderModal from './CreateFolderModal'
import EditFolderModal from './EditFolderModal'

const FolderTree = ({ folders, folderCounts = {}, selectedFolder, onSelectFolder, onFolderUpdate, readOnly = false, isAdmin = false }) => {
  const [expandedFolders, setExpandedFolders] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('exerciseBank_expandedFolders') || '[]')
      return new Set(saved)
    } catch { return new Set() }
  })
  const [contextMenu, setContextMenu] = useState(null)
  const [showCreateModalFor, setShowCreateModalFor] = useState(null)
  const [editFolder, setEditFolder] = useState(null)

  // Auto-expand path to selected folder on mount
  const hasAutoExpanded = useRef(false)
  useEffect(() => {
    if (hasAutoExpanded.current || !selectedFolder || folders.length === 0) return
    hasAutoExpanded.current = true
    const newExpanded = new Set(expandedFolders)
    let current = folders.find(f => f.id === selectedFolder.id)
    while (current?.parent_folder_id) {
      newExpanded.add(current.parent_folder_id)
      current = folders.find(f => f.id === current.parent_folder_id)
    }
    setExpandedFolders(newExpanded)
    localStorage.setItem('exerciseBank_expandedFolders', JSON.stringify([...newExpanded]))
  }, [selectedFolder, folders])

  const toggleFolder = (folderId) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId)
    } else {
      newExpanded.add(folderId)
    }
    setExpandedFolders(newExpanded)
    localStorage.setItem('exerciseBank_expandedFolders', JSON.stringify([...newExpanded]))
  }

  const getFolderIcon = (folder) => {
    switch (folder.icon) {
      case 'book-open':
        return BookOpen
      case 'edit-3':
        return Edit3
      case 'mic':
        return Mic
      case 'headphones':
        return Headphones
      case 'help-circle':
        return HelpCircle
      default:
        return Folder
    }
  }

  const getFolderColor = (color) => {
    switch (color) {
      case 'green':
        return 'text-green-600'
      case 'blue':
        return 'text-blue-600'
      case 'red':
        return 'text-red-600'
      case 'purple':
        return 'text-purple-600'
      case 'orange':
        return 'text-orange-600'
      default:
        return 'text-gray-600'
    }
  }

  const buildFolderTree = (parentId = null) => {
    return folders
      .filter(folder => folder.parent_folder_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(folder => ({
        ...folder,
        children: buildFolderTree(folder.id)
      }))
  }

  const renderFolder = (folder, level = 0) => {
    const Icon = getFolderIcon(folder)
    const hasChildren = folder.children && folder.children.length > 0
    const isExpanded = expandedFolders.has(folder.id)
    const isSelected = selectedFolder?.id === folder.id

    return (
      <div key={folder.id}>
        <div
          className={`
            flex items-center px-2 py-2 mx-2 rounded-lg cursor-pointer group
            ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}
          `}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={() => {
            if (hasChildren) toggleFolder(folder.id)
            onSelectFolder(folder)
          }}
        >
          {/* Expand/Collapse Button */}
          {hasChildren ? (
            <span className="p-1 mr-1">
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-gray-500" />
              ) : (
                <ChevronRight className="w-3 h-3 text-gray-500" />
              )}
            </span>
          ) : (
            <div className="w-5 mr-1"></div>
          )}

          {/* Folder Icon and Name */}
          <div
            className="flex items-center flex-1 min-w-0"
          >
            <Icon className={`w-4 h-4 mr-2 flex-shrink-0 ${getFolderColor(folder.color)}`} />
            <span className="text-sm font-medium truncate">{folder.name}</span>
            {folder.read_only && (
              <Lock className="w-3 h-3 ml-1 flex-shrink-0 text-gray-400" title="Read only" />
            )}
            {folderCounts[folder.id] && (
              <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {folderCounts[folder.id]}
              </span>
            )}
          </div>

          {/* Context Menu Button */}
          {!readOnly && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setContextMenu(contextMenu?.id === folder.id ? null : folder)
              }}
              className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded transition-opacity"
            >
              <MoreVertical className="w-3 h-3 text-gray-500" />
            </button>
          )}
        </div>

        {/* Context Menu */}
        {!readOnly && contextMenu?.id === folder.id && (
          <div className="absolute right-4 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
            <button
              onClick={() => {
                setEditFolder(folder)
                setContextMenu(null)
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center space-x-2"
            >
              <Edit className="w-3 h-3" />
              <span>Edit</span>
            </button>
            <button
              onClick={() => {
                setShowCreateModalFor(folder)
                setContextMenu(null)
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center space-x-2"
            >
              <Plus className="w-3 h-3" />
              <span>New Subfolder</span>
            </button>
            <button
              onClick={async () => {
                try {
                  // Prevent delete if folder has children or exercises
                  const { data: childCountData, error: childErr } = await supabase
                    .from('exercise_folders')
                    .select('id', { count: 'exact', head: true })
                    .eq('parent_folder_id', folder.id)
                  if (childErr) throw childErr

                  const { data: exCountData, error: exErr } = await supabase
                    .from('exercises')
                    .select('id', { count: 'exact', head: true })
                    .eq('folder_id', folder.id)
                  if (exErr) throw exErr

                  const hasChildren = (childCountData?.length === 0 ? 0 : (childCountData || []).length) === 0 ? false : true
                  // Supabase head+count requires extracting count differently; fall back to folderCounts prop
                  const approxExerciseCount = folderCounts[folder.id] || 0

                  if (hasChildren || approxExerciseCount > 0) {
                    alert('Folder is not empty. Please remove subfolders and exercises first.')
                    setContextMenu(null)
                    return
                  }

                  if (!window.confirm(`Delete folder "${folder.name}"? This cannot be undone.`)) {
                    setContextMenu(null)
                    return
                  }

                  const { error } = await supabase
                    .from('exercise_folders')
                    .delete()
                    .eq('id', folder.id)
                  if (error) throw error
                  onFolderUpdate && onFolderUpdate()
                } catch (e) {
                  console.error('Error deleting folder:', e)
                  alert('Failed to delete folder: ' + (e.message || 'Unknown error'))
                }
                setContextMenu(null)
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-red-600 flex items-center space-x-2"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          </div>
        )}

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {folder.children.map(child => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  const folderTree = buildFolderTree()

  // Close context menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  return (
    <div className="py-2 relative">
      {/* All Exercises Option */}
      <div
        className={`
          flex items-center px-2 py-2 mx-2 rounded-lg cursor-pointer
          ${!selectedFolder ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}
        `}
        onClick={() => onSelectFolder(null)}
      >
        <div className="w-5 mr-1"></div>
        <BookOpen className="w-4 h-4 mr-2 text-gray-500" />
        <span className="text-sm font-medium">All Exercises</span>
        {folderCounts['all'] && (
          <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {folderCounts['all']}
          </span>
        )}
      </div>

      {/* Separator */}
      <div className="border-t border-gray-200 my-2 mx-4"></div>

      {/* Folder Tree */}
      {folderTree.map(folder => renderFolder(folder))}

      {folderTree.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Folder className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p className="text-sm">No folders yet</p>
        </div>
      )}
      {showCreateModalFor && (
        <CreateFolderModal
          parentFolder={showCreateModalFor}
          onClose={() => setShowCreateModalFor(null)}
          onCreated={() => {
            setShowCreateModalFor(null)
            onFolderUpdate && onFolderUpdate()
          }}
          isAdmin={isAdmin}
        />
      )}
      {editFolder && (
        <EditFolderModal
          folder={editFolder}
          onClose={() => setEditFolder(null)}
          onUpdated={() => {
            setEditFolder(null)
            onFolderUpdate && onFolderUpdate()
          }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}

export default FolderTree