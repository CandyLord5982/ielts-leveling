// Simplified SM-2 (the classic Anki-style algorithm), scoped to a single rating
// step. State per item: repetitions, intervalDays, easeFactor. Call nextSchedule()
// after each review to get the next state; dueDateFromInterval() turns that into
// an actual due_at timestamp.

export const RATING = {
  AGAIN: 'again',
  HARD: 'hard',
  GOOD: 'good',
  EASY: 'easy',
}

const MIN_EASE = 1.3

export function nextSchedule({ repetitions, intervalDays, easeFactor }, rating) {
  let reps = repetitions
  let interval = intervalDays
  let ef = easeFactor

  if (rating === RATING.AGAIN) {
    return { repetitions: 0, intervalDays: 0, easeFactor: Math.max(MIN_EASE, ef - 0.2) }
  }

  reps += 1

  if (reps === 1) {
    interval = 1
  } else if (reps === 2) {
    interval = 6
  } else {
    interval = Math.round((intervalDays || 1) * ef)
  }

  if (rating === RATING.HARD) {
    interval = Math.max(1, Math.round(interval * 0.8))
    ef = Math.max(MIN_EASE, ef - 0.15)
  } else if (rating === RATING.EASY) {
    interval = Math.round(interval * 1.3)
    ef = ef + 0.15
  }

  return { repetitions: reps, intervalDays: interval, easeFactor: ef }
}

export function dueDateFromInterval(intervalDays) {
  // "Again" (interval 0) brings the item back in 10 minutes, not a full day -
  // it's a same-session relearn, not a tomorrow-scheduled review.
  const ms = intervalDays > 0 ? intervalDays * 24 * 60 * 60 * 1000 : 10 * 60 * 1000
  return new Date(Date.now() + ms)
}

// A question is auto-graded (no self-rating), so map correctness straight to a rating.
export function ratingFromCorrectness(isCorrect) {
  return isCorrect ? RATING.GOOD : RATING.AGAIN
}
