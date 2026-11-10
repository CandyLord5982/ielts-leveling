import { useMemo, useState, useCallback } from 'react'
import { BookOpen, Eye, EyeOff, Check, X, SkipForward, Play, RotateCcw, Trophy, Sparkles } from 'lucide-react'
import BowlingLane from './BowlingLane'
import ExercisePickerModal from '../../ExercisePickerModal'
import { QuestionContent, QUESTION_TYPES_SUPPORTED } from '../../QuestionModal'

const TEAM_STYLE = {
  a: { ball: '#ef4444', text: 'text-red-400', chip: 'bg-red-500', ring: 'ring-red-400', soft: 'bg-red-500/15 border-red-400/40' },
  b: { ball: '#3b82f6', text: 'text-blue-400', chip: 'bg-blue-500', ring: 'ring-blue-400', soft: 'bg-blue-500/15 border-blue-400/40' },
}
const FRAME_OPTIONS = [3, 5, 10]

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const totalPins = (frames) => frames.reduce((sum, f) => sum + (f.pins || 0), 0)

const BowlingGame = ({ participants, teamNames, onAddPoints, onActivatePowerup }) => {
  const [phase, setPhase] = useState('setup') // setup | question | bowl | result | finished
  const [exercise, setExercise] = useState(null)
  const [showPicker, setShowPicker] = useState(false)
  const [framesPerTeam, setFramesPerTeam] = useState(5)
  const [strikeBonus, setStrikeBonus] = useState(true)

  const [turn, setTurn] = useState(0)
  const [frames, setFrames] = useState({ a: [], b: [] })
  const [queue, setQueue] = useState([])
  const [qPtr, setQPtr] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [rollKey, setRollKey] = useState(0)
  const [lastResult, setLastResult] = useState(null)

  const team = turn % 2 === 0 ? 'a' : 'b'
  const frameNo = Math.floor(turn / 2) + 1
  const style = TEAM_STYLE[team]

  const teamMembers = useMemo(() => ({
    a: participants.filter(p => p.team === 'a'),
    b: participants.filter(p => p.team === 'b'),
  }), [participants])

  const members = teamMembers[team]
  const bowler = members.length ? members[(frameNo - 1) % members.length] : null

  const questions = exercise?.content?.questions || []
  const currentQuestion = queue.length ? questions[queue[qPtr % queue.length]] : null

  const handlePickExercise = (ex) => {
    setShowPicker(false)
    if (!QUESTION_TYPES_SUPPORTED.includes(ex.exercise_type) || !ex.content?.questions?.length) {
      alert('That exercise type can\'t be shown in Bowling yet. Pick a multiple choice, fill in the blank, dropdown or flashcard exercise.')
      return
    }
    setExercise(ex)
  }

  const beginTurn = useCallback(() => {
    setShowAnswer(false)
    if (exercise) {
      setPhase('question')
    } else {
      setRollKey(k => k + 1)
      setPhase('bowl')
    }
  }, [exercise])

  const startGame = () => {
    setTurn(0)
    setFrames({ a: [], b: [] })
    setQueue(shuffle(questions.map((_, i) => i)))
    setQPtr(0)
    setLastResult(null)
    beginTurn()
  }

  const markCorrect = () => {
    setQPtr(p => p + 1)
    setRollKey(k => k + 1)
    setPhase('bowl')
  }

  const markWrong = () => {
    setQPtr(p => p + 1)
    setFrames(prev => ({ ...prev, [team]: [...prev[team], { pins: 0, missed: true }] }))
    setLastResult({ team, missed: true })
    setPhase('result')
  }

  const skipQuestion = () => {
    setQPtr(p => p + 1)
    setShowAnswer(false)
  }

  const handleSettled = useCallback((pins, lane) => {
    const strike = pins === 10
    setFrames(prev => ({ ...prev, [team]: [...prev[team], { pins, strike, lane }] }))
    if (pins > 0) onAddPoints(team, pins)
    const bonus = strike && strikeBonus
    if (bonus) setTimeout(() => onActivatePowerup('random', team), 600)
    setLastResult({ team, pins, strike, bonus, lane })
    setPhase('result')
  }, [team, strikeBonus, onAddPoints, onActivatePowerup])

  const nextTurn = () => {
    const next = turn + 1
    if (next >= framesPerTeam * 2) {
      setPhase('finished')
      return
    }
    setTurn(next)
    beginTurn()
  }

  // ===== SETUP =====
  if (phase === 'setup') {
    return (
      <div className="h-full overflow-y-auto flex items-start justify-center p-6">
        <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-6 space-y-6">
          <div className="text-center">
            <div className="text-6xl mb-2">🎳</div>
            <h2 className="text-3xl font-black text-gray-800">Bowling</h2>
            <p className="text-gray-500 mt-1">Answer right, then pick a spot from 1 to 5 on the lane and hope for luck. Every pin knocked down is a point for your team.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {['a', 'b'].map(t => (
              <div key={t} className={`rounded-2xl border p-3 text-center ${t === 'a' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                <div className={`font-black ${t === 'a' ? 'text-red-600' : 'text-blue-600'}`}>{teamNames[t]}</div>
                <div className="text-xs text-gray-500">{teamMembers[t].length} bowler{teamMembers[t].length !== 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="text-sm font-bold text-gray-700 mb-2">Questions</div>
            {exercise ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-indigo-200 bg-indigo-50">
                <BookOpen className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 truncate">{exercise.title}</div>
                  <div className="text-xs text-gray-500">{questions.length} questions</div>
                </div>
                <button onClick={() => setShowPicker(true)} className="px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 rounded-lg">Change</button>
                <button onClick={() => setExercise(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg" title="Remove"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <button
                onClick={() => setShowPicker(true)}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 text-gray-600 font-semibold transition-colors"
              >
                <BookOpen className="w-5 h-5" /> Pick an exercise
              </button>
            )}
            {!exercise && <p className="text-xs text-gray-400 mt-1.5">No exercise? Teams just take turns bowling (free play).</p>}
          </div>

          <div>
            <div className="text-sm font-bold text-gray-700 mb-2">Frames per team</div>
            <div className="flex gap-2">
              {FRAME_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setFramesPerTeam(n)}
                  className={`flex-1 py-2 rounded-xl font-bold transition-colors ${framesPerTeam === n ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer">
            <input type="checkbox" checked={strikeBonus} onChange={e => setStrikeBonus(e.target.checked)} className="w-5 h-5 accent-amber-500" />
            <div>
              <div className="font-semibold text-gray-800">Strike bonus: random power-up</div>
              <div className="text-xs text-gray-500">A strike also fires a random Live Battle power-up for that team</div>
            </div>
          </label>

          <button
            onClick={startGame}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-green-600 hover:bg-green-500 text-white text-xl font-black shadow-lg transition-colors"
          >
            <Play className="w-6 h-6" /> Start Bowling
          </button>
        </div>

        {showPicker && <ExercisePickerModal onSelect={handlePickExercise} onClose={() => setShowPicker(false)} />}
      </div>
    )
  }

  // ===== FINISHED =====
  if (phase === 'finished') {
    const a = totalPins(frames.a)
    const b = totalPins(frames.b)
    const winner = a > b ? 'a' : b > a ? 'b' : null
    return (
      <div className="h-full overflow-y-auto flex items-start justify-center p-6">
        <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl p-6 text-center space-y-5">
          <Trophy className="w-16 h-16 text-yellow-500 mx-auto" />
          <h2 className="text-3xl font-black text-gray-800">
            {winner ? `${teamNames[winner]} wins the bowling!` : "It's a tie!"}
          </h2>
          <Scoreboard frames={frames} framesPerTeam={framesPerTeam} teamNames={teamNames} light />
          <p className="text-sm text-gray-500">Points have already been added to the Live Battle scores.</p>
          <button
            onClick={() => setPhase('setup')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
          >
            <RotateCcw className="w-4 h-4" /> Play again
          </button>
        </div>
      </div>
    )
  }

  // ===== PLAYING =====
  const showLane = phase === 'bowl' || (phase === 'result' && !lastResult?.missed)

  return (
    <div className="h-full flex flex-col gap-3 p-3 min-h-0">
      <Scoreboard frames={frames} framesPerTeam={framesPerTeam} teamNames={teamNames} activeTeam={team} activeFrame={frameNo} />

      <div className="flex-1 min-h-0 relative">
        {/* Turn banner */}
        <div className={`absolute top-2 left-2 z-10 flex items-center gap-3 px-4 py-2 rounded-2xl border backdrop-blur ${style.soft}`}>
          {bowler?.pet_image
            ? <img src={bowler.pet_image} alt="" className="w-10 h-10 object-contain" />
            : <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">🎳</div>}
          <div>
            <div className={`text-sm font-black ${style.text}`}>{teamNames[team]} · Frame {frameNo}/{framesPerTeam}</div>
            <div className="text-white font-bold leading-tight">{bowler ? bowler.student_name : 'Your turn!'}</div>
          </div>
        </div>

        {phase === 'question' && currentQuestion && (
          <div className="h-full flex items-center justify-center pt-16">
            <div className="w-[90%] max-h-full flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6">
                <QuestionContent exerciseType={exercise.exercise_type} q={currentQuestion} showAnswer={showAnswer} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-t bg-gray-50">
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAnswer(s => !s)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold"
                  >
                    {showAnswer ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showAnswer ? 'Hide Answer' : 'Show Answer'}
                  </button>
                  <button onClick={skipQuestion} className="flex items-center gap-1 px-3 py-2 rounded-xl text-gray-500 hover:bg-gray-200 font-semibold" title="Swap for another question">
                    <SkipForward className="w-4 h-4" /> Skip
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={markWrong} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-black">
                    <X className="w-5 h-5" /> Wrong
                  </button>
                  <button onClick={markCorrect} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black">
                    <Check className="w-5 h-5" /> Correct — Bowl!
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showLane && (
          <BowlingLane
            key={rollKey}
            ballColor={style.ball}
            onSettled={handleSettled}
          />
        )}

        {phase === 'result' && lastResult && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-3xl shadow-2xl px-10 py-8 text-center max-w-md" style={{ animation: 'gzPop 0.35s ease-out' }}>
              {lastResult.lane && (
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Spot {lastResult.lane}</div>
              )}
              {lastResult.missed ? (
                <>
                  <div className="text-6xl mb-2">😬</div>
                  <div className="text-3xl font-black text-gray-800">No roll this frame</div>
                  <div className="text-gray-500 mt-1">Wrong answer, so {teamNames[lastResult.team]} loses the turn.</div>
                </>
              ) : lastResult.strike ? (
                <>
                  <div className="text-6xl mb-2">💥</div>
                  <div className="text-5xl font-black text-amber-500">STRIKE!</div>
                  <div className="text-xl font-bold text-gray-800 mt-2">+10 points to {teamNames[lastResult.team]}</div>
                  {lastResult.bonus && (
                    <div className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-bold text-sm">
                      <Sparkles className="w-4 h-4" /> Bonus power-up fired!
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-6xl mb-2">{lastResult.pins === 0 ? '🫣' : lastResult.pins >= 7 ? '🔥' : '🎳'}</div>
                  <div className="text-5xl font-black text-gray-800">{lastResult.pins} pin{lastResult.pins !== 1 ? 's' : ''}</div>
                  <div className="text-xl font-bold text-gray-600 mt-2">
                    {lastResult.pins === 0 ? 'Gutter ball!' : `+${lastResult.pins} points to ${teamNames[lastResult.team]}`}
                  </div>
                </>
              )}
              <button
                onClick={nextTurn}
                autoFocus
                className="mt-6 px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-black"
              >
                {turn + 1 >= framesPerTeam * 2 ? 'See results' : 'Next turn →'}
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes gzPop { 0% { transform: scale(0.6); opacity: 0 } 70% { transform: scale(1.05) } 100% { transform: scale(1); opacity: 1 } }`}</style>
    </div>
  )
}

const Scoreboard = ({ frames, framesPerTeam, teamNames, activeTeam, activeFrame, light = false }) => {
  const cell = (f) => {
    if (!f) return ''
    if (f.missed) return '—'
    if (f.strike) return 'X'
    return f.pins === 0 ? '0' : String(f.pins)
  }
  return (
    <div className={`rounded-2xl overflow-x-auto ${light ? 'bg-gray-50 border border-gray-200' : 'bg-black/50 backdrop-blur'}`}>
      <table className="w-full text-center text-sm">
        <thead>
          <tr className={light ? 'text-gray-500' : 'text-white/60'}>
            <th className="text-left px-3 py-1.5 font-semibold">Team</th>
            {Array.from({ length: framesPerTeam }).map((_, i) => <th key={i} className="px-1 py-1.5 font-semibold w-10">{i + 1}</th>)}
            <th className="px-3 py-1.5 font-semibold">Pins</th>
          </tr>
        </thead>
        <tbody>
          {['a', 'b'].map(t => (
            <tr key={t} className={light ? 'text-gray-800' : 'text-white'}>
              <td className={`text-left px-3 py-1.5 font-black ${TEAM_STYLE[t].text} whitespace-nowrap`}>{teamNames[t]}</td>
              {Array.from({ length: framesPerTeam }).map((_, i) => {
                const isActive = activeTeam === t && activeFrame === i + 1
                const f = frames[t][i]
                return (
                  <td key={i} className="px-1 py-1">
                    <div className={`h-8 rounded-lg flex items-center justify-center font-black
                      ${f?.strike ? 'bg-amber-400 text-white' : light ? 'bg-white border border-gray-200' : 'bg-white/10'}
                      ${isActive ? `ring-2 ${TEAM_STYLE[t].ring}` : ''}`}>
                      {cell(f)}
                    </div>
                  </td>
                )
              })}
              <td className="px-3 py-1.5 text-lg font-black">{totalPins(frames[t])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default BowlingGame
