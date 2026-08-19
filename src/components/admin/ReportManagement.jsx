import { useState, useEffect, useRef } from 'react'
import {
  MessageSquare, Bug, HelpCircle, AlertTriangle, Clock, CheckCircle,
  X, Send, Trash2, Filter, ChevronDown, ChevronUp, Search, ImagePlus
} from 'lucide-react'
import { useReports } from '../../hooks/useReports'

const CATEGORIES = [
  { value: 'bug', label: 'Lỗi / Bug', icon: Bug, color: 'text-red-500', bg: 'bg-red-50' },
  { value: 'question', label: 'Câu hỏi', icon: HelpCircle, color: 'text-blue-500', bg: 'bg-blue-50' },
  { value: 'suggestion', label: 'Góp ý', icon: MessageSquare, color: 'text-green-500', bg: 'bg-green-50' },
  { value: 'other', label: 'Khác', icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50' }
]

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Chờ xử lý', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'in_progress', label: 'Đang xử lý', color: 'bg-blue-100 text-blue-700' },
  { value: 'resolved', label: 'Đã giải quyết', color: 'bg-green-100 text-green-700' },
  { value: 'closed', label: 'Đã đóng', color: 'bg-gray-100 text-gray-700' }
]

const ReportManagement = () => {
  const { reports, loading, fetchAllReports, fetchMessages, replyToReport, updateReportStatus, deleteReport } = useReports()
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedReport, setExpandedReport] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [replyStatus, setReplyStatus] = useState('resolved')
  const [replying, setReplying] = useState(false)
  const [messages, setMessages] = useState({})
  const [replyAttachment, setReplyAttachment] = useState(null)
  const [replyAttachmentPreview, setReplyAttachmentPreview] = useState(null)
  const adminFileRef = useRef(null)

  const loadMessages = async (reportId) => {
    const msgs = await fetchMessages(reportId)
    setMessages(prev => ({ ...prev, [reportId]: msgs }))
  }

  useEffect(() => {
    fetchAllReports(statusFilter)
  }, [statusFilter])

  const filteredReports = reports.filter(r => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      r.subject?.toLowerCase().includes(q) ||
      r.message?.toLowerCase().includes(q) ||
      r.reporter?.display_name?.toLowerCase().includes(q) ||
      r.reporter?.full_name?.toLowerCase().includes(q) ||
      r.reporter?.email?.toLowerCase().includes(q)
    )
  })

  const handleAdminFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      alert('Chỉ chấp nhận ảnh hoặc video.')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      alert('File tối đa 50MB.')
      return
    }
    setReplyAttachment(file)
    setReplyAttachmentPreview(URL.createObjectURL(file))
  }

  const removeAdminAttachment = () => {
    setReplyAttachment(null)
    setReplyAttachmentPreview(null)
    if (adminFileRef.current) adminFileRef.current.value = ''
  }

  const handleReply = async (reportId) => {
    if (!replyText.trim() && !replyAttachment) return
    try {
      setReplying(true)
      await replyToReport(reportId, replyText.trim() || '(đính kèm)', replyStatus, replyAttachment)
      setReplyText('')
      removeAdminAttachment()
      await loadMessages(reportId)
    } catch (err) {
      alert('Lỗi khi phản hồi: ' + err.message)
    } finally {
      setReplying(false)
    }
  }

  const handleDelete = async (reportId) => {
    if (!confirm('Xóa báo cáo này?')) return
    try {
      await deleteReport(reportId)
    } catch (err) {
      alert('Lỗi khi xóa: ' + err.message)
    }
  }

  const handleStatusChange = async (reportId, newStatus) => {
    try {
      await updateReportStatus(reportId, newStatus)
    } catch (err) {
      alert('Lỗi khi cập nhật: ' + err.message)
    }
  }

  const pendingCount = reports.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATUS_OPTIONS.map(s => {
          const count = reports.filter(r => r.status === s.value).length
          return (
            <button
              key={s.value}
              onClick={() => setStatusFilter(statusFilter === s.value ? 'all' : s.value)}
              className={`p-4 rounded-lg border transition-all ${
                statusFilter === s.value ? 'ring-2 ring-blue-400 border-blue-300' : 'border-gray-200 hover:border-gray-300'
              } bg-white`}
            >
              <div className="text-2xl font-bold text-gray-800">{count}</div>
              <div className={`text-sm font-medium ${s.color.split(' ')[1]}`}>{s.label}</div>
            </button>
          )
        })}
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm p-4 border flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm theo tiêu đề, nội dung, người gửi..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
          />
        </div>
        <button
          onClick={() => { setStatusFilter('all'); setSearchQuery('') }}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Xóa bộ lọc
        </button>
      </div>

      {/* Reports List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="ml-2 text-sm text-gray-500">Đang tải...</span>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            Không có báo cáo nào.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredReports.map(report => {
              const catInfo = CATEGORIES.find(c => c.value === report.category) || CATEGORIES[3]
              const CatIcon = catInfo.icon
              const statusInfo = STATUS_OPTIONS.find(s => s.value === report.status) || STATUS_OPTIONS[0]
              const isExpanded = expandedReport === report.id

              return (
                <div key={report.id} className={`${isExpanded ? 'bg-gray-50' : ''}`}>
                  {/* Report Header Row */}
                  <div
                    className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      const newId = isExpanded ? null : report.id
                      setExpandedReport(newId)
                      setReplyText('')
                      setReplyStatus('resolved')
                      if (newId) loadMessages(newId)
                    }}
                  >
                    {/* Category Icon */}
                    <div className={`w-9 h-9 rounded-lg ${catInfo.bg} flex items-center justify-center flex-shrink-0`}>
                      <CatIcon size={18} className={catInfo.color} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800 truncate">{report.subject}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-medium text-gray-700">
                          {report.reporter?.full_name || report.reporter?.email || 'Unknown'}
                        </span>
                        {report.reporter?.email && (
                          <>
                            <span className="text-xs text-gray-300">·</span>
                            <span className="text-xs text-gray-400">{report.reporter.email}</span>
                          </>
                        )}
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">
                          {new Date(report.created_at).toLocaleDateString('vi-VN', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>

                    {/* Expand Icon */}
                    {isExpanded
                      ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" />
                      : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
                    }
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-gray-100">
                      {/* Message */}
                      <div className="mt-4 p-3 bg-white border border-gray-200 rounded-lg">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{report.message}</p>
                      </div>

                      {/* Attachment */}
                      {report.screenshot_url && (
                        <div className="mt-3">
                          {report.screenshot_url.match(/\.(mp4|webm|mov)$/i) ? (
                            <video src={report.screenshot_url} className="max-h-48 rounded-lg border border-gray-200" controls />
                          ) : (
                            <img src={report.screenshot_url} alt="Attachment" className="max-h-48 rounded-lg border border-gray-200" />
                          )}
                        </div>
                      )}

                      {/* Message Thread */}
                      {(messages[report.id] || []).length > 0 && (
                        <div className="mt-3 space-y-2">
                          {messages[report.id].map(msg => (
                            <div
                              key={msg.id}
                              className={`p-3 rounded-lg ${
                                msg.sender_role === 'admin'
                                  ? 'bg-blue-50 border border-blue-100'
                                  : 'bg-orange-50 border border-orange-100'
                              }`}
                            >
                              <div className={`text-xs font-medium mb-1 ${
                                msg.sender_role === 'admin' ? 'text-blue-700' : 'text-orange-700'
                              }`}>
                                {msg.sender_role === 'admin' ? 'Admin' : report.reporter?.full_name || 'Người dùng'}
                              </div>
                              <p className={`text-sm whitespace-pre-wrap ${
                                msg.sender_role === 'admin' ? 'text-blue-800' : 'text-orange-800'
                              }`}>{msg.message}</p>
                              {msg.attachment_url && (
                                <div className="mt-2">
                                  {msg.attachment_url.match(/\.(mp4|webm|mov)$/i) ? (
                                    <video src={msg.attachment_url} className="max-h-40 rounded-lg border border-gray-200" controls />
                                  ) : (
                                    <img src={msg.attachment_url} alt="" className="max-h-40 rounded-lg border border-gray-200" />
                                  )}
                                </div>
                              )}
                              <div className={`text-xs mt-1 ${
                                msg.sender_role === 'admin' ? 'text-blue-500' : 'text-orange-500'
                              }`}>
                                {new Date(msg.created_at).toLocaleDateString('vi-VN', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit'
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply Form */}
                      <div className="mt-4 space-y-3">
                        <textarea
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          placeholder="Nhập phản hồi cho người dùng..."
                          rows={3}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none resize-none"
                        />
                        <input ref={adminFileRef} type="file" accept="image/*,video/*" onChange={handleAdminFileChange} className="hidden" />
                        {replyAttachmentPreview && (
                          <div className="relative inline-block">
                            {replyAttachment?.type.startsWith('video/') ? (
                              <video src={replyAttachmentPreview} className="max-h-32 rounded-lg border border-gray-200" controls />
                            ) : (
                              <img src={replyAttachmentPreview} alt="Preview" className="max-h-32 rounded-lg border border-gray-200" />
                            )}
                            <button type="button" onClick={removeAdminAttachment} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        )}

                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Attachment button */}
                          <button
                            type="button"
                            onClick={() => adminFileRef.current?.click()}
                            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Đính kèm ảnh/video"
                          >
                            <ImagePlus size={18} />
                          </button>

                          {/* Status select */}
                          <select
                            value={replyStatus}
                            onChange={e => setReplyStatus(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none"
                          >
                            {STATUS_OPTIONS.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>

                          {/* Reply button */}
                          <button
                            onClick={() => handleReply(report.id)}
                            disabled={replying || (!replyText.trim() && !replyAttachment)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {replying ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Send size={14} />
                            )}
                            Phản hồi
                          </button>

                          {/* Quick status change (without reply) */}
                          <div className="flex gap-1 ml-auto">
                            {STATUS_OPTIONS.filter(s => s.value !== report.status).map(s => (
                              <button
                                key={s.value}
                                onClick={() => handleStatusChange(report.id, s.value)}
                                className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${s.color} hover:opacity-80`}
                                title={`Đổi thành: ${s.label}`}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(report.id)}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Xóa báo cáo"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ReportManagement
