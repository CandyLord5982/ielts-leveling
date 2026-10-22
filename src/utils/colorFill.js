// Shared helpers for the color_fill exercise type.
// Answers are stored as { [region_id]: color_id, [text_field_id]: typed text }.
// Every region and every text box is one graded item with the same weight.
// Attempt rows use question_index = region index, then regions.length + text box index.

import { splitAnswers } from './splitAnswers'

export const COLOR_FILL_PASS_SCORE = 75

// A text box is either a question the student answers (graded) or a plain text label (kind: 'label').
// Boxes saved before kinds existed have no kind and are questions.
export const isQuestionField = (field) => field.kind !== 'label'

export const getQuestionFields = (content) => (content?.text_fields || []).filter(isQuestionField)

export const isRegionCorrect = (region, colorId) => {
  if (!colorId) return false
  return colorId === region.correct_color_id || (region.accepted_color_ids || []).includes(colorId)
}

const normalizeText = (text) => text.trim().replace(/\s+/g, ' ')

// field.answer holds the accepted answers separated by | or / (same convention as fill_blank).
export const isTextCorrect = (field, typed) => {
  const answer = normalizeText(typed || '')
  if (!answer) return false

  const accepted = splitAnswers(field.answer).map(normalizeText)
  return field.case_sensitive
    ? accepted.includes(answer)
    : accepted.some(a => a.toLowerCase() === answer.toLowerCase())
}

export const gradeColorFill = (content, answers = {}) => {
  const regions = content?.regions || []
  const textFields = getQuestionFields(content)
  const byRegion = {}
  const byText = {}
  let correct = 0

  regions.forEach(region => {
    const isCorrect = isRegionCorrect(region, answers[region.id])
    byRegion[region.id] = isCorrect
    if (isCorrect) correct++
  })

  textFields.forEach(field => {
    const isCorrect = isTextCorrect(field, answers[field.id])
    byText[field.id] = isCorrect
    if (isCorrect) correct++
  })

  const total = regions.length + textFields.length
  return {
    correct,
    total,
    score: total > 0 ? Math.round((correct / total) * 100) : 0,
    byRegion,
    byText
  }
}

export const getUnansweredTextFields = (content, answers = {}) => (
  getQuestionFields(content).filter(field => !(answers[field.id] || '').trim())
)

export const polygonPoints = (points, scale) => (
  points.map(p => `${p.x * scale},${p.y * scale}`).join(' ')
)

export const polygonCentroid = (points, scale) => ({
  x: (points.reduce((sum, p) => sum + p.x, 0) / points.length) * scale,
  y: (points.reduce((sum, p) => sum + p.y, 0) / points.length) * scale
})
