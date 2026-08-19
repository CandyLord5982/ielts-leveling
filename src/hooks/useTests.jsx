import { useCallback } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from './useAuth'

export const useTests = () => {
  const { user } = useAuth()

  const startTestAttempt = useCallback(async (sessionId, maxAttempts) => {
    // Check for existing in-progress attempt
    const { data: existing } = await supabase
      .from('test_attempts')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .single()

    if (existing) {
      // Check if a completed attempt already exists (race condition: stale in_progress)
      const { count: completedCount } = await supabase
        .from('test_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .in('status', ['completed', 'timed_out'])

      if (completedCount > 0) {
        // Abandon stale in_progress attempt
        await supabase
          .from('test_attempts')
          .update({ status: 'abandoned' })
          .eq('id', existing.id)
      } else {
        return existing
      }
    }

    // Check attempt limit (count only completed/timed_out attempts)
    if (maxAttempts && maxAttempts > 0) {
      const { count } = await supabase
        .from('test_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .in('status', ['completed', 'timed_out'])

      if (count >= maxAttempts) {
        // Fetch completed attempts for display
        const { data: completed } = await supabase
          .from('test_attempts')
          .select('*')
          .eq('session_id', sessionId)
          .eq('user_id', user.id)
          .in('status', ['completed', 'timed_out'])
        return { limitReached: true, completedAttempts: completed?.length || count }
      }
    }

    // Create new attempt
    const { data, error } = await supabase
      .from('test_attempts')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        status: 'in_progress'
      })
      .select()
      .single()

    if (error) throw error
    return data
  }, [user])

  const submitTestAttempt = useCallback(async (attemptId, { score, passed, time_used_seconds, status, questionAttempts }) => {
    // Update the attempt
    const { error: attemptError } = await supabase
      .from('test_attempts')
      .update({
        score,
        passed,
        time_used_seconds,
        status: status || 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', attemptId)

    if (attemptError) throw attemptError

    // Insert question attempts
    if (questionAttempts?.length > 0) {
      const rows = questionAttempts.map(qa => ({
        test_attempt_id: attemptId,
        exercise_id: qa.exercise_id,
        question_index: qa.question_index,
        exercise_type: qa.exercise_type,
        selected_answer: qa.selected_answer,
        correct_answer: qa.correct_answer,
        is_correct: qa.is_correct
      }))

      const { error: qaError } = await supabase
        .from('test_question_attempts')
        .insert(rows)

      if (qaError) throw qaError
    }
  }, [])

  const saveDraftAnswers = useCallback(async (attemptId, draftAnswers) => {
    const { error } = await supabase
      .from('test_attempts')
      .update({ draft_answers: draftAnswers })
      .eq('id', attemptId)

    if (error) console.error('Error saving draft answers:', error)
  }, [])

  const fetchTestAttempts = useCallback(async (sessionId) => {
    const { data, error } = await supabase
      .from('test_attempts')
      .select(`
        *,
        user:users!user_id (id, full_name, email),
        test_question_attempts (*)
      `)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }, [])

  const fetchMyAttempts = useCallback(async (sessionId) => {
    const { data, error } = await supabase
      .from('test_attempts')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }, [user])

  return {
    startTestAttempt,
    submitTestAttempt,
    saveDraftAnswers,
    fetchTestAttempts,
    fetchMyAttempts
  }
}
