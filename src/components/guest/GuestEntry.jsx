import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useBranding } from '../../hooks/useBranding'
import { REGISTER_PATH } from '../../config/registration'
import {
  ArrowLeft, Play, BookOpen, FileText, User, History, ChevronDown, ChevronRight,
  Clock, Lock, UserPlus, LogIn
} from 'lucide-react'

// Full class names so Tailwind keeps them; the course's color theme tints the page.
const THEMES = {
  blue: { header: 'from-blue-600 to-indigo-600', page: 'from-blue-50 to-indigo-100', button: 'bg-blue-600 hover:bg-blue-700', soft: 'bg-blue-100 text-blue-600', bar: 'bg-blue-500' },
  green: { header: 'from-emerald-500 to-green-600', page: 'from-green-50 to-emerald-100', button: 'bg-green-600 hover:bg-green-700', soft: 'bg-green-100 text-green-600', bar: 'bg-green-500' },
  purple: { header: 'from-purple-600 to-fuchsia-600', page: 'from-purple-50 to-fuchsia-100', button: 'bg-purple-600 hover:bg-purple-700', soft: 'bg-purple-100 text-purple-600', bar: 'bg-purple-500' },
  orange: { header: 'from-orange-500 to-red-500', page: 'from-orange-50 to-red-100', button: 'bg-orange-500 hover:bg-orange-600', soft: 'bg-orange-100 text-orange-600', bar: 'bg-orange-500' },
  red: { header: 'from-red-500 to-rose-600', page: 'from-red-50 to-rose-100', button: 'bg-red-600 hover:bg-red-700', soft: 'bg-red-100 text-red-600', bar: 'bg-red-500' },
  pink: { header: 'from-pink-500 to-rose-500', page: 'from-pink-50 to-rose-100', button: 'bg-pink-600 hover:bg-pink-700', soft: 'bg-pink-100 text-pink-600', bar: 'bg-pink-500' }
}

const scoreChip = (score) => (
  score >= 80
    ? 'bg-green-100 text-green-700'
    : score >= 50
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-700'
)

const formatDate = (value) => new Date(value).toLocaleDateString('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
})

