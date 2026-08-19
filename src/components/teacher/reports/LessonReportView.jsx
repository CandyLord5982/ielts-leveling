import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabase/client';
import { BookOpen, ChevronDown, User } from 'lucide-react';

const LessonReportView = ({ selectedCourse }) => {
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [students, setStudents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionProgress, setSessionProgress] = useState({});
  const [loading, setLoading] = useState(false);

  // Fetch units when course changes
  useEffect(() => {
    if (selectedCourse) {
      fetchUnits();
    }
  }, [selectedCourse]);

  // Fetch data when unit is selected
  useEffect(() => {
    if (selectedUnit) {
      fetchSessionsAndStudents();
    }
  }, [selectedUnit]);

  const fetchUnits = async () => {
    try {
      const { data, error } = await supabase
        .from('units')
        .select('id, title, unit_number')
        .eq('course_id', selectedCourse)
        .order('unit_number');

      if (error) throw error;

      setUnits(data || []);
      if (data && data.length > 0) {
        setSelectedUnit(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching units:', error);
    }
  };

  const fetchSessionsAndStudents = async () => {
    if (!selectedUnit) return;

    try {
      setLoading(true);

      // Fetch sessions in the selected unit
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, title, session_number, assigned_student_id')
        .eq('unit_id', selectedUnit)
        .eq('is_active', true)
        .order('session_number');

      if (sessionsError) throw sessionsError;
      // Sort: shared sessions first, then personal sessions
      const sorted = (sessionsData || []).sort((a, b) => {
        const aPersonal = a.assigned_student_id ? 1 : 0;
        const bPersonal = b.assigned_student_id ? 1 : 0;
        if (aPersonal !== bPersonal) return aPersonal - bPersonal;
        return (a.session_number || 0) - (b.session_number || 0);
      });
      setSessions(sorted);

      // Fetch students enrolled in the course
      const { data: enrollmentsData, error: enrollmentsError } = await supabase
        .from('course_enrollments')
        .select(`
          student_id,
          student:users!student_id(
            id,
            full_name,
            real_name,
            email
          )
        `)
        .eq('course_id', selectedCourse)
        .eq('is_active', true);

      if (enrollmentsError) throw enrollmentsError;
      const normalized = (enrollmentsData || []).map(e => ({
        ...e,
        student: e.student ? { ...e.student, full_name: e.student.real_name || e.student.full_name } : e.student
      }));
      setStudents(normalized);

      // Fetch progress for all students across all sessions
      if (sessionsData && sessionsData.length > 0 && enrollmentsData && enrollmentsData.length > 0) {
        await fetchSessionProgress(
          sessionsData.map(s => s.id),
          enrollmentsData.map(e => e.student_id)
        );
      }
    } catch (error) {
      console.error('Error fetching sessions and students:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionProgress = async (sessionIds, studentIds) => {
    try {
      // Get all exercises for these sessions via assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from('exercise_assignments')
        .select('session_id, exercise_id')
        .in('session_id', sessionIds);

      if (assignmentsError) throw assignmentsError;

      // Group exercises by session
      const sessionExercises = {};
      assignments.forEach(assignment => {
        if (!sessionExercises[assignment.session_id]) {
          sessionExercises[assignment.session_id] = [];
        }
        sessionExercises[assignment.session_id].push(assignment.exercise_id);
      });

      // Get all exercise IDs
      const allExerciseIds = assignments.map(a => a.exercise_id);

      if (allExerciseIds.length === 0) {
        setSessionProgress({});
        return;
      }

      // Fetch user progress for all exercises and students
      const { data: progressData, error: progressError } = await supabase
        .from('user_progress')
        .select('user_id, exercise_id, status, score, max_score')
        .in('user_id', studentIds)
        .in('exercise_id', allExerciseIds);

      if (progressError) throw progressError;

      // Calculate progress percentage for each student-session combination
      const progressMap = {};

      studentIds.forEach(studentId => {
        progressMap[studentId] = {};

        sessionIds.forEach(sessionId => {
          const exercisesInSession = sessionExercises[sessionId] || [];
          const totalExercises = exercisesInSession.length;

          if (totalExercises === 0) {
            progressMap[studentId][sessionId] = { percentage: 0, completed: 0, total: 0 };
            return;
          }

          // Count completed exercises for this student in this session
          const completedExercises = exercisesInSession.filter(exerciseId => {
            const progress = progressData.find(
              p => p.user_id === studentId && p.exercise_id === exerciseId
            );
            return progress && progress.status === 'completed';
          });

          const percentage = Math.round((completedExercises.length / totalExercises) * 100);

          progressMap[studentId][sessionId] = {
            percentage,
            completed: completedExercises.length,
            total: totalExercises
          };
        });
      });

      setSessionProgress(progressMap);
    } catch (error) {
      console.error('Error fetching session progress:', error);
    }
  };

  const getProgressColor = (percentage) => {
    if (percentage === 100) return 'bg-green-500 text-white';
    if (percentage >= 75) return 'bg-blue-500 text-white';
    if (percentage >= 50) return 'bg-yellow-500 text-white';
    if (percentage > 0) return 'bg-orange-500 text-white';
    return 'bg-gray-200 text-gray-600';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Lesson Report</h2>

        {/* Unit Selection */}
        <div className="max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Unit
          </label>
          <div className="relative">
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
            >
              {units.map(unit => (
                <option key={unit.id} value={unit.id}>
                  Unit {unit.unit_number}: {unit.title}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 bottom-[5%] transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading lesson report...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="p-8 text-center">
          <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Lessons Found</h3>
          <p className="text-gray-600">This unit doesn't have any lessons yet.</p>
        </div>
      ) : students.length === 0 ? (
        <div className="p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Enrolled</h3>
          <p className="text-gray-600">No students are currently enrolled in this course.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                  Student
                </th>
                {sessions.map(session => (
                  <th key={session.id} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                    <div className="line-clamp-2">{session.title}</div>
                    {session.assigned_student_id && (
                      <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[9px] font-bold normal-case">
                        <User className="w-2.5 h-2.5" />1:1
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {students.map((enrollment) => {
                const student = enrollment.student;
                return (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white z-10">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-blue-600 font-semibold text-sm">
                              {student.full_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{student.full_name}</div>
                          <div className="text-xs text-gray-500">{student.email}</div>
                        </div>
                      </div>
                    </td>
                    {sessions.map(session => {
                      // Personal session: only show data for the assigned student
                      if (session.assigned_student_id && session.assigned_student_id !== student.id) {
                        return (
                          <td key={session.id} className="px-6 py-4 whitespace-nowrap text-center bg-gray-50">
                            <span className="text-[10px] text-gray-300">—</span>
                          </td>
                        );
                      }

                      const progress = sessionProgress[student.id]?.[session.id];
                      const percentage = progress?.percentage || 0;
                      const completed = progress?.completed || 0;
                      const total = progress?.total || 0;

                      return (
                        <td key={session.id} className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex flex-col items-center">
                            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-medium ${getProgressColor(percentage)}`}>
                              {percentage}%
                            </span>
                            <span className="text-xs text-gray-500 mt-1">
                              {completed}/{total}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LessonReportView;
