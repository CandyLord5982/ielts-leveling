import { createContext, useContext, useState, useCallback } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '../supabase/client'

const MissionsContext = createContext({})

export const useMissions = () => {
  const context = useContext(MissionsContext)
  if (!context) {
    throw new Error('useMissions must be used within a MissionsProvider')
  }
  return context
}

export const MissionsProvider = ({ children }) => {
  const { user, fetchUserProfile } = useAuth()
  const [missions, setMissions] = useState({ daily: [], weekly: [], special: [] })
  const [loading, setLoading] = useState(false)

  const fetchMissions = useCallback(async () => {
    if (!user) return
    try {
      setLoading(true)
      const { data, error } = await supabase.rpc('get_user_missions', {
        p_user_id: user.id
      })
      if (error) throw error
      setMissions(data || { daily: [], weekly: [], special: [] })
    } catch (error) {
      console.error('Error fetching missions:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  const updateProgress = useCallback(async (goalType, increment = 1) => {
    if (!user) return
    try {
      const { data, error } = await supabase.rpc('update_mission_progress', {
        p_user_id: user.id,
        p_goal_type: goalType,
        p_increment: increment
      })
      if (error) throw error
      if (data?.updated_count > 0) {
        // Refresh missions to get latest progress
        await fetchMissions()
      }
      return data
    } catch (error) {
      console.error('Error updating mission progress:', error)
    }
  }, [user, fetchMissions])

  const claimReward = useCallback(async (userMissionId) => {
    if (!user) return { success: false }
    try {
      const { data, error } = await supabase.rpc('claim_mission_reward', {
        p_user_id: user.id,
        p_user_mission_id: userMissionId
      })
      if (error) throw error
      if (data?.success) {
        await fetchUserProfile(user.id)
        await fetchMissions()
      }
      return data
    } catch (error) {
      console.error('Error claiming mission reward:', error)
      return { success: false, error: error.message }
    }
  }, [user, fetchMissions, fetchUserProfile])

  const claimAllRewards = useCallback(async () => {
    if (!user) return { success: false }
    try {
      const { data, error } = await supabase.rpc('claim_all_mission_rewards', {
        p_user_id: user.id
      })
      if (error) throw error
      if (data?.success && data.claimed_count > 0) {
        await fetchUserProfile(user.id)
        await fetchMissions()
      }
      return data
    } catch (error) {
      console.error('Error claiming all rewards:', error)
      return { success: false, error: error.message }
    }
  }, [user, fetchMissions, fetchUserProfile])

  // Count completed but unclaimed missions
  const unclaimedCount = [...missions.daily, ...missions.weekly, ...missions.special]
    .filter(m => m.status === 'completed').length

  const value = {
    missions,
    loading,
    unclaimedCount,
    fetchMissions,
    updateProgress,
    claimReward,
    claimAllRewards
  }

  return (
    <MissionsContext.Provider value={value}>
      {children}
    </MissionsContext.Provider>
  )
}
