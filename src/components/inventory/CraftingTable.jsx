import { useState, useMemo } from 'react'
import { Package, Sparkles, ArrowRight, X, Trash2, HelpCircle } from 'lucide-react'

const rarityBorder = {
  common: 'border-gray-300',
  uncommon: 'border-green-400',
  rare: 'border-blue-400',
  epic: 'border-purple-400',
  legendary: 'border-yellow-400',
}

const rarityBg = {
  common: 'bg-gray-50',
  uncommon: 'bg-green-50',
  rare: 'bg-blue-50',
  epic: 'bg-purple-50',
  legendary: 'bg-yellow-50',
}

const MAX_SLOTS = 6

const CraftingTable = ({ recipes, inventory, getItemQuantity, onCraft, crafting }) => {
  // slots: array of { item_id, item, quantity }
  const [slots, setSlots] = useState([])

  // Get craftable items from inventory (including eggs)
  const availableItems = useMemo(() => {
    return inventory
      .filter(entry => entry.item && entry.quantity > 0)
      .sort((a, b) => (a.item.set_name || '').localeCompare(b.item.set_name || '') || a.item.name.localeCompare(b.item.name))
  }, [inventory])

  // Calculate how many of each item are currently placed in slots
  const getPlacedQuantity = (itemId) => {
    return slots
      .filter(s => s.item_id === itemId)
      .reduce((sum, s) => sum + s.quantity, 0)
  }

  // Normalize slots into a map for matching
  const slotMap = useMemo(() => {
    const map = {}
    slots.forEach(s => {
      if (s.item_id) map[s.item_id] = (map[s.item_id] || 0) + s.quantity
    })
    return map
  }, [slots])

  // Find matching recipe
  const matchedRecipe = useMemo(() => {
    if (Object.keys(slotMap).length === 0) return null

    return recipes.find(recipe => {
      const ings = recipe.ingredients || []
      if (ings.length === 0) return false
      const ingMap = {}
      ings.forEach(i => { ingMap[i.item_id] = i.quantity })
      const slotKeys = Object.keys(slotMap)
      const ingKeys = Object.keys(ingMap)
      // All slot items must be part of this recipe (no random extras)
      if (!slotKeys.every(k => ingMap[k])) return false
      // All recipe ingredients must be present with exact quantity
      return ingKeys.every(k => slotMap[k] && slotMap[k] === ingMap[k])
    })
  }, [slotMap, recipes])

  // Check if current slots are a partial match to any recipe
  const isPartialMatch = useMemo(() => {
    if (Object.keys(slotMap).length === 0) return false
    if (matchedRecipe) return false

    return recipes.some(recipe => {
      const ings = recipe.ingredients || []
      if (ings.length === 0) return false
      const ingMap = {}
      ings.forEach(i => { ingMap[i.item_id] = i.quantity })
      // Every item in slots must be in this recipe's ingredients, and qty <= required
      return Object.entries(slotMap).every(([itemId]) => {
        return ingMap[itemId] != null
      })
    })
  }, [slotMap, recipes, matchedRecipe])

  const handleAddItem = (entry) => {
    const itemId = entry.item_id
    const owned = getItemQuantity(itemId)
    const placed = getPlacedQuantity(itemId)
    if (placed >= owned) return // can't place more than owned
    if (slots.length >= MAX_SLOTS) return // no room

    // Always add as a new slot (no stacking)
    setSlots(prev => [...prev, { item_id: itemId, item: entry.item, quantity: 1 }])
  }

  const handleRemoveSlot = (idx) => {
    setSlots(prev => prev.filter((_, i) => i !== idx))
  }

  const handleClear = () => setSlots([])

  const handleCraft = async () => {
    if (!matchedRecipe) return
    await onCraft(matchedRecipe.id)
    setSlots([])
  }

  return (
    <div className="space-y-5">
      {/* Crafting Area */}
      <div className="bg-white rounded-2xl border-2 border-purple-200 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-5 py-3 border-b border-purple-100">
          <h3 className="font-bold text-purple-900 text-sm">Crafting Table</h3>
          <p className="text-xs text-purple-600">Select ingredients from your inventory below</p>
        </div>

        <div className="p-5">
          {/* Slots + Result */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {/* Ingredient Slots — show filled slots + 1 empty slot (up to MAX_SLOTS) */}
            {Array.from({ length: Math.min(slots.length + 1, MAX_SLOTS) }).map((_, idx) => {
              const slot = slots[idx]
              return (
                <div key={idx} className="flex items-center gap-2">
                  {idx > 0 && <span className="text-purple-300 font-bold text-lg">+</span>}
                  <button
                    onClick={() => slot && handleRemoveSlot(idx)}
                    className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-dashed transition-all flex items-center justify-center ${
                      slot
                        ? `border-solid ${rarityBorder[slot.item?.rarity] || 'border-gray-300'} ${rarityBg[slot.item?.rarity] || 'bg-gray-50'} hover:border-red-300 cursor-pointer group`
                        : 'border-gray-300 bg-gray-50'
                    }`}
                    disabled={!slot}
                    title={slot ? 'Click to remove' : 'Empty slot'}
                  >
                    {slot ? (
                      <>
                        <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                          {slot.item?.image_url ? (
                            <img src={slot.item.image_url} alt={slot.item.name} className="w-full h-full object-contain" />
                          ) : (
                            <Package className="w-6 h-6 text-gray-400" />
                          )}
                        </div>
                        {slot.quantity > 1 && (
                          <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                            {slot.quantity}
                          </span>
                        )}
                        <div className="absolute inset-0 bg-red-500 bg-opacity-0 group-hover:bg-opacity-10 rounded-xl flex items-center justify-center transition-all">
                          <X className="w-5 h-5 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-300 text-2xl font-light">?</span>
                    )}
                  </button>
                </div>
              )
            })}

            {/* Arrow */}
            <ArrowRight className="w-6 h-6 text-purple-400 mx-2 flex-shrink-0" />

            {/* Result Preview */}
            <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${
              matchedRecipe
                ? 'border-purple-400 bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg shadow-purple-200'
                : 'border-dashed border-gray-300 bg-gray-50'
            }`}>
              {matchedRecipe ? (
                <>
                  <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                    {matchedRecipe.result_image_url ? (
                      <img src={matchedRecipe.result_image_url} alt={matchedRecipe.name} className="w-full h-full object-contain" />
                    ) : (
                      <Sparkles className="w-7 h-7 text-purple-500" />
                    )}
                    {matchedRecipe.result_quantity > 1 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-purple-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        x{matchedRecipe.result_quantity}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-semibold text-purple-700 text-center px-1 truncate w-full">
                    {matchedRecipe.name}
                  </p>
                  {/* Success Rate Badge */}
                  {matchedRecipe.success_rate != null && matchedRecipe.success_rate < 100 && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${
                      matchedRecipe.success_rate >= 70 ? 'bg-green-100 text-green-700' :
                      matchedRecipe.success_rate >= 40 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {matchedRecipe.success_rate}%
                    </span>
                  )}
                </>
              ) : isPartialMatch ? (
                <>
                  <HelpCircle className="w-8 h-8 text-purple-300 animate-pulse" />
                  <p className="text-[10px] text-purple-400 font-medium">Keep going...</p>
                </>
              ) : slots.length > 0 ? (
                <>
                  <X className="w-8 h-8 text-gray-300" />
                  <p className="text-[10px] text-gray-400">No match</p>
                </>
              ) : (
                <>
                  <HelpCircle className="w-8 h-8 text-gray-300" />
                  <p className="text-[10px] text-gray-400">Result</p>
                </>
              )}
            </div>
          </div>



          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-3 mt-4">
            {slots.length > 0 && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
            <button
              onClick={handleCraft}
              disabled={!matchedRecipe || crafting}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                matchedRecipe
                  ? 'bg-purple-500 text-white hover:from-purple-700 hover:to-pink-700 shadow-md hover:shadow-lg'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {crafting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Crafting...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Craft
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Ingredient Picker */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 text-sm">Your Ingredients</h3>
          <p className="text-xs text-gray-500">Tap an item to add it to the crafting table</p>
        </div>

        <div className="p-4">
          {availableItems.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No ingredients yet. Complete exercises to earn items!</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {availableItems.map(entry => {
                const placed = getPlacedQuantity(entry.item_id)
                const remaining = entry.quantity - placed
                const isUsedUp = remaining <= 0

                return (
                  <button
                    key={entry.id}
                    onClick={() => handleAddItem(entry)}
                    disabled={isUsedUp || slots.length >= MAX_SLOTS && !slots.find(s => s.item_id === entry.item_id)}
                    className={`relative rounded-lg border-2 p-1.5 transition-all ${
                      isUsedUp
                        ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                        : `${rarityBorder[entry.item.rarity]} ${rarityBg[entry.item.rarity]} hover:scale-105 hover:shadow-md cursor-pointer`
                    }`}
                    title={`${entry.item.name} (${remaining} available)`}
                  >
                    <div className="aspect-square bg-white rounded flex items-center justify-center overflow-hidden">
                      {entry.item.image_url ? (
                        <img src={entry.item.image_url} alt={entry.item.name} className="w-full h-full object-contain" />
                      ) : (
                        <Package className="w-5 h-5 text-gray-300" />
                      )}
                    </div>
                    <p className="text-[10px] font-medium text-gray-700 truncate text-center mt-1">
                      {entry.item.name}
                    </p>
                    {/* Quantity badge */}
                    <span className={`absolute -top-1 -right-1 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow ${
                      placed > 0 ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'
                    }`}>
                      {remaining}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CraftingTable
