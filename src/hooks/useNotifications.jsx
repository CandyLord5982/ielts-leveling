import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from './useAuth'

// Notifications are rare and not urgent, so the server is asked at most once an hour per tab
// (and on a full page reload). Several components use this hook at once (sidebar, bell,
// bottom bar...); they share one request and its result, and switching pages or tabs reuses
// it instead of asking again. Marking read / deleting clears it.
const NOTIFICATIONS_REFRESH_MS = 60 * 60 * 1000
const SHARED_FRESH_MS = NOTIFICATIONS_REFRESH_MS
const shared = { userId: null, at: 0, data: null, promise: null }

const loadSharedNotifications = async (userId) => {
  if (shared.userId === userId && shared.data && Date.now() - shared.at < SHARED_FRESH_MS) return shared.data
  if (shared.userId === userId && shared.promise) return shared.promise
  shared.userId = userId
  const promise = supabase.rpc('get_notifications', { p_user_id: userId }).then(({ data, error }) => {
    if (error) throw error
    if (shared.promise === promise) {
      shared.data = data || []
      shared.at = Date.now()
    }
    return data || []
  }).finally(() => {
    if (shared.promise === promise) shared.promise = null
  })
  shared.promise = promise
  return promise
}

// After marking read / deleting, the next load must ask the server again
const forgetSharedNotifications = () => { shared.at = 0; shared.data = null }

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
      const merged = await loadSharedNotifications(user.id)
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

      forgetSharedNotifications()
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

      forgetSharedNotifications()
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
      forgetSharedNotifications()
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
      forgetSharedNotifications()
      setNotifications(prev => prev.filter(n => n.id !== notificationId))
    } catch (err) {
      console.error('Error deleting notification:', err)
      throw err
    }
  }

  useEffect(() => {
    if (!user) return

    // Hourly, only while the tab is visible. The "catch-up" on becoming visible goes through
    // the shared cache, so it only reaches the server once the last answer is an hour old.
    const POLL_MS = NOTIFICATIONS_REFRESH_MS

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
