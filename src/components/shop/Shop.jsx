import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import { useProgress } from '../../hooks/useProgress'
import { usePet } from '../../hooks/usePet'
import { useInventory } from '../../hooks/useInventory'
import { ShoppingBag, Check, Lock, ChevronLeft, ChevronRight, Eye, EyeOff, Sparkles, Package, X } from 'lucide-react'

import { assetUrl } from '../../hooks/useBranding';
const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary']

/* ── clip-path constants ── */
const CLIP_CARD = 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)'
const CLIP_BTN  = 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)'
const CLIP_TAB  = 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)'

/* ── rarity color maps ── */
const rarityCardColors = {
  common:    { border: 'border-gray-200', bg: 'bg-white', badge: 'bg-gray-100 text-gray-600', glow: 'rgba(156,163,175,0.1)' },
  uncommon:  { border: 'border-green-200', bg: 'bg-white', badge: 'bg-green-50 text-green-600', glow: 'rgba(74,222,128,0.15)' },
  rare:      { border: 'border-blue-200', bg: 'bg-white', badge: 'bg-blue-50 text-blue-600', glow: 'rgba(96,165,250,0.2)' },
  epic:      { border: 'border-purple-200', bg: 'bg-white', badge: 'bg-purple-50 text-purple-600', glow: 'rgba(192,132,252,0.25)' },
  legendary: { border: 'border-yellow-200', bg: 'bg-white', badge: 'bg-yellow-50 text-yellow-600', glow: 'rgba(250,204,21,0.3)' },
}

const rarityEggGradient = {
  common: 'from-gray-100 to-gray-200',
  uncommon: 'from-green-50 to-green-100',
  rare: 'from-blue-50 to-blue-100',
  epic: 'from-purple-50 to-purple-100',
  legendary: 'from-yellow-50 to-amber-100',
}

const rarityButtonGradient = {
  common:    'from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600',
  uncommon:  'from-green-500 to-green-600 hover:from-green-600 hover:to-green-700',
  rare:      'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700',
  epic:      'from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700',
  legendary: 'from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600',
}

/* ── Corner bracket decoration ── */
const CornerBrackets = () => (
  <>
    <div className="absolute top-0 left-[10px] w-5 h-[1px] bg-gradient-to-r from-blue-300/40 to-transparent" />
    <div className="absolute top-0 left-[10px] w-[1px] h-5 bg-gradient-to-b from-blue-300/40 to-transparent" />
    <div className="absolute bottom-0 right-[10px] w-5 h-[1px] bg-gradient-to-l from-blue-300/40 to-transparent" />
    <div className="absolute bottom-0 right-[10px] w-[1px] h-5 bg-gradient-to-t from-blue-300/40 to-transparent" />
  </>
)

/* ── Item Detail Modal ── */
const rarityGlowColor = {
  common: 'rgba(156,163,175,0.3)',
  uncommon: 'rgba(74,222,128,0.4)',
  rare: 'rgba(96,165,250,0.5)',
  epic: 'rgba(192,132,252,0.5)',
  legendary: 'rgba(250,204,21,0.6)',
}
const rarityBorderColor = {
  common: 'border-gray-300',
  uncommon: 'border-green-300',
  rare: 'border-blue-300',
  epic: 'border-purple-300',
  legendary: 'border-yellow-300',
}
const rarityGradientLine = {
  common: 'from-gray-300 via-gray-400 to-gray-300',
  uncommon: 'from-green-300 via-green-400 to-green-300',
  rare: 'from-blue-300 via-blue-400 to-blue-300',
  epic: 'from-purple-300 via-purple-400 to-purple-300',
  legendary: 'from-yellow-300 via-amber-400 to-yellow-300',
}

