import { Package, Sparkles, ArrowRight, Check } from 'lucide-react'

const rarityBadge = {
  common: 'bg-gray-200 text-gray-700',
  uncommon: 'bg-green-200 text-green-800',
  rare: 'bg-blue-200 text-blue-800',
  epic: 'bg-purple-200 text-purple-800',
}

const RecipeCard = ({ recipe, getItemQuantity, onCraft, crafting, inventory, readOnly }) => {
  const ingredients = recipe.ingredients || []

  // Check if user has all ingredients
  const canCraft = ingredients.every(ing => getItemQuantity(ing.item_id) >= ing.quantity)

  // Get item details from inventory
  const getItemDetails = (itemId) => {
    const entry = inventory.find(i => i.item_id === itemId)
    return entry?.item || null
  }

  return (
    <div className={`bg-white rounded-xl border-2 transition-all ${
      canCraft ? 'border-purple-300 shadow-md shadow-purple-100' : 'border-gray-200'
    }`}>
      <div className="p-4">
        {/* Recipe header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl flex items-center justify-center flex-shrink-0">
            {recipe.result_image_url ? (
              <img src={recipe.result_image_url} alt={recipe.name} className="w-10 h-10 object-contain" />
            ) : (
              <Sparkles className="w-7 h-7 text-purple-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-gray-900">{recipe.name}</h4>
            {recipe.description && (
              <p className="text-sm text-gray-500">{recipe.description}</p>
            )}
            <span className="inline-block text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full mt-1">
              {recipe.result_type === 'cosmetic' ? 'Exclusive Cosmetic' :
               recipe.result_type === 'xp' ? `${recipe.result_xp} XP` :
               recipe.result_type === 'item' ? 'Collectible Item' :
               `${recipe.result_gems} Gems`}
            </span>
            {recipe.max_crafts_per_user && (
              <span className="inline-block text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full mt-1 ml-1">
                Max {recipe.max_crafts_per_user}x
              </span>
            )}
          </div>
        </div>

        {/* Ingredients */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {ingredients.map((ing, idx) => {
            const item = getItemDetails(ing.item_id)
            const owned = getItemQuantity(ing.item_id)
            const hasEnough = owned >= ing.quantity

            return (
              <div key={idx} className="flex items-center gap-1">
                {idx > 0 && <span className="text-gray-300 text-xs mx-0.5">+</span>}
                <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${
                  hasEnough ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50'
                }`}>
                  <div className="w-8 h-8 bg-white rounded flex items-center justify-center overflow-hidden">
                    {item?.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-6 h-6 object-contain" />
                    ) : (
                      <Package className="w-4 h-4 text-gray-300" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-800 leading-tight">
                      {item?.name || 'Unknown'}
                    </p>
                    <p className={`text-xs font-semibold ${hasEnough ? 'text-green-600' : 'text-red-500'}`}>
                      {owned}/{ing.quantity}
                      {hasEnough && <Check className="w-3 h-3 inline ml-0.5" />}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}

          <ArrowRight className="w-4 h-4 text-gray-400 mx-1" />

          {/* Result preview */}
          <div className="relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-purple-300 bg-purple-50">
            <div className="w-8 h-8 bg-white rounded flex items-center justify-center overflow-hidden">
              {recipe.result_image_url ? (
                <img src={recipe.result_image_url} alt="" className="w-6 h-6 object-contain" />
              ) : (
                <Sparkles className="w-4 h-4 text-purple-400" />
              )}
            </div>
            <p className="text-xs font-semibold text-purple-700">{recipe.name}</p>
            {recipe.result_quantity > 1 && (
              <span className="absolute -top-1.5 -right-1.5 bg-purple-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                x{recipe.result_quantity}
              </span>
            )}
          </div>
        </div>

        {/* Craft button */}
        {!readOnly && (
          <button
            onClick={() => onCraft(recipe.id)}
            disabled={!canCraft || crafting}
            className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
              canCraft
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 shadow-md'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {crafting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Crafting...
              </>
            ) : canCraft ? (
              <>
                <Sparkles className="w-4 h-4" />
                Craft Now
              </>
            ) : (
              'Not enough ingredients'
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default RecipeCard
