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
  Package,
  Box,
  Layers,
  Settings,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

const itemTypeOptions = [
  { value: 'item', label: 'Item' },
  { value: 'egg', label: 'Egg' },
  { value: 'pet_food', label: 'Pet Food' },
  { value: 'pet_toy', label: 'Pet Toy' },
  { value: 'background', label: 'Background' },
  { value: 'ball', label: 'Ball' },
  { value: 'ticket', label: 'Ticket' },
]

const rarityOptions = [
  { value: 'common', label: 'Common', color: 'bg-gray-100 text-gray-700' },
  { value: 'uncommon', label: 'Uncommon', color: 'bg-green-100 text-green-700' },
  { value: 'rare', label: 'Rare', color: 'bg-blue-100 text-blue-700' },
  { value: 'epic', label: 'Epic', color: 'bg-purple-100 text-purple-700' },
  { value: 'legendary', label: 'Legendary', color: 'bg-yellow-100 text-yellow-700' },
]

const chestTypeOptions = [
  { value: 'common', label: 'Common' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'legendary', label: 'Legendary' },
]

const resultTypeOptions = [
  { value: 'cosmetic', label: 'Cosmetic (Shop Item)' },
  { value: 'xp', label: 'XP' },
  { value: 'gems', label: 'Gems' },
  { value: 'item', label: 'Item (Collectible)' },
]

const defaultItemForm = {
  name: '',
  description: '',
  image_url: '',
  item_type: 'item',
  set_name: '',
  rarity: 'common',
  is_active: true,
  sort_order: 0,
  price_gems: 0,
  price_xp: 0,
}

const defaultChestForm = {
  name: '',
  description: '',
  image_url: '',
  chest_type: 'common',
  loot_table: '[]',
  guaranteed_items: '[]',
  items_per_open: 3,
  is_active: true,
}

const defaultRecipeForm = {
  name: '',
  description: '',
  result_type: 'cosmetic',
  result_shop_item_id: '',
  result_item_id: '',
  result_quantity: 1,
  result_xp: 0,
  result_gems: 0,
  result_image_url: '',
  result_data: '{}',
  ingredients: '[]',
  is_active: true,
  max_crafts_per_user: '',
  success_rate: 100,
}

