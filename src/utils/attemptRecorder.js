// Saves one try of an exercise: an exercise_attempts row plus one question_attempts row per graded
// item (a question, blank, dropdown, drop zone, region or worksheet field).
//
// Grading happens in the exercise component; the recorder only stores the results. Answers are
// buffered and sent in batches through the save_exercise_attempt RPC: every FLUSH_EVERY new answers,
// when the tab is hidden or closed, when the exercise unmounts (see useAttemptRecorder), and on
// submit(). Recording the same item again within a try replaces it, so re-checks and resends are safe.
// After submit() the next answer starts a new try (attempt number + 1).
//
// Item shape passed to record():
//   { questionId, questionIndex, itemKey = '', itemIndex = 0, selected, correct, isCorrect, responseMs }
//   questionId     stable id of the question in exercise.content (or the region / field id)
//   questionIndex  position of the question in the exercise, 0-based
//   itemKey        which part of the question: '' when the question has one answer, otherwise e.g.
//                  'blank0', 'dd1' or the drop zone id. Unique within the question.
//   selected / correct   readable answer text (what a teacher should see)
import { supabase } from '../supabase/client'

const FLUSH_EVERY = 10
const MAX_RESPONSE_MS = 24 * 60 * 60 * 1000
const RETRY_DELAY_MS = 1500
// An unfinished try older than this is left alone and the student starts a new one
const RESUME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Multiple choice used to keep a resume snapshot in localStorage ("mc-progress:*"). Resume now
// comes from the database, so remove any snapshots left in this browser. Safe to delete later.
try {
  Object.keys(localStorage)
    .filter((key) => key.startsWith('mc-progress:'))
    .forEach((key) => localStorage.removeItem(key))
} catch { /* storage blocked */ }

// Kept current so a save can still be sent while the page is closing (no time to await a session)
let accessToken = null
try {
  supabase.auth.onAuthStateChange((_event, session) => {
    accessToken = session?.access_token || null
  })
} catch { /* mock client without auth */ }

const newId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // RFC 4122 v4 fallback for non-secure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const toText = (value) => (value === null || value === undefined ? null : String(value))

const toRow = (item) => ({
  question_id: String(item.questionId),
  question_index: Number.isInteger(item.questionIndex) ? item.questionIndex : null,
  item_key: item.itemKey == null ? '' : String(item.itemKey),
  item_index: Number.isInteger(item.itemIndex) ? item.itemIndex : 0,
  selected_answer: toText(item.selected),
  correct_answer: toText(item.correct),
  is_correct: !!item.isCorrect,
  response_ms: Number.isFinite(item.responseMs)
    ? Math.max(0, Math.min(Math.round(item.responseMs), MAX_RESPONSE_MS))
    : null,
})

const rowKey = (row) => `${row.question_id}\u0000${row.item_key}`

