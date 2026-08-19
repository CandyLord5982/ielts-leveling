import React, { useEffect, useState } from 'react'
import { POWERUPS } from '../../hooks/useLiveBattle'

const getPowerupImage = (text) => {
  if (!text) return null
  const lowerText = text.toLowerCase()
  for (const [, pu] of Object.entries(POWERUPS)) {
    if (pu.image && lowerText.includes(pu.name.toLowerCase())) return pu.image
  }
  return null
}

const PowerUpEffect = ({ events }) => {
  const [visible, setVisible] = useState(null)
  const latestEvent = events[0] || null

  useEffect(() => {
    if (!latestEvent || latestEvent.type !== 'powerup') {
      setVisible(null)
      return
    }

    setVisible(latestEvent)
    const timer = setTimeout(() => setVisible(null), 2000)
    return () => clearTimeout(timer)
  }, [latestEvent?.ts])

  if (!visible) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <div className="animate-bounce text-center">
        <div className="text-6xl mb-2 drop-shadow-lg animate-pulse flex justify-center">
          {getPowerupImage(visible.text)
            ? <img src={getPowerupImage(visible.text)} alt="" className="w-20 h-20 object-contain" />
            : (visible.text?.match(/[\u{1F300}-\u{1F9FF}]/u)?.[0] || '✨')
          }
        </div>
        <div className="bg-black/80 text-white text-xl font-bold px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-sm">
          {visible.text}
        </div>
      </div>
    </div>
  )
}

export default PowerUpEffect
