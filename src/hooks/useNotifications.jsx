import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from './useAuth'

export const useNotifications = () => {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const pollInterval = useRef(null)

  const fetchNotifications = useCallback(async () => {
    if (!user) return

    try {
      // Single server-side call: get_notifications merges user-specific,
      // broadcast, and cohort-targeted notifications, resolves read status,
      // dedupes, filters mission_reward, and caps at 50 — replacing the
      // 3-4 round-trips this used to make every poll.
      const { data, error } = await supabase.rpc('get_notifications', {
        p_user_id: user.id,
      })

      if (error) throw error

      const merged = data || []
      setNotifications(merged)
      setUnreadCount(merged.filter(n => !n.is_read).length)
    } catch (err) {
      console.error('Error fetching notifications:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user])

  const markAsRead = async (notificationId) => {
    if (!user) return

    const notif = notifications.find(n => n.id === notificationId)
    if (!notif || notif.is_read) return

    try {
      if (notif.user_id === user.id) {
        // User-specific notification: update is_read directly
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notificationId)
      } else {
        // Broadcast/cohort notification: insert into notification_reads
        await supabase
          .from('notification_reads')
          .upsert({ notification_id: notificationId, user_id: user.id })
      }

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Error marking notification as read:', err)
    }
  }

  const markAllAsRead = async () => {
    if (!user) return

    try {
      const unreadNotifs = notifications.filter(n => !n.is_read)

      // Mark user-specific ones
      const userSpecific = unreadNotifs.filter(n => n.user_id === user.id)
      if (userSpecific.length > 0) {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', user.id)
          .eq('is_read', false)
      }

      // Mark broadcast/cohort ones
      const broadcastOnes = unreadNotifs.filter(n => n.user_id !== user.id)
      if (broadcastOnes.length > 0) {
        const inserts = broadcastOnes.map(n => ({
          notification_id: n.id,
          user_id: user.id
        }))
        await supabase
          .from('notification_reads')
          .upsert(inserts)
      }

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error('Error marking all as read:', err)
    }
  }

  // Admin: create announcement
  const createAdminAnnouncement = async (title, message, cohortId = null) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert([{
          user_id: null,
          type: 'admin_announcement',
          title,
          message,
          icon: 'Megaphone',
          cohort_id: cohortId || null
        }])
        .select()
        .single()

      if (error) throw error
      return data
    } catch (err) {
      console.error('Error creating announcement:', err)
      throw err
    }
  }

  // Fetch admin announcements list
  const fetchAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('type', 'admin_announcement')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data || []
    } catch (err) {
      console.error('Error fetching announcements:', err)
      return []
    }
  }

  // Delete notification (admin)
  const deleteNotification = async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)

      if (error) throw error
      setNotifications(prev => prev.filter(n => n.id !== notificationId))
    } catch (err) {
      console.error('Error deleting notification:', err)
      throw err
    }
  }

  useEffect(() => {
    if (!user) return

    // Poll every 2 minutes, and only while the tab is actually visible.
    // Idle/backgrounded tabs were firing 3-4 notification queries per minute
    // each — a top source of PostgREST egress. Pausing on hidden tabs and
    // halving the interval cuts that dramatically with no UX cost (we do an
    // immediate catch-up fetch whenever the tab becomes visible again).
    const POLL_MS = 120000

    const startPolling = () => {
      if (pollInterval.current) clearInterval(pollInterval.current)
      pollInterval.current = setInterval(fetchNotifications, POLL_MS)
    }
    const stopPolling = () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current)
        pollInterval.current = null
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications() // catch up on anything missed while hidden
        startPolling()
      } else {
        stopPolling()
      }
    }

    fetchNotifications()
    if (document.visibilityState === 'visible') startPolling()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [user, fetchNotifications])

  return {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    createAdminAnnouncement,
    fetchAnnouncements,
    deleteNotification
  }
}
