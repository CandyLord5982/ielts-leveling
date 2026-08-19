import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase/client'

const AuthContext = createContext({})

// Equipment columns that live in user_equipment table
const EQUIPMENT_FIELDS = [
  'active_title', 'active_frame_ratio', 'hide_frame',
  'active_background_url', 'active_bowl_url',
  'active_spaceship_url', 'active_spaceship_laser', 'active_boat_url', 'active_hammer_url'
]

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Listen for auth changes - handles initial session automatically
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth event:', event)

        try {
          if (session?.user) {
            // Only update user state if the user actually changed
            setUser(prev => prev?.id === session.user.id ? prev : session.user)
            // INITIAL_SESSION: Fired on page load with existing session
            // TOKEN_REFRESHED: Fired after user signs in successfully
            if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
              await fetchUserProfile(session.user.id)
              // Update last_seen_at for online presence
              supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', session.user.id).then()
            }
          } else {
            setUser(null)
            setProfile(null)
          }
        } catch (error) {
          console.error('❌ Error in auth state change:', error)
        } finally {
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const fetchUserProfile = async (userId) => {
    try {
      console.log('📝 Fetching profile for user:', userId)

      // Add timeout to prevent infinite hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout after 5s')), 5000)
      )

      const fetchPromise = Promise.all([
        supabase
          .from('users')
          .select('id, email, full_name, role, xp, gems, level, current_level, streak_count, last_activity_date, avatar_url, name_changed_at, is_banned')
          .eq('id', userId)
          .single(),
        supabase
          .from('user_equipment')
          .select('active_title, active_frame_ratio, hide_frame, active_background_url, active_bowl_url, active_spaceship_url, active_spaceship_laser, active_boat_url, active_hammer_url')
          .eq('user_id', userId)
          .single()
      ])

      const [userResult, equipResult] = await Promise.race([fetchPromise, timeoutPromise])

      if (userResult.error) {
        console.error('❌ Error fetching user profile:', userResult.error)
        console.error('❌ Error details:', JSON.stringify(userResult.error))
        // Don't set profile to null - keep existing profile data
      } else {
        const merged = { ...userResult.data, ...(equipResult.data || {}) }
        console.log('✅ Profile fetched:', merged)
        setProfile(merged)
      }
    } catch (error) {
      console.error('❌ Error in fetchUserProfile:', error)
      console.error('❌ Error type:', error.message)
      // Don't set profile to null - keep existing profile data
    }
  }

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (!error && data.user) {
      window.location.reload()
    }

    return { data, error }
  }

  const signUp = async (email, password, fullName, username, courseId) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: fullName
        }
      }
    })

    if (data.user && !error) {
      // Create user profile ngay lập tức
      try {
        const { error: profileError } = await supabase.from('users').insert({
          id: data.user.id,
          email: data.user.email,
          full_name: fullName,
          username: username || null,
          role: 'user',
          current_level: 1,
          xp: 0,
          streak_count: 0
        })

        if (profileError) {
          console.error('Error creating user profile:', profileError)
        }

        // Auto-enroll in selected course (or fallback to demo_course_id)
        try {
          let enrollCourseId = courseId
          if (!enrollCourseId) {
            const { data: setting } = await supabase
              .from('site_settings')
              .select('setting_value')
              .eq('setting_key', 'demo_course_id')
              .single()
            enrollCourseId = setting?.setting_value
          }

          if (enrollCourseId) {
            await supabase.from('course_enrollments').insert({
              course_id: enrollCourseId,
              student_id: data.user.id
            })
          }
        } catch (enrollErr) {
          console.error('Error auto-enrolling in course:', enrollErr)
        }

        // Give a random common/uncommon pet
        try {
          const { data: pets } = await supabase
            .from('pets')
            .select('id')
            .in('rarity', ['common', 'uncommon'])
            .eq('is_active', true)

          if (pets && pets.length > 0) {
            const randomPet = pets[Math.floor(Math.random() * pets.length)]
            await supabase.from('user_pets').insert({
              user_id: data.user.id,
              pet_id: randomPet.id,
              is_active: true
            })
          }
        } catch (petErr) {
          console.error('Error giving starter pet:', petErr)
        }
      } catch (profileError) {
        console.error('Error creating user profile:', profileError)
      }
    }

    return { data, error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (!error) {
      setUser(null)
      setProfile(null)
    }
    return { error }
  }

  const updateProfile = async (updates) => {
    if (!user) return { error: 'No user logged in' }

    try {
      // Split updates into user fields and equipment fields
      const equipmentUpdates = {}
      const userUpdates = {}
      for (const [key, value] of Object.entries(updates)) {
        if (EQUIPMENT_FIELDS.includes(key)) {
          equipmentUpdates[key] = value
        } else {
          userUpdates[key] = value
        }
      }

      const promises = []

      if (Object.keys(userUpdates).length > 0) {
        promises.push(
          supabase.from('users').update(userUpdates).eq('id', user.id)
            .select('id, email, full_name, role, xp, gems, level, current_level, streak_count, last_activity_date, avatar_url, name_changed_at, is_banned')
            .single()
        )
      } else {
        promises.push(
          supabase.from('users')
            .select('id, email, full_name, role, xp, gems, level, current_level, streak_count, last_activity_date, avatar_url, name_changed_at, is_banned')
            .eq('id', user.id).single()
        )
      }

      if (Object.keys(equipmentUpdates).length > 0) {
        promises.push(
          supabase.from('user_equipment').upsert({ user_id: user.id, ...equipmentUpdates })
            .select('active_title, active_frame_ratio, hide_frame, active_background_url, active_bowl_url, active_spaceship_url, active_spaceship_laser, active_boat_url, active_hammer_url')
            .single()
        )
      } else {
        promises.push(
          supabase.from('user_equipment')
            .select('active_title, active_frame_ratio, hide_frame, active_background_url, active_bowl_url, active_spaceship_url, active_spaceship_laser, active_boat_url, active_hammer_url')
            .eq('user_id', user.id).single()
        )
      }

      const [userResult, equipResult] = await Promise.all(promises)
      if (userResult.error) throw userResult.error

      const merged = { ...userResult.data, ...(equipResult.data || {}) }
      setProfile(merged)
      return { data: merged, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  const isAdmin = () => {
    // Check both profile role and user metadata as fallback
    return profile?.role === 'admin' || user?.user_metadata?.role === 'admin'
  }

  const isTeacher = () => {
    return profile?.role === 'teacher'
  }

  const value = {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile,
    isAdmin,
    isTeacher,
    fetchUserProfile
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
