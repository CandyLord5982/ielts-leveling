import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceDashRun, createDashGate, createDashRun, DASH_CLOCK_BONUS, DASH_DURATION, DASH_MAX_BONUS_TIME,
  DASH_FLAWLESS_BONUS, DASH_HEAL_STREAK, DASH_STAGE_SPEED, DASH_WORD_DAMAGE, drainDashEvents, getDashPace, pickDashPickupKind, getDashChoiceLabel, getDashGateCycle, getDashGoals, getDashPrompt, getDashScore, getDashSpeedRating,
  getDashStage, getDashStars, getDashTravelTime, moveDashLane, normalizeDashWords, resolveDashRow, scoreDashGate,
  summarizeDashRun,
} from '../src/utils/petDash.js'

const bank = [
  { word: 'brave', hint: 'dũng cảm' },
  { word: 'quiet', hint: 'yên tĩnh' },
  { word: 'tired', hint: 'mệt mỏi' },
  { word: 'bright', hint: 'sáng sủa' },
]
const bigBank = Array.from({ length: 30 }, (_, i) => ({ word: `word${i}${'x'.repeat(i % 5)}`, hint: `nghĩa ${i}` }))

const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}

const gateRow = (overrides = {}) => {
  const gate = createDashGate(bank, { target: bank[0] }, () => 0.3)
  return { ...gate, id: 1, progress: 1, cycle: 3, retry: false, ...overrides }
}
const resolveWith = (run, row, lane) => {
  run.rows = [row]
  run.lane = lane
  resolveDashRow(run, row)
}

// A player who always reads the gate correctly, dodges barriers and grabs every pickup.
const playPerfectly = (level, random, frames = 20000) => {
  const run = createDashRun(level)
  for (let frame = 0; frame < frames && !run.over; frame++) {
    const row = run.rows[0]
    if (row?.type === 'gate') run.lane = row.correctLane
    else if (row?.type === 'pickup') run.lane = row.lane
    else if (row?.type === 'obstacle') run.lane = [0, 1, 2].find((lane) => !row.blocked.includes(lane))
    advanceDashRun(run, 1 / 60, bigBank, level, random)
  }
  return run
}

test('vocabulary rejects empty, duplicate and ambiguous answers without mutating the bank', () => {
  const input = [...bank, null, { word: ' BRAVE ', hint: 'khác' }, { word: 'silent', hint: ' YÊN   TĨNH ' }, { word: '  ', hint: 'test' }, { word: 'test' }]
  const original = structuredClone(input)
  assert.deepEqual(normalizeDashWords(input), bank)
  assert.deepEqual(input, original)
  assert.deepEqual(normalizeDashWords(null), [])
})

test('gates contain three unique choices and the correct lane points at the target', () => {
  for (let i = 0; i < 60; i++) {
    for (const reverse of [false, true]) {
      const gate = createDashGate(bank, { previousWord: 'brave', difficulty: i / 60, reverse }, () => i / 60)
      assert.notEqual(gate.target.word, 'brave')
      assert.equal(gate.choices.length, 3)
      assert.equal(new Set(gate.choices.map((entry) => entry.word)).size, 3)
      assert.equal(gate.choices[gate.correctLane], gate.target)
      assert.equal(getDashChoiceLabel(gate, gate.correctLane), gate.mode === 'word' ? gate.target.hint : gate.target.word)
    }
  }
  assert.equal(createDashGate(bank.slice(0, 2)), null)
})

test('reverse gates fall back to word mode when a meaning is too long to read on a lane', () => {
  const long = bank.map((entry, i) => (i === 0 ? { ...entry, hint: 'một cách rất dài dòng để diễn đạt nghĩa' } : entry))
  const gate = createDashGate(long, { target: long[1], reverse: true }, () => 0.1)
  assert.equal(gate.mode, 'hint', 'long meanings are never placed on gate panels')
  const short = createDashGate(bank, { target: bank[1], reverse: true }, () => 0.1)
  assert.equal(short.mode, 'word')
})

