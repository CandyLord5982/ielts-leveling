import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useInventory } from '../../hooks/useInventory'
import { useAuth } from '../../hooks/useAuth'
import { usePet } from '../../hooks/usePet'
import { Package, Box, Layers, Sparkles, Egg, History, X, ChevronRight } from 'lucide-react'
import ChestOpenAnimation from './ChestOpenAnimation'
import EggOpenAnimation from '../pet/EggOpenAnimation'
import CraftingTab from './CraftingTab'
import GiftcodeRedemption from '../giftcode/GiftcodeRedemption'

import { assetUrl } from '../../hooks/useBranding';

const CLIP_CARD = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)'
const CLIP_CARD_SM = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)'
const CLIP_BTN = 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)'
const CLIP_TAB = 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)'

const NEW_THRESHOLD_MS = 2 * 60 * 60 * 1000 // 2 hours

const rarityColors = {
  common:    'border-gray-300 bg-white',
  uncommon:  'border-green-300 bg-green-50/50',
  rare:      'border-blue-300 bg-blue-50/50',
  epic:      'border-purple-300 bg-purple-50/50',
  legendary: 'border-yellow-300 bg-yellow-50/50',
}

const rarityGlow = {
  common:    '',
  uncommon:  'shadow-[0_0_8px_rgba(74,222,128,0.15)]',
  rare:      'shadow-[0_0_10px_rgba(96,165,250,0.2)]',
  epic:      'shadow-[0_0_12px_rgba(192,132,252,0.25)]',
  legendary: 'shadow-[0_0_15px_rgba(250,204,21,0.35)]',
}

const rarityBadge = {
  common:    'bg-gray-100 text-gray-600',
  uncommon:  'bg-green-100 text-green-700',
  rare:      'bg-blue-100 text-blue-700',
  epic:      'bg-purple-100 text-purple-700',
  legendary: 'bg-yellow-100 text-yellow-700',
}

const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary']

const rarityFilterColors = {
  all:       { active: 'border-blue-400 bg-blue-50 text-blue-600', dot: 'bg-blue-500' },
  common:    { active: 'border-gray-400 bg-gray-50 text-gray-600', dot: 'bg-gray-400' },
  uncommon:  { active: 'border-green-400 bg-green-50 text-green-600', dot: 'bg-green-500' },
  rare:      { active: 'border-blue-400 bg-blue-50 text-blue-600', dot: 'bg-blue-500' },
  epic:      { active: 'border-purple-400 bg-purple-50 text-purple-600', dot: 'bg-purple-500' },
  legendary: { active: 'border-yellow-400 bg-yellow-50 text-yellow-600', dot: 'bg-yellow-500' },
}

const rarityCardColors = {
  common:    'border-gray-200 bg-white',
  uncommon:  'border-green-200 bg-green-50/30',
  rare:      'border-blue-200 bg-blue-50/30',
  epic:      'border-purple-200 bg-purple-50/30',
  legendary: 'border-yellow-200 bg-yellow-50/30',
}

const rarityEggGradient = {
  common:    'from-gray-100 to-gray-200',
  uncommon:  'from-green-100 to-green-200',
  rare:      'from-blue-100 to-blue-200',
  epic:      'from-purple-100 to-purple-200',
  legendary: 'from-yellow-100 to-amber-200',
}

const rarityButtonGradient = {
  common:    'from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600',
  uncommon:  'from-green-500 to-green-600 hover:from-green-600 hover:to-green-700',
  rare:      'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700',
  epic:      'from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700',
  legendary: 'from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600',
}

const rarityGlowColor = {
  common:    'rgba(156,163,175,0.1)',
  uncommon:  'rgba(74,222,128,0.15)',
  rare:      'rgba(96,165,250,0.2)',
  epic:      'rgba(192,132,252,0.25)',
  legendary: 'rgba(250,204,21,0.3)',
}

