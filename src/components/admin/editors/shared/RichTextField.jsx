import { useRef, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Upload,
  X,
  Table,
  Link,
  Image,
  Music,
  AlignLeft,
  AlignCenter,
  AlignRight
} from 'lucide-react'
import { supabase } from '../../../../supabase/client'
import RichTextRenderer from '../../../ui/RichTextRenderer'
import { handleRichTextShortcut } from '../../../../hooks/useRichTextShortcuts'
import AutoGrowTextarea from './AutoGrowTextarea'
import { markdownToHtml } from './richTextUtils'

const IMAGE_SIZES = {
  small: 'width="200"',
  medium: 'width="400"',
  large: 'width="600"',
  full: 'width="100%"'
}

const btn = 'px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1'
const alignBtn = 'p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200'

/**
 * Rich-text textarea used by the exercise editors: the text box plus its toolbar
 * (image upload, image/audio/link by URL, table, alignment, Ctrl+B/I/U, paste an
 * image or audio clip, optional live preview). The value stays plain text/HTML.
 *
 * Props
 *  - value / onChange(string)  controlled text
 *  - folderPath                storage sub-folder for uploads (exercise_bank/<folderPath>)
 *  - toolbarLead               node rendered at the start of the toolbar row (e.g. a label)
 *  - toolbarExtra              node rendered after the alignment buttons (before Preview)
 *  - preview                   show the Preview toggle (default true)
 *  - onKeyDown(e)              replaces the default Ctrl+B/I/U handling (e.g. to add undo/redo)
 *  - textareaRef(el)           callback ref for the underlying textarea
 *  - rows, placeholder, className
 */
