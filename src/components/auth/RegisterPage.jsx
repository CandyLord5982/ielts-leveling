import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../supabase/client'
import { assetUrl } from '../../hooks/useBranding'

const DEFAULT_LOGIN_IMAGE =
  'https://images.unsplash.com/photo-1557683316-973673baf926?w=1200&h=400&fit=crop'

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    password: '',
    confirmPassword: '',
    courseId: ''
  })
  const [courses, setCourses] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loginBgImage, setLoginBgImage] = useState(DEFAULT_LOGIN_IMAGE)

  const { user, signUp } = useAuth()

  useEffect(() => {
    fetchLoginPageImage()
    fetchCourses()
  }, [])

  const fetchCourses = async () => {
    try {
      // Get allowed course IDs from site_settings
      const { data: setting } = await supabase
        .from('site_settings')
        .select('setting_value')
        .eq('setting_key', 'register_course_ids')
        .single()

      if (!setting?.setting_value) return

      const courseIds = JSON.parse(setting.setting_value)
      if (!Array.isArray(courseIds) || courseIds.length === 0) return

      const { data, error } = await supabase
        .from('courses')
        .select('id, title, level_number')
        .in('id', courseIds)
        .eq('is_active', true)
        .order('level_number')
      if (!error && data) setCourses(data)
    } catch (err) {
      console.error('Failed to load courses:', err)
    }
  }

  const fetchLoginPageImage = async () => {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('setting_value')
        .eq('setting_key', 'login_page_image')
        .single()

      if (data?.setting_value && !error) {
        setLoginBgImage(data.setting_value)
      }
    } catch (error) {
      console.error('Failed to load login image:', error)
    }
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const username = formData.username.trim()
    if (!username) {
      setError('Vui long nhap ten dang nhap')
      setLoading(false)
      return
    }
    if (username.length < 3) {
      setError('Ten dang nhap phai co it nhat 3 ky tu')
      setLoading(false)
      return
    }
    if (username.length > 20) {
      setError('Ten dang nhap khong duoc qua 20 ky tu')
      setLoading(false)
      return
    }
    if (/\s/.test(username)) {
      setError('Ten dang nhap khong duoc co dau cach')
      setLoading(false)
      return
    }
    if (!/^[a-zA-Z0-9._]+$/.test(username)) {
      setError('Ten dang nhap chi duoc chua chu cai, so, dau cham va gach duoi')
      setLoading(false)
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Mat khau xac nhan khong khop')
      setLoading(false)
      return
    }

    if (formData.password.length < 6) {
      setError('Mat khau phai co it nhat 6 ky tu')
      setLoading(false)
      return
    }

    // Generate a random email from the username
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const generatedEmail = `${formData.username.trim().toLowerCase().replace(/\s+/g, '_')}_${randomSuffix}@ieltsleveling.local`

    try {
      const { error } = await signUp(generatedEmail, formData.password, formData.fullName, formData.username.trim(), formData.courseId || null)
      if (error) {
        setError(error.message || 'Co loi xay ra khi dang ky')
      } else {
        setSuccess(true)
      }
    } catch (err) {
      setError('Co loi xay ra, vui long thu lai')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="max-w-md w-full text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <a className="signup-title">Dang ky thanh cong!</a>
            <p className="text-gray-500 text-sm">Vui long kiem tra email de xac thuc tai khoan.</p>
            <Link
              to="/login"
              className="neomorphic-button mt-4 flex items-center justify-center"
            >
              Dang nhap
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      <style>{`
        .neomorphic-card {
          background: transparent;
        }

        @media (min-width: 768px) {
          .neomorphic-card {
            background: transparent;
            border-radius: 15px;
            box-shadow: none;
          }
        }

        .neomorphic-input {
          position: relative;
          width: 100%;
        }

        .custom-border-input {
          width: 100%;
          padding: 10px;
          outline: none;
          background: transparent;
          color: #1e40af;
          font-size: 1em;
          border: none;
          border-left: 2px solid #2b313849;
          border-bottom: 2px solid #2b313849;
          border-bottom-left-radius: 8px;
          transition: border-color 0.3s ease;
        }

        .custom-border-input:focus {
          border-left-color: #2563eb;
          border-bottom-color: #2563eb;
        }

        .neomorphic-input span {
          position: absolute;
          left: 0;
          top: 0;
          transform: translateY(-4px);
          margin-left: 10px;
          padding: 10px;
          pointer-events: none;
          font-size: 14px;
          color: #1e40af;
          text-transform: none;
          transition: 0.5s;
          letter-spacing: normal;
          border-radius: 8px;
          z-index: 2;
        }

        .neomorphic-input input:valid ~ span,
        .neomorphic-input input:focus ~ span {
          transform: translateX(156px) translateY(-15px);
          font-size: 0.8em;
          padding: 5px 10px;
          background: #2563eb;
          letter-spacing: 0.2em;
          color: #fff;
        }

        .neomorphic-button {
          height: 45px;
          width: 120px;
          border-radius: 8px;
          border: 2px solid #2563eb;
          cursor: pointer;
          background-color: #2563eb;
          transition: 0.5s;
          text-transform: none;
          font-size: 14px;
          letter-spacing: normal;
          color: white;
          font-weight: bold;
        }

        .neomorphic-button:hover:not(:disabled) {
          background-color: #1d4ed8;
        }

        .neomorphic-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .signup-title {
          color: #1e40af;
          text-transform: none;
          letter-spacing: normal;
          display: block;
          font-weight: bold;
          font-size: x-large;
          margin-top: 1em;
          margin-bottom: 0.5em;
        }
      `}</style>

      {/* Left Side - Image (hidden on mobile) */}
      <div className="hidden md:flex md:w-3/5 lg:w-3/5 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${loginBgImage}')` }}
        />
        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
          <div>
            <img
              src={assetUrl('/image/Logo_Pinta.png')}
              alt="Pinta Logo"
              className="mb-8 max-w-[200px] h-auto"
            />
            <h1 className="text-4xl lg:text-5xl font-bold mb-4">
              Join IELTS Leveling
            </h1>
            <p className="text-lg lg:text-xl text-blue-100 mb-8">
              Start your gamified learning journey today
            </p>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-xl">🎯</span>
                </div>
                <p className="text-blue-50">Track your progress with XP</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-xl">🔥</span>
                </div>
                <p className="text-blue-50">Build streaks and stay motivated</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-xl">🏆</span>
                </div>
                <p className="text-blue-50">Unlock achievements and rewards</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Register Form */}
      <div className="w-full md:w-2/5 lg:w-2/5 flex flex-col items-center justify-center min-h-screen px-4 bg-white">
        <div className="neomorphic-card flex flex-col items-center justify-center w-full md:w-[400px] lg:w-[400px] gap-6 p-8 pt-20 md:pt-24 relative">
          {/* Logo - Top Left */}
          <div className="absolute top-1 md:top-6 left-4">
            <img
              src={assetUrl('/Asset%205.png')}
              alt="Logo"
              width={64}
              height={64}
            />
          </div>

          {/* Top right dots */}
          <div className="absolute top-4 md:top-8 right-4 flex gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <div className="w-3 h-3 rounded-full bg-pink-500"></div>
          </div>

          <a className="signup-title">Tao tai khoan moi</a>

          <form
            onSubmit={handleSubmit}
            className="w-full flex flex-col items-center gap-6"
          >
            {error && (
              <div className="bg-red-50 border-2 border-red-400 text-red-700 px-4 py-2 rounded-lg text-sm w-[280px]">
                {error}
              </div>
            )}

            {/* Full Name */}
            <div className="neomorphic-input w-[280px]">
              <input
                type="text"
                name="fullName"
                required
                value={formData.fullName}
                onChange={handleChange}
                className="custom-border-input"
              />
              <span>Ho va ten</span>
            </div>

            {/* Course / Grade */}
            {courses.length > 0 && (
              <div className="neomorphic-input w-[280px]">
                <select
                  name="courseId"
                  value={formData.courseId}
                  onChange={handleChange}
                  className="custom-border-input"
                  required
                >
                  <option value="">-- Chon lop --</option>
                  {courses.map(course => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Username */}
            <div className="neomorphic-input w-[280px]">
              <input
                type="text"
                name="username"
                required
                value={formData.username}
                onChange={handleChange}
                className="custom-border-input"
              />
              <span>Ten dang nhap</span>
            </div>

            {/* Password */}
            <div className="neomorphic-input w-[280px]">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="custom-border-input"
              />
              <span>Mat khau</span>
              <button
                type="button"
                className="absolute right-2 top-2 text-blue-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {/* Confirm Password */}
            <div className="neomorphic-input w-[280px]">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className="custom-border-input"
              />
              <span>Xac nhan</span>
              <button
                type="button"
                className="absolute right-2 top-2 text-blue-600"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="neomorphic-button mb-4"
            >
              {loading ? 'Loading...' : 'Dang ky'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center w-[280px]">
            <div className="flex-1 border-t border-gray-300"></div>
            <span className="px-3 text-xs text-gray-500">hoac</span>
            <div className="flex-1 border-t border-gray-300"></div>
          </div>

          {/* Login link */}
          <Link
            to="/login"
            className="w-[280px] border-2 border-blue-600 hover:bg-blue-600 hover:text-white text-blue-700 rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-all duration-300 mb-4"
          >
            Da co tai khoan? Dang nhap
          </Link>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
