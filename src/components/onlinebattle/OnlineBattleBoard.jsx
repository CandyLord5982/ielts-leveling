import { useState } from 'react'
import { ArrowRightLeft, Edit2, Check, X } from 'lucide-react'
import { TEAMS, teamName } from './onlineBattleShared'

// The dashboard both sides look at: two teams, their scores and who is on them.
// Students get it read-only; the teacher's page passes `teacher` handlers to
// move / remove students, rename teams and give points.

const rarityStyle = {
  common: 'border-gray-300 bg-gray-50',
  uncommon: 'border-green-400 bg-green-50',
  rare: 'border-blue-400 bg-blue-50',
  epic: 'border-purple-500 bg-purple-50',
  legendary: 'border-yellow-400 bg-gradient-to-br from-yellow-50 to-amber-50',
}

const POINT_BUTTONS = [-1, 1, 2, 3, 5]

const theme = {
  a: { border: 'border-red-300', header: 'bg-gradient-to-r from-red-500 to-red-600', bg: 'bg-red-50' },
  b: { border: 'border-blue-300', header: 'bg-gradient-to-r from-blue-500 to-blue-600', bg: 'bg-blue-50' },
}

const TeamColumn = ({ team, room, members, myUserId, showScores, teacher, studentControls }) => {
  const name = teamName(room, team)
  const score = team === 'a' ? room.team_a_score : room.team_b_score
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(name)
  const colors = theme[team]

  const saveName = () => {
    const next = nameInput.trim()
    if (next && next !== name) teacher.onRename(team, next)
    setEditing(false)
  }

  return (
    <div className={`rounded-2xl ${colors.border} border-2 overflow-hidden flex flex-col bg-white`}>
      <div className={`${colors.header} text-white px-4 py-3 flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-1 min-w-0">
          {editing ? (
            <>
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveName()}
                maxLength={30}
                className="bg-white/20 text-white rounded px-2 py-0.5 text-sm w-36 outline-none"
                autoFocus
              />
              <button onClick={saveName} className="p-1 hover:bg-white/20 rounded" title="Save name">
                <Check className="w-3 h-3" />
              </button>
            </>
          ) : (
            <>
              <span className="font-bold text-lg truncate">{name}</span>
              {teacher && (
                <button
                  onClick={() => { setNameInput(name); setEditing(true) }}
                  className="p-1 hover:bg-white/20 rounded flex-shrink-0"
                  title="Rename team"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
            </>
          )}
          <span className="text-xs bg-white/20 rounded-full px-2 py-0.5 flex-shrink-0">{members.length}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Student's own team only: their bonus buttons, on the same line as the team name */}
          {studentControls}
          {showScores && <span className="text-3xl font-black tabular-nums">{score}</span>}
        </div>
      </div>

      {teacher?.onAddPoints && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 border-b bg-white">
          <span className="text-xs text-gray-500 mr-1">Points:</span>
          {POINT_BUTTONS.map(value => (
            <button
              key={value}
              onClick={() => teacher.onAddPoints(team, value)}
              className={`min-w-[2.25rem] h-8 px-2 rounded-full text-sm font-bold transition-transform hover:scale-110 active:scale-95 ${value < 0 ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-700'}`}
            >
              {value > 0 ? `+${value}` : value}
            </button>
          ))}
        </div>
      )}

      <div className={`${colors.bg} p-3 flex-1`}>
        {members.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">No students yet</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {members.map(p => {
              const isMe = p.user_id === myUserId
              return (
                <div
                  key={p.id}
                  className={`relative group rounded-xl p-2 border-2 shadow-sm flex items-center gap-2 ${rarityStyle[p.pet_rarity] || 'border-gray-200 bg-white'} ${isMe ? 'ring-4 ring-yellow-400' : ''}`}
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 flex items-center justify-center">
                    {p.pet_image ? (
                      <img src={p.pet_image} alt="" className={`w-full h-full object-contain ${team === 'b' ? '-scale-x-100' : ''}`} />
                    ) : p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-xl">🥚</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-800 truncate">
                      {p.student_name}
                      {isMe && <span className="ml-1 text-[10px] font-bold bg-yellow-400 text-yellow-900 rounded px-1 align-middle">YOU</span>}
                    </div>
                    {p.pet_name && <div className="text-xs text-gray-500 truncate">{p.pet_name}</div>}
                    {room.status === 'finished' && (
                      <div className="text-xs font-bold text-indigo-600">+{p.xp_awarded || 0} XP</div>
                    )}
                  </div>

                  {teacher?.onMove && (
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => teacher.onMove(p)}
                        className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                        title="Move to the other team"
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => teacher.onRemove(p)}
                        className="w-5 h-5 rounded-full bg-gray-200 hover:bg-red-200 flex items-center justify-center"
                        title="Remove from the room"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// `myTeam` + `myTeamControls`: content shown inside the header of the student's own team
const OnlineBattleBoard = ({ room, participants, myUserId, teacher, myTeam, myTeamControls }) => {
  const showScores = room.status !== 'lobby'

  return (
    <div>
      {showScores && (
        <div className="flex items-center justify-center gap-6 mb-4">
          <div className="text-center">
            <div className="text-red-400 text-sm font-bold">{teamName(room, 'a')}</div>
            <div className="text-5xl font-black text-white tabular-nums drop-shadow">{room.team_a_score}</div>
          </div>
          <div className="text-gray-300 text-3xl font-black">VS</div>
          <div className="text-center">
            <div className="text-blue-400 text-sm font-bold">{teamName(room, 'b')}</div>
            <div className="text-5xl font-black text-white tabular-nums drop-shadow">{room.team_b_score}</div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        {TEAMS.map(team => (
          <TeamColumn
            key={team}
            team={team}
            room={room}
            members={participants.filter(p => p.team === team)}
            myUserId={myUserId}
            showScores={showScores}
            teacher={teacher}
            studentControls={team === myTeam ? myTeamControls : null}
          />
        ))}
      </div>
    </div>
  )
}

export default OnlineBattleBoard
