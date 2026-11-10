import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowLeft, Gamepad2 } from 'lucide-react'
import BowlingGame from './bowling/BowlingGame'
import TileGame from './tiles/TileGame'
import PowerUpEffect from '../PowerUpEffect'

// Add new modes here. `component` receives the shared Live Battle props below.
const MODES = [
  {
    id: 'tiles',
    name: 'Mystery Tiles',
    emoji: '🧩',
    description: 'Pick a tile, answer for hidden points. Watch out for power-ups and bombs!',
    gradient: 'from-violet-500 to-fuchsia-500',
    component: TileGame,
  },
  {
    id: 'bowling',
    name: 'Bowling',
    emoji: '🎳',
    description: 'Answer right, pick a spot 1–5 and roll your luck. Every pin is a point.',
    gradient: 'from-orange-400 to-rose-500',
    component: BowlingGame,
  },
  { id: 'soon-1', name: 'More modes', emoji: '✨', description: 'Coming soon', gradient: 'from-slate-400 to-slate-600', comingSoon: true },
]

/**
 * Full-screen hub for team mini-games inside Live Battle.
 * Every mode gets: participants, teamNames, teamScores, onAddPoints(team, n), onActivatePowerup(type, team)
 */
const GameZoneModal = ({ onClose, participants, teamNames, teamScores, events = [], onAddPoints, onActivatePowerup }) => {
  const [modeId, setModeId] = useState(null)
  const mode = MODES.find(m => m.id === modeId)
  const ModeComponent = mode?.component

  return createPortal(
    <div className="fixed inset-0 z-50 select-none flex flex-col bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950">
      {/* The page's own PowerUpEffect sits underneath this overlay, so show it here too */}
      <PowerUpEffect events={events} />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          {mode && (
            <button
              onClick={() => setModeId(null)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-bold"
            >
              <ArrowLeft className="w-4 h-4" /> Modes
            </button>
          )}
          <div className="flex items-center gap-2 text-white">
            <Gamepad2 className="w-5 h-5 text-pink-400" />
            <span className="font-black text-lg">Game Zone</span>
            {mode && <span className="text-white/60 font-semibold">· {mode.emoji} {mode.name}</span>}
          </div>
        </div>

        {/* Live Battle scores */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-red-500/20 border border-red-400/40">
            <span className="text-red-300 text-sm font-bold">{teamNames.a}</span>
            <span className="text-white text-xl font-black">{teamScores.a}</span>
          </div>
          <span className="text-white/40 font-black">VS</span>
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-blue-500/20 border border-blue-400/40">
            <span className="text-white text-xl font-black">{teamScores.b}</span>
            <span className="text-blue-300 text-sm font-bold">{teamNames.b}</span>
          </div>
          <button onClick={onClose} className="ml-2 p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white" title="Close Game Zone">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {ModeComponent ? (
          <ModeComponent
            participants={participants}
            teamNames={teamNames}
            teamScores={teamScores}
            onAddPoints={onAddPoints}
            onActivatePowerup={onActivatePowerup}
          />
        ) : (
          <div className="h-full overflow-y-auto p-8">
            <h2 className="text-center text-3xl font-black text-white mb-2">Pick a game</h2>
            <p className="text-center text-white/60 mb-8">Points go straight to the Live Battle team scores.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
              {MODES.map(m => (
                <button
                  key={m.id}
                  disabled={m.comingSoon}
                  onClick={() => setModeId(m.id)}
                  className={`group relative rounded-3xl p-6 text-left bg-gradient-to-br ${m.gradient} shadow-xl transition-transform
                    ${m.comingSoon ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.03] hover:shadow-2xl'}`}
                >
                  <div className="text-6xl mb-3 transition-transform group-hover:scale-110">{m.emoji}</div>
                  <div className="text-2xl font-black text-white">{m.name}</div>
                  <div className="text-white/85 text-sm mt-1">{m.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default GameZoneModal
