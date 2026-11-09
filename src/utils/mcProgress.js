// Mid-exercise progress for multiple choice, kept in localStorage (same browser/device only) so a
// student who leaves halfway resumes where they stopped, with the same shuffled question/option order.
// Written by MultipleChoiceExercise; also read by the exercise list to draw a progress bar.
const PROGRESS_TTL_MS = 7 * 24 * 60 * 60 * 1000

const progressKey = (userId, exerciseId) => `mc-progress:${userId}:${exerciseId}`

// Changes when the exercise is edited, which invalidates stale snapshots.
export const exerciseSignature = (ex) => `${ex.updated_at || ''}:${ex.content?.questions?.length || 0}`

export const loadProgress = (userId, exerciseId, signature) => {
  try {
    const raw = localStorage.getItem(progressKey(userId, exerciseId))
    if (!raw) return null
    const snap = JSON.parse(raw)
    if (snap.signature !== signature || Date.now() - snap.savedAt > PROGRESS_TTL_MS) {
      localStorage.removeItem(progressKey(userId, exerciseId))
      return null
    }
    return snap
  } catch {
    return null
  }
}

export const saveProgress = (userId, exerciseId, snapshot) => {
  try {
    localStorage.setItem(progressKey(userId, exerciseId), JSON.stringify({ ...snapshot, savedAt: Date.now() }))
  } catch { /* storage full or unavailable - progress just won't resume */ }
}

export const clearProgress = (userId, exerciseId) => {
  try { localStorage.removeItem(progressKey(userId, exerciseId)) } catch { /* storage unavailable */ }
}

// Cheap read for lists: { answered, total } or null. Doesn't delete anything.
// If the exercise row has updated_at and it changed since the snapshot, treat as no progress.
export const getProgressSummary = (userId, exerciseId, updatedAt = null) => {
  try {
    const raw = localStorage.getItem(progressKey(userId, exerciseId))
    if (!raw) return null
    const snap = JSON.parse(raw)
    if (Date.now() - snap.savedAt > PROGRESS_TTL_MS) return null
    if (updatedAt && snap.updatedAt && snap.updatedAt !== updatedAt) return null
    if (!snap.total || !snap.answered) return null
    return { answered: snap.answered, total: snap.total }
  } catch {
    return null
  }
}
