// Whether a student has anything due in the two review queues, for the red dots on the
// dashboard's review shortcuts. Checked once and cached for 10 minutes per tab (sessionStorage)
// to keep database reads low; opening a review page clears the cache so the dot refreshes.

import { supabase } from '../supabase/client'

const CACHE_KEY = (userId) => `review_due_${userId}`
const CACHE_TTL = 10 * 60 * 1000

export const clearReviewDueCache = (userId) => {
  try { sessionStorage.removeItem(CACHE_KEY(userId)) } catch { /* storage blocked */ }
}

// Same rule as ReviewQueue: latest multiple-choice attempt per question is wrong, and the
// question was never scheduled or its due date has passed
const hasDueQuestions = async (userId) => {
  const { data: attempts, error } = await supabase
    .from('question_attempts')
    .select('exercise_id, question_id, is_correct')
    .eq('user_id', userId)
    .eq('exercise_type', 'multiple_choice')
    .order('created_at', { ascending: false })
  if (error) throw error

  const latest = new Map()
  for (const a of attempts || []) {
    const key = `${a.exercise_id}:${a.question_id}`
    if (!latest.has(key)) latest.set(key, a)
  }
  const wrong = [...latest.values()].filter(a => a.is_correct === false)
  if (wrong.length === 0) return false

  const { data: reviews, error: reviewsErr } = await supabase
    .from('question_reviews')
    .select('exercise_id, question_id, due_at')
    .eq('user_id', userId)
    .in('exercise_id', [...new Set(wrong.map(a => a.exercise_id))])
  if (reviewsErr) throw reviewsErr

  const dueAt = new Map((reviews || []).map(r => [`${r.exercise_id}:${r.question_id}`, r.due_at]))
  const now = Date.now()
  return wrong.some(a => {
    const d = dueAt.get(`${a.exercise_id}:${a.question_id}`)
    return !d || new Date(d).getTime() <= now
  })
}

// Same rule as VocabReview: a saved word whose due date has passed. Count only, no rows.
const hasDueVocab = async (userId) => {
  const { count, error } = await supabase
    .from('saved_words')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('due_at', new Date().toISOString())
  if (error) throw error
  return (count || 0) > 0
}

// Returns { questions: boolean, vocab: boolean }
export const getReviewDue = async (userId) => {
  if (!userId) return { questions: false, vocab: false }
  try {
    const saved = JSON.parse(sessionStorage.getItem(CACHE_KEY(userId)) || 'null')
    if (saved && Date.now() - saved.t < CACHE_TTL) return saved.due
  } catch { /* no cache */ }

  const [questions, vocab] = await Promise.all([
    hasDueQuestions(userId).catch(() => false),
    hasDueVocab(userId).catch(() => false),
  ])
  const due = { questions, vocab }
  try { sessionStorage.setItem(CACHE_KEY(userId), JSON.stringify({ t: Date.now(), due })) } catch { /* fine */ }
  return due
}
