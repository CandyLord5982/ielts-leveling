import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import { Plus, Edit2, Trash2, Save, X, Star, Award } from 'lucide-react'
import { Badge } from '../ui/StudentBadge'

const StudentLevelsManagement = () => {
  const [levels, setLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingLevel, setEditingLevel] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const defaultLevel = {
    level_number: 1,
    xp_required: 0,
    badge_name: '',
    badge_tier: 'bronze',
    badge_icon: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=100&h=100&fit=crop&crop=center',
    badge_color: '#CD7F32',
    badge_description: '',
    title_unlocked: '',
    perks_unlocked: []
  }

  useEffect(() => {
    fetchLevels()
  }, [])

  const showMessage = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage({ type: '', text: '' }), 3000)
  }

  const fetchLevels = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('student_levels')
        .select('*')
        .order('level_number', { ascending: true })

      if (error) throw error
      setLevels(data || [])
    } catch (error) {
      console.error('Error fetching levels:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveLevel = async (levelData) => {
    try {
      if (levelData.id) {
        // Update existing level
        const { error } = await supabase
          .from('student_levels')
          .update({
            ...levelData,
            updated_at: new Date().toISOString()
          })
          .eq('id', levelData.id)

        if (error) throw error
      } else {
        // Create new level
        const { error } = await supabase
          .from('student_levels')
          .insert([levelData])

        if (error) throw error
      }

      await fetchLevels()
      setEditingLevel(null)
      setShowCreateForm(false)
      showMessage('success', 'Level saved successfully!')
    } catch (error) {
      console.error('Error saving level:', error)
      showMessage('error', 'Error saving level: ' + error.message)
    }
  }

  const deleteLevel = async (levelId) => {
    try {
      const { error } = await supabase
        .from('student_levels')
        .delete()
        .eq('id', levelId)

      if (error) throw error

      await fetchLevels()
      showMessage('success', 'Level deleted successfully!')
    } catch (error) {
      console.error('Error deleting level:', error)
      showMessage('error', 'Error deleting level: ' + error.message)
    }
  }

  const toggleLevelStatus = async (level) => {
    try {
      const { error } = await supabase
        .from('student_levels')
        .update({
          is_active: !level.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', level.id)

      if (error) throw error
      await fetchLevels()
    } catch (error) {
      console.error('Error updating level status:', error)
    }
  }

  const LevelForm = ({ level, onSave, onCancel, showMessage }) => {
    const [formData, setFormData] = useState({
      ...defaultLevel,
      ...level,
      perks_unlocked: Array.isArray(level?.perks_unlocked) ? level.perks_unlocked : []
    })

    const handleSubmit = (e) => {
      e.preventDefault()

      // Validate form
      if (!formData.badge_name.trim()) {
        showMessage('error', 'Badge name is required')
        return
      }

      if (formData.xp_required < 0) {
        showMessage('error', 'XP required cannot be negative')
        return
      }

      onSave(formData)
    }

    const handlePerksChange = (perkText) => {
      const perks = perkText.split(',').map(p => p.trim()).filter(p => p.length > 0)
      setFormData({ ...formData, perks_unlocked: perks })
    }

    const tierColors = {
      bronze: '#CD7F32',
      silver: '#C0C0C0',
      gold: '#FFD700',
      platinum: '#E5E4E2',
      diamond: '#B9F2FF'
    }

    const badgePreview = {
      name: formData.badge_name || 'Preview',
      tier: formData.badge_tier,
      icon: formData.badge_icon,
      color: formData.badge_color,
      description: formData.badge_description,
      title: formData.title_unlocked,
      levelNumber: formData.level_number
    }

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {level?.id ? 'Edit Level' : 'Create Level'}
              </h3>
              <button
                onClick={onCancel}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Level Number
                  </label>
                  <input
                    type="number"
                    value={formData.level_number}
                    onChange={(e) => setFormData({ ...formData, level_number: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    XP Required
                  </label>
                  <input
                    type="number"
                    value={formData.xp_required}
                    onChange={(e) => setFormData({ ...formData, xp_required: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                    min="0"
                  />
                </div>
              </div>


              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Badge Name
                  </label>
                  <input
                    type="text"
                    value={formData.badge_name}
                    onChange={(e) => setFormData({ ...formData, badge_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                    placeholder="e.g., Rookie, Scholar, Master"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Badge Tier
                  </label>
                  <select
                    value={formData.badge_tier}
                    onChange={(e) => setFormData({
                      ...formData,
                      badge_tier: e.target.value,
                      badge_color: tierColors[e.target.value]
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="bronze">Bronze</option>
                    <option value="silver">Silver</option>
                    <option value="gold">Gold</option>
                    <option value="platinum">Platinum</option>
                    <option value="diamond">Diamond</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Badge Icon (Image URL)
                  </label>
                  <div className="space-y-2">
                    <input
                      type="url"
                      value={formData.badge_icon}
                      onChange={(e) => setFormData({ ...formData, badge_icon: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="https://example.com/badge-image.jpg"
                      required
                    />
                    {formData.badge_icon && (
                      <div className="flex items-center space-x-2">
                        <img 
                          src={formData.badge_icon} 
                          alt="Badge preview"
                          className="w-8 h-8 rounded-full object-cover border"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.nextSibling.style.display = 'inline'
                          }}
                        />
                        <span className="text-sm text-gray-500 hidden">Preview not available</span>
                        <span className="text-sm text-gray-500">Preview</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Badge Color
                  </label>
                  <input
                    type="color"
                    value={formData.badge_color}
                    onChange={(e) => setFormData({ ...formData, badge_color: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Badge Description
                </label>
                <input
                  type="text"
                  value={formData.badge_description}
                  onChange={(e) => setFormData({ ...formData, badge_description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Description of what this level represents"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title Unlocked
                </label>
                <input
                  type="text"
                  value={formData.title_unlocked}
                  onChange={(e) => setFormData({ ...formData, title_unlocked: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Tân binh, Học giả"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Perks Unlocked (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.perks_unlocked.join(', ')}
                  onChange={(e) => handlePerksChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="basic_exercises, progress_tracking, achievements"
                />
              </div>

              {/* Badge Preview */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Badge Preview</h4>
                <div className="flex justify-center">
                  <Badge
                    badge={badgePreview}
                    size="large"
                    showLevel={true}
                    showTitle={true}
                    showDescription={true}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Level
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Level
        </button>
      </div>

      {/* Message Display */}
      {message.text && (
        <div className={`p-4 rounded-lg mb-6 ${
          message.type === 'success' 
            ? 'bg-green-100 text-green-800 border border-green-200' 
            : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Level</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Badge</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">XP Required</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">XP Threshold</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Title</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {levels.map((level) => {
                const badgeData = {
                  name: level.badge_name,
                  tier: level.badge_tier,
                  icon: level.badge_icon,
                  color: level.badge_color,
                  levelNumber: level.level_number
                }

                return (
                  <tr key={level.id} className={!level.is_active ? 'opacity-50' : ''}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-lg">{level.level_number}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge badge={badgeData} size="small" />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{level.xp_required.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {level.xp_required.toLocaleString()}+ XP
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm">{level.title_unlocked}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleLevelStatus(level)}
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          level.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {level.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingLevel(level)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteLevel(level.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Form */}
      {(showCreateForm || editingLevel) && (
        <LevelForm
          level={editingLevel}
          onSave={saveLevel}
          onCancel={() => {
            setShowCreateForm(false)
            setEditingLevel(null)
          }}
          showMessage={showMessage}
        />
      )}
    </div>
  )
}

export default StudentLevelsManagement