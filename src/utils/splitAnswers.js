/**
 * Split a blank's answer string into individual accepted answers.
 * New convention: use | or / as delimiters.
 * Falls back to , for backward compatibility with old data.
 */
export function splitAnswers(answer) {
  if (!answer) return []
  if (/[|/]/.test(answer)) {
    return answer.split(/[|/]/).map(a => a.trim()).filter(Boolean)
  }
  return answer.split(',').map(a => a.trim()).filter(Boolean)
}

/**
 * Get the first (display) answer from an answer string.
 */
export function firstAnswer(answer) {
  const answers = splitAnswers(answer)
  return answers[0] || ''
}
