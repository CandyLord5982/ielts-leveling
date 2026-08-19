import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import StudentStatsPopover from '../ui/StudentStatsPopover'
import useClassStats from '../../hooks/useClassStats'
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  AlertCircle
} from 'lucide-react'

const UnitSessionManager = () => {
  const { courseId, levelId, unitId } = useParams()
  const currentId = courseId || levelId
  const navigate = useNavigate()
  const { user } = useAuth()
  const { canCreateContent } = usePermissions()
  const { sessionStats: sessionClassStats } = useClassStats(currentId)

  const [unit, setUnit] = useState(null)
  const [course, setCourse] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingSession, setEditingSession] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    session_number: '',
    icon: '',
    is_test: false,
    time_limit_minutes: 30,
    passing_score: 70,
    max_attempts: 1
  })

  useEffect(() => {
    if (user && unitId && currentId) {
      fetchData()
    }
  }, [user, unitId, currentId])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Fetch unit details
      const { data: unitData, error: unitError } = await supabase
        .from('units')
        .select('*, courses(*)')
        .eq('id', unitId)
        .single()

      if (unitError) throw unitError

      // Fetch sessions for this unit
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .eq('unit_id', unitId)
        .order('session_number')

      if (sessionsError) throw sessionsError

      setUnit(unitData)
      setCourse(unitData.courses)
      setSessions(sessionsData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
      alert('Error loading data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSession = () => {
    setEditingSession(null)
    setFormData({
      title: '',
      description: '',
      session_number: sessions.length + 1,
      icon: '',
      is_test: false,
      time_limit_minutes: 30,
      passing_score: 70,
      max_attempts: 1
    })
    setShowModal(true)
  }

  const handleEditSession = (session) => {
    setEditingSession(session)
    setFormData({
      title: session.title,
      description: session.description || '',
      session_number: session.session_number,
      icon: session.icon || '',
      is_test: session.is_test || false,
      time_limit_minutes: session.time_limit_minutes || 30,
      passing_score: session.passing_score || 70,
      max_attempts: session.max_attempts || 1
    })
    setShowModal(true)
  }

  const handleSaveSession = async () => {
    try {
      if (!formData.title.trim()) {
        alert('Please enter a session title')
        return
      }

      const sessionData = {
        unit_id: unitId,
        title: formData.title.trim(),
        description: formData.description.trim(),
        session_number: parseInt(formData.session_number) || 1,
        session_type: 'mixed',
        difficulty_level: 1,
        is_test: formData.is_test || false,
        time_limit_minutes: formData.is_test ? (parseInt(formData.time_limit_minutes) || 30) : null,
        passing_score: formData.is_test ? (parseInt(formData.passing_score) || 70) : null,
        max_attempts: formData.is_test ? (parseInt(formData.max_attempts) || 1) : null
      }

      // Only add icon if the column exists in your schema
      if (formData.icon.trim()) {
        sessionData.icon = formData.icon.trim()
      }

      if (editingSession) {
        // Update existing session
        const { error } = await supabase
          .from('sessions')
          .update(sessionData)
          .eq('id', editingSession.id)

        if (error) throw error
      } else {
        // Create new session
        const { error } = await supabase
          .from('sessions')
          .insert(sessionData)

        if (error) throw error
      }

      setShowModal(false)
      fetchData()
    } catch (error) {
      console.error('Error saving session:', error)
      alert('Error saving session: ' + error.message)
    }
  }

  const handleDeleteSession = async (session) => {
    if (!confirm(`Are you sure you want to delete "${session.title}"?\n\nThis will also delete all exercises in this session.`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', session.id)

      if (error) throw error
      alert('Session deleted successfully!')
      fetchData()
    } catch (error) {
      console.error('Error deleting session:', error)
      alert('Error deleting session: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-50 flex items-center justify-center" style={{ minHeight: '100dvh' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!unit) {
    return (
      <div className="bg-gray-50 flex items-center justify-center" style={{ minHeight: '100dvh' }}>
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Unit not found</h3>
          <button
            onClick={() => navigate(`/study/course/${currentId}`)}
            className="text-blue-600 hover:underline"
          >
            Back to course
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white -mt-6" style={{ minHeight: '80dvh' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 pt-4">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(`/study/course/${currentId}`)}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <div className="text-sm text-gray-500">{course?.title}</div>
                <h1 className="text-2xl font-bold text-gray-900">{unit.title}</h1>
                <p className="text-sm text-gray-600">{unit.description}</p>
              </div>
            </div>

            {canCreateContent() && (
              <button
                onClick={handleCreateSession}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Session
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sessions List */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {sessions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions yet</h3>
            <p className="text-gray-600 mb-4">Create your first session to get started</p>
            {canCreateContent() && (
              <button
                onClick={handleCreateSession}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Create First Session
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {session.icon && (
                      <div className="text-3xl">{session.icon}</div>
                    )}
                    <div>
                      <div className="text-sm text-gray-500 flex items-center gap-2">
                        Session {session.session_number}
                        {session.is_test && (
                          <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">TEST</span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                    </div>
                  </div>
                  {canCreateContent() && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditSession(session)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Edit session"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSession(session)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {session.description && (
                  <p className="text-sm text-gray-600 mb-4">{session.description}</p>
                )}

                {/* Teacher: student completion stats with hover popover */}
                {canCreateContent() && sessionClassStats?.[session.id] && (
                  <div className="mb-3">
                    <StudentStatsPopover stats={sessionClassStats[session.id]} size="md" />
                  </div>
                )}

                <Link
                  to={`/study/course/${currentId}/unit/${unitId}/session/${session.id}`}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  View Exercises →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {editingSession ? 'Edit Session' : 'Create New Session'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Session Number
                </label>
                <input
                  type="number"
                  value={formData.session_number}
                  onChange={(e) => setFormData({ ...formData, session_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Greetings"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="3"
                  placeholder="Describe what students will learn..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Icon (emoji)
                </label>
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="👋"
                  maxLength="2"
                />
              </div>

              {/* Test Mode Toggle */}
              <div className="border-t pt-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_test}
                    onChange={(e) => setFormData({ ...formData, is_test: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  <div>
                    <span className="font-medium text-gray-900">Test Mode</span>
                    <p className="text-xs text-gray-500">Students will take a timed test instead of the exercise map</p>
                  </div>
                </label>
              </div>

              {formData.is_test && (
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-200 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Time Limit (min)
                      </label>
                      <input
                        type="number"
                        value={formData.time_limit_minutes}
                        onChange={(e) => setFormData({ ...formData, time_limit_minutes: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        min="1"
                        max="180"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pass Score (%)
                      </label>
                      <input
                        type="number"
                        value={formData.passing_score}
                        onChange={(e) => setFormData({ ...formData, passing_score: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        min="0"
                        max="100"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Attempts
                    </label>
                    <input
                      type="number"
                      value={formData.max_attempts}
                      onChange={(e) => setFormData({ ...formData, max_attempts: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      min="1"
                      max="10"
                    />
                    <p className="text-xs text-gray-500 mt-1">How many times a student can take this test</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSession}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {editingSession ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UnitSessionManager
