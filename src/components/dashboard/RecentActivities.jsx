import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { Clock, Trophy } from 'lucide-react'
import AvatarWithFrame from '../ui/AvatarWithFrame'

import { assetUrl } from '../../hooks/useBranding';

const CLIP_CARD = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)'
const CLIP_SM = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)'

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
const getMissionImage = (iconName) => MISSION_IMAGE_MAP[iconName] || DEFAULT_MISSION_IMAGE

const GAME_TYPE_LABELS = {
  scramble: 'Word Scramble',
  whackmole: 'Whack-a-Mole',
  astroblast: 'Astro Blast',
  matchgame: 'Match Up',
  flappy: 'Flappy Pet',
  wordtype: 'Word Type',
  sayitright: 'Say It Right',
  catch: 'Hungry Pet',
  fishing: 'Fishing Frenzy',
}

/* Corner bracket decoration */
const CornerBrackets = () => (
  <>
    <div className="absolute top-0 left-[10px] w-5 h-[1px] bg-gradient-to-r from-blue-300/40 to-transparent" />
    <div className="absolute top-0 left-[10px] w-[1px] h-5 bg-gradient-to-b from-blue-300/40 to-transparent" />
    <div className="absolute bottom-0 right-[10px] w-5 h-[1px] bg-gradient-to-l from-blue-300/40 to-transparent" />
    <div className="absolute bottom-0 right-[10px] w-[1px] h-5 bg-gradient-to-t from-blue-300/40 to-transparent" />
  </>
)

const TABS = [
  { key: 'mission', label: 'Nhiệm vụ', icon: '🎯' },
  { key: 'achievement', label: 'Thành tích', icon: '🏆' },
  { key: 'wild', label: 'Wild Area', icon: '🌿' },
]

