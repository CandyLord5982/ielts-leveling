import { supabase } from '../../supabase/client'
import { assetUrl } from '../../hooks/useBranding'

// Realtime channel shared by the teacher's page and the students' room page. It only
// carries "something changed, refetch" pings; the data itself always comes from the database.
//   teacher -> students: 'update'
//   students -> teacher: 'joined', 'answered'
export const onlineBattleChannelName = (roomId) => `online-battle-${roomId}`

export const TEAMS = ['a', 'b']

export const teamName = (room, team) =>
  (team === 'a' ? room?.team_a_name : room?.team_b_name) || (team === 'a' ? 'Team Alpha' : 'Team Beta')

// Power-ups from the Random bonus button (see add_online_battle_powerups.sql)
export const POWERUPS = {
  steal: { image: 'https://tezpffaiydfmuyuparfw.supabase.co/storage/v1/object/public/ui-assets/class-battle/steal.png', name: 'Steal', hint: 'Take 3 to 7 points from the other team' },
  swap: { image: 'https://tezpffaiydfmuyuparfw.supabase.co/storage/v1/object/public/ui-assets/class-battle/swap.png', name: 'Swap', hint: 'Swap the two team scores' },
  boost: { image: 'https://tezpffaiydfmuyuparfw.supabase.co/storage/v1/object/public/ui-assets/class-battle/double.png', name: 'Boost', hint: '+10 points, or jump to 10 ahead if your team is behind' },
}

export const playPowerUpSound = () => {
  try { new Audio(assetUrl('/class-battle/add3.mp3')).play().catch(() => {}) } catch { /* sound is optional */ }
}

export const optionLetter = (idx) => (Number.isInteger(idx) ? String.fromCharCode(65 + idx) : '')

// Supabase returns at most 1000 rows per request
export const fetchAll = async (buildQuery) => {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildQuery().range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

const resolvePetImage = (userPet) => {
  if (!userPet?.pets?.image_url) return null
  let img = userPet.pets.image_url
  if (userPet.evolution_stage > 0 && userPet.pets.evolution_stages) {
    const stage = userPet.pets.evolution_stages.find(s => s.stage === userPet.evolution_stage)
    if (stage?.image_url) img = stage.image_url
  }
  return img.startsWith('http') ? img : assetUrl(img)
}

// Adds name / avatar / pet display info to participant rows. Remembers what it has
// already looked up, so repeated polling only queries for newly joined students.
export const createParticipantEnricher = () => {
  const users = {}
  const pets = {}

  return async (parts) => {
    const missingUsers = [...new Set(parts.map(p => p.user_id).filter(id => id && !users[id]))]
    const missingPets = [...new Set(parts.map(p => p.user_pet_id).filter(id => id && !pets[id]))]

    const [userRes, petRes] = await Promise.all([
      missingUsers.length
        ? supabase.from('users').select('id, full_name, avatar_url').in('id', missingUsers)
        : { data: [] },
      missingPets.length
        ? supabase.from('user_pets')
          .select('id, nickname, evolution_stage, level, pets(name, image_url, evolution_stages, rarity)')
          .in('id', missingPets)
        : { data: [] },
    ])
    ;(userRes.data || []).forEach(u => { users[u.id] = u })
    ;(petRes.data || []).forEach(p => { pets[p.id] = p })

    return parts.map(p => {
      const user = users[p.user_id]
      const pet = pets[p.user_pet_id]
      return {
        ...p,
        student_name: user?.full_name || 'Unknown',
        avatar_url: user?.avatar_url || null,
        pet_name: pet?.nickname || pet?.pets?.name || null,
        pet_image: resolvePetImage(pet),
        pet_rarity: pet?.pets?.rarity || null,
      }
    })
  }
}

const plainText = (value) => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const csvCell = (value) => {
  let text = String(value ?? '')
  // Stop spreadsheet apps from running a cell as a formula
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

// Downloads every saved answer of a room as a CSV file. Returns the number of answers.
export const downloadAnswersCsv = async (room, participants) => {
  const [questions, answers] = await Promise.all([
    fetchAll(() => supabase.from('online_battle_questions')
      .select('id, exercise_title, question_index, question, correct_answer, opened_at')
      .eq('room_id', room.id).neq('status', 'cancelled').order('opened_at').order('id')),
    fetchAll(() => supabase.from('online_battle_answers')
      .select('id, question_id, user_id, team, selected_option, is_correct, response_ms, answered_at, bonus_kind, bonus_points, bonus_powerup')
      .eq('room_id', room.id).order('answered_at').order('id')),
  ])

  const nameOf = {}
  participants.forEach(p => { nameOf[p.user_id] = p.student_name })
  const questionOf = {}
  questions.forEach((row, i) => { questionOf[row.id] = { ...row, order: i + 1 } })

  const header = ['Order', 'Asked at', 'Exercise', 'Question no.', 'Question', 'Student', 'Team',
    'Answer', 'Answer text', 'Correct answer', 'Result', 'Seconds to answer', 'Bonus button', 'Bonus points', 'Power-up']
  const lines = [header.map(csvCell).join(',')]
  let count = 0
  answers.forEach(a => {
    const row = questionOf[a.question_id]
    if (!row) return // answer to a cancelled question
    const options = row.question?.options || []
    count += 1
    lines.push([
      row.order,
      new Date(row.opened_at).toLocaleString(),
      row.exercise_title || '',
      row.question_index + 1,
      plainText(row.question?.question),
      nameOf[a.user_id] || a.user_id,
      teamName(room, a.team),
      optionLetter(a.selected_option),
      plainText(options[a.selected_option]),
      `${optionLetter(row.correct_answer)}. ${plainText(options[row.correct_answer])}`,
      a.is_correct ? 'Correct' : 'Wrong',
      a.response_ms != null ? (a.response_ms / 1000).toFixed(1) : '',
      a.bonus_kind === 'three' ? '+3' : a.bonus_kind === 'random' ? 'Random' : '',
      a.bonus_points ?? '',
      a.bonus_powerup || '',
    ].map(csvCell).join(','))
  })
  if (count === 0) return 0

  // BOM so Excel reads Vietnamese names correctly
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `online-battle-answers-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
  return count
}
