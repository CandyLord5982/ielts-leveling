import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '../supabase/client'

const StudentLevelsContext = createContext({})

export const useStudentLevels = () => {
  const context = useContext(StudentLevelsContext)
  if (!context) {
    throw new Error('useStudentLevels must be used within a StudentLevelsProvider')
  }
  return context
}

export const StudentLevelsProvider = ({ children }) => {
  const { profile } = useAuth()
  const [studentLevels, setStudentLevels] = useState([])
  const [currentLevel, setCurrentLevel] = useState(null)
  const [nextLevel, setNextLevel] = useState(null)
  const [levelProgress, setLevelProgress] = useState({
    xpNeeded: 0,
    progressPercentage: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStudentLevels()
  }, [])

  useEffect(() => {
    if (profile && studentLevels.length > 0) {
      calculateUserLevel(profile.xp || 0)
    }
  }, [profile, studentLevels])

  const fetchStudentLevels = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('student_levels')
        .select('*')
        .eq('is_active', true)
        .order('level_number', { ascending: true })

      if (error) throw error
      setStudentLevels(data || [])
    } catch (error) {
      console.error('Error fetching student levels:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateUserLevel = (userXp) => {
    if (studentLevels.length === 0) return

    // Find current level (highest level where xp_required <= userXp)
    const current = studentLevels
      .filter(level => userXp >= level.xp_required)
      .sort((a, b) => b.level_number - a.level_number)[0]

    if (!current) {
      // Fallback to first level if user has no XP
      setCurrentLevel(studentLevels[0])
      setNextLevel(studentLevels[1] || null)
      setLevelProgress({ 
        xpNeeded: studentLevels[1]?.xp_required || 0, 
        progressPercentage: 0 
      })
      return
    }

    const next = studentLevels.find(level => level.level_number === current.level_number + 1)

    setCurrentLevel(current)
    setNextLevel(next)

    if (next) {
      const xpNeeded = next.xp_required - userXp
      const progressRange = next.xp_required - current.xp_required
      const progressMade = userXp - current.xp_required
      const progressPercentage = Math.round((progressMade / progressRange) * 100)

      setLevelProgress({
        xpNeeded: Math.max(0, xpNeeded),
        progressPercentage: Math.min(100, Math.max(0, progressPercentage))
      })
    } else {
      setLevelProgress({ xpNeeded: 0, progressPercentage: 100 })
    }
  }

  // Get level info using database function (alternative method)
  const getUserLevelInfo = async (userXp) => {
    try {
      const { data, error } = await supabase.rpc('get_next_level_info', {
        user_xp: userXp
      })

      if (error) throw error
      return data[0] || null
    } catch (error) {
      console.error('Error getting user level info:', error)
      return null
    }
  }

  // Get badge component data
  const getBadgeData = (level = currentLevel) => {
    if (!level) return null

    return {
      name: level.badge_name,
      tier: level.badge_tier,
      icon: level.badge_icon,
      color: level.badge_color,
      description: level.badge_description,
      title: level.title_unlocked,
      levelNumber: level.level_number
    }
  }

  // Get all levels for leaderboard or admin purposes
  const getAllLevels = () => {
    return studentLevels
  }

  // Get levels by tier
  const getLevelsByTier = (tier) => {
    return studentLevels.filter(level => level.badge_tier === tier)
  }

  // Check if user has specific perk
  const hasUnlockedPerk = (perkName, level = currentLevel) => {
    if (!level || !level.perks_unlocked) return false
    return level.perks_unlocked.includes(perkName)
  }

  // Get XP needed for specific level
  const getXpForLevel = (levelNumber) => {
    const level = studentLevels.find(l => l.level_number === levelNumber)
    return level ? level.xp_required : 0
  }

  // Check if level exists
  const levelExists = (levelNumber) => {
    return studentLevels.some(l => l.level_number === levelNumber)
  }

  const value = {
    // Data
    studentLevels,
    currentLevel,
    nextLevel,
    levelProgress,
    loading,

    // Functions
    fetchStudentLevels,
    calculateUserLevel,
    getUserLevelInfo,
    getBadgeData,
    getAllLevels,
    getLevelsByTier,
    hasUnlockedPerk,
    getXpForLevel,
    levelExists,

    // Helpers
    isMaxLevel: !nextLevel,
    currentLevelNumber: currentLevel?.level_number || 1,
    nextLevelNumber: nextLevel?.level_number || null,
    currentBadge: getBadgeData(currentLevel),
    nextBadge: getBadgeData(nextLevel)
  }

  return (
    <StudentLevelsContext.Provider value={value}>
      {children}
    </StudentLevelsContext.Provider>
  )
}