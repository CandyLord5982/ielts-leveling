import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useStudentLevels } from '../../hooks/useStudentLevels'
import {
  LogOut,
  Shield,
  GraduationCap,
  ShoppingBag,
  MessageSquarePlus,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { useInventory } from '../../hooks/useInventory'
import { FEATURES } from '../../config/features'
import { useMissions } from '../../hooks/useMissions'
import { useNotifications } from '../../hooks/useNotifications'
import NotificationPanel from '../notifications/NotificationPanel'

import { assetUrl, useBranding } from '../../hooks/useBranding'

const CLIP_CARD = 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)'

// Key lưu trạng thái collapsed vào localStorage
const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed'

/** Tooltip nhỏ hiện bên phải khi hover vào item lúc sidebar thu gọn */
const Tooltip = ({ label, children }) => {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef(null)

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      // Tính vị trí cố định (fixed) so với màn hình
      setPos({ top: rect.top + rect.height / 2, left: rect.right })
    }
    setVisible(true)
  }

  return (
    <div
      ref={ref}
      className="relative flex items-center w-full justify-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        // Dùng fixed position để tránh bị cắt bởi overflow-hidden của sidebar
        <div
          className="fixed ml-3 px-2.5 py-1 rounded-md text-xs font-medium text-white bg-gray-800 whitespace-nowrap shadow-lg z-[100] pointer-events-none"
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-50%)' }}
        >
          {label}
          {/* Mũi tên nhỏ bên trái tooltip */}
          <span
            className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-800"
          />
        </div>
      )}
    </div>
  )
}

