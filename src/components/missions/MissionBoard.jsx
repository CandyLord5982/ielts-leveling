import { useState, useEffect, useCallback, useRef } from 'react'
import { useMissions } from '../../hooks/useMissions'
import { useAuth } from '../../hooks/useAuth'
import { useInventory } from '../../hooks/useInventory'
import { assetUrl } from '../../hooks/useBranding'
import ClaimCelebration from '../ui/ClaimCelebration'
import {
  CheckCircle, Clock,
  ChevronRight, Sparkles, Flame, Star, Crown, X
} from 'lucide-react'

const MISSION_IMAGE_MAP = {
  'target': '/icon/dashboard/wow.svg',
  'star': '/image/3_star.png',
  'trophy': '/icon/profile/paper.svg',
  'flame': '/icon/profile/streak.svg',
  'swords': '/icon/dashboard/pvp.png',
  'gamepad-2': '/image/dashboard/pet-type.webp',
  'book-open': '/image/dashboard/match1.png',
  'graduation-cap': '/pet-game/whack/mole-whacked.png',
  'zap': '/image/chest/legendary-chest.png',
  'gem': '/pet-game/astro/alien1.png',
  'medal': '/image/dashboard/pet-train.svg',
  'gift': '/image/dashboard/pet-scramble.jpg',
  'package-open': '/image/inventory/spaceships/phantom-voyager.png',
  'joystick': '/image/pet/game-win.png',
  'fish': '/pet-display/game-logo/fish.png',
}

const DEFAULT_MISSION_IMAGE = '/icon/dashboard/wow.svg'

const TAB_CONFIG = {
  daily: {
    label: 'Hàng ngày',
    rank: 'E',
    color: 'from-blue-500 to-blue-400',
    glowColor: 'rgba(59,130,246,0.3)',
    textColor: 'text-blue-600',
    borderColor: 'border-blue-300',
    cornerColor: 'from-blue-300/40',
    sideAccent: 'from-blue-400/50 via-blue-300/25',
    bgAccent: 'bg-blue-50',
    icon: Flame,
    emptyText: 'Không có nhiệm vụ hàng ngày',
    emptyDesc: 'Quay lại vào ngày mai!',
  },
  weekly: {
    label: 'Hàng tuần',
    rank: 'A',
    color: 'from-purple-500 to-purple-400',
    glowColor: 'rgba(147,51,234,0.3)',
    textColor: 'text-purple-600',
    borderColor: 'border-purple-300',
    cornerColor: 'from-purple-300/40',
    sideAccent: 'from-purple-400/50 via-purple-300/25',
    bgAccent: 'bg-purple-50',
    icon: Star,
    emptyText: 'Không có nhiệm vụ hàng tuần',
    emptyDesc: 'Quay lại vào tuần sau!',
  },
  special: {
    label: 'Đặc biệt',
    rank: 'S',
    color: 'from-amber-500 to-yellow-400',
    glowColor: 'rgba(245,158,11,0.3)',
    textColor: 'text-amber-600',
    borderColor: 'border-amber-300',
    cornerColor: 'from-amber-300/40',
    sideAccent: 'from-amber-400/50 via-amber-300/25',
    bgAccent: 'bg-amber-50',
    icon: Crown,
    emptyText: 'Không có nhiệm vụ đặc biệt',
    emptyDesc: 'Hãy chờ sự kiện tiếp theo!',
  },
}

const CLIP_CARD = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)'
const CLIP_TAB = 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)'
const CLIP_BTN = 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)'