// The logo comes from the branding settings, the same one the sidebar uses, so it follows what
// the admin configured. If the image cannot load, a book icon takes its place instead of a broken image.
const GuestLogo = ({ size }) => {
  const { branding } = useBranding()
  const [failed, setFailed] = useState(false)
  const small = size === 'sm'

  return (
    <div className={`flex w-fit flex-shrink-0 items-center justify-center rounded-2xl bg-white shadow ${
      small ? 'h-11 px-2' : 'mx-auto mb-4 h-16 px-3'
    }`}>
      {branding.logoUrl && !failed ? (
        <img
          src={branding.logoUrl}
          alt="Logo"
          className={`w-auto max-w-[160px] object-contain ${small ? 'h-8' : 'h-11'}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <BookOpen className={`${small ? 'h-6 w-6' : 'h-8 w-8'} text-blue-600`} />
      )}
    </div>
  )
}

const GuestEntry = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Set when a teacher shares a course link; without it the page shows the demo course
  const requestedCourseId = searchParams.get('course')
  const [closed, setClosed] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [units, setUnits] = useState([])
  const [course, setCourse] = useState(null)
  const [step, setStep] = useState('name') // 'name' | 'pick'
  const [guestId, setGuestId] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [showHistory, setShowHistory] = useState(false)

  const theme = THEMES[course?.color_theme] || THEMES.blue

  useEffect(() => {
    const start = () => {
      // Check if guest already has a name saved
      const savedName = localStorage.getItem('guest_name')
      const savedId = localStorage.getItem('guest_id')
      if (savedName && savedId) {
        setName(savedName)
        setGuestId(savedId)
        setStep('pick')
        fetchAttempts(savedId)
      }
      fetchGuestCourse()
    }

    // The demo page signs out any existing auth session so Supabase uses the anon role.
    // A course link keeps the login, so a teacher can try their own link without being logged out.
    if (requestedCourseId) start()
    else supabase.auth.signOut().then(start)
  }, [])

  const fetchGuestCourse = async () => {
    try {
      let courseId = requestedCourseId

      if (!courseId) {
        // No course in the link: use the demo course from site settings
        const { data: setting } = await supabase
          .from('site_settings')
          .select('setting_value')
          .eq('setting_key', 'demo_course_id')
          .single()

        if (!setting?.setting_value) {
          setLoading(false)
          return
        }

        courseId = setting.setting_value
      }

      // The course and its units do not depend on each other, so load them together
      const [courseResult, unitsResult] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
        supabase
          .from('units')
          .select('*')
          .eq('course_id', courseId)
          .eq('is_active', true)
          .is('assigned_student_id', null) // units made for one student are not for guests
          .order('unit_number')
      ])
      const courseData = courseResult.data
      const unitsData = unitsResult.data || []

      // A course link only works while the teacher has opened the course to guests
      if (requestedCourseId && (!courseData?.allow_guest_access || courseData.is_active === false)) {
        setClosed(true)
        return
      }

      setCourse(courseData)
      setUnits(unitsData)

      if (unitsData.length) {
        const { data: sessionsData } = await supabase
          .from('sessions')
          .select('*')
          .in('unit_id', unitsData.map(u => u.id))
          .eq('is_active', true)
          .is('assigned_student_id', null) // sessions made for one student are not for guests
          .order('session_number')

        // Respect the open and close dates the teacher set on a session
        const now = Date.now()
        setSessions((sessionsData || []).filter(session =>
          (!session.open_date || new Date(session.open_date).getTime() <= now) &&
          (!session.close_date || new Date(session.close_date).getTime() >= now)
        ))
      }
    } catch (err) {
      console.error('Error fetching guest course:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleNameSubmit = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || saving) return

    setSaving(true)
    try {
      // Save guest visitor to database
      const { data, error } = await supabase
        .from('guest_visitors')
        .insert({ name: trimmed })
        .select('id')
        .single()

      if (error) throw error

      setGuestId(data.id)
      localStorage.setItem('guest_name', trimmed)
      localStorage.setItem('guest_id', data.id)
      setStep('pick')
      fetchAttempts(data.id)
    } catch (err) {
      console.error('Error saving guest:', err)
      // Fallback: still let them proceed with a temp ID
      const tempId = crypto.randomUUID()
      setGuestId(tempId)
      localStorage.setItem('guest_name', trimmed)
      localStorage.setItem('guest_id', tempId)
      setStep('pick')
    } finally {
      setSaving(false)
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
    const courseParam = requestedCourseId ? `&courseId=${requestedCourseId}` : ''
    navigate(`/guest/session?sessionId=${session.id}&guestId=${guestId}&guestName=${encodeURIComponent(name)}${courseParam}`)
  }

  const changeName = () => {
    localStorage.removeItem('guest_name')
    localStorage.removeItem('guest_id')
    setStep('name')
    setName('')
    setGuestId(null)
    setAttempts([])
  }

  const bestScoreBySession = useMemo(() => {
    const best = {}
    attempts.forEach(attempt => {
      if (best[attempt.session_id] == null || attempt.score > best[attempt.session_id]) {
        best[attempt.session_id] = attempt.score
      }
    })
    return best
  }, [attempts])

  const doneCount = sessions.filter(session => bestScoreBySession[session.id] != null).length
  const progressPercent = sessions.length > 0 ? Math.round((doneCount / sessions.length) * 100) : 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Đang tải khóa học...</p>
        </div>
      </div>
    )
  }

  // The course link was turned off, or the course is locked
  if (closed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Khóa học này không mở cho khách</h1>
          <p className="text-gray-600 text-sm">Hãy đăng nhập bằng tài khoản của bạn hoặc liên hệ giáo viên.</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <LogIn className="w-5 h-5" />
            Đăng nhập
          </button>
        </div>
      </div>
    )
  }

  // Name entry step
  if (step === 'name') {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br ${theme.page} px-4 py-8`}>
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
          <div className={`bg-gradient-to-br ${theme.header} px-8 pt-8 pb-10 text-center text-white`}>
            <GuestLogo size="lg" />
            <h1 className="text-2xl font-bold">{course?.title || 'Chào mừng bạn!'}</h1>
            {course?.description && (
              <p className="mt-2 text-sm text-white/85 line-clamp-3">{course.description}</p>
            )}
            {sessions.length > 0 && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
                <BookOpen className="w-3.5 h-3.5" />
                {sessions.length} bài học
              </p>
            )}
          </div>

          <div className="p-8 -mt-4 bg-white rounded-t-3xl">
            <form onSubmit={handleNameSubmit} className="space-y-4">
              <div>
                <label htmlFor="guest-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Nhập tên của bạn để bắt đầu
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="guest-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tên của bạn..."
                    maxLength={60}
                    autoComplete="name"
                    className="w-full pl-10 pr-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-0 outline-none text-gray-800 transition-colors"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!name.trim() || saving}
                className={`w-full ${theme.button} text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Play className="w-5 h-5" />
                {saving ? 'Đang vào...' : 'Bắt đầu'}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-gray-500">
              Không cần tài khoản. Kết quả của khách không được tính XP.
            </p>

            <button
              onClick={() => navigate('/login')}
              className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Đã có tài khoản? Đăng nhập
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Session picker step
  return (
    <div className={`min-h-screen bg-gradient-to-br ${theme.page}`}>
      {/* Header */}
      <div className={`bg-gradient-to-br ${theme.header} text-white shadow-md`}>
        <div className="max-w-4xl mx-auto px-4 pt-5 pb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <GuestLogo size="sm" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold truncate">{course?.title || 'Demo'}</h1>
                <p className="text-sm text-white/85 truncate">Xin chào, {name}!</p>
              </div>
            </div>
            <button
              onClick={changeName}
              className="flex-shrink-0 rounded-full bg-white/20 hover:bg-white/30 px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Đổi tên
            </button>
          </div>

          {sessions.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-white/90 mb-1.5">
                <span>Đã làm {doneCount}/{sessions.length} bài</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/25 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {!course ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Chưa có khóa học demo</h3>
            <p className="text-gray-600 text-sm">Liên hệ admin để thiết lập khóa học demo.</p>
            <button
              onClick={() => navigate('/login')}
              className="mt-6 text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              ← Quay lại đăng nhập
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {course.description && (
              <p className="text-sm text-gray-600 leading-relaxed">{course.description}</p>
            )}

            {/* Sessions grouped by unit */}
            {units.map((unit, unitIndex) => {
              const unitSessions = sessions.filter(s => s.unit_id === unit.id)
              if (unitSessions.length === 0) return null

              return (
                <section key={unit.id} className="space-y-3">
                  <div className="flex items-center gap-3 px-1">
                    <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${theme.soft}`}>
                      {unitIndex + 1}
                    </span>
                    <h2 className="text-lg font-semibold text-gray-800">{unit.title}</h2>
                    <span className="text-xs text-gray-400">{unitSessions.length} bài</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {unitSessions.map(session => {
                      const best = bestScoreBySession[session.id]

                      return (
                        <button
                          key={session.id}
                          onClick={() => handleSessionClick(session)}
                          className="group flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md active:translate-y-0"
                        >
                          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
                            session.is_test ? 'bg-orange-100 text-orange-600' : theme.soft
                          }`}>
                            {session.icon ? (
                              <span className="text-2xl">{session.icon}</span>
                            ) : session.is_test ? (
                              <FileText className="w-6 h-6" />
                            ) : (
                              <BookOpen className="w-6 h-6" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                                {session.title}
                              </h3>
                              {session.is_test && (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-600">
                                  Kiểm tra
                                </span>
                              )}
                            </div>
                            {session.description && (
                              <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{session.description}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              {session.is_test && session.time_limit_minutes && (
                                <span className="inline-flex items-center gap-1 text-gray-500">
                                  <Clock className="w-3.5 h-3.5" />
                                  {session.time_limit_minutes} phút
                                </span>
                              )}
                              {best != null ? (
                                <span className={`rounded-full px-2 py-0.5 font-medium ${scoreChip(best)}`}>
                                  Điểm cao nhất {best}%
                                </span>
                              ) : (
                                <span className="text-gray-400">Chưa làm</span>
                              )}
                            </div>
                          </div>

                          <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300 transition-colors group-hover:text-blue-500" />
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}

            {sessions.length === 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Chưa có bài học nào</h3>
                <p className="text-gray-600 text-sm">Khóa học này chưa có nội dung dành cho khách.</p>
              </div>
            )}

            {/* Attempt history */}
            {attempts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-gray-800">Lịch sử làm bài ({attempts.length})</span>
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

                      return (
                        <div key={attempt.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-800">
                              {sessionInfo?.title || 'Bài học'}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {formatDate(attempt.created_at)}
                              {attempt.timed_out && ' • Hết giờ'}
                            </p>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${scoreChip(attempt.score)}`}>
                              {attempt.score}%
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {attempt.total_correct}/{attempt.total_questions} câu
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Invite to make an account */}
            <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-white/70 p-5 text-center">
              <p className="text-sm text-gray-700">
                Muốn lưu tiến trình học và nhận XP? Tạo tài khoản miễn phí để học đầy đủ hơn.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => navigate(REGISTER_PATH)}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Đăng ký
                </button>
                <button
                  onClick={() => navigate('/login')}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Đăng nhập
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GuestEntry
