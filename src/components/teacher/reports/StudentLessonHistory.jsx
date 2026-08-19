import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../supabase/client';
import { ArrowLeft, Star, Flag, Users } from 'lucide-react';

const ratingLabel = { wow: 'Wow', good: 'Good', ok: 'Ok' };
const attendanceLabel = { present: 'Đúng giờ', absent: 'Vắng', late: 'Muộn', excused: 'Excused' };
const homeworkLabel = { wow: 'Wow', good: 'Good', ok: 'Ok' };

const perfXP = { ok: 30, good: 60, wow: 90 };
const hwXP = { ok: 15, good: 30, wow: 45 };
const MAX_XP = 90 + 45; // wow perf + wow hw = 135

const calcXP = (rec) => {
  if (!rec) return null;
  const isPresent = rec.attendance_status === 'present' || rec.attendance_status === 'late';
  if (!isPresent) return 0;
  const perf = perfXP[rec.performance_rating] || 0;
  const hw = hwXP[rec.homework_status] || 0;
  if (perf === 0 && hw === 0) return null;
  let xp = perf + hw - (rec.attendance_status === 'late' ? 15 : 0);
  return Math.max(xp, 0);
};

const ratingBadge = (value) => {
  if (!value) return null;
  const cls = value === 'wow' ? 'bg-green-100 text-green-700' :
              value === 'good' ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{ratingLabel[value] || value}</span>;
};

const attendanceBadge = (value) => {
  if (!value) return null;
  const cls = value === 'present' ? 'bg-green-100 text-green-700' :
              value === 'late' ? 'bg-yellow-100 text-yellow-700' :
              value === 'absent' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-600';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{attendanceLabel[value] || value}</span>;
};

const dash = <span className="text-gray-300">-</span>;

