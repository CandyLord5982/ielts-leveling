import { useRef, useState } from 'react';
import { Users, Star, Flag, Camera, X, Loader2, Swords } from 'lucide-react';
import { supabase } from '../../../supabase/client';

const ratingOptions = [
  { value: 'wow', label: 'Wow', color: 'bg-green-500 text-white', inactive: 'bg-white text-green-700 border border-green-300 hover:bg-green-100' },
  { value: 'good', label: 'Good', color: 'bg-yellow-500 text-white', inactive: 'bg-white text-yellow-700 border border-yellow-300 hover:bg-yellow-100' },
  { value: 'ok', label: 'Ok', color: 'bg-red-500 text-white', inactive: 'bg-white text-red-700 border border-red-300 hover:bg-red-100' },
];

const ClassPerformanceView = ({ students, courseId, records, onChange, onMarkAll, loading }) => {
  const fileInputRefs = useRef({});
  const scoreRefs = useRef({});
  const maxScoreRefs = useRef({});
  const feedbackRefs = useRef({});
  const [uploading, setUploading] = useState({});
  const [pullingBattle, setPullingBattle] = useState(false);

  const pullFromLiveBattle = async () => {
    if (!courseId) return;
    setPullingBattle(true);
    try {
      const { data: session } = await supabase
        .from('live_battle_sessions')
        .select('id, winner_team')
        .eq('course_id', courseId)
        .eq('status', 'finished')
        .order('finished_at', { ascending: false })
        .limit(1)
        .single();

      if (!session) {
        alert('No finished live battle found for this class.');
        return;
      }

      const { data: participants } = await supabase
        .from('live_battle_participants')
        .select('user_id, team')
        .eq('session_id', session.id);

      if (!participants) return;

      for (const p of participants) {
        const isWinner = session.winner_team === 'draw' ? null : p.team === session.winner_team;
        const rating = isWinner === null ? 'good' : isWinner ? 'wow' : 'good';
        onChange(p.user_id, { performance_rating: rating });
      }
    } catch (err) {
      console.error('Failed to pull live battle:', err);
    } finally {
      setPullingBattle(false);
    }
  };

  const fieldOrder = ['feedback', 'score', 'maxScore'];
  const fieldRefMap = {
    feedback: feedbackRefs,
    score: scoreRefs,
    maxScore: maxScoreRefs,
  };

  const handleFieldKeyDown = (e, fieldName, studentIndex) => {
    const fi = fieldOrder.indexOf(fieldName);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = fieldOrder[fi + 1];
      if (next) fieldRefMap[next].current[students[studentIndex].id]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = fieldOrder[fi - 1];
      if (prev) fieldRefMap[prev].current[students[studentIndex].id]?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = students[studentIndex + 1];
      if (next) fieldRefMap[fieldName].current[next.id]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = students[studentIndex - 1];
      if (prev) fieldRefMap[fieldName].current[prev.id]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const nextField = fieldOrder[fi + 1];
      if (nextField) {
        fieldRefMap[nextField].current[students[studentIndex].id]?.focus();
      } else {
        const nextStudent = students[studentIndex + 1];
        if (nextStudent) fieldRefMap[fieldOrder[0]].current[nextStudent.id]?.focus();
      }
    }
  };

  const handlePhotoUpload = async (studentId, file) => {
    if (!file) return;

    setUploading(prev => ({ ...prev, [studentId]: true }));
    try {
      const ext = file.name.split('.').pop();
      const path = `performance/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('lesson-photos')
        .upload(path, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from('lesson-photos')
        .getPublicUrl(path);

      onChange(studentId, { photo_url: publicData.publicUrl });
    } catch (err) {
      console.error('Photo upload failed:', err);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setUploading(prev => ({ ...prev, [studentId]: false }));
      if (fileInputRefs.current[studentId]) {
        fileInputRefs.current[studentId].value = '';
      }
    }
  };

  const handleRemovePhoto = async (studentId) => {
    const record = records[studentId] || {};
    const url = record.photo_url || '';
    if (url) {
      // Extract storage path from public URL
      const match = url.match(/lesson-photos\/(.+)$/);
      if (match) {
        await supabase.storage.from('lesson-photos').remove([match[1]]);
      }
    }
    onChange(studentId, { photo_url: '' });
  };

  return (
    <div className="space-y-6">
      {/* Mark All Buttons */}
      <div className="flex flex-wrap gap-2">
        {ratingOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => onMarkAll(opt.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${opt.inactive}`}
          >
            Mark All {opt.label}
          </button>
        ))}
        <button
          onClick={pullFromLiveBattle}
          disabled={pullingBattle}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-white text-purple-700 border border-purple-300 hover:bg-purple-100"
        >
          <Swords className="w-4 h-4" />
          {pullingBattle ? 'Pulling...' : 'Pull from Live Battle'}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Enrolled</h3>
          </div>
        ) : (
          <div>
            {students.map((student, si) => {
              const record = records[student.id] || {};
              const rating = record.performance_rating || '';
              const starFlag = record.star_flag || '';
              const photoUrl = record.photo_url || '';
              const isUploading = uploading[student.id];

              return (
                <div key={student.id} className="flex flex-col md:flex-row md:items-center md:justify-between p-3 md:p-4 border-b last:border-b-0 hover:bg-gray-50 gap-2">
                  {/* Top row: avatar, name, star/flag */}
                  <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      {student.avatar_url ? (
                        <img src={student.avatar_url} alt={student.full_name} className="w-8 h-8 md:w-10 md:h-10 rounded-full" />
                      ) : (
                        <span className="text-blue-600 font-semibold text-sm md:text-base">
                          {student.full_name?.charAt(0).toUpperCase() || 'S'}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm md:text-base">{student.full_name}</p>
                      {student.email && (
                        <p className="text-xs text-gray-400 truncate">{student.email.split('@')[0]}</p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => onChange(student.id, { star_flag: starFlag === 'star' ? '' : 'star' })}
                        className="p-1 rounded transition-colors"
                        title="Star (good)"
                      >
                        <Star className={`w-5 h-5 ${starFlag === 'star' ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 hover:text-yellow-300'}`} />
                      </button>
                      <button
                        onClick={() => onChange(student.id, { star_flag: starFlag === 'flag' ? '' : 'flag' })}
                        className="p-1 rounded transition-colors"
                        title="Flag (needs attention)"
                      >
                        <Flag className={`w-5 h-5 ${starFlag === 'flag' ? 'fill-red-500 text-red-500' : 'text-gray-300 hover:text-red-300'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Bottom row on mobile: camera, feedback, ratings */}
                  <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                    {/* Photo upload */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <input
                        ref={el => fileInputRefs.current[student.id] = el}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handlePhotoUpload(student.id, e.target.files[0])}
                      />
                      {photoUrl ? (
                        <div className="relative group">
                          <img
                            src={photoUrl}
                            alt="Evidence"
                            className="w-8 h-8 md:w-10 md:h-10 rounded object-cover border border-gray-300 cursor-pointer"
                            onClick={() => window.open(photoUrl, '_blank')}
                          />
                          <button
                            onClick={() => handleRemovePhoto(student.id)}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => fileInputRefs.current[student.id]?.click()}
                          disabled={isUploading}
                          className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                          title="Add evidence photo"
                        >
                          {isUploading ? (
                            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                          ) : (
                            <Camera className="w-5 h-5" />
                          )}
                        </button>
                      )}
                    </div>
                    <input
                      ref={el => feedbackRefs.current[student.id] = el}
                      type="text"
                      placeholder="Feedback..."
                      value={record.notes || ''}
                      onChange={(e) => onChange(student.id, { notes: e.target.value })}
                      onKeyDown={(e) => handleFieldKeyDown(e, 'feedback', si)}
                      className="border border-gray-300 rounded-lg px-2 md:px-3 py-1.5 md:py-2 flex-1 md:w-48 md:flex-none text-sm focus:ring-2 focus:ring-blue-500 min-w-0"
                    />
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <input
                        ref={el => scoreRefs.current[student.id] = el}
                        type="number"
                        min="0"
                        placeholder="—"
                        value={record.score ?? ''}
                        onChange={(e) => onChange(student.id, { score: e.target.value === '' ? null : Number(e.target.value) })}
                        onKeyDown={(e) => handleFieldKeyDown(e, 'score', si)}
                        className="w-10 md:w-12 border border-gray-300 rounded-lg px-1 py-1.5 md:py-2 text-center text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-gray-400 text-xs">/</span>
                      <input
                        ref={el => maxScoreRefs.current[student.id] = el}
                        type="number"
                        min="1"
                        placeholder="—"
                        value={record.max_score ?? ''}
                        onChange={(e) => onChange(student.id, { max_score: e.target.value === '' ? null : Number(e.target.value) })}
                        onKeyDown={(e) => handleFieldKeyDown(e, 'maxScore', si)}
                        className="w-10 md:w-12 border border-gray-300 rounded-lg px-1 py-1.5 md:py-2 text-center text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {ratingOptions.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => onChange(student.id, { performance_rating: opt.value })}
                          className={`px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                            rating === opt.value ? opt.color : opt.inactive
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassPerformanceView;
