import { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'

const chunk = (arr, size = 100) => {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Count rows in `table` whose `column` is in `ids` (batched to keep URLs short)
const countRefs = async (table, column, ids) => {
  let total = 0
  for (const part of chunk(ids)) {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .in(column, part)
    if (error) throw error
    total += count || 0
  }
  return total
}

// Collect the folder's whole subtree and everything that would be deleted with it.
// Sets `blockedReason` if any exercise is still referenced somewhere that must be cleaned up first.
export const planFolderDelete = async (folderId) => {
  const folderIds = [folderId]
  let frontier = [folderId]
  while (frontier.length) {
    const next = []
    for (const part of chunk(frontier)) {
      const { data, error } = await supabase
        .from('exercise_folders')
        .select('id')
        .in('parent_folder_id', part)
      if (error) throw error
      next.push(...(data || []).map((f) => f.id))
    }
    frontier = next.filter((id) => !folderIds.includes(id))
    folderIds.push(...frontier)
  }

  const exerciseIds = []
  for (const part of chunk(folderIds)) {
    const { data, error } = await supabase
      .from('exercises')
      .select('id')
      .in('folder_id', part)
    if (error) throw error
    exerciseIds.push(...(data || []).map((e) => e.id))
  }

  const plan = {
    folderIds,
    exerciseIds,
    subfolderCount: folderIds.length - 1,
    exerciseCount: exerciseIds.length,
    assignmentCount: 0,
    blockedReason: null,
  }

  if (exerciseIds.length) {
    // Same rule as deleteExercise, plus tables whose FK has no ON DELETE CASCADE
    // Assignments cascade on exercise delete, so just report the count for the confirm dialog
    plan.assignmentCount = await countRefs('exercise_assignments', 'exercise_id', exerciseIds)
    const daily = await countRefs('daily_challenges', 'exercise_id', exerciseIds)
    if (daily > 0) {
      plan.blockedReason = `${daily} exercise(s) in this folder are used by daily challenges and can't be deleted.`
      return plan
    }
    const tests = await countRefs('test_question_attempts', 'exercise_id', exerciseIds)
    if (tests > 0) {
      plan.blockedReason = `${tests} test attempt record(s) reference exercises in this folder, so it can't be deleted.`
      return plan
    }
  }
  return plan
}

// Delete exercises first (exercises.folder_id has no cascade), then the folder (subfolders cascade).
export const executeFolderDelete = async (plan) => {
  for (const part of chunk(plan.exerciseIds)) {
    const { error } = await supabase.from('exercises').delete().in('id', part)
    if (error) throw error
  }
  const { error } = await supabase
    .from('exercise_folders')
    .delete()
    .eq('id', plan.folderIds[0])
  if (error) throw error
}

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

  // Delete folder (recursively: subfolders + exercises)
  const deleteFolder = async (folderId) => {
    try {
      const plan = await planFolderDelete(folderId)
      if (plan.blockedReason) throw new Error(plan.blockedReason)
      await executeFolderDelete(plan)

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