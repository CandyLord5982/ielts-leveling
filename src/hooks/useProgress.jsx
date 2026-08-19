import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
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
        .select('id, exercise_id, status, score, max_score, attempts, time_spent, xp_earned, completed_at, first_attempt_at, updated_at')
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
        .select('id, achievement_id, earned_at')
        .eq('user_id', user.id)

      if (error) throw error
      setAchievements(data || [])
    } catch (error) {
      console.error('Error fetching user achievements:', error)
    }
  }

  const startExercise = async (exerciseId) => {
    if (!user) return { error: 'No user logged in' }

    try {
      // Check if exercise progress already exists
      const { data: existingProgress } = await supabase
        .from('user_progress')
        .select('id, first_attempt_at, status')
        .eq('user_id', user.id)
        .eq('exercise_id', exerciseId)
        .maybeSingle()

      // Only create/update if no first_attempt_at exists
      if (!existingProgress?.first_attempt_at) {
        const startedAt = new Date().toISOString()
        const { data, error } = await supabase
          .from('user_progress')
          .upsert({
            user_id: user.id,
            exercise_id: exerciseId,
            status: 'in_progress',
            first_attempt_at: startedAt,
            attempts: 0,
            created_at: startedAt,
            updated_at: startedAt
          }, {
            onConflict: 'user_id,exercise_id'
          })
          .select()

        if (error) throw error

        console.log('📝 Exercise started, tracking entry time:', exerciseId)
        return { data, error: null, startedAt }
      } else {
        console.log('📝 Exercise already has entry time, returning fresh timestamp for retry:', exerciseId)
        // Always return a fresh timestamp for retries/challenge attempts
        // This ensures each challenge attempt has its own accurate start time
        return { data: existingProgress, error: null, startedAt: new Date().toISOString() }
      }
    } catch (error) {
      console.error('Error starting exercise:', error)
      return { data: null, error }
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

  // Fetch active pet's XP bonus multiplier directly from DB
  const getPetXPBonus = async () => {
    if (!user) return 0
    try {
      const { data, error } = await supabase
        .from('user_pets')
        .select('rarity:pets(rarity)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()

      if (error || !data) return 0

      const rarity = data.rarity?.rarity
      const bonusMap = { common: 5, uncommon: 10, rare: 15, epic: 20, legendary: 25 }
      return bonusMap[rarity] || 0
    } catch {
      return 0
    }
  }

  // Fetch XP bonus from equipped shop items (frames, bowls, backgrounds)
  // Each item can have xp_bonus in its item_data JSONB field
  const getEquippedItemsXPBonus = async () => {
    if (!user || !profile) return { total: 0, items: [] }
    try {
      const hasAvatar = !!profile.avatar_url
      const hasFrame = !!profile.active_title
      const hasBackground = !!profile.active_background_url
      const hasBowl = !!profile.active_bowl_url
      const hasSpaceship = !!profile.active_spaceship_url
      const hasHammer = !!profile.active_hammer_url
      const hasBoat = !!profile.active_boat_url

      if (!hasAvatar && !hasFrame && !hasBackground && !hasBowl && !hasSpaceship && !hasHammer && !hasBoat) return { total: 0, items: [] }

      const { data, error } = await supabase
        .from('shop_items')
        .select('name, category, image_url, item_data')
        .eq('is_active', true)

      if (error || !data) return { total: 0, items: [] }

      const bonusItems = []
      for (const item of data) {
        const isEquipped = (
          (hasAvatar && (item.item_data?.avatar_url || item.image_url) === profile.avatar_url) ||
          (hasFrame && item.image_url === profile.active_title) ||
          (hasBackground && (item.item_data?.background_url || item.image_url) === profile.active_background_url) ||
          (hasBowl && (item.item_data?.bowl_url || item.image_url) === profile.active_bowl_url) ||
          (hasSpaceship && item.image_url === profile.active_spaceship_url) ||
          (hasHammer && item.image_url === profile.active_hammer_url) ||
          (hasBoat && (item.item_data?.boat_url || item.image_url) === profile.active_boat_url)
        )
        if (isEquipped && item.item_data?.xp_bonus > 0) {
          bonusItems.push({ name: item.name, category: item.category, bonus: item.item_data.xp_bonus })
        }
      }

      const total = bonusItems.reduce((sum, i) => sum + i.bonus, 0)
      return { total, items: bonusItems }
    } catch {
      return { total: 0, items: [] }
    }
  }

  const addXP = async (xpAmount) => {
    if (!user) return

    try {
      // Atomic server-side increment (xp = xp + delta) avoids lost updates when
      // other awards run concurrently or the local profile is stale.
      const { data, error } = await supabase.rpc('increment_user_currency', {
        p_user_id: user.id,
        p_xp: xpAmount,
        p_gems: 0
      })

      if (error) throw error

      // Refresh profile
      await fetchUserProfile(user.id)

      const row = Array.isArray(data) ? data[0] : data
      return { xp: row?.xp, level: row?.level }
    } catch (error) {
      console.error('Error adding XP:', error)
      return null
    }
  }

  const completeExerciseWithXP = async (exerciseId, xpReward, progressData = {}) => {
    if (!user) return { error: 'No user logged in' }

    console.log('🎯 completeExerciseWithXP called for exercise:', exerciseId)

    const isAlreadyCompleted = isExerciseCompleted(exerciseId)
    console.log('Exercise already completed:', isAlreadyCompleted)

    // Check if this is a daily challenge completion
    const challengeId = progressData.challengeId || null
    const challengeStartedAt = progressData.challengeStartedAt || null
    let challengeResult = null

    // Allow retries - don't block if already completed
    // We'll still track attempts and update progress
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
      console.log('📋 Fetch error:', fetchError)

      // Use DB data as source of truth (local state may be stale after reload)
      const isAlreadyCompletedDB = existingProgressData?.status === 'completed'

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

      // Sanitize client-provided progress data (remove columns not present in DB)
      const {
        xp_earned: _omitXpEarned,
        attempts: _omitAttempts,
        score: _omitScore,
        max_score: _omitMaxScore,
        challengeId: _omitChallengeId,
        challengeStartedAt: _omitChallengeStartedAt,
        ...safeProgressData
      } = progressData || {}

      // Calculate time_spent from timestamps (server-side calculation)
      const firstAttempt = existingProgressData?.first_attempt_at || new Date().toISOString()
      let calculatedTimeSpent = 0
      if (finalCompletedAt && firstAttempt) {
        calculatedTimeSpent = Math.floor((new Date(finalCompletedAt) - new Date(firstAttempt)) / 1000)
        // Cap at 30 minutes (1800 seconds) to avoid counting idle time
        calculatedTimeSpent = Math.min(calculatedTimeSpent, 1800)
      }

      // Save progress with best score logic
      console.log(`💾 Upserting progress with attempts: ${newAttempts}, status: ${finalStatus}, time_spent: ${calculatedTimeSpent}s, score: ${finalScore}, max_score: ${finalMaxScore}`)
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
          first_attempt_at: firstAttempt,
          time_spent: calculatedTimeSpent,
          ...safeProgressData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,exercise_id'
        })
        .select()

      console.log('💾 Upsert result:', { data, error })
      if (data && data[0]) {
        console.log(`⭐ Saved score: ${data[0].score}/${data[0].max_score} (${data[0].score}%)`)
      }

      if (error) {
        console.log('⚠️ Upsert failed, trying UPDATE instead:', error.message)
        // Fallback to UPDATE if upsert fails
        console.log(`🔄 Fallback UPDATE with attempts: ${newAttempts}`)
        const { error: updateError } = await supabase
          .from('user_progress')
          .update({
            status: finalStatus,
            completed_at: finalCompletedAt,
            score: finalScore,
            max_score: finalMaxScore,
            attempts: newAttempts,
            first_attempt_at: firstAttempt,
            time_spent: calculatedTimeSpent,
            ...safeProgressData,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('exercise_id', exerciseId)

        console.log('🔄 UPDATE result:', { updateError })
        if (updateError) {
          console.log('⚠️ UPDATE also failed:', updateError.message)
        }
      }

      // Calculate bonus tier based on score: +50% if >=95%, +30% if >=90%, 0% otherwise
      const getBonusTier = (scorePercent) => {
        if (scorePercent >= 95) return 0.5
        if (scorePercent >= 90) return 0.3
        return 0
      }

      // Check if the course has chest_enabled (allows XP on repeat attempts up to 3)
      // Only check on repeat attempts (2nd/3rd) to avoid unnecessary queries on first completion
      let courseChestEnabled = false
      if (isAlreadyCompletedDB && newAttempts <= 3) {
        try {
          const { data: assignRow } = await supabase
            .from('exercise_assignments')
            .select('sessions:session_id ( units:unit_id ( courses:course_id ( chest_enabled ) ) )')
            .eq('exercise_id', exerciseId)
            .maybeSingle()
          courseChestEnabled = assignRow?.sessions?.units?.courses?.chest_enabled === true
          if (courseChestEnabled) console.log('📦 Course has chest_enabled - repeat XP allowed (up to 3 attempts)')
        } catch (err) {
          console.warn('Could not check course chest_enabled:', err)
        }
      }

      // Only award XP if score requirement is met
      let actualXpAwarded = 0
      let petBonusPercent = 0
      let itemBonusResult = { total: 0, items: [] }
      if (meetingRequirement && xpReward && xpReward > 0) {
        // Check for active pet XP bonus + equipped item bonuses
        petBonusPercent = await getPetXPBonus()
        itemBonusResult = await getEquippedItemsXPBonus()
        const totalBonusPercent = petBonusPercent + itemBonusResult.total

        // Allow full XP on repeat attempts (up to 3) for chest_enabled courses
        const allowRepeatXP = courseChestEnabled && newAttempts <= 3

        if (!isAlreadyCompletedDB || allowRepeatXP) {
          // First completion OR repeat attempt in chest_enabled course (up to 3 attempts)
          const bonusXP = totalBonusPercent > 0 ? Math.round(xpReward * totalBonusPercent / 100) : 0
          const totalWithBonus = xpReward + bonusXP
          await addXP(totalWithBonus)
          actualXpAwarded = totalWithBonus
          if (petBonusPercent > 0) {
            console.log(`🐾 Pet bonus: +${petBonusPercent}%`)
          }
          if (itemBonusResult.total > 0) {
            console.log(`🎨 Item bonus: +${itemBonusResult.total}% (${itemBonusResult.items.map(i => i.name).join(', ')})`)
          }
          if (allowRepeatXP && isAlreadyCompletedDB) {
            console.log(`💎 Awarded XP for repeat attempt ${newAttempts}/3 (chest_enabled course):`, totalWithBonus)
          } else {
            console.log('💎 Awarded XP for first completion:', totalWithBonus)
          }
        } else {
          // Already completed (attempt 4+, or non-chest course) - check if new score earns a higher bonus tier
          const oldScorePercent = existingProgressData?.max_score
            ? (existingProgressData.score / existingProgressData.max_score) * 100
            : existingProgressData?.score || 0
          const newScorePercent = progressData.score || 0

          const oldBonusTier = getBonusTier(oldScorePercent)
          const newBonusTier = getBonusTier(newScorePercent)

          if (newBonusTier > oldBonusTier) {
            // Calculate base XP from the xpReward (remove bonus component)
            const currentBonusMultiplier = 1 + newBonusTier
            const baseXP = Math.round(xpReward / currentBonusMultiplier)

            // Award only the bonus difference + all bonuses on that difference
            const bonusDifference = Math.round(baseXP * (newBonusTier - oldBonusTier))
            if (bonusDifference > 0) {
              const allBonusOnDiff = totalBonusPercent > 0 ? Math.round(bonusDifference * totalBonusPercent / 100) : 0
              const totalDiff = bonusDifference + allBonusOnDiff
              await addXP(totalDiff)
              actualXpAwarded = totalDiff
              console.log(`💎 Awarded bonus XP difference: ${totalDiff} (old tier: ${oldBonusTier * 100}%, new tier: ${newBonusTier * 100}%, total bonus: +${totalBonusPercent}%)`)
            }
          } else {
            console.log('🔄 No additional XP - score did not reach higher bonus tier')
          }
        }
      } else if (!meetingRequirement) {
        console.log('❌ No XP awarded - score below 75% requirement')
      }

      // Update local state
      await fetchUserProgress()
      
      // Debug: Log the updated attempts
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

      // Update pet stats when student completes exercise
      if (meetingRequirement) {
        try {
          await supabase.rpc('update_pet_on_activity', { p_user_id: user.id })
        } catch (petError) {
          console.warn('Pet update failed (non-critical):', petError)
        }
      }

      // Update mission progress (non-blocking)
      if (meetingRequirement) {
        try {
          await supabase.rpc('update_mission_progress', {
            p_user_id: user.id,
            p_goal_type: 'complete_exercises',
            p_increment: 1
          })
          if (score >= 90) {
            await supabase.rpc('update_mission_progress', {
              p_user_id: user.id,
              p_goal_type: 'score_high',
              p_increment: 1
            })
          }
          if (actualXpAwarded > 0) {
            await supabase.rpc('update_mission_progress', {
              p_user_id: user.id,
              p_goal_type: 'earn_xp',
              p_increment: actualXpAwarded
            })
          }
        } catch (missionErr) {
          console.warn('Mission progress update failed (non-critical):', missionErr)
        }
      }

      // Roll for inventory item drop (only on first successful completion)
      let itemDropResult = null
      if (meetingRequirement && !isAlreadyCompleted) {
        try {
          const { data: dropData, error: dropError } = await supabase.rpc('roll_exercise_drop', {
            p_user_id: user.id,
            p_exercise_id: exerciseId,
            p_score: score,
          })
          if (!dropError && dropData?.dropped) {
            itemDropResult = dropData.item
            console.log('🎁 Item dropped:', dropData.item?.name)
            // Dispatch event for ItemDropNotification to pick up
            window.dispatchEvent(new CustomEvent('inventory-item-drop', { detail: dropData.item }))
            // Update mission progress for collecting items
            supabase.rpc('update_mission_progress', {
              p_user_id: user.id,
              p_goal_type: 'collect_items',
              p_increment: 1
            }).then(() => {}, () => {})
          }
        } catch (dropErr) {
          // Silently fail - item drops are non-critical
          console.warn('Item drop roll failed:', dropErr)
        }
      }

      // Roll for chest drop (only on first successful completion, course must have chest_enabled)
      let chestDropResult = null
      if (meetingRequirement && !isAlreadyCompleted) {
        try {
          const { data: chestData, error: chestError } = await supabase.rpc('award_exercise_chest', {
            p_user_id: user.id,
            p_exercise_id: exerciseId,
            p_score: score,
          })
          if (chestError) {
            console.warn('📦 Chest RPC error:', chestError.message)
          } else if (chestData?.success) {
            chestDropResult = chestData
            console.log('📦 Chest awarded:', chestData.chest_name)
            window.dispatchEvent(new CustomEvent('chest-earned', { detail: chestData }))
          } else {
            console.log('📦 Chest not awarded:', chestData?.reason)
          }
        } catch (chestErr) {
          console.warn('📦 Chest award exception:', chestErr)
        }
      }

      // Check if this exercise is part of today's daily challenge
      // Record ALL attempts, including failed ones (below 75%)
      if (challengeId) {
        console.log('🏆 Processing daily challenge attempt...')
        // Calculate challenge time from the actual challenge start time, not first_attempt_at
        let challengeTimeSpent = calculatedTimeSpent
        if (challengeStartedAt) {
          const endTime = new Date().toISOString()
          challengeTimeSpent = Math.floor((new Date(endTime) - new Date(challengeStartedAt)) / 1000)
          // Cap at 30 minutes (1800 seconds) to avoid counting idle time
          challengeTimeSpent = Math.min(challengeTimeSpent, 1800)
          console.log(`⏱️ Challenge time: ${challengeTimeSpent}s (from ${challengeStartedAt} to ${endTime})`)
        }
        challengeResult = await checkChallengeCompletion(exerciseId, challengeId, score, challengeTimeSpent, challengeStartedAt)
      }

      return {
        data,
        error: null,
        xpAwarded: actualXpAwarded,
        petBonusPercent: petBonusPercent,
        itemBonusPercent: itemBonusResult.total,
        itemBonusDetails: itemBonusResult.items,
        completed: meetingRequirement,
        score: score,
        attempts: newAttempts,
        challengeResult: challengeResult,
        itemDrop: itemDropResult,
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

      // Update login_streak mission progress
      try {
        await supabase.rpc('update_mission_progress', {
          p_user_id: user.id,
          p_goal_type: 'login_streak',
          p_increment: 1
        })
      } catch (e) { /* non-critical */ }

      return newStreakCount
    } catch (error) {
      console.error('Error updating streak:', error)
      return null
    }
  }

  const calculateLevel = (xp) => {
    // Simple level calculation: every 1000 XP = 1 level
    return Math.floor(xp / 1000) + 1
  }

  const getXPForNextLevel = () => {
    if (!profile) return 0
    const currentLevel = profile.level || 1
    const nextLevelXP = currentLevel * 1000
    return nextLevelXP - (profile.xp || 0)
  }

  const getProgressPercentage = () => {
    if (!profile) return 0
    const currentLevel = profile.level || 1
    const currentLevelXP = (currentLevel - 1) * 1000
    const nextLevelXP = currentLevel * 1000
    const progressXP = (profile.xp || 0) - currentLevelXP
    return (progressXP / 1000) * 100
  }

  const checkAndAwardAchievements = async (progressData) => {
    if (!user) return

    try {
      // Call the database function to check and award achievements
      const { data, error } = await supabase.rpc('check_and_award_achievements', {
        user_id_param: user.id
      })

      if (error) {
        console.error('Error checking achievements:', error)
        return
      }

      // If new achievements were awarded, refresh achievements and profile
      if (data && data.length > 0) {
        console.log('🎉 New achievements earned:', data)
        await fetchUserAchievements()
        await fetchUserProfile(user.id)
        
        // You could show a notification here
        // showAchievementNotification(data)
      }
    } catch (error) {
      console.error('Error in checkAndAwardAchievements:', error)
    }
  }

  const addGems = async (gemAmount) => {
    if (!user) return null

    try {
      // Atomic server-side increment avoids clobbering concurrent gem awards.
      const { data, error } = await supabase.rpc('increment_user_currency', {
        p_user_id: user.id,
        p_xp: 0,
        p_gems: gemAmount
      })

      if (error) throw error

      await fetchUserProfile(user.id)
      const row = Array.isArray(data) ? data[0] : data
      return row?.gems
    } catch (error) {
      console.error('Error adding gems:', error)
      return null
    }
  }

  const spendGems = async (gemAmount) => {
    if (!user) return { success: false, error: 'No user logged in' }

    try {
      // The balance check and deduction happen atomically in the DB, so it can't
      // over-spend or race with concurrent awards on a stale local balance.
      const { data, error } = await supabase.rpc('spend_user_gems', {
        p_user_id: user.id,
        p_amount: gemAmount
      })

      if (error) throw error

      const row = Array.isArray(data) ? data[0] : data
      if (!row?.success) {
        return { success: false, error: 'Not enough gems', gems: row?.gems }
      }

      await fetchUserProfile(user.id)
      return { success: true, gems: row.gems }
    } catch (error) {
      console.error('Error spending gems:', error)
      return { success: false, error: error.message }
    }
  }

  const spendXP = async (xpAmount) => {
    if (!user) return { success: false, error: 'No user logged in' }

    try {
      const { data, error } = await supabase.rpc('spend_user_xp', {
        p_user_id: user.id,
        p_amount: xpAmount
      })

      if (error) throw error

      const row = Array.isArray(data) ? data[0] : data
      if (!row?.success) {
        return { success: false, error: 'Not enough XP', xp: row?.xp }
      }

      await fetchUserProfile(user.id)
      return { success: true, xp: row.xp }
    } catch (error) {
      console.error('Error spending XP:', error)
      return { success: false, error: error.message }
    }
  }

  const getCompletedExercises = () => {
    return userProgress.filter(p => p.status === 'completed').length
  }

  const getTotalStudyTime = () => {
    return userProgress.reduce((total, p) => total + (p.time_spent || 0), 0)
  }

  // ===== DAILY CHALLENGE FUNCTIONS =====

  const getTodayChallenge = async () => {
    if (!user) return null

    try {
      const { data, error } = await supabase.rpc('get_user_daily_challenge', {
        p_user_id: user.id
      })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching today\'s challenge:', error)
      return null
    }
  }

  const recordChallengeParticipation = async (challengeId, score, timeSpent, startedAt) => {
    if (!user) return { success: false, error: 'No user logged in' }

    try {
      const { data, error } = await supabase.rpc('record_challenge_participation', {
        p_challenge_id: challengeId,
        p_user_id: user.id,
        p_score: score,
        p_time_spent: timeSpent,
        p_started_at: startedAt
      })

      if (error) throw error

      if (data.success) {
        // Refresh user profile to get updated XP/gems
        await fetchUserProfile(user.id)
      }

      return data
    } catch (error) {
      console.error('Error recording challenge participation:', error)
      return { success: false, error: error.message }
    }
  }

  const checkChallengeCompletion = async (exerciseId, challengeId, scorePercent, timeSpent, startedAt) => {
    if (!user || !challengeId) return null

    try {
      console.log('🏆 Checking if exercise is today\'s challenge:', exerciseId, 'challengeId:', challengeId)

      // Record participation in the challenge
      const result = await recordChallengeParticipation(challengeId, scorePercent, timeSpent, startedAt)

      if (result.success) {
        const isPassing = result.is_passing !== false // Default to true for backwards compatibility
        console.log(`🏆 Challenge attempt recorded! ${isPassing ? 'PASSED' : 'FAILED'} - Rank: #${result.rank || 'N/A'}, XP: +${result.xp_awarded}, Gems: +${result.gems_awarded}`)
        // Update mission progress for daily challenge
        try {
          await supabase.rpc('update_mission_progress', {
            p_user_id: user.id,
            p_goal_type: 'daily_challenge',
            p_increment: 1
          })
        } catch (e) { /* non-critical */ }
        return {
          isChallenge: true,
          isPassing: isPassing,
          rank: result.rank,
          xpAwarded: result.xp_awarded,
          gemsAwarded: result.gems_awarded,
          attemptsUsed: result.attempts_used,
          attemptsRemaining: result.attempts_remaining,
          attemptId: result.attempt_id
        }
      } else {
        console.log('⚠️ Challenge participation failed:', result.error)
        return {
          isChallenge: true,
          error: result.error
        }
      }
    } catch (error) {
      console.error('Error checking challenge completion:', error)
      return null
    }
  }

  const value = {
    userProgress,
    achievements,
    loading,
    startExercise,
    updateExerciseProgress,
    addXP,
    addGems,
    spendGems,
    spendXP,
    completeExerciseWithXP,
    isExerciseCompleted,
    updateStreak,
    getXPForNextLevel,
    getProgressPercentage,
    getCompletedExercises,
    getTotalStudyTime,
    fetchUserProgress,
    fetchUserAchievements,
    // Daily Challenge functions
    getTodayChallenge,
    recordChallengeParticipation,
    checkChallengeCompletion,
    // Item bonus
    getEquippedItemsXPBonus
  }

  return (
    <ProgressContext.Provider value={value}>
      {children}
    </ProgressContext.Provider>
  )
}
