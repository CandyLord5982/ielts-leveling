import { useEffect, useState } from 'react'
import { useInventory } from '../../hooks/useInventory'
import { Package, X } from 'lucide-react'

const rarityStyles = {
  common: { bg: 'from-gray-100 to-gray-200', border: 'border-gray-300', text: 'text-gray-700' },
  uncommon: { bg: 'from-green-100 to-green-200', border: 'border-green-400', text: 'text-green-700' },
  rare: { bg: 'from-blue-100 to-blue-200', border: 'border-blue-400', text: 'text-blue-700' },
  epic: { bg: 'from-purple-100 to-purple-200', border: 'border-purple-400', text: 'text-purple-700' },
}

const ItemDropNotification = () => {
  const { lastItemDrop, clearLastItemDrop, fetchInventory } = useInventory()
  const [dropItem, setDropItem] = useState(null)
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // Listen for custom event from useProgress (cross-context communication)
  useEffect(() => {
    const handleDrop = (e) => {
      setDropItem(e.detail)
      fetchInventory()
    }
    window.addEventListener('inventory-item-drop', handleDrop)
    return () => window.removeEventListener('inventory-item-drop', handleDrop)
  }, [fetchInventory])

  // Also react to context-based drops
  useEffect(() => {
    if (lastItemDrop) {
      setDropItem(lastItemDrop)
    }
  }, [lastItemDrop])

  // Show/hide animation
  useEffect(() => {
    if (dropItem) {
      setVisible(true)
      setLeaving(false)

      const timer = setTimeout(() => {
        setLeaving(true)
        setTimeout(() => {
          setVisible(false)
          setDropItem(null)
          clearLastItemDrop()
        }, 500)
      }, 4000)

      return () => clearTimeout(timer)
    }
  }, [dropItem])

  if (!visible || !dropItem) return null

  const style = rarityStyles[dropItem.rarity] || rarityStyles.common

  const dismiss = () => {
    setLeaving(true)
    setTimeout(() => {
      setVisible(false)
      setDropItem(null)
      clearLastItemDrop()
    }, 300)
  }

  return (
    <div className={`fixed top-4 right-4 z-50 transition-all duration-500 ${
      leaving ? 'opacity-0 translate-x-10' : 'opacity-100 translate-x-0'
    }`}>
      <div className={`bg-gradient-to-r ${style.bg} border-2 ${style.border} rounded-xl p-3 shadow-lg flex items-center gap-3 max-w-xs`}>
        <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
          {dropItem.image_url ? (
            <img src={dropItem.image_url} alt={dropItem.name} className="w-10 h-10 object-contain" />
          ) : (
            <Package className="w-6 h-6 text-gray-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 font-medium">Item Drop!</p>
          <p className={`text-sm font-bold ${style.text} truncate`}>{dropItem.name}</p>
          <p className={`text-xs capitalize ${style.text} opacity-75`}>{dropItem.rarity}</p>
        </div>
        <button onClick={dismiss} className="p-1 hover:bg-white hover:bg-opacity-50 rounded">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </div>
  )
}

export default ItemDropNotification
