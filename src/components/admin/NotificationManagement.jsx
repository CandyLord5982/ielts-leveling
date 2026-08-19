import React, { useState, useEffect } from 'react'
import { Send, Megaphone, Trash2, Users } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import { useCohorts } from '../../hooks/useCohorts'

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

const NotificationManagement = () => {
  const { createAdminAnnouncement, fetchAnnouncements, deleteNotification } = useNotifications()
  const { cohorts } = useCohorts()

  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [targetCohort, setTargetCohort] = useState('')

  useEffect(() => {
    loadAnnouncements()
  }, [])

  const loadAnnouncements = async () => {
    setLoading(true)
    const data = await fetchAnnouncements()
    setAnnouncements(data)
    setLoading(false)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!title.trim() || !message.trim()) return

    setSending(true)
    try {
      await createAdminAnnouncement(title.trim(), message.trim(), targetCohort || null)
      setTitle('')
      setMessage('')
      setTargetCohort('')
      await loadAnnouncements()
    } catch (err) {
      alert('Lỗi: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Xoá thông báo này?')) return
    try {
      await deleteNotification(id)
      setAnnouncements(prev => prev.filter(a => a.id !== id))
    } catch (err) {
      alert('Lỗi: ' + err.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* Create Announcement Form */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Megaphone size={20} className="text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Gửi thông báo</h3>
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="VD: Bảo trì hệ thống"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              rows={3}
              placeholder="Nội dung thông báo..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gửi đến</label>
            <select
              value={targetCohort}
              onChange={(e) => setTargetCohort(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Tất cả người dùng</option>
              {(cohorts || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={sending || !title.trim() || !message.trim()}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Send size={16} />
            {sending ? 'Đang gửi...' : 'Gửi thông báo'}
          </button>
        </form>
      </div>

      {/* Announcement History */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Lịch sử thông báo</h3>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Megaphone size={36} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Chưa có thông báo nào</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-gray-800">{a.title}</h4>
                    {a.cohort_id && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Users size={10} />
                        Cohort
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{a.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(a.created_at)}</p>
                </div>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="p-2 hover:bg-gray-200 rounded-lg ml-3"
                  title="Xoá"
                >
                  <Trash2 size={16} className="text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default NotificationManagement
