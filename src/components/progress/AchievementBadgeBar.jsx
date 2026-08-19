import { useState } from 'react'
import { Trophy, Star, Flame, Target, Zap, BookOpen, Crown, Heart, Shield } from 'lucide-react'
import AchievementModal from './AchievementModal'

import { assetUrl } from '../../hooks/useBranding';
const AchievementBadgeBar = ({ achievements, userStats, onClaimXP, userAchievements = [], claimedFallbackAchievements = new Set(), challengeWinCounts = {} }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [claimingAchievements, setClaimingAchievements] = useState(new Set())

  // Helper function to get win count for a daily challenge achievement
  const getWinCount = (achievement) => {
    if (!achievement.criteria_type?.startsWith('daily_challenge_rank_')) return 0

    // Extract rank from criteria_type (e.g., "daily_challenge_rank_1_beginner" -> "rank_1")
    const match = achievement.criteria_type.match(/rank_(\d)/)
    if (match) {
      const rankKey = `rank_${match[1]}`
      return challengeWinCounts[rankKey] || 0
    }
    return 0
  }

  const getIconComponent = (iconName) => {
    const icons = {
      Star,
      Flame,
      Trophy,
      Target,
      Zap,
      BookOpen,
      Crown,
      Heart,
      Shield
    }
    return icons[iconName] || Star
  }

  const getBadgeColorClass = (color) => {
    const colorMap = {
      'blue': 'bg-blue-500',
      'green': 'bg-green-500',
      'red': 'bg-red-500',
      'yellow': 'bg-yellow-500',
      'purple': 'bg-purple-500',
      'pink': 'bg-pink-500',
      'indigo': 'bg-indigo-500',
      'orange': 'bg-orange-500'
    }
    return colorMap[color] || 'bg-blue-500'
  }

  const calculateProgress = (achievement) => {
    const completedCount = userStats?.completedExercises || 0
    const currentStreak = userStats?.currentStreak || 0
    const totalXp = userStats?.totalXp || 0

    let unlocked = false

    // Check if this is a daily challenge achievement (manually awarded)
    if (achievement.criteria_type && achievement.criteria_type.startsWith('daily_challenge_rank_')) {
      // Check if user has this achievement in their earned achievements
      unlocked = userAchievements.some(ua => ua.achievement_id === achievement.id)
    } else {
      // Regular achievements based on stats
      switch (achievement.criteria_type) {
        case 'exercise_completed':
          unlocked = completedCount >= achievement.criteria_value
          break
        case 'daily_streak':
          unlocked = currentStreak >= achievement.criteria_value
          break
        case 'total_xp':
          unlocked = totalXp >= achievement.criteria_value
          break
        case 'daily_exercises':
          unlocked = false
          break
        case 'pet_owned':
          unlocked = (userStats?.petCount || 0) >= achievement.criteria_value
          break
        case 'pet_evolved':
          unlocked = (userStats?.petEvolvedCount || 0) >= achievement.criteria_value
          break
        case 'avatar_owned':
        case 'frame_owned':
        case 'spaceship_owned':
        case 'hammer_owned':
        case 'boat_owned': {
          const cat = achievement.criteria_type.replace('_owned', '')
          unlocked = (userStats?.shopCounts?.[cat] || 0) >= achievement.criteria_value
          break
        }
        case 'wild_catch_success':
          unlocked = (userStats?.wildCatchCount || 0) >= achievement.criteria_value
          break
        default:
          unlocked = false
      }
    }

    return unlocked
  }

  const unlockedAchievements = achievements.filter(achievement => calculateProgress(achievement))
  const lockedAchievements = achievements.filter(achievement => !calculateProgress(achievement))

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900">Thành tích</h3>
            <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-1 rounded-full">
              {unlockedAchievements.length}/{achievements.length}
            </span>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Xem tất cả →
          </button>
        </div>

        {/* Unlocked Badges */}
        {unlockedAchievements.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Đã đạt được</h4>
            <div className="space-y-3">
              {unlockedAchievements.slice(0, 3).map((achievement) => {
                const IconComponent = getIconComponent(achievement.icon)
                const userAchievement = userAchievements.find(ua => ua.achievement_id === achievement.id)
                const claimed = userAchievement?.claimed_at !== null || claimedFallbackAchievements.has(achievement.id)

                return (
                  <div
                    key={achievement.id}
                    className="flex items-center justify-between p-3 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      {achievement.badge_image_url ? (
                        <img
                          src={achievement.badge_image_url}
                          alt={achievement.badge_image_alt || achievement.title}
                          className="w-8 h-8 rounded-full object-cover border-2 border-yellow-300"
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getBadgeColorClass(achievement.badge_color)}`}>
                          <IconComponent className="w-4 h-4 text-white" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900 text-sm flex items-center gap-2">
                          {achievement.title}
                          {achievement.criteria_type?.startsWith('daily_challenge_rank_') && getWinCount(achievement) > 0 && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">
                              ×{getWinCount(achievement)}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 flex items-center gap-1">
                          +{achievement.xp_reward}
                          <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3 h-3" />
                        </div>
                      </div>
                    </div>

                    {achievement.xp_reward > 0 && !claimed && (
                      <button
                        onClick={async () => {
                          setClaimingAchievements(prev => new Set([...prev, achievement.id]))
                          try {
                            const result = await onClaimXP(achievement.id)
                            if (result.success) {
                              // Button will disappear as claimed status updates
                            }
                          } finally {
                            setClaimingAchievements(prev => {
                              const newSet = new Set(prev)
                              newSet.delete(achievement.id)
                              return newSet
                            })
                          }
                        }}
                        disabled={claimingAchievements.has(achievement.id)}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-xs font-medium rounded-md transition-colors"
                      >
                        {claimingAchievements.has(achievement.id) ? 'Đang nhận...' : 'Nhận thưởng'}
                      </button>
                    )}

                    {claimed && (
                      <div className="text-xs text-green-600 font-medium">
                        ✓ Đã nhận
                      </div>
                    )}
                  </div>
                )
              })}
              {unlockedAchievements.length > 3 && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="w-full p-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Xem {unlockedAchievements.length - 3} thành tích khác →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Next Achievement Preview */}
        {lockedAchievements.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Tiếp theo</h4>
            <div className="flex items-center space-x-2">
              {lockedAchievements.slice(0, 3).map((achievement) => {
                const IconComponent = getIconComponent(achievement.icon)
                return (
                  <div
                    key={achievement.id}
                    className="relative group cursor-pointer opacity-60"
                    title={achievement.title}
                  >
                    {achievement.badge_image_url ? (
                      <img
                        src={achievement.badge_image_url}
                        alt={achievement.badge_image_alt || achievement.title}
                        className="w-8 h-8 rounded-full object-cover border-2 border-gray-300 grayscale"
                      />
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getBadgeColorClass(achievement.badge_color)} opacity-50`}>
                        <IconComponent className="w-4 h-4 text-white" />
                      </div>
                    )}
                    
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                      {achievement.title}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Tiến độ tổng thể</span>
            <span>{Math.round((unlockedAchievements.length / achievements.length) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-yellow-500 to-orange-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(unlockedAchievements.length / achievements.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Modal */}
      <AchievementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        achievements={achievements}
        userStats={userStats}
        onClaimXP={onClaimXP}
        userAchievements={userAchievements}
        challengeWinCounts={challengeWinCounts}
      />
    </>
  )
}

export default AchievementBadgeBar
