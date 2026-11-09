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
    // Events after which the profile row should be (re)loaded:
    // INITIAL_SESSION - page load with an existing session
    // SIGNED_IN       - a sign-in on this tab
    // TOKEN_REFRESHED - periodic token refresh (also keeps last_seen_at fresh)
    // USER_UPDATED    - e.g. a guest account converted to a real one
    const PROFILE_EVENTS = ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED']

    // Listen for auth changes - handles initial session automatically.
    // The callback must stay synchronous: it runs while supabase-js holds its auth lock, and
    // awaiting another Supabase call in here can deadlock (which is what the 5s profile timeout
    // used to catch). Supabase work is deferred with setTimeout so it runs after the callback returns.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('🔐 Auth event:', event)

        if (!session?.user) {
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }

        // Only update user state if the user actually changed
        setUser(prev => prev?.id === session.user.id ? prev : session.user)

        if (!PROFILE_EVENTS.includes(event)) {
          setLoading(false)
          return
        }

        const userId = session.user.id
        setTimeout(async () => {
          try {
            await fetchUserProfile(userId)
            // Update last_seen_at for online presence
            supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', userId).then()
          } catch (error) {
            console.error('❌ Error in auth state change:', error)
          } finally {
            setLoading(false)
          }
        }, 0)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const fetchUserProfile = async (userId) => {
    try {
      console.log('📝 Fetching profile for user:', userId)

      // Safety net so a stuck request can't leave the app loading forever
      let timeoutId
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Profile fetch timeout after 5s')), 5000)
      })

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
        .finally(() => clearTimeout(timeoutId))

      if (userResult.error) {
        console.error('❌ Error fetching user profile:', userResult.error)
        console.error('❌ Error details:', JSON.stringify(userResult.error))
        // Don't set profile to null - keep existing profile data
      } else {
        // Frozen so it can't be edited in place from the devtools console.
        setProfile(Object.freeze({ ...userResult.data, ...(equipResult.data || {}) }))
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

  // Shared by signUp and signInAnonymously: creates the public.users row,
  // enrolls in the explicitly chosen course (if any), and grants a starter pet.
  const setupNewUserProfile = async (userId, { email, fullName, username, courseId }) => {
    try {
      const { error: profileError } = await supabase.from('users').insert({
        id: userId,
        email,
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

      // Enroll in the course the user picked at signup, if any. No fallback course -
      // an unenrolled user just has no courses until a teacher/admin enrolls them.
      // (Supabase returns { error } instead of throwing, so check it explicitly.)
      if (courseId) {
        const { error: enrollError } = await supabase.from('course_enrollments').insert({
          course_id: courseId,
          student_id: userId
        })
        if (enrollError) {
          console.error('Error enrolling in course:', enrollError)
        }
      }

      // Give a random common/uncommon pet
      const { data: pets, error: petsError } = await supabase
        .from('pets')
        .select('id')
        .in('rarity', ['common', 'uncommon'])
        .eq('is_active', true)

      if (petsError) {
        console.error('Error loading starter pets:', petsError)
      } else if (pets && pets.length > 0) {
        const randomPet = pets[Math.floor(Math.random() * pets.length)]
        const { error: petError } = await supabase.from('user_pets').insert({
          user_id: userId,
          pet_id: randomPet.id,
          is_active: true
        })
        if (petError) {
          console.error('Error giving starter pet:', petError)
        }
      }
    } catch (profileError) {
      console.error('Error creating user profile:', profileError)
    }
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
      await setupNewUserProfile(data.user.id, { email: data.user.email, fullName, username, courseId })
    }

    return { data, error }
  }

  // Lets a visitor use the app (browse courses, do exercises, earn XP) without an
  // account. It's a real Supabase auth session (auth.uid() works, RLS applies normally) -
  // just flagged is_anonymous so it can be upgraded in place later via convertAnonymousAccount.
  const signInAnonymously = async () => {
    const { data, error } = await supabase.auth.signInAnonymously()

    if (data?.user && !error) {
      const placeholderEmail = `guest_${data.user.id}@ielts-anon.local`
      await setupNewUserProfile(data.user.id, {
        email: placeholderEmail,
        fullName: 'Khách',
        username: null,
        courseId: null
      })
      window.location.reload()
    }

    return { data, error }
  }

  // Upgrades the current anonymous session into a real account in place: same user id,
  // same progress/XP/pet - just adds a real email+password so they can log back in later.
  const convertAnonymousAccount = async (email, password, fullName, username) => {
    const { data, error } = await supabase.auth.updateUser({
      email,
      password,
      data: { full_name: fullName }
    })

    if (data?.user && !error) {
      const { error: profileError } = await supabase
        .from('users')
        .update({ email, full_name: fullName, username: username || null })
        .eq('id', data.user.id)

      if (profileError) {
        console.error('Error updating user profile after conversion:', profileError)
      }
      window.location.reload()
    }

    return { data, error }
  }

  const signOut = async () => {
    // Guests can't sign out: signing back in as a guest would create a new orphan user row.
    if (user?.is_anonymous) return { error: new Error('Guests cannot sign out') }
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

      const merged = Object.freeze({ ...userResult.data, ...(equipResult.data || {}) })
      setProfile(merged)
      return { data: merged, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  const isAdmin = () => {
    // profile.role is the only trustworthy source - it's RLS/trigger-protected server-side.
    // user_metadata is client-settable via supabase.auth.updateUser() and must never be trusted.
    return profile?.role === 'admin'
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
    signInAnonymously,
    convertAnonymousAccount,
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
