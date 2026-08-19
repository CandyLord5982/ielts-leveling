import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useStudentLevels } from '../../hooks/useStudentLevels'
import { useAchievements } from '../../hooks/useAchievements'
import { usePet } from '../../hooks/usePet'
import { supabase } from '../../supabase/client'
import AvatarWithFrame from '../ui/AvatarWithFrame'
import { assetUrl } from '../../hooks/useBranding';
import {
  Trophy,
  Target,
  BookOpen,
  Clock,
  Calendar,
  Mail,
  Edit3,
  Award,
  Crown,
  Zap,
  Shield,
  Gem,
  X,
  Upload,
  AlertCircle,
  CheckCircle,
  XCircle,
  LogOut,
  Gift,
  RefreshCw
} from 'lucide-react'
import ClaimCelebration from '../ui/ClaimCelebration'

const CLIP_CARD = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)'
const CLIP_SM = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)'
const CLIP_BTN = 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)'

const CornerBrackets = () => (
  <>
    <div className="absolute top-0 left-[10px] w-5 h-[1px] bg-gradient-to-r from-blue-300/40 to-transparent" />
    <div className="absolute top-0 left-[10px] w-[1px] h-5 bg-gradient-to-b from-blue-300/40 to-transparent" />
    <div className="absolute bottom-0 right-[10px] w-5 h-[1px] bg-gradient-to-l from-blue-300/40 to-transparent" />
    <div className="absolute bottom-0 right-[10px] w-[1px] h-5 bg-gradient-to-t from-blue-300/40 to-transparent" />
  </>
)

