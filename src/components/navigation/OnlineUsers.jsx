import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { assetUrl } from '../../hooks/useBranding'
import AvatarWithFrame from '../ui/AvatarWithFrame'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import PvPChallengeModal from '../pvp/PvPChallengeModal'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'

// Key lưu trạng thái collapsed
const RIGHT_SIDEBAR_COLLAPSED_KEY = 'right_sidebar_collapsed'

/** Tooltip hiển thị bên trái khi hover vào avatar lúc sidebar thu gọn */
const TooltipLeft = ({ label, children }) => {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef(null)

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({ top: rect.top + rect.height / 2, left: rect.left })
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
        <div
          className="fixed mr-3 px-2.5 py-1 rounded-md text-xs font-medium text-white bg-gray-800 whitespace-nowrap shadow-lg z-[100] pointer-events-none"
          style={{ top: pos.top, left: pos.left, transform: 'translate(-100%, -50%)' }}
        >
          {label}
          <span className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-800" />
        </div>
      )}
    </div>
  )
}

const OnlineUsers = ({ onCollapsedChange }) => {
  const { user, profile } = useAuth()
  const [onlineUsers, setOnlineUsers] = useState([])
  const [offlineUsers, setOfflineUsers] = useState([])
  const [challengeTarget, setChallengeTarget] = useState(null)
  const [pendingChallengeUserIds, setPendingChallengeUserIds] = useState({})

  // Trạng thái thu gọn/mở rộng
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(RIGHT_SIDEBAR_COLLAPSED_KEY) === 'true' } catch { return false }
  })

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(RIGHT_SIDEBAR_COLLAPSED_KEY, String(next)) } catch {}
      return next
    })
  }

  useEffect(() => {
    onCollapsedChange?.(collapsed)
  }, [collapsed, onCollapsedChange])

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data, error } = await supabase
          .from('users')
          .select('id, full_name, avatar_url, role, last_seen_at, user_equipment(active_title, active_frame_ratio, hide_frame)')
          .gte('last_seen_at', twentyFourHoursAgo)
          .order('last_seen_at', { ascending: false })
          .limit(40)
        if (!error && data) {
          const flat = data.map(u => {
            const { user_equipment, ...rest } = u
            return { ...rest, ...user_equipment }
          })
          const online = []
          const offline = []
          flat.forEach(u => {
            if (u.last_seen_at >= fiveMinutesAgo) {
              online.push(u)
            } else {
              offline.push(u)
            }
          })
          setOnlineUsers(online)
          setOfflineUsers(offline)
        }
      } catch (err) {
        console.error('Error fetching online users:', err)
      }
    }
    fetchUsers()
    const interval = setInterval(fetchUsers, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    const fetchPending = async () => {
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('pvp_challenges')
        .select('challenger_id, opponent_id')
        .in('status', ['pending', 'in_progress'])
        .gte('created_at', since)
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
      if (data) {
        const map = {}
        data.forEach(c => {
          if (c.challenger_id === user.id) {
            map[c.opponent_id] = 'sent'
          } else {
            map[c.challenger_id] = 'received'
          }
        })
        setPendingChallengeUserIds(map)
      }
    }
    fetchPending()
    const interval = setInterval(fetchPending, 30000)
    return () => clearInterval(interval)
  }, [user?.id])

  const sidebarWidth = collapsed ? 'w-[60px]' : 'w-56'

  return (
    <>
      <div className={`hidden xl:flex flex-col fixed top-0 right-0 h-full ${sidebarWidth} bg-white border-l border-gray-200 z-30 transition-all duration-300 ease-in-out`}>
        {/* Header */}
        <div className={`flex items-center ${collapsed ? 'justify-center py-4 px-2' : 'justify-between p-4'} border-b border-gray-100 flex-shrink-0`}>
          {!collapsed && (
            <span className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
              <Users size={16} className="text-blue-500" />
              <span>Cộng đồng</span>
            </span>
          )}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Mở rộng' : 'Thu gọn'}
            className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 bg-white shadow-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:shadow-md transition-all"
          >
            {collapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto ${collapsed ? 'px-1 py-2' : 'p-4'}`}>
          {onlineUsers.length === 0 && offlineUsers.length === 0 ? (
            <div className={`text-center text-gray-400 ${collapsed ? 'text-xs mt-4' : 'text-sm mt-4'}`}>
              {collapsed ? <Users size={20} className="mx-auto opacity-50" /> : 'Không có ai online'}
            </div>
          ) : (
            <>
              {/* Online Section */}
              {onlineUsers.length > 0 && (
                <>
                  {!collapsed && (
                    <div className="mb-2">
                      <span className="text-xs font-semibold text-green-600 uppercase tracking-wider">Online ({onlineUsers.length})</span>
                    </div>
                  )}
                  <div className="space-y-1">
                    {[...onlineUsers].sort((a, b) => {
                      const aP = pendingChallengeUserIds[a.id] === 'received' ? 0 : pendingChallengeUserIds[a.id] === 'sent' ? 1 : 2
                      const bP = pendingChallengeUserIds[b.id] === 'received' ? 0 : pendingChallengeUserIds[b.id] === 'sent' ? 1 : 2
                      return aP - bP
                    }).map((u) => {
                      const avatarEl = (
                        <div className="relative flex-shrink-0">
                          <AvatarWithFrame
                            avatarUrl={u.avatar_url}
                            frameUrl={u.hide_frame ? null : u.active_title}
                            frameRatio={u.active_frame_ratio}
                            size={40}
                            fallback={u.full_name?.[0]?.toUpperCase() || '?'}
                          />
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white z-10" />
                        </div>
                      )

                      const pendingState = pendingChallengeUserIds[u.id]

                      if (collapsed) {
                        return (
                          <TooltipLeft key={u.id} label={`${u.full_name || 'Ẩn danh'} (Online)`}>
                            <Link to={`/profile/${u.id}`} className="flex justify-center py-2 relative w-full">
                              {avatarEl}
                              {pendingState === 'received' && (
                                <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                              )}
                            </Link>
                          </TooltipLeft>
                        )
                      }

                      return (
                        <div key={u.id} className="flex items-center hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors group">
                          <Link to={`/profile/${u.id}`} className="flex items-center space-x-2.5 flex-1 min-w-0">
                            {avatarEl}
                            <span className="text-sm font-medium text-gray-700 truncate">{u.full_name || 'Ẩn danh'}</span>
                          </Link>
                          {u.id !== user?.id && !profile?.is_banned && u.role !== 'admin' && (
                            <button
                              onClick={() => setChallengeTarget(u)}
                              className={`flex-shrink-0 p-1.5 rounded-lg transition-all ${pendingState ? (pendingState === 'received' ? 'opacity-100 animate-pulse text-red-500 hover:bg-red-50' : 'opacity-100 text-gray-400 hover:bg-gray-100') : 'opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50'}`}
                              title={pendingState === 'received' ? 'Có lời mời!' : pendingState === 'sent' ? 'Đã gửi lời mời' : 'Thách đấu PvP!'}
                            >
                              <img src={assetUrl('/icon/dashboard/pvp.png')} alt="PvP" className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Offline Section */}
              {offlineUsers.length > 0 && (
                <>
                  {!collapsed && (
                    <div className="mt-6 mb-2 border-t border-gray-100 pt-4">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recently Online ({offlineUsers.length})</span>
                    </div>
                  )}
                  {collapsed && onlineUsers.length > 0 && (
                    <div className="my-2 border-t border-gray-100 mx-2" />
                  )}
                  <div className="space-y-1">
                    {[...offlineUsers].sort((a, b) => {
                      const aP = pendingChallengeUserIds[a.id] === 'received' ? 0 : pendingChallengeUserIds[a.id] === 'sent' ? 1 : 2
                      const bP = pendingChallengeUserIds[b.id] === 'received' ? 0 : pendingChallengeUserIds[b.id] === 'sent' ? 1 : 2
                      return aP - bP
                    }).map((u) => {
                      const avatarEl = (
                        <div className="relative flex-shrink-0 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all">
                          <AvatarWithFrame
                            avatarUrl={u.avatar_url}
                            frameUrl={u.hide_frame ? null : u.active_title}
                            frameRatio={u.active_frame_ratio}
                            size={40}
                            fallback={u.full_name?.[0]?.toUpperCase() || '?'}
                          />
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-gray-300 rounded-full border-2 border-white z-10" />
                        </div>
                      )

                      const pendingState = pendingChallengeUserIds[u.id]

                      if (collapsed) {
                        return (
                          <TooltipLeft key={u.id} label={`${u.full_name || 'Ẩn danh'} (Offline)`}>
                            <Link to={`/profile/${u.id}`} className="flex justify-center py-2 relative w-full">
                              {avatarEl}
                              {pendingState === 'received' && (
                                <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                              )}
                            </Link>
                          </TooltipLeft>
                        )
                      }

                      return (
                        <div key={u.id} className="flex items-center hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors group">
                          <Link to={`/profile/${u.id}`} className="flex items-center space-x-2.5 flex-1 min-w-0">
                            {avatarEl}
                            <span className="text-sm text-gray-500 truncate">{u.full_name || 'Ẩn danh'}</span>
                          </Link>
                          {u.id !== user?.id && !profile?.is_banned && u.role !== 'admin' && pendingState && (
                            <button
                              onClick={() => setChallengeTarget(u)}
                              className={`flex-shrink-0 p-1.5 rounded-lg transition-all ${pendingState === 'received' ? 'opacity-100 animate-pulse text-red-500 hover:bg-red-50' : 'opacity-100 text-gray-400 hover:bg-gray-100'}`}
                              title={pendingState === 'received' ? 'Có lời mời!' : 'Đã gửi lời mời'}
                            >
                              <img src={assetUrl('/icon/dashboard/pvp.png')} alt="PvP" className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {challengeTarget && (
        <PvPChallengeModal
          opponent={challengeTarget}
          onClose={() => setChallengeTarget(null)}
        />
      )}
    </>
  )
}

export default OnlineUsers
