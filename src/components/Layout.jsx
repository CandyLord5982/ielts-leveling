import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../supabase/client'
import LeftSidebar from './navigation/LeftSidebar'
import BottomNavigation from './navigation/BottomNavigation'
import ItemDropNotification from './inventory/ItemDropNotification'
import ChestDropNotification from './inventory/ChestDropNotification'
import NotificationModal from './notifications/NotificationModal'
import LoadingSpinner from './ui/LoadingSpinner'
import OnlineUsers from './navigation/OnlineUsers'
import PvPIncomingBanner from './pvp/PvPIncomingBanner'
import ReportModal from './reports/ReportModal'
import { FEATURES } from '../config/features'

const Layout = () => {
  const { loading, user } = useAuth()
  const location = useLocation()
  const [showReportModal, setShowReportModal] = useState(false)

  // Heartbeat: update last_seen_at only when user is active
  useEffect(() => {
    if (!user?.id) return
    let isActive = true
    let idleTimer = null
    const IDLE_TIMEOUT = 3 * 60 * 1000 // 3 minutes of no activity = idle

    const updatePresence = () => {
      if (!isActive) return
      supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id).then()
    }

    const resetIdle = () => {
      isActive = true
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => { isActive = false }, IDLE_TIMEOUT)
    }

    resetIdle()
    updatePresence()
    const interval = setInterval(updatePresence, 2 * 60 * 1000)

    window.addEventListener('mousemove', resetIdle)
    window.addEventListener('mousedown', resetIdle)
    window.addEventListener('keydown', resetIdle)
    window.addEventListener('touchstart', resetIdle)
    window.addEventListener('scroll', resetIdle)

    return () => {
      clearInterval(interval)
      clearTimeout(idleTimer)
      window.removeEventListener('mousemove', resetIdle)
      window.removeEventListener('mousedown', resetIdle)
      window.removeEventListener('keydown', resetIdle)
      window.removeEventListener('touchstart', resetIdle)
      window.removeEventListener('scroll', resetIdle)
    }
  }, [user?.id])

  const exercisePaths = [
    '/study/flashcard',
    '/study/fill-blank',
    '/study/multiple-choice',
    '/study/video',
    '/study/quiz',
    '/study/listening',
    '/study/speaking',
    '/study/pronunciation',
    '/study/drag-drop',
    '/study/image-hotspot',
    '/study/dropdown',
    '/study/ai-fill-blank',
    '/study/pdf-worksheet'
  ]

  // Check if on session/exercise list page (e.g., /study/course/123/unit/456/session/789)
  const isSessionPage = /\/study\/(course|level)\/[^/]+\/unit\/[^/]+\/session\/[^/]+/.test(location.pathname)

  const isTestPage = location.pathname.startsWith('/study/test-runner')
  const isAdminPage = location.pathname.startsWith('/admin')
  const isFullWidthPage = location.pathname === '/teacher/exercise-bank' || location.pathname === '/pets'

  const hideBottomNav = exercisePaths.some(p => location.pathname.startsWith(p)) || isSessionPage || isTestPage
  const isLiveBattle = location.pathname.startsWith('/teacher/live-battle')
  const isStudyPage = location.pathname.startsWith('/study') || location.pathname.startsWith('/pets')
  const hideSidebar = exercisePaths.some(p => location.pathname.startsWith(p)) || isTestPage || isLiveBattle || isStudyPage
  const isInsideCourse = /\/study\/(course|level)\//.test(location.pathname) || exercisePaths.some(p => location.pathname.startsWith(p))
  const isCoursePage = /\/study\/(course|level)\/[^/]+$/.test(location.pathname)

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Item Drop Notification (global) */}
      {FEATURES.inventory && <ItemDropNotification />}
      {FEATURES.inventory && <ChestDropNotification />}
      <NotificationModal />
      {!isInsideCourse && <PvPIncomingBanner />}

      {/* Left Sidebar - Desktop and Mobile */}
      {!hideSidebar && <LeftSidebar onOpenReport={() => setShowReportModal(true)} />}

      {/* Right Sidebar - Online Users */}
      {!hideSidebar && <OnlineUsers />}

      {/* Main Content */}
      <main className={`${hideSidebar ? 'lg:pl-0' : 'lg:pl-64'} ${hideSidebar ? '' : 'xl:pr-56'} min-h-screen ${hideBottomNav ? 'pb-0' : 'pb-16 lg:pb-0'}`}>
        <div className={isAdminPage || isFullWidthPage || isLiveBattle ? '' : isCoursePage ? 'mx-auto px-1 sm:px-4 py-2 sm:py-6' : isSessionPage ? '' : hideSidebar ? 'container mx-auto px-1 sm:px-4 py-2 sm:py-6 max-w-7xl' : 'container mx-auto px-4 py-6 max-w-7xl'}>
          <Outlet />
        </div>
      </main>

      {/* Bottom Navigation - Mobile (hidden on exercise/question UIs) */}
      {!hideBottomNav && (
        <div className="lg:hidden">
          <BottomNavigation onOpenReport={() => setShowReportModal(true)} />
        </div>
      )}

      {/* Report Modal */}
      <ReportModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} />
    </div>
  )
}

export default Layout
