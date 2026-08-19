import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useProgress } from '../../hooks/useProgress'
import { useStudentLevels } from '../../hooks/useStudentLevels'
import { useAchievements } from '../../hooks/useAchievements'
import { supabase } from '../../supabase/client'
import {
  Star,
  BookOpen,
  Trophy,
  Activity,
  RefreshCw
} from 'lucide-react'

import { assetUrl } from '../../hooks/useBranding';

const CLIP_CARD = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)'
const CLIP_SM = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)'

const CornerBrackets = () => (
  <>
    <div className="absolute top-0 left-[10px] w-5 h-[1px] bg-gradient-to-r from-blue-300/40 to-transparent" />
    <div className="absolute top-0 left-[10px] w-[1px] h-5 bg-gradient-to-b from-blue-300/40 to-transparent" />
    <div className="absolute bottom-0 right-[10px] w-5 h-[1px] bg-gradient-to-l from-blue-300/40 to-transparent" />
    <div className="absolute bottom-0 right-[10px] w-[1px] h-5 bg-gradient-to-t from-blue-300/40 to-transparent" />
  </>
)
const Progress = () => {
  const { user, profile, fetchUserProfile } = useAuth()
  const { getCompletedExercises, getTotalStudyTime, userProgress } = useProgress()
  const { currentLevel, nextLevel, levelProgress, loading: levelsLoading } = useStudentLevels()
  const { getAchievementsWithProgress, checkAndAwardAchievements, claimAchievementXP, userAchievements, challengeWinCounts, loading: achievementsLoading } = useAchievements()
  const [selectedPeriod, setSelectedPeriod] = useState('week')
  const [weeklyData, setWeeklyData] = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [lessonResults, setLessonResults] = useState([])
  const [showAllLessons, setShowAllLessons] = useState(false)
  const [recentActivity, setRecentActivity] = useState([])
  const [petCount, setPetCount] = useState(0)
  const [petEvolvedCount, setPetEvolvedCount] = useState(0)
  const [shopCounts, setShopCounts] = useState({ avatar: 0, frame: 0, spaceship: 0, hammer: 0, boat: 0 })
  const [wildCatchCount, setWildCatchCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const completedExercises = getCompletedExercises()
  const totalStudyTime = getTotalStudyTime()

  // Fallback level calculations if student levels system is not available
  const fallbackLevel = Math.floor((profile?.xp || 0) / 1000) + 1
  const fallbackXpForNext = 1000 - ((profile?.xp || 0) % 1000)
  const fallbackProgress = ((profile?.xp || 0) % 1000) / 1000 * 100

  // Use either the new level system or fallback
  const displayLevel = currentLevel?.level_number || fallbackLevel
  const displayLevelName = currentLevel?.level_name || `Cấp ${displayLevel}`
  const displayNextLevelName = nextLevel?.level_name || `Cấp ${displayLevel + 1}`
  const displayXpNeeded = levelProgress?.xpNeeded || fallbackXpForNext
  const displayProgress = levelProgress?.progressPercentage || fallbackProgress

  useEffect(() => {
    if (user && userProgress) {
      fetchWeeklyData()
      fetchMonthlyData()
      fetchLessonResults()
      fetchRecentActivity()
      fetchPetCount()
      fetchPetEvolvedCount()
      fetchShopCounts()
      fetchWildCatchCount()
      // checkAndAwardAchievements() // Disabled until SQL functions are fixed
    }
  }, [user, userProgress])

  // Set loading to false after component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false)
    }, 2000) // 2 second timeout

    return () => clearTimeout(timer)
  }, [])

  // Calculate achievement progress based on user stats
  const calculateAchievementProgress = (achievement) => {
    const completedCount = completedExercises
    const currentStreak = profile?.streak_count || 0
    const totalXp = profile?.xp || 0

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
          // This would need daily exercise count calculation
          progress = 0
          unlocked = false
          break
        case 'pet_owned':
          progress = Math.min((petCount / achievement.criteria_value) * 100, 100)
          unlocked = petCount >= achievement.criteria_value
          break
        case 'pet_evolved':
          progress = Math.min((petEvolvedCount / achievement.criteria_value) * 100, 100)
          unlocked = petEvolvedCount >= achievement.criteria_value
          break
        case 'avatar_owned':
        case 'frame_owned':
        case 'spaceship_owned':
        case 'hammer_owned':
        case 'boat_owned': {
          const cat = achievement.criteria_type.replace('_owned', '')
          const count = shopCounts[cat] || 0
          progress = Math.min((count / achievement.criteria_value) * 100, 100)
          unlocked = count >= achievement.criteria_value
          break
        }
        case 'wild_catch_success':
          progress = Math.min((wildCatchCount / achievement.criteria_value) * 100, 100)
          unlocked = wildCatchCount >= achievement.criteria_value
          break
        default:
          progress = 0
          unlocked = false
      }
    }

    return {
      progress: Math.round(progress),
      unlocked,
      date: unlocked ? 'Đã mở khóa' : null
    }
  }

  // Get achievements with progress and calculate their status
  const achievementsWithProgress = getAchievementsWithProgress()
  
  // Fallback achievements if database is not ready
  const fallbackAchievements = [
    {
      id: '1',
      title: 'Người mới bắt đầu',
      description: 'Hoàn thành 5 bài tập đầu tiên',
      icon: 'Star',
      badge_color: 'yellow',
      criteria_type: 'exercise_completed',
      criteria_value: 5,
      xp_reward: 50,
      badge_image_url: '',
      badge_image_alt: 'Người mới bắt đầu badge'
    },
    {
      id: '2',
      title: 'Học viên chăm chỉ',
      description: 'Học 7 ngày liên tiếp',
      icon: 'Flame',
      badge_color: 'red',
      criteria_type: 'daily_streak',
      criteria_value: 7,
      xp_reward: 100,
      badge_image_url: '',
      badge_image_alt: 'Học viên chăm chỉ badge'
    },
    {
      id: '3',
      title: 'Chiến binh 🪙',
      description: 'Đạt 1000 🪙',
      icon: 'Trophy',
      badge_color: 'blue',
      criteria_type: 'total_xp',
      criteria_value: 1000,
      xp_reward: 200,
      badge_image_url: '',
      badge_image_alt: 'Chiến binh 🪙 badge'
    },
    {
      id: '4',
      title: 'Kỷ lục gia',
      description: 'Hoàn thành 100 bài tập',
      icon: 'Target',
      badge_color: 'green',
      criteria_type: 'exercise_completed',
      criteria_value: 100,
      xp_reward: 500,
      badge_image_url: '',
      badge_image_alt: 'Kỷ lục gia badge'
    }
  ]

  const allAchievements = achievementsWithProgress.length > 0 ? achievementsWithProgress : fallbackAchievements

  // User stats for achievement calculations
  const userStats = {
    completedExercises,
    currentStreak: profile?.streak_count || 0,
    totalXp: profile?.xp || 0,
    petCount,
    petEvolvedCount,
    shopCounts,
    wildCatchCount
  }

  // Local state for claimed fallback achievements
  const [claimedFallbackAchievements, setClaimedFallbackAchievements] = useState(new Set())

  // Custom claim function for fallback achievements
  const handleClaimXP = async (achievementId) => {
    // Check if this is a fallback achievement (string ID)
    if (typeof achievementId === 'string' && achievementId.length < 10) {
      const achievement = fallbackAchievements.find(a => a.id === achievementId)
      if (achievement && !claimedFallbackAchievements.has(achievementId)) {
        try {
          // Update user XP atomically to avoid clobbering concurrent awards
          const { error } = await supabase.rpc('increment_user_currency', {
            p_user_id: user.id,
            p_xp: achievement.xp_reward,
            p_gems: 0
          })

          if (error) throw error

          // Mark as claimed locally
          setClaimedFallbackAchievements(prev => new Set([...prev, achievementId]))

          // Refresh user profile
          fetchUserProfile(user.id)

          return { success: true, xpAwarded: achievement.xp_reward, message: '🪙 đã được cộng!' }
        } catch (error) {
          console.error('Error claiming fallback achievement XP:', error)
          return { success: false, message: 'Có lỗi xảy ra' }
        }
      }
      return { success: false, message: 'Achievement already claimed' }
    } else {
      // Use regular claim function for database achievements
      return await claimAchievementXP(achievementId)
    }
  }


  const fetchLessonResults = async () => {
    try {
      // Step 1: fetch lesson records
      const { data: records, error: recError } = await supabase
        .from('lesson_records')
        .select('lesson_info_id, attendance_status, homework_status, homework_score, homework_max_score, homework_notes, performance_rating, score, max_score, notes, star_flag')
        .eq('student_id', user.id)
        .order('recorded_at', { ascending: false })
        .limit(50)

      if (recError) throw recError
      if (!records || records.length === 0) return

      // Step 2: fetch lesson_info separately (bypasses RLS join issue)
      const infoIds = [...new Set(records.map(r => r.lesson_info_id).filter(Boolean))]
      let infoMap = {}
      if (infoIds.length > 0) {
        const { data: infos, error: infoError } = await supabase
          .from('lesson_info')
          .select('id, lesson_name, skill, session_date, course_id')
          .in('id', infoIds)

        console.log('[LessonResults] lesson_info ids:', infoIds, 'fetched:', infos?.length, 'error:', infoError)

        // Step 3: fetch course info
        const courseIds = [...new Set((infos || []).map(i => i.course_id).filter(Boolean))]
        let courseMap = {}
        if (courseIds.length > 0) {
          const { data: courses } = await supabase
            .from('courses')
            .select('id, title, level_number')
            .in('id', courseIds)
          ;(courses || []).forEach(c => { courseMap[c.id] = c })
        }

        ;(infos || []).forEach(i => {
          infoMap[i.id] = { ...i, course: courseMap[i.course_id] || null }
        })
      }

      // Merge
      const merged = records.map(r => ({
        ...r,
        lesson_info: infoMap[r.lesson_info_id] || null
      }))

      setLessonResults(merged)
    } catch (err) {
      console.error('[LessonResults] Error:', err)
    }
  }

  const fetchRecentActivity = async () => {
    try {
      const { data: exerciseData } = await supabase
        .from('user_progress')
        .select('*, exercises (title, exercise_type, xp_reward)')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(10)

      const { data: achievementData } = await supabase
        .from('user_achievements')
        .select('*, achievements (title, xp_reward)')
        .eq('user_id', user.id)
        .not('claimed_at', 'is', null)
        .order('claimed_at', { ascending: false })
        .limit(10)

      const exerciseActivities = (exerciseData || []).map(item => ({
        ...item, type: 'exercise', activity_date: item.completed_at
      }))
      const achievementActivities = (achievementData || []).map(item => ({
        ...item, type: 'achievement', activity_date: item.claimed_at, xp_earned: item.achievements?.xp_reward || 0
      }))

      setRecentActivity(
        [...exerciseActivities, ...achievementActivities]
          .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
          .slice(0, 10)
      )
    } catch (err) {
      console.error('Error fetching recent activity:', err)
    }
  }

  const fetchPetCount = async () => {
    try {
      const { count, error } = await supabase
        .from('user_pets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
      if (!error) setPetCount(count || 0)
    } catch (err) {
      console.error('Error fetching pet count:', err)
    }
  }

  const fetchPetEvolvedCount = async () => {
    try {
      const { count, error } = await supabase
        .from('user_pets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('evolution_stage', 2)
      if (!error) setPetEvolvedCount(count || 0)
    } catch (err) {
      console.error('Error fetching pet evolved count:', err)
    }
  }

  const fetchWildCatchCount = async () => {
    try {
      const { count, error } = await supabase
        .from('wild_area_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('action', 'catch_success')
      if (!error) setWildCatchCount(count || 0)
    } catch (err) {
      console.error('Error fetching wild catch count:', err)
    }
  }

  const fetchShopCounts = async () => {
    try {
      const { data, error } = await supabase
        .from('user_purchases')
        .select('item_id, shop_items(category)')
        .eq('user_id', user.id)
      if (error || !data) return
      const counts = { avatar: 0, frame: 0, spaceship: 0, hammer: 0, boat: 0 }
      data.forEach(p => {
        const cat = p.shop_items?.category
        if (cat && counts.hasOwnProperty(cat)) counts[cat]++
      })
      setShopCounts(counts)
    } catch (err) {
      console.error('Error fetching shop counts:', err)
    }
  }

  const fetchWeeklyData = async () => {
    try {
      const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
      const weekData = []

      // Get current week (Sunday to Saturday)
      const today = new Date()
      const currentDayOfWeek = today.getDay() // 0 = Sunday, 1 = Monday, etc.

      // Calculate days from Sunday to today + remaining days of week
      for (let i = 0; i < 7; i++) {
        const date = new Date(today)
        // Go back to Sunday (subtract current day of week), then add i days
        date.setDate(date.getDate() - currentDayOfWeek + i)
        const dateStr = date.toISOString().split('T')[0]

        // Get progress data for this day
        const dayProgress = userProgress.filter(p =>
          p.completed_at && p.completed_at.startsWith(dateStr)
        )

        const dayXp = dayProgress.reduce((total, p) => total + (p.xp_earned || 0), 0)
        const dayExercises = dayProgress.filter(p => p.status === 'completed').length
        const dayTime = dayProgress.reduce((total, p) => total + (p.time_spent || 0), 0)

        weekData.push({
          day: days[i],
          xp: dayXp,
          exercises: dayExercises,
          time: dayTime,
          date: dateStr
        })
      }

      setWeeklyData(weekData)
    } catch (error) {
      console.error('Error fetching weekly data:', error)
      setWeeklyData([
        { day: 'CN', xp: 0, exercises: 0, time: 0 },
        { day: 'T2', xp: 0, exercises: 0, time: 0 },
        { day: 'T3', xp: 0, exercises: 0, time: 0 },
        { day: 'T4', xp: 0, exercises: 0, time: 0 },
        { day: 'T5', xp: 0, exercises: 0, time: 0 },
        { day: 'T6', xp: 0, exercises: 0, time: 0 },
        { day: 'T7', xp: 0, exercises: 0, time: 0 }
      ])
    }
  }

  const fetchMonthlyData = async () => {
    try {
      const monthData = []
      const today = new Date()
      const currentMonth = today.getMonth()
      const currentYear = today.getFullYear()

      // Get last 4 weeks of current month
      for (let week = 0; week < 4; week++) {
        // Calculate start and end dates for each week
        const weekStart = new Date(currentYear, currentMonth, 1 + (week * 7))
        const weekEnd = new Date(currentYear, currentMonth, Math.min(7 + (week * 7), new Date(currentYear, currentMonth + 1, 0).getDate()))

        // Get progress data for this week
        const weekProgress = userProgress.filter(p => {
          if (!p.completed_at) return false
          const completedDate = new Date(p.completed_at)
          return completedDate >= weekStart && completedDate <= weekEnd
        })

        const weekXp = weekProgress.reduce((total, p) => total + (p.xp_earned || 0), 0)
        const weekExercises = weekProgress.filter(p => p.status === 'completed').length
        const weekTime = weekProgress.reduce((total, p) => total + (p.time_spent || 0), 0)

        monthData.push({
          week: `T${week + 1}`,
          xp: weekXp,
          exercises: weekExercises,
          time: weekTime,
          startDate: weekStart.toISOString().split('T')[0],
          endDate: weekEnd.toISOString().split('T')[0]
        })
      }

      setMonthlyData(monthData)
    } catch (error) {
      console.error('Error fetching monthly data:', error)
      setMonthlyData([
        { week: 'T1', xp: 0, exercises: 0, time: 0 },
        { week: 'T2', xp: 0, exercises: 0, time: 0 },
        { week: 'T3', xp: 0, exercises: 0, time: 0 },
        { week: 'T4', xp: 0, exercises: 0, time: 0 }
      ])
    }
  }

  // Get current data based on selected period
  const currentData = selectedPeriod === 'week' ? weeklyData : monthlyData
  const maxExercises = Math.max(...currentData.map(d => d.exercises), 5) // Prevent division by 0, minimum 5 for better scaling

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 border-2 border-blue-200 rounded-full animate-ping opacity-30" />
          <RefreshCw className="w-10 h-10 animate-spin text-blue-400" />
        </div>
      </div>
    )
  }

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now - date) / (1000 * 60))
    if (diffInMinutes < 1) return 'Vừa xong'
    if (diffInMinutes < 60) return `${diffInMinutes} phút trước`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} giờ trước`
    return `${Math.floor(diffInMinutes / 1440)} ngày trước`
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-1 uppercase tracking-wide">Tiến độ học tập</h1>
        <div className="h-[2px] w-20 bg-gradient-to-r from-blue-400 to-transparent" />
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="relative bg-white border border-gray-200 p-4 overflow-hidden" style={{ clipPath: CLIP_SM }}>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <img src={assetUrl('/icon/profile/level.svg')} alt="Level" className="w-10 h-10" />
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-900">{displayLevel}</div>
              <div className="text-sm text-gray-500">Cấp độ</div>
            </div>
          </div>
        </div>

        <div className="relative bg-white border border-gray-200 p-4 overflow-hidden" style={{ clipPath: CLIP_SM }}>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <img src={assetUrl('/icon/profile/XP.svg')} alt="XP" className="w-10 h-10" />
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                {profile?.xp || 0}
                <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-5 h-5" />
              </div>
              <div className="text-sm text-gray-500">Tổng</div>
            </div>
          </div>
        </div>

        <div className="relative bg-white border border-gray-200 p-4 overflow-hidden" style={{ clipPath: CLIP_SM }}>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <img src={assetUrl('/icon/profile/streak.svg')} alt="Streak" className="w-10 h-10" />
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-900">{profile?.streak_count || 0}</div>
              <div className="text-sm text-gray-500">Chuỗi ngày</div>
            </div>
          </div>
        </div>

        <div className="relative bg-white border border-gray-200 p-4 overflow-hidden" style={{ clipPath: CLIP_SM }}>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <img src={assetUrl('/icon/profile/paper.svg')} alt="Exercises" className="w-10 h-10" />
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-900">{completedExercises}</div>
              <div className="text-sm text-gray-500">Bài tập</div>
            </div>
          </div>
        </div>
      </div>

      {/* Level Progress - hidden for now */}

      {/* Weekly Activity and Exercise Progress - hidden for now */}

      {/* Lesson Results */}
      {lessonResults.length > 0 && (() => {
        const perfXP = { ok: 30, good: 60, wow: 90 }
        const hwXP = { ok: 15, good: 30, wow: 45 }
        const MAX_XP = 135
        const calcXP = (rec) => {
          if (!rec) return null
          const isPresent = rec.attendance_status === 'present' || rec.attendance_status === 'late'
          if (!isPresent) return 0
          const perf = perfXP[rec.performance_rating] || 0
          const hw = hwXP[rec.homework_status] || 0
          if (perf === 0 && hw === 0) return null
          return Math.max(perf + hw - (rec.attendance_status === 'late' ? 15 : 0), 0)
        }

        const ratingBadge = (value) => {
          if (!value) return <span className="text-gray-300">-</span>
          const cls = value === 'wow' ? 'bg-green-100 text-green-700' : value === 'good' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
          const labels = { wow: 'Wow', good: 'Good', ok: 'Ok' }
          return <span className={`inline-block px-2 py-0.5 text-xs font-medium ${cls}`} style={{ clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}>{labels[value] || value}</span>
        }
        const attendBadge = (value) => {
          if (!value) return <span className="text-gray-300">-</span>
          const cls = value === 'present' ? 'bg-green-100 text-green-700' : value === 'late' ? 'bg-yellow-100 text-yellow-700' : value === 'absent' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
          const labels = { present: 'Đúng giờ', late: 'Muộn', absent: 'Vắng' }
          return <span className={`inline-block px-2 py-0.5 text-xs font-medium ${cls}`} style={{ clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}>{labels[value] || value}</span>
        }
        const dash = <span className="text-gray-300">-</span>

        const totalLessons = lessonResults.length
        const presentCount = lessonResults.filter(r => r.attendance_status === 'present' || r.attendance_status === 'late').length
        const wowPerf = lessonResults.filter(r => r.performance_rating === 'wow').length
        const goodPerf = lessonResults.filter(r => r.performance_rating === 'good').length
        const okPerf = lessonResults.filter(r => r.performance_rating === 'ok').length
        const starCount = lessonResults.filter(r => r.star_flag === 'star').length
        const flagCount = lessonResults.filter(r => r.star_flag === 'flag').length

        // XP rate data points (oldest first)
        const dataPoints = [...lessonResults].reverse().map(r => {
          const xp = calcXP(r)
          const date = r.lesson_info?.session_date
          return {
            date: date ? new Date(date + 'T00:00:00').toLocaleDateString('vi', { day: 'numeric', month: 'short' }) : '',
            pct: xp !== null ? Math.round((xp / MAX_XP) * 100) : null,
            xp,
          }
        }).filter(d => d.pct !== null)

        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold text-gray-900 flex items-center uppercase tracking-wide">
                <BookOpen className="w-5 h-5 mr-2 text-purple-600" />
                Kết quả buổi học
              </h3>
              <div className="h-[2px] w-12 bg-gradient-to-r from-purple-400 to-transparent mt-1 ml-7" />
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              <div className="bg-white border border-gray-200 p-3 text-center" style={{ clipPath: CLIP_SM }}>
                <p className="text-2xl font-semibold text-gray-900">{totalLessons}</p>
                <p className="text-xs text-gray-500">Tổng buổi</p>
              </div>
              <div className="bg-white border border-gray-200 p-3 text-center" style={{ clipPath: CLIP_SM }}>
                <p className="text-2xl font-semibold text-green-600">{presentCount}</p>
                <p className="text-xs text-gray-500">Có mặt</p>
              </div>
              <div className="bg-white border border-gray-200 p-3 text-center" style={{ clipPath: CLIP_SM }}>
                <p className="text-2xl font-semibold text-green-600">{wowPerf}</p>
                <p className="text-xs text-gray-500">Wow</p>
              </div>
              <div className="bg-white border border-gray-200 p-3 text-center" style={{ clipPath: CLIP_SM }}>
                <p className="text-2xl font-semibold text-yellow-500">{goodPerf}</p>
                <p className="text-xs text-gray-500">Good</p>
              </div>
              <div className="bg-white border border-gray-200 p-3 text-center" style={{ clipPath: CLIP_SM }}>
                <p className="text-2xl font-semibold text-red-500">{okPerf}</p>
                <p className="text-xs text-gray-500">Ok</p>
              </div>
              <div className="bg-white border border-gray-200 p-3 text-center" style={{ clipPath: CLIP_SM }}>
                <div className="flex items-center justify-center gap-2">
                  {starCount > 0 && <span className="flex items-center gap-1"><Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />{starCount}</span>}
                  {flagCount > 0 && <span className="flex items-center gap-1 text-red-500">{flagCount}</span>}
                  {starCount === 0 && flagCount === 0 && <span className="text-2xl font-semibold text-gray-300">-</span>}
                </div>
                <p className="text-xs text-gray-500">Star / Flag</p>
              </div>
            </div>

            {/* XP Rate Graph */}
            {dataPoints.length >= 2 && (() => {
              // Use min width per point so labels never overlap; scrollable on mobile
              const minStepX = 60
              const PX = 36, PY = 20, H = 200
              const plotH = H - PY * 2
              const W = Math.max(320, PX * 2 + (dataPoints.length - 1) * minStepX)
              const plotW = W - PX * 2
              const stepX = plotW / (dataPoints.length - 1)
              const points = dataPoints.map((d, i) => ({ x: PX + i * stepX, y: PY + plotH - (d.pct / 100) * plotH, ...d }))
              const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
              const areaPath = linePath + ` L${points[points.length - 1].x},${PY + plotH} L${points[0].x},${PY + plotH} Z`

              return (
                <div className="relative bg-white border border-gray-200 p-3 sm:p-5 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
                  <CornerBrackets />
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">XP Rate</h4>
                  <div className="overflow-x-auto -mx-1">
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: W > 400 ? W * 0.6 : '100%', maxHeight: 220 }}>
                      {[0, 25, 50, 75, 100].map(pct => {
                        const y = PY + plotH - (pct / 100) * plotH
                        return (
                          <g key={pct}>
                            <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                            <text x={PX - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{pct}%</text>
                          </g>
                        )
                      })}
                      <path d={areaPath} fill="url(#xpGradientProgress)" opacity="0.3" />
                      <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      {points.map((p, i) => (
                        <g key={i}>
                          <circle cx={p.x} cy={p.y} r="4" fill="#3b82f6" stroke="white" strokeWidth="2" />
                          <text x={p.x} y={PY + plotH + 14} textAnchor="middle" fontSize="9" fill="#6b7280">{p.date}</text>
                          <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="9" fill="#3b82f6" fontWeight="600">{p.pct}%</text>
                        </g>
                      ))}
                      <defs>
                        <linearGradient id="xpGradientProgress" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                </div>
              )
            })()}

            {/* Lesson Cards (mobile) */}
            <div className="md:hidden space-y-3">
              {(showAllLessons ? lessonResults : lessonResults.slice(0, 4)).map((result, idx) => {
                const info = result.lesson_info
                const xp = calcXP(result)
                const xpColor = xp === null ? 'text-gray-300' : xp >= 70 ? 'text-green-600' : xp >= 40 ? 'text-yellow-600' : 'text-red-600'

                return (
                  <div key={idx} className="bg-white border border-gray-200 p-3" style={{ clipPath: CLIP_SM }}>
                    {/* Row 1: Date + Lesson name + XP */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{info?.lesson_name || '-'}</p>
                        <p className="text-xs text-gray-500">
                          {info?.session_date ? new Date(info.session_date + 'T00:00:00').toLocaleDateString('vi', { weekday: 'short', day: 'numeric', month: 'short' }) : '-'}
                          {info?.skill && <span className="capitalize"> · {info.skill}</span>}
                        </p>
                      </div>
                      <div className={`text-lg font-bold shrink-0 ${xpColor}`}>
                        {xp !== null ? xp : '-'}
                        {xp !== null && <span className="text-xs font-medium ml-0.5">xp</span>}
                      </div>
                    </div>
                    {/* Row 2: Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1">
                        {attendBadge(result.attendance_status)}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-400 uppercase">Lớp</span>
                        {ratingBadge(result.performance_rating)}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-400 uppercase">BT</span>
                        {ratingBadge(result.homework_status)}
                      </div>
                      {result.score != null && (
                        <span className="text-xs text-gray-500">Điểm: {result.score}/{result.max_score ?? '?'}</span>
                      )}
                      {result.homework_score != null && (
                        <span className="text-xs text-gray-500">BT: {result.homework_score}/{result.homework_max_score ?? '?'}</span>
                      )}
                      {result.star_flag === 'star' && <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />}
                      {result.star_flag === 'flag' && <span className="text-red-500 text-xs font-medium">Flag</span>}
                    </div>
                  </div>
                )
              })}
              {lessonResults.length > 4 && (
                <div className="text-center py-2">
                  <button
                    onClick={() => setShowAllLessons(!showAllLessons)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showAllLessons ? 'Thu gọn' : `Xem thêm (${lessonResults.length - 4} buổi)`}
                  </button>
                </div>
              )}
            </div>

            {/* Lesson Table (desktop) */}
            <div className="hidden md:block relative bg-white border border-gray-200 overflow-x-auto" style={{ clipPath: CLIP_CARD }}>
              <CornerBrackets />
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Ngày</th>
                    <th className="px-4 py-3 text-left font-medium">Buổi học</th>
                    <th className="px-4 py-3 text-center font-medium">Điểm danh</th>
                    <th className="px-4 py-3 text-center font-medium">Trên lớp</th>
                    <th className="px-4 py-3 text-center font-medium">Điểm</th>
                    <th className="px-4 py-3 text-center font-medium">Bài tập</th>
                    <th className="px-4 py-3 text-center font-medium">Điểm BT</th>
                    <th className="px-4 py-3 text-center font-medium">Star/Flag</th>
                    <th className="px-4 py-3 text-center font-medium">XP</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(showAllLessons ? lessonResults : lessonResults.slice(0, 10)).map((result, idx) => {
                    const info = result.lesson_info
                    const xp = calcXP(result)

                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                          {info?.session_date ? new Date(info.session_date + 'T00:00:00').toLocaleDateString('vi', { weekday: 'short', day: 'numeric', month: 'short' }) : dash}
                        </td>
                        <td className="px-4 py-3 text-gray-900">
                          <div>{info?.lesson_name || '-'}</div>
                          {info?.skill && <div className="text-xs text-gray-400 capitalize">{info.skill}</div>}
                        </td>
                        <td className="px-4 py-3 text-center">{attendBadge(result.attendance_status)}</td>
                        <td className="px-4 py-3 text-center">{ratingBadge(result.performance_rating)}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{result.score != null ? `${result.score}/${result.max_score ?? '?'}` : dash}</td>
                        <td className="px-4 py-3 text-center">{ratingBadge(result.homework_status)}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{result.homework_score != null ? `${result.homework_score}/${result.homework_max_score ?? '?'}` : dash}</td>
                        <td className="px-4 py-3 text-center">
                          {result.star_flag === 'star' && <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 inline" />}
                          {result.star_flag === 'flag' && <span className="text-red-500 text-xs font-medium">Flag</span>}
                          {!result.star_flag && dash}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            if (xp === null) return dash
                            const color = xp >= 70 ? 'text-green-600' : xp >= 40 ? 'text-yellow-600' : 'text-red-600'
                            return <span className={`font-medium text-xs ${color}`}>{xp}</span>
                          })()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {lessonResults.length > 10 && (
                <div className="text-center py-3 border-t">
                  <button
                    onClick={() => setShowAllLessons(!showAllLessons)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showAllLessons ? 'Thu gọn' : `Xem thêm (${lessonResults.length - 10} buổi)`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Recent Activity */}
      <div className="relative bg-white border border-gray-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
        <CornerBrackets />
        <div className="px-5 pt-4 pb-1">
          <h2 className="text-base font-semibold flex items-center space-x-2 uppercase tracking-wide">
            <Activity className="w-5 h-5 text-blue-500" />
            <span>Hoạt động gần đây</span>
          </h2>
          <div className="h-[2px] w-12 bg-gradient-to-r from-blue-400 to-transparent mt-1 ml-7" />
        </div>
        <div className="p-4">
          {recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((activity) => {
                if (activity.type === 'achievement') {
                  return (
                    <div key={`ach-${activity.id}`} className="flex items-center space-x-3 p-3 bg-yellow-50 border border-yellow-200" style={{ clipPath: CLIP_SM }}>
                      <div className="w-10 h-10 bg-yellow-100 flex items-center justify-center shrink-0" style={{ clipPath: CLIP_SM }}>
                        <Trophy className="w-5 h-5 text-yellow-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate text-sm">
                          Nhận thành tích: {activity.achievements?.title}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {formatTimeAgo(activity.claimed_at)}
                        </p>
                      </div>
                      <div className="text-yellow-600 font-semibold text-sm shrink-0">
                        +{activity.xp_earned} XP
                      </div>
                    </div>
                  )
                } else {
                  return (
                    <div key={`ex-${activity.id}`} className="flex items-center space-x-3 p-3 bg-gray-50 border border-gray-100" style={{ clipPath: CLIP_SM }}>
                      <div className="w-10 h-10 bg-blue-100 flex items-center justify-center shrink-0" style={{ clipPath: CLIP_SM }}>
                        <BookOpen className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate text-sm">
                          {activity.exercises?.title || 'Bài tập'}
                        </h4>
                        <p className="text-sm text-gray-500">
                          Điểm: {activity.score}% • {formatTimeAgo(activity.completed_at)}
                        </p>
                      </div>
                      <div className="text-blue-600 font-semibold text-sm shrink-0">
                        +{activity.exercises?.xp_reward || 10} XP
                      </div>
                    </div>
                  )
                }
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Chưa có hoạt động nào.</p>
            </div>
          )}
        </div>
      </div>

      {/* Achievements - hidden for now */}
    </div>
  )
}

export default Progress