const RecentActivities = () => {
  const navigate = useNavigate()
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('mission')

  useEffect(() => {
    fetchRecentActivities()
  }, [])

  const handleUserClick = (userId) => {
    navigate(`/profile/${userId}`)
  }


  const fetchRecentActivities = async () => {
    try {
      setLoading(true)

      // Fetch achievement claims with user and achievement data in one query
      const { data: achievementData, error: achievementError } = await supabase
        .from('user_achievements')
        .select(`
          id,
          user_id,
          achievement_id,
          claimed_at,
          users:user_id (
            id,
            full_name,
            avatar_url,
            role,
            user_equipment(active_title, active_frame_ratio, hide_frame)
          ),
          achievements:achievement_id (
            id,
            title,
            xp_reward,
            gem_reward
          )
        `)
        .not('claimed_at', 'is', null)
        .order('claimed_at', { ascending: false })
        .limit(20)

      if (achievementError) throw achievementError

      // Fetch claimed missions with user and mission data
      const { data: missionData, error: missionError } = await supabase
        .from('user_missions')
        .select(`
          id,
          user_id,
          mission_id,
          updated_at,
          users:user_id (
            id,
            full_name,
            avatar_url,
            role,
            user_equipment(active_title, active_frame_ratio, hide_frame)
          ),
          missions:mission_id (
            id,
            title,
            reward_xp,
            reward_gems,
            mission_type,
            goal_type,
            icon,
            reward_item_id,
            reward_item_quantity,
            reward_chest_id,
            collectible_items:reward_item_id (name, image_url),
            chests:reward_chest_id (name, image_url)
          )
        `)
        .eq('status', 'claimed')
        .order('updated_at', { ascending: false })
        .limit(20)

      if (missionError) throw missionError

      // Fetch competition winners — top 1 only (rank=1 or weekly scramble champion)
      const { data: competitionData, error: competitionError } = await supabase
        .from('notifications')
        .select(`
          id,
          user_id,
          title,
          message,
          icon,
          data,
          created_at,
          users:user_id (
            id,
            full_name,
            avatar_url,
            role,
            user_equipment(active_title, active_frame_ratio, hide_frame)
          )
        `)
        .eq('type', 'competition_winner')
        .or('data->>rank.eq.1,data->>competition.eq.weekly_scramble')
        .order('created_at', { ascending: false })
        .limit(10)

      if (competitionError) throw competitionError

      // Fetch wild area pet catches
      const { data: wildCatchData, error: wildCatchError } = await supabase
        .from('wild_area_logs')
        .select(`
          id,
          user_id,
          pet_name,
          pet_rarity,
          ball_name,
          created_at,
          pets:pet_id (
            id,
            name,
            image_url
          ),
          collectible_items:ball_item_id (
            image_url
          ),
          users:user_id (
            id,
            full_name,
            avatar_url,
            role,
            user_equipment(active_title, active_frame_ratio, hide_frame)
          )
        `)
        .eq('action', 'catch_success')
        .order('created_at', { ascending: false })
        .limit(15)

      if (wildCatchError) throw wildCatchError

      // Flatten user_equipment into users object
      const flattenUser = (item) => {
        if (!item?.users) return item
        const { user_equipment, ...userRest } = item.users
        return { ...item, users: { ...userRest, ...user_equipment } }
      }

      // Process achievement claims
      const achievementActivities = (achievementData || [])
        .filter(achievement => achievement.users && achievement.achievements && achievement.users.role !== 'admin')
        .map(achievement => flattenUser({
          ...achievement,
          type: 'achievement',
          activity_date: achievement.claimed_at
        }))

      // Process mission claims (exclude admins)
      const missionActivities = (missionData || [])
        .filter(mission => mission.users && mission.missions && mission.users.role !== 'admin')
        .map(mission => flattenUser({
          ...mission,
          type: 'mission',
          activity_date: mission.updated_at
        }))

      // Process competition winners (top 1 only)
      const competitionActivities = (competitionData || [])
        .filter(n => n.users && n.users.role !== 'admin')
        .map(n => flattenUser({
          ...n,
          type: 'competition',
          activity_date: n.created_at
        }))

      // Process wild area catches (exclude admins)
      const wildCatchActivities = (wildCatchData || [])
        .filter(w => w.users && w.pets && w.users.role !== 'admin')
        .map(w => flattenUser({
          ...w,
          type: 'wild_catch',
          activity_date: w.created_at
        }))

      // Merge and sort by date, gem/competition activities stick to top for their day
      const allActivities = [...achievementActivities, ...missionActivities, ...competitionActivities, ...wildCatchActivities]
        .sort((a, b) => {
          const dateA = new Date(a.activity_date)
          const dateB = new Date(b.activity_date)
          const dayA = dateA.toDateString()
          const dayB = dateB.toDateString()

          // Different days: sort by date descending
          if (dayA !== dayB) return dateB - dateA

          // Same day: competition winners and gem activities go first
          const aHasGems = a.type === 'competition' || (a.type === 'mission' && (a.missions?.reward_gems > 0 || a.missions?.goal_type === 'complete_all_missions')) || (a.type === 'achievement' && a.achievements?.gem_reward > 0)
          const bHasGems = b.type === 'competition' || (b.type === 'mission' && (b.missions?.reward_gems > 0 || b.missions?.goal_type === 'complete_all_missions')) || (b.type === 'achievement' && b.achievements?.gem_reward > 0)
          if (aHasGems && !bHasGems) return -1
          if (!aHasGems && bHasGems) return 1

          // Same priority: sort by date descending
          return dateB - dateA
        })

      setActivities(allActivities)
    } catch (error) {
      console.error('Error fetching recent activities:', error)
      setActivities([])
    } finally {
      setLoading(false)
    }
  }


  if (loading) {
    return (
      <div className="relative bg-white border border-gray-200 p-6 h-full overflow-hidden shadow-sm"
        style={{ clipPath: CLIP_CARD }}
      >
        <CornerBrackets />
        <h3 className="text-lg font-semibold text-gray-900 mb-4 uppercase tracking-wide">Hoạt động gần đây</h3>
        <div className="h-[2px] w-16 bg-gradient-to-r from-blue-400 to-transparent mb-4" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center space-x-3 animate-pulse p-3"
              style={{ clipPath: CLIP_SM }}
            >
              <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 w-3/4 mb-1" style={{ clipPath: CLIP_SM }}></div>
                <div className="h-3 bg-gray-200 w-1/2" style={{ clipPath: CLIP_SM }}></div>
              </div>
              <div className="w-12 h-6 bg-gray-200" style={{ clipPath: CLIP_SM }}></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="relative bg-white border border-gray-200 p-6 h-full overflow-hidden shadow-sm"
        style={{ clipPath: CLIP_CARD }}
      >
        <CornerBrackets />
        <h3 className="text-lg font-semibold text-gray-900 mb-4 uppercase tracking-wide">Hoạt động gần đây</h3>
        <div className="h-[2px] w-16 bg-gradient-to-r from-blue-400 to-transparent mb-4" />
        <div className="text-center py-8 text-gray-500">
          <Trophy className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p>Chưa có hoạt động nào gần đây</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative bg-white border border-gray-200 p-6 h-full overflow-hidden shadow-sm"
      style={{ clipPath: CLIP_CARD }}
    >
      <CornerBrackets />

      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-gray-900 uppercase tracking-wide">Hoạt động gần đây</h3>
        <div className="flex items-center text-xs text-gray-400 font-medium tracking-wider">
          <Clock className="w-3.5 h-3.5 mr-1" />
          LIVE
        </div>
      </div>
      <div className="h-[2px] w-full bg-gradient-to-r from-blue-400 via-blue-200 to-transparent mb-3" />

      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === tab.key
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'text-gray-500 hover:bg-gray-100 border border-transparent'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style>{`.activity-scroll::-webkit-scrollbar { display: none; }`}</style>
        {activities
          .filter(a => activeTab === 'achievement' ? (a.type === 'achievement' || a.type === 'competition')
            : activeTab === 'mission' ? a.type === 'mission'
            : a.type === 'wild_catch')
          .map((activity) => (
          <div key={`${activity.type}-${activity.id}`} className={`relative flex items-center space-x-3 p-3 transition-all overflow-hidden ${
            activity.type === 'competition'
              ? 'border border-amber-300 bg-amber-50'
              : activity.type === 'wild_catch' && activity.pet_rarity === 'legendary'
              ? 'border border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50'
              : activity.type === 'wild_catch' && activity.pet_rarity === 'epic'
              ? 'border border-purple-300 bg-purple-50'
              : activity.type === 'wild_catch' && activity.pet_rarity === 'rare'
              ? 'border border-blue-300 bg-blue-50'
              : activity.type === 'wild_catch' && activity.pet_rarity === 'uncommon'
              ? 'border border-green-300 bg-green-50'
              : activity.type === 'wild_catch'
              ? 'border border-gray-200 bg-gray-50'
              : activity.type === 'mission' && activity.missions?.goal_type === 'complete_all_missions'
              ? 'border border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50'
              : activity.type === 'achievement' && activity.achievements?.gem_reward > 0
              ? 'border border-purple-200 bg-purple-50'
              : activity.type === 'mission' && activity.missions?.reward_gems > 0
              ? 'border border-blue-200 bg-blue-50'
              : 'border border-gray-100 hover:bg-gray-50'
          }`}
            style={{ clipPath: CLIP_SM }}
          >
            {/* User Avatar with Frame */}
            <AvatarWithFrame
              avatarUrl={activity.users.avatar_url}
              frameUrl={activity.users.hide_frame ? null : activity.users.active_title}
              frameRatio={activity.users.active_frame_ratio}
              size={40}
              fallback={activity.users.full_name?.charAt(0) || 'U'}
              onClick={() => handleUserClick(activity.users.id)}
              className="cursor-pointer hover:ring-2 hover:ring-yellow-400 rounded-full transition-all"
            />

            {/* Activity Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                {activity.type === 'competition' ? (
                  <span className="text-base flex-shrink-0">🏆</span>
                ) : activity.type === 'wild_catch' ? (
                  activity.collectible_items?.image_url
                    ? <img src={activity.collectible_items.image_url} alt={activity.ball_name} className="w-5 h-5 flex-shrink-0 object-contain" />
                    : <img src={assetUrl('/image/dashboard/pet-type.webp')} alt="wild catch" className="w-4 h-4 flex-shrink-0 object-contain" />
                ) : activity.type === 'mission' ? (
                  <img src={getMissionImage(activity.missions.icon).startsWith('http') ? getMissionImage(activity.missions.icon) : assetUrl(getMissionImage(activity.missions.icon))} alt="mission" className="w-4 h-4 flex-shrink-0 object-contain" />
                ) : (
                  <img src={assetUrl('/icon/profile/achievement.svg')} alt="achievement" className="w-4 h-4 flex-shrink-0" />
                )}
                <span
                  className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => handleUserClick(activity.users.id)}
                >
                  {activity.users.full_name || 'Người dùng'}
                </span>
              </div>
              {activity.type === 'competition' ? (
                <p className="text-sm text-gray-600">
                  vô địch <span className="font-medium text-amber-600">{GAME_TYPE_LABELS[activity.data?.game_type] || activity.data?.competition?.replace('weekly_', '') || activity.title}</span>
                  {activity.data?.gems > 0 && (
                    <>{' '}<span className="inline-flex items-center text-purple-600 font-medium whitespace-nowrap"><img src={assetUrl('/image/study/gem.png')} alt="Gem" className="w-3 h-3 inline mr-0.5" />+{activity.data.gems}</span></>
                  )}
                </p>
              ) : activity.type === 'wild_catch' ? (
                <p className="text-sm text-gray-600">
                  bắt được <span className={`font-medium ${
                    activity.pet_rarity === 'legendary' ? 'text-yellow-600' :
                    activity.pet_rarity === 'epic' ? 'text-purple-600' :
                    activity.pet_rarity === 'rare' ? 'text-blue-600' :
                    activity.pet_rarity === 'uncommon' ? 'text-green-600' : 'text-gray-700'
                  }`}>{activity.pet_name}</span> trong khu vực hoang dã
                </p>
              ) : activity.type === 'mission' ? (
                <p className="text-sm text-gray-600">
                  hoàn thành nhiệm vụ <span className="font-medium text-blue-700">{activity.missions.title}</span>
                  {(activity.missions.reward_xp || 0) > 0 && (
                    <>{' '}<span className="inline-flex items-center text-yellow-600 font-medium whitespace-nowrap"><img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3 h-3 inline mr-0.5" />+{activity.missions.reward_xp}</span></>
                  )}
                  {activity.missions.reward_gems > 0 && (
                    <>{' '}<span className="inline-flex items-center text-purple-600 font-medium whitespace-nowrap"><img src={assetUrl('/image/study/gem.png')} alt="Gem" className="w-3 h-3 inline mr-0.5" />+{activity.missions.reward_gems}</span></>
                  )}
                  {activity.missions.collectible_items && (
                    <>{' '}<span className="inline-flex items-center text-emerald-600 font-medium whitespace-nowrap">+<img src={activity.missions.collectible_items.image_url} alt={activity.missions.collectible_items.name} className="w-3 h-3 inline mx-0.5 object-contain" />{activity.missions.reward_item_quantity || 1} {activity.missions.collectible_items.name}</span></>
                  )}
                  {activity.missions.chests && (
                    <>{' '}<span className="inline-flex items-center text-amber-600 font-medium whitespace-nowrap">+<img src={activity.missions.chests.image_url} alt={activity.missions.chests.name} className="w-3 h-3 inline mx-0.5 object-contain" />{activity.missions.chests.name}</span></>
                  )}
                </p>
              ) : (
                <p className="text-sm text-gray-600">
                  đạt thành tích <span className="font-medium text-yellow-700">{activity.achievements.title}</span>
                  {activity.achievements.xp_reward > 0 && (
                    <>{' '}<span className="inline-flex items-center text-yellow-600 font-medium whitespace-nowrap"><img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-3 h-3 inline mr-0.5" />+{activity.achievements.xp_reward}</span></>
                  )}
                  {activity.achievements.gem_reward > 0 && (
                    <>{' '}<span className="inline-flex items-center text-purple-600 font-medium whitespace-nowrap"><img src={assetUrl('/image/study/gem.png')} alt="Gem" className="w-3 h-3 inline mr-0.5" />+{activity.achievements.gem_reward}</span></>
                  )}
                </p>
              )}
            </div>
          </div>
        ))}
        {activities.filter(a => activeTab === 'achievement' ? (a.type === 'achievement' || a.type === 'competition')
          : activeTab === 'mission' ? a.type === 'mission'
          : a.type === 'wild_catch').length === 0 && (
          <div className="text-center py-6 text-gray-400 text-sm">
            Chưa có hoạt động nào
          </div>
        )}
      </div>

    </div>
  )
}

export default RecentActivities
