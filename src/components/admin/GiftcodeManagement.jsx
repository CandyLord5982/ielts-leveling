import React, { useState, useEffect } from 'react'
import {
  Plus, Edit2, Trash2, Copy, Gift, Eye, EyeOff,
  ChevronDown, ChevronUp, RefreshCw, X
} from 'lucide-react'
import { useGiftcodes } from '../../hooks/useGiftcodes'
import { supabase } from '../../supabase/client'

const generateRandomCode = (length = 8) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

const formatDate = (dateStr) => {
  if (!dateStr) return 'Không giới hạn'
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

const GiftcodeManagement = () => {
  const {
    giftcodes, loading, fetchGiftcodes,
    createGiftcode, updateGiftcode, deleteGiftcode, toggleGiftcodeStatus,
    fetchRedemptionHistory
  } = useGiftcodes()

  const [showModal, setShowModal] = useState(false)
  const [editingGiftcode, setEditingGiftcode] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [redemptions, setRedemptions] = useState([])
  const [redemptionsLoading, setRedemptionsLoading] = useState(false)

  // Reward picker selections
  const [selectedItem, setSelectedItem] = useState('')
  const [selectedChest, setSelectedChest] = useState('')
  const [selectedPet, setSelectedPet] = useState('')
  const [selectedCosmetic, setSelectedCosmetic] = useState('')

  // Reward picker data
  const [items, setItems] = useState([])
  const [chests, setChests] = useState([])
  const [pets, setPets] = useState([])
  const [shopItems, setShopItems] = useState([])

  const defaultForm = {
    code: '',
    description: '',
    rewards: { xp: 0, gems: 0, items: [], chests: [], pets: [], cosmetics: [] },
    max_redemptions: null,
    is_single_use: false,
    expires_at: '',
    is_active: true
  }
  const [formData, setFormData] = useState(defaultForm)

  // Fetch reward picker options
  useEffect(() => {
    const fetchOptions = async () => {
      const [itemsRes, chestsRes, petsRes, shopRes] = await Promise.all([
        supabase.from('collectible_items').select('id, name, rarity, image_url').eq('is_active', true),
        supabase.from('chests').select('id, name, chest_type, image_url').eq('is_active', true),
        supabase.from('pets').select('id, name, rarity, image_url').eq('is_active', true),
        supabase.from('shop_items').select('id, name, category, image_url').eq('is_active', true)
      ])
      setItems(itemsRes.data || [])
      setChests(chestsRes.data || [])
      setPets(petsRes.data || [])
      setShopItems(shopRes.data || [])
    }
    fetchOptions()
  }, [])

  const resetPickerSelections = () => {
    setSelectedItem('')
    setSelectedChest('')
    setSelectedPet('')
    setSelectedCosmetic('')
  }

  const handleOpenCreate = () => {
    setEditingGiftcode(null)
    setFormData({ ...defaultForm, code: generateRandomCode() })
    resetPickerSelections()
    setShowModal(true)
  }

  const handleOpenEdit = (gc) => {
    setEditingGiftcode(gc)
    resetPickerSelections()
    setFormData({
      code: gc.code,
      description: gc.description || '',
      rewards: gc.rewards || { xp: 0, gems: 0, items: [], chests: [], pets: [], cosmetics: [] },
      max_redemptions: gc.max_redemptions,
      is_single_use: gc.is_single_use,
      expires_at: gc.expires_at ? gc.expires_at.slice(0, 16) : '',
      is_active: gc.is_active
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      const data = {
        code: formData.code.toUpperCase().trim(),
        description: formData.description || null,
        rewards: formData.rewards,
        max_redemptions: formData.max_redemptions || null,
        is_single_use: formData.is_single_use,
        expires_at: formData.expires_at || null,
        is_active: formData.is_active
      }

      if (editingGiftcode) {
        await updateGiftcode(editingGiftcode.id, data)
      } else {
        await createGiftcode(data)
      }
      setShowModal(false)
    } catch (err) {
      alert('Lỗi: ' + err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc muốn xoá mã này?')) return
    await deleteGiftcode(id)
  }

  const handleToggleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    setRedemptionsLoading(true)
    const data = await fetchRedemptionHistory(id)
    setRedemptions(data)
    setRedemptionsLoading(false)
  }

  const copyCode = (code) => {
    navigator.clipboard.writeText(code)
  }

  const updateReward = (key, value) => {
    setFormData(prev => ({
      ...prev,
      rewards: { ...prev.rewards, [key]: value }
    }))
  }

  const addRewardItem = (type, item) => {
    setFormData(prev => ({
      ...prev,
      rewards: {
        ...prev.rewards,
        [type]: [...(prev.rewards[type] || []), item]
      }
    }))
  }

  const removeRewardItem = (type, index) => {
    setFormData(prev => ({
      ...prev,
      rewards: {
        ...prev.rewards,
        [type]: prev.rewards[type].filter((_, i) => i !== index)
      }
    }))
  }

  const getRewardSummary = (rewards) => {
    if (!rewards) return 'Không có phần thưởng'
    const parts = []
    if (rewards.xp > 0) parts.push(`${rewards.xp} XP`)
    if (rewards.gems > 0) parts.push(`${rewards.gems} Gems`)
    if (rewards.items?.length > 0) parts.push(`${rewards.items.length} vật phẩm`)
    if (rewards.chests?.length > 0) parts.push(`${rewards.chests.length} rương`)
    if (rewards.pets?.length > 0) parts.push(`${rewards.pets.length} thú cưng`)
    if (rewards.cosmetics?.length > 0) parts.push(`${rewards.cosmetics.length} trang trí`)
    return parts.length > 0 ? parts.join(', ') : 'Không có phần thưởng'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Quản lý Gift Code</h2>
          <p className="text-sm text-gray-500">{giftcodes.length} mã</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          Tạo mã mới
        </button>
      </div>

      {/* Giftcode List */}
      <div className="space-y-4">
        {giftcodes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Gift size={48} className="mx-auto mb-3 opacity-50" />
            <p>Chưa có gift code nào</p>
          </div>
        ) : (
          giftcodes.map((gc) => (
            <div key={gc.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${gc.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      <Gift size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="font-mono font-bold text-lg text-gray-900">{gc.code}</code>
                        <button onClick={() => copyCode(gc.code)} className="text-gray-400 hover:text-gray-600" title="Copy">
                          <Copy size={14} />
                        </button>
                        {!gc.is_active && (
                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Tắt</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{gc.description || 'Không có mô tả'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right text-xs text-gray-500 mr-3">
                      <div>Đã dùng: {gc.current_redemptions}/{gc.max_redemptions || '∞'}</div>
                      <div>HSD: {formatDate(gc.expires_at)}</div>
                    </div>
                    <button onClick={() => toggleGiftcodeStatus(gc.id, !gc.is_active)} className="p-2 rounded-lg hover:bg-gray-100" title={gc.is_active ? 'Tắt' : 'Bật'}>
                      {gc.is_active ? <Eye size={16} className="text-green-600" /> : <EyeOff size={16} className="text-gray-400" />}
                    </button>
                    <button onClick={() => handleOpenEdit(gc)} className="p-2 rounded-lg hover:bg-gray-100">
                      <Edit2 size={16} className="text-blue-600" />
                    </button>
                    <button onClick={() => handleDelete(gc.id)} className="p-2 rounded-lg hover:bg-gray-100">
                      <Trash2 size={16} className="text-red-500" />
                    </button>
                    <button onClick={() => handleToggleExpand(gc.id)} className="p-2 rounded-lg hover:bg-gray-100">
                      {expandedId === gc.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Reward summary */}
                <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
                  Phần thưởng: {getRewardSummary(gc.rewards)}
                </div>
              </div>

              {/* Expanded: Redemption History */}
              {expandedId === gc.id && (
                <div className="border-t bg-gray-50 px-4 py-3">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Lịch sử sử dụng</h4>
                  {redemptionsLoading ? (
                    <div className="text-sm text-gray-400">Đang tải...</div>
                  ) : redemptions.length === 0 ? (
                    <div className="text-sm text-gray-400">Chưa ai sử dụng mã này</div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {redemptions.map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                              {r.users?.full_name?.[0] || '?'}
                            </div>
                            <span className="text-gray-700">{r.users?.full_name || r.users?.email || 'Unknown'}</span>
                          </div>
                          <span className="text-gray-400 text-xs">{formatDate(r.redeemed_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-bold text-gray-900">
                {editingGiftcode ? 'Sửa Gift Code' : 'Tạo Gift Code mới'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    className="flex-1 px-3 py-2 border rounded-lg font-mono text-lg tracking-wider"
                    placeholder="VD: XMAS2024"
                  />
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, code: generateRandomCode() }))}
                    className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-600"
                    title="Tạo mã ngẫu nhiên"
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="VD: Quà Giáng Sinh 2024"
                />
              </div>

              {/* XP & Gems */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">XP</label>
                  <input
                    type="number"
                    value={formData.rewards.xp || 0}
                    onChange={(e) => updateReward('xp', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-lg"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gems</label>
                  <input
                    type="number"
                    value={formData.rewards.gems || 0}
                    onChange={(e) => updateReward('gems', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-lg"
                    min="0"
                  />
                </div>
              </div>

              {/* Items picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vật phẩm</label>
                <div className="space-y-2">
                  {(formData.rewards.items || []).map((item, idx) => {
                    const found = items.find(i => i.id === item.item_id)
                    return (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                        <span className="flex-1 text-sm">{found?.name || item.item_id} x{item.quantity}</span>
                        <button onClick={() => removeRewardItem('items', idx)} className="text-red-400 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    )
                  })}
                  <div className="flex gap-2">
                    <select
                      value={selectedItem}
                      onChange={(e) => setSelectedItem(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="" disabled>Chọn vật phẩm...</option>
                      {items.map(i => (
                        <option key={i.id} value={i.id}>{i.name} ({i.rarity})</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (selectedItem) {
                          addRewardItem('items', { item_id: selectedItem, quantity: 1 })
                          setSelectedItem('')
                        }
                      }}
                      className="px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 text-sm"
                    >
                      Thêm
                    </button>
                  </div>
                </div>
              </div>

              {/* Chests picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rương</label>
                <div className="space-y-2">
                  {(formData.rewards.chests || []).map((item, idx) => {
                    const found = chests.find(c => c.id === item.chest_id)
                    return (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                        <span className="flex-1 text-sm">{found?.name || item.chest_id}</span>
                        <button onClick={() => removeRewardItem('chests', idx)} className="text-red-400 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    )
                  })}
                  <div className="flex gap-2">
                    <select
                      value={selectedChest}
                      onChange={(e) => setSelectedChest(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="" disabled>Chọn rương...</option>
                      {chests.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.chest_type})</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (selectedChest) {
                          addRewardItem('chests', { chest_id: selectedChest })
                          setSelectedChest('')
                        }
                      }}
                      className="px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 text-sm"
                    >
                      Thêm
                    </button>
                  </div>
                </div>
              </div>

              {/* Pets picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thú cưng</label>
                <div className="space-y-2">
                  {(formData.rewards.pets || []).map((item, idx) => {
                    const found = pets.find(p => p.id === item.pet_id)
                    return (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                        <span className="flex-1 text-sm">{found?.name || item.pet_id}</span>
                        <button onClick={() => removeRewardItem('pets', idx)} className="text-red-400 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    )
                  })}
                  <div className="flex gap-2">
                    <select
                      value={selectedPet}
                      onChange={(e) => setSelectedPet(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="" disabled>Chọn thú cưng...</option>
                      {pets.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.rarity})</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (selectedPet) {
                          addRewardItem('pets', { pet_id: selectedPet })
                          setSelectedPet('')
                        }
                      }}
                      className="px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 text-sm"
                    >
                      Thêm
                    </button>
                  </div>
                </div>
              </div>

              {/* Cosmetics picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trang trí (Shop Items)</label>
                <div className="space-y-2">
                  {(formData.rewards.cosmetics || []).map((item, idx) => {
                    const found = shopItems.find(s => s.id === item.shop_item_id)
                    return (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                        <span className="flex-1 text-sm">{found?.name || item.shop_item_id}</span>
                        <button onClick={() => removeRewardItem('cosmetics', idx)} className="text-red-400 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    )
                  })}
                  <div className="flex gap-2">
                    <select
                      value={selectedCosmetic}
                      onChange={(e) => setSelectedCosmetic(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="" disabled>Chọn trang trí...</option>
                      {shopItems.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (selectedCosmetic) {
                          addRewardItem('cosmetics', { shop_item_id: selectedCosmetic })
                          setSelectedCosmetic('')
                        }
                      }}
                      className="px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 text-sm"
                    >
                      Thêm
                    </button>
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giới hạn lượt dùng</label>
                  <input
                    type="number"
                    value={formData.max_redemptions || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, max_redemptions: parseInt(e.target.value) || null }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Không giới hạn"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hết hạn</label>
                  <input
                    type="datetime-local"
                    value={formData.expires_at}
                    onChange={(e) => setFormData(prev => ({ ...prev, expires_at: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_single_use}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_single_use: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Dùng 1 lần (tổng cộng)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Đang hoạt động</span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-5 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Huỷ
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingGiftcode ? 'Cập nhật' : 'Tạo mới'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GiftcodeManagement
