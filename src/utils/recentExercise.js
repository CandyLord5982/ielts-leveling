export const saveRecentExercise = (exercise) => {
  try {
    const payload = {
      id: exercise.id,
      title: exercise.title || exercise.word || 'Bài tập',
      exerciseType: exercise.exercise_type || exercise.type,
      sessionId: exercise.sessionId || exercise.sessions?.id || exercise.session_id,
      levelId: exercise.levelId || exercise.units?.level_id || exercise.level_id,
      unitId: exercise.unitId || exercise.units?.id || exercise.unit_id,
      imageUrl: exercise.image_url || exercise.imageUrl || exercise.thumbnail_url || exercise.content?.imageUrl,
      continuePath: exercise.continuePath, // optional direct path
      timestamp: Date.now()
    }
    localStorage.setItem('recentExercise', JSON.stringify(payload))
  } catch (e) {
    // ignore
  }
}

export const getRecentExercise = () => {
  try {
    const raw = localStorage.getItem('recentExercise')
    if (!raw) return null
    const data = JSON.parse(raw)
    return data
  } catch (e) {
    return null
  }
}