const Profile = () => {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, profile, updateProfile, signOut } = useAuth()
  const {
    currentLevel,
    nextLevel,
    levelProgress,
    currentBadge,
    nextBadge,
    hasUnlockedPerk,
    isMaxLevel
  } = useStudentLevels()
  const { getAchievementsWithProgress, userAchievements, challengeWinCounts, claimAchievementXP, checkAndAwardAchievements } = useAchievements()
  const { userPets, allPets } = usePet()

  // State for profile being viewed
  const [viewedProfile, setViewedProfile] = useState(null)
  const [viewedUser, setViewedUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({
    full_name: ''
  })

  // Check if viewing own profile or someone else's
  const isOwnProfile = !userId || userId === user?.id
  const currentProfile = isOwnProfile ? profile : viewedProfile
  const currentUser = isOwnProfile ? user : viewedUser

  // Stats state
  const [stats, setStats] = useState({
    totalXP: 0,
    exercisesCompleted: 0,
    streakCount: 0,
    totalPracticeTime: 0,
    averageScore: 0,
    levelsCompleted: 0,
    unitsCompleted: 0,
    sessionsCompleted: 0
  })

  // Recent activity state
  const [recentActivity, setRecentActivity] = useState([])

  // Avatar state
  const [availableAvatars, setAvailableAvatars] = useState([])
  const [purchasedAvatars, setPurchasedAvatars] = useState([])
  const [showAvatarSelector, setShowAvatarSelector] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState('')
  const [customAvatars, setCustomAvatars] = useState([])
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Badge state
  const [earnedBadges, setEarnedBadges] = useState([])
  const [upcomingBadges, setUpcomingBadges] = useState([])
  const [showBadgeModal, setShowBadgeModal] = useState(false)

  // Achievement state
  const [achievements, setAchievements] = useState([])
  const [showAchievementModal, setShowAchievementModal] = useState(false)
  const [claimingAchievement, setClaimingAchievement] = useState({})
  const [claimMessage, setClaimMessage] = useState('')
  const [claimResult, setClaimResult] = useState(null)

  // Pet state for viewed user
  const [viewedUserPets, setViewedUserPets] = useState([])

  useEffect(() => {
    if (isOwnProfile && profile) {
      setEditData({
        full_name: profile.full_name || ''
      })
      setSelectedAvatar(profile.avatar_url || '👤')
      fetchUserStats()
      fetchRecentActivity()
      fetchAvailableAvatars()
      fetchCustomAvatars()
    } else if (!isOwnProfile && userId) {
      fetchOtherUserProfile()
    }
  }, [profile, userId, isOwnProfile])

  // Separate effect to fetch achievements after stats are loaded
  useEffect(() => {
    const userIdToCheck = isOwnProfile ? user?.id : userId
    if (userIdToCheck && !loading && (stats.exercisesCompleted !== undefined || stats.totalXP !== undefined)) {
      fetchAchievements(isOwnProfile ? null : userId)
    }
  }, [userAchievements, user?.id, userId, isOwnProfile, stats, loading])

  const fetchOtherUserProfile = async () => {
    try {
      setLoading(true)

      // Fetch the other user's profile
      const [{ data: userData, error: userError }, { data: equipData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).single(),
        supabase.from('user_equipment').select('*').eq('user_id', userId).single()
      ])

      if (userError) {
        console.error('User not found:', userError)
        navigate('/leaderboard')
        return
      }

      const merged = { ...userData, ...(equipData || {}) }
      setViewedUser(merged)
      setViewedProfile(merged)
      setSelectedAvatar(userData.avatar_url || '👤')

      // Fetch stats for the viewed user
      await fetchUserStats(userId)
      await fetchRecentActivity(userId)
      await fetchAvailableAvatars()
      await processBadges(userData?.xp || 0)
      await fetchUserPets(userId)
      // fetchAchievements will be called automatically via useEffect after stats are loaded

    } catch (error) {
      console.error('Error fetching user profile:', error)
      navigate('/leaderboard')
    }
  }

  // Auto-open avatar selector from query param
  useEffect(() => {
    if (!loading && isOwnProfile && searchParams.get('avatarSelector') === 'true') {
      setShowAvatarSelector(true)
      searchParams.delete('avatarSelector')
      setSearchParams(searchParams, { replace: true })
    }
  }, [loading, isOwnProfile, searchParams])

  const fetchUserPets = async (targetUserId) => {
    try {
      const { data, error } = await supabase
        .from('user_pets')
        .select(`
          *,
          pet:pets(*)
        `)
        .eq('user_id', targetUserId)
        .order('obtained_at', { ascending: false })

      if (error) throw error
      setViewedUserPets(data || [])
    } catch (error) {
      console.error('Error fetching user pets:', error)
      setViewedUserPets([])
    }
  }

  const fetchUserStats = async (targetUserId = null) => {
    const userIdToFetch = targetUserId || user?.id
    if (!userIdToFetch) return

    try {
      setLoading(true)

      // Fetch user progress data
      const { data: progressData, error: progressError } = await supabase
        .from('user_progress')
        .select(`
          *,
          exercises (
            id,
            title,
            exercise_type,
            xp_reward
          )
        `)
        .eq('user_id', userIdToFetch)

      if (progressError) throw progressError

      // Fetch additional user data first
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userIdToFetch)
        .single()

      if (userError) throw userError

      // Calculate stats from progress data
      const completed = progressData?.filter(p => p.status === 'completed') || []
      const totalXP = userData?.xp || 0
      const exercisesCompleted = completed.length
      const averageScore = completed.length > 0
        ? Math.round(completed.reduce((sum, p) => sum + (p.score || 0), 0) / completed.length)
        : 0

      // Calculate total practice time from all completed exercises (in seconds, convert to minutes)
      const totalPracticeTimeMinutes = Math.floor(
        completed.reduce((sum, p) => sum + (p.time_spent || 0), 0) / 60
      )

      const newStats = {
        totalXP,
        exercisesCompleted,
        streakCount: userData?.streak_count || 0,
        totalPracticeTime: totalPracticeTimeMinutes,
        averageScore,
        levelsCompleted: 0, // We can calculate this if needed
        unitsCompleted: 0,  // We can calculate this if needed
        sessionsCompleted: 0 // We can calculate this if needed
      }

      setStats(newStats)

      // Process badges after stats are updated - always pass totalXP explicitly
      // since React state (stats.totalXP) may still hold stale value from another user's profile
      processBadges(totalXP)

    } catch (error) {
      console.error('Error fetching user stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchRecentActivity = async (targetUserId = null) => {
    const userIdToFetch = targetUserId || user?.id
    if (!userIdToFetch) return

    try {
      // Fetch exercise completions
      const { data: exerciseData, error: exerciseError } = await supabase
        .from('user_progress')
        .select(`
          *,
          exercises (
            title,
            exercise_type
          )
        `)
        .eq('user_id', userIdToFetch)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(10)

      if (exerciseError) throw exerciseError

      // Fetch achievement claims
      const { data: achievementData, error: achievementError } = await supabase
        .from('user_achievements')
        .select(`
          *,
          achievements (
            title,
            xp_reward
          )
        `)
        .eq('user_id', userIdToFetch)
        .not('claimed_at', 'is', null)
        .order('claimed_at', { ascending: false })
        .limit(10)

      if (achievementError) throw achievementError

      // Combine and sort activities
      const exerciseActivities = (exerciseData || []).map(item => ({
        ...item,
        type: 'exercise',
        activity_date: item.completed_at
      }))

      const achievementActivities = (achievementData || []).map(item => ({
        ...item,
        type: 'achievement',
        activity_date: item.claimed_at,
        xp_earned: item.achievements?.xp_reward || 0
      }))

      const allActivities = [...exerciseActivities, ...achievementActivities]
        .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
        .slice(0, 10)

      setRecentActivity(allActivities)
    } catch (error) {
      console.error('Error fetching recent activity:', error)
    }
  }

  const fetchAvailableAvatars = async () => {
    try {
      // Fetch ALL avatars, not just unlocked ones
      const { data, error } = await supabase
        .from('avatars')
        .select('*')
        .eq('is_active', true)
        .order('unlock_xp', { ascending: true })

      if (error) throw error

      setAvailableAvatars(data || [])
    } catch (error) {
      console.error('Error fetching avatars:', error)
      // Fallback to default avatars if function fails
      setAvailableAvatars([
        { id: '1', name: 'Default', image_url: '👤', unlock_xp: 0, description: 'Default avatar', tier: 'default' },
        { id: '2', name: 'Smiley', image_url: '😊', unlock_xp: 0, description: 'Happy face', tier: 'default' },
        { id: '3', name: 'Rookie', image_url: '🌱', unlock_xp: 500, description: 'Rookie learner', tier: 'bronze' },
        { id: '4', name: 'Scholar', image_url: '🎓', unlock_xp: 2000, description: 'Academic scholar', tier: 'silver' },
        { id: '5', name: 'Expert', image_url: '⚡', unlock_xp: 8000, description: 'Expert level', tier: 'gold' }
      ])
    }

    // Fetch purchased shop avatars
    if (user?.id) {
      try {
        const { data: purchases, error: purchasesError } = await supabase
          .from('user_purchases')
          .select('item_id')
          .eq('user_id', user.id)

        if (purchasesError) throw purchasesError

        if (purchases?.length > 0) {
          const purchasedIds = purchases.map(p => p.item_id)
          const { data: shopAvatars, error: shopError } = await supabase
            .from('shop_items')
            .select('*')
            .eq('is_active', true)
            .eq('category', 'avatar')
            .in('id', purchasedIds)

          if (shopError) throw shopError
          setPurchasedAvatars(shopAvatars || [])
        }
      } catch (error) {
        console.error('Error fetching purchased avatars:', error)
      }
    }
  }

  const fetchCustomAvatars = async () => {
    if (!user?.id) return
    try {
      const { data, error } = await supabase
        .from('avatar_uploads')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCustomAvatars(data || [])
    } catch (error) {
      console.error('Error fetching custom avatars:', error)
    }
  }

  const getUploadCooldownDays = () => {
    if (customAvatars.length === 0) return 0
    const mostRecent = customAvatars.reduce((latest, a) =>
      new Date(a.created_at) > new Date(latest.created_at) ? a : latest
    )
    const uploadedAt = new Date(mostRecent.created_at)
    const unlockAt = new Date(uploadedAt.getTime() + 3 * 24 * 60 * 60 * 1000)
    const now = new Date()
    if (now >= unlockAt) return 0
    return Math.ceil((unlockAt - now) / (24 * 60 * 60 * 1000))
  }

  const uploadCooldownDays = getUploadCooldownDays()

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file ảnh (JPG, PNG, GIF)')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('File ảnh không được vượt quá 2MB')
      return
    }
    if (customAvatars.length >= 20) {
      alert('Bạn chỉ được tải tối đa 20 avatar. Vui lòng xóa avatar cũ trước khi tải ảnh mới.')
      return
    }
    if (uploadCooldownDays > 0) {
      alert(`Bạn chỉ được tải avatar 1 lần trong 7 ngày. Vui lòng chờ thêm ${uploadCooldownDays} ngày.`)
      return
    }

    try {
      setUploadingAvatar(true)

      // Upload to Supabase Storage
      const ext = file.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('user-avatars')
        .upload(path, file, { cacheControl: '3600', upsert: false })

      if (uploadError) throw uploadError

      const { data: publicData } = supabase.storage
        .from('user-avatars')
        .getPublicUrl(path)

      // Create avatar_uploads record
      const { error: insertError } = await supabase
        .from('avatar_uploads')
        .insert({
          user_id: user.id,
          image_url: publicData.publicUrl,
          status: 'pending'
        })

      if (insertError) throw insertError

      await fetchCustomAvatars()
    } catch (error) {
      console.error('Error uploading avatar:', error)
      alert('Lỗi tải ảnh lên. Vui lòng thử lại.')
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  const handleCustomAvatarSelect = async (upload) => {
    if (upload.status !== 'approved') return
    try {
      const { error } = await supabase
        .from('users')
        .update({ avatar_url: upload.image_url })
        .eq('id', user.id)

      if (error) throw error
      setSelectedAvatar(upload.image_url)
      setShowAvatarSelector(false)
    } catch (error) {
      console.error('Error setting custom avatar:', error)
    }
  }

  const handleDeleteCustomAvatar = async (uploadId) => {
    if (!window.confirm('Xóa avatar này?')) return
    try {
      // Find the avatar to get its image_url for storage deletion
      const avatarToDelete = customAvatars.find(a => a.id === uploadId)

      const { error } = await supabase
        .from('avatar_uploads')
        .delete()
        .eq('id', uploadId)
        .eq('user_id', user.id)

      if (error) throw error

      // Delete from storage bucket
      if (avatarToDelete?.image_url) {
        const url = avatarToDelete.image_url
        const storagePath = url.split('/user-avatars/').pop()
        if (storagePath) {
          await supabase.storage.from('user-avatars').remove([decodeURIComponent(storagePath)])
        }
      }

      await fetchCustomAvatars()
    } catch (error) {
      console.error('Error deleting custom avatar:', error)
    }
  }

  const processBadges = async (userXP = null) => {
    try {
      // Get user's current XP
      const currentXP = userXP !== null ? userXP : (stats.totalXP || currentProfile?.xp || 0)

      // Fetch student levels from the existing admin system
      const { data: studentLevels, error } = await supabase
        .from('student_levels')
        .select('*')
        .eq('is_active', true)
        .order('level_number', { ascending: true })

      if (error) throw error

      const levels = studentLevels || []

      // Convert student levels to badge format and separate earned vs upcoming
      const earned = levels.filter(level => currentXP >= level.xp_required)
      const upcoming = levels.filter(level => currentXP < level.xp_required)

      setEarnedBadges(earned)
      setUpcomingBadges(upcoming)
    } catch (error) {
      console.error('Error processing badges:', error)
    }
  }

  const fetchAchievements = async (targetUserId = null) => {
    try {
      const userIdToFetch = targetUserId || user?.id
      if (!userIdToFetch) return

      // Fetch all achievements directly from database
      const { data: allAchievements, error: achievementsError } = await supabase
        .from('achievements')
        .select('*')
        .eq('is_active', true)
        .order('criteria_value', { ascending: true })

      if (achievementsError) throw achievementsError

      // Fetch user's specific achievements from database
      const { data: userAchievements, error } = await supabase
        .from('user_achievements')
        .select('*')
        .eq('user_id', userIdToFetch)

      if (error) throw error

      // Fetch auxiliary counts needed for pet/shop/wild-catch achievement criteria
      const [
        { count: petCount },
        { count: petEvolvedCount },
        { count: wildCatchCount },
        { data: shopItemsOwned }
      ] = await Promise.all([
        supabase
          .from('user_pets')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userIdToFetch),
        supabase
          .from('user_pets')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userIdToFetch)
          .eq('evolution_stage', 2),
        supabase
          .from('wild_area_logs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userIdToFetch)
          .eq('action', 'catch_success'),
        supabase
          .from('user_purchases')
          .select('shop_items(category)')
          .eq('user_id', userIdToFetch)
      ])

      const shopCounts = { avatar: 0, frame: 0, spaceship: 0, hammer: 0, boat: 0 }
      ;(shopItemsOwned || []).forEach(p => {
        const cat = p.shop_items?.category
        if (cat && Object.prototype.hasOwnProperty.call(shopCounts, cat)) shopCounts[cat]++
      })

      // Get user stats for progress calculation
      const targetProfile = targetUserId ? viewedProfile : profile
      const userStats = {
        completedExercises: stats.exercisesCompleted || 0,
        currentStreak: stats.streakCount || 0,
        totalXp: stats.totalXP || targetProfile?.xp || 0,
        petCount: petCount || 0,
        petEvolvedCount: petEvolvedCount || 0,
        wildCatchCount: wildCatchCount || 0,
        shopCounts
      }

      console.log('User stats for achievement calculation:', userStats)
      console.log('User achievements from DB:', userAchievements)

      // Process achievements with proper unlock calculation
      const processedAchievements = allAchievements.map(achievement => {
        const userAchievement = userAchievements?.find(ua => ua.achievement_id === achievement.id)

        // Calculate if achievement should be unlocked based on criteria (same logic as AchievementBadgeBar)
        let calculatedUnlocked = false

        // Check if this is a daily challenge achievement (manually awarded)
        if (achievement.criteria_type && achievement.criteria_type.startsWith('daily_challenge_rank_')) {
          // Daily challenge achievements are unlocked if user has earned them
          calculatedUnlocked = !!userAchievement
        } else {
          // Regular achievements based on stats
          switch (achievement.criteria_type) {
            case 'exercise_completed':
              calculatedUnlocked = userStats.completedExercises >= achievement.criteria_value
              break
            case 'daily_streak':
              calculatedUnlocked = userStats.currentStreak >= achievement.criteria_value
              break
            case 'total_xp':
              calculatedUnlocked = userStats.totalXp >= achievement.criteria_value
              break
            case 'daily_exercises':
              calculatedUnlocked = false // This criteria is not implemented yet
              break
            case 'pet_owned':
              calculatedUnlocked = userStats.petCount >= achievement.criteria_value
              break
            case 'pet_evolved':
              calculatedUnlocked = userStats.petEvolvedCount >= achievement.criteria_value
              break
            case 'wild_catch_success':
              calculatedUnlocked = userStats.wildCatchCount >= achievement.criteria_value
              break
            case 'avatar_owned':
            case 'frame_owned':
            case 'spaceship_owned':
            case 'hammer_owned':
            case 'boat_owned': {
              const cat = achievement.criteria_type.replace('_owned', '')
              calculatedUnlocked = (userStats.shopCounts[cat] || 0) >= achievement.criteria_value
              break
            }
            default:
              calculatedUnlocked = false
          }
        }

        // Use database record if it exists (earned_at), otherwise use calculated value
        const isUnlocked = !!userAchievement?.earned_at || calculatedUnlocked
        const isClaimed = !!userAchievement?.claimed_at

        return {
          ...achievement,
          isUnlocked,
          isClaimed,
          unlockedDate: isUnlocked && userAchievement?.earned_at
            ? new Date(userAchievement.earned_at).toLocaleDateString('vi-VN')
            : (calculatedUnlocked ? 'Đã mở khóa' : null),
          claimedDate: isClaimed ? new Date(userAchievement.claimed_at).toLocaleDateString('vi-VN') : null
        }
      })

      console.log('Processed achievements:', processedAchievements)
      setAchievements(processedAchievements)
    } catch (error) {
      console.error('Error fetching achievements:', error)
    }
  }

  const handleAvatarSelect = async (avatar) => {
    if (stats.totalXP < avatar.unlock_xp) return

    try {
      const { error } = await supabase
        .from('users')
        .update({ avatar_url: avatar.image_url })
        .eq('id', user.id)

      if (error) throw error

      setSelectedAvatar(avatar.image_url)
      setShowAvatarSelector(false)
    } catch (error) {
      console.error('Error updating avatar:', error)
    }
  }

  const handleShopAvatarSelect = async (item) => {
    const avatarUrl = item.item_data?.avatar_url || item.image_url
    try {
      const { error } = await supabase
        .from('users')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)

      if (error) throw error

      setSelectedAvatar(avatarUrl)
      setShowAvatarSelector(false)
    } catch (error) {
      console.error('Error updating avatar:', error)
    }
  }

  const handleEditToggle = () => {
    setIsEditing(!isEditing)
    if (!isEditing) {
      setEditData({
        full_name: profile?.full_name || ''
      })
    }
  }

  const handleClaimAchievementXP = async (achievementId) => {
    // Verify the achievement is actually unlocked before claiming
    const achievement = achievements.find(a => a.id === achievementId)
    if (!achievement?.isUnlocked || achievement?.isClaimed) {
      return
    }

    setClaimingAchievement(prev => ({ ...prev, [achievementId]: true }))
    setClaimMessage('')
    try {
      // Ensure achievement is awarded in DB before claiming
      await checkAndAwardAchievements()
      const result = await claimAchievementXP(achievementId)
      if (result.success) {
        setClaimResult({
          xp: result.xpAwarded || 0,
          gems: result.gemsAwarded || 0,
          title: achievement.title
        })
        // Refresh achievements list using Profile's own fetch
        await fetchAchievements()
      } else {
        setClaimMessage(result.message)
        setTimeout(() => setClaimMessage(''), 3000)
      }
    } catch (error) {
      setClaimMessage('Có lỗi xảy ra khi nhận XP')
      setTimeout(() => setClaimMessage(''), 3000)
    } finally {
      setClaimingAchievement(prev => ({ ...prev, [achievementId]: false }))
    }
  }

  const NAME_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

  const getNameCooldownRemaining = () => {
    if (!profile?.name_changed_at) return 0
    const elapsed = Date.now() - new Date(profile.name_changed_at).getTime()
    return Math.max(0, NAME_COOLDOWN_MS - elapsed)
  }

  const formatCooldown = (ms) => {
    const hours = Math.floor(ms / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    if (days > 0) return `${days} ngày ${remainingHours} giờ`
    return `${remainingHours} giờ`
  }

  const handleSaveProfile = async () => {
    try {
      const trimmedName = (editData.full_name || '').trim()
      if (!trimmedName) {
        alert('Tên không được để trống.')
        return
      }
      const nameChanged = trimmedName !== profile?.full_name
      if (nameChanged) {
        const remaining = getNameCooldownRemaining()
        if (remaining > 0) {
          alert(`Bạn chỉ có thể đổi tên sau ${formatCooldown(remaining)} nữa.`)
          return
        }
      }
      const updates = { ...editData, full_name: trimmedName }
      if (nameChanged) {
        updates.name_changed_at = new Date().toISOString()
      }
      await updateProfile(updates)
      setIsEditing(false)
    } catch (error) {
      console.error('Error updating profile:', error)
    }
  }

  const getExerciseTypeIcon = (type) => {
    const IconImg = ({ src, className = '' }) => (
      <img src={src} alt="" className={className} />
    )

    const icons = {
      multiple_choice: (props) => (
        <IconImg src={assetUrl('/icon/exercise_type/multiple_choice.svg')} {...props} />
      ),
      flashcard: BookOpen,
      fill_blank: (props) => (
        <IconImg src={assetUrl('/icon/exercise_type/fill_blank.svg')} {...props} />
      ),
      drag_drop: (props) => (
        <IconImg src={assetUrl('/icon/exercise_type/drag_drop.svg')} {...props} />
      ),
      dropdown: (props) => (
        <IconImg src={assetUrl('/icon/exercise_type/drop_down.svg')} {...props} />
      )
    }
    return icons[type] || BookOpen
  }

  const getExerciseTypeLabel = (type) => {
    const labels = {
      multiple_choice: 'Multiple Choice',
      flashcard: 'Flashcard',
      fill_blank: 'Fill in the Blank'
    }
    return labels[type] || type
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

  const formatPracticeTime = (minutes) => {
    if (minutes < 60) return `${minutes} phút`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours} giờ`
  }

  const getTierIcon = (tier) => {
    const icons = {
      bronze: Shield,
      silver: Award,
      gold: Crown,
      platinum: Gem,
      diamond: Zap
    }
    return icons[tier] || Shield
  }

  const getTierColor = (tier) => {
    const colors = {
      bronze: 'text-amber-600',
      silver: 'text-gray-500',
      gold: 'text-yellow-500',
      platinum: 'text-purple-500',
      diamond: 'text-cyan-400'
    }
    return colors[tier] || 'text-gray-500'
  }

  const getTierBgColor = (tier) => {
    const colors = {
      bronze: 'bg-yellow-100',
      silver: 'bg-gray-300',
      gold: 'bg-amber-300',
      platinum: 'bg-purple-400',
      diamond: 'bg-cyan-500'
    }
    return colors[tier] || 'bg-gray-100'
  }

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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Profile Header */}
      <div className="relative text-white overflow-hidden" style={{ clipPath: CLIP_CARD }}>
        <CornerBrackets />
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${assetUrl('/image/dashboard/blue_dashboard_hero_section.jpeg')})` }}
        />
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-black/30" />
        <div className="p-6 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <AvatarWithFrame
                avatarUrl={selectedAvatar}
                frameUrl={currentProfile?.hide_frame ? null : currentProfile?.active_title}
                frameRatio={currentProfile?.active_frame_ratio}
                size={80}
                fallback={currentProfile?.full_name?.[0]?.toUpperCase() || currentProfile?.email?.[0]?.toUpperCase() || 'U'}
                onClick={isOwnProfile ? () => setShowAvatarSelector(true) : undefined}
              />
              <div>
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Tên đầy đủ"
                      value={editData.full_name}
                      onChange={(e) => setEditData(prev => ({ ...prev, full_name: e.target.value }))}
                      className="px-3 py-1 text-gray-900 text-xl font-semibold border border-white/30"
                      style={{ clipPath: CLIP_BTN }}
                      disabled={getNameCooldownRemaining() > 0}
                    />
                    {getNameCooldownRemaining() > 0 && (
                      <p className="text-yellow-200 text-xs mt-1">
                        Đổi tên sau {formatCooldown(getNameCooldownRemaining())}
                      </p>
                    )}
                    {(profile?.role === 'admin' || profile?.role === 'teacher') && (
                      <p className="text-blue-100 flex items-center space-x-2">
                        <Mail className="w-4 h-4" />
                        <span>{currentProfile?.email}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <h1 className="text-3xl font-semibold">
                      {currentProfile?.full_name || 'Người dùng'}
                    </h1>
                    {(profile?.role === 'admin' || profile?.role === 'teacher') && (
                      <p className="text-blue-100 flex items-center space-x-2 mt-1">
                        <Mail className="w-4 h-4" />
                        <span>{currentProfile?.email}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {isOwnProfile && (
              <div className="text-right">
                {isEditing ? (
                  <div className="space-x-2">
                    <button onClick={handleSaveProfile} className="px-4 py-2 text-sm font-medium text-white border border-white/50 hover:bg-white/20 transition-colors" style={{ clipPath: CLIP_BTN }}>
                      Lưu
                    </button>
                    <button onClick={handleEditToggle} className="px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors" style={{ clipPath: CLIP_BTN }}>
                      Hủy
                    </button>
                  </div>
                ) : (
                  <button onClick={handleEditToggle} className="px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors" style={{ clipPath: CLIP_BTN }}>
                    <Edit3 className="w-4 h-4 mr-2 inline" />
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Level and XP Bar */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <div></div>
              <span className="font-semibold">{stats.totalXP} XP</span>
            </div>
            
            {!isMaxLevel && nextLevel ? (
              <>
                <div className="w-full bg-white/20 h-3" style={{ clipPath: CLIP_BTN }}>
                  <div
                    className="bg-white h-3 transition-all duration-300"
                    style={{ width: `${levelProgress.progressPercentage}%` }}
                  />
                </div>
                <div className="text-xs text-blue-100 mt-1 text-center">
                  {levelProgress.xpNeeded} XP to unlock {nextBadge?.name}
                </div>
              </>
            ) : (
              <div className="w-full bg-white/20 h-3" style={{ clipPath: CLIP_BTN }}>
                <div className="bg-white h-3 w-full" />
              </div>
            )}
            
            {isMaxLevel && (
              <div className="text-xs text-blue-100 mt-1 text-center">
                🎉 You've reached the highest level!
              </div>
            )}
          </div>
        </div>
      </div>



      {/* Badge Collection */}
      <div className="relative bg-white border border-gray-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
        <CornerBrackets />
        <div className="px-5 pt-4 pb-1">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold flex items-center space-x-2 uppercase tracking-wide">
              <Trophy className="w-5 h-5 text-yellow-600" />
              <span>Badges ({earnedBadges.length})</span>
            </h3>
            <button
              onClick={() => setShowBadgeModal(true)}
              className="flex items-center space-x-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
              style={{ clipPath: CLIP_BTN }}
            >
              <Trophy className="w-4 h-4" />
              <span>View All</span>
            </button>
          </div>
          <div className="h-[2px] w-12 bg-gradient-to-r from-yellow-400 to-transparent mt-1" />
        </div>

        <div className="p-4">
          {earnedBadges.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {earnedBadges.slice(0, 6).map((badge) => (
                <div key={badge.id} className="text-center">
                  <div className={`w-16 h-16 mx-auto mb-2 p-2 rounded-full ${getTierBgColor(badge.badge_tier)}`}>
                    <img
                      src={badge.badge_icon}
                      alt={badge.badge_name}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.target.style.display = 'none'
                        e.target.nextSibling.style.display = 'inline'
                      }}
                    />
                    <span className="text-2xl hidden">{badge.badge_icon}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-900">{badge.badge_name}</div>
                </div>
              ))}
              {earnedBadges.length > 6 && (
                <div className="flex items-center justify-center">
                  <button
                    onClick={() => setShowBadgeModal(true)}
                    className="w-16 h-16 mx-auto mb-2 p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center"
                  >
                    <span className="text-sm text-gray-600">+{earnedBadges.length - 6}</span>
                  </button>
                  <div className="text-sm text-gray-600 text-center">More...</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Trophy className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>No badges earned yet. Keep learning to unlock your first badge!</p>
              <button
                onClick={() => setShowBadgeModal(true)}
                className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
              >
                View All Available Badges
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Achievements Collection */}
      <div className="relative bg-white border border-gray-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
        <CornerBrackets />
        <div className="px-5 pt-4 pb-1">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold flex items-center space-x-2 uppercase tracking-wide">
              <Award className="w-5 h-5 text-purple-600" />
              <span>Achievements ({achievements.filter(a => a.isUnlocked).length})</span>
            </h3>
            <button
              onClick={() => setShowAchievementModal(true)}
              className="flex items-center space-x-1 px-3 py-1 text-sm text-purple-600 hover:text-purple-700 hover:bg-purple-50 transition-colors"
              style={{ clipPath: CLIP_BTN }}
            >
              <Award className="w-4 h-4" />
              <span>View All</span>
            </button>
          </div>
          <div className="h-[2px] w-12 bg-gradient-to-r from-purple-400 to-transparent mt-1" />
        </div>

        <div className="p-4">
          {achievements.filter(a => a.isUnlocked).length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {achievements.filter(a => a.isUnlocked).slice(0, 6).map((achievement) => {
                // Calculate win count for challenge achievements
                const getWinCount = () => {
                  if (!achievement.criteria_type?.startsWith('daily_challenge_rank_')) return 0
                  const match = achievement.criteria_type.match(/rank_(\d)/)
                  if (match) {
                    const rankKey = `rank_${match[1]}`
                    return challengeWinCounts[rankKey] || 0
                  }
                  return 0
                }
                const winCount = getWinCount()

                return (
                  <div key={achievement.id} className="text-center">
                    {achievement.badge_image_url ? (
                      <img
                        src={achievement.badge_image_url}
                        alt={achievement.title}
                        className="w-20 h-20 mx-auto mb-2 object-contain"
                      />
                    ) : (
                      <div className="text-4xl mx-auto mb-2">
                        🏆
                      </div>
                    )}
                    <div className="text-sm font-medium text-gray-900 flex items-center justify-center gap-1">
                      {achievement.title}
                      {winCount > 0 && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">
                          ×{winCount}
                        </span>
                      )}
                    </div>
                    {achievement.isClaimed && (
                      <div className="text-xs text-green-600 mt-1">✓ Đã nhận</div>
                    )}
                    {!achievement.isClaimed && isOwnProfile && (achievement.xp_reward > 0 || achievement.gem_reward > 0) && (
                      <button
                        onClick={() => handleClaimAchievementXP(achievement.id)}
                        disabled={claimingAchievement[achievement.id]}
                        className="mt-1 flex items-center justify-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
                      >
                        <Gift className="w-3 h-3" />
                        {claimingAchievement[achievement.id]
                          ? '...'
                          : `Nhận ${[
                              achievement.xp_reward > 0 ? `${achievement.xp_reward} XP` : null,
                              achievement.gem_reward > 0 ? `${achievement.gem_reward} 💎` : null,
                            ].filter(Boolean).join(' + ')}`}
                      </button>
                    )}
                  </div>
                )
              })}
              {achievements.filter(a => a.isUnlocked).length > 6 && (
                <div className="flex items-center justify-center">
                  <button
                    onClick={() => setShowAchievementModal(true)}
                    className="w-16 h-16 mx-auto mb-2 p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center"
                  >
                    <span className="text-sm text-gray-600">+{achievements.filter(a => a.isUnlocked).length - 6}</span>
                  </button>
                  <div className="text-sm text-gray-600 text-center">More...</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Award className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>No achievements unlocked yet. Keep learning to unlock your first achievement!</p>
            </div>
          )}
        </div>
      </div>

      {/* Pet Collection */}
      {(() => {
        const allUserPets = isOwnProfile ? userPets : viewedUserPets
        // Show active pet first, then others
        const activePet = allUserPets.find(p => p.is_active)
        const otherPets = allUserPets.filter(p => !p.is_active).slice(0, 2)
        const displayPets = activePet ? [activePet, ...otherPets] : allUserPets.slice(0, 3)

        return (
          <div className="relative bg-white border border-gray-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
            <CornerBrackets />
            <div className="px-5 pt-4 pb-1">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold flex items-center space-x-2 uppercase tracking-wide">
                  <span className="text-2xl">🐾</span>
                  <span>Pets ({allUserPets.length})</span>
                </h3>
                {isOwnProfile && (
                  <button
                    onClick={() => navigate('/pets')}
                    className="flex items-center space-x-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                    style={{ clipPath: CLIP_BTN }}
                  >
                    <span>View All</span>
                  </button>
                )}
              </div>
              <div className="h-[2px] w-12 bg-gradient-to-r from-blue-400 to-transparent mt-1" />
            </div>

            <div className="p-4">
              {allUserPets.length > 0 ? (
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-3 gap-4">
                  {displayPets.map((userPet) => {
                    const pet = userPet.pet
                    const rarityColors = {
                      common: 'bg-gray-100 border-gray-300',
                      uncommon: 'bg-green-50 border-green-300',
                      rare: 'bg-blue-50 border-blue-300',
                      epic: 'bg-purple-50 border-purple-300',
                      legendary: 'bg-yellow-50 border-yellow-300'
                    }
                    const viewerOwnsPet = isOwnProfile || userPets?.some(p => p.pet?.id === pet?.id)

                    return (
                      <div key={userPet.id} className="text-center">
                        <div className={`w-24 h-24 mx-auto mb-2 rounded-full border-2 flex items-center justify-center overflow-hidden relative ${viewerOwnsPet ? (rarityColors[pet?.rarity] || rarityColors.common) : 'bg-gray-100 border-gray-300'}`}>
                          {pet?.image_url ? (
                            <img src={pet.image_url} alt={viewerOwnsPet ? pet.name : '???'} className={`w-full h-full object-contain select-none pointer-events-none ${!viewerOwnsPet ? 'filter brightness-0' : ''}`} draggable={false} />
                          ) : (
                            <span className={`text-2xl ${!viewerOwnsPet ? 'filter grayscale brightness-50' : ''}`}>
                              {pet?.rarity === 'legendary' ? '🐉' :
                               pet?.rarity === 'epic' ? '🦅' :
                               pet?.rarity === 'rare' ? '🦊' :
                               pet?.rarity === 'uncommon' ? '🐱' : '🐶'}
                            </span>
                          )}
                          <div className="absolute inset-0 z-10" onContextMenu={(e) => e.preventDefault()} />
                        </div>
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {viewerOwnsPet ? (userPet.nickname || pet?.name) : '???'}
                        </div>
                        <div className="text-xs text-gray-500 capitalize">{pet?.rarity}</div>
                        {userPet.is_active && (
                          <div className="text-xs text-blue-600 font-medium">Active</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <span className="text-5xl block mb-4">🐾</span>
                  <p>{isOwnProfile ? 'No pets yet. Visit the Egg Shop to hatch your first companion!' : 'This user has no pets yet.'}</p>
                  {isOwnProfile && (
                    <button
                      onClick={() => navigate('/shop?tab=egg')}
                      className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      Visit Egg Shop
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="relative bg-white border border-gray-200 text-center p-4 overflow-hidden" style={{ clipPath: CLIP_SM }}>
          <div className="w-12 h-12 flex items-center justify-center mx-auto mb-2">
            <img src={assetUrl('/icon/profile/XP.svg')} alt="XP" className="w-12 h-12" />
          </div>
          <div className="text-2xl font-semibold text-gray-900">{stats.totalXP}</div>
          <div className="text-sm text-gray-500">Total XP</div>
          {currentBadge && (
            <div className="text-xs text-gray-400 mt-1">
              {currentBadge?.name}
            </div>
          )}
        </div>

        <div className="relative bg-white border border-gray-200 text-center p-4 overflow-hidden" style={{ clipPath: CLIP_SM }}>
          <div className="w-12 h-12 flex items-center justify-center mx-auto mb-2">
            <img src={assetUrl('/icon/profile/paper.svg')} alt="Exercises" className="w-12 h-12" />
          </div>
          <div className="text-2xl font-semibold text-gray-900">{stats.exercisesCompleted}</div>
          <div className="text-sm text-gray-500">Bài tập hoàn thành</div>
        </div>

        <div className="relative bg-white border border-gray-200 text-center p-4 overflow-hidden" style={{ clipPath: CLIP_SM }}>
          <div className="w-12 h-12 flex items-center justify-center mx-auto mb-2">
            <img src={assetUrl('/icon/profile/streak.svg')} alt="Streak" className="w-12 h-12" />
          </div>
          <div className="text-2xl font-semibold text-gray-900">{stats.streakCount}</div>
          <div className="text-sm text-gray-500">Chuỗi ngày học</div>
        </div>

        <div className="relative bg-white border border-gray-200 text-center p-4 overflow-hidden" style={{ clipPath: CLIP_SM }}>
          <div className="w-12 h-12 flex items-center justify-center mx-auto mb-2">
            <img src={assetUrl('/icon/profile/score%20metric.svg')} alt="Score" className="w-12 h-12" />
          </div>
          <div className="text-2xl font-semibold text-gray-900">{stats.averageScore}%</div>
          <div className="text-sm text-gray-500">Điểm trung bình</div>
        </div>
      </div>

      {/* Recent Activity - moved to Progress page */}

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="relative bg-white border border-gray-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
          <CornerBrackets />
          <div className="px-5 pt-4 pb-1">
            <h3 className="text-base font-semibold flex items-center space-x-2 uppercase tracking-wide">
              <Clock className="w-5 h-5" />
              <span>Thời gian học tập</span>
            </h3>
            <div className="h-[2px] w-12 bg-gradient-to-r from-blue-400 to-transparent mt-1" />
          </div>
          <div className="p-4">
            <div className="text-3xl font-semibold text-gray-900 mb-2">
              {formatPracticeTime(stats.totalPracticeTime)}
            </div>
            <p className="text-gray-500 text-sm">Tổng thời gian luyện tập</p>
          </div>
        </div>

        <div className="relative bg-white border border-gray-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
          <CornerBrackets />
          <div className="px-5 pt-4 pb-1">
            <h3 className="text-base font-semibold flex items-center space-x-2 uppercase tracking-wide">
              <Calendar className="w-5 h-5" />
              <span>Tham gia từ</span>
            </h3>
            <div className="h-[2px] w-12 bg-gradient-to-r from-blue-400 to-transparent mt-1" />
          </div>
          <div className="p-4">
            <div className="text-lg font-medium text-gray-900 mb-2">
              {currentProfile?.created_at ? new Date(currentProfile.created_at).toLocaleDateString('vi-VN') : 'N/A'}
            </div>
            <p className="text-gray-500 text-sm">Ngày đăng ký tài khoản</p>
          </div>
        </div>
      </div>

      {/* Avatar Selector Modal */}
      {showAvatarSelector && isOwnProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white border border-gray-200 p-8 max-w-5xl w-full max-h-[90vh] overflow-y-auto" style={{ clipPath: CLIP_CARD }}>
            <CornerBrackets />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Chọn Avatar - Thu thập XP để mở khóa</h3>
              <button
                onClick={() => setShowAvatarSelector(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 md:grid-cols-8 lg:grid-cols-10 gap-6">
              {availableAvatars.map((avatar) => {
                const isUnlocked = stats.totalXP >= avatar.unlock_xp
                const isSelected = selectedAvatar === avatar.image_url

                return (
                  <div key={avatar.id} className="text-center">
                    <div className="relative w-20 h-20">
                      <div
                        className={`w-full h-full rounded-full flex items-center justify-center text-2xl transition-all overflow-hidden border-2 ${
                          isUnlocked
                            ? isSelected
                              ? 'bg-blue-500 text-white ring-4 ring-blue-300 border-blue-600 cursor-pointer'
                              : 'bg-gray-100 hover:bg-gray-200 border-gray-300 cursor-pointer'
                            : 'bg-gray-300 opacity-50 border-gray-400 cursor-not-allowed'
                        }`}
                        onClick={() => isUnlocked && handleAvatarSelect(avatar)}
                        title={
                          isUnlocked
                            ? `${avatar.name} - ${avatar.description}`
                            : `${avatar.name} - Cần ${avatar.unlock_xp} XP để mở khóa`
                        }
                      >
                        {avatar.image_url.startsWith('http') ? (
                          <img src={avatar.image_url} alt={avatar.name} className="w-full h-full object-cover rounded-full select-none pointer-events-none" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                        ) : (
                          avatar.image_url
                        )}
                      </div>
                      
                      {/* Lock overlay for locked avatars - positioned absolutely over the entire container */}
                      {!isUnlocked && (
                        <div className="absolute inset-0 bg-black bg-opacity-60 rounded-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="text-xs mt-2">
                      <div className={`font-medium ${isUnlocked ? 'text-gray-800' : 'text-gray-500'}`}>
                        {avatar.name}
                      </div>
                      {!isUnlocked ? (
                        <div className="text-red-500 font-medium">
                          {avatar.unlock_xp} XP
                        </div>
                      ) : (
                        avatar.tier !== 'default' && (
                          <div className="text-gray-500 capitalize">
                            {avatar.tier}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Purchased Shop Avatars */}
            {purchasedAvatars.length > 0 && (
              <>
                <div className="mt-6 mb-4 border-t pt-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Avatar đã mua</h4>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-8 lg:grid-cols-10 gap-6">
                  {purchasedAvatars.map((item) => {
                    const avatarUrl = item.item_data?.avatar_url || item.image_url
                    const isSelected = selectedAvatar === avatarUrl

                    return (
                      <div key={`shop-${item.id}`} className="text-center">
                        <div className="relative w-20 h-20">
                          <div
                            className={`w-full h-full rounded-full flex items-center justify-center text-2xl transition-all overflow-hidden border-2 cursor-pointer ${
                              isSelected
                                ? 'bg-blue-500 text-white ring-4 ring-blue-300 border-blue-600'
                                : 'bg-gray-100 hover:bg-gray-200 border-gray-300'
                            }`}
                            onClick={() => handleShopAvatarSelect(item)}
                          >
                            {avatarUrl.startsWith('http') ? (
                              <img src={avatarUrl} alt={item.name} className="w-full h-full object-cover rounded-full select-none pointer-events-none" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                            ) : (
                              avatarUrl
                            )}
                          </div>
                        </div>
                        <div className="text-xs mt-2">
                          <div className="font-medium text-gray-800">{item.name}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Custom Uploaded Avatars */}
            <div className="mt-6 mb-4 border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700">Avatar tự tải lên</h4>
                <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                  uploadingAvatar || customAvatars.length >= 20 || uploadCooldownDays > 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}>
                  <Upload className="w-4 h-4" />
                  {uploadingAvatar ? 'Đang tải...' : customAvatars.length >= 20 ? 'Tối đa 20 avatar' : uploadCooldownDays > 0 ? `Chờ ${uploadCooldownDays} ngày` : 'Tải ảnh lên'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar || customAvatars.length >= 20 || uploadCooldownDays > 0}
                    className="hidden"
                  />
                </label>
              </div>

              {customAvatars.length > 0 ? (
                <div className="grid grid-cols-3 md:grid-cols-8 lg:grid-cols-10 gap-6">
                  {customAvatars.map((upload) => {
                    const isApproved = upload.status === 'approved'
                    const isPending = upload.status === 'pending'
                    const isRejected = upload.status === 'rejected'
                    const isSelected = selectedAvatar === upload.image_url

                    return (
                      <div key={`custom-${upload.id}`} className="text-center">
                        <div className="relative w-20 h-20">
                          <div
                            className={`w-full h-full rounded-full flex items-center justify-center text-2xl transition-all overflow-hidden border-2 ${
                              isApproved
                                ? isSelected
                                  ? 'bg-blue-500 ring-4 ring-blue-300 border-blue-600 cursor-pointer'
                                  : 'bg-gray-100 hover:bg-gray-200 border-gray-300 cursor-pointer'
                                : isPending
                                  ? 'border-yellow-400 opacity-70 cursor-not-allowed'
                                  : 'border-red-400 opacity-50 cursor-not-allowed'
                            }`}
                            onClick={() => isApproved && handleCustomAvatarSelect(upload)}
                            title={
                              isApproved ? 'Nhấn để chọn'
                              : isPending ? 'Đang chờ admin duyệt'
                              : `Bị từ chối${upload.reject_reason ? ': ' + upload.reject_reason : ''}`
                            }
                          >
                            <img src={upload.image_url} alt="Custom avatar" className="w-full h-full object-cover rounded-full select-none pointer-events-none" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                          </div>

                          {/* Status badge */}
                          <div className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center ${
                            isApproved ? 'bg-green-500' : isPending ? 'bg-yellow-500' : 'bg-red-500'
                          }`}>
                            {isApproved && <CheckCircle className="w-4 h-4 text-white" />}
                            {isPending && <AlertCircle className="w-4 h-4 text-white" />}
                            {isRejected && <XCircle className="w-4 h-4 text-white" />}
                          </div>

                          {/* Delete button for pending/rejected */}
                          {(isPending || isRejected) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteCustomAvatar(upload.id) }}
                              className="absolute -bottom-1 -right-1 w-5 h-5 bg-gray-600 hover:bg-gray-700 rounded-full flex items-center justify-center"
                              title="Xóa"
                            >
                              <X className="w-3 h-3 text-white" />
                            </button>
                          )}
                        </div>
                        <div className="text-xs mt-2">
                          <div className={`font-medium ${
                            isApproved ? 'text-green-600' : isPending ? 'text-yellow-600' : 'text-red-500'
                          }`}>
                            {isApproved ? 'Đã duyệt' : isPending ? 'Chờ duyệt' : 'Từ chối'}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">
                  Tải ảnh lên để sử dụng làm avatar. Ảnh sẽ cần được admin duyệt trước khi sử dụng.
                </p>
              )}
            </div>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200" style={{ clipPath: CLIP_SM }}>
              <div className="text-center">
                <span className="text-lg font-semibold text-blue-900">
                  XP hiện tại: {stats.totalXP}
                </span>
                {currentLevel && (
                  <div className="text-sm text-blue-700 mt-1">
                    Cấp {currentLevel.level_number} • {currentBadge?.name}
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Badge Modal */}
      {showBadgeModal && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white border border-gray-200 max-w-4xl w-full max-h-[90vh] overflow-y-auto" style={{ clipPath: CLIP_CARD }}>
            <CornerBrackets />
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 uppercase tracking-wide">Badge Collection</h2>
                <button
                  onClick={() => setShowBadgeModal(false)}
                  className="p-2 hover:bg-gray-100 transition-colors"
                  style={{ clipPath: CLIP_BTN }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="h-[2px] w-16 bg-gradient-to-r from-yellow-400 to-transparent mt-1" />
            </div>

            <div className="p-6 space-y-8">
              {/* Earned Badges */}
              {earnedBadges.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                    <Trophy className="w-5 h-5 text-yellow-600" />
                    <span>Earned Badges ({earnedBadges.length})</span>
                  </h3>
                  <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
                    {earnedBadges.map((badge) => (
                      <div key={badge.id} className="text-center">
                        <div className={`w-16 h-16 mx-auto mb-2 p-2 rounded-full ${getTierBgColor(badge.badge_tier)}`}>
                          <img
                            src={badge.badge_icon}
                            alt={badge.badge_name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              e.target.style.display = 'none'
                              e.target.nextSibling.style.display = 'inline'
                            }}
                          />
                          <span className="text-2xl hidden">{badge.badge_icon}</span>
                        </div>
                        <div className="text-sm font-medium text-gray-900">{badge.badge_name}</div>
                        <div className="text-xs text-gray-500">{badge.xp_required} XP</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming Badges */}
              {upcomingBadges.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                    <Target className="w-5 h-5 text-gray-600" />
                    <span>Upcoming Badges ({upcomingBadges.length})</span>
                  </h3>
                  <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
                    {upcomingBadges.map((badge) => (
                      <div key={badge.id} className="text-center relative">
                        <div className="w-16 h-16 mx-auto mb-2 p-2 rounded-full bg-gray-100 relative">
                          <img
                            src={badge.badge_icon}
                            alt={badge.badge_name}
                            className="w-full h-full object-contain opacity-30 grayscale"
                            onError={(e) => {
                              e.target.style.display = 'none'
                              e.target.nextSibling.style.display = 'inline'
                            }}
                          />
                          <span className="text-2xl hidden opacity-30 grayscale">{badge.badge_icon}</span>
                          {/* Lock overlay */}
                          <div className="absolute inset-0 bg-black bg-opacity-30 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </div>
                        </div>
                        <div className="text-sm font-medium text-gray-600">{badge.badge_name}</div>
                        <div className="text-xs text-gray-500">{badge.xp_required} XP</div>

                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {earnedBadges.length === 0 && upcomingBadges.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Trophy className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No badges available</h3>
                  <p>Badge system is not configured yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Achievement Modal */}
      {showAchievementModal && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white border border-gray-200 max-w-4xl w-full max-h-[90vh] overflow-y-auto" style={{ clipPath: CLIP_CARD }}>
            <CornerBrackets />
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 uppercase tracking-wide">Achievement Collection</h2>
                <button
                  onClick={() => setShowAchievementModal(false)}
                  className="p-2 hover:bg-gray-100 transition-colors"
                  style={{ clipPath: CLIP_BTN }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="h-[2px] w-16 bg-gradient-to-r from-purple-400 to-transparent mt-1" />
            </div>

            <div className="p-6">
              {/* Claim Message */}
              {claimMessage && (
                <div className={`mb-4 p-3 ${
                  claimMessage.includes('+')
                    ? 'bg-green-100 text-green-800 border border-green-200'
                    : 'bg-red-100 text-red-800 border border-red-200'
                }`} style={{ clipPath: CLIP_SM }}>
                  {claimMessage}
                </div>
              )}

              {/* Unlocked Achievements */}
              {achievements.filter(a => a.isUnlocked).length > 0 ? (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                    <Trophy className="w-5 h-5 text-purple-600" />
                    <span>Đã đạt được ({achievements.filter(a => a.isUnlocked).length})</span>
                  </h3>
                  <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
                    {achievements.filter(a => a.isUnlocked).map((achievement) => (
                      <div key={achievement.id} className="text-center">
                        {achievement.badge_image_url ? (
                          <img
                            src={achievement.badge_image_url}
                            alt={achievement.title}
                            className="w-20 h-20 mx-auto mb-2 object-contain"
                          />
                        ) : (
                          <div className="text-4xl mx-auto mb-2">
                            🏆
                          </div>
                        )}
                        <div className="text-sm font-medium text-gray-900">{achievement.title}</div>
                        <div className="text-xs text-gray-500">{achievement.description}</div>
                        {achievement.isClaimed && (
                          <div className="text-xs text-green-600 mt-1">✓ Đã nhận</div>
                        )}
                        {!achievement.isClaimed && isOwnProfile && (achievement.xp_reward > 0 || achievement.gem_reward > 0) && (
                          <button
                            onClick={() => handleClaimAchievementXP(achievement.id)}
                            disabled={claimingAchievement[achievement.id]}
                            className="mt-1 mx-auto flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
                          >
                            <Gift className="w-3 h-3" />
                            {claimingAchievement[achievement.id]
                              ? '...'
                              : `Nhận ${[
                                  achievement.xp_reward > 0 ? `${achievement.xp_reward} XP` : null,
                                  achievement.gem_reward > 0 ? `${achievement.gem_reward} 💎` : null,
                                ].filter(Boolean).join(' + ')}`}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Award className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No achievements unlocked yet</h3>
                  <p>Keep learning to unlock your first achievement!</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Log Out Button */}
      {isOwnProfile && (
        <div className="mt-6 mb-8 flex justify-center">
          <button
            onClick={async () => { await signOut(); navigate('/login'); }}
            className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-colors border border-red-200"
            style={{ clipPath: CLIP_SM }}
          >
            <LogOut className="w-5 h-5" />
            Log Out
          </button>
        </div>
      )}
      {claimResult && (
        <ClaimCelebration
          result={claimResult}
          onClose={() => setClaimResult(null)}
        />
      )}
    </div>
  )
}

export default Profile