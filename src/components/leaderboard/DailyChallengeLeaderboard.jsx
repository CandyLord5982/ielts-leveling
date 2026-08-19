import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import { useDailyChallenge } from '../../hooks/useDailyChallenge'
import { getVietnamDate } from '../../utils/vietnamTime'
import Card from '../ui/Card'
import Button from '../ui/Button'
import { Trophy, Medal, Crown, Star, Clock, Target, Calendar, RefreshCw } from 'lucide-react'
import AvatarWithFrame from '../ui/AvatarWithFrame'

const DailyChallengeLeaderboard = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { fetchLeaderboard, fetchTodayChallenge } = useDailyChallenge()

  const [difficultyLevel, setDifficultyLevel] = useState('beginner')
  const [leaderboardData, setLeaderboardData] = useState([])
  const [todayChallenge, setTodayChallenge] = useState(null)

  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selectedDate, setSelectedDate] = useState(getVietnamDate())
  const [countdownText, setCountdownText] = useState('')
  const [achievementRewards, setAchievementRewards] = useState({
    beginner: { top1: { xp: 80, gems: 15 }, top2: { xp: 60, gems: 12 }, top3: { xp: 40, gems: 8 } },
    intermediate: { top1: { xp: 120, gems: 20 }, top2: { xp: 90, gems: 15 }, top3: { xp: 60, gems: 12 } },
    advanced: { top1: { xp: 160, gems: 25 }, top2: { xp: 120, gems: 20 }, top3: { xp: 80, gems: 16 } }
  })

  useEffect(() => {
    loadTodayChallenge()
    fetchAchievementRewards()
  }, [user])

  useEffect(() => {
    loadLeaderboard()
  }, [difficultyLevel, selectedDate])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      loadLeaderboard()
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh, difficultyLevel, selectedDate])

  // Countdown to next challenge
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date()
      const tomorrow = new Date(now)
      tomorrow.setHours(24, 0, 0, 0)

      const diff = tomorrow - now
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setCountdownText(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)

    return () => clearInterval(timer)
  }, [])

  const fetchAchievementRewards = async () => {
    try {
      const { data: achievements, error } = await supabase
        .from('achievements')
        .select('criteria_type, xp_reward, gem_reward')
        .like('criteria_type', 'daily_challenge_rank_%')
        .eq('is_active', true)

      if (error) throw error

      if (achievements) {
        const rewards = {
          beginner: { top1: { xp: 80, gems: 15 }, top2: { xp: 60, gems: 12 }, top3: { xp: 40, gems: 8 } },
          intermediate: { top1: { xp: 120, gems: 20 }, top2: { xp: 90, gems: 15 }, top3: { xp: 60, gems: 12 } },
          advanced: { top1: { xp: 160, gems: 25 }, top2: { xp: 120, gems: 20 }, top3: { xp: 80, gems: 16 } }
        }

        achievements.forEach(achievement => {
          if (achievement.criteria_type === 'daily_challenge_rank_1_beginner') {
            rewards.beginner.top1 = { xp: achievement.xp_reward, gems: achievement.gem_reward }
          } else if (achievement.criteria_type === 'daily_challenge_rank_2_beginner') {
            rewards.beginner.top2 = { xp: achievement.xp_reward, gems: achievement.gem_reward }
          } else if (achievement.criteria_type === 'daily_challenge_rank_3_beginner') {
            rewards.beginner.top3 = { xp: achievement.xp_reward, gems: achievement.gem_reward }
          } else if (achievement.criteria_type === 'daily_challenge_rank_1_intermediate') {
            rewards.intermediate.top1 = { xp: achievement.xp_reward, gems: achievement.gem_reward }
          } else if (achievement.criteria_type === 'daily_challenge_rank_2_intermediate') {
            rewards.intermediate.top2 = { xp: achievement.xp_reward, gems: achievement.gem_reward }
          } else if (achievement.criteria_type === 'daily_challenge_rank_3_intermediate') {
            rewards.intermediate.top3 = { xp: achievement.xp_reward, gems: achievement.gem_reward }
          } else if (achievement.criteria_type === 'daily_challenge_rank_1_advanced') {
            rewards.advanced.top1 = { xp: achievement.xp_reward, gems: achievement.gem_reward }
          } else if (achievement.criteria_type === 'daily_challenge_rank_2_advanced') {
            rewards.advanced.top2 = { xp: achievement.xp_reward, gems: achievement.gem_reward }
          } else if (achievement.criteria_type === 'daily_challenge_rank_3_advanced') {
            rewards.advanced.top3 = { xp: achievement.xp_reward, gems: achievement.gem_reward }
          }
        })

        setAchievementRewards(rewards)
      }
    } catch (error) {
      console.error('Error fetching achievement rewards:', error)
    }
  }

  const loadTodayChallenge = async () => {
    if (!user) return

    try {
      const challenge = await fetchTodayChallenge()
      if (challenge?.success) {
        setTodayChallenge(challenge)
        setDifficultyLevel(challenge.difficulty_level)
      }
    } catch (error) {
      console.error('Error loading today\'s challenge:', error)
    }
  }

  const loadLeaderboard = async () => {
    try {
      setLoading(true)

      // Fetch challenge for selected date and difficulty
      const { data: challenges } = await supabase
        .from('daily_challenges')
        .select('id')
        .eq('challenge_date', selectedDate)
        .eq('difficulty_level', difficultyLevel)
        .eq('is_active', true)
        .single()

      if (challenges) {
        const leaderboard = await fetchLeaderboard(challenges.id, 100)
        setLeaderboardData(leaderboard || [])
      } else {
        setLeaderboardData([])
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error)
      setLeaderboardData([])
    } finally {
      setLoading(false)
    }
  }

  const getDifficultyColor = (level) => {
    switch (level) {
      case 'beginner': return 'from-green-400 to-green-600'
      case 'intermediate': return 'from-blue-400 to-blue-600'
      case 'advanced': return 'from-purple-400 to-purple-600'
      default: return 'from-gray-400 to-gray-600'
    }
  }

  const getDifficultyBadgeColor = (level) => {
    switch (level) {
      case 'beginner': return 'bg-gray-100 text-green-800 border-green-300'
      case 'intermediate': return 'bg-gray-100 text-blue-800 border-blue-300'
      case 'advanced': return 'bg-gray-100 text-purple-800 border-purple-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getDifficultyLabel = (level) => {
    switch (level) {
      case 'beginner': return 'Beginner'
      case 'intermediate': return 'Intermediate'
      case 'advanced': return 'Advanced'
      default: return level
    }
  }

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1:
        return <Crown className="w-6 h-6 text-yellow-500" />
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />
      case 3:
        return <Medal className="w-6 h-6 text-orange-600" />
      default:
        return null
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  const currentUserData = leaderboardData.find(u => u.user_id === user?.id)
  const top3 = leaderboardData.slice(0, 3)
  const rest = leaderboardData.slice(3)

  return (
    <div className="container mx-auto px-4 py-8">

      {/* Controls Card */}
      <Card className="mb-6">
        
        <div className="p-4 flex items-center gap-3 flex-wrap">
          {/* Difficulty Level Tabs */}
          {['beginner', 'intermediate', 'advanced'].map(level => (
            <button
              key={level}
              onClick={() => setDifficultyLevel(level)}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                difficultyLevel === level
                  ? `bg-gradient-to-r ${getDifficultyColor(level)} text-white shadow-md`
                  : `${getDifficultyBadgeColor(level)} hover:shadow-sm`
              }`}
            >
              {getDifficultyLabel(level)}
            </button>
          ))}

          {/* Date Picker & Refresh */}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={getVietnamDate()}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(getVietnamDate())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadLeaderboard()}
              className="flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </div>
      </Card>


      {loading ? (
        <Card className="p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading leaderboard...</p>
        </Card>
      ) : leaderboardData.length === 0 ? (
        <Card className="p-8 text-center">
          <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Participants Yet</h3>
          <p className="text-gray-600">Be the first to complete today's challenge!</p>
        </Card>
      ) : (
        <>
          {/* Top 3 Podium */}
          {top3.length > 0 && (
            <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-8 items-end">
              <style>{`
                @keyframes shimmer {
                  0% { background-position: 100% 0; }
                  100% { background-position: -100% 0; }
                }
              `}</style>

              {/* 2nd Place */}
              {top3[1] && (
                <div className="order-1">
                  <Card className="text-center p-2 md:p-6 bg-gradient-to-t from-gray-400/80 to-gray-100/80 border-white border-t-0 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 2s infinite'
                    }}></div>
                    <div className="mx-auto mb-2 md:mb-4 relative z-10">
                      <AvatarWithFrame
                        avatarUrl={top3[1].avatar_url}
                        frameRatio={top3[1].active_frame_ratio}
                        size={80}
                        className="mx-auto"
                        fallback={top3[1].full_name?.charAt(0).toUpperCase()}
                      />
                    </div>
                    <div className="font-bold text-gray-900 text-xs md:text-base break-words text-center relative z-10">
                      {top3[1].full_name}
                    </div>
                    <div className="text-sm md:text-lg font-semibold text-gray-900 mt-1 md:mt-2 relative z-10">
                      {top3[1].score}%
                    </div>
                    <div className="text-xs text-gray-600 relative z-10">
                      {formatTime(top3[1].time_spent)}
                    </div>
                  </Card>
                </div>
              )}

              {/* 1st Place */}
              {top3[0] && (
                <div className="order-2">
                  <Card className="text-center p-2 md:p-6 bg-gradient-to-t from-yellow-600/80 to-yellow-100/80 border-white border-t-0 md:transform md:scale-105 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent" style={{
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 2s infinite'
                    }}></div>
                    <Crown className="w-6 h-6 md:w-8 md:h-8 text-yellow-500 mx-auto mb-1 md:mb-2 relative z-10" />
                    <div className="mx-auto mb-2 md:mb-4 relative z-10">
                      <AvatarWithFrame
                        avatarUrl={top3[0].avatar_url}
                        frameRatio={top3[0].active_frame_ratio}
                        size={80}
                        className="mx-auto"
                        fallback={top3[0].full_name?.charAt(0).toUpperCase()}
                      />
                    </div>
                    <div className="font-bold text-gray-900 text-xs md:text-lg break-words text-center relative z-10">
                      {top3[0].full_name}
                    </div>
                    <div className="text-sm md:text-xl font-semibold text-gray-900 mt-1 md:mt-2 relative z-10">
                      {top3[0].score}%
                    </div>
                    <div className="text-xs text-gray-600 relative z-10">
                      {formatTime(top3[0].time_spent)}
                    </div>
                    <div className="hidden md:flex items-center justify-center mt-2 text-yellow-600 relative z-10">
                      <Star size={16} fill="currentColor" />
                      <span className="ml-1 text-sm">Champion</span>
                    </div>
                  </Card>
                </div>
              )}

              {/* 3rd Place */}
              {top3[2] && (
                <div className="order-3">
                  <Card className="text-center p-2 md:p-6 bg-gradient-to-t from-orange-600/80 to-orange-50/80 border-white border-t-0 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 2s infinite'
                    }}></div>
                    <div className="mx-auto mb-2 md:mb-4 relative z-10">
                      <AvatarWithFrame
                        avatarUrl={top3[2].avatar_url}
                        frameRatio={top3[2].active_frame_ratio}
                        size={56}
                        className="mx-auto"
                        fallback={top3[2].full_name?.charAt(0).toUpperCase()}
                      />
                    </div>
                    <div className="font-bold text-gray-900 text-xs md:text-base break-words text-center relative z-10">
                      {top3[2].full_name}
                    </div>
                    <div className="text-sm md:text-lg font-semibold text-gray-900 mt-1 md:mt-2 relative z-10">
                      {top3[2].score}%
                    </div>
                    <div className="text-xs text-gray-600 relative z-10">
                      {formatTime(top3[2].time_spent)}
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* Current User Stats */}
          {currentUserData && (
            <Card className="mb-6 bg-blue-50 border-2 border-blue-300">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Star className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="font-semibold text-blue-900">Your Rank</p>
                    <p className="text-sm text-blue-700">
                      #{currentUserData.rank} • {currentUserData.score}% • {formatTime(currentUserData.time_spent)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-blue-700">{currentUserData.attempts} attempt{currentUserData.attempts > 1 ? 's' : ''}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Full Leaderboard */}
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Target className="w-5 h-5" />
                Full Rankings
                <span className="text-sm font-normal text-gray-600">({leaderboardData.length} participants)</span>
              </h3>

              <div className="space-y-2">
                {leaderboardData.map((participant, index) => {
                  const isCurrentUser = participant.user_id === user?.id
                  const rank = index + 1

                  return (
                    <div
                      key={participant.user_id}
                      className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                        isCurrentUser
                          ? 'bg-blue-50 border-blue-300'
                          : rank <= 3
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {/* Rank */}
                        <div className="flex items-center justify-center w-12">
                          {rank <= 3 ? (
                            getRankIcon(rank)
                          ) : (
                            <span className="font-bold text-gray-600">#{rank}</span>
                          )}
                        </div>

                        {/* Avatar */}
                        <AvatarWithFrame
                          avatarUrl={participant.avatar_url}
                          activeFrameRatio={participant.active_frame_ratio}
                          size="md"
                        />

                        {/* Name */}
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold truncate ${isCurrentUser ? 'text-blue-900' : 'text-gray-900'}`}>
                            {participant.full_name}
                            {isCurrentUser && <span className="ml-2 text-xs text-blue-600">(You)</span>}
                          </p>
                          <p className="text-sm text-gray-600">
                            Level {participant.level}
                          </p>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-center">
                            <p className="font-bold text-gray-900">{participant.score}%</p>
                            <p className="text-xs text-gray-600">Score</p>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-gray-900">{formatTime(participant.time_spent)}</p>
                            <p className="text-xs text-gray-600">Time</p>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-gray-900">{participant.attempts}</p>
                            <p className="text-xs text-gray-600">Attempts</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>

          {/* Reward Info */}
          <Card className="mt-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-600" />
                Bonus Rewards
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-4 border-2 border-yellow-300">
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="w-5 h-5 text-yellow-500" />
                    <span className="font-semibold text-gray-900">Top 1</span>
                  </div>
                  <p className="text-sm text-gray-700">
                    +{achievementRewards[difficultyLevel].top1.xp} XP + {achievementRewards[difficultyLevel].top1.gems} 💎
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 border-2 border-gray-300">
                  <div className="flex items-center gap-2 mb-2">
                    <Medal className="w-5 h-5 text-gray-400" />
                    <span className="font-semibold text-gray-900">Top 2</span>
                  </div>
                  <p className="text-sm text-gray-700">
                    +{achievementRewards[difficultyLevel].top2.xp} XP + {achievementRewards[difficultyLevel].top2.gems} 💎
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 border-2 border-orange-300">
                  <div className="flex items-center gap-2 mb-2">
                    <Medal className="w-5 h-5 text-orange-500" />
                    <span className="font-semibold text-gray-900">Top 3</span>
                  </div>
                  <p className="text-sm text-gray-700">
                    +{achievementRewards[difficultyLevel].top3.xp} XP + {achievementRewards[difficultyLevel].top3.gems} 💎
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

export default DailyChallengeLeaderboard
