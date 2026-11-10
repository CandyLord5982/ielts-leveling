import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Swords } from 'lucide-react'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'

// Shown to students on a course page: a floating "Join" bar that appears while the
// teacher has an Online Battle room open for that course.

const CHECK_MS = 10000

const OnlineBattleJoinBanner = ({ courseId }) => {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const isStudent = !!user?.id && profile?.role === 'user'
  const [room, setRoom] = useState(null) // { room_id, status, joined }
  const unavailableRef = useRef(false)

  useEffect(() => {
    if (!isStudent || !courseId) return
    let stopped = false

    const check = async () => {
      if (unavailableRef.current || document.visibilityState !== 'visible') return
      const { data, error } = await supabase.rpc('online_battle_find_room', { p_course_id: courseId })
      if (stopped) return
      if (error) {
        // Database function not installed: stop asking
        if (error.code === 'PGRST202' || error.code === '42883') unavailableRef.current = true
        return
      }
      setRoom(data || null)
    }

    check()
    const timer = setInterval(check, CHECK_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [isStudent, courseId])

  if (!isStudent || !room?.room_id) return null

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4">
      <div className="flex items-center gap-3 bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 border-2 border-rose-500">
        <div className="w-10 h-10 rounded-full bg-rose-600 flex items-center justify-center flex-shrink-0 animate-pulse">
          <Swords className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">Online Battle</div>
          <div className="text-xs text-gray-300">
            {room.joined
              ? 'You are in this battle.'
              : room.status === 'active' ? 'The battle has started. Jump in!' : 'Your teacher opened a room.'}
          </div>
        </div>
        <button
          onClick={() => navigate(`/online-battle/${room.room_id}`)}
          className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 font-bold text-sm transition-colors flex-shrink-0"
        >
          {room.joined ? 'Return' : 'Join'}
        </button>
      </div>
    </div>
  )
}

export default OnlineBattleJoinBanner
