import { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import { CheckCircle, XCircle, Clock, Search, Filter, Eye, Loader2 } from 'lucide-react'

const compressImage = (imageUrl, maxSize = 200, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > height) {
        if (width > maxSize) { height = (height * maxSize) / width; width = maxSize }
      } else {
        if (height > maxSize) { width = (width * maxSize) / height; height = maxSize }
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
        'image/jpeg',
        quality
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = imageUrl
  })
}

const AvatarApproval = () => {
  const { user } = useAuth()
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [approvingId, setApprovingId] = useState(null)

  useEffect(() => {
    fetchUploads()
  }, [filter])

  const fetchUploads = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('avatar_uploads')
        .select('*, uploader:users!avatar_uploads_user_id_fkey(id, full_name, email, avatar_url)')
        .order('created_at', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query
      if (error) throw error
      setUploads(data || [])
    } catch (error) {
      console.error('Error fetching avatar uploads:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (uploadId) => {
    try {
      setApprovingId(uploadId)
      const upload = uploads.find(u => u.id === uploadId)
      if (!upload) throw new Error('Upload not found')

      // Compress the image
      const compressedBlob = await compressImage(upload.image_url)

      // Extract original storage path and build compressed path
      const originalUrl = upload.image_url
      const originalPath = originalUrl.split('/user-avatars/').pop()
      if (!originalPath) throw new Error('Invalid storage path')
      const decodedPath = decodeURIComponent(originalPath)
      const compressedPath = decodedPath.replace(/\.[^.]+$/, '_compressed.jpg')

      // Upload compressed version
      const { error: uploadError } = await supabase.storage
        .from('user-avatars')
        .upload(compressedPath, compressedBlob, {
          contentType: 'image/jpeg',
          upsert: true
        })
      if (uploadError) throw uploadError

      // Get public URL for compressed image
      const { data: { publicUrl } } = supabase.storage
        .from('user-avatars')
        .getPublicUrl(compressedPath)

      // Update DB with compressed URL and approved status
      const { error } = await supabase
        .from('avatar_uploads')
        .update({
          status: 'approved',
          image_url: publicUrl,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id
        })
        .eq('id', uploadId)
      if (error) throw error

      // Delete original from storage
      await supabase.storage.from('user-avatars').remove([decodedPath])

      fetchUploads()
    } catch (error) {
      console.error('Error approving avatar:', error)
      alert('Lỗi khi duyệt avatar: ' + error.message)
    } finally {
      setApprovingId(null)
    }
  }

  const handleReject = async (uploadId) => {
    try {
      const { error } = await supabase
        .from('avatar_uploads')
        .update({
          status: 'rejected',
          reject_reason: rejectReason || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id
        })
        .eq('id', uploadId)

      if (error) throw error
      setRejectingId(null)
      setRejectReason('')
      fetchUploads()
    } catch (error) {
      console.error('Error rejecting avatar:', error)
    }
  }

  const pendingCount = uploads.filter(u => u.status === 'pending').length

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }
    const labels = {
      pending: 'Chờ duyệt',
      approved: 'Đã duyệt',
      rejected: 'Từ chối'
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Avatar Approval</h2>
          <p className="text-sm text-gray-600">
            Review and approve user-uploaded avatars
          </p>
        </div>
        {filter === 'pending' && pendingCount > 0 && (
          <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
            {pendingCount} chờ duyệt
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { id: 'pending', label: 'Chờ duyệt', icon: Clock },
          { id: 'approved', label: 'Đã duyệt', icon: CheckCircle },
          { id: 'rejected', label: 'Từ chối', icon: XCircle },
          { id: 'all', label: 'Tất cả', icon: Filter }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 border'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Đang tải...</div>
      ) : uploads.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <div className="text-gray-400 text-4xl mb-3">
            {filter === 'pending' ? '✅' : '📭'}
          </div>
          <p className="text-gray-500">
            {filter === 'pending'
              ? 'Không có avatar nào chờ duyệt'
              : 'Không có avatar nào'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {uploads.map(upload => (
            <div key={upload.id} className="bg-white rounded-lg border shadow-sm overflow-hidden">
              {/* Avatar preview */}
              <div className="p-4 flex items-center gap-4">
                <div
                  className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200 flex-shrink-0 cursor-pointer hover:border-blue-400 transition-colors"
                  onClick={() => setPreviewUrl(upload.image_url)}
                >
                  <img
                    src={upload.image_url}
                    alt="Uploaded avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {upload.uploader?.full_name || upload.uploader?.email || 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{upload.uploader?.email}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(upload.created_at).toLocaleDateString('vi-VN', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                  <div className="mt-1">{getStatusBadge(upload.status)}</div>
                </div>
              </div>

              {/* Reject reason if rejected */}
              {upload.status === 'rejected' && upload.reject_reason && (
                <div className="px-4 pb-2">
                  <p className="text-xs text-red-600 bg-red-50 p-2 rounded">
                    Lý do: {upload.reject_reason}
                  </p>
                </div>
              )}

              {/* Actions for pending */}
              {upload.status === 'pending' && (
                <div className="border-t px-4 py-3">
                  {rejectingId === upload.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Lý do từ chối (tùy chọn)"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="w-full px-3 py-1.5 border rounded-lg text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReject(upload.id)}
                          className="flex-1 bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-700"
                        >
                          Xác nhận từ chối
                        </button>
                        <button
                          onClick={() => { setRejectingId(null); setRejectReason('') }}
                          className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(upload.id)}
                        disabled={approvingId === upload.id}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                          approvingId === upload.id
                            ? 'bg-green-400 text-white cursor-not-allowed'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {approvingId === upload.id ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Đang nén...</>
                        ) : (
                          <><CheckCircle className="w-4 h-4" /> Duyệt</>
                        )}
                      </button>
                      <button
                        onClick={() => setRejectingId(upload.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-red-700 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        Từ chối
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Re-review for already reviewed */}
              {upload.status !== 'pending' && (
                <div className="border-t px-4 py-3">
                  <div className="flex gap-2">
                    {upload.status === 'rejected' && (
                      <button
                        onClick={() => handleApprove(upload.id)}
                        disabled={approvingId === upload.id}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                          approvingId === upload.id
                            ? 'bg-green-400 text-white cursor-not-allowed'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {approvingId === upload.id ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Đang nén...</>
                        ) : (
                          <><CheckCircle className="w-4 h-4" /> Duyệt lại</>
                        )}
                      </button>
                    )}
                    {upload.status === 'approved' && (
                      <button
                        onClick={() => setRejectingId(upload.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-700"
                      >
                        <XCircle className="w-4 h-4" />
                        Thu hồi
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Image preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-lg max-h-[80vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

export default AvatarApproval