test('harder runs pick look-alike distractors', () => {
  const words = [
    { word: 'cat', hint: 'mèo' }, { word: 'cap', hint: 'mũ lưỡi trai' }, { word: 'can', hint: 'có thể' },
    { word: 'international', hint: 'quốc tế' }, { word: 'extraordinarily', hint: 'phi thường' }, { word: 'zoo', hint: 'sở thú' },
  ]
  const gate = createDashGate(words, { target: words[0], difficulty: 1 }, () => 0.5)
  const others = gate.choices.filter((entry) => entry !== gate.target).map((entry) => entry.word).sort()
  assert.deepEqual(others, ['can', 'cap'])
})

test('correct gates build a combo, wrong gates cost a heart and are recorded for review', () => {
  const run = createDashRun()
  for (let i = 0; i < 3; i++) resolveWith(run, gateRow(), gateRow().correctLane)
  assert.equal(run.wordsCompleted, 3)
  assert.equal(run.score, 10 + 12 + 14)
  assert.equal(run.bestStreak, 3)

  const row = gateRow()
  const wrong = (row.correctLane + 1) % 3
  resolveWith(run, row, wrong)
  assert.equal(run.hp, 3 - DASH_WORD_DAMAGE)
  assert.equal(run.streak, 0)
  assert.equal(run.bestStreak, 3)
  assert.deepEqual(run.missedWords, [{ word: 'brave', hint: 'dũng cảm', chosen: row.choices[wrong].word, misses: 1, redeemed: false }])
  assert.deepEqual(run.rows, [])
  resolveDashRow(run, row)
  assert.equal(run.hp, 3 - DASH_WORD_DAMAGE, 'a collision is resolved only once')
  assert.deepEqual(drainDashEvents(run).map((event) => event.type), ['correct', 'correct', 'correct', 'wrong'])
  assert.deepEqual(run.events, [])
})

test('combo points are capped', () => {
  assert.equal(scoreDashGate(1), 10)
  assert.equal(scoreDashGate(9), 26)
  assert.equal(scoreDashGate(500), 26)
})

test('missed words return a few gates later and can be redeemed for a bonus', () => {
  const run = createDashRun()
  const row = gateRow()
  resolveWith(run, row, (row.correctLane + 1) % 3)
  assert.equal(run.retry.length, 1)
  assert.equal(run.retry[0].word, 'brave')

  let drawn = null
  for (let i = 0; i < 12 && !drawn; i++) {
    run.elapsed = 5 + i
    run.rows = []
    run.nextSpawn = 0
    advanceDashRun(run, 0.01, bank, 1, seeded(i + 4))
    const gate = run.rows.find((candidate) => candidate.type === 'gate')
    if (gate?.retry) drawn = gate
  }
  assert.ok(drawn, 'the missed word is scheduled again')
  assert.equal(drawn.target.word, 'brave')
  assert.ok(run.gateIndex >= 4, 'but not immediately')

  const before = run.score
  resolveWith(run, drawn, drawn.correctLane)
  assert.equal(run.redeemed, 1)
  assert.equal(run.score - before, scoreDashGate(1) + 5)
  const summary = summarizeDashRun(run)
  assert.deepEqual(summary.missed, [])
  assert.equal(summary.mastered[0].word, 'brave')
})

test('a word that keeps being missed is only retried twice', () => {
  const run = createDashRun()
  for (let i = 0; i < 5; i++) {
    const row = gateRow()
    resolveWith(run, row, (row.correctLane + 1) % 3)
    run.hp = 3
    run.over = false
  }
  assert.equal(run.retry.length, 0)
  assert.equal(run.missedWords[0].misses, 5)
})

test('a shield absorbs exactly one mistake or collision', () => {
  const run = createDashRun()
  resolveWith(run, { id: 1, type: 'pickup', kind: 'shield', lane: 1, progress: 1 }, 1)
  assert.equal(run.shield, true)
  resolveWith(run, { id: 2, type: 'obstacle', blocked: [1], progress: 1 }, 1)
  assert.equal(run.hp, 3)
  assert.equal(run.shield, false)
  resolveWith(run, { id: 3, type: 'obstacle', blocked: [1], progress: 1 }, 1)
  assert.equal(run.hp, 2)
  resolveWith(run, { id: 4, type: 'obstacle', blocked: [0], progress: 1 }, 1)
  assert.equal(run.hp, 2)
  assert.equal(run.score, 3)
  assert.equal(run.dodges, 1)

  resolveWith(run, { id: 5, type: 'pickup', kind: 'shield', lane: 1, progress: 1 }, 1)
  const row = gateRow()
  resolveWith(run, row, (row.correctLane + 1) % 3)
  assert.equal(run.hp, 2, 'the shield also covers a wrong gate')
  assert.equal(run.streak, 0)
  assert.equal(run.missedWords.length, 1, 'but the word is still recorded')
})

