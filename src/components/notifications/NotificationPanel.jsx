import { useState } from 'react'
import { CheckCheck, Trophy, TrendingUp, Flame, Megaphone, Gift, Package, Star } from 'lucide-react'

const iconMap = {
  Trophy: Trophy,
  TrendingUp: TrendingUp,
  Flame: Flame,
  Megaphone: Megaphone,
  Gift: Gift,
  Package: Package,
  Star: Star
}

const typeColors = {
  achievement_earned: 'bg-yellow-100 text-yellow-600',
  level_up: 'bg-purple-100 text-purple-600',
  streak_milestone: 'bg-red-100 text-red-600',
  daily_challenge_result: 'bg-blue-100 text-blue-600',
  admin_announcement: 'bg-green-100 text-green-600',
  giftcode_redeemed: 'bg-pink-100 text-pink-600',
  chest_received: 'bg-orange-100 text-orange-600',
  item_drop: 'bg-indigo-100 text-indigo-600',
  competition_winner: 'bg-amber-100 text-amber-600'
}

const typeIcons = {
  achievement_earned: 'Trophy',
  level_up: 'TrendingUp',
  streak_milestone: 'Flame',
  daily_challenge_result: 'Trophy',
  admin_announcement: 'Megaphone',
  giftcode_redeemed: 'Gift',
  chest_received: 'Package',
  item_drop: 'Star',
  competition_winner: 'Trophy'
}

const getRelativeTime = (dateStr) => {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Vừa xong'
  if (diffMin < 60) return `${diffMin} phút trước`
  if (diffHour < 24) return `${diffHour} giờ trước`
  if (diffDay < 7) return `${diffDay} ngày trước`
  return date.toLocaleDateString('vi-VN')
}

const NotificationPanel = ({ notifications, onMarkAsRead, onMarkAllAsRead, onClose, className = '' }) => {
  const [expandedId, setExpandedId] = useState(null)

  const handleItemClick = (notif) => {
    if (!notif.is_read) {
      onMarkAsRead(notif.id)
    }
    setExpandedId(prev => prev === notif.id ? null : notif.id)
  }

  return (
    <div className={`bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden ${className || 'absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-96'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-800">Thông báo</h3>
        {notifications.some(n => !n.is_read) && (
          <button
            onClick={onMarkAllAsRead}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            <CheckCheck size={14} />
            Đánh dấu tất cả đã đọc
          </button>
        )}
      </div>

      {/* Notification List */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Megaphone size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Chưa có thông báo nào</p>
          </div>
        ) : (
          notifications.map((notif) => {
            const iconName = notif.icon || typeIcons[notif.type] || 'Star'
            const IconComponent = iconMap[iconName] || Star
            const colorClass = typeColors[notif.type] || 'bg-gray-100 text-gray-600'

            return (
              <div
                key={notif.id}
                onClick={() => handleItemClick(notif)}
                className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 ${
                  !notif.is_read ? 'bg-blue-50/50' : ''
                }`}
              >
                {/* Icon */}
                <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${colorClass}`}>
                  <IconComponent size={16} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-tight ${!notif.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                      {notif.title}
                    </p>
                    {!notif.is_read && (
                      <span className="flex-shrink-0 w-2 h-2 mt-1.5 bg-blue-500 rounded-full" />
                    )}
                  </div>
                  <p className={`text-xs text-gray-500 mt-0.5 ${expandedId === notif.id ? '' : 'line-clamp-2'}`}>{notif.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{getRelativeTime(notif.created_at)}</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default NotificationPanel
