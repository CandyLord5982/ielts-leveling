import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Square, Shuffle, Radio, Download, Users, Presentation, X } from 'lucide-react'
import { supabase } from '../../supabase/client'
import { assetUrl } from '../../hooks/useBranding'
import { useAuth } from '../../hooks/useAuth'
import ExercisePickerModal from '../livebattle/ExercisePickerModal'
import OnlineBattleBoard from './OnlineBattleBoard'
import OnlineQuestionModal from './OnlineQuestionModal'
import OnlineBattleActivity from './OnlineBattleActivity'
import OnlineBattleChat from './OnlineBattleChat'
import OnlineBattleSlides from './OnlineBattleSlides'
import SlidePickerModal from './SlidePickerModal'
import {
  onlineBattleChannelName, createParticipantEnricher, downloadAnswersCsv, teamName,
} from './onlineBattleShared'

// Teacher's control page for an Online Battle room.
//   lobby    - students join from the course page; the teacher arranges the teams
//   active   - scoreboard, manual points and live questions
//   finished - winner and XP
// Students follow along in OnlineBattleRoomPage.

const clampXp = (value) => Math.max(0, Math.min(100, parseInt(value, 10) || 0))

const OnlineBattleTeacherPage = () => {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const userId = user?.id

  const [room, setRoom] = useState(null)
  const roomRef = useRef(null)
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [liveExercise, setLiveExercise] = useState(null)
  const [questionHidden, setQuestionHidden] = useState(false) // question window tucked away
  const [questionStatus, setQuestionStatus] = useState(null) // { index, total, isOpen }
  const [answeredTick, setAnsweredTick] = useState(0)
  const [chatTick, setChatTick] = useState(0)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [ending, setEnding] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showSlidePicker, setShowSlidePicker] = useState(false)

  const enrich = useMemo(() => createParticipantEnricher(), [])
  const channelRef = useRef(null)
  // Slide drawing / laser go to the students over the room channel ('ink' event)
  const sendInk = useCallback((payload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'ink', payload })
  }, [])
  const initKeyRef = useRef(null)

  const roomId = room?.id || null
  const status = room?.status

  const ping = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'update', payload: {} })
  }, [])

  // Apply a change to the room locally right away, then save it and tell the students
  const saveRoom = useCallback(async (patch) => {
    const current = roomRef.current
    if (!current) return
    const next = { ...current, ...patch }
    roomRef.current = next
    setRoom(next)
    const { error: err } = await supabase.from('online_battle_rooms').update(patch).eq('id', current.id)
    if (err) throw err
    ping()
  }, [ping])

  const applyScores = useCallback((scores) => {
    const current = roomRef.current
    if (!current || !scores) return
    if (current.team_a_score === scores.team_a_score && current.team_b_score === scores.team_b_score) return
    const next = { ...current, team_a_score: scores.team_a_score, team_b_score: scores.team_b_score }
    roomRef.current = next
    setRoom(next)
  }, [])

  const [events, setEvents] = useState([])
  const loadEvents = useCallback(async () => {
    const current = roomRef.current
    if (!current) return
    const { data, error: err } = await supabase
      .from('online_battle_events')
      .select('id, created_at, kind, team, user_id, points, detail')
      .eq('room_id', current.id)
      .order('created_at', { ascending: false })
      .order('id')
      .limit(20)
    if (!err) setEvents(data || [])
  }, [])

  // Pick up bonus points students tapped for
  const refreshScores = useCallback(async () => {
    const current = roomRef.current
    if (!current) return
    const { data } = await supabase
      .from('online_battle_rooms')
      .select('team_a_score, team_b_score')
      .eq('id', current.id)
      .maybeSingle()
    applyScores(data)
    loadEvents()
  }, [applyScores, loadEvents])

  const saveRoomSafe = useCallback((patch) => {
    saveRoom(patch).catch(e => setError(`Could not save: ${e.message}`))
  }, [saveRoom])

  // Open the room for this course: resume one that is still running, otherwise create it
  useEffect(() => {
    if (!userId || !courseId) return
    const key = `${userId}:${courseId}`
    if (initKeyRef.current === key) return // also guards React StrictMode's double effect
    initKeyRef.current = key

    const init = async () => {
      setLoading(true)
      setError('')
      try {
        const { data: existing, error: findErr } = await supabase
          .from('online_battle_rooms')
          .select('*')
          .eq('course_id', courseId)
          .in('status', ['lobby', 'active'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (findErr) throw findErr

        let current
        if (existing) {
          // A question left on screen by a refresh or crash: close it and go back to the scoreboard.
          // Updating the room also marks it as in use again, so students are offered it.
          if (existing.current_question_id) {
            await supabase.from('online_battle_questions')
              .update({ status: 'cancelled' }).eq('room_id', existing.id).eq('status', 'open')
          }
          const { data, error: touchErr } = await supabase
            .from('online_battle_rooms')
            .update({ teacher_id: userId, current_question_id: null })
            .eq('id', existing.id)
            .select()
            .single()
          if (touchErr) throw touchErr
          current = data
        } else {
          const { data, error: createErr } = await supabase
            .from('online_battle_rooms')
            .insert({ course_id: courseId, teacher_id: userId })
            .select()
            .single()
          if (createErr) throw createErr
          current = data
        }
        roomRef.current = current
        setRoom(current)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [userId, courseId])

  const loadParticipants = useCallback(async () => {
    if (!roomId) return
    const { data, error: err } = await supabase
      .from('online_battle_participants')
      .select('*')
      .eq('room_id', roomId)
      .order('joined_at')
      .order('id')
    if (err) return
    setParticipants(await enrich(data || []))
  }, [roomId, enrich])

  // Realtime pings from students, with polling as a backup
  useEffect(() => {
    if (!roomId) return
    loadParticipants()
    loadEvents()
    const channel = supabase
      .channel(onlineBattleChannelName(roomId))
      .on('broadcast', { event: 'joined' }, () => { loadParticipants() })
      .on('broadcast', { event: 'answered' }, () => { setAnsweredTick(t => t + 1) })
      .on('broadcast', { event: 'claimed' }, () => { refreshScores() })
      .on('broadcast', { event: 'chat' }, () => { setChatTick(t => t + 1) })
      .subscribe()
    channelRef.current = channel
    return () => {
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [roomId, loadParticipants, loadEvents, refreshScores])

  // Backup polling (realtime pings do the real work). Slow, and paused in a background tab,
  // because every request is logged by Supabase.
  useEffect(() => {
    if (!roomId || status === 'finished') return
    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      loadParticipants()
      if (status === 'active') refreshScores()
    }, 10000)
    return () => clearInterval(poll)
  }, [roomId, status, loadParticipants, refreshScores])

  const goBack = () => navigate(`/study/course/${courseId}`)

  // ----- Teams -----
  const moveParticipant = async (p) => {
    const team = p.team === 'a' ? 'b' : 'a'
    setParticipants(prev => prev.map(x => (x.id === p.id ? { ...x, team } : x)))
    const { error: err } = await supabase.from('online_battle_participants').update({ team }).eq('id', p.id)
    if (err) setError(`Could not move ${p.student_name}: ${err.message}`)
    ping()
  }

  const removeParticipant = async (p) => {
    if (!window.confirm(`Remove ${p.student_name} from the room?`)) return
    setParticipants(prev => prev.filter(x => x.id !== p.id))
    const { error: err } = await supabase.from('online_battle_participants').delete().eq('id', p.id)
    if (err) setError(`Could not remove ${p.student_name}: ${err.message}`)
    ping()
  }

  const shuffleTeams = async () => {
    const shuffled = [...participants]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const teamOf = {}
    shuffled.forEach((p, idx) => { teamOf[p.id] = idx % 2 === 0 ? 'a' : 'b' })
    const changed = participants.filter(p => p.team !== teamOf[p.id])
    setParticipants(prev => prev.map(p => (teamOf[p.id] ? { ...p, team: teamOf[p.id] } : p)))
    const results = await Promise.all(changed.map(p =>
      supabase.from('online_battle_participants').update({ team: teamOf[p.id] }).eq('id', p.id)))
    if (results.some(r => r.error)) setError('Some students could not be moved. Try Shuffle again.')
    ping()
  }

  // ----- Scores -----
  // Students can add bonus points too, so the score lives in the database: every change
  // is a "+n" there, and this page only displays what comes back.
  const awardPoints = useCallback(async ({ a, b, questionId = null }) => {
    const { data, error: err } = await supabase.rpc('online_battle_add_points', {
      p_room_id: roomRef.current.id,
      p_team_a: a,
      p_team_b: b,
      p_question_id: questionId,
    })
    if (err) throw err
    applyScores(data)
    loadEvents()
    ping()
  }, [applyScores, loadEvents, ping])

  const addPoints = (team, amount) => {
    awardPoints({ a: team === 'a' ? amount : 0, b: team === 'b' ? amount : 0 })
      .catch(e => setError(`Could not change the score: ${e.message}`))
  }

  // ----- Start / end -----
  const startBattle = () => saveRoomSafe({ status: 'active', started_at: new Date().toISOString() })

  const endBattle = async () => {
    if (!confirmEnd) {
      setConfirmEnd(true)
      return
    }
    setEnding(true)
    setError('')
    try {
      const { data, error: err } = await supabase.rpc('online_battle_finish', { p_room_id: roomId })
      if (err) throw err
      roomRef.current = data
      setRoom(data)
      setLiveExercise(null)
      await loadParticipants() // XP awarded
      ping()
    } catch (e) {
      setError(`Could not end the battle: ${e.message}`)
    } finally {
      setEnding(false)
      setConfirmEnd(false)
    }
  }

  const exportCsv = async () => {
    setExporting(true)
    setError('')
    setNotice('')
    try {
      const count = await downloadAnswersCsv(room, participants)
      if (count === 0) setNotice('No answers have been saved in this battle yet.')
    } catch (e) {
      setError(`Could not export answers: ${e.message}`)
    } finally {
      setExporting(false)
    }
  }

  // ----- Slides -----
  // Picked (or freshly uploaded) in SlidePickerModal. Saving slide_url switches every
  // student's screen to it.
  const showSlides = (url) => {
    setShowSlidePicker(false)
    saveRoomSafe({ slide_url: url, slide_page: 1, slide_paused: false })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-gray-500">Opening the room...</p>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <p className="text-xl text-red-500 mb-2">Could not open the room</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button onClick={goBack} className="mt-4 px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition">Go back</button>
        </div>
      </div>
    )
  }

  const isLobby = status === 'lobby'
  const isActive = status === 'active'
  const isFinished = status === 'finished'
  const winner = room.winner_team

  return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat px-2 py-3" style={{ backgroundImage: `url(${assetUrl('/pet-game/petbattle1.jpg')})` }}>
      <div className="w-full px-2">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <button
            onClick={goBack}
            className="flex items-center gap-1 px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-bold transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 px-3 py-1.5 bg-white/90 text-gray-700 rounded-lg text-sm font-bold">
              <Users className="w-3 h-3" />
              {participants.length} joined
            </span>
            {isLobby && (
              <>
                <button
                  onClick={shuffleTeams}
                  disabled={participants.length < 2}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 rounded-lg text-sm transition-colors"
                >
                  <Shuffle className="w-3 h-3" />
                  Shuffle
                </button>
                <button
                  onClick={startBattle}
                  disabled={participants.length === 0}
                  className="flex items-center gap-1 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors"
                >
                  <Play className="w-3 h-3" />
                  Start Battle
                </button>
              </>
            )}
            {!isFinished && room.slide_url && room.slide_paused && (
              <span className="flex items-center rounded-lg overflow-hidden">
                <button
                  onClick={() => saveRoomSafe({ slide_paused: false })}
                  className="flex items-center gap-1 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold transition-colors"
                  title="Show the paused slides again, on the same page"
                >
                  <Play className="w-3 h-3" />
                  Resume Slides (p. {room.slide_page || 1})
                </button>
                <button
                  onClick={() => saveRoomSafe({ slide_url: null, slide_page: 1, slide_paused: false })}
                  className="px-2 py-1.5 bg-amber-600 hover:bg-red-600 text-white transition-colors"
                  title="Stop showing these slides"
                  aria-label="Stop showing slides"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {!isFinished && (
              <button
                onClick={() => setShowSlidePicker(true)}
                className="flex items-center gap-1 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-sm font-bold transition-colors"
                title="Pick or upload a PDF and show it on every student's screen"
              >
                <Presentation className="w-3 h-3" />
                Show Slides
              </button>
            )}
            {isActive && !liveExercise && (
              <button
                onClick={() => setShowPicker(true)}
                className="flex items-center gap-1 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-bold transition-colors"
              >
                <Radio className="w-3 h-3" />
                Live Question
              </button>
            )}
            {isActive && liveExercise && questionHidden && (
              <button
                onClick={() => setQuestionHidden(false)}
                className={`flex items-center gap-1 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-bold transition-colors ${questionStatus?.isOpen ? 'animate-pulse' : ''}`}
                title={`Back to ${liveExercise.title}`}
              >
                <Radio className="w-3 h-3" />
                {questionStatus?.isOpen ? 'Question live · ' : 'Resume Questions · '}
                {questionStatus ? `${questionStatus.index + 1}/${questionStatus.total}` : ''}
              </button>
            )}
            {(isActive || isFinished) && (
              <button
                onClick={exportCsv}
                disabled={exporting}
                className="flex items-center gap-1 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors"
                title="Download every answer saved in this battle"
              >
                <Download className="w-3 h-3" />
                {exporting ? 'Exporting...' : 'Answers (CSV)'}
              </button>
            )}
            {isActive && (
              <button
                onClick={endBattle}
                disabled={ending}
                className={`flex items-center gap-1 px-4 py-1.5 ${confirmEnd ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-600 hover:bg-gray-500'} text-white rounded-lg text-sm font-bold transition-colors`}
              >
                <Square className="w-3 h-3" />
                {ending ? 'Ending...' : confirmEnd ? 'Confirm End?' : 'End Battle'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}
        {notice && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p>
        )}

        {isLobby && (
          <div className="bg-white rounded-xl p-3 mb-4 flex items-center gap-4 justify-center flex-wrap shadow-sm border border-gray-200">
            <span className="text-sm font-semibold text-gray-700">
              Room is open. Students join from this course&apos;s page.
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500 text-sm">XP Rewards:</span>
            <label className="flex items-center gap-1 text-sm text-gray-700">
              Winner:
              <input
                type="number"
                value={room.xp_winner}
                onChange={e => saveRoomSafe({ xp_winner: clampXp(e.target.value) })}
                min={0}
                max={100}
                className="w-16 bg-gray-100 text-gray-800 text-center rounded px-2 py-0.5 border border-gray-200"
              />
              XP
            </label>
            <label className="flex items-center gap-1 text-sm text-gray-700">
              Loser:
              <input
                type="number"
                value={room.xp_loser}
                onChange={e => saveRoomSafe({ xp_loser: clampXp(e.target.value) })}
                min={0}
                max={100}
                className="w-16 bg-gray-100 text-gray-800 text-center rounded px-2 py-0.5 border border-gray-200"
              />
              XP
            </label>
          </div>
        )}

        {isFinished && (
          <div className="text-center py-4 mb-2">
            <div className="text-5xl mb-2">{winner === 'draw' ? '🤝' : '🏆'}</div>
            <h1 className="text-4xl font-black text-white drop-shadow">
              {winner === 'draw' ? "It's a Draw!" : `${teamName(room, winner)} Wins!`}
            </h1>
          </div>
        )}

        <OnlineBattleBoard
          room={room}
          participants={participants}
          teacher={isFinished ? undefined : {
            onMove: moveParticipant,
            onRemove: removeParticipant,
            onRename: (team, name) => saveRoomSafe({ [team === 'a' ? 'team_a_name' : 'team_b_name']: name }),
            onAddPoints: isActive ? addPoints : undefined,
          }}
        />

        {!isLobby && <OnlineBattleActivity events={events} participants={participants} room={room} />}
      </div>

      {showPicker && (
        <ExercisePickerModal
          onSelect={(ex) => {
            if (ex.exercise_type !== 'multiple_choice') {
              alert('Live questions work with Multiple Choice exercises only.')
              return
            }
            setLiveExercise(ex)
            setQuestionHidden(false)
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
      {liveExercise && isActive && (
        <OnlineQuestionModal
          exercise={liveExercise}
          room={room}
          participants={participants}
          answeredTick={answeredTick}
          saveRoom={saveRoom}
          awardPoints={awardPoints}
          onClose={() => { setLiveExercise(null); setQuestionHidden(false); setQuestionStatus(null) }}
          hidden={questionHidden}
          onHide={() => setQuestionHidden(true)}
          onStatus={setQuestionStatus}
        />
      )}
      {showSlidePicker && (
        <SlidePickerModal
          userId={userId}
          currentUrl={room.slide_url}
          onPick={showSlides}
          onClose={() => setShowSlidePicker(false)}
        />
      )}
      {/* The question window opens on top of the slides; the exercise picker needs them out of the way */}
      {room.slide_url && !room.slide_paused && !isFinished && !showPicker && (
        <OnlineBattleSlides
          url={room.slide_url}
          page={room.slide_page || 1}
          onPageChange={(p) => saveRoomSafe({ slide_page: p })}
          keyboard={!(liveExercise && !questionHidden)} // arrow keys don't flip slides behind the question window
          ink={{ roomId, sendInk }}
          header={isActive && (
            <button
              onClick={() => { if (liveExercise) setQuestionHidden(false); else setShowPicker(true) }}
              className={`ml-2 flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold ${questionStatus?.isOpen ? 'animate-pulse' : ''}`}
              title="Open the question window. Students keep seeing the slides until you press Go Live."
            >
              <Radio className="w-3 h-3" />
              {!liveExercise ? 'Live Question'
                : questionStatus?.isOpen ? `Question live · ${questionStatus.index + 1}/${questionStatus.total}`
                  : `Questions · ${(questionStatus?.index ?? 0) + 1}/${questionStatus?.total ?? ''}`}
            </button>
          )}
          onPause={() => saveRoomSafe({ slide_paused: true })}
          onClose={() => saveRoomSafe({ slide_url: null, slide_page: 1, slide_paused: false })}
        />
      )}
      <OnlineBattleChat
        roomId={roomId}
        myUserId={userId}
        isTeacher
        participants={participants}
        closed={isFinished}
        pingTick={chatTick}
        onSent={() => channelRef.current?.send({ type: 'broadcast', event: 'chat', payload: {} })}
      />
    </div>
  )
}

export default OnlineBattleTeacherPage
