import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabase/client';
import { useAuth } from '../../hooks/useAuth';
import StudentExerciseMatrix from './reports/StudentExerciseMatrix';
import UnitProgressView from './reports/UnitProgressView';
import LessonReportView from './reports/LessonReportView';
import TestResultsView from './reports/TestResultsView';
import VideoSubmissionReview from './VideoSubmissionReview';
import {
  ArrowLeft,
  BookOpen,
  Users,
  Trophy,
  ChevronDown,
  ChevronRight,
  Grid,
  BarChart3,
  FileText,
  Video
} from 'lucide-react';

const CourseReport = () => {
  const { courseId } = useParams();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [course, setCourse] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentProgress, setStudentProgress] = useState([]);
  const [courseStats, setCourseStats] = useState({});
  const [courseExerciseIds, setCourseExerciseIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [currentView, setCurrentView] = useState(searchParams.get('view') || 'overview');
  const initialSessionId = searchParams.get('sessionId') || null;

  useEffect(() => {
    if (user && courseId && !authLoading) {
      fetchCourse();
    }
  }, [user, courseId, authLoading]);

  useEffect(() => {
    if (course) {
      fetchCourseStudents();
      fetchCourseStats();
    }
  }, [course]);

  const fetchCourse = async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, level_number, description')
        .eq('id', courseId)
        .single();

      if (error) throw error;
      setCourse(data);
    } catch (error) {
      console.error('Error fetching course:', error);
    }
  };

  const fetchCourseStudents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('course_enrollments')
        .select(`
          student_id,
          assigned_at,
          student:users!student_id(
            id,
            full_name,
            real_name,
            email,
            xp,
            current_level,
            streak_count,
            last_activity_date
          )
        `)
        .eq('course_id', courseId)
        .eq('is_active', true);

      if (error) throw error;
      const normalized = (data || []).map(e => ({
        ...e,
        student: e.student ? { ...e.student, full_name: e.student.real_name || e.student.full_name } : e.student
      }));
      setStudents(normalized);

      if (data?.length > 0) {
        const studentIds = data.map(enrollment => enrollment.student_id);
        await fetchStudentProgress(studentIds);
      }
    } catch (error) {
      console.error('Error fetching course students:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentProgress = async (studentIds) => {
    try {
      const { data: units, error: unitsErr } = await supabase
        .from('units')
        .select('id')
        .eq('course_id', courseId);
      if (unitsErr) throw unitsErr;

      const unitIds = (units || []).map(u => u.id);
      if (unitIds.length === 0) { setStudentProgress([]); return; }

      const { data: sessions, error: sessionsErr } = await supabase
        .from('sessions')
        .select('id')
        .in('unit_id', unitIds);
      if (sessionsErr) throw sessionsErr;

      const sessionIds = (sessions || []).map(s => s.id);
      if (sessionIds.length === 0) { setStudentProgress([]); return; }

      const { data: assignments, error: assignErr } = await supabase
        .from('exercise_assignments')
        .select('session_id, exercise:exercises(id, title, exercise_type)')
        .in('session_id', sessionIds);
      if (assignErr) throw assignErr;

      const exerciseIdToMeta = {};
      const exerciseIds = [];
      (assignments || []).forEach(a => {
        const ex = a.exercise;
        if (ex?.id) {
          exerciseIds.push(ex.id);
          exerciseIdToMeta[ex.id] = { ...ex, session_id: a.session_id };
        }
      });

      if (exerciseIds.length === 0) { setStudentProgress([]); return; }

      const { data: progress, error: progressErr } = await supabase
        .from('user_progress')
        .select('id, user_id, exercise_id, status, score, max_score, attempts, time_spent, completed_at, updated_at')
        .in('user_id', studentIds)
        .in('exercise_id', exerciseIds);
      if (progressErr) throw progressErr;

      const withMeta = (progress || []).map(p => ({
        ...p,
        exercise: {
          id: p.exercise_id,
          title: exerciseIdToMeta[p.exercise_id]?.title,
          exercise_type: exerciseIdToMeta[p.exercise_id]?.exercise_type,
        }
      }));

      setStudentProgress(withMeta);
    } catch (error) {
      console.error('Error fetching student progress:', error);
    }
  };

  const fetchCourseStats = async () => {
    try {
      const { count: studentsCount } = await supabase
        .from('course_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', courseId)
        .eq('is_active', true);

      const { data: units } = await supabase
        .from('units')
        .select('id')
        .eq('course_id', courseId);
      const unitIds = (units || []).map(u => u.id);
      let totalExercisesCount = 0;
      let sessionIds = [];
      if (unitIds.length > 0) {
        const { data: sessions } = await supabase
          .from('sessions')
          .select('id')
          .in('unit_id', unitIds);
        sessionIds = (sessions || []).map(s => s.id);
        if (sessionIds.length > 0) {
          const { count: exCount } = await supabase
            .from('exercises')
            .select('id', { count: 'exact', head: true })
            .in('session_id', sessionIds);
          totalExercisesCount = exCount || 0;
        }
      }

      setCourseStats({
        totalStudents: studentsCount || 0,
        totalExercises: totalExercisesCount || 0
      });

      if (sessionIds.length > 0) {
        const { data: exList } = await supabase
          .from('exercise_assignments')
          .select('exercise_id')
          .in('session_id', sessionIds);
        const ids = Array.from(new Set((exList || []).map(e => e.exercise_id)));
        setCourseExerciseIds(ids);
      } else {
        setCourseExerciseIds([]);
      }
    } catch (error) {
      console.error('Error fetching course stats:', error);
    }
  };

  const getStudentStats = (studentId) => {
    const courseExerciseSet = new Set(courseExerciseIds);
    const sp = studentProgress.filter(p => p.user_id === studentId && courseExerciseSet.has(p.exercise_id));

    const completed = sp.filter(p => p.status === 'completed').length;
    const attempted = sp.filter(p => p.status === 'attempted' || p.status === 'in_progress').length;
    const totalTime = sp.reduce((sum, p) => sum + (p.time_spent || 0), 0);

    const scores = sp
      .filter(p => p.score !== null && (p.max_score || 0) > 0)
      .map(p => (p.score / p.max_score) * 100);

    const averageScore = scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;

    const total = courseExerciseIds.length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      completed,
      attempted,
      total,
      averageScore: Math.round(averageScore),
      totalTime: Math.round(totalTime / 60),
      completionRate
    };
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-600 bg-green-100';
    if (score >= 75) return 'text-blue-600 bg-blue-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getStudentDetailedProgress = (studentId) => {
    return studentProgress
      .filter(p => p.user_id === studentId)
      .sort((a, b) => new Date(b.completed_at || b.updated_at) - new Date(a.completed_at || a.updated_at));
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="ml-2 text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        {course && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Course {course.level_number}: {course.title}
            </h1>
            <p className="text-sm text-gray-600">{course.description}</p>
          </div>
        )}
      </div>

      {/* View Toggle */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <span className="block text-sm font-medium text-gray-700 mb-2">View:</span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCurrentView('overview')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'overview'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setCurrentView('matrix')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'matrix'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Matrix</span>
          </button>
          <button
            onClick={() => setCurrentView('unit-progress')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'unit-progress'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Units</span>
          </button>
          <button
            onClick={() => setCurrentView('lesson-report')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'lesson-report'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Lessons</span>
          </button>
          <button
            onClick={() => setCurrentView('test-results')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'test-results'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Tests</span>
          </button>
          <button
            onClick={() => setCurrentView('video-reviews')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              currentView === 'video-reviews'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>Video Reviews</span>
          </button>
        </div>
      </div>

      {/* Course Overview Stats */}
      {currentView === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <Users className="w-8 h-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Enrolled Students</p>
                <p className="text-2xl font-bold text-gray-900">{courseStats.totalStudents || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <BookOpen className="w-8 h-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Average Score</p>
                <p className="text-2xl font-bold text-gray-900">
                  {students.length > 0
                    ? Math.round(students.reduce((sum, student) =>
                        sum + getStudentStats(student.student_id).averageScore, 0) / students.length)
                    : 0}%
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <Trophy className="w-8 h-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Avg Completion</p>
                <p className="text-2xl font-bold text-gray-900">
                  {students.length > 0
                    ? Math.round(students.reduce((sum, student) =>
                        sum + getStudentStats(student.student_id).completionRate, 0) / students.length)
                    : 0}%
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Students List */}
      {currentView === 'overview' && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Student Progress</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading student data...</p>
            </div>
          ) : students.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Enrolled</h3>
              <p className="text-gray-600">No students are currently enrolled in this course.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {students.map((enrollment) => {
                const student = enrollment.student;
                const stats = getStudentStats(student.id);
                const detailedProgress = getStudentDetailedProgress(student.id);
                const isExpanded = expandedStudent === student.id;

                return (
                  <div key={student.id} className="p-6">
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedStudent(isExpanded ? null : student.id)}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-semibold">
                            {student.full_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">{student.full_name}</h3>
                          <p className="text-sm text-gray-600">{student.email}</p>
                          <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                            <span>Level {student.current_level || 1}</span>
                            <span>{student.xp || 0} XP</span>
                            <span>🔥 {student.streak_count || 0} day streak</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-6">
                        <div className="text-center">
                          <div className="text-sm font-medium text-gray-900">{stats.completed}/{stats.total}</div>
                          <div className="text-xs text-gray-500">Completed</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-sm font-medium px-2 py-1 rounded-full ${getScoreColor(stats.averageScore)}`}>
                            {stats.averageScore}%
                          </div>
                          <div className="text-xs text-gray-500">Avg Score</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-medium text-gray-900">{stats.totalTime}m</div>
                          <div className="text-xs text-gray-500">Study Time</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-sm font-medium px-2 py-1 rounded-full ${getScoreColor(stats.completionRate)}`}>
                            {stats.completionRate}%
                          </div>
                          <div className="text-xs text-gray-500">Progress</div>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <h4 className="text-md font-medium text-gray-900 mb-4">Recent Exercise Progress</h4>
                        {detailedProgress.length === 0 ? (
                          <p className="text-gray-500 text-sm">No exercises completed yet</p>
                        ) : (
                          <div className="space-y-3 max-h-60 overflow-y-auto">
                            {detailedProgress.slice(0, 10).map((progress) => (
                              <div key={progress.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-gray-900">
                                    {progress.exercise?.title || 'Exercise'}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {progress.exercise?.exercise_type}
                                  </div>
                                </div>
                                <div className="flex items-center space-x-3">
                                  <div className={`text-sm font-medium px-2 py-1 rounded ${
                                    progress.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {progress.status === 'completed' ? 'Completed' : 'Attempted'}
                                  </div>
                                  {progress.score !== null && progress.max_score > 0 && (
                                    <div className={`text-sm font-medium px-2 py-1 rounded-full ${
                                      getScoreColor((progress.score / progress.max_score) * 100)
                                    }`}>
                                      {Math.round((progress.score / progress.max_score) * 100)}%
                                    </div>
                                  )}
                                  <div className="text-xs text-gray-500">
                                    {progress.attempts} attempt{progress.attempts !== 1 ? 's' : ''}
                                  </div>
                                </div>
                              </div>
                            ))}
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
      )}

      {/* Report Views */}
      {currentView === 'matrix' && <StudentExerciseMatrix selectedCourse={courseId} initialSessionId={initialSessionId} />}
      {currentView === 'unit-progress' && <UnitProgressView selectedCourse={courseId} />}
      {currentView === 'lesson-report' && <LessonReportView selectedCourse={courseId} />}
      {currentView === 'test-results' && <TestResultsView selectedCourse={courseId} />}
      {currentView === 'video-reviews' && <VideoSubmissionReview selectedCourse={courseId} />}
    </div>
  );
};

export default CourseReport;