const chestRarityStyles = {
  common:    { border: 'border-gray-200', bg: 'bg-gradient-to-br from-gray-50 to-gray-100', icon: 'text-gray-500', label: 'text-gray-500', btn: 'from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600', glow: 'rgba(156,163,175,0.1)' },
  uncommon:  { border: 'border-green-200', bg: 'bg-gradient-to-br from-green-50 to-green-100', icon: 'text-green-600', label: 'text-green-600', btn: 'from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700', glow: 'rgba(74,222,128,0.15)' },
  rare:      { border: 'border-blue-200', bg: 'bg-gradient-to-br from-blue-50 to-blue-100', icon: 'text-blue-600', label: 'text-blue-600', btn: 'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700', glow: 'rgba(96,165,250,0.2)' },
  epic:      { border: 'border-purple-200', bg: 'bg-gradient-to-br from-purple-50 to-purple-100', icon: 'text-purple-600', label: 'text-purple-600', btn: 'from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700', glow: 'rgba(192,132,252,0.2)' },
  legendary: { border: 'border-yellow-200', bg: 'bg-gradient-to-br from-yellow-50 to-amber-100', icon: 'text-yellow-600', label: 'text-yellow-600', btn: 'from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600', glow: 'rgba(250,204,21,0.25)' },
}

const isNewItem = (entry) => {
  if (!entry.obtained_at) return false
  return Date.now() - new Date(entry.obtained_at).getTime() < NEW_THRESHOLD_MS
}

/* Corner bracket decoration — subtle for white theme */
const CornerBrackets = () => (
  <>
    <div className="absolute top-0 left-[10px] w-5 h-[1px] bg-gradient-to-r from-blue-300/40 to-transparent" />
    <div className="absolute top-0 left-[10px] w-[1px] h-5 bg-gradient-to-b from-blue-300/40 to-transparent" />
    <div className="absolute bottom-0 right-[10px] w-5 h-[1px] bg-gradient-to-l from-blue-300/40 to-transparent" />
    <div className="absolute bottom-0 right-[10px] w-[1px] h-5 bg-gradient-to-t from-blue-300/40 to-transparent" />
  </>
)

/* Empty state component */
const EmptyState = ({ icon: Icon, title, description }) => (
  <div
    className="relative bg-white border border-gray-200 p-12 text-center overflow-hidden shadow-sm"
    style={{ clipPath: CLIP_CARD }}
  >
    <CornerBrackets />
    <Icon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
    <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
    <p className="text-gray-400 text-sm">{description}</p>
  </div>
)

/* "NEW" pulse badge */
const NewBadge = () => (
  <div className="absolute top-1 left-1 z-10">
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
    </span>
  </div>
)

/* Item detail modal */
const ItemDetailModal = ({ entry, onClose }) => {
  if (!entry) return null
  const item = entry.item
  const rarity = item.rarity || 'common'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className={`relative w-full max-w-sm bg-white border-2 overflow-hidden shadow-xl ${rarityColors[rarity]?.split(' ')[0] || 'border-gray-300'}`}
        style={{
          clipPath: 'polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px)',
          boxShadow: `0 20px 60px rgba(0,0,0,0.15), 0 0 20px ${rarityGlowColor[rarity]}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top rarity line */}
        <div className={`absolute top-0 left-[16px] right-0 h-[2px] bg-gradient-to-r ${
          rarity === 'legendary' ? 'from-yellow-400 to-transparent' :
          rarity === 'epic' ? 'from-purple-400 to-transparent' :
          rarity === 'rare' ? 'from-blue-400 to-transparent' :
          rarity === 'uncommon' ? 'from-green-400 to-transparent' :
          'from-gray-300 to-transparent'
        }`} />

        {/* Corner brackets */}
        <div className="absolute top-0 left-[16px] w-6 h-[1px] bg-gradient-to-r from-blue-300/50 to-transparent" />
        <div className="absolute top-0 left-[16px] w-[1px] h-6 bg-gradient-to-b from-blue-300/50 to-transparent" />
        <div className="absolute bottom-0 right-[16px] w-6 h-[1px] bg-gradient-to-l from-blue-300/50 to-transparent" />
        <div className="absolute bottom-0 right-[16px] w-[1px] h-6 bg-gradient-to-t from-blue-300/50 to-transparent" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Image */}
        <div className="p-6 pb-4">
          <div
            className="w-full aspect-square bg-gray-50 flex items-center justify-center overflow-hidden mx-auto max-w-[200px] border border-gray-100"
            style={{ clipPath: CLIP_CARD }}
          >
            {item.image_url ? (
              <img src={item.image_url} alt={item.name} className="w-full h-full object-contain p-4" />
            ) : (
              <Package className="w-16 h-16 text-gray-300" />
            )}
          </div>
        </div>

        {/* Info */}
        <div className="px-6 pb-6 text-center">
          <span className={`inline-block px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider mb-2 ${rarityBadge[rarity]}`}
                style={{ clipPath: CLIP_BTN }}>
            {rarity}
          </span>
          <h2 className="text-xl font-bold text-gray-900 mb-1">{item.name}</h2>
          {item.set_name && (
            <p className="text-xs text-blue-500 uppercase tracking-wider mb-2">Set: {item.set_name}</p>
          )}
          {item.description && (
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{item.description}</p>
          )}
          <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-gray-100">
            <div className="text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Qty</p>
              <p className="text-lg font-bold text-gray-900">{entry.quantity}</p>
            </div>
            <div className="w-[1px] h-8 bg-gray-100" />
            <div className="text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Type</p>
              <p className="text-sm font-medium text-gray-600 capitalize">{item.item_type || 'item'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* Rarity filter bar */
const RarityFilter = ({ value, onChange, counts }) => (
  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
    {['all', ...rarityOrder].map(r => {
      const isActive = value === r
      const fc = rarityFilterColors[r]
      const count = r === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[r] || 0)
      return (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all border flex-shrink-0 ${
            isActive ? fc.active : 'border-gray-200 bg-transparent text-gray-400 hover:text-gray-500 hover:border-gray-300'
          }`}
          style={{ clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)' }}
        >
          <span className={`w-2 h-2 rounded-full ${isActive ? fc.dot : 'bg-gray-300'}`} />
          {r === 'all' ? 'All' : r}
          <span className={`text-[9px] ${isActive ? 'opacity-70' : 'opacity-40'}`}>({count})</span>
        </button>
      )
    })}
  </div>
)

