import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { ArrowLeft, Star, Flag, Users, X, ChevronDown, ChevronRight, ClipboardCheck, Download, CheckCircle2, Circle, XCircle } from 'lucide-react';
import html2canvas from 'html2canvas';

const ratingColor = {
  wow: 'bg-green-500',
  good: 'bg-yellow-400',
  ok: 'bg-red-500',
};

const ratingLabel = {
  wow: 'Wow',
  good: 'Good',
  ok: 'Ok',
};

const attendanceLabel = {
  present: 'Đúng giờ',
  absent: 'Vắng',
  late: 'Muộn',
  excused: 'Excused',
};

const homeworkLabel = {
  wow: 'Wow',
  good: 'Good',
  ok: 'Ok',
};

const perfXP = { ok: 30, good: 60, wow: 90 };
const hwXP = { ok: 15, good: 30, wow: 45 };
const MAX_XP = 135;

const calcXP = (rec) => {
  if (!rec) return null;
  const isPresent = rec.attendance_status === 'present' || rec.attendance_status === 'late';
  if (!isPresent) return 0;
  const perf = perfXP[rec.performance_rating] || 0;
  const hw = hwXP[rec.homework_status] || 0;
  if (perf === 0 && hw === 0) return null;
  return Math.max(perf + hw - (rec.attendance_status === 'late' ? 15 : 0), 0);
};

const calcClassXPRate = (students, lessons, recordMap) => {
  if (!students.length || !lessons.length) return null;
  let totalPct = 0;
  let countStudents = 0;
  for (const student of students) {
    let sum = 0;
    let count = 0;
    const enrollDate = student.assigned_at ? student.assigned_at.split('T')[0] : null;
    for (const lesson of lessons) {
      if (enrollDate && lesson.session_date < enrollDate) continue;
      const xp = calcXP(recordMap[`${lesson.id}_${student.id}`]);
      if (xp !== null) {
        sum += xp;
        count++;
      }
    }
    if (count > 0) {
      totalPct += (sum / count) / MAX_XP * 100;
      countStudents++;
    }
  }
  if (countStudents === 0) return null;
  const pct = totalPct / countStudents;
  return Math.round(pct / 10 * 10) / 10; // scale 0-10, one decimal
};

const XPRateCircle = ({ rate }) => {
  const size = 48;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (rate / 10) * circumference;
  const color = rate >= 8 ? '#16a34a' : rate >= 5 ? '#ca8a04' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circumference} strokeDashoffset={circumference - progress} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color }}>{rate}</span>
        </div>
      </div>
      <span className="text-[10px] text-gray-400 font-medium">XP Rate</span>
    </div>
  );
};

