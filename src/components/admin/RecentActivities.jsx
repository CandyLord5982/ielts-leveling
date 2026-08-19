import { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import { Search, Clock, CheckCircle, Circle, Loader2, Swords, Trophy, BookOpen, ShoppingBag, Package, TreePine, Gamepad2 } from 'lucide-react'

const PAGE_SIZE = 50

const statusConfig = {
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800', icon: CheckCircle },
  in_progress: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-800', icon: Clock },
  attempted: { label: 'Attempted', className: 'bg-orange-100 text-orange-800', icon: Circle },
  not_started: { label: 'Not Started', className: 'bg-gray-100 text-gray-600', icon: Circle },
  pending: { label: 'Pending', className: 'bg-blue-100 text-blue-800', icon: Clock }
}

const GAME_TYPE_LABELS = {
  scramble: 'Word Scramble',
  whackmole: 'Whack-a-Mole',
  astroblast: 'Astro Blast',
  matchgame: 'Match Up',
  flappy: 'Flappy Pet',
  wordtype: 'Word Type',
  sayitright: 'Say It Right',
  catch: 'Hungry Pet',
  fishing: 'Fishing Frenzy'
}

const RecentActivities = () => {
  const [tab, setTab] = useState('exercises') // 'exercises' | 'pvp' | 'purchases' | 'inventory' | 'wildarea' | 'training'
  const [activities, setActivities] = useState([])
  const [pvpMatches, setPvpMatches] = useState([])
  const [purchases, setPurchases] = useState([])
  const [inventory, setInventory] = useState([])
  const [wildEncounters, setWildEncounters] = useState([])
  const [trainingScores, setTrainingScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    setSearchQuery('')
    if (tab === 'exercises') {
      fetchActivities(true)
    } else if (tab === 'pvp') {
      fetchPvpMatches(true)
    } else if (tab === 'purchases') {
      fetchPurchases(true)
    } else if (tab === 'inventory') {
      fetchInventory(true)
    } else if (tab === 'wildarea') {
      fetchWildEncounters(true)
    } else if (tab === 'training') {
      fetchTrainingScores(true)
    }
  }, [tab])

  const fetchActivities = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      const offset = reset ? 0 : activities.length

      let query = supabase
        .from('user_progress')
        .select('user_id, exercise_title, exercise_id, status, score, attempts, time_spent, completed_at, updated_at')
        .order('updated_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      const { data, error } = await query

      if (error) throw error

      let newData = data || []

      // Fetch real names from users table (exclude teacher/admin)
      const userIds = [...new Set(newData.map(p => p.user_id).filter(Boolean))]
      let userMap = {}
      let excludeIds = new Set()
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, real_name, role')
          .in('id', userIds)
        if (users) {
          users.forEach(u => {
            if (u.role === 'teacher' || u.role === 'admin') {
              excludeIds.add(u.id)
            } else {
              userMap[u.id] = u.real_name || u.full_name
            }
          })
        }
      }

      newData = newData.filter(p => !excludeIds.has(p.user_id)).map(p => ({ ...p, full_name: userMap[p.user_id] || 'Unknown' }))

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        newData = newData.filter(p =>
          p.full_name.toLowerCase().includes(q)
        )
      }

      setHasMore(newData.length === PAGE_SIZE)

      if (reset) {
        setActivities(newData)
      } else {
        setActivities(prev => [...prev, ...newData])
      }
    } catch (error) {
      console.error('Error fetching activities:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const fetchPvpMatches = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      const offset = reset ? 0 : pvpMatches.length

      let query = supabase
        .from('pvp_challenges')
        .select(`
          id, game_type, challenger_score, opponent_score, winner_id, status, created_at,
          challenger:users!pvp_challenges_challenger_id_fkey(id, full_name, real_name, role),
          opponent:users!pvp_challenges_opponent_id_fkey(id, full_name, real_name, role)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (searchQuery.trim()) {
        // Search in both challenger and opponent names
        query = query.or(`challenger.full_name.ilike.%${searchQuery.trim()}%,opponent.full_name.ilike.%${searchQuery.trim()}%`)
      }

      const { data, error } = await query

      if (error) throw error

      let newData = data || []

      // Exclude matches where either player is teacher/admin
      newData = newData.filter(m =>
        (m.challenger?.role !== 'teacher' && m.challenger?.role !== 'admin') &&
        (m.opponent?.role !== 'teacher' && m.opponent?.role !== 'admin')
      )

      // Client-side filter for search since nested FK ilike may not work
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        newData = newData.filter(m =>
          (m.challenger?.real_name || m.challenger?.full_name || '').toLowerCase().includes(q) ||
          (m.opponent?.real_name || m.opponent?.full_name || '').toLowerCase().includes(q)
        )
      }

      setHasMore(newData.length === PAGE_SIZE)

      if (reset) {
        setPvpMatches(newData)
      } else {
        setPvpMatches(prev => [...prev, ...newData])
      }
    } catch (error) {
      console.error('Error fetching PvP matches:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const fetchPurchases = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      const offset = reset ? 0 : purchases.length

      let query = supabase
        .from('user_purchases')
        .select(`
          id, user_id, item_id, purchased_at,
          shop_items(name, category, image_url)
        `)
        .order('purchased_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      const { data, error } = await query

      if (error) throw error

      let newData = data || []

      // Fetch user names for the purchases (exclude teacher/admin)
      const userIds = [...new Set(newData.map(p => p.user_id).filter(Boolean))]
      let userMap = {}
      let excludeIds = new Set()
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, real_name, role')
          .in('id', userIds)
        if (users) {
          users.forEach(u => {
            if (u.role === 'teacher' || u.role === 'admin') {
              excludeIds.add(u.id)
            } else {
              userMap[u.id] = u.real_name || u.full_name
            }
          })
        }
      }

      newData = newData.filter(p => !excludeIds.has(p.user_id)).map(p => ({ ...p, full_name: userMap[p.user_id] || 'Unknown' }))

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        newData = newData.filter(p =>
          p.full_name.toLowerCase().includes(q)
        )
      }

      setHasMore(newData.length === PAGE_SIZE)

      if (reset) {
        setPurchases(newData)
      } else {
        setPurchases(prev => [...prev, ...newData])
      }
    } catch (error) {
      console.error('Error fetching purchases:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const fetchInventory = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      const offset = reset ? 0 : inventory.length

      let query = supabase
        .from('user_inventory')
        .select(`
          id, user_id, item_id, quantity, updated_at,
          collectible_items(name, rarity, image_url, item_type, price_gems, price_xp)
        `)
        .gt('quantity', 0)
        .order('updated_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      const { data, error } = await query

      if (error) throw error

      let newData = (data || []).filter(p => p.collectible_items?.item_type !== 'pet_food')

      // Fetch user names (exclude teacher/admin)
      const userIds = [...new Set(newData.map(p => p.user_id).filter(Boolean))]
      let userMap = {}
      let excludeIds = new Set()
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, real_name, role')
          .in('id', userIds)
        if (users) {
          users.forEach(u => {
            if (u.role === 'teacher' || u.role === 'admin') {
              excludeIds.add(u.id)
            } else {
              userMap[u.id] = u.real_name || u.full_name
            }
          })
        }
      }

      newData = newData.filter(p => !excludeIds.has(p.user_id)).map(p => ({ ...p, full_name: userMap[p.user_id] || 'Unknown' }))

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        newData = newData.filter(p =>
          p.full_name.toLowerCase().includes(q)
        )
      }

      setHasMore(newData.length === PAGE_SIZE)

      if (reset) {
        setInventory(newData)
      } else {
        setInventory(prev => [...prev, ...newData])
      }
    } catch (error) {
      console.error('Error fetching inventory:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const fetchTrainingScores = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      const offset = reset ? 0 : trainingScores.length

      let query = supabase
        .from('training_scores')
        .select('id, user_id, game_type, score, played_at')
        .order('played_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      const { data, error } = await query

      if (error) throw error

      let newData = data || []

      const userIds = [...new Set(newData.map(p => p.user_id).filter(Boolean))]
      let userMap = {}
      let excludeIds = new Set()
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, real_name, role')
          .in('id', userIds)
        if (users) {
          users.forEach(u => {
            if (u.role === 'teacher' || u.role === 'admin') {
              excludeIds.add(u.id)
            } else {
              userMap[u.id] = u.real_name || u.full_name
            }
          })
        }
      }

      newData = newData.filter(p => !excludeIds.has(p.user_id)).map(p => ({ ...p, full_name: userMap[p.user_id] || 'Unknown' }))

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        newData = newData.filter(p =>
          p.full_name.toLowerCase().includes(q)
        )
      }

      setHasMore(newData.length === PAGE_SIZE)

      if (reset) {
        setTrainingScores(newData)
      } else {
        setTrainingScores(prev => [...prev, ...newData])
      }
    } catch (error) {
      console.error('Error fetching training scores:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const fetchWildEncounters = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      const offset = reset ? 0 : wildEncounters.length

      let query = supabase
        .from('wild_area_logs')
        .select('id, user_id, pet_name, pet_rarity, ball_name, action, is_duplicate, refund_xp, catch_rate, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      const { data, error } = await query

      if (error) throw error

      let newData = data || []

      // Fetch user names (exclude teacher/admin)
      const userIds = [...new Set(newData.map(p => p.user_id).filter(Boolean))]
      let userMap = {}
      let excludeIds = new Set()
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, real_name, role')
          .in('id', userIds)
        if (users) {
          users.forEach(u => {
            if (u.role === 'teacher' || u.role === 'admin') {
              excludeIds.add(u.id)
            } else {
              userMap[u.id] = u.real_name || u.full_name
            }
          })
        }
      }

      newData = newData.filter(p => !excludeIds.has(p.user_id)).map(p => ({ ...p, full_name: userMap[p.user_id] || 'Unknown' }))

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        newData = newData.filter(p =>
          p.full_name.toLowerCase().includes(q)
        )
      }

      setHasMore(newData.length === PAGE_SIZE)

      if (reset) {
        setWildEncounters(newData)
      } else {
        setWildEncounters(prev => [...prev, ...newData])
      }
    } catch (error) {
      console.error('Error fetching wild encounters:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (tab === 'exercises') {
      fetchActivities(true)
    } else if (tab === 'pvp') {
      fetchPvpMatches(true)
    } else if (tab === 'purchases') {
      fetchPurchases(true)
    } else if (tab === 'inventory') {
      fetchInventory(true)
    } else if (tab === 'wildarea') {
      fetchWildEncounters(true)
    } else if (tab === 'training') {
      fetchTrainingScores(true)
    }
  }

  const formatTime = (seconds) => {
    if (!seconds) return '-'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status) => {
    const config = statusConfig[status] || statusConfig.not_started
    const Icon = config.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    )
  }

  const getWinnerLabel = (match) => {
    if (match.status !== 'completed') return '-'
    if (!match.winner_id) return 'Draw'
    if (match.winner_id === match.challenger?.id) return match.challenger?.real_name || match.challenger?.full_name || 'Challenger'
    if (match.winner_id === match.opponent?.id) return match.opponent?.real_name || match.opponent?.full_name || 'Opponent'
    return '-'
  }

  const currentData = tab === 'exercises' ? activities : tab === 'pvp' ? pvpMatches : tab === 'purchases' ? purchases : tab === 'inventory' ? inventory : tab === 'wildarea' ? wildEncounters : trainingScores

  if (loading) {
    return (
      <div>
        {/* Tabs still visible while loading */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('exercises')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'exercises' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <BookOpen className="w-4 h-4" /> Exercises
          </button>
          <button
            onClick={() => setTab('pvp')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'pvp' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <Swords className="w-4 h-4" /> PvP Matches
          </button>
          <button
            onClick={() => setTab('purchases')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'purchases' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <ShoppingBag className="w-4 h-4" /> Purchases
          </button>
          <button
            onClick={() => setTab('inventory')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'inventory' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <Package className="w-4 h-4" /> Inventory
          </button>
          <button
            onClick={() => setTab('wildarea')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'wildarea' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <TreePine className="w-4 h-4" /> Wild Area
          </button>
          <button
            onClick={() => setTab('training')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'training' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <Gamepad2 className="w-4 h-4" /> Training
          </button>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="ml-3 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('exercises')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'exercises' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          <BookOpen className="w-4 h-4" /> Exercises
        </button>
        <button
          onClick={() => setTab('pvp')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'pvp' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          <Swords className="w-4 h-4" /> PvP Matches
        </button>
        <button
          onClick={() => setTab('purchases')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'purchases' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          <ShoppingBag className="w-4 h-4" /> Purchases
        </button>
        <button
          onClick={() => setTab('inventory')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'inventory' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          <Package className="w-4 h-4" /> Inventory
        </button>
        <button
          onClick={() => setTab('wildarea')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'wildarea' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          <TreePine className="w-4 h-4" /> Wild Area
        </button>
        <button
          onClick={() => setTab('training')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'training' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          <Gamepad2 className="w-4 h-4" /> Training
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by student name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Search
        </button>
      </form>

      {/* Exercises Table */}
      {tab === 'exercises' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Student</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Exercise</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Score</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Attempts</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Time</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Date</th>
                </tr>
              </thead>
              <tbody>
                {activities.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-500">
                      No activities found.
                    </td>
                  </tr>
                ) : (
                  activities.map((activity, index) => (
                    <tr key={`${activity.user_id}-${activity.exercise_id}-${index}`} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{activity.full_name || 'Unknown'}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{activity.exercise_title || '-'}</td>
                      <td className="px-4 py-3 text-center">{getStatusBadge(activity.status)}</td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-900">
                        {activity.score != null ? `${activity.score}%` : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">{activity.attempts || 0}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{formatTime(activity.time_spent)}</td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">{formatDate(activity.updated_at || activity.completed_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PvP Matches Table */}
      {tab === 'pvp' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Challenger</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Score</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">vs</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Score</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Opponent</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Game</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Winner</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Date</th>
                </tr>
              </thead>
              <tbody>
                {pvpMatches.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500">
                      No PvP matches found.
                    </td>
                  </tr>
                ) : (
                  pvpMatches.map((match) => {
                    const isWinnerChallenger = match.winner_id === match.challenger?.id
                    const isWinnerOpponent = match.winner_id === match.opponent?.id
                    return (
                      <tr key={match.id} className="border-b last:border-b-0 hover:bg-gray-50">
                        <td className={`px-4 py-3 font-medium ${isWinnerChallenger ? 'text-green-700' : 'text-gray-900'}`}>
                          {isWinnerChallenger && <Trophy className="w-3 h-3 inline mr-1 text-yellow-500" />}
                          {match.challenger?.real_name || match.challenger?.full_name || 'Unknown'}
                        </td>
                        <td className={`px-4 py-3 text-center font-semibold ${isWinnerChallenger ? 'text-green-700' : 'text-gray-900'}`}>
                          {match.challenger_score ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-400 font-bold">vs</td>
                        <td className={`px-4 py-3 text-center font-semibold ${isWinnerOpponent ? 'text-green-700' : 'text-gray-900'}`}>
                          {match.opponent_score ?? '-'}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${isWinnerOpponent ? 'text-green-700' : 'text-gray-900'}`}>
                          {match.opponent?.real_name || match.opponent?.full_name || 'Unknown'}
                          {isWinnerOpponent && <Trophy className="w-3 h-3 inline ml-1 text-yellow-500" />}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {GAME_TYPE_LABELS[match.game_type] || match.game_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-medium">
                          {getWinnerLabel(match)}
                        </td>
                        <td className="px-4 py-3 text-center">{getStatusBadge(match.status)}</td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs">{formatDate(match.created_at)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Purchases Table */}
      {tab === 'purchases' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Student</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Item</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Category</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Date</th>
                </tr>
              </thead>
              <tbody>
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-gray-500">
                      No purchases found.
                    </td>
                  </tr>
                ) : (
                  purchases.map((purchase, index) => (
                    <tr key={purchase.id || `${purchase.user_id}-${purchase.item_id}-${index}`} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{purchase.full_name || 'Unknown'}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <div className="flex items-center gap-2">
                          {purchase.shop_items?.image_url && (
                            <img src={purchase.shop_items.image_url} alt="" className="w-6 h-6 rounded object-cover" />
                          )}
                          {purchase.shop_items?.name || 'Unknown Item'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                          {purchase.shop_items?.category || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">{formatDate(purchase.purchased_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inventory Table */}
      {tab === 'inventory' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Student</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Item</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Type</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Rarity</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Qty</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">For Sale</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Updated</th>
                </tr>
              </thead>
              <tbody>
                {inventory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-500">
                      No inventory found.
                    </td>
                  </tr>
                ) : (
                  inventory.map((entry, index) => {
                    const item = entry.collectible_items
                    const forSale = (item?.price_gems > 0) || (item?.price_xp > 0)
                    return (
                      <tr key={entry.id || `${entry.user_id}-${entry.item_id}-${index}`} className="border-b last:border-b-0 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{entry.full_name}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <div className="flex items-center gap-2">
                            {item?.image_url && (
                              <img src={item.image_url} alt="" className="w-6 h-6 rounded object-cover" />
                            )}
                            {item?.name || 'Unknown Item'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                            {item?.item_type?.replace('_', ' ') || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            item?.rarity === 'legendary' ? 'bg-yellow-100 text-yellow-700' :
                            item?.rarity === 'epic' ? 'bg-purple-100 text-purple-700' :
                            item?.rarity === 'rare' ? 'bg-blue-100 text-blue-700' :
                            item?.rarity === 'uncommon' ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {item?.rarity || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-900">{entry.quantity}</td>
                        <td className="px-4 py-3 text-center">
                          {forSale ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium">
                              {item.price_gems > 0 && <span className="text-blue-600">{item.price_gems} 💎</span>}
                              {item.price_gems > 0 && item.price_xp > 0 && <span className="text-gray-400">/</span>}
                              {item.price_xp > 0 && <span className="text-green-600">{item.price_xp} XP</span>}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs">{formatDate(entry.updated_at)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Wild Area Table */}
      {tab === 'wildarea' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Student</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Pet</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Rarity</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Action</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Ball</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Rate</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Note</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Date</th>
                </tr>
              </thead>
              <tbody>
                {wildEncounters.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-500">
                      No wild area encounters found.
                    </td>
                  </tr>
                ) : (
                  wildEncounters.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{entry.full_name}</td>
                      <td className="px-4 py-3 text-gray-700">{entry.pet_name || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                          entry.pet_rarity === 'legendary' ? 'bg-yellow-100 text-yellow-700' :
                          entry.pet_rarity === 'epic' ? 'bg-purple-100 text-purple-700' :
                          entry.pet_rarity === 'rare' ? 'bg-blue-100 text-blue-700' :
                          entry.pet_rarity === 'uncommon' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {entry.pet_rarity || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          entry.action === 'catch_success' ? 'bg-green-100 text-green-800' :
                          entry.action === 'catch_fail' ? 'bg-red-100 text-red-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {entry.action === 'catch_success' ? 'Caught' : entry.action === 'catch_fail' ? 'Escaped' : 'Encounter'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">{entry.ball_name || '-'}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{entry.catch_rate != null ? `${entry.catch_rate}%` : '-'}</td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {entry.is_duplicate && <span className="text-orange-600 font-medium">Dupe (+{entry.refund_xp} XP)</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">{formatDate(entry.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Training Scores Table */}
      {tab === 'training' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Student</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Game</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Score</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Date</th>
                </tr>
              </thead>
              <tbody>
                {trainingScores.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-gray-500">
                      No training scores found.
                    </td>
                  </tr>
                ) : (
                  trainingScores.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{entry.full_name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          {GAME_TYPE_LABELS[entry.game_type] || entry.game_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-900">{entry.score}</td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">{formatDate(entry.played_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Load More */}
      {hasMore && currentData.length > 0 && (
        <div className="flex justify-center">
          <button
            onClick={() => tab === 'exercises' ? fetchActivities(false) : tab === 'pvp' ? fetchPvpMatches(false) : tab === 'purchases' ? fetchPurchases(false) : tab === 'inventory' ? fetchInventory(false) : tab === 'wildarea' ? fetchWildEncounters(false) : fetchTrainingScores(false)}
            disabled={loadingMore}
            className="px-6 py-2 bg-white border border-gray-300 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  )
}

export default RecentActivities
