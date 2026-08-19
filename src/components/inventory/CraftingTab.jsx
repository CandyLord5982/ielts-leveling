import { useState } from 'react'
import { Layers, BookOpen } from 'lucide-react'
import CraftingTable from './CraftingTable'
import RecipeBook from './RecipeBook'

const CraftingTab = ({ recipes, inventory, getItemQuantity, onCraft, craftingId }) => {
  const [subTab, setSubTab] = useState('table')

  // When user clicks "Fill Table" on a recipe in the book, switch to table
  // (The actual slot-filling would require lifting state; for now just switch tabs)
  const handleSelectRecipe = () => {
    setSubTab('table')
  }

  const subTabs = [
    { id: 'table', label: 'Crafting Table', icon: Layers },
    { id: 'book', label: 'Recipe Book', icon: BookOpen },
  ]

  return (
    <div className="space-y-4">
      {/* Sub-tab toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              subTab === tab.id
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === 'table' && (
        <CraftingTable
          recipes={recipes}
          inventory={inventory}
          getItemQuantity={getItemQuantity}
          onCraft={onCraft}
          crafting={!!craftingId}
        />
      )}

      {subTab === 'book' && (
        <RecipeBook
          recipes={recipes}
          inventory={inventory}
          getItemQuantity={getItemQuantity}
          onCraft={onCraft}
          craftingId={craftingId}
          onSelectRecipe={handleSelectRecipe}
        />
      )}
    </div>
  )
}

export default CraftingTab