const InventoryManagement = () => {
  const [activeSubTab, setActiveSubTab] = useState('items')
  const [items, setItems] = useState([])
  const [chests, setChests] = useState([])
  const [recipes, setRecipes] = useState([])
  const [dropConfig, setDropConfig] = useState({})
  const [shopItems, setShopItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [formData, setFormData] = useState(defaultItemForm)
  const [saving, setSaving] = useState(false)
  const [filterType, setFilterType] = useState('all')

  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    try {
      setLoading(true)
      const [itemsRes, chestsRes, recipesRes, configRes, shopRes] = await Promise.all([
        supabase.from('collectible_items').select('*').order('set_name').order('sort_order'),
        supabase.from('chests').select('*').order('created_at', { ascending: false }),
        supabase.from('recipes').select('*').order('created_at', { ascending: false }),
        supabase.from('drop_config').select('*'),
        supabase.from('shop_items').select('id, name, image_url, category').eq('is_active', true),
      ])

      if (itemsRes.error) throw itemsRes.error
      setItems(itemsRes.data || [])
      setChests(chestsRes.data || [])
      setRecipes(recipesRes.data || [])
      setShopItems(shopRes.data || [])

      const configMap = {}
      ;(configRes.data || []).forEach(c => {
        configMap[c.config_key] = c
      })
      setDropConfig(configMap)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ===== ITEMS CRUD =====
  const handleOpenItemModal = (item = null) => {
    if (item) {
      setEditingRecord(item)
      setFormData({
        name: item.name,
        description: item.description || '',
        image_url: item.image_url || '',
        item_type: item.item_type,
        set_name: item.set_name || '',
        rarity: item.rarity,
        is_active: item.is_active,
        sort_order: item.sort_order || 0,
        price_gems: item.price_gems || 0,
        price_xp: item.price_xp || 0,
      })
    } else {
      setEditingRecord(null)
      setFormData(defaultItemForm)
    }
    setShowModal(true)
  }

  const handleSubmitItem = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        image_url: formData.image_url || null,
        item_type: formData.item_type,
        set_name: formData.set_name || null,
        rarity: formData.rarity,
        is_active: formData.is_active,
        sort_order: parseInt(formData.sort_order) || 0,
        price_gems: parseInt(formData.price_gems) || 0,
        price_xp: parseInt(formData.price_xp) || 0,
      }

      if (editingRecord) {
        const { error } = await supabase.from('collectible_items').update(payload).eq('id', editingRecord.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('collectible_items').insert(payload)
        if (error) throw error
      }
      setShowModal(false)
      fetchAllData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteItem = async (id) => {
    if (!window.confirm('Delete this item?')) return
    try {
      const { error } = await supabase.from('collectible_items').delete().eq('id', id)
      if (error) throw error
      fetchAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleToggleItemActive = async (item) => {
    try {
      const { error } = await supabase.from('collectible_items').update({ is_active: !item.is_active }).eq('id', item.id)
      if (error) throw error
      fetchAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  // ===== CHESTS CRUD =====
  const handleOpenChestModal = (chest = null) => {
    if (chest) {
      setEditingRecord(chest)
      setFormData({
        name: chest.name,
        description: chest.description || '',
        image_url: chest.image_url || '',
        chest_type: chest.chest_type,
        loot_table: JSON.stringify(chest.loot_table || [], null, 2),
        guaranteed_items: JSON.stringify(chest.guaranteed_items || [], null, 2),
        items_per_open: chest.items_per_open || 3,
        is_active: chest.is_active,
      })
    } else {
      setEditingRecord(null)
      setFormData(defaultChestForm)
    }
    setShowModal(true)
  }

  const handleSubmitChest = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      let parsedLoot, parsedGuaranteed
      try {
        parsedLoot = JSON.parse(formData.loot_table)
        parsedGuaranteed = JSON.parse(formData.guaranteed_items)
      } catch {
        throw new Error('Invalid JSON in loot table or guaranteed items')
      }

      const payload = {
        name: formData.name,
        description: formData.description || null,
        image_url: formData.image_url || null,
        chest_type: formData.chest_type,
        loot_table: parsedLoot,
        guaranteed_items: parsedGuaranteed,
        items_per_open: parseInt(formData.items_per_open) || 3,
        is_active: formData.is_active,
      }

      if (editingRecord) {
        const { error } = await supabase.from('chests').update(payload).eq('id', editingRecord.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('chests').insert(payload)
        if (error) throw error
      }
      setShowModal(false)
      fetchAllData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteChest = async (id) => {
    if (!window.confirm('Delete this chest?')) return
    try {
      const { error } = await supabase.from('chests').delete().eq('id', id)
      if (error) throw error
      fetchAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  // ===== RECIPES CRUD =====
  const handleOpenRecipeModal = (recipe = null) => {
    if (recipe) {
      setEditingRecord(recipe)
      setFormData({
        name: recipe.name,
        description: recipe.description || '',
        result_type: recipe.result_type,
        result_shop_item_id: recipe.result_shop_item_id || '',
        result_item_id: recipe.result_item_id || '',
        result_quantity: recipe.result_quantity || 1,
        result_xp: recipe.result_xp || 0,
        result_gems: recipe.result_gems || 0,
        result_image_url: recipe.result_image_url || '',
        result_data: JSON.stringify(recipe.result_data || {}, null, 2),
        ingredients: JSON.stringify(recipe.ingredients || [], null, 2),
        is_active: recipe.is_active,
        max_crafts_per_user: recipe.max_crafts_per_user ?? '',
        success_rate: recipe.success_rate ?? 100,
      })
    } else {
      setEditingRecord(null)
      setFormData(defaultRecipeForm)
    }
    setShowModal(true)
  }

  const handleSubmitRecipe = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      let parsedIngredients, parsedResultData
      try {
        parsedIngredients = JSON.parse(formData.ingredients)
        parsedResultData = JSON.parse(formData.result_data)
      } catch {
        throw new Error('Invalid JSON in ingredients or result data')
      }

      const payload = {
        name: formData.name,
        description: formData.description || null,
        result_type: formData.result_type,
        result_shop_item_id: formData.result_shop_item_id || null,
        result_item_id: formData.result_item_id || null,
        result_quantity: formData.result_type === 'item' ? (parseInt(formData.result_quantity) || 1) : 1,
        result_xp: parseInt(formData.result_xp) || 0,
        result_gems: parseInt(formData.result_gems) || 0,
        result_image_url: formData.result_image_url || null,
        result_data: parsedResultData,
        ingredients: parsedIngredients,
        is_active: formData.is_active,
        max_crafts_per_user: formData.max_crafts_per_user ? parseInt(formData.max_crafts_per_user) : null,
        success_rate: parseInt(formData.success_rate) || 100,
      }

      if (editingRecord) {
        const { error } = await supabase.from('recipes').update(payload).eq('id', editingRecord.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('recipes').insert(payload)
        if (error) throw error
      }
      setShowModal(false)
      fetchAllData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRecipe = async (id) => {
    if (!window.confirm('Delete this recipe?')) return
    try {
      const { error } = await supabase.from('recipes').delete().eq('id', id)
      if (error) throw error
      fetchAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  // ===== DROP CONFIG =====
  const handleSaveDropConfig = async (key, value) => {
    try {
      setSaving(true)
      const parsed = JSON.parse(value)
      const existing = dropConfig[key]

      if (existing) {
        const { error } = await supabase.from('drop_config').update({ config_value: parsed, updated_at: new Date().toISOString() }).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('drop_config').insert({ config_key: key, config_value: parsed })
        if (error) throw error
      }
      fetchAllData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const getRarityColor = (rarity) => {
    return rarityOptions.find(r => r.value === rarity)?.color || 'bg-gray-100 text-gray-700'
  }

  const getItemName = (itemId) => {
    const item = items.find(i => i.id === itemId)
    return item ? item.name : itemId?.substring(0, 8) + '...'
  }

  const filteredItems = filterType === 'all' ? items : items.filter(i => i.item_type === filterType)

  // Group items by set_name
  const groupedItems = {}
  filteredItems.forEach(item => {
    const group = item.set_name || 'No Set'
    if (!groupedItems[group]) groupedItems[group] = []
    groupedItems[group].push(item)
  })

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Inventory Management</h2>
        <div className="text-center py-8 text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800">{error}</div>
          <button onClick={() => setError(null)} className="text-sm text-red-600 underline mt-1">Dismiss</button>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b pb-2">
        {[
          { id: 'items', label: 'Items', icon: Package, count: items.length },
          { id: 'chests', label: 'Chests', icon: Box, count: chests.length },
          { id: 'recipes', label: 'Recipes', icon: Layers, count: recipes.length },
          { id: 'config', label: 'Drop Config', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeSubTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeSubTab === tab.id ? 'bg-blue-500' : 'bg-gray-200'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ===== ITEMS TAB ===== */}
      {activeSubTab === 'items' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${filterType === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                All
              </button>
              {itemTypeOptions.map(t => (
                <button
                  key={t.value}
                  onClick={() => setFilterType(t.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium ${filterType === t.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Button onClick={() => handleOpenItemModal()} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          </div>

          {Object.entries(groupedItems).map(([setName, setItems]) => (
            <div key={setName} className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{setName}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {setItems.map(item => (
                  <Card key={item.id} className={`p-3 ${!item.is_active ? 'opacity-50' : ''}`}>
                    <div className="space-y-2">
                      <div className="aspect-square bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                        ) : (
                          <Package className="w-8 h-8 text-gray-300" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 truncate">{item.name}</h4>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${getRarityColor(item.rarity)}`}>
                            {item.rarity}
                          </span>
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                            {item.item_type}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 pt-1 border-t">
                        <button onClick={() => handleOpenItemModal(item)} className="p-1 hover:bg-gray-100 rounded">
                          <Edit className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        <button onClick={() => handleToggleItemActive(item)} className="p-1 hover:bg-gray-100 rounded">
                          {item.is_active ? <Eye className="w-3.5 h-3.5 text-green-500" /> : <EyeOff className="w-3.5 h-3.5 text-gray-400" />}
                        </button>
                        <button onClick={() => handleDeleteItem(item.id)} className="p-1 hover:bg-gray-100 rounded">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <Card className="p-8 text-center">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No items yet</h3>
              <p className="text-gray-600 mb-4">Create collectible items that students can earn</p>
              <Button onClick={() => handleOpenItemModal()}>Add First Item</Button>
            </Card>
          )}
        </div>
      )}

      {/* ===== CHESTS TAB ===== */}
      {activeSubTab === 'chests' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => handleOpenChestModal()} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Chest
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {chests.map(chest => (
              <Card key={chest.id} className={`p-4 ${!chest.is_active ? 'opacity-50' : ''}`}>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-16 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                      {chest.image_url ? (
                        <img src={chest.image_url} alt={chest.name} className="w-full h-full object-contain" />
                      ) : (
                        <Box className="w-8 h-8 text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900">{chest.name}</h4>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{chest.chest_type}</span>
                      <p className="text-xs text-gray-500 mt-1">{chest.items_per_open} random items per open</p>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500">
                    <p>Loot table: {(chest.loot_table || []).length} entries</p>
                    <p>Guaranteed: {(chest.guaranteed_items || []).length} items</p>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <button onClick={() => handleOpenChestModal(chest)} className="p-1 hover:bg-gray-100 rounded">
                      <Edit className="w-4 h-4 text-gray-500" />
                    </button>
                    <button onClick={() => handleDeleteChest(chest.id)} className="p-1 hover:bg-gray-100 rounded">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {chests.length === 0 && (
            <Card className="p-8 text-center">
              <Box className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No chests yet</h3>
              <p className="text-gray-600 mb-4">Create chests with loot tables for students to open</p>
              <Button onClick={() => handleOpenChestModal()}>Add First Chest</Button>
            </Card>
          )}
        </div>
      )}

      {/* ===== RECIPES TAB ===== */}
      {activeSubTab === 'recipes' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => handleOpenRecipeModal()} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Recipe
            </Button>
          </div>

          {recipes.length === 0 ? (
            <Card className="p-8 text-center">
              <Layers className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No recipes yet</h3>
              <p className="text-gray-600 mb-4">Define crafting recipes for exclusive rewards</p>
              <Button onClick={() => handleOpenRecipeModal()}>Add First Recipe</Button>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {[...recipes].sort((a, b) => a.name.localeCompare(b.name)).map(recipe => (
                <div key={recipe.id} className={`flex items-center gap-2 px-2.5 py-1.5 border rounded-lg ${!recipe.is_active ? 'opacity-50' : ''}`}>
                  <div className="w-8 h-8 bg-gray-50 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                    {recipe.result_image_url ? (
                      <img src={recipe.result_image_url} alt={recipe.name} className="w-full h-full object-contain" />
                    ) : (
                      <Layers className="w-4 h-4 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-xs text-gray-900 truncate">{recipe.name}</span>
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 rounded-full flex-shrink-0">
                        {recipe.result_type === 'cosmetic' ? 'Cosmetic' : recipe.result_type === 'xp' ? `${recipe.result_xp} XP` : recipe.result_type === 'item' ? 'Item' : `${recipe.result_gems} Gems`}
                      </span>
                      {recipe.success_rate != null && recipe.success_rate < 100 && (
                        <span className={`text-[10px] font-medium flex-shrink-0 ${recipe.success_rate >= 70 ? 'text-green-600' : recipe.success_rate >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{recipe.success_rate}%</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {(recipe.ingredients || []).map((ing, idx) => (
                        <span key={idx} className="text-[10px] text-gray-500">{getItemName(ing.item_id)} x{ing.quantity}{idx < (recipe.ingredients || []).length - 1 ? ',' : ''}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => handleOpenRecipeModal(recipe)} className="p-0.5 hover:bg-gray-100 rounded">
                      <Edit className="w-3 h-3 text-gray-400" />
                    </button>
                    <button onClick={() => handleDeleteRecipe(recipe.id)} className="p-0.5 hover:bg-gray-100 rounded">
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== DROP CONFIG TAB ===== */}
      {activeSubTab === 'config' && (
        <DropConfigEditor
          dropConfig={dropConfig}
          onSave={handleSaveDropConfig}
          saving={saving}
          items={items}
        />
      )}

      {/* ===== MODAL ===== */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {activeSubTab === 'items' && (
              <ItemForm
                formData={formData}
                setFormData={setFormData}
                onSubmit={handleSubmitItem}
                onClose={() => setShowModal(false)}
                editing={!!editingRecord}
                saving={saving}
              />
            )}
            {activeSubTab === 'chests' && (
              <ChestForm
                formData={formData}
                setFormData={setFormData}
                onSubmit={handleSubmitChest}
                onClose={() => setShowModal(false)}
                editing={!!editingRecord}
                saving={saving}
                items={items}
                shopItems={shopItems}
              />
            )}
            {activeSubTab === 'recipes' && (
              <RecipeForm
                formData={formData}
                setFormData={setFormData}
                onSubmit={handleSubmitRecipe}
                onClose={() => setShowModal(false)}
                editing={!!editingRecord}
                saving={saving}
                items={items}
                shopItems={shopItems}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ===== FORM COMPONENTS =====

const ItemForm = ({ formData, setFormData, onSubmit, onClose, editing, saving }) => (
  <form onSubmit={onSubmit} className="p-6 space-y-4">
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Item' : 'Add New Item'}</h3>
      <Button type="button" variant="ghost" onClick={onClose}>X</Button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
        <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
      </div>
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
        <select value={formData.item_type} onChange={e => setFormData({ ...formData, item_type: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
          {itemTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Rarity *</label>
        <select value={formData.rarity} onChange={e => setFormData({ ...formData, rarity: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
          {rarityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Set Name</label>
        <input type="text" value={formData.set_name} onChange={e => setFormData({ ...formData, set_name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. Dragon Set" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
        <input type="number" value={formData.sort_order} onChange={e => setFormData({ ...formData, sort_order: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
        <input type="url" value={formData.image_url} onChange={e => setFormData({ ...formData, image_url: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://..." />
      </div>
      {['ball', 'ticket', 'egg'].includes(formData.item_type) && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price (Gems)</label>
            <input type="number" min="0" value={formData.price_gems} onChange={e => setFormData({ ...formData, price_gems: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0 = not for sale" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price (XP)</label>
            <input type="number" min="0" value={formData.price_xp} onChange={e => setFormData({ ...formData, price_xp: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0 = not for sale" />
          </div>
        </>
      )}
      <div className="md:col-span-2">
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-sm font-medium text-gray-700">Active</span>
        </label>
      </div>
    </div>
    {formData.image_url && (
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Preview:</h4>
        <div className="w-20 h-20 bg-gray-50 rounded-lg overflow-hidden">
          <img src={formData.image_url} alt="Preview" className="w-full h-full object-contain" />
        </div>
      </div>
    )}
    <div className="flex items-center justify-end space-x-3 pt-4 border-t">
      <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
      <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
    </div>
  </form>
)

const ChestForm = ({ formData, setFormData, onSubmit, onClose, editing, saving, items, shopItems }) => {
  const parseLootTable = () => {
    try { return JSON.parse(formData.loot_table) } catch { return [] }
  }
  const parseGuaranteedItems = () => {
    try { return JSON.parse(formData.guaranteed_items) } catch { return [] }
  }
  const updateLootTable = (entries) => {
    setFormData({ ...formData, loot_table: JSON.stringify(entries, null, 2) })
  }
  const updateGuaranteedItems = (entries) => {
    setFormData({ ...formData, guaranteed_items: JSON.stringify(entries, null, 2) })
  }

  const lootEntries = parseLootTable()
  const guaranteedEntries = parseGuaranteedItems()
  const totalWeight = lootEntries.reduce((sum, e) => sum + (Number(e.weight) || 0), 0)

  const rewardTypeOptions = [
    { value: 'item', label: 'Item' },
    { value: 'xp', label: 'XP' },
    { value: 'gems', label: 'Gems' },
    { value: 'shop_item', label: 'Shop Item' },
  ]

  const inputClass = "w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"

  return (
    <form onSubmit={onSubmit} className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Chest' : 'Add New Chest'}</h3>
        <Button type="button" variant="ghost" onClick={onClose}>X</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chest Type</label>
          <select value={formData.chest_type} onChange={e => setFormData({ ...formData, chest_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            {chestTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Items Per Open</label>
          <input type="number" value={formData.items_per_open} onChange={e => setFormData({ ...formData, items_per_open: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" min="1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
          <input type="url" value={formData.image_url} onChange={e => setFormData({ ...formData, image_url: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://..." />
        </div>
        <div>
          <label className="flex items-center space-x-2 mt-6">
            <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-700">Active</span>
          </label>
        </div>

        {/* Loot Table Visual Editor */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Loot Table</label>
          <div className="space-y-2">
            {lootEntries.map((entry, idx) => {
              const pct = totalWeight > 0 ? ((Number(entry.weight) || 0) / totalWeight * 100).toFixed(1) : '0.0'
              const rt = entry.reward_type || 'item'
              return (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-24">
                    {idx === 0 && <div className="text-xs text-gray-500 mb-1">Type</div>}
                    <select value={rt} onChange={e => {
                      const updated = [...lootEntries]
                      const newType = e.target.value
                      updated[idx] = { ...updated[idx], reward_type: newType }
                      if (newType === 'xp' || newType === 'gems') {
                        delete updated[idx].item_id
                        delete updated[idx].shop_item_id
                      } else if (newType === 'shop_item') {
                        delete updated[idx].item_id
                      } else {
                        delete updated[idx].shop_item_id
                      }
                      updateLootTable(updated)
                    }} className={`${inputClass}`}>
                      {rewardTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="flex-1 min-w-0">
                    {idx === 0 && <div className="text-xs text-gray-500 mb-1">{rt === 'xp' || rt === 'gems' ? 'Amount' : 'Item'}</div>}
                    {rt === 'item' && (
                      <select value={entry.item_id || ''} onChange={e => {
                        const updated = [...lootEntries]
                        updated[idx] = { ...updated[idx], item_id: e.target.value }
                        updateLootTable(updated)
                      }} className={`${inputClass} w-full`}>
                        <option value="">-- Select Item --</option>
                        {items.map(item => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    )}
                    {rt === 'shop_item' && (
                      <select value={entry.shop_item_id || ''} onChange={e => {
                        const updated = [...lootEntries]
                        updated[idx] = { ...updated[idx], shop_item_id: e.target.value }
                        updateLootTable(updated)
                      }} className={`${inputClass} w-full`}>
                        <option value="">-- Select Shop Item --</option>
                        {(shopItems || []).map(si => (
                          <option key={si.id} value={si.id}>{si.name} ({si.category})</option>
                        ))}
                      </select>
                    )}
                    {(rt === 'xp' || rt === 'gems') && (
                      <div className="text-xs text-gray-400 py-1.5 px-2">Use Min/Max for amount</div>
                    )}
                  </div>
                  <div className="w-20">
                    {idx === 0 && <div className="text-xs text-gray-500 mb-1 text-center">Weight</div>}
                    <input type="number" value={entry.weight ?? ''} min="1" placeholder="Wt" onChange={e => {
                      const updated = [...lootEntries]
                      updated[idx] = { ...updated[idx], weight: Number(e.target.value) || 0 }
                      updateLootTable(updated)
                    }} className={`${inputClass} text-center`} />
                  </div>
                  <div className="w-16">
                    {idx === 0 && <div className="text-xs text-gray-500 mb-1 text-center">Min</div>}
                    <input type="number" value={entry.min_qty ?? ''} min="1" placeholder="Min" onChange={e => {
                      const updated = [...lootEntries]
                      updated[idx] = { ...updated[idx], min_qty: Number(e.target.value) || 1 }
                      updateLootTable(updated)
                    }} className={`${inputClass} text-center`} />
                  </div>
                  <div className="w-16">
                    {idx === 0 && <div className="text-xs text-gray-500 mb-1 text-center">Max</div>}
                    <input type="number" value={entry.max_qty ?? ''} min="1" placeholder="Max" onChange={e => {
                      const updated = [...lootEntries]
                      updated[idx] = { ...updated[idx], max_qty: Number(e.target.value) || 1 }
                      updateLootTable(updated)
                    }} className={`${inputClass} text-center`} />
                  </div>
                  <div className="w-16">
                    {idx === 0 && <div className="text-xs text-gray-500 mb-1 text-center">Chance</div>}
                    <span className="block text-center text-xs font-medium text-blue-600 py-1.5">{pct}%</span>
                  </div>
                  <div className="w-8">
                    {idx === 0 && <div className="text-xs text-gray-500 mb-1">&nbsp;</div>}
                    <button type="button" onClick={() => {
                      updateLootTable(lootEntries.filter((_, i) => i !== idx))
                    }} className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
            <button type="button" onClick={() => {
              updateLootTable([...lootEntries, { reward_type: 'item', item_id: '', weight: 10, min_qty: 1, max_qty: 1 }])
            }} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mt-1">
              <Plus size={14} /> Add Loot Entry
            </button>
          </div>
        </div>

        {/* Guaranteed Items Visual Editor */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Guaranteed Rewards</label>
          <div className="space-y-2">
            {guaranteedEntries.map((entry, idx) => {
              const rt = entry.reward_type || 'item'
              return (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-24">
                    {idx === 0 && <div className="text-xs text-gray-500 mb-1">Type</div>}
                    <select value={rt} onChange={e => {
                      const updated = [...guaranteedEntries]
                      const newType = e.target.value
                      updated[idx] = { ...updated[idx], reward_type: newType }
                      if (newType === 'xp' || newType === 'gems') {
                        delete updated[idx].item_id
                        delete updated[idx].shop_item_id
                      } else if (newType === 'shop_item') {
                        delete updated[idx].item_id
                      } else {
                        delete updated[idx].shop_item_id
                      }
                      updateGuaranteedItems(updated)
                    }} className={`${inputClass}`}>
                      {rewardTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="flex-1 min-w-0">
                    {idx === 0 && <div className="text-xs text-gray-500 mb-1">{rt === 'xp' || rt === 'gems' ? 'Amount' : 'Item'}</div>}
                    {rt === 'item' && (
                      <select value={entry.item_id || ''} onChange={e => {
                        const updated = [...guaranteedEntries]
                        updated[idx] = { ...updated[idx], item_id: e.target.value }
                        updateGuaranteedItems(updated)
                      }} className={`${inputClass} w-full`}>
                        <option value="">-- Select Item --</option>
                        {items.map(item => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    )}
                    {rt === 'shop_item' && (
                      <select value={entry.shop_item_id || ''} onChange={e => {
                        const updated = [...guaranteedEntries]
                        updated[idx] = { ...updated[idx], shop_item_id: e.target.value }
                        updateGuaranteedItems(updated)
                      }} className={`${inputClass} w-full`}>
                        <option value="">-- Select Shop Item --</option>
                        {(shopItems || []).map(si => (
                          <option key={si.id} value={si.id}>{si.name} ({si.category})</option>
                        ))}
                      </select>
                    )}
                    {(rt === 'xp' || rt === 'gems') && (
                      <div className="text-xs text-gray-400 py-1.5 px-2">Set quantity below</div>
                    )}
                  </div>
                  <div className="w-20">
                    {idx === 0 && <div className="text-xs text-gray-500 mb-1 text-center">Quantity</div>}
                    <input type="number" value={entry.quantity ?? ''} min="1" placeholder="Qty" onChange={e => {
                      const updated = [...guaranteedEntries]
                      updated[idx] = { ...updated[idx], quantity: Number(e.target.value) || 1 }
                      updateGuaranteedItems(updated)
                    }} className={`${inputClass} text-center`} />
                  </div>
                  <div className="w-8">
                    {idx === 0 && <div className="text-xs text-gray-500 mb-1">&nbsp;</div>}
                    <button type="button" onClick={() => {
                      updateGuaranteedItems(guaranteedEntries.filter((_, i) => i !== idx))
                    }} className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
            <button type="button" onClick={() => {
              updateGuaranteedItems([...guaranteedEntries, { reward_type: 'item', item_id: '', quantity: 1 }])
            }} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mt-1">
              <Plus size={14} /> Add Guaranteed Reward
            </button>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end space-x-3 pt-4 border-t">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
      </div>
    </form>
  )
}

const RecipeForm = ({ formData, setFormData, onSubmit, onClose, editing, saving, items, shopItems }) => {
  const parseIngredients = () => {
    try { return JSON.parse(formData.ingredients) } catch { return [] }
  }
  const updateIngredients = (entries) => {
    setFormData({ ...formData, ingredients: JSON.stringify(entries, null, 2) })
  }

  const ingredientEntries = parseIngredients()
  const inputClass = "w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"

  return (
    <form onSubmit={onSubmit} className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Recipe' : 'Add New Recipe'}</h3>
        <Button type="button" variant="ghost" onClick={onClose}>X</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Recipe Name *</label>
          <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Result Type *</label>
          <select value={formData.result_type} onChange={e => setFormData({ ...formData, result_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            {resultTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {formData.result_type === 'cosmetic' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reward Shop Item</label>
            <select value={formData.result_shop_item_id} onChange={e => setFormData({ ...formData, result_shop_item_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select item...</option>
              {shopItems.map(si => <option key={si.id} value={si.id}>{si.name} ({si.category})</option>)}
            </select>
          </div>
        )}
        {formData.result_type === 'xp' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">XP Reward</label>
            <input type="number" value={formData.result_xp} onChange={e => setFormData({ ...formData, result_xp: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" min="0" />
          </div>
        )}
        {formData.result_type === 'gems' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gems Reward</label>
            <input type="number" value={formData.result_gems} onChange={e => setFormData({ ...formData, result_gems: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" min="0" />
          </div>
        )}
        {formData.result_type === 'item' && (<>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reward Item</label>
            <select value={formData.result_item_id} onChange={e => setFormData({ ...formData, result_item_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select item...</option>
              {items.map(item => <option key={item.id} value={item.id}>{item.name} ({item.rarity})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Result Quantity</label>
            <input type="number" value={formData.result_quantity} onChange={e => setFormData({ ...formData, result_quantity: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" min="1" />
          </div>
        </>)}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Crafts Per User</label>
          <input type="number" value={formData.max_crafts_per_user} onChange={e => setFormData({ ...formData, max_crafts_per_user: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Unlimited" min="1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Success Rate (%)</label>
          <input type="number" value={formData.success_rate} onChange={e => setFormData({ ...formData, success_rate: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" min="0" max="100" />
          <p className="text-xs text-gray-500 mt-1">If fail, student loses 1 ingredient (common first)</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Result Image URL</label>
          <input type="url" value={formData.result_image_url} onChange={e => setFormData({ ...formData, result_image_url: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://..." />
        </div>

        {/* Ingredients Visual Editor */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Ingredients</label>
          <div className="space-y-2">
            {ingredientEntries.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  {idx === 0 && <div className="text-xs text-gray-500 mb-1">Item</div>}
                  <select value={entry.item_id || ''} onChange={e => {
                    const updated = [...ingredientEntries]
                    updated[idx] = { ...updated[idx], item_id: e.target.value }
                    updateIngredients(updated)
                  }} className={`${inputClass} w-full`}>
                    <option value="">-- Select Item --</option>
                    {items.map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div className="w-20">
                  {idx === 0 && <div className="text-xs text-gray-500 mb-1 text-center">Quantity</div>}
                  <input type="number" value={entry.quantity ?? ''} min="1" placeholder="Qty" onChange={e => {
                    const updated = [...ingredientEntries]
                    updated[idx] = { ...updated[idx], quantity: Number(e.target.value) || 1 }
                    updateIngredients(updated)
                  }} className={`${inputClass} text-center`} />
                </div>
                <div className="w-8">
                  {idx === 0 && <div className="text-xs text-gray-500 mb-1">&nbsp;</div>}
                  <button type="button" onClick={() => {
                    updateIngredients(ingredientEntries.filter((_, i) => i !== idx))
                  }} className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => {
              updateIngredients([...ingredientEntries, { item_id: '', quantity: 1 }])
            }} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mt-1">
              <Plus size={14} /> Add Ingredient
            </button>
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="flex items-center space-x-2">
            <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-700">Active</span>
          </label>
        </div>
      </div>
      <div className="flex items-center justify-end space-x-3 pt-4 border-t">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
      </div>
    </form>
  )
}

const DropConfigEditor = ({ dropConfig, onSave, saving, items }) => {
  const defaultExercise = { base_chance: 0.30, rarity_weights: { common: 60, uncommon: 25, rare: 12, epic: 3 }, included_items: [] }
  const defaultMilestone = { session_complete: 'common', streak_7: 'uncommon', streak_30: 'rare', challenge_win_top3: 'uncommon' }

  const [exerciseConfig, setExerciseConfig] = useState(
    JSON.stringify(dropConfig['exercise_drop_rate']?.config_value || defaultExercise, null, 2)
  )
  const [milestoneConfig, setMilestoneConfig] = useState(
    JSON.stringify(dropConfig['milestone_chests']?.config_value || defaultMilestone, null, 2)
  )

  const parseExercise = () => {
    try { return JSON.parse(exerciseConfig) } catch { return defaultExercise }
  }
  const parseMilestone = () => {
    try { return JSON.parse(milestoneConfig) } catch { return defaultMilestone }
  }
  const updateExercise = (obj) => setExerciseConfig(JSON.stringify(obj, null, 2))
  const updateMilestone = (obj) => setMilestoneConfig(JSON.stringify(obj, null, 2))

  const exercise = parseExercise()
  const milestone = parseMilestone()
  const rarities = ['common', 'uncommon', 'rare', 'epic']
  const chestTypes = ['common', 'uncommon', 'rare', 'epic', 'legendary']
  const totalRarityWeight = rarities.reduce((sum, r) => sum + (Number(exercise.rarity_weights?.[r]) || 0), 0)

  const inputClass = "w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Exercise Drop Rate</h3>
        <p className="text-sm text-gray-500 mb-4">Controls the chance of item drops when a student completes an exercise (score &gt;= 75%)</p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Base Drop Chance</label>
          <div className="flex items-center gap-2">
            <input type="number" value={exercise.base_chance ?? 0.3} min="0" max="1" step="0.01"
              onChange={e => updateExercise({ ...exercise, base_chance: parseFloat(e.target.value) || 0 })}
              className={`${inputClass} w-28`} />
            <span className="text-sm text-gray-500">({((exercise.base_chance || 0) * 100).toFixed(0)}%)</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Rarity Weights</label>
          <div className="space-y-2">
            {rarities.map((rarity) => {
              const weight = Number(exercise.rarity_weights?.[rarity]) || 0
              const pct = totalRarityWeight > 0 ? (weight / totalRarityWeight * 100).toFixed(1) : '0.0'
              return (
                <div key={rarity} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-gray-700 capitalize">{rarity}</span>
                  <input type="number" value={weight} min="0"
                    onChange={e => updateExercise({
                      ...exercise,
                      rarity_weights: { ...exercise.rarity_weights, [rarity]: Number(e.target.value) || 0 }
                    })}
                    className={`${inputClass} w-20 text-center`} />
                  <span className="text-xs font-medium text-blue-600 w-14">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Included Items</label>
          <p className="text-xs text-gray-500 mb-2">Only these items can drop from exercises. If empty, all active items can drop.</p>
          <div className="space-y-2">
            {(exercise.included_items || []).map((itemId, idx) => {
              const item = items.find(i => i.id === itemId)
              return (
                <div key={idx} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-700 truncate">{item ? item.name : itemId}</span>
                  <button type="button" onClick={() => {
                    updateExercise({ ...exercise, included_items: exercise.included_items.filter((_, i) => i !== idx) })
                  }} className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
            <select value="" onChange={e => {
              if (e.target.value) {
                const included = exercise.included_items || []
                if (!included.includes(e.target.value)) {
                  updateExercise({ ...exercise, included_items: [...included, e.target.value] })
                }
                e.target.value = ''
              }
            }} className={`${inputClass} w-full`}>
              <option value="">+ Add item to include...</option>
              {items.filter(i => !(exercise.included_items || []).includes(i.id)).map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
        </div>

        <Button
          onClick={() => onSave('exercise_drop_rate', exerciseConfig)}
          disabled={saving}
          className="mt-4"
        >
          {saving ? 'Saving...' : 'Save Exercise Config'}
        </Button>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Milestone Chests</h3>
        <p className="text-sm text-gray-500 mb-4">Maps milestone events to chest types (common/uncommon/rare/epic/legendary)</p>

        <div className="space-y-3">
          {Object.keys(milestone).map((eventKey) => (
            <div key={eventKey} className="flex items-center gap-3">
              <span className="w-44 text-sm text-gray-700">{eventKey.replace(/_/g, ' ')}</span>
              <select value={milestone[eventKey] || 'common'}
                onChange={e => updateMilestone({ ...milestone, [eventKey]: e.target.value })}
                className={`${inputClass} w-32`}>
                {chestTypes.map(ct => <option key={ct} value={ct}>{ct}</option>)}
              </select>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-2">
            <input type="text" placeholder="new_event_key" id="new-milestone-key"
              className={`${inputClass} w-44`} />
            <button type="button" onClick={() => {
              const input = document.getElementById('new-milestone-key')
              const key = input.value.trim().replace(/\s+/g, '_')
              if (key && !milestone[key]) {
                updateMilestone({ ...milestone, [key]: 'common' })
                input.value = ''
              }
            }} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
              <Plus size={14} /> Add Event
            </button>
          </div>
        </div>

        <Button
          onClick={() => onSave('milestone_chests', milestoneConfig)}
          disabled={saving}
          className="mt-4"
        >
          {saving ? 'Saving...' : 'Save Milestone Config'}
        </Button>
      </Card>
    </div>
  )
}

export default InventoryManagement