const LeftSidebar = ({ onOpenReport, onCollapsedChange }) => {
  const { profile, signOut, isAdmin, isTeacher } = useAuth()
  const { branding } = useBranding()
  const { currentBadge } = useStudentLevels()
  const { newItemCount } = useInventory()
  const { unclaimedCount: missionBadge } = useMissions()
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const notifRef = useRef(null)
  const location = useLocation()

  // Trạng thái thu gọn/mở rộng — lưu vào localStorage để nhớ khi F5
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true' } catch { return false }
  })

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)) } catch {}
      return next
    })
  }

  // Thông báo ra ngoài Layout khi trạng thái thay đổi
  useEffect(() => {
    onCollapsedChange?.(collapsed)
  }, [collapsed, onCollapsedChange])

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
    FEATURES.pets && { path: '/pets', label: 'Thú cưng', imageSrc: assetUrl('/icon/navigation/pet.svg') },
    FEATURES.inventory && { path: '/inventory', imageSrc: assetUrl('/icon/navigation/inventory.svg'), label: 'Kho đồ', badge: newItemCount },
    FEATURES.missions && { path: '/missions', imageSrc: assetUrl('/icon/navigation/mission.svg'), label: 'Nhiệm vụ', badge: missionBadge },
    { path: '/progress', imageSrc: assetUrl('/icon/navigation/progress.svg'), label: 'Tiến độ' },
    FEATURES.shop && { path: '/shop', imageSrc: assetUrl('/icon/navigation/shop.svg'), label: 'Cửa hàng' },
  ].filter(Boolean)

  const handleSignOut = async () => {
    await signOut()
  }

  // Chiều rộng sidebar
  const sidebarWidth = collapsed ? 'w-[60px]' : 'w-64'

  /** Render một nav item — dạng full hoặc icon-only với tooltip */
  const NavItem = ({ path, imageSrc, emoji, label, icon, iconComponent: IconComp, badge }) => {
    const isActive = location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'))

    const iconEl = (
      <div className="relative flex-shrink-0">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt=""
            width={22}
            height={22}
            className={`${isActive ? '' : 'grayscale opacity-70'} ${badge > 0 ? 'animate-[pulse_1.5s_ease-in-out_infinite]' : ''}`}
          />
        ) : emoji ? (
          <span className="text-2xl">{emoji}</span>
        ) : IconComp ? (
          <IconComp size={22} className={isActive ? '' : 'opacity-70'} />
        ) : icon === 'ShoppingBag' ? (
          <ShoppingBag size={22} className={isActive ? '' : 'opacity-70'} />
        ) : null}
        {badge > 0 && (
          <span
            className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center"
            style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
          >
            {badge}
          </span>
        )}
      </div>
    )

    const baseClass = `flex items-center transition-all ${
      isActive
        ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200'
        : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50 border border-transparent'
    }`

    if (collapsed) {
      return (
        <Tooltip label={label}>
          <Link
            to={path}
            className={`${baseClass} justify-center w-full py-2.5 px-0`}
            style={{ clipPath: CLIP_CARD }}
          >
            {iconEl}
          </Link>
        </Tooltip>
      )
    }

    return (
      <Link
        to={path}
        className={`${baseClass} space-x-3 px-4 py-2.5`}
        style={{ clipPath: CLIP_CARD }}
      >
        {iconEl}
        <span className="font-medium text-sm truncate">{label}</span>
      </Link>
    )
  }

  /** Nút action (button) — dạng full hoặc icon-only với tooltip */
  const ActionButton = ({ onClick, iconEl, label, className = '' }) => {
    if (collapsed) {
      return (
        <Tooltip label={label}>
          <button
            onClick={onClick}
            className={`w-full flex items-center justify-center py-2.5 px-0 transition-all border border-transparent ${className}`}
            style={{ clipPath: CLIP_CARD }}
          >
            {iconEl}
          </button>
        </Tooltip>
      )
    }
    return (
      <button
        onClick={onClick}
        className={`w-full flex items-center space-x-3 px-4 py-2.5 transition-all border border-transparent ${className}`}
        style={{ clipPath: CLIP_CARD }}
      >
        {iconEl}
        <span className="font-medium text-sm">{label}</span>
      </button>
    )
  }

  return (
    <>
      {/* Sidebar - Desktop only */}
      <aside
        className={`hidden lg:flex flex-col fixed top-0 left-0 h-full ${sidebarWidth} bg-white border-r border-gray-200 z-40 transition-all duration-300 ease-in-out overflow-hidden`}
      >
        {/* Header: Logo + Toggle button */}
        <div className={`flex items-center ${collapsed ? 'justify-center py-4 px-2' : 'justify-between p-4'} flex-shrink-0`}>
          {!collapsed && (
            <Link to="/" className="flex items-center space-x-2 min-w-0">
              <img src={branding.logoUrl} alt="Logo" className="h-10 w-auto flex-shrink-0" />
              <span className="text-lg font-semibold text-gray-900 tracking-wide truncate">{branding.appName}</span>
            </Link>
          )}
          {collapsed && (
            <Link to="/">
              <img src={branding.logoUrl} alt="Logo" className="h-8 w-auto" />
            </Link>
          )}
          {/* Nút toggle */}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
            className={`${collapsed ? 'mt-2' : ''} flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 bg-white shadow-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:shadow-md transition-all`}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto ${collapsed ? 'px-1 py-2' : 'p-4'} space-y-1`}>
          {navItems.map((item) => (
            <NavItem key={item.path} {...item} />
          ))}

          {/* Admin Panel Link */}
          {isAdmin() && (
            collapsed ? (
              <Tooltip label="Admin">
                <Link
                  to="/admin"
                  className={`flex items-center justify-center w-full py-2.5 px-0 transition-all ${
                    location.pathname.startsWith('/admin')
                      ? 'bg-purple-50 text-purple-700 font-medium border border-purple-200'
                      : 'text-purple-600 hover:bg-purple-50 border border-transparent'
                  }`}
                  style={{ clipPath: CLIP_CARD }}
                >
                  <Shield size={22} />
                </Link>
              </Tooltip>
            ) : (
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
            )
          )}

          {/* Teacher Dashboard Link */}
          {(isTeacher() || isAdmin()) && (
            collapsed ? (
              <Tooltip label="Teacher">
                <Link
                  to="/teacher"
                  className={`flex items-center justify-center w-full py-2.5 px-0 transition-all ${
                    location.pathname.startsWith('/teacher')
                      ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200'
                      : 'text-blue-600 hover:bg-blue-50 border border-transparent'
                  }`}
                  style={{ clipPath: CLIP_CARD }}
                >
                  <GraduationCap size={22} />
                </Link>
              </Tooltip>
            ) : (
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
            )
          )}
        </nav>

        {/* User Badge & XP */}
        {profile && currentBadge && !collapsed && (
          <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
            <div
              className="flex items-center space-x-3 p-3 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100"
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
                <div className="text-sm font-semibold text-gray-900">{currentBadge.name}</div>
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

        {/* Collapsed badge icon only */}
        {profile && currentBadge && collapsed && (
          <Tooltip label={`${currentBadge.name} · ${profile.xp || 0} XP`}>
            <div className="flex justify-center py-2 border-b border-gray-200 flex-shrink-0 w-full cursor-default">
              {currentBadge.icon.startsWith('http') ? (
                <img src={currentBadge.icon} alt={currentBadge.name} className="w-8 h-8 object-contain" />
              ) : (
                <span className="text-xl">{currentBadge.icon}</span>
              )}
            </div>
          </Tooltip>
        )}

        {/* Bottom Actions */}
        <div className={`${collapsed ? 'px-1 py-2' : 'p-4'} border-t border-gray-200 space-y-1 flex-shrink-0`}>
          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <ActionButton
              onClick={() => setShowNotifPanel(!showNotifPanel)}
              label="Thông báo"
              className={showNotifPanel ? 'bg-blue-50 text-blue-700 font-medium !border-blue-200' : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'}
              iconEl={
                <div className="relative flex-shrink-0">
                  <img
                    src={assetUrl('/icon/navigation/notification.svg')}
                    alt=""
                    width={22}
                    height={22}
                    className={showNotifPanel ? '' : 'grayscale opacity-70'}
                  />
                  {unreadCount > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center"
                      style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
              }
            />

            {showNotifPanel && (
              <div className={`fixed ${collapsed ? 'left-[68px]' : 'left-64'} bottom-4 w-96 z-50`}>
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

          <ActionButton
            onClick={onOpenReport}
            label="Báo cáo"
            className="text-orange-600 hover:bg-orange-50"
            iconEl={<MessageSquarePlus size={22} className="flex-shrink-0" />}
          />

          {/* Profile link */}
          {collapsed ? (
            <Tooltip label="Hồ sơ">
              <Link
                to="/profile"
                className={`flex items-center justify-center w-full py-2.5 px-0 transition-all ${
                  location.pathname.startsWith('/profile')
                    ? 'bg-gray-100 text-gray-900 font-medium border border-gray-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-transparent'
                }`}
                style={{ clipPath: CLIP_CARD }}
              >
                <img
                  src={assetUrl('/icon/navigation/account.svg')}
                  alt=""
                  width={22}
                  height={22}
                  className={location.pathname.startsWith('/profile') ? '' : 'grayscale opacity-70'}
                />
              </Link>
            </Tooltip>
          ) : (
            <Link
              to="/profile"
              className={`flex items-center space-x-3 px-4 py-2.5 transition-all ${
                location.pathname.startsWith('/profile')
                  ? 'bg-gray-100 text-gray-900 font-medium border border-gray-200'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-transparent'
              }`}
              style={{ clipPath: CLIP_CARD }}
            >
              <img
                src={assetUrl('/icon/navigation/account.svg')}
                alt=""
                width={22}
                height={22}
                className={location.pathname.startsWith('/profile') ? '' : 'grayscale opacity-70'}
              />
              <span className="font-medium text-sm">Hồ sơ</span>
            </Link>
          )}

          <ActionButton
            onClick={handleSignOut}
            label="Đăng xuất"
            className="text-red-600 hover:bg-red-50"
            iconEl={<LogOut size={22} className="flex-shrink-0" />}
          />
        </div>
      </aside>
    </>
  )
}

export default LeftSidebar
