import { useState } from 'react'
import { X, Star, Flame, Trophy, Target, Zap, BookOpen, Crown, Heart, Shield, Gift } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'

import { assetUrl } from '../../hooks/useBranding';
const AchievementModal = ({ isOpen, onClose, achievements, userStats, onClaimXP, userAchievements = [], challengeWinCounts = {} }) => {
  const [claiming, setClaiming] = useState({})
  const [claimMessage, setClaimMessage] = useState('')

  if (!isOpen) return null

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

  const handleClaimXP = async (achievementId) => {
    setClaiming(prev => ({ ...prev, [achievementId]: true }))
    setClaimMessage('')
    
    try {
      const result = await onClaimXP(achievementId)
      if (result.success) {
        setClaimMessage(`+${result.xpAwarded}  đã được cộng!`)
        setTimeout(() => setClaimMessage(''), 3000)
      } else {
        setClaimMessage(result.message)
        setTimeout(() => setClaimMessage(''), 3000)
      }
    } catch (error) {
      setClaimMessage('Có lỗi xảy ra khi nhận ')
      setTimeout(() => setClaimMessage(''), 3000)
    } finally {
      setClaiming(prev => ({ ...prev, [achievementId]: false }))
    }
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

    let progress = 0
    let unlocked = false

    // Check if this is a daily challenge achievement (manually awarded)
    if (achievement.criteria_type && achievement.criteria_type.startsWith('daily_challenge_rank_')) {
      // Check if user has this achievement in their earned achievements
      unlocked = userAchievements.some(ua => ua.achievement_id === achievement.id)
      progress = unlocked ? 100 : 0
    } else {
      // Regular achievements based on stats
      switch (achievement.criteria_type) {
        case 'exercise_completed':
          progress = Math.min((completedCount / achievement.criteria_value) * 100, 100)
          unlocked = completedCount >= achievement.criteria_value
          break
        case 'daily_streak':
          progress = Math.min((currentStreak / achievement.criteria_value) * 100, 100)
          unlocked = currentStreak >= achievement.criteria_value
          break
        case 'total_xp':
          progress = Math.min((totalXp / achievement.criteria_value) * 100, 100)
          unlocked = totalXp >= achievement.criteria_value
          break
        case 'daily_exercises':
          progress = 0
          unlocked = false
          break
        case 'pet_owned':
          progress = Math.min(((userStats?.petCount || 0) / achievement.criteria_value) * 100, 100)
          unlocked = (userStats?.petCount || 0) >= achievement.criteria_value
          break
        case 'pet_evolved':
          progress = Math.min(((userStats?.petEvolvedCount || 0) / achievement.criteria_value) * 100, 100)
          unlocked = (userStats?.petEvolvedCount || 0) >= achievement.criteria_value
          break
        case 'avatar_owned':
        case 'frame_owned':
        case 'spaceship_owned':
        case 'hammer_owned':
        case 'boat_owned': {
          const cat = achievement.criteria_type.replace('_owned', '')
          const count = userStats?.shopCounts?.[cat] || 0
          progress = Math.min((count / achievement.criteria_value) * 100, 100)
          unlocked = count >= achievement.criteria_value
          break
        }
        case 'wild_catch_success': {
          const wc = userStats?.wildCatchCount || 0
          progress = Math.min((wc / achievement.criteria_value) * 100, 100)
          unlocked = wc >= achievement.criteria_value
          break
        }
        default:
          progress = 0
          unlocked = false
      }
    }

    // Check if achievement is claimed
    const userAchievement = userAchievements.find(ua => ua.achievement_id === achievement.id)
    const claimed = userAchievement?.claimed_at !== null

    return {
      progress: Math.round(progress),
      unlocked,
      date: unlocked ? 'Đã mở khóa' : null,
      claimed,
      xpToClaim: achievement.xp_reward || 0
    }
  }

  const unlockedAchievements = achievements.filter(achievement => {
    const { unlocked } = calculateProgress(achievement)
    return unlocked
  })

  const lockedAchievements = achievements.filter(achievement => {
    const { unlocked } = calculateProgress(achievement)
    return !unlocked
  })

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Thành tích</h2>
              <p className="text-gray-600">
                {unlockedAchievements.length}/{achievements.length} thành tích đã đạt được
              </p>
            </div>
            <Button variant="ghost" onClick={onClose} className="p-2">
              <X className="w-6 h-6" />
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Tiến độ tổng thể</span>
              <span>{Math.round((unlockedAchievements.length / achievements.length) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-yellow-500 to-orange-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${(unlockedAchievements.length / achievements.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Claim Message */}
          {claimMessage && (
            <div className={`mb-4 p-3 rounded-lg ${
              claimMessage.includes('+') 
                ? 'bg-green-100 text-green-800 border border-green-200' 
                : 'bg-red-100 text-red-800 border border-red-200'
            }`}>
              {claimMessage}
            </div>
          )}

          {/* Unlocked Achievements */}
          {unlockedAchievements.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Trophy className="w-5 h-5 mr-2 text-yellow-500" />
                Đã đạt được ({unlockedAchievements.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {unlockedAchievements.map((achievement) => {
                  const IconComponent = getIconComponent(achievement.icon)
                  const { progress, unlocked, date, claimed } = calculateProgress(achievement)
                  
                  return (
                    <Card
                      key={achievement.id}
                      className={`p-4 border-2 ${
                        unlocked
                          ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-300'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="relative">
                          {achievement.badge_image_url ? (
                            <img
                              src={achievement.badge_image_url}
                              alt={achievement.badge_image_alt || achievement.title}
                              className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md"
                            />
                          ) : (
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getBadgeColorClass(achievement.badge_color)}`}>
                              <IconComponent className="w-6 h-6 text-white" />
                            </div>
                          )}
                          {unlocked && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs">✓</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                            {achievement.title}
                            {achievement.criteria_type?.startsWith('daily_challenge_rank_') && getWinCount(achievement) > 0 && (
                              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded font-bold">
                                ×{getWinCount(achievement)}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">{achievement.description}</div>
                          {achievement.xp_reward > 0 && (
                            <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                              +{achievement.xp_reward}
                              <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3 h-3" />
                            </div>
                          )}
                          {unlocked && (
                            <div className="text-xs text-green-600 mt-1">
                              ✓ {date}
                            </div>
                          )}
                          
                          {/* Claim Button */}
                          {unlocked && achievement.xp_reward > 0 && !claimed && (
                            <div className="mt-3">
                              <Button
                                size="sm"
                                onClick={() => handleClaimXP(achievement.id)}
                                disabled={claiming[achievement.id]}
                                className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 text-white"
                              >
                                <Gift className="w-4 h-4" />
                                <span>
                                  {claiming[achievement.id] ? 'Đang nhận...' : `Nhận ${achievement.xp_reward} `}
                                </span>
                              </Button>
                            </div>
                          )}
                          
                          {claimed && (
                            <div className="mt-2 text-xs text-green-600 font-medium">
                              ✓ Đã nhận 
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Locked Achievements */}
          {lockedAchievements.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Target className="w-5 h-5 mr-2 text-gray-500" />
                Chưa đạt được ({lockedAchievements.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lockedAchievements.map((achievement) => {
                  const IconComponent = getIconComponent(achievement.icon)
                  const { progress, unlocked } = calculateProgress(achievement)
                  
                  return (
                    <Card
                      key={achievement.id}
                      className="p-4 bg-gray-50 border-gray-200 opacity-75"
                    >
                      <div className="flex items-start space-x-3">
                        <div className="relative">
                          {achievement.badge_image_url ? (
                            <img
                              src={achievement.badge_image_url}
                              alt={achievement.badge_image_alt || achievement.title}
                              className="w-12 h-12 rounded-full object-cover border-2 border-gray-300 grayscale"
                            />
                          ) : (
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getBadgeColorClass(achievement.badge_color)} opacity-50`}>
                              <IconComponent className="w-6 h-6 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-gray-700">{achievement.title}</div>
                          <div className="text-sm text-gray-500">{achievement.description}</div>
                          {achievement.xp_reward > 0 && (
                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                              +{achievement.xp_reward}
                              <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3 h-3" />
                            </div>
                          )}
                          <div className="mt-2">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-gray-400 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {progress}% hoàn thành
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AchievementModal
