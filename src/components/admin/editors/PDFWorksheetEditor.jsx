import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { supabase } from '../../../supabase/client'
import { Trash2, Upload, Eye, EyeOff, Type, ChevronDown, CheckSquare, GripVertical, AlertCircle, Copy, Image as ImageIcon, Music, X } from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

// Separate component so PDF never re-renders when parent state changes
const PDFRenderer = React.memo(({ pdfUrl, currentPage, pageWidth, onLoadSuccess }) => (
  <Document file={pdfUrl} onLoadSuccess={onLoadSuccess}>
    <Page
      pageNumber={currentPage}
      width={pageWidth}
      renderTextLayer={false}
      renderAnnotationLayer={false}
    />
  </Document>
))

const FIELD_TYPES = [
  { value: 'text', label: 'Text Input', icon: Type },
  { value: 'dropdown', label: 'Dropdown', icon: ChevronDown },
  { value: 'checkbox', label: 'Checkbox', icon: CheckSquare }
]

const PDFWorksheetEditor = ({ content, onContentChange }) => {
  const [pdfUrl, setPdfUrl] = useState(() => content?.pdf_url || '')
  const [passagePdfUrl, setPassagePdfUrl] = useState(() => content?.passage_pdf_url || '')
  const [imageUrls, setImageUrls] = useState(() => content?.image_urls || [])
  const [pages, setPages] = useState(() => content?.pages || [])
  const [numPages, setNumPages] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [uploadingPassage, setUploadingPassage] = useState(false)
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [placementTool, setPlacementTool] = useState('text')
  const [previewMode, setPreviewMode] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dragFieldId, setDragFieldId] = useState(null)
  const [pageWidth, setPageWidth] = useState(600)
  const [uploadingAudio, setUploadingAudio] = useState(false)

  const pageContainerRef = useRef(null)
  const containerWrapperRef = useRef(null)

  const isImageMode = imageUrls.length > 0

  // Sync to parent (debounced to avoid re-render cascade)
  const onContentChangeRef = useRef(onContentChange)
  onContentChangeRef.current = onContentChange
  useEffect(() => {
    const timer = setTimeout(() => {
      onContentChangeRef.current({ pdf_url: pdfUrl, passage_pdf_url: passagePdfUrl, image_urls: imageUrls, pages, settings: content?.settings || {} })
    }, 300)
    return () => clearTimeout(timer)
  }, [pdfUrl, passagePdfUrl, imageUrls, pages])

  // Measure container width for responsive PDF rendering
  useEffect(() => {
    const updateWidth = () => {
      if (containerWrapperRef.current) {
        const w = containerWrapperRef.current.clientWidth - 4 // account for border
        setPageWidth(w)
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const getCurrentPageFields = () => {
    const page = pages.find(p => p.page_number === currentPage)
    return page?.fields || []
  }

  const updatePages = useCallback((updater) => {
    setPages(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      return next
    })
  }, [])

  const addFieldToPage = (pageNumber, field) => {
    updatePages(prev => prev.map(p =>
      p.page_number === pageNumber
        ? { ...p, fields: [...p.fields, field] }
        : p
    ))
  }

  const updateField = (fieldId, updates) => {
    updatePages(prev => prev.map(p => ({
      ...p,
      fields: p.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f)
    })))
  }

  const deleteField = (fieldId) => {
    updatePages(prev => prev.map(p => ({
      ...p,
      fields: p.fields.filter(f => f.id !== fieldId)
    })))
    if (selectedFieldId === fieldId) setSelectedFieldId(null)
  }

  const duplicateField = (fieldId) => {
    const field = pages.flatMap(p => p.fields).find(f => f.id === fieldId)
    if (!field) return
    const newField = {
      ...field,
      id: `field_${Date.now()}`,
      label: `${field.label} copy`,
      coordinates: {
        ...field.coordinates,
        y: Math.min(field.coordinates.y + 4, 96)
      }
    }
    const pageNumber = pages.find(p => p.fields.some(f => f.id === fieldId))?.page_number
    if (pageNumber) addFieldToPage(pageNumber, newField)
    setSelectedFieldId(newField.id)
  }

  // PDF upload
  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || file.type !== 'application/pdf') return

    setUploading(true)
    try {
      const path = `pdf/${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('exercise-files')
        .upload(path, file, { cacheControl: '3600', upsert: true })
      if (uploadError) throw uploadError
      const { data: publicData } = supabase.storage
        .from('exercise-files')
        .getPublicUrl(path)
      setPdfUrl(publicData.publicUrl)
      setPages([])
      setCurrentPage(1)
    } catch (err) {
      console.error('PDF upload failed:', err)
      alert('Failed to upload PDF.')
    } finally {
      setUploading(false)
    }
  }

  // Passage PDF upload (reading material for split view)
  const handlePassagePdfUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || file.type !== 'application/pdf') return

    setUploadingPassage(true)
    try {
      const path = `pdf/${Date.now()}_${Math.random().toString(36).slice(2)}_passage.pdf`
      const { error: uploadError } = await supabase.storage
        .from('exercise-files')
        .upload(path, file, { cacheControl: '3600', upsert: true })
      if (uploadError) throw uploadError
      const { data: publicData } = supabase.storage
        .from('exercise-files')
        .getPublicUrl(path)
      setPassagePdfUrl(publicData.publicUrl)
    } catch (err) {
      console.error('Passage PDF upload failed:', err)
      alert('Failed to upload passage PDF.')
    } finally {
      setUploadingPassage(false)
    }
  }

  // Image upload (multiple)
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setUploading(true)
    try {
      const uploadedUrls = []
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const path = `worksheet_images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('exercise-files')
          .upload(path, file, { cacheControl: '3600', upsert: true })
        if (uploadError) throw uploadError
        const { data: publicData } = supabase.storage
          .from('exercise-files')
          .getPublicUrl(path)
        uploadedUrls.push(publicData.publicUrl)
      }
      setImageUrls(prev => {
        const newUrls = [...prev, ...uploadedUrls]
        // Ensure pages exist for each image
        setPages(prevPages => {
          const updated = [...prevPages]
          for (let i = 1; i <= newUrls.length; i++) {
            if (!updated.find(p => p.page_number === i)) {
              updated.push({ page_number: i, fields: [] })
            }
          }
          return updated.sort((a, b) => a.page_number - b.page_number)
        })
        setNumPages(newUrls.length)
        return newUrls
      })
      setPdfUrl('')
    } catch (err) {
      console.error('Image upload failed:', err)
      alert('Failed to upload image(s).')
    } finally {
      setUploading(false)
    }
  }

  const removeImage = (index) => {
    setImageUrls(prev => {
      const newUrls = prev.filter((_, i) => i !== index)
      setNumPages(newUrls.length || null)
      if (currentPage > newUrls.length) setCurrentPage(Math.max(1, newUrls.length))
      return newUrls
    })
  }

  const updatePageAudio = (pageNumber, audioUrl) => {
    updatePages(prev => prev.map(p =>
      p.page_number === pageNumber ? { ...p, audio_url: audioUrl } : p
    ))
  }

  const handleAudioUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAudio(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `audio/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('exercise-files')
        .upload(path, file, { cacheControl: '3600', upsert: true })
      if (uploadError) throw uploadError
      const { data: publicData } = supabase.storage
        .from('exercise-files')
        .getPublicUrl(path)
      updatePageAudio(currentPage, publicData.publicUrl)
    } catch (err) {
      console.error('Audio upload failed:', err)
      alert('Failed to upload audio.')
    } finally {
      setUploadingAudio(false)
    }
  }

  const onDocumentLoadSuccess = useCallback(({ numPages: total }) => {
    setNumPages(total)
    setPages(prev => {
      const updated = [...prev]
      for (let i = 1; i <= total; i++) {
        if (!updated.find(p => p.page_number === i)) {
          updated.push({ page_number: i, fields: [] })
        }
      }
      return updated.sort((a, b) => a.page_number - b.page_number)
    })
  }, [])


  // Click on PDF to place field
  const handlePageClick = (e) => {
    if (previewMode || isDragging) return
    const container = pageContainerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100

    const defaultWidth = placementTool === 'checkbox' ? 3 : 15
    const defaultHeight = placementTool === 'checkbox' ? 3 : 3.5

    const newField = {
      id: `field_${Date.now()}`,
      type: placementTool,
      coordinates: {
        x: Math.max(0, Math.min(xPercent, 100 - defaultWidth)),
        y: Math.max(0, Math.min(yPercent, 100 - defaultHeight)),
        width: defaultWidth,
        height: defaultHeight
      },
      label: `Field ${getCurrentPageFields().length + 1}`,
      correct_answer: placementTool === 'checkbox' ? 'true' : '',
      case_sensitive: false,
      options: placementTool === 'dropdown' ? ['Option 1', 'Option 2'] : null,
      correct_option: placementTool === 'dropdown' ? 0 : null
    }

    addFieldToPage(currentPage, newField)
    setSelectedFieldId(newField.id)
  }

  // Drag field
  const handleFieldMouseDown = (e, fieldId) => {
    e.stopPropagation()
    if (previewMode) return

    const container = pageContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100

    const field = getCurrentPageFields().find(f => f.id === fieldId)
    if (!field) return

    setIsDragging(true)
    setDragFieldId(fieldId)
    setDragOffset({
      x: xPercent - field.coordinates.x,
      y: yPercent - field.coordinates.y
    })
    setSelectedFieldId(fieldId)
  }

  const handleMouseMove = (e) => {
    if (!isDragging || !dragFieldId) return
    const container = pageContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100

    const field = getCurrentPageFields().find(f => f.id === dragFieldId)
    if (!field) return

    const newX = Math.max(0, Math.min(xPercent - dragOffset.x, 100 - field.coordinates.width))
    const newY = Math.max(0, Math.min(yPercent - dragOffset.y, 100 - field.coordinates.height))

    updateField(dragFieldId, {
      coordinates: { ...field.coordinates, x: newX, y: newY }
    })
  }

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false)
      setDragFieldId(null)
    }
  }

  const selectedField = pages.flatMap(p => p.fields).find(f => f.id === selectedFieldId)

  // Validation
  const totalFields = pages.reduce((sum, p) => sum + p.fields.length, 0)
  const emptyAnswerFields = pages.flatMap(p => p.fields).filter(f => {
    if (f.type === 'text') return !f.correct_answer?.trim()
    if (f.type === 'dropdown') return !f.options?.length
    return false
  })

  return (
    <div className="space-y-4">
      {/* Upload */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Worksheet File</label>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={isImageMode ? '' : pdfUrl}
            onChange={(e) => { setPdfUrl(e.target.value); setImageUrls([]) }}
            placeholder={isImageMode ? 'Using images (clear to use PDF URL)' : 'PDF URL (or upload below)'}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            disabled={isImageMode}
          />
          <label className={`px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 cursor-pointer text-sm ${uploading ? 'opacity-50' : ''}`}>
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload PDF'}
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => { handlePdfUpload(e); setImageUrls([]) }}
              className="hidden"
              disabled={uploading}
            />
          </label>
          <label className={`px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 cursor-pointer text-sm ${uploading ? 'opacity-50' : ''}`}>
            <ImageIcon className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload Images'}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>
        {isImageMode && (
          <div className="flex flex-wrap gap-2">
            {imageUrls.map((url, i) => (
              <div key={i} className="relative group">
                <img src={url} alt={`Page ${i + 1}`} className="w-16 h-16 object-cover rounded border border-gray-300" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
                <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center">{i + 1}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Passage PDF (optional - for split reading view) */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Reading Passage PDF <span className="text-gray-400 font-normal">(optional — enables split view: passage left, questions right)</span>
        </label>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={passagePdfUrl}
            onChange={(e) => setPassagePdfUrl(e.target.value)}
            placeholder="Passage PDF URL (or upload)"
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <label className={`px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 cursor-pointer text-sm ${uploadingPassage ? 'opacity-50' : ''}`}>
            <Upload className="w-4 h-4" />
            {uploadingPassage ? 'Uploading...' : 'Upload Passage'}
            <input
              type="file"
              accept=".pdf"
              onChange={handlePassagePdfUpload}
              className="hidden"
              disabled={uploadingPassage}
            />
          </label>
          {passagePdfUrl && (
            <button
              type="button"
              onClick={() => setPassagePdfUrl('')}
              className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm"
            >
              Remove
            </button>
          )}
        </div>
        {passagePdfUrl && (
          <p className="text-xs text-green-600">Split view enabled — students will see this passage on the left and questions on the right.</p>
        )}
      </div>

      {/* Validation */}
      {(pdfUrl || isImageMode) && totalFields === 0 && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-yellow-600" />
          <span className="text-sm text-yellow-700">Click on the PDF to place answer fields.</span>
        </div>
      )}
      {emptyAnswerFields.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm text-red-700">{emptyAnswerFields.length} field(s) missing correct answer.</span>
        </div>
      )}

      {/* PDF Viewer + Editor */}
      {(pdfUrl || isImageMode) && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-600 mr-2">Place:</span>
              {FIELD_TYPES.map(ft => {
                const Icon = ft.icon
                return (
                  <button
                    key={ft.value}
                    type="button"
                    onClick={() => setPlacementTool(ft.value)}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors ${
                      placementTool === ft.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {ft.label}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setPreviewMode(!previewMode)}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm ${
                previewMode ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
              }`}
            >
              {previewMode ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {previewMode ? 'Preview' : 'Edit'}
            </button>
          </div>

          {/* Page navigation */}
          {numPages > 1 && (
            <div className="flex items-center justify-center gap-1">
              {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium ${
                    currentPage === pageNum
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
            </div>
          )}

          {/* Per-page audio */}
          <div className="flex items-center gap-2 flex-wrap">
            <Music className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">Page {currentPage} Audio:</span>
            {(() => {
              const currentPageData = pages.find(p => p.page_number === currentPage)
              const audioUrl = currentPageData?.audio_url || ''
              return audioUrl ? (
                <>
                  <audio controls src={audioUrl} className="h-8" />
                  <button
                    type="button"
                    onClick={() => updatePageAudio(currentPage, '')}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                    title="Remove audio"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Paste audio URL"
                    className="flex-1 min-w-[150px] px-2 py-1 border border-gray-300 rounded text-sm"
                    onBlur={(e) => { if (e.target.value.trim()) updatePageAudio(currentPage, e.target.value.trim()) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { updatePageAudio(currentPage, e.target.value.trim()); e.target.value = '' } }}
                  />
                  <label className={`px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1 cursor-pointer text-xs ${uploadingAudio ? 'opacity-50' : ''}`}>
                    <Upload className="w-3 h-3" />
                    {uploadingAudio ? 'Uploading...' : 'Upload'}
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioUpload}
                      className="hidden"
                      disabled={uploadingAudio}
                    />
                  </label>
                </>
              )
            })()}
          </div>

          {/* Main layout: PDF + Properties */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Left: PDF with field overlays */}
            <div className="xl:col-span-2" ref={containerWrapperRef}>
              <div
                className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-100"
                style={{ cursor: previewMode ? 'default' : 'crosshair' }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <div
                  ref={pageContainerRef}
                  className="relative"
                  onClick={handlePageClick}
                >
                  {isImageMode ? (
                    <img src={imageUrls[currentPage - 1]} alt={`Page ${currentPage}`} style={{ width: pageWidth }} className="block" />
                  ) : (
                    <PDFRenderer pdfUrl={pdfUrl} currentPage={currentPage} pageWidth={pageWidth} onLoadSuccess={onDocumentLoadSuccess} />
                  )}

                  {/* Field overlays */}
                  {getCurrentPageFields().map(field => {
                    const { x, y, width, height } = field.coordinates
                    const isSelected = selectedFieldId === field.id
                    const typeColors = {
                      text: { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
                      dropdown: { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
                      checkbox: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' }
                    }
                    const colors = typeColors[field.type] || typeColors.text

                    return (
                      <div
                        key={field.id}
                        className="absolute flex items-center justify-center"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          width: `${width}%`,
                          height: `${height}%`,
                          border: `2px ${isSelected ? 'solid' : 'dashed'} ${isSelected ? '#2563eb' : colors.border}`,
                          backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.15)' : colors.bg,
                          cursor: previewMode ? 'default' : 'move',
                          zIndex: isSelected ? 10 : 1,
                          borderRadius: '3px'
                        }}
                        onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                        onClick={(e) => { e.stopPropagation(); setSelectedFieldId(field.id) }}
                      >
                        {!previewMode && (
                          <span className="text-xs font-medium truncate px-1 pointer-events-none select-none"
                            style={{ color: colors.border }}
                          >
                            {field.label}
                          </span>
                        )}
                        {previewMode && field.type === 'text' && (
                          <input type="text" className="w-full h-full px-1 text-sm border-none bg-white/80 rounded" placeholder={field.label} readOnly />
                        )}
                        {previewMode && field.type === 'dropdown' && (
                          <select className="w-full h-full text-sm bg-white/80 rounded" disabled>
                            <option>-- Select --</option>
                            {(field.options || []).map((opt, i) => <option key={i}>{opt}</option>)}
                          </select>
                        )}
                        {previewMode && field.type === 'checkbox' && (
                          <input type="checkbox" className="w-5 h-5" disabled />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right: Field list + properties */}
            <div className="xl:col-span-1 space-y-3">
              {/* Fields on current page */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fields on Page {currentPage} ({getCurrentPageFields().length})
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {getCurrentPageFields().map(field => (
                    <div
                      key={field.id}
                      onClick={() => setSelectedFieldId(field.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm ${
                        selectedFieldId === field.id ? 'bg-blue-50 border border-blue-300' : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-gray-400" />
                      <span className="flex-1 truncate font-medium">{field.label}</span>
                      <span className="text-xs text-gray-500 capitalize">{field.type}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); duplicateField(field.id) }}
                        className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteField(field.id) }}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {getCurrentPageFields().length === 0 && (
                    <p className="text-sm text-gray-400 py-4 text-center">Click on the PDF to add fields</p>
                  )}
                </div>
              </div>

              {/* Selected field properties */}
              {selectedField && (
                <div className="p-4 bg-white border border-gray-300 rounded-lg space-y-3">
                  <h4 className="font-medium text-gray-800 text-sm">Field Properties</h4>

                  {/* Label */}
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Label</label>
                    <input
                      type="text"
                      value={selectedField.label}
                      onChange={(e) => updateField(selectedField.id, { label: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Type</label>
                    <select
                      value={selectedField.type}
                      onChange={(e) => {
                        const newType = e.target.value
                        const updates = { type: newType }
                        if (newType === 'dropdown' && !selectedField.options) {
                          updates.options = ['Option 1', 'Option 2']
                          updates.correct_option = 0
                        }
                        if (newType === 'checkbox') {
                          updates.correct_answer = 'true'
                          updates.coordinates = {
                            ...selectedField.coordinates,
                            width: 3,
                            height: 3
                          }
                        }
                        if (newType === 'text' && selectedField.type === 'checkbox') {
                          updates.coordinates = {
                            ...selectedField.coordinates,
                            width: 15,
                            height: 3.5
                          }
                        }
                        updateField(selectedField.id, updates)
                      }}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    >
                      {FIELD_TYPES.map(ft => (
                        <option key={ft.value} value={ft.value}>{ft.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Position / Size */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Position (X%, Y%)</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={Math.round(selectedField.coordinates.x * 10) / 10}
                          onChange={(e) => updateField(selectedField.id, {
                            coordinates: { ...selectedField.coordinates, x: parseFloat(e.target.value) || 0 }
                          })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                          step="0.5"
                        />
                        <input
                          type="number"
                          value={Math.round(selectedField.coordinates.y * 10) / 10}
                          onChange={(e) => updateField(selectedField.id, {
                            coordinates: { ...selectedField.coordinates, y: parseFloat(e.target.value) || 0 }
                          })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                          step="0.5"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Size (W%, H%)</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={Math.round(selectedField.coordinates.width * 10) / 10}
                          onChange={(e) => updateField(selectedField.id, {
                            coordinates: { ...selectedField.coordinates, width: Math.max(2, parseFloat(e.target.value) || 2) }
                          })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                          step="0.5"
                          min="2"
                        />
                        <input
                          type="number"
                          value={Math.round(selectedField.coordinates.height * 10) / 10}
                          onChange={(e) => updateField(selectedField.id, {
                            coordinates: { ...selectedField.coordinates, height: Math.max(2, parseFloat(e.target.value) || 2) }
                          })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                          step="0.5"
                          min="2"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Type-specific answer config */}
                  {selectedField.type === 'text' && (
                    <>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Correct Answer</label>
                        <input
                          type="text"
                          value={selectedField.correct_answer || ''}
                          onChange={(e) => updateField(selectedField.id, { correct_answer: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                          placeholder="Type the correct answer"
                        />
                      </div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedField.case_sensitive || false}
                          onChange={(e) => updateField(selectedField.id, { case_sensitive: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-xs text-gray-600">Case sensitive</span>
                      </label>
                    </>
                  )}

                  {selectedField.type === 'dropdown' && (
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Options</label>
                      <div className="space-y-1.5">
                        {(selectedField.options || []).map((opt, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`correct_${selectedField.id}`}
                              checked={selectedField.correct_option === i}
                              onChange={() => updateField(selectedField.id, { correct_option: i })}
                              className="text-green-600"
                              title="Mark as correct"
                            />
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const newOptions = [...(selectedField.options || [])]
                                newOptions[i] = e.target.value
                                updateField(selectedField.id, { options: newOptions })
                              }}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newOptions = selectedField.options.filter((_, idx) => idx !== i)
                                const newCorrect = selectedField.correct_option >= newOptions.length
                                  ? Math.max(0, newOptions.length - 1)
                                  : selectedField.correct_option > i
                                    ? selectedField.correct_option - 1
                                    : selectedField.correct_option
                                updateField(selectedField.id, { options: newOptions, correct_option: newCorrect })
                              }}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                              disabled={selectedField.options.length <= 2}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const newOptions = [...(selectedField.options || []), `Option ${(selectedField.options?.length || 0) + 1}`]
                            updateField(selectedField.id, { options: newOptions })
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          + Add Option
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Radio = correct answer</p>
                    </div>
                  )}

                  {selectedField.type === 'checkbox' && (
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Correct Answer</label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedField.correct_answer === 'true'}
                          onChange={(e) => updateField(selectedField.id, { correct_answer: e.target.checked ? 'true' : 'false' })}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">Should be checked</span>
                      </label>
                    </div>
                  )}

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => deleteField(selectedField.id)}
                    className="w-full px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Field
                  </button>
                </div>
              )}

              {/* Summary */}
              {totalFields > 0 && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-xs text-gray-600">
                    Total: {totalFields} field(s) across {pages.filter(p => p.fields.length > 0).length} page(s)
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Never re-render from parent — editor is fully self-contained after mount
export default React.memo(PDFWorksheetEditor, () => true)
