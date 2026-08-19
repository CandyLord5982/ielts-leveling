import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { CheckCircle, XCircle, Clock, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'

const TestResults = () => {
  const { testId, attemptId } = useParams()
  const navigate = useNavigate()
  const [test, setTest] = useState(null)
  const [attempt, setAttempt] = useState(null)
  const [questionAttempts, setQuestionAttempts] = useState([])
  const [exercises, setExercises] = useState({})
  const [loading, setLoading] = useState(true)
  const [expandedExercise, setExpandedExercise] = useState(null)

  useEffect(() => {
    loadResults()
  }, [testId, attemptId])

  const loadResults = async () => {
    try {
      setLoading(true)

      // Fetch session (acts as test)
      const { data: testData } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', testId)
        .single()
      setTest(testData)

      // Fetch attempt
      const { data: attemptData } = await supabase
        .from('test_attempts')
        .select('*')
        .eq('id', attemptId)
        .single()
      setAttempt(attemptData)

      // Fetch question attempts
      const { data: qaData } = await supabase
        .from('test_question_attempts')
        .select('*')
        .eq('test_attempt_id', attemptId)
        .order('created_at')
      setQuestionAttempts(qaData || [])

      // Fetch exercise details
      const exerciseIds = [...new Set((qaData || []).map(qa => qa.exercise_id))]
      if (exerciseIds.length > 0) {
        const { data: exData } = await supabase
          .from('exercises')
          .select('id, title, exercise_type')
          .in('id', exerciseIds)

        const exMap = {}
        ;(exData || []).forEach(ex => { exMap[ex.id] = ex })
        setExercises(exMap)
      }
    } catch (error) {
      console.error('Error loading results:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds) => {
    if (!seconds) return '--:--'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}m ${s}s`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!test || !attempt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Results not found</p>
      </div>
    )
  }

  // Group questions by exercise
  const grouped = {}
  questionAttempts.forEach(qa => {
    if (!grouped[qa.exercise_id]) grouped[qa.exercise_id] = []
    grouped[qa.exercise_id].push(qa)
  })

  const totalCorrect = questionAttempts.filter(qa => qa.is_correct).length

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => navigate('/study')}
          className="flex items-center gap-1 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={18} /> Back to tests
        </button>

        {/* Score card */}
        <div className={`rounded-2xl p-8 text-center mb-6 ${attempt.passed ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
          <h2 className="text-xl font-bold text-gray-900 mb-1">{test.title}</h2>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto my-4 ${attempt.passed ? 'bg-green-100' : 'bg-red-100'}`}>
            {attempt.passed
              ? <CheckCircle className="w-8 h-8 text-green-600" />
              : <XCircle className="w-8 h-8 text-red-600" />
            }
          </div>
          <div className="text-4xl font-bold mb-2" style={{ color: attempt.passed ? '#16a34a' : '#dc2626' }}>
            {attempt.score}%
          </div>
          <p className={`text-lg font-semibold ${attempt.passed ? 'text-green-600' : 'text-red-600'}`}>
            {attempt.passed ? 'Passed' : 'Not Passed'}
          </p>
          <p className="text-gray-500 text-sm mt-2">
            {totalCorrect}/{questionAttempts.length} correct &bull; Pass: {test.passing_score}%
          </p>
          <div className="flex items-center justify-center gap-4 text-sm text-gray-400 mt-2">
            <span className="flex items-center gap-1"><Clock size={14} /> {formatTime(attempt.time_used_seconds)}</span>
            <span>{attempt.status === 'timed_out' ? 'Timed out' : 'Completed'}</span>
          </div>
        </div>

        {/* Breakdown by exercise */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <h3 className="text-lg font-bold text-gray-900 p-6 pb-3">Detailed Breakdown</h3>

          {Object.entries(grouped).map(([exerciseId, qas]) => {
            const ex = exercises[exerciseId]
            const correct = qas.filter(qa => qa.is_correct).length
            const isExpanded = expandedExercise === exerciseId

            return (
              <div key={exerciseId} className="border-t border-gray-100">
                <button
                  onClick={() => setExpandedExercise(isExpanded ? null : exerciseId)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      correct === qas.length ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                    }`}>
                      {correct}/{qas.length}
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900 text-sm">{ex?.title || 'Exercise'}</p>
                      <p className="text-xs text-gray-400">{ex?.exercise_type?.replace('_', ' ')}</p>
                    </div>
                  </div>
                  {isExpanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2">
                    {qas.map((qa, i) => (
                      <div key={qa.id} className={`flex items-center gap-3 p-3 rounded-lg text-sm ${qa.is_correct ? 'bg-green-50' : 'bg-red-50'}`}>
                        {qa.is_correct
                          ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                          : <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-gray-700">Q{i + 1}</span>
                          {!qa.is_correct && qa.correct_answer && (
                            <span className="text-xs text-gray-500 ml-2">
                              Correct: {typeof qa.correct_answer === 'object' ? JSON.stringify(qa.correct_answer) : qa.correct_answer}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/study')}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            Back to Tests
          </button>
        </div>
      </div>
    </div>
  )
}

export default TestResults
