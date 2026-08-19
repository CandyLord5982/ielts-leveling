import { X, Megaphone } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'

const NotificationModal = () => {
  const { notifications, markAsRead } = useNotifications()

  // Find the latest unread admin announcement
  const latestAnnouncement = notifications.find(
    n => !n.is_read && n.type === 'admin_announcement'
  )

  if (!latestAnnouncement) return null

  const handleDismiss = () => {
    markAsRead(latestAnnouncement.id)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={handleDismiss}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-green-50 border-b border-green-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
              <Megaphone size={16} />
            </div>
            <span className="font-semibold text-green-800 text-sm">Thông báo</span>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-full hover:bg-green-100 text-green-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5">
          <h3 className="font-bold text-gray-900 text-lg mb-2">{latestAnnouncement.title}</h3>
          <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{latestAnnouncement.message}</p>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={handleDismiss}
            className="w-full py-2.5 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  )
}

export default NotificationModal
