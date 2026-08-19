import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { assetUrl } from '../../hooks/useBranding'
import { usePet } from '../../hooks/usePet'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabase/client'
import { Star, Check, Heart, Calendar, ShoppingBag, Book, X, Pencil, ChevronLeft, ChevronRight, Move, Image } from 'lucide-react'

const rarityGlow = {
  common: 'rgba(156,163,175,0.4)',
  uncommon: 'rgba(74,222,128,0.4)',
  rare: 'rgba(96,165,250,0.4)',
  epic: 'rgba(192,132,252,0.4)',
  legendary: 'rgba(250,204,21,0.5)',
}

const rarityBorder = {
  common: 'border-gray-400',
  uncommon: 'border-green-400',
  rare: 'border-blue-400',
  epic: 'border-purple-400',
  legendary: 'border-yellow-400',
}

const rarityBadge = {
  common: 'text-gray-700 bg-gray-200',
  uncommon: 'text-green-700 bg-green-200 border border-green-300',
  rare: 'text-blue-700 bg-blue-200 border border-blue-300',
  epic: 'text-purple-700 bg-purple-200 border border-purple-300',
  legendary: 'text-yellow-800 bg-gradient-to-r from-yellow-200 to-amber-200 border border-yellow-400 shadow-sm shadow-yellow-300',
}

const rarityStars = {
  common: '★',
  uncommon: '★★',
  rare: '★★★',
  epic: '★★★★',
  legendary: '★★★★★',
}

const rarityRing = {
  common: 'ring-gray-400',
  uncommon: 'ring-green-400',
  rare: 'ring-blue-400',
  epic: 'ring-purple-400',
  legendary: 'ring-yellow-400',
}

