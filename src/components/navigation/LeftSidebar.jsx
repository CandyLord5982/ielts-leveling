import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useStudentLevels } from '../../hooks/useStudentLevels'
import {
  LogOut,
  Shield,
  GraduationCap,
  ShoppingBag,
  MessageSquarePlus
} from 'lucide-react'
import { useInventory } from '../../hooks/useInventory'
import { FEATURES } from '../../config/features'
import { useMissions } from '../../hooks/useMissions'
import { useNotifications } from '../../hooks/useNotifications'
import NotificationPanel from '../notifications/NotificationPanel'

import { assetUrl, useBranding } from '../../hooks/useBranding';

const CLIP_CARD = 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)'

const LeftSidebar = ({ onOpenReport }) => {
  const { profile, signOut, isAdmin, isTeacher } = useAuth()
  const { branding } = useBranding()
  const { currentBadge } = useStudentLevels()
  const { newItemCount } = useInventory()
  const { unclaimedCount: missionBadge } = useMissions()
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const notifRef = useRef(null)
  const location = useLocation()

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifPanel(false)
      }
    }
    if (showNotifPanel) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNotifPanel])

  const navItems = [
    { path: '/', imageSrc: assetUrl('/icon/navigation/home.svg'), label: 'Trang chủ' },
    { path: '/leaderboard', imageSrc: assetUrl('/icon/navigation/leaderboard.svg'), label: 'Xếp hạng' },
    FEATURES.pets && { path: '/pets', label: 'Thú cưng',imageSrc: assetUrl('/icon/navigation/pet.svg') },
    FEATURES.inventory && { path: '/inventory',  imageSrc: assetUrl('/icon/navigation/inventory.svg'), label: 'Kho đồ', badge: newItemCount },
    FEATURES.missions && { path: '/missions', imageSrc: assetUrl('/icon/navigation/mission.svg'), label: 'Nhiệm vụ', badge: missionBadge },
    { path: '/progress', imageSrc: assetUrl('/icon/navigation/progress.svg'), label: 'Tiến độ' },
    FEATURES.shop && { path: '/shop', imageSrc: assetUrl('/icon/navigation/shop.svg'), label: 'Cửa hàng'},
  ].filter(Boolean)

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <>
      {/* Sidebar - Desktop only */}
      <aside className="hidden lg:block fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-40">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center p-4">
            <Link to="/" className="flex items-center space-x-2">
              <img src={branding.logoUrl} alt="Logo" className="h-10 w-auto" />
              <span className="text-lg font-semibold text-gray-900 tracking-wide">{branding.appName}</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {navItems.map(({ path, imageSrc, emoji, label, icon, iconComponent: IconComp, badge }) => {
              const isActive = location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'))
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center space-x-3 px-4 py-2.5 transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50 border border-transparent'
                  }`}
                  style={{ clipPath: CLIP_CARD }}
                >
                  <div className="relative">
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt=""
                        width={22}
                        height={22}
                        className={`${isActive ? '' : 'grayscale opacity-70 group-hover:opacity-100 group-hover:grayscale-0'} ${badge > 0 ? 'animate-[pulse_1.5s_ease-in-out_infinite]' : ''}`}
                      />
                    ) : emoji ? (
                      <span className="text-2xl">{emoji}</span>
                    ) : IconComp ? (
                      <IconComp size={22} className={isActive ? '' : 'opacity-70'} />
                    ) : icon === 'ShoppingBag' ? (
                      <ShoppingBag size={22} className={isActive ? '' : 'opacity-70'} />
                    ) : null}
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center"
                        style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
                      >
                        {badge}
                      </span>
                    )}
                  </div>
                  <span className="font-medium text-sm">{label}</span>
                </Link>
              )
            })}

            {/* Admin Panel Link */}
            {isAdmin() && (
              <Link
                to="/admin"
                className={`flex items-center space-x-3 px-4 py-2.5 transition-all ${
                  location.pathname.startsWith('/admin')
                    ? 'bg-purple-50 text-purple-700 font-medium border border-purple-200'
                    : 'text-purple-600 hover:bg-purple-50 border border-transparent'
                }`}
                style={{ clipPath: CLIP_CARD }}
              >
                <Shield size={22} />
                <span className="font-medium text-sm">Admin</span>
              </Link>
            )}

            {/* Teacher Dashboard Link */}
            {(isTeacher() || isAdmin()) && (
              <Link
                to="/teacher"
                className={`flex items-center space-x-3 px-4 py-2.5 transition-all ${
                  location.pathname.startsWith('/teacher')
                    ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200'
                    : 'text-blue-600 hover:bg-blue-50 border border-transparent'
                }`}
                style={{ clipPath: CLIP_CARD }}
              >
                <GraduationCap size={22} />
                <span className="font-medium text-sm">Teacher</span>
              </Link>
            )}
          </nav>

          {/* User Badge & XP */}
          {profile && currentBadge && (
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="flex items-center space-x-3 p-3 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100"
                style={{ clipPath: CLIP_CARD }}
              >
                <div className="flex items-center justify-center">
                  {currentBadge.icon.startsWith('http') ? (
                    <img
                      src={currentBadge.icon}
                      alt={currentBadge.name}
                      className="w-10 h-10 object-contain"
                      onError={(e) => {
                        e.target.style.display = 'none'
                        e.target.nextSibling.style.display = 'inline'
                      }}
                    />
                  ) : null}
                  <span className="text-2xl" style={{ display: currentBadge.icon.startsWith('http') ? 'none' : 'inline' }}>
                    {currentBadge.icon}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {currentBadge.name}
                  </div>
                  <div className="text-xs text-gray-600 flex items-center gap-1">
                    {profile.xp || 0}
                    <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3 h-3" />
                    <span className="mx-0.5 text-gray-300">|</span>
                    {profile.gems || 0}
                    <img src={assetUrl('/image/study/gem.png')} alt="Gems" className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="p-4 border-t border-gray-200 space-y-1">
            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifPanel(!showNotifPanel)}
                className={`w-full flex items-center space-x-3 px-4 py-2.5 transition-all ${
                  showNotifPanel
                    ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200'
                    : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50 border border-transparent'
                }`}
                style={{ clipPath: CLIP_CARD }}
              >
                <div className="relative">
                  <img src={assetUrl('/icon/navigation/notification.svg')} alt="" width={22} height={22}
                    className={showNotifPanel ? '' : 'grayscale opacity-70'}
                  />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center"
                      style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className="font-medium text-sm">Thông báo</span>
              </button>

              {showNotifPanel && (
                <div className="fixed left-64 bottom-4 w-96 z-50">
                  <NotificationPanel
                    notifications={notifications}
                    onMarkAsRead={markAsRead}
                    onMarkAllAsRead={markAllAsRead}
                    onClose={() => setShowNotifPanel(false)}
                    className="w-full max-h-[70vh] overflow-y-auto"
                  />
                </div>
              )}
            </div>

            <button
              onClick={onOpenReport}
              className="w-full flex items-center space-x-3 px-4 py-2.5 transition-all text-orange-600 hover:bg-orange-50 border border-transparent"
              style={{ clipPath: CLIP_CARD }}
            >
              <MessageSquarePlus size={22} />
              <span className="font-medium text-sm">Báo cáo</span>
            </button>
            <Link
              to="/profile"
              className={`flex items-center space-x-3 px-4 py-2.5 transition-all ${
                location.pathname.startsWith('/profile')
                  ? 'bg-gray-100 text-gray-900 font-medium border border-gray-200'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-transparent'
              }`}
              style={{ clipPath: CLIP_CARD }}
            >
              <img src={assetUrl('/icon/navigation/account.svg')} alt="" width={22} height={22}
                className={location.pathname.startsWith('/profile') ? '' : 'grayscale opacity-70'}
              />
              <span className="font-medium text-sm">Hồ sơ</span>
            </Link>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center space-x-3 px-4 py-2.5 text-red-600 hover:bg-red-50 transition-all border border-transparent"
              style={{ clipPath: CLIP_CARD }}
            >
              <LogOut size={22} />
              <span className="font-medium text-sm">Đăng xuất</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

export default LeftSidebar
