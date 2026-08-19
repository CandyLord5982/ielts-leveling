import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Eye, EyeOff, Upload, Image as ImageIcon, AlertCircle, X, Music, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { handleRichTextShortcut } from '../../../hooks/useRichTextShortcuts'
import { supabase } from '../../../supabase/client'

import { useBranding } from '../../../hooks/useBranding';
const ImageHotspotEditor = ({ content, onContentChange, folderPath }) => {
  const { branding } = useBranding()
  const [imageUrl, setImageUrl] = useState(content?.image_url || '')
  const [hotspots, setHotspots] = useState(content?.hotspots || [])
  const [labels, setLabels] = useState(content?.labels || [])
  const [question, setQuestion] = useState(content?.question || '')
  const [explanation, setExplanation] = useState(content?.explanation || '')
  const [settings, setSettings] = useState({
    shuffle_labels: true,
    ...content?.settings
  })

  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState(null)
  const [tempRect, setTempRect] = useState(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageScale, setImageScale] = useState(1)
  const [previewMode, setPreviewMode] = useState(false)
  const [selectedHotspot, setSelectedHotspot] = useState(null)
  const [editingHotspot, setEditingHotspot] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [draggedHotspot, setDraggedHotspot] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [urlModal, setUrlModal] = useState({ isOpen: false, type: '' })
  const [urlInput, setUrlInput] = useState('')
  const [imageSize, setImageSize] = useState('medium')
  const [customSize, setCustomSize] = useState('400')
  const [audioControls, setAudioControls] = useState({ controls: true, autoplay: false, loop: false, playbackRate: 1 })

  const [uploading, setUploading] = useState(false)
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const containerRef = useRef(null)
  const questionTextareaRef = useRef(null)
  const explanationTextareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const onContentChangeRef = useRef(onContentChange)
  onContentChangeRef.current = onContentChange

  const uploadFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const basePath = folderPath ? `exercise_bank/${folderPath}` : 'exercise_bank'
      const path = `${basePath}/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('exercise-files')
        .upload(path, file, { cacheControl: '3600', upsert: true })
      if (uploadError) throw uploadError
      const { data: publicData } = supabase.storage
        .from('exercise-files')
        .getPublicUrl(path)
      if (publicData?.publicUrl) setImageUrl(publicData.publicUrl)
    } catch (e) {
      console.error('Image upload failed:', e)
      alert('Image upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        uploadFile(item.getAsFile())
        return
      }
    }
  }

  const handleQuestionPaste = async (e) => {
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
        const basePath = folderPath ? `exercise_bank/${folderPath}` : 'exercise_bank'
        const path = `${basePath}/${Date.now()}_${Math.random().toString(36).slice(2)}_pasted.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('exercise-files')
          .upload(path, file, { cacheControl: '3600', upsert: true })
        if (uploadError) throw uploadError
        const { data: publicData } = supabase.storage
          .from('exercise-files')
          .getPublicUrl(path)
        const publicUrl = publicData?.publicUrl
        if (!publicUrl) throw new Error('Cannot get public URL')
        if (isImage) {
          let sizeStyle = ''
          if (imageSize === 'small') sizeStyle = 'style="width: 200px"'
          else if (imageSize === 'medium') sizeStyle = 'style="width: 400px"'
          else if (imageSize === 'large') sizeStyle = 'style="width: 600px"'
          else if (imageSize === 'full') sizeStyle = 'style="width: 100%"'
          else if (imageSize === 'custom' && customSize) sizeStyle = `style="width: ${customSize}px"`
          insertAtCursor(`<img src="${publicUrl}" alt="" ${sizeStyle} />`)
        } else {
          const attrs = []
          if (audioControls.controls) attrs.push('controls')
          if (audioControls.autoplay) attrs.push('autoplay')
          if (audioControls.loop) attrs.push('loop')
          insertAtCursor(`<audio src="${publicUrl}" ${attrs.join(' ')}></audio>`)
        }
      } catch (err) {
        console.error('Paste upload failed:', err)
        alert(`Failed to upload pasted ${isImage ? 'image' : 'audio'}`)
      }
      return
    }
  }

  // Update parent when content changes
  useEffect(() => {
    const updatedContent = {
      image_url: imageUrl,
      hotspots,
      labels,
      question,
      explanation,
      settings
    }
    onContentChangeRef.current(updatedContent)
  }, [imageUrl, hotspots, labels, question, explanation, settings])

  // Calculate image scale when image loads or container resizes
  useEffect(() => {
    const updateScale = () => {
      if (imageRef.current && imageRef.current.complete) {
        const containerWidth = containerRef.current?.clientWidth || 800
        const naturalWidth = imageRef.current.naturalWidth
        const scale = containerWidth / naturalWidth
        setImageScale(scale)
      }
    }

    if (imageLoaded) {
      updateScale()
      window.addEventListener('resize', updateScale)
      return () => window.removeEventListener('resize', updateScale)
    }
  }, [imageLoaded])

  // Canvas drawing handlers
  const handleMouseDown = (e) => {
    if (previewMode) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / imageScale
    const y = (e.clientY - rect.top) / imageScale

    // Check if clicking on existing hotspot to drag
    const clickedHotspot = hotspots.find(hs => {
      const { x: hsX, y: hsY, width, height } = hs.coordinates
      return x >= hsX && x <= hsX + width && y >= hsY && y <= hsY + height
    })

    if (clickedHotspot) {
      // Start dragging existing hotspot
      setIsDragging(true)
      setDraggedHotspot(clickedHotspot)
      setDragOffset({
        x: x - clickedHotspot.coordinates.x,
        y: y - clickedHotspot.coordinates.y
      })
      setSelectedHotspot(clickedHotspot)
    } else {
      // Start drawing new hotspot
      setIsDrawing(true)
      setDrawStart({ x, y })
    }
  }

  const handleMouseMove = (e) => {
    if (previewMode) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / imageScale
    const y = (e.clientY - rect.top) / imageScale

    if (isDragging && draggedHotspot) {
      // Update hotspot position while dragging
      const newX = x - dragOffset.x
      const newY = y - dragOffset.y

      updateHotspot(draggedHotspot.id, 'coordinates', {
        ...draggedHotspot.coordinates,
        x: Math.max(0, newX),
        y: Math.max(0, newY)
      })
    } else if (isDrawing && drawStart) {
      // Draw new hotspot
      setTempRect({
        x: Math.min(drawStart.x, x),
        y: Math.min(drawStart.y, y),
        width: Math.abs(x - drawStart.x),
        height: Math.abs(y - drawStart.y)
      })
    }
  }

  const handleMouseUp = (e) => {
    if (previewMode) return

    if (isDragging) {
      // Finish dragging
      setIsDragging(false)
      setDraggedHotspot(null)
      setDragOffset({ x: 0, y: 0 })
      return
    }

    if (!isDrawing) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / imageScale
    const y = (e.clientY - rect.top) / imageScale

    const width = Math.abs(x - drawStart.x)
    const height = Math.abs(y - drawStart.y)

    // Only create hotspot if minimum size (20px)
    if (width > 20 && height > 20) {
      const newHotspot = {
        id: `hotspot_${Date.now()}`,
        label: `Area ${hotspots.length + 1}`,
        coordinates: {
          x: Math.min(drawStart.x, x),
          y: Math.min(drawStart.y, y),
          width,
          height
        }
      }

      const updatedHotspots = [...hotspots, newHotspot]
      setHotspots(updatedHotspots)

      // Auto-create matching label (only for non-distractor hotspots)
      if (!newHotspot.type || newHotspot.type === 'correct') {
        const newLabel = {
          id: `label_${Date.now()}`,
          text: newHotspot.label,
          type: 'correct',
          hotspot_id: newHotspot.id
        }
        setLabels([...labels, newLabel])
      }
    }

    setIsDrawing(false)
    setDrawStart(null)
    setTempRect(null)
  }

  const handleImageLoad = () => {
    setImageLoaded(true)
  }

  const handleImageError = () => {
    setImageLoaded(false)
    alert('Failed to load image. Please check the URL.')
  }

  const deleteHotspot = (hotspotId) => {
    setHotspots(hotspots.filter(h => h.id !== hotspotId))
    setLabels(labels.filter(l => l.hotspot_id !== hotspotId))
    if (selectedHotspot?.id === hotspotId) setSelectedHotspot(null)
    if (editingHotspot?.id === hotspotId) setEditingHotspot(null)
  }

  const updateHotspot = (hotspotId, field, value) => {
    setHotspots(hotspots.map(h =>
      h.id === hotspotId ? { ...h, [field]: value } : h
    ))

    // Update corresponding label text if label field changed
    if (field === 'label') {
      setLabels(labels.map(l =>
        l.hotspot_id === hotspotId ? { ...l, text: value } : l
      ))
    }
  }

  const toggleHotspotType = (hotspotId) => {
    const hotspot = hotspots.find(h => h.id === hotspotId)
    if (!hotspot) return

    const newType = hotspot.type === 'distractor' ? 'correct' : 'distractor'

    setHotspots(hotspots.map(h =>
      h.id === hotspotId ? { ...h, type: newType } : h
    ))

    if (newType === 'distractor') {
      // Remove the correct label linked to this hotspot
      setLabels(labels.filter(l => l.hotspot_id !== hotspotId))
    } else {
      // Re-create a correct label for this hotspot
      const newLabel = {
        id: `label_${Date.now()}`,
        text: hotspot.label,
        type: 'correct',
        hotspot_id: hotspotId
      }
      setLabels([...labels, newLabel])
    }
  }

  const addDistractorLabel = () => {
    const newLabel = {
      id: `label_${Date.now()}`,
      text: `Distractor ${labels.filter(l => l.type === 'distractor').length + 1}`,
      type: 'distractor',
      hotspot_id: null
    }
    setLabels([...labels, newLabel])
  }

  const deleteLabel = (labelId) => {
    setLabels(labels.filter(l => l.id !== labelId))
  }

  const updateLabel = (labelId, text) => {
    setLabels(labels.map(l =>
      l.id === labelId ? { ...l, text } : l
    ))
  }

  const insertAtCursor = (htmlTag) => {
    const textarea = questionTextareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = question
    const before = text.substring(0, start)
    const after = text.substring(end)

    const newText = before + htmlTag + after
    setQuestion(newText)

    // Set cursor position after inserted text
    setTimeout(() => {
      textarea.focus()
      const newPosition = start + htmlTag.length
      textarea.setSelectionRange(newPosition, newPosition)
    }, 0)
  }

  const applyAlignment = (alignment) => {
    const textarea = questionTextareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = question
    const selectedText = text.substring(start, end) || 'text'
    const before = text.substring(0, start)
    const after = text.substring(end)
    const wrapped = `<div style="text-align: ${alignment}">${selectedText}</div>`

    const newText = before + wrapped + after
    setQuestion(newText)

    setTimeout(() => {
      textarea.focus()
      const newPosition = start + wrapped.length
      textarea.setSelectionRange(newPosition, newPosition)
    }, 0)
  }

  const handleOpenImageModal = () => {
    setUrlModal({ isOpen: true, type: 'image' })
    setUrlInput('')
    setImageSize('medium')
    setCustomSize('400')
  }

  const handleOpenAudioModal = () => {
    setUrlModal({ isOpen: true, type: 'audio' })
    setUrlInput('')
    setAudioControls({ controls: true, autoplay: false, loop: false, playbackRate: 1 })
  }

  const handleUrlSubmit = () => {
    const trimmedUrl = urlInput.trim()
    if (!trimmedUrl) return

    if (urlModal.type === 'image') {
      let sizeStyle = ''
      if (imageSize === 'small') sizeStyle = 'style="width: 200px"'
      else if (imageSize === 'medium') sizeStyle = 'style="width: 400px"'
      else if (imageSize === 'large') sizeStyle = 'style="width: 600px"'
      else if (imageSize === 'full') sizeStyle = 'style="width: 100%"'
      else if (imageSize === 'custom' && customSize) sizeStyle = `style="width: ${customSize}px"`

      insertAtCursor(`\n<img src="${trimmedUrl}" alt="" ${sizeStyle} />\n`)
    } else if (urlModal.type === 'audio') {
      const attrs = []
      if (audioControls.controls) attrs.push('controls')
      if (audioControls.autoplay) attrs.push('autoplay')
      if (audioControls.loop) attrs.push('loop')
      if (audioControls.playbackRate && audioControls.playbackRate !== 1) attrs.push(`data-playback-rate="${audioControls.playbackRate}"`)
      const audioAttrs = attrs.join(' ')

      insertAtCursor(`<audio src="${trimmedUrl}" ${audioAttrs}></audio>`)
    }

    setUrlModal({ isOpen: false, type: '' })
    setUrlInput('')
  }

  const handleUrlCancel = () => {
    setUrlModal({ isOpen: false, type: '' })
    setUrlInput('')
  }

  const validateExercise = () => {
    const errors = []
    const warnings = []

    if (!imageUrl) errors.push('Image URL is required')
    if (hotspots.length === 0) errors.push('At least one hotspot is required')

    hotspots.forEach(hs => {
      const matchingLabel = labels.find(l => l.hotspot_id === hs.id)
      if (!matchingLabel) errors.push(`Hotspot "${hs.label}" has no matching label`)
    })

    const distractors = labels.filter(l => l.type === 'distractor')
    if (distractors.length === 0) warnings.push('Consider adding distractor labels to increase difficulty')

    return { errors, warnings, isValid: errors.length === 0 }
  }

  const validation = validateExercise()

  return (
    <div className="space-y-6">
      {/* Image URL Input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Image URL
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onPaste={handlePaste}
            placeholder="Paste image URL or paste an image (Ctrl+V)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => uploadFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>

      {/* Question Text */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Question/Instructions
        </label>
        <textarea
          ref={questionTextareaRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => handleRichTextShortcut(e, questionTextareaRef.current, question, setQuestion)}
          onPaste={handleQuestionPaste}
          placeholder="Label the parts of the diagram by clicking a label then clicking the correct location."
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
        />

        {/* Media Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleOpenImageModal}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
            title="Add image"
          >
            <ImageIcon className="w-4 h-4" />
            Add Image
          </button>
          <button
            type="button"
            onClick={handleOpenAudioModal}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
            title="Add audio"
          >
            <Music className="w-4 h-4" />
            Add Audio
          </button>
          <div className="flex gap-1 ml-2 border-l pl-2 border-gray-300">
            <button type="button" onClick={() => applyAlignment('left')} className="p-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align left"><AlignLeft className="w-4 h-4" /></button>
            <button type="button" onClick={() => applyAlignment('center')} className="p-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align center"><AlignCenter className="w-4 h-4" /></button>
            <button type="button" onClick={() => applyAlignment('right')} className="p-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align right"><AlignRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Validation Messages */}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="space-y-2">
          {validation.errors.map((error, i) => (
            <div key={`error-${i}`} className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          ))}
          {validation.warnings.map((warning, i) => (
            <div key={`warning-${i}`} className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <span className="text-sm text-yellow-700">{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Canvas Area and Hotspots Side by Side */}
      {imageUrl && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left: Image Canvas */}
          <div className="lg:col-span-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Draw Hotspots (Click and drag on the image)
              </label>
              <button
                type="button"
                onClick={() => setPreviewMode(!previewMode)}
                className={`px-3 py-1 rounded-lg flex items-center gap-2 ${
                  previewMode ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {previewMode ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {previewMode ? 'Preview Mode' : 'Edit Mode'}
              </button>
            </div>

            <div
              ref={containerRef}
              className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50"
              style={{ cursor: !previewMode ? 'crosshair' : 'default' }}
            >
              <img
                ref={imageRef}
                src={imageUrl.replace(branding.baseSiteUrl, '/proxy-image')}
                alt="Exercise"
                className="w-full h-auto"
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
              {imageLoaded && (
                <svg
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full"
                  style={{ pointerEvents: previewMode ? 'none' : 'all' }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                >
                  {/* Existing hotspots */}
                  {hotspots.map(hotspot => {
                    const { x, y, width, height } = hotspot.coordinates
                    const scaledX = x * imageScale
                    const scaledY = y * imageScale
                    const scaledWidth = width * imageScale
                    const scaledHeight = height * imageScale
                    const isSelected = selectedHotspot?.id === hotspot.id
                    const isDistractorHotspot = hotspot.type === 'distractor'

                    return (
                      <g key={hotspot.id}>
                        <rect
                          x={scaledX}
                          y={scaledY}
                          width={scaledWidth}
                          height={scaledHeight}
                          fill={isSelected ? 'rgba(59, 130, 246, 0.3)' : isDistractorHotspot ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.2)'}
                          stroke={isSelected ? '#3b82f6' : isDistractorHotspot ? '#ef4444' : '#10b981'}
                          strokeWidth={isSelected ? 3 : 2}
                          strokeDasharray="5,5"
                          onClick={() => setSelectedHotspot(hotspot)}
                          style={{ cursor: 'move' }}
                        />
                        <text
                          x={scaledX + scaledWidth / 2}
                          y={scaledY + scaledHeight / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#1f2937"
                          fontSize="14"
                          fontWeight="bold"
                          className="pointer-events-none select-none"
                        >
                          {hotspot.label}
                        </text>
                      </g>
                    )
                  })}

                  {/* Temporary drawing rectangle */}
                  {tempRect && (
                    <rect
                      x={tempRect.x * imageScale}
                      y={tempRect.y * imageScale}
                      width={tempRect.width * imageScale}
                      height={tempRect.height * imageScale}
                      fill="rgba(59, 130, 246, 0.2)"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      strokeDasharray="5,5"
                    />
                  )}
                </svg>
              )}
            </div>

          </div>

          {/* Right: Hotspots List */}
          {hotspots.length > 0 && (
            <div className="lg:col-span-2 space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Hotspots ({hotspots.length})
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[600px] overflow-y-auto">
                {hotspots.map(hotspot => (
                  <div
                    key={hotspot.id}
                    className={`p-3 border rounded-lg ${
                      selectedHotspot?.id === hotspot.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <input
                        type="text"
                        value={hotspot.label}
                        onChange={(e) => updateHotspot(hotspot.id, 'label', e.target.value)}
                        placeholder="Label name"
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => deleteHotspot(hotspot.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Distractor toggle */}
                    <label className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={hotspot.type === 'distractor'}
                        onChange={() => toggleHotspotType(hotspot.id)}
                        className="rounded text-red-600"
                      />
                      <span className={`text-xs font-medium ${hotspot.type === 'distractor' ? 'text-red-600' : 'text-gray-500'}`}>
                        Distractor hotspot
                      </span>
                    </label>

                    {/* Position and Size Controls */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Position (X, Y)</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            value={Math.round(hotspot.coordinates.x)}
                            onChange={(e) => {
                              const newX = parseInt(e.target.value) || 0
                              updateHotspot(hotspot.id, 'coordinates', {
                                ...hotspot.coordinates,
                                x: newX
                              })
                            }}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                            placeholder="X"
                          />
                          <input
                            type="number"
                            value={Math.round(hotspot.coordinates.y)}
                            onChange={(e) => {
                              const newY = parseInt(e.target.value) || 0
                              updateHotspot(hotspot.id, 'coordinates', {
                                ...hotspot.coordinates,
                                y: newY
                              })
                            }}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                            placeholder="Y"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Size (W × H)</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            value={Math.round(hotspot.coordinates.width)}
                            onChange={(e) => {
                              const newWidth = parseInt(e.target.value) || 20
                              updateHotspot(hotspot.id, 'coordinates', {
                                ...hotspot.coordinates,
                                width: Math.max(20, newWidth)
                              })
                            }}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                            placeholder="W"
                            min="20"
                          />
                          <input
                            type="number"
                            value={Math.round(hotspot.coordinates.height)}
                            onChange={(e) => {
                              const newHeight = parseInt(e.target.value) || 20
                              updateHotspot(hotspot.id, 'coordinates', {
                                ...hotspot.coordinates,
                                height: Math.max(20, newHeight)
                              })
                            }}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                            placeholder="H"
                            min="20"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Labels List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Labels ({labels.length})
          </label>
          <button
            type="button"
            onClick={addDistractorLabel}
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Distractor
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          {labels.map(label => (
            <div
              key={label.id}
              className={`flex items-center gap-2 p-2 border rounded-lg ${
                label.type === 'correct' ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
              }`}
            >
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                label.type === 'correct' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
              }`}>
                {label.type === 'correct' ? '✓' : '✗'}
              </span>
              <input
                type="text"
                value={label.text}
                onChange={(e) => updateLabel(label.id, e.target.value)}
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                readOnly={label.type === 'correct'}
              />
              {label.type === 'distractor' && (
                <button
                  type="button"
                  onClick={() => deleteLabel(label.id)}
                  className="p-1 text-red-600 hover:bg-red-100 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="space-y-3 p-4 border border-gray-300 rounded-lg bg-gray-50">
        <h3 className="text-sm font-medium text-gray-700">Settings</h3>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.shuffle_labels}
            onChange={(e) => setSettings({ ...settings, shuffle_labels: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm text-gray-700">Shuffle labels</span>
        </label>
      </div>

      {/* Explanation */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Explanation (Optional)
        </label>
        <textarea
          ref={explanationTextareaRef}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          onKeyDown={(e) => handleRichTextShortcut(e, explanationTextareaRef.current, explanation, setExplanation)}
          placeholder="Additional explanation or context about this exercise..."
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* URL Input Modal */}
      {urlModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {urlModal.type === 'image' ? 'Add Image' : 'Add Audio'}
              </h3>
              <button
                onClick={handleUrlCancel}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL
                </label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={
                    urlModal.type === 'image'
                      ? 'https://example.com/image.jpg'
                      : 'https://example.com/audio.mp3'
                  }
                  autoFocus
                />
              </div>

              {/* Image Size Options */}
              {urlModal.type === 'image' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Image Size
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="imageSize"
                        value="small"
                        checked={imageSize === 'small'}
                        onChange={(e) => setImageSize(e.target.value)}
                        className="text-blue-600"
                      />
                      <span className="text-sm">Small (200px)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="imageSize"
                        value="medium"
                        checked={imageSize === 'medium'}
                        onChange={(e) => setImageSize(e.target.value)}
                        className="text-blue-600"
                      />
                      <span className="text-sm">Medium (400px)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="imageSize"
                        value="large"
                        checked={imageSize === 'large'}
                        onChange={(e) => setImageSize(e.target.value)}
                        className="text-blue-600"
                      />
                      <span className="text-sm">Large (600px)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="imageSize"
                        value="full"
                        checked={imageSize === 'full'}
                        onChange={(e) => setImageSize(e.target.value)}
                        className="text-blue-600"
                      />
                      <span className="text-sm">Full Width</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="imageSize"
                        value="custom"
                        checked={imageSize === 'custom'}
                        onChange={(e) => setImageSize(e.target.value)}
                        className="text-blue-600"
                      />
                      <span className="text-sm">Custom</span>
                      {imageSize === 'custom' && (
                        <input
                          type="number"
                          value={customSize}
                          onChange={(e) => setCustomSize(e.target.value)}
                          className="ml-2 w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="px"
                        />
                      )}
                    </label>
                  </div>
                </div>
              )}

              {/* Audio Control Options */}
              {urlModal.type === 'audio' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Audio Controls
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={audioControls.controls}
                        onChange={(e) => setAudioControls({ ...audioControls, controls: e.target.checked })}
                        className="rounded text-blue-600"
                      />
                      <span className="text-sm">Show controls</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={audioControls.autoplay}
                        onChange={(e) => setAudioControls({ ...audioControls, autoplay: e.target.checked })}
                        className="rounded text-blue-600"
                      />
                      <span className="text-sm">Autoplay</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={audioControls.loop}
                        onChange={(e) => setAudioControls({ ...audioControls, loop: e.target.checked })}
                        className="rounded text-blue-600"
                      />
                      <span className="text-sm">Loop</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-sm">Playback speed:</span>
                      <select
                        value={audioControls.playbackRate}
                        onChange={(e) => setAudioControls({ ...audioControls, playbackRate: parseFloat(e.target.value) })}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        <option value={0.5}>0.5x</option>
                        <option value={0.75}>0.75x</option>
                        <option value={1}>1x</option>
                        <option value={1.25}>1.25x</option>
                        <option value={1.5}>1.5x</option>
                        <option value={2}>2x</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {/* Preview */}
              {urlInput && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preview
                  </label>
                  {urlModal.type === 'image' ? (
                    <img
                      src={urlInput.replace(branding.baseSiteUrl, '/proxy-image')}
                      alt="Preview"
                      className="max-w-full rounded border"
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  ) : (
                    <audio
                      ref={(el) => { if (el) el.playbackRate = audioControls.playbackRate || 1 }}
                      src={urlInput.replace(branding.baseSiteUrl, '/proxy-image')}
                      controls
                      className="w-full"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleUrlCancel}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUrlSubmit}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                disabled={!urlInput.trim()}
              >
                {urlModal.type === 'image' ? 'Add Image' : 'Add Audio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImageHotspotEditor
