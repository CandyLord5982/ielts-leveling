import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabase/client';
import { CheckCircle, Clock, Circle, ChevronDown, ChevronRight } from 'lucide-react';

const UnitProgressView = ({ selectedCourse }) => {
  const [units, setUnits] = useState([]);
  const [students, setStudents] = useState([]);
  const [progressData, setProgressData] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState(null);

  useEffect(() => {
    if (selectedCourse) {
      fetchUnitProgressData();
    }
  }, [selectedCourse]);

  const fetchUnitProgressData = async () => {
    if (!selectedCourse) return;

    try {
      setLoading(true);

      // Fetch units in the course
      const { data: unitsData, error: unitsError } = await supabase
        .from('units')
        .select('id, title, unit_number')
        .eq('course_id', selectedCourse)
        .eq('is_active', true)
        .order('unit_number', { ascending: false });

      if (unitsError) throw unitsError;

      // Fetch students enrolled in the course
      const { data: enrollments, error: studentsError } = await supabase
        .from('course_enrollments')
        .select(`
          student_id,
          assigned_at,
          student:users!student_id(
            id,
            full_name,
            real_name,
            email
          )
        `)
        .eq('course_id', selectedCourse)
        .eq('is_active', true);

      if (studentsError) throw studentsError;

      const studentList = (enrollments || []).map(enrollment => {
        if (!enrollment.student) return null;
        const s = enrollment.student;
        return { ...s, full_name: s.real_name || s.full_name, assigned_at: enrollment.assigned_at };
      }).filter(Boolean);

      // Fetch sessions for each unit
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, unit_id')
        .in('unit_id', (unitsData || []).map(u => u.id))
        .eq('is_active', true);

      if (sessionsError) throw sessionsError;

      // Fetch exercises via exercise_assignments
      const sessionIds = (sessionsData || []).map(s => s.id);
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('exercise_assignments')
        .select(`
          session_id,
          exercise:exercises(id)
        `)
        .in('session_id', sessionIds);

      if (assignmentsError) throw assignmentsError;

      // Extract exercises from assignments
      const exercisesData = (assignmentsData || [])
        .filter(a => a.exercise?.id)
        .map(a => ({
          id: a.exercise.id,
          session_id: a.session_id
        }));

      // Fetch user progress for all exercises
      const exerciseIds = (exercisesData || []).map(e => e.id);
      const { data: userProgressData, error: progressError } = await supabase
        .from('user_progress')
        .select('user_id, exercise_id, status')
        .in('user_id', studentList.map(s => s.id))
        .in('exercise_id', exerciseIds);

      if (progressError) throw progressError;

      // Build mapping: session -> unit
      const sessionToUnit = new Map();
      (sessionsData || []).forEach(s => sessionToUnit.set(s.id, s.unit_id));

      // Build mapping: exercise -> session -> unit
      const exerciseToUnit = new Map();
      (exercisesData || []).forEach(e => {
        const unitId = sessionToUnit.get(e.session_id);
        if (unitId) exerciseToUnit.set(e.id, unitId);
      });

      // Calculate progress per student per unit
      const progressMap = new Map();
      const unitExerciseCounts = new Map(); // unit_id -> total exercises
      const studentUnitProgress = new Map(); // student-unit -> completed count

      // Count total exercises per unit
      (exercisesData || []).forEach(e => {
        const unitId = exerciseToUnit.get(e.id);
        if (unitId) {
          unitExerciseCounts.set(unitId, (unitExerciseCounts.get(unitId) || 0) + 1);
        }
      });

      // Count completed exercises per student per unit
      (userProgressData || []).forEach(progress => {
        const unitId = exerciseToUnit.get(progress.exercise_id);
        if (unitId && progress.status === 'completed') {
          const key = `${progress.user_id}-${unitId}`;
          studentUnitProgress.set(key, (studentUnitProgress.get(key) || 0) + 1);
        }
      });

      // Build final progress map with percentages
      studentList.forEach(student => {
        (unitsData || []).forEach(unit => {
          const key = `${student.id}-${unit.id}`;
          const completed = studentUnitProgress.get(key) || 0;
          const total = unitExerciseCounts.get(unit.id) || 0;
          const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

          progressMap.set(key, {
            user_id: student.id,
            unit_id: unit.id,
            progress_percentage: percentage,
            exercises_completed: completed,
            total_exercises: total,
            status: percentage === 100 ? 'completed' : percentage > 0 ? 'in_progress' : 'not_started'
          });
        });
      });

      setUnits(unitsData || []);
      setStudents(studentList);
      setProgressData(progressMap);
    } catch (err) {
      console.error('Error fetching unit progress:', err);
    } finally {
      setLoading(false);
    }
  };

  const getProgress = (studentId, unitId) => {
    const key = `${studentId}-${unitId}`;
    return progressData.get(key) || null;
  };

  const getProgressBadge = (progress) => {
    if (!progress) {
      return (
        <div className="flex items-center justify-center">
          <Circle className="w-4 h-4 text-gray-300" />
          <span className="ml-2 text-xs text-gray-400">Not started</span>
        </div>
      );
    }

    const percentage = progress.progress_percentage || 0;
    let bgColor, textColor, icon;

    if (progress.status === 'completed' || percentage === 100) {
      bgColor = 'bg-green-100';
      textColor = 'text-green-800';
      icon = <CheckCircle className="w-4 h-4" />;
    } else if (percentage > 0) {
      bgColor = 'bg-yellow-100';
      textColor = 'text-yellow-800';
      icon = <Clock className="w-4 h-4" />;
    } else {
      bgColor = 'bg-gray-100';
      textColor = 'text-gray-600';
      icon = <Circle className="w-4 h-4" />;
    }

    return (
      <div className={`flex items-center justify-center px-3 py-1 rounded-full ${bgColor} ${textColor}`}>
        {icon}
        <span className="ml-2 text-sm font-medium">{percentage}%</span>
      </div>
    );
  };

  const calculateOverallProgress = (studentId) => {
    if (units.length === 0) return 0;

    let totalProgress = 0;
    units.forEach(unit => {
      const progress = getProgress(studentId, unit.id);
      totalProgress += progress?.progress_percentage || 0;
    });

    return Math.round(totalProgress / units.length);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-32 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Unit Progress</h3>
        <p className="text-gray-600">No units found in this course.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-6 border-b">
        <h3 className="text-lg font-semibold text-gray-900">Unit Progress Overview</h3>
        <p className="text-sm text-gray-600 mt-1">
          Track student progress across all units in this course
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50">
                Student
              </th>
              {units.map(unit => (
                <th key={unit.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {unit.title}
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Overall
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {students.length === 0 ? (
              <tr>
                <td colSpan={units.length + 2} className="px-6 py-8 text-center text-gray-500">
                  No students enrolled in this course
                </td>
              </tr>
            ) : (
              students.map(student => {
                const overall = calculateOverallProgress(student.id);
                const isExpanded = expandedStudent === student.id;

                return (
                  <React.Fragment key={student.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white">
                        <div className="flex items-center">
                          <button
                            onClick={() => setExpandedStudent(isExpanded ? null : student.id)}
                            className="mr-2 p-1 hover:bg-gray-100 rounded"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {student.full_name}
                            </div>
                            <div className="text-xs text-gray-500">{student.email}</div>
                            {student.assigned_at && (
                              <div className="text-[10px] text-gray-400">
                                Enrolled {new Date(student.assigned_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      {units.map(unit => {
                        const progress = getProgress(student.id, unit.id);
                        return (
                          <td key={unit.id} className="px-4 py-4 text-center">
                            {getProgressBadge(progress)}
                          </td>
                        );
                      })}
                      <td className="px-4 py-4 text-center">
                        <div className={`inline-flex items-center px-3 py-1 rounded-full font-semibold ${
                          overall === 100 ? 'bg-green-100 text-green-800' :
                          overall >= 50 ? 'bg-blue-100 text-blue-800' :
                          overall > 0 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {overall}%
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={units.length + 2} className="px-6 py-4 bg-gray-50">
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-900">Detailed Progress</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {units.map(unit => {
                                const progress = getProgress(student.id, unit.id);
                                return (
                                  <div key={unit.id} className="bg-white rounded-lg p-4 border">
                                    <div className="flex items-center justify-between mb-2">
                                      <h5 className="text-sm font-medium text-gray-900">
                                        Unit {unit.unit_number}: {unit.title}
                                      </h5>
                                      {getProgressBadge(progress)}
                                    </div>
                                    {progress && (
                                      <div className="space-y-1 text-xs text-gray-600">
                                        <div>Exercises: {progress.exercises_completed || 0} / {progress.total_exercises || 0}</div>
                                        <div>Status: {progress.status}</div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UnitProgressView;
