import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import { useStudentLevels } from '../../hooks/useStudentLevels'
import { getVietnamDate, utcToVietnamDate } from '../../utils/vietnamTime'
import { SimpleBadge } from '../ui/StudentBadge'
import { Trophy, Medal, Award, Crown, Star, RefreshCw } from 'lucide-react'
import AvatarWithFrame from '../ui/AvatarWithFrame'
import { assetUrl } from '../../hooks/useBranding';
import { getSettings } from '../../utils/siteSettings';

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

const Leaderboard = () => {
  const navigate = useNavigate()
  const [timeframe, setTimeframe] = useState(null) // set after settings load
  const [leaderboardData, setLeaderboardData] = useState([])
  const [currentUserRank, setCurrentUserRank] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showBadgeInfo, setShowBadgeInfo] = useState(null)
  const [countdownText, setCountdownText] = useState('')
  const [weeklyChampionRewards, setWeeklyChampionRewards] = useState([]) // top 1/2/3
  const [monthlyChampionRewards, setMonthlyChampionRewards] = useState([]) // top 1/2/3
  const [pvpChampionRewards, setPvpChampionRewards] = useState([]) // top 1/2/3
  const [previousChampions, setPreviousChampions] = useState([])
  const [trainingData, setTrainingData] = useState([])
  const [trainingLoading, setTrainingLoading] = useState(false)
  const [currentTrainingRank, setCurrentTrainingRank] = useState(null)
  const [pvpData, setPvpData] = useState([])
  const [pvpLoading, setPvpLoading] = useState(false)
  const [currentPvpRank, setCurrentPvpRank] = useState(null)
  const { user } = useAuth()
  const { studentLevels } = useStudentLevels()

  // Leaderboard settings from site_settings
  const [visibleTabs, setVisibleTabs] = useState(['week', 'month', 'training'])
  const [competitionActive, setCompetitionActive] = useState(true)
  const [competitionType, setCompetitionType] = useState('game') // 'game' or 'items'
  const [competitionGameType, setCompetitionGameType] = useState('scramble')
  const [competitionItemId, setCompetitionItemId] = useState('')
  const [competitionItemInfo, setCompetitionItemInfo] = useState(null)
  const [topRewards, setTopRewards] = useState([
    { rank: 1, gems: 1, xp: 0, shop_items: [] },
    { rank: 2, gems: 0, xp: 0, shop_items: [] },
    { rank: 3, gems: 0, xp: 0, shop_items: [] },
  ])
  const [rewardThreshold, setRewardThreshold] = useState(0)
  const [rewardXP, setRewardXP] = useState(5)
  const [maxAttempts, setMaxAttempts] = useState(0)
  const [usedAttempts, setUsedAttempts] = useState(0)
  const [competitionEndDate, setCompetitionEndDate] = useState('')
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  const GAME_LABELS = {
    scramble: 'Word Scramble',
    whackmole: 'Whack-a-Mole',
    catch: 'Hungry Pet',
    flappy: 'Flappy Pet',
    astroblast: 'Astro Blast',
    matchgame: 'Match Up',
    wordtype: 'Word Type',
    bombparty: 'Bomb Defuse',
    sayitright: 'Say It Right',
    quizrush: 'Quiz Rush',
    angrypet: 'Angry Pet',
    fishing: 'Fishing Frenzy',
  }

  // Fetch leaderboard settings on mount
  useEffect(() => {
    const fetchLeaderboardSettings = async () => {
      try {
        const settingsMap = await getSettings([
          'leaderboard_visible_tabs',
          'leaderboard_default_tab',
          'leaderboard_competition_active',
          'leaderboard_competition_type',
          'leaderboard_competition_game_type',
          'leaderboard_competition_item_id',
          'leaderboard_competition_rewards',
          'leaderboard_competition_reward_threshold',
          'leaderboard_competition_reward_xp',
          'leaderboard_competition_max_attempts',
          'leaderboard_competition_end_date',
        ])
        const data = Object.entries(settingsMap)
          .filter(([, value]) => value !== undefined)
          .map(([setting_key, setting_value]) => ({ setting_key, setting_value }))

        let tabs = ['week', 'month', 'training']
        let defaultTab = 'training'
        let active = true
        let compType = 'game'
        let gameType = 'scramble'
        let itemId = ''
        let rewards = null
        let threshold = 0
        let xpReward = 5
        let attempts = 0
        let endDate = ''

        data?.forEach((row) => {
          switch (row.setting_key) {
            case 'leaderboard_visible_tabs':
              try { tabs = JSON.parse(row.setting_value) } catch {}
              break
            case 'leaderboard_default_tab':
              defaultTab = row.setting_value
              break
            case 'leaderboard_competition_active':
              active = row.setting_value === 'true'
              break
            case 'leaderboard_competition_type':
              compType = row.setting_value
              break
            case 'leaderboard_competition_game_type':
              gameType = row.setting_value
              break
            case 'leaderboard_competition_item_id':
              itemId = row.setting_value
              break
            case 'leaderboard_competition_rewards':
              try { rewards = JSON.parse(row.setting_value) } catch {}
              break
            case 'leaderboard_competition_reward_threshold':
              threshold = parseInt(row.setting_value) || 0
              break
            case 'leaderboard_competition_reward_xp':
              xpReward = parseInt(row.setting_value) || 5
              break
            case 'leaderboard_competition_max_attempts':
              attempts = parseInt(row.setting_value) || 0
              break
            case 'leaderboard_competition_end_date':
              endDate = row.setting_value || ''
              break
          }
        })

        // If competition is not active, hide training tab
        if (!active) {
          tabs = tabs.filter(t => t !== 'training')
        }

        setVisibleTabs(tabs)
        setCompetitionActive(active)
        setCompetitionType(compType)
        setCompetitionGameType(gameType)
        setCompetitionItemId(itemId)
        if (rewards) setTopRewards(rewards)
        setRewardThreshold(threshold)
        setRewardXP(xpReward)
        setMaxAttempts(attempts)
        setCompetitionEndDate(endDate)
        setTimeframe(tabs.includes(defaultTab) ? defaultTab : tabs[0] || 'week')

        // Fetch used attempts this week
        if (attempts > 0 && user?.id && compType === 'game') {
          const now = new Date()
          const day = now.getDay()
          const daysFromMonday = day === 0 ? 6 : day - 1
          const weekStart = new Date(now)
          weekStart.setDate(weekStart.getDate() - daysFromMonday)
          const weekStartISO = weekStart.toISOString().split('T')[0] + 'T00:00:00+07:00'

          const { count } = await supabase
            .from('training_scores')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('game_type', gameType)
            .gte('played_at', weekStartISO)

          setUsedAttempts(count || 0)
        }

        // Fetch item info if item competition
        if (compType === 'items' && itemId) {
          const { data: itemData } = await supabase
            .from('collectible_items')
            .select('id, name, image_url')
            .eq('id', itemId)
            .single()
          if (itemData) setCompetitionItemInfo(itemData)
        }
      } catch (err) {
        console.error('Error fetching leaderboard settings:', err)
        setTimeframe('training') // fallback
      } finally {
        setSettingsLoaded(true)
      }
    }
    fetchLeaderboardSettings()
  }, [])


  // Handle badge click for mobile
  const handleBadgeClick = (badge) => {
    setShowBadgeInfo(badge)
    // Auto-hide after 3 seconds
    setTimeout(() => setShowBadgeInfo(null), 3000)
  }

  // Handle profile navigation
  const handleProfileClick = (userId) => {
    navigate(`/profile/${userId}`)
  }

  useEffect(() => {
    if (timeframe && studentLevels && studentLevels.length > 0) {
      fetchLeaderboardData()
    }
  }, [timeframe, studentLevels])

  // Fetch leaderboard rewards config and previous champions
  useEffect(() => {
    const fetchChampionData = async () => {
      // Fetch rewards from config table
      const { data: rewardConfigs } = await supabase
        .from('leaderboard_rewards')
        .select('rank, timeframe, xp_reward, gem_reward, item_id, item_quantity, chest_id, achievement_id, collectible_items(name, image_url), chests(name, image_url)')
        .eq('is_active', true)
        .order('rank')

      const weeklyRewards = (rewardConfigs || []).filter(r => r.timeframe === 'weekly')
      const monthlyRewards = (rewardConfigs || []).filter(r => r.timeframe === 'monthly')
      const pvpRewards = (rewardConfigs || []).filter(r => r.timeframe === 'pvp')
      setWeeklyChampionRewards(weeklyRewards)
      setMonthlyChampionRewards(monthlyRewards)
      setPvpChampionRewards(pvpRewards)

      // Fetch previous champions (only from ranks with achievements/badges = top 1-3)
      const achievementIds = (rewardConfigs || [])
        .filter(r => r.achievement_id)
        .map(r => r.achievement_id)

      if (achievementIds.length > 0) {
        const { data: champions } = await supabase
          .from('user_achievements')
          .select(`
            earned_at,
            achievement_id,
            achievements (title, criteria_type),
            users (full_name, avatar_url, user_equipment(active_title, active_frame_ratio, hide_frame))
          `)
          .in('achievement_id', achievementIds)
          .order('earned_at', { ascending: false })
          .limit(10)

        const flatChampions = (champions || []).map(c => {
          if (!c.users) return c
          const { user_equipment, ...userRest } = c.users
          return { ...c, users: { ...userRest, ...user_equipment } }
        })
        setPreviousChampions(flatChampions)
      }
    }
    fetchChampionData()
  }, [])

  // Countdown for week/month tabs (Vietnam time)
  useEffect(() => {
    const getVietnamNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))

    const getEndOfWeekVN = (now) => {
      // End of week = Sunday 23:59:59 VN
      const end = new Date(now)
      const day = end.getDay() // 0=Sun
      const daysToSunday = (7 - day) % 7
      end.setDate(end.getDate() + daysToSunday)
      end.setHours(23, 59, 59, 999)
      return end
    }

    const getEndOfMonthVN = (now) => {
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      end.setHours(23, 59, 59, 999)
      return end
    }

    const formatCountdown = (ms) => {
      if (ms <= 0) return '00:00:00'
      const totalSeconds = Math.floor(ms / 1000)
      const days = Math.floor(totalSeconds / 86400)
      const hours = Math.floor((totalSeconds % 86400) / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }

    let timer
    const start = () => {
      if (timeframe !== 'week' && timeframe !== 'month' && timeframe !== 'training' && timeframe !== 'pvp') {
        setCountdownText('')
        return
      }
      const tick = () => {
        const now = getVietnamNow()
        let end
        if (timeframe === 'training' && competitionEndDate) {
          // Use admin-set end date (end of that day in VN time)
          end = new Date(competitionEndDate + 'T23:59:59')
        } else if (timeframe === 'training') {
          // No end date set — no countdown
          setCountdownText('')
          return
        } else if (timeframe === 'month') {
          end = getEndOfMonthVN(now)
        } else {
          // week or pvp — both reset at end of VN week
          end = getEndOfWeekVN(now)
        }
        const diff = end - now
        if (diff <= 0) {
          setCountdownText('Đã kết thúc')
          return
        }
        setCountdownText(formatCountdown(diff))
      }
      tick()
      timer = setInterval(tick, 1000)
    }

    start()
    return () => timer && clearInterval(timer)
  }, [timeframe, competitionEndDate])

  // Function to get level and badge info based on XP
  const getUserLevelInfo = (userXp) => {
    if (!studentLevels || studentLevels.length === 0) {
      return { level: 1, badge: { name: 'Newcomer', icon: '👤', tier: 'default' } }
    }

    // Find current level (highest level where xp_required <= userXp)
    const currentLevel = studentLevels
      .filter(level => userXp >= level.xp_required)
      .sort((a, b) => b.level_number - a.level_number)[0]

    if (!currentLevel) {
      return { level: 1, badge: { name: 'Newcomer', icon: '👤', tier: 'default' } }
    }

    return {
      level: currentLevel.level_number,
      badge: {
        name: currentLevel.badge_name,
        icon: currentLevel.badge_icon,
        tier: currentLevel.badge_tier
      }
    }
  }

  // Function to get next level number
  const getNextLevelNumber = (userXp) => {
    if (!studentLevels || studentLevels.length === 0) {
      return 2
    }

    // Find next level (lowest level where xp_required > userXp)
    const nextLevel = studentLevels
      .filter(level => userXp < level.xp_required)
      .sort((a, b) => a.level_number - b.level_number)[0]

    return nextLevel ? nextLevel.level_number : studentLevels[studentLevels.length - 1].level_number + 1
  }

  // Function to get XP required for next level
  const getNextLevelXpRequired = (userXp) => {
    if (!studentLevels || studentLevels.length === 0) {
      return 1000 - userXp
    }

    // Find next level (lowest level where xp_required > userXp)
    const nextLevel = studentLevels
      .filter(level => userXp < level.xp_required)
      .sort((a, b) => a.level_number - b.level_number)[0]

    if (!nextLevel) {
      // User is at max level
      return 0
    }

    return nextLevel.xp_required - userXp
  }

  const fetchLeaderboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      let leaderboardQuery

      // Define date ranges for filtering
      const vietnamToday = getVietnamDate()
      const currentDate = new Date(vietnamToday)

      if (timeframe === 'today') {
        // Get users based on XP earned today (from completed exercises)
        console.log('Today leaderboard - Vietnam date:', vietnamToday)
        leaderboardQuery = await getTimeframeLeaderboard('today', vietnamToday)
      } else if (timeframe === 'week') {
        // Get Monday of current week (Vietnam time)
        const dayOfWeek = currentDate.getDay() // 0=Sun, 1=Mon, ...
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
        const weekStart = new Date(currentDate)
        weekStart.setDate(weekStart.getDate() - daysFromMonday)
        leaderboardQuery = await getTimeframeLeaderboard('week', weekStart.toISOString().split('T')[0])
      } else if (timeframe === 'month') {
        // Get current month using Vietnam date to avoid UTC timezone rollback
        const monthStart = vietnamToday.substring(0, 7) + '-01'
        leaderboardQuery = await getTimeframeLeaderboard('month', monthStart)
      } else {
        // All time - use existing logic
        leaderboardQuery = await getAllTimeLeaderboard()
      }

      const { users, userXpCounts, exerciseCounts } = leaderboardQuery

      // Format leaderboard data
      const formattedData = users.map((user, index) => {
        const levelInfo = getUserLevelInfo(user.xp || 0)
        const timeframeXp = userXpCounts[user.id] || 0

        return {
          id: user.id,
          rank: index + 1,
          name: user.full_name || user.email.split('@')[0],
          email: user.email,
          xp: timeframe === 'all' ? (user.xp || 0) : timeframeXp,
          totalXp: user.xp || 0, // Always show total XP for level calculation
          level: levelInfo.level,
          badge: {
            ...levelInfo.badge,
            levelNumber: levelInfo.level
          },
          avatar: user.avatar_url,
          frame: user.hide_frame ? null : user.active_title,
          frameRatio: user.active_frame_ratio,
          streak: user.streak_count || 0,
          completedExercises: exerciseCounts[user.id] || 0,
          isCurrentUser: user.id === user?.id
        }
      })

      setLeaderboardData(formattedData)

      // Find current user's rank
      if (user) {
        const userRank = formattedData.find(u => u.id === user.id)
        setCurrentUserRank(userRank)
      }

    } catch (err) {
      console.error('Error fetching leaderboard:', err)
      setError('Không thể tải dữ liệu bảng xếp hạng')
    } finally {
      setLoading(false)
    }
  }

  // Fetch training/competition leaderboard (game scores or item collection)
  const fetchTrainingLeaderboard = async () => {
    try {
      setTrainingLoading(true)

      if (competitionType === 'items' && competitionItemId) {
        // Item collection leaderboard - who has the most of a specific item
        const { data: inventory } = await supabase
          .from('user_inventory')
          .select('user_id, quantity')
          .eq('item_id', competitionItemId)
          .gt('quantity', 0)

        if (!inventory || inventory.length === 0) {
          setTrainingData([])
          setCurrentTrainingRank(null)
          return
        }

        const userIds = inventory.map(i => i.user_id)
        const quantityMap = {}
        inventory.forEach(i => { quantityMap[i.user_id] = i.quantity })

        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, email, avatar_url, xp, user_equipment(active_title, active_frame_ratio, hide_frame)')
          .in('id', userIds)
          .eq('role', 'user')

        if (!users) { setTrainingData([]); return }

        const flatUsers = users.map(u => {
          const { user_equipment, ...rest } = u
          return { ...rest, ...user_equipment }
        })

        const sorted = flatUsers
          .map(u => ({ ...u, bestScore: quantityMap[u.id] || 0 }))
          .sort((a, b) => b.bestScore - a.bestScore)
          .slice(0, 50)

        const formatted = sorted.map((u, index) => {
          const levelInfo = getUserLevelInfo(u.xp || 0)
          return {
            id: u.id,
            rank: index + 1,
            name: u.full_name || u.email?.split('@')[0] || 'Unknown',
            xp: u.bestScore,
            avatar: u.avatar_url,
            frame: u.hide_frame ? null : u.active_title,
            frameRatio: u.active_frame_ratio,
            badge: { ...levelInfo.badge, levelNumber: levelInfo.level },
            isCurrentUser: u.id === user?.id
          }
        })

        setTrainingData(formatted)
        setCurrentTrainingRank(formatted.find(u => u.id === user?.id) || null)
      } else {
        // Game score leaderboard
        const activeGameType = competitionGameType || 'scramble'

        // Get Monday of current week (Vietnam time)
        const vietnamToday = getVietnamDate()
        const currentDate = new Date(vietnamToday)
        const dayOfWeek = currentDate.getDay()
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
        const weekStart = new Date(currentDate)
        weekStart.setDate(weekStart.getDate() - daysFromMonday)
        const weekStartISO = weekStart.toISOString().split('T')[0] + 'T00:00:00+07:00'

        const { data: scores } = await supabase
          .from('training_scores')
          .select('user_id, score')
          .eq('game_type', activeGameType)
          .gte('played_at', weekStartISO)

        if (!scores || scores.length === 0) {
          setTrainingData([])
          setCurrentTrainingRank(null)
          return
        }

        // Get best score per user
        const bestScores = {}
        scores.forEach(s => {
          if (!bestScores[s.user_id] || s.score > bestScores[s.user_id]) {
            bestScores[s.user_id] = s.score
          }
        })

        const userIds = Object.keys(bestScores)

        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, email, avatar_url, xp, user_equipment(active_title, active_frame_ratio, hide_frame)')
          .in('id', userIds)
          .eq('role', 'user')

        if (!users) { setTrainingData([]); return }

        const flatUsers = users.map(u => {
          const { user_equipment, ...rest } = u
          return { ...rest, ...user_equipment }
        })

        const sorted = flatUsers
          .map(u => ({ ...u, bestScore: bestScores[u.id] || 0 }))
          .sort((a, b) => b.bestScore - a.bestScore)
          .slice(0, 50)

        const formatted = sorted.map((u, index) => {
          const levelInfo = getUserLevelInfo(u.xp || 0)
          return {
            id: u.id,
            rank: index + 1,
            name: u.full_name || u.email?.split('@')[0] || 'Unknown',
            xp: u.bestScore,
            avatar: u.avatar_url,
            frame: u.hide_frame ? null : u.active_title,
            frameRatio: u.active_frame_ratio,
            badge: { ...levelInfo.badge, levelNumber: levelInfo.level },
            isCurrentUser: u.id === user?.id
          }
        })

        setTrainingData(formatted)
        setCurrentTrainingRank(formatted.find(u => u.id === user?.id) || null)
      }
    } catch (err) {
      console.error('Error fetching training leaderboard:', err)
    } finally {
      setTrainingLoading(false)
    }
  }

  useEffect(() => {
    if (timeframe === 'training' && settingsLoaded) {
      fetchTrainingLeaderboard()
    }
  }, [timeframe, settingsLoaded])

  useEffect(() => {
    if (timeframe === 'pvp') {
      fetchPvpLeaderboard()
    }
  }, [timeframe])

  // PvP leaderboard — each distinct opponent a user has defeated counts once (this week, VN time)
  const fetchPvpLeaderboard = async () => {
    try {
      setPvpLoading(true)

      // Monday 00:00 VN time of the current week
      const vietnamToday = getVietnamDate()
      const currentDate = new Date(vietnamToday)
      const dayOfWeek = currentDate.getDay()
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const weekStart = new Date(currentDate)
      weekStart.setDate(weekStart.getDate() - daysFromMonday)
      const weekStartISO = weekStart.toISOString().split('T')[0] + 'T00:00:00+07:00'

      // Paginate completed challenges from this week
      let matches = []
      let page = 0
      const PAGE_SIZE = 1000
      while (true) {
        const { data: batch, error } = await supabase
          .from('pvp_challenges')
          .select('challenger_id, opponent_id, winner_id, created_at')
          .eq('status', 'completed')
          .not('winner_id', 'is', null)
          .gte('created_at', weekStartISO)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        if (error) throw error
        if (!batch || batch.length === 0) break
        matches = matches.concat(batch)
        if (batch.length < PAGE_SIZE) break
        page++
      }

      if (matches.length === 0) {
        setPvpData([])
        setCurrentPvpRank(null)
        return
      }

      // Build win and loss maps keyed by "<opponent>|<vietnamDate>" so each pairing per day counts once
      const winMap = {}
      const lossMap = {}
      matches.forEach(m => {
        const winner = m.winner_id
        const loser = winner === m.challenger_id ? m.opponent_id : m.challenger_id
        if (!winner || !loser) return
        const day = utcToVietnamDate(m.created_at)
        if (!winMap[winner]) winMap[winner] = new Set()
        winMap[winner].add(`${loser}|${day}`)
        if (!lossMap[loser]) lossMap[loser] = new Set()
        lossMap[loser].add(`${winner}|${day}`)
      })

      const userIds = Array.from(new Set([...Object.keys(winMap), ...Object.keys(lossMap)]))
      if (userIds.length === 0) {
        setPvpData([])
        setCurrentPvpRank(null)
        return
      }

      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email, avatar_url, xp, user_equipment(active_title, active_frame_ratio, hide_frame)')
        .in('id', userIds)
        .eq('role', 'user')

      if (!users) { setPvpData([]); setCurrentPvpRank(null); return }

      const flatUsers = users.map(u => {
        const { user_equipment, ...rest } = u
        return { ...rest, ...user_equipment }
      })

      const sorted = flatUsers
        .map(u => ({
          ...u,
          wins: winMap[u.id]?.size || 0,
          losses: lossMap[u.id]?.size || 0,
        }))
        .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
        .slice(0, 50)

      const formatted = sorted.map((u, index) => {
        const levelInfo = getUserLevelInfo(u.xp || 0)
        return {
          id: u.id,
          rank: index + 1,
          name: u.full_name || u.email?.split('@')[0] || 'Unknown',
          wins: u.wins,
          losses: u.losses,
          avatar: u.avatar_url,
          frame: u.hide_frame ? null : u.active_title,
          frameRatio: u.active_frame_ratio,
          badge: { ...levelInfo.badge, levelNumber: levelInfo.level },
          isCurrentUser: u.id === user?.id
        }
      })

      setPvpData(formatted)
      setCurrentPvpRank(formatted.find(u => u.id === user?.id) || null)
    } catch (err) {
      console.error('Error fetching pvp leaderboard:', err)
    } finally {
      setPvpLoading(false)
    }
  }

  // Get all-time leaderboard (existing logic)
  const getAllTimeLeaderboard = async () => {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, full_name, xp, streak_count, avatar_url, user_equipment(active_title, active_frame_ratio, hide_frame)')
      .eq('role', 'user')
      .order('xp', { ascending: false })
      .limit(10)

    if (usersError) throw usersError

    const flatUsers = users.map(u => {
      const { user_equipment, ...rest } = u
      return { ...rest, ...user_equipment }
    })

    const userIds = flatUsers.map(u => u.id)
    const { data: progressData, error: progressError } = await supabase
      .from('user_progress')
      .select('user_id')
      .eq('status', 'completed')
      .in('user_id', userIds)

    if (progressError) throw progressError

    const exerciseCounts = progressData.reduce((acc, progress) => {
      acc[progress.user_id] = (acc[progress.user_id] || 0) + 1
      return acc
    }, {})

    const userXpCounts = flatUsers.reduce((acc, user) => {
      acc[user.id] = user.xp || 0
      return acc
    }, {})

    return { users: flatUsers, userXpCounts, exerciseCounts }
  }

  // Get timeframe-based leaderboard.
  // Aggregation runs server-side in the get_leaderboard RPC (Postgres) which
  // returns only the top 50 pre-computed rows. This avoids shipping thousands
  // of raw user_progress / session_reward_claims rows to the client just to
  // sum them in JS — previously the dominant source of PostgREST egress.
  const getTimeframeLeaderboard = async (period, startDate) => {
    const startDateOnly = startDate.split('T')[0]

    const { data: rows, error: rpcError } = await supabase.rpc('get_leaderboard', {
      p_period: period,
      p_start_date: startDateOnly,
    })

    if (rpcError) throw rpcError

    const userXpCounts = {}
    const exerciseCounts = {}

    const users = (rows || []).map((r) => {
      userXpCounts[r.id] = Number(r.timeframe_xp) || 0
      exerciseCounts[r.id] = Number(r.exercise_count) || 0
      return {
        id: r.id,
        email: r.email,
        full_name: r.full_name,
        xp: r.total_xp || 0,
        streak_count: r.streak_count,
        avatar_url: r.avatar_url,
        active_title: r.active_title,
        active_frame_ratio: r.active_frame_ratio,
        hide_frame: r.hide_frame,
      }
    })

    return { users, userXpCounts, exerciseCounts }
  }

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1:
        return <Crown className="w-6 h-6 text-yellow-500" />
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />
      case 3:
        return <Award className="w-6 h-6 text-orange-400" />
      default:
        return <span className="w-6 h-6 flex items-center justify-center text-gray-500 font-bold">{rank}</span>
    }
  }

  const getRankColor = (rank) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-50 to-yellow-100 border-yellow-300'
      case 2:
        return 'bg-gradient-to-r from-gray-50 to-gray-100 border-gray-300'
      case 3:
        return 'bg-gradient-to-r from-orange-50 to-orange-100 border-orange-300'
      default:
        return 'bg-white border-gray-200'
    }
  }

  if (loading || !settingsLoaded) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1 uppercase tracking-wide">Bảng xếp hạng</h1>
          <div className="h-[2px] w-20 mx-auto bg-gradient-to-r from-transparent via-blue-400 to-transparent mb-2" />
          <p className="text-gray-500 text-sm">Đang tải dữ liệu...</p>
        </div>
        <div className="flex justify-center">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 border-2 border-blue-200 rounded-full animate-ping opacity-30" />
            <RefreshCw className="w-10 h-10 animate-spin text-blue-400" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1 uppercase tracking-wide">Bảng xếp hạng</h1>
          <div className="h-[2px] w-20 mx-auto bg-gradient-to-r from-transparent via-blue-400 to-transparent mb-2" />
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={fetchLeaderboardData}
            className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            style={{ clipPath: CLIP_BTN }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Thử lại
          </button>
        </div>
      </div>
    )
  }

  const renderChampionBanner = (rewards) => {
    if (!rewards || rewards.length === 0) return null
    const grouped = []
    rewards.forEach(r => {
      if (r.rank <= 3) {
        grouped.push({ ranks: [r.rank], ...r })
      } else {
        const prev = grouped[grouped.length - 1]
        if (prev && prev.ranks[0] > 3 && prev.xp_reward === r.xp_reward && prev.gem_reward === r.gem_reward && prev.item_id === r.item_id && prev.chest_id === r.chest_id) {
          prev.ranks.push(r.rank)
        } else {
          grouped.push({ ranks: [r.rank], ...r })
        }
      }
    })
    const rankIcons = { 1: '🏆', 2: '🥈', 3: '🥉' }
    const rankStyles = {
      1: { bg: 'bg-gradient-to-r from-yellow-50 to-amber-50', border: 'border-yellow-200', xpColor: 'text-yellow-600' },
      2: { bg: 'bg-gradient-to-r from-gray-50 to-slate-50', border: 'border-gray-300', xpColor: 'text-gray-600' },
      3: { bg: 'bg-gradient-to-r from-orange-50 to-amber-50', border: 'border-orange-200', xpColor: 'text-orange-600' },
    }
    const defaultStyle = { bg: 'bg-gray-50', border: 'border-gray-200', xpColor: 'text-gray-500' }
    return (
      <div className="flex flex-wrap justify-center gap-2">
        {grouped.map((g) => {
          const firstRank = g.ranks[0]
          const style = rankStyles[firstRank] || defaultStyle
          const label = g.ranks.length === 1
            ? (rankIcons[firstRank] || `#${firstRank}`)
            : `${g.ranks[0]}-${g.ranks[g.ranks.length - 1]}`
          return (
            <div key={g.ranks.join('-')} className={`inline-flex items-center gap-2 ${style.bg} border ${style.border} px-4 py-3 text-sm`}
              style={{ clipPath: CLIP_SM }}
            >
              <span className="text-base">{label}</span>
              <span className="inline-flex items-center gap-1.5 text-gray-700">
                {g.xp_reward > 0 && (
                  <span className="inline-flex items-center gap-0.5" title={`${g.xp_reward} XP`}>
                    <strong className={style.xpColor}>{g.xp_reward}</strong>
                    <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-4 h-4" />
                  </span>
                )}
                {g.gem_reward > 0 && (
                  <span className="inline-flex items-center gap-0.5" title={`${g.gem_reward} Gems`}>
                    <strong className="text-blue-500">{g.gem_reward}</strong>
                    <img src={assetUrl('/image/study/gem.png')} alt="Gem" className="w-4 h-4" />
                  </span>
                )}
                {g.collectible_items && (
                  <span className="inline-flex items-center" title={`${g.item_quantity > 1 ? `${g.item_quantity}x ` : ''}${g.collectible_items.name}`}>
                    {g.collectible_items.image_url
                      ? <img src={g.collectible_items.image_url} alt={g.collectible_items.name} className="w-6 h-6 object-contain" />
                      : <strong className="text-purple-500">{g.collectible_items.name}</strong>}
                    {g.item_quantity > 1 && <span className="text-xs font-bold text-purple-500 ml-0.5">x{g.item_quantity}</span>}
                  </span>
                )}
                {g.chests && (
                  <span className="inline-flex items-center" title={g.chests.name}>
                    {g.chests.image_url
                      ? <img src={g.chests.image_url} alt={g.chests.name} className="w-6 h-6 object-contain" />
                      : <strong className="text-amber-600">{g.chests.name}</strong>}
                  </span>
                )}
              </span>
            </div>
          )
        })}
        {countdownText && (
          <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 px-3 py-3 text-sm text-gray-400"
            style={{ clipPath: CLIP_SM }}
          >
            {countdownText}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1 uppercase tracking-wide">Bảng xếp hạng</h1>
        <div className="h-[2px] w-20 mx-auto bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
      </div>

      {/* Timeframe Filter */}
      <div className="flex justify-center">
        <div className="flex gap-1 p-1 bg-gray-50 border border-gray-200" style={{ clipPath: CLIP_SM }}>
          {[
            { key: 'week', label: 'Tuần này' },
            { key: 'month', label: 'Tháng này' },
            { key: 'training', label: competitionType === 'items' && competitionItemInfo
              ? competitionItemInfo.name
              : GAME_LABELS[competitionGameType] || 'Competition' }
          ].filter(option => visibleTabs.includes(option.key)).concat([
            { key: 'pvp', label: 'PvP' }
          ]).map((option) => (
            <button
              key={option.key}
              onClick={() => setTimeframe(option.key)}
              className={`px-4 py-2 text-sm font-medium uppercase tracking-wide transition-all ${
                timeframe === option.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
              style={{ clipPath: CLIP_BTN }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Competition Leaderboard */}
      {timeframe === 'training' && (
        trainingLoading ? (
          <div className="flex justify-center py-8">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border-2 border-blue-200 rounded-full animate-ping opacity-30" />
              <RefreshCw className="w-10 h-10 animate-spin text-blue-400" />
            </div>
          </div>
        ) : (
          <>
            {/* Prize, Qualifier & Attempts - compact */}
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {topRewards.map((reward) => {
                const qualifierBonus = (rewardThreshold > 0 && rewardXP > 0) ? rewardXP : 0;
                const totalXp = (reward.xp || 0) + qualifierBonus;
                const hasReward = reward.gems > 0 || totalXp > 0 || (reward.shop_items?.length > 0);
                if (!hasReward) return null;
                const rankIcons = { 1: '🏆', 2: '🥈', 3: '🥉' };
                const rankStyles = {
                  1: { bg: 'bg-yellow-50', border: 'border-yellow-200', shadow: 'shadow-[0_0_8px_rgba(234,179,8,0.2)]' },
                  2: { bg: 'bg-gray-50', border: 'border-gray-200', shadow: 'shadow-[0_0_8px_rgba(148,163,184,0.2)]' },
                  3: { bg: 'bg-orange-50', border: 'border-orange-200', shadow: 'shadow-[0_0_8px_rgba(251,146,60,0.2)]' },
                };
                const rankNum = typeof reward.rank === 'string' ? null : reward.rank;
                const defaultStyle = { bg: 'bg-gray-50', border: 'border-gray-200', shadow: '' };
                const style = (rankNum && rankStyles[rankNum]) || defaultStyle;
                const label = rankNum ? (rankIcons[rankNum] || `#${rankNum}`) : `#${reward.rank}`;
                return (
                  <div key={reward.rank} className={`inline-flex items-center gap-1.5 ${style.bg} border ${style.border} ${style.shadow} px-3 py-1.5 transition-transform hover:scale-105`}
                    style={{ clipPath: CLIP_BTN }}
                  >
                    <span className="text-base">{label}</span>
                    {reward.gems > 0 && (
                      <strong className="text-blue-600 inline-flex items-center gap-0.5">{reward.gems}<img src={assetUrl('/image/study/gem.png')} alt="Gem" className="w-3.5 h-3.5" /></strong>
                    )}
                    {totalXp > 0 && (
                      <strong className="text-yellow-600 inline-flex items-center gap-0.5">{totalXp}<img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3.5 h-3.5" /></strong>
                    )}
                    {reward.shop_items?.length > 0 && (
                      <span className="text-purple-600 font-medium">+{reward.shop_items.length} item</span>
                    )}
                  </div>
                );
              })}
              {rewardThreshold > 0 && rewardXP > 0 && (
                <div className="inline-flex items-center gap-1 bg-green-50 border border-green-200 px-2.5 py-1.5 text-green-700"
                  style={{ clipPath: CLIP_BTN }}
                >
                  {rewardThreshold}+ điểm: <strong className="inline-flex items-center gap-0.5">+{rewardXP}<img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3.5 h-3.5" /></strong>
                </div>
              )}
              {maxAttempts > 0 && (
                <div className={`inline-flex items-center gap-1 px-2.5 py-1.5 ${
                  usedAttempts >= maxAttempts ? 'bg-red-50 border border-red-200 text-red-600' : 'bg-blue-50 border border-blue-200 text-blue-600'
                }`} style={{ clipPath: CLIP_BTN }}>
                  {usedAttempts >= maxAttempts ? `Hết lượt (${maxAttempts}/${maxAttempts})` : `${maxAttempts - usedAttempts}/${maxAttempts} lượt`}
                </div>
              )}
              {countdownText && (
                <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 px-2.5 py-1.5 text-gray-500"
                  style={{ clipPath: CLIP_BTN }}
                >
                  {countdownText}
                </div>
              )}
            </div>

            {trainingData.length === 0 ? (
              <div className="relative text-center py-8 text-gray-400 bg-white border border-gray-200" style={{ clipPath: CLIP_CARD }}>
                <CornerBrackets />
                <Trophy className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">{competitionType === 'items' ? 'Chưa có ai sở hữu vật phẩm này' : 'Chưa có ai chơi tuần này'}</p>
              </div>
            ) : (
              <>
                {/* Top 3 Podium */}
                <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-8 items-end">
                  {/* 2nd Place */}
                  {trainingData[1] && (
                    <div className="order-1">
                      <div className="relative text-center p-2 md:p-6 bg-gradient-to-t from-gray-200/80 to-white border border-gray-200 overflow-hidden"
                        style={{ clipPath: CLIP_CARD }}
                      >
                        <CornerBrackets />
                        <div className="mx-auto mb-2 md:mb-4 relative z-10">
                          <AvatarWithFrame avatarUrl={trainingData[1].avatar} frameUrl={trainingData[1].frame} frameRatio={trainingData[1].frameRatio} size={80} className="mx-auto" fallback={trainingData[1].name.charAt(0).toUpperCase()} />
                        </div>
                        <div className="font-semibold text-gray-900 text-xs md:text-base cursor-pointer hover:text-blue-600 transition-colors break-words text-center relative z-10" onClick={() => handleProfileClick(trainingData[1].id)}>
                          {trainingData[1].name}
                        </div>
                        <div className="text-sm md:text-lg font-semibold text-gray-700 mt-1 md:mt-2 relative z-10">
                          {trainingData[1].xp}{competitionType !== 'items' && ' điểm'}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 1st Place */}
                  {trainingData[0] && (
                    <div className="order-2">
                      <div className="relative text-center p-2 md:p-6 bg-gradient-to-t from-yellow-100/80 to-white border border-yellow-200 md:transform md:scale-105 overflow-hidden"
                        style={{ clipPath: CLIP_CARD }}
                      >
                        <CornerBrackets />
                        <Crown className="w-6 h-6 md:w-8 md:h-8 text-yellow-500 mx-auto mb-1 md:mb-2 relative z-10" />
                        <div className="mx-auto mb-2 md:mb-4 relative z-10">
                          <AvatarWithFrame avatarUrl={trainingData[0].avatar} frameUrl={trainingData[0].frame} frameRatio={trainingData[0].frameRatio} size={80} className="mx-auto" fallback={trainingData[0].name.charAt(0).toUpperCase()} />
                        </div>
                        <div className="font-semibold text-gray-900 text-xs md:text-lg cursor-pointer hover:text-blue-600 transition-colors break-words text-center relative z-10" onClick={() => handleProfileClick(trainingData[0].id)}>
                          {trainingData[0].name}
                        </div>
                        <div className="text-sm md:text-xl font-semibold text-gray-900 mt-1 md:mt-2 relative z-10">
                          {trainingData[0].xp}{competitionType !== 'items' && ' điểm'}
                        </div>
                        <div className="hidden md:flex items-center justify-center mt-2 text-yellow-600 relative z-10">
                          <Star size={16} fill="currentColor" />
                          <span className="ml-1 text-sm">{competitionType === 'items' && competitionItemInfo
                            ? `Vua ${competitionItemInfo.name}`
                            : `Vua ${GAME_LABELS[competitionGameType] || 'Competition'}`}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 3rd Place */}
                  {trainingData[2] && (
                    <div className="order-3">
                      <div className="relative text-center p-2 md:p-6 bg-gradient-to-t from-orange-100/80 to-white border border-orange-200 overflow-hidden"
                        style={{ clipPath: CLIP_CARD }}
                      >
                        <CornerBrackets />
                        <div className="mx-auto mb-2 md:mb-4 relative z-10">
                          <AvatarWithFrame avatarUrl={trainingData[2].avatar} frameUrl={trainingData[2].frame} frameRatio={trainingData[2].frameRatio} size={56} className="mx-auto" fallback={trainingData[2].name.charAt(0).toUpperCase()} />
                        </div>
                        <div className="font-semibold text-gray-900 text-xs md:text-base cursor-pointer hover:text-blue-600 transition-colors break-words text-center relative z-10" onClick={() => handleProfileClick(trainingData[2].id)}>
                          {trainingData[2].name}
                        </div>
                        <div className="text-sm md:text-lg font-semibold text-gray-700 mt-1 md:mt-2 relative z-10">
                          {trainingData[2].xp}{competitionType !== 'items' && ' điểm'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Full Ranked List */}
                <div className="relative bg-white border border-gray-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
                  <CornerBrackets />
                  <div className="divide-y divide-gray-100">
                    {trainingData.slice(3, 10).map((entry) => (
                      <div key={entry.id} className={`py-2 md:py-4 px-3 md:px-4 ${getRankColor(entry.rank)} flex items-center justify-between`}>
                        <div className="flex items-center space-x-2 md:space-x-4">
                          <div className="flex items-center justify-center w-6 md:w-8 h-6 md:h-8">
                            {getRankIcon(entry.rank)}
                          </div>
                          <AvatarWithFrame avatarUrl={entry.avatar} frameUrl={entry.frame} frameRatio={entry.frameRatio} size={48} fallback={entry.name.charAt(0).toUpperCase()} />
                          <div>
                            <div className="font-medium text-gray-900 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleProfileClick(entry.id)}>
                              {entry.name}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-sm text-gray-900">{entry.xp}{competitionType !== 'items' && ' điểm'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Your Rank */}
                {currentTrainingRank && (
                  <div className="relative bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
                    <CornerBrackets />
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center space-x-4">
                        <AvatarWithFrame avatarUrl={currentTrainingRank.avatar} frameUrl={currentTrainingRank.frame} frameRatio={currentTrainingRank.frameRatio} size={48} fallback={currentTrainingRank.name.charAt(0).toUpperCase()} />
                        <div>
                          <div className="font-semibold text-gray-900">Bạn ({currentTrainingRank.name})</div>
                          <span className="text-sm text-gray-600">Hạng #{currentTrainingRank.rank}</span>
                        </div>
                      </div>
                      <div className="font-semibold text-lg text-gray-900">{currentTrainingRank.xp}{competitionType !== 'items' && ' điểm'}</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )
      )}

      {/* PvP Leaderboard — each opponent counted once */}
      {timeframe === 'pvp' && (
        pvpLoading ? (
          <div className="flex justify-center py-8">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border-2 border-blue-200 rounded-full animate-ping opacity-30" />
              <RefreshCw className="w-10 h-10 animate-spin text-blue-400" />
            </div>
          </div>
        ) : pvpData.length === 0 ? (
          <>
            {renderChampionBanner(pvpChampionRewards)}
            <div className="relative text-center py-8 text-gray-400 bg-white border border-gray-200" style={{ clipPath: CLIP_CARD }}>
              <CornerBrackets />
              <Trophy className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Chưa có trận PvP nào kết thúc</p>
            </div>
          </>
        ) : (
          <>
            {renderChampionBanner(pvpChampionRewards)}
            <p className="text-center text-xs text-gray-500">Tuần này · tối đa 1 trận thắng/thua mỗi đối thủ mỗi ngày</p>

            {/* Top 3 Podium */}
            <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-8 items-end">
              {/* 2nd Place */}
              {pvpData[1] && (
                <div className="order-1">
                  <div className="relative text-center p-2 md:p-6 bg-gradient-to-t from-gray-200/80 to-white border border-gray-200 overflow-hidden"
                    style={{ clipPath: CLIP_CARD }}
                  >
                    <CornerBrackets />
                    <div className="mx-auto mb-2 md:mb-4 relative z-10">
                      <AvatarWithFrame avatarUrl={pvpData[1].avatar} frameUrl={pvpData[1].frame} frameRatio={pvpData[1].frameRatio} size={80} className="mx-auto" fallback={pvpData[1].name.charAt(0).toUpperCase()} />
                    </div>
                    <div className="font-semibold text-gray-900 text-xs md:text-base cursor-pointer hover:text-blue-600 transition-colors break-words text-center relative z-10" onClick={() => handleProfileClick(pvpData[1].id)}>
                      {pvpData[1].name}
                    </div>
                    <div className="text-sm md:text-lg font-semibold text-gray-700 mt-1 md:mt-2 relative z-10">
                      <span className="text-green-600">{pvpData[1].wins}W</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className="text-red-500">{pvpData[1].losses}L</span>
                    </div>
                  </div>
                </div>
              )}
              {/* 1st Place */}
              {pvpData[0] && (
                <div className="order-2">
                  <div className="relative text-center p-2 md:p-6 bg-gradient-to-t from-yellow-100/80 to-white border border-yellow-200 md:transform md:scale-105 overflow-hidden"
                    style={{ clipPath: CLIP_CARD }}
                  >
                    <CornerBrackets />
                    <Crown className="w-6 h-6 md:w-8 md:h-8 text-yellow-500 mx-auto mb-1 md:mb-2 relative z-10" />
                    <div className="mx-auto mb-2 md:mb-4 relative z-10">
                      <AvatarWithFrame avatarUrl={pvpData[0].avatar} frameUrl={pvpData[0].frame} frameRatio={pvpData[0].frameRatio} size={80} className="mx-auto" fallback={pvpData[0].name.charAt(0).toUpperCase()} />
                    </div>
                    <div className="font-semibold text-gray-900 text-xs md:text-lg cursor-pointer hover:text-blue-600 transition-colors break-words text-center relative z-10" onClick={() => handleProfileClick(pvpData[0].id)}>
                      {pvpData[0].name}
                    </div>
                    <div className="text-sm md:text-xl font-semibold text-gray-900 mt-1 md:mt-2 relative z-10">
                      <span className="text-green-600">{pvpData[0].wins}W</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className="text-red-500">{pvpData[0].losses}L</span>
                    </div>
                    <div className="hidden md:flex items-center justify-center mt-2 text-yellow-600 relative z-10">
                      <Star size={16} fill="currentColor" />
                      <span className="ml-1 text-sm">Vua PvP</span>
                    </div>
                  </div>
                </div>
              )}
              {/* 3rd Place */}
              {pvpData[2] && (
                <div className="order-3">
                  <div className="relative text-center p-2 md:p-6 bg-gradient-to-t from-orange-100/80 to-white border border-orange-200 overflow-hidden"
                    style={{ clipPath: CLIP_CARD }}
                  >
                    <CornerBrackets />
                    <div className="mx-auto mb-2 md:mb-4 relative z-10">
                      <AvatarWithFrame avatarUrl={pvpData[2].avatar} frameUrl={pvpData[2].frame} frameRatio={pvpData[2].frameRatio} size={56} className="mx-auto" fallback={pvpData[2].name.charAt(0).toUpperCase()} />
                    </div>
                    <div className="font-semibold text-gray-900 text-xs md:text-base cursor-pointer hover:text-blue-600 transition-colors break-words text-center relative z-10" onClick={() => handleProfileClick(pvpData[2].id)}>
                      {pvpData[2].name}
                    </div>
                    <div className="text-sm md:text-lg font-semibold text-gray-700 mt-1 md:mt-2 relative z-10">
                      <span className="text-green-600">{pvpData[2].wins}W</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className="text-red-500">{pvpData[2].losses}L</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Full Ranked List */}
            <div className="relative bg-white border border-gray-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
              <CornerBrackets />
              <div className="divide-y divide-gray-100">
                {pvpData.slice(3, 10).map((entry) => (
                  <div key={entry.id} className={`py-2 md:py-4 px-3 md:px-4 ${getRankColor(entry.rank)} flex items-center justify-between`}>
                    <div className="flex items-center space-x-2 md:space-x-4">
                      <div className="flex items-center justify-center w-6 md:w-8 h-6 md:h-8">
                        {getRankIcon(entry.rank)}
                      </div>
                      <AvatarWithFrame avatarUrl={entry.avatar} frameUrl={entry.frame} frameRatio={entry.frameRatio} size={48} fallback={entry.name.charAt(0).toUpperCase()} />
                      <div>
                        <div className="font-medium text-gray-900 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleProfileClick(entry.id)}>
                          {entry.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-sm">
                        <span className="text-green-600">{entry.wins}W</span>
                        <span className="text-gray-400 mx-1">·</span>
                        <span className="text-red-500">{entry.losses}L</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Your Rank */}
            {currentPvpRank && (
              <div className="relative bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
                <CornerBrackets />
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center space-x-4">
                    <AvatarWithFrame avatarUrl={currentPvpRank.avatar} frameUrl={currentPvpRank.frame} frameRatio={currentPvpRank.frameRatio} size={48} fallback={currentPvpRank.name.charAt(0).toUpperCase()} />
                    <div>
                      <div className="font-semibold text-gray-900">Bạn ({currentPvpRank.name})</div>
                      <span className="text-sm text-gray-600">Hạng #{currentPvpRank.rank}</span>
                    </div>
                  </div>
                  <div className="font-semibold text-lg">
                    <span className="text-green-600">{currentPvpRank.wins}W</span>
                    <span className="text-gray-400 mx-1">·</span>
                    <span className="text-red-500">{currentPvpRank.losses}L</span>
                  </div>
                </div>
              </div>
            )}

            {/* Previous PvP Champions */}
            {(() => {
              const pvpAchievementIds = pvpChampionRewards.filter(r => r.achievement_id).map(r => r.achievement_id)
              const pvpPrev = previousChampions.filter(c => pvpAchievementIds.includes(c.achievement_id))
              if (pvpPrev.length === 0) return null
              return (
                <div className="relative bg-white border border-gray-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
                  <CornerBrackets />
                  <div className="px-5 pt-4 pb-1">
                    <h3 className="text-base font-semibold text-gray-900 uppercase tracking-wide">Top PvP tuần trước</h3>
                    <div className="h-[2px] w-12 bg-gradient-to-r from-yellow-400 to-transparent mt-1" />
                  </div>
                  <div className="divide-y divide-gray-100">
                    {pvpPrev.map((champion, index) => {
                      const earnedDate = new Date(champion.earned_at)
                      const dateStr = earnedDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })
                      const matchedReward = pvpChampionRewards.find(r => r.achievement_id === champion.achievement_id)
                      const rank = matchedReward?.rank || 1
                      const rankIcon = rank === 3 ? '🥉' : rank === 2 ? '🥈' : '🏆'
                      const rankLabel = `Top ${rank}`
                      return (
                        <div key={index} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <AvatarWithFrame
                              avatarUrl={champion.users?.avatar_url}
                              frameUrl={champion.users?.hide_frame ? null : champion.users?.active_title}
                              frameRatio={champion.users?.active_frame_ratio}
                              size={40}
                              fallback={champion.users?.full_name?.charAt(0)?.toUpperCase() || '?'}
                            />
                            <div>
                              <div className="font-medium text-gray-900">{champion.users?.full_name || 'Unknown'}</div>
                              <div className="text-xs text-gray-400">{dateStr}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-yellow-500">
                            <span className="text-base">{rankIcon}</span>
                            <span className="text-xs font-medium">{rankLabel}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </>
        )
      )}

      {/* Champion Reward Banner */}
      {timeframe !== 'daily_challenge' && timeframe !== 'training' && timeframe !== 'pvp' && (
        <>
      {/* Champion Reward Banner */}
      {(timeframe === 'week' || timeframe === 'month') &&
        renderChampionBanner(timeframe === 'week' ? weeklyChampionRewards : monthlyChampionRewards)}

      {/* Top 3 Podium */}
      {leaderboardData.length > 0 && (
        <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-8 items-end">
          {/* 2nd Place */}
          {leaderboardData[1] && (
            <div className="order-1">
              <div className="relative text-center p-2 md:p-6 bg-gradient-to-t from-gray-200/80 to-white border border-gray-200 overflow-hidden"
                style={{ clipPath: CLIP_CARD }}
              >
                <CornerBrackets />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s infinite'
                }} />
                <style>{`
                  @keyframes shimmer {
                    0% { background-position: 100% 0; }
                    100% { background-position: -100% 0; }
                  }
                `}</style>
                <div className="mx-auto mb-2 md:mb-4 relative z-10">
                  <AvatarWithFrame
                    avatarUrl={leaderboardData[1].avatar}
                    frameUrl={leaderboardData[1].frame}
                    frameRatio={leaderboardData[1].frameRatio}
                    size={80}
                    className="mx-auto"
                    fallback={leaderboardData[1].name.charAt(0).toUpperCase()}
                  />
                </div>
                <div
                  className="font-semibold text-gray-900 text-xs md:text-base cursor-pointer hover:text-blue-600 transition-colors break-words text-center relative z-10"
                  onClick={() => handleProfileClick(leaderboardData[1].id)}
                >
                  {leaderboardData[1].name}
                </div>
                <div className="hidden md:flex items-center justify-center mt-1 md:mt-2 relative z-10">
                  <div
                    title={leaderboardData[1].badge.name}
                    onClick={() => handleBadgeClick(leaderboardData[1].badge)}
                    className="cursor-pointer"
                  >
                    <SimpleBadge badge={leaderboardData[1].badge} size="xs" showName={false} />
                  </div>
                </div>
                <div className="text-sm md:text-lg font-semibold text-gray-700 mt-1 md:mt-2 relative z-10">
                  <div className="flex items-center justify-center gap-1">
                    {leaderboardData[1].xp.toLocaleString()}
                    <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3 md:w-4 h-3 md:h-4" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 1st Place */}
          {leaderboardData[0] && (
            <div className="order-2">
              <div className="relative text-center p-2 md:p-6 bg-gradient-to-t from-yellow-100/80 to-white border border-yellow-200 md:transform md:scale-105 overflow-hidden"
                style={{ clipPath: CLIP_CARD }}
              >
                <CornerBrackets />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent" style={{
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s infinite'
                }} />
                <Crown className="w-6 h-6 md:w-8 md:h-8 text-yellow-500 mx-auto mb-1 md:mb-2 relative z-10" />
                <div className="mx-auto mb-2 md:mb-4 relative z-10">
                  <AvatarWithFrame
                    avatarUrl={leaderboardData[0].avatar}
                    frameUrl={leaderboardData[0].frame}
                    frameRatio={leaderboardData[0].frameRatio}
                    size={80}
                    className="mx-auto"
                    fallback={leaderboardData[0].name.charAt(0).toUpperCase()}
                  />
                </div>
                <div
                  className="font-semibold text-gray-900 text-xs md:text-lg cursor-pointer hover:text-blue-600 transition-colors break-words text-center relative z-10"
                  onClick={() => handleProfileClick(leaderboardData[0].id)}
                >
                  {leaderboardData[0].name}
                </div>
                <div className="hidden md:flex items-center justify-center mt-1 md:mt-2 relative z-10">
                  <div
                    title={leaderboardData[0].badge.name}
                    onClick={() => handleBadgeClick(leaderboardData[0].badge)}
                    className="cursor-pointer"
                  >
                    <SimpleBadge badge={leaderboardData[0].badge} size="medium" showName={false} />
                  </div>
                </div>
                <div className="text-sm md:text-xl font-semibold text-gray-900 mt-1 md:mt-2 relative z-10">
                  <div className="flex items-center justify-center gap-1">
                    {leaderboardData[0].xp.toLocaleString()}
                    <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3 md:w-5 h-3 md:h-5" />
                  </div>
                </div>
                <div className="hidden md:flex items-center justify-center mt-2 text-yellow-600 relative z-10">
                  <Star size={16} fill="currentColor" />
                  <span className="ml-1 text-sm">Vua học tập</span>
                </div>
              </div>
            </div>
          )}

          {/* 3rd Place */}
          {leaderboardData[2] && (
            <div className="order-3">
              <div className="relative text-center p-2 md:p-6 bg-gradient-to-t from-orange-100/80 to-white border border-orange-200 overflow-hidden"
                style={{ clipPath: CLIP_CARD }}
              >
                <CornerBrackets />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s infinite'
                }} />
                <div className="mx-auto mb-2 md:mb-4 relative z-10">
                  <AvatarWithFrame
                    avatarUrl={leaderboardData[2].avatar}
                    frameUrl={leaderboardData[2].frame}
                    frameRatio={leaderboardData[2].frameRatio}
                    size={56}
                    className="mx-auto"
                    fallback={leaderboardData[2].name.charAt(0).toUpperCase()}
                  />
                </div>
                <div
                  className="font-semibold text-gray-900 text-xs md:text-base cursor-pointer hover:text-blue-600 transition-colors break-words text-center relative z-10"
                  onClick={() => handleProfileClick(leaderboardData[2].id)}
                >
                  {leaderboardData[2].name}
                </div>
                <div className="hidden md:flex items-center justify-center mt-1 md:mt-2 relative z-10">
                  <div
                    title={leaderboardData[2].badge.name}
                    onClick={() => handleBadgeClick(leaderboardData[2].badge)}
                    className="cursor-pointer"
                  >
                    <SimpleBadge badge={leaderboardData[2].badge} size="small" showName={false} />
                  </div>
                </div>
                <div className="text-sm md:text-lg font-semibold text-gray-700 mt-1 md:mt-2 relative z-10">
                  <div className="flex items-center justify-center gap-1">
                    {leaderboardData[2].xp.toLocaleString()}
                    <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3 md:w-4 h-3 md:h-4" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Leaderboard */}
      <div className="relative bg-white border border-gray-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
        <CornerBrackets />
        <div className="divide-y divide-gray-100">
          {leaderboardData.slice(3, timeframe === 'week' || timeframe === 'month' ? 10 : undefined).map((user) => (
            <div
              key={user.id}
              className={`py-2 md:py-4 px-3 md:px-4 ${getRankColor(user.rank)} flex items-center justify-between`}
            >
              <div className="flex items-center space-x-2 md:space-x-4">
                <div className="flex items-center justify-center w-6 md:w-8 h-6 md:h-8">
                  {getRankIcon(user.rank)}
                </div>

                <div className="relative">
                  <AvatarWithFrame
                    avatarUrl={user.avatar}
                    frameUrl={user.frame}
                    frameRatio={user.frameRatio}
                    size={48}
                    fallback={user.name.charAt(0).toUpperCase()}
                  />
                  <div
                    className="absolute -bottom-1 -right-1 cursor-pointer scale-75 md:scale-100"
                    title={user.badge.name}
                    onClick={() => handleBadgeClick(user.badge)}
                  >
                    <SimpleBadge badge={user.badge} size="xs" showName={false} />
                  </div>
                </div>

                <div>
                  <div
                    className="font-medium text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
                    onClick={() => handleProfileClick(user.id)}
                  >
                    {user.name}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-semibold text-sm text-gray-900 flex items-center gap-2 justify-end">
                  {user.xp.toLocaleString()}
                  <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-5 h-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Your Rank */}
      {currentUserRank && (
        <div className="relative bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
          <CornerBrackets />
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-4">
              <AvatarWithFrame
                avatarUrl={currentUserRank.avatar}
                frameUrl={currentUserRank.frame}
                frameRatio={currentUserRank.frameRatio}
                size={48}
                fallback={currentUserRank.name.charAt(0).toUpperCase()}
              />
              <div>
                <div className="font-semibold text-gray-900">Bạn ({currentUserRank.name})</div>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-sm text-gray-600">Hạng #{currentUserRank.rank}</span>
                  <div
                    title={currentUserRank.badge.name}
                    onClick={() => handleBadgeClick(currentUserRank.badge)}
                    className="cursor-pointer"
                  >
                    <SimpleBadge badge={currentUserRank.badge} size="small" showName={false} />
                  </div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-lg text-gray-900 flex items-center gap-2 justify-end">
                {currentUserRank.xp.toLocaleString()}
                <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Achievement Goals */}
      {currentUserRank && (
        <div className="relative bg-white border border-gray-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
          <CornerBrackets />
          <div className="px-5 pt-4 pb-1">
            <h3 className="text-base font-semibold text-gray-900 uppercase tracking-wide">Mục tiêu tiếp theo</h3>
            <div className="h-[2px] w-12 bg-gradient-to-r from-blue-400 to-transparent mt-1" />
          </div>
          <div className="p-4 space-y-3">
            {/* Next level goal */}
            <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100" style={{ clipPath: CLIP_SM }}>
              <div className="flex items-center space-x-3">
                <Award className="w-5 h-5 text-orange-600" />
                <span className="text-sm text-gray-900">Lên cấp {getNextLevelNumber(currentUserRank.xp)}</span>
              </div>
              <span className="text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  Cần thêm {getNextLevelXpRequired(currentUserRank.xp).toLocaleString()}
                  <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-4 h-4" />
                </div>
              </span>
            </div>

            {/* Rank improvement goal */}
            {currentUserRank.rank > 1 && leaderboardData[currentUserRank.rank - 2] && (
              <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100" style={{ clipPath: CLIP_SM }}>
                <div className="flex items-center space-x-3">
                  <Medal className="w-5 h-5 text-gray-600" />
                  <span className="text-sm text-gray-900">
                    Vượt qua {leaderboardData[currentUserRank.rank - 2].name}
                  </span>
                </div>
                <span className="text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    Cần thêm {(leaderboardData[currentUserRank.rank - 2].xp - currentUserRank.xp + 1).toLocaleString()}
                    <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-4 h-4" />
                  </div>
                </span>
              </div>
            )}

            {/* Top 10 goal */}
            {currentUserRank.rank > 10 && (
              <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100" style={{ clipPath: CLIP_SM }}>
                <div className="flex items-center space-x-3">
                  <Trophy className="w-5 h-5 text-yellow-600" />
                  <span className="text-sm text-gray-900">Vào top 10</span>
                </div>
                <div className="text-sm text-gray-600 flex items-center gap-1">
                  {leaderboardData[9] ? (
                    <>
                      Cần thêm {Math.max(1, leaderboardData[9].xp - currentUserRank.xp + 1).toLocaleString()}
                      <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-4 h-4" />
                    </>
                  ) : (
                    'Đang tính toán...'
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Previous Champions */}
      {previousChampions.length > 0 && (timeframe === 'week' || timeframe === 'month') && (
        <div className="relative bg-white border border-gray-200 overflow-hidden" style={{ clipPath: CLIP_CARD }}>
          <CornerBrackets />
          <div className="px-5 pt-4 pb-1">
            <h3 className="text-base font-semibold text-gray-900 uppercase tracking-wide">
              {timeframe === 'week' ? 'Top tuần trước' : 'Top tháng trước'}
            </h3>
            <div className="h-[2px] w-12 bg-gradient-to-r from-yellow-400 to-transparent mt-1" />
          </div>
          <div className="divide-y divide-gray-100">
            {previousChampions
              .filter(c => {
                const rewards = timeframe === 'week' ? weeklyChampionRewards : monthlyChampionRewards
                const achievementIds = rewards.filter(r => r.achievement_id).map(r => r.achievement_id)
                return achievementIds.includes(c.achievement_id)
              })
              .map((champion, index) => {
                const earnedDate = new Date(champion.earned_at)
                const dateStr = earnedDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })
                const rewards = timeframe === 'week' ? weeklyChampionRewards : monthlyChampionRewards
                const matchedReward = rewards.find(r => r.achievement_id === champion.achievement_id)
                const rank = matchedReward?.rank || 1
                const rankIcon = rank === 3 ? '🥉' : rank === 2 ? '🥈' : '🏆'
                const rankLabel = `Top ${rank}`
                return (
                  <div key={index} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <AvatarWithFrame
                        avatarUrl={champion.users?.avatar_url}
                        frameUrl={champion.users?.hide_frame ? null : champion.users?.active_title}
                        frameRatio={champion.users?.active_frame_ratio}
                        size={40}
                        fallback={champion.users?.full_name?.charAt(0)?.toUpperCase() || '?'}
                      />
                      <div>
                        <div className="font-medium text-gray-900">{champion.users?.full_name || 'Unknown'}</div>
                        <div className="text-xs text-gray-400">{dateStr}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-yellow-500">
                      <span className="text-base">{rankIcon}</span>
                      <span className="text-xs font-medium">{rankLabel}</span>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}
      </>
      )}

      {/* Badge Info Modal for Mobile */}
      {showBadgeInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 md:hidden">
          <div className="relative bg-white border border-gray-200 p-6 mx-4 max-w-sm w-full" style={{ clipPath: CLIP_CARD }}>
            <CornerBrackets />
            <div className="text-center">
              <div className="mb-4">
                <SimpleBadge badge={showBadgeInfo} size="large" showName={false} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {showBadgeInfo.name}
              </h3>
              <p className="text-sm text-gray-600">
                Tier: {showBadgeInfo.tier.charAt(0).toUpperCase() + showBadgeInfo.tier.slice(1)}
              </p>
              <button
                onClick={() => setShowBadgeInfo(null)}
                className="mt-4 px-6 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                style={{ clipPath: CLIP_BTN }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Leaderboard