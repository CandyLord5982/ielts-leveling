import { useState, useMemo } from 'react'
import { Lock, Sparkles, BookOpen, ChevronDown, ChevronRight, Package, Check, ArrowRight } from 'lucide-react'

// Group key: recipes producing the same result share a key
const getResultKey = (recipe) => {
  return recipe.result_item_id || recipe.name
}

const RecipeBook = ({ recipes, inventory, getItemQuantity, onSelectRecipe }) => {
  const [expandedKeys, setExpandedKeys] = useState({})

  const categorized = useMemo(() => {
    const ownedItemIds = new Set(
      inventory.filter(e => e.quantity > 0).map(e => e.item_id)
    )

    return recipes.map(recipe => {
      const ings = recipe.ingredients || []
      const discovered = ings.some(ing => ownedItemIds.has(ing.item_id))
      const canCraft = ings.every(ing => getItemQuantity(ing.item_id) >= ing.quantity)
      const ingredientsOwned = ings.filter(ing => ownedItemIds.has(ing.item_id)).length
      return { recipe, discovered, canCraft, ingredientsOwned, totalIngredients: ings.length }
    })
  }, [recipes, inventory, getItemQuantity])

  // Group by result, separate undiscovered
  const { groups, undiscovered } = useMemo(() => {
    const groupMap = {}
    const undiscovered = []

    categorized.forEach(entry => {
      if (!entry.discovered) {
        undiscovered.push(entry)
        return
      }
      const key = getResultKey(entry.recipe)
      if (!groupMap[key]) groupMap[key] = []
      groupMap[key].push(entry)
    })

    // Sort entries within each group by total ingredient quantity (fewer first = cheaper)
    Object.values(groupMap).forEach(entries => {
      entries.sort((a, b) => {
        const aTotalQty = (a.recipe.ingredients || []).reduce((s, i) => s + i.quantity, 0)
        const bTotalQty = (b.recipe.ingredients || []).reduce((s, i) => s + i.quantity, 0)
        return aTotalQty - bTotalQty
      })
    })

    // Sort groups: any craftable first, then by discovery
    const groups = Object.entries(groupMap).sort(([, a], [, b]) => {
      const aCanCraft = a.some(e => e.canCraft)
      const bCanCraft = b.some(e => e.canCraft)
      if (aCanCraft !== bCanCraft) return bCanCraft - aCanCraft
      const aDiscovered = a.some(e => e.discovered)
      const bDiscovered = b.some(e => e.discovered)
      if (aDiscovered !== bDiscovered) return bDiscovered - aDiscovered
      return 0
    })

    return { groups, undiscovered }
  }, [categorized])

  const toggleExpand = (key) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const getItemDetails = (itemId) => {
    const entry = inventory.find(i => i.item_id === itemId)
    return entry?.item || null
  }

  if (recipes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No recipes yet</h3>
        <p className="text-gray-500">Recipes will appear here when they're added.</p>
      </div>
    )
  }

  const successRateColor = (rate) => {
    if (rate >= 70) return 'bg-green-100 text-green-700'
    if (rate >= 40) return 'bg-yellow-100 text-yellow-700'
    return 'bg-red-100 text-red-700'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen className="w-4 h-4 text-purple-600" />
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-purple-700">{categorized.filter(c => c.discovered).length}</span>
          {' / '}
          {categorized.length} recipes discovered
        </p>
      </div>

      {groups.map(([key, entries]) => {
        // Use first entry as representative for the header
        const rep = entries[0].recipe
        const anyCanCraft = entries.some(e => e.canCraft)
        const isExpanded = expandedKeys[key]

        return (
          <div
            key={key}
            className={`rounded-xl border-2 overflow-hidden transition-all ${
              anyCanCraft ? 'border-purple-300 shadow-md shadow-purple-100' : 'border-gray-200'
            }`}
          >
            {/* Result Header — always visible */}
            <button
              onClick={() => toggleExpand(key)}
              className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                anyCanCraft
                  ? 'bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100'
                  : 'bg-white hover:bg-gray-50'
              }`}
            >
              {isExpanded
                ? <ChevronDown className="w-4 h-4 text-purple-500 flex-shrink-0" />
                : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              }
              {/* Result image */}
              <div className="w-11 h-11 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl flex items-center justify-center flex-shrink-0 relative">
                {rep.result_image_url ? (
                  <img src={rep.result_image_url} alt={rep.name} className="w-8 h-8 object-contain" />
                ) : (
                  <Sparkles className="w-5 h-5 text-purple-500" />
                )}
                {rep.result_quantity > 1 && (
                  <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    x{rep.result_quantity}
                  </span>
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{rep.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                    {rep.result_type === 'cosmetic' ? 'Exclusive Cosmetic' :
                     rep.result_type === 'xp' ? `${rep.result_xp} XP` :
                     rep.result_type === 'item' ? 'Collectible Item' :
                     `${rep.result_gems} Gems`}
                  </span>
                  {anyCanCraft && (
                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                      Ready
                    </span>
                  )}
                  {entries.length > 1 && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                      {entries.length} ways
                    </span>
                  )}
                </div>
              </div>
            </button>

            {/* Expanded — Formula Variations */}
            {isExpanded && (
              <div className="bg-white border-t border-gray-100">
                {rep.description && (
                  <p className="text-xs text-gray-500 px-4 pt-3">{rep.description}</p>
                )}
                <div className="p-3 space-y-2">
                  {entries.map(({ recipe, canCraft }) => {
                    const ingredients = recipe.ingredients || []
                    const totalQty = ingredients.reduce((s, i) => s + i.quantity, 0)

                    return (
                      <div
                        key={recipe.id}
                        className={`rounded-lg border p-3 transition-all ${
                          canCraft ? 'border-green-300 bg-green-50/50' : 'border-gray-200 bg-gray-50/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          {ingredients.map((ing, idx) => {
                            const item = getItemDetails(ing.item_id)
                            const owned = getItemQuantity(ing.item_id)
                            const hasEnough = owned >= ing.quantity

                            return (
                              <div key={idx} className="flex items-center gap-1">
                                {idx > 0 && <span className="text-gray-300 text-xs">+</span>}
                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${
                                  hasEnough ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50'
                                }`}>
                                  <div className="w-6 h-6 bg-white rounded flex items-center justify-center overflow-hidden">
                                    {item?.image_url ? (
                                      <img src={item.image_url} alt={item?.name} className="w-5 h-5 object-contain" />
                                    ) : (
                                      <Package className="w-3.5 h-3.5 text-gray-300" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-medium text-gray-700 leading-tight">
                                      {item?.name || '???'}
                                    </p>
                                    <p className={`text-[10px] font-semibold ${hasEnough ? 'text-green-600' : 'text-red-500'}`}>
                                      {owned}/{ing.quantity}
                                      {hasEnough && <Check className="w-2.5 h-2.5 inline ml-0.5" />}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )
                          })}

                          {/* Spacer + success rate on the right */}
                          <div className="flex-1" />
                          {recipe.max_crafts_per_user && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full self-center">
                              Max {recipe.max_crafts_per_user}x
                            </span>
                          )}
                          {recipe.success_rate != null && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full self-center ${successRateColor(recipe.success_rate)}`}>
                              {recipe.success_rate}%
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Undiscovered recipes */}
      {undiscovered.map(({ recipe, ingredientsOwned, totalIngredients }) => (
        <div
          key={recipe.id}
          className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-5"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Lock className="w-6 h-6 text-gray-400" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-gray-400">??? Unknown Recipe</h4>
              <p className="text-sm text-gray-400">
                Collect ingredients to discover this recipe
              </p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-400 rounded-full transition-all"
                    style={{ width: `${totalIngredients > 0 ? (ingredientsOwned / totalIngredients) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 font-medium">
                  {ingredientsOwned}/{totalIngredients} ingredients
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default RecipeBook