const PetInventory = () => {
  const { userPets, allPets, setActivePetById, renamePet, saveHabitatLayout } = usePet()
  const { user, profile, updateProfile } = useAuth()
  const navigate = useNavigate()
  const [selectedPet, setSelectedPet] = useState(null)
  const [message, setMessage] = useState(null)
  const [showPetDex, setShowPetDex] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [nicknameInput, setNicknameInput] = useState('')
  const [showTray, setShowTray] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showBgPicker, setShowBgPicker] = useState(false)
  const [ownedBackgrounds, setOwnedBackgrounds] = useState([])
  const [equippingBg, setEquippingBg] = useState(false)

  // Local layout state — {[userPetId]: {x, y}} — init from DB
  const [layout, setLayout] = useState({})
  const [layoutDirty, setLayoutDirty] = useState(false)

  // Sync from DB on load / when userPets change
  useEffect(() => {
    const dbLayout = {}
    userPets.forEach(up => {
      if (up.habitat_x != null && up.habitat_y != null) {
        dbLayout[up.id] = { x: up.habitat_x, y: up.habitat_y, flip: up.habitat_flip || false }
      }
    })
    setLayout(dbLayout)
    setLayoutDirty(false)
  }, [userPets])

  // Fetch owned backgrounds
  useEffect(() => {
    if (!user) return
    const fetchBgs = async () => {
      const { data: purchases } = await supabase
        .from('user_purchases')
        .select('item_id')
        .eq('user_id', user.id)
      if (!purchases) return
      const purchasedIds = purchases.map(p => p.item_id)
      if (purchasedIds.length === 0) return
      const { data: bgItems } = await supabase
        .from('shop_items')
        .select('*')
        .eq('category', 'background')
        .eq('is_active', true)
        .in('id', purchasedIds)
      setOwnedBackgrounds(bgItems || [])
    }
    fetchBgs()
  }, [user])

  const handleEquipBg = async (bgItem) => {
    setEquippingBg(true)
    try {
      const bgUrl = bgItem ? (bgItem.item_data?.background_url || bgItem.image_url) : null
      await updateProfile({ active_background_url: bgUrl })
      setMessage({ type: 'success', text: bgItem ? 'Background equipped!' : 'Background removed!' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to change background' })
    }
    setEquippingBg(false)
    setTimeout(() => setMessage(null), 3000)
  }

  const activeBackgroundUrl = profile?.active_background_url || null

  // Drag state for placing pets
  const [draggingPet, setDraggingPet] = useState(null)
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
  const habitatRef = useRef(null)
  const dragStartPos = useRef(null)
  const didDrag = useRef(false)

  const ownedPetIds = userPets.map(up => up.pet?.id).filter(Boolean)

  const placedPets = userPets.filter(up => layout[up.id])

  const handleSetActive = async (petId) => {
    const result = await setActivePetById(petId)
    if (result.success) {
      setMessage({ type: 'success', text: 'Pet activated!' })
      setSelectedPet(null)
      setTimeout(() => setMessage(null), 3000)
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to set active pet' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleSaveLayout = async () => {
    setSaving(true)
    const result = await saveHabitatLayout(layout)
    setSaving(false)
    if (result?.success) {
      setLayoutDirty(false)
      setMessage({ type: 'success', text: 'Layout saved!' })
    } else {
      setMessage({ type: 'error', text: 'Failed to save layout' })
    }
    setTimeout(() => setMessage(null), 3000)
  }

  const getPetImage = (userPet) => {
    const pet = userPet.pet
    if (userPet.evolution_stage > 0 && pet.evolution_stages) {
      const stage = pet.evolution_stages.find(s => s.stage === userPet.evolution_stage)
      if (stage?.image_url) return stage.image_url
    }
    return pet.image_url
  }

  const isEvolved = (userPet) => userPet.evolution_stage > 0

  // Pets in tray (not placed yet)
  const trayPets = userPets.filter(up => !layout[up.id])

  // Handle drag start from tray or from habitat
  const getPointerPos = (e) => {
    if (e.touches?.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    return { x: e.clientX, y: e.clientY }
  }

  const handlePetDragStart = useCallback((e, userPet, fromHabitat = false) => {
    if (!showTray) return
    e.preventDefault()
    e.stopPropagation()
    const pos = getPointerPos(e)
    dragStartPos.current = pos
    didDrag.current = false
    setDraggingPet({ ...userPet, fromHabitat })
    setDragPos(pos)
  }, [showTray])

  const handlePetDragMove = useCallback((e) => {
    if (!draggingPet) return
    e.preventDefault()
    const pos = getPointerPos(e)
    if (dragStartPos.current) {
      const dx = pos.x - dragStartPos.current.x
      const dy = pos.y - dragStartPos.current.y
      if (dx * dx + dy * dy > 64) didDrag.current = true
    }
    setDragPos(pos)
  }, [draggingPet])

  const handlePetDragEnd = useCallback((e) => {
    if (!draggingPet) return
    e.preventDefault()

    const habitat = habitatRef.current
    if (!habitat) { setDraggingPet(null); return }

    const rect = habitat.getBoundingClientRect()
    const x = ((dragPos.x - rect.left) / rect.width) * 100
    const y = ((dragPos.y - rect.top) / rect.height) * 100

    // Only place if within habitat bounds
    if (x >= 0 && x <= 100 && y >= 5 && y <= 95) {
      setLayout(prev => ({ ...prev, [draggingPet.id]: { ...prev[draggingPet.id], x: Math.max(5, Math.min(95, x)), y: Math.max(10, Math.min(90, y)) } }))
      setLayoutDirty(true)
    } else if (draggingPet.fromHabitat) {
      // Dragged out of habitat — remove
      setLayout(prev => { const next = { ...prev }; delete next[draggingPet.id]; return next })
      setLayoutDirty(true)
    }

    setDraggingPet(null)
  }, [draggingPet, dragPos])

  useEffect(() => {
    if (!draggingPet) return
    const onMove = (e) => handlePetDragMove(e)
    const onEnd = (e) => handlePetDragEnd(e)
    window.addEventListener('mousemove', onMove, { passive: false })
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [draggingPet, handlePetDragMove, handlePetDragEnd])

  return (
    <div className="min-h-screen relative overflow-hidden select-none" style={{ touchAction: 'none' }}>
      {/* Background layers: mobile vs desktop defaults */}
      {activeBackgroundUrl ? (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${activeBackgroundUrl})` }} />
      ) : (
        <>
          <div className="absolute inset-0 bg-cover bg-center lg:hidden" style={{ backgroundImage: "url('https://imgcdn.stablediffusionweb.com/2025/2/6/3c42fbef-5900-4c3c-acb9-da0480c4b238.jpg')" }} />
          <div className="absolute inset-0 bg-cover bg-center hidden lg:block" style={{ backgroundImage: `url(${assetUrl('/pet-habitat/pet-home.jpg')})` }} />
        </>
      )}

      {/* ---- Sky Background (only when no custom bg) ---- */}
      {!activeBackgroundUrl && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Clouds */}
          {[
            { top: '6%', size: 1, speed: 35, delay: 0 },
            { top: '14%', size: 0.7, speed: 45, delay: -12 },
            { top: '22%', size: 1.2, speed: 38, delay: -20 },
            { top: '10%', size: 0.6, speed: 50, delay: -30 },
            { top: '28%', size: 0.9, speed: 42, delay: -6 },
          ].map((c, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                top: c.top,
                left: '-15%',
                transform: `scale(${c.size})`,
                animation: `cloudDrift ${c.speed}s linear infinite`,
                animationDelay: `${c.delay}s`,
                opacity: 0.85 - c.size * 0.15,
              }}
            >
              {/* Main body */}
              <div className="relative" style={{ width: 140, height: 50 }}>
                <div className="absolute rounded-full bg-white" style={{ width: 60, height: 40, bottom: 0, left: 10 }} />
                <div className="absolute rounded-full bg-white" style={{ width: 80, height: 50, bottom: 0, left: 30 }} />
                <div className="absolute rounded-full bg-white" style={{ width: 50, height: 35, bottom: 0, left: 85 }} />
                {/* Top bumps */}
                <div className="absolute rounded-full bg-white" style={{ width: 50, height: 40, bottom: 18, left: 25 }} />
                <div className="absolute rounded-full bg-white" style={{ width: 60, height: 45, bottom: 15, left: 50 }} />
                <div className="absolute rounded-full bg-white" style={{ width: 35, height: 28, bottom: 12, left: 80 }} />
                {/* Soft shadow */}
                <div className="absolute rounded-full bg-gray-200/40" style={{ width: 120, height: 15, bottom: -2, left: 10, filter: 'blur(4px)' }} />
              </div>
            </div>
          ))}
          {/* Sun */}
          <div className="absolute top-6 right-8 w-16 h-16 bg-yellow-300 rounded-full blur-sm opacity-80" />
          <div className="absolute top-7 right-9 w-14 h-14 bg-yellow-200 rounded-full" />
        </div>
      )}

      {/* ---- Ground (only when no custom bg) ---- */}
      {!activeBackgroundUrl && (
        <div className="absolute bottom-0 left-0 right-0 h-[35%] pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-t from-green-600/40 via-green-500/20 to-transparent" />
          {/* Grass tufts */}
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute bottom-0"
              style={{ left: `${i * 8.5}%` }}
            >
              <div className="w-8 h-6 bg-green-500/30 rounded-t-full" style={{ transform: 'scaleX(1.5)', animation: `grassSway ${2 + i * 0.2}s ease-in-out infinite alternate`, animationDelay: `${i * 0.15}s`, transformOrigin: 'bottom' }} />
            </div>
          ))}
        </div>
      )}

      {/* ---- Habitat Area (droppable) ---- */}
      <div ref={habitatRef} className="absolute inset-0">
        {/* Placed pets */}
        {placedPets.map((userPet, i) => {
          const pos = layout[userPet.id]
          const pet = userPet.pet
          const rarity = pet.rarity || 'common'
          const isActive = userPet.is_active
          const isDraggingThis = draggingPet?.id === userPet.id

          return (
            <div
              key={userPet.id}
              className={`absolute group transition-transform ${isDraggingThis ? 'opacity-30 scale-75' : 'hover:scale-110'}`}
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: isDraggingThis ? 0 : Math.round(pos.y),
              }}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md">
                  ACTIVE
                </div>
              )}

              {/* Pet image */}
              <div
                className={showTray ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
                style={{ transform: pos.flip ? 'scaleX(-1)' : undefined }}
                onMouseDown={(e) => handlePetDragStart(e, userPet, true)}
                onTouchStart={(e) => handlePetDragStart(e, userPet, true)}
                onClick={(e) => { if (!showTray && !didDrag.current) { e.stopPropagation(); setSelectedPet(userPet); setIsRenaming(false) } }}
              >
                <img
                  src={getPetImage(userPet)}
                  alt={pet.name}
                  className={`object-contain pointer-events-none select-none ${isEvolved(userPet) ? 'w-24 h-24 sm:w-28 sm:h-28' : 'w-16 h-16 sm:w-20 sm:h-20'}`}
                  style={{
                    filter: `drop-shadow(0 0 6px ${rarityGlow[rarity]})`,
                    animation: `petBob ${2.2 + (i % 5) * 0.3}s ease-in-out infinite`,
                    animationDelay: `${(i % 5) * -0.6}s`,
                  }}
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                />
              </div>


              {/* Flip button on hover */}
              {showTray && (
                <button
                  className="absolute -top-2 -left-2 w-5 h-5 bg-blue-500 text-white rounded-full text-[9px] lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md hover:bg-blue-600"
                  onClick={(e) => { e.stopPropagation(); setLayout(prev => ({ ...prev, [userPet.id]: { ...prev[userPet.id], flip: !prev[userPet.id]?.flip } })); setLayoutDirty(true) }}
                >
                  ↔
                </button>
              )}

              {/* Remove button on hover */}
              {showTray && (
                <button
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md hover:bg-red-600"
                  onClick={(e) => { e.stopPropagation(); setLayout(prev => { const next = { ...prev }; delete next[userPet.id]; return next }); setLayoutDirty(true) }}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ---- Dragging Ghost ---- */}
      {draggingPet && (
        <div
          className="fixed z-[100] pointer-events-none"
          style={{ left: dragPos.x - 32, top: dragPos.y - 32 }}
        >
          <img
            src={getPetImage(draggingPet)}
            alt=""
            className={`object-contain opacity-80 ${isEvolved(draggingPet) ? 'w-24 h-24' : 'w-16 h-16'}`}
            style={{ filter: `drop-shadow(0 0 10px ${rarityGlow[draggingPet.pet?.rarity || 'common']})` }}
          />
        </div>
      )}

      {/* ---- Top Bar ---- */}
      <div className="absolute top-0 left-0 right-0 z-30 p-3 flex justify-between items-start">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white p-2 rounded-lg transition-all shadow-lg border border-white/20"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-black text-white drop-shadow-lg">My Pets</h1>
            <p className="text-xs text-white/70 drop-shadow">{userPets.length} pets collected</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBgPicker(true)}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold py-2 px-3 rounded-lg transition-all text-sm flex items-center gap-1.5 shadow-lg border border-white/20"
          >
            <Image className="w-4 h-4" />
            BG
          </button>
          <button
            onClick={() => setShowPetDex(true)}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold py-2 px-3 rounded-lg transition-all text-sm flex items-center gap-1.5 shadow-lg border border-white/20"
          >
            <Book className="w-4 h-4" />
            Dex
          </button>
          <button
            onClick={() => navigate('/shop?tab=ball')}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold py-2 px-3 rounded-lg transition-all text-sm flex items-center gap-1.5 shadow-lg border border-white/20"
          >
            <ShoppingBag className="w-4 h-4" />
            Shop
          </button>
          {layoutDirty && (
            <button
              onClick={handleSaveLayout}
              disabled={saving}
              className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-2 px-3 rounded-lg transition-all text-sm flex items-center gap-1.5 shadow-lg animate-pulse"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* ---- Message Toast ---- */}
      {message && (
        <div className={`absolute top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full text-sm font-bold shadow-lg ${
          message.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {message.text}
        </div>
      )}

      {/* ---- Pet Tray: right side on mobile, bottom on lg+ ---- */}
      {/* Mobile: right side panel */}
      <div className={`lg:hidden absolute top-12 right-0 bottom-16 z-30 transition-transform duration-300 ${showTray ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Toggle handle */}
        <button
          onClick={() => setShowTray(!showTray)}
          className="absolute left-0 top-4 -translate-x-full flex items-center gap-1 bg-white/90 backdrop-blur-md px-2 py-3 rounded-l-xl shadow-lg border border-r-0 border-gray-200 text-gray-600 text-[10px] font-bold hover:bg-white transition-colors"
          style={{ writingMode: 'vertical-lr' }}
        >
          <Move className="w-3 h-3" />
          {showTray ? 'Hide' : 'Place'} ({trayPets.length})
        </button>

        {/* Side tray content */}
        <div className="h-full bg-white/90 backdrop-blur-md border-l border-gray-200 p-2 shadow-xl overflow-y-auto w-[72px]">
          {userPets.length === 0 ? (
            <div className="text-center py-4">
              <span className="text-2xl mb-1 block">🐾</span>
              <p className="text-gray-500 text-[8px]">No pets yet!</p>
            </div>
          ) : trayPets.length === 0 ? (
            <p className="text-center text-gray-400 text-[8px] py-2">All placed!</p>
          ) : (
            <div className="flex flex-col gap-2">
              {trayPets.map(userPet => {
                const pet = userPet.pet
                const rarity = pet.rarity || 'common'
                return (
                  <div
                    key={userPet.id}
                    className={`w-full flex flex-col items-center cursor-grab active:cursor-grabbing rounded-lg p-1.5 border-2 transition-all ${
                      userPet.is_active ? `${rarityBorder[rarity]} ${rarityRing[rarity]} ring-2 bg-white` : 'border-gray-200 bg-white'
                    }`}
                    onMouseDown={(e) => handlePetDragStart(e, userPet)}
                    onTouchStart={(e) => handlePetDragStart(e, userPet)}
                    onClick={() => { if (!didDrag.current) { setSelectedPet(userPet); setIsRenaming(false) } }}
                  >
                    <img
                      src={getPetImage(userPet)}
                      alt={pet.name}
                      className={`object-contain pointer-events-none select-none ${isEvolved(userPet) ? 'w-14 h-14' : 'w-10 h-10'}`}
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                    />
                    <span className="text-[7px] font-bold text-gray-600 truncate w-full text-center mt-0.5">
                      {userPet.nickname || pet.name}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Desktop: bottom tray */}
      <div className={`hidden lg:block absolute bottom-0 left-0 right-0 z-30 transition-transform duration-300 ${showTray ? 'translate-y-0' : 'translate-y-[calc(100%-40px)]'}`}>
        {/* Toggle handle */}
        <button
          onClick={() => setShowTray(!showTray)}
          className="mx-auto -mt-1 flex items-center gap-1 bg-white/90 backdrop-blur-md px-4 py-1.5 rounded-t-xl shadow-lg border border-b-0 border-gray-200 text-gray-600 text-xs font-bold hover:bg-white transition-colors"
        >
          <Move className="w-3 h-3" />
          {showTray ? 'Hide' : 'Place Pets'} ({trayPets.length})
          {showTray ? <ChevronRight className="w-3 h-3 rotate-90" /> : <ChevronLeft className="w-3 h-3 -rotate-90" />}
        </button>

        {/* Tray content */}
        <div className="bg-white/90 backdrop-blur-md border-t border-gray-200 p-3 shadow-xl">
          {userPets.length === 0 ? (
            <div className="text-center py-4">
              <span className="text-3xl mb-2 block">🐾</span>
              <p className="text-gray-500 text-sm">No pets yet! Catch some in the wild.</p>
            </div>
          ) : trayPets.length === 0 ? (
            <p className="text-center text-gray-400 text-xs py-2">All pets placed! Drag them to rearrange.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 px-1">
              {trayPets.map(userPet => {
                const pet = userPet.pet
                const rarity = pet.rarity || 'common'
                return (
                  <div
                    key={userPet.id}
                    className={`flex-shrink-0 w-16 flex flex-col items-center cursor-grab active:cursor-grabbing rounded-lg p-1.5 border-2 transition-all hover:scale-105 ${
                      userPet.is_active ? `${rarityBorder[rarity]} ${rarityRing[rarity]} ring-2 bg-white` : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                    onMouseDown={(e) => handlePetDragStart(e, userPet)}
                    onTouchStart={(e) => handlePetDragStart(e, userPet)}
                    onClick={() => { if (!didDrag.current) { setSelectedPet(userPet); setIsRenaming(false) } }}
                  >
                    <img
                      src={getPetImage(userPet)}
                      alt={pet.name}
                      className={`object-contain pointer-events-none select-none ${isEvolved(userPet) ? 'w-14 h-14' : 'w-10 h-10'}`}
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                    />
                    <span className="text-[8px] font-bold text-gray-600 truncate w-full text-center mt-0.5">
                      {userPet.nickname || pet.name}
                    </span>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide ${rarityBadge[rarity]}`}>
                      {rarityStars[rarity]} {rarity.slice(0, 3)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ---- Pet Detail Modal ---- */}
      {selectedPet && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4" onClick={() => setSelectedPet(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Name + rename */}
            <div className="flex items-center gap-2 mb-4">
              {isRenaming ? (
                <form className="flex items-center gap-2 flex-1" onSubmit={async (e) => {
                  e.preventDefault()
                  await renamePet(nicknameInput, selectedPet.id)
                  setSelectedPet(prev => ({ ...prev, nickname: nicknameInput.trim() || null }))
                  setIsRenaming(false)
                }}>
                  <input
                    autoFocus
                    className="text-xl font-bold text-gray-800 border-b-2 border-purple-400 outline-none flex-1 bg-transparent"
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    placeholder={selectedPet.pet.name}
                  />
                  <button type="submit" className="text-green-500 hover:text-green-700 text-sm font-semibold">Save</button>
                  <button type="button" onClick={() => setIsRenaming(false)} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
                </form>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-800 flex-1">
                    {selectedPet.nickname || selectedPet.pet.name}
                  </h2>
                  <button onClick={() => { setNicknameInput(selectedPet.nickname || ''); setIsRenaming(true) }} className="text-gray-400 hover:text-purple-500 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* Pet image */}
            <div className="relative bg-gradient-to-br from-sky-100 to-green-100 rounded-xl p-4 mb-4 flex items-center justify-center" onContextMenu={(e) => e.preventDefault()}>
              <img
                src={getPetImage(selectedPet)}
                alt={selectedPet.pet.name}
                className={`object-contain select-none pointer-events-none ${isEvolved(selectedPet) ? 'w-36 h-36' : 'w-28 h-28'}`}
                style={{ filter: `drop-shadow(0 0 8px ${rarityGlow[selectedPet.pet.rarity]})` }}
                draggable={false}
              />
              {selectedPet.is_active && (
                <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3" /> Active
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Species</span>
                <span className="font-semibold">{selectedPet.pet.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Rarity</span>
                <span className={`px-3 py-1 rounded-full text-sm font-black uppercase tracking-wider ${rarityBadge[selectedPet.pet.rarity]}`}>
                  {rarityStars[selectedPet.pet.rarity]} {selectedPet.pet.rarity}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Level</span>
                <span className="font-semibold flex items-center gap-1"><Star className="w-3.5 h-3.5 text-yellow-500" /> {selectedPet.level}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">XP</span>
                <span className="font-semibold">{selectedPet.xp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Birthday</span>
                <span className="font-semibold flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-gray-400" /> {new Date(selectedPet.obtained_at).toLocaleDateString()}</span>
              </div>
            </div>

            {selectedPet.pet.description && (
              <p className="text-xs text-gray-500 mb-4 italic">{selectedPet.pet.description}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedPet(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors text-sm"
              >
                Close
              </button>
              {!selectedPet.is_active && (
                <button
                  onClick={() => handleSetActive(selectedPet.id)}
                  className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition-colors text-sm"
                >
                  Set Active
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Pet Dex Modal ---- */}
      {showPetDex && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4" onClick={() => setShowPetDex(false)}>
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-blue-500 text-white p-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Book className="w-5 h-5" />
                  Pet Dex
                </h2>
                <p className="text-blue-100 text-xs mt-0.5">
                  {ownedPetIds.length} / {allPets.length} discovered
                </p>
              </div>
              <button onClick={() => setShowPetDex(false)} className="text-white hover:bg-white/20 rounded-full p-2 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(90vh-100px)]">
              {['common', 'uncommon', 'rare', 'epic', 'legendary'].map(rarity => {
                const petsOfRarity = allPets.filter(p => p.rarity === rarity)
                if (petsOfRarity.length === 0) return null
                return (
                  <div key={rarity} className="mb-5">
                    <h3 className={`text-sm font-black mb-2 uppercase tracking-wider flex items-center gap-2 ${
                      rarity === 'common' ? 'text-gray-600' :
                      rarity === 'uncommon' ? 'text-green-600' :
                      rarity === 'rare' ? 'text-blue-600' :
                      rarity === 'epic' ? 'text-purple-600' : 'text-yellow-600'
                    }`}>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${rarityBadge[rarity]}`}>
                        {rarityStars[rarity]} {rarity}
                      </span>
                      <span className="text-[10px] font-normal text-gray-400">({petsOfRarity.length} pets)</span>
                    </h3>
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                      {petsOfRarity.map(pet => {
                        const isOwned = ownedPetIds.includes(pet.id)
                        return (
                          <div
                            key={pet.id}
                            className={`relative rounded-xl p-2 text-center transition-all ${
                              isOwned ? `border-2 ${rarityBorder[pet.rarity]} bg-white` : 'border-2 border-gray-200 bg-gray-50'
                            }`}
                          >
                            <div className="w-12 h-12 mx-auto mb-1 flex items-center justify-center">
                              {pet.image_url ? (
                                <img
                                  src={pet.image_url}
                                  alt={isOwned ? pet.name : '???'}
                                  className={`w-full h-full object-contain select-none pointer-events-none ${!isOwned ? 'brightness-0' : ''}`}
                                  style={!isOwned ? { filter: 'brightness(0)' } : undefined}
                                  onContextMenu={(e) => e.preventDefault()}
                                  draggable="false"
                                />
                              ) : (
                                <span className="text-2xl opacity-50">?</span>
                              )}
                            </div>
                            <p className={`text-[10px] font-semibold truncate ${isOwned ? 'text-gray-800' : 'text-gray-400'}`}>
                              {isOwned ? pet.name : '???'}
                            </p>
                            {isOwned && (
                              <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5">
                                <Check className="w-2.5 h-2.5 text-white" />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---- Background Picker Modal ---- */}
      {showBgPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowBgPicker(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-indigo-500 text-white p-4 flex justify-between items-center">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Image className="w-5 h-5" />
                Habitat Background
              </h2>
              <button onClick={() => setShowBgPicker(false)} className="text-white hover:bg-white/20 rounded-full p-2 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {/* Remove background option */}
              <button
                onClick={() => { handleEquipBg(null); setShowBgPicker(false) }}
                disabled={equippingBg}
                className={`w-full mb-3 p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${
                  !activeBackgroundUrl ? 'border-indigo-400 ring-2 ring-indigo-300 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                }`}
              >
                <div className="w-16 h-12 rounded-lg bg-cover bg-center flex-shrink-0" style={{ backgroundImage: "url('https://cdn.vectorstock.com/i/500p/37/22/cozy-home-interior-collection-vector-40573722.jpg')" }} />
                <div className="text-left">
                  <p className="font-semibold text-sm text-gray-800">Default</p>
                  <p className="text-xs text-gray-500">Cozy room</p>
                </div>
                {!activeBackgroundUrl && <Check className="w-5 h-5 text-indigo-500 ml-auto" />}
              </button>

              {ownedBackgrounds.length === 0 ? (
                <div className="text-center py-6">
                  <Image className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No backgrounds yet!</p>
                  <button
                    onClick={() => { setShowBgPicker(false); navigate('/shop?tab=background') }}
                    className="mt-2 text-indigo-500 hover:text-indigo-600 text-sm font-semibold"
                  >
                    Browse Shop
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {ownedBackgrounds.map(bg => {
                    const bgUrl = bg.item_data?.background_url || bg.image_url
                    const isActive = activeBackgroundUrl === bgUrl
                    return (
                      <button
                        key={bg.id}
                        onClick={() => { handleEquipBg(bg); setShowBgPicker(false) }}
                        disabled={equippingBg}
                        className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-video ${
                          isActive ? 'border-indigo-400 ring-2 ring-indigo-300' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div
                          className="w-full h-full bg-cover bg-center min-h-[80px]"
                          style={{ backgroundImage: `url(${bgUrl})` }}
                        />
                        {isActive && (
                          <div className="absolute top-1 right-1 bg-indigo-500 rounded-full p-0.5">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/40 backdrop-blur-sm px-2 py-1">
                          <p className="text-white text-[10px] font-semibold truncate">{bg.name}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes cloudDrift {
          0% { transform: translateX(-20%); }
          100% { transform: translateX(110vw); }
        }
        @keyframes petIdle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes petBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes petWiggle {
          0%, 85%, 100% { rotate: 0deg; }
          88% { rotate: -4deg; }
          91% { rotate: 4deg; }
          94% { rotate: -3deg; }
          97% { rotate: 0deg; }
        }
        @keyframes grassSway {
          0% { transform: scaleX(1.5) rotate(-3deg); }
          100% { transform: scaleX(1.5) rotate(3deg); }
        }
      `}</style>
    </div>
  )
}

export default PetInventory
