import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useDailyChallenge } from '../../hooks/useDailyChallenge'
import { useStudentLevels } from '../../hooks/useStudentLevels'
import { supabase } from '../../supabase/client'
import Card from '../ui/Card'
import Button from '../ui/Button'
import AvatarWithFrame from '../ui/AvatarWithFrame'
import ChallengeAttemptHistory from './ChallengeAttemptHistory'
import {
  Trophy,
  Clock,
  Medal,
  Lock,
  Info,
  X
} from 'lucide-react'
import { getVietnamDate } from '../../utils/vietnamTime'

import { assetUrl } from '../../hooks/useBranding';
// TESTING MODE: Set to true to enable for everyone, false to restrict to test users only
const DAILY_CHALLENGE_ENABLED = false

// Test users who can access daily challenge (add your test account emails here)
const TEST_USERS = [
  'your-test-email@example.com',
  'admin@xpclass.vn'
]

const DailyChallenge = () => {
  const { user, profile } = useAuth()
  const { fetchTodayChallenge, todayChallenge, canParticipate, fetchLeaderboard } = useDailyChallenge()
  const { currentLevel } = useStudentLevels()
  const [loading, setLoading] = useState(true)
  const [timeUntilNext, setTimeUntilNext] = useState('')
  const [leaderboardData, setLeaderboardData] = useState([])
  const [achievementRewards, setAchievementRewards] = useState({
    beginner: { top1: { xp: 80, gems: 15 }, top2: { xp: 60, gems: 12 }, top3: { xp: 40, gems: 8 } },
    intermediate: { top1: { xp: 120, gems: 20 }, top2: { xp: 90, gems: 15 }, top3: { xp: 60, gems: 12 } },
    advanced: { top1: { xp: 160, gems: 25 }, top2: { xp: 120, gems: 20 }, top3: { xp: 80, gems: 16 } }
  })
  const [showInfoModal, setShowInfoModal] = useState(false)

  useEffect(() => {
    if (user) {
      loadChallenge()
      fetchAchievementRewards()
    }
  }, [user])

  useEffect(() => {
    // Update countdown every minute
    const interval = setInterval(() => {
      updateCountdown()
    }, 60000)

    updateCountdown()
    return () => clearInterval(interval)
  }, [])

  const loadChallenge = async () => {
    try {
      setLoading(true)
      const challenge = await fetchTodayChallenge()
      if (challenge?.success && challenge.challenge_id) {
        loadLeaderboard(challenge.challenge_id)
      }
    } catch (error) {
      console.error('Error fetching daily challenge:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadLeaderboard = async (challengeId) => {
    try {
      const leaderboard = await fetchLeaderboard(challengeId, 5)
      setLeaderboardData(leaderboard || [])
    } catch (error) {
      console.error('Error loading leaderboard:', error)
      setLeaderboardData([])
    }
  }

  const fetchAchievementRewards = async () => {
    try {
      const { data: achievements } = await supabase
        .from('achievements')
        .select('criteria_type, xp_reward, gem_reward')
        .like('criteria_type', 'daily_challenge_rank_%')
        .eq('is_active', true)

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

  const updateCountdown = () => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setHours(24, 0, 0, 0)

    const diff = tomorrow - now
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    setTimeUntilNext(`${hours}h ${minutes}m`)
  }

  const getDifficultyInfo = (level) => {
    switch (level) {
      case 'beginner':
        return {
          label: 'Beginner',
          color: 'bg-green-100 text-green-800 border-green-300',
          gradient: 'from-green-400 to-green-600',
          range: 'Levels 1-10'
        }
      case 'intermediate':
        return {
          label: 'Intermediate',
          color: 'bg-blue-100 text-blue-800 border-blue-300',
          gradient: 'from-blue-400 to-blue-600',
          range: 'Levels 11-20'
        }
      case 'advanced':
        return {
          label: 'Advanced',
          color: 'bg-purple-100 text-purple-800 border-purple-300',
          gradient: 'from-purple-400 to-purple-600',
          range: 'Levels 21-30'
        }
      default:
        return {
          label: 'Challenge',
          color: 'bg-gray-100 text-gray-800 border-gray-300',
          gradient: 'from-gray-400 to-gray-600',
          range: ''
        }
    }
  }

  const handleStartChallenge = () => {
    if (!todayChallenge || !todayChallenge.exercise_id) return

    const exerciseType = todayChallenge.exercise_type
    const exerciseId = todayChallenge.exercise_id
    const sessionId = todayChallenge.session_id
    const challengeId = todayChallenge.challenge_id

    // Build URL with challenge flag
    let exerciseUrl = ''

    switch (exerciseType) {
      case 'multiple_choice':
        exerciseUrl = `/study/multiple-choice`
        break
      case 'flashcard':
        exerciseUrl = `/study/flashcard`
        break
      case 'fill_blank':
        exerciseUrl = `/study/fill-blank`
        break
      case 'pronunciation':
        exerciseUrl = `/study/pronunciation`
        break
      case 'drag_drop':
        exerciseUrl = `/study/drag-drop`
        break
      case 'ai_fill_blank':
        exerciseUrl = `/study/ai-fill-blank`
        break
      case 'dropdown':
        exerciseUrl = `/study/dropdown`
        break
      case 'image_hotspot':
        exerciseUrl = `/study/image-hotspot`
        break
      case 'pdf_worksheet':
        exerciseUrl = `/study/pdf-worksheet`
        break
      default:
        console.error('Unknown exercise type:', exerciseType)
        alert('Loại bài tập không được hỗ trợ: ' + exerciseType)
        return
    }

    exerciseUrl += `?exerciseId=${exerciseId}&isChallenge=true&challengeId=${challengeId}`
    if (sessionId) {
      exerciseUrl += `&sessionId=${sessionId}`
    }

    window.location.href = exerciseUrl
  }

  if (loading) {
    return (
      <Card className="border-purple-200 relative overflow-hidden h-full">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-blue-50 opacity-50"></div>
        <div className="relative p-6">
          <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-4 py-1">
              <div className="h-4 bg-purple-200 rounded w-3/4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-purple-200 rounded"></div>
                <div className="h-4 bg-purple-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  if (!todayChallenge || !todayChallenge.success) {
    return (
      <Card className="border-gray-200 relative overflow-hidden h-full">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100 opacity-50"></div>
        <div className="relative p-6 text-center">
          <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Chưa có Daily Challenge</h3>
          <p className="text-sm text-gray-600">Challenge mới sẽ có sẵn sớm!</p>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            <span>Làm mới sau: {timeUntilNext}</span>
          </div>
        </div>
      </Card>
    )
  }

  const difficultyInfo = getDifficultyInfo(todayChallenge.difficulty_level)
  const participated = todayChallenge.participated || todayChallenge.attempts_used > 0
  const attemptsLeft = 3 - todayChallenge.attempts_used
  const isLocked = todayChallenge.is_locked === true
  const canStart = attemptsLeft > 0 && !isLocked

  return (
    <div className={`relative rounded-lg border-4 ${isLocked ? 'border-gray-400 bg-gradient-to-b from-gray-50 to-gray-100' : 'border-purple-600 bg-gradient-to-b from-purple-50 to-purple-100'} overflow-visible shadow-lg hover:shadow-xl transition-shadow h-full`}
    >

      {/* Purple ribbon banner */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 w-[105%]">
        <div className="bg-gradient-to-b from-purple-400 to-purple-500 rounded-lg py-3 px-6 shadow-lg border-b-4 border-purple-600 text-center relative">
          <p className="text-purple-200 text-xs font-semibold tracking-wider uppercase">
            Weekend Challenge
          </p>
          <p className="text-white text-2xl font-extrabold tracking-wide drop-shadow-md" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.2)' }}>
            PRONUNCIATION
          </p>


          {/* Info button */}
          <button
            onClick={() => setShowInfoModal(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            aria-label="Daily Challenge Info"
          >
            <Info className="w-4 h-4 text-white" />
          </button>

        </div>
      </div>




      <div className="relative p-4 pt-16 flex flex-col h-full">

        {/* Header: title + difficulty + rank + exercise info */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {participated && (
              <div className="flex items-center gap-1 text-yellow-600 font-bold">
                <Medal className="w-4 h-4" />
                <span className="text-sm">Your rank:{todayChallenge.user_rank || '?'}</span>
              </div>
            )}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded px-2 py-1">
              <span className="text-xs font-semibold text-gray-600">Reward:</span>
              <span className="flex items-center gap-1">
                <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-4 h-4" />
                <span className="font-bold text-gray-900 text-xs">{todayChallenge.base_xp_reward}</span>
              </span>
              {todayChallenge.base_gem_reward > 0 && (
                <span className="flex items-center gap-1">
                  <img src={assetUrl('/image/study/gem.png')} alt="Gems" className="w-4 h-4" />
                  <span className="font-bold text-gray-900 text-xs">{todayChallenge.base_gem_reward}</span>
                </span>
              )}
            </div>
          </div>

        </div>

        {/* Exercise + Status row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="font-semibold text-sm text-gray-900">{todayChallenge.exercise_title}</span>
          </div>
        </div>

        {/* Top 3 compact list */}
        {leaderboardData.length > 0 && (
          <div className="mb-3 rounded-lg border border-gray-200 overflow-hidden">
            {leaderboardData.map((entry, i) => {
              const isCurrentUser = entry.user_id === user?.id
              return (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 ${i > 0 ? 'border-t border-gray-100' : ''} ${isCurrentUser ? 'bg-purple-50 ring-2 ring-inset ring-purple-400' : i === 0 ? 'bg-yellow-50' : ''}`}>
                <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${
                  i === 0 ? 'bg-yellow-400 text-yellow-900' :
                  i === 1 ? 'bg-gray-300 text-gray-700' :
                  'bg-orange-300 text-orange-800'
                }`}>
                  {i + 1}
                </span>
                <AvatarWithFrame
                  avatarUrl={entry.avatar_url}
                  activeFrameRatio={entry.active_frame_ratio}
                  size={28}
                  className="flex-shrink-0"
                />
                <span className={`text-sm font-medium truncate flex-1 ${isCurrentUser ? 'text-purple-700 font-bold' : 'text-gray-900'}`}>{entry.full_name} {isCurrentUser && '(Bạn)'}</span>
                <span className="text-xs font-bold text-gray-700">{entry.score}%</span>
                <span className="text-xs text-gray-500">{Math.floor(entry.time_spent / 60)}:{(entry.time_spent % 60).toString().padStart(2, '0')}</span>
                {i < 3 && (achievementRewards[todayChallenge.difficulty_level]?.[`top${i + 1}`]?.xp > 0 || achievementRewards[todayChallenge.difficulty_level]?.[`top${i + 1}`]?.gems > 0) && (
                  <span className="flex items-center gap-1 text-xs text-yellow-600 font-semibold">
                    {achievementRewards[todayChallenge.difficulty_level]?.[`top${i + 1}`]?.xp > 0 && (
                      <>+{achievementRewards[todayChallenge.difficulty_level]?.[`top${i + 1}`]?.xp} <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3 h-3 inline" /></>
                    )}
                    {achievementRewards[todayChallenge.difficulty_level]?.[`top${i + 1}`]?.gems > 0 && (
                      <>+{achievementRewards[todayChallenge.difficulty_level]?.[`top${i + 1}`]?.gems} <img src={assetUrl('/image/study/gem.png')} alt="Gems" className="w-3 h-3 inline" /></>
                    )}
                  </span>
                )}
              </div>
              )
            })}

            {/* Show current user's position if not in the displayed list */}
            {participated && !leaderboardData.some(e => e.user_id === user?.id) && (
              <div className="flex items-center gap-2 px-3 py-2 border-t-2 border-dashed border-purple-300 bg-purple-50">
                <span className="w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold bg-purple-400 text-white">
                  {todayChallenge.user_rank}
                </span>
                <AvatarWithFrame
                  avatarUrl={profile?.avatar_url}
                  frameUrl={profile?.hide_frame ? null : profile?.active_title}
                  frameRatio={profile?.active_frame_ratio}
                  size={28}
                  className="flex-shrink-0"
                />
                <span className="text-sm font-bold text-purple-700 flex-1">Bạn</span>
                <span className="text-xs font-bold text-gray-700">{todayChallenge.user_score}%</span>
                <span className="text-xs text-gray-500">{Math.floor((todayChallenge.user_time_spent || 0) / 60)}:{((todayChallenge.user_time_spent || 0) % 60).toString().padStart(2, '0')}</span>
              </div>
            )}
          </div>
        )}

        {/* Attempt History */}
        {participated && todayChallenge.challenge_id && user?.id && (
          <ChallengeAttemptHistory
            challengeId={todayChallenge.challenge_id}
            userId={user.id}
          />
        )}

        {/* Locked Message */}
        {isLocked && (
          <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg mt-3">
            <div className="flex items-center gap-2 text-sm text-yellow-800">
              <Trophy className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">Challenge đã kết thúc. Giải thưởng cho top 3 đã được trao!</span>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-auto pt-3">
        {isLocked ? (
          <Button
            disabled
            className="w-full bg-gray-400 text-white font-bold py-2 rounded-lg cursor-not-allowed text-sm flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            Challenge đã kết thúc
          </Button>
        ) : canStart ? (
          <Button
            onClick={handleStartChallenge}
            className="w-full bg-purple-600 text-white font-bold py-2 rounded-lg shadow-md text-sm flex items-center justify-center gap-2"
          >
            {participated ? 'Thử lại' : 'Bắt đầu Challenge'}
            <span className="opacity-75 text-xs">({todayChallenge.attempts_used}/3)</span>
          </Button>
        ) : (
          <Button
            disabled
            className="w-full bg-gray-300 text-gray-600 font-bold py-2 rounded-lg cursor-not-allowed text-sm"
          >
            Đã hết lượt thử
          </Button>
        )}
        </div>
      </div>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowInfoModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-6 h-6 text-purple-600" />
                <h3 className="text-xl font-bold text-gray-900">Daily Challenge</h3>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h4 className="font-semibold text-purple-600 mb-2">Quy tắc:</h4>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Thử thách mới xuất hiện ngẫu nhiên các ngày trong tuần</li>
                  <li>Bạn có tối đa <strong>3 lần thử</strong></li>
                  <li>Đạt <strong>≥75%</strong> để lên bảng xếp hạng</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-purple-600 mb-2">Phần thưởng:</h4>
                <ul className="space-y-2 list-disc list-inside">
                  <li><strong>Top 1:</strong> XP + Gem</li>
                  <li><strong>Top 2-3:</strong> XP bonus</li>
                  <li><b>Hoàn thành:</b> XP cơ bản</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-purple-600 mb-2">Xếp hạng:</h4>
                <p>Xếp hạng dựa trên:</p>
                <ul className="space-y-1 list-disc list-inside ml-4">
                  <li>Điểm số cao nhất</li>
                  <li>Thời gian hoàn thành nhanh nhất (nếu điểm bằng nhau)</li>
                </ul>
              </div>

              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <p className="text-xs text-purple-800 font-medium">
                  💡 <strong>Tips:</strong> Ghi lại câu hỏi trong lượt 1 để tiết kiệm thời gian cho lượt sau
                </p>
              </div>
            </div>

            {/* Close button */}
            <div className="mt-6">
              <Button
                onClick={() => setShowInfoModal(false)}
                className="w-full bg-purple-600 text-white font-bold py-2 rounded-lg"
              >
                Đã hiểu
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DailyChallenge
