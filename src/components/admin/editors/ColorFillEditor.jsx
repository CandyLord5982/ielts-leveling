import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Upload, Image as ImageIcon, AlertCircle, X, Music, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { handleRichTextShortcut } from '../../../hooks/useRichTextShortcuts'
import { supabase } from '../../../supabase/client'
import { splitAnswers } from '../../../utils/splitAnswers'
import { isQuestionField } from '../../../utils/colorFill'
import {
  loadImagePixels,
  magicWandPolygon,
  reducePolygon,
  polygonArea,
  simplifyEpsilon,
  MIN_REGION_AREA
} from '../../../utils/polygonTools'

import { useBranding } from '../../../hooks/useBranding';

const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const DEFAULT_COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Yellow', hex: '#facc15' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Purple', hex: '#a855f7' }
]

const IMAGE_WIDTHS = { small: '200px', medium: '400px', large: '600px', full: '100%' }

const MIN_TEXT_FIELD_SIZE = 20

const DEFAULT_WAND_TOLERANCE = 25
const LASSO_MIN_STEP = 3 // screen pixels between recorded freehand points

const NOTICES = {
  unreadable: "Cannot read this image's pixels (the image host blocks it). Re-upload the image with Upload, or use Draw region.",
  too_large: 'The selection covers almost the whole image, so the outline probably has a gap. Lower the tolerance or use Draw region.',
  too_small: 'The selection is too small. Click inside a larger area, raise the tolerance, or use Draw region.'
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const Swatch = ({ color, active, disabled, small, onClick }) => (
  <button
    type="button"
    onClick={disabled ? undefined : onClick}
    title={color.name}
    className={`${small ? 'w-5 h-5' : 'w-7 h-7'} rounded-full border-2 ${
      active ? 'border-blue-600 ring-2 ring-blue-300' : 'border-gray-300'
    } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
    style={{ backgroundColor: color.hex }}
  />
)

const ColorFillEditor = ({ content, onContentChange, folderPath }) => {
  const { branding } = useBranding()
  const [imageUrl, setImageUrl] = useState(content?.image_url || '')
  const [palette, setPalette] = useState(() => (
    content?.palette?.length
      ? content.palette
      : DEFAULT_COLORS.map(c => ({ id: newId('color'), ...c }))
  ))
  const [regions, setRegions] = useState(content?.regions || [])
  const [textFields, setTextFields] = useState(content?.text_fields || [])
  const [question, setQuestion] = useState(content?.question || '')
  const [explanation, setExplanation] = useState(content?.explanation || '')
  const [settings, setSettings] = useState({
    reveal_answers: 'never', // 'never' | 'after_submit'
    ...content?.settings
  })

  const [tool, setTool] = useState('wand') // 'wand' | 'draw' | 'lasso' | 'text' | 'select'
  const [draftPoints, setDraftPoints] = useState([])
  const [hoverPoint, setHoverPoint] = useState(null)
  const [drawStart, setDrawStart] = useState(null)
  const [tempRect, setTempRect] = useState(null)
  const [drag, setDrag] = useState(null)
  const [lassoPath, setLassoPath] = useState([])
  const [tolerance, setTolerance] = useState(DEFAULT_WAND_TOLERANCE)
  const [wandBusy, setWandBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectedRegionId, setSelectedRegionId] = useState(null)
  const [selectedTextId, setSelectedTextId] = useState(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageScale, setImageScale] = useState(1)
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })

  const [uploading, setUploading] = useState(false)
  const [urlModal, setUrlModal] = useState({ isOpen: false, type: '' })
  const [urlInput, setUrlInput] = useState('')
  const [imageSize, setImageSize] = useState('medium')
  const [audioMaxPlays, setAudioMaxPlays] = useState(0)
  const [modalUploading, setModalUploading] = useState(false)

  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const containerRef = useRef(null)
  const questionTextareaRef = useRef(null)
  const explanationTextareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const mediaInputRef = useRef(null)
  const pixelCacheRef = useRef({ src: null, promise: null })
  const justDraggedRef = useRef(false)
  const onContentChangeRef = useRef(onContentChange)
  onContentChangeRef.current = onContentChange

  const uploadToBucket = async (file, fileName = file.name) => {
    const basePath = folderPath ? `exercise_bank/${folderPath}` : 'exercise_bank'
    const path = `${basePath}/${Date.now()}_${Math.random().toString(36).slice(2)}_${fileName}`
    const { error: uploadError } = await supabase.storage
      .from('exercise-files')
      .upload(path, file, { cacheControl: '3600', upsert: true })
    if (uploadError) throw uploadError
    const { data: publicData } = supabase.storage
      .from('exercise-files')
      .getPublicUrl(path)
    if (!publicData?.publicUrl) throw new Error('Cannot get public URL')
    return publicData.publicUrl
  }

  const uploadFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      setImageUrl(await uploadToBucket(file))
    } catch (e) {
      console.error('Image upload failed:', e)
      alert('Image upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const uploadMediaFile = async (file) => {
    if (!file) return
    setModalUploading(true)
    try {
      setUrlInput(await uploadToBucket(file))
    } catch (e) {
      console.error('Media upload failed:', e)
      alert('Media upload failed.')
    } finally {
      setModalUploading(false)
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

  const insertAtCursor = (htmlTag) => {
    const textarea = questionTextareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    setQuestion(question.substring(0, start) + htmlTag + question.substring(end))

    setTimeout(() => {
      textarea.focus()
      const newPosition = start + htmlTag.length
      textarea.setSelectionRange(newPosition, newPosition)
    }, 0)
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
        const publicUrl = await uploadToBucket(file, `pasted.${ext}`)
        if (isImage) {
          insertAtCursor(`<img src="${publicUrl}" alt="" style="width: ${IMAGE_WIDTHS.medium}" />`)
        } else {
          insertAtCursor(`<audio src="${publicUrl}" controls></audio>`)
        }
      } catch (err) {
        console.error('Paste upload failed:', err)
        alert(`Failed to upload pasted ${isImage ? 'image' : 'audio'}`)
      }
      return
    }
  }

  const applyAlignment = (alignment) => {
    const textarea = questionTextareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = question.substring(start, end) || 'text'
    const wrapped = `<div style="text-align: ${alignment}">${selectedText}</div>`

    setQuestion(question.substring(0, start) + wrapped + question.substring(end))

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
  }

  const handleOpenAudioModal = () => {
    setUrlModal({ isOpen: true, type: 'audio' })
    setUrlInput('')
    setAudioMaxPlays(0)
  }

  const handleUrlSubmit = () => {
    const trimmedUrl = urlInput.trim()
    if (!trimmedUrl) return

    if (urlModal.type === 'image') {
      insertAtCursor(`\n<img src="${trimmedUrl}" alt="" style="width: ${IMAGE_WIDTHS[imageSize]}" />\n`)
    } else if (urlModal.type === 'audio') {
      const maxPlaysAttr = audioMaxPlays > 0 ? ` data-max-plays="${audioMaxPlays}"` : ''
      insertAtCursor(`<audio src="${trimmedUrl}" controls${maxPlaysAttr}></audio>`)
    }

    setUrlModal({ isOpen: false, type: '' })
    setUrlInput('')
  }

  const handleUrlCancel = () => {
    setUrlModal({ isOpen: false, type: '' })
    setUrlInput('')
  }

  // Update parent when content changes
  useEffect(() => {
    onContentChangeRef.current({
      image_url: imageUrl,
      palette,
      regions,
      text_fields: textFields,
      question,
      explanation,
      settings
    })
  }, [imageUrl, palette, regions, textFields, question, explanation, settings])

  const updateScale = () => {
    const image = imageRef.current
    const container = containerRef.current
    if (!image || !container || !image.naturalWidth || !container.clientWidth) return
    setImageScale(container.clientWidth / image.naturalWidth)
  }

  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget
    setNaturalSize({ w: naturalWidth, h: naturalHeight })
    setImageLoaded(true)
    updateScale()
  }

  const handleImageError = () => {
    setImageLoaded(false)
    alert('Failed to load image. Please check the URL.')
  }

  // Keep the scale in sync when the container resizes
  useEffect(() => {
    const container = containerRef.current
    if (!container || !imageLoaded) return
    const observer = new ResizeObserver(updateScale)
    observer.observe(container)
    return () => observer.disconnect()
  }, [imageLoaded, imageUrl])

  // Esc cancels the polygon being drawn
  useEffect(() => {
    if (draftPoints.length === 0) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setDraftPoints([])
        setHoverPoint(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [draftPoints.length])

  const switchTool = (nextTool) => {
    setTool(nextTool)
    setDraftPoints([])
    setHoverPoint(null)
    setDrawStart(null)
    setTempRect(null)
    setDrag(null)
    setLassoPath([])
    setNotice('')
  }

  // ---------- palette ----------
  const addColor = () => {
    setPalette([...palette, { id: newId('color'), name: `Color ${palette.length + 1}`, hex: '#9ca3af' }])
  }

  const updateColor = (colorId, patch) => {
    setPalette(palette.map(c => (c.id === colorId ? { ...c, ...patch } : c)))
  }

  const deleteColor = (colorId) => {
    setPalette(palette.filter(c => c.id !== colorId))
    setRegions(regions.map(r => ({
      ...r,
      correct_color_id: r.correct_color_id === colorId ? null : r.correct_color_id,
      accepted_color_ids: (r.accepted_color_ids || []).filter(id => id !== colorId)
    })))
  }

  // ---------- regions ----------
  const updateRegion = (regionId, patch) => {
    setRegions(prev => prev.map(r => (
      r.id === regionId ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r
    )))
  }

  const deleteRegion = (regionId) => {
    setRegions(regions.filter(r => r.id !== regionId))
    if (selectedRegionId === regionId) setSelectedRegionId(null)
  }

  const setCorrectColor = (regionId, colorId) => {
    updateRegion(regionId, r => ({
      correct_color_id: colorId,
      accepted_color_ids: (r.accepted_color_ids || []).filter(id => id !== colorId)
    }))
  }

  const toggleAcceptedColor = (regionId, colorId) => {
    updateRegion(regionId, r => {
      const accepted = r.accepted_color_ids || []
      return {
        accepted_color_ids: accepted.includes(colorId)
          ? accepted.filter(id => id !== colorId)
          : [...accepted, colorId]
      }
    })
  }

  const addRegionFromPoints = (points) => {
    const id = newId('region')
    setRegions(prev => [...prev, {
      id,
      label: `Area ${prev.length + 1}`,
      points,
      correct_color_id: null,
      accepted_color_ids: []
    }])
    setSelectedRegionId(id)
    setSelectedTextId(null)
  }

  const finishPolygon = () => {
    if (draftPoints.length < 3) return
    addRegionFromPoints(draftPoints)
    setDraftPoints([])
    setHoverPoint(null)
  }

  const finishLasso = () => {
    const path = lassoPath
    setLassoPath([])
    if (path.length < 3) return

    const polygon = reducePolygon(path, simplifyEpsilon(naturalSize))
    if (polygon.length < 3 || polygonArea(polygon) < MIN_REGION_AREA) {
      setNotice(NOTICES.too_small)
      return
    }
    setNotice('')
    addRegionFromPoints(polygon)
  }

  // Decoded pixels are cached per image so only the first wand click pays the loading cost.
  const getPixels = () => {
    const displayed = imageUrl.replace(branding.baseSiteUrl, '/proxy-image')
    // The displayed <img> may be cached without CORS headers, which would block reading its pixels.
    // A cross-origin URL gets a throwaway query parameter so the browser fetches a fresh CORS copy.
    const src = /^https?:/.test(displayed)
      ? `${displayed}${displayed.includes('?') ? '&' : '?'}wand=1`
      : displayed
    if (pixelCacheRef.current.src !== src) {
      pixelCacheRef.current = {
        src,
        promise: loadImagePixels(src).catch(error => {
          pixelCacheRef.current = { src: null, promise: null }
          throw error
        })
      }
    }
    return pixelCacheRef.current.promise
  }

  const runMagicWand = async (point) => {
    if (wandBusy) return
    setWandBusy(true)
    setNotice('')
    try {
      const pixels = await getPixels()
      // Let the busy cursor paint before the synchronous fill runs
      await new Promise(resolve => setTimeout(resolve, 0))
      const result = magicWandPolygon(pixels, point, tolerance, naturalSize)
      if (result.error) {
        setNotice(NOTICES[result.error])
        return
      }
      addRegionFromPoints(result.polygon)
    } catch (error) {
      console.error('Magic wand failed:', error)
      setNotice(NOTICES.unreadable)
    } finally {
      setWandBusy(false)
    }
  }

  const deleteVertex = (regionId, index) => {
    updateRegion(regionId, r => (
      r.points.length > 3 ? { points: r.points.filter((_, i) => i !== index) } : {}
    ))
  }

  // Adds a point halfway along the edge that starts at `index`.
  const insertVertex = (regionId, index) => {
    updateRegion(regionId, r => {
      const a = r.points[index]
      const b = r.points[(index + 1) % r.points.length]
      const middle = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) }
      return { points: [...r.points.slice(0, index + 1), middle, ...r.points.slice(index + 1)] }
    })
  }

  // ---------- text fields ----------
  const updateTextField = (fieldId, patch) => {
    setTextFields(prev => prev.map(f => (f.id === fieldId ? { ...f, ...patch } : f)))
  }

  const deleteTextField = (fieldId) => {
    setTextFields(textFields.filter(f => f.id !== fieldId))
    if (selectedTextId === fieldId) setSelectedTextId(null)
  }

  const updateTextCoordinate = (fieldId, key, value, min) => {
    const field = textFields.find(f => f.id === fieldId)
    if (!field) return
    updateTextField(fieldId, {
      coordinates: { ...field.coordinates, [key]: Math.max(min, parseInt(value) || min) }
    })
  }

  // ---------- canvas ----------
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.round(clamp((e.clientX - rect.left) / imageScale, 0, naturalSize.w)),
      y: Math.round(clamp((e.clientY - rect.top) / imageScale, 0, naturalSize.h))
    }
  }

  const handleCanvasClick = (e) => {
    // A drag that ends off its handle still fires a click on the canvas: ignore it
    if (justDraggedRef.current) return

    if (tool === 'draw') {
      setDraftPoints([...draftPoints, getPos(e)])
    } else if (tool === 'wand') {
      runMagicWand(getPos(e))
    }
  }

  const handleMouseDown = (e) => {
    if (tool === 'text') {
      setDrawStart(getPos(e))
    } else if (tool === 'lasso') {
      setLassoPath([getPos(e)])
    } else if (tool === 'select' && e.target === e.currentTarget) {
      setSelectedRegionId(null)
      setSelectedTextId(null)
    }
  }

  const handleMouseMove = (e) => {
    const pos = getPos(e)

    if (drag?.kind === 'vertex') {
      updateRegion(drag.regionId, r => ({
        points: r.points.map((p, i) => (i === drag.index ? pos : p))
      }))
    } else if (drag?.kind === 'text') {
      setTextFields(prev => prev.map(f => {
        if (f.id !== drag.fieldId) return f
        const { width, height } = f.coordinates
        return {
          ...f,
          coordinates: {
            ...f.coordinates,
            x: Math.round(clamp(pos.x - drag.offsetX, 0, Math.max(0, naturalSize.w - width))),
            y: Math.round(clamp(pos.y - drag.offsetY, 0, Math.max(0, naturalSize.h - height)))
          }
        }
      }))
    } else if (tool === 'text' && drawStart) {
      setTempRect({
        x: Math.min(drawStart.x, pos.x),
        y: Math.min(drawStart.y, pos.y),
        width: Math.abs(pos.x - drawStart.x),
        height: Math.abs(pos.y - drawStart.y)
      })
    } else if (tool === 'draw' && draftPoints.length > 0) {
      setHoverPoint(pos)
    } else if (tool === 'lasso' && lassoPath.length > 0) {
      const last = lassoPath[lassoPath.length - 1]
      if (Math.hypot(pos.x - last.x, pos.y - last.y) * imageScale >= LASSO_MIN_STEP) {
        setLassoPath(prev => [...prev, pos])
      }
    }
  }

  const handleMouseUp = () => {
    if (drag) {
      justDraggedRef.current = true
      setTimeout(() => { justDraggedRef.current = false }, 0)
      setDrag(null)
      return
    }

    if (tool === 'lasso' && lassoPath.length > 0) {
      finishLasso()
      return
    }

    if (tool === 'text' && drawStart && tempRect) {
      if (tempRect.width >= MIN_TEXT_FIELD_SIZE && tempRect.height >= MIN_TEXT_FIELD_SIZE) {
        const field = {
          id: newId('text'),
          label: `Text ${textFields.length + 1}`,
          kind: 'question',
          question: '',
          answer: '',
          case_sensitive: false,
          coordinates: tempRect
        }
        setTextFields([...textFields, field])
        setSelectedTextId(field.id)
        setSelectedRegionId(null)
      }
    }
    setDrawStart(null)
    setTempRect(null)
  }

  const handleMouseLeave = () => {
    setLassoPath([])
    setDrag(null)
    setDrawStart(null)
    setTempRect(null)
    setHoverPoint(null)
  }

  const toScreen = (points) => points.map(p => `${p.x * imageScale},${p.y * imageScale}`).join(' ')

  const centroid = (points) => ({
    x: (points.reduce((sum, p) => sum + p.x, 0) / points.length) * imageScale,
    y: (points.reduce((sum, p) => sum + p.y, 0) / points.length) * imageScale
  })

  const colorById = (colorId) => palette.find(c => c.id === colorId)

  const validateExercise = () => {
    const errors = []
    const warnings = []

    if (!imageUrl) errors.push('Image URL is required')
    if (palette.length < 2) errors.push('At least two colors are required')
    if (regions.length === 0) errors.push('At least one region is required')

    regions.forEach(region => {
      if (!colorById(region.correct_color_id)) errors.push(`Region "${region.label}" has no correct color`)
    })

    textFields.forEach(field => {
      const isQuestion = isQuestionField(field)
      if (isQuestion && splitAnswers(field.answer).length === 0) {
        errors.push(`Question "${field.label}" has no correct answer`)
      }
      if (!(field.question || '').trim()) {
        warnings.push(`${isQuestion ? 'Question' : 'Text'} "${field.label}" is empty`)
      }
    })

    const usedColorIds = new Set(regions.map(r => r.correct_color_id))
    if (palette.length >= 2 && palette.every(c => usedColorIds.has(c.id))) {
      warnings.push('Consider adding colors not used by any region to increase difficulty')
    }

    return { errors, warnings }
  }

  const validation = validateExercise()
  const canvasCursor = wandBusy ? 'progress' : tool === 'select' ? 'default' : 'crosshair'
  const interactiveShapes = tool === 'select'
  // The selected region keeps its points editable right after a wand or freehand selection
  const canEditPoints = tool === 'select' || tool === 'wand' || tool === 'lasso'

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
          placeholder="Color each part of the picture. Pick a color, then click the area."
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

      {/* Palette */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Color palette ({palette.length})
          </label>
          <button
            type="button"
            onClick={addColor}
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Color
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Students choose from these colors. Colors that no region uses act as distractors.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {palette.map(color => (
            <div key={color.id} className="flex items-center gap-2 p-2 border border-gray-300 rounded-lg">
              <input
                type="color"
                value={color.hex}
                onChange={(e) => updateColor(color.id, { hex: e.target.value })}
                className="w-8 h-8 p-0 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={color.name}
                onChange={(e) => updateColor(color.id, { name: e.target.value })}
                placeholder="Color name"
                className="flex-1 min-w-0 px-2 py-1 border border-gray-300 rounded text-sm"
              />
              <button
                type="button"
                onClick={() => deleteColor(color.id)}
                className="p-1 text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
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

      {/* Canvas Area and Lists Side by Side */}
      {imageUrl && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left: Image Canvas */}
          <div className="lg:col-span-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-sm font-medium text-gray-700">
                {tool === 'draw' && 'Click around the outline to draw a region'}
                {tool === 'wand' && 'Click inside an area to select it automatically'}
                {tool === 'lasso' && 'Hold the mouse button and trace around the outline'}
                {tool === 'text' && 'Click and drag to place a question or some text on the image'}
                {tool === 'select' && 'Select a shape, drag its points to adjust (double-click a point to remove it)'}
              </label>
              <div className="flex bg-gray-100 rounded-lg p-1">
                {[
                  { value: 'wand', label: 'Magic wand' },
                  { value: 'draw', label: 'Draw region' },
                  { value: 'lasso', label: 'Freehand' },
                  { value: 'text', label: 'Text / Question' },
                  { value: 'select', label: 'Select' }
                ].map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => switchTool(option.value)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                      tool === option.value ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {tool === 'draw' && draftPoints.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{draftPoints.length} points</span>
                <button
                  type="button"
                  onClick={() => setDraftPoints(draftPoints.slice(0, -1))}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                >
                  Undo point
                </button>
                <button
                  type="button"
                  onClick={() => { setDraftPoints([]); setHoverPoint(null) }}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={finishPolygon}
                  disabled={draftPoints.length < 3}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
                >
                  Finish region
                </button>
              </div>
            )}

            {tool === 'wand' && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-gray-600" htmlFor="wand-tolerance">
                  Tolerance {tolerance}
                </label>
                <input
                  id="wand-tolerance"
                  type="range"
                  min="0"
                  max="100"
                  value={tolerance}
                  onChange={(e) => setTolerance(parseInt(e.target.value))}
                  className="w-40"
                />
                <span className="text-xs text-gray-500">
                  Raise it if the area is not fully selected, lower it if it spills past the outline.
                </span>
                {wandBusy && <span className="text-xs text-blue-600">Selecting...</span>}
              </div>
            )}

            {selectedRegionId && (tool === 'wand' || tool === 'lasso') && (
              <p className="text-xs text-gray-500">
                Adjust the selected region: drag a white point to move it, drag a small blue point on an edge to add a new point, double-click a point to remove it.
              </p>
            )}

            {notice && (
              <div className="flex items-start gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                <span className="text-sm text-yellow-700 flex-1">{notice}</span>
                <button type="button" onClick={() => setNotice('')} className="text-yellow-600 hover:text-yellow-800">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div
              ref={containerRef}
              className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50"
              style={{ cursor: canvasCursor }}
            >
              <img
                ref={imageRef}
                src={imageUrl.replace(branding.baseSiteUrl, '/proxy-image')}
                alt="Exercise"
                className="w-full h-auto select-none"
                draggable={false}
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
              {imageLoaded && (
                <svg
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full"
                  onClick={handleCanvasClick}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseLeave}
                >
                  {/* Saved regions */}
                  {regions.map(region => {
                    const color = colorById(region.correct_color_id)
                    const isSelected = selectedRegionId === region.id
                    const center = centroid(region.points)

                    return (
                      <g key={region.id}>
                        <polygon
                          points={toScreen(region.points)}
                          fill={color ? color.hex : 'rgba(255, 255, 255, 0.2)'}
                          fillOpacity={color ? 0.55 : 1}
                          stroke={isSelected ? '#3b82f6' : '#111827'}
                          strokeWidth={isSelected ? 3 : 2}
                          strokeDasharray="5,5"
                          onClick={() => {
                            if (!interactiveShapes) return
                            setSelectedRegionId(region.id)
                            setSelectedTextId(null)
                          }}
                          style={{ pointerEvents: interactiveShapes ? 'all' : 'none', cursor: 'pointer' }}
                        />
                        <text
                          x={center.x}
                          y={center.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#1f2937"
                          fontSize="14"
                          fontWeight="bold"
                          className="pointer-events-none select-none"
                          style={{ textShadow: '0 0 3px rgba(255,255,255,0.9)' }}
                        >
                          {region.label}
                        </text>
                        {isSelected && canEditPoints && (
                          <>
                            {/* Small points halfway along each edge: drag one to add a new point */}
                            {region.points.map((point, index) => {
                              const next = region.points[(index + 1) % region.points.length]
                              return (
                                <circle
                                  key={`edge-${index}`}
                                  cx={((point.x + next.x) / 2) * imageScale}
                                  cy={((point.y + next.y) / 2) * imageScale}
                                  r={4}
                                  fill="#3b82f6"
                                  fillOpacity={0.5}
                                  stroke="white"
                                  strokeWidth={1}
                                  style={{ cursor: 'copy' }}
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => {
                                    e.stopPropagation()
                                    insertVertex(region.id, index)
                                    setDrag({ kind: 'vertex', regionId: region.id, index: index + 1 })
                                  }}
                                />
                              )
                            })}
                            {region.points.map((point, index) => (
                              <circle
                                key={`point-${index}`}
                                cx={point.x * imageScale}
                                cy={point.y * imageScale}
                                r={6}
                                fill="white"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                style={{ cursor: 'move' }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => {
                                  e.stopPropagation()
                                  setDrag({ kind: 'vertex', regionId: region.id, index })
                                }}
                                onDoubleClick={() => deleteVertex(region.id, index)}
                              />
                            ))}
                          </>
                        )}
                      </g>
                    )
                  })}

                  {/* Text boxes */}
                  {textFields.map((field, index) => {
                    const { x, y, width, height } = field.coordinates
                    const isSelected = selectedTextId === field.id

                    return (
                      <g key={field.id}>
                        <rect
                          x={x * imageScale}
                          y={y * imageScale}
                          width={width * imageScale}
                          height={height * imageScale}
                          fill="rgba(255, 255, 255, 0.6)"
                          stroke={isSelected ? '#3b82f6' : '#6b7280'}
                          strokeWidth={isSelected ? 3 : 2}
                          onMouseDown={(e) => {
                            if (!interactiveShapes) return
                            e.stopPropagation()
                            const pos = getPos(e)
                            setSelectedTextId(field.id)
                            setSelectedRegionId(null)
                            setDrag({ kind: 'text', fieldId: field.id, offsetX: pos.x - x, offsetY: pos.y - y })
                          }}
                          style={{ pointerEvents: interactiveShapes ? 'all' : 'none', cursor: 'move' }}
                        />
                        <text
                          x={x * imageScale + (width * imageScale) / 2}
                          y={y * imageScale + (height * imageScale) / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#374151"
                          fontSize="13"
                          className="pointer-events-none select-none"
                        >
                          {index + 1}. {field.label}
                        </text>
                      </g>
                    )
                  })}

                  {/* Polygon being drawn */}
                  {draftPoints.length > 0 && (
                    <g>
                      <polyline
                        points={toScreen(hoverPoint ? [...draftPoints, hoverPoint] : draftPoints)}
                        fill="rgba(59, 130, 246, 0.15)"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        strokeDasharray="5,5"
                        style={{ pointerEvents: 'none' }}
                      />
                      {draftPoints.map((point, index) => (
                        <circle
                          key={index}
                          cx={point.x * imageScale}
                          cy={point.y * imageScale}
                          r={index === 0 ? 8 : 4}
                          fill={index === 0 && draftPoints.length >= 3 ? '#3b82f6' : 'white'}
                          stroke="#3b82f6"
                          strokeWidth={2}
                          style={{ cursor: index === 0 && draftPoints.length >= 3 ? 'pointer' : 'crosshair' }}
                          onClick={(e) => {
                            if (index !== 0 || draftPoints.length < 3) return
                            e.stopPropagation()
                            finishPolygon()
                          }}
                        />
                      ))}
                    </g>
                  )}

                  {/* Freehand path being drawn */}
                  {lassoPath.length > 1 && (
                    <polyline
                      points={toScreen(lassoPath)}
                      fill="rgba(59, 130, 246, 0.15)"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Text box being drawn */}
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
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                </svg>
              )}
            </div>
          </div>

          {/* Right: Regions and text boxes */}
          <div className="lg:col-span-2 space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Regions ({regions.length})
              </label>
              {regions.length === 0 && (
                <p className="text-xs text-gray-500">Use &quot;Draw region&quot; and click around the outline of each area.</p>
              )}
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {regions.map(region => (
                  <div
                    key={region.id}
                    onClick={() => { setSelectedRegionId(region.id); setSelectedTextId(null) }}
                    className={`p-3 border rounded-lg ${
                      selectedRegionId === region.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <input
                        type="text"
                        value={region.label}
                        onChange={(e) => updateRegion(region.id, { label: e.target.value })}
                        placeholder="Region name"
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => deleteRegion(region.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <label className="text-xs text-gray-600 mb-1 block">Correct color</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {palette.map(color => (
                        <Swatch
                          key={color.id}
                          color={color}
                          active={region.correct_color_id === color.id}
                          onClick={() => setCorrectColor(region.id, color.id)}
                        />
                      ))}
                    </div>

                    <label className="text-xs text-gray-600 mb-1 block">Also accept (optional)</label>
                    <div className="flex flex-wrap gap-1.5">
                      {palette.map(color => (
                        <Swatch
                          key={color.id}
                          small
                          color={color}
                          active={(region.accepted_color_ids || []).includes(color.id)}
                          disabled={region.correct_color_id === color.id}
                          onClick={() => toggleAcceptedColor(region.id, color.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Text and questions ({textFields.length})
              </label>
              {textFields.length === 0 && (
                <p className="text-xs text-gray-500">
                  Optional. Draw a box on an empty part of the picture, then choose a type. Question: the student types an answer, and it counts as one graded item like a colored area. Text only: just shows the words, with no input and no grading.
                </p>
              )}
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {textFields.map(field => (
                  <div
                    key={field.id}
                    onClick={() => { setSelectedTextId(field.id); setSelectedRegionId(null) }}
                    className={`p-3 border rounded-lg ${
                      selectedTextId === field.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateTextField(field.id, { label: e.target.value })}
                        placeholder="Box name"
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => deleteTextField(field.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex bg-gray-100 rounded-lg p-1 mb-2">
                      {[
                        { value: 'question', label: 'Question' },
                        { value: 'label', label: 'Text only' }
                      ].map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateTextField(field.id, { kind: option.value })}
                          className={`flex-1 px-2 py-1 text-xs font-medium rounded-md ${
                            (isQuestionField(field) ? 'question' : 'label') === option.value
                              ? 'bg-white shadow text-blue-700'
                              : 'text-gray-600 hover:text-gray-800'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <label className="text-xs text-gray-600 mb-1 block">
                      {isQuestionField(field) ? 'Question (shown on the card)' : 'Text shown on the image'}
                    </label>
                    <textarea
                      value={field.question || ''}
                      onChange={(e) => updateTextField(field.id, { question: e.target.value })}
                      placeholder={isQuestionField(field) ? 'What animal is this?' : 'Look at the farm animals'}
                      rows={2}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm mb-2"
                    />

                    {isQuestionField(field) && (
                      <>
                        <label className="text-xs text-gray-600 mb-1 block">Correct answer(s)</label>
                        <input
                          type="text"
                          value={field.answer || ''}
                          onChange={(e) => updateTextField(field.id, { answer: e.target.value })}
                          placeholder="chicken | hen"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <p className="text-xs text-gray-400 mb-2">Separate several accepted answers with | or /</p>

                        <label className="flex items-center gap-2 mb-2">
                          <input
                            type="checkbox"
                            checked={!!field.case_sensitive}
                            onChange={(e) => updateTextField(field.id, { case_sensitive: e.target.checked })}
                            className="rounded"
                          />
                          <span className="text-xs text-gray-600">Case sensitive</span>
                        </label>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Position (X, Y)</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            value={Math.round(field.coordinates.x)}
                            onChange={(e) => updateTextCoordinate(field.id, 'x', e.target.value, 0)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                            placeholder="X"
                          />
                          <input
                            type="number"
                            value={Math.round(field.coordinates.y)}
                            onChange={(e) => updateTextCoordinate(field.id, 'y', e.target.value, 0)}
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
                            value={Math.round(field.coordinates.width)}
                            onChange={(e) => updateTextCoordinate(field.id, 'width', e.target.value, MIN_TEXT_FIELD_SIZE)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                            placeholder="W"
                            min={MIN_TEXT_FIELD_SIZE}
                          />
                          <input
                            type="number"
                            value={Math.round(field.coordinates.height)}
                            onChange={(e) => updateTextCoordinate(field.id, 'height', e.target.value, MIN_TEXT_FIELD_SIZE)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                            placeholder="H"
                            min={MIN_TEXT_FIELD_SIZE}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="space-y-3 p-4 border border-gray-300 rounded-lg bg-gray-50">
        <h3 className="text-sm font-medium text-gray-700">Settings</h3>
        <div className="space-y-2">
          <p className="text-xs text-gray-600">After a student submits:</p>
          {[
            { value: 'never', label: 'Do not show the correct answers' },
            { value: 'after_submit', label: 'Let the student view the correct answers (colors and answers)' }
          ].map(option => (
            <label key={option.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="reveal_answers"
                checked={settings.reveal_answers === option.value}
                onChange={() => setSettings({ ...settings, reveal_answers: option.value })}
              />
              <span className="text-sm text-gray-700">{option.label}</span>
            </label>
          ))}
          <p className="text-xs text-gray-500">
            If students can view the answers, a retry becomes easy. Teachers always see the answers in the reports.
          </p>
        </div>
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
                <div className="mt-2">
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept={urlModal.type === 'image' ? 'image/*' : 'audio/*'}
                    className="hidden"
                    onChange={(e) => { uploadMediaFile(e.target.files?.[0]); e.target.value = '' }}
                  />
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    disabled={modalUploading}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    {modalUploading ? 'Uploading...' : 'Or upload from device'}
                  </button>
                </div>
              </div>

              {urlModal.type === 'image' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Image Size
                  </label>
                  <select
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="small">Small (200px)</option>
                    <option value="medium">Medium (400px)</option>
                    <option value="large">Large (600px)</option>
                    <option value="full">Full Width</option>
                  </select>
                </div>
              )}

              {urlModal.type === 'audio' && (
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
              )}

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

export default ColorFillEditor
