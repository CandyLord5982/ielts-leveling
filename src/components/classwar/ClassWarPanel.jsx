import { Star, Crown, Flame, Gift } from 'lucide-react';
import { assetUrl } from '../../hooks/useBranding';

const teamThemes = {
  A: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    headerBg: 'bg-gradient-to-r from-red-600 to-red-500',
    accent: 'text-red-600',
    barBg: 'bg-red-200',
    barFill: 'bg-red-500',
    highlight: 'bg-red-100 ring-2 ring-red-400',
    xpBadge: 'bg-red-100 text-red-700',
  },
  B: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    headerBg: 'bg-gradient-to-r from-blue-600 to-blue-500',
    accent: 'text-blue-600',
    barBg: 'bg-blue-200',
    barFill: 'bg-blue-500',
    highlight: 'bg-blue-100 ring-2 ring-blue-400',
    xpBadge: 'bg-blue-100 text-blue-700',
  },
};

const RewardBadge = ({ reward, label }) => {
  if (!reward) return null;
  const parts = [];
  if (reward.xp > 0) parts.push({ type: 'xp', value: reward.xp });
  if (reward.gems > 0) parts.push({ type: 'gems', value: reward.gems });
  if (reward.items?.length > 0) {
    reward.items.forEach(i => parts.push({ type: 'item', value: `${i.item_name} x${i.quantity}`, image: i.image_url }));
  }
  if (parts.length === 0) return null;

  return (
    <div className="mt-1 bg-white/15 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/20">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Gift className="w-3.5 h-3.5 text-yellow-300" />
        <span className="font-bold text-yellow-200 text-xs">{label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {parts.map((p, i) => (
          <span key={i} className="flex items-center gap-1 bg-white/15 rounded-md px-2 py-0.5">
            {p.type === 'xp' && <><img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-4 h-4" /><span className="text-xs font-bold text-yellow-100">{p.value}</span></>}
            {p.type === 'gems' && <><img src={assetUrl('/image/study/gem.png')} alt="Gems" className="w-4 h-4" /><span className="text-xs font-bold text-yellow-100">{p.value}</span></>}
            {p.type === 'item' && <>{p.image && <img src={p.image} alt="" className="w-4 h-4 object-contain" />}<span className="text-xs font-bold text-yellow-100">{p.value}</span></>}
          </span>
        ))}
      </div>
    </div>
  );
};

const ClassWarPanel = ({ team, teamName, members, totalXP, opponentXP, userId, rewards, compact = false, isTeacher = false }) => {
  const theme = teamThemes[team] || teamThemes.A;
  const isWinning = totalXP > opponentXP;
  const maxXP = Math.max(totalXP, opponentXP, 1);

  return (
    <div className={`${theme.bg} ${theme.border} border rounded-xl overflow-hidden ${compact ? '' : 'sticky top-6'}`}>
      {/* Header */}
      <div className={`${theme.headerBg} px-4 py-3 text-white relative overflow-hidden`}>
        {/* Animated background glow */}
        <div className="absolute inset-0 opacity-20">
          <div className={`absolute -top-8 -left-8 w-32 h-32 rounded-full blur-2xl animate-pulse ${team === 'A' ? 'bg-red-300' : 'bg-blue-300'}`} />
          <div className={`absolute -bottom-8 -right-8 w-24 h-24 rounded-full blur-2xl animate-pulse delay-700 ${team === 'A' ? 'bg-orange-300' : 'bg-cyan-300'}`} />
        </div>
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isWinning && totalXP > 0 && <Crown className="w-5 h-5 text-yellow-300 animate-bounce" />}
              <span className="font-extrabold text-lg tracking-wide uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
                style={{ textShadow: '0 0 12px rgba(255,255,255,0.3), 0 0 24px rgba(255,255,255,0.15)' }}
              >
                {teamName}
              </span>
            </div>
            <span className="text-xs opacity-80 bg-white/10 px-2 py-0.5 rounded-full">{members.length} members</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Flame className="w-5 h-5 text-yellow-300" />
            <span className="text-2xl font-extrabold">{totalXP.toLocaleString()}</span>
            <span className="text-xs opacity-70">XP</span>
          </div>
        </div>
        {/* XP bar */}
        <div className={`mt-2 h-2 ${theme.barBg} rounded-full overflow-hidden`}>
          <div
            className={`h-full ${theme.barFill} rounded-full transition-all duration-500`}
            style={{ width: `${Math.round((totalXP / maxXP) * 100)}%` }}
          />
        </div>
        {/* Rewards */}
        {rewards && (
          <div className="mt-2">
            <RewardBadge reward={isWinning ? rewards.winner : rewards.loser} label={isWinning ? 'Reward' : 'Reward'} />
          </div>
        )}
      </div>

      {/* Member list */}
      <div className={`p-3 space-y-1.5 ${compact ? 'max-h-48' : 'max-h-[60vh]'} overflow-y-auto`}>
        {members.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">No members yet</p>
        )}
        {members.map((member, idx) => {
          const isCurrentUser = member.id === userId;
          const isSupporter = member.isSupporter;
          return (
            <div
              key={member.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                isSupporter ? 'bg-yellow-50 border border-dashed border-yellow-300' :
                isCurrentUser ? theme.highlight : 'hover:bg-white/60'
              }`}
            >
              {/* Rank */}
              <span className="w-5 text-center text-xs font-bold text-gray-400">
                {isSupporter ? (
                  <span className="text-yellow-500">★</span>
                ) : idx === 0 && members.length > 1 ? (
                  <Star className="w-3.5 h-3.5 text-yellow-500 inline" />
                ) : (
                  idx + 1
                )}
              </span>

              {/* Avatar */}
              <div className={`w-7 h-7 rounded-full overflow-hidden shrink-0 ${isSupporter ? 'bg-yellow-200' : 'bg-gray-200'}`}>
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-500">
                    {isSupporter ? '🤝' : (member.name || '?')[0].toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name */}
              <span className={`flex-1 truncate text-xs ${isSupporter ? 'text-yellow-700 italic' : isCurrentUser ? 'font-bold' : 'text-gray-700'}`}>
                {isTeacher && member.real_name ? member.real_name : member.name}
                {isCurrentUser && <span className="ml-1 text-[10px] opacity-60">(you)</span>}
              </span>

              {/* XP */}
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isSupporter ? 'bg-yellow-100 text-yellow-700' : theme.xpBadge}`}>
                {member.xp}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClassWarPanel;
