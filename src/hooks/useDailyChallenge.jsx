import { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from './useAuth'

export const useDailyChallenge = () => {
  const { profile } = useAuth()
  const [challenges, setChallenges] = useState([])
  const [todayChallenge, setTodayChallenge] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch challenges with filters (admin use)
  const fetchChallenges = async (filters = {}) => {
    try {
      setLoading(true)
      let query = supabase
        .from('daily_challenges')
        .select(`
          *,
          exercises (
            id,
            title,
            exercise_type,
            difficulty_level
          )
        `)

      if (filters.startDate) {
        query = query.gte('challenge_date', filters.startDate)
      }

      if (filters.endDate) {
        query = query.lte('challenge_date', filters.endDate)
      }

      if (filters.difficultyLevel) {
        query = query.eq('difficulty_level', filters.difficultyLevel)
      }

      query = query.order('challenge_date', { ascending: false })

      const { data, error } = await query

      if (error) throw error
      setChallenges(data || [])
      return data
    } catch (err) {
      setError(err.message)
      console.error('Error fetching challenges:', err)
      return []
    } finally {
      setLoading(false)
    }
  }

  // Fetch today's challenge for current user
  const fetchTodayChallenge = async () => {
    if (!profile?.id) return null

    try {
      setLoading(true)
      const { data, error } = await supabase.rpc('get_user_daily_challenge', {
        p_user_id: profile.id
      })

      if (error) throw error

      if (data?.success) {
        setTodayChallenge(data)
        return data
      } else {
        setTodayChallenge(null)
        return null
      }
    } catch (err) {
      setError(err.message)
      console.error('Error fetching today\'s challenge:', err)
      return null
    } finally {
      setLoading(false)
    }
  }

  // Create a new challenge
  const createChallenge = async (challengeData) => {
    try {
      const { data, error } = await supabase
        .from('daily_challenges')
        .insert([challengeData])
        .select(`
          *,
          exercises (
            id,
            title,
            exercise_type
          )
        `)
        .single()

      if (error) throw error

      // Refresh challenges list
      await fetchChallenges()
      return { success: true, data }
    } catch (err) {
      console.error('Error creating challenge:', err)
      return { success: false, error: err.message }
    }
  }

  // Batch create challenges for all 3 difficulty levels
  const batchCreateChallenges = async (date, exercisesByLevel, achievementsByLevel = {}) => {
    try {
      const challenges = [
        {
          challenge_date: date,
          difficulty_level: 'beginner',
          exercise_id: exercisesByLevel.beginner,
          base_xp_reward: 50,
          base_gem_reward: 5,
          ...achievementsByLevel.beginner
        },
        {
          challenge_date: date,
          difficulty_level: 'intermediate',
          exercise_id: exercisesByLevel.intermediate,
          base_xp_reward: 50,
          base_gem_reward: 5,
          ...achievementsByLevel.intermediate
        },
        {
          challenge_date: date,
          difficulty_level: 'advanced',
          exercise_id: exercisesByLevel.advanced,
          base_xp_reward: 50,
          base_gem_reward: 5,
          ...achievementsByLevel.advanced
        }
      ]

      const { data, error } = await supabase
        .from('daily_challenges')
        .insert(challenges)
        .select(`
          *,
          exercises (
            id,
            title,
            exercise_type
          )
        `)

      if (error) throw error

      await fetchChallenges()
      return { success: true, data }
    } catch (err) {
      console.error('Error batch creating challenges:', err)
      return { success: false, error: err.message }
    }
  }

  // Update a challenge
  const updateChallenge = async (challengeId, updates) => {
    try {
      const { data, error } = await supabase
        .from('daily_challenges')
        .update(updates)
        .eq('id', challengeId)
        .select(`
          *,
          exercises (
            id,
            title,
            exercise_type
          )
        `)
        .single()

      if (error) throw error

      await fetchChallenges()
      return { success: true, data }
    } catch (err) {
      console.error('Error updating challenge:', err)
      return { success: false, error: err.message }
    }
  }

  // Delete a challenge
  const deleteChallenge = async (challengeId) => {
    try {
      const { error } = await supabase
        .from('daily_challenges')
        .delete()
        .eq('id', challengeId)

      if (error) throw error

      await fetchChallenges()
      return { success: true }
    } catch (err) {
      console.error('Error deleting challenge:', err)
      return { success: false, error: err.message }
    }
  }

  // Record participation
  const recordParticipation = async (challengeId, score, timeSpent) => {
    if (!profile?.id) return { success: false, error: 'User not logged in' }

    try {
      const { data, error } = await supabase.rpc('record_challenge_participation', {
        p_challenge_id: challengeId,
        p_user_id: profile.id,
        p_score: score,
        p_time_spent: timeSpent
      })

      if (error) throw error

      // Create notification for challenge result
      if (data?.success && data?.is_passing && profile?.id) {
        try {
          const rankText = data.rank ? `Hạng ${data.rank}` : ''
          await supabase.from('notifications').insert([{
            user_id: profile.id,
            type: 'daily_challenge_result',
            title: 'Thử thách hàng ngày',
            message: `Bạn đạt ${score} điểm${rankText ? ` - ${rankText}` : ''}! +${data.xp_awarded || 0} XP`,
            icon: 'Trophy',
            data: { challenge_id: challengeId, score, rank: data.rank }
          }])
        } catch (e) {
          console.error('Error creating challenge notification:', e)
        }
      }

      return data
    } catch (err) {
      console.error('Error recording participation:', err)
      return { success: false, error: err.message }
    }
  }

  // Fetch leaderboard
  const fetchLeaderboard = async (challengeId, limit = 50) => {
    try {
      const { data, error } = await supabase.rpc('get_daily_challenge_leaderboard', {
        p_challenge_id: challengeId,
        p_limit: limit
      })

      if (error) throw error
      setLeaderboard(data || [])
      return data || []
    } catch (err) {
      console.error('Error fetching leaderboard:', err)
      setError(err.message)
      return []
    }
  }

  // Get participation stats for a challenge (admin use)
  const getChallengeStats = async (challengeId) => {
    try {
      const { data, error } = await supabase
        .from('daily_challenge_participations')
        .select('score, attempts, time_spent')
        .eq('challenge_id', challengeId)
        .gte('score', 75)

      if (error) throw error

      const stats = {
        totalParticipants: data.length,
        avgScore: data.length > 0
          ? Math.round(data.reduce((sum, p) => sum + p.score, 0) / data.length)
          : 0,
        avgTime: data.length > 0
          ? Math.round(data.reduce((sum, p) => sum + p.time_spent, 0) / data.length)
          : 0,
        completionRate: data.length
      }

      return stats
    } catch (err) {
      console.error('Error fetching challenge stats:', err)
      return {
        totalParticipants: 0,
        avgScore: 0,
        avgTime: 0,
        completionRate: 0
      }
    }
  }

  // Check if user can participate
  const canParticipate = () => {
    if (!todayChallenge) return false
    return todayChallenge.attempts_used < 3
  }

  // Award winners for a specific challenge (admin trigger)
  const awardWinners = async (challengeId) => {
    try {
      const { data, error } = await supabase.rpc('award_single_challenge_winners', {
        p_challenge_id: challengeId
      })

      if (error) throw error
      return data
    } catch (err) {
      console.error('Error awarding winners:', err)
      return { success: false, error: err.message }
    }
  }

  // Get achievement IDs for a difficulty level
  const getAchievementIds = async (difficultyLevel) => {
    try {
      const { data, error } = await supabase
        .from('achievements')
        .select('id, criteria_type')
        .in('criteria_type', [
          `daily_challenge_rank_1_${difficultyLevel}`,
          `daily_challenge_rank_2_${difficultyLevel}`,
          `daily_challenge_rank_3_${difficultyLevel}`
        ])

      if (error) throw error

      const top1Achievement = data.find(a => a.criteria_type.includes('rank_1'))
      const top2Achievement = data.find(a => a.criteria_type.includes('rank_2'))
      const top3Achievement = data.find(a => a.criteria_type.includes('rank_3'))

      return {
        top1_achievement_id: top1Achievement?.id || null,
        top2_achievement_id: top2Achievement?.id || null,
        top3_achievement_id: top3Achievement?.id || null
      }
    } catch (err) {
      console.error('Error fetching achievement IDs:', err)
      return {
        top1_achievement_id: null,
        top2_achievement_id: null,
        top3_achievement_id: null
      }
    }
  }

  // Get all attempts for a user's challenge participation
  const getUserAttempts = async (challengeId, userId) => {
    try {
      const { data, error } = await supabase.rpc('get_user_challenge_attempts', {
        p_challenge_id: challengeId,
        p_user_id: userId
      })

      if (error) throw error
      return data || []
    } catch (err) {
      console.error('Error fetching user attempts:', err)
      return []
    }
  }

  return {
    challenges,
    todayChallenge,
    leaderboard,
    loading,
    error,
    fetchChallenges,
    fetchTodayChallenge,
    createChallenge,
    batchCreateChallenges,
    updateChallenge,
    deleteChallenge,
    recordParticipation,
    fetchLeaderboard,
    getChallengeStats,
    canParticipate,
    getAchievementIds,
    awardWinners,
    getUserAttempts
  }
}
