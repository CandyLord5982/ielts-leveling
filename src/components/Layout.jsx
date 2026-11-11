import { useEffect, useState, useCallback } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../supabase/client'
import { REGISTER_PATH } from '../config/registration'
import LeftSidebar from './navigation/LeftSidebar'
import BottomNavigation from './navigation/BottomNavigation'
import ItemDropNotification from './inventory/ItemDropNotification'
import ChestDropNotification from './inventory/ChestDropNotification'
import NotificationModal from './notifications/NotificationModal'
import LoadingSpinner from './ui/LoadingSpinner'
import OnlineUsers from './navigation/OnlineUsers'
import PvPIncomingBanner from './pvp/PvPIncomingBanner'
import ReportModal from './reports/ReportModal'
import WordLookupPopup from './ui/WordLookupPopup'
import { FEATURES } from '../config/features'

const Layout = () => {
  const { loading, user } = useAuth()
  const location = useLocation()
  const [showReportModal, setShowReportModal] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true' } catch { return false }
  })
  const handleSidebarCollapsed = useCallback((val) => setSidebarCollapsed(val), [])

  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('right_sidebar_collapsed') === 'true' } catch { return false }
  })
  const handleRightSidebarCollapsed = useCallback((val) => setRightSidebarCollapsed(val), [])

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
    '/study/color-fill',
    '/study/dropdown',
    '/study/ai-fill-blank',
    '/study/pdf-worksheet',
    '/study/ielts-reading',
    '/study/listening-dictation'
  ]

  // Check if on session/exercise list page (e.g., /study/course/123/unit/456/session/789)
  const isSessionPage = /\/study\/(course|level)\/[^/]+\/unit\/[^/]+\/session\/[^/]+/.test(location.pathname)

  const isTestPage = location.pathname.startsWith('/study/test-runner')
  const isAdminPage = location.pathname.startsWith('/admin')
  // Widening an exercise page: Layout wraps study pages in a `max-w-7xl` (1280px) container (see the
  // wrapper div below), so an exercise's own width classes can't exceed it. To let an exercise type
  // go wider, add its path here (e.g. '/study/multiple-choice'), then set the width in the exercise itself.
  // Exercises opened from a session (isSessionPage) are already uncapped.
  const isFullWidthPage =location.pathname === '/teacher/exercise-bank' || location.pathname.startsWith('/study/ielts-reading') || location.pathname.startsWith('/study/multiple-choice') || location.pathname.startsWith('/study/listening-dictation')

  // Online Battle (teacher control page and student room) is laid out like Live Battle: full screen, no nav
  const isOnlineBattle = location.pathname.startsWith('/teacher/online-battle') || location.pathname.startsWith('/online-battle')
  const hideBottomNav = exercisePaths.some(p => location.pathname.startsWith(p)) || isSessionPage || isTestPage || isOnlineBattle
  const isLiveBattle = location.pathname.startsWith('/teacher/live-battle') || isOnlineBattle
  const isStudyPage = location.pathname.startsWith('/study')
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

      {/* Trial account notice - progress exists but is tied to a disposable session */}
      {user?.is_anonymous && (
        <Link
          to={REGISTER_PATH}
          className="block bg-blue-600 hover:bg-blue-700 text-white text-center text-sm font-medium py-2 px-4 transition-colors"
        >
          Bạn đang dùng thử. Tạo tài khoản để lưu lại tiến trình, XP và thú cưng →
        </Link>
      )}

      {/* Left Sidebar - Desktop and Mobile */}
      {!hideSidebar && <LeftSidebar onOpenReport={() => setShowReportModal(true)} onCollapsedChange={handleSidebarCollapsed} />}

      {/* Right Sidebar - Online Users */}
      {!hideSidebar && <OnlineUsers onCollapsedChange={handleRightSidebarCollapsed} />}

      {/* Main Content */}
      <main
        className={`min-h-screen ${hideBottomNav ? 'pb-0' : 'pb-16 lg:pb-0'} transition-all duration-300 ease-in-out ${hideSidebar ? '' : (sidebarCollapsed ? 'lg:pl-[60px]' : 'lg:pl-64')
          } ${hideSidebar ? '' : (rightSidebarCollapsed ? 'xl:pr-[60px]' : 'xl:pr-56')
          }`}
      >
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

      {/* Double-click any English word to see its definition */}
      <WordLookupPopup />
    </div>
  )
}

export default Layout
