import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabase/client'
import LoadingSpinner from '../ui/LoadingSpinner'

const FullPageMessage = ({ text }) => (
  <div className="min-h-dvh flex items-center justify-center bg-white">
    <div className="text-center">
      <LoadingSpinner size="lg" />
      <div className="mt-4 text-gray-600">{text}</div>
    </div>
  </div>
)

const ProtectedRoute = ({ children, requireAdmin = false, requireStaff = false }) => {
  const { user, loading } = useAuth()
  const location = useLocation()
  const roleCheck = requireAdmin ? 'is_admin' : requireStaff ? 'is_staff' : null
  const [allowed, setAllowed] = useState(null)

  // Ask the database rather than trusting the in-memory profile, which the
  // user can edit from devtools.
  useEffect(() => {
    if (!roleCheck || !user) return
    let cancelled = false
    setAllowed(null)
    supabase.rpc(roleCheck, { uid: user.id }).then(({ data, error }) => {
      if (!cancelled) setAllowed(!error && data === true)
    })
    return () => { cancelled = true }
  }, [roleCheck, user?.id])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-white">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <div className="mt-4 text-gray-600">Đang xác thực...</div>
          <div className="mt-2 text-sm text-gray-500">
            Nếu mất quá lâu, hãy thử refresh trang
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roleCheck) {
    if (allowed === null) return <FullPageMessage text="Đang kiểm tra quyền truy cập..." />
    if (!allowed) return <Navigate to="/" replace />
  }

  return children
}

export default ProtectedRoute
