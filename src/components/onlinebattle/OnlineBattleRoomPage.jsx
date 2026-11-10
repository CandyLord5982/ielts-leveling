import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ListChecks } from 'lucide-react'
import { supabase } from '../../supabase/client'
import { assetUrl } from '../../hooks/useBranding'
import { useAuth } from '../../hooks/useAuth'
import OnlineBattleBoard from './OnlineBattleBoard'
import OnlineQuestionView from './OnlineQuestionView'
import OnlineBattleReview from './OnlineBattleReview'
import ClaimPointButton from './ClaimPointButton'
import PowerUpButton from './PowerUpButton'
import OnlineBattleActivity from './OnlineBattleActivity'
import OnlineBattleChat from './OnlineBattleChat'
import { onlineBattleChannelName, createParticipantEnricher, teamName } from './onlineBattleShared'

// Student's view of an Online Battle room. Opening this page joins the room. The screen
// then follows the teacher: the dashboard with both teams by default, a live question
// when the teacher shows one, and the result once the battle ends.

const POLL_MS = 4000 // backup in case a realtime ping is missed

const JOIN_ERRORS = {
  not_found: 'This battle room does not exist.',
  finished: 'This battle has already ended.',
  not_enrolled: 'This battle is for students of another course.',
}

const Centered = ({ children }) => (
  <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
    <div className="text-center">{children}</div>
  </div>
)

