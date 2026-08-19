import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '../supabase/client'

const InventoryContext = createContext(null)

export const useInventory = () => {
  const context = useContext(InventoryContext)
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider')
  }
  return context
}

export const InventoryProvider = ({ children }) => {
  const { user } = useAuth()
  const [inventory, setInventory] = useState([])
  const [unopenedChests, setUnopenedChests] = useState([])
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastItemDrop, setLastItemDrop] = useState(null)
  const [craftHistory, setCraftHistory] = useState([])
  const [newCounts, setNewCounts] = useState({ items: 0, eggs: 0, chests: 0 })
  const [craftResult, setCraftResult] = useState(null)
  const prevChestCount = useRef(null)

  useEffect(() => {
    if (user) {
      fetchInventory()
      fetchUnopenedChests()
      fetchRecipes()
      fetchCraftHistory()
    }
  }, [user])

  const fetchInventory = useCallback(async () => {
    if (!user) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('user_inventory')
        .select(`
          *,
          item:collectible_items(*)
        `)
        .eq('user_id', user.id)
        .gt('quantity', 0)

      if (error) throw error
      setInventory(data || [])
    } catch (error) {
      console.error('Error fetching inventory:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  const fetchUnopenedChests = useCallback(async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('user_chests')
        .select(`
          *,
          chest:chests(*)
        `)
        .eq('user_id', user.id)
        .is('opened_at', null)
        .order('earned_at', { ascending: false })

      if (error) throw error
      const currentCount = (data || []).length
      setUnopenedChests(data || [])
      if (prevChestCount.current !== null && currentCount > prevChestCount.current) {
        const newChests = currentCount - prevChestCount.current
        setNewCounts(prev => ({ ...prev, chests: prev.chests + newChests }))
      }
      prevChestCount.current = currentCount
    } catch (error) {
      console.error('Error fetching chests:', error)
    }
  }, [user])

  const fetchRecipes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('is_active', true)

      if (error) throw error
      setRecipes(data || [])
    } catch (error) {
      console.error('Error fetching recipes:', error)
    }
  }, [])

  const fetchCraftHistory = useCallback(async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('user_crafts')
        .select(`
          *,
          recipe:recipes(name, result_type, result_image_url, result_xp, result_gems)
        `)
        .eq('user_id', user.id)
        .order('crafted_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setCraftHistory(data || [])
    } catch (error) {
      console.error('Error fetching craft history:', error)
    }
  }, [user])

  const rollForItemDrop = async (exerciseId, score) => {
    if (!user) return null
    try {
      const { data, error } = await supabase.rpc('roll_exercise_drop', {
        p_user_id: user.id,
        p_exercise_id: exerciseId,
        p_score: score,
      })

      if (error) throw error

      if (data?.dropped) {
        setLastItemDrop(data.item)
        const type = data.item?.item_type === 'egg' ? 'eggs' : 'items'
        setNewCounts(prev => ({ ...prev, [type]: prev[type] + 1 }))
        await fetchInventory()
      }

      return data
    } catch (error) {
      console.error('Error rolling for item drop:', error)
      return null
    }
  }

  const openChest = async (userChestId) => {
    if (!user) return null
    try {
      const { data, error } = await supabase.rpc('open_chest', {
        p_user_id: user.id,
        p_user_chest_id: userChestId,
      })

      if (error) throw error

      if (data?.success) {
        const items = data.items || []
        const newEggs = items.filter(i => i.item_type === 'egg').length
        const newItems = items.length - newEggs
        setNewCounts(prev => ({
          ...prev,
          items: prev.items + newItems,
          eggs: prev.eggs + newEggs,
        }))
        await fetchInventory()
        await fetchUnopenedChests()
        // Update mission progress for opening chests & collecting items
        supabase.rpc('update_mission_progress', {
          p_user_id: user.id,
          p_goal_type: 'open_chests',
          p_increment: 1
        }).then(() => {}, () => {})
        if (items.length > 0) {
          supabase.rpc('update_mission_progress', {
            p_user_id: user.id,
            p_goal_type: 'collect_items',
            p_increment: items.length
          }).then(() => {}, () => {})
        }
      }

      return data
    } catch (error) {
      console.error('Error opening chest:', error)
      return { success: false, error: error.message }
    }
  }

  const craftRecipe = async (recipeId) => {
    if (!user) return null
    try {
      const { data, error } = await supabase.rpc('craft_recipe', {
        p_user_id: user.id,
        p_recipe_id: recipeId,
      })

      if (error) throw error

      // Store the result for UI feedback
      setCraftResult(data)

      // Refresh inventory regardless of success/failure (items may have been lost)
      await fetchInventory()

      if (data?.success) {
        await fetchCraftHistory()
      } else if (data?.craft_failed) {
        // Craft failed - inventory already refreshed above
        await fetchCraftHistory()
      }

      return data
    } catch (error) {
      console.error('Error crafting recipe:', error)
      const errorResult = { success: false, error: error.message }
      setCraftResult(errorResult)
      return errorResult
    }
  }

  const clearCraftResult = () => {
    setCraftResult(null)
  }

  const getItemQuantity = (itemId) => {
    const entry = inventory.find(i => i.item_id === itemId)
    return entry?.quantity || 0
  }

  const getSetProgress = (setName) => {
    const setItems = inventory.filter(i => i.item?.set_name === setName && i.quantity > 0)
    return setItems.length
  }

  const getEggsInInventory = () => {
    return inventory.filter(i => i.item?.item_type === 'egg' && i.quantity > 0)
  }

  const getBallsInInventory = () => {
    return inventory.filter(i => i.item?.item_type === 'ball' && i.quantity > 0)
  }

  const markTabViewed = (tab) => {
    setNewCounts(prev => ({ ...prev, [tab]: 0 }))
  }

  const newItemCount = newCounts.items + newCounts.eggs + newCounts.chests

  const clearLastItemDrop = () => {
    setLastItemDrop(null)
  }

  const incrementNewCount = (type) => {
    setNewCounts(prev => ({ ...prev, [type]: prev[type] + 1 }))
  }

  const value = {
    inventory,
    unopenedChests,
    recipes,
    craftHistory,
    loading,
    lastItemDrop,
    craftResult,
    fetchInventory,
    fetchUnopenedChests,
    rollForItemDrop,
    openChest,
    craftRecipe,
    clearCraftResult,
    getItemQuantity,
    getSetProgress,
    getEggsInInventory,
    getBallsInInventory,
    newItemCount,
    newCounts,
    markTabViewed,
    clearLastItemDrop,
    incrementNewCount,
  }

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  )
}
