import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Upload, Trash2, FileText, Presentation } from 'lucide-react'
import { supabase } from '../../supabase/client'

// "My slides": the teacher picks a PDF they uploaded before, uploads a new one, or deletes
// old ones. Files live in exercise-files/online-battle/<teacher id>/ and keep their
// original name in the file's metadata. The list and the delete rule only cover the
// teacher's own uploads (see add_online_battle_slide_library.sql).

const BUCKET = 'exercise-files'

// Readable, storage-safe version of a file name: "Bài 5 – Từ vựng.pdf" -> "bai-5-tu-vung"
const safeKey = (name) => String(name || '')
  .replace(/\.pdf$/i, '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[đĐ]/g, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60) || 'slides'

const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

const formatSize = (bytes) => {
  if (!bytes) return ''
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const SlidePickerModal = ({ userId, currentUrl, onPick, onClose }) => {
  const [files, setFiles] = useState(null) // null while loading
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(null) // path
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('online_battle_my_slides')
    if (err) {
      setError(`Could not load your slides: ${err.message}`)
      setFiles([])
      return
    }
    setFiles(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { load() }, [load])

  const upload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // so the same file can be picked again
    if (!file) return
    if (file.type !== 'application/pdf') {
      setError('Please choose a PDF. For PowerPoint: File > Save As > PDF.')
      return
    }
    setUploading(true)
    setError('')
    try {
      const path = `online-battle/${userId}/${Date.now()}_${safeKey(file.name)}.pdf`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        contentType: 'application/pdf',
        metadata: { original_name: file.name },
      })
      if (upErr) throw upErr
      onPick(publicUrl(path)) // show it straight away
    } catch (err) {
      setError(`Could not upload the slides: ${err.message}`)
      setUploading(false)
    }
  }

  const remove = async (f) => {
    const label = f.original_name || 'this file'
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return
    setDeleting(f.path)
    setError('')
    const { data, error: err } = await supabase.storage.from(BUCKET).remove([f.path])
    setDeleting(null)
    // Storage reports success with an empty list when a rule blocked the delete
    if (err || !data?.length) {
      setError(`Could not delete: ${err?.message || 'not allowed'}`)
      return
    }
    setFiles(prev => prev.filter(x => x.path !== f.path))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="flex items-center gap-2 font-bold text-gray-800">
            <Presentation className="w-4 h-4" />
            My slides
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b bg-gray-50">
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={upload} className="hidden" />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-bold"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload a new PDF'}
          </button>
          <p className="mt-1.5 text-xs text-gray-500 text-center">PowerPoint: File &gt; Save As &gt; PDF first.</p>
        </div>

        {error && <p className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-100">{error}</p>}

        <div className="flex-1 overflow-y-auto">
          {files === null ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
          ) : files.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">No slides yet. Upload one above.</p>
          ) : (
            <ul className="divide-y">
              {files.map(f => {
                const url = publicUrl(f.path)
                const isShowing = url === currentUrl
                return (
                  <li key={f.path} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                    <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <button onClick={() => onPick(url)} className="flex-1 min-w-0 text-left" title="Show these slides">
                      <span className="block truncate text-sm font-semibold text-gray-800">
                        {f.original_name || 'Slides (no name)'}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {new Date(f.created_at).toLocaleString()}{f.size ? ` · ${formatSize(f.size)}` : ''}
                        {isShowing && <span className="ml-1 font-bold text-green-600">· showing now</span>}
                      </span>
                    </button>
                    <button
                      onClick={() => remove(f)}
                      disabled={deleting === f.path || isShowing}
                      className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                      title={isShowing ? 'Stop showing it first' : 'Delete'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default SlidePickerModal
