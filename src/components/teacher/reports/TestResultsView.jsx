import React, { useState, useEffect } from 'react'
import { supabase } from '../../../supabase/client'
import {
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Trophy,
  Users,
  FileText,
  Eye
} from 'lucide-react'
import ExerciseReviewMode from './ExerciseReviewMode'
import { splitAnswers } from '../../../utils/splitAnswers'

const TestResultsView = ({ selectedCourse }) => {
  const [testSessions, setTestSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState('')
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(false)
  const [expandedStudent, setExpandedStudent] = useState(null)
  const [reviewAttempt, setReviewAttempt] = useState(null)
  const [recalculating, setRecalculating] = useState(false)

  const regradeQA = (qa, exercise) => {
    const type = qa.exercise_type
    const content = exercise?.content
    const decode = (idx) => {
      if (type === 'fill_blank' || type === 'dropdown') return { qi: Math.floor(idx / 100), sub: idx % 100 }
      if (type === 'pdf_worksheet') return { qi: Math.floor(idx / 1000), sub: idx % 1000 }
      return { qi: idx, sub: 0 }
    }
    const { qi, sub } = decode(qa.question_index || 0)
    const questions = content?.questions || []

    switch (type) {
      case 'multiple_choice': {
        const q = questions[qi]
        if (!q) return null
        return { is_correct: qa.selected_answer === q.correct_answer, correct_answer: q.correct_answer }
      }
      case 'fill_blank': {
        const blank = questions[qi]?.blanks?.[sub]
        if (!blank) return null
        const correct = splitAnswers(blank.answer)
        const typed = (qa.selected_answer || '').trim()
        const isCorrect = blank.case_sensitive
          ? correct.some(a => typed === a)
          : correct.some(a => typed.toLowerCase() === a.toLowerCase())
        return { is_correct: isCorrect, correct_answer: blank.answer }
      }
      case 'dropdown': {
        const dd = questions[qi]?.dropdowns?.[sub]
        if (!dd) return null
        return {
          is_correct: (qa.selected_answer || '').trim() === (dd.correct_answer || '').trim(),
          correct_answer: dd.correct_answer
        }
      }
      case 'drag_drop': {
        const q = questions[qi]
        if (!q) return null
        const items = q.items || []
        const dropZones = q.drop_zones || []
        const correctOrder = q.correct_order || []
        const userPlacements = qa.selected_answer || {}
        const userOrder = dropZones.map(z => items.find(it => it.id === userPlacements[z.id])?.text || null)
        const correctTexts = correctOrder.map(id => items.find(it => it.id === id)?.text || null)
        return { is_correct: JSON.stringify(userOrder) === JSON.stringify(correctTexts), correct_answer: correctOrder }
      }
      case 'ai_fill_blank': {
        const q = questions[qi]
        if (!q) return null
        const expected = q.expected_answers || []
        const userAnswer = (qa.selected_answer || '').trim().toLowerCase()
        return {
          is_correct: expected.some(ea => userAnswer.includes(ea.trim().toLowerCase())),
          correct_answer: expected.join(', ')
        }
      }
      case 'image_hotspot': {
        const hotspots = content?.hotspots || []
        const labels = content?.labels || []
        const hotspot = hotspots[qi]
        if (!hotspot) return null
        const selectedLabel = labels.find(l => l.id === qa.selected_answer)
        const correctLabel = labels.find(l => l.hotspot_id === hotspot.id && l.type !== 'distractor')
        return {
          is_correct: !!selectedLabel && selectedLabel.type !== 'distractor' && selectedLabel.hotspot_id === hotspot.id,
          correct_answer: correctLabel?.id || null
        }
      }
      default:
        return null
    }
  }

  const handleRecalculate = async () => {
    if (!selectedSession) return
    if (!window.confirm('Re-grade all attempts using current exercise content?\n\nNote: questions with teacher overrides will be skipped.')) return
    setRecalculating(true)
    try {
      const { data: assignments } = await supabase
        .from('exercise_assignments')
        .select('exercise_id, exercise:exercises(id, exercise_type, content)')
        .eq('session_id', selectedSession)
      const exerciseMap = {}
      ;(assignments || []).forEach(a => { exerciseMap[a.exercise_id] = a.exercise })

      const { data: sessionAttempts } = await supabase
        .from('test_attempts')
        .select('id, test_question_attempts(*)')
        .eq('session_id', selectedSession)
        .in('status', ['completed', 'timed_out'])

      const qaUpdates = []
      const attemptScores = []

      for (const attempt of (sessionAttempts || [])) {
        const qas = attempt.test_question_attempts || []
        const updatedQAs = qas.map(qa => {
          if (qa.teacher_override) return qa // skip overridden
          const exercise = exerciseMap[qa.exercise_id]
          const result = exercise ? regradeQA(qa, exercise) : null
          if (!result) return qa
          qaUpdates.push({ id: qa.id, ...result })
          return { ...qa, ...result }
        })
        const total = updatedQAs.length
        const correct = updatedQAs.filter(q => q.is_correct).length
        const newScore = total > 0 ? Math.round((correct / total) * 100) : 0
        attemptScores.push({ id: attempt.id, score: newScore, passed: newScore >= passingScore })
      }

      await Promise.all([
        ...qaUpdates.map(u => supabase.from('test_question_attempts').update({ is_correct: u.is_correct, correct_answer: u.correct_answer }).eq('id', u.id)),
        ...attemptScores.map(u => supabase.from('test_attempts').update({ score: u.score, passed: u.passed }).eq('id', u.id))
      ])

      // Refresh attempts
      const { data, error } = await supabase
        .from('test_attempts')
        .select('*, user:users!user_id (id, full_name, real_name, email), test_question_attempts (*)')
        .eq('session_id', selectedSession)
        .in('status', ['completed', 'timed_out'])
        .order('created_at', { ascending: false })
      if (!error) {
        setAttempts((data || []).map(a => ({
          ...a,
          user: a.user ? { ...a.user, full_name: a.user.real_name || a.user.full_name } : a.user
        })))
      }
    } catch (err) {
      console.error('Recalculate error:', err)
      alert('Failed to recalculate scores')
    } finally {
      setRecalculating(false)
    }
  }

  // Fetch test sessions for this course
  useEffect(() => {
    if (!selectedCourse) return
    const fetchTestSessions = async () => {
      const { data: units } = await supabase
        .from('units')
        .select('id')
        .eq('course_id', selectedCourse)
      const unitIds = (units || []).map(u => u.id)
      if (unitIds.length === 0) { setTestSessions([]); return }

      // Fetch all sessions in this course
      const { data: sessions, error: sessErr } = await supabase
        .from('sessions')
        .select('id, title, passing_score, max_attempts, time_limit_minutes, unit_id, is_test')
        .in('unit_id', unitIds)
        .order('title')

      if (sessErr) { console.error('Error fetching sessions:', sessErr); return }

      // Find sessions with test_attempts (works even if is_test wasn't set)
      const sessionIds = (sessions || []).map(s => s.id)
      let sessionsWithAttempts = new Set()
      if (sessionIds.length > 0) {
        const { data: attemptSessions, error: attErr } = await supabase
          .from('test_attempts')
          .select('session_id')
          .in('session_id', sessionIds)
        if (attErr) console.error('Error fetching test_attempts:', attErr)
        ;(attemptSessions || []).forEach(a => sessionsWithAttempts.add(a.session_id))
      }

      // Include sessions that are is_test OR have test_attempts
      const testSessions = (sessions || []).filter(s =>
        s.is_test || sessionsWithAttempts.has(s.id)
      )

      console.log('📝 Test sessions found:', testSessions.length, 'from', sessions?.length, 'total sessions')
      console.log('📝 Sessions with attempts:', [...sessionsWithAttempts])

      setTestSessions(testSessions)
      if (testSessions.length > 0 && !selectedSession) {
        setSelectedSession(testSessions[0].id)
      }
    }
    fetchTestSessions()
  }, [selectedCourse])

  // Fetch attempts for selected session
  useEffect(() => {
    if (!selectedSession) return
    const fetchAttempts = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('test_attempts')
          .select(`
            *,
            user:users!user_id (id, full_name, real_name, email),
            test_question_attempts (*)
          `)
          .eq('session_id', selectedSession)
          .in('status', ['completed', 'timed_out'])
          .order('created_at', { ascending: false })

        if (error) throw error
        const normalized = (data || []).map(a => ({
          ...a,
          user: a.user ? { ...a.user, full_name: a.user.real_name || a.user.full_name } : a.user
        }))
        setAttempts(normalized)
      } catch (err) {
        console.error('Error fetching test attempts:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAttempts()
  }, [selectedSession])

  // Group attempts by student, show best attempt
  const studentResults = (() => {
    const byStudent = {}
    attempts.forEach(a => {
      const sid = a.user?.id
      if (!sid) return
      if (!byStudent[sid]) {
        byStudent[sid] = { student: a.user, attempts: [] }
      }
      byStudent[sid].attempts.push(a)
    })

    return Object.values(byStudent)
      .map(({ student, attempts: studentAttempts }) => {
        const best = studentAttempts.reduce((b, a) => (!b || (a.score || 0) > (b.score || 0)) ? a : b, null)
        return { student, attempts: studentAttempts, best }
      })
      .sort((a, b) => (b.best?.score || 0) - (a.best?.score || 0))
  })()

  const session = testSessions.find(s => s.id === selectedSession)
  const passingScore = session?.passing_score || 70

  const passedCount = studentResults.filter(r => r.best?.passed).length
  const totalStudents = studentResults.length
  const avgScore = totalStudents > 0
    ? Math.round(studentResults.reduce((sum, r) => sum + (r.best?.score || 0), 0) / totalStudents)
    : 0

  const formatTime = (seconds) => {
    if (!seconds) return '-'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const getScoreColor = (score, passed) => {
    if (passed) return 'text-green-600 bg-green-100'
    if (score >= 50) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }


  if (testSessions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No tests found in this course.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {reviewAttempt && (
        <ExerciseReviewMode
          attempt={reviewAttempt}
          passingScore={passingScore}
          onAttemptUpdate={(updated) => {
            setAttempts(prev => prev.map(a => a.id === updated.id ? updated : a))
            setReviewAttempt(updated)
          }}
          onClose={() => setReviewAttempt(null)}
        />
      )}
      {/* Test selector */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Test</label>
        <select
          value={selectedSession}
          onChange={(e) => { setSelectedSession(e.target.value); setExpandedStudent(null) }}
          className="w-full max-w-md p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          {testSessions.map(s => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
      </div>

      {/* Stats cards */}
      {session && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
            <Users className="w-6 h-6 text-blue-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-gray-900">{totalStudents}</div>
            <div className="text-xs text-gray-500">Students</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
            <Trophy className="w-6 h-6 text-green-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-green-600">{passedCount}/{totalStudents}</div>
            <div className="text-xs text-gray-500">Passed</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
            <CheckCircle className="w-6 h-6 text-purple-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-gray-900">{avgScore}%</div>
            <div className="text-xs text-gray-500">Avg Score</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
            <Clock className="w-6 h-6 text-orange-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-gray-900">{session.time_limit_minutes || '∞'}</div>
            <div className="text-xs text-gray-500">Time Limit (min)</div>
          </div>
        </div>
      )}

      {/* Student results table */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Student Results</h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Pass: {passingScore}%</span>
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200 rounded-lg disabled:opacity-50 transition-colors"
            >
              {recalculating ? 'Recalculating...' : 'Recalculate Scores'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-gray-500 text-sm">Loading results...</p>
          </div>
        ) : studentResults.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No submissions yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {studentResults.map(({ student, attempts: studentAttempts, best }) => {
              const isExpanded = expandedStudent === student.id
              return (
                <div key={student.id}>
                  {/* Student row */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedStudent(isExpanded ? null : student.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <span className="text-blue-600 text-sm font-semibold">{student.full_name?.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{student.full_name}</div>
                        <div className="text-xs text-gray-500">{studentAttempts.length} attempt{studentAttempts.length !== 1 ? 's' : ''}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className={`inline-block text-sm font-bold px-2.5 py-1 rounded-full ${getScoreColor(best?.score, best?.passed)}`}>
                          {best?.score ?? 0}%
                        </span>
                      </div>
                      <div className="w-16 text-center">
                        {best?.passed
                          ? <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Pass</span>
                          : <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Fail</span>
                        }
                      </div>
                      <div className="text-xs text-gray-500 w-14 text-right">
                        {formatTime(best?.time_used_seconds)}
                      </div>
                    </div>
                  </div>

                  {/* Expanded: attempt list */}
                  {isExpanded && (
                    <div className="bg-gray-50 px-4 py-3 border-t border-gray-100 space-y-2">
                      {studentAttempts.map((attempt, ai) => (
                        <div key={attempt.id} className="bg-white rounded-lg border border-gray-200 flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-gray-700">Attempt {studentAttempts.length - ai}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getScoreColor(attempt.score, attempt.passed)}`}>
                              {attempt.score}%
                            </span>
                            {attempt.status === 'timed_out' && (
                              <span className="text-xs text-orange-600 flex items-center gap-1"><Clock size={10} /> Timed out</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400">{formatTime(attempt.time_used_seconds)}</span>
                            <span className="text-xs text-gray-400">{new Date(attempt.completed_at || attempt.created_at).toLocaleDateString()}</span>
                            <span className="text-xs text-gray-400">
                              {attempt.test_question_attempts?.filter(q => q.is_correct).length || 0}/{attempt.test_question_attempts?.length || 0} correct
                            </span>
                            <button
                              onClick={() => setReviewAttempt(attempt)}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-0.5 rounded transition-colors"
                            >
                              <Eye size={12} /> Review
                            </button>
                          </div>
                        </div>
                      ))}
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

export default TestResultsView
