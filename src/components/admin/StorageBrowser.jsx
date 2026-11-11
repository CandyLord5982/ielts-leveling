import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Folder, FolderPlus, File, FileText, FileAudio, FileVideo, Image as ImageIcon,
  Upload, Trash2, Copy, Pencil, RefreshCw, ChevronRight, HardDrive, Search, X,
  ExternalLink, LayoutGrid, List as ListIcon, Check
} from 'lucide-react'
import { supabase } from '../../supabase/client'

// Admin file browser for Supabase Storage.
// To keep request counts low it never refreshes on its own: it loads a folder only when
// you open it or press Refresh, 100 files at a time. Thumbnails are off by default
// (each one downloads the image); audio and video load only when you press play.
// Admin access to every bucket comes from supabase/migrations/admin_storage_browser.sql.

const PAGE_SIZE = 100
const PLACEHOLDER = '.emptyFolderPlaceholder' // how Supabase marks an empty folder

// Used when the bucket list can't be read (e.g. before the migration is applied)
const FALLBACK_BUCKETS = [
  'course-backgrounds', 'exercise-files', 'exercise-videos', 'inventory-assets',
  'lesson-photos', 'pet-assets', 'real-image', 'report-attachments', 'shop-assets',
  'ui-assets', 'user-avatars',
]

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp']
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm', 'flac']
const VIDEO_EXT = ['mp4', 'mov', 'webm', 'mkv', 'm4v']

const extOf = (name) => (name.split('.').pop() || '').toLowerCase()
const kindOf = (item) => {
  const mime = item.metadata?.mimetype || ''
  const ext = extOf(item.name)
  if (mime.startsWith('image/') || IMAGE_EXT.includes(ext)) return 'image'
  if (mime.startsWith('audio/') || (AUDIO_EXT.includes(ext) && !mime.startsWith('video/'))) return 'audio'
  if (mime.startsWith('video/') || VIDEO_EXT.includes(ext)) return 'video'
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  return 'file'
}

const KIND_ICON = { image: ImageIcon, audio: FileAudio, video: FileVideo, pdf: FileText, file: File }
const KIND_COLOR = {
  image: 'text-emerald-500', audio: 'text-violet-500', video: 'text-rose-500',
  pdf: 'text-red-500', file: 'text-gray-400',
}

const formatSize = (bytes) => {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatDate = (iso) => (iso ? new Date(iso).toLocaleString() : '')

// Storage keys reject accents and some symbols: "Bài nghe 1.mp3" -> "bai-nghe-1.mp3"
const safeName = (name) => {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const clean = base
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'file'
  return ext ? `${clean}.${ext}` : clean
}

const joinPath = (folder, name) => (folder ? `${folder}/${name}` : name)

const readLocal = (key, fallback) => {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
const writeLocal = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* private mode etc. */ }
}

