import { useAuth } from './useAuth'

export const usePermissions = () => {
  const { user, profile, isAdmin } = useAuth()

  const canCreateContent = () => {
    // Allow admins and teachers to create content
    // Check profile.role from users table, not user.role from auth
    return user && (isAdmin() || profile?.role === 'admin' || profile?.role === 'teacher')
  }

  const canEditContent = () => {
    // Similar to create, but you might have different rules
    return user && (isAdmin() || profile?.role === 'admin' || profile?.role === 'teacher')
  }

  const canDeleteContent = () => {
    // More restrictive - only admins can delete
    return isAdmin()
  }

  const canViewContent = () => {
    // All authenticated users can view content
    return !!user
  }

  return {
    canCreateContent,
    canEditContent,
    canDeleteContent,
    canViewContent,
    user,
    isAdmin: isAdmin()
  }
}

export default usePermissions