const StudentLessonHistory = () => {
  const { courseId, studentId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [recordMap, setRecordMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (courseId && studentId) fetchData();
  }, [courseId, studentId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch student, course, lessons, records in parallel
      const [studentRes, courseRes, lessonsRes] = await Promise.all([
        supabase.from('users').select('id, full_name, real_name, avatar_url, real_avatar_url').eq('id', studentId).single(),
        supabase.from('courses').select('id, title, level_number').eq('id', courseId).single(),
        supabase.from('lesson_info').select('id, session_date, lesson_name, skill, feedback')
          .eq('course_id', courseId).order('session_date', { ascending: false }),
      ]);

      const sd = studentRes.data;
      setStudent(sd ? { ...sd, full_name: sd.real_name || sd.full_name, avatar_url: sd.real_avatar_url || sd.avatar_url } : sd);
      setCourse(courseRes.data);

      const lessonList = lessonsRes.data || [];
      setLessons(lessonList);

      if (lessonList.length > 0) {
        const { data: recs } = await supabase
          .from('lesson_records')
          .select('lesson_info_id, attendance_status, homework_status, homework_notes, homework_score, homework_max_score, vocab_score, vocab_max_score, performance_rating, notes, score, max_score, star_flag')
          .eq('student_id', studentId)
          .in('lesson_info_id', lessonList.map(l => l.id));

        const map = {};
        (recs || []).forEach(r => { map[r.lesson_info_id] = r; });
        setRecordMap(map);
      }
    } catch (error) {
      console.error('Error loading student history:', error);
    } finally {
      setLoading(false);
    }
  };

  // Summary stats
  const records = Object.values(recordMap);
  const totalLessons = lessons.length;
  const presentCount = records.filter(r => r.attendance_status === 'present' || r.attendance_status === 'late').length;
  const wowPerf = records.filter(r => r.performance_rating === 'wow').length;
  const goodPerf = records.filter(r => r.performance_rating === 'good').length;
  const okPerf = records.filter(r => r.performance_rating === 'ok').length;
  const starCount = records.filter(r => r.star_flag === 'star').length;
  const flagCount = records.filter(r => r.star_flag === 'flag').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="ml-2 text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <button
            onClick={() => navigate('/teacher/overview')}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Overview
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              {student?.avatar_url ? (
                <img src={student.avatar_url} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <span className="text-blue-600 font-semibold">
                  {student?.full_name?.charAt(0).toUpperCase() || 'S'}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{student?.full_name || 'Student'}</h1>
              {course && (
                <p className="text-sm text-gray-500">Course {course.level_number}: {course.title}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{totalLessons}</p>
            <p className="text-xs text-gray-500">Total Lessons</p>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{presentCount}</p>
            <p className="text-xs text-gray-500">Attended</p>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{wowPerf}</p>
            <p className="text-xs text-gray-500">Wow</p>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold text-yellow-500">{goodPerf}</p>
            <p className="text-xs text-gray-500">Good</p>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{okPerf}</p>
            <p className="text-xs text-gray-500">Ok</p>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              {starCount > 0 && <span className="flex items-center gap-1"><Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />{starCount}</span>}
              {flagCount > 0 && <span className="flex items-center gap-1"><Flag className="w-4 h-4 fill-red-500 text-red-500" />{flagCount}</span>}
              {starCount === 0 && flagCount === 0 && <span className="text-2xl font-bold text-gray-300">-</span>}
            </div>
            <p className="text-xs text-gray-500">Stars / Flags</p>
          </div>
        </div>

        {/* XP Rate Line Graph */}
        {(() => {
          // Build data points from oldest to newest (lessons are already sorted desc)
          const dataPoints = [...lessons].reverse().map(lesson => {
            const rec = recordMap[lesson.id];
            const xp = calcXP(rec);
            return {
              date: new Date(lesson.session_date + 'T00:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' }),
              pct: xp !== null ? Math.round((xp / MAX_XP) * 100) : null,
              xp,
            };
          }).filter(d => d.pct !== null);

          if (dataPoints.length < 2) return null;

          const W = 600, H = 200, PX = 40, PY = 20;
          const plotW = W - PX * 2, plotH = H - PY * 2;
          const stepX = plotW / (dataPoints.length - 1);

          const points = dataPoints.map((d, i) => ({
            x: PX + i * stepX,
            y: PY + plotH - (d.pct / 100) * plotH,
            ...d,
          }));

          const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
          const areaPath = linePath + ` L${points[points.length - 1].x},${PY + plotH} L${points[0].x},${PY + plotH} Z`;

          return (
            <div className="bg-white rounded-lg shadow-sm border p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">XP Rate Over Time</h3>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
                {/* Grid lines */}
                {[0, 25, 50, 75, 100].map(pct => {
                  const y = PY + plotH - (pct / 100) * plotH;
                  return (
                    <g key={pct}>
                      <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                      <text x={PX - 6} y={y + 4} textAnchor="end" className="text-[10px]" fill="#9ca3af">{pct}%</text>
                    </g>
                  );
                })}

                {/* Area fill */}
                <path d={areaPath} fill="url(#xpGradient)" opacity="0.3" />

                {/* Line */}
                <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                {/* Dots + labels */}
                {points.map((p, i) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r="4" fill="#3b82f6" stroke="white" strokeWidth="2" />
                    <text x={p.x} y={PY + plotH + 14} textAnchor="middle" className="text-[9px]" fill="#6b7280">{p.date}</text>
                    <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[9px]" fill="#3b82f6" fontWeight="600">{p.pct}%</text>
                  </g>
                ))}

                {/* Gradient def */}
                <defs>
                  <linearGradient id="xpGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          );
        })()}

        {/* Full Lesson Table */}
        {lessons.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No Lessons Recorded</h3>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Lesson</th>
                  <th className="px-4 py-3 text-center font-medium">Attendance</th>
                  <th className="px-4 py-3 text-center font-medium">Class</th>
                  <th className="px-4 py-3 text-center font-medium">Score</th>
                  <th className="px-4 py-3 text-left font-medium min-w-[150px]">Notes</th>
                  <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Homework</th>
                  <th className="px-4 py-3 text-center font-medium">Score</th>
                  <th className="px-4 py-3 text-left font-medium min-w-[150px] whitespace-nowrap">HW Notes</th>
                  <th className="px-4 py-3 text-center font-medium">Star/Flag</th>
                  <th className="px-4 py-3 text-center font-medium">XP Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lessons.map(lesson => {
                  const rec = recordMap[lesson.id];
                  return (
                    <tr key={lesson.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {new Date(lesson.session_date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-gray-900">{lesson.lesson_name || '-'}</td>
                      <td className="px-4 py-3 text-center">{rec?.attendance_status ? attendanceBadge(rec.attendance_status) : dash}</td>
                      <td className="px-4 py-3 text-center">{rec?.performance_rating ? ratingBadge(rec.performance_rating) : dash}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{rec?.score != null ? `${rec.score}/${rec.max_score ?? '?'}` : dash}</td>
                      <td className="px-4 py-3 text-gray-700">{rec?.notes || dash}</td>
                      <td className="px-4 py-3 text-center">{rec?.homework_status ? ratingBadge(rec.homework_status) : dash}</td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        <div className="flex flex-col items-center gap-0.5">
                          {rec?.homework_score != null && (
                            <span className="text-xs"><span className="text-gray-400">BT</span> {rec.homework_score}/{rec.homework_max_score ?? '?'}</span>
                          )}
                          {rec?.vocab_score != null && (
                            <span className="text-xs"><span className="text-gray-400">TV</span> {rec.vocab_score}/{rec.vocab_max_score ?? '?'}</span>
                          )}
                          {rec?.homework_score == null && rec?.vocab_score == null && dash}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{rec?.homework_notes || dash}</td>
                      <td className="px-4 py-3 text-center">
                        {rec?.star_flag === 'star' && <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 inline" />}
                        {rec?.star_flag === 'flag' && <Flag className="w-4 h-4 fill-red-500 text-red-500 inline" />}
                        {!rec?.star_flag && dash}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const xp = calcXP(rec);
                          if (xp === null) return dash;
                          const pct = Math.round((xp / MAX_XP) * 100);
                          const color = pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600';
                          return <span className={`font-medium text-xs ${color}`}>{pct}% ({xp}/{MAX_XP})</span>;
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentLessonHistory;
