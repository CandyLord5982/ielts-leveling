import { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { X, Shuffle, Swords, ArrowLeftRight, Users, StopCircle } from 'lucide-react';

const ClassWarSetupModal = ({ courseId, onClose, onStarted, existingWar, teamAXP: propTeamAXP, teamBXP: propTeamBXP, teamAMembers: propTeamA, teamBMembers: propTeamB }) => {
  const { user } = useAuth();
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [teamAMembers, setTeamAMembers] = useState([]);
  const [teamBMembers, setTeamBMembers] = useState([]);
  const [teamAName, setTeamAName] = useState(existingWar?.team_a_name || 'Red Team');
  const [teamBName, setTeamBName] = useState(existingWar?.team_b_name || 'Blue Team');
  const [warName, setWarName] = useState(existingWar?.name || 'Class War');
  const [startDate, setStartDate] = useState(existingWar?.started_at ? existingWar.started_at.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ending, setEnding] = useState(false);
  const isEditing = !!existingWar;

  useEffect(() => {
    const fetchData = async () => {
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('student_id, users:student_id(id, full_name, real_name, avatar_url)')
        .eq('course_id', courseId)
        .eq('is_active', true);
      const students = (enrollments || []).map(e => e.users).filter(Boolean);
      setEnrolledStudents(students);

      // Load teams from existing war being edited, or from the last war for this course
      const warIdToLoad = existingWar?.id;
      let lastWarData = null;

      if (!warIdToLoad) {
        // Fetch the most recent war (active or ended) to preserve teams
        const { data: lastWar } = await supabase
          .from('class_wars')
          .select('id, team_a_name, team_b_name')
          .eq('course_id', courseId)
          .in('status', ['active', 'ended'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        lastWarData = lastWar;
      }

      const loadWarId = warIdToLoad || lastWarData?.id;
      if (loadWarId) {
        const { data: members } = await supabase
          .from('class_war_members')
          .select('user_id, team')
          .eq('war_id', loadWarId);
        const studentMap = Object.fromEntries(students.map(s => [s.id, s]));
        const a = [], b = [];
        (members || []).forEach(m => {
          const s = studentMap[m.user_id];
          if (s) (m.team === 'A' ? a : b).push(s);
        });
        setTeamAMembers(a);
        setTeamBMembers(b);

        // Pre-fill team names from last war when creating new
        if (!existingWar && lastWarData) {
          setTeamAName(lastWarData.team_a_name || 'Red Team');
          setTeamBName(lastWarData.team_b_name || 'Blue Team');
        }
      }

      setLoading(false);
    };
    fetchData();
  }, [courseId, existingWar]);

  const shuffleTeams = () => {
    const students = [...enrolledStudents];
    for (let i = students.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [students[i], students[j]] = [students[j], students[i]];
    }
    const mid = Math.ceil(students.length / 2);
    setTeamAMembers(students.slice(0, mid));
    setTeamBMembers(students.slice(mid));
  };

  const moveToTeam = (student, fromTeam) => {
    if (fromTeam === 'A') {
      setTeamAMembers(prev => prev.filter(s => s.id !== student.id));
      setTeamBMembers(prev => [...prev, student]);
    } else {
      setTeamBMembers(prev => prev.filter(s => s.id !== student.id));
      setTeamAMembers(prev => [...prev, student]);
    }
  };

  const handleStart = async () => {
    if (teamAMembers.length === 0 || teamBMembers.length === 0) return;
    setSaving(true);
    try {
      if (isEditing) {
        // Update war name and team names
        const { error: updateError } = await supabase
          .from('class_wars')
          .update({ name: warName, team_a_name: teamAName, team_b_name: teamBName, started_at: new Date(startDate + 'T00:00:00+07:00').toISOString() })
          .eq('id', existingWar.id);
        if (updateError) throw updateError;

        // Replace all members
        await supabase.from('class_war_members').delete().eq('war_id', existingWar.id);
        const members = [
          ...teamAMembers.map(s => ({ war_id: existingWar.id, user_id: s.id, team: 'A' })),
          ...teamBMembers.map(s => ({ war_id: existingWar.id, user_id: s.id, team: 'B' })),
        ];
        const { error: membersError } = await supabase.from('class_war_members').insert(members);
        if (membersError) throw membersError;
      } else {
        const { data: warData, error: warError } = await supabase
          .from('class_wars')
          .insert({
            course_id: courseId,
            name: warName,
            team_a_name: teamAName,
            team_b_name: teamBName,
            started_at: new Date(startDate + 'T00:00:00+07:00').toISOString(),
            status: 'active',
            created_by: user.id,
          })
          .select()
          .single();
        if (warError) throw warError;

        const members = [
          ...teamAMembers.map(s => ({ war_id: warData.id, user_id: s.id, team: 'A' })),
          ...teamBMembers.map(s => ({ war_id: warData.id, user_id: s.id, team: 'B' })),
        ];
        const { error: membersError } = await supabase.from('class_war_members').insert(members);
        if (membersError) throw membersError;
      }

      onStarted?.();
      onClose();
    } catch (err) {
      console.error('Error saving war:', err);
      alert('Failed to save war: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const renderTeamCol = (name, setName, members, teamKey, colors) => (
    <div className={`flex-1 border ${colors.border} rounded-xl overflow-hidden`}>
      <div className={`${colors.bg} px-3 py-2`}>
        <input value={name} onChange={e => setName(e.target.value)}
          className="bg-transparent border-b border-white/30 text-white font-bold text-sm w-full outline-none placeholder-white/50"
          placeholder="Team name..." />
        <div className="text-xs text-white/70 mt-0.5">{members.length} members</div>
      </div>
      <div className="p-2 space-y-1 max-h-60 overflow-y-auto bg-white">
        {members.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No members</p>}
        {members.map(s => (
          <div key={s.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 group">
            <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden shrink-0">
              {s.avatar_url ? (
                <img src={s.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-500">
                  {(s.real_name || s.full_name || '?')[0].toUpperCase()}
                </div>
              )}
            </div>
            <span className="flex-1 text-xs text-gray-700 truncate">{s.real_name || s.full_name}</span>
            <button onClick={() => moveToTeam(s, teamKey)}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded transition-all"
              title="Swap team">
              <ArrowLeftRight className="w-3 h-3 text-gray-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-2 pb-16 sm:pb-4 sm:px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-purple-600 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5" />
            <span className="font-bold">{isEditing ? 'Edit Teams' : 'Start Class War'}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">War Name</label>
                    <input value={warName} onChange={e => setWarName(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44" placeholder="Class War" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {enrolledStudents.length} students
                  </span>
                  <button onClick={shuffleTeams} disabled={enrolledStudents.length < 2}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50">
                    <Shuffle className="w-3.5 h-3.5" /> Shuffle
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                {renderTeamCol(teamAName, setTeamAName, teamAMembers, 'A', {
                  bg: 'bg-gradient-to-r from-red-600 to-red-500', border: 'border-red-200',
                })}
                {renderTeamCol(teamBName, setTeamBName, teamBMembers, 'B', {
                  bg: 'bg-gradient-to-r from-blue-600 to-blue-500', border: 'border-blue-200',
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 flex items-center justify-between">
          {isEditing ? (
            <button
              onClick={async () => {
                if (!window.confirm('End this Class War and distribute rewards?')) return;
                setEnding(true);
                try {
                  const { data: settings } = await supabase
                    .from('site_settings')
                    .select('setting_key, setting_value')
                    .in('setting_key', ['class_war_winner_rewards', 'class_war_loser_rewards']);
                  const emptyR = { xp: 0, gems: 0, items: [] };
                  let winR = emptyR, losR = emptyR;
                  (settings || []).forEach(s => {
                    try {
                      const v = JSON.parse(s.setting_value);
                      if (s.setting_key === 'class_war_winner_rewards') winR = { ...emptyR, ...v };
                      if (s.setting_key === 'class_war_loser_rewards') losR = { ...emptyR, ...v };
                    } catch {}
                  });

                  const aWins = propTeamAXP >= propTeamBXP;
                  const winnerIds = (aWins ? propTeamA : propTeamB).filter(m => !m.isSupporter).map(m => m.id);
                  const loserIds = (aWins ? propTeamB : propTeamA).filter(m => !m.isSupporter).map(m => m.id);

                  const giveRewards = async (ids, reward) => {
                    if (ids.length === 0 || (!reward.xp && !reward.gems && !(reward.items?.length))) return;
                    for (const uid of ids) {
                      if (reward.xp > 0 || reward.gems > 0) {
                        const { data: u } = await supabase.from('users').select('xp, gems').eq('id', uid).single();
                        if (u) {
                          const upd = { updated_at: new Date().toISOString() };
                          if (reward.xp > 0) upd.xp = (u.xp || 0) + reward.xp;
                          if (reward.gems > 0) upd.gems = (u.gems || 0) + reward.gems;
                          await supabase.from('users').update(upd).eq('id', uid);
                        }
                      }
                      if (reward.items?.length > 0) {
                        const { data: u } = await supabase.from('users').select('full_name').eq('id', uid).single();
                        for (const item of reward.items) {
                          const addQty = item.quantity || 1;
                          const { data: existing } = await supabase.from('user_inventory')
                            .select('quantity').eq('user_id', uid).eq('item_id', item.item_id).single();
                          await supabase.from('user_inventory').upsert({
                            user_id: uid, user_name: u?.full_name || '', item_id: item.item_id,
                            item_name: item.item_name, quantity: (existing?.quantity || 0) + addQty,
                          }, { onConflict: 'user_id,item_id' });
                        }
                      }
                    }
                  };

                  await giveRewards(winnerIds, winR);
                  await giveRewards(loserIds, losR);

                  await supabase
                    .from('class_wars')
                    .update({ status: 'ended', ended_at: new Date().toISOString() })
                    .eq('id', existingWar.id);

                  onStarted?.();
                  onClose();
                } catch (err) {
                  alert('Failed to end war: ' + (err.message || err));
                } finally {
                  setEnding(false);
                }
              }}
              disabled={ending}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 font-medium"
            >
              <StopCircle className="w-4 h-4" />
              {ending ? 'Ending...' : 'End War'}
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={handleStart}
              disabled={saving || teamAMembers.length === 0 || teamBMembers.length === 0}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-red-500 via-purple-500 to-blue-500 text-white font-bold text-sm rounded-lg hover:opacity-90 disabled:opacity-50 shadow">
              <Swords className="w-4 h-4" /> {isEditing ? 'Save Changes' : 'Start War!'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassWarSetupModal;
