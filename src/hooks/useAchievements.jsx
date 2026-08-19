import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from './useAuth'

export const useAchievements = () => {
  const { user, fetchUserProfile } = useAuth()
  const [achievements, setAchievements] = useState([])
  const [userAchievements, setUserAchievements] = useState([])
  const [challengeWinCounts, setChallengeWinCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch all available achievements
  const fetchAchievements = async () => {
    try {
      const { data, error } = await supabase
        .from('achievements')
        .select('*')
        .eq('is_active', true)
        .order('criteria_value', { ascending: true })

      if (error) throw error
      setAchievements(data || [])
    } catch (err) {
      console.error('Error fetching achievements:', err)
      setError(err.message)
      // Set empty array as fallback
      setAchievements([])
    }
  }

  // Fetch user's earned achievements
  const fetchUserAchievements = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('user_achievements')
        .select(`
          *,
          achievements (
            id,
            title,
            description,
            icon,
            badge_color,
            badge_image_url,
            badge_image_alt,
            xp_reward
          )
        `)
        .eq('user_id', user.id)

      if (error) throw error
      setUserAchievements(data || [])
    } catch (err) {
      console.error('Error fetching user achievements:', err)
      setError(err.message)
      // Set empty array as fallback
      setUserAchievements([])
    }
  }

  // Fetch daily challenge win counts
  const fetchChallengeWinCounts = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase.rpc('get_user_challenge_win_counts', {
        p_user_id: user.id
      })

      if (error) throw error

      // Convert array to object: { rank_1: 5, rank_2: 3, rank_3: 1 }
      const counts = {}
      if (data) {
        data.forEach(item => {
          counts[item.achievement_type] = parseInt(item.win_count)
        })
      }
      setChallengeWinCounts(counts)
    } catch (err) {
      console.error('Error fetching challenge win counts:', err)
      // Don't set error, just use empty counts
      setChallengeWinCounts({})
    }
  }

  // Check and award new achievements
  const checkAndAwardAchievements = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase.rpc('check_and_award_achievements', {
        user_id_param: user.id
      })

      if (error) throw error
      
      // If new achievements were awarded, refresh the list and create notifications
      if (data && data.length > 0) {
        await fetchUserAchievements()

        // Create notifications for each new achievement
        for (const achievement of data) {
          try {
            await supabase.from('notifications').insert([{
              user_id: user.id,
              type: 'achievement_earned',
              title: 'Thành tựu mới!',
              message: `Bạn đã đạt được "${achievement.title || 'Thành tựu'}"`,
              icon: 'Trophy',
              data: { achievement_id: achievement.id || achievement.achievement_id }
            }])
          } catch (e) {
            console.error('Error creating achievement notification:', e)
          }
        }

        return data // Return newly earned achievements for notifications
      }
      
      return []
    } catch (err) {
      console.error('Error checking achievements:', err)
      setError(err.message)
      return []
    }
  }

  // Track in-flight claims to prevent duplicate requests
  const claimingSet = useRef(new Set())

  // Claim achievement XP
  const claimAchievementXP = async (achievementId) => {
    if (!user) return { success: false, message: 'No user logged in' }

    // Prevent concurrent claims for the same achievement
    if (claimingSet.current.has(achievementId)) {
      return { success: false, message: 'Đang xử lý, vui lòng đợi...' }
    }
    claimingSet.current.add(achievementId)

    try {
      // Check if user_achievements record exists
      const { data: existing } = await supabase
        .from('user_achievements')
        .select('id, claimed_at')
        .eq('user_id', user.id)
        .eq('achievement_id', achievementId)
        .single()

      if (existing) {
        // Already claimed — block duplicate
        if (existing.claimed_at) {
          return { success: false, message: 'Thành tựu này đã được nhận rồi' }
        }

        // Record exists in DB, use the RPC — it awards XP + gems atomically
        const { data, error } = await supabase.rpc('claim_achievement_xp', {
          user_id_param: user.id,
          achievement_id_param: achievementId
        })

        if (error) throw error

        if (data && data.length > 0) {
          const result = data[0]
          if (result.success) {
            await fetchUserAchievements()
            await fetchUserProfile(user.id)
            return {
              success: true,
              xpAwarded: result.xp_awarded,
              gemsAwarded: result.gems_awarded || 0,
              message: result.message
            }
          } else {
            return { success: false, message: result.message }
          }
        }

        return { success: false, message: 'Unknown error' }
      } else {
        // Record doesn't exist in DB — achievement was unlocked via frontend calculation
        // Manually insert record, award XP + gems, and mark as claimed
        const { data: achievementRewards } = await supabase
          .from('achievements')
          .select('xp_reward, gem_reward')
          .eq('id', achievementId)
          .single()

        const xpReward = achievementRewards?.xp_reward || 0
        const gemReward = achievementRewards?.gem_reward || 0

        // Double-check no record was inserted between our first check and now
        const { data: recheck } = await supabase
          .from('user_achievements')
          .select('id, claimed_at')
          .eq('user_id', user.id)
          .eq('achievement_id', achievementId)
          .single()

        if (recheck) {
          return { success: false, message: 'Thành tựu này đã được nhận rồi' }
        }

        // Insert user_achievements record with earned_at and claimed_at
        const { error: insertError } = await supabase
          .from('user_achievements')
          .insert({
            user_id: user.id,
            achievement_id: achievementId,
            earned_at: new Date().toISOString(),
            claimed_at: new Date().toISOString(),
            xp_claimed: xpReward
          })

        if (insertError) throw insertError

        // Award XP + gems to user profile
        if (xpReward > 0 || gemReward > 0) {
          const { data: userData } = await supabase
            .from('users')
            .select('xp, gems')
            .eq('id', user.id)
            .single()

          const { error: updateError } = await supabase
            .from('users')
            .update({
              xp: (userData?.xp || 0) + xpReward,
              gems: (userData?.gems || 0) + gemReward
            })
            .eq('id', user.id)

          if (updateError) throw updateError
        }

        const gemsAwarded = gemReward

        await fetchUserAchievements()
        await fetchUserProfile(user.id)
        return { success: true, xpAwarded: xpReward, gemsAwarded, message: 'Reward claimed' }
      }
    } catch (err) {
      console.error('Error claiming achievement XP:', err)
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      claimingSet.current.delete(achievementId)
    }
  }

  // Get achievement progress for a specific achievement
  const getAchievementProgress = (achievement) => {
    if (!user) return { progress: 0, unlocked: false, claimed: false }

    const userAchievement = userAchievements.find(ua => ua.achievement_id === achievement.id)
    
    if (userAchievement) {
      return { 
        progress: 100, 
        unlocked: true, 
        claimed: userAchievement.claimed_at !== null,
        earnedAt: userAchievement.earned_at,
        xpToClaim: userAchievement.xp_claimed || 0
      }
    }

    // Calculate progress based on criteria type
    // This would need to be implemented based on your user stats
    // For now, return basic progress
    return { progress: 0, unlocked: false, claimed: false }
  }

  // Get all achievements with progress
  const getAchievementsWithProgress = () => {
    return achievements.map(achievement => ({
      ...achievement,
      ...getAchievementProgress(achievement)
    }))
  }

  // Create new achievement (admin only)
  const createAchievement = async (achievementData) => {
    try {
      const { data, error } = await supabase
        .from('achievements')
        .insert([achievementData])
        .select()
        .single()

      if (error) throw error
      
      // Refresh achievements list
      await fetchAchievements()
      return data
    } catch (err) {
      console.error('Error creating achievement:', err)
      setError(err.message)
      throw err
    }
  }

  // Update achievement (admin only)
  const updateAchievement = async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('achievements')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      
      // Refresh achievements list
      await fetchAchievements()
      return data
    } catch (err) {
      console.error('Error updating achievement:', err)
      setError(err.message)
      throw err
    }
  }

  // Delete achievement (admin only)
  const deleteAchievement = async (id) => {
    try {
      const { error } = await supabase
        .from('achievements')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      // Refresh achievements list
      await fetchAchievements()
    } catch (err) {
      console.error('Error deleting achievement:', err)
      setError(err.message)
      throw err
    }
  }

  // Toggle achievement active status (admin only)
  const toggleAchievementStatus = async (id, isActive) => {
    try {
      const { data, error } = await supabase
        .from('achievements')
        .update({ is_active: isActive })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      
      // Refresh achievements list
      await fetchAchievements()
      return data
    } catch (err) {
      console.error('Error toggling achievement status:', err)
      setError(err.message)
      throw err
    }
  }

  useEffect(() => {
    if (user) {
      fetchAchievements()
      fetchUserAchievements()
      fetchChallengeWinCounts()
    }
  }, [user])

  useEffect(() => {
    // Set loading to false after a short delay to ensure data is loaded
    const timer = setTimeout(() => {
      setLoading(false)
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [achievements, userAchievements])

  return {
    achievements,
    userAchievements,
    challengeWinCounts,
    loading,
    error,
    fetchAchievements,
    fetchUserAchievements,
    fetchChallengeWinCounts,
    checkAndAwardAchievements,
    claimAchievementXP,
    getAchievementProgress,
    getAchievementsWithProgress,
    createAchievement,
    updateAchievement,
    deleteAchievement,
    toggleAchievementStatus
  }
}