const StorageBrowser = () => {
  const [buckets, setBuckets] = useState(null)
  const [bucket, setBucket] = useState(() => readLocal('admin-storage-bucket', 'exercise-files'))
  const [folder, setFolder] = useState('')
  const [items, setItems] = useState(null) // null while loading
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [preview, setPreview] = useState(null) // item
  const [uploads, setUploads] = useState([]) // [{ name, status }]
  const [dragOver, setDragOver] = useState(false)
  const [thumbs, setThumbs] = useState(() => readLocal('admin-storage-thumbs', '0') === '1')
  const [toast, setToast] = useState(null)
  const fileInputRef = useRef(null)
  const toastTimer = useRef(null)

  const notify = (message, type = 'success') => {
    setToast({ message, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const publicUrl = useCallback(
    (path) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl,
    [bucket]
  )

  // Bucket list: one request when the tab opens
  useEffect(() => {
    let cancelled = false
    supabase.storage.listBuckets().then(({ data, error }) => {
      if (cancelled) return
      const names = !error && data?.length ? data.map(b => b.id).sort() : FALLBACK_BUCKETS
      setBuckets(names)
    })
    return () => { cancelled = true }
  }, [])

  const fetchPage = useCallback(async (offset) => {
    const { data, error } = await supabase.storage.from(bucket).list(folder, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
      ...(activeSearch ? { search: activeSearch } : {}),
    })
    if (error) throw error
    return data || []
  }, [bucket, folder, activeSearch])

  const load = useCallback(async () => {
    setItems(null)
    setSelected(new Set())
    try {
      const page = await fetchPage(0)
      setItems(page.filter(i => i.name !== PLACEHOLDER))
      setHasMore(page.length === PAGE_SIZE)
    } catch (err) {
      notify(`Could not load files: ${err.message}`, 'error')
      setItems([])
      setHasMore(false)
    }
  }, [fetchPage])

  useEffect(() => { load() }, [load])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const current = items?.length || 0
      const page = await fetchPage(current)
      setItems(prev => [...(prev || []), ...page.filter(i => i.name !== PLACEHOLDER)])
      setHasMore(page.length === PAGE_SIZE)
    } catch (err) {
      notify(`Could not load more: ${err.message}`, 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  const openBucket = (b) => {
    setBucket(b)
    writeLocal('admin-storage-bucket', b)
    setFolder('')
    setSearch('')
    setActiveSearch('')
    setPreview(null)
  }

  const openFolder = (path) => {
    setFolder(path)
    setSearch('')
    setActiveSearch('')
    setPreview(null)
  }

  const toggleThumbs = () => {
    setThumbs(v => {
      writeLocal('admin-storage-thumbs', v ? '0' : '1')
      return !v
    })
  }

  const isFolder = (item) => item.id === null
  const folders = (items || []).filter(isFolder)
  const files = (items || []).filter(i => !isFolder(i))

  // ---------- Upload ----------
  const uploadFiles = async (fileList) => {
    const list = Array.from(fileList || [])
    if (!list.length) return
    setUploads(list.map(f => ({ name: f.name, status: 'uploading' })))

    const existing = new Set(files.map(f => f.name))
    let ok = 0
    for (let i = 0; i < list.length; i++) {
      const file = list[i]
      const name = safeName(file.name)
      let upsert = false
      if (existing.has(name)) {
        upsert = window.confirm(`"${name}" already exists in this folder. Replace it?`)
        if (!upsert) {
          setUploads(prev => prev.map((u, j) => (j === i ? { ...u, status: 'skipped' } : u)))
          continue
        }
      }
      const { error } = await supabase.storage.from(bucket).upload(joinPath(folder, name), file, {
        cacheControl: '3600',
        contentType: file.type || undefined,
        upsert,
      })
      setUploads(prev => prev.map((u, j) => (j === i ? { ...u, status: error ? `failed: ${error.message}` : 'done' } : u)))
      if (!error) ok++
    }
    if (ok) {
      notify(`Uploaded ${ok} file${ok > 1 ? 's' : ''}`)
      await load()
    }
    setTimeout(() => setUploads([]), 4000)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    uploadFiles(e.dataTransfer.files)
  }

  // ---------- Folder ----------
  const createFolder = async () => {
    const raw = window.prompt('New folder name')
    if (!raw) return
    const name = safeName(raw).replace(/\./g, '-')
    const blob = new Blob([''], { type: 'text/plain' })
    const { error } = await supabase.storage.from(bucket).upload(joinPath(joinPath(folder, name), PLACEHOLDER), blob)
    if (error) return notify(`Could not create folder: ${error.message}`, 'error')
    openFolder(joinPath(folder, name))
  }

  // ---------- File actions ----------
  const copyUrl = async (item) => {
    try {
      await navigator.clipboard.writeText(publicUrl(joinPath(folder, item.name)))
      notify('Link copied')
    } catch {
      notify('Could not copy the link', 'error')
    }
  }

  const renameFile = async (item) => {
    const raw = window.prompt('New name (you can include a folder, e.g. "unit-1/audio.mp3")', item.name)
    if (!raw || raw === item.name) return
    const parts = raw.split('/').filter(Boolean)
    const target = joinPath(folder, [...parts.slice(0, -1).map(p => safeName(p).replace(/\./g, '-')), safeName(parts.at(-1))].join('/'))
    if (!window.confirm(`Rename to "${target}"?\n\nAny exercise still using the old link will stop showing this file.`)) return
    const { error } = await supabase.storage.from(bucket).move(joinPath(folder, item.name), target)
    if (error) return notify(`Could not rename: ${error.message}`, 'error')
    notify('Renamed')
    setPreview(null)
    load()
  }

  const deletePaths = async (names) => {
    if (!names.length) return
    const label = names.length === 1 ? `"${names[0]}"` : `${names.length} files`
    if (!window.confirm(`Delete ${label}? This cannot be undone, and exercises using ${names.length === 1 ? 'it' : 'them'} will show a broken file.`)) return
    const { data, error } = await supabase.storage.from(bucket).remove(names.map(n => joinPath(folder, n)))
    // Storage reports success with an empty list when a rule blocked the delete
    if (error || !data?.length) return notify(`Could not delete: ${error?.message || 'not allowed'}`, 'error')
    if (data.length < names.length) notify(`Deleted ${data.length} of ${names.length} files`, 'error')
    else notify(`Deleted ${label}`)
    setPreview(null)
    load()
  }

  const toggleSelect = (name) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }
  const allSelected = files.length > 0 && files.every(f => selected.has(f.name))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(files.map(f => f.name)))

  const crumbs = folder ? folder.split('/') : []

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Buckets */}
      <aside className="lg:w-52 flex-shrink-0 bg-white rounded-xl shadow-sm border p-2">
        <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Buckets</p>
        {buckets === null ? (
          <div className="px-2 py-3 text-sm text-gray-400">Loading...</div>
        ) : (
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
            {buckets.map(b => (
              <button
                key={b}
                onClick={() => openBucket(b)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm whitespace-nowrap text-left ${b === bucket ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <HardDrive className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{b}</span>
              </button>
            ))}
          </nav>
        )}
      </aside>

      {/* Files */}
      <section
        className={`flex-1 min-w-0 bg-white rounded-xl shadow-sm border flex flex-col relative ${dragOver ? 'ring-2 ring-blue-500' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }}
        onDrop={onDrop}
      >
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b">
          <div className="flex items-center gap-1 text-sm min-w-0 flex-1 flex-wrap">
            <button onClick={() => openFolder('')} className="font-semibold text-blue-600 hover:underline">{bucket}</button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                <button
                  onClick={() => openFolder(crumbs.slice(0, i + 1).join('/'))}
                  className={`truncate hover:underline ${i === crumbs.length - 1 ? 'font-semibold text-gray-800' : 'text-blue-600'}`}
                >
                  {c}
                </button>
              </span>
            ))}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); setActiveSearch(search.trim()) }}
            className="flex items-center gap-1 border rounded-lg px-2 py-1"
          >
            <Search className="w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search this folder (Enter)"
              className="w-40 text-sm outline-none"
            />
            {activeSearch && (
              <button type="button" onClick={() => { setSearch(''); setActiveSearch('') }} aria-label="Clear search">
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </form>

          <button onClick={toggleThumbs} className="p-2 rounded-lg border hover:bg-gray-50" title={thumbs ? 'Hide thumbnails' : 'Show image thumbnails (downloads each image)'}>
            {thumbs ? <ListIcon className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
          <button onClick={load} className="p-2 rounded-lg border hover:bg-gray-50" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={createFolder} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-gray-50">
            <FolderPlus className="w-4 h-4" /> Folder
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { uploadFiles(e.target.files); e.target.value = '' }} />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Upload className="w-4 h-4" /> Upload
          </button>
        </div>

        {/* Selection bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 border-b text-sm">
            <span className="font-medium text-blue-800">{selected.size} selected</span>
            <button onClick={() => deletePaths([...selected])} className="flex items-center gap-1 text-red-600 hover:underline">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
            <button onClick={() => setSelected(new Set())} className="text-gray-600 hover:underline">Clear</button>
          </div>
        )}

        {/* Upload progress */}
        {uploads.length > 0 && (
          <ul className="px-3 py-2 border-b bg-gray-50 text-xs space-y-0.5 max-h-32 overflow-y-auto">
            {uploads.map((u, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{u.name}</span>
                <span className={u.status === 'done' ? 'text-green-600' : u.status.startsWith('failed') ? 'text-red-600' : 'text-gray-500'}>{u.status}</span>
              </li>
            ))}
          </ul>
        )}

        {/* List */}
        <div className="flex-1 overflow-x-auto">
          {items === null ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {activeSearch ? `Nothing starting with "${activeSearch}" here.` : 'This folder is empty. Drag files here or press Upload.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 border-b bg-gray-50">
                <tr>
                  <th className="w-10 px-3 py-2 text-left">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!files.length} aria-label="Select all files" />
                  </th>
                  <th className="px-2 py-2 text-left font-medium">Name</th>
                  <th className="px-2 py-2 text-right font-medium hidden sm:table-cell">Size</th>
                  <th className="px-2 py-2 text-left font-medium hidden md:table-cell">Updated</th>
                  <th className="w-28 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {folders.map(f => (
                  <tr key={`d-${f.name}`} className="hover:bg-gray-50 cursor-pointer" onClick={() => openFolder(joinPath(folder, f.name))}>
                    <td className="px-3 py-2" />
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2 font-medium text-gray-800">
                        <Folder className="w-5 h-5 text-amber-500 flex-shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </span>
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td className="hidden md:table-cell" />
                    <td />
                  </tr>
                ))}
                {files.map(f => {
                  const kind = kindOf(f)
                  const Icon = KIND_ICON[kind]
                  const isActive = preview?.name === f.name
                  return (
                    <tr key={`f-${f.name}`} className={`group ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(f.name)} onChange={() => toggleSelect(f.name)} aria-label={`Select ${f.name}`} />
                      </td>
                      <td className="px-2 py-2 max-w-0 w-full">
                        <button onClick={() => setPreview(f)} className="flex items-center gap-2 min-w-0 w-full text-left">
                          {thumbs && kind === 'image' ? (
                            <img src={publicUrl(joinPath(folder, f.name))} alt="" loading="lazy" className="w-10 h-10 object-cover rounded border flex-shrink-0 bg-gray-100" />
                          ) : (
                            <Icon className={`w-5 h-5 flex-shrink-0 ${KIND_COLOR[kind]}`} />
                          )}
                          <span className="truncate text-gray-800">{f.name}</span>
                        </button>
                      </td>
                      <td className="px-2 py-2 text-right text-gray-500 whitespace-nowrap hidden sm:table-cell">{formatSize(f.metadata?.size)}</td>
                      <td className="px-2 py-2 text-gray-500 whitespace-nowrap hidden md:table-cell">{formatDate(f.updated_at || f.created_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => copyUrl(f)} className="p-1.5 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50" title="Copy link"><Copy className="w-4 h-4" /></button>
                          <button onClick={() => renameFile(f)} className="p-1.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100" title="Rename / move"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => deletePaths([f.name])} className="p-1.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {hasMore && (
            <div className="p-3 text-center border-t">
              <button onClick={loadMore} disabled={loadingMore} className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50">
                {loadingMore ? 'Loading...' : `Load next ${PAGE_SIZE}`}
              </button>
            </div>
          )}
        </div>

        {dragOver && (
          <div className="absolute inset-0 bg-blue-50/80 rounded-xl flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 text-blue-700 font-semibold">
              <Upload className="w-6 h-6" /> Drop to upload to {bucket}/{folder}
            </div>
          </div>
        )}
      </section>

      {/* Preview */}
      {preview && (
        <PreviewPanel
          item={preview}
          url={publicUrl(joinPath(folder, preview.name))}
          path={joinPath(folder, preview.name)}
          onClose={() => setPreview(null)}
          onCopy={() => copyUrl(preview)}
          onRename={() => renameFile(preview)}
          onDelete={() => deletePaths([preview.name])}
        />
      )}

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm flex items-center gap-2 ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.type === 'error' ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}

