import { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import { assetUrl } from '../../hooks/useBranding'
import {
  Plus, Edit2, Trash2, Eye, EyeOff, X, Save, Copy
} from 'lucide-react'

const MISSION_IMAGE_MAP = {
  'target': '/icon/dashboard/wow.svg',
  'star': '/image/3_star.png',
  'trophy': '/icon/profile/paper.svg',
  'flame': '/icon/profile/streak.svg',
  'swords': '/icon/dashboard/pvp.png',
  'gamepad-2': '/image/dashboard/pet-type.webp',
  'book-open': '/image/dashboard/match1.png',
  'graduation-cap': '/pet-game/whack/mole-whacked.png',
  'zap': '/image/chest/legendary-chest.png',
  'gem': '/pet-game/astro/alien1.png',
  'medal': '/image/dashboard/pet-train.svg',
  'gift': '/image/dashboard/pet-scramble.jpg',
  'package-open': '/image/inventory/spaceships/phantom-voyager.png',
  'joystick': '/image/pet/game-win.png',
  'fish': '/pet-display/game-logo/fish.png',
}

const DEFAULT_MISSION_IMAGE = '/icon/dashboard/wow.svg'

const ICON_OPTIONS = Object.entries(MISSION_IMAGE_MAP).map(([value, image]) => ({
  value,
  label: value.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  image,
}))

const GOAL_TYPES = [
  { value: 'complete_exercises', label: 'Hoàn thành bài tập' },
  { value: 'score_high', label: 'Đạt điểm 90%+' },
  { value: 'earn_xp', label: 'Kiếm XP' },
  { value: 'play_games', label: 'Chơi pet games' },
  { value: 'win_pvp', label: 'Thắng PvP (thường)' },
  { value: 'win_quickmatch', label: 'Thắng Quick Match' },
  { value: 'daily_challenge', label: 'Tham gia Daily Challenge' },
  { value: 'login_streak', label: 'Duy trì streak' },
  { value: 'complete_session', label: 'Hoàn thành session' },
  { value: 'open_chests', label: 'Mở rương' },
  { value: 'collect_items', label: 'Thu thập vật phẩm' },
  { value: 'all_green_lesson', label: 'Đạt all-green trong buổi học' },
  { value: 'blast_words', label: 'Bắn từ (Astro Blast)' },
  { value: 'whack_moles', label: 'Đập chuột (Whack-a-Mole)' },
  { value: 'scramble_words', label: 'Giải chữ (Word Scramble)' },
  { value: 'type_words', label: 'Gõ từ (Word Type)' },
  { value: 'match_pairs', label: 'Ghép cặp (Match Game)' },
  { value: 'pronounce_words', label: 'Phát âm (Say It Right)' },
  { value: 'earn_3_stars', label: 'Đạt 3 sao trong game' },
  { value: 'catch_fish', label: 'Câu cá (Fishing Game)' },
  { value: 'complete_all_missions', label: '⭐ Hoàn thành tất cả nhiệm vụ trong tab' },
]

const MISSION_TYPES = [
  { value: 'daily', label: 'Hàng ngày', color: 'amber' },
  { value: 'weekly', label: 'Hàng tuần', color: 'blue' },
  { value: 'special', label: 'Đặc biệt', color: 'purple' },
]

const EMPTY_FORM = {
  title: '',
  description: '',
  icon: 'target',
  mission_type: 'daily',
  goal_type: 'complete_exercises',
  goal_value: 1,
  reward_xp: 0,
  reward_gems: 0,
  reward_item_id: '',
  reward_item_quantity: 1,
  reward_chest_id: '',
  is_active: true,
  start_date: '',
  end_date: '',
  sort_order: 0,
}

const MissionManagement = () => {
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [filter, setFilter] = useState('all')
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState([])
  const [chests, setChests] = useState([])

  useEffect(() => {
    fetchMissions()
    fetchItems()
    fetchChests()
  }, [])

  const fetchItems = async () => {
    const { data } = await supabase
      .from('collectible_items')
      .select('id, name, image_url, rarity')
      .eq('is_active', true)
      .order('name')
    setItems(data || [])
  }

  const fetchChests = async () => {
    const { data } = await supabase
      .from('chests')
      .select('id, name, chest_type')
      .eq('is_active', true)
      .order('name')
    setChests(data || [])
  }

  const fetchMissions = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('missions')
      .select('*')
      .order('mission_type')
      .order('sort_order')
    if (!error) setMissions(data || [])
    setLoading(false)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (m) => {
    setEditingId(m.id)
    setForm({
      title: m.title || '',
      description: m.description || '',
      icon: m.icon || 'target',
      mission_type: m.mission_type,
      goal_type: m.goal_type,
      goal_value: m.goal_value,
      reward_xp: m.reward_xp || 0,
      reward_gems: m.reward_gems || 0,
      reward_item_id: m.reward_item_id || '',
      reward_item_quantity: m.reward_item_quantity || 1,
      reward_chest_id: m.reward_chest_id || '',
      is_active: m.is_active,
      start_date: m.start_date || '',
      end_date: m.end_date || '',
      sort_order: m.sort_order || 0,
    })
    setShowModal(true)
  }

  const openDuplicate = (m) => {
    setEditingId(null)
    setForm({
      title: m.title + ' (copy)',
      description: m.description || '',
      icon: m.icon || 'target',
      mission_type: m.mission_type,
      goal_type: m.goal_type,
      goal_value: m.goal_value,
      reward_xp: m.reward_xp || 0,
      reward_gems: m.reward_gems || 0,
      reward_item_id: m.reward_item_id || '',
      reward_item_quantity: m.reward_item_quantity || 1,
      reward_chest_id: m.reward_chest_id || '',
      is_active: false,
      start_date: m.start_date || '',
      end_date: m.end_date || '',
      sort_order: m.sort_order || 0,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const payload = {
      ...form,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      reward_item_id: form.reward_item_id || null,
      reward_chest_id: form.reward_chest_id || null,
    }

    if (editingId) {
      await supabase.from('missions').update(payload).eq('id', editingId)
    } else {
      await supabase.from('missions').insert(payload)
    }
    setSaving(false)
    setShowModal(false)
    fetchMissions()
  }

  const handleToggleActive = async (id, currentActive) => {
    await supabase.from('missions').update({ is_active: !currentActive }).eq('id', id)
    fetchMissions()
  }

  const handleDelete = async (id, title) => {
    if (!confirm(`Xoá nhiệm vụ "${title}"?`)) return
    await supabase.from('missions').delete().eq('id', id)
    fetchMissions()
  }

  const filtered = filter === 'all' ? missions : missions.filter(m => m.mission_type === filter)
  const getIconImage = (iconName) => MISSION_IMAGE_MAP[iconName] || DEFAULT_MISSION_IMAGE
  const getTypeColor = (type) => MISSION_TYPES.find(t => t.value === type)?.color || 'gray'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Mission Management</h2>
          <p className="text-sm text-gray-500">{missions.length} nhiệm vụ</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Thêm nhiệm vụ
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[{ value: 'all', label: 'Tất cả' }, ...MISSION_TYPES].map(t => (
          <button
            key={t.value}
            onClick={() => setFilter(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === t.value
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            {t.label}
            <span className="ml-1.5 opacity-70">
              ({t.value === 'all' ? missions.length : missions.filter(m => m.mission_type === t.value).length})
            </span>
          </button>
        ))}
      </div>

      {/* Mission list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border">
            <img src={assetUrl(DEFAULT_MISSION_IMAGE)} alt="" className="w-12 h-12 object-contain mx-auto mb-3 opacity-30" />
            <p className="text-gray-500">Chưa có nhiệm vụ nào</p>
          </div>
        ) : (
          filtered.map(m => {
            const typeColor = getTypeColor(m.mission_type)
            return (
              <div key={m.id} className={`bg-white rounded-xl border p-4 flex items-center gap-4 ${!m.is_active ? 'opacity-50' : ''}`}>
                {/* Icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${typeColor}-100`}>
                  {getIconImage(m.icon).startsWith('http') ? (
                    <img src={getIconImage(m.icon)} alt="" className="w-8 h-8 object-contain" />
                  ) : (
                    <img src={assetUrl(getIconImage(m.icon))} alt="" className="w-8 h-8 object-contain" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800 truncate">{m.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium bg-${typeColor}-100 text-${typeColor}-700`}>
                      {MISSION_TYPES.find(t => t.value === m.mission_type)?.label}
                    </span>
                    {!m.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Ẩn</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">{m.description}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{GOAL_TYPES.find(g => g.value === m.goal_type)?.label}: {m.goal_value}</span>
                    {m.reward_xp > 0 && <span>+{m.reward_xp} XP</span>}
                    {m.reward_gems > 0 && <span>+{m.reward_gems} Gems</span>}
                    {m.reward_item_id && <span>+{m.reward_item_quantity || 1} {items.find(i => i.id === m.reward_item_id)?.name || 'Item'}</span>}
                    {m.reward_chest_id && <span>+1 {chests.find(c => c.id === m.reward_chest_id)?.name || 'Chest'}</span>}
                    {m.start_date && <span>Từ: {m.start_date}</span>}
                    {m.end_date && <span>Đến: {m.end_date}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openDuplicate(m)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Nhân bản">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(m)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Sửa">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleToggleActive(m.id, m.is_active)} className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg" title={m.is_active ? 'Ẩn' : 'Hiện'}>
                    {m.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleDelete(m.id, m.title)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Xoá">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-bold">{editingId ? 'Sửa nhiệm vụ' : 'Thêm nhiệm vụ mới'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="VD: Chiến binh chăm chỉ"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="VD: Hoàn thành 3 bài tập"
                />
              </div>

              {/* Mission Type + Icon row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Loại</label>
                  <select
                    value={form.mission_type}
                    onChange={e => setForm({ ...form, mission_type: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {MISSION_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {ICON_OPTIONS.map(o => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setForm({ ...form, icon: o.value })}
                        className={`p-1.5 rounded-lg border-2 transition-all ${
                          form.icon === o.value
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-transparent hover:bg-gray-100'
                        }`}
                        title={o.label}
                      >
                        {o.image.startsWith('http') ? (
                          <img src={o.image} alt={o.label} className="w-8 h-8 object-contain mx-auto" />
                        ) : (
                          <img src={assetUrl(o.image)} alt={o.label} className="w-8 h-8 object-contain mx-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Goal Type + Goal Value */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mục tiêu</label>
                  <select
                    value={form.goal_type}
                    onChange={e => setForm({ ...form, goal_type: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {GOAL_TYPES.map(g => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số lượng cần đạt</label>
                  <input
                    type="number"
                    min="1"
                    value={form.goal_value}
                    onChange={e => setForm({ ...form, goal_value: parseInt(e.target.value) || 1 })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Rewards */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thưởng XP</label>
                  <input
                    type="number"
                    min="0"
                    value={form.reward_xp}
                    onChange={e => setForm({ ...form, reward_xp: parseInt(e.target.value) || 0 })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thưởng Gems</label>
                  <input
                    type="number"
                    min="0"
                    value={form.reward_gems}
                    onChange={e => setForm({ ...form, reward_gems: parseInt(e.target.value) || 0 })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Item & Chest reward */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thưởng vật phẩm</label>
                  <select
                    value={form.reward_item_id}
                    onChange={e => setForm({ ...form, reward_item_id: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Không có</option>
                    {items.map(item => (
                      <option key={item.id} value={item.id}>{item.name} ({item.rarity})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thưởng rương</label>
                  <select
                    value={form.reward_chest_id}
                    onChange={e => setForm({ ...form, reward_chest_id: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Không có</option>
                    {chests.map(chest => (
                      <option key={chest.id} value={chest.id}>{chest.name} ({chest.chest_type})</option>
                    ))}
                  </select>
                </div>
              </div>
              {form.reward_item_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số lượng vật phẩm</label>
                  <input
                    type="number"
                    min="1"
                    value={form.reward_item_quantity}
                    onChange={e => setForm({ ...form, reward_item_quantity: parseInt(e.target.value) || 1 })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {/* Sort order */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thứ tự hiển thị</label>
                <input
                  type="number"
                  min="0"
                  value={form.sort_order}
                  onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Date range (for special missions) */}
              {form.mission_type === 'special' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
                    <input
                      type="date"
                      value={form.start_date}
                      onChange={e => setForm({ ...form, start_date: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc</label>
                    <input
                      type="date"
                      value={form.end_date}
                      onChange={e => setForm({ ...form, end_date: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Active toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Hiển thị (active)</span>
              </label>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-5 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Huỷ
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Tạo mới'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MissionManagement
