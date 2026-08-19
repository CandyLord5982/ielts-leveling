import { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import {
  Trophy,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Clock,
  Circle
} from 'lucide-react'

const AdminOverview = () => {
  const [loading, setLoading] = useState(true)
  const [courseStats, setCourseStats] = useState([])
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [courseStudents, setCourseStudents] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [expandedStudent, setExpandedStudent] = useState(null)
  const [studentUnitProgress, setStudentUnitProgress] = useState(new Map())

  useEffect(() => {
    fetchCourses()
  }, [])

  const fetchCourses = async () => {
    try {
      setLoading(true)

      const { data: courses, error: coursesError } = await supabase
        .from('courses')
        .select('id, title')
        .eq('is_active', true)

      if (coursesError) throw coursesError

      const courseList = (courses || []).map(c => ({ courseId: c.id, courseTitle: c.title }))
      setCourseStats(courseList)

      // Auto-select first course
      if (courseList.length > 0) {
        fetchCourseStudents(courseList[0].courseId, courseList[0].courseTitle)
      }

    } catch (error) {
      console.error('Error fetching courses:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCourseStudents = async (courseId, courseTitle) => {
    try {
      setLoadingStudents(true)
      setSelectedCourse({ id: courseId, title: courseTitle })

      // Get units in course
      const { data: units } = await supabase
        .from('units')
        .select('id')
        .eq('course_id', courseId)

      const unitIds = (units || []).map(u => u.id)
      if (unitIds.length === 0) {
        setCourseStudents([])
        return
      }

      // Get sessions (include assigned_student_id to filter personal sessions)
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, unit_id, assigned_student_id')
        .in('unit_id', unitIds)
        .neq('is_test', true)

      const sessionIds = (sessions || []).map(s => s.id)
      if (sessionIds.length === 0) {
        setCourseStudents([])
        return
      }

      // Get exercise IDs via assignments
      const { data: assignments } = await supabase
        .from('exercise_assignments')
        .select('exercise_id, session_id')
        .in('session_id', sessionIds)

      if (!assignments || assignments.length === 0) {
        setCourseStudents([])
        return
      }

      // Build a map of session_id -> assigned_student_id for personal sessions
      const sessionPersonalMap = {}
      for (const s of sessions) {
        if (s.assigned_student_id) sessionPersonalMap[s.id] = s.assigned_student_id
      }

      // Shared exercises (from sessions without assigned_student_id)
      const sharedExerciseIds = Array.from(new Set(
        assignments.filter(a => !sessionPersonalMap[a.session_id]).map(a => a.exercise_id)
      ))

      // Personal exercises grouped by student
      const personalExercisesByStudent = {}
      for (const a of assignments) {
        const studentId = sessionPersonalMap[a.session_id]
        if (studentId) {
          if (!personalExercisesByStudent[studentId]) personalExercisesByStudent[studentId] = new Set()
          personalExercisesByStudent[studentId].add(a.exercise_id)
        }
      }

      const allExerciseIds = Array.from(new Set(assignments.map(a => a.exercise_id)))
      if (allExerciseIds.length === 0) {
        setCourseStudents([])
        return
      }

      // Get students enrolled in this course
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select(`
          student_id,
          student:users!student_id(
            id,
            full_name,
            email
          )
        `)
        .eq('course_id', courseId)
        .eq('is_active', true)

      if (!enrollments || enrollments.length === 0) {
        setCourseStudents([])
        return
      }

      const studentIds = enrollments.map(e => e.student_id)

      // Get user progress
      const { data: progress } = await supabase
        .from('user_progress')
        .select('user_id, exercise_id, status')
        .in('user_id', studentIds)
        .in('exercise_id', allExerciseIds)

      // Calculate completion for each student (shared + their personal exercises)
      const studentsWithCompletion = enrollments.map(enrollment => {
        const student = enrollment.student
        const personalSet = personalExercisesByStudent[student.id]
        const studentExerciseIds = personalSet
          ? [...sharedExerciseIds, ...personalSet]
          : sharedExerciseIds
        const studentProgress = (progress || []).filter(p => p.user_id === student.id && studentExerciseIds.includes(p.exercise_id))
        const completed = studentProgress.filter(p => p.status === 'completed').length
        const completionRate = studentExerciseIds.length > 0 ? Math.round((completed / studentExerciseIds.length) * 100) : 0

        return {
          ...student,
          completionRate,
          completed,
          total: studentExerciseIds.length
        }
      })

      // Sort by completion rate descending
      studentsWithCompletion.sort((a, b) => b.completionRate - a.completionRate)

      setCourseStudents(studentsWithCompletion)

      // Calculate unit-by-unit progress for detailed view
      await fetchUnitProgress(courseId, units, sessions, assignments, enrollments, progress)

    } catch (error) {
      console.error('Error fetching course students:', error)
    } finally {
      setLoadingStudents(false)
    }
  }

  const fetchUnitProgress = async (courseId, units, sessions, assignments, enrollments, progress) => {
    try {
      // Get full unit data with titles
      const { data: unitsData } = await supabase
        .from('units')
        .select('id, title, unit_number')
        .eq('course_id', courseId)
        .eq('is_active', true)
        .order('unit_number', { ascending: false })

      if (!unitsData) return

      // Fetch exercises via assignments (assignments has session_id and exercise info)
      const sessionIds = sessions.map(s => s.id)
      const { data: assignmentsData } = await supabase
        .from('exercise_assignments')
        .select(`
          session_id,
          exercise:exercises(id)
        `)
        .in('session_id', sessionIds)

      // Extract exercises from assignments
      const exercisesData = (assignmentsData || [])
        .filter(a => a.exercise?.id)
        .map(a => ({
          id: a.exercise.id,
          session_id: a.session_id
        }))

      // Build mapping: session -> unit
      const sessionToUnit = new Map();
      sessions.forEach(s => sessionToUnit.set(s.id, s.unit_id))

      // Build personal session map from sessions data
      const sessionPersonal = {}
      sessions.forEach(s => {
        if (s.assigned_student_id) sessionPersonal[s.id] = s.assigned_student_id
      })

      // Build mapping: exercise -> unit, and track which exercises are personal
      const exerciseToUnit = new Map();
      const exerciseToPersonal = new Map(); // exercise_id -> assigned_student_id or null
      exercisesData.forEach(e => {
        const unitId = sessionToUnit.get(e.session_id)
        if (unitId) exerciseToUnit.set(e.id, unitId)
        exerciseToPersonal.set(e.id, sessionPersonal[e.session_id] || null)
      })

      // Count completed exercises per student per unit (only for exercises relevant to that student)
      const studentUnitCompleted = new Map();
      (progress || []).forEach(p => {
        const unitId = exerciseToUnit.get(p.exercise_id)
        const personalOwner = exerciseToPersonal.get(p.exercise_id)
        if (unitId && p.status === 'completed' && (!personalOwner || personalOwner === p.user_id)) {
          const key = `${p.user_id}-${unitId}`
          studentUnitCompleted.set(key, (studentUnitCompleted.get(key) || 0) + 1)
        }
      })

      // Build final progress map with per-student exercise counts
      const progressMap = new Map();
      enrollments.forEach(enrollment => {
        const student = enrollment.student
        unitsData.forEach(unit => {
          const key = `${student.id}-${unit.id}`
          // Count exercises in this unit relevant to this student
          const total = exercisesData.filter(e => {
            const unitId = exerciseToUnit.get(e.id)
            const personalOwner = exerciseToPersonal.get(e.id)
            return unitId === unit.id && (!personalOwner || personalOwner === student.id)
          }).length
          const completed = studentUnitCompleted.get(key) || 0
          const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

          progressMap.set(key, {
            unitId: unit.id,
            unitTitle: unit.title,
            unitNumber: unit.unit_number,
            completed,
            total,
            percentage,
            status: percentage === 100 ? 'completed' : percentage > 0 ? 'in_progress' : 'not_started'
          })
        })
      })

      setStudentUnitProgress(progressMap)
    } catch (error) {
      console.error('Error fetching unit progress:', error)
    }
  }

  const handleCourseChange = (e) => {
    const courseId = e.target.value
    const course = courseStats.find(c => c.courseId === courseId)
    if (course) {
      setExpandedStudent(null)
      setStudentUnitProgress(new Map())
      fetchCourseStudents(course.courseId, course.courseTitle)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="ml-3 text-gray-600">Loading statistics...</p>
      </div>
    )
  }

  const selectedCourseStat = courseStats.find(c => c.courseId === selectedCourse?.id)

  return (
    <div className="space-y-8">
      {/* Header with course selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Overview</h1>
          <p className="text-gray-600">Course completion statistics</p>
        </div>
        {courseStats.length > 0 && (
          <select
            value={selectedCourse?.id || ''}
            onChange={handleCourseChange}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {courseStats.map(course => (
              <option key={course.courseId} value={course.courseId}>
                {course.courseTitle}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Selected Course Completion Card */}
      {selectedCourseStat && (
        <div className="bg-white rounded-lg shadow-sm border p-8">
          <div className="flex items-center justify-center">
            <div className="text-center">
              <Trophy className="w-16 h-16 text-yellow-600 mx-auto mb-4" />
              <p className="text-sm font-medium text-gray-600 mb-2">{selectedCourseStat.courseTitle} — Average Completion</p>
              <p className="text-6xl font-bold text-gray-900 mb-2">
                {courseStudents.length > 0
                  ? Math.round(courseStudents.reduce((sum, s) => sum + s.completionRate, 0) / courseStudents.length)
                  : selectedCourseStat.avgCompletion}%
              </p>
              <p className="text-sm text-gray-500">{courseStudents.length} students enrolled</p>
            </div>
          </div>
        </div>
      )}

      {/* Student List */}
      {selectedCourse && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Student Completion Rates</h2>
          {loadingStudents ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="ml-3 text-gray-600">Loading students...</p>
            </div>
          ) : courseStudents.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border">
              <p className="text-gray-600">No students enrolled in this course.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {courseStudents.map((student) => {
                const isExpanded = expandedStudent === student.id
                const unitKeys = Array.from(studentUnitProgress.keys())
                  .filter(key => key.startsWith(`${student.id}-`))
                const allStudentUnits = unitKeys
                  .map(key => studentUnitProgress.get(key))
                const studentUnits = allStudentUnits
                  .filter(unit => unit.total > 0)
                  .sort((a, b) => b.unitNumber - a.unitNumber)
                  .slice(0, 3)

                return (
                  <div key={student.id}>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center space-x-4 flex-1">
                        <button
                          onClick={() => setExpandedStudent(isExpanded ? null : student.id)}
                          className="p-1 hover:bg-gray-200 rounded"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-semibold text-sm">
                            {student.full_name?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {student.full_name || 'No name'}
                          </div>
                          <div className="text-xs text-gray-600">{student.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-xs text-gray-500">
                            {student.completed}/{student.total} exercises
                          </div>
                        </div>
                        <div className={`text-lg font-bold px-3 py-1 rounded-full ${
                          student.completionRate >= 90 ? 'bg-green-200 text-green-800' :
                          student.completionRate >= 75 ? 'bg-blue-200 text-blue-800' :
                          student.completionRate >= 60 ? 'bg-yellow-200 text-yellow-800' :
                          'bg-red-200 text-red-800'
                        }`}>
                          {student.completionRate}%
                        </div>
                      </div>
                    </div>
                    {isExpanded && studentUnits.length > 0 && (
                      <div className="ml-12 mt-2 p-4 bg-white border rounded-lg">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Progress by Unit</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {studentUnits.map(unit => {
                            const getProgressBadge = () => {
                              if (unit.status === 'completed') {
                                return (
                                  <div className="flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800">
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    <span className="text-sm font-medium">{unit.percentage}%</span>
                                  </div>
                                )
                              } else if (unit.status === 'in_progress') {
                                return (
                                  <div className="flex items-center px-3 py-1 rounded-full bg-yellow-100 text-yellow-800">
                                    <Clock className="w-4 h-4 mr-1" />
                                    <span className="text-sm font-medium">{unit.percentage}%</span>
                                  </div>
                                )
                              } else {
                                return (
                                  <div className="flex items-center px-3 py-1 rounded-full bg-gray-100 text-gray-600">
                                    <Circle className="w-4 h-4 mr-1" />
                                    <span className="text-sm font-medium">{unit.percentage}%</span>
                                  </div>
                                )
                              }
                            }

                            return (
                              <div key={unit.unitId} className="p-3 bg-gray-50 rounded border">
                                <div className="flex items-center justify-between mb-2">
                                  <h5 className="text-sm font-medium text-gray-900">{unit.unitTitle}</h5>
                                  {getProgressBadge()}
                                </div>
                                <div className="text-xs text-gray-600">
                                  Exercises: {unit.completed} / {unit.total}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AdminOverview
