import { useState, useRef } from 'react'
import { X, Send, Bug, HelpCircle, MessageSquare, AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp, ImagePlus, Trash2 } from 'lucide-react'
import { useReports } from '../../hooks/useReports'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'

const CATEGORIES = [
  { value: 'bug', label: 'Lỗi / Bug', icon: Bug, color: 'text-red-500' },
  { value: 'question', label: 'Câu hỏi', icon: HelpCircle, color: 'text-blue-500' },
  { value: 'suggestion', label: 'Góp ý', icon: MessageSquare, color: 'text-green-500' },
  { value: 'other', label: 'Khác', icon: AlertTriangle, color: 'text-yellow-500' }
]

const STATUS_LABELS = {
  pending: { label: 'Chờ xử lý', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  in_progress: { label: 'Đang xử lý', color: 'bg-blue-100 text-blue-700', icon: Clock },
  resolved: { label: 'Đã giải quyết', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  closed: { label: 'Đã đóng', color: 'bg-gray-100 text-gray-700', icon: X }
}

const buildContextFooter = (ctx) => {
  if (!ctx) return ''
  const folderLine = ctx.folderPath
    ? `Vị trí trong Exercise Bank: ${ctx.folderPath}${ctx.exerciseTitle ? ` / ${ctx.exerciseTitle}` : ''}`
    : (ctx.inBank === false
        ? `Vị trí: KHÔNG có trong Exercise Bank (exercise riêng của session)`
        : (ctx.exerciseTitle ? `Exercise: ${ctx.exerciseTitle}` : null))
  const lines = [
    '',
    '---',
    '[Context — auto-added]',
    folderLine,
    ctx.exerciseType ? `Type: ${ctx.exerciseType}` : null,
    (ctx.questionIndex !== undefined && ctx.questionIndex !== null) ? `Question #${ctx.questionIndex + 1}${ctx.questionPreview ? `: ${ctx.questionPreview}` : ''}` : (ctx.questionPreview ? `Question: ${ctx.questionPreview}` : null),
    ctx.userAnswer !== undefined && ctx.userAnswer !== null && ctx.userAnswer !== '' ? `User answer: ${typeof ctx.userAnswer === 'string' ? ctx.userAnswer : JSON.stringify(ctx.userAnswer)}` : null
  ].filter(Boolean)
  return lines.join('\n')
}

const ReportModal = ({ isOpen, onClose, prefill = null, attachmentRequired = true, contextInfo = null }) => {
  const { myReports, submitReport, fetchMyReports, fetchMessages, userReplyToReport, loading } = useReports()
  const { user } = useAuth()
  const [tab, setTab] = useState('new') // 'new' | 'history'
  const [category, setCategory] = useState(prefill?.category || 'bug')
  const [subject, setSubject] = useState(prefill?.subject || '')
  const [message, setMessage] = useState(prefill?.message || '')
  const [attachment, setAttachment] = useState(null) // File object
  const [attachmentPreview, setAttachmentPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [expandedReport, setExpandedReport] = useState(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [userReplyText, setUserReplyText] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [messages, setMessages] = useState({}) // { reportId: [messages] }
  const [replyAttachment, setReplyAttachment] = useState(null)
  const [replyAttachmentPreview, setReplyAttachmentPreview] = useState(null)
  const replyFileRef = useRef(null)
  const fileInputRef = useRef(null)

  if (!isOpen) return null

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) {
      alert('Chỉ chấp nhận ảnh hoặc video.')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      alert('File tối đa 50MB.')
      return
    }
    setAttachment(file)
    setAttachmentPreview(URL.createObjectURL(file))
  }

  const removeAttachment = () => {
    setAttachment(null)
    setAttachmentPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) return
    if (attachmentRequired && !attachment) return

    try {
      setSubmitting(true)

      let screenshotUrl = null
      if (attachment) {
        const ext = attachment.name.split('.').pop()
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('report-attachments')
          .upload(path, attachment, { cacheControl: '3600', upsert: false })
        if (uploadError) throw uploadError

        const { data: publicData } = supabase.storage
          .from('report-attachments')
          .getPublicUrl(path)
        screenshotUrl = publicData.publicUrl
      }

      const finalMessage = message.trim() + buildContextFooter(contextInfo)

      await submitReport({
        category,
        subject: subject.trim(),
        message: finalMessage,
        screenshotUrl
      })
      setSuccess(true)
      setSubject(prefill?.subject || '')
      setMessage(prefill?.message || '')
      setCategory(prefill?.category || 'bug')
      removeAttachment()
      setTimeout(() => {
        setSuccess(false)
        if (contextInfo) onClose?.()
      }, 1500)
    } catch (err) {
      alert('Gửi báo cáo thất bại: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const loadMessages = async (reportId) => {
    const msgs = await fetchMessages(reportId)
    setMessages(prev => ({ ...prev, [reportId]: msgs }))
  }

  const handleReplyFileChange = (e) => {
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

  const removeReplyAttachment = () => {
    setReplyAttachment(null)
    setReplyAttachmentPreview(null)
    if (replyFileRef.current) replyFileRef.current.value = ''
  }

  const handleUserReply = async (reportId) => {
    if (!userReplyText.trim() && !replyAttachment) return
    try {
      setReplyingTo(reportId)
      await userReplyToReport(reportId, userReplyText.trim() || '(đính kèm)', replyAttachment)
      setUserReplyText('')
      removeReplyAttachment()
      setReplyingTo(null)
      await loadMessages(reportId)
    } catch (err) {
      alert('Gửi phản hồi thất bại: ' + err.message)
      setReplyingTo(null)
    }
  }

  const handleTabSwitch = (newTab) => {
    setTab(newTab)
    if (newTab === 'history' && !historyLoaded) {
      fetchMyReports()
      setHistoryLoaded(true)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-orange-50 border-b border-orange-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
              <MessageSquare size={16} />
            </div>
            <span className="font-semibold text-orange-800 text-sm">Gửi báo cáo / Hỏi đáp</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-orange-100 text-orange-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => handleTabSwitch('new')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === 'new'
                ? 'text-orange-600 border-b-2 border-orange-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Gửi mới
          </button>
          <button
            onClick={() => handleTabSwitch('history')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === 'history'
                ? 'text-orange-600 border-b-2 border-orange-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Lịch sử
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'new' ? (
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {success && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  <CheckCircle size={16} />
                  Gửi báo cáo thành công! Admin sẽ phản hồi sớm.
                </div>
              )}

              {contextInfo && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-0.5">
                  <div className="font-semibold text-blue-900 mb-1">Báo cáo về câu hỏi</div>
                  {contextInfo.folderPath ? (
                    <div>
                      <span className="font-medium">Vị trí:</span> {contextInfo.folderPath}
                      {contextInfo.exerciseTitle && <> / <span className="font-semibold">{contextInfo.exerciseTitle}</span></>}
                    </div>
                  ) : contextInfo.inBank === false ? (
                    <div className="text-amber-700"><span className="font-medium">Vị trí:</span> không có trong Exercise Bank</div>
                  ) : contextInfo.exerciseTitle && (
                    <div><span className="font-medium">Bài tập:</span> {contextInfo.exerciseTitle}</div>
                  )}
                  {contextInfo.exerciseType && (
                    <div><span className="font-medium">Loại:</span> {contextInfo.exerciseType}</div>
                  )}
                  {(contextInfo.questionIndex !== undefined && contextInfo.questionIndex !== null) && (
                    <div><span className="font-medium">Câu số:</span> #{contextInfo.questionIndex + 1}</div>
                  )}
                  {contextInfo.questionPreview && (
                    <div className="truncate"><span className="font-medium">Nội dung:</span> {contextInfo.questionPreview}</div>
                  )}
                </div>
              )}

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Loại báo cáo</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map(cat => {
                    const Icon = cat.icon
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setCategory(cat.value)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                          category === cat.value
                            ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <Icon size={16} className={cat.color} />
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Mô tả ngắn gọn vấn đề..."
                  maxLength={200}
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung chi tiết</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Mô tả chi tiết vấn đề bạn gặp phải..."
                  rows={4}
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none resize-none"
                />
              </div>

              {/* Attachment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ảnh / Video {attachmentRequired ? <span className="text-red-500">*</span> : <span className="text-gray-400 text-xs font-normal">(tuỳ chọn)</span>}
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {attachmentPreview ? (
                  <div className="relative inline-block">
                    {attachment?.type.startsWith('video/') ? (
                      <video src={attachmentPreview} className="max-h-40 rounded-lg border border-gray-200" controls />
                    ) : (
                      <img src={attachmentPreview} alt="Preview" className="max-h-40 rounded-lg border border-gray-200" />
                    )}
                    <button
                      type="button"
                      onClick={removeAttachment}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-6 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-orange-400 hover:text-orange-500 transition-colors flex flex-col items-center gap-1"
                  >
                    <ImagePlus size={24} />
                    <span className="text-sm">Nhấn để chọn ảnh hoặc video</span>
                  </button>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || !subject.trim() || !message.trim() || (attachmentRequired && !attachment)}
                className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                {submitting ? 'Đang gửi...' : 'Gửi báo cáo'}
              </button>
            </form>
          ) : (
            <div className="p-5">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : myReports.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  Bạn chưa gửi báo cáo nào.
                </div>
              ) : (
                <div className="space-y-3">
                  {myReports.map(report => {
                    const statusInfo = STATUS_LABELS[report.status] || STATUS_LABELS.pending
                    const StatusIcon = statusInfo.icon
                    const catInfo = CATEGORIES.find(c => c.value === report.category) || CATEGORIES[3]
                    const CatIcon = catInfo.icon
                    const isExpanded = expandedReport === report.id

                    return (
                      <div key={report.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => {
                            const newId = isExpanded ? null : report.id
                            setExpandedReport(newId)
                            setUserReplyText('')
                            if (newId) loadMessages(newId)
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                        >
                          <CatIcon size={16} className={catInfo.color} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{report.subject}</div>
                            <div className="text-xs text-gray-500">
                              {new Date(report.created_at).toLocaleDateString('vi-VN')}
                            </div>
                          </div>
                          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                            <StatusIcon size={12} />
                            {statusInfo.label}
                          </span>
                          {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-gray-100">
                            {/* Original message */}
                            <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap">{report.message}</p>
                            {report.screenshot_url && (
                              <div className="mt-2">
                                {report.screenshot_url.match(/\.(mp4|webm|mov)$/i) ? (
                                  <video src={report.screenshot_url} className="max-h-40 rounded-lg border border-gray-200" controls />
                                ) : (
                                  <img src={report.screenshot_url} alt="Attachment" className="max-h-40 rounded-lg border border-gray-200" />
                                )}
                              </div>
                            )}

                            {/* Message thread */}
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
                                      {msg.sender_role === 'admin' ? 'Admin' : 'Bạn'}
                                    </div>
                                    <p className={`text-sm whitespace-pre-wrap ${
                                      msg.sender_role === 'admin' ? 'text-blue-800' : 'text-orange-800'
                                    }`}>{msg.message}</p>
                                    {msg.attachment_url && (
                                      <div className="mt-2">
                                        {msg.attachment_url.match(/\.(mp4|webm|mov)$/i) ? (
                                          <video src={msg.attachment_url} className="max-h-32 rounded-lg border border-gray-200" controls />
                                        ) : (
                                          <img src={msg.attachment_url} alt="" className="max-h-32 rounded-lg border border-gray-200" />
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

                            {/* Reply input */}
                            <div className="mt-3">
                              <textarea
                                value={userReplyText}
                                onChange={e => setUserReplyText(e.target.value)}
                                placeholder="Nhập phản hồi của bạn..."
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none resize-none"
                              />
                              <input ref={replyFileRef} type="file" accept="image/*,video/*" onChange={handleReplyFileChange} className="hidden" />
                              {replyAttachmentPreview && (
                                <div className="mt-2 relative inline-block">
                                  {replyAttachment?.type.startsWith('video/') ? (
                                    <video src={replyAttachmentPreview} className="max-h-24 rounded-lg border border-gray-200" controls />
                                  ) : (
                                    <img src={replyAttachmentPreview} alt="Preview" className="max-h-24 rounded-lg border border-gray-200" />
                                  )}
                                  <button type="button" onClick={removeReplyAttachment} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600">
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              )}
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => replyFileRef.current?.click()}
                                  className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                                  title="Đính kèm ảnh/video"
                                >
                                  <ImagePlus size={18} />
                                </button>
                                <button
                                  onClick={() => handleUserReply(report.id)}
                                  disabled={replyingTo === report.id || (!userReplyText.trim() && !replyAttachment)}
                                  className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                >
                                  {replyingTo === report.id ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Send size={14} />
                                  )}
                                  Gửi phản hồi
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
          )}
        </div>
      </div>
    </div>
  )
}

export default ReportModal