test('wide barriers leave exactly one safe lane', () => {
  const run = createDashRun()
  const wide = { id: 1, type: 'obstacle', blocked: [0, 1], progress: 1 }
  resolveWith(run, wide, 2)
  assert.equal(run.hp, 3)
  resolveWith(run, wide, 0)
  assert.equal(run.hp, 2)
})

test('pickups only work in their own lane and respect their caps', () => {
  const run = createDashRun()
  resolveWith(run, { id: 1, type: 'pickup', kind: 'heart', lane: 0, progress: 1 }, 2)
  assert.equal(run.hp, 3)
  run.hp = 1
  resolveWith(run, { id: 2, type: 'pickup', kind: 'heart', lane: 0, progress: 1 }, 0)
  assert.equal(run.hp, 2)
  for (let i = 0; i < 6; i++) resolveWith(run, { id: 3 + i, type: 'pickup', kind: 'clock', lane: 1, progress: 1 }, 1)
  assert.equal(run.duration, DASH_DURATION + DASH_MAX_BONUS_TIME)
  assert.ok(DASH_CLOCK_BONUS > 0)
})

test('zero hearts ends a run and later frames cannot award more score', () => {
  const run = createDashRun()
  for (let i = 0; i < 3; i++) resolveWith(run, { id: i, type: 'obstacle', blocked: [1], progress: 1 }, 1)
  assert.equal(run.hp, 0)
  assert.equal(run.over, true)
  assert.equal(run.reason, 'lives')
  assert.equal(drainDashEvents(run).at(-1).type, 'over')
  const ended = structuredClone(run)
  advanceDashRun(run, 20, bigBank)
  assert.deepEqual(run, ended)
  assert.equal(createDashRun().hp, 3, 'a new run resets all lives')
})

test('rows keep their order and several can be on the road at once', () => {
  const run = createDashRun()
  const random = seeded(7)
  let maxRows = 0
  for (let frame = 0; frame < 60 * 30 && !run.over; frame++) {
    const row = run.rows[0]
    if (row?.type === 'gate') run.lane = row.correctLane
    else if (row?.type === 'pickup') run.lane = row.lane
    else if (row?.type === 'obstacle') run.lane = [0, 1, 2].find((lane) => !row.blocked.includes(lane))
    advanceDashRun(run, 1 / 60, bigBank, 1, random)
    maxRows = Math.max(maxRows, run.rows.length)
    const progress = run.rows.map((candidate) => candidate.progress)
    assert.deepEqual([...progress].sort((a, b) => b - a), progress, 'the nearest row is always first')
  }
  assert.ok(maxRows >= 2 && maxRows <= 3)
})

test('every word is shown once before any word repeats', () => {
  const run = createDashRun()
  const seen = []
  for (let i = 0; i < 8; i++) {
    run.rows = []
    run.elapsed = 1 + i
    run.nextSpawn = 0
    run.spawned = i * 4 + 1
    advanceDashRun(run, 0.001, bank.slice(0, 4), 1, seeded(i + 11))
    seen.push(run.rows[0].target.word)
  }
  assert.equal(new Set(seen.slice(0, 4)).size, 4)
  assert.equal(new Set(seen.slice(4)).size, 4)
  assert.ok(seen.every((word, i) => word !== seen[i - 1]))
})