const Inventory = () => {
  const { refreshProfile } = useAuth()
  const {
    inventory,
    unopenedChests,
    recipes,
    craftHistory,
    loading,
    openChest,
    craftRecipe,
    getItemQuantity,
    getEggsInInventory,
    fetchInventory,
    newCounts,
    markTabViewed,
    craftResult: craftResultFromHook,
    clearCraftResult,
  } = useInventory()
  const { openEgg, allPets } = usePet()

  const [activeTab, setActiveTab] = useState('items')
  const [rarityFilter, setRarityFilter] = useState('all')
  const [selectedItem, setSelectedItem] = useState(null)

  useEffect(() => {
    markTabViewed(activeTab)
  }, [activeTab])
  const [chestResult, setChestResult] = useState(null)
  const [openingChest, setOpeningChest] = useState(null)
  const [craftingId, setCraftingId] = useState(null)
  const [openingEggResult, setOpeningEggResult] = useState(null)
  const [openingEggRarity, setOpeningEggRarity] = useState(null)
  const [showCraftFail, setShowCraftFail] = useState(false)
  const [showCraftSuccess, setShowCraftSuccess] = useState(false)
  const audioPlayedRef = useRef(false)

  useEffect(() => {
    if (craftResultFromHook?.craft_failed && !audioPlayedRef.current) {
      audioPlayedRef.current = true
      setShowCraftFail(true)
      const audio = new Audio(assetUrl('/sound/craft_fail.mp3'))
      audio.volume = 0.5
      audio.play().catch(() => {})
      const timer = setTimeout(() => {
        setShowCraftFail(false)
        audioPlayedRef.current = false
        clearCraftResult()
      }, 2000)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [craftResultFromHook?.craft_failed])

  useEffect(() => {
    if (craftResultFromHook?.success && !audioPlayedRef.current) {
      audioPlayedRef.current = true
      setShowCraftSuccess(true)
      const audio = new Audio(assetUrl('/sound/craft_success.mp3'))
      audio.volume = 0.5
      audio.play().catch(() => {})
      const timer = setTimeout(() => {
        setShowCraftSuccess(false)
        audioPlayedRef.current = false
        clearCraftResult()
      }, 2000)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [craftResultFromHook?.success])

  const myEggs = getEggsInInventory()

  const allItems = useMemo(() =>
    inventory.filter(e => e.item && e.item.item_type !== 'egg'),
    [inventory]
  )

  const rarityCounts = useMemo(() => {
    const c = {}
    allItems.forEach(e => {
      const r = e.item.rarity || 'common'
      c[r] = (c[r] || 0) + 1
    })
    return c
  }, [allItems])

  const groupedInventory = useMemo(() => {
    const groups = {}
    allItems.forEach(entry => {
      if (rarityFilter !== 'all' && entry.item.rarity !== rarityFilter) return
      const group = entry.item.set_name || 'Other'
      if (!groups[group]) groups[group] = []
      groups[group].push(entry)
    })
    return groups
  }, [allItems, rarityFilter])

  const handleOpenChest = async (userChest) => {
    setOpeningChest(userChest)
    const result = await openChest(userChest.id)
    if (result?.success) {
      setChestResult(result)
    } else {
      setOpeningChest(null)
      alert(result?.error || 'Failed to open chest')
    }
  }

  const handleCloseChestAnimation = () => {
    setChestResult(null)
    setOpeningChest(null)
  }

  const handleCraft = async (recipeId) => {
    setCraftingId(recipeId)
    await craftRecipe(recipeId)
    setCraftingId(null)
  }

  const handleOpenEgg = async (egg) => {
    setOpeningEggRarity(egg.item?.rarity || egg.rarity)
    const result = await openEgg(egg.item_id || egg.id)

    if (result.success) {
      setOpeningEggResult(result)
      await fetchInventory()
      if (refreshProfile) await refreshProfile()
    } else {
      setOpeningEggRarity(null)
      alert(result.error || 'Failed to open egg')
    }
  }

  const handleEggAnimationClose = () => {
    setOpeningEggResult(null)
    setOpeningEggRarity(null)
  }

  const handleEggNickname = async (nickname) => {
    if (!openingEggResult?.user_pet_id || !nickname) return
    try {
      const { supabase } = await import('../../supabase/client')
      await supabase
        .from('user_pets')
        .update({ nickname })
        .eq('id', openingEggResult.user_pet_id)
    } catch (error) {
      console.error('Error setting nickname:', error)
    }
  }

  const tabs = [
    { id: 'items', label: 'Items', icon: Package, count: allItems.length, newCount: newCounts.items },
    { id: 'eggs', label: 'Eggs', icon: Egg, count: myEggs.reduce((sum, e) => sum + e.quantity, 0), newCount: newCounts.eggs },
    { id: 'chests', label: 'Chests', icon: Box, count: unopenedChests.length, newCount: newCounts.chests },
    { id: 'crafting', label: 'Craft', icon: Layers, count: recipes.length },
    { id: 'history', label: 'Log', icon: History, count: craftHistory.length },
  ]

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-blue-300/50 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
          </div>
          <p className="text-gray-400 mt-6 text-sm tracking-wider">
            Loading inventory...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-24 md:pb-8 relative">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Inventory
          </h1>
          <GiftcodeRedemption />
        </div>
        <div className="w-16 h-[2px] bg-gradient-to-r from-blue-500 to-transparent" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setRarityFilter('all') }}
            className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-all duration-300 flex-shrink-0 border ${
              activeTab === tab.id
                ? 'bg-white border-blue-300 text-blue-600 shadow-sm'
                : 'bg-gray-50/50 border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
            }`}
            style={{
              clipPath: CLIP_TAB,
            }}
          >
            {tab.newCount > 0 && activeTab !== tab.id && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.4)]" />
            )}
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-[10px] px-1 py-0.5 rounded-sm ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
              }`}>
                {tab.count}
              </span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-blue-500 to-blue-400" />
            )}
          </button>
        ))}
      </div>

      {/* ===== MY ITEMS TAB ===== */}
      {activeTab === 'items' && (
        <div className="space-y-4">
          <RarityFilter value={rarityFilter} onChange={setRarityFilter} counts={rarityCounts} />

          {Object.keys(groupedInventory).length === 0 ? (
            <EmptyState
              icon={Package}
              title={rarityFilter !== 'all' ? `No ${rarityFilter} items` : 'No items yet'}
              description={rarityFilter !== 'all' ? 'Try a different filter!' : 'Complete exercises to earn collectible items!'}
            />
          ) : (
            Object.entries(groupedInventory).map(([setName, entries]) => {
              const allSetItems = allItems.filter(e => (e.item.set_name || 'Other') === setName)
              const uniqueCount = allSetItems.length

              return (
                <div key={setName}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-[2px] bg-blue-400/50 rounded" />
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{setName}</h3>
                    <span className="flex-1 h-[1px] bg-gray-200" />
                    <span className="text-[10px] font-mono text-gray-400">{uniqueCount} collected</span>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                    {entries.map(entry => {
                      const isNew = isNewItem(entry)
                      return (
                        <div
                          key={entry.id}
                          className={`relative border p-2 transition-all duration-300 hover:scale-105 hover:shadow-md overflow-hidden cursor-pointer group ${rarityColors[entry.item.rarity]} ${rarityGlow[entry.item.rarity]}`}
                          style={{ clipPath: CLIP_CARD_SM }}
                          onClick={() => setSelectedItem(entry)}
                        >
                          {isNew && <NewBadge />}

                          <div className="absolute top-0 left-[6px] w-3 h-[1px] bg-gradient-to-r from-blue-300/30 to-transparent" />
                          <div className="absolute bottom-0 right-[6px] w-3 h-[1px] bg-gradient-to-l from-blue-300/30 to-transparent" />

                          <div
                            className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden mb-1.5 border border-gray-100/50"
                            style={{ clipPath: CLIP_CARD_SM }}
                          >
                            {entry.item.image_url ? (
                              <img src={entry.item.image_url} alt={entry.item.name} className="w-full h-full object-contain p-1" />
                            ) : (
                              <Package className="w-6 h-6 text-gray-300" />
                            )}
                          </div>
                          <p className="text-[10px] font-medium text-gray-800 truncate text-center leading-tight">{entry.item.name}</p>
                          <div className="flex items-center justify-center mt-0.5">
                            <span className={`text-[8px] px-1 py-px ${rarityBadge[entry.item.rarity]}`}
                                  style={{ clipPath: 'polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)' }}>
                              {entry.item.rarity}
                            </span>
                          </div>

                          {entry.quantity > 1 && (
                            <div className="absolute top-0.5 right-0.5 bg-blue-500 text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
                              {entry.quantity}
                            </div>
                          )}

                          <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-end justify-center pb-0.5">
                            <ChevronRight className="w-3 h-3 text-blue-400/50" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ===== EGGS TAB ===== */}
      {activeTab === 'eggs' && (
        <div>
          {myEggs.length === 0 ? (
            <EmptyState icon={Egg} title="No eggs yet" description="Buy eggs from the shop, earn them from exercises, chests, or crafting!" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {myEggs
                .sort((a, b) => rarityOrder.indexOf(a.item?.rarity) - rarityOrder.indexOf(b.item?.rarity))
                .map(entry => {
                  const egg = entry.item
                  if (!egg) return null
                  const isLegendary = egg.rarity === 'legendary'
                  const isEpic = egg.rarity === 'epic'
                  const isNew = isNewItem(entry)

                  return (
                    <div
                      key={entry.id}
                      className={`relative border-2 p-5 transition-all duration-300 overflow-hidden group shadow-sm hover:shadow-lg ${rarityCardColors[egg.rarity]}`}
                      style={{
                        clipPath: CLIP_CARD,
                        boxShadow: `0 2px 10px ${rarityGlowColor[egg.rarity]}`,
                      }}
                    >
                      <CornerBrackets />
                      {isNew && <NewBadge />}

                      {entry.quantity > 1 && (
                        <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center shadow-sm z-10">
                          {entry.quantity}
                        </div>
                      )}

                      <span className={`inline-block px-2 py-0.5 text-[10px] font-bold mb-3 ${rarityBadge[egg.rarity]}`}
                            style={{ clipPath: 'polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)' }}>
                        {egg.rarity.toUpperCase()}
                      </span>

                      <div className="flex justify-center mb-3 cursor-pointer" onClick={() => setSelectedItem(entry)}>
                        <div
                          className={`w-28 h-28 sm:w-32 sm:h-32 bg-gradient-to-br ${rarityEggGradient[egg.rarity]} flex items-center justify-center relative rounded-xl`}
                        >
                          <div
                            className="w-3/4 h-3/4"
                            style={{
                              animation: (isLegendary || isEpic) ? 'eggWobble 2s ease-in-out infinite' : 'eggFloat 3s ease-in-out infinite',
                            }}
                          >
                            {egg.image_url ? (
                              <img src={egg.image_url} alt={egg.name} className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-5xl block text-center">🥚</span>
                            )}
                          </div>
                          {(isLegendary || isEpic) && (
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent animate-[shimmer_3s_infinite] rounded-xl" />
                          )}
                        </div>
                      </div>

                      <h3 className="text-sm font-bold text-gray-800 mb-3 text-center">{egg.name}</h3>

                      <div className="flex items-center justify-center gap-1 mb-3">
                        <span className="text-[9px] text-gray-400 uppercase tracking-wider">Contains:</span>
                        <div className="flex gap-0.5">
                          {['?', '?', '?'].map((_, i) => (
                            <div key={i} className="w-4 h-4 rounded-sm bg-gray-100 border border-gray-200 flex items-center justify-center">
                              <span className="text-[8px] text-gray-400">?</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenEgg(entry)}
                        className={`w-full py-2.5 bg-gradient-to-r ${rarityButtonGradient[egg.rarity]} text-white font-bold transition-all text-sm tracking-wider uppercase flex items-center justify-center gap-2`}
                        style={{ clipPath: CLIP_BTN }}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Hatch
                      </button>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* ===== CHESTS TAB ===== */}
      {activeTab === 'chests' && (
        <div className="space-y-4">
          {unopenedChests.length === 0 ? (
            <EmptyState icon={Box} title="No chests to open" description="Complete sessions and milestones to earn chests!" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {unopenedChests.map(uc => {
                const rs = chestRarityStyles[uc.chest?.chest_type] || chestRarityStyles.common
                const chestType = uc.chest?.chest_type || 'common'
                const itemCount = uc.chest?.items_per_open || 3

                return (
                  <div
                    key={uc.id}
                    className={`relative bg-white border-2 ${rs.border} p-5 transition-all duration-300 hover:shadow-lg overflow-hidden shadow-sm`}
                    style={{
                      clipPath: CLIP_CARD,
                    }}
                  >
                    <CornerBrackets />

                    <div
                      className="flex justify-center mb-4 cursor-pointer"
                      onClick={() => setSelectedItem({
                        item: {
                          name: uc.chest?.name || 'Chest',
                          image_url: uc.chest?.image_url,
                          rarity: chestType,
                          description: uc.chest?.description,
                          item_type: 'chest',
                        },
                        quantity: 1,
                      })}
                    >
                      <div
                        className={`w-24 h-24 ${rs.bg} flex items-center justify-center rounded-xl`}
                        style={{
                          animation: 'eggFloat 3s ease-in-out infinite',
                        }}
                      >
                        {uc.chest?.image_url ? (
                          <img src={uc.chest.image_url} alt={uc.chest.name} className="w-16 h-16 object-contain" />
                        ) : (
                          <Box className={`w-10 h-10 ${rs.icon}`} />
                        )}
                      </div>
                    </div>

                    <div className="text-center mb-4">
                      <h4 className="font-bold text-gray-900 text-lg">{uc.chest?.name || 'Chest'}</h4>
                      <p className={`text-xs font-medium capitalize ${rs.label} mt-0.5`}>
                        {chestType}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">From: {uc.source}</p>
                    </div>

                    <div className="flex items-center justify-center gap-2 mb-4">
                      <span className="text-[9px] text-gray-400 uppercase tracking-wider">Drops {itemCount}x</span>
                      <div className="flex gap-1">
                        {rarityOrder.map(r => (
                          <div key={r} className={`w-2 h-2 rounded-full ${rarityFilterColors[r].dot} opacity-50`}
                               title={r} />
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenChest(uc)}
                      disabled={!!openingChest}
                      className={`w-full bg-gradient-to-r ${rs.btn} text-white font-bold py-3 transition-all disabled:opacity-50 flex items-center justify-center gap-2 tracking-wider uppercase text-sm shadow-sm`}
                      style={{ clipPath: CLIP_BTN }}
                    >
                      <Sparkles className="w-4 h-4" />
                      Open
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== CRAFTING TAB ===== */}
      {activeTab === 'crafting' && (
        <CraftingTab
          recipes={recipes}
          inventory={inventory}
          getItemQuantity={getItemQuantity}
          onCraft={handleCraft}
          craftingId={craftingId}
        />
      )}

      {/* ===== HISTORY TAB ===== */}
      {activeTab === 'history' && (
        <div className="space-y-2">
          {craftHistory.length === 0 ? (
            <EmptyState icon={History} title="No crafts yet" description="Items you craft will appear here." />
          ) : (
            craftHistory.map(craft => {
              const recipe = craft.recipe
              if (!recipe) return null
              return (
                <div
                  key={craft.id}
                  className="relative bg-white border border-gray-200 p-3 flex items-center gap-3 overflow-hidden shadow-sm"
                  style={{ clipPath: CLIP_CARD }}
                >
                  <div className="absolute top-[10px] left-0 w-[2px] h-[calc(100%-10px)] bg-gradient-to-b from-purple-400/40 via-blue-300/20 to-transparent" />

                  <div
                    className="w-12 h-12 bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center flex-shrink-0 border border-purple-100"
                    style={{ clipPath: CLIP_CARD_SM }}
                  >
                    {recipe.result_image_url ? (
                      <img src={recipe.result_image_url} alt={recipe.name} className="w-8 h-8 object-contain" />
                    ) : (
                      <Sparkles className="w-5 h-5 text-purple-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{recipe.name}</p>
                    <p className="text-xs text-gray-400">
                      {recipe.result_type === 'xp' && `+${recipe.result_xp} XP`}
                      {recipe.result_type === 'gems' && `+${recipe.result_gems} Gems`}
                      {recipe.result_type === 'cosmetic' && 'Cosmetic'}
                    </p>
                  </div>
                  <div className="text-[10px] text-gray-400 flex-shrink-0 text-right">
                    {new Date(craft.crafted_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                    <br />
                    <span className="text-gray-300">
                      {new Date(craft.crafted_at).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Item Detail Modal */}
      {selectedItem && createPortal(
        <ItemDetailModal entry={selectedItem} onClose={() => setSelectedItem(null)} />,
        document.body
      )}

      {/* Chest Open Animation Modal */}
      {chestResult && (
        <ChestOpenAnimation
          result={chestResult}
          chestType={openingChest?.chest?.chest_type}
          onClose={handleCloseChestAnimation}
        />
      )}

      {/* Egg Open Animation Modal */}
      {openingEggResult && (
        <EggOpenAnimation
          result={openingEggResult}
          eggRarity={openingEggRarity}
          allPets={allPets}
          onClose={handleEggAnimationClose}
          onNickname={handleEggNickname}
        />
      )}

      {/* Craft Failure Animation */}
      {showCraftFail && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50" style={{ minHeight: '100dvh' }}>
          <p
            className="text-4xl font-bold text-red-500 bg-white/80 px-8 py-4 shadow-lg"
            style={{
              textShadow: '0 2px 10px rgba(239, 68, 68, 0.3)',
              animation: 'fadeInUp 0.3s ease-out',
              clipPath: CLIP_BTN,
            }}
          >
            Thất bại T_T
          </p>
          <style>{`
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(30px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}

      {/* Craft Success Animation */}
      {showCraftSuccess && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50" style={{ minHeight: '100dvh' }}>
          <p
            className="text-3xl font-bold text-green-500 bg-white/80 px-8 py-4 shadow-lg"
            style={{
              textShadow: '0 2px 10px rgba(34, 197, 94, 0.3)',
              animation: 'fadeInUp 0.3s ease-out',
              clipPath: CLIP_BTN,
            }}
          >
            Thành công ( ﾉ･o･ )ﾉ
          </p>
          <style>{`
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(30px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}

      {/* Egg animations */}
      <style>{`
        @keyframes eggWobble {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          15% { transform: rotate(-3deg) translateY(-2px); }
          30% { transform: rotate(3deg) translateY(-1px); }
          45% { transform: rotate(-2deg) translateY(-3px); }
          60% { transform: rotate(2deg) translateY(-1px); }
          75% { transform: rotate(-1deg) translateY(-2px); }
        }
        @keyframes eggFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>

    </div>
  )
}

export default Inventory
