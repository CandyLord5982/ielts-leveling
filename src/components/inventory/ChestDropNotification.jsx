import { useEffect, useState } from 'react'
import { useInventory } from '../../hooks/useInventory'
import { X } from 'lucide-react'

const ChestDropNotification = () => {
  const { fetchUnopenedChests } = useInventory()
  const [chest, setChest] = useState(null)
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const handleChest = (e) => {
      setChest(e.detail)
      fetchUnopenedChests()
    }
    window.addEventListener('chest-earned', handleChest)
    return () => window.removeEventListener('chest-earned', handleChest)
  }, [fetchUnopenedChests])

  useEffect(() => {
    if (chest) {
      setVisible(true)
      setLeaving(false)

      const timer = setTimeout(() => {
        setLeaving(true)
        setTimeout(() => {
          setVisible(false)
          setChest(null)
        }, 500)
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [chest])

  if (!visible || !chest) return null

  const dismiss = () => {
    setLeaving(true)
    setTimeout(() => {
      setVisible(false)
      setChest(null)
    }, 300)
  }

  const rarityStyles = {
    common: { gradient: 'from-gray-100 to-gray-200', border: 'border-gray-400', text: 'text-gray-600', bold: 'text-gray-800' },
    uncommon: { gradient: 'from-green-100 to-emerald-200', border: 'border-green-400', text: 'text-green-600', bold: 'text-green-800' },
    rare: { gradient: 'from-blue-100 to-indigo-200', border: 'border-blue-400', text: 'text-blue-600', bold: 'text-blue-800' },
    epic: { gradient: 'from-purple-100 to-violet-200', border: 'border-purple-400', text: 'text-purple-600', bold: 'text-purple-800' },
    legendary: { gradient: 'from-yellow-100 to-amber-200', border: 'border-yellow-400', text: 'text-yellow-600', bold: 'text-yellow-800' },
  }
  const rs = rarityStyles[chest.chest_type] || rarityStyles.common

  return (
    <div className={`fixed top-4 right-4 z-50 transition-all duration-500 ${
      leaving ? 'opacity-0 translate-x-10' : 'opacity-100 translate-x-0'
    }`}>
      <div className={`bg-gradient-to-r ${rs.gradient} border-2 ${rs.border} rounded-xl p-3 shadow-lg flex items-center gap-3 max-w-xs`}>
        <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
          {chest.chest_image_url ? (
            <img src={chest.chest_image_url} alt={chest.chest_name} className="w-10 h-10 object-contain" />
          ) : (
            <span className="text-2xl">📦</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs ${rs.text} font-medium capitalize`}>{chest.chest_type || 'common'} Chest Earned!</p>
          <p className={`text-sm font-bold ${rs.bold} truncate`}>{chest.chest_name}</p>
          <p className={`text-xs ${rs.text} opacity-75`}>Check your inventory</p>
        </div>
        <button onClick={dismiss} className="p-1 hover:bg-white hover:bg-opacity-50 rounded">
          <X className={`w-4 h-4 ${rs.text}`} />
        </button>
      </div>
    </div>
  )
}

export default ChestDropNotification
