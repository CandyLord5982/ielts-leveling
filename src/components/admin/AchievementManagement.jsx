import { useState, useEffect } from 'react'
import { useAchievements } from '../../hooks/useAchievements'
import Card from '../ui/Card'
import Button from '../ui/Button'
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  EyeOff, 
  Trophy,
  Star,
  Flame,
  Target,
  Zap,
  BookOpen,
  Crown,
  Heart,
  Shield
} from 'lucide-react'

const AchievementManagement = () => {
  const {
    achievements,
    loading,
    error,
    createAchievement,
    updateAchievement,
    deleteAchievement,
    toggleAchievementStatus
  } = useAchievements()

  const [showModal, setShowModal] = useState(false)
  const [editingAchievement, setEditingAchievement] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    icon: 'Star',
    criteria_type: 'exercise_completed',
    criteria_value: 1,
    criteria_period: 'all_time',
    xp_reward: 0,
    gem_reward: 0,
    badge_color: 'blue',
    badge_image_url: '',
    badge_image_alt: '',
    is_active: true
  })

  const iconOptions = [
    { value: 'Star', label: 'Star', component: Star },
    { value: 'Flame', label: 'Flame', component: Flame },
    { value: 'Trophy', label: 'Trophy', component: Trophy },
    { value: 'Target', label: 'Target', component: Target },
    { value: 'Zap', label: 'Zap', component: Zap },
    { value: 'BookOpen', label: 'Book Open', component: BookOpen },
    { value: 'Crown', label: 'Crown', component: Crown },
    { value: 'Heart', label: 'Heart', component: Heart },
    { value: 'Shield', label: 'Shield', component: Shield }
  ]

  const criteriaTypes = [
    { value: 'exercise_completed', label: 'Số bài tập hoàn thành' },
    { value: 'total_xp', label: 'Tổng XP' },
    { value: 'daily_streak', label: 'Chuỗi ngày học' },
    { value: 'daily_exercises', label: 'Bài tập trong ngày' },
    { value: 'pronunciation_completed', label: 'Bài phát âm hoàn thành' },
    { value: 'vocabulary_learned', label: 'Từ vựng đã học' },
    { value: 'level_completed', label: 'Level hoàn thành' },
    { value: 'weekly_xp_leader', label: 'Top 1 XP tuần (tự động)' },
    { value: 'weekly_xp_leader_2', label: 'Top 2 XP tuần (tự động)' },
    { value: 'weekly_xp_leader_3', label: 'Top 3 XP tuần (tự động)' },
    { value: 'monthly_xp_leader', label: 'Top 1 XP tháng (tự động)' },
    { value: 'monthly_xp_leader_2', label: 'Top 2 XP tháng (tự động)' },
    { value: 'monthly_xp_leader_3', label: 'Top 3 XP tháng (tự động)' },
    { value: 'pet_owned', label: 'Số pet sở hữu' },
    { value: 'pet_evolved', label: 'Số pet đã tiến hóa' },
    { value: 'avatar_owned', label: 'Số avatar sở hữu' },
    { value: 'frame_owned', label: 'Số frame sở hữu' },
    { value: 'spaceship_owned', label: 'Số spaceship sở hữu' },
    { value: 'hammer_owned', label: 'Số hammer sở hữu' },
    { value: 'boat_owned', label: 'Số boat sở hữu' },
    { value: 'wild_catch_success', label: 'Số lần bắt pet hoang dã thành công' }
  ]

  const badgeColors = [
    { value: 'blue', label: 'Xanh dương', class: 'bg-blue-500' },
    { value: 'green', label: 'Xanh lá', class: 'bg-green-500' },
    { value: 'red', label: 'Đỏ', class: 'bg-red-500' },
    { value: 'yellow', label: 'Vàng', class: 'bg-yellow-500' },
    { value: 'purple', label: 'Tím', class: 'bg-purple-500' },
    { value: 'pink', label: 'Hồng', class: 'bg-pink-500' },
    { value: 'indigo', label: 'Chàm', class: 'bg-indigo-500' },
    { value: 'orange', label: 'Cam', class: 'bg-orange-500' }
  ]

  const handleOpenModal = (achievement = null) => {
    if (achievement) {
      setEditingAchievement(achievement)
      setFormData({
        title: achievement.title,
        description: achievement.description,
        icon: achievement.icon,
        criteria_type: achievement.criteria_type,
        criteria_value: achievement.criteria_value,
        criteria_period: achievement.criteria_period,
        xp_reward: achievement.xp_reward,
        gem_reward: achievement.gem_reward || 0,
        badge_color: achievement.badge_color,
        badge_image_url: achievement.badge_image_url || '',
        badge_image_alt: achievement.badge_image_alt || '',
        is_active: achievement.is_active
      })
    } else {
      setEditingAchievement(null)
      setFormData({
        title: '',
        description: '',
        icon: 'Star',
        criteria_type: 'exercise_completed',
        criteria_value: 1,
        criteria_period: 'all_time',
        xp_reward: 0,
        gem_reward: 0,
        badge_color: 'blue',
        badge_image_url: '',
        badge_image_alt: '',
        is_active: true
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingAchievement(null)
    setFormData({
      title: '',
      description: '',
      icon: 'Star',
      criteria_type: 'exercise_completed',
      criteria_value: 1,
      criteria_period: 'all_time',
      xp_reward: 0,
      gem_reward: 0,
      badge_color: 'blue',
      badge_image_url: '',
      badge_image_alt: '',
      is_active: true
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const achievementData = {
        ...formData,
        criteria: {
          type: formData.criteria_type,
          count: formData.criteria_value,
          period: formData.criteria_period
        }
      }

      if (editingAchievement) {
        await updateAchievement(editingAchievement.id, achievementData)
      } else {
        await createAchievement(achievementData)
      }

      handleCloseModal()
    } catch (error) {
      console.error('Error saving achievement:', error)
    }
  }

  const handleDelete = async (id) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa thành tích này?')) {
      try {
        await deleteAchievement(id)
      } catch (error) {
        console.error('Error deleting achievement:', error)
      }
    }
  }

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      await toggleAchievementStatus(id, !currentStatus)
    } catch (error) {
      console.error('Error toggling achievement status:', error)
    }
  }

  const getIconComponent = (iconName) => {
    const icon = iconOptions.find(opt => opt.value === iconName)
    return icon ? icon.component : Star
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Quản lý Thành tích</h2>
        </div>
        <div className="text-center py-8">
          <div className="text-gray-600">Đang tải dữ liệu...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button onClick={() => handleOpenModal()} className="flex items-center space-x-2">
          <Plus className="w-4 h-4" />
          <span>Thêm thành tích</span>
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800">Lỗi: {error}</div>
        </div>
      )}

      {/* Achievements Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {achievements.map((achievement) => {
          const IconComponent = getIconComponent(achievement.icon)
          const badgeColorClass = badgeColors.find(c => c.value === achievement.badge_color)?.class || 'bg-blue-500'
          
          return (
            <Card key={achievement.id} className="p-6">
              <div className="space-y-4">
                {/* Badge Preview */}
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    {achievement.badge_image_url ? (
                      <img
                        src={achievement.badge_image_url}
                        alt={achievement.badge_image_alt || achievement.title}
                        className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md"
                      />
                    ) : (
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${badgeColorClass}`}>
                        <IconComponent className="w-6 h-6 text-white" />
                      </div>
                    )}
                    {!achievement.is_active && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center">
                        <EyeOff className="w-2 h-2 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{achievement.title}</h3>
                    <p className="text-sm text-gray-600">{achievement.description}</p>
                  </div>
                </div>

                {/* Criteria Info */}
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-gray-600">Điều kiện:</span>
                    <span className="ml-2 font-medium">
                      {criteriaTypes.find(c => c.value === achievement.criteria_type)?.label} ≥ {achievement.criteria_value}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Phần thưởng:</span>
                    {achievement.xp_reward > 0 && <span className="ml-2 font-medium text-blue-600">+{achievement.xp_reward} XP</span>}
                    {achievement.gem_reward > 0 && <span className="ml-2 font-medium text-emerald-600">+{achievement.gem_reward} Gem</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenModal(achievement)}
                    className="flex items-center space-x-1"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Sửa</span>
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleStatus(achievement.id, achievement.is_active)}
                    className={`flex items-center space-x-1 ${
                      achievement.is_active ? 'text-green-600' : 'text-gray-400'
                    }`}
                  >
                    {achievement.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    <span>{achievement.is_active ? 'Ẩn' : 'Hiện'}</span>
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(achievement.id)}
                    className="flex items-center space-x-1 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Xóa</span>
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Empty State */}
      {achievements.length === 0 && (
        <Card className="p-8 text-center">
          <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Chưa có thành tích nào</h3>
          <p className="text-gray-600 mb-4">Bắt đầu tạo thành tích đầu tiên để khuyến khích học viên</p>
          <Button onClick={() => handleOpenModal()}>
            Tạo thành tích đầu tiên
          </Button>
        </Card>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingAchievement ? 'Sửa thành tích' : 'Thêm thành tích mới'}
                </h3>
                <Button type="button" variant="ghost" onClick={handleCloseModal}>
                  ✕
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Title */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên thành tích *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mô tả *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    required
                  />
                </div>

                {/* Icon */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Icon
                  </label>
                  <select
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {iconOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Badge Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Màu badge
                  </label>
                  <select
                    value={formData.badge_color}
                    onChange={(e) => setFormData({ ...formData, badge_color: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {badgeColors.map(color => (
                      <option key={color.value} value={color.value}>
                        {color.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Criteria Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Loại điều kiện *
                  </label>
                  <select
                    value={formData.criteria_type}
                    onChange={(e) => setFormData({ ...formData, criteria_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {criteriaTypes.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Criteria Value */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Giá trị cần đạt *
                  </label>
                  <input
                    type="number"
                    value={formData.criteria_value}
                    onChange={(e) => setFormData({ ...formData, criteria_value: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    required
                  />
                </div>

                {/* XP Reward */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phần thưởng XP
                  </label>
                  <input
                    type="number"
                    value={formData.xp_reward}
                    onChange={(e) => setFormData({ ...formData, xp_reward: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                </div>

                {/* Gem Reward */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phần thưởng Gem
                  </label>
                  <input
                    type="number"
                    value={formData.gem_reward}
                    onChange={(e) => setFormData({ ...formData, gem_reward: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                </div>

                {/* Badge Image URL */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL hình ảnh badge
                  </label>
                  <input
                    type="url"
                    value={formData.badge_image_url}
                    onChange={(e) => setFormData({ ...formData, badge_image_url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://example.com/badge-image.jpg"
                  />
                </div>

                {/* Badge Image Alt */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mô tả hình ảnh
                  </label>
                  <input
                    type="text"
                    value={formData.badge_image_alt}
                    onChange={(e) => setFormData({ ...formData, badge_image_alt: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Mô tả cho hình ảnh badge"
                  />
                </div>

                {/* Active Status */}
                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Kích hoạt thành tích</span>
                  </label>
                </div>
              </div>

              {/* Preview */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Xem trước:</h4>
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="relative">
                    {formData.badge_image_url ? (
                      <img
                        src={formData.badge_image_url}
                        alt={formData.badge_image_alt || formData.title}
                        className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md"
                        onError={(e) => {
                          e.target.style.display = 'none'
                          e.target.nextSibling.style.display = 'flex'
                        }}
                      />
                    ) : null}
                    <div 
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${badgeColors.find(c => c.value === formData.badge_color)?.class || 'bg-blue-500'}`}
                      style={{ display: formData.badge_image_url ? 'none' : 'flex' }}
                    >
                      {(() => {
                        const IconComponent = getIconComponent(formData.icon)
                        return <IconComponent className="w-6 h-6 text-white" />
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{formData.title || 'Tên thành tích'}</div>
                    <div className="text-sm text-gray-600">{formData.description || 'Mô tả thành tích'}</div>
                    {formData.xp_reward > 0 && (
                      <div className="text-xs text-blue-600">+{formData.xp_reward} XP</div>
                    )}
                    {formData.gem_reward > 0 && (
                      <div className="text-xs text-emerald-600">+{formData.gem_reward} Gem</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={handleCloseModal}>
                  Hủy
                </Button>
                <Button type="submit">
                  {editingAchievement ? 'Cập nhật' : 'Tạo thành tích'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AchievementManagement

