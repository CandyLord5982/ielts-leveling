import React, { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import { X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import WorldScene from './WorldScene'

// EvoWorld-style prototype: fly around a big world, eat food, grow, evolve.
// Phaser owns the canvas; React owns the HUD overlay on top of it.
export default function EvoGame() {
  const containerRef = useRef(null)
  const gameRef = useRef(null)
  const navigate = useNavigate()
  const [stats, setStats] = useState({ level: 1, xp: 0, xpFloor: 0, xpNext: 30, size: 16 })

  useEffect(() => {
    if (!containerRef.current) return

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#0b1220',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: '100%',
      },
      physics: {
        default: 'arcade',
        arcade: { debug: false },
      },
      // Stats callback is read by the scene from the registry.
      callbacks: {
        preBoot: (g) => g.registry.set('onStats', (s) => setStats(s)),
      },
      scene: [WorldScene],
    })

    gameRef.current = game
    return () => {
      game.destroy(true)
      gameRef.current = null
    }
  }, [])

  const pct = stats.xpNext
    ? Math.min(100, ((stats.xp - stats.xpFloor) / (stats.xpNext - stats.xpFloor)) * 100)
    : 100

  return (
    <div className="fixed inset-0 z-50 bg-[#0b1220] overflow-hidden select-none">
      {/* Phaser canvas mounts here */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* HUD overlay (React) */}
      <div className="absolute top-0 left-0 right-0 p-4 pointer-events-none">
        <div className="flex items-center gap-3 max-w-md">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-cyan-500 text-white font-black text-lg shadow-lg shrink-0">
            {stats.level}
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-xs text-white/70 font-semibold mb-1">
              <span>Level {stats.level}</span>
              <span>{stats.xpNext ? `${stats.xp} / ${stats.xpNext} XP` : `${stats.xp} XP · MAX`}</span>
            </div>
            <div className="h-3 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
        <p className="text-white/50 text-xs">
          Move: <span className="text-white/80 font-semibold">click/hold</span> or{' '}
          <span className="text-white/80 font-semibold">WASD / arrows</span> · Eat food & smaller creatures to grow
        </p>
      </div>

      {/* Close */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 backdrop-blur rounded-full p-2 transition-colors pointer-events-auto"
        aria-label="Exit game"
      >
        <X className="w-6 h-6 text-white" />
      </button>
    </div>
  )
}
