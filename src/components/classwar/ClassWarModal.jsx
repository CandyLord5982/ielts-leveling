import { X, Swords } from 'lucide-react';
import ClassWarPanel from './ClassWarPanel';

const ClassWarModal = ({ war, teamA, teamB, teamAXP, teamBXP, userTeam, userId, rewards, isTeacher = false, onClose }) => {
  const totalXP = teamAXP + teamBXP || 1;
  const aPercent = Math.round((teamAXP / totalXP) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full sm:max-w-lg max-h-[90vh] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden animate-slideUp flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 via-gray-900 to-blue-600 px-4 py-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Swords className="w-5 h-5 text-yellow-400" />
              <span className="font-bold">{war.name || 'Class War'}</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* XP comparison */}
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-xs opacity-70">{war.team_a_name}</div>
              <div className="text-2xl font-extrabold">{teamAXP.toLocaleString()}</div>
            </div>
            <div className="text-xs opacity-50 mb-1">VS</div>
            <div className="text-right">
              <div className="text-xs opacity-70">{war.team_b_name}</div>
              <div className="text-2xl font-extrabold">{teamBXP.toLocaleString()}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex h-2 rounded-full overflow-hidden">
            <div className="bg-red-400 transition-all duration-500" style={{ width: `${aPercent}%` }} />
            <div className="bg-blue-400 transition-all duration-500" style={{ width: `${100 - aPercent}%` }} />
          </div>
        </div>

        {/* Teams */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <ClassWarPanel
            team="A"
            teamName={war.team_a_name}
            members={teamA}
            totalXP={teamAXP}
            opponentXP={teamBXP}
            userId={userId}
            rewards={rewards}
            isTeacher={isTeacher}
            compact
          />
          <ClassWarPanel
            team="B"
            teamName={war.team_b_name}
            members={teamB}
            totalXP={teamBXP}
            opponentXP={teamAXP}
            userId={userId}
            rewards={rewards}
            isTeacher={isTeacher}
            compact
          />
        </div>
      </div>
    </div>
  );
};

export default ClassWarModal;
