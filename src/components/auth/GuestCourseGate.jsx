import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import LoadingSpinner from '../ui/LoadingSpinner'

// A visitor without an account opened a course link. If the teacher opened the course to guests,
// send them to the guest page for that course; otherwise to the login page as before.
const GuestCourseGate = ({ courseId, from }) => {
  const [isOpen, setIsOpen] = useState(null) // null while checking

  useEffect(() => {
    let cancelled = false
    supabase
      .from('courses')
      .select('allow_guest_access, is_active')
      .eq('id', courseId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsOpen(!!data?.allow_guest_access && data.is_active !== false)
      })
    return () => { cancelled = true }
  }, [courseId])

  if (isOpen === null) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-white">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (isOpen) {
    return <Navigate to={`/guest?course=${courseId}`} replace />
  }

  return <Navigate to="/login" state={{ from }} replace />
}

export default GuestCourseGate
