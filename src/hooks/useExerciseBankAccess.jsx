import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from './useAuth'
import { normalizeExerciseBankAccess, NO_EXERCISE_BANK_ACCESS } from '../utils/exerciseBankAccess'

export const useExerciseBankAccess = () => {
  const { user, profile, loading: authLoading } = useAuth()
  const profileMatches = !!user && profile?.id === user.id
  const identity = `${user?.id || ''}:${profileMatches ? profile.role : ''}`
  const isAdmin = profileMatches && profile.role === 'admin'
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({ identity: '', access: NO_EXERCISE_BANK_ACCESS, loading: true, error: null })
  const refreshAccess = useCallback(() => setRevision(value => value + 1), [])

  useEffect(() => {
    window.addEventListener('focus', refreshAccess)
    window.addEventListener('exercise-bank-access-updated', refreshAccess)
    return () => {
      window.removeEventListener('focus', refreshAccess)
      window.removeEventListener('exercise-bank-access-updated', refreshAccess)
    }
  }, [refreshAccess])

  useEffect(() => {
    let cancelled = false
    if (authLoading || (user && !profileMatches)) return
    if (isAdmin || !user || profile?.role !== 'teacher') {
      setState(previous => {
        const access = isAdmin ? { mode: 'full', folder_ids: [] } : NO_EXERCISE_BANK_ACCESS
        if (previous.identity === identity && previous.access.mode === access.mode && !previous.loading && !previous.error) return previous
        return { identity, access, loading: false, error: null }
      })
      return
    }
    setState({ identity, access: NO_EXERCISE_BANK_ACCESS, loading: true, error: null })
    const load = async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_exercise_bank_access')
        if (error) throw error
        if (!cancelled) setState({ identity, access: normalizeExerciseBankAccess(data), loading: false, error: null })
      } catch (error) {
        if (!cancelled) setState({ identity, access: NO_EXERCISE_BANK_ACCESS, loading: false, error: error.message || 'Could not check Exercise Bank access.' })
      }
    }
    load()
    return () => { cancelled = true }
  }, [identity, authLoading, isAdmin, user, profile, profileMatches, revision])

  const current = state.identity === identity && !authLoading && (!user || profileMatches)
  const loading = !current || state.loading
  const access = !loading ? state.access : NO_EXERCISE_BANK_ACCESS
  return {
    access,
    loading,
    error: current ? state.error : null,
    canAccess: !loading && access.mode !== 'none',
    isAdmin,
    userId: user?.id,
    accessKey: `${identity}:${access.mode}:${access.folder_ids.slice().sort().join(',')}`,
    refreshAccess,
  }
}

export default useExerciseBankAccess
