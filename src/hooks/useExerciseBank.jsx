import { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'

export const useExerciseBank = () => {
  const [folders, setFolders] = useState([])
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch all folders
  const fetchFolders = async () => {
    try {
      const { data, error } = await supabase
        .from('exercise_folders')
        .select('*')
        .order('sort_order')

      if (error) throw error
      setFolders(data || [])
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Fetch exercises with optional filters
  const fetchExercises = async (filters = {}) => {
    try {
      setLoading(true)
      let query = supabase
        .from('exercises')
        .select(`
          *,
          exercise_folders (
            id,
            name,
            color
          )
        `)
        .eq('is_in_bank', true)

      // Apply filters
      if (filters.folderId) {
        query = query.eq('folder_id', filters.folderId)
      }

      if (filters.exerciseType && filters.exerciseType !== 'all') {
        query = query.eq('exercise_type', filters.exerciseType)
      }

      if (filters.searchTerm) {
        query = query.ilike('title', `%${filters.searchTerm}%`)
      }

      if (filters.category) {
        query = query.eq('category', filters.category)
      }

      if (filters.difficultyLevel) {
        query = query.eq('difficulty_level', filters.difficultyLevel)
      }

      query = query.order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) throw error
      setExercises(data || [])
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Create a new folder
  const createFolder = async (folderData) => {
    try {
      const { data, error } = await supabase
        .from('exercise_folders')
        .insert({
          name: folderData.name.trim(),
          description: folderData.description?.trim() || null,
          color: folderData.color || 'blue',
          icon: folderData.icon || 'folder',
          parent_folder_id: folderData.parentFolderId || null,
          sort_order: folderData.sortOrder || 0
        })
        .select()
        .single()

      if (error) throw error

      // Refresh folders
      await fetchFolders()
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Update folder
  const updateFolder = async (folderId, updates) => {
    try {
      const { data, error } = await supabase
        .from('exercise_folders')
        .update(updates)
        .eq('id', folderId)
        .select()
        .single()

      if (error) throw error

      // Refresh folders
      await fetchFolders()
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Delete folder
  const deleteFolder = async (folderId) => {
    try {
      // Check if folder has children
      const { data: children } = await supabase
        .from('exercise_folders')
        .select('id')
        .eq('parent_folder_id', folderId)

      if (children && children.length > 0) {
        throw new Error('Cannot delete folder with subfolders')
      }

      // Check if folder has exercises
      const { data: exercises } = await supabase
        .from('exercises')
        .select('id')
        .eq('folder_id', folderId)

      if (exercises && exercises.length > 0) {
        throw new Error('Cannot delete folder with exercises')
      }

      const { error } = await supabase
        .from('exercise_folders')
        .delete()
        .eq('id', folderId)

      if (error) throw error

      // Refresh folders
      await fetchFolders()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Create exercise in bank
  const createExercise = async (exerciseData) => {
    try {
      const { data, error } = await supabase
        .from('exercises')
        .insert({
          title: exerciseData.title.trim(),
          exercise_type: exerciseData.exerciseType,
          content: exerciseData.content,
          folder_id: exerciseData.folderId || null,
          difficulty_level: exerciseData.difficultyLevel || 1,
          xp_reward: exerciseData.xpReward || 10,
          category: exerciseData.category?.trim() || null,
          tags: exerciseData.tags || null,
          estimated_duration: exerciseData.estimatedDuration || 5,
          is_in_bank: true,
          is_active: true,
          session_id: null, // Not assigned to session yet
          order_index: 0
        })
        .select()
        .single()

      if (error) throw error
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Update exercise
  const updateExercise = async (exerciseId, updates) => {
    try {
      const { data, error } = await supabase
        .from('exercises')
        .update(updates)
        .eq('id', exerciseId)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Delete exercise
  const deleteExercise = async (exerciseId) => {
    try {
      // Check if exercise is assigned to any sessions
      const { data: assignments } = await supabase
        .from('exercise_assignments')
        .select('id')
        .eq('exercise_id', exerciseId)

      if (assignments && assignments.length > 0) {
        throw new Error('Cannot delete exercise that is assigned to sessions. Remove assignments first.')
      }

      const { error } = await supabase
        .from('exercises')
        .delete()
        .eq('id', exerciseId)

      if (error) throw error
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Duplicate exercise
  const duplicateExercise = async (exerciseId) => {
    try {
      // Get original exercise
      const { data: original, error: fetchError } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exerciseId)
        .single()

      if (fetchError) throw fetchError

      // Create duplicate
      const duplicate = {
        ...original,
        id: undefined, // Let Supabase generate new ID
        title: `${original.title} (Copy)`,
        created_at: undefined,
        updated_at: undefined
      }

      const { data, error } = await supabase
        .from('exercises')
        .insert(duplicate)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Move exercise to different folder
  const moveExercise = async (exerciseId, newFolderId) => {
    try {
      const { data, error } = await supabase
        .from('exercises')
        .update({ folder_id: newFolderId })
        .eq('id', exerciseId)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Assign exercise to session
  const assignToSession = async (exerciseId, sessionId, orderIndex) => {
    try {
      const { data, error } = await supabase
        .from('exercise_assignments')
        .insert({
          exercise_id: exerciseId,
          session_id: sessionId,
          order_index: orderIndex
        })
        .select()
        .single()

      if (error) throw error
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Remove assignment from session
  const removeFromSession = async (assignmentId) => {
    try {
      const { error } = await supabase
        .from('exercise_assignments')
        .delete()
        .eq('id', assignmentId)

      if (error) throw error
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Get exercises assigned to a session
  const getSessionExercises = async (sessionId) => {
    try {
      const { data, error } = await supabase
        .from('exercise_assignments')
        .select(`
          *,
          exercises (*)
        `)
        .eq('session_id', sessionId)
        .order('order_index')

      if (error) throw error
      return data || []
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Build folder tree structure
  const buildFolderTree = (parentId = null) => {
    return folders
      .filter(folder => folder.parent_folder_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(folder => ({
        ...folder,
        children: buildFolderTree(folder.id)
      }))
  }

  // Clear error
  const clearError = () => setError(null)

  return {
    // State
    folders,
    exercises,
    loading,
    error,

    // Folder operations
    fetchFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    buildFolderTree,

    // Exercise operations
    fetchExercises,
    createExercise,
    updateExercise,
    deleteExercise,
    duplicateExercise,
    moveExercise,

    // Assignment operations
    assignToSession,
    removeFromSession,
    getSessionExercises,

    // Utilities
    clearError
  }
}

export default useExerciseBank