const OnlineBattleRoomPage = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const userId = user?.id

  const [joined, setJoined] = useState(false)
  const [problem, setProblem] = useState('')
  const [state, setState] = useState(null) // from online_battle_state()
  const [participants, setParticipants] = useState([])
  const [dismissedQuestionId, setDismissedQuestionId] = useState(null)
  const [showReview, setShowReview] = useState(false)
  const [chatTick, setChatTick] = useState(0)
  // Questions this device has been shown in this room, by id, for the "Past questions" list.
  // Kept in the browser tab (sessionStorage) so a page refresh doesn't lose them.
  const [seenQuestions, setSeenQuestions] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`online-battle-seen-${roomId}`) || '{}') || {}
    } catch {
      return {}
    }
  })

  const enrich = useMemo(() => createParticipantEnricher(), [])
  const serverOffsetRef = useRef(0) // server clock minus this device's clock
  const channelRef = useRef(null)
  const lastCourseIdRef = useRef(null)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('online_battle_state', { p_room_id: roomId })
    if (error || !data) return
    serverOffsetRef.current = new Date(data.server_now).getTime() - Date.now()
    if (data.room?.course_id) lastCourseIdRef.current = data.room.course_id
    setState(data)
    if (data.room && data.question) {
      // Remember it without the student's own pick; a later (revealed) copy replaces the open one
      const shown = { ...data.question }
      delete shown.my_answer
      delete shown.my_correct
      setSeenQuestions(prev => {
        const next = { ...prev, [shown.id]: shown }
        try { sessionStorage.setItem(`online-battle-seen-${roomId}`, JSON.stringify(next)) } catch { /* list just won't survive a refresh */ }
        return next
      })
    }
    if (data.room) setParticipants(await enrich(data.participants || []))
  }, [roomId, enrich])

  // Join (safe to repeat after a refresh)
  useEffect(() => {
    if (!userId || !roomId) return
    let cancelled = false
    setJoined(false)
    setProblem('')
    supabase.rpc('online_battle_join', { p_room_id: roomId }).then(async ({ data, error }) => {
      if (cancelled) return
      if (error) {
        setProblem('Could not join the battle. Go back and try again.')
        return
      }
      if (!data?.joined) {
        setProblem(JOIN_ERRORS[data?.reason] || 'You cannot join this battle.')
        return
      }
      await refresh()
      if (!cancelled) setJoined(true)
    })
    return () => { cancelled = true }
  }, [userId, roomId, refresh])

  const roomStatus = state?.room?.status
  const stillInRoom = joined && !!state?.room

  // Realtime pings from the teacher
  useEffect(() => {
    if (!joined) return
    const channel = supabase
      .channel(onlineBattleChannelName(roomId))
      .on('broadcast', { event: 'update' }, () => { refresh() })
      // Another student tapped their bonus point: the score changed
      .on('broadcast', { event: 'claimed' }, () => { refresh() })
      // A chat message was sent (or deleted)
      .on('broadcast', { event: 'chat' }, () => { setChatTick(t => t + 1) })
      .subscribe((subscription) => {
        // Let the teacher's page show this student right away
        if (subscription === 'SUBSCRIBED') channel.send({ type: 'broadcast', event: 'joined', payload: {} })
      })
    channelRef.current = channel
    return () => {
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [joined, roomId, refresh])

  // Polling backup; stops once the battle is over or this student was removed
  useEffect(() => {
    if (!stillInRoom || roomStatus === 'finished') return
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [stillInRoom, roomStatus, refresh])

  const goBack = () => {
    const courseId = state?.room?.course_id || lastCourseIdRef.current
    navigate(courseId ? `/study/course/${courseId}` : '/study')
  }

  const backButton = (
    <button onClick={goBack} className="mt-4 px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition">
      Go back
    </button>
  )

  if (problem) {
    return <Centered><p className="text-lg text-gray-700">{problem}</p>{backButton}</Centered>
  }

  if (!joined || !state) {
    return (
      <Centered>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
        <p className="mt-4 text-gray-500">Joining the battle...</p>
      </Centered>
    )
  }

  if (!state.room) {
    return <Centered><p className="text-lg text-gray-700">You are no longer in this battle room.</p>{backButton}</Centered>
  }

  const { room, me, question } = state
  const isLobby = room.status === 'lobby'
  const isFinished = room.status === 'finished'
  const winner = room.winner_team
  const showQuestion = !isFinished && question && question.id !== dismissedQuestionId
  const isActive = room.status === 'active'
  const renderClaimButton = (inHeader) => (isActive ? (
    <ClaimPointButton
      inHeader={inHeader}
      roomId={room.id}
      claimable={me.claimable_points || 0}
      powerupOffers={me.powerup_offers || 0}
      team={me.team}
      teamLabel={teamName(room, me.team)}
      onClaimed={async () => {
        channelRef.current?.send({ type: 'broadcast', event: 'claimed', payload: {} })
        await refresh()
      }}
    />
  ) : null)
  const renderPowerUps = () => (isActive ? (
    <PowerUpButton
      powerups={me.powerups}
      room={room}
      myTeam={me.team}
      teamLabel={teamName(room, me.team)}
      otherTeamLabel={teamName(room, me.team === 'a' ? 'b' : 'a')}
      onUsed={async () => {
        channelRef.current?.send({ type: 'broadcast', event: 'claimed', payload: {} })
        await refresh()
      }}
    />
  ) : null)
  const myTeamLabel = (
    <span className={`px-3 py-1.5 rounded-lg text-sm font-bold text-white ${me.team === 'a' ? 'bg-red-500' : 'bg-blue-500'}`}>
      You: {teamName(room, me.team)}
    </span>
  )

  return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat px-2 py-3" style={{ backgroundImage: `url(${assetUrl('/pet-game/petbattle1.jpg')})` }}>
      <div className="w-full px-2">
        <div className="flex items-center justify-between gap-2 mb-4">
          <button
            onClick={goBack}
            className="flex items-center gap-1 px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-bold transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Leave</span>
          </button>
          <div className="flex items-center gap-2">
            {!isLobby && (
              <button
                onClick={() => setShowReview(true)}
                className="flex items-center gap-1 px-4 py-1.5 bg-white/90 hover:bg-white text-gray-800 rounded-lg text-sm font-bold transition-colors"
              >
                <ListChecks className="w-3 h-3" />
                <span>Past questions</span>
              </button>
            )}
            {myTeamLabel}
          </div>
        </div>

        {isLobby && (
          <div className="bg-white rounded-xl p-4 mb-4 text-center shadow-sm border border-gray-200">
            <div className="text-lg font-bold text-gray-800">You&apos;re in! Waiting for your teacher to start the battle...</div>
            <div className="text-sm text-gray-500 mt-1">
              {participants.length} joined · your teacher may still move people between teams
            </div>
          </div>
        )}

        {isFinished && (
          <div className="text-center py-4 mb-2">
            <div className="text-5xl mb-2">{winner === 'draw' ? '🤝' : winner === me.team ? '🏆' : '💪'}</div>
            <h1 className="text-4xl font-black text-white drop-shadow">
              {winner === 'draw' ? "It's a Draw!" : `${teamName(room, winner)} Wins!`}
            </h1>
            <div className="inline-block mt-3 px-5 py-2 rounded-full bg-white text-indigo-600 font-black text-lg shadow">
              +{me.xp_awarded || 0} XP
            </div>
          </div>
        )}

        <div className="mb-4 empty:hidden">{renderPowerUps()}</div>

        <OnlineBattleBoard
          room={room}
          participants={participants}
          myUserId={userId}
          myTeam={me.team}
          myTeamControls={renderClaimButton(true)}
        />

        {!isLobby && (
          <OnlineBattleActivity
            events={Array.isArray(state.events) ? state.events : []}
            participants={participants}
            room={room}
            myUserId={userId}
          />
        )}
      </div>

      {/* A live question always takes over the screen; the review comes back after it */}
      {showReview && !showQuestion && (
        <OnlineBattleReview
          questions={Object.values(seenQuestions).sort((x, y) => new Date(x.opened_at) - new Date(y.opened_at))}
          onClose={() => setShowReview(false)}
        />
      )}
      {showQuestion && (
        <OnlineQuestionView
          question={question}
          room={room}
          myTeam={me.team}
          serverOffsetMs={serverOffsetRef.current}
          onAnswered={() => channelRef.current?.send({ type: 'broadcast', event: 'answered', payload: {} })}
          onRefresh={refresh}
          onClose={() => setDismissedQuestionId(question.id)}
          claimButton={renderClaimButton(false)}
          powerUps={renderPowerUps()}
        />
      )}
      <OnlineBattleChat
        roomId={room.id}
        myUserId={userId}
        participants={participants}
        closed={isFinished}
        questionOpen={question?.status === 'open'}
        pingTick={chatTick}
        onSent={() => channelRef.current?.send({ type: 'broadcast', event: 'chat', payload: {} })}
      />
    </div>
  )
}

export default OnlineBattleRoomPage