const PreviewPanel = ({ item, url, path, onClose, onCopy, onRename, onDelete }) => {
  const kind = kindOf(item)
  return (
    <aside className="lg:w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border flex flex-col self-start lg:sticky lg:top-4 w-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-semibold text-gray-800 truncate">{item.name}</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close preview"><X className="w-4 h-4" /></button>
      </div>

      <div className="p-3 bg-gray-50 flex items-center justify-center min-h-[140px]">
        {kind === 'image' && <img key={url} src={url} alt={item.name} className="max-h-72 max-w-full rounded" />}
        {kind === 'audio' && <audio key={url} src={url} controls preload="none" className="w-full" />}
        {kind === 'video' && <video key={url} src={url} controls preload="none" className="max-h-72 w-full rounded bg-black" />}
        {(kind === 'pdf' || kind === 'file') && (
          <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline text-sm">
            <ExternalLink className="w-4 h-4" /> Open in new tab
          </a>
        )}
      </div>

      <dl className="px-3 py-2 text-xs space-y-1 border-t">
        <div className="flex justify-between gap-2"><dt className="text-gray-500">Size</dt><dd>{formatSize(item.metadata?.size)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-gray-500">Type</dt><dd className="truncate">{item.metadata?.mimetype || '—'}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-gray-500">Updated</dt><dd>{formatDate(item.updated_at || item.created_at)}</dd></div>
        <div><dt className="text-gray-500">Path</dt><dd className="break-all font-mono text-[11px] mt-0.5">{path}</dd></div>
      </dl>

      <div className="grid grid-cols-3 gap-1 p-2 border-t">
        <button onClick={onCopy} className="flex flex-col items-center gap-0.5 py-2 rounded text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-600"><Copy className="w-4 h-4" />Copy link</button>
        <button onClick={onRename} className="flex flex-col items-center gap-0.5 py-2 rounded text-xs text-gray-600 hover:bg-gray-100"><Pencil className="w-4 h-4" />Rename</button>
        <button onClick={onDelete} className="flex flex-col items-center gap-0.5 py-2 rounded text-xs text-gray-600 hover:bg-red-50 hover:text-red-600"><Trash2 className="w-4 h-4" />Delete</button>
      </div>
    </aside>
  )
}

export default StorageBrowser