test('a full perfect run ends on time, and the star goals are reachable at every level', () => {
  for (const level of [1, 2, 3, 4, 20]) {
    const run = playPerfectly(level, seeded(level + 3))
    assert.equal(run.reason, 'time', `level ${level}`)
    assert.ok(run.elapsed >= run.duration && run.elapsed < run.duration + 6, 'rows already on the road still finish')
    assert.deepEqual(run.rows, [])
    assert.equal(run.hp, 3)
    assert.equal(getDashStars(run), 3, `level ${level}: ${run.stageWords} words per stage`)
    run.stageWords.forEach((words, i) => assert.ok(words <= run.goals[i] + 8, `level ${level} stage ${i + 1} goal is not trivially low`))
    const summary = summarizeDashRun(run)
    assert.equal(summary.score, getDashScore(run))
    assert.equal(summary.accuracy, 100)
    assert.equal(summary.heartBonus, 15)
    assert.equal(getDashScore(run), run.score + 18 + 15)
  }
})

test('a player who never moves is eliminated by wrong gates and barriers, not by the clock', () => {
  const run = createDashRun()
  const random = seeded(5)
  for (let frame = 0; frame < 20000 && !run.over; frame++) advanceDashRun(run, 1 / 60, bigBank, 1, random)
  assert.equal(run.reason, 'lives')
  assert.ok(run.elapsed < DASH_DURATION)
  const summary = summarizeDashRun(run)
  assert.equal(summary.heartBonus, 0)
  assert.ok(summary.accuracy < 100)
})

test('difficulty ramps with time and level but stays bounded', () => {
  assert.deepEqual(getDashGoals(1), [5, 7, 10])
  assert.deepEqual(getDashGoals(99), getDashGoals(4))
  assert.ok(getDashTravelTime(DASH_DURATION, 1) < getDashTravelTime(0, 1))
  assert.ok(getDashTravelTime(0, 4) < getDashTravelTime(0, 1))
  assert.equal(getDashTravelTime(1000, 99), getDashTravelTime(DASH_DURATION, 4))
  assert.ok(getDashTravelTime(DASH_DURATION, 99) >= 1.79)
  assert.ok(getDashGateCycle(DASH_DURATION, 4) >= 1.6, 'students always get time to read')
})

test('the prompt follows the nearest gate and warns about hazards in front of it', () => {
  const run = createDashRun()
  assert.equal(getDashPrompt(run).kind, 'idle')
  const gate = gateRow({ progress: 0.2 })
  const barrier = { id: 2, type: 'obstacle', blocked: [1], progress: 0.5 }
  run.rows = [barrier, gate]
  const prompt = getDashPrompt(run)
  assert.equal(prompt.kind, 'gate')
  assert.equal(prompt.text, 'dũng cảm')
  assert.equal(prompt.alert, 'dodge')
  run.rows = [gateRow({ mode: 'word', progress: 0.2 })]
  assert.equal(getDashPrompt(run).text, 'brave')
  assert.equal(getDashPrompt(run).label, 'FIND THE MEANING')
  run.rows = [barrier]
  assert.equal(getDashPrompt(run).kind, 'dodge')
})

test('lane changes are clamped and report whether anything moved', () => {
  const run = createDashRun()
  assert.equal(moveDashLane(run, 1), false)
  assert.equal(moveDashLane(run, -5), true)
  assert.equal(run.lane, 0)
  assert.equal(moveDashLane(run, 9), true)
  assert.equal(run.lane, 2)
  assert.equal(moveDashLane(run, Number.NaN), true)
  assert.equal(run.lane, 0)
})

test('each 25 second stage is worth its own star, earned the moment its goal is met', () => {
  assert.deepEqual([0, 24.9, 25, 49.9, 50, 74, 200].map(getDashStage), [0, 0, 1, 1, 2, 2, 2])
  const run = createDashRun(1)
  const [first] = run.goals
  for (let i = 0; i < first; i++) resolveWith(run, gateRow(), gateRow().correctLane)
  assert.deepEqual(run.stageCleared, [true, false, false])
  assert.equal(getDashStars(run), 1)
  assert.equal(drainDashEvents(run).filter((event) => event.type === 'star').length, 1)

  run.elapsed = 30
  for (let i = 0; i < run.goals[1] - 1; i++) resolveWith(run, gateRow(), gateRow().correctLane)
  assert.deepEqual(run.stageWords, [first, run.goals[1] - 1, 0])
  assert.equal(getDashStars(run), 1, 'words from one stage never count towards another')
  resolveWith(run, gateRow(), gateRow().correctLane)
  assert.equal(getDashStars(run), 2)
  resolveWith(run, gateRow(), gateRow().correctLane)
  assert.equal(drainDashEvents(run).filter((event) => event.type === 'star').length, 1, 'a star is only awarded once')
})

