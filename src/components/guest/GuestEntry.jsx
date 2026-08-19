import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { assetUrl } from '../../hooks/useBranding'
import { ArrowLeft, Play, BookOpen, FileText, User, History, ChevronDown, ChevronRight, CheckCircle, XCircle } from 'lucide-react'

const GuestEntry = () => {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [units, setUnits] = useState([])
  const [course, setCourse] = useState(null)
  const [step, setStep] = useState('name') // 'name' | 'pick'
  const [guestId, setGuestId] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    // Sign out any existing auth session so Supabase uses anon role
    supabase.auth.signOut().then(() => {
      // Check if guest already has a name saved
      const savedName = localStorage.getItem('guest_name')
      const savedId = localStorage.getItem('guest_id')
      if (savedName && savedId) {
        setName(savedName)
        setGuestId(savedId)
        setStep('pick')
        fetchAttempts(savedId)
      }
      fetchDemoCourse()
    })
  }, [])

  const fetchDemoCourse = async () => {
    try {
      // Get demo course ID from site settings
      const { data: setting } = await supabase
        .from('site_settings')
        .select('setting_value')
        .eq('setting_key', 'demo_course_id')
        .single()

      if (!setting?.setting_value) {
        setLoading(false)
        return
      }

      const courseId = setting.setting_value

      // Fetch course info
      const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single()

      setCourse(courseData)

      // Fetch units for this course
      const { data: unitsData } = await supabase
        .from('units')
        .select('*')
        .eq('course_id', courseId)
        .eq('is_active', true)
        .order('unit_number')

      setUnits(unitsData || [])

      // Fetch all sessions for these units
      if (unitsData?.length) {
        const unitIds = unitsData.map(u => u.id)
        const { data: sessionsData } = await supabase
          .from('sessions')
          .select('*')
          .in('unit_id', unitIds)
          .eq('is_active', true)
          .order('session_number')

        setSessions(sessionsData || [])
      }
    } catch (err) {
      console.error('Error fetching demo course:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleNameSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return

    try {
      // Save guest visitor to database
      const { data, error } = await supabase
        .from('guest_visitors')
        .insert({ name: name.trim() })
        .select('id')
        .single()

      if (error) throw error

      const id = data.id
      setGuestId(id)
      localStorage.setItem('guest_name', name.trim())
      localStorage.setItem('guest_id', id)
      setStep('pick')
      fetchAttempts(id)
    } catch (err) {
      console.error('Error saving guest:', err)
      // Fallback: still let them proceed with a temp ID
      const tempId = crypto.randomUUID()
      setGuestId(tempId)
      localStorage.setItem('guest_name', name.trim())
      localStorage.setItem('guest_id', tempId)
      setStep('pick')
    }
  }

  const fetchAttempts = async (id) => {
    try {
      const { data } = await supabase
        .from('guest_attempts')
        .select('id, session_id, score, total_correct, total_questions, time_used_seconds, timed_out, created_at')
        .eq('guest_id', id)
        .order('created_at', { ascending: false })
      setAttempts(data || [])
    } catch (err) {
      console.error('Error fetching attempts:', err)
    }
  }

  const handleSessionClick = (session) => {
    navigate(`/guest/session?sessionId=${session.id}&guestId=${guestId}&guestName=${encodeURIComponent(name)}`)
  }

  const getSessionsForUnit = (unitId) => {
    return sessions.filter(s => s.unit_id === unitId)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Name entry step
  if (step === 'name') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src={assetUrl('/Asset%205.png')}
              alt="Logo"
              className="w-16 h-16 mx-auto mb-4"
            />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Chao mung!</h1>
            <p className="text-gray-600 text-sm">Nhap ten cua ban de bat dau</p>
          </div>

          <form onSubmit={handleNameSubmit} className="space-y-6">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ten cua ban..."
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-0 outline-none text-gray-800 transition-colors"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" />
              Bat dau
            </button>
          </form>

          <button
            onClick={() => navigate('/login')}
            className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lai dang nhap
          </button>
        </div>
      </div>
    )
  }

  // Session picker step
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={assetUrl('/Asset%205.png')} alt="Logo" className="w-10 h-10" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                {course?.title || 'Demo'}
              </h1>
              <p className="text-xs text-gray-500">Xin chao, {name}!</p>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('guest_name')
              localStorage.removeItem('guest_id')
              setStep('name')
              setName('')
              setGuestId(null)
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Doi ten
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {!course ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Chua co khoa hoc demo</h3>
            <p className="text-gray-600 text-sm">Lien he admin de thiet lap khoa hoc demo.</p>
            <button
              onClick={() => navigate('/login')}
              className="mt-6 text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              ← Quay lai dang nhap
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Course description */}
            {course.description && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <p className="text-gray-600">{course.description}</p>
              </div>
            )}

            {/* Sessions grouped by unit */}
            {units.map(unit => {
              const unitSessions = getSessionsForUnit(unit.id)
              if (unitSessions.length === 0) return null

              return (
                <div key={unit.id} className="space-y-3">
                  <h2 className="text-lg font-semibold text-gray-800 px-1">
                    {unit.title}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {unitSessions.map(session => (
                      <button
                        key={session.id}
                        onClick={() => handleSessionClick(session)}
                        className="bg-white rounded-xl shadow-sm p-5 text-left hover:shadow-md hover:border-blue-300 border-2 border-transparent transition-all group"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            session.is_test
                              ? 'bg-orange-100 text-orange-600'
                              : 'bg-blue-100 text-blue-600'
                          }`}>
                            {session.icon ? (
                              <span className="text-xl">{session.icon}</span>
                            ) : session.is_test ? (
                              <FileText className="w-5 h-5" />
                            ) : (
                              <BookOpen className="w-5 h-5" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                                {session.title}
                              </h3>
                              {session.is_test && (
                                <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                                  TEST
                                </span>
                              )}
                            </div>
                            {session.description && (
                              <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                {session.description}
                              </p>
                            )}
                            {session.is_test && session.time_limit_minutes && (
                              <p className="text-xs text-gray-400 mt-2">
                                ⏱ {session.time_limit_minutes} phut
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}

            {sessions.length === 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Chua co bai hoc nao</h3>
                <p className="text-gray-600 text-sm">Khoa hoc demo chua co noi dung.</p>
              </div>
            )}

            {/* Attempt history */}
            {attempts.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-gray-800">Lich su lam bai ({attempts.length})</span>
                  </div>
                  {showHistory
                    ? <ChevronDown size={18} className="text-gray-400" />
                    : <ChevronRight size={18} className="text-gray-400" />
                  }
                </button>

                {showHistory && (
                  <div className="px-4 pb-4 space-y-2">
                    {attempts.map(attempt => {
                      const sessionInfo = sessions.find(s => s.id === attempt.session_id)
                      const scoreColor = attempt.score >= 80 ? 'text-green-600' : attempt.score >= 50 ? 'text-yellow-600' : 'text-red-600'
                      const scoreBg = attempt.score >= 80 ? 'bg-green-50' : attempt.score >= 50 ? 'bg-yellow-50' : 'bg-red-50'

                      return (
                        <div key={attempt.id} className={`p-3 rounded-lg ${scoreBg}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-800 text-sm truncate">
                                {sessionInfo?.title || 'Bai hoc'}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {new Date(attempt.created_at).toLocaleDateString('vi-VN', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit'
                                })}
                                {attempt.timed_out && ' • Het gio'}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <p className={`text-lg font-bold ${scoreColor}`}>{attempt.score}%</p>
                              <p className="text-xs text-gray-500">
                                {attempt.total_correct}/{attempt.total_questions}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default GuestEntry
