import { useEffect, useRef, useState } from 'react'
import { BookOpen, Eye, EyeOff, Check, X, Play, RotateCcw, Trophy, Flag } from 'lucide-react'
import ExercisePickerModal from '../../ExercisePickerModal'
import { QuestionContent, QUESTION_TYPES_SUPPORTED } from '../../QuestionModal'
import { assetUrl } from '../../../../hooks/useBranding'

const SOUND_GOOD = '/livebattle/sound/Add4.mp3'
const SOUND_BAD = '/livebattle/sound/Bruh.mp3'
// Used when an effect leaves the gap between the teams unchanged (e.g. stealing from a team on 0)
const BAD_BY_DEFAULT = new Set(['give', 'last', 'oppWin', 'resetMine', 'lose50'])

/**
 * A number that counts from its previous value (or `from` on first mount) to `value`.
 * Pops slightly while it's moving.
 */
const AnimatedNumber = ({ value, from = value, duration = 900, className = '' }) => {
  const [display, setDisplay] = useState(from)
  const displayRef = useRef(from)
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    const start = displayRef.current
    if (start === value) return
    let raf
    const t0 = performance.now()
    setMoving(true)
    const tick = (now) => {
      const k = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - k, 3)
      const v = Math.round(start + (value - start) * eased)
      displayRef.current = v
      setDisplay(v)
      if (k < 1) raf = requestAnimationFrame(tick)
      else setMoving(false)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return (
    <span
      className={`inline-block tabular-nums transition-transform duration-200 ${moving ? 'scale-125' : 'scale-100'} ${className}`}
    >
      {display}
    </span>
  )
}

const playSound = (path) => {
  try {
    const audio = new Audio(assetUrl(path))
    audio.play().catch(() => {})
  } catch { /* audio not available */ }
}

const TEAM_STYLE = {
  a: { text: 'text-red-400', tile: 'from-red-500 to-red-700', chip: 'bg-red-500', ring: 'ring-red-300', soft: 'bg-red-500/20 border-red-400/50' },
  b: { text: 'text-blue-400', tile: 'from-blue-500 to-blue-700', chip: 'bg-blue-500', ring: 'ring-blue-300', soft: 'bg-blue-500/20 border-blue-400/50' },
}

const TILE_COUNTS = [12, 16, 20, 24]
const GRID_COLS = { 12: 4, 16: 4, 20: 5, 24: 6 }
const POINT_VALUES = [5, 10, 15, 20, 25]
const SOME_POINTS = [10, 15, 20, 25] // "some points" for steal / give / win / lose effects
const SPECIAL_LEVELS = [
  { id: 'none', label: 'None', share: 0 },
  { id: 'some', label: 'Some', share: 0.2 },
  { id: 'lots', label: 'Lots', share: 0.35 },
]
const TILE_GRADIENTS = [
  'from-pink-500 to-rose-500', 'from-amber-400 to-orange-500', 'from-emerald-400 to-teal-500',
  'from-sky-400 to-indigo-500', 'from-violet-500 to-fuchsia-500', 'from-lime-400 to-green-500',
]

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const other = (t) => (t === 'a' ? 'b' : 'a')

/**
 * Special tiles. `apply(score, me, opp, n)` mutates a copy of the game score.
 * `n` is the tile's "some points" amount (only used where `amount` is true).
 * Scores never go below 0.
 */