// Same request as supabase.rpc, but with keepalive so it survives the page being closed
const keepaliveRpc = async (params) => {
  if (!accessToken || !SUPABASE_URL) return { error: { message: 'No session for background save' } }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_exercise_attempt`, {
    method: 'POST',
    keepalive: true,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
  if (!res.ok) return { error: { message: `HTTP ${res.status}` } }
  return { data: await res.json(), error: null }
}

// For resuming: the saved rows of each question, from the first question on, stopping at the first
// question with nothing saved. Rows only count if the question still has the same id at the same
// position (the exercise may have been edited since). The result's length is how many questions
// the student already did.
export const savedAnswersByQuestion = (rows, questions) => {
  const byQuestion = []
  for (let i = 0; i < questions.length; i++) {
    const id = questions[i].id || `q${i}`
    const own = rows
      .filter((r) => r.question_index === i && r.question_id === id)
      .sort((a, b) => a.item_index - b.item_index)
    if (own.length === 0) break
    byQuestion.push(own)
  }
  return byQuestion
}

const newTry = (state = {}) => ({
  id: state.attemptId || newId(),
  startedAt: state.startedAt || new Date().toISOString(),
  rows: new Map(),   // every item answered in this try
  dirty: new Set(),  // keys not sent yet
})

export const createAttemptRecorder = (exerciseId) => {
  let enabled = false
  let current = newTry()
  let queue = Promise.resolve()
  let expectedCount = null

  const send = (t, { submit = false, keepalive = false } = {}) => {
    const batch = [...t.dirty].map((k) => t.rows.get(k))
    t.dirty.clear()
    const params = {
      p_exercise_id: exerciseId,
      p_attempt_id: t.id,
      p_items: batch,
      p_started_at: t.startedAt,
      p_submit: submit,
      p_expected_count: expectedCount,
    }

    const task = async () => {
      const call = () => (keepalive ? keepaliveRpc(params) : supabase.rpc('save_exercise_attempt', params))
      let { data, error } = await call()
      if (error && !keepalive) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        ;({ data, error } = await call())
      }
      if (error) {
        console.error('⚠️ Could not save exercise attempt:', error.message || error)
        // Put the items back so the next flush of this try sends them again
        batch.forEach((row) => {
          const k = rowKey(row)
          if (t.rows.get(k) === row) t.dirty.add(k)
        })
        return { error }
      }
      return { attemptId: data?.attempt_id, attemptNumber: data?.attempt_number, error: null }
    }

    queue = queue.then(task, task)
    return queue
  }

  return {
    exerciseId,

    setEnabled(value) {
      enabled = !!value && !!exerciseId
    },

    // Add or replace answers in the current try. Sends a batch every FLUSH_EVERY new answers.
    record(items) {
      if (!enabled) return
      const list = Array.isArray(items) ? items : [items]
      list.forEach((item) => {
        if (!item || item.questionId === null || item.questionId === undefined) return
        const row = toRow(item)
        const k = rowKey(row)
        // Re-recording at the end without a time keeps the time from the first recording
        const previous = current.rows.get(k)
        if (row.response_ms === null && previous) row.response_ms = previous.response_ms
        current.rows.set(k, row)
        current.dirty.add(k)
      })
      if (current.dirty.size >= FLUSH_EVERY) send(current)
    },

    // Send unsent answers now (try stays open)
    flush({ keepalive = false } = {}) {
      if (!enabled || current.dirty.size === 0) return Promise.resolve(null)
      return send(current, { keepalive })
    },

    // Send everything and close the try. The next record() starts a new try.
    // Resolves to { attemptId, attemptNumber, error }, or null when nothing was answered.
    submit() {
      if (!enabled || current.rows.size === 0) return Promise.resolve(null)
      const t = current
      current = newTry()
      return send(t, { submit: true })
    },

    // Drop unsent answers and start a new try (e.g. the student restarts from scratch)
    reset() {
      current = newTry()
    },

    // Resume from the database: the student's latest try if it is unfinished, recent, and has
    // saved answers. Resolves to { attemptId, startedAt, rows } or null. Changes nothing; call
    // continueTry() with the result to keep saving into that try.
    async findUnfinished(userId) {
      if (!enabled || !userId || current.rows.size > 0) return null
      const { data, error } = await supabase
        .from('exercise_attempts')
        .select('id, status, started_at, question_attempts(question_id, question_index, item_key, item_index, selected_answer, correct_answer, is_correct, response_ms)')
        .eq('user_id', userId)
        .eq('exercise_id', exerciseId)
        .order('attempt_number', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) {
        console.error('⚠️ Could not check for an unfinished try:', error.message)
        return null
      }
      if (!data || data.status !== 'in_progress') return null
      if (Date.now() - new Date(data.started_at).getTime() > RESUME_MAX_AGE_MS) return null
      const rows = data.question_attempts || []
      if (rows.length === 0) return null
      return { attemptId: data.id, startedAt: data.started_at, rows }
    },

    // Continue a try found by findUnfinished(). Its saved answers count as already sent.
    continueTry(found) {
      if (!found || current.rows.size > 0) return false
      current = newTry(found)
      found.rows.forEach((row) => current.rows.set(rowKey(row), row))
      return true
    },

    // How many graded items the exercise has (questions, blanks, zones...). Saved on the try so
    // lists can show "answered / total" for unfinished tries.
    setExpectedCount(count) {
      expectedCount = Number.isInteger(count) && count > 0 ? count : null
    },
  }
}