const RichTextField = ({
  value,
  onChange,
  folderPath,
  toolbarLead = null,
  toolbarExtra = null,
  preview = true,
  onKeyDown,
  textareaRef,
  rows = 2,
  placeholder,
  className = 'w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
}) => {
  const elRef = useRef(null)
  const fileInputRef = useRef(null)
  const mediaModalInputRef = useRef(null)
  // Latest value for async handlers (uploads finish after the render that started them)
  const valueRef = useRef(value || '')
  valueRef.current = value || ''

  const [previewOpen, setPreviewOpen] = useState(false)

  const [urlModal, setUrlModal] = useState({ isOpen: false, type: '' })
  const [urlInput, setUrlInput] = useState('')
  const [linkText, setLinkText] = useState('Reference')
  const [imageSize, setImageSize] = useState('medium')
  const [customWidth, setCustomWidth] = useState('')
  const [customHeight, setCustomHeight] = useState('')
  const [audioControls, setAudioControls] = useState(true)
  const [audioAutoplay, setAudioAutoplay] = useState(false)
  const [audioLoop, setAudioLoop] = useState(false)
  const [audioMaxPlays, setAudioMaxPlays] = useState(0)
  const [audioPlaybackRate, setAudioPlaybackRate] = useState(1)
  const [modalUploading, setModalUploading] = useState(false)

  const [tableModal, setTableModal] = useState({ isOpen: false })
  const [tableRows, setTableRows] = useState(2)
  const [tableColumns, setTableColumns] = useState(2)
  const [tableWidth, setTableWidth] = useState('100%') // '100%' or 'auto'
  const [tableBorder, setTableBorder] = useState(true)

  const setRefs = (el) => {
    elRef.current = el
    if (textareaRef) textareaRef(el)
  }

  // ── Insert helpers ────────────────────────────────────────────────────────
  const insertSnippet = (snippet) => {
    const el = elRef.current
    const current = valueRef.current
    if (!el) {
      onChange(current + (current ? '\n\n' : '') + snippet)
      return
    }
    const start = el.selectionStart || 0
    const end = el.selectionEnd || 0
    onChange(current.slice(0, start) + snippet + current.slice(end))
    setTimeout(() => {
      el.focus()
      const caret = start + snippet.length
      el.setSelectionRange(caret, caret)
    }, 0)
  }

  const applyAlignment = (alignment) => {
    const el = elRef.current
    if (!el) return
    const current = valueRef.current
    const start = el.selectionStart || 0
    const end = el.selectionEnd || 0
    const selected = current.slice(start, end)
    const wrapped = `<div style="text-align: ${alignment}">${selected || 'text here'}</div>`
    onChange(current.slice(0, start) + wrapped + current.slice(end))
    setTimeout(() => {
      el.focus()
      const caret = start + wrapped.length
      el.setSelectionRange(caret, caret)
    }, 0)
  }

  const imageSizeAttrs = () => {
    if (imageSize === 'custom') {
      const width = customWidth ? `width="${customWidth}"` : ''
      const height = customHeight ? `height="${customHeight}"` : ''
      return `${width} ${height}`.trim()
    }
    return IMAGE_SIZES[imageSize] || IMAGE_SIZES.medium
  }

  const audioAttrs = () => {
    const attributes = []
    if (audioControls) attributes.push('controls')
    if (audioAutoplay) attributes.push('autoplay')
    if (audioLoop) attributes.push('loop')
    if (audioMaxPlays > 0) attributes.push(`data-max-plays="${audioMaxPlays}"`)
    if (audioPlaybackRate && audioPlaybackRate !== 1) attributes.push(`data-playback-rate="${audioPlaybackRate}"`)
    return attributes.join(' ')
  }

  // ── Uploads ───────────────────────────────────────────────────────────────
  const uploadToBucket = async (file, fileName) => {
    const basePath = folderPath ? `exercise_bank/${folderPath}` : 'exercise_bank'
    const path = `${basePath}/${Date.now()}_${Math.random().toString(36).slice(2)}_${fileName}`
    const { error: uploadError } = await supabase.storage
      .from('exercise-files')
      .upload(path, file, { cacheControl: '3600', upsert: true })
    if (uploadError) throw uploadError
    const { data: publicData } = supabase.storage.from('exercise-files').getPublicUrl(path)
    const publicUrl = publicData?.publicUrl
    if (!publicUrl) throw new Error('Cannot get public URL')
    return publicUrl
  }

  const handleImageUpload = async (file) => {
    if (!file) return
    try {
      const publicUrl = await uploadToBucket(file, file.name)
      insertSnippet(`\n<img src="${publicUrl}" alt="" ${imageSizeAttrs()} />\n`)
      alert('Image uploaded and inserted!')
    } catch (e) {
      console.error('Image upload failed:', e)
      alert('Image upload failed. Please ensure the bucket "exercise-images" exists and RLS allows uploads.')
    }
  }

  const uploadMediaFile = async (file) => {
    if (!file) return
    setModalUploading(true)
    try {
      setUrlInput(await uploadToBucket(file, file.name))
    } catch (e) {
      console.error('Media upload failed:', e)
      alert('Media upload failed.')
    } finally {
      setModalUploading(false)
    }
  }

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      const isImage = item.type.startsWith('image/')
      const isAudio = item.type.startsWith('audio/')
      if (!isImage && !isAudio) continue
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) return
      try {
        const ext = file.type.split('/')[1] || (isImage ? 'png' : 'mp3')
        const publicUrl = await uploadToBucket(file, `pasted.${ext}`)
        if (isImage) insertSnippet(`<img src="${publicUrl}" alt="" ${imageSizeAttrs()} />`)
        else insertSnippet(`<audio src="${publicUrl}" ${audioAttrs()}></audio>`)
      } catch (err) {
        console.error('Paste upload failed:', err)
        alert(`Failed to upload pasted ${isImage ? 'image' : 'audio'}`)
      }
      return
    }
  }

  // ── URL modal ─────────────────────────────────────────────────────────────
  const resetUrlState = () => {
    setUrlInput('')
    setLinkText('Reference')
    setImageSize('medium')
    setCustomWidth('')
    setCustomHeight('')
    setAudioControls(true)
    setAudioAutoplay(false)
    setAudioLoop(false)
    setAudioMaxPlays(0)
    setAudioPlaybackRate(1)
  }

  const openUrlModal = (type) => {
    resetUrlState()
    if (type !== 'link') setLinkText('')
    setUrlModal({ isOpen: true, type })
  }

  const closeUrlModal = () => {
    setUrlModal({ isOpen: false, type: '' })
    resetUrlState()
  }

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return
    let trimmedUrl
    try {
      new URL(urlInput.trim())
      trimmedUrl = urlInput.trim()
    } catch {
      alert('Vui lòng nhập URL hợp lệ (bắt đầu bằng http:// hoặc https://)')
      return
    }
    if (urlModal.type === 'image') {
      insertSnippet(`\n<img src="${trimmedUrl}" alt="" ${imageSizeAttrs()} />\n`)
    } else if (urlModal.type === 'link') {
      insertSnippet(`[${linkText.trim() || 'Reference'}](${trimmedUrl})`)
    } else if (urlModal.type === 'audio') {
      insertSnippet(`<audio src="${trimmedUrl}" ${audioAttrs()}></audio>`)
    }
    closeUrlModal()
  }

  // ── Table modal ───────────────────────────────────────────────────────────
  const openTableModal = () => {
    setTableRows(2)
    setTableColumns(2)
    setTableWidth('100%')
    setTableBorder(true)
    setTableModal({ isOpen: true })
  }

  const closeTableModal = () => setTableModal({ isOpen: false })

  const handleTableSubmit = () => {
    const rows = parseInt(tableRows) || 2
    const cols = parseInt(tableColumns) || 2
    const isFlexible = tableWidth === 'auto'
    const tableLayout = isFlexible ? 'auto' : 'fixed'
    const borderStyle = tableBorder ? 'border: 1px solid #ddd;' : 'border: none;'

    let tableHTML = `<table style="width: ${tableWidth}; border-collapse: collapse; margin: 10px 0; table-layout: ${tableLayout};">\n`
    for (let i = 0; i < rows; i++) {
      tableHTML += '  <tr>\n'
      for (let j = 0; j < cols; j++) {
        const cellNumber = i * cols + j + 1
        const cellWidth = isFlexible ? '' : ` width: ${Math.floor(100 / cols)}%;`
        tableHTML += `    <td style="${borderStyle} padding: 8px;${cellWidth} vertical-align: top;">Cell ${cellNumber}</td>\n`
      }
      tableHTML += '  </tr>\n'
    }
    tableHTML += '</table>'

    insertSnippet(tableHTML)
    closeTableModal()
  }

  const modalTitle = urlModal.type === 'image' ? 'Thêm hình ảnh'
    : urlModal.type === 'audio' ? 'Thêm âm thanh' : 'Thêm liên kết'

  const imageWidthLabel = imageSize === 'custom'
    ? `${customWidth || 'auto'} x ${customHeight || 'auto'}px`
    : imageSize === 'small' ? '200px'
      : imageSize === 'medium' ? '400px'
        : imageSize === 'large' ? '600px' : '100%'

  return (
    <div>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {toolbarLead}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { handleImageUpload(e.target.files?.[0]); e.target.value = '' }}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} className={btn}>
          <Upload className="w-3 h-3" /> Upload
        </button>
        <button type="button" onClick={() => openUrlModal('image')} className={btn}>
          <Image className="w-3 h-3" /> Image
        </button>
        <button type="button" onClick={() => openUrlModal('audio')} className={btn}>
          <Music className="w-3 h-3" /> Audio
        </button>
        <button type="button" onClick={() => openUrlModal('link')} className={btn}>
          <Link className="w-3 h-3" /> Link
        </button>
        <button type="button" onClick={openTableModal} className={btn}>
          <Table className="w-3 h-3" /> Table
        </button>
        <div className="flex gap-1 ml-2 border-l pl-2 border-gray-300">
          <button type="button" onClick={() => applyAlignment('left')} className={alignBtn} title="Align left"><AlignLeft className="w-3 h-3" /></button>
          <button type="button" onClick={() => applyAlignment('center')} className={alignBtn} title="Align center"><AlignCenter className="w-3 h-3" /></button>
          <button type="button" onClick={() => applyAlignment('right')} className={alignBtn} title="Align right"><AlignRight className="w-3 h-3" /></button>
        </div>
        {toolbarExtra}
        {preview && (
          <button
            type="button"
            onClick={() => setPreviewOpen(prev => !prev)}
            className="px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 text-xs"
          >
            {previewOpen ? 'Hide' : 'Preview'}
          </button>
        )}
      </div>

      <AutoGrowTextarea
        ref={setRefs}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (onKeyDown) onKeyDown(e)
          else handleRichTextShortcut(e, elRef.current, valueRef.current, onChange)
        }}
        onPaste={handlePaste}
        className={className}
        rows={rows}
        placeholder={placeholder}
      />

      {preview && previewOpen && (
        <div className="mt-2 p-2 bg-white border rounded text-sm">
          <RichTextRenderer content={markdownToHtml(value || '')} allowImages allowLinks className="prose max-w-none" />
        </div>
      )}

      {/* Table Input Modal */}
      {tableModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Insert Table</h3>
              <button type="button" onClick={closeTableModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Rows</label>
                <input
                  type="number"
                  value={tableRows}
                  onChange={(e) => setTableRows(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="20"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Columns</label>
                <input
                  type="number"
                  value={tableColumns}
                  onChange={(e) => setTableColumns(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="10"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Table Width</label>
                <div className="flex gap-2">
                  {[['100%', 'Full Width (100%)'], ['auto', 'Flexible (Auto)']].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTableWidth(val)}
                      className={`flex-1 px-3 py-2 border rounded-lg text-sm transition-colors ${
                        tableWidth === val ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {tableWidth === '100%'
                    ? 'Table stretches to full width with equal columns'
                    : 'Table shrinks to fit content size'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Border Style</label>
                <div className="flex gap-2">
                  {[[true, 'With Borders'], [false, 'No Borders']].map(([val, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setTableBorder(val)}
                      className={`flex-1 px-3 py-2 border rounded-lg text-sm transition-colors ${
                        tableBorder === val ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {tableBorder ? 'Cells will have visible borders' : 'Borderless table for cleaner layout'}
                </p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  Preview: {tableRows || 0} rows × {tableColumns || 0} columns ({tableWidth === '100%' ? 'Full width' : 'Flexible'}, {tableBorder ? 'With borders' : 'No borders'})
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={closeTableModal} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTableSubmit}
                disabled={!tableRows || !tableColumns || tableRows < 1 || tableColumns < 1}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
              >
                <Table className="w-4 h-4" />
                Insert Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* URL Input Modal */}
      {urlModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{modalTitle}</h3>
              <button type="button" onClick={closeUrlModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={
                    urlModal.type === 'image' ? 'https://example.com/image.jpg'
                      : urlModal.type === 'audio' ? 'https://example.com/audio.mp3'
                        : 'https://example.com/link'
                  }
                  autoFocus
                />
                {(urlModal.type === 'image' || urlModal.type === 'audio') && (
                  <div className="mt-2">
                    <input
                      ref={mediaModalInputRef}
                      type="file"
                      accept={urlModal.type === 'image' ? 'image/*' : 'audio/*'}
                      className="hidden"
                      onChange={(e) => { uploadMediaFile(e.target.files?.[0]); e.target.value = '' }}
                    />
                    <button
                      type="button"
                      onClick={() => mediaModalInputRef.current?.click()}
                      disabled={modalUploading}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4" />
                      {modalUploading ? 'Uploading...' : 'Or upload from device'}
                    </button>
                  </div>
                )}
              </div>

              {urlModal.type === 'link' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Text hiển thị (tùy chọn)</label>
                  <input
                    type="text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Reference"
                  />
                </div>
              )}

              {urlModal.type === 'image' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Kích thước hình ảnh</label>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'small', label: 'Nhỏ (200px)', icon: '📏' },
                        { value: 'medium', label: 'Trung bình (400px)', icon: '📐' },
                        { value: 'large', label: 'Lớn (600px)', icon: '📊' },
                        { value: 'full', label: 'Toàn màn hình', icon: '🖥️' }
                      ].map((size) => (
                        <button
                          key={size.value}
                          type="button"
                          onClick={() => setImageSize(size.value)}
                          className={`p-2 rounded-lg border text-sm transition-colors ${
                            imageSize === size.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <span className="mr-1">{size.icon}</span>
                          {size.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="customSize"
                        checked={imageSize === 'custom'}
                        onChange={(e) => setImageSize(e.target.checked ? 'custom' : 'medium')}
                        className="rounded"
                      />
                      <label htmlFor="customSize" className="text-sm text-gray-700">Kích thước tùy chỉnh</label>
                    </div>

                    {imageSize === 'custom' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Chiều rộng (px)</label>
                          <input
                            type="number"
                            value={customWidth}
                            onChange={(e) => setCustomWidth(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                            placeholder="400"
                            min="50"
                            max="1200"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Chiều cao (px)</label>
                          <input
                            type="number"
                            value={customHeight}
                            onChange={(e) => setCustomHeight(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                            placeholder="300"
                            min="50"
                            max="800"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {urlModal.type === 'audio' && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700">Tùy chọn âm thanh</h4>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={audioControls} onChange={(e) => setAudioControls(e.target.checked)} className="rounded" />
                    Hiển thị controls (play/pause/volume)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={audioAutoplay} onChange={(e) => setAudioAutoplay(e.target.checked)} className="rounded" />
                    Tự động phát (autoplay)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={audioLoop} onChange={(e) => setAudioLoop(e.target.checked)} className="rounded" />
                    Lặp lại (loop)
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700 w-24">Giới hạn phát:</label>
                    <input
                      type="number"
                      min="0"
                      value={audioMaxPlays}
                      onChange={(e) => setAudioMaxPlays(parseInt(e.target.value) || 0)}
                      className="w-20 p-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-500">(0 = không giới hạn)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700 w-24">Tốc độ phát:</label>
                    <select
                      value={audioPlaybackRate}
                      onChange={(e) => setAudioPlaybackRate(parseFloat(e.target.value))}
                      className="w-32 p-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={0.5}>0.5x (Rất chậm)</option>
                      <option value={0.75}>0.75x (Chậm)</option>
                      <option value={1}>1x (Bình thường)</option>
                      <option value={1.25}>1.25x (Nhanh)</option>
                      <option value={1.5}>1.5x (Rất nhanh)</option>
                    </select>
                  </div>
                </div>
              )}

              {urlInput && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">Preview:</p>
                  {urlModal.type === 'image' ? (
                    <div>
                      <img
                        src={urlInput}
                        alt="Preview"
                        className="max-w-full object-contain rounded border"
                        style={{
                          width: imageSize === 'custom' ? (customWidth ? `${customWidth}px` : '100%') : imageWidthLabel,
                          height: imageSize === 'custom' && customHeight ? `${customHeight}px` : 'auto',
                          maxHeight: '200px'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none'
                          e.target.nextSibling.style.display = 'block'
                        }}
                      />
                      <div className="text-sm text-red-500" style={{ display: 'none' }}>Không thể tải hình ảnh</div>
                      <div className="text-xs text-gray-500 mt-1">Kích thước: {imageWidthLabel}</div>
                    </div>
                  ) : urlModal.type === 'audio' ? (
                    <div>
                      <audio
                        ref={(el) => { if (el) el.playbackRate = audioPlaybackRate }}
                        src={urlInput}
                        controls={audioControls}
                        autoPlay={audioAutoplay}
                        loop={audioLoop}
                        className="w-full"
                        onError={(e) => {
                          e.target.style.display = 'none'
                          e.target.nextSibling.style.display = 'block'
                        }}
                      />
                      <div className="text-sm text-red-500" style={{ display: 'none' }}>Không thể tải âm thanh</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Tùy chọn: {audioControls ? 'Controls' : 'Không controls'} |
                        {audioAutoplay ? ' Autoplay' : ' Không autoplay'} |
                        {audioLoop ? ' Loop' : ' Không loop'} |
                        Tốc độ {audioPlaybackRate}x
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm">
                      <a href={urlInput} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {linkText || urlInput}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={closeUrlModal} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">
                Hủy
              </button>
              <button
                type="button"
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {modalTitle}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

RichTextField.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  folderPath: PropTypes.string,
  toolbarLead: PropTypes.node,
  toolbarExtra: PropTypes.node,
  preview: PropTypes.bool,
  onKeyDown: PropTypes.func,
  textareaRef: PropTypes.func,
  rows: PropTypes.number,
  placeholder: PropTypes.string,
  className: PropTypes.string
}

export default RichTextField