const EFFECTS = {
  steal:     { icon: '🦊', name: 'Steal!',          amount: true, text: (n) => `Take ${n} points from the other team`,   apply: (s, me, opp, n) => { const x = Math.min(n, s[opp]); s[opp] -= x; s[me] += x } },
  give:      { icon: '🎁', name: 'Gift for them',   amount: true, text: (n) => `Give ${n} of your points to the other team`, apply: (s, me, opp, n) => { const x = Math.min(n, s[me]); s[me] -= x; s[opp] += x } },
  first:     { icon: '🥇', name: 'Jump to 1st',     text: () => 'Go to first place (other team +10)',   apply: (s, me, opp) => { s[me] = Math.max(s[me], s[opp] + 10) } },
  last:      { icon: '🐢', name: 'Drop to last',    text: () => 'Go to last place',                      apply: (s, me, opp) => { s[me] = Math.min(s[me], Math.max(0, s[opp] - 10)) } },
  double:    { icon: '✖️', name: 'Double points',   text: () => 'Your score is doubled!',                apply: (s, me) => { s[me] *= 2 } },
  oppWin:    { icon: '🎉', name: 'Lucky them',      amount: true, text: (n) => `The other team wins ${n} points`,   apply: (s, me, opp, n) => { s[opp] += n } },
  resetMine: { icon: '🧹', name: 'Reset',           text: () => 'Your score goes back to 0',             apply: (s, me) => { s[me] = 0 } },
  resetAll:  { icon: '💥', name: 'Reset everyone',  text: () => 'Both scores go back to 0',              apply: (s) => { s.a = 0; s.b = 0 } },
  oppLose:   { icon: '💸', name: 'Ouch for them',   amount: true, text: (n) => `The other team loses ${n} points`,  apply: (s, me, opp, n) => { s[opp] = Math.max(0, s[opp] - n) } },
  swap:      { icon: '🔄', name: 'Swap',            text: () => 'Swap scores with the other team',       apply: (s) => { [s.a, s.b] = [s.b, s.a] } },
  win50:     { icon: '💰', name: 'Jackpot',         text: () => 'Win 50 points!',                        apply: (s, me) => { s[me] += 50 } },
  lose50:    { icon: '💣', name: 'Bomb',            text: () => 'Lose 50 points',                        apply: (s, me) => { s[me] = Math.max(0, s[me] - 50) } },
}
const EFFECT_KEYS = Object.keys(EFFECTS)

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildBoard(questionCount, tileCount, specialShare) {
  const specialCount = Math.round(tileCount * specialShare)
  const questionOrder = shuffle(Array.from({ length: questionCount }, (_, i) => i))
  const tiles = []
  for (let i = 0; i < tileCount - specialCount; i++) {
    tiles.push({ kind: 'question', questionIndex: questionOrder[i % questionOrder.length], points: pick(POINT_VALUES) })
  }
  // Spread the effects out so the same one doesn't keep appearing
  const effectOrder = shuffle(EFFECT_KEYS)
  for (let i = 0; i < specialCount; i++) {
    tiles.push({ kind: 'effect', effect: effectOrder[i % effectOrder.length], amount: pick(SOME_POINTS) })
  }
  return shuffle(tiles).map((t, i) => ({ ...t, id: i, number: i + 1, used: false, wonBy: null, gradient: TILE_GRADIENTS[i % TILE_GRADIENTS.length] }))
}

/**
 * Mystery Tiles. All scoring happens inside the game; the final scores are added to the
 * Live Battle team scores once, when the game ends (last tile or "End game").
 */
const TileGame = ({ teamNames, onAddPoints }) => {
  const [phase, setPhase] = useState('setup') // setup | board | finished
  const [exercise, setExercise] = useState(null)
  const [showPicker, setShowPicker] = useState(false)
  const [tileCount, setTileCount] = useState(20)
  const [specialLevel, setSpecialLevel] = useState('some')
  const [allowSteal, setAllowSteal] = useState(true)

  const [tiles, setTiles] = useState([])
  const [turn, setTurn] = useState('a')
  const [score, setScore] = useState({ a: 0, b: 0 })
  const [confirmEnd, setConfirmEnd] = useState(false)
  // Open tile: { tileId, step: 'question' | 'steal' | 'reveal' | 'effect' | 'effectResult', showAnswer, result }
  const [open, setOpen] = useState(null)
  const awardedRef = useRef(false)

  const questions = exercise?.content?.questions || []
  const openTile = open ? tiles.find(t => t.id === open.tileId) : null
  const tilesLeft = tiles.filter(t => !t.used).length

  const handlePickExercise = (ex) => {
    setShowPicker(false)
    if (!QUESTION_TYPES_SUPPORTED.includes(ex.exercise_type) || !ex.content?.questions?.length) {
      alert('That exercise type can\'t be shown here yet. Pick a multiple choice, fill in the blank, dropdown or flashcard exercise.')
      return
    }
    setExercise(ex)
  }

  const startGame = () => {
    const share = SPECIAL_LEVELS.find(l => l.id === specialLevel)?.share || 0
    setTiles(buildBoard(questions.length, tileCount, share))
    setTurn('a')
    setScore({ a: 0, b: 0 })
    setOpen(null)
    setConfirmEnd(false)
    awardedRef.current = false
    setPhase('board')
  }

  // End of game: hand the final scores to Live Battle exactly once
  const finishGame = (finalScore) => {
    if (!awardedRef.current) {
      awardedRef.current = true
      if (finalScore.a > 0) onAddPoints('a', finalScore.a)
      if (finalScore.b > 0) onAddPoints('b', finalScore.b)
    }
    setOpen(null)
    setPhase('finished')
  }

  const openTileById = (tile) => {
    if (tile.used || open) return
    setConfirmEnd(false)
    // scoreAtOpen: the turn bar keeps showing this until the tile closes, then counts up to the new score
    setOpen({ tileId: tile.id, step: tile.kind === 'question' ? 'question' : 'effect', showAnswer: false, result: null, scoreAtOpen: { ...score } })
  }

  // Close the tile. `used` = tile is spent; `nextTurn` = pass the turn to the other team.
  const closeTile = ({ used = true, wonBy = null, nextTurn = true } = {}) => {
    if (used) {
      const remaining = tiles.filter(t => !t.used && t.id !== open.tileId).length
      setTiles(prev => prev.map(t => (t.id === open.tileId ? { ...t, used: true, wonBy } : t)))
      if (remaining === 0) {
        finishGame(score)
        return
      }
    }
    if (nextTurn) setTurn(t => other(t))
    setOpen(null)
  }

  // --- Question tile ---
  const answerCorrect = () => {
    const team = open.step === 'steal' ? other(turn) : turn
    playSound(SOUND_GOOD)
    setScore(prev => ({ ...prev, [team]: prev[team] + openTile.points }))
    setOpen(o => ({ ...o, step: 'reveal', result: { team, points: openTile.points, stolen: o.step === 'steal' } }))
  }

  const answerWrong = () => {
    if (open.step === 'question' && allowSteal) {
      setOpen(o => ({ ...o, step: 'steal', showAnswer: false }))
      return
    }
    setOpen(o => ({ ...o, step: 'reveal', result: { team: null, points: openTile.points } }))
  }

  // --- Effect tile ---
  const activateEffect = () => {
    const before = { ...score }
    const after = { ...score }
    const me = turn
    const opp = other(turn)
    EFFECTS[openTile.effect].apply(after, me, opp, openTile.amount)
    // Good or bad for the team that picked the tile = did their lead grow or shrink?
    const change = (after[me] - after[opp]) - (before[me] - before[opp])
    const good = change !== 0 ? change > 0 : !BAD_BY_DEFAULT.has(openTile.effect)
    playSound(good ? SOUND_GOOD : SOUND_BAD)
    setScore(after)
    setOpen(o => ({ ...o, step: 'effectResult', result: { before, after } }))
  }

  // ===== SETUP =====
  if (phase === 'setup') {
    return (
      <div className="h-full overflow-y-auto flex items-start justify-center p-6">
        <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-6 space-y-6">
          <div className="text-center">
            <div className="text-6xl mb-2">🧩</div>
            <h2 className="text-3xl font-black text-gray-800">Mystery Tiles</h2>
            <p className="text-gray-500 mt-1">Teams take turns picking a tile. Answer right to win its hidden points, but some tiles hide surprises!</p>
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
              </div>
            ) : (
              <button
                onClick={() => setShowPicker(true)}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 text-gray-600 font-semibold transition-colors"
              >
                <BookOpen className="w-5 h-5" /> Pick an exercise
              </button>
            )}
          </div>

          <div>
            <div className="text-sm font-bold text-gray-700 mb-2">Number of tiles</div>
            <div className="flex gap-2">
              {TILE_COUNTS.map(n => (
                <button
                  key={n}
                  onClick={() => setTileCount(n)}
                  className={`flex-1 py-2 rounded-xl font-bold transition-colors ${tileCount === n ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            {exercise && questions.length < tileCount && (
              <p className="text-xs text-amber-600 mt-1.5">This exercise has {questions.length} questions, so some will repeat.</p>
            )}
          </div>

          <div>
            <div className="text-sm font-bold text-gray-700 mb-2">Surprise tiles</div>
            <div className="flex gap-2">
              {SPECIAL_LEVELS.map(l => (
                <button
                  key={l.id}
                  onClick={() => setSpecialLevel(l.id)}
                  className={`flex-1 py-2 rounded-xl font-bold transition-colors ${specialLevel === l.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Steal, give away, jump to 1st, drop to last, double, swap, reset, jackpot, bomb…</p>
          </div>

          <label className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer">
            <input type="checkbox" checked={allowSteal} onChange={e => setAllowSteal(e.target.checked)} className="w-5 h-5 accent-amber-500" />
            <div>
              <div className="font-semibold text-gray-800">Steal on wrong answer</div>
              <div className="text-xs text-gray-500">If a team gets it wrong, the other team can answer for the points</div>
            </div>
          </label>

          <button
            onClick={startGame}
            disabled={!exercise}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-green-600 hover:bg-green-500 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xl font-black shadow-lg transition-colors"
          >
            <Play className="w-6 h-6" /> {exercise ? 'Start Game' : 'Pick an exercise first'}
          </button>
        </div>

        {showPicker && <ExercisePickerModal onSelect={handlePickExercise} onClose={() => setShowPicker(false)} />}
      </div>
    )
  }

  // ===== FINISHED =====
  if (phase === 'finished') {
    const winner = score.a > score.b ? 'a' : score.b > score.a ? 'b' : null
    return (
      <div className="h-full overflow-y-auto flex items-start justify-center p-6">
        <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-6 text-center space-y-5">
          <Trophy className="w-16 h-16 text-yellow-500 mx-auto" />
          <h2 className="text-3xl font-black text-gray-800">
            {winner ? `${teamNames[winner]} wins the board!` : "It's a tie!"}
          </h2>
          <div className="flex justify-center gap-6">
            {['a', 'b'].map(t => (
              <div key={t} className={`rounded-2xl px-8 py-4 ${t === 'a' ? 'bg-red-50' : 'bg-blue-50'}`}>
                <div className={`font-black ${t === 'a' ? 'text-red-600' : 'text-blue-600'}`}>{teamNames[t]}</div>
                <AnimatedNumber from={0} value={score[t]} duration={1400} className="text-4xl font-black text-gray-800" />
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500">These scores have been added to the Live Battle team scores.</p>
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

  // ===== BOARD =====
  const cols = GRID_COLS[tiles.length] || 5
  const rows = Math.ceil(tiles.length / cols)
  const answeringTeam = open?.step === 'steal' ? other(turn) : turn

  return (
    <div className="h-full flex flex-col gap-3 p-4 min-h-0 relative">
      {/* Turn bar — click a team to hand them the turn */}
      <div className="flex items-center justify-center gap-4 flex-shrink-0">
        {['a', 'b'].map(t => (
          <button
            key={t}
            onClick={() => !open && setTurn(t)}
            className={`flex items-center gap-3 px-5 py-2 rounded-2xl border-2 transition-all ${TEAM_STYLE[t].soft}
              ${turn === t ? `ring-4 ${TEAM_STYLE[t].ring} scale-105` : 'opacity-60 hover:opacity-90'}`}
            title="Give this team the turn"
          >
            <span className={`font-black ${TEAM_STYLE[t].text}`}>{teamNames[t]}</span>
            <AnimatedNumber value={open ? open.scoreAtOpen[t] : score[t]} className="text-white text-2xl font-black" />
            {turn === t && <span className="text-xs font-bold text-white bg-white/20 rounded-full px-2 py-0.5">YOUR TURN</span>}
          </button>
        ))}
        <span className="text-white/50 text-sm font-semibold ml-2">{tilesLeft} tile{tilesLeft !== 1 ? 's' : ''} left</span>
        <button
          onClick={() => (confirmEnd ? finishGame(score) : setConfirmEnd(true))}
          onBlur={() => setConfirmEnd(false)}
          disabled={!!open}
          className={`ml-2 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-40
            ${confirmEnd ? 'bg-red-600 hover:bg-red-500' : 'bg-white/10 hover:bg-white/20'}`}
          title="End the game now and add the scores to Live Battle"
        >
          <Flag className="w-4 h-4" /> {confirmEnd ? 'Confirm end?' : 'End game'}
        </button>
      </div>

      {/* Tile grid */}
      <div
        className="flex-1 min-h-0 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      >
        {tiles.map(tile => <Tile key={tile.id} tile={tile} onClick={() => openTileById(tile)} />)}
      </div>

      {/* Open tile */}
      {open && openTile && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6">
          {openTile.kind === 'question' ? (
            <div className="w-[90%] max-h-full flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden" style={{ animation: 'tgPop 0.3s ease-out' }}>
              <div className={`flex items-center justify-between px-6 py-3 text-white bg-gradient-to-r ${TEAM_STYLE[answeringTeam].tile}`}>
                <div className="font-black">
                  Tile {openTile.number} · {teamNames[answeringTeam]}
                  {open.step === 'steal' && ' — steal chance!'}
                </div>
                {open.step !== 'reveal' && (
                  <button onClick={() => closeTile({ used: false, nextTurn: false })} className="p-1 rounded-lg hover:bg-white/20" title="Put the tile back">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {open.step === 'reveal' ? (
                <div className="p-10 text-center">
                  {open.result.team ? (
                    <>
                      <div className="text-6xl mb-2">{open.result.stolen ? '🦊' : '🎉'}</div>
                      <div className="text-5xl font-black text-gray-800">+{open.result.points}</div>
                      <div className="text-xl font-bold text-gray-600 mt-2">
                        {open.result.stolen ? `Stolen by ${teamNames[open.result.team]}!` : `to ${teamNames[open.result.team]}`}
                      </div>
                      <div className={`mt-4 inline-flex items-center gap-3 px-5 py-2 rounded-2xl ${open.result.team === 'a' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                        <span className="font-black">{teamNames[open.result.team]}</span>
                        <AnimatedNumber
                          from={open.scoreAtOpen[open.result.team]}
                          value={score[open.result.team]}
                          className="text-3xl font-black text-gray-800"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-6xl mb-2">😬</div>
                      <div className="text-3xl font-black text-gray-800">No points</div>
                      <div className="text-gray-500 mt-1">The tile was worth {open.result.points}.</div>
                    </>
                  )}
                  <button
                    autoFocus
                    onClick={() => closeTile({ wonBy: open.result.team })}
                    className="mt-6 px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-black"
                  >
                    {tilesLeft <= 1 ? 'See results' : 'Next turn →'}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto p-6">
                    <QuestionContent exerciseType={exercise.exercise_type} q={questions[openTile.questionIndex]} showAnswer={open.showAnswer} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-t bg-gray-50">
                    <button
                      onClick={() => setOpen(o => ({ ...o, showAnswer: !o.showAnswer }))}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold"
                    >
                      {open.showAnswer ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      {open.showAnswer ? 'Hide Answer' : 'Show Answer'}
                    </button>
                    <div className="flex gap-2">
                      <button onClick={answerWrong} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-black">
                        <X className="w-5 h-5" /> Wrong
                      </button>
                      <button onClick={answerCorrect} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black">
                        <Check className="w-5 h-5" /> Correct
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <EffectCard
              tile={openTile}
              team={turn}
              teamNames={teamNames}
              result={open.step === 'effectResult' ? open.result : null}
              isLast={tilesLeft <= 1}
              onActivate={activateEffect}
              onNext={() => closeTile({ wonBy: turn })}
            />
          )}
        </div>
      )}

      <style>{`
        @keyframes tgPop { 0% { transform: scale(0.6); opacity: 0 } 70% { transform: scale(1.04) } 100% { transform: scale(1); opacity: 1 } }
      `}</style>
    </div>
  )
}

const Tile = ({ tile, onClick }) => {
  if (tile.used) {
    const style = tile.wonBy ? TEAM_STYLE[tile.wonBy] : null
    return (
      <div className={`rounded-2xl flex flex-col items-center justify-center border-2 border-white/5 opacity-30 saturate-50
        ${style ? `bg-gradient-to-br ${style.tile}` : 'bg-white/5'}`}>
        {tile.kind === 'effect' ? (
          <span className="text-4xl">{EFFECTS[tile.effect].icon}</span>
        ) : (
          <span className="text-white/80 text-3xl font-black">{tile.wonBy ? `+${tile.points}` : '✕'}</span>
        )}
        <span className="text-white/50 text-xs font-bold mt-1">#{tile.number}</span>
      </div>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl bg-gradient-to-br ${tile.gradient} shadow-lg border-b-8 border-black/25
        flex items-center justify-center text-white font-black text-[clamp(1.5rem,5vh,4rem)] drop-shadow
        hover:scale-[1.04] hover:-translate-y-1 active:translate-y-0 transition-transform`}
    >
      {tile.number}
    </button>
  )
}

const EffectCard = ({ tile, team, teamNames, result, isLast, onActivate, onNext }) => {
  const effect = EFFECTS[tile.effect]
  return (
    <div className="bg-white rounded-3xl shadow-2xl px-10 py-8 text-center max-w-md w-full" style={{ animation: 'tgPop 0.3s ease-out' }}>
      <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Tile {tile.number} · {teamNames[team]}</div>
      <div className="text-7xl mb-2">{effect.icon}</div>
      <div className="text-4xl font-black text-gray-800">{effect.name}</div>
      <div className="text-gray-500 mt-1 text-lg">{effect.text(tile.amount)}</div>

      {result ? (
        <>
          {/* Before → after for both teams */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            {['a', 'b'].map(t => {
              const diff = result.after[t] - result.before[t]
              return (
                <div key={t} className={`rounded-2xl p-3 ${t === 'a' ? 'bg-red-50' : 'bg-blue-50'}`}>
                  <div className={`text-sm font-black ${t === 'a' ? 'text-red-600' : 'text-blue-600'}`}>{teamNames[t]}</div>
                  <div className="text-gray-400 text-sm line-through">{result.before[t]}</div>
                  <AnimatedNumber from={result.before[t]} value={result.after[t]} className="text-3xl font-black text-gray-800" />
                  {diff !== 0 && (
                    <div className={`text-sm font-bold ${diff > 0 ? 'text-green-600' : 'text-red-500'}`}>{diff > 0 ? `+${diff}` : diff}</div>
                  )}
                </div>
              )
            })}
          </div>
          <button
            autoFocus
            onClick={onNext}
            className="mt-6 px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-black"
          >
            {isLast ? 'See results' : 'Next turn →'}
          </button>
        </>
      ) : (
        <button
          autoFocus
          onClick={onActivate}
          className="mt-6 px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-black"
        >
          Do it!
        </button>
      )}
    </div>
  )
}

export default TileGame
