import React, { useState, useEffect } from 'react'
import { supabase } from '../../../supabase/client'
import { X, Folder, BookOpen, Edit3, Mic, Headphones, HelpCircle } from 'lucide-react'

const EditFolderModal = ({ folder, onClose, onUpdated, isAdmin = false }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: 'blue',
    icon: 'folder',
    sort_order: 0,
    read_only: false
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (folder) {
      setFormData({
        name: folder.name || '',
        description: folder.description || '',
        color: folder.color || 'blue',
        icon: folder.icon || 'folder',
        sort_order: folder.sort_order ?? 0,
        read_only: folder.read_only ?? false
      })
    }
  }, [folder])

  const colors = [
    { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
    { value: 'green', label: 'Green', class: 'bg-green-500' },
    { value: 'red', label: 'Red', class: 'bg-red-500' },
    { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
    { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
    { value: 'gray', label: 'Gray', class: 'bg-gray-500' }
  ]

  const icons = [
    { value: 'folder', label: 'Folder', icon: Folder },
    { value: 'book-open', label: 'Book', icon: BookOpen },
    { value: 'edit-3', label: 'Edit', icon: Edit3 },
    { value: 'mic', label: 'Microphone', icon: Mic },
    { value: 'headphones', label: 'Headphones', icon: Headphones },
    { value: 'help-circle', label: 'Question', icon: HelpCircle }
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error } = await supabase
        .from('exercise_folders')
        .update({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          color: formData.color,
          icon: formData.icon,
          sort_order: parseInt(formData.sort_order) || 0,
          read_only: formData.read_only,
          updated_at: new Date().toISOString()
        })
        .eq('id', folder.id)

      if (error) throw error

      onUpdated && onUpdated()
    } catch (err) {
      console.error('Error updating folder:', err)
      setError(err.message || 'Failed to update folder')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Edit Folder
          </h2>
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

          {/* Folder Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Folder Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter folder name"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Brief description (optional)"
              rows={2}
            />
          </div>

          {/* Sort Order */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sort Order
            </label>
            <input
              type="number"
              value={formData.sort_order}
              onChange={(e) => handleChange('sort_order', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0"
              min="0"
            />
            <p className="text-xs text-gray-500 mt-1">Lower numbers appear first</p>
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color
            </label>
            <div className="flex space-x-2">
              {colors.map(color => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => handleChange('color', color.value)}
                  className={`
                    w-8 h-8 rounded-full border-2 transition-all
                    ${color.class}
                    ${formData.color === color.value
                      ? 'border-gray-800 ring-2 ring-gray-300'
                      : 'border-gray-300 hover:border-gray-400'
                    }
                  `}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Icon
            </label>
            <div className="grid grid-cols-3 gap-2">
              {icons.map(icon => {
                const IconComponent = icon.icon
                return (
                  <button
                    key={icon.value}
                    type="button"
                    onClick={() => handleChange('icon', icon.value)}
                    className={`
                      p-3 rounded-lg border-2 transition-all flex flex-col items-center space-y-1
                      ${formData.icon === icon.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }
                    `}
                  >
                    <IconComponent className="w-5 h-5" />
                    <span className="text-xs">{icon.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Read Only - Admin only */}
          {isAdmin && (
            <div>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.read_only}
                  onChange={(e) => handleChange('read_only', e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Read Only</span>
                  <p className="text-xs text-gray-500">Exercises in this folder cannot be edited or deleted by teachers</p>
                </div>
              </label>
            </div>
          )}

          {/* Preview */}
          <div className="bg-gray-50 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Preview
            </label>
            <div className="flex items-center space-x-2">
              {(() => {
                const selectedIcon = icons.find(i => i.value === formData.icon)
                const IconComponent = selectedIcon?.icon || Folder
                const colorClass = formData.color === 'blue' ? 'text-blue-600' :
                                 formData.color === 'green' ? 'text-green-600' :
                                 formData.color === 'red' ? 'text-red-600' :
                                 formData.color === 'purple' ? 'text-purple-600' :
                                 formData.color === 'orange' ? 'text-orange-600' :
                                 'text-gray-600'

                return (
                  <>
                    <IconComponent className={`w-5 h-5 ${colorClass}`} />
                    <span className="font-medium">
                      {formData.name || 'Folder Name'}
                    </span>
                  </>
                )
              })()}
            </div>
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
              disabled={loading || !formData.name.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditFolderModal






