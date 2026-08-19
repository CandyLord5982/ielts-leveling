import React, { useState } from 'react'
import { POWERUPS } from '../../hooks/useLiveBattle'

const PowerUpBar = ({ onActivate, teamAName, teamBName }) => {
  const [selecting, setSelecting] = useState(null) // powerup key being selected

  const handlePowerupClick = (key) => {
    if (key === 'swap') {
      // Swap doesn't need a team target
      onActivate('swap', 'a')
      return
    }
    setSelecting(key)
  }

  const handleTeamSelect = (team) => {
    if (!selecting) return
    const key = selecting

    // For steal and freeze, target is the OPPONENT team
    // So the "targetTeam" is the team that BENEFITS (activator)
    onActivate(key, team)
    setSelecting(null)
  }

  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
      <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">Power-Ups</div>

      {selecting ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-700 text-center">
            {POWERUPS[selecting]?.image ? <img src={POWERUPS[selecting].image} alt={POWERUPS[selecting].name} className="w-5 h-5 inline" /> : POWERUPS[selecting]?.icon} {POWERUPS[selecting]?.name} — Choose team:
          </div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => handleTeamSelect('a')}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold transition-colors"
            >
              {teamAName}
            </button>
            <button
              onClick={() => handleTeamSelect('b')}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors"
            >
              {teamBName}
            </button>
            <button
              onClick={() => setSelecting(null)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap justify-center">
          {Object.entries(POWERUPS).map(([key, pu]) => (
            <button
              key={key}
              onClick={() => handlePowerupClick(key)}
              className={`bg-gradient-to-r ${pu.color} text-white rounded-lg px-3 py-2 text-sm font-semibold hover:scale-105 active:scale-95 transition-transform shadow-lg flex items-center gap-1`}
              title={pu.description}
            >
              {pu.image ? <img src={pu.image} alt={pu.name} className="w-5 h-5" /> : <span className="text-base">{pu.icon}</span>}
              <span>{pu.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default PowerUpBar
