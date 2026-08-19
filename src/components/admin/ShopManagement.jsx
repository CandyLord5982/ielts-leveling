import { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import Card from '../ui/Card'
import Button from '../ui/Button'
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  ShoppingBag,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

const categoryOptions = [
  { value: 'avatar', label: 'Avatar' },
  { value: 'frame', label: 'Frame' },
  { value: 'background', label: 'Background' },
  { value: 'pet', label: 'Pet' },
  { value: 'spaceship', label: 'Spaceship' },
  { value: 'boat', label: 'Boat' },
  { value: 'hammer', label: 'Hammer' },
  { value: 'school', label: 'School Things' },
]

const priceTypeOptions = [
  { value: 'gems', label: 'Gems' },
  { value: 'xp', label: 'XP' },
]

const defaultForm = {
  name: '',
  description: '',
  category: 'avatar',
  price: 0,
  price_type: 'gems',
  image_url: '',
  item_data: '{}',
  is_active: true,
}

const ShopManagement = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [formData, setFormData] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState('all')
  const [activeCollection, setActiveCollection] = useState('all')
  const [variantIndex, setVariantIndex] = useState({})

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('shop_items')
        .select('*')
        .order('category')
        .order('price')

      if (error) throw error
      setItems(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item)
      setFormData({
        name: item.name,
        description: item.description || '',
        category: item.category,
        price: item.price,
        price_type: item.price_type || 'gems',
        image_url: item.image_url || '',
        item_data: item.item_data ? JSON.stringify(item.item_data, null, 2) : '{}',
        is_active: item.is_active,
      })
    } else {
      setEditingItem(null)
      setFormData({ ...defaultForm, category: filterCategory !== 'all' ? filterCategory : defaultForm.category })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingItem(null)
    setFormData(defaultForm)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      let parsedItemData = {}
      try {
        parsedItemData = JSON.parse(formData.item_data)
      } catch {
        throw new Error('item_data không phải JSON hợp lệ')
      }

      const payload = {
        name: formData.name,
        description: formData.description || null,
        category: formData.category,
        price: parseInt(formData.price),
        price_type: formData.price_type,
        image_url: formData.image_url || null,
        item_data: parsedItemData,
        is_active: formData.is_active,
      }

      if (editingItem) {
        const { error } = await supabase
          .from('shop_items')
          .update(payload)
          .eq('id', editingItem.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('shop_items')
          .insert(payload)
        if (error) throw error
      }

      handleCloseModal()
      fetchItems()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa vật phẩm này?')) return
    try {
      const { error } = await supabase
        .from('shop_items')
        .delete()
        .eq('id', id)
      if (error) throw error
      fetchItems()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleToggleActive = async (item) => {
    try {
      const { error } = await supabase
        .from('shop_items')
        .update({ is_active: !item.is_active })
        .eq('id', item.id)
      if (error) throw error
      fetchItems()
    } catch (err) {
      setError(err.message)
    }
  }

  const filteredItems = filterCategory === 'all'
    ? items
    : items.filter(item => item.category === filterCategory)

  const collections = [...new Set(filteredItems.map(item => {
    const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data
    return data?.collection
  }).filter(Boolean))]

  const displayedItems = activeCollection === 'all'
    ? filteredItems
    : filteredItems.filter(item => {
        const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data
        return data?.collection === activeCollection
      })

  const groupedItems = (() => {
    const groups = []
    const groupMap = {}
    displayedItems.forEach(item => {
      const data = typeof item.item_data === 'string' ? JSON.parse(item.item_data) : item.item_data
      const groupKey = data?.avatar_group
      if (groupKey) {
        if (!groupMap[groupKey]) {
          groupMap[groupKey] = { groupKey, variants: [] }
          groups.push(groupMap[groupKey])
        }
        groupMap[groupKey].variants.push(item)
      } else {
        groups.push({ groupKey: null, variants: [item] })
      }
    })
    groups.forEach(g => g.variants.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))
    return groups
  })()

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Quản lý Shop</h2>
        <div className="text-center py-8 text-gray-600">Đang tải dữ liệu...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-gray-600 hidden sm:block">Thêm và quản lý vật phẩm trong cửa hàng</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="flex items-center space-x-2 shrink-0">
          <Plus className="w-4 h-4" />
          <span>Thêm vật phẩm</span>
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800">Lỗi: {error}</div>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setFilterCategory('all'); setActiveCollection('all') }}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filterCategory === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Tất cả
        </button>
        {categoryOptions.map(cat => (
          <button
            key={cat.value}
            onClick={() => { setFilterCategory(cat.value); setActiveCollection('all') }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterCategory === cat.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Collection Sub-tabs */}
      {collections.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCollection('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeCollection === 'all'
                ? 'bg-blue-100 text-blue-700 shadow-sm'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
          >
            All
          </button>
          {collections.map(col => (
            <button
              key={col}
              onClick={() => setActiveCollection(col)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeCollection === col
                  ? 'bg-blue-100 text-blue-700 shadow-sm'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              {col}
            </button>
          ))}
        </div>
      )}

      {/* Items Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {groupedItems.map(group => {
          const idx = group.groupKey ? (variantIndex[group.groupKey] || 0) : 0
          const item = group.variants[idx]
          const hasVariants = group.variants.length > 1
          return (
            <Card key={group.groupKey || item.id} className={`p-4 ${!item.is_active ? 'opacity-60' : ''}`}>
              <div className="space-y-3">
                {/* Image */}
                <div className="aspect-square bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className={`w-full h-full object-contain ${item.category === 'hammer' ? 'rotate-90' : ''}`} />
                  ) : (
                    <ShoppingBag className="w-12 h-12 text-gray-300" />
                  )}
                </div>

                {/* Variant arrows + dots/counter */}
                {hasVariants && (
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => setVariantIndex(prev => ({ ...prev, [group.groupKey]: (idx - 1 + group.variants.length) % group.variants.length }))}
                      className="bg-gray-100 hover:bg-gray-200 rounded-full p-0.5"
                    >
                      <ChevronLeft className="w-4 h-4 text-gray-600" />
                    </button>
                    {group.variants.length <= 6
                      ? group.variants.map((v, i) => (
                          <button
                            key={v.id}
                            onClick={() => setVariantIndex(prev => ({ ...prev, [group.groupKey]: i }))}
                            className={`w-2 h-2 rounded-full transition-all ${
                              i === idx ? 'bg-blue-500 scale-125' : 'bg-gray-300'
                            }`}
                          />
                        ))
                      : <span className="text-xs text-gray-500 font-medium">{idx + 1}/{group.variants.length}</span>
                    }
                    <button
                      onClick={() => setVariantIndex(prev => ({ ...prev, [group.groupKey]: (idx + 1) % group.variants.length }))}
                      className="bg-gray-100 hover:bg-gray-200 rounded-full p-0.5"
                    >
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                )}

                {/* Info */}
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">{item.name}</h3>
                    {!item.is_active && (
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Ẩn</span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {categoryOptions.find(c => c.value === item.category)?.label || item.category}
                    </span>
                    <span className="text-sm font-medium text-gray-700">
                      {item.price} {item.price_type === 'xp' ? 'XP' : 'Gems'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 pt-2 border-t">
                  <Button variant="ghost" size="sm" onClick={() => handleOpenModal(item)} className="flex items-center space-x-1">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(item)}
                    className={`flex items-center space-x-1 ${item.is_active ? 'text-green-600' : 'text-gray-400'}`}
                  >
                    {item.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(item.id)}
                    className="flex items-center space-x-1 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Empty State */}
      {groupedItems.length === 0 && (
        <Card className="p-8 text-center">
          <ShoppingBag className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Chưa có vật phẩm nào</h3>
          <p className="text-gray-600 mb-4">Thêm vật phẩm đầu tiên cho cửa hàng</p>
          <Button onClick={() => handleOpenModal()}>Thêm vật phẩm</Button>
        </Card>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingItem ? 'Sửa vật phẩm' : 'Thêm vật phẩm mới'}
                </h3>
                <Button type="button" variant="ghost" onClick={handleCloseModal}>
                  ✕
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên vật phẩm *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Danh mục *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {categoryOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Price */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giá *</label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    required
                  />
                </div>

                {/* Price Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Loại tiền</label>
                  <select
                    value={formData.price_type}
                    onChange={(e) => setFormData({ ...formData, price_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {priceTypeOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Image URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL hình ảnh</label>
                  <input
                    type="url"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://..."
                  />
                </div>

                {/* Item Data (JSON) */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dữ liệu thêm (JSON)
                  </label>
                  <textarea
                    value={formData.item_data}
                    onChange={(e) => setFormData({ ...formData, item_data: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    rows={3}
                    placeholder='{"avatar_url": "...", "avatar_ratio": 66}'
                  />
                </div>

                {/* Active */}
                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Hiển thị trong cửa hàng</span>
                  </label>
                </div>
              </div>

              {/* Preview */}
              {formData.image_url && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Xem trước:</h4>
                  <div className="w-24 h-24 bg-gray-50 rounded-lg overflow-hidden">
                    <img src={formData.image_url} alt="Preview" className="w-full h-full object-contain" />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={handleCloseModal}>Hủy</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Đang lưu...' : editingItem ? 'Cập nhật' : 'Tạo vật phẩm'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ShopManagement
