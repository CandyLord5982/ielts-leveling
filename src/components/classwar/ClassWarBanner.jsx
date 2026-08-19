import { Swords } from 'lucide-react';

const ClassWarBanner = ({ war, teamAXP, teamBXP, userTeam, onClick }) => {
  const totalXP = teamAXP + teamBXP || 1;
  const aPercent = Math.round((teamAXP / totalXP) * 100);

  return (
    <button
      onClick={onClick}
      className="w-full mb-4 rounded-xl overflow-hidden border border-gray-200 shadow-sm active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center">
        {/* Team A side */}
        <div className={`flex-1 px-3 py-2.5 bg-gradient-to-r from-red-500 to-red-400 text-white ${userTeam === 'A' ? 'ring-2 ring-inset ring-yellow-300' : ''}`}>
          <div className="text-[10px] font-medium opacity-80">{war.team_a_name}</div>
          <div className="text-lg font-extrabold">{teamAXP.toLocaleString()} <span className="text-xs font-normal opacity-70">XP</span></div>
        </div>

        {/* VS divider */}
        <div className="relative z-10 -mx-4 w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center shadow-lg shrink-0">
          <Swords className="w-4 h-4 text-yellow-400" />
        </div>

        {/* Team B side */}
        <div className={`flex-1 px-3 py-2.5 bg-gradient-to-l from-blue-500 to-blue-400 text-white text-right ${userTeam === 'B' ? 'ring-2 ring-inset ring-yellow-300' : ''}`}>
          <div className="text-[10px] font-medium opacity-80">{war.team_b_name}</div>
          <div className="text-lg font-extrabold">{teamBXP.toLocaleString()} <span className="text-xs font-normal opacity-70">XP</span></div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex h-1.5">
        <div className="bg-red-500 transition-all duration-500" style={{ width: `${aPercent}%` }} />
        <div className="bg-blue-500 transition-all duration-500" style={{ width: `${100 - aPercent}%` }} />
      </div>

      <div className="bg-gray-50 px-3 py-1 text-[10px] text-gray-500 text-center">
        Tap to see full scoreboard
      </div>
    </button>
  );
};

export default ClassWarBanner;
