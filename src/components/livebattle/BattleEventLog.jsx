import React from 'react'

const typeStyles = {
  points_add: 'text-green-600',
  points_remove: 'text-red-500',
  team_add: 'text-green-500',
  team_remove: 'text-red-400',
  powerup: 'text-amber-600',
  blocked: 'text-cyan-600',
}

const BattleEventLog = ({ events, teamAName, teamBName }) => {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Event Log</div>
        <div className="text-gray-400 text-xs text-center py-2">No events yet</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
      <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Event Log</div>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {events.map((event, idx) => (
          <div key={event.ts + '-' + idx} className="flex items-center gap-2 text-xs">
            <span className={`font-semibold ${event.team === 'a' ? 'text-red-500' : 'text-blue-500'}`}>
              {event.team === 'a' ? teamAName : teamBName}
            </span>
            <span className={typeStyles[event.type] || 'text-gray-500'}>
              {event.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default BattleEventLog
