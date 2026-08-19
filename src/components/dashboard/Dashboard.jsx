import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabase/client'
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getRecentExercise } from '../../utils/recentExercise'
import RecentActivities from './RecentActivities'
import TournamentWidget from './TournamentWidget'
import AvatarWithFrame from '../ui/AvatarWithFrame'
import PetDisplay from '../pet/PetDisplay'
import PvPChallengeModal from '../pvp/PvPChallengeModal'
import { FEATURES } from '../../config/features'
import { fetchPvpSchedule, checkPvpAvailability } from '../../utils/pvpSchedule'

import { assetUrl, useBranding } from '../../hooks/useBranding';
import { usePermissions } from '../../hooks/usePermissions';
import { CheckCircle, Clock, XCircle, ChevronDown } from 'lucide-react';

// Collapsible student exercise stats for latest session — only fetches on first open
const CourseStatsSection = ({ courseId }) => {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [latestSession, setLatestSession] = useState(null);
  const [studentList, setStudentList] = useState([]);
  const [totalEx, setTotalEx] = useState(0);

  const handleToggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (loaded) return;

    setLoading(true);
    try {
      // 1. Get units
      const { data: units } = await supabase
        .from('units').select('id').eq('course_id', courseId);
      if (!units?.length) { setLoading(false); return; }

      // 2. Get all active non-test sessions (sorted by session_number desc)
      const { data: allSessions } = await supabase
        .from('sessions')
        .select('id, title, session_number, assigned_student_id')
        .in('unit_id', units.map(u => u.id))
        .eq('is_active', true)
        .neq('is_test', true)
        .order('session_number', { ascending: false });
      if (!allSessions?.length) { setLoading(false); return; }

      // Latest shared (non-personal) session
      const latestShared = allSessions.find(s => !s.assigned_student_id);
      setLatestSession(latestShared || allSessions[0]);

      // Latest personal session per student (highest session_number)
      const latestPersonalByStudent = {};
      for (const s of allSessions) {
        if (s.assigned_student_id && !latestPersonalByStudent[s.assigned_student_id]) {
          latestPersonalByStudent[s.assigned_student_id] = s;
        }
      }

      // Collect session IDs: latest shared + latest personal per student
      const relevantSessions = [];
      if (latestShared) relevantSessions.push(latestShared);
      for (const s of Object.values(latestPersonalByStudent)) relevantSessions.push(s);
      const sessionIds = relevantSessions.map(s => s.id);

      // 3. Exercises for these sessions
      const { data: assignments } = await supabase
        .from('exercise_assignments')
        .select('exercise_id, session_id')
        .in('session_id', sessionIds);
      if (!assignments?.length) { setLoading(false); return; }

      // Shared exercise IDs (from the latest shared session)
      const sharedSessionId = latestShared?.id;
      const sharedExerciseIds = Array.from(new Set(
        assignments.filter(a => a.session_id === sharedSessionId).map(a => a.exercise_id)
      ));

      // Personal exercises grouped by student (from their latest personal session)
      const sessionToStudent = {};
      for (const s of Object.values(latestPersonalByStudent)) {
        sessionToStudent[s.id] = s.assigned_student_id;
      }
      const personalExByStudent = {};
      for (const a of assignments) {
        const studentId = sessionToStudent[a.session_id];
        if (studentId) {
          if (!personalExByStudent[studentId]) personalExByStudent[studentId] = new Set();
          personalExByStudent[studentId].add(a.exercise_id);
        }
      }

      setTotalEx(sharedExerciseIds.length);

      // 4. Enrolled students
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('student_id, student:users!student_id(id, full_name, real_name)')
        .eq('course_id', courseId)
        .eq('is_active', true);
      const studentMap = {};
      (enrollments || []).forEach(e => {
        const personalSet = personalExByStudent[e.student_id];
        const personalCount = personalSet ? personalSet.size : 0;
        studentMap[e.student_id] = {
          id: e.student_id,
          name: e.student?.real_name || e.student?.full_name || 'Unknown',
          completed: 0,
          total: sharedExerciseIds.length + personalCount
        };
      });

      // 5. Progress for all exercises (shared + personal)
      const allExerciseIds = Array.from(new Set(assignments.map(a => a.exercise_id)));
      const studentIds = Object.keys(studentMap);
      if (studentIds.length && allExerciseIds.length) {
        const { data: progress } = await supabase
          .from('user_progress')
          .select('user_id, exercise_id, status')
          .in('user_id', studentIds)
          .in('exercise_id', allExerciseIds);
        (progress || []).forEach(p => {
          if (p.status === 'completed' && studentMap[p.user_id]) {
            // Only count if it's a shared exercise or this student's personal exercise
            const isShared = sharedExerciseIds.includes(p.exercise_id);
            const isPersonal = personalExByStudent[p.user_id]?.has(p.exercise_id);
            if (isShared || isPersonal) {
              studentMap[p.user_id].completed++;
            }
          }
        });
      }

      setStudentList(Object.values(studentMap).sort((a, b) => b.completed - a.completed));
      setLoaded(true);
    } catch (err) {
      console.error('Error fetching course stats:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 rounded-b-lg overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full px-3 py-1.5 flex items-center justify-between text-[11px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <span>{latestSession ? latestSession.title : 'Student Progress'}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-2">
          {loading ? (
            <div className="text-xs text-gray-400 py-2 text-center">Loading...</div>
          ) : studentList.length > 0 ? (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {studentList.map(s => {
                const sTotal = s.total ?? totalEx;
                return (
                  <div key={s.id} className="flex items-center gap-1.5 text-xs">
                    {s.completed === sTotal ? (
                      <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                    ) : s.completed > 0 ? (
                      <Clock className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-3 h-3 text-gray-300 flex-shrink-0" />
                    )}
                    <span className="text-gray-700 truncate flex-1">{s.name}</span>
                    <span className={`font-medium whitespace-nowrap ${
                      s.completed === sTotal ? 'text-green-600' : s.completed > 0 ? 'text-yellow-600' : 'text-gray-400'
                    }`}>
                      {s.completed}/{sTotal}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-gray-400 py-1">No data</div>
          )}
        </div>
      )}
    </div>
  );
};
const Dashboard = () => {
  const { profile } = useAuth()
  const { branding } = useBranding()
  const { canCreateContent } = usePermissions()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [recent, setRecent] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [courseProgress, setCourseProgress] = useState({})
  const [onlineUsers, setOnlineUsers] = useState([])
  const [offlineUsers, setOfflineUsers] = useState([])
  const [challengeTarget, setChallengeTarget] = useState(null)
  const [pendingChallengeUserIds, setPendingChallengeUserIds] = useState({})
  const [pvpAvailable, setPvpAvailable] = useState(true)
  const [courseCompletion, setCourseCompletion] = useState({})
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  )
  const [tickedCourses, setTickedCourses] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('teacher_ticked_courses') || '{}');
      const now = Date.now();
      const filtered = {};
      for (const [id, ts] of Object.entries(stored)) {
        if (now - ts < 3 * 24 * 60 * 60 * 1000) filtered[id] = ts;
      }
      if (Object.keys(filtered).length !== Object.keys(stored).length) {
        localStorage.setItem('teacher_ticked_courses', JSON.stringify(filtered));
      }
      return filtered;
    } catch { return {}; }
  })
  const navigate = useNavigate()

  // Track desktop breakpoint for avatar sizing
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    const handler = (e) => setIsDesktop(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // Check PvP schedule
  useEffect(() => {
    const checkSchedule = async () => {
      const schedule = await fetchPvpSchedule()
      const result = checkPvpAvailability(schedule)
      setPvpAvailable(result.available)
    }
    checkSchedule()
    const scheduleInterval = setInterval(checkSchedule, 60000)
    return () => clearInterval(scheduleInterval)
  }, [])

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Fetch online + recently offline users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data, error } = await supabase
          .from('users')
          .select('id, full_name, avatar_url, last_seen_at, user_equipment(active_title, active_frame_ratio, hide_frame)')
          .gte('last_seen_at', twentyFourHoursAgo)
          .order('last_seen_at', { ascending: false })
          .limit(40)
        if (!error && data) {
          const flat = data.map(u => {
            const { user_equipment, ...rest } = u
            return { ...rest, ...user_equipment }
          })
          const online = []
          const offline = []
          flat.forEach(u => {
            if (u.last_seen_at >= fiveMinutesAgo) {
              online.push(u)
            } else {
              offline.push(u)
            }
          })
          setOnlineUsers(online)
          setOfflineUsers(offline)
        }
      } catch (err) {
        console.error('Error fetching online users:', err)
      }
    }
    fetchUsers()
    const interval = setInterval(fetchUsers, 60000)
    return () => clearInterval(interval)
  }, [])

  // Fetch pending PvP challenges
  useEffect(() => {
    if (!profile?.id) return
    const fetchPending = async () => {
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('pvp_challenges')
        .select('challenger_id, opponent_id')
        .eq('status', 'pending')
        .gte('created_at', since)
        .or(`challenger_id.eq.${profile.id},opponent_id.eq.${profile.id}`)
      if (data) {
        const map = {}
        data.forEach(c => {
          if (c.challenger_id === profile.id) {
            map[c.opponent_id] = 'sent'
          } else {
            map[c.challenger_id] = 'received'
          }
        })
        setPendingChallengeUserIds(map)
      }
    }
    fetchPending()
    const interval = setInterval(fetchPending, 30000)
    return () => clearInterval(interval)
  }, [profile?.id])

  // Fetch courses data
  useEffect(() => {
    if (profile) {
      fetchCourses()
      if (profile.role === 'user') {
        fetchMostRecentExercise()
        fetchCourseProgress()
      } else {
        setRecent(getRecentExercise())
      }
    }
  }, [profile])

  const fetchCourses = async () => {
    try {
      setLoading(true)

      // For students, only show enrolled courses. For admins/teachers, show all courses.
      if (profile?.role === 'user') {
        // Student: fetch only enrolled courses
        const { data, error } = await supabase
          .from('course_enrollments')
          .select(`
            courses (
              id,
              title,
              description,
              thumbnail_url,
              level_number,
              difficulty_label,
              color_theme,
              is_active
            )
          `)
          .eq('student_id', profile.id)
          .eq('is_active', true)
          .eq('courses.is_active', true)
          .order('level_number', { foreignTable: 'courses' })

        if (error) throw error

        // Extract courses from the enrollment data
        const enrolledCourses = data?.map(enrollment => enrollment.courses).filter(Boolean) || []
        console.log('Fetched enrolled courses:', enrolledCourses)
        setCourses(enrolledCourses)
      } else if (profile?.role === 'teacher') {
        // Teacher: fetch only assigned courses
        const { data, error } = await supabase
          .from('course_teachers')
          .select(`
            courses (
              id,
              title,
              description,
              thumbnail_url,
              level_number,
              difficulty_label,
              color_theme,
              is_active
            )
          `)
          .eq('teacher_id', profile.id)
          .eq('courses.is_active', true)
          .order('level_number', { foreignTable: 'courses' })

        if (error) throw error

        // Extract courses from the teacher assignments
        const assignedCourses = data?.map(assignment => assignment.courses).filter(Boolean) || []
        console.log('Fetched assigned courses for teacher:', assignedCourses)
        setCourses(assignedCourses)
        fetchCourseCompletion(assignedCourses)
      } else {
        // Admin: fetch all courses
        let { data, error } = await supabase
          .from('courses')
          .select(`
            id,
            title,
            description,
            thumbnail_url,
            level_number,
            difficulty_label,
            color_theme,
            is_active
          `)
          .eq('is_active', true)
          .order('level_number')

        // If courses table doesn't exist, try levels table as fallback
        if (error && error.code === 'PGRST205') {
          console.log('Courses table not found, trying levels table...')
          const fallback = await supabase
            .from('levels')
            .select(`
              id,
              title,
              description,
              thumbnail_url,
              level_number,
              difficulty_label,
              color_theme,
              is_active
            `)
            .eq('is_active', true)
            .order('level_number')

          data = fallback.data
          error = fallback.error
        }

        if (error) throw error
        console.log('Fetched all courses:', data)
        setCourses(data || [])
      }
    } catch (error) {
      console.error('Error fetching courses:', error)
      setCourses([])
    } finally {
      setLoading(false)
    }
  }

  const fetchMostRecentExercise = async () => {
    try {
      // 1. Get student's enrolled courses
      const { data: enrollments, error: enrollError } = await supabase
        .from('course_enrollments')
        .select('course_id')
        .eq('student_id', profile.id)
        .eq('is_active', true)

      if (enrollError) throw enrollError
      if (!enrollments || enrollments.length === 0) return

      const courseIds = enrollments.map(e => e.course_id)

      // 2. Get all units from these courses, ordered by unit_number DESC
      const { data: units, error: unitsError } = await supabase
        .from('units')
        .select('id, course_id, unit_number, title')
        .in('course_id', courseIds)
        .eq('is_active', true)
        .order('unit_number', { ascending: false })

      if (unitsError) throw unitsError
      if (!units || units.length === 0) return

      // 3. Get all sessions from ALL units, ordered by unit_number DESC, session_number DESC
      const unitIds = units.map(u => u.id)
      const { data: allSessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, unit_id, session_number, title')
        .in('unit_id', unitIds)
        .eq('is_active', true)
        .order('session_number', { ascending: false })

      if (sessionsError) throw sessionsError
      if (!allSessions || allSessions.length === 0) return

      // Sort sessions by unit order first, then session number
      const unitOrderMap = new Map(units.map((u, idx) => [u.id, idx]))
      const sortedSessions = allSessions.sort((a, b) => {
        const unitOrderA = unitOrderMap.get(a.unit_id)
        const unitOrderB = unitOrderMap.get(b.unit_id)
        if (unitOrderA !== unitOrderB) return unitOrderA - unitOrderB
        return b.session_number - a.session_number
      })

      // 4. Get student's progress for all exercises
      const { data: userProgress, error: progressError } = await supabase
        .from('user_progress')
        .select('exercise_id, status')
        .eq('user_id', profile.id)

      if (progressError) throw progressError

      const completedExercises = new Set(
        (userProgress || [])
          .filter(p => p.status === 'completed')
          .map(p => p.exercise_id)
      )

      // 5. Find first session with incomplete exercises
      let targetSession = null
      let targetUnit = null

      for (const session of sortedSessions) {
        // Get exercises from this session
        const { data: assignments, error: assignmentsError } = await supabase
          .from('exercise_assignments')
          .select(`
            exercise_id,
            exercises (
              id,
              title,
              exercise_type,
              content
            )
          `)
          .eq('session_id', session.id)
          .order('order_index', { ascending: true })

        if (assignmentsError) continue
        if (!assignments || assignments.length === 0) continue

        // Check if there are any incomplete exercises
        const hasIncomplete = assignments.some(a => !completedExercises.has(a.exercise_id))

        if (hasIncomplete) {
          targetSession = session
          targetUnit = units.find(u => u.id === session.unit_id)
          break
        }
      }

      // If no incomplete session found, default to the latest session
      if (!targetSession) {
        targetSession = sortedSessions[0]
        targetUnit = units.find(u => u.id === targetSession.unit_id)
      }

      if (!targetSession || !targetUnit) return

      // 6. Build the navigation path
      const continuePath = `/study/course/${targetUnit.course_id}/unit/${targetUnit.id}/session/${targetSession.id}`

      setRecent({
        id: targetSession.id,
        title: `${targetUnit.title} - ${targetSession.title}`,
        imageUrl: null,
        continuePath
      })

    } catch (error) {
      console.error('Error fetching most recent exercise:', error)
    }
  }

  const fetchCourseProgress = async () => {
    try {
      if (!profile?.id) return

      // Get all user progress
      const { data: userProgress, error: progressError } = await supabase
        .from('user_progress')
        .select('exercise_id, status')
        .eq('user_id', profile.id)

      if (progressError) throw progressError

      const completedExerciseIds = new Set(
        (userProgress || [])
          .filter(p => p.status === 'completed')
          .map(p => p.exercise_id)
      )

      // Get all courses
      const { data: enrollments, error: enrollError } = await supabase
        .from('course_enrollments')
        .select('course_id')
        .eq('student_id', profile.id)
        .eq('is_active', true)

      if (enrollError) throw enrollError

      const courseIds = enrollments?.map(e => e.course_id) || []
      if (courseIds.length === 0) return

      // For each course, get total exercises and calculate progress
      const progressData = {}

      for (const courseId of courseIds) {
        // Get all units for this course
        const { data: units, error: unitsError } = await supabase
          .from('units')
          .select('id')
          .eq('course_id', courseId)
          .eq('is_active', true)

        if (unitsError) continue
        if (!units || units.length === 0) continue

        const unitIds = units.map(u => u.id)

        // Get all sessions for these units
        const { data: sessions, error: sessionsError } = await supabase
          .from('sessions')
          .select('id')
          .in('unit_id', unitIds)
          .eq('is_active', true)

        if (sessionsError) continue
        if (!sessions || sessions.length === 0) continue

        const sessionIds = sessions.map(s => s.id)

        // Get all exercises for these sessions
        const { data: assignments, error: assignError } = await supabase
          .from('exercise_assignments')
          .select('exercise_id')
          .in('session_id', sessionIds)

        if (assignError) continue
        if (!assignments || assignments.length === 0) continue

        const totalExercises = assignments.length
        const completedCount = assignments.filter(a =>
          completedExerciseIds.has(a.exercise_id)
        ).length

        progressData[courseId] = {
          total: totalExercises,
          completed: completedCount,
          percentage: totalExercises > 0 ? Math.round((completedCount / totalExercises) * 100) : 0
        }
      }

      setCourseProgress(progressData)

    } catch (error) {
      console.error('Error fetching course progress:', error)
    }
  }

  const fetchCourseCompletion = async (courseList) => {
    try {
      if (profile?.role !== 'teacher') return
      const result = {}

      for (const course of courseList) {
        const { data: units } = await supabase.from('units').select('id').eq('course_id', course.id)
        const unitIds = (units || []).map(u => u.id)
        if (!unitIds.length) continue

        const { data: sessions } = await supabase
          .from('sessions').select('id, assigned_student_id')
          .in('unit_id', unitIds).neq('is_test', true)
        if (!sessions?.length) continue

        const sessionPersonalMap = {}
        sessions.forEach(s => { if (s.assigned_student_id) sessionPersonalMap[s.id] = s.assigned_student_id })

        const { data: assignments } = await supabase
          .from('exercise_assignments').select('exercise_id, session_id')
          .in('session_id', sessions.map(s => s.id))
        if (!assignments?.length) continue

        const sharedExerciseIds = [...new Set(assignments.filter(a => !sessionPersonalMap[a.session_id]).map(a => a.exercise_id))]
        const personalByStudent = {}
        assignments.forEach(a => {
          const sid = sessionPersonalMap[a.session_id]
          if (sid) { (personalByStudent[sid] ||= new Set()).add(a.exercise_id) }
        })

        const { data: enrollments } = await supabase
          .from('course_enrollments').select('student_id')
          .eq('course_id', course.id).eq('is_active', true)
        if (!enrollments?.length) continue

        const studentIds = enrollments.map(e => e.student_id)
        const allExIds = [...new Set(assignments.map(a => a.exercise_id))]

        const { data: progress } = await supabase
          .from('user_progress').select('user_id, exercise_id, status')
          .in('user_id', studentIds).in('exercise_id', allExIds)

        let totalCompletion = 0
        studentIds.forEach(sid => {
          const personal = personalByStudent[sid]
          const studentExIds = personal ? [...sharedExerciseIds, ...personal] : sharedExerciseIds
          if (!studentExIds.length) return
          const completed = (progress || []).filter(p => p.user_id === sid && p.status === 'completed' && studentExIds.includes(p.exercise_id)).length
          totalCompletion += Math.round((completed / studentExIds.length) * 100)
        })

        result[course.id] = {
          avg: studentIds.length > 0 ? Math.round(totalCompletion / studentIds.length) : 0,
          students: studentIds.length
        }
      }
      setCourseCompletion(result)
    } catch (err) { console.error('Error fetching course completion:', err) }
  }

  // Get greeting message based on Vietnam time
  const getGreetingMessage = () => {
    // Get Vietnam hour
    const vietnamHour = parseInt(new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      hour12: false
    }))

    if (vietnamHour >= 5 && vietnamHour < 12) {
      return "Buổi sáng vui vẻ, học thôi nào! 🌅"
    } else if (vietnamHour >= 12 && vietnamHour < 18) {
      return "Buổi chiều vui vẻ, học thôi nào! ☀️"
    } else {
      return "Buổi tối vui vẻ, học thôi nào! 🌙"
    }
  }

  return (
    <div className="space-y-8 md:pt-8">
      {/* Header with Blue Background */}
      <div className="relative -mx-4 md:-mx-6 lg:mx-0 -mt-6 md:-mt-6 lg:-mt-6 -mb-4 md:-mb-6 lg:mb-0">
        {/* Background Image */}
        <div className="relative h-48 md:h-56 overflow-hidden bg-gradient-to-r from-blue-600 to-purple-600"
          style={{ clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)' }}
        >
          {/* Corner brackets */}
          <div className="absolute top-0 left-[12px] w-5 h-[1px] bg-gradient-to-r from-white/40 to-transparent z-10" />
          <div className="absolute top-0 left-[12px] w-[1px] h-5 bg-gradient-to-b from-white/40 to-transparent z-10" />
          <div className="absolute bottom-0 right-[12px] w-5 h-[1px] bg-gradient-to-l from-white/40 to-transparent z-10" />
          <div className="absolute bottom-0 right-[12px] w-[1px] h-5 bg-gradient-to-t from-white/40 to-transparent z-10" />

          {/* Background Image */}
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${branding.heroImageUrl})` }}
          />
          {/* Dark overlay for better text readability */}
          <div className="absolute inset-0 bg-black/30" />

          {/* Content overlay */}
          <div className="absolute inset-0 flex flex-col justify-between p-6">
            {/* XP and Streak stats */}
            <div className="flex justify-between">
              <div className="bg-white/90 backdrop-blur-sm px-4 py-1 flex items-center space-x-2"
                style={{ clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)' }}
              >
                <img src={assetUrl('/icon/profile/streak.svg')} alt="Streak" className="w-5 h-5" />
                <span className="font-semibold text-red-500">{profile?.streak_count || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-white/90 backdrop-blur-sm px-4 py-2 flex items-center space-x-2"
                  style={{ clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)' }}
                >
                  <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-5 h-5" />
                  <span className="font-semibold text-gray-800">{profile?.xp || 0}</span>
                </div>
                <div className="bg-white/90 backdrop-blur-sm px-4 py-2 flex items-center space-x-2"
                  style={{ clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)' }}
                >
                  <img src={assetUrl('/image/study/gem.png')} alt="Gems" className="w-5 h-5" />
                  <span className="font-semibold text-gray-800">{profile?.gems || 0}</span>
                </div>
              </div>
            </div>

            {/* Welcome text with avatar */}
            <div className="text-white mt-5">
              <div className="flex items-center space-x-4 mb-4">
                <AvatarWithFrame
                  avatarUrl={profile?.avatar_url}
                  frameUrl={profile?.hide_frame ? null : profile?.active_title}
                  frameRatio={profile?.active_frame_ratio}
                  size={isDesktop ? 110 : 86}
                  fallback={profile?.full_name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || 'U'}
                  onClick={() => navigate(`/profile/${profile?.id}?avatarSelector=true`)}
                />
                <div>
                  <h5 className="text-2xl md:text-3xl font-bold drop-shadow-lg">
                    Chào {profile?.full_name || 'Học viên'}! 👋
                  </h5>
                  <div className="h-[2px] w-20 bg-gradient-to-r from-white/50 to-transparent mt-1 mb-1" />
                  <p className="text-base md:text-lg opacity-90 drop-shadow-md max-w-2xl">
                    {getGreetingMessage()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>



      {/* Online Users - Messenger style */}
      {(onlineUsers.length > 0 || offlineUsers.length > 0) && (
        <div className="xl:hidden">
          <div className="flex overflow-x-auto gap-4 pb-2 px-1 scrollbar-hide">
            {[...onlineUsers].sort((a, b) => {
              const aP = pendingChallengeUserIds[a.id] === 'received' ? 0 : pendingChallengeUserIds[a.id] === 'sent' ? 1 : 2
              const bP = pendingChallengeUserIds[b.id] === 'received' ? 0 : pendingChallengeUserIds[b.id] === 'sent' ? 1 : 2
              return aP - bP
            }).map((u) => (
              <button
                key={u.id}
                onClick={() => (u.id === profile?.id || profile?.is_banned || u.role === 'admin') ? navigate(`/profile/${u.id}`) : setChallengeTarget(u)}
                className="flex flex-col items-center flex-shrink-0 w-16"
              >
                <div className="relative">
                  <AvatarWithFrame
                    avatarUrl={u.avatar_url}
                    frameUrl={u.hide_frame ? null : u.active_title}
                    frameRatio={u.active_frame_ratio}
                    size={56}
                    fallback={u.full_name?.[0]?.toUpperCase() || '?'}
                  />
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white z-10" />
                  {pvpAvailable && !profile?.is_banned && u.role !== 'admin' && pendingChallengeUserIds[u.id] === 'received' && (
                    <img src={assetUrl('/icon/dashboard/pvp.png')} alt="PvP" className="absolute top-0 right-0 w-4 h-4 animate-pulse" />
                  )}
                  {pvpAvailable && !profile?.is_banned && u.role !== 'admin' && pendingChallengeUserIds[u.id] === 'sent' && (
                    <img src={assetUrl('/icon/dashboard/pvp.png')} alt="PvP" className="absolute top-0 right-0 w-4 h-4 opacity-50" />
                  )}
                </div>
                <span className="text-xs text-gray-600 mt-1 text-center truncate w-full">{u.full_name?.split(' ').pop() || 'N/A'}</span>
              </button>
            ))}
            {offlineUsers.length > 0 && onlineUsers.length > 0 && (
              <div className="flex items-center flex-shrink-0 px-1">
                <div className="w-px h-10 bg-gray-200" />
              </div>
            )}
            {[...offlineUsers].sort((a, b) => {
              const aP = pendingChallengeUserIds[a.id] === 'received' ? 0 : pendingChallengeUserIds[a.id] === 'sent' ? 1 : 2
              const bP = pendingChallengeUserIds[b.id] === 'received' ? 0 : pendingChallengeUserIds[b.id] === 'sent' ? 1 : 2
              return aP - bP
            }).map((u) => (
              <button
                key={u.id}
                onClick={() => (u.id === profile?.id || profile?.is_banned || u.role === 'admin') ? navigate(`/profile/${u.id}`) : setChallengeTarget(u)}
                className="flex flex-col items-center flex-shrink-0 w-16 opacity-50"
              >
                <div className="relative grayscale">
                  <AvatarWithFrame
                    avatarUrl={u.avatar_url}
                    frameUrl={u.hide_frame ? null : u.active_title}
                    frameRatio={u.active_frame_ratio}
                    size={56}
                    fallback={u.full_name?.[0]?.toUpperCase() || '?'}
                  />
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-gray-400 rounded-full border-2 border-white z-10" />
                  {pvpAvailable && !profile?.is_banned && u.role !== 'admin' && pendingChallengeUserIds[u.id] === 'received' && (
                    <img src={assetUrl('/icon/dashboard/pvp.png')} alt="PvP" className="absolute top-0 right-0 w-4 h-4 animate-pulse" />
                  )}
                  {pvpAvailable && !profile?.is_banned && u.role !== 'admin' && pendingChallengeUserIds[u.id] === 'sent' && (
                    <img src={assetUrl('/icon/dashboard/pvp.png')} alt="PvP" className="absolute top-0 right-0 w-4 h-4 opacity-50" />
                  )}
                </div>
                <span className="text-xs text-gray-400 mt-1 text-center truncate w-full">{u.full_name?.split(' ').pop() || 'N/A'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PvP Challenge Modal */}
      {challengeTarget && (
        <PvPChallengeModal
          opponent={challengeTarget}
          onClose={() => setChallengeTarget(null)}
        />
      )}

      {/* Recent Exercise (Above Levels List) */}
      {recent && (
        <div className="relative bg-white border border-gray-200 p-4 shadow-sm overflow-hidden"
          style={{ clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)' }}
        >
          {/* Corner brackets */}
          <div className="absolute top-0 left-[10px] w-5 h-[1px] bg-gradient-to-r from-blue-300/40 to-transparent" />
          <div className="absolute top-0 left-[10px] w-[1px] h-5 bg-gradient-to-b from-blue-300/40 to-transparent" />
          <div className="absolute bottom-0 right-[10px] w-5 h-[1px] bg-gradient-to-l from-blue-300/40 to-transparent" />
          <div className="absolute bottom-0 right-[10px] w-[1px] h-5 bg-gradient-to-t from-blue-300/40 to-transparent" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-100 overflow-hidden flex items-center justify-center"
                style={{ clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)' }}
              >
                {recent.imageUrl ? (
                  <img src={recent.imageUrl} alt={recent.title} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl">📘</span>
                )}
              </div>
              <div>
                <div className="text-sm text-blue-600 font-semibold uppercase tracking-wide">Bài gần nhất</div>
                <div className="font-medium text-gray-500">{recent.title}</div>
              </div>
            </div>
            <button
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold px-5 py-2 shadow-md hover:shadow-lg transition-all active:scale-95"
              style={{
                clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
                animation: 'scalePulse 2s ease-in-out infinite',
                backfaceVisibility: 'hidden',
                WebkitFontSmoothing: 'antialiased'
              }}
              onMouseEnter={(e) => e.currentTarget.style.animation = 'none'}
              onMouseLeave={(e) => e.currentTarget.style.animation = 'scalePulse 2s ease-in-out infinite'}
              onClick={() => navigate(recent.continuePath)}
            >
              Tiếp tục✨
            </button>
            <style>{`
              @keyframes scalePulse {
                0%, 100% { transform: scale(1) translateZ(0); }
                50% { transform: scale(1.05) translateZ(0); }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* Pet Display - Full width */}
      {FEATURES.pets && profile && (
        <div className="mb-6 mt-6">
          <PetDisplay />
        </div>
      )}

      {/* Tournament + Recent Activities - Side by side on PC */}
      {(profile?.role === 'user' || profile?.role === 'admin' || profile?.role === 'teacher') && (
        <div className={`grid grid-cols-1 ${FEATURES.tournaments ? 'lg:grid-cols-3' : ''} gap-6 mb-6 mt-10`}>
          {FEATURES.tournaments && (
            <div className="lg:col-span-2 overflow-visible">
              <TournamentWidget />
            </div>
          )}
          <div className="self-start">
            <RecentActivities />
          </div>
        </div>
      )}

      {/* Non-student fallback: just Recent Activities */}
      {profile?.role !== 'user' && profile?.role !== 'admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-1">
            <RecentActivities />
          </div>
        </div>
      )}

      {/* Courses List */}
      <div>
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 mt-2">Đang tải...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
              {courses.map((course) => {
                const isLocked = !course.is_active

                const CourseCard = () => (
                  <div className={`relative bg-white border border-gray-200 shadow-sm transition-all duration-200 overflow-hidden ${
                    isLocked
                      ? 'opacity-60 cursor-not-allowed'
                      : 'hover:shadow-lg'
                  }`}
                    style={{ clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)' }}
                  >
                    {/* Teacher tick */}
                    {profile?.role === 'teacher' && (
                      <button
                        className="absolute top-1 right-1 z-20 p-1"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTickedCourses(prev => {
                            const next = { ...prev };
                            if (next[course.id]) {
                              delete next[course.id];
                            } else {
                              next[course.id] = Date.now();
                            }
                            localStorage.setItem('teacher_ticked_courses', JSON.stringify(next));
                            return next;
                          });
                        }}
                      >
                        <CheckCircle
                          size={22}
                          className={tickedCourses[course.id] ? 'text-green-500' : 'text-white/50'}
                        />
                      </button>
                    )}

                    {/* Corner brackets */}
                    <div className="absolute top-0 left-[10px] w-5 h-[1px] bg-gradient-to-r from-blue-300/40 to-transparent z-10" />
                    <div className="absolute top-0 left-[10px] w-[1px] h-5 bg-gradient-to-b from-blue-300/40 to-transparent z-10" />
                    <div className="absolute bottom-0 right-[10px] w-5 h-[1px] bg-gradient-to-l from-blue-300/40 to-transparent z-10" />
                    <div className="absolute bottom-0 right-[10px] w-[1px] h-5 bg-gradient-to-t from-blue-300/40 to-transparent z-10" />

                    {/* Course Image with Text Overlay */}
                    <div className="aspect-[1.8/1] bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center relative">
                      {course.thumbnail_url ? (
                        <img
                          src={course.thumbnail_url}
                          alt={course.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-4xl">
                          {course.level_number === 1 ? '🌱' :
                           course.level_number === 2 ? '📚' :
                           course.level_number === 3 ? '🏆' : '🎯'}
                        </div>
                      )}
                      
                      {/* Teacher Circular Completion */}
                      {profile?.role === 'teacher' && courseCompletion[course.id] && (() => {
                        const pct = courseCompletion[course.id].avg
                        const r = 18, c = 2 * Math.PI * r
                        return (
                          <div className="absolute bottom-2 left-2 z-10">
                            <svg width="48" height="48" className="drop-shadow">
                              <circle cx="24" cy="24" r={r} fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                              <circle cx="24" cy="24" r={r} fill="none"
                                stroke={pct >= 70 ? '#22c55e' : pct >= 30 ? '#eab308' : '#ef4444'}
                                strokeWidth="3" strokeLinecap="round"
                                strokeDasharray={c} strokeDashoffset={c - (c * pct / 100)}
                                transform="rotate(-90 24 24)"
                              />
                              <text x="24" y="25" textAnchor="middle" dominantBaseline="middle"
                                className="text-[10px] font-bold fill-white"
                              >{pct}%</text>
                            </svg>
                          </div>
                        )
                      })()}

                      {/* Lock Overlay */}
                      {isLocked && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                          <div className="text-center text-white">
                            <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                           
                          </div>
                        </div>
                      )}

                    </div>

                    {/* Progress Bar */}
                    {!isLocked && profile?.role === 'user' && courseProgress[course.id] && (
                      <div className="px-3 py-2 bg-gray-50 mb-1">
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>Tiến độ</span>
                          <span className="font-semibold">{courseProgress[course.id].percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 h-2 overflow-hidden"
                          style={{ clipPath: 'polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)' }}
                        >
                          <div
                            className={`h-full transition-all duration-500 ${
                              courseProgress[course.id].percentage < 30
                                ? 'bg-red-500'
                                : courseProgress[course.id].percentage < 70
                                ? 'bg-yellow-500'
                                : 'bg-blue-700'
                            }`}
                            style={{ width: `${courseProgress[course.id].percentage}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )

                if (isLocked) {
                  return (
                    <div key={course.id} className="group">
                      <CourseCard />
                      {canCreateContent() && <CourseStatsSection courseId={course.id} />}
                    </div>
                  )
                }

                return (
                  <div key={course.id} className="group">
                    <Link
                      to={`/study/course/${course.id}`}
                    >
                      <CourseCard />
                    </Link>
                    {canCreateContent() && <CourseStatsSection courseId={course.id} />}
                  </div>
                )
              })}
            </div>
          )}
      </div>
    </div>
  )
}

export default Dashboard
