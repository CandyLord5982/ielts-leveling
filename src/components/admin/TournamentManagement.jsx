import { useState, useEffect } from 'react'
import { Trophy, Plus, ArrowLeft, Trash2, ChevronRight, Eye, Gamepad2, Users, Zap, Shuffle, GripVertical, X } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTournament } from '../../hooks/useTournament'
import { supabase } from '../../supabase/client'
import TournamentBracket from './TournamentBracket'

const SortableParticipant = ({ participant, index, total, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: participant.user_id })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-center gap-2 px-2 py-1.5 text-sm border-b last:border-b-0 ${index % 4 < 2 ? 'bg-white' : 'bg-purple-50/40'}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none">
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className="text-[10px] text-gray-400 w-4 text-right">{index + 1}</span>
      {participant.user?.avatar_url ? (
        <img src={participant.user.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
      ) : (
        <div className="w-5 h-5 rounded-full bg-gray-200" />
      )}
      <span className="flex-1 text-gray-700 truncate">{participant.user?.full_name || 'Student'}</span>
      {index % 2 === 0 && index + 1 < total && (
        <span className="text-[9px] text-amber-600 font-bold">VS</span>
      )}
      {onRemove && (
        <button
          onClick={() => onRemove(participant)}
          className="text-gray-300 hover:text-red-500 p-0.5 rounded transition-colors"
          title="Xóa khỏi giải đấu"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

const SortableStudent = ({ student, index, total, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: student.id })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-center gap-2 px-2 py-1.5 text-sm border-b last:border-b-0 ${index % 4 < 2 ? 'bg-white' : 'bg-gray-50'}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none">
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className="text-[10px] text-gray-400 w-4 text-right">{index + 1}</span>
      <span className="flex-1 text-gray-700 truncate">{student.full_name}</span>
      {index % 2 === 0 && index + 1 < total && (
        <span className="text-[9px] text-amber-600 font-bold">VS</span>
      )}
      <button onClick={() => onRemove(student.id)} className="text-gray-400 hover:text-red-500 p-0.5">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

function getRoundLabel(round, totalRounds) {
  const fromFinal = totalRounds - round
  if (fromFinal === 0) return 'Chung kết'
  if (fromFinal === 1) return 'Bán kết'
  if (fromFinal === 2) return 'Tứ kết'
  return `Vòng ${round}`
}

const GAME_TYPE_LABELS = {
  wordtype: 'Word Type',
  scramble: 'Word Scramble',
  matchgame: 'Match Game',
  whackmole: 'Whack-a-Mole',
  astroblast: 'Astro Blast',
  flappy: 'Flappy',
  sayitright: 'Say It Right',
  quizrush: 'Quiz Rush',
}

const STATUS_STYLES = {
  registration: 'bg-purple-100 text-purple-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS = {
  registration: 'Đang đăng ký',
  active: 'Đang diễn ra',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

// ─── Score Recording Modal ───────────────────────────────────
const ScoreModal = ({ match, participants, teams = [], onSave, onClose }) => {
  const isTeamMode = !!(match.team1_id || match.team2_id)
  const t1 = isTeamMode ? teams.find(t => t.id === match.team1_id) : null
  const t2 = isTeamMode ? teams.find(t => t.id === match.team2_id) : null
  const p1 = !isTeamMode ? participants.find(p => p.user_id === match.player1_id) : null
  const p2 = !isTeamMode ? participants.find(p => p.user_id === match.player2_id) : null

  const side1Id = isTeamMode ? match.team1_id : match.player1_id
  const side2Id = isTeamMode ? match.team2_id : match.player2_id
  const side1Name = isTeamMode ? (t1?.name || 'Team 1') : (p1?.user?.full_name || 'Player 1')
  const side2Name = isTeamMode ? (t2?.name || 'Team 2') : (p2?.user?.full_name || 'Player 2')
  const side1Avatar = !isTeamMode ? p1?.user?.avatar_url : null
  const side2Avatar = !isTeamMode ? p2?.user?.avatar_url : null

  const [p1Score, setP1Score] = useState(match.player1_score ?? '')
  const [p2Score, setP2Score] = useState(match.player2_score ?? '')
  const [winnerId, setWinnerId] = useState(isTeamMode ? (match.team_winner_id || '') : (match.winner_id || ''))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!winnerId) return
    setSaving(true)
    try {
      await onSave(match.id, {
        player1_score: parseInt(p1Score) || 0,
        player2_score: parseInt(p2Score) || 0,
        ...(isTeamMode ? { team_winner_id: winnerId } : { winner_id: winnerId }),
      })
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-gray-800 mb-4">Nhập kết quả trận đấu</h3>

        <div className="space-y-3">
          {/* Side 1 */}
          <div className={`p-2 rounded-lg border-2 cursor-pointer transition-colors ${winnerId === side1Id ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}
            onClick={() => setWinnerId(side1Id)}>
            <div className="flex items-center gap-3">
              <input type="radio" checked={winnerId === side1Id} onChange={() => setWinnerId(side1Id)} className="accent-green-600" />
              {side1Avatar ? (
                <img src={side1Avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                  {isTeamMode ? 'T' : '?'}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 flex-1 truncate">{side1Name}</span>
              <input
                type="number" min="0" value={p1Score}
                onChange={e => setP1Score(e.target.value)}
                className="w-16 text-center text-sm border rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                placeholder="Điểm"
              />
            </div>
            {isTeamMode && t1?.members && (
              <div className="mt-1 pl-9 text-[10px] text-gray-400">
                {t1.members.map(m => m.user?.full_name?.split(' ').pop()).filter(Boolean).join(', ')}
              </div>
            )}
          </div>

          <div className="text-center text-xs font-bold text-gray-400">VS</div>

          {/* Side 2 */}
          <div className={`p-2 rounded-lg border-2 cursor-pointer transition-colors ${winnerId === side2Id ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}
            onClick={() => setWinnerId(side2Id)}>
            <div className="flex items-center gap-3">
              <input type="radio" checked={winnerId === side2Id} onChange={() => setWinnerId(side2Id)} className="accent-green-600" />
              {side2Avatar ? (
                <img src={side2Avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                  {isTeamMode ? 'T' : '?'}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 flex-1 truncate">{side2Name}</span>
              <input
                type="number" min="0" value={p2Score}
                onChange={e => setP2Score(e.target.value)}
                className="w-16 text-center text-sm border rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                placeholder="Điểm"
              />
            </div>
            {isTeamMode && t2?.members && (
              <div className="mt-1 pl-9 text-[10px] text-gray-400">
                {t2.members.map(m => m.user?.full_name?.split(' ').pop()).filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        </div>

        {match.round_scores?.length > 0 && (
          <div className="mt-4 p-2 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Chi tiết theo lượt</div>
            <div className="flex flex-wrap gap-1">
              {match.round_scores.map((rs, i) => (
                <span key={i} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${rs.winner === 1 ? 'bg-emerald-100 text-emerald-700' : rs.winner === 2 ? 'bg-sky-100 text-sky-700' : 'bg-gray-200 text-gray-600'}`}>
                  L{i + 1}: {rs.p1}-{rs.p2}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 text-sm text-gray-600 border rounded-lg py-2 hover:bg-gray-50">Hủy</button>
          <button
            onClick={handleSave}
            disabled={!winnerId || saving}
            className="flex-1 text-sm text-white bg-blue-600 rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {saving ? 'Đang lưu...' : 'Lưu kết quả'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Tournament Form ──────────────────────────────────
const CreateForm = ({ onCreated, onCancel }) => {
  const { createTournament } = useTournament()

  const [name, setName] = useState('')
  const [info, setInfo] = useState('')
  const [gameType, setGameType] = useState('wordtype')
  const [bracketSize, setBracketSize] = useState(8)
  const [courses, setCourses] = useState([])
  const [selectedCourse, setSelectedCourse] = useState('')
  const [courseStudents, setCourseStudents] = useState([])
  const [selectedStudents, setSelectedStudents] = useState([])
  // round_rewards: { "1": { xp, gems, item_id, item_quantity, chest_id }, ..., "winner": { ... } }
  const [roundRewards, setRoundRewards] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [entryFee, setEntryFee] = useState(0)
  const [allItems, setAllItems] = useState([])
  const [allChests, setAllChests] = useState([])
  const [mode, setMode] = useState('direct') // 'direct' = pick students now, 'registration' = open for sign-up
  const [allowedLevels, setAllowedLevels] = useState([]) // empty = all levels
  const [allLevels, setAllLevels] = useState([])
  const [tournamentMode, setTournamentMode] = useState('solo') // 'solo' | 'team'
  const [teamSize, setTeamSize] = useState(2)
  const [teamAssignments, setTeamAssignments] = useState([]) // [{ name, memberIds[] }]
  const [bestOf, setBestOf] = useState(1) // 1 = single best score, 3/5/7 = best-of-N rounds

  const selectedIds = selectedStudents.map(s => s.id)
  const totalRounds = Math.log2(bracketSize)

  // Re-init reward rows when bracket size changes
  useEffect(() => {
    setRoundRewards(prev => {
      const next = {}
      for (let r = 1; r <= totalRounds; r++) {
        next[String(r)] = prev[String(r)] || { xp: 0, gems: 0 }
      }
      next.winner = prev.winner || { xp: 0, gems: 0 }
      return next
    })
  }, [totalRounds])

  const updateReward = (key, field, value) => {
    const isNumeric = ['xp', 'gems', 'item_quantity'].includes(field)
    setRoundRewards(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: isNumeric ? (parseInt(value) || 0) : value }
    }))
  }

  // Fetch courses, items, chests, levels on mount
  useEffect(() => {
    const load = async () => {
      const [courseRes, itemRes, chestRes, levelRes] = await Promise.all([
        supabase.from('courses').select('id, title, level_number').eq('is_active', true).order('level_number'),
        supabase.from('collectible_items').select('id, name, image_url, rarity').eq('is_active', true).order('name'),
        supabase.from('chests').select('id, name, image_url, chest_type').eq('is_active', true).order('name'),
        supabase.from('users').select('current_level').eq('role', 'student'),
      ])
      setCourses(courseRes.data || [])
      setAllItems(itemRes.data || [])
      setAllChests(chestRes.data || [])
      const levels = [...new Set((levelRes.data || []).map(u => u.current_level).filter(Boolean))].sort((a, b) => a - b)
      setAllLevels(levels)
    }
    load()
  }, [])

  const handleCourseChange = async (courseId) => {
    setSelectedCourse(courseId)
    if (!courseId) { setCourseStudents([]); return }
    const { data } = await supabase
      .from('course_enrollments')
      .select('student_id, users!student_id(id, full_name, avatar_url)')
      .eq('course_id', courseId)
      .eq('is_active', true)
    setCourseStudents(
      (data || [])
        .filter(e => e.users)
        .map(e => ({ student_id: e.student_id, full_name: e.users.full_name, avatar_url: e.users.avatar_url }))
        .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
    )
  }

  const toggleStudent = (studentId, fullName) => {
    setSelectedStudents(prev =>
      prev.some(s => s.id === studentId)
        ? prev.filter(s => s.id !== studentId)
        : [...prev, { id: studentId, full_name: fullName }]
    )
  }

  const removeStudent = (studentId) => {
    setSelectedStudents(prev => prev.filter(s => s.id !== studentId))
  }

  const selectAll = () => {
    const allInCourse = courseStudents.map(m => m.student_id)
    const allSelected = allInCourse.every(id => selectedIds.includes(id))
    if (allSelected) {
      // Deselect all from this course
      setSelectedStudents(prev => prev.filter(s => !allInCourse.includes(s.id)))
    } else {
      // Add all from this course that aren't already selected
      const toAdd = courseStudents
        .filter(m => !selectedIds.includes(m.student_id))
        .map(m => ({ id: m.student_id, full_name: m.full_name }))
      setSelectedStudents(prev => [...prev, ...toAdd])
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSelectedStudents(prev => {
      const oldIdx = prev.findIndex(s => s.id === active.id)
      const newIdx = prev.findIndex(s => s.id === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
  }

  const shuffleStudents = () => {
    setSelectedStudents(prev => {
      const arr = [...prev]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    })
  }

  const toggleLevel = (lvl) => {
    setAllowedLevels(prev => prev.includes(lvl) ? prev.filter(l => l !== lvl) : [...prev, lvl])
  }

  const handleSubmit = async () => {
    setError('')
    if (!name.trim()) { setError('Nhập tên giải đấu'); return }

    if (mode === 'direct') {
      if (tournamentMode === 'team') {
        // Validate team assignments
        if (teamAssignments.length !== bracketSize) {
          setError(`Cần đúng ${bracketSize} đội (hiện có ${teamAssignments.length})`)
          return
        }
        const emptyTeam = teamAssignments.find(t => t.memberIds.length === 0)
        if (emptyTeam) {
          setError(`Đội "${emptyTeam.name}" chưa có thành viên`)
          return
        }
      } else {
        if (selectedStudents.length !== bracketSize) {
          setError(`Chọn đúng ${bracketSize} học sinh (đã chọn ${selectedStudents.length})`)
          return
        }
      }
    }

    setSaving(true)
    try {
      if (mode === 'registration') {
        // Create tournament in registration status (no students yet)
        const total_rounds = Math.log2(bracketSize)
        const { error: tErr } = await supabase.from('tournaments').insert({
          name: name.trim(),
          info: info.trim() || null,
          bracket_size: bracketSize,
          game_type: gameType,
          total_rounds,
          current_round: 0,
          status: 'registration',
          created_by: (await supabase.auth.getUser()).data.user.id,
          round_rewards: roundRewards,
          entry_fee: entryFee,
          allowed_levels: allowedLevels.length > 0 ? allowedLevels : null,
          mode: tournamentMode,
          team_size: tournamentMode === 'team' ? teamSize : 1,
          best_of: bestOf,
        })
        if (tErr) throw tErr
      } else {
        await createTournament({
          name: name.trim(),
          info: info.trim() || null,
          bracket_size: bracketSize,
          game_type: gameType,
          studentIds: tournamentMode === 'solo' ? selectedIds : [],
          round_rewards: roundRewards,
          entry_fee: entryFee,
          mode: tournamentMode,
          team_size: tournamentMode === 'team' ? teamSize : 1,
          teamAssignments: tournamentMode === 'team' ? teamAssignments : [],
          best_of: bestOf,
        })
      }
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-gray-800">Tạo giải đấu mới</h2>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Tên giải đấu</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
          placeholder="VD: Giải Word Type mùa xuân"
        />
      </div>

      {/* Info / Description */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Thông tin / Mô tả (tùy chọn)</label>
        <textarea
          value={info}
          onChange={e => setInfo(e.target.value)}
          rows={3}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none resize-none"
          placeholder="VD: Luật chơi, lịch thi đấu, ghi chú cho học sinh..."
        />
      </div>

      {/* Game Type */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Trò chơi</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(GAME_TYPE_LABELS).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setGameType(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${gameType === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Solo / Team toggle */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Loại giải đấu</label>
        <div className="flex gap-2">
          <button onClick={() => { setTournamentMode('solo'); setTeamAssignments([]) }}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${tournamentMode === 'solo' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Solo
          </button>
          <button onClick={() => setTournamentMode('team')}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${tournamentMode === 'team' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Đội (Team)
          </button>
        </div>
      </div>

      {/* Team Size */}
      {tournamentMode === 'team' && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Số người / đội</label>
          <div className="flex gap-2">
            {[2, 3, 4].map(size => (
              <button
                key={size}
                onClick={() => setTeamSize(size)}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${teamSize === size ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Best-of-N */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Thể thức</label>
        <div className="flex gap-2">
          {[1, 3, 5, 7].map(n => (
            <button
              key={n}
              onClick={() => setBestOf(n)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${bestOf === n ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {n === 1 ? 'Điểm cao nhất' : `Bo${n}`}
            </button>
          ))}
        </div>
        {bestOf > 1 && (
          <p className="text-[10px] text-gray-500 mt-1">
            Mỗi trận đấu gồm {bestOf} lượt, thắng {Math.ceil(bestOf / 2)} lượt để thắng trận (VD: 3-2, 5-0)
          </p>
        )}
      </div>

      {/* Bracket Size */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          {tournamentMode === 'team' ? 'Số đội' : 'Số người chơi'}
        </label>
        <div className="flex gap-2">
          {[4, 8, 16, 32, 64].map(size => (
            <button
              key={size}
              onClick={() => { setBracketSize(size); setSelectedStudents([]); setTeamAssignments([]) }}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${bracketSize === size ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {size}
            </button>
          ))}
        </div>
        {tournamentMode === 'team' && (
          <p className="text-[10px] text-gray-500 mt-1">
            {bracketSize} đội × {teamSize} người = {bracketSize * teamSize} học sinh
          </p>
        )}
      </div>

      {/* Entry Fee */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Phí tham gia (XP)</label>
        <input
          type="number"
          min="0"
          value={entryFee}
          onChange={e => setEntryFee(parseInt(e.target.value) || 0)}
          className="w-32 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
          placeholder="0"
        />
        {entryFee > 0 && (
          <p className="text-[10px] text-gray-500 mt-1">
            Mỗi người chơi sẽ bị trừ {entryFee} XP khi giải đấu bắt đầu
          </p>
        )}
      </div>

      {/* Mode: Direct pick vs Registration */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Chế độ</label>
        <div className="flex gap-2">
          <button onClick={() => setMode('direct')}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === 'direct' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Chọn học sinh trực tiếp
          </button>
          <button onClick={() => setMode('registration')}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === 'registration' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Mở đăng ký
          </button>
        </div>
        {mode === 'registration' && (
          <p className="text-[10px] text-gray-500 mt-1">Học sinh sẽ tự đăng ký. Bạn bắt đầu giải khi đủ người.</p>
        )}
      </div>

      {/* Level Restriction (registration mode) */}
      {mode === 'registration' && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Giới hạn level (bỏ trống = tất cả)</label>
          <div className="flex flex-wrap gap-2">
            {(allLevels.length > 0 ? allLevels : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).map(lvl => (
              <button key={lvl} onClick={() => toggleLevel(lvl)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${allowedLevels.includes(lvl) ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Level {lvl}
              </button>
            ))}
          </div>
          {allowedLevels.length > 0 && (
            <p className="text-[10px] text-purple-600 mt-1 font-medium">
              Chỉ học sinh level {allowedLevels.sort((a, b) => a - b).join(', ')} được đăng ký
            </p>
          )}
        </div>
      )}

      {/* Course + Student Selection (direct mode only) */}
      {mode === 'direct' && <>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Chọn khóa học</label>
          <select
            value={selectedCourse}
            onChange={e => handleCourseChange(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
          >
            <option value="">-- Chọn khóa học --</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>

        {/* Bracket order + matchup preview (solo mode only — team mode uses team assignment UI) */}
        {selectedStudents.length > 0 && tournamentMode === 'solo' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-600">
                Sắp xếp cặp đấu ({selectedStudents.length}/{bracketSize})
              </label>
              <button onClick={shuffleStudents} className="text-[10px] text-purple-600 hover:underline flex items-center gap-1">
                <Shuffle className="w-3 h-3" /> Xáo trộn
              </button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={selectedStudents.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="border rounded-lg max-h-64 overflow-y-auto">
                  {selectedStudents.map((s, i) => (
                    <SortableStudent key={s.id} student={s} index={i} total={selectedStudents.length} onRemove={removeStudent} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {courseStudents.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-600">
                Học sinh trong khóa ({courseStudents.filter(m => selectedIds.includes(m.student_id)).length}/{courseStudents.length})
              </label>
              <button onClick={selectAll} className="text-[10px] text-blue-600 hover:underline">
                {courseStudents.every(m => selectedIds.includes(m.student_id)) ? 'Bỏ chọn khóa này' : 'Chọn cả khóa'}
              </button>
            </div>
            <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
              {courseStudents.map(m => (
                <label
                  key={m.student_id}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${selectedIds.includes(m.student_id) ? 'bg-blue-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(m.student_id)}
                    onChange={() => toggleStudent(m.student_id, m.full_name)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">{m.full_name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </>}

      {/* Team Assignment (direct + team mode) */}
      {mode === 'direct' && tournamentMode === 'team' && selectedStudents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-gray-600">
              Chia đội ({teamAssignments.length}/{bracketSize} đội)
            </label>
            <button
              onClick={() => {
                // Auto-assign students to teams
                const teams = []
                const students = [...selectedStudents]
                for (let i = 0; i < Math.ceil(students.length / teamSize); i++) {
                  teams.push({
                    name: `Đội ${i + 1}`,
                    memberIds: students.slice(i * teamSize, (i + 1) * teamSize).map(s => s.id),
                  })
                }
                setTeamAssignments(teams)
              }}
              className="text-[10px] text-indigo-600 hover:underline"
            >
              Tự động chia đội
            </button>
          </div>
          {teamAssignments.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {teamAssignments.map((team, ti) => (
                <div key={ti} className="border rounded-lg p-2 bg-white">
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      value={team.name}
                      onChange={e => {
                        const next = [...teamAssignments]
                        next[ti] = { ...next[ti], name: e.target.value }
                        setTeamAssignments(next)
                      }}
                      className="text-sm font-bold text-gray-800 border-b border-transparent focus:border-indigo-300 outline-none flex-1 bg-transparent"
                    />
                    <span className="text-[10px] text-gray-400">{team.memberIds.length}/{teamSize}</span>
                  </div>
                  <div className="space-y-0.5">
                    {team.memberIds.map(uid => {
                      const student = selectedStudents.find(s => s.id === uid)
                      return (
                        <div key={uid} className="flex items-center gap-2 text-xs text-gray-600 pl-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                          <span className="flex-1 truncate">{student?.full_name || 'Unknown'}</span>
                          <button
                            onClick={() => {
                              const next = [...teamAssignments]
                              next[ti] = { ...next[ti], memberIds: next[ti].memberIds.filter(id => id !== uid) }
                              if (next[ti].memberIds.length === 0) next.splice(ti, 1)
                              setTeamAssignments(next)
                            }}
                            className="text-gray-300 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  {/* Unassigned students dropdown to add */}
                  {team.memberIds.length < teamSize && (() => {
                    const assignedIds = new Set(teamAssignments.flatMap(t => t.memberIds))
                    const unassigned = selectedStudents.filter(s => !assignedIds.has(s.id))
                    if (unassigned.length === 0) return null
                    return (
                      <select
                        value=""
                        onChange={e => {
                          if (!e.target.value) return
                          const next = [...teamAssignments]
                          next[ti] = { ...next[ti], memberIds: [...next[ti].memberIds, e.target.value] }
                          setTeamAssignments(next)
                        }}
                        className="mt-1 w-full border rounded px-1 py-0.5 text-[10px] text-gray-500"
                      >
                        <option value="">+ Thêm thành viên</option>
                        {unassigned.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                      </select>
                    )
                  })()}
                </div>
              ))}
              {/* Add new team */}
              {teamAssignments.length < bracketSize && (() => {
                const assignedIds = new Set(teamAssignments.flatMap(t => t.memberIds))
                const unassigned = selectedStudents.filter(s => !assignedIds.has(s.id))
                if (unassigned.length === 0) return null
                return (
                  <button
                    onClick={() => {
                      setTeamAssignments(prev => [...prev, { name: `Đội ${prev.length + 1}`, memberIds: [] }])
                    }}
                    className="w-full border-2 border-dashed border-gray-200 rounded-lg py-2 text-xs text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
                  >
                    + Thêm đội mới
                  </button>
                )
              })()}
            </div>
          ) : (
            <p className="text-[10px] text-gray-400">{"Bấm \"Tự động chia đội\" hoặc thêm đội thủ công"}</p>
          )}
        </div>
      )}

      {/* Rewards per round */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">Phần thưởng theo vòng</label>
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_60px_60px] text-[10px] font-semibold text-gray-500 bg-gray-100 px-3 py-1">
            <span>Hạng</span><span className="text-center">XP</span><span className="text-center">Gems</span>
          </div>
          {Array.from({ length: totalRounds }, (_, i) => {
            const r = String(i + 1)
            return (
              <div key={r} className="border-t px-3 py-1.5">
                <div className="grid grid-cols-[1fr_60px_60px] items-center text-xs">
                  <span className="text-gray-600">Thua {getRoundLabel(i + 1, totalRounds).toLowerCase()}</span>
                  <input type="number" min="0" value={roundRewards[r]?.xp || 0} onChange={e => updateReward(r, 'xp', e.target.value)}
                    className="w-full border rounded px-1 py-0.5 text-center text-xs" />
                  <input type="number" min="0" value={roundRewards[r]?.gems || 0} onChange={e => updateReward(r, 'gems', e.target.value)}
                    className="w-full border rounded px-1 py-0.5 text-center text-xs" />
                </div>
                <div className="flex gap-2 mt-1">
                  <select value={roundRewards[r]?.item_id || ''} onChange={e => updateReward(r, 'item_id', e.target.value || null)}
                    className="flex-1 border rounded px-1 py-0.5 text-[10px] text-gray-600">
                    <option value="">-- Vật phẩm --</option>
                    {allItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  {roundRewards[r]?.item_id && (
                    <input type="number" min="1" value={roundRewards[r]?.item_quantity || 1} onChange={e => updateReward(r, 'item_quantity', e.target.value)}
                      className="w-12 border rounded px-1 py-0.5 text-center text-[10px]" title="Số lượng" />
                  )}
                  <select value={roundRewards[r]?.chest_id || ''} onChange={e => updateReward(r, 'chest_id', e.target.value || null)}
                    className="flex-1 border rounded px-1 py-0.5 text-[10px] text-gray-600">
                    <option value="">-- Rương --</option>
                    {allChests.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            )
          })}
          <div className="border-t bg-yellow-50 px-3 py-1.5">
            <div className="grid grid-cols-[1fr_60px_60px] items-center text-xs font-medium">
              <span className="text-yellow-700">Vô địch</span>
              <input type="number" min="0" value={roundRewards.winner?.xp || 0} onChange={e => updateReward('winner', 'xp', e.target.value)}
                className="w-full border border-yellow-300 rounded px-1 py-0.5 text-center text-xs" />
              <input type="number" min="0" value={roundRewards.winner?.gems || 0} onChange={e => updateReward('winner', 'gems', e.target.value)}
                className="w-full border border-yellow-300 rounded px-1 py-0.5 text-center text-xs" />
            </div>
            <div className="flex gap-2 mt-1">
              <select value={roundRewards.winner?.item_id || ''} onChange={e => updateReward('winner', 'item_id', e.target.value || null)}
                className="flex-1 border border-yellow-300 rounded px-1 py-0.5 text-[10px] text-gray-600">
                <option value="">-- Vật phẩm --</option>
                {allItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {roundRewards.winner?.item_id && (
                <input type="number" min="1" value={roundRewards.winner?.item_quantity || 1} onChange={e => updateReward('winner', 'item_quantity', e.target.value)}
                  className="w-12 border border-yellow-300 rounded px-1 py-0.5 text-center text-[10px]" title="Số lượng" />
              )}
              <select value={roundRewards.winner?.chest_id || ''} onChange={e => updateReward('winner', 'chest_id', e.target.value || null)}
                className="flex-1 border border-yellow-300 rounded px-1 py-0.5 text-[10px] text-gray-600">
                <option value="">-- Rương --</option>
                {allChests.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="w-full bg-blue-600 text-white font-medium text-sm rounded-lg py-2.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Đang tạo...' : 'Tạo giải đấu'}
      </button>
    </div>
  )
}

// ─── Tournament Detail View ──────────────────────────────────
const TournamentDetail = ({ tournamentId, onBack }) => {
  const { tournament, participants, matches, teams, loading, fetchTournament, recordMatchResult, advanceRound, checkMatchScores, startTournament } = useTournament()
  const [scoreMatch, setScoreMatch] = useState(null)
  const [advancing, setAdvancing] = useState(false)
  const [advanceError, setAdvanceError] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [orderedParts, setOrderedParts] = useState([])
  const [reorderSaving, setReorderSaving] = useState(false)

  const participantSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    if (!tournamentId) return
    // Auto-check training scores then load tournament data
    checkMatchScores(tournamentId).catch(() => {}).finally(() => fetchTournament(tournamentId))
  }, [tournamentId, fetchTournament, checkMatchScores])

  // Poll for score updates while the tournament is active (admin leaves this page open all day)
  useEffect(() => {
    if (!tournamentId || tournament?.status !== 'active') return
    const id = setInterval(async () => {
      try {
        const result = await checkMatchScores(tournamentId)
        if (result?.updated > 0) await fetchTournament(tournamentId)
      } catch {
        // swallow — next tick will retry
      }
    }, 30000)
    return () => clearInterval(id)
  }, [tournamentId, tournament?.status, fetchTournament, checkMatchScores])

  useEffect(() => {
    setOrderedParts(participants)
  }, [participants])

  const handleParticipantDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = orderedParts.findIndex(p => p.user_id === active.id)
    const newIdx = orderedParts.findIndex(p => p.user_id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(orderedParts, oldIdx, newIdx)
    setOrderedParts(reordered)
    setReorderSaving(true)
    try {
      // Two-phase update to avoid any (tournament_id, seed) unique collisions.
      await Promise.all(reordered.map((p, i) =>
        supabase.from('tournament_participants')
          .update({ seed: -(i + 1) })
          .eq('tournament_id', tournamentId)
          .eq('user_id', p.user_id)
      ))
      await Promise.all(reordered.map((p, i) =>
        supabase.from('tournament_participants')
          .update({ seed: i + 1 })
          .eq('tournament_id', tournamentId)
          .eq('user_id', p.user_id)
      ))
    } catch (err) {
      console.error('reorder participants failed', err)
    } finally {
      setReorderSaving(false)
    }
  }

  const handleRemoveParticipant = async (participant) => {
    const name = participant.user?.full_name || 'người chơi này'
    if (!confirm(`Xóa ${name} khỏi giải đấu?`)) return
    try {
      const { error } = await supabase.from('tournament_participants')
        .delete()
        .eq('tournament_id', tournamentId)
        .eq('user_id', participant.user_id)
      if (error) throw error
      await fetchTournament(tournamentId)
    } catch (err) {
      console.error('remove participant failed', err)
      alert(err.message || 'Xóa thất bại')
    }
  }

  const handleShuffleParticipants = async () => {
    if (orderedParts.length < 2) return
    const shuffled = [...orderedParts]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    setOrderedParts(shuffled)
    setReorderSaving(true)
    try {
      await Promise.all(shuffled.map((p, i) =>
        supabase.from('tournament_participants')
          .update({ seed: -(i + 1) })
          .eq('tournament_id', tournamentId)
          .eq('user_id', p.user_id)
      ))
      await Promise.all(shuffled.map((p, i) =>
        supabase.from('tournament_participants')
          .update({ seed: i + 1 })
          .eq('tournament_id', tournamentId)
          .eq('user_id', p.user_id)
      ))
    } catch (err) {
      console.error('shuffle participants failed', err)
    } finally {
      setReorderSaving(false)
    }
  }

  const handleStart = async () => {
    setStartError('')
    setStarting(true)
    try {
      await startTournament(tournamentId)
      await fetchTournament(tournamentId)
    } catch (err) {
      setStartError(err.message)
    } finally {
      setStarting(false)
    }
  }

  const handleRecordScore = async (matchId, data) => {
    await recordMatchResult(matchId, data)
    await fetchTournament(tournamentId)
  }

  const handleCheckScores = async () => {
    setChecking(true)
    setCheckResult(null)
    try {
      const result = await checkMatchScores(tournamentId)
      await fetchTournament(tournamentId)
      setCheckResult(result)
      setTimeout(() => setCheckResult(null), 4000)
    } catch (err) {
      console.error(err)
    } finally {
      setChecking(false)
    }
  }

  const handleAdvance = async () => {
    setAdvanceError('')
    setAdvancing(true)
    try {
      const result = await advanceRound(tournamentId)
      await fetchTournament(tournamentId)
      if (result?.completed) {
        // Tournament completed, bracket will show winner
      }
    } catch (err) {
      setAdvanceError(err.message)
    } finally {
      setAdvancing(false)
    }
  }

  if (loading && !tournament) {
    return <div className="text-center text-gray-400 py-8">Đang tải...</div>
  }

  if (!tournament) {
    return <div className="text-center text-gray-400 py-8">Không tìm thấy giải đấu</div>
  }

  const currentRoundMatches = matches.filter(m => m.round === tournament.current_round)
  // A match is "decided" if it's already completed, or both players have scored
  // (the winner will be locked in at advance time).
  const allCurrentDecided = currentRoundMatches.length > 0 && currentRoundMatches.every(m =>
    m.status === 'completed' || (m.player1_score != null && m.player2_score != null)
  )
  const allCurrentCompleted = allCurrentDecided
  const isLastRound = tournament.current_round >= tournament.total_rounds
  const canAdvance = allCurrentDecided && tournament.status === 'active'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-800">{tournament.name}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLES[tournament.status]}`}>
              {STATUS_LABELS[tournament.status]}
            </span>
            <span className="text-xs text-gray-500">
              <Gamepad2 className="w-3 h-3 inline mr-0.5" />{GAME_TYPE_LABELS[tournament.game_type]}
            </span>
            <span className="text-xs text-gray-500">
              <Users className="w-3 h-3 inline mr-0.5" />
              {tournament.mode === 'team'
                ? `${tournament.bracket_size} đội × ${tournament.team_size} người`
                : `${tournament.bracket_size} người`}
            </span>
            {tournament.mode === 'team' && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                Team
              </span>
            )}
            {tournament.best_of > 1 && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                Bo{tournament.best_of}
              </span>
            )}
            <span className="text-xs text-gray-500">
              Vòng {tournament.current_round}/{tournament.total_rounds}
            </span>
            {tournament.entry_fee > 0 && (
              <span className="text-xs text-amber-600 font-medium">
                Phí: {tournament.entry_fee} XP
              </span>
            )}
          </div>
          {tournament.info && (
            <div className="mt-2 text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              {tournament.info}
            </div>
          )}
        </div>
      </div>

      {/* Registration Phase */}
      {tournament.status === 'registration' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-purple-800">
              {tournament.mode === 'team'
                ? `Đang mở đăng ký: ${teams.length}/${tournament.bracket_size} đội`
                : `Đang mở đăng ký: ${participants.length}/${tournament.bracket_size} người`}
            </div>
            {tournament.allowed_levels && tournament.allowed_levels.length > 0 && (
              <span className="text-[10px] text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                Level: {tournament.allowed_levels.join(', ')}
              </span>
            )}
          </div>
          <div className="w-full bg-purple-200 rounded-full h-2">
            <div className="bg-purple-600 h-2 rounded-full transition-all" style={{
              width: `${tournament.mode === 'team'
                ? (teams.length / tournament.bracket_size) * 100
                : (participants.length / tournament.bracket_size) * 100}%`
            }} />
          </div>

          {/* Team mode: show teams */}
          {tournament.mode === 'team' && teams.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {teams.map((team) => (
                <div key={team.id} className="border border-purple-200 rounded-lg bg-white p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-800">{team.name}</span>
                    <span className="text-[10px] text-gray-400">
                      {(team.members || []).length}/{tournament.team_size}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {(team.members || []).map(m => (
                      <div key={m.user_id} className="flex items-center gap-2 text-xs text-gray-600 pl-1">
                        {m.user?.avatar_url ? (
                          <img src={m.user.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                        )}
                        <span className="truncate">{m.user?.full_name || 'Student'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Solo mode: participant reorder */}
          {tournament.mode !== 'team' && orderedParts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-purple-700">
                  Sắp xếp cặp đấu (kéo để đổi thứ tự)
                </span>
                <div className="flex items-center gap-2">
                  {reorderSaving && <span className="text-[10px] text-purple-500">Đang lưu...</span>}
                  <button
                    onClick={handleShuffleParticipants}
                    disabled={reorderSaving || orderedParts.length < 2}
                    className="text-[10px] text-purple-600 hover:underline flex items-center gap-1 disabled:opacity-40"
                  >
                    <Shuffle className="w-3 h-3" /> Xáo trộn
                  </button>
                </div>
              </div>
              <DndContext sensors={participantSensors} collisionDetection={closestCenter} onDragEnd={handleParticipantDragEnd}>
                <SortableContext items={orderedParts.map(p => p.user_id)} strategy={verticalListSortingStrategy}>
                  <div className="border border-purple-200 rounded-lg bg-white max-h-64 overflow-y-auto">
                    {orderedParts.map((p, i) => (
                      <SortableParticipant
                        key={p.user_id}
                        participant={p}
                        index={i}
                        total={orderedParts.length}
                        onRemove={handleRemoveParticipant}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleStart}
              disabled={starting || (tournament.mode === 'team' ? teams.length !== tournament.bracket_size : participants.length !== tournament.bracket_size)}
              className="bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              {starting ? 'Đang bắt đầu...' : 'Bắt đầu giải đấu'}
            </button>
            {(tournament.mode === 'team' ? teams.length !== tournament.bracket_size : participants.length !== tournament.bracket_size) && (
              <span className="text-xs text-purple-600">
                {tournament.mode === 'team'
                  ? `Cần đủ ${tournament.bracket_size} đội để bắt đầu`
                  : `Cần đủ ${tournament.bracket_size} người để bắt đầu`}
              </span>
            )}
          </div>
          {startError && <div className="text-xs text-red-600">{startError}</div>}
        </div>
      )}

      {/* Action Buttons */}
      {tournament.status === 'active' && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Check Scores from training_scores */}
          <button
            onClick={handleCheckScores}
            disabled={checking}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {checking ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Trophy className="w-4 h-4" />
            )}
            {checking ? 'Đang kiểm tra...' : 'Cập nhật điểm'}
          </button>

          {checkResult && (
            <span className="text-xs text-green-600 font-medium">
              {checkResult.updated > 0 ? `Đã cập nhật ${checkResult.updated} trận` : 'Chưa có kết quả mới'}
            </span>
          )}

          {/* Advance Round */}
          <button
            onClick={handleAdvance}
            disabled={!canAdvance || advancing}
            className="bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            {isLastRound && allCurrentCompleted ? 'Kết thúc giải đấu' : 'Chuyển vòng tiếp'}
          </button>
          {!allCurrentCompleted && (
            <span className="text-xs text-amber-600">
              Học sinh chơi {GAME_TYPE_LABELS[tournament.game_type]} - bấm "Cập nhật điểm" để lấy kết quả
            </span>
          )}
          {advanceError && <span className="text-xs text-red-600">{advanceError}</span>}
        </div>
      )}

      {/* Winner Banner */}
      {tournament.status === 'completed' && (tournament.winner_id || tournament.winning_team_id) && (() => {
        if (tournament.mode === 'team') {
          const winningTeam = teams.find(t => t.id === tournament.winning_team_id)
          return (
            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-xl p-4 flex items-center gap-3">
              <Trophy className="w-8 h-8 text-yellow-500" />
              <div>
                <div className="text-xs text-yellow-600 font-semibold uppercase">Đội vô địch</div>
                <div className="text-lg font-bold text-yellow-800">{winningTeam?.name || 'Winner'}</div>
                {winningTeam?.members && (
                  <div className="text-[10px] text-yellow-700 mt-0.5">
                    {winningTeam.members.map(m => m.user?.full_name?.split(' ').pop()).filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
              <div className="ml-auto text-right text-xs text-yellow-700">
                <div>+{tournament.round_rewards?.winner?.xp || 0} XP/người</div>
                <div>+{tournament.round_rewards?.winner?.gems || 0} Gems/người</div>
              </div>
            </div>
          )
        }
        const winner = participants.find(p => p.user_id === tournament.winner_id)
        return (
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-xl p-4 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-500" />
            <div>
              <div className="text-xs text-yellow-600 font-semibold uppercase">Nhà vô địch</div>
              <div className="text-lg font-bold text-yellow-800">{winner?.user?.full_name?.split(' ').pop() || 'Winner'}</div>
            </div>
            <div className="ml-auto text-right text-xs text-yellow-700">
              <div>+{tournament.round_rewards?.winner?.xp || 0} XP</div>
              <div>+{tournament.round_rewards?.winner?.gems || 0} Gems</div>
            </div>
          </div>
        )
      })()}

      {/* Bracket */}
      <div className="bg-white rounded-xl border shadow-sm">
        <TournamentBracket
          matches={matches}
          participants={participants}
          teams={teams}
          totalRounds={tournament.total_rounds}
          currentRound={tournament.current_round}
          bestOf={tournament.best_of}
          onRecordScore={tournament.status === 'active' ? (match) => setScoreMatch(match) : undefined}
        />
      </div>

      {/* Score Modal */}
      {scoreMatch && (
        <ScoreModal
          match={scoreMatch}
          participants={participants}
          teams={teams}
          onSave={handleRecordScore}
          onClose={() => setScoreMatch(null)}
        />
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────
const TournamentManagement = () => {
  const { tournaments, loading, fetchTournaments, deleteTournament } = useTournament()
  const [view, setView] = useState('list') // list | create | detail
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => { fetchTournaments() }, [fetchTournaments])

  const handleCreated = () => {
    setView('list')
    fetchTournaments()
  }

  const handleDelete = async (id) => {
    if (!confirm('Xóa giải đấu này?')) return
    try {
      await deleteTournament(id)
      fetchTournaments()
    } catch (err) {
      console.error(err)
    }
  }

  if (view === 'create') {
    return <CreateForm onCreated={handleCreated} onCancel={() => setView('list')} />
  }

  if (view === 'detail' && selectedId) {
    return <TournamentDetail tournamentId={selectedId} onBack={() => { setView('list'); fetchTournaments() }} />
  }

  // List View
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Giải đấu</h2>
        <button
          onClick={() => setView('create')}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Tạo mới
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-8">Đang tải...</div>
      ) : tournaments.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <Trophy className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <div className="text-sm">Chưa có giải đấu nào</div>
        </div>
      ) : (
        <div className="space-y-2">
          {tournaments.map(t => (
            <div
              key={t.id}
              className="bg-white border rounded-xl p-4 hover:shadow-sm transition-shadow cursor-pointer flex items-center gap-3"
              onClick={() => { setSelectedId(t.id); setView('detail') }}
            >
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-800 truncate">{t.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${STATUS_STYLES[t.status]}`}>
                    {STATUS_LABELS[t.status]}
                  </span>
                  <span className="text-[11px] text-gray-500">{GAME_TYPE_LABELS[t.game_type]}</span>
                  <span className="text-[11px] text-gray-500">
                    {t.mode === 'team' ? `${t.bracket_size} đội` : `${t.bracket_size} người`}
                  </span>
                  {t.mode === 'team' && (
                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">Team</span>
                  )}
                  {t.best_of > 1 && (
                    <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Bo{t.best_of}</span>
                  )}
                  <span className="text-[11px] text-gray-500">Vòng {t.current_round}/{t.total_rounds}</span>
                  {t.entry_fee > 0 && (
                    <span className="text-[11px] text-amber-600 font-medium">{t.entry_fee} XP</span>
                  )}
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(t.id) }}
                className="text-gray-400 hover:text-red-500 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TournamentManagement
