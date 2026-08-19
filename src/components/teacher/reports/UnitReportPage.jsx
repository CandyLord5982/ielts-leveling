import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../supabase/client';
import { useAuth } from '../../../hooks/useAuth';
import {
  ArrowLeft, ClipboardList, BookOpen, Check, ChevronDown, ChevronRight,
  User, CheckSquare, Square, MinusSquare, Eye, EyeOff, Save, Star,
  Award, MessageSquare, History, Zap, X, GraduationCap,
  AlertTriangle, Brain, Sparkles, Target
} from 'lucide-react';


// ─── Preview Card (screenshot-friendly, matches mockup) ────────────────
const ReportPreview = ({ data }) => {
  if (!data) return null;
  const { studentName, studentAvatar, courseName, level, xp, attendance, performance, exercises, lessonRecords, curriculum, comment, createdAt } = data;

  // Compute effort metrics
  const effortAttendance = attendance
    ? `${attendance.stats.present + attendance.stats.late}/${attendance.stats.present + attendance.stats.late + attendance.stats.absent}`
    : '—';
  const hwTotal = performance ? performance.homework.wow + performance.homework.good + performance.homework.ok : 0;
  const effortHomework = hwTotal > 0 ? `${Math.round(((performance.homework.wow + performance.homework.good) / hwTotal) * 100)}%` : '—';
  const effortStars = performance ? `${performance.stars}` : '0';
  const allExItems = (exercises || []).flatMap(g => g.items);
  const exDone = allExItems.filter(i => i.completed).length;
  const effortExercises = allExItems.length > 0 ? `${exDone}/${allExItems.length}` : '—';

  // Structured comment (support both old string and new object format)
  const cmtObj = typeof comment === 'object' && comment !== null
    ? comment
    : { achievements: comment || '', improvements: '', suggestions: '' };
  const hasComment = cmtObj.achievements || cmtObj.improvements || cmtObj.suggestions;

  return (
    <div style={{ width: 480, fontFamily: "'Inter', 'Segoe UI', sans-serif" }} className="mx-auto rounded-[30px] overflow-hidden shadow-2xl bg-[#F4F7F9]">

      {/* ─ HEADER ─ */}
      <div className="text-white text-center relative" style={{ background: 'linear-gradient(180deg, #00AEEF 0%, #0081B1 100%)', padding: '36px 20px 56px' }}>
        <h1 className="text-2xl font-extrabold uppercase tracking-widest m-0">REPORT</h1>
        <p className="text-sm opacity-90 mt-1 mb-5">{courseName}</p>
        <div className="relative w-[110px] h-[110px] mx-auto">
          <div className="w-full h-full rounded-full border-4 border-white overflow-hidden bg-gray-200 flex items-center justify-center">
            {studentAvatar ? (
              <img src={studentAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-bold text-gray-400">{studentName?.charAt(0)?.toUpperCase()}</span>
            )}
          </div>
        </div>
        <div className="text-lg font-bold mt-3">{studentName}</div>
        <div className="flex justify-center gap-3 mt-3">
          <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-semibold">Level {level}</span>
          <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-semibold">{xp?.toLocaleString()} XP</span>
        </div>
      </div>

      {/* ─ EFFORT GRID (overlapping header) ─ */}
      <div className="grid grid-cols-4 gap-2.5 px-5 -mt-7 relative z-10">
        {[
          { icon: '📋', val: effortAttendance, label: 'Attendance' },
          { icon: '📝', val: effortHomework, label: 'Homework' },
          { icon: '⭐', val: effortStars, label: 'Stars' },
          { icon: '📚', val: effortExercises, label: 'Exercises' },
        ].map((e, i) => (
          <div key={i} className="bg-white rounded-2xl py-3 px-1 text-center shadow-md">
            <div className="text-lg">{e.icon}</div>
            <div className="text-sm font-extrabold text-gray-800 mt-0.5">{e.val}</div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wide">{e.label}</div>
          </div>
        ))}
      </div>

      {/* ─ CURRICULUM ─ */}
      {curriculum && (curriculum.objectives || curriculum.knowledge || curriculum.presentation) && (
        <div className="mx-5 mt-5 bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-gray-800 uppercase tracking-wide flex items-center gap-2 mb-4">
            <span className="text-base">📚</span> Chương Trình Học
          </h3>
          {curriculum.objectives && (
            <div className="mb-3">
              <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">1. Mục tiêu</div>
              <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{curriculum.objectives}</p>
            </div>
          )}
          {curriculum.knowledge && (
            <div className="mb-3">
              <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">2. Kiến thức</div>
              <div className="flex flex-wrap gap-1.5">
                {curriculum.knowledge.split('\n').filter(l => l.trim()).map((item, i) => (
                  <span key={i} className="px-2.5 py-1 bg-teal-50 text-teal-700 rounded-lg text-[12px] font-semibold border border-teal-100">
                    {item.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}
          {curriculum.presentation && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">3. Thuyết trình</div>
              <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl px-4 py-2.5 border border-teal-100">
                <p className="text-[13px] text-teal-800 font-bold italic whitespace-pre-wrap">&ldquo;{curriculum.presentation}&rdquo;</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─ EXERCISES (shared) ─ */}
      {(() => {
        const shared = (exercises || []).filter(g => !g.personal);
        if (shared.length === 0) return null;
        const sharedItems = shared.flatMap(g => g.items);
        const sDone = sharedItems.filter(i => i.completed).length;
        const sScored = sharedItems.filter(i => i.score != null);
        const sAvg = sScored.length > 0 ? Math.round(sScored.reduce((s, i) => s + i.score, 0) / sScored.length) : null;
        return (
          <div className="mx-5 mt-5 bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-gray-800 uppercase tracking-wide flex items-center gap-2">
                <span className="text-base">📖</span> Exercises
              </h3>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-green-600 font-bold">{sDone}/{sharedItems.length}</span>
                {sAvg != null && (
                  <span className={`px-2 py-0.5 rounded text-white text-[10px] font-bold ${sAvg >= 80 ? 'bg-green-500' : sAvg >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>
                    Avg {sAvg}%
                  </span>
                )}
              </div>
            </div>
            {shared.map((group, gi) => (
              <div key={gi} className="mb-4 last:mb-0">
                <div className="text-xs font-bold text-gray-600 mb-2">{group.unitTitle}</div>
                {group.items.map((item, ii) => (
                  <div key={ii} className="flex items-center justify-between py-1.5 pl-3 border-b border-gray-50 last:border-0">
                    <span className="text-[13px] text-gray-700">{item.title}</span>
                    {item.completed ? (
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold text-white min-w-[40px] text-center ${
                        (item.score ?? 0) >= 80 ? 'bg-green-500' : (item.score ?? 0) >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}>
                        {item.score != null ? `${item.score}%` : '✓'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {/* ─ PERSONAL EXERCISES ─ */}
      {(() => {
        const personal = (exercises || []).filter(g => g.personal);
        if (personal.length === 0) return null;
        const pItems = personal.flatMap(g => g.items);
        const pDone = pItems.filter(i => i.completed).length;
        const pScored = pItems.filter(i => i.score != null);
        const pAvg = pScored.length > 0 ? Math.round(pScored.reduce((s, i) => s + i.score, 0) / pScored.length) : null;
        return (
          <div className="mx-5 mt-5 bg-white rounded-2xl p-5 shadow-sm border border-purple-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-gray-800 uppercase tracking-wide flex items-center gap-2">
                <span className="text-base">🎯</span> Personal Exercises
              </h3>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-green-600 font-bold">{pDone}/{pItems.length}</span>
                {pAvg != null && (
                  <span className={`px-2 py-0.5 rounded text-white text-[10px] font-bold ${pAvg >= 80 ? 'bg-green-500' : pAvg >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>
                    Avg {pAvg}%
                  </span>
                )}
              </div>
            </div>
            {personal.map((group, gi) => (
              <div key={gi} className="mb-4 last:mb-0">
                <div className="text-xs font-bold text-purple-600 mb-2">{group.unitTitle}</div>
                {group.items.map((item, ii) => (
                  <div key={ii} className="flex items-center justify-between py-1.5 pl-3 border-b border-gray-50 last:border-0">
                    <span className="text-[13px] text-gray-700">{item.title}</span>
                    {item.completed ? (
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold text-white min-w-[40px] text-center ${
                        (item.score ?? 0) >= 80 ? 'bg-green-500' : (item.score ?? 0) >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}>
                        {item.score != null ? `${item.score}%` : '✓'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {/* ─ PERFORMANCE DETAIL ─ */}
      {performance && (
        <div className="mx-5 mt-5 bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-gray-800 uppercase tracking-wide flex items-center gap-2 mb-4">
            <span className="text-base">📊</span> Performance
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-[10px] text-gray-500 uppercase font-semibold mb-2">Homework</div>
              <div className="flex flex-wrap gap-1.5">
                {performance.homework.wow > 0 && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-lg text-[11px] font-bold">Wow {performance.homework.wow}</span>}
                {performance.homework.good > 0 && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold">Good {performance.homework.good}</span>}
                {performance.homework.ok > 0 && <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded-lg text-[11px] font-bold">Ok {performance.homework.ok}</span>}
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-[10px] text-gray-500 uppercase font-semibold mb-2">Classwork</div>
              <div className="flex flex-wrap gap-1.5">
                {performance.classwork.wow > 0 && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-lg text-[11px] font-bold">Wow {performance.classwork.wow}</span>}
                {performance.classwork.good > 0 && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold">Good {performance.classwork.good}</span>}
                {performance.classwork.ok > 0 && <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded-lg text-[11px] font-bold">Ok {performance.classwork.ok}</span>}
              </div>
            </div>
          </div>
          {performance.stars > 0 && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-yellow-600 font-bold">
              ⭐ {performance.stars} star{performance.stars > 1 ? 's' : ''} earned
            </div>
          )}
        </div>
      )}

      {/* ─ XP RATE GRAPH ─ */}
      {(() => {
        const perfXPv = { ok: 30, good: 60, wow: 90 };
        const hwXPv = { ok: 15, good: 30, wow: 45 };
        const MXP = 135;
        const calcLessonXP = (rec) => {
          if (!rec || !rec.attendance_status) return null;
          const isPresent = rec.attendance_status === 'present' || rec.attendance_status === 'late';
          if (!isPresent) return 0;
          const perf = perfXPv[rec.performance_rating] || 0;
          const hw = hwXPv[rec.homework_status] || 0;
          if (perf === 0 && hw === 0) return null;
          return Math.max(perf + hw - (rec.attendance_status === 'late' ? 15 : 0), 0);
        };

        const dataPoints = (lessonRecords || []).map(rec => {
          const xpVal = calcLessonXP(rec);
          return {
            date: new Date(rec.date + 'T00:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' }),
            pct: xpVal !== null ? Math.round((xpVal / MXP) * 100) : null,
          };
        }).filter(d => d.pct !== null);

        if (dataPoints.length < 2) return null;

        const W = 440, H = 160, PX = 32, PY = 16;
        const plotW = W - PX * 2, plotH = H - PY * 2;
        const stepX = plotW / (dataPoints.length - 1);
        const points = dataPoints.map((d, i) => ({ x: PX + i * stepX, y: PY + plotH - (d.pct / 100) * plotH, ...d }));
        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        const areaPath = linePath + ` L${points[points.length - 1].x},${PY + plotH} L${points[0].x},${PY + plotH} Z`;

        return (
          <div className="mx-5 mt-5 bg-white rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-extrabold text-gray-800 uppercase tracking-wide flex items-center gap-2 mb-3">
              <span className="text-base">📈</span> XP Rate
            </h3>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
              {[0, 25, 50, 75, 100].map(pct => {
                const y = PY + plotH - (pct / 100) * plotH;
                return (
                  <g key={pct}>
                    <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                    <text x={PX - 4} y={y + 3} textAnchor="end" fontSize="8" fill="#9ca3af">{pct}%</text>
                  </g>
                );
              })}
              <path d={areaPath} fill="url(#previewXpGrad)" opacity="0.3" />
              <path d={linePath} fill="none" stroke="#0081B1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="3" fill="#0081B1" stroke="white" strokeWidth="1.5" />
                  <text x={p.x} y={PY + plotH + 11} textAnchor="middle" fontSize="7" fill="#6b7280">{p.date}</text>
                  <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="7" fill="#0081B1" fontWeight="600">{p.pct}%</text>
                </g>
              ))}
              <defs>
                <linearGradient id="previewXpGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0081B1" />
                  <stop offset="100%" stopColor="#0081B1" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        );
      })()}

      {/* ─ TEACHER COMMENT ─ */}
      {hasComment && (
        <div className="mx-5 mt-5 bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-gray-800 uppercase tracking-wide flex items-center gap-2 mb-4">
            <span className="text-base">💬</span> Teacher's Comment
          </h3>
          {cmtObj.achievements && (
            <div className="mb-3">
              <div className="text-xs font-extrabold text-gray-800 mb-1">1. Achievements</div>
              <p className="text-[13px] text-gray-600 leading-relaxed italic whitespace-pre-wrap">{cmtObj.achievements}</p>
            </div>
          )}
          {cmtObj.improvements && (
            <div className="mb-3">
              <div className="text-xs font-extrabold text-gray-800 mb-1">2. Areas to Improve</div>
              <p className="text-[13px] text-gray-600 leading-relaxed italic whitespace-pre-wrap">{cmtObj.improvements}</p>
            </div>
          )}
          {cmtObj.suggestions && (
            <div>
              <div className="text-xs font-extrabold text-gray-800 mb-1">3. Suggestions</div>
              <p className="text-[13px] text-gray-600 leading-relaxed italic whitespace-pre-wrap">{cmtObj.suggestions}</p>
            </div>
          )}
        </div>
      )}

      {/* ─ FOOTER ─ */}
      <div className="mx-5 mt-5 mb-6 bg-gray-800 text-white rounded-2xl p-4 text-center">
        <div className="text-[10px] opacity-60 uppercase tracking-wider">
          {new Date(createdAt || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <div className="text-xs font-semibold mt-1 opacity-80">{courseName}</div>
      </div>
    </div>
  );
};

// ─── Main Page ──────────────────────────────────────────────────────────
const UnitReportPage = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [courseName, setCourseName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Students
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  // Roll call
  const [lessonDates, setLessonDates] = useState([]);
  const [rollCallMap, setRollCallMap] = useState({});
  const [lessonRecordMap, setLessonRecordMap] = useState({});

  // Performance (computed from selected lessons)

  // XP / Level
  const [studentXp, setStudentXp] = useState(0);

  // Exercises
  const [units, setUnits] = useState([]);
  const [sessionsMap, setSessionsMap] = useState({});
  const [exercisesMap, setExercisesMap] = useState({});
  const [studentProgress, setStudentProgress] = useState({});
  const [selectedSessions, setSelectedSessions] = useState(new Set());
  const [selectedLessons, setSelectedLessons] = useState(new Set());
  const [selectedExercises, setSelectedExercises] = useState(new Set());
  const [expandedUnits, setExpandedUnits] = useState(new Set());

  // Curriculum
  const [curriculum, setCurriculum] = useState({ objectives: '', knowledge: '', presentation: '' });

  // Comment (structured)
  const [comment, setComment] = useState({ achievements: '', improvements: '', suggestions: '' });

  // Saved reports
  const [savedReports, setSavedReports] = useState([]);
  const [viewingReport, setViewingReport] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  // Weakness analysis
  const [weaknessTags, setWeaknessTags] = useState([]);
  const [weaknessLoading, setWeaknessLoading] = useState(false);
  const [wrongAnswers, setWrongAnswers] = useState([]);
  const [wrongAnswersLoading, setWrongAnswersLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState({ loading: false, result: null, error: null });

  // Fetch base data on mount
  useEffect(() => {
    if (user && courseId) {
      fetchBaseData();
      fetchSavedReports();
    }
  }, [user, courseId]);

  const fetchWeaknessData = async (studentId) => {
    try {
      setWeaknessLoading(true);
      const { data: rows } = await supabase.rpc('get_student_weakness_by_course', {
        p_course_id: courseId
      });
      const studentRows = (rows || []).filter(r => r.user_id === studentId);
      const tags = studentRows.map(r => ({
        tag: r.tag,
        total_questions: r.total_questions,
        correct: r.correct,
        accuracy: Number(r.accuracy)
      })).sort((a, b) => a.accuracy - b.accuracy);
      setWeaknessTags(tags);
    } catch (err) {
      console.error('Error fetching weakness data:', err);
    } finally {
      setWeaknessLoading(false);
    }
  };

  const fetchWrongAnswers = async () => {
    if (!selectedStudentId || selectedExercises.size === 0) {
      setWrongAnswers([]);
      return;
    }
    setWrongAnswersLoading(true);
    try {
      const exerciseIds = [...selectedExercises];
      const { data, error } = await supabase
        .from('question_attempts')
        .select('exercise_id, exercise_type, question_id, selected_answer, correct_answer, exercise:exercises(title)')
        .eq('user_id', selectedStudentId)
        .eq('is_correct', false)
        .in('exercise_id', exerciseIds)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setWrongAnswers(data || []);
    } catch (err) {
      console.error('Error fetching wrong answers:', err);
      setWrongAnswers([]);
    } finally {
      setWrongAnswersLoading(false);
    }
  };

  const analyzeStudentAI = async () => {
    if (wrongAnswers.length === 0) return;
    setAiAnalysis({ loading: true, result: null, error: null });
    try {
      const wrongList = wrongAnswers.slice(0, 20).map((a, i) =>
        `${i + 1}. [${a.exercise?.title || a.exercise_type}] Student wrote "${a.selected_answer}" but correct answer is "${a.correct_answer}"`
      ).join('\n');
      console.log('📤 Sending to AI proxy:\n', wrongList);
      const messages = [
        { role: 'system', content: 'You are an English teacher writing a report card comment for a parent to read. Write in Vietnamese, professional but warm. No bullet points, no lists, no headings. Just 2-3 natural paragraphs. Mention what the student struggles with based on their wrong answers, give a couple of specific examples, acknowledge their effort, and recommend what they should practice at home. Keep it concise and suitable for a report card.' },
        { role: 'user', content: `Here are ${Math.min(wrongAnswers.length, 20)} wrong answers from this student. Write a report card comment:\n\n${wrongList}` }
      ];
      const response = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || `API error: ${response.status}`);
      if (!resData.result) throw new Error('No response from AI. Please try again.');
      setAiAnalysis({ loading: false, result: resData.result, error: null });
    } catch (err) {
      console.error('AI analysis error:', err);
      setAiAnalysis({ loading: false, result: null, error: err.message });
    }
  };

  const getAccuracyColor = (accuracy) => {
    if (accuracy < 50) return 'bg-red-100 text-red-700 border-red-200';
    if (accuracy < 75) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-green-100 text-green-700 border-green-200';
  };

  const getAccuracyBarColor = (accuracy) => {
    if (accuracy < 50) return 'bg-red-400';
    if (accuracy < 75) return 'bg-yellow-400';
    return 'bg-green-400';
  };

  const fetchBaseData = async () => {
    try {
      setLoading(true);

      const [courseRes, enrollRes, unitsRes, lessonInfoRes] = await Promise.all([
        supabase.from('courses').select('title').eq('id', courseId).single(),
        supabase.from('course_enrollments')
          .select('student_id, student:users!student_id(id, full_name, real_name, email, avatar_url)')
          .eq('course_id', courseId).eq('is_active', true),
        supabase.from('units').select('id, title, unit_number, assigned_student_id')
          .eq('course_id', courseId).eq('is_active', true).order('unit_number'),
        supabase.from('lesson_info').select('id, session_date, lesson_name, lesson_mode')
          .eq('course_id', courseId).order('session_date', { ascending: true }),
      ]);

      setCourseName(courseRes.data?.title || '');
      setLessonDates(lessonInfoRes.data || []);

      const studentList = (enrollRes.data || []).map(e => ({
        ...e.student,
        full_name: e.student?.real_name || e.student?.full_name,
      }));
      setStudents(studentList);

      const unitsData = unitsRes.data || [];
      setUnits(unitsData);

      const unitIds = unitsData.map(u => u.id);
      if (unitIds.length > 0) {
        const { data: sessData } = await supabase
          .from('sessions')
          .select('id, title, session_number, unit_id, is_test, assigned_student_id')
          .in('unit_id', unitIds)
          .eq('is_active', true)
          .order('session_number');

        const sMap = {};
        (sessData || []).forEach(s => {
          if (!sMap[s.unit_id]) sMap[s.unit_id] = [];
          sMap[s.unit_id].push(s);
        });
        setSessionsMap(sMap);

        const sessionIds = (sessData || []).map(s => s.id);
        if (sessionIds.length > 0) {
          const { data: assignData } = await supabase
            .from('exercise_assignments')
            .select('session_id, exercise:exercises(id, title, exercise_type, is_active)')
            .in('session_id', sessionIds);

          const eMap = {};
          (assignData || []).forEach(a => {
            if (!a.exercise || !a.exercise.is_active) return;
            if (!eMap[a.session_id]) eMap[a.session_id] = [];
            eMap[a.session_id].push(a.exercise);
          });
          setExercisesMap(eMap);
        }
      }

      setExpandedUnits(new Set());
    } catch (err) {
      console.error('Error fetching base data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentData = async (studentId) => {
    try {
      const lessonInfoIds = lessonDates.map(l => l.id);

      // Fetch roll call + performance + XP in parallel
      const promises = [];

      // Roll call & performance from lesson_records
      if (lessonInfoIds.length > 0) {
        promises.push(
          supabase.from('lesson_records')
            .select('lesson_info_id, attendance_status, homework_status, performance_rating, star_flag')
            .eq('student_id', studentId)
            .in('lesson_info_id', lessonInfoIds)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      // XP
      promises.push(
        supabase.from('users').select('xp').eq('id', studentId).single()
      );

      // Exercise progress
      const allExerciseIds = Object.values(exercisesMap).flat().map(e => e.id);
      if (allExerciseIds.length > 0) {
        promises.push(
          supabase.from('user_progress')
            .select('exercise_id, status, score, completed_at')
            .eq('user_id', studentId)
            .in('exercise_id', allExerciseIds)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      const [recordsRes, xpRes, progressRes] = await Promise.all(promises);

      // Roll call map + full record map
      const rcMap = {};
      const lrMap = {};
      const records = recordsRes.data || [];
      records.forEach(r => { rcMap[r.lesson_info_id] = r.attendance_status; lrMap[r.lesson_info_id] = r; });
      setRollCallMap(rcMap);
      setLessonRecordMap(lrMap);

      // Performance is now computed via useMemo from lessonRecordMap + selectedLessons

      // XP
      setStudentXp(xpRes.data?.xp || 0);

      // Exercise progress
      const progMap = {};
      (progressRes.data || []).forEach(p => { progMap[p.exercise_id] = p; });
      setStudentProgress(progMap);
    } catch (err) {
      console.error('Error fetching student data:', err);
    }
  };

  // Fetch student-specific data when student changes
  useEffect(() => {
    if (selectedStudentId && courseId) {
      setViewingReport(null);
      setComment({ achievements: '', improvements: '', suggestions: '' });
      setCurriculum({ objectives: '', knowledge: '', presentation: '' });
      setPreviewMode(false);
      setWeaknessTags([]);
      setAiAnalysis({ loading: false, result: null, error: null });
      fetchStudentData(selectedStudentId);
      fetchWeaknessData(selectedStudentId);
    }
  }, [selectedStudentId]);

  const fetchSavedReports = async () => {
    try {
      const { data } = await supabase
        .from('student_reports')
        .select('id, student_id, report_data, created_at')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });
      setSavedReports(data || []);
    } catch (err) {
      console.error('Error fetching saved reports:', err);
    }
  };

  // ─── Build snapshot ───────────────────────────────────────────
  const buildReportSnapshot = () => {
    const student = students.find(s => s.id === selectedStudentId);
    if (!student) return null;

    // Attendance snapshot (only selected lessons)
    const selectedLessonDates = lessonDates.filter(d => selectedLessons.has(d.id));
    const attendanceDates = selectedLessonDates.map(d => ({
      date: d.session_date,
      lessonName: d.lesson_name || '',
      status: rollCallMap[d.id] || null,
    }));
    const stats = { present: 0, late: 0, absent: 0 };
    attendanceDates.forEach(d => {
      if (d.status === 'present') stats.present++;
      else if (d.status === 'late') stats.late++;
      else if (d.status === 'absent') stats.absent++;
    });
    const total = selectedLessonDates.length;
    stats.rate = total > 0 ? Math.round(((stats.present + stats.late) / total) * 100) : 0;

    // Exercise snapshot (from selected exercises)
    const exerciseGroups = [];
    visibleUnits.forEach(unit => {
      const unitSessions = getVisibleSessions(unit.id).filter(s => selectedSessions.has(s.id));
      const items = [];
      unitSessions.forEach(session => {
        (exercisesMap[session.id] || []).filter(ex => selectedExercises.has(ex.id)).forEach(ex => {
          const prog = studentProgress[ex.id];
          items.push({
            title: ex.title,
            type: ex.exercise_type,
            score: prog?.score ?? null,
            completed: prog?.status === 'completed',
          });
        });
      });
      if (items.length > 0) {
        const isPersonal = !!unit.assigned_student_id || unitSessions.some(s => s.assigned_student_id);
        exerciseGroups.push({ unitTitle: `Unit ${unit.unit_number}: ${unit.title}`, items, personal: isPersonal });
      }
    });

    const level = Math.floor(studentXp / 1000) + 1;

    // Per-lesson records for XP graph (only selected lessons)
    const lessonRecordsSnapshot = selectedLessonDates.map(d => {
      const rec = lessonRecordMap[d.id];
      return {
        date: d.session_date,
        attendance_status: rec?.attendance_status || null,
        performance_rating: rec?.performance_rating || null,
        homework_status: rec?.homework_status || null,
      };
    });

    return {
      studentName: student.full_name,
      studentAvatar: student.avatar_url || null,
      courseName,
      level,
      xp: studentXp,
      attendance: { dates: attendanceDates, stats },
      performance: performanceData,
      exercises: exerciseGroups,
      lessonRecords: lessonRecordsSnapshot,
      curriculum: (curriculum.objectives || curriculum.knowledge || curriculum.presentation) ? curriculum : null,
      comment: (comment.achievements || comment.improvements || comment.suggestions) ? comment : null,
      createdAt: new Date().toISOString(),
    };
  };

  const handleSaveReport = async () => {
    const snapshot = buildReportSnapshot();
    if (!snapshot) return;

    try {
      setSaving(true);
      const { error } = await supabase.from('student_reports').insert({
        course_id: courseId,
        student_id: selectedStudentId,
        created_by: user.id,
        report_data: snapshot,
      });
      if (error) throw error;
      await fetchSavedReports();
      setPreviewMode(true);
      setViewingReport(snapshot);
    } catch (err) {
      console.error('Error saving report:', err);
      alert('Failed to save report');
    } finally {
      setSaving(false);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  const getAttendanceStyle = (status) => {
    switch (status) {
      case 'present': return 'bg-green-100 text-green-700 border-green-200';
      case 'late': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'absent': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-50 text-gray-400 border-gray-200';
    }
  };

  const getAttendanceLabel = (status) => {
    switch (status) {
      case 'present': return 'P';
      case 'late': return 'L';
      case 'absent': return 'A';
      default: return '—';
    }
  };

  const getScoreColor = (score) => {
    if (score == null) return 'text-gray-400';
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const attendanceStats = useMemo(() => {
    const selected = lessonDates.filter(d => selectedLessons.has(d.id));
    if (selected.length === 0) return null;
    let present = 0, late = 0, absent = 0;
    selected.forEach(d => {
      const status = rollCallMap[d.id];
      if (status === 'present') present++;
      else if (status === 'late') late++;
      else if (status === 'absent') absent++;
    });
    const rate = Math.round(((present + late) / selected.length) * 100);
    return { present, late, absent, total: selected.length, rate };
  }, [lessonDates, rollCallMap, selectedLessons]);

  const performanceData = useMemo(() => {
    const selected = lessonDates.filter(d => selectedLessons.has(d.id));
    if (selected.length === 0) return null;
    const perf = { homework: { wow: 0, good: 0, ok: 0 }, classwork: { wow: 0, good: 0, ok: 0 }, stars: 0 };
    selected.forEach(d => {
      const r = lessonRecordMap[d.id];
      if (!r) return;
      if (r.homework_status === 'wow') perf.homework.wow++;
      else if (r.homework_status === 'good') perf.homework.good++;
      else if (r.homework_status === 'ok') perf.homework.ok++;
      if (r.performance_rating === 'wow') perf.classwork.wow++;
      else if (r.performance_rating === 'good') perf.classwork.good++;
      else if (r.performance_rating === 'ok') perf.classwork.ok++;
      if (r.star_flag === 'star') perf.stars++;
    });
    return perf;
  }, [lessonDates, lessonRecordMap, selectedLessons]);

  const exerciseStats = useMemo(() => {
    if (selectedExercises.size === 0) return null;
    let completed = 0, totalScore = 0, scored = 0;
    selectedExercises.forEach(id => {
      const prog = studentProgress[id];
      if (prog?.status === 'completed') {
        completed++;
        if (prog.score != null) { totalScore += prog.score; scored++; }
      }
    });
    return { completed, total: selectedExercises.size, avgScore: scored > 0 ? Math.round(totalScore / scored) : null };
  }, [selectedExercises, studentProgress]);

  const studentLevel = Math.floor(studentXp / 1000) + 1;

  // Filter units & sessions to shared + selected student's personal content
  const visibleUnits = useMemo(() =>
    units.filter(u => !u.assigned_student_id || u.assigned_student_id === selectedStudentId),
    [units, selectedStudentId]
  );
  const getVisibleSessions = (unitId) =>
    (sessionsMap[unitId] || []).filter(s => !s.assigned_student_id || s.assigned_student_id === selectedStudentId);


  // ─── Session/Unit/Exercise selection ──────────────────────────
  const toggleExercise = (exerciseId) => {
    setSelectedExercises(prev => { const n = new Set(prev); n.has(exerciseId) ? n.delete(exerciseId) : n.add(exerciseId); return n; });
  };
  const toggleSession = (sessionId) => {
    const exIds = (exercisesMap[sessionId] || []).map(e => e.id);
    const wasSelected = selectedSessions.has(sessionId);
    setSelectedSessions(prev => { const n = new Set(prev); wasSelected ? n.delete(sessionId) : n.add(sessionId); return n; });
    setSelectedExercises(prev => { const n = new Set(prev); exIds.forEach(id => wasSelected ? n.delete(id) : n.add(id)); return n; });
  };
  const toggleUnit = (unitId) => {
    const sIds = getVisibleSessions(unitId).filter(s => (exercisesMap[s.id] || []).length > 0).map(s => s.id);
    const all = sIds.length > 0 && sIds.every(id => selectedSessions.has(id));
    setSelectedSessions(prev => { const n = new Set(prev); sIds.forEach(id => all ? n.delete(id) : n.add(id)); return n; });
    const exIds = sIds.flatMap(sid => (exercisesMap[sid] || []).map(e => e.id));
    setSelectedExercises(prev => { const n = new Set(prev); exIds.forEach(id => all ? n.delete(id) : n.add(id)); return n; });
  };
  const selectAll = () => {
    const allSIds = visibleUnits.flatMap(u => getVisibleSessions(u.id)).filter(s => (exercisesMap[s.id] || []).length > 0).map(s => s.id);
    const all = allSIds.length > 0 && allSIds.every(id => selectedSessions.has(id));
    setSelectedSessions(all ? new Set() : new Set(allSIds));
    const allExIds = allSIds.flatMap(sid => (exercisesMap[sid] || []).map(e => e.id));
    setSelectedExercises(all ? new Set() : new Set(allExIds));
  };
  const toggleExpandUnit = (unitId) => {
    setExpandedUnits(prev => { const n = new Set(prev); n.has(unitId) ? n.delete(unitId) : n.add(unitId); return n; });
  };
  const toggleLesson = (lessonId) => {
    setSelectedLessons(prev => { const n = new Set(prev); n.has(lessonId) ? n.delete(lessonId) : n.add(lessonId); return n; });
  };
  const selectAllLessons = () => {
    const allIds = lessonDates.map(d => d.id);
    const all = allIds.length > 0 && allIds.every(id => selectedLessons.has(id));
    setSelectedLessons(all ? new Set() : new Set(allIds));
  };

  // ─── Saved reports for selected student ───────────────────────
  const studentSavedReports = savedReports.filter(r => r.student_id === selectedStudentId);

  // ─── Render ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mt-12" />
        <p className="mt-2 text-center text-gray-600">Loading...</p>
      </div>
    );
  }

  // Preview mode — show only the polished card
  if (previewMode && (viewingReport || selectedStudentId)) {
    const data = viewingReport || buildReportSnapshot();
    return (
      <div className="min-h-screen bg-gray-100 py-8 px-4">
        <div className="max-w-lg mx-auto mb-4 flex items-center justify-between">
          <button
            onClick={() => { setPreviewMode(false); setViewingReport(null); }}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 bg-white px-3 py-1.5 rounded-lg shadow-sm border"
          >
            <EyeOff className="w-4 h-4" />
            Exit Preview
          </button>
          {!viewingReport && (
            <button
              onClick={handleSaveReport}
              disabled={saving}
              className="flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Report'}
            </button>
          )}
        </div>
        <ReportPreview data={data} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate(-1)} className="flex items-center text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-5 h-5 mr-1" /> Back
            </button>
            <h1 className="text-xl font-bold text-gray-900">Unit Report — {courseName}</h1>
          </div>
          {selectedStudentId && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewMode(true)}
                className="flex items-center gap-1.5 text-sm bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-100"
              >
                <Eye className="w-4 h-4" /> Preview
              </button>
              <button
                onClick={handleSaveReport}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Report'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Student selector */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">Select Student</h2>
            {savedReports.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                <History className="w-3.5 h-3.5" />
                {savedReports.length} saved report{savedReports.length > 1 ? 's' : ''}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {students.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStudentId(s.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  selectedStudentId === s.id
                    ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {s.avatar_url ? (
                    <img src={s.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <span className="text-blue-600 font-semibold text-[10px]">{s.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                  )}
                </div>
                {s.full_name}
                {savedReports.some(r => r.student_id === s.id) && (
                  <span className="w-2 h-2 rounded-full bg-green-400" title="Has saved reports" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Saved reports history panel */}
        {showHistory && (
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-700">Saved Reports</h2>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {savedReports.length === 0 ? (
              <p className="text-sm text-gray-500">No saved reports yet.</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {savedReports.map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedStudentId(r.student_id);
                      setViewingReport(r.report_data);
                      setPreviewMode(true);
                      setShowHistory(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">{r.report_data?.studentName}</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!selectedStudentId ? (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Select a student</h3>
            <p className="text-gray-500">Choose a student above to create their report.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* XP & Level bar */}
            <div className="bg-white rounded-lg shadow-sm border p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Award className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">Level {studentLevel}</div>
                  <div className="text-xs text-gray-500">{studentXp.toLocaleString()} XP total</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-indigo-600">
                <Zap className="w-4 h-4" />
                <span className="text-sm font-bold">{studentXp % 1000}/1,000 to next level</span>
              </div>
            </div>

            {/* Saved reports for this student */}
            {studentSavedReports.length > 0 && (
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
                <div className="text-xs font-medium text-blue-700 mb-2">Previous reports for this student:</div>
                <div className="flex flex-wrap gap-2">
                  {studentSavedReports.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setViewingReport(r.report_data); setPreviewMode(true); }}
                      className="text-xs bg-white border border-blue-200 text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-50"
                    >
                      {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Roll Call */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-green-600" />
                  <h2 className="text-base font-semibold text-gray-900">Attendance</h2>
                  <span className="text-xs text-gray-400">({selectedLessons.size}/{lessonDates.length})</span>
                </div>
                <div className="flex items-center gap-3">
                  {attendanceStats && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      attendanceStats.rate >= 80 ? 'bg-green-100 text-green-700' :
                      attendanceStats.rate >= 50 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>{attendanceStats.rate}%</span>
                  )}
                  <button onClick={selectAllLessons} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    {lessonDates.length > 0 && lessonDates.every(d => selectedLessons.has(d.id)) ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>
              {lessonDates.length === 0 ? (
                <div className="p-6 text-center text-gray-500">No roll call data.</div>
              ) : (
                <div className="p-4">
                  {attendanceStats && (
                    <div className="flex gap-4 mb-3 text-sm">
                      <span className="text-green-600 font-medium">Present: {attendanceStats.present}</span>
                      <span className="text-yellow-600 font-medium">Late: {attendanceStats.late}</span>
                      <span className="text-red-600 font-medium">Absent: {attendanceStats.absent}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {lessonDates.map(d => {
                      const status = rollCallMap[d.id];
                      const isSelected = selectedLessons.has(d.id);
                      return (
                        <div
                          key={d.id}
                          onClick={() => toggleLesson(d.id)}
                          className={`rounded-lg border p-2 text-center min-w-[52px] cursor-pointer transition-all ${
                            isSelected
                              ? getAttendanceStyle(status)
                              : 'bg-gray-50 border-gray-200 opacity-40'
                          }`}
                        >
                          <div className="text-[10px] font-bold">{formatDate(d.session_date)}</div>
                          <div className="text-xs font-bold mt-0.5">{getAttendanceLabel(status)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Performance */}
            {performanceData && (
              <div className="bg-white rounded-lg shadow-sm border">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500" />
                  <h2 className="text-base font-semibold text-gray-900">Performance</h2>
                </div>
                <div className="p-4 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-2">Homework</div>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">Wow {performanceData.homework.wow}</span>
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">Good {performanceData.homework.good}</span>
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold">Ok {performanceData.homework.ok}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-2">Classwork</div>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">Wow {performanceData.classwork.wow}</span>
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">Good {performanceData.classwork.good}</span>
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold">Ok {performanceData.classwork.ok}</span>
                    </div>
                  </div>
                </div>
                {performanceData.stars > 0 && (
                  <div className="px-4 pb-4 flex items-center gap-1 text-xs text-yellow-600">
                    <Star className="w-3.5 h-3.5 fill-yellow-400" />
                    <span className="font-bold">{performanceData.stars} star{performanceData.stars > 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            )}

            {/* Weakness Analysis */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
                <Target className="w-5 h-5 text-red-500" />
                <h2 className="text-base font-semibold text-gray-900">Weakness Analysis</h2>
                {weaknessTags.filter(t => t.accuracy < 50).length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-red-50 text-red-600 rounded-full border border-red-200">
                    <AlertTriangle className="w-3 h-3" />
                    {weaknessTags.filter(t => t.accuracy < 50).length} weak
                  </span>
                )}
              </div>
              <div className="p-4 space-y-4">
                {weaknessLoading && (
                  <div className="text-center py-6 text-gray-400">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
                    Loading...
                  </div>
                )}
                {!weaknessLoading && weaknessTags.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No tag data yet for this student.</p>
                )}
                {!weaknessLoading && weaknessTags.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Accuracy by Tag</div>
                    {weaknessTags.map(t => (
                      <div key={t.tag} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-gray-700 w-32 truncate" title={t.tag}>{t.tag}</span>
                        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden relative">
                          <div
                            className={`h-full rounded-full transition-all ${getAccuracyBarColor(t.accuracy)}`}
                            style={{ width: `${t.accuracy}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-gray-700">
                            {t.correct}/{t.total_questions} ({t.accuracy}%)
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getAccuracyColor(t.accuracy)}`}>
                          {t.accuracy}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Wrong Answers */}
                <div>
                  {wrongAnswers.length === 0 && !wrongAnswersLoading && (
                    <button
                      onClick={fetchWrongAnswers}
                      disabled={selectedExercises.size === 0}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {selectedExercises.size === 0 ? 'Select exercises first' : 'Load Wrong Answers'}
                    </button>
                  )}
                  {wrongAnswersLoading && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
                      Loading wrong answers...
                    </div>
                  )}
                  {wrongAnswers.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Wrong Answers ({wrongAnswers.length})
                        </div>
                        <button
                          onClick={() => { setWrongAnswers([]); setAiAnalysis({ loading: false, result: null, error: null }); }}
                          className="text-[10px] text-gray-400 hover:text-gray-600"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto space-y-1.5">
                        {wrongAnswers.map((a, i) => (
                          <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-xs">
                            <div className="text-[10px] text-gray-400 mb-1">{a.exercise?.title || a.exercise_type}</div>
                            <div className="flex gap-2">
                              <span className="text-red-600 flex-1"><span className="font-medium text-gray-500">Wrote:</span> {a.selected_answer}</span>
                              <span className="text-green-600 flex-1"><span className="font-medium text-gray-500">Correct:</span> {a.correct_answer}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Analysis */}
                {wrongAnswers.length > 0 && (
                  <div>
                    {!aiAnalysis.loading && !aiAnalysis.result && !aiAnalysis.error && (
                      <button
                        onClick={analyzeStudentAI}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                      >
                        <Brain className="w-3.5 h-3.5" />
                        Analyze with AI
                      </button>
                    )}
                    {aiAnalysis.loading && (
                      <div className="flex items-center gap-2 text-sm text-purple-600">
                        <div className="w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                        Analyzing wrong answers...
                      </div>
                    )}
                    {aiAnalysis.error && (
                      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                        Error: {aiAnalysis.error}
                        <button onClick={analyzeStudentAI} className="ml-2 text-red-700 underline">Retry</button>
                      </div>
                    )}
                    {aiAnalysis.result && (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700">
                            <Sparkles className="w-3.5 h-3.5" />
                            AI Analysis
                          </div>
                          <button
                            onClick={analyzeStudentAI}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-purple-600 hover:bg-purple-100 rounded transition-colors"
                          >
                            <Brain className="w-3 h-3" />
                            Re-analyze
                          </button>
                        </div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{aiAnalysis.result}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Exercises — pick units/sessions */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-semibold text-gray-900">Exercises</h2>
                  <span className="text-xs text-gray-400">({selectedExercises.size} exercise{selectedExercises.size !== 1 ? 's' : ''})</span>
                </div>
                <div className="flex items-center gap-3">
                  {exerciseStats && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-green-600 font-medium">Done: {exerciseStats.completed}/{exerciseStats.total}</span>
                      {exerciseStats.avgScore != null && (
                        <span className={`font-medium ${getScoreColor(exerciseStats.avgScore)}`}>Avg: {exerciseStats.avgScore}%</span>
                      )}
                    </div>
                  )}
                  <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    {(() => {
                      const allSIds = visibleUnits.flatMap(u => getVisibleSessions(u.id)).filter(s => (exercisesMap[s.id] || []).length > 0).map(s => s.id);
                      return allSIds.length > 0 && allSIds.every(id => selectedSessions.has(id)) ? 'Deselect All' : 'Select All';
                    })()}
                  </button>
                </div>
              </div>
              <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                {visibleUnits.map(unit => {
                  const unitSessions = getVisibleSessions(unit.id).filter(s => (exercisesMap[s.id] || []).length > 0);
                  if (unitSessions.length === 0) return null;
                  const allUnitSel = unitSessions.every(s => selectedSessions.has(s.id));
                  const someUnitSel = unitSessions.some(s => selectedSessions.has(s.id));
                  const expanded = expandedUnits.has(unit.id);

                  return (
                    <div key={unit.id}>
                      {/* Unit row */}
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 cursor-pointer hover:bg-gray-100" onClick={() => toggleExpandUnit(unit.id)}>
                        <button onClick={(e) => { e.stopPropagation(); toggleUnit(unit.id); }} className="text-gray-500 hover:text-blue-600">
                          {allUnitSel ? <CheckSquare className="w-4 h-4 text-blue-600" /> : someUnitSel ? <MinusSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                        </button>
                        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        <span className="text-sm font-semibold text-gray-800">Unit {unit.unit_number}: {unit.title}</span>
                        {unit.assigned_student_id && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-[10px] font-bold">Personal</span>}
                        <span className="text-xs text-gray-400 ml-auto">
                          {unitSessions.filter(s => selectedSessions.has(s.id)).length}/{unitSessions.length} sessions
                        </span>
                      </div>

                      {expanded && unitSessions.map(session => {
                        const exercises = exercisesMap[session.id] || [];
                        const isSel = selectedSessions.has(session.id);
                        return (
                          <div key={session.id}>
                            {/* Session row — clickable checkbox */}
                            <div
                              className={`flex items-center gap-2 px-4 py-2 pl-10 cursor-pointer transition-colors ${isSel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                              onClick={() => toggleSession(session.id)}
                            >
                              <button className="text-gray-400 hover:text-blue-600">
                                {isSel ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5" />}
                              </button>
                              <span className="text-xs font-medium text-gray-700">{session.title}</span>
                              {session.assigned_student_id && <span className="px-1 py-0.5 bg-purple-50 text-purple-500 rounded text-[9px] font-bold">1:1</span>}
                              <span className="text-[10px] text-gray-400 ml-auto">{exercises.length} exercise{exercises.length !== 1 ? 's' : ''}</span>
                            </div>
                            {/* Exercises — selectable list, shown when session is selected */}
                            {isSel && exercises.map(ex => {
                              const prog = studentProgress[ex.id];
                              const done = prog?.status === 'completed';
                              const exSel = selectedExercises.has(ex.id);
                              return (
                                <div key={ex.id} className={`flex items-center gap-3 px-4 py-1.5 pl-14 cursor-pointer transition-colors ${exSel ? 'bg-blue-50/50' : 'bg-gray-50/30 opacity-50'}`} onClick={() => toggleExercise(ex.id)}>
                                  <button className="text-gray-400 hover:text-blue-600" onClick={(e) => { e.stopPropagation(); toggleExercise(ex.id); }}>
                                    {exSel ? <CheckSquare className="w-3 h-3 text-blue-600" /> : <Square className="w-3 h-3" />}
                                  </button>
                                  <span className="text-sm text-gray-600 flex-1 truncate">{ex.title}</span>
                                  <span className="text-[10px] text-gray-400 uppercase">{ex.exercise_type}</span>
                                  {done ? (
                                    <div className="flex items-center gap-1.5">
                                      <Check className="w-3.5 h-3.5 text-green-500" />
                                      <span className={`text-xs font-semibold ${getScoreColor(prog?.score)}`}>
                                        {prog?.score != null ? `${prog.score}%` : 'Done'}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Curriculum */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-teal-600" />
                <h2 className="text-base font-semibold text-gray-900">Chương trình học</h2>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">1. Mục tiêu</label>
                  <textarea
                    value={curriculum.objectives}
                    onChange={(e) => setCurriculum(prev => ({ ...prev, objectives: e.target.value }))}
                    placeholder="Mục tiêu bài học, ví dụ: Sử dụng thành thạo từ vựng về gia đình..."
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">2. Kiến thức</label>
                  <textarea
                    value={curriculum.knowledge}
                    onChange={(e) => setCurriculum(prev => ({ ...prev, knowledge: e.target.value }))}
                    placeholder="Từ vựng, cấu trúc ngữ pháp... (mỗi dòng một mục)"
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">3. Thuyết trình</label>
                  <textarea
                    value={curriculum.presentation}
                    onChange={(e) => setCurriculum(prev => ({ ...prev, presentation: e.target.value }))}
                    placeholder="Chủ đề thuyết trình, ví dụ: &quot;My Family Tree&quot;"
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Teacher Comment — structured */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                <h2 className="text-base font-semibold text-gray-900">Teacher's Comment</h2>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">1. Achievements</label>
                  <textarea
                    value={comment.achievements}
                    onChange={(e) => setComment(prev => ({ ...prev, achievements: e.target.value }))}
                    placeholder="What did this student do well?"
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">2. Areas to Improve</label>
                  <textarea
                    value={comment.improvements}
                    onChange={(e) => setComment(prev => ({ ...prev, improvements: e.target.value }))}
                    placeholder="What does this student need to work on?"
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">3. Suggestions</label>
                  <textarea
                    value={comment.suggestions}
                    onChange={(e) => setComment(prev => ({ ...prev, suggestions: e.target.value }))}
                    placeholder="What actions have been taken or recommended?"
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnitReportPage;