test('a missed stage does not cost the stars of the others', () => {
  const run = createDashRun(1)
  run.elapsed = 55
  for (let i = 0; i < run.goals[2]; i++) resolveWith(run, gateRow(), gateRow().correctLane)
  const summary = summarizeDashRun(run)
  assert.equal(summary.stars, 1)
  assert.deepEqual(summary.stages.map((stage) => stage.cleared), [false, false, true])
})

test('stage changes are announced once as the run crosses them', () => {
  const run = createDashRun()
  const stages = []
  for (let frame = 0; frame < 60 * 60; frame++) {
    advanceDashRun(run, 1 / 60, bigBank, 1, seeded(2))
    run.hp = 3
    run.over = false
    stages.push(...drainDashEvents(run).filter((event) => event.type === 'stage').map((event) => event.stage))
  }
  assert.deepEqual(stages, [1, 2])
})

test('each stage runs at its own speed on a 0-10 scale: 4, 8.5 and 10', () => {
  assert.deepEqual(DASH_STAGE_SPEED, [4, 8.5, 10])
  assert.deepEqual([10, 40, 70].map((elapsed) => getDashSpeedRating(elapsed, 1)), [4, 8.5, 10])
  const travel = [10, 40, 70].map((elapsed) => getDashTravelTime(elapsed, 1))
  assert.ok(travel[0] > travel[1] && travel[1] > travel[2], 'every stage is faster than the last')
  assert.ok(getDashSpeedRating(0, 99) <= 10 && getDashSpeedRating(70, 99) <= 10)
})

test('speed eases into the next stage instead of jumping', () => {
  let previous = getDashSpeedRating(24.9, 1)
  for (let t = 25; t <= 29; t += 0.05) {
    const rating = getDashSpeedRating(t, 1)
    assert.ok(rating >= previous - 1e-9 && rating - previous < 0.4, `smooth at ${t.toFixed(2)}`)
    previous = rating
  }
  assert.equal(getDashSpeedRating(28.1, 1), 8.5)
})

test('every mistake costs a full heart: wrong words and barriers alike', () => {
  assert.equal(DASH_WORD_DAMAGE, 1)
  const run = createDashRun()
  resolveWith(run, { id: 1, type: 'obstacle', blocked: [1], progress: 1 }, 1)
  assert.equal(run.hp, 2)
  const first = gateRow({ id: 10 })
  resolveWith(run, first, (first.correctLane + 1) % 3)
  assert.equal(run.hp, 1)
  assert.equal(run.over, false)
  const second = gateRow({ id: 11 })
  resolveWith(run, second, (second.correctLane + 1) % 3)
  assert.equal(run.hp, 0)
  assert.equal(run.over, true)
  assert.equal(run.reason, 'lives')
  assert.equal(run.hurt, 3)
})

test('a streak heals one heart, never above the maximum', () => {
  const run = createDashRun()
  resolveWith(run, { id: 1, type: 'obstacle', blocked: [1], progress: 1 }, 1)
  for (let i = 0; i < DASH_HEAL_STREAK - 1; i++) resolveWith(run, gateRow({ id: 2 + i }), gateRow().correctLane)
  assert.equal(run.hp, 2)
  resolveWith(run, gateRow({ id: 50 }), gateRow().correctLane)
  assert.equal(run.hp, 3)
  assert.equal(drainDashEvents(run).filter((event) => event.healed).length, 1)
  for (let i = 0; i < DASH_HEAL_STREAK; i++) resolveWith(run, gateRow({ id: 60 + i }), gateRow().correctLane)
  assert.equal(run.hp, 3)
})