const MissionBoard = () => {
  const { profile } = useAuth()
  const { missions, loading, unclaimedCount, fetchMissions, claimReward, claimAllRewards } = useMissions()
  const { fetchUnopenedChests, fetchInventory } = useInventory()
  const [activeTab, setActiveTab] = useState('daily')
  const [claimingId, setClaimingId] = useState(null)
  const [claimingAll, setClaimingAll] = useState(false)
  const [claimResult, setClaimResult] = useState(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    fetchMissions()
  }, [fetchMissions])

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 100)
    return () => clearTimeout(t)
  }, [])

  const refreshInventoryAfterClaim = () => {
    fetchUnopenedChests()
    fetchInventory()
  }

  const handleClaim = async (userMissionId) => {
    setClaimingId(userMissionId)
    try {
      const result = await claimReward(userMissionId)
      if (result?.success) {
        refreshInventoryAfterClaim()
        setClaimResult({
          xp: result.xp_earned,
          gems: result.gems_earned,
          title: result.mission_title
        })
      }
    } finally {
      setClaimingId(null)
    }
  }

  const handleClaimAll = async () => {
    setClaimingAll(true)
    try {
      const result = await claimAllRewards()
      if (result?.success && result.claimed_count > 0) {
        refreshInventoryAfterClaim()
        setClaimResult({
          xp: result.total_xp,
          gems: result.total_gems,
          title: `${result.claimed_count} nhiệm vụ`
        })
      }
    } finally {
      setClaimingAll(false)
    }
  }

  const allTabMissions = missions[activeTab] || []
  const regularMissions = [...allTabMissions.filter(m => m.goal_type !== 'complete_all_missions')].sort((a, b) => {
    const order = { active: 0, completed: 1, claimed: 2 }
    return (order[a.status] ?? 0) - (order[b.status] ?? 0)
  })
  const tabCompletionMission = allTabMissions.find(m => m.goal_type === 'complete_all_missions')
  const currentMissions = regularMissions
  const tabConfig = TAB_CONFIG[activeTab]

  const totalMissions = currentMissions.length
  const completedMissions = currentMissions.filter(m => m.status === 'completed' || m.status === 'claimed').length

  if (loading && currentMissions.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-blue-300/50 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
          </div>
          <p className="text-gray-400 mt-6 text-sm tracking-wider">
            Đang tải nhiệm vụ...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-24 md:pb-8 md:pt-4 relative">
      {/* Header */}
      <div className={`mb-6 transition-all duration-700 ${entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          Nhiệm vụ
        </h1>
        <div className="mt-1 w-16 h-[2px] bg-gradient-to-r from-blue-500 to-transparent" />
      </div>

      {/* Claim Celebration Overlay */}
      {claimResult && (
        <ClaimCelebration
          result={claimResult}
          onClose={() => setClaimResult(null)}
        />
      )}

      {/* Tab Switcher */}
      <div className={`flex gap-2 mb-5 transition-all duration-500 ${entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
           style={{ transitionDelay: '0.1s' }}>
        {Object.entries(TAB_CONFIG).map(([key, config]) => {
          const isActive = activeTab === key
          const missionList = missions[key] || []
          const unclaimed = missionList.filter(m => m.status === 'completed').length
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 relative py-3 px-3 font-semibold text-sm transition-all duration-300 border ${
                isActive
                  ? `bg-white ${config.borderColor} ${config.textColor} shadow-sm`
                  : 'bg-gray-50/50 border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
              }`}
              style={{ clipPath: CLIP_TAB }}
            >
              <span className="flex items-center justify-center gap-1.5">
                <span className="text-[10px] font-bold opacity-50">[{config.rank}]</span>
                {config.label}
              </span>
              {unclaimed > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.4)]">
                  {unclaimed}
                </span>
              )}
              {isActive && (
                <div className={`absolute bottom-0 left-[10%] right-[10%] h-[2px] bg-gradient-to-r ${config.color}`} />
              )}
            </button>
          )
        })}
      </div>

      {/* Progress Bar */}
      {totalMissions > 0 && (
        <div className={`mb-5 px-1 transition-all duration-500 ${entered ? 'opacity-100' : 'opacity-0'}`}
             style={{ transitionDelay: '0.2s' }}>
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5 tracking-wider uppercase">
            <span>Tiến độ {tabConfig.label.toLowerCase()}</span>
            <span className={`font-mono font-bold ${tabConfig.textColor}`}>{completedMissions}/{totalMissions}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${tabConfig.color} transition-all duration-700 relative`}
              style={{ width: `${totalMissions > 0 ? (completedMissions / totalMissions) * 100 : 0}%` }}
            >
              <div className="absolute inset-0 bg-white/30 animate-[shimmer_2s_infinite]" />
            </div>
          </div>
        </div>
      )}

      {/* Mission Cards */}
      <div className="space-y-3">
        {currentMissions.length === 0 ? (
          <div className={`text-center py-16 border ${tabConfig.borderColor} bg-white shadow-sm transition-all duration-500 ${entered ? 'opacity-100' : 'opacity-0'}`}
               style={{ clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)' }}>
            <tabConfig.icon className={`w-16 h-16 ${tabConfig.textColor} opacity-20 mx-auto mb-4`} />
            <h3 className="text-lg font-semibold text-gray-700">{tabConfig.emptyText}</h3>
            <p className="text-gray-400 text-sm mt-1">{tabConfig.emptyDesc}</p>
          </div>
        ) : (
          currentMissions.map((mission, index) => (
            <MissionCard
              key={mission.user_mission_id}
              mission={mission}
              tabConfig={tabConfig}
              onClaim={handleClaim}
              claiming={claimingId === mission.user_mission_id}
              index={index}
              entered={entered}
            />
          ))
        )}
      </div>

      {/* Tab completion bonus mission */}
      {tabCompletionMission && (
        <TabCompletionCard
          mission={tabCompletionMission}
          tabConfig={tabConfig}
          onClaim={handleClaim}
          claiming={claimingId === tabCompletionMission.user_mission_id}
          entered={entered}
          totalRegular={regularMissions.length}
        />
      )}

      {/* Reset timer */}
      <ResetTimer activeTab={activeTab} entered={entered} />
    </div>
  )
}

const formatDeadline = (endDate) => {
  if (!endDate) return null
  const end = new Date(endDate + 'T23:59:59+07:00')
  const now = new Date()
  const diff = end - now
  if (diff <= 0) return 'Đã hết hạn'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days > 1) return `Còn ${days} ngày`
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours > 0) return `Còn ${hours} giờ`
  const minutes = Math.floor(diff / (1000 * 60))
  return `Còn ${minutes} phút`
}