const TeacherCourseOverview = () => {
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [courseData, setCourseData] = useState({}); // { courseId: { students, lessons, records } }
  const [loading, setLoading] = useState(true);
  const [popover, setPopover] = useState(null); // { courseId, studentId, lessonId, x, y }
  const [expandedStudent, setExpandedStudent] = useState(null); // "courseId_studentId"
  const [lessonModal, setLessonModal] = useState(null); // { courseId, lessonId }
  const popoverRef = useRef(null);
  const modalContentRef = useRef(null);

  const handleScreenshot = async () => {
    if (!modalContentRef.current) return;
    const el = modalContentRef.current;
    // Temporarily expand so full content is captured
    const origStyles = { height: el.style.height, maxHeight: el.style.maxHeight, overflow: el.style.overflow, flex: el.style.flex };
    el.style.height = 'auto';
    el.style.maxHeight = 'none';
    el.style.overflow = 'visible';
    el.style.flex = 'none';
    const scrollBody = el.querySelector('[data-screenshot-body]');
    const origBodyStyles = { overflow: scrollBody?.style.overflow, maxHeight: scrollBody?.style.maxHeight };
    if (scrollBody) { scrollBody.style.overflow = 'visible'; scrollBody.style.maxHeight = 'none'; }
    // Hide nav buttons
    const navButtons = el.querySelector('[data-screenshot-nav]');
    if (navButtons) navButtons.style.display = 'none';
    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      const _lesson = courseData[lessonModal?.courseId]?.lessons?.find(l => l.id === lessonModal?.lessonId)
      const _course = courses.find(c => c.id === lessonModal?.courseId)
      const _className = (_course?.title || 'class').replace(/\s+/g, '-')
      const _date = _lesson?.session_date || new Date().toISOString().slice(0, 10)
      link.download = `${_className}-${_date}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      Object.assign(el.style, origStyles);
      if (scrollBody) Object.assign(scrollBody.style, origBodyStyles);
      if (navButtons) navButtons.style.display = '';
    }
  };

  useEffect(() => {
    if (user && !authLoading && profile) {
      fetchCourses();
    }
  }, [user, authLoading, profile]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setPopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      let coursesList;

      if (isAdmin()) {
        const { data, error } = await supabase
          .from('courses')
          .select('id, title, level_number, description')
          .eq('is_active', true)
          .order('level_number');
        if (error) throw error;
        coursesList = data || [];
      } else {
        const { data: courseTeachers, error } = await supabase
          .from('course_teachers')
          .select('course:courses(id, title, level_number, description)')
          .eq('teacher_id', user.id);
        if (error) throw error;
        coursesList = (courseTeachers || [])
          .map(ct => ct.course)
          .filter(c => c && c.is_active !== false)
          .sort((a, b) => a.level_number - b.level_number);
      }

      setCourses(coursesList);

      // Fetch data for all courses in parallel
      const dataMap = {};
      await Promise.all(coursesList.map(async (course) => {
        dataMap[course.id] = await fetchCourseData(course.id);
      }));
      setCourseData(dataMap);
    } catch (error) {
      console.error('Error fetching courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCourseData = async (courseId) => {
    // Fetch students
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select(`
        student_id,
        assigned_at,
        student:users!student_id(id, full_name, real_name, avatar_url, real_avatar_url)
      `)
      .eq('course_id', courseId)
      .eq('is_active', true);

    const students = (enrollments || []).map(e => {
      if (!e.student) return null;
      const s = e.student;
      return { ...s, full_name: s.real_name || s.full_name, avatar_url: s.real_avatar_url || s.avatar_url, assigned_at: e.assigned_at };
    }).filter(Boolean).sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'));

    // Fetch all lesson_info for this course
    const { data: lessons } = await supabase
      .from('lesson_info')
      .select('id, session_date, lesson_name, skill, feedback, is_draft')
      .eq('course_id', courseId)
      .order('session_date', { ascending: true });

    const lessonList = lessons || [];

    // Fetch all lesson_records for these lessons
    let records = [];
    if (lessonList.length > 0) {
      const lessonIds = lessonList.map(l => l.id);
      const { data: recs } = await supabase
        .from('lesson_records')
        .select('id, lesson_info_id, student_id, attendance_status, homework_status, homework_notes, homework_score, homework_max_score, vocab_score, vocab_max_score, performance_rating, notes, score, max_score, star_flag')
        .in('lesson_info_id', lessonIds);
      records = recs || [];
    }

    // Index records by lessonId+studentId
    const recordMap = {};
    records.forEach(r => {
      const key = `${r.lesson_info_id}_${r.student_id}`;
      recordMap[key] = r;
    });

    // Fetch teacher name for this course
    const { data: teacherData } = await supabase
      .from('course_teachers')
      .select('teacher:users!teacher_id(full_name, real_name, avatar_url, real_avatar_url)')
      .eq('course_id', courseId)
      .limit(1)
      .single();
    const teacherName = teacherData?.teacher?.real_name || teacherData?.teacher?.full_name || '';
    const teacherAvatar = teacherData?.teacher?.real_avatar_url || teacherData?.teacher?.avatar_url || '';

    return { students, lessons: lessonList, recordMap, teacherName, teacherAvatar };
  };

  const handleDotClick = (e, courseId, studentId, lessonId) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({
      courseId,
      studentId,
      lessonId,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
    });
  };

  const getPopoverData = () => {
    if (!popover) return null;
    const data = courseData[popover.courseId];
    if (!data) return null;
    const lesson = data.lessons.find(l => l.id === popover.lessonId);
    const rec = data.recordMap[`${popover.lessonId}_${popover.studentId}`];
    const student = data.students.find(s => s.id === popover.studentId);
    const enrollDate = student?.assigned_at ? student.assigned_at.split('T')[0] : null;
    const isBeforeEnrollment = enrollDate && lesson?.session_date < enrollDate;
    return { lesson, record: rec, isBeforeEnrollment };
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="ml-2 text-gray-600">Loading...</p>
      </div>
    );
  }

  const popoverData = getPopoverData();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/teacher')}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-xl font-bold text-gray-900">Điểm danh</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {courses.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No Courses Assigned</h3>
          </div>
        ) : (
          courses.map(course => {
            const data = courseData[course.id];
            const students = data?.students || [];
            const lessons = data?.lessons || [];

            const classXPRate = calcClassXPRate(students, lessons, data?.recordMap || {});

            return (
              <div key={course.id} className="bg-white rounded-lg shadow-sm border">
                {/* Course Header */}
                <div className="p-5 border-b bg-blue-50 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {classXPRate !== null && <XPRateCircle rate={classXPRate} />}
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        Course {course.level_number}: {course.title}
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">
                        {students.length} student{students.length !== 1 ? 's' : ''} &middot; {lessons.length} lesson{lessons.length !== 1 ? 's' : ''} recorded
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/teacher/class-reports?tab=info&course=${course.id}`)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    Điểm danh
                  </button>
                </div>

                {students.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">No students enrolled</div>
                ) : lessons.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">No lessons recorded yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    {/* Lesson date headers */}
                    <div className="flex items-center border-b bg-gray-50 px-4 py-2">
                      <div className="w-52 flex-shrink-0 text-xs font-medium text-gray-500 uppercase">Student</div>
                      <div className="flex gap-3 flex-1 min-w-0">
                        {lessons.slice(-8).map(lesson => (
                          <div key={lesson.id} className="w-7 flex-shrink-0 text-center">
                            <button
                              onClick={() => lesson.is_draft
                                ? navigate(`/teacher/class-reports?course=${course.id}&date=${lesson.session_date}`)
                                : setLessonModal({ courseId: course.id, lessonId: lesson.id })
                              }
                              className={`text-[10px] leading-none hover:underline cursor-pointer ${lesson.is_draft ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-blue-600'}`}
                            >
                              {new Date(lesson.session_date + 'T00:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Student rows */}
                    {students.map(student => {
                      const expandKey = `${course.id}_${student.id}`;
                      const isExpanded = expandedStudent === expandKey;

                      return (
                        <div key={student.id} className="border-b last:border-b-0">
                          <div className="flex items-center px-4 py-3 hover:bg-gray-50">
                            {/* Student info */}
                            <div className="w-52 flex-shrink-0 flex items-center gap-2">
                              <button
                                onClick={() => setExpandedStudent(isExpanded ? null : expandKey)}
                                className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                              >
                                {isExpanded
                                  ? <ChevronDown className="w-4 h-4" />
                                  : <ChevronRight className="w-4 h-4" />
                                }
                              </button>
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                {student.avatar_url ? (
                                  <img src={student.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                                ) : (
                                  <span className="text-blue-600 font-semibold text-sm">
                                    {student.full_name?.charAt(0).toUpperCase() || 'S'}
                                  </span>
                                )}
                              </div>
                              <span
                                className="text-sm font-medium text-blue-600 truncate cursor-pointer hover:underline"
                                onClick={() => navigate(`/teacher/student-history/${course.id}/${student.id}`)}
                              >
                                {student.full_name}
                              </span>
                            </div>

                            {/* Lesson dots */}
                            <div className="flex gap-3 flex-1 min-w-0">
                              {lessons.slice(-8).map(lesson => {
                                const enrollDate = student.assigned_at ? student.assigned_at.split('T')[0] : null;
                                const isBeforeEnrollment = enrollDate && lesson.session_date < enrollDate;

                                if (isBeforeEnrollment) {
                                  return (
                                    <div
                                      key={lesson.id}
                                      className="w-7 h-7 rounded-full flex-shrink-0 border border-dashed border-gray-200 flex items-center justify-center"
                                      title="Not enrolled yet"
                                    >
                                      <span className="text-[8px] text-gray-300">—</span>
                                    </div>
                                  );
                                }

                                const rec = data.recordMap[`${lesson.id}_${student.id}`];
                                const rating = rec?.performance_rating || '';
                                const dotColor = ratingColor[rating] || 'bg-gray-300';
                                const isActive = popover?.lessonId === lesson.id && popover?.studentId === student.id;

                                return (
                                  <button
                                    key={lesson.id}
                                    onClick={(e) => handleDotClick(e, course.id, student.id, lesson.id)}
                                    className={`w-7 h-7 rounded-full flex-shrink-0 transition-all flex items-center justify-center ${dotColor} ${
                                      isActive ? 'ring-2 ring-blue-500 ring-offset-1 scale-110' : 'hover:scale-110 hover:ring-2 hover:ring-gray-300'
                                    }`}
                                    title={`${lesson.session_date} - ${ratingLabel[rating] || 'No rating'}`}
                                  >
                                    {rec?.star_flag === 'star' && <Star className="w-3.5 h-3.5 fill-yellow-300 text-yellow-300 drop-shadow" />}
                                    {rec?.star_flag === 'flag' && <Flag className="w-3.5 h-3.5 fill-red-600 text-red-600 drop-shadow" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Expanded detail panel */}
                          {isExpanded && (
                            <div className="bg-gray-50 px-4 pb-4">
                              <div className="overflow-x-auto rounded-lg border bg-white">
                                <table className="w-full text-sm min-w-[800px]">
                                  <thead className="bg-gray-100 text-gray-600">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-medium">Date</th>
                                      <th className="px-3 py-2 text-left font-medium">Lesson</th>
                                      <th className="px-3 py-2 text-center font-medium">Attendance</th>
                                      <th className="px-3 py-2 text-center font-medium">Class</th>
                                      <th className="px-3 py-2 text-center font-medium">Score</th>
                                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Notes</th>
                                      <th className="px-3 py-2 text-center font-medium whitespace-nowrap">Homework</th>
                                      <th className="px-3 py-2 text-center font-medium whitespace-nowrap">Score</th>
                                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">HW Notes</th>
                                      <th className="px-3 py-2 text-center font-medium">Star/Flag</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {[...lessons].reverse().slice(0, 8).map(lesson => {
                                      const rec = data.recordMap[`${lesson.id}_${student.id}`];
                                      const enrollDate = student.assigned_at ? student.assigned_at.split('T')[0] : null;
                                      const isBeforeEnrollment = enrollDate && lesson.session_date < enrollDate;
                                      return (
                                        <tr key={lesson.id} className={`hover:bg-gray-50${isBeforeEnrollment ? ' opacity-40' : ''}`}>
                                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                                            {new Date(lesson.session_date + 'T00:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                                          </td>
                                          <td className="px-3 py-2 text-gray-900">{lesson.lesson_name || '-'}</td>
                                          <td className="px-3 py-2 text-center">
                                            {isBeforeEnrollment ? (
                                              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-400 italic">N/E</span>
                                            ) : rec?.attendance_status ? (
                                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                                rec.attendance_status === 'present' ? 'bg-green-100 text-green-700' :
                                                rec.attendance_status === 'late' ? 'bg-yellow-100 text-yellow-700' :
                                                rec.attendance_status === 'absent' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-600'
                                              }`}>
                                                {attendanceLabel[rec.attendance_status] || rec.attendance_status}
                                              </span>
                                            ) : <span className="text-gray-300">-</span>}
                                          </td>
                                          <td className="px-3 py-2 text-center">
                                            {rec?.performance_rating ? (
                                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                                rec.performance_rating === 'wow' ? 'bg-green-100 text-green-700' :
                                                rec.performance_rating === 'good' ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-red-100 text-red-700'
                                              }`}>
                                                {ratingLabel[rec.performance_rating] || rec.performance_rating}
                                              </span>
                                            ) : <span className="text-gray-300">-</span>}
                                          </td>
                                          <td className="px-3 py-2 text-center text-gray-600">
                                            {rec?.score != null ? `${rec.score}/${rec.max_score ?? '?'}` : <span className="text-gray-300">-</span>}
                                          </td>
                                          <td className="px-3 py-2 text-gray-700">{rec?.notes || <span className="text-gray-300">-</span>}</td>
                                          <td className="px-3 py-2 text-center">
                                            {rec?.homework_status ? (
                                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                                rec.homework_status === 'wow' ? 'bg-green-100 text-green-700' :
                                                rec.homework_status === 'good' ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-red-100 text-red-700'
                                              }`}>
                                                {homeworkLabel[rec.homework_status] || rec.homework_status}
                                              </span>
                                            ) : <span className="text-gray-300">-</span>}
                                          </td>
                                          <td className="px-3 py-2 text-center text-gray-600">
                                            <div className="flex flex-col items-center gap-0.5">
                                              {rec?.homework_score != null && (
                                                <span className="text-xs"><span className="text-gray-400">BT</span> {rec.homework_score}/{rec.homework_max_score ?? '?'}</span>
                                              )}
                                              {rec?.vocab_score != null && (
                                                <span className="text-xs"><span className="text-gray-400">TV</span> {rec.vocab_score}/{rec.vocab_max_score ?? '?'}</span>
                                              )}
                                              {rec?.homework_score == null && rec?.vocab_score == null && <span className="text-gray-300">-</span>}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2 text-gray-700">{rec?.homework_notes || <span className="text-gray-300">-</span>}</td>
                                          <td className="px-3 py-2 text-center">
                                            {rec?.star_flag === 'star' && <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 inline" />}
                                            {rec?.star_flag === 'flag' && <Flag className="w-4 h-4 fill-red-500 text-red-500 inline" />}
                                            {!rec?.star_flag && <span className="text-gray-300">-</span>}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {lessons.length > 8 && (
                                <div className="mt-2 text-center">
                                  <button
                                    onClick={() => navigate(`/teacher/student-history/${course.id}/${student.id}`)}
                                    className="text-sm text-blue-600 hover:underline font-medium"
                                  >
                                    View all {lessons.length} lessons
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Lesson Detail Modal */}
      {lessonModal && (() => {
        const data = courseData[lessonModal.courseId];
        if (!data) return null;
        const lesson = data.lessons.find(l => l.id === lessonModal.lessonId);
        if (!lesson) return null;
        const lessonIdx = data.lessons.indexOf(lesson);
        const prevLesson = data.lessons[lessonIdx - 1];
        const nextLesson = data.lessons[lessonIdx + 1];
        const students = data.students || [];
        const courseInfo = courses.find(c => c.id === lessonModal.courseId);
        const formattedDate = new Date(lesson.session_date + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setLessonModal(null)}>
            <div ref={modalContentRef} className="bg-white rounded-xl shadow-xl max-w-2xl w-full h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
             
              {/* Report Header */}
              <div className="text-center relative">
                <div className="bg-blue-800 px-5 pt-4 pb-8">
                  <div className="flex items-center justify-between mb-2" data-screenshot-nav>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => prevLesson && setLessonModal({ ...lessonModal, lessonId: prevLesson.id })}
                        disabled={!prevLesson}
                        className="p-1 rounded hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowLeft className="w-4 h-4 text-blue-200" />
                      </button>
                      <button
                        onClick={() => nextLesson && setLessonModal({ ...lessonModal, lessonId: nextLesson.id })}
                        disabled={!nextLesson}
                        className="p-1 rounded hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowLeft className="w-4 h-4 text-blue-200 rotate-180" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleScreenshot} className="text-blue-200 hover:text-white p-1 rounded hover:bg-blue-500" title="Tải ảnh báo cáo">
                        <Download className="w-5 h-5" />
                      </button>
                      <button onClick={() => setLessonModal(null)} className="text-blue-200 hover:text-white">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <h2 className="text-xl font-bold text-white uppercase tracking-wide">Báo cáo học tập ngày</h2>
                  <p className="text-sm text-blue-200 mt-0.5">Hệ thống quản lý Giáo dục thông minh</p>
                </div>

                <div className="-mt-4 text-sm text-gray-700 bg-white rounded-lg px-6 py-2 mx-5 shadow-sm border">
                  <div className="flex items-center justify-center gap-4 flex-wrap">
                    <span><span className="text-gray-400">Ngày:</span> <span className="font-medium">{formattedDate}</span></span>
                    <span className="text-gray-300">|</span>
                    <span><span className="text-gray-400">Lớp:</span> <span className="font-medium">{courseInfo?.title || ''}</span></span>
                    <span className="text-gray-300">|</span>
                    <span><span className="text-gray-400">Giáo viên:</span> <span className="font-medium">{data.teacherName || ''}</span></span>
                  </div>
                  {(lesson.lesson_name || lesson.skill) && (
                    <div className="flex items-center justify-center gap-3 mt-1.5 text-sm">
                      {lesson.lesson_name && <span className="font-bold text-blue-800">{lesson.lesson_name}</span>}
                      {lesson.skill && <span className="font-bold text-blue-800 capitalize">{lesson.skill}</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="overflow-y-auto pt-3" data-screenshot-body>
                {(() => {
                  const hasClassScore = students.some(s => data.recordMap[`${lesson.id}_${s.id}`]?.score != null);
                  const hasHWScore = students.some(s => { const r = data.recordMap[`${lesson.id}_${s.id}`]; return r?.homework_score != null || r?.vocab_score != null; });
                  const totalCols = 4 + (hasClassScore ? 1 : 0) + (hasHWScore ? 1 : 0);
                  return (
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-blue-800">Student</th>
                      <th className="text-center px-2 py-2 font-medium text-blue-800">XP</th>
                      <th className="text-center px-2 py-2 font-medium text-blue-800">Class</th>
                      {hasClassScore && <th className="text-center px-2 py-2 font-medium text-blue-800">Score</th>}
                      <th className="text-center px-2 py-2 font-medium text-blue-800">HW</th>
                      {hasHWScore && <th className="text-center px-2 py-2 font-medium text-blue-800">Score</th>}
                      <th className="text-left px-2 py-2 font-medium text-blue-800">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {students.map(student => {
                      const enrollDate = student.assigned_at ? student.assigned_at.split('T')[0] : null;
                      const isBeforeEnrollment = enrollDate && lesson.session_date < enrollDate;
                      const rec = data.recordMap[`${lesson.id}_${student.id}`];

                      if (isBeforeEnrollment) {
                        return (
                          <tr key={student.id} className="text-gray-300">
                            <td className="px-4 py-2.5 flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gray-100 flex-shrink-0" />
                              <span className="truncate">{student.full_name}</span>
                            </td>
                            <td colSpan={totalCols - 1} className="px-2 py-2.5 text-center text-xs italic">Not enrolled</td>
                          </tr>
                        );
                      }

                      const isAbsent = rec?.attendance_status === 'absent';

                      return (
                        <tr key={student.id} className={isAbsent ? '' : 'hover:bg-gray-50'}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-blue-100 flex-shrink-0 overflow-hidden">
                                {student.avatar_url ? (
                                  <img src={student.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                                ) : (
                                  <div className="w-7 h-7 flex items-center justify-center text-blue-600 font-semibold text-xs">
                                    {student.full_name?.charAt(0).toUpperCase() || 'S'}
                                  </div>
                                )}
                              </div>
                              <span className={`max-w-[140px] ${isAbsent ? 'text-gray-400 italic font-normal' : 'font-medium text-gray-900'}`}>{student.full_name}</span>
                              {!isAbsent && rec?.star_flag === 'star' && <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 flex-shrink-0" />}
                              {!isAbsent && rec?.star_flag === 'flag' && <Flag className="w-3.5 h-3.5 fill-red-500 text-red-500 flex-shrink-0" />}
                            </div>
                          </td>
                          {isAbsent ? (
                            <>
                              <td className="px-2 py-2.5 text-center text-xs text-gray-300">0</td>
                              <td className="px-2 py-2.5 text-center text-xs text-gray-300 italic">Vắng</td>
                              {hasClassScore && <td className="px-2 py-2.5"></td>}
                              <td className="px-2 py-2.5"></td>
                              {hasHWScore && <td className="px-2 py-2.5"></td>}
                              <td className="px-2 py-2.5"></td>
                            </>
                          ) : (
                            <>
                              <td className="px-2 py-2.5 text-center">
                                {(() => {
                                  const xp = calcXP(rec);
                                  if (xp == null) return <span className="text-gray-300">—</span>;
                                  const color = xp >= 105 ? 'text-green-600' : xp >= 60 ? 'text-yellow-600' : 'text-red-500';
                                  return <span className={`text-sm font-semibold ${color}`}>+{xp}</span>;
                                })()}
                              </td>
                              <td className="px-2 py-2.5">
                                <div className="flex justify-center">
                                  {rec?.performance_rating === 'wow' && <CheckCircle2 className="w-6 h-6 text-green-500 fill-green-500 stroke-white" />}
                                  {rec?.performance_rating === 'good' && <Circle className="w-6 h-6 text-yellow-500 fill-yellow-500 stroke-yellow-500" />}
                                  {rec?.performance_rating === 'ok' && <XCircle className="w-6 h-6 text-red-500 fill-red-500 stroke-white" />}
                                  {!rec?.performance_rating && <span className="text-gray-300">—</span>}
                                </div>
                              </td>
                              {hasClassScore && (
                                <td className="px-2 py-2.5 text-center text-xs text-gray-600">
                                  {rec?.score != null ? `${rec.score}/${rec.max_score ?? '?'}` : <span className="text-gray-300">—</span>}
                                </td>
                              )}
                              <td className="px-2 py-2.5">
                                <div className="flex justify-center">
                                  {rec?.homework_status === 'wow' && <CheckCircle2 className="w-6 h-6 text-green-500 fill-green-500 stroke-white" />}
                                  {rec?.homework_status === 'good' && <Circle className="w-6 h-6 text-yellow-500 fill-yellow-500 stroke-yellow-500" />}
                                  {rec?.homework_status === 'ok' && <XCircle className="w-6 h-6 text-red-500 fill-red-500 stroke-white" />}
                                  {!rec?.homework_status && <span className="text-gray-300">—</span>}
                                </div>
                              </td>
                              {hasHWScore && (
                                <td className="px-2 py-2.5 text-center text-xs text-gray-600">
                                  <div className="flex flex-col items-center gap-0.5">
                                    {rec?.homework_score != null && <span>BT {rec.homework_score}/{rec.homework_max_score ?? '?'}</span>}
                                    {rec?.vocab_score != null && <span>TV {rec.vocab_score}/{rec.vocab_max_score ?? '?'}</span>}
                                    {rec?.homework_score == null && rec?.vocab_score == null && <span className="text-gray-300">—</span>}
                                  </div>
                                </td>
                              )}
                              <td className="px-2 py-2.5 text-xs text-gray-600">
                                <div className="space-y-0.5">
                                  {rec?.notes && <p>{rec.notes}</p>}
                                  {rec?.homework_notes && <p className="text-gray-400">HW: {rec.homework_notes}</p>}
                                  {!rec?.notes && !rec?.homework_notes && <span className="text-gray-300">—</span>}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                  );
                })()}
              </div>

              {/* Footer with lesson feedback */}
              {lesson.feedback && (
                <div className="px-5 pt-3 pb-4">
                  <div className="bg-blue-50 rounded-lg px-6 py-3 flex gap-4">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-blue-100 overflow-hidden">
                        {data.teacherAvatar ? (
                          <img src={data.teacherAvatar} alt="" className="w-12 h-12 rounded-full object-cover" />
                        ) : (
                          <div className="w-12 h-12 flex items-center justify-center text-blue-600 font-semibold text-lg">
                            {data.teacherName?.charAt(0).toUpperCase() || 'T'}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 font-medium mt-1 text-center">{data.teacherName}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 mb-1">Tổng kết buổi học</p>
                      <p className="text-sm text-gray-700 whitespace-pre-line">{lesson.feedback}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Popover */}
      {popover && popoverData && (
        <div
          ref={popoverRef}
          className="fixed z-50 bg-white rounded-lg shadow-xl border p-4 w-72"
          style={{
            left: Math.min(popover.x - 144, window.innerWidth - 300),
            top: popover.y,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900 text-sm">
              {popoverData.lesson?.session_date
                ? new Date(popoverData.lesson.session_date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })
                : 'Lesson'}
            </h4>
            <button onClick={() => setPopover(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {popoverData.lesson?.lesson_name && (
            <p className="text-xs text-gray-500 mb-3">{popoverData.lesson.lesson_name}</p>
          )}

          {popoverData.isBeforeEnrollment ? (
            <p className="text-sm text-gray-400 italic">Not enrolled on this date</p>
          ) : !popoverData.record ? (
            <p className="text-sm text-gray-400">No record for this lesson</p>
          ) : (
            <div className="space-y-1 text-xs">
              {/* Star/Flag + Attendance inline */}
              <div className="flex items-center gap-2">
                {popoverData.record.attendance_status && (
                  <span className={`font-medium px-1.5 py-0.5 rounded capitalize ${
                    popoverData.record.attendance_status === 'present' ? 'bg-green-100 text-green-700' :
                    popoverData.record.attendance_status === 'late' ? 'bg-yellow-100 text-yellow-700' :
                    popoverData.record.attendance_status === 'absent' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{attendanceLabel[popoverData.record.attendance_status] || popoverData.record.attendance_status}</span>
                )}
                {popoverData.record.star_flag === 'star' && <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />}
                {popoverData.record.star_flag === 'flag' && <Flag className="w-3.5 h-3.5 fill-red-500 text-red-500" />}
              </div>

              {/* Performance tag + note on one row */}
              {(popoverData.record.performance_rating || popoverData.record.notes) && (
                <div className="flex items-center gap-1.5">
                  {popoverData.record.performance_rating && (
                    <span className={`font-medium px-1.5 py-0.5 rounded shrink-0 ${
                      popoverData.record.performance_rating === 'wow' ? 'bg-green-100 text-green-700' :
                      popoverData.record.performance_rating === 'good' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      Class: {ratingLabel[popoverData.record.performance_rating] || popoverData.record.performance_rating}
                    </span>
                  )}
                  {popoverData.record.score != null && (
                    <span className="text-gray-500">{popoverData.record.score}/{popoverData.record.max_score ?? '?'}</span>
                  )}
                  {popoverData.record.notes && (
                    <span className="text-gray-600 truncate">{popoverData.record.notes}</span>
                  )}
                </div>
              )}

              {/* Homework tag + note on one row */}
              {(popoverData.record.homework_status || popoverData.record.homework_notes) && (
                <div className="flex items-center gap-1.5">
                  {popoverData.record.homework_status && (
                    <span className={`font-medium px-1.5 py-0.5 rounded shrink-0 ${
                      popoverData.record.homework_status === 'wow' ? 'bg-green-100 text-green-700' :
                      popoverData.record.homework_status === 'good' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      Home: {homeworkLabel[popoverData.record.homework_status] || popoverData.record.homework_status}
                    </span>
                  )}
                  {popoverData.record.homework_score != null && (
                    <span className="text-gray-500">BT: {popoverData.record.homework_score}/{popoverData.record.homework_max_score ?? '?'}</span>
                  )}
                  {popoverData.record.vocab_score != null && (
                    <span className="text-gray-500">TV: {popoverData.record.vocab_score}/{popoverData.record.vocab_max_score ?? '?'}</span>
                  )}
                  {popoverData.record.homework_notes && (
                    <span className="text-gray-600 truncate">{popoverData.record.homework_notes}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TeacherCourseOverview;
