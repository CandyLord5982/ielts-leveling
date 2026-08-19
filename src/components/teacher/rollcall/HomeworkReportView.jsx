import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../supabase/client';
import { Users, Camera, X, Loader2 } from 'lucide-react';

const gradeOptions = [
  { value: 'wow', label: 'Wow', color: 'bg-green-500 text-white', inactive: 'bg-white text-green-700 border border-green-300 hover:bg-green-100' },
  { value: 'good', label: 'Good', color: 'bg-yellow-500 text-white', inactive: 'bg-white text-yellow-700 border border-yellow-300 hover:bg-yellow-100' },
  { value: 'ok', label: 'Ok', color: 'bg-red-500 text-white', inactive: 'bg-white text-red-700 border border-red-300 hover:bg-red-100' },
];

const HomeworkReportView = ({ students, courseId, records, onChange, onMarkAll, loading: externalLoading }) => {
  const [mode, setMode] = useState('course');
  const [sessions, setSessions] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedExercise, setSelectedExercise] = useState('');
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(false);
  const fileInputRefs = useRef({});
  const feedbackRefs = useRef({});
  const scoreRefs = useRef({});
  const maxScoreRefs = useRef({});
  const vocabScoreRefs = useRef({});
  const vocabMaxScoreRefs = useRef({});
  const [uploading, setUploading] = useState({});

  const fieldOrder = ['feedback', 'score', 'maxScore', 'vocabScore', 'vocabMaxScore'];
  const fieldRefMap = {
    feedback: feedbackRefs,
    score: scoreRefs,
    maxScore: maxScoreRefs,
    vocabScore: vocabScoreRefs,
    vocabMaxScore: vocabMaxScoreRefs,
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

  useEffect(() => {
    if (courseId && mode === 'course') loadSessions();
  }, [courseId, mode]);

  useEffect(() => {
    if (selectedSession) loadExercises(selectedSession);
    else { setExercises([]); setSelectedExercise(''); setProgress({}); }
  }, [selectedSession]);

  // Load progress for all exercises when session exercises are loaded, or single exercise when selected
  useEffect(() => {
    if (exercises.length > 0 && students.length > 0) {
      if (selectedExercise) {
        loadProgress(selectedExercise);
      } else {
        loadAllProgress();
      }
    } else {
      setProgress({});
    }
  }, [exercises, selectedExercise, students]);

  const loadSessions = async () => {
    const { data: units } = await supabase
      .from('units')
      .select('id, unit_number, title')
      .eq('course_id', courseId)
      .eq('is_active', true)
      .order('unit_number');

    if (!units || units.length === 0) { setSessions([]); return; }

    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('id, unit_id, session_number, title')
      .in('unit_id', units.map(u => u.id))
      .eq('is_active', true)
      .order('session_number');

    const list = (sessionsData || []).map(s => {
      const unit = units.find(u => u.id === s.unit_id);
      return { ...s, unitNumber: unit?.unit_number || 0, display: `${unit?.title || 'Unit ' + unit?.unit_number}: ${s.title}` };
    });
    list.sort((a, b) => a.unitNumber - b.unitNumber || a.session_number - b.session_number);
    setSessions(list);
  };

  const loadExercises = async (sessionId) => {
    const { data: assignments } = await supabase
      .from('exercise_assignments')
      .select('exercise:exercises(id, title, exercise_type)')
      .eq('session_id', sessionId)
      .order('order_index');

    const list = (assignments || []).filter(a => a.exercise).map(a => a.exercise);
    setExercises(list);
    setSelectedExercise('');
  };

  const scoreToGrade = (p) => {
    if (!p || p.status === 'in_progress') return 'ok';
    const pct = p.max_score > 0 ? Math.round((p.score / p.max_score) * 100) : 0;
    if (pct >= 80) return 'wow';
    if (pct > 0) return 'good';
    return 'ok';
  };

  const loadProgress = async (exerciseId) => {
    setLoading(true);
    const { data } = await supabase
      .from('user_progress')
      .select('user_id, status, score, max_score, attempts, completed_at')
      .eq('exercise_id', exerciseId)
      .in('user_id', students.map(s => s.id));

    const map = {};
    (data || []).forEach(p => { map[p.user_id] = p; });
    setProgress(map);

    // Auto-fill homework_status from scores
    students.forEach(s => {
      const grade = scoreToGrade(map[s.id]);
      onChange(s.id, { homework_status: grade });
    });

    setLoading(false);
  };

  const loadAllProgress = async () => {
    setLoading(true);
    const exerciseIds = exercises.map(ex => ex.id);
    const { data } = await supabase
      .from('user_progress')
      .select('user_id, status, score, max_score, attempts, completed_at, exercise_id')
      .in('exercise_id', exerciseIds)
      .in('user_id', students.map(s => s.id));

    // Aggregate scores per student across all exercises
    const aggregated = {};
    students.forEach(s => {
      aggregated[s.id] = { score: 0, max_score: 0, count: 0 };
    });

    (data || []).forEach(p => {
      if (!aggregated[p.user_id]) aggregated[p.user_id] = { score: 0, max_score: 0, count: 0 };
      aggregated[p.user_id].score += p.score || 0;
      aggregated[p.user_id].max_score += p.max_score || 0;
      aggregated[p.user_id].count += 1;
    });

    const map = {};
    Object.entries(aggregated).forEach(([userId, agg]) => {
      map[userId] = {
        score: agg.score,
        max_score: agg.max_score,
        status: agg.count > 0 ? 'completed' : null,
      };
    });

    setProgress(map);

    // Auto-fill homework_status from aggregated scores
    students.forEach(s => {
      const grade = scoreToGrade(map[s.id]);
      onChange(s.id, { homework_status: grade });
    });

    setLoading(false);
  };

  const handlePhotoUpload = async (studentId, file) => {
    if (!file) return;

    setUploading(prev => ({ ...prev, [studentId]: true }));
    try {
      const ext = file.name.split('.').pop();
      const path = `homework/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('lesson-photos')
        .upload(path, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from('lesson-photos')
        .getPublicUrl(path);

      onChange(studentId, { homework_photo_url: publicData.publicUrl });
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
    const url = record.homework_photo_url || '';
    if (url) {
      const match = url.match(/lesson-photos\/(.+)$/);
      if (match) {
        await supabase.storage.from('lesson-photos').remove([match[1]]);
      }
    }
    onChange(studentId, { homework_photo_url: '' });
  };

  const renderPhotoButton = (studentId, record) => {
    const photoUrl = record.homework_photo_url || '';
    const isUploading = uploading[studentId];

    return (
      <div className="flex items-center gap-1">
        <input
          ref={el => fileInputRefs.current[studentId] = el}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handlePhotoUpload(studentId, e.target.files[0])}
        />
        {photoUrl ? (
          <div className="relative group">
            <img
              src={photoUrl}
              alt="Evidence"
              className="w-10 h-10 rounded object-cover border border-gray-300 cursor-pointer"
              onClick={() => window.open(photoUrl, '_blank')}
            />
            <button
              onClick={() => handleRemovePhoto(studentId)}
              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRefs.current[studentId]?.click()}
            disabled={isUploading}
            className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
            title="Add homework photo"
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            ) : (
              <Camera className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
    );
  };

  if (externalLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode Selector */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setMode('course')}
          className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-colors ${
            mode === 'course'
              ? 'bg-blue-50 border-blue-500 text-blue-700'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          Online
        </button>
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-colors ${
            mode === 'manual'
              ? 'bg-blue-50 border-blue-500 text-blue-700'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          Paper
        </button>
      </div>

      {/* Course Mode */}
      {mode === 'course' && (
        <>
          <div className="bg-white rounded-lg shadow-sm border p-4 flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Session</label>
              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select session...</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>{s.display}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Exercise</label>
              <select
                value={selectedExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
                disabled={!selectedSession}
                className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">All exercises</option>
                {exercises.map(ex => (
                  <option key={ex.id} value={ex.id}>{ex.title}</option>
                ))}
              </select>
            </div>
          </div>

          {!selectedSession ? (
            <div className="p-8 text-center text-gray-500">
              Select a session to view student grades.
            </div>
          ) : exercises.length === 0 && !loading ? (
            <div className="p-8 text-center text-gray-500">
              No exercises in this session.
            </div>
          ) : loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading grades...</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border">
              {students.map((student, si) => {
                const p = progress[student.id];
                const record = records[student.id] || {};
                const grade = record.homework_status || '';

                return (
                  <div key={student.id} className="flex flex-col md:flex-row md:items-center md:justify-between p-3 md:p-4 border-b last:border-b-0 hover:bg-gray-50 gap-2">
                    <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        {student.avatar_url ? (
                          <img src={student.avatar_url} alt="" className="w-8 h-8 md:w-10 md:h-10 rounded-full" />
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
                      {p && p.max_score > 0 && (
                        <span className="text-xs md:text-sm text-gray-400 flex-shrink-0">{p.score}/{p.max_score}</span>
                      )}
                    </div>
                    <div className="flex items-end gap-4 md:gap-6 flex-shrink-0">
                      {renderPhotoButton(student.id, record)}
                      <input
                        ref={el => feedbackRefs.current[student.id] = el}
                        type="text"
                        placeholder="Feedback..."
                        value={record.homework_notes || ''}
                        onChange={(e) => onChange(student.id, { homework_notes: e.target.value })}
                        onKeyDown={(e) => handleFieldKeyDown(e, 'feedback', si)}
                        className="border border-gray-300 rounded-lg px-2 md:px-3 py-1.5 md:py-2 flex-1 md:w-48 md:flex-none text-sm focus:ring-2 focus:ring-blue-500 min-w-0"
                      />
                      <div className="flex items-center gap-8 flex-shrink-0">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[10px] text-gray-400 leading-none">Bài tập</span>
                          <div className="flex items-center gap-0.5">
                            <input
                              ref={el => scoreRefs.current[student.id] = el}
                              type="number"
                              min="0"
                              placeholder="—"
                              value={record.homework_score ?? ''}
                              onChange={(e) => onChange(student.id, { homework_score: e.target.value === '' ? null : Number(e.target.value) })}
                              onKeyDown={(e) => handleFieldKeyDown(e, 'score', si)}
                              className="w-10 md:w-12 border border-gray-300 rounded-lg px-1 py-1.5 md:py-2 text-center text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-gray-400 text-xs">/</span>
                            <input
                              ref={el => maxScoreRefs.current[student.id] = el}
                              type="number"
                              min="1"
                              placeholder="—"
                              value={record.homework_max_score ?? ''}
                              onChange={(e) => onChange(student.id, { homework_max_score: e.target.value === '' ? null : Number(e.target.value) })}
                              onKeyDown={(e) => handleFieldKeyDown(e, 'maxScore', si)}
                              className="w-10 md:w-12 border border-gray-300 rounded-lg px-1 py-1.5 md:py-2 text-center text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[10px] text-gray-400 leading-none">Từ vựng</span>
                          <div className="flex items-center gap-0.5">
                            <input
                              ref={el => vocabScoreRefs.current[student.id] = el}
                              type="number"
                              min="0"
                              placeholder="—"
                              value={record.vocab_score ?? ''}
                              onChange={(e) => onChange(student.id, { vocab_score: e.target.value === '' ? null : Number(e.target.value) })}
                              onKeyDown={(e) => handleFieldKeyDown(e, 'vocabScore', si)}
                              className="w-10 md:w-12 border border-gray-300 rounded-lg px-1 py-1.5 md:py-2 text-center text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-gray-400 text-xs">/</span>
                            <input
                              ref={el => vocabMaxScoreRefs.current[student.id] = el}
                              type="number"
                              min="1"
                              placeholder="—"
                              value={record.vocab_max_score ?? ''}
                              onChange={(e) => onChange(student.id, { vocab_max_score: e.target.value === '' ? null : Number(e.target.value) })}
                              onKeyDown={(e) => handleFieldKeyDown(e, 'vocabMaxScore', si)}
                              className="w-10 md:w-12 border border-gray-300 rounded-lg px-1 py-1.5 md:py-2 text-center text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {gradeOptions.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => onChange(student.id, { homework_status: opt.value })}
                            className={`px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                              grade === opt.value ? opt.color : opt.inactive
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
        </>
      )}

      {/* Mark All Buttons */}
      <div className="flex flex-wrap gap-2">
        {gradeOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => onMarkAll(opt.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${opt.inactive}`}
          >
            Mark All {opt.label}
          </button>
        ))}
      </div>

      {/* Manual / Hand Graded Mode */}
      {mode === 'manual' && (
        <div className="bg-white rounded-lg shadow-sm border">
          {students.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No Students Enrolled</h3>
            </div>
          ) : (
            <div>
              {students.map((student, si) => {
                const record = records[student.id] || {};
                const grade = record.homework_status || '';

                return (
                  <div key={student.id} className="flex flex-col md:flex-row md:items-center md:justify-between p-3 md:p-4 border-b last:border-b-0 hover:bg-gray-50 gap-2">
                    <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        {student.avatar_url ? (
                          <img src={student.avatar_url} alt="" className="w-8 h-8 md:w-10 md:h-10 rounded-full" />
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
                    </div>

                    <div className="flex items-end gap-4 md:gap-6 flex-shrink-0">
                      {renderPhotoButton(student.id, record)}
                      <input
                        ref={el => feedbackRefs.current[student.id] = el}
                        type="text"
                        placeholder="Feedback..."
                        value={record.homework_notes || ''}
                        onChange={(e) => onChange(student.id, { homework_notes: e.target.value })}
                        onKeyDown={(e) => handleFieldKeyDown(e, 'feedback', si)}
                        className="border border-gray-300 rounded-lg px-2 md:px-3 py-1.5 md:py-2 flex-1 md:w-48 md:flex-none text-sm focus:ring-2 focus:ring-blue-500 min-w-0"
                      />
                      <div className="flex items-center gap-8 flex-shrink-0">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[10px] text-gray-400 leading-none">Bài tập</span>
                          <div className="flex items-center gap-0.5">
                            <input
                              ref={el => scoreRefs.current[student.id] = el}
                              type="number"
                              min="0"
                              placeholder="—"
                              value={record.homework_score ?? ''}
                              onChange={(e) => onChange(student.id, { homework_score: e.target.value === '' ? null : Number(e.target.value) })}
                              onKeyDown={(e) => handleFieldKeyDown(e, 'score', si)}
                              className="w-10 md:w-12 border border-gray-300 rounded-lg px-1 py-1.5 md:py-2 text-center text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-gray-400 text-xs">/</span>
                            <input
                              ref={el => maxScoreRefs.current[student.id] = el}
                              type="number"
                              min="1"
                              placeholder="—"
                              value={record.homework_max_score ?? ''}
                              onChange={(e) => onChange(student.id, { homework_max_score: e.target.value === '' ? null : Number(e.target.value) })}
                              onKeyDown={(e) => handleFieldKeyDown(e, 'maxScore', si)}
                              className="w-10 md:w-12 border border-gray-300 rounded-lg px-1 py-1.5 md:py-2 text-center text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[10px] text-gray-400 leading-none">Từ vựng</span>
                          <div className="flex items-center gap-0.5">
                            <input
                              ref={el => vocabScoreRefs.current[student.id] = el}
                              type="number"
                              min="0"
                              placeholder="—"
                              value={record.vocab_score ?? ''}
                              onChange={(e) => onChange(student.id, { vocab_score: e.target.value === '' ? null : Number(e.target.value) })}
                              onKeyDown={(e) => handleFieldKeyDown(e, 'vocabScore', si)}
                              className="w-10 md:w-12 border border-gray-300 rounded-lg px-1 py-1.5 md:py-2 text-center text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-gray-400 text-xs">/</span>
                            <input
                              ref={el => vocabMaxScoreRefs.current[student.id] = el}
                              type="number"
                              min="1"
                              placeholder="—"
                              value={record.vocab_max_score ?? ''}
                              onChange={(e) => onChange(student.id, { vocab_max_score: e.target.value === '' ? null : Number(e.target.value) })}
                              onKeyDown={(e) => handleFieldKeyDown(e, 'vocabMaxScore', si)}
                              className="w-10 md:w-12 border border-gray-300 rounded-lg px-1 py-1.5 md:py-2 text-center text-xs md:text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {gradeOptions.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => onChange(student.id, { homework_status: opt.value })}
                            className={`px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                              grade === opt.value ? opt.color : opt.inactive
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
      )}
    </div>
  );
};

export default HomeworkReportView;