const ItemDetailModal = ({ item, onClose }) => {
  const rarity = item.rarity || item.item_data?.rarity || 'common'
  const rc = rarityCardColors[rarity] || rarityCardColors.common

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]" onClick={onClose}>
      <div
        className={`relative bg-white border-2 ${rarityBorderColor[rarity]} max-w-sm w-full mx-4 overflow-hidden`}
        style={{ clipPath: CLIP_CARD, boxShadow: `0 0 30px ${rarityGlowColor[rarity]}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top gradient line */}
        <div className={`h-1 w-full bg-gradient-to-r ${rarityGradientLine[rarity]}`} />

        <CornerBrackets />

        {/* Close button */}
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 z-10">
          <X className="w-5 h-5" />
        </button>

        {/* Item Image */}
        <div className="flex justify-center pt-6 pb-4 px-6">
          <div className={`w-40 h-40 bg-gradient-to-br ${rarityEggGradient[rarity]} flex items-center justify-center`}
            style={{ clipPath: CLIP_CARD }}
          >
            {item.image_url ? (
              item.category === 'background' ? (
                <div
                  className="w-full h-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${item.item_data?.background_url || item.image_url})`, clipPath: CLIP_CARD }}
                />
              ) : (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="w-3/4 h-3/4 object-contain"
                  style={item.category === 'hammer' ? { transform: 'rotate(90deg)' } : undefined}
                />
              )
            ) : (
              <Package className="w-12 h-12 text-gray-300" />
            )}
          </div>
        </div>

        {/* Details */}
        <div className="px-6 pb-6 text-center">
          {/* Rarity badge */}
          <span className={`inline-block px-3 py-0.5 text-[10px] font-semibold tracking-wider mb-2 ${rc.badge}`}
            style={{ clipPath: CLIP_TAB }}
          >
            {rarity.toUpperCase()}
          </span>

          <h2 className="text-lg font-bold text-gray-800 tracking-wide">{item.name}</h2>

          {item.item_data?.collection && (
            <p className="text-xs text-blue-500 mt-1">Set: {item.item_data.collection}</p>
          )}

          {item.description && (
            <p className="text-sm text-gray-500 mt-2">{item.description}</p>
          )}

          {/* Price & type info */}
          <div className="flex justify-center gap-6 mt-4 text-sm text-gray-500">
            {item.price != null && (
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-wider text-gray-400">Price</span>
                <span className="font-semibold text-gray-700">{item.price}</span>
              </div>
            )}
            {item.category && (
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-wider text-gray-400">Type</span>
                <span className="font-semibold text-gray-700 capitalize">{item.category}</span>
              </div>
            )}
            {item.item_data?.xp_bonus > 0 && (
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-wider text-gray-400">Bonus</span>
                <span className="font-semibold text-yellow-600">+{item.item_data.xp_bonus}% XP</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const Shop = () => {
  const [searchParams] = useSearchParams()
  const { user, profile, updateProfile, fetchUserProfile } = useAuth()
  const { spendGems, spendXP } = useProgress()
  const { buyEgg, buyBall } = usePet()
  const { inventory, fetchInventory, incrementNewCount } = useInventory()

  const [items, setItems] = useState([])
  const [purchases, setPurchases] = useState([])
  const [eggCatalog, setEggCatalog] = useState([])
  const [ballCatalog, setBallCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'avatar')
  const [purchasing, setPurchasing] = useState(null)
  const [confirmItem, setConfirmItem] = useState(null)
  const [activeCollection, setActiveCollection] = useState('all')
  const [variantIndex, setVariantIndex] = useState({}) // { [groupKey]: index }

  // Egg-specific state
  const [buyingEggId, setBuyingEggId] = useState(null)
  const [confirmEggCurrency, setConfirmEggCurrency] = useState(null) // 'gems' or 'xp' when confirmItem is an egg
  const [message, setMessage] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)

  useEffect(() => {
    if (user) {
      fetchShopData()
    }
  }, [user])

  const fetchShopData = async () => {
    try {
      setLoading(true)

      const [itemsResult, purchasesResult, eggsResult, ballsResult] = await Promise.all([
        supabase
          .from('shop_items')
          .select('*')
          .eq('is_active', true)
          .order('price'),
        supabase
          .from('user_purchases')
          .select('item_id, purchased_at')
          .eq('user_id', user.id),
        supabase
          .from('collectible_items')
          .select('*')
          .eq('item_type', 'egg')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('collectible_items')
          .select('*')
          .in('item_type', ['ball', 'ticket'])
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
      ])

      if (itemsResult.error) throw itemsResult.error
      if (purchasesResult.error) throw purchasesResult.error
      if (eggsResult.error) throw eggsResult.error

      setItems(itemsResult.data || [])
      setPurchases(purchasesResult.data || [])
      setEggCatalog(eggsResult.data || [])
      setBallCatalog(ballsResult.data || [])
    } catch (err) {
      console.error('Error fetching shop data:', err)
    } finally {
      setLoading(false)
    }
  }

  const isOwned = (itemId) => {
    return purchases.some(p => p.item_id === itemId)
  }

  const isXPItem = (item) => item.price_type === 'xp'

  const canAffordItem = (item) => {
    if (isXPItem(item)) {
      return (profile?.xp || 0) >= item.price
    }
    return (profile?.gems || 0) >= item.price
  }

  const handlePurchase = (item) => {
    if (purchasing || isOwned(item.id)) return

    if (!canAffordItem(item)) {
      alert(isXPItem(item) ? 'Bạn không đủ XP!' : 'Bạn không đủ gems!')
      return
    }

    setConfirmItem(item)
  }

  const confirmPurchase = async () => {
    const item = confirmItem
    if (!item) return
    setConfirmItem(null)
    setPurchasing(item.id)

    try {
      // Deduct currency based on price type
      const result = isXPItem(item)
        ? await spendXP(item.price)
        : await spendGems(item.price)
      if (!result.success) {
        alert(result.error || 'Không thể mua vật phẩm')
        return
      }

      // Record purchase
      const { error } = await supabase
        .from('user_purchases')
        .insert({
          user_id: user.id,
          item_id: item.id
        })

      if (error) throw error

      // Play purchase sound
      new Audio(assetUrl('/sound/shop-purchase.mp3')).play().catch(() => {})

      // Refresh purchases
      setPurchases(prev => [...prev, { item_id: item.id, purchased_at: new Date().toISOString() }])
    } catch (err) {
      console.error('Error purchasing item:', err)
      alert('Lỗi khi mua vật phẩm: ' + (err.message || 'Unknown error'))
    } finally {
      setPurchasing(null)
    }
  }

  // Egg purchase handlers
  const handleConfirmEggPurchase = async () => {
    if (!confirmItem || !confirmEggCurrency) return

    const egg = confirmItem
    const currency = confirmEggCurrency
    setBuyingEggId(egg.id)
    setConfirmItem(null)
    setConfirmEggCurrency(null)

    const result = await buyEgg(egg.id, currency)

    if (result.success) {
      new Audio(assetUrl('/sound/shop-purchase.mp3')).play().catch(() => {})
      const spentText = currency === 'xp'
        ? `-${result.xp_spent} XP`
        : `-${result.gems_spent} gems`
      setMessage({ type: 'success', text: `Bought ${result.egg_name}! (${spentText})` })
      await fetchInventory()
      incrementNewCount('eggs')
      if (user) await fetchUserProfile(user.id)
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to buy egg' })
    }

    setBuyingEggId(null)
    setTimeout(() => setMessage(null), 3000)
  }

  // Ball purchase handler
  const handleConfirmBallPurchase = async () => {
    if (!confirmItem || !confirmEggCurrency) return

    const ball = confirmItem
    const currency = confirmEggCurrency
    setBuyingEggId(ball.id)
    setConfirmItem(null)
    setConfirmEggCurrency(null)

    const result = await buyBall(ball.id, currency)

    if (result.success) {
      new Audio(assetUrl('/sound/shop-purchase.mp3')).play().catch(() => {})
      const spentText = currency === 'xp'
        ? `-${result.xp_spent} XP`
        : `-${result.gems_spent} gems`
      setMessage({ type: 'success', text: `Bought ${result.ball_name}! (${spentText})` })
      await fetchInventory()
      incrementNewCount('items')
      if (user) await fetchUserProfile(user.id)
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to buy ball' })
    }

    setBuyingEggId(null)
    setTimeout(() => setMessage(null), 3000)
  }

  const handleToggleHideFrame = async () => {
    try {
      await updateProfile({ hide_frame: !profile?.hide_frame })
    } catch (err) {
      console.error('Error toggling frame visibility:', err)
    }
  }

  const handleEquip = async (item) => {
    try {
      if (item.category === 'avatar') {
        const avatarUrl = item.item_data?.avatar_url || item.image_url
        await updateProfile({ avatar_url: avatarUrl })
        alert('Đã trang bị avatar!')
      } else if (item.category === 'frame') {
        const frameUrl = item.image_url
        const frameRatio = item.item_data?.avatar_ratio || 66
        await updateProfile({ active_title: frameUrl, active_frame_ratio: frameRatio, hide_frame: false })
        alert('Đã trang bị khung!')
      } else if (item.category === 'background') {
        const { data, error } = await supabase.rpc('equip_background', {
          p_user_id: user.id,
          p_item_id: item.id
        })
        if (error) throw error
        if (data.success) {
          await updateProfile({ active_background_url: data.background_url })
          alert('Đã trang bị background!')
        } else {
          alert(data.error || 'Không thể trang bị background')
        }
      } else if (item.category === 'pet') {
        const bowlUrl = item.item_data?.bowl_url || item.image_url
        await updateProfile({ active_bowl_url: bowlUrl })
        alert('Đã trang bị bowl!')
      } else if (item.category === 'spaceship') {
        await updateProfile({ active_spaceship_url: item.image_url, active_spaceship_laser: item.item_data?.laser_color || null })
        alert('Đã trang bị spaceship!')
      } else if (item.category === 'boat') {
        await updateProfile({ active_boat_url: item.image_url })
        alert('Đã trang bị boat!')
      } else if (item.category === 'hammer') {
        await updateProfile({ active_hammer_url: item.image_url })
        alert('Đã trang bị hammer!')
      }
    } catch (err) {
      console.error('Error equipping item:', err)
      alert('Lỗi khi trang bị: ' + (err.message || 'Unknown error'))
    }
  }

  const categories = [
    { key: 'avatar', label: 'Avatar' },
        { key: 'ball', label: 'Adventure' },
    { key: 'frame', label: 'Frame' },
    { key: 'background', label: 'Background' },
    { key: 'pet', label: 'Pet bowl' },
    { key: 'spaceship', label: 'Spaceship' },
    { key: 'hammer', label: 'Hammer' },
    { key: 'boat', label: 'Boat' },


    // { key: 'egg', label: 'Egg' },
    // { key: 'school', label: 'School things' },
  ]


//Item nào hiện nút trang bị
  const equippableCategories = ['avatar', 'frame', 'background', 'pet', 'spaceship', 'boat', 'hammer']

  const isEquipped = (item) => {
    if (item.category === 'avatar') {
      const avatarUrl = item.item_data?.avatar_url || item.image_url
      return profile?.avatar_url === avatarUrl
    }
    if (item.category === 'frame') {
      return profile?.active_title === item.image_url
    }
    if (item.category === 'background') {
      const backgroundUrl = item.item_data?.background_url || item.image_url
      return profile?.active_background_url === backgroundUrl
    }
    if (item.category === 'pet') {
      const bowlUrl = item.item_data?.bowl_url || item.image_url
      return profile?.active_bowl_url === bowlUrl
    }
    if (item.category === 'spaceship') {
      return profile?.active_spaceship_url === item.image_url
    }
    if (item.category === 'boat') {
      return profile?.active_boat_url === item.image_url
    }
    if (item.category === 'hammer') {
      return profile?.active_hammer_url === item.image_url
    }
    return false
  }
  // Reset collection when switching category tabs
  useEffect(() => {
    setActiveCollection('all')
  }, [activeTab])

  const filteredItems = items
    .filter(item => item.category === activeTab)
    .sort((a, b) => {
      if (isXPItem(a) !== isXPItem(b)) return isXPItem(a) ? -1 : 1
      return a.price - b.price
    })

  // Get unique collections for the active tab
  const collections = [...new Set(filteredItems.map(item => item.item_data?.collection).filter(Boolean))]

  const displayedItems = activeCollection === 'all'
    ? filteredItems
    : filteredItems.filter(item => item.item_data?.collection === activeCollection)

  // Group items by avatar_group (items without a group stay as single entries)
  const groupedDisplayItems = (() => {
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
    groups.sort((a, b) => {
      const aItem = a.variants[0], bItem = b.variants[0]
      if (isXPItem(aItem) !== isXPItem(bItem)) return isXPItem(aItem) ? -1 : 1
      return aItem.price - bItem.price
    })
    return groups
  })()

  const sortedEggs = eggCatalog.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity))
  const sortedBalls = ballCatalog.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity))

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center justify-center py-20">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-2 border-blue-300/30 rounded-full animate-ping" />
            <div className="absolute inset-2 border-2 border-t-blue-400 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
          </div>
          <span className="ml-4 text-gray-400 font-mono text-sm tracking-widest uppercase">Loading shop...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Message Toast */}
      {message && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 shadow-xl flex items-center gap-2 font-semibold text-sm tracking-wide ${
            message.type === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
          }`}
          style={{ clipPath: CLIP_BTN, animation: 'slideInFromTop 0.3s ease-out' }}
        >
          <Sparkles className="w-4 h-4" />
          {message.text}
          <style>{`@keyframes slideInFromTop { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src={assetUrl('/icon/navigation/shop.svg')} alt="Shop" className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight uppercase">Shop</h1>
            <div className="h-[2px] w-full bg-gradient-to-r from-blue-400 to-transparent mt-0.5" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="bg-gradient-to-r from-yellow-400 to-amber-500 text-white px-4 py-2 flex items-center gap-2 font-semibold shadow-md"
            style={{ clipPath: CLIP_BTN }}
          >
            <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-5 h-5" />
            {(profile?.xp || 0).toLocaleString()}
          </div>
          <div
            className="bg-gradient-to-r from-blue-400 to-blue-500 text-white px-4 py-2 flex items-center gap-2 font-semibold shadow-md"
            style={{ clipPath: CLIP_BTN }}
          >
            <img src={assetUrl('/image/study/gem.png')} alt="Gems" className="w-5 h-5" />
            {profile?.gems || 0}
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-2 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
        {categories.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveTab(cat.key)}
            className={`px-5 py-2 font-semibold text-sm transition-all flex-shrink-0 tracking-wide uppercase ${activeTab === cat.key
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md border border-blue-300'
                : 'bg-white text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300'
              }`}
            style={{ clipPath: CLIP_TAB }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Collection Sub-tabs */}
      {activeTab !== 'egg' && collections.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          <button
            onClick={() => setActiveCollection('all')}
            className={`px-3 py-1 text-xs font-medium transition-all flex-shrink-0 tracking-wide ${
              activeCollection === 'all'
                ? 'bg-blue-50 text-blue-600 border border-blue-200'
                : 'bg-white text-gray-400 border border-gray-100 hover:border-gray-200'
            }`}
            style={{ clipPath: CLIP_TAB }}
          >
            All
          </button>
          {collections.map(col => (
            <button
              key={col}
              onClick={() => setActiveCollection(col)}
              className={`px-3 py-1 text-xs font-medium transition-all flex-shrink-0 tracking-wide ${
                activeCollection === col
                  ? 'bg-blue-50 text-blue-600 border border-blue-200'
                  : 'bg-white text-gray-400 border border-gray-100 hover:border-gray-200'
              }`}
              style={{ clipPath: CLIP_TAB }}
            >
              {col}
            </button>
          ))}
        </div>
      )}

      {/* Ball Grid */}
      {activeTab === 'ball' ? (
        sortedBalls.length === 0 ? (
          <div
            className="relative bg-white border border-gray-200 p-12 text-center overflow-hidden shadow-sm"
            style={{ clipPath: CLIP_CARD }}
          >
            <CornerBrackets />
            <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">No balls available</h3>
            <p className="text-gray-400 text-sm">Check back later!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {sortedBalls.map(ball => {
              const rc = rarityCardColors[ball.rarity] || rarityCardColors.common
              const canAffordGems = (profile?.gems || 0) >= ball.price_gems

              return (
                <div
                  key={ball.id}
                  className={`relative border-2 ${rc.border} ${rc.bg} p-4 transition-all hover:shadow-lg overflow-hidden`}
                  style={{
                    clipPath: CLIP_CARD,
                    boxShadow: `0 0 15px ${rc.glow}`,
                  }}
                >
                  <CornerBrackets />

                  {/* Rarity Badge */}
                  <div className="flex justify-between items-start mb-3">
                    <span className={`px-2 py-0.5 text-[10px] font-semibold tracking-wider ${rc.badge}`}
                      style={{ clipPath: CLIP_TAB }}
                    >
                      {ball.rarity.toUpperCase()}
                    </span>
                  </div>

                  {/* Ball Image */}
                  <div className={`w-full aspect-square bg-gradient-to-br ${rarityEggGradient[ball.rarity]} flex items-center justify-center mb-3 cursor-pointer`}
                    style={{ clipPath: CLIP_CARD }}
                    onClick={() => setSelectedItem(ball)}
                  >
                    {ball.image_url ? (
                      <img src={ball.image_url} alt={ball.name} className="w-3/4 h-3/4 object-contain" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-b from-red-500 to-white border-4 border-gray-800 flex items-center justify-center">
                        <div className="w-5 h-5 rounded-full bg-white border-2 border-gray-800" />
                      </div>
                    )}
                  </div>

                  {/* Ball Name */}
                  <h3 className="text-sm font-semibold text-gray-800 mb-2 text-center">{ball.name}</h3>

                  {/* Buy Buttons */}
                  <div className="space-y-2">
                    {ball.price_gems > 0 && (
                      <button
                        onClick={() => { setConfirmItem(ball); setConfirmEggCurrency('gems') }}
                        disabled={buyingEggId === ball.id || !canAffordGems}
                        className={`w-full py-1.5 text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                          canAffordGems
                            ? `bg-gradient-to-r ${rarityButtonGradient[ball.rarity]} text-white`
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        } disabled:opacity-50`}
                        style={{ clipPath: CLIP_BTN }}
                      >
                        <img src={assetUrl('/image/study/gem.png')} alt="Gem" className="w-3.5 h-3.5" />
                        {buyingEggId === ball.id ? '...' : ball.price_gems}
                      </button>
                    )}

                    {ball.price_xp > 0 && (
                      <button
                        onClick={() => { setConfirmItem(ball); setConfirmEggCurrency('xp') }}
                        disabled={buyingEggId === ball.id || (profile?.xp || 0) < ball.price_xp}
                        className={`w-full py-1.5 text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                          (profile?.xp || 0) >= ball.price_xp
                            ? `bg-gradient-to-r ${rarityButtonGradient[ball.rarity]} text-white`
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        } disabled:opacity-50`}
                        style={{ clipPath: CLIP_BTN }}
                      >
                        <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3.5 h-3.5" />
                        {buyingEggId === ball.id ? '...' : ball.price_xp}
                      </button>
                    )}

                    {(!ball.price_gems || ball.price_gems <= 0) && (!ball.price_xp || ball.price_xp <= 0) && (
                      <div className="w-full py-1.5 flex items-center justify-center gap-1 text-gray-400 text-xs">
                        <Lock className="w-3 h-3" />
                        Not for sale
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : activeTab === 'egg' ? (
        sortedEggs.length === 0 ? (
          <div
            className="relative bg-white border border-gray-200 p-12 text-center overflow-hidden shadow-sm"
            style={{ clipPath: CLIP_CARD }}
          >
            <CornerBrackets />
            <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Chưa có trứng nào</h3>
            <p className="text-gray-400 text-sm">Hãy quay lại sau nhé!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {sortedEggs.map(egg => {
              const rc = rarityCardColors[egg.rarity] || rarityCardColors.common
              const canAffordGems = (profile?.gems || 0) >= egg.price_gems

              return (
                <div
                  key={egg.id}
                  className={`relative border-2 ${rc.border} ${rc.bg} p-4 transition-all hover:shadow-lg overflow-hidden`}
                  style={{
                    clipPath: CLIP_CARD,
                    boxShadow: `0 0 15px ${rc.glow}`,
                  }}
                >
                  <CornerBrackets />

                  {/* Rarity Badge */}
                  <div className="flex justify-between items-start mb-3">
                    <span className={`px-2 py-0.5 text-[10px] font-semibold tracking-wider ${rc.badge}`}
                      style={{ clipPath: CLIP_TAB }}
                    >
                      {egg.rarity.toUpperCase()}
                    </span>
                  </div>

                  {/* Egg Image */}
                  <div className={`w-full aspect-square bg-gradient-to-br ${rarityEggGradient[egg.rarity]} flex items-center justify-center mb-3 cursor-pointer`}
                    style={{ clipPath: CLIP_CARD }}
                    onClick={() => setSelectedItem(egg)}
                  >
                    {egg.image_url ? (
                      <img src={egg.image_url} alt={egg.name} className="w-3/4 h-3/4 object-contain" />
                    ) : (
                      <span className="text-4xl">🥚</span>
                    )}
                  </div>

                  {/* Egg Name */}
                  <h3 className="text-sm font-semibold text-gray-800 mb-2 text-center">{egg.name}</h3>

                  {/* Buy Buttons */}
                  <div className="space-y-2">
                    {egg.price_gems > 0 && (
                      <button
                        onClick={() => { setConfirmItem(egg); setConfirmEggCurrency('gems') }}
                        disabled={buyingEggId === egg.id || !canAffordGems}
                        className={`w-full py-1.5 text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                          canAffordGems
                            ? `bg-gradient-to-r ${rarityButtonGradient[egg.rarity]} text-white`
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        } disabled:opacity-50`}
                        style={{ clipPath: CLIP_BTN }}
                      >
                        <img src={assetUrl('/image/study/gem.png')} alt="Gem" className="w-3.5 h-3.5" />
                        {buyingEggId === egg.id ? '...' : egg.price_gems}
                      </button>
                    )}

                    {egg.price_xp > 0 && (
                      <button
                        onClick={() => { setConfirmItem(egg); setConfirmEggCurrency('xp') }}
                        disabled={buyingEggId === egg.id || (profile?.xp || 0) < egg.price_xp}
                        className={`w-full py-1.5 text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                          (profile?.xp || 0) >= egg.price_xp
                            ? `bg-gradient-to-r ${rarityButtonGradient[egg.rarity]} text-white`
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        } disabled:opacity-50`}
                        style={{ clipPath: CLIP_BTN }}
                      >
                        <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3.5 h-3.5" />
                        {buyingEggId === egg.id ? '...' : egg.price_xp}
                      </button>
                    )}

                    {(!egg.price_gems || egg.price_gems <= 0) && (!egg.price_xp || egg.price_xp <= 0) && (
                      <div className="w-full py-1.5 flex items-center justify-center gap-1 text-gray-400 text-xs">
                        <Lock className="w-3 h-3" />
                        Not for sale
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        /* Regular Items Grid */
        groupedDisplayItems.length === 0 ? (
          <div
            className="relative bg-white border border-gray-200 p-12 text-center overflow-hidden shadow-sm"
            style={{ clipPath: CLIP_CARD }}
          >
            <CornerBrackets />
            <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Chưa có vật phẩm nào</h3>
            <p className="text-gray-400 text-sm">Hãy quay lại sau nhé!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {groupedDisplayItems.map(group => {
              const idx = group.groupKey ? (variantIndex[group.groupKey] || 0) : 0
              const item = group.variants[idx]
              const hasVariants = group.variants.length > 1
              const owned = isOwned(item.id)
              const canAfford = canAffordItem(item)
              const itemRarity = item.rarity || item.item_data?.rarity || 'common'
              const rc = rarityCardColors[itemRarity] || rarityCardColors.common
              return (
                <div
                  key={group.groupKey || item.id}
                  className={`relative bg-white border-2 overflow-hidden transition-all duration-200 ${
                    !owned && !canAfford
                      ? 'border-gray-200 grayscale opacity-60'
                      : `hover:shadow-xl ${rc.border}`
                    }`}
                  style={{ clipPath: CLIP_CARD, boxShadow: owned || canAfford ? `0 0 12px ${rc.glow}` : undefined }}
                >
                  <CornerBrackets />

                  {/* Equipped badge */}
                  {isEquipped(item) && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1 z-10">
                      <Check className="w-3 h-3" />
                    </div>
                  )}

                  {/* Owned badge for variants */}
                  {hasVariants && owned && !isEquipped(item) && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1 z-10">
                      <Check className="w-3 h-3" />
                    </div>
                  )}

                  {/* XP bonus badge */}
                  {item.item_data?.xp_bonus > 0 && (
                    <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 px-1.5 py-0.5 text-[10px] font-semibold z-10 shadow"
                      style={{ clipPath: CLIP_TAB }}
                    >
                      +{item.item_data.xp_bonus}% XP
                    </div>
                  )}

                  {/* Item image */}
                  <div className="aspect-square bg-gray-50 flex items-center justify-center p-4 relative cursor-pointer" onClick={() => setSelectedItem(item)}>
                    {!owned && !canAfford && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-20">
                        <Lock className="w-6 h-6 text-white drop-shadow" />
                      </div>
                    )}
                    {item.image_url ? (
                      item.category === 'background' ? (
                        <div
                          className="w-full h-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${item.item_data?.background_url || item.image_url})`, clipPath: CLIP_CARD }}
                        />
                      ) : (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-full object-contain"
                          style={item.category === 'hammer' ? { transform: 'rotate(90deg)' } : undefined}
                        />
                      )
                    ) : (
                      <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-2xl">
                        {item.category === 'avatar' ? '👤' : '🏷️'}
                      </div>
                    )}
                  </div>

                  {/* Variant arrows + dots on the same line */}
                  <div className="flex items-center justify-center gap-1 py-1 min-h-[20px]">
                    {hasVariants && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setVariantIndex(prev => ({ ...prev, [group.groupKey]: (idx - 1 + group.variants.length) % group.variants.length })) }}
                        className="bg-white hover:bg-gray-50 rounded-full p-0.5 shadow border border-gray-200"
                      >
                        <ChevronLeft className="w-4 h-4 text-gray-600" />
                      </button>
                    )}
                    {hasVariants && group.variants.length <= 6
                      ? group.variants.map((v, i) => (
                          <button
                            key={v.id}
                            onClick={() => setVariantIndex(prev => ({ ...prev, [group.groupKey]: i }))}
                            className={`w-2 h-2 rounded-full transition-all ${
                              i === idx
                                ? 'bg-blue-500 scale-125'
                                : isOwned(v.id) ? 'bg-green-300' : 'bg-gray-300'
                            }`}
                          />
                        ))
                      : hasVariants && (
                          <span className="text-xs text-gray-500 font-medium">{idx + 1}/{group.variants.length}</span>
                        )
                    }
                    {hasVariants && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setVariantIndex(prev => ({ ...prev, [group.groupKey]: (idx + 1) % group.variants.length })) }}
                        className="bg-white hover:bg-gray-50 rounded-full p-0.5 shadow border border-gray-200"
                      >
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                      </button>
                    )}
                  </div>

                  {/* Item info */}
                  <div className="p-3">
                    <h3 className="font-semibold text-sm text-gray-800 truncate">{item.name}</h3>
                    {item.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{item.description}</p>
                    )}

                    {/* Price / Action */}
                    <div className="mt-2">
                      {owned ? (
                        equippableCategories.includes(item.category) ? (
                          isEquipped(item) ? (
                            <div className="space-y-1">
                              <button
                                disabled
                                className="w-full py-1.5 bg-blue-50 text-blue-600 text-sm font-semibold opacity-60 cursor-not-allowed tracking-wide"
                                style={{ clipPath: CLIP_BTN }}
                              >
                                Đã trang bị
                              </button>
                              {item.category === 'frame' && (
                                <button
                                  onClick={handleToggleHideFrame}
                                  className={`w-full py-1.5 text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                                    profile?.hide_frame
                                      ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                      : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                                  }`}
                                  style={{ clipPath: CLIP_BTN }}
                                >
                                  {profile?.hide_frame ? (
                                    <><Eye className="w-3 h-3" /> Hiện khung</>
                                  ) : (
                                    <><EyeOff className="w-3 h-3" /> Ẩn khung</>
                                  )}
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => handleEquip(item)}
                              className="w-full py-1.5 bg-blue-50 text-blue-600 text-sm font-semibold hover:bg-blue-100 transition-colors tracking-wide"
                              style={{ clipPath: CLIP_BTN }}
                            >
                              Trang bị
                            </button>
                          )
                        ) : (
                          <div
                            className="w-full py-1.5 bg-gray-100 text-gray-400 text-sm font-medium text-center tracking-wide"
                            style={{ clipPath: CLIP_BTN }}
                          >
                            Đã mua
                          </div>
                        )
                      ) : (
                        <button
                          onClick={() => handlePurchase(item)}
                          disabled={!canAfford || purchasing === item.id}
                          className={`w-full py-2 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all duration-100 shadow-sm ${canAfford
                              ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 active:scale-95'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                            }`}
                          style={{ clipPath: CLIP_BTN }}
                        >
                          {purchasing === item.id ? (
                            <span className="animate-pulse">...</span>
                          ) : (
                            <>
                              {isXPItem(item) ? (
                                <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-4 h-4" />
                              ) : (
                                <img src={assetUrl('/image/study/gem.png')} alt="Gem" className="w-4 h-4" />
                              )}
                              {item.price}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Item Detail Modal */}
      {selectedItem && createPortal(
        <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />,
        document.body
      )}

      {/* Confirm Modal */}
      {confirmItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setConfirmItem(null); setConfirmEggCurrency(null) }}>
          <div
            className="relative bg-white p-6 mx-4 max-w-xs w-full shadow-xl border-2 border-blue-200 overflow-hidden"
            style={{ clipPath: CLIP_CARD }}
            onClick={e => e.stopPropagation()}
          >
            <CornerBrackets />
            <div className="flex flex-col items-center">
              {confirmItem.image_url && (
                <img src={confirmItem.image_url} alt={confirmItem.name} className="w-24 h-24 object-contain mb-3" />
              )}
              <h3 className="font-semibold text-lg text-gray-800 tracking-wide">{confirmItem.name}</h3>
              <div className="flex items-center gap-1 mt-2 text-base font-semibold text-gray-600">
                {confirmEggCurrency ? (
                  confirmEggCurrency === 'xp' ? (
                    <>
                      <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-5 h-5" />
                      {confirmItem.price_xp}
                    </>
                  ) : (
                    <>
                      <img src={assetUrl('/image/study/gem.png')} alt="Gem" className="w-5 h-5" />
                      {confirmItem.price_gems}
                    </>
                  )
                ) : (
                  <>
                    {isXPItem(confirmItem) ? (
                      <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-5 h-5" />
                    ) : (
                      <img src={assetUrl('/image/study/gem.png')} alt="Gem" className="w-5 h-5" />
                    )}
                    {confirmItem.price}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setConfirmItem(null); setConfirmEggCurrency(null) }}
                className="flex-1 py-2 bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition-colors tracking-wide"
                style={{ clipPath: CLIP_BTN }}
              >
                Hủy
              </button>
              <button
                onClick={confirmEggCurrency ? (['ball', 'ticket'].includes(confirmItem?.item_type) ? handleConfirmBallPurchase : handleConfirmEggPurchase) : confirmPurchase}
                className="flex-1 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold hover:from-blue-600 hover:to-blue-700 transition-colors tracking-wide"
                style={{ clipPath: CLIP_BTN }}
              >
                Mua
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Shop
