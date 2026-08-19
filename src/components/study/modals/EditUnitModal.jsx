import React, { useState, useEffect, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { supabase } from '../../../supabase/client'
import { X, BookOpen, Save, Upload, Trash2, Check } from 'lucide-react'

// Helper to create a cropped image from canvas
const createCroppedImage = (imageSrc, pixelCrop) => {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = pixelCrop.width
      canvas.height = pixelCrop.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(
        image,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, pixelCrop.width, pixelCrop.height
      )
      canvas.toBlob(resolve, 'image/jpeg', 0.9)
    }
    image.src = imageSrc
  })
}

// Compute cropper aspect ratio to match actual unit card dimensions
const getCropAspect = (sessionCount) => {
  const cols = 4 // lg:grid-cols-4 in UnitList session grid
  const rows = Math.max(1, Math.ceil(sessionCount / cols))
  const cardWidth = 450 // approximate card width in px at lg breakpoint
  const headerHeight = 100 // ribbon + header + padding
  const rowHeight = 92 // 80px session + 12px gap
  const cardHeight = headerHeight + rows * rowHeight
  return cardWidth / cardHeight
}

const EditUnitModal = ({ unit, onClose, onUpdated, sessionCount = 0 }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    color_theme: 'blue',
    estimated_duration: 60,
    thumbnail_url: '',
    unit_number: 1
  })
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // Crop state
  const [cropImageSrc, setCropImageSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const colorOptions = [
    { value: 'blue', label: 'Ice', class: 'bg-blue-500' },
    { value: 'green', label: 'Forest', class: 'bg-green-500' },
    { value: 'purple', label: 'Pirate', class: 'bg-purple-500' },
    { value: 'orange', label: 'Ninja', class: 'bg-gray-500' },
    { value: 'red', label: 'Dino', class: 'bg-yellow-700' },
    { value: 'yellow', label: 'Desert', class: 'bg-yellow-500' }
  ]

  useEffect(() => {
    if (unit) {
      setFormData({
        title: unit.title || '',
        description: unit.description || '',
        color_theme: unit.color_theme || 'blue',
        estimated_duration: unit.estimated_duration || 60,
        thumbnail_url: unit.thumbnail_url || '',
        unit_number: unit.unit_number || 1
      })
    }
  }, [unit])

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCropImageSrc(reader.result)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleCropConfirm = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return
    try {
      setUploading(true)
      const blob = await createCroppedImage(cropImageSrc, croppedAreaPixels)
      const path = `${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('course-backgrounds')
        .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: true })
      if (uploadError) throw uploadError
      const { data: publicData } = supabase.storage
        .from('course-backgrounds')
        .getPublicUrl(path)
      handleChange('thumbnail_url', publicData.publicUrl)
      setCropImageSrc(null)
    } catch (err) {
      console.error('Upload error:', err)
      setError('Upload failed: ' + (err.message || 'Unknown error'))
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data, error } = await supabase
        .from('units')
        .update({
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          color_theme: formData.color_theme,
          estimated_duration: formData.estimated_duration,
          thumbnail_url: formData.thumbnail_url || null,
          unit_number: formData.unit_number
        })
        .eq('id', unit.id)
        .select()
        .single()

      if (error) throw error

      onUpdated(data)
    } catch (err) {
      console.error('Error updating unit:', err)
      setError(err.message || 'Failed to update unit')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Edit Unit
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Unit Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Unit Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Basic Vocabulary, Grammar Fundamentals"
              required
            />
          </div>

          {/* Unit Number (Position) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Position
            </label>
            <input
              type="number"
              min={1}
              value={formData.unit_number}
              onChange={(e) => handleChange('unit_number', parseInt(e.target.value) || 1)}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Color Theme */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color Theme
            </label>
            <div className="grid grid-cols-3 gap-3">
              {colorOptions.map(color => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => handleChange('color_theme', color.value)}
                  className={`
                    px-4 py-3 rounded-lg border-2 transition-all font-medium text-sm
                    ${color.class}
                    ${formData.color_theme === color.value
                      ? 'border-gray-800 ring-2 ring-gray-300 scale-105'
                      : 'border-gray-300 hover:border-gray-400'
                    }
                  `}
                >
                  {color.label}
                </button>
              ))}
            </div>
          </div>

          {/* Background Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Background Image
            </label>

            {/* Crop UI */}
            {cropImageSrc ? (
              <div className="mb-2">
                <div className="relative w-full bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: getCropAspect(sessionCount) }}>
                  <Cropper
                    image={cropImageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={getCropAspect(sessionCount)}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <label className="text-xs text-gray-500">Zoom</label>
                  <input
                    type="range"
                    min={1} max={3} step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleCropConfirm}
                    disabled={uploading}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {uploading ? 'Uploading...' : 'Confirm Crop'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCropImageSrc(null)}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {formData.thumbnail_url && (
                  <img src={formData.thumbnail_url} alt="Preview" className="w-full h-24 object-cover rounded-lg border mb-2" />
                )}
                <div className="flex items-center gap-2">
                  <label className={`inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="w-4 h-4" />
                    {formData.thumbnail_url ? 'Change' : 'Upload'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                  {formData.thumbnail_url && (
                    <button
                      type="button"
                      onClick={() => handleChange('thumbnail_url', '')}
                      className="inline-flex items-center gap-1 px-3 py-2 text-sm text-red-500 hover:text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  )}
                </div>
              </>
            )}
            <p className="text-xs text-gray-500 mt-1">Uses theme default if empty</p>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.title.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{loading ? 'Updating...' : 'Update Unit'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditUnitModal