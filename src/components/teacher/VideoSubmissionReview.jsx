import { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import { useProgress } from '../../hooks/useProgress'
import {
  Video, CheckCircle, Clock, Search, ChevronDown, ChevronUp,
  Star, Send, RefreshCw, Filter
} from 'lucide-react'

const VideoSubmissionReview = ({ selectedCourse }) => {
  const { user } = useAuth()
  const { completeExerciseWithXP } = useProgress()
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [expandedId, setExpandedId] = useState(null)

  // Teacher scoring state
  const [teacherScores, setTeacherScores] = useState({})
  const [teacherFeedbacks, setTeacherFeedbacks] = useState({})
  const [submitting, setSubmitting] = useState(null)

  useEffect(() => {
    if (selectedCourse) fetchSubmissions()
  }, [selectedCourse, filter])

  const fetchSubmissions = async () => {
    try {
      setLoading(true)

      // Get exercise IDs for this course
      const { data: courseExercises } = await supabase
        .from('exercise_assignments')
        .select('exercise_id, sessions!inner(unit_id, units!inner(course_id))')
        .eq('sessions.units.course_id', selectedCourse)

      if (!courseExercises?.length) {
        setSubmissions([])
        return
      }

      const exerciseIds = [...new Set(courseExercises.map(e => e.exercise_id))]

      let query = supabase
        .from('video_submissions')
        .select('*, student:users!video_submissions_user_id_fkey(id, full_name, email, avatar_url), exercise:exercises!video_submissions_exercise_id_fkey(id, title)')
        .in('exercise_id', exerciseIds)
        .order('created_at', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query
      if (error) throw error
      setSubmissions(data || [])
    } catch (error) {
      console.error('Error fetching video submissions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleReview = async (submission) => {
    const score = teacherScores[submission.id]
    if (score === undefined || score === null || score === '') return

    const numScore = parseInt(score)
    if (isNaN(numScore) || numScore < 0 || numScore > 100) return

    try {
      setSubmitting(submission.id)
      const feedback = teacherFeedbacks[submission.id] || ''

      // Update submission with teacher score
      const { error: updateError } = await supabase
        .from('video_submissions')
        .update({
          teacher_score: numScore,
          teacher_feedback: feedback,
          status: 'reviewed',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submission.id)

      if (updateError) throw updateError

      // Update user_progress with teacher's score
      try {
        const exercise = submission.exercise
        const baseXP = 15
        const bonusXP = numScore >= 90 ? Math.round(baseXP * 0.5) : numScore >= 80 ? Math.round(baseXP * 0.3) : 0
        const totalXP = baseXP + bonusXP

        // Upsert progress with teacher score
        await supabase.from('user_progress').upsert({
          user_id: submission.user_id,
          exercise_id: submission.exercise_id,
          session_id: submission.session_id,
          score: numScore,
          max_score: 100,
          status: numScore >= 75 ? 'completed' : 'attempted',
          completed_at: new Date().toISOString(),
          xp_earned: numScore >= 75 ? totalXP : 0,
        }, { onConflict: 'user_id,exercise_id' })
      } catch (err) {
        console.error('Error updating progress:', err)
      }

      // Refresh list
      fetchSubmissions()
    } catch (error) {
      console.error('Error reviewing submission:', error)
    } finally {
      setSubmitting(null)
    }
  }

  const pendingCount = submissions.filter(s => s.status === 'pending').length

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Video Submissions</h3>
          {pendingCount > 0 && (
            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 text-sm font-medium rounded-full">
              {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            <option value="pending">Pending Review</option>
            <option value="reviewed">Reviewed</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {/* Empty state */}
      {submissions.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <Video className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {filter === 'pending' ? 'No pending video submissions' : 'No video submissions found'}
          </p>
        </div>
      )}

      {/* Submission cards */}
      {submissions.map((sub) => {
        const isExpanded = expandedId === sub.id
        const isReviewed = sub.status === 'reviewed'

        return (
          <div key={sub.id} className={`bg-white rounded-lg shadow-sm border ${isReviewed ? 'border-green-200' : 'border-amber-200'}`}>
            {/* Card header */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : sub.id)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {sub.student?.avatar_url ? (
                    <img src={sub.student.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-gray-500">
                      {(sub.student?.full_name || '?')[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{sub.student?.full_name || 'Unknown Student'}</p>
                  <p className="text-xs text-gray-500 truncate">{sub.exercise?.title || 'Exercise'} · Q{sub.question_index + 1}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {/* Status badge */}
                {isReviewed ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{sub.teacher_score}/100</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pending</span>
                  </div>
                )}
                {/* AI score reference */}
                <span className="text-xs text-gray-400">AI: {sub.ai_score || 0}</span>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-gray-100 p-4 space-y-4">
                {/* Video player */}
                <div className="rounded-lg overflow-hidden bg-black">
                  <video
                    src={sub.video_url}
                    controls
                    className="w-full max-h-96 object-contain"
                  />
                </div>

                {/* Transcription */}
                {sub.transcription && (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Transcription:</p>
                    <p className="text-sm text-gray-800">{sub.transcription}</p>
                  </div>
                )}

                {/* AI scores reference */}
                {sub.ai_result && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs font-semibold text-blue-600 mb-2">AI Reference Score: {sub.ai_score}/100</p>
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {['content_score', 'vocabulary_score', 'grammar_score', 'fluency_score'].map(key => (
                        <div key={key} className="text-center">
                          <div className="text-sm font-bold text-blue-700">{Math.round(sub.ai_result[key] || 0)}</div>
                          <div className="text-[10px] text-blue-500 capitalize">{key.replace('_score', '')}</div>
                        </div>
                      ))}
                    </div>
                    {sub.ai_result.strengths && (
                      <p className="text-xs text-blue-700"><strong>Strengths:</strong> {sub.ai_result.strengths}</p>
                    )}
                    {sub.ai_result.suggestions && (
                      <p className="text-xs text-blue-700 mt-1"><strong>Suggestions:</strong> {sub.ai_result.suggestions}</p>
                    )}
                  </div>
                )}

                {/* Already reviewed */}
                {isReviewed && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <p className="text-sm font-semibold text-green-800">Teacher Score: {sub.teacher_score}/100</p>
                    </div>
                    {sub.teacher_feedback && (
                      <p className="text-sm text-green-700">{sub.teacher_feedback}</p>
                    )}
                    <p className="text-xs text-green-500 mt-2">
                      Reviewed on {new Date(sub.reviewed_at).toLocaleDateString()}
                    </p>
                  </div>
                )}

                {/* Teacher scoring form */}
                {!isReviewed && (
                  <div className="p-4 bg-white border-2 border-teal-200 rounded-lg space-y-3">
                    <p className="text-sm font-semibold text-teal-800">Your Rating</p>

                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-600 w-16">Score:</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={teacherScores[sub.id] ?? ''}
                        onChange={(e) => setTeacherScores(prev => ({ ...prev, [sub.id]: e.target.value }))}
                        placeholder={`AI suggests ${sub.ai_score}`}
                        className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                      <span className="text-xs text-gray-400">/ 100</span>
                    </div>

                    <div>
                      <label className="text-sm text-gray-600">Feedback (optional):</label>
                      <textarea
                        value={teacherFeedbacks[sub.id] || ''}
                        onChange={(e) => setTeacherFeedbacks(prev => ({ ...prev, [sub.id]: e.target.value }))}
                        rows={2}
                        placeholder="Write feedback for the student..."
                        className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                      />
                    </div>

                    <button
                      onClick={() => handleReview(sub)}
                      disabled={submitting === sub.id || !teacherScores[sub.id]}
                      className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {submitting === sub.id ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting...</>
                      ) : (
                        <><Send className="w-4 h-4" /> Submit Review</>
                      )}
                    </button>
                  </div>
                )}

                {/* Timestamp */}
                <p className="text-xs text-gray-400">
                  Submitted {new Date(sub.created_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default VideoSubmissionReview
