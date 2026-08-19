import { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from './useAuth'

export const useGiftcodes = () => {
  const { user, fetchUserProfile } = useAuth()
  const [giftcodes, setGiftcodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch all giftcodes (admin)
  const fetchGiftcodes = async () => {
    try {
      const { data, error } = await supabase
        .from('giftcodes')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setGiftcodes(data || [])
    } catch (err) {
      console.error('Error fetching giftcodes:', err)
      setError(err.message)
      setGiftcodes([])
    } finally {
      setLoading(false)
    }
  }

  // Redeem a code (student)
  const redeemCode = async (code) => {
    if (!user) return { success: false, error: 'Chưa đăng nhập' }

    try {
      const { data, error } = await supabase.rpc('redeem_giftcode', {
        p_user_id: user.id,
        p_code: code.trim()
      })

      if (error) throw error

      if (data?.success) {
        // Refresh user profile to show updated XP/gems
        await fetchUserProfile(user.id)
      }

      return data
    } catch (err) {
      console.error('Error redeeming giftcode:', err)
      return { success: false, error: err.message }
    }
  }

  // Create giftcode (admin)
  const createGiftcode = async (giftcodeData) => {
    try {
      const { data, error } = await supabase
        .from('giftcodes')
        .insert([{
          ...giftcodeData,
          created_by: user.id
        }])
        .select()
        .single()

      if (error) throw error
      await fetchGiftcodes()
      return data
    } catch (err) {
      console.error('Error creating giftcode:', err)
      setError(err.message)
      throw err
    }
  }

  // Update giftcode (admin)
  const updateGiftcode = async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('giftcodes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      await fetchGiftcodes()
      return data
    } catch (err) {
      console.error('Error updating giftcode:', err)
      setError(err.message)
      throw err
    }
  }

  // Delete giftcode (admin)
  const deleteGiftcode = async (id) => {
    try {
      const { error } = await supabase
        .from('giftcodes')
        .delete()
        .eq('id', id)

      if (error) throw error
      await fetchGiftcodes()
    } catch (err) {
      console.error('Error deleting giftcode:', err)
      setError(err.message)
      throw err
    }
  }

  // Toggle active status (admin)
  const toggleGiftcodeStatus = async (id, isActive) => {
    try {
      const { data, error } = await supabase
        .from('giftcodes')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      await fetchGiftcodes()
      return data
    } catch (err) {
      console.error('Error toggling giftcode status:', err)
      setError(err.message)
      throw err
    }
  }

  // Fetch redemption history for a specific giftcode (admin)
  const fetchRedemptionHistory = async (giftcodeId) => {
    try {
      const { data, error } = await supabase
        .from('giftcode_redemptions')
        .select(`
          *,
          users (
            id,
            full_name,
            email,
            avatar_url
          )
        `)
        .eq('giftcode_id', giftcodeId)
        .order('redeemed_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (err) {
      console.error('Error fetching redemption history:', err)
      return []
    }
  }

  useEffect(() => {
    if (user) {
      fetchGiftcodes()
    }
  }, [user])

  return {
    giftcodes,
    loading,
    error,
    fetchGiftcodes,
    redeemCode,
    createGiftcode,
    updateGiftcode,
    deleteGiftcode,
    toggleGiftcodeStatus,
    fetchRedemptionHistory
  }
}
