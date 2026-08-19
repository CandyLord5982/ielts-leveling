import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { useStudentLevels } from './useStudentLevels'
import { supabase } from '../supabase/client'
import { getVietnamDate, daysDifferenceVietnam } from '../utils/vietnamTime'

const ProgressContext = createContext({})

export const useProgress = () => {
  const context = useContext(ProgressContext)
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider')
  }
  return context
}

export const ProgressProvider = ({ children }) => {
  const { user, profile, fetchUserProfile } = useAuth()
  const { calculateUserLevel, getXpForLevel } = useStudentLevels()
  const [userProgress, setUserProgress] = useState([])
  const [achievements, setAchievements] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      fetchUserProgress()
      fetchUserAchievements()
    }
  }, [user])

  const fetchUserProgress = async () => {
    if (!user) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('user_progress')
        .select(`
          *,
          exercise:exercises(*)
        `)
        .eq('user_id', user.id)

      if (error) throw error
      setUserProgress(data || [])
    } catch (error) {
      console.error('Error fetching user progress:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUserAchievements = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('user_achievements')
        .select(`
          *,
          achievement:achievements(*)
        `)
        .eq('user_id', user.id)

      if (error) throw error
      setAchievements(data || [])
    } catch (error) {
      console.error('Error fetching user achievements:', error)
    }
  }

  const updateExerciseProgress = async (exerciseId, progressData) => {
    if (!user) return { error: 'No user logged in' }

    try {
      const { data, error } = await supabase
        .from('user_progress')
        .upsert({
          user_id: user.id,
          exercise_id: exerciseId,
          ...progressData,
          updated_at: new Date().toISOString()
        })
        .select()

      if (error) throw error

      // Update local state
      await fetchUserProgress()

      // Check for achievements
      await checkAndAwardAchievements(progressData)

      return { data, error: null }
    } catch (error) {
      console.error('Error updating exercise progress:', error)
      return { data: null, error }
    }
  }

  const isExerciseCompleted = (exerciseId) => {
    return userProgress.some(progress =>
      progress.exercise_id === exerciseId && progress.status === 'completed'
    )
  }

  // Updated XP and Level calculation using the new system
  const addXP = async (xpAmount) => {
    if (!user || !profile) return

    try {
      const currentXp = profile.xp || 0
      const newXP = currentXp + xpAmount

      // Use the table-based level calculation instead of hardcoded formula
      const levelInfo = await calculateUserLevelFromXP(newXP)
      const newLevel = levelInfo?.level_number || 1

      // Try update xp + level; if 'level' column is missing, retry with only xp
      let { error } = await supabase
        .from('users')
        .update({
          xp: newXP,
          level: newLevel,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) {
        console.warn('Primary users update failed, retrying without level:', error?.message)
        const retry = await supabase
          .from('users')
          .update({
            xp: newXP,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id)
        if (retry.error) throw retry.error
      }

      // Refresh profile
      await fetchUserProfile(user.id)

      // Update level calculation in StudentLevels context
      if (calculateUserLevel) {
        calculateUserLevel(newXP)
      }

      // Check for level up
      const oldLevel = await calculateUserLevelFromXP(currentXp)
      if (levelInfo && oldLevel && levelInfo.level_number > oldLevel.level_number) {
        // Level up achieved!
        await handleLevelUp(oldLevel, levelInfo)
      }

      return { xp: newXP, level: newLevel, levelInfo }
    } catch (error) {
      console.error('Error adding XP:', error)
      return null
    }
  }

  // Get level info from database instead of hardcoded calculation
  const calculateUserLevelFromXP = async (xp) => {
    try {
      const { data, error } = await supabase.rpc('get_user_level', { user_xp: xp })
      if (error) throw error
      return data[0]?.level_info || null
    } catch (error) {
      console.error('Error calculating user level:', error)
      // Fallback to simple calculation
      return { level_number: Math.floor(xp / 1000) + 1 }
    }
  }

  // Handle level up notifications and rewards
  const handleLevelUp = async (oldLevel, newLevel) => {
    console.log('🎉 LEVEL UP!', { from: oldLevel, to: newLevel })

    // You can add level up notifications, animations, etc. here
    // For example, show a modal, play a sound, award bonus XP, etc.

    // Award level up bonus (optional)
    // await awardLevelUpBonus(newLevel)
  }

  const completeExerciseWithXP = async (exerciseId, xpReward, progressData = {}) => {
    if (!user) return { error: 'No user logged in' }

    console.log('🎯 completeExerciseWithXP called for exercise:', exerciseId)

    const isAlreadyCompleted = isExerciseCompleted(exerciseId)
    console.log('Exercise already completed:', isAlreadyCompleted)

    // Allow retries - don't block if already completed
    if (isAlreadyCompleted) {
      console.log('Exercise already completed, but allowing retry for attempts tracking')
    }

    // Check if score meets minimum requirement (75%)
    const score = progressData.score || 0
    const meetingRequirement = score >= 75

    console.log(`📊 Score: ${score}% - ${meetingRequirement ? 'PASSED' : 'FAILED'} (requirement: 75%)`)

    try {
      // Determine status based on score
      const currentStatus = meetingRequirement ? 'completed' : 'attempted'

      // Get existing progress from database to calculate attempts accurately
      console.log(`🔍 Fetching existing progress for user ${user.id}, exercise ${exerciseId}`)
      const { data: existingProgressData, error: fetchError } = await supabase
        .from('user_progress')
        .select('attempts, first_attempt_at, status, completed_at, score, max_score')
        .eq('user_id', user.id)
        .eq('exercise_id', exerciseId)
        .maybeSingle()

      console.log('📋 Existing progress data:', existingProgressData)

      const currentAttempts = existingProgressData?.attempts || 0
      const newAttempts = currentAttempts + 1
      console.log(`🔄 Attempt tracking: current=${currentAttempts}, new=${newAttempts}`)

      // Determine best score and status
      let finalStatus = currentStatus
      let finalCompletedAt = meetingRequirement ? new Date().toISOString() : null
      let finalScore = progressData.score || 0
      let finalMaxScore = progressData.max_score || 0

      // If already completed, keep completed status unless new score is better
      if (existingProgressData?.status === 'completed') {
        const existingScorePercent = existingProgressData.max_score ?
          (existingProgressData.score / existingProgressData.max_score) * 100 : 0
        const newScorePercent = finalMaxScore ? (finalScore / finalMaxScore) * 100 : 0

        // Keep completed status and best score
        if (existingScorePercent >= newScorePercent) {
          finalStatus = 'completed'
          finalCompletedAt = existingProgressData.completed_at
          finalScore = existingProgressData.score
          finalMaxScore = existingProgressData.max_score
          console.log('📊 Keeping existing better score and completed status')
        } else {
          console.log('📊 New score is better, updating to new score')
        }
      }

      // Sanitize client-provided progress data
      const { xp_earned: _omitXpEarned, attempts: _omitAttempts, score: _omitScore, max_score: _omitMaxScore, ...safeProgressData } = progressData || {}

      // Save progress with best score logic
      console.log(`💾 Upserting progress with attempts: ${newAttempts}, status: ${finalStatus}`)
      const { data, error } = await supabase
        .from('user_progress')
        .upsert({
          user_id: user.id,
          exercise_id: exerciseId,
          status: finalStatus,
          completed_at: finalCompletedAt,
          score: finalScore,
          max_score: finalMaxScore,
          attempts: newAttempts,
          first_attempt_at: existingProgressData?.first_attempt_at || new Date().toISOString(),
          ...safeProgressData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,exercise_id'
        })
        .select()

      console.log('💾 Upsert result:', { data, error })

      if (error) {
        console.log('⚠️ Upsert failed, trying UPDATE instead:', error.message)
        const { error: updateError } = await supabase
          .from('user_progress')
          .update({
            status: finalStatus,
            completed_at: finalCompletedAt,
            score: finalScore,
            max_score: finalMaxScore,
            attempts: newAttempts,
            first_attempt_at: existingProgressData?.first_attempt_at || new Date().toISOString(),
            ...safeProgressData,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('exercise_id', exerciseId)

        console.log('🔄 UPDATE result:', { updateError })
      }

      // Only award XP if score requirement is met AND not already completed
      let actualXpAwarded = 0
      if (meetingRequirement && xpReward && xpReward > 0 && !isAlreadyCompleted) {
        const xpResult = await addXP(xpReward)
        actualXpAwarded = xpReward
        console.log('💎 Awarded XP for passing score:', xpReward)

        // Check if level up occurred
        if (xpResult?.levelInfo) {
          console.log('📈 Level info:', xpResult.levelInfo)
        }
      } else if (isAlreadyCompleted) {
        console.log('🔄 No XP awarded - exercise already completed, but tracking attempts')
      } else if (!meetingRequirement) {
        console.log('❌ No XP awarded - score below 75% requirement')
      }

      // Update local state
      await fetchUserProgress()

      console.log(`✅ Exercise completed with ${newAttempts} attempts`)

      // Update streak if exercise was completed successfully
      if (meetingRequirement && !isAlreadyCompleted) {
        console.log('🔥 Updating streak counter...')
        await updateStreak()
      }

      // Check for achievements only if completed
      if (meetingRequirement) {
        await checkAndAwardAchievements(progressData)
      }

      // Roll for chest drop (only on first successful completion, course must have chest_enabled)
      let chestDropResult = null
      if (meetingRequirement && !isAlreadyCompleted) {
        try {
          const { data: chestData, error: chestError } = await supabase.rpc('award_exercise_chest', {
            p_user_id: user.id,
            p_exercise_id: exerciseId,
          })
          if (!chestError && chestData?.success) {
            chestDropResult = chestData
            console.log('📦 Chest awarded:', chestData.chest_name)
            window.dispatchEvent(new CustomEvent('chest-earned', { detail: chestData }))
          }
        } catch (chestErr) {
          console.warn('Chest award failed (non-critical):', chestErr)
        }
      }

      return {
        data,
        error: null,
        xpAwarded: actualXpAwarded,
        completed: meetingRequirement,
        score: score,
        attempts: newAttempts,
        chestDrop: chestDropResult
      }
    } catch (error) {
      console.error('Error completing exercise:', error)
      return { data: null, error: null, xpAwarded: 0, completed: false }
    }
  }

  const updateStreak = async () => {
    if (!user || !profile) return

    try {
      // Get today's date in Vietnam timezone
      const vietnamToday = getVietnamDate()
      const lastActivity = profile.last_activity_date

      console.log('🔥 Streak update:', { vietnamToday, lastActivity })

      let newStreakCount = profile.streak_count || 0

      // Only increment if this is a new day (not consecutive)
      if (lastActivity) {
        const daysDiff = daysDifferenceVietnam(vietnamToday, lastActivity)
        console.log('🔥 Days difference (Vietnam time):', daysDiff)

        if (daysDiff > 0) {
          // New day - increment total days count
          newStreakCount += 1
        }
        // If daysDiff === 0, it's the same day, no change
      } else {
        // First time
        newStreakCount = 1
      }

      const { error } = await supabase
        .from('users')
        .update({
          streak_count: newStreakCount,
          last_activity_date: vietnamToday,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) throw error

      return newStreakCount
    } catch (error) {
      console.error('Error updating streak:', error)
      return null
    }
  }

  // These functions are now handled by useStudentLevels hook
  const getXPForNextLevel = () => {
    // Deprecated - use useStudentLevels hook instead
    console.warn('getXPForNextLevel is deprecated, use useStudentLevels hook')
    return 0
  }

  const getProgressPercentage = () => {
    // Deprecated - use useStudentLevels hook instead
    console.warn('getProgressPercentage is deprecated, use useStudentLevels hook')
    return 0
  }

  const checkAndAwardAchievements = async (progressData) => {
    console.log('Checking achievements for progress:', progressData)
  }

  const getCompletedExercises = () => {
    return userProgress.filter(p => p.status === 'completed').length
  }

  const getTotalStudyTime = () => {
    return userProgress.reduce((total, p) => total + (p.time_spent || 0), 0)
  }

  const value = {
    userProgress,
    achievements,
    loading,
    updateExerciseProgress,
    addXP,
    completeExerciseWithXP,
    isExerciseCompleted,
    updateStreak,
    getXPForNextLevel, // Deprecated
    getProgressPercentage, // Deprecated
    getCompletedExercises,
    getTotalStudyTime,
    fetchUserProgress,
    fetchUserAchievements,

    // New functions
    calculateUserLevelFromXP,
    handleLevelUp
  }

  return (
    <ProgressContext.Provider value={value}>
      {children}
    </ProgressContext.Provider>
  )
}