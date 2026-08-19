import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { assetUrl } from '../../hooks/useBranding'
import { ArrowLeft, Play, Square, Shuffle, Trophy, Sparkles, BookOpen, RotateCcw, Flag, Timer, Swords } from 'lucide-react'
import TimerModal from './TimerModal'
import { useAuth } from '../../hooks/useAuth'
import { useLiveBattle } from '../../hooks/useLiveBattle'
import TeamPanel from './TeamPanel'
import PowerUpEffect from './PowerUpEffect'
import BattleEventLog from './BattleEventLog'
import ExercisePickerModal from './ExercisePickerModal'
import QuestionModal from './QuestionModal'
import DuckRaceTimer from './DuckRaceTimer'

const LiveBattlePage = () => {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { user, profile, isTeacher, isAdmin } = useAuth()
  const {
    session,
    participants,
    events,
    loading,
    error,
    activePowerups,
    createSession,
    updateTeam,
    shuffleTeams,
    updateTeamName,
    addTeamPoints,
    activatePowerup,
    startGame,
    endGame,
    updateXpRewards,
    getTeamScore,
    resetScores,
    isFrozen,
    hasShield,
    hasDouble,
    pullTeamsFromWar,
  } = useLiveBattle()

  const [ending, setEnding] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [showExercisePicker, setShowExercisePicker] = useState(false)
  const [activeExercise, setActiveExercise] = useState(null)
  const [showPetRace, setShowPetRace] = useState(false)
  const [showTimer, setShowTimer] = useState(false)
  const [timerActive, setTimerActive] = useState(false)
  const [timerRemaining, setTimerRemaining] = useState(0)

  useEffect(() => {
    if (!user || !courseId || !profile) return
    if (!isTeacher() && !isAdmin()) {
      navigate('/teacher')
      return
    }
    createSession(courseId, user.id)
  }, [user, courseId, profile])

  const handleStart = async () => {
    await startGame()
  }

  const handleEnd = async () => {
    if (!confirmEnd) {
      setConfirmEnd(true)
      return
    }
    setEnding(true)
    await endGame()
    setEnding(false)
    setConfirmEnd(false)
  }

  const goBack = () => navigate(`/study/course/${courseId}`)

  const teamAParticipants = participants.filter(p => p.team === 'a')
  const teamBParticipants = participants.filter(p => p.team === 'b')
  const teamAScore = getTeamScore('a')
  const teamBScore = getTeamScore('b')

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading battle arena...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <p className="text-xl text-red-500 mb-2">Error</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button onClick={goBack} className="mt-4 px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition">Go back</button>
        </div>
      </div>
    )
  }

  // ===== FINISHED STATE =====
  if (session?.status === 'finished') {
    const winnerTeam = session.winner_team
    const winTeamName = winnerTeam === 'a' ? session.team_a_name : winnerTeam === 'b' ? session.team_b_name : 'Draw'

    return (
      <div className="min-h-screen bg-cover bg-center bg-no-repeat p-4" style={{ backgroundImage: `url(${assetUrl('/pet-game/petbattle1.jpg')})` }}>
        <div className="max-w-4xl mx-auto">
          {/* Victory header */}
          <div className="text-center py-8">
            <div className="text-6xl mb-4">
              {winnerTeam === 'draw' ? '🤝' : '🏆'}
            </div>
            <h1 className="text-4xl font-black text-gray-800 mb-2">
              {winnerTeam === 'draw' ? "It's a Draw!" : `${winTeamName} Wins!`}
            </h1>
            <div className="flex justify-center gap-8 mt-4">
              <div className="text-center">
                <div className="text-red-500 font-bold text-sm">{session.team_a_name}</div>
                <div className="text-3xl font-black text-gray-800">{teamAScore}</div>
              </div>
              <div className="text-gray-400 text-2xl font-bold self-end">vs</div>
              <div className="text-center">
                <div className="text-blue-500 font-bold text-sm">{session.team_b_name}</div>
                <div className="text-3xl font-black text-gray-800">{teamBScore}</div>
              </div>
            </div>
          </div>

          {/* XP Results */}
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-lg border border-indigo-100">
            <h2 className="text-lg font-bold text-indigo-600 mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> XP Awarded
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {participants.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-indigo-50 rounded-lg p-2">
                  <div className="w-8 h-8 flex-shrink-0">
                    {p.pet_image ? (
                      <img src={p.pet_image} alt="" className="w-8 h-8 object-contain" />
                    ) : (
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm">🥚</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 font-semibold truncate">{p.student_name}</div>
                  </div>
                  <div className="text-indigo-600 font-bold text-sm">+{p.xp_awarded} XP</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={goBack}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors"
            >
              Back to Course
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isSetup = session?.status === 'setup'
  const isActive = session?.status === 'active'

  return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat px-2 py-3" style={{ backgroundImage: `url(${assetUrl('/pet-game/petbattle1.jpg')})` }}>
      <PowerUpEffect events={events} />

      <div className="w-full px-2">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={goBack}
            className="flex items-center gap-1 px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-bold transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-2">
            {isSetup && (
              <>
                <button
                  onClick={async () => {
                    const ok = await pullTeamsFromWar(courseId)
                    if (!ok) alert('No active Class War found for this course.')
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-medium transition-colors"
                >
                  <Swords className="w-3 h-3" />
                  War Teams
                </button>
                <button
                  onClick={shuffleTeams}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm transition-colors"
                >
                  <Shuffle className="w-3 h-3" />
                  Shuffle
                </button>
                <button
                  onClick={handleStart}
                  className="flex items-center gap-1 px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition-colors"
                >
                  <Play className="w-3 h-3" />
                  Start Battle
                </button>
              </>
            )}
            {isActive && (
              <>
                <button
                  onClick={() => setShowTimer(true)}
                  className={`flex items-center gap-1 px-4 py-1.5 text-white rounded-lg text-sm font-bold transition-colors ${timerActive ? 'bg-teal-500 hover:bg-teal-400 animate-pulse' : 'bg-teal-600 hover:bg-teal-500'}`}
                >
                  <Timer className="w-3 h-3" />
                  {timerActive
                    ? `${String(Math.floor(timerRemaining / 60)).padStart(2, '0')}:${String(timerRemaining % 60).padStart(2, '0')}`
                    : 'Timer'}
                </button>
                <button
                  onClick={() => setShowPetRace(true)}
                  className="flex items-center gap-1 px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold transition-colors"
                >
                  <Flag className="w-3 h-3" />
                  Pet Race
                </button>
                <button
                  onClick={() => setShowExercisePicker(true)}
                  className="flex items-center gap-1 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-colors"
                >
                  <BookOpen className="w-3 h-3" />
                  Exercise
                </button>
                <button
                  onClick={resetScores}
                  className="flex items-center gap-1 px-4 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm font-bold transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
                <button
                  onClick={handleEnd}
                  className={`flex items-center gap-1 px-4 py-1.5 ${confirmEnd ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-600 hover:bg-gray-500'} text-white rounded-lg text-sm font-bold transition-colors`}
                  disabled={ending}
                >
                  <Square className="w-3 h-3" />
                  {ending ? 'Ending...' : confirmEnd ? 'Confirm End?' : 'End Battle'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* XP Reward Settings (setup phase) */}
        {isSetup && (
          <div className="bg-white rounded-xl p-3 mb-4 flex items-center gap-4 justify-center shadow-sm border border-gray-200">
            <span className="text-gray-500 text-sm">XP Rewards:</span>
            <label className="flex items-center gap-1 text-sm text-gray-700">
              Winner:
              <input
                type="number"
                value={session?.xp_winner || 30}
                onChange={e => updateXpRewards(Math.min(parseInt(e.target.value) || 0, 100), session?.xp_loser || 10)}
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
                value={session?.xp_loser || 10}
                onChange={e => updateXpRewards(session?.xp_winner || 30, Math.min(parseInt(e.target.value) || 0, 100))}
                min={0}
                max={100}
                className="w-16 bg-gray-100 text-gray-800 text-center rounded px-2 py-0.5 border border-gray-200"
              />
              XP
            </label>
          </div>
        )}

        {/* Score Display (active phase - big centered) */}
        {isActive && (
          <div className="flex items-center justify-center gap-6 mb-4">
            <div className="text-center">
              <div className="text-red-500 text-sm font-bold">{session?.team_a_name}</div>
              <div className="text-5xl font-black text-gray-100">{teamAScore}</div>
            </div>
            <div className="text-gray-400 text-3xl font-black">VS</div>
            <div className="text-center">
              <div className="text-blue-500 text-sm font-bold">{session?.team_b_name}</div>
              <div className="text-5xl font-black text-gray-100">{teamBScore}</div>
            </div>
          </div>
        )}

        {/* Two team panels */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <TeamPanel
            team="a"
            teamName={session?.team_a_name || 'Team Alpha'}
            teamScore={teamAScore}
            participants={teamAParticipants}
            isFrozen={isFrozen('a')}
            hasShield={hasShield('a')}
            hasDouble={hasDouble('a')}
            isActive={isActive}
            isSetup={isSetup}

            onUpdateTeam={updateTeam}
            onTeamNameChange={updateTeamName}
            onAddTeamPoints={addTeamPoints}
            onActivatePowerup={activatePowerup}
            teamColor="red"
          />
          <TeamPanel
            team="b"
            teamName={session?.team_b_name || 'Team Beta'}
            teamScore={teamBScore}
            participants={teamBParticipants}
            isFrozen={isFrozen('b')}
            hasShield={hasShield('b')}
            hasDouble={hasDouble('b')}
            isActive={isActive}
            isSetup={isSetup}

            onUpdateTeam={updateTeam}
            onTeamNameChange={updateTeamName}
            onAddTeamPoints={addTeamPoints}
            onActivatePowerup={activatePowerup}
            teamColor="blue"
          />
        </div>

        {/* Event Log (active phase) */}
        {isActive && (
          <BattleEventLog
            events={events}
            teamAName={session?.team_a_name || 'Team Alpha'}
            teamBName={session?.team_b_name || 'Team Beta'}
          />
        )}
      </div>

      {/* Exercise modals */}
      {showExercisePicker && (
        <ExercisePickerModal
          onSelect={(ex) => {
            setActiveExercise(ex)
            setShowExercisePicker(false)
          }}
          onClose={() => setShowExercisePicker(false)}
        />
      )}
      {activeExercise && (
        <QuestionModal
          exercise={activeExercise}
          onClose={() => setActiveExercise(null)}
        />
      )}
      {showPetRace && (
        <DuckRaceTimer
          participants={participants}
          onClose={() => setShowPetRace(false)}
        />
      )}
      <TimerModal
        visible={showTimer}
        onHide={() => setShowTimer(false)}
        onActiveChange={setTimerActive}
        onRemainingChange={setTimerRemaining}
      />
    </div>
  )
}

export default LiveBattlePage