const MissionCard = ({ mission, tabConfig, onClaim, claiming, index, entered }) => {
  const missionImage = MISSION_IMAGE_MAP[mission.icon] || DEFAULT_MISSION_IMAGE
  const progress = mission.progress || 0
  const goal = mission.goal_value || 1
  const percentage = Math.min((progress / goal) * 100, 100)
  const isClaimed = mission.status === 'claimed'
  const isCompleted = mission.status === 'completed'
  const isActive = mission.status === 'active'
  const deadline = formatDeadline(mission.end_date)

  return (
    <div
      className={`relative overflow-hidden border transition-all duration-300 ${
        entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      } ${
        isClaimed
          ? 'bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-300 shadow-md shadow-emerald-100'
          : isCompleted
            ? `bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-300 shadow-lg shadow-amber-100 ring-1 ring-amber-200/50`
            : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md'
      }`}
      style={{
        transitionDelay: `${0.15 + index * 0.05}s`,
        clipPath: CLIP_CARD,
      }}
    >
      {/* Corner brackets */}
      {!isClaimed && !isCompleted && (
        <>
          <div className={`absolute top-0 left-[10px] w-5 h-[1px] bg-gradient-to-r ${tabConfig.cornerColor} to-transparent`} />
          <div className={`absolute top-0 left-[10px] w-[1px] h-5 bg-gradient-to-b ${tabConfig.cornerColor} to-transparent`} />
          <div className={`absolute bottom-0 right-[10px] w-5 h-[1px] bg-gradient-to-l ${tabConfig.cornerColor} to-transparent`} />
          <div className={`absolute bottom-0 right-[10px] w-[1px] h-5 bg-gradient-to-t ${tabConfig.cornerColor} to-transparent`} />
        </>
      )}

      {/* Shimmer for completed */}
      {isCompleted && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-200/20 to-transparent animate-[shimmer_3s_infinite]" />
      )}

      {/* Completed top border accent */}
      {isCompleted && (
        <div className={`absolute top-0 left-[10px] right-0 h-[2px] bg-gradient-to-r from-amber-400 to-yellow-400`} />
      )}

      {/* Active side accent */}
      {isActive && (
        <div className={`absolute top-[10px] left-0 w-[2px] h-[calc(100%-10px)] bg-gradient-to-b ${tabConfig.sideAccent} to-transparent`} />
      )}

      <div className="p-4 relative">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`flex-shrink-0 w-12 h-12 flex items-center justify-center border ${
            isClaimed
              ? 'bg-emerald-100 border-emerald-200'
              : isCompleted
                ? `bg-gradient-to-br ${tabConfig.color} border-transparent shadow-md`
                : `bg-gray-50 ${tabConfig.borderColor}`
          }`}
               style={{
                 clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
               }}
          >
            {isClaimed ? (
              <CheckCircle className="w-6 h-6 text-emerald-500" />
            ) : missionImage.startsWith('/') ? (
              <img src={assetUrl(missionImage)} alt="" className="w-9 h-9 object-contain" />
            ) : (
              <span className="text-2xl">{missionImage}</span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className={`font-semibold truncate ${
                isClaimed ? 'text-emerald-700' : 'text-gray-900'
              }`}>
                {mission.title}
              </h3>
              {/* Rewards */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {mission.reward_xp > 0 && (
                  <div className="flex flex-col items-center">
                    <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-6 h-6" />
                    <span className={`text-[10px] font-bold ${isClaimed ? 'text-emerald-600' : 'text-amber-500'}`}>
                      {mission.reward_xp}
                    </span>
                  </div>
                )}
                {mission.reward_gems > 0 && (
                  <div className="flex flex-col items-center">
                    <img src={assetUrl('/image/study/gem.png')} alt="Gems" className="w-6 h-6" />
                    <span className={`text-[10px] font-bold ${isClaimed ? 'text-emerald-600' : 'text-purple-500'}`}>
                      {mission.reward_gems}
                    </span>
                  </div>
                )}
                {mission.reward_item_name && (
                  <div className="flex flex-col items-center">
                    <img src={mission.reward_item_image || assetUrl('/image/study/gem.png')} alt={mission.reward_item_name} className="w-6 h-6 object-contain" />
                    <span className={`text-[10px] font-bold ${isClaimed ? 'text-emerald-600' : 'text-green-600'}`}>
                      {mission.reward_item_quantity > 1 ? `x${mission.reward_item_quantity}` : mission.reward_item_name}
                    </span>
                  </div>
                )}
                {mission.reward_chest_name && (
                  <div className="flex flex-col items-center">
                    <img src={mission.reward_chest_image || assetUrl('/image/chest/legendary-chest.png')} alt={mission.reward_chest_name} className="w-6 h-6 object-contain" />
                    <span className={`text-[10px] font-bold ${isClaimed ? 'text-emerald-600' : 'text-yellow-600'}`}>
                      {mission.reward_chest_name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <p className={`text-sm mt-0.5 ${isClaimed ? 'text-emerald-500/70' : 'text-gray-400'}`}>
              {mission.description}
            </p>

            {/* Deadline */}
            {deadline && !isClaimed && (
              <div className="flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3 text-amber-500" />
                <span className="text-[11px] font-medium text-amber-600">{deadline}</span>
              </div>
            )}

            {/* Progress bar */}
            {!isCompleted && !isClaimed && (
              <div className="mt-3">
                <div className="relative h-5 overflow-hidden bg-gray-100 border border-gray-200"
                     style={{ clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)' }}>
                  <div
                    className={`h-full transition-all duration-700 bg-gradient-to-r ${tabConfig.color}`}
                    style={{ width: `${percentage}%` }}
                  >
                    {percentage > 0 && (
                      <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
                    )}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center text-xs">
                    <span className="font-mono font-bold text-gray-600">
                      {progress}/{goal}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Claim button */}
        {isCompleted && (
          <button
            onClick={() => onClaim(mission.user_mission_id)}
            disabled={claiming}
            className={`mt-3 w-full py-2.5 font-bold text-sm transition-all
              bg-gradient-to-r ${tabConfig.color} text-white
              hover:brightness-110 active:brightness-90
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2 tracking-wider uppercase shadow-sm`}
            style={{ clipPath: CLIP_BTN }}
          >
            {claiming ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                Đang nhận...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Nhận thưởng
              </>
            )}
          </button>
        )}

        {isClaimed && (
          <div className="mt-3 w-full py-2 text-center text-xs text-emerald-600 font-semibold flex items-center justify-center gap-1.5 tracking-wider uppercase">
            <CheckCircle className="w-3.5 h-3.5" />
            Đã nhận thưởng
          </div>
        )}
      </div>
    </div>
  )
}

const TabCompletionCard = ({ mission, tabConfig, onClaim, claiming, entered, totalRegular }) => {
  const progress = mission.progress || 0
  const goal = mission.goal_value || totalRegular
  const percentage = Math.min((progress / goal) * 100, 100)
  const isClaimed = mission.status === 'claimed'
  const isCompleted = mission.status === 'completed'
  const chestImage = mission.reward_chest_image || assetUrl('/image/chest/legendary-chest.png')
  const missionIcon = MISSION_IMAGE_MAP[mission.icon] || DEFAULT_MISSION_IMAGE
  const displayImage = mission.icon ? assetUrl(missionIcon) : chestImage

  return (
    <div
      className={`mt-4 relative overflow-hidden border-2 transition-all duration-500 ${
        entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      } ${
        isClaimed
          ? 'bg-gray-50 border-gray-200 opacity-50'
          : isCompleted
            ? `bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-400 shadow-lg shadow-amber-100`
            : `bg-gradient-to-r from-gray-50 to-white ${tabConfig.borderColor} shadow-sm`
      }`}
      style={{
        transitionDelay: '0.4s',
        clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)',
      }}
    >
      {/* Shimmer bg for completed */}
      {isCompleted && !isClaimed && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-200/20 to-transparent animate-[shimmer_3s_infinite]" />
      )}

      <div className="p-4 relative">
        <div className="flex items-center gap-4">
          {/* Chest icon */}
          <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center ${
            isClaimed ? 'bg-gray-100' : isCompleted ? 'bg-amber-100' : 'bg-gray-100'
          }`}>
            {isClaimed ? (
              <CheckCircle className="w-8 h-8 text-gray-400" />
            ) : (
              <img src={displayImage} alt="" className={`w-11 h-11 object-contain ${!isCompleted && progress === 0 ? 'grayscale opacity-50' : ''}`} />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`font-bold truncate ${isClaimed ? 'text-gray-400' : 'text-gray-900'}`}>
                    {mission.title}
                  </h3>
                  {!isClaimed && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-600 uppercase tracking-wider flex-shrink-0">
                      Bonus
                    </span>
                  )}
                </div>
                <p className={`text-sm mt-0.5 ${isClaimed ? 'text-gray-300' : 'text-gray-500'}`}>
                  {mission.description}
                </p>
              </div>

              {/* Rewards */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {mission.reward_chest_name && (
                  <div className={`flex flex-col items-center ${isClaimed ? 'opacity-30' : ''}`}>
                    <img src={chestImage} alt={mission.reward_chest_name} className="w-6 h-6 object-contain" />
                    <span className={`text-[10px] font-bold ${isClaimed ? 'text-gray-400' : 'text-yellow-600'}`}>
                      {mission.reward_chest_name}
                    </span>
                  </div>
                )}
                {mission.reward_xp > 0 && (
                  <div className={`flex flex-col items-center ${isClaimed ? 'opacity-30' : ''}`}>
                    <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-6 h-6" />
                    <span className={`text-[10px] font-bold ${isClaimed ? 'text-gray-400' : 'text-amber-500'}`}>
                      {mission.reward_xp}
                    </span>
                  </div>
                )}
                {mission.reward_gems > 0 && (
                  <div className={`flex flex-col items-center ${isClaimed ? 'opacity-30' : ''}`}>
                    <img src={assetUrl('/image/study/gem.png')} alt="Gems" className="w-6 h-6" />
                    <span className={`text-[10px] font-bold ${isClaimed ? 'text-gray-400' : 'text-purple-500'}`}>
                      {mission.reward_gems}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {!isCompleted && !isClaimed && (
          <div className="mt-3">
            <div className="relative h-6 overflow-hidden bg-gray-100 border border-gray-200 rounded-lg">
              <div
                className="h-full transition-all duration-700 bg-gradient-to-r from-amber-400 to-yellow-400"
                style={{ width: `${percentage}%` }}
              >
                {percentage > 0 && (
                  <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
                )}
              </div>
              <div className="absolute inset-0 flex items-center justify-center text-xs">
                <span className="font-mono font-bold text-gray-600">
                  {progress}/{goal}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Claim button */}
        {isCompleted && (
          <button
            onClick={() => onClaim(mission.user_mission_id)}
            disabled={claiming}
            className="mt-3 w-full py-3 font-bold text-sm transition-all
              bg-gradient-to-r from-amber-500 to-yellow-400 text-white
              hover:brightness-110 active:brightness-90
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2 tracking-wider uppercase
              shadow-md shadow-amber-200/50 rounded-lg"
          >
            {claiming ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                Đang nhận...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Nhận rương thưởng
              </>
            )}
          </button>
        )}

        {isClaimed && (
          <div className="mt-3 w-full py-2 text-center text-xs text-emerald-600 font-semibold flex items-center justify-center gap-1.5 tracking-wider uppercase">
            <CheckCircle className="w-3.5 h-3.5" />
            Đã nhận thưởng
          </div>
        )}
      </div>
    </div>
  )
}

const ResetTimer = ({ activeTab, entered }) => {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date()
      const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))

      let target
      if (activeTab === 'daily') {
        target = new Date(vnNow)
        target.setDate(target.getDate() + 1)
        target.setHours(0, 0, 0, 0)
      } else if (activeTab === 'weekly') {
        target = new Date(vnNow)
        const daysUntilMonday = (8 - target.getDay()) % 7 || 7
        target.setDate(target.getDate() + daysUntilMonday)
        target.setHours(0, 0, 0, 0)
      } else {
        setTimeLeft('')
        return
      }

      const diff = target - vnNow
      if (diff <= 0) {
        setTimeLeft('Đang làm mới...')
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [activeTab])

  if (!timeLeft || activeTab === 'special') return null

  return (
    <div className={`mt-6 text-center transition-all duration-500 ${entered ? 'opacity-100' : 'opacity-0'}`}
         style={{ transitionDelay: '0.5s' }}>
      <div className="inline-flex items-center gap-3 border border-gray-200 bg-white shadow-sm px-5 py-2.5"
           style={{ clipPath: CLIP_BTN }}>
        <Clock className="w-4 h-4 text-blue-400" />
        <span className="text-xs text-gray-400 tracking-wider uppercase">Làm mới sau</span>
        <span className="font-mono font-bold text-blue-500 text-sm tracking-widest">{timeLeft}</span>
      </div>
    </div>
  )
}

export default MissionBoard