test('a sniff closes a wrong lane on the nearest gate, or on the next one to appear', () => {
  const run = createDashRun()
  const gate = gateRow({ id: 7, progress: 0.3 })
  const pickup = { id: 6, type: 'pickup', kind: 'sniff', lane: 1, progress: 1 }
  run.rows = [pickup, gate]
  run.lane = 1
  resolveDashRow(run, pickup)
  assert.notEqual(gate.eliminated, undefined)
  assert.notEqual(gate.eliminated, gate.correctLane)
  assert.equal(getDashPrompt(run).sniffed, true)

  const later = createDashRun()
  resolveWith(later, { id: 1, type: 'pickup', kind: 'sniff', lane: 0, progress: 1 }, 0)
  assert.equal(later.sniffCharge, true)
  later.nextSpawn = 0
  advanceDashRun(later, 0.01, bigBank, 1, seeded(3))
  const spawned = later.rows[0]
  assert.equal(spawned.type, 'gate')
  assert.notEqual(spawned.eliminated, undefined)
  assert.notEqual(spawned.eliminated, spawned.correctLane)
  assert.equal(later.sniffCharge, false)
})

test('pickups always offer something useful, hearts first', () => {
  const run = createDashRun()
  run.hp = 2
  assert.equal(pickDashPickupKind(run), 'heart')
  run.hp = 3
  run.stageMistakes[0] = 1
  assert.equal(pickDashPickupKind(run), 'sniff', 'help right after a mistake')
  run.stageMistakes[0] = 0
  assert.equal(pickDashPickupKind(run), 'shield')
  run.shield = true
  assert.equal(pickDashPickupKind(run), 'clock')
  run.duration = DASH_DURATION + DASH_MAX_BONUS_TIME
  assert.equal(pickDashPickupKind(run), 'sniff')
})

test('a mistake makes the pet stumble: the road slows briefly but the clock does not', () => {
  const run = createDashRun()
  const ahead = gateRow({ id: 9, progress: 0.2 })
  const row = gateRow({ id: 8 })
  run.rows = [row, ahead]
  run.lane = (row.correctLane + 1) % 3
  resolveDashRow(run, row)
  assert.equal(getDashPace(run), 0.5)
  const before = ahead.progress
  advanceDashRun(run, 0.1, bigBank, 1, seeded(1))
  const slowed = ahead.progress - before
  assert.ok(Math.abs(run.elapsed - 0.1) < 1e-9)
  for (let i = 0; i < 20; i++) advanceDashRun(run, 0.05, bigBank, 1, seeded(1))
  assert.equal(getDashPace(run), 1)
  const normal = ahead.progress
  advanceDashRun(run, 0.1, bigBank, 1, seeded(1))
  assert.ok(Math.abs((ahead.progress - normal) - slowed * 2) < 0.002, 'full speed is twice the stumble pace')
})

test('a stage cleared without mistakes pays a flawless bonus when it ends', () => {
  const run = createDashRun()
  for (let i = 0; i < run.goals[0]; i++) resolveWith(run, gateRow({ id: i + 1 }), gateRow().correctLane)
  const score = run.score
  run.elapsed = 24.99
  advanceDashRun(run, 0.02, bigBank, 1, seeded(1))
  assert.equal(run.stageFlawless[0], true)
  assert.equal(run.score, score + DASH_FLAWLESS_BONUS)
  assert.ok(drainDashEvents(run).some((event) => event.type === 'flawless'))

  const sloppy = createDashRun()
  resolveWith(sloppy, { id: 1, type: 'obstacle', blocked: [1], progress: 1 }, 1)
  for (let i = 0; i < sloppy.goals[0]; i++) resolveWith(sloppy, gateRow({ id: i + 2 }), gateRow().correctLane)
  sloppy.elapsed = 24.99
  advanceDashRun(sloppy, 0.02, bigBank, 1, seeded(1))
  assert.equal(sloppy.stageCleared[0], true)
  assert.equal(sloppy.stageFlawless[0], false)
  assert.equal(summarizeDashRun(sloppy).stages[0].flawless, false)
})

test('the prompt previews the clue of the gate behind the current one', () => {
  const run = createDashRun()
  const first = gateRow({ id: 1, progress: 0.6 })
  const second = { ...createDashGate(bank, { target: bank[2] }, () => 0.4), id: 2, progress: 0.1, cycle: 3 }
  run.rows = [first, second]
  const prompt = getDashPrompt(run)
  assert.equal(prompt.text, 'dũng cảm')
  assert.deepEqual(prompt.next, { id: 2, text: 'mệt mỏi', mode: 'hint' })
  run.rows = [first]
  assert.equal(getDashPrompt(run).next, null)
})
