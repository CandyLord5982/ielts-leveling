import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '../supabase/client'

const PetContext = createContext(null)

// XP required for a given pet level: 100 for levels 1-10, then scales up
export const getPetXpForLevel = (level) => {
  if (level <= 10) return 100
  return 100 + (level - 10) * 20
}

// Total XP needed to reach a given level (sum of all previous levels)
export const getTotalXpForLevel = (level) => {
  let total = 0
  for (let i = 1; i < level; i++) {
    total += getPetXpForLevel(i)
  }
  return total
}

// Get pet level and progress from total XP
export const getPetLevelFromXp = (xp) => {
  let level = 1
  let remaining = xp
  while (remaining >= getPetXpForLevel(level)) {
    remaining -= getPetXpForLevel(level)
    level++
  }
  const xpForCurrent = getPetXpForLevel(level)
  return { level, xpInLevel: remaining, xpForLevel: xpForCurrent, progress: (remaining / xpForCurrent) * 100 }
}

export const usePet = () => {
  const context = useContext(PetContext)
  if (!context) {
    throw new Error('usePet must be used within a PetProvider')
  }
  return context
}

export const PetProvider = ({ children }) => {
  const { user, isAdmin } = useAuth()
  const [activePet, setActivePet] = useState(null)
  const [userPets, setUserPets] = useState([])
  const [allPets, setAllPets] = useState([])
  const [loading, setLoading] = useState(false)
  const [userEnergy, setUserEnergy] = useState(100)
  const [pendingEncounter, setPendingEncounter] = useState(null)
  const [catchResult, setCatchResult] = useState(null)

  useEffect(() => {
    if (user) {
      fetchActivePet()
      fetchUserPets()
      fetchUserEnergy()
    }
    fetchAllPets()
  }, [user])

  const fetchUserEnergy = async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('users')
        .select('energy, energy_last_reset')
        .eq('id', user.id)
        .single()

      if (error) throw error

      const today = new Date().toISOString().split('T')[0]
      if (!data.energy_last_reset || data.energy_last_reset < today) {
        // Auto-reset energy daily
        await supabase
          .from('users')
          .update({ energy: 100, energy_last_reset: today })
          .eq('id', user.id)
        setUserEnergy(100)
      } else {
        setUserEnergy(data.energy ?? 100)
      }
    } catch (error) {
      console.error('Error fetching user energy:', error)
    }
  }

  const fetchAllPets = async () => {
    try {
      const { data, error } = await supabase
        .from('pets')
        .select('*')
        .eq('is_active', true)
        .order('rarity', { ascending: true })

      if (error) throw error
      setAllPets(data || [])
    } catch (error) {
      console.error('Error fetching all pets:', error)
    }
  }

  const fetchActivePet = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase.rpc('get_active_pet', {
        p_user_id: user.id
      })

      if (error) {
        console.error('Error fetching active pet:', error)
        return
      }

      if (data?.success) {
        setActivePet(data.pet)
      } else {
        setActivePet(null)
      }
    } catch (error) {
      console.error('Error fetching active pet:', error)
    }
  }

  const fetchUserPets = async () => {
    if (!user) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('user_pets')
        .select(`
          *,
          pet:pets(*)
        `)
        .eq('user_id', user.id)
        .order('obtained_at', { ascending: false })

      if (error) throw error
      setUserPets(data || [])
    } catch (error) {
      console.error('Error fetching user pets:', error)
    } finally {
      setLoading(false)
    }
  }

  const buyEgg = async (eggItemId, currency = 'gems') => {
    if (!user) return { success: false, error: 'No user logged in' }

    try {
      const { data, error } = await supabase.rpc('buy_egg', {
        p_user_id: user.id,
        p_egg_item_id: eggItemId,
        p_currency: currency
      })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error buying egg:', error)
      return { success: false, error: error.message }
    }
  }

  const openEgg = async (eggItemId) => {
    if (!user) return { success: false, error: 'No user logged in' }

    try {
      const { data, error } = await supabase.rpc('open_egg', {
        p_user_id: user.id,
        p_egg_item_id: eggItemId
      })

      if (error) throw error

      if (data.success) {
        await fetchUserPets()
        await fetchActivePet()
      }

      return data
    } catch (error) {
      console.error('Error opening egg:', error)
      return { success: false, error: error.message }
    }
  }

  const setActivePetById = async (userPetId) => {
    if (!user) return { success: false, error: 'No user logged in' }

    try {
      const { data, error } = await supabase.rpc('set_active_pet', {
        p_user_id: user.id,
        p_user_pet_id: userPetId
      })

      if (error) throw error

      if (data.success) {
        await fetchActivePet()
        await fetchUserPets()
      }

      return data
    } catch (error) {
      console.error('Error setting active pet:', error)
      return { success: false, error: error.message }
    }
  }

  const feedPet = async (userPetId, itemId = null) => {
    if (!user) return { success: false, error: 'No user logged in' }

    try {
      const { data, error } = await supabase.rpc('feed_pet', {
        p_user_id: user.id,
        p_user_pet_id: userPetId,
        p_item_id: itemId
      })

      if (error) throw error

      if (data.success) {
        await fetchActivePet()
        await fetchUserPets()
      }

      return data
    } catch (error) {
      console.error('Error feeding pet:', error)
      return { success: false, error: error.message }
    }
  }

  const playWithPet = async (userPetId) => {
    if (!user) return { success: false, error: 'No user logged in' }

    try {
      const { data, error } = await supabase.rpc('play_with_pet', {
        p_user_id: user.id,
        p_user_pet_id: userPetId
      })

      if (error) throw error

      if (data.success) {
        await fetchActivePet()
        await fetchUserPets()
      }

      return data
    } catch (error) {
      console.error('Error playing with pet:', error)
      return { success: false, error: error.message }
    }
  }

  const evolvePet = async (userPetId, fruitItemId) => {
    if (!user) return { success: false, error: 'No user logged in' }

    try {
      const { data, error } = await supabase.rpc('evolve_pet', {
        p_user_id: user.id,
        p_user_pet_id: userPetId,
        p_fruit_item_id: fruitItemId
      })

      if (error) throw error

      if (data.success) {
        await fetchActivePet()
        await fetchUserPets()
      }

      return data
    } catch (error) {
      console.error('Error evolving pet:', error)
      return { success: false, error: error.message }
    }
  }

  const updatePetOnActivity = async () => {
    if (!user || !activePet) return

    try {
      const { data, error } = await supabase.rpc('update_pet_on_activity', {
        p_user_id: user.id
      })

      if (error) throw error

      if (data?.success) {
        await fetchActivePet()
      }
    } catch (error) {
      console.error('Error updating pet on activity:', error)
    }
  }

  // Drain user energy (universal energy pool, not per-pet)
  const drainPetEnergy = async (amount = 5) => {
    if (!user) return { success: false, error: 'No user logged in' }

    // Admin bypasses energy check
    if (isAdmin()) return { success: true, newEnergy: userEnergy ?? 100 }

    const currentEnergy = userEnergy ?? 100
    if (currentEnergy < amount) {
      return { success: false, error: 'Pet is too tired', currentEnergy }
    }

    try {
      const newEnergy = Math.max(0, currentEnergy - amount)

      const { error } = await supabase
        .from('users')
        .update({ energy: newEnergy })
        .eq('id', user.id)

      if (error) throw error

      // Update local state immediately for responsive UI
      setUserEnergy(newEnergy)

      return { success: true, newEnergy }
    } catch (error) {
      console.error('Error draining energy:', error)
      return { success: false, error: error.message }
    }
  }

  // Restore user energy (used when feeding pet)
  const restoreUserEnergy = async (amount = 5) => {
    if (!user) return

    try {
      const newEnergy = Math.min(100, (userEnergy ?? 100) + amount)

      const { error } = await supabase
        .from('users')
        .update({ energy: newEnergy })
        .eq('id', user.id)

      if (error) throw error

      setUserEnergy(newEnergy)
      return { success: true, newEnergy }
    } catch (error) {
      console.error('Error restoring energy:', error)
      return { success: false, error: error.message }
    }
  }

  const getActiveBonuses = () => {
    if (!activePet) return []

    // Calculate bonuses based on pet rarity
    const bonuses = []

    // Base rarity bonus
    let rarityBonus = 0
    if (activePet.rarity === 'common') rarityBonus = 5
    if (activePet.rarity === 'uncommon') rarityBonus = 10
    if (activePet.rarity === 'rare') rarityBonus = 15
    if (activePet.rarity === 'epic') rarityBonus = 20
    if (activePet.rarity === 'legendary') rarityBonus = 25

    // Evolution stage bonus (5% per stage)
    const evolutionStage = activePet.evolution_stage || 0
    const evolutionBonus = evolutionStage * 5

    // Total bonus
    const totalBonus = rarityBonus + evolutionBonus

    if (totalBonus > 0) {
      bonuses.push({
        type: 'xp_boost',
        value: totalBonus,
        breakdown: {
          rarity: rarityBonus,
          evolution: evolutionBonus
        }
      })
    }

    return bonuses
  }

  // ---- Ball & Catch System ----

  const buyBall = async (ballItemId, currency = 'gems') => {
    if (!user) return { success: false, error: 'No user logged in' }
    try {
      const { data, error } = await supabase.rpc('buy_ball', {
        p_user_id: user.id,
        p_ball_item_id: ballItemId,
        p_currency: currency
      })
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error buying ball:', error)
      return { success: false, error: error.message }
    }
  }

  const rollEncounter = async (score) => {
    if (!user) return { encountered: false }
    try {
      const { data, error } = await supabase.rpc('roll_pet_encounter', {
        p_user_id: user.id,
        p_score: score
      })
      if (error) throw error
      if (data?.encountered) {
        setPendingEncounter(data.pet)
      }
      return data
    } catch (error) {
      console.error('Error rolling encounter:', error)
      return { encountered: false }
    }
  }

  const rollWildAreaEncounter = async () => {
    if (!user) return { encountered: false }
    try {
      const { data, error } = await supabase.rpc('roll_wild_area_encounter', {
        p_user_id: user.id
      })
      if (error) throw error
      if (data?.encountered) {
        setPendingEncounter(data.pet)
      }
      return data
    } catch (error) {
      console.error('Error rolling wild area encounter:', error)
      return { encountered: false }
    }
  }

  const attemptCatch = async (petId, ballItemId) => {
    if (!user) return { success: false, error: 'No user logged in' }
    try {
      const { data, error } = await supabase.rpc('attempt_catch_pet', {
        p_user_id: user.id,
        p_pet_id: petId,
        p_ball_item_id: ballItemId
      })
      if (error) throw error
      setCatchResult(data)
      if (data?.caught && !data?.duplicate) {
        await fetchUserPets()
        await fetchActivePet()
      }
      return data
    } catch (error) {
      console.error('Error catching pet:', error)
      return { success: false, error: error.message }
    }
  }

  const clearEncounter = () => setPendingEncounter(null)
  const clearCatchResult = () => setCatchResult(null)

  // Listen for encounter events from exercise completion
  useEffect(() => {
    const handleEncounter = (e) => {
      if (e.detail) setPendingEncounter(e.detail)
    }
    window.addEventListener('pet-encounter', handleEncounter)
    return () => window.removeEventListener('pet-encounter', handleEncounter)
  }, [])

  const renamePet = async (newNickname, petId) => {
    const targetId = petId || activePet?.id
    if (!targetId) return
    try {
      const { error } = await supabase
        .from('user_pets')
        .update({ nickname: newNickname.trim() || null })
        .eq('id', targetId)
      if (error) throw error
      await fetchActivePet()
      await fetchUserPets()
    } catch (error) {
      console.error('Error renaming pet:', error)
      throw error
    }
  }

  // Batch save all habitat positions: layout = {[userPetId]: {x, y} | undefined}
  const saveHabitatLayout = async (layout) => {
    if (!user) return { success: false, error: 'No user logged in' }
    try {
      const updates = userPets.map(up => {
        const pos = layout[up.id]
        return supabase
          .from('user_pets')
          .update({ habitat_x: pos?.x ?? null, habitat_y: pos?.y ?? null, habitat_flip: pos?.flip ?? false })
          .eq('id', up.id)
          .eq('user_id', user.id)
      })
      const results = await Promise.all(updates)
      const failed = results.find(r => r.error)
      if (failed) throw failed.error

      // Update local state to match
      setUserPets(prev => prev.map(up => {
        const pos = layout[up.id]
        return { ...up, habitat_x: pos?.x ?? null, habitat_y: pos?.y ?? null, habitat_flip: pos?.flip ?? false }
      }))
      return { success: true }
    } catch (error) {
      console.error('Error saving habitat layout:', error)
      return { success: false, error: error.message }
    }
  }

  const value = {
    activePet,
    userPets,
    allPets,
    loading,
    userEnergy,
    buyEgg,
    openEgg,
    buyBall,
    rollEncounter,
    rollWildAreaEncounter,
    attemptCatch,
    pendingEncounter,
    catchResult,
    clearEncounter,
    clearCatchResult,
    setActivePetById,
    feedPet,
    playWithPet,
    evolvePet,
    renamePet,
    saveHabitatLayout,
    updatePetOnActivity,
    drainPetEnergy,
    restoreUserEnergy,
    getActiveBonuses,
    fetchActivePet,
    fetchUserPets,
    fetchAllPets,
    fetchUserEnergy
  }

  return (
    <PetContext.Provider value={value}>
      {children}
    </PetContext.Provider>
  )
}
