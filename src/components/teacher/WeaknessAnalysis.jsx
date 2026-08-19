import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import { ArrowLeft, ChevronDown, ChevronRight, AlertTriangle, Target, Brain, Sparkles } from 'lucide-react'

const WeaknessAnalysis = () => {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [selectedCourse, setSelectedCourse] = useState('')
  const [loading, setLoading] = useState(false)
  const [students, setStudents] = useState([])
  const [tagData, setTagData] = useState([]) // grouped by student (from tags)
  const [expandedStudent, setExpandedStudent] = useState(null)
  const [aiResults, setAiResults] = useState({}) // { [userId]: { loading, result, error } }

  // Fetch courses
  useEffect(() => {
    if (!user) return
    const fetchCourses = async () => {
      if (isAdmin()) {
        const { data } = await supabase
          .from('courses')
          .select('id, title, level_number')
          .eq('is_active', true)
          .order('level_number')
        setCourses(data || [])
        if (data?.length > 0) setSelectedCourse(data[0].id)
      } else {
        const { data: ct } = await supabase
          .from('course_teachers')
          .select('course:courses(id, title, level_number, is_active)')
          .eq('teacher_id', user.id)
        const teacherCourses = (ct || [])
          .map(c => c.course)
          .filter(c => c && c.is_active)
          .sort((a, b) => a.level_number - b.level_number)
        setCourses(teacherCourses)
        if (teacherCourses.length > 0) setSelectedCourse(teacherCourses[0].id)
      }
    }
    fetchCourses()
  }, [user])

  // Fetch students + tag data when course changes
  useEffect(() => {
    if (!selectedCourse) return
    setAiResults({})
    setExpandedStudent(null)

    const fetchData = async () => {
      setLoading(true)
      try {
        // Fetch enrolled students
        const { data: enrollments } = await supabase
          .from('course_enrollments')
          .select('student:users!student_id(id, full_name, avatar_url)')
          .eq('course_id', selectedCourse)
          .eq('is_active', true)

        const studentList = (enrollments || [])
          .filter(e => e.student)
          .map(e => ({
            user_id: e.student.id,
            full_name: e.student.full_name,
            avatar_url: e.student.avatar_url,
          }))
          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))

        setStudents(studentList)

        // Fetch tag-based weakness data (may be empty if no tags)
        const { data: rows } = await supabase.rpc('get_student_weakness_by_course', {
          p_course_id: selectedCourse
        })

        const grouped = {}
        ;(rows || []).forEach(row => {
          if (!grouped[row.user_id]) grouped[row.user_id] = { tags: [] }
          grouped[row.user_id].tags.push({
            tag: row.tag,
            total_questions: row.total_questions,
            correct: row.correct,
            accuracy: Number(row.accuracy)
          })
        })

        // Sort tags weakest first
        Object.values(grouped).forEach(s => {
          s.tags.sort((a, b) => a.accuracy - b.accuracy)
        })

        setTagData(grouped)
      } catch (err) {
        console.error('Error fetching data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [selectedCourse])

  // AI analysis for a student
  const analyzeStudent = async (studentId) => {
    setAiResults(prev => ({ ...prev, [studentId]: { loading: true, result: null, error: null } }))

    try {
      // Get exercise IDs in this course via exercise_assignments
      const { data: units } = await supabase
        .from('units')
        .select('id')
        .eq('course_id', selectedCourse)
      const unitIds = (units || []).map(u => u.id)

      let exerciseIds = []
      if (unitIds.length > 0) {
        const { data: sessions } = await supabase
          .from('sessions')
          .select('id')
          .in('unit_id', unitIds)
        const sessionIds = (sessions || []).map(s => s.id)

        if (sessionIds.length > 0) {
          const { data: assignments } = await supabase
            .from('exercise_assignments')
            .select('exercise_id')
            .in('session_id', sessionIds)
          exerciseIds = [...new Set((assignments || []).map(a => a.exercise_id))]
        }
      }

      if (exerciseIds.length === 0) {
        setAiResults(prev => ({ ...prev, [studentId]: { loading: false, result: 'No exercises found in this course.', error: null } }))
        return
      }

      // Fetch wrong answers for this student in these exercises
      const { data: filtered, error } = await supabase
        .from('question_attempts')
        .select('exercise_id, exercise_type, question_id, selected_answer, correct_answer')
        .eq('user_id', studentId)
        .eq('is_correct', false)
        .in('exercise_id', exerciseIds)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      if (!filtered || filtered.length === 0) {
        setAiResults(prev => ({ ...prev, [studentId]: { loading: false, result: 'No wrong answers in this course.', error: null } }))
        return
      }

      // Format for AI — limit to 20 entries
      const wrongList = filtered.slice(0, 20).map((a, i) =>
        `${i + 1}. Student wrote "${a.selected_answer}" but correct answer is "${a.correct_answer}"`
      ).join('\n')

      const messages = [
        { role: 'system', content: 'Bạn là giáo viên tiếng Anh chuyên phân tích lỗi sai của học sinh. Trả lời ngắn gọn bằng tiếng Việt, dùng bullet points.' },
        { role: 'user', content: `Phân tích ${Math.min(filtered.length, 20)} câu trả lời sai dưới đây. Tìm 3-5 pattern lỗi chính. Mỗi pattern: tên lỗi, 2 ví dụ, số lần mắc. Ngắn gọn.\n\n${wrongList}` }
      ]
      const response = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      })
      const resData = await response.json()
      if (!response.ok) throw new Error(resData.error || `API error: ${response.status}`)
      if (!resData.result) throw new Error('No response from AI. Please try again.')

      setAiResults(prev => ({ ...prev, [studentId]: { loading: false, result: resData.result, error: null } }))
    } catch (err) {
      console.error('AI analysis error:', err)
      setAiResults(prev => ({ ...prev, [studentId]: { loading: false, result: null, error: err.message } }))
    }
  }

  const getAccuracyColor = (accuracy) => {
    if (accuracy < 50) return 'bg-red-100 text-red-700 border-red-200'
    if (accuracy < 75) return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    return 'bg-green-100 text-green-700 border-green-200'
  }

  const getAccuracyBarColor = (accuracy) => {
    if (accuracy < 50) return 'bg-red-400'
    if (accuracy < 75) return 'bg-yellow-400'
    return 'bg-green-400'
  }

  const getStudentTagData = (userId) => tagData[userId]?.tags || []
  const getStudentOverall = (userId) => {
    const tags = getStudentTagData(userId)
    if (tags.length === 0) return null
    const totalQ = tags.reduce((sum, t) => sum + Number(t.total_questions), 0)
    const totalC = tags.reduce((sum, t) => sum + Number(t.correct), 0)
    return totalQ > 0 ? Math.round(100 * totalC / totalQ) : 0
  }
  const getStudentWeakCount = (userId) => getStudentTagData(userId).filter(t => t.accuracy < 50).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/teacher')} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Weakness Analysis</h1>
            <p className="text-sm text-gray-500">Per-student accuracy by skill tag + AI pattern analysis</p>
          </div>
        </div>

        {/* Course Selector */}
        <div className="mb-6">
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="w-full md:w-80 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="">Select course</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12 text-gray-400">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
            Loading...
          </div>
        )}

        {/* No students */}
        {!loading && selectedCourse && students.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <Target className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No students enrolled in this course.</p>
          </div>
        )}

        {/* Student List */}
        {!loading && students.length > 0 && (
          <div className="space-y-3">
            {students.map(student => {
              const tags = getStudentTagData(student.user_id)
              const overall = getStudentOverall(student.user_id)
              const weakCount = getStudentWeakCount(student.user_id)
              const ai = aiResults[student.user_id]
              const isExpanded = expandedStudent === student.user_id

              return (
                <div key={student.user_id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  {/* Student Header */}
                  <button
                    onClick={() => setExpandedStudent(isExpanded ? null : student.user_id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                        {student.avatar_url
                          ? <img src={student.avatar_url} alt="" className="w-full h-full object-cover" />
                          : <span className="text-sm font-medium text-gray-500">{(student.full_name || '?').charAt(0).toUpperCase()}</span>
                        }
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-gray-900 text-sm">{student.full_name || 'Unknown'}</div>
                        <div className="text-xs text-gray-400">
                          {tags.length > 0
                            ? `${tags.length} skill${tags.length !== 1 ? 's' : ''} tracked`
                            : 'No tag data yet'
                          }
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {weakCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-red-50 text-red-600 rounded-full border border-red-200">
                          <AlertTriangle className="w-3 h-3" />
                          {weakCount} weak
                        </span>
                      )}
                      {overall !== null && (
                        <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${getAccuracyColor(overall)}`}>
                          {overall}%
                        </span>
                      )}
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-gray-400" />
                        : <ChevronRight className="w-4 h-4 text-gray-400" />
                      }
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-4 py-3 space-y-4">
                      {/* Tag-based accuracy bars */}
                      {tags.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Accuracy by Tag</div>
                          {tags.map(t => (
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
                            </div>
                          ))}
                        </div>
                      )}

                      {/* AI Analysis */}
                      <div>
                        {!ai && (
                          <button
                            onClick={(e) => { e.stopPropagation(); analyzeStudent(student.user_id) }}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                          >
                            <Brain className="w-3.5 h-3.5" />
                            Analyze with AI
                          </button>
                        )}
                        {ai?.loading && (
                          <div className="flex items-center gap-2 text-sm text-purple-600">
                            <div className="w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                            Analyzing wrong answers...
                          </div>
                        )}
                        {ai?.error && (
                          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                            Error: {ai.error}
                            <button
                              onClick={() => analyzeStudent(student.user_id)}
                              className="ml-2 text-red-700 underline"
                            >
                              Retry
                            </button>
                          </div>
                        )}
                        {ai?.result && (
                          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 mb-2">
                              <Sparkles className="w-3.5 h-3.5" />
                              AI Analysis
                            </div>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{ai.result}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default WeaknessAnalysis
