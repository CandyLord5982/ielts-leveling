import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase/client';
import { useAuth } from './useAuth';
import { usePermissions } from './usePermissions';

/**
 * Module-level cache: courseId -> { data, timestamp }
 * Shared across all component instances. Survives re-renders but not full page reloads.
 */
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// PostgREST caps rows per response and truncates silently — no error, just a
// short result. Course-wide queries here blow past that cap, so every one of
// them pages instead of assuming a single response holds everything.
const PAGE_SIZE = 500;

/**
 * Runs a query to exhaustion, paging past the row cap.
 * `buildQuery` must return a fresh query builder on each call.
 */
const fetchAllPages = async (buildQuery) => {
  const all = [];
  let from = 0;

  for (;;) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += rows.length;
  }

  return all;
};

/**
 * Hook that fetches and caches class-wide stats for a course.
 * Returns session-level AND exercise-level completion data with student details.
 *
 * Only fetches for teachers/admins. Students get null (no wasted queries).
 * Multiple components calling this with the same courseId share one fetch.
 *
 * Usage:
 *   const { sessionStats, exerciseStats, totalStudents, loading, refresh } = useClassStats(courseId);
 *   // sessionStats[sessionId] = { completed, total, students: [{ id, name, status }] }
 *   // exerciseStats[exerciseId] = { completed, total, students: [{ id, name, status }] }
 */
const useClassStats = (courseId) => {
  const { user } = useAuth();
  const { canCreateContent } = usePermissions();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);

  const isTeacher = canCreateContent();

  const fetchStats = async (force = false) => {
    if (!courseId || !user || !isTeacher) return;

    // Check cache first
    if (!force) {
      const cached = cache.get(courseId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setData(cached.data);
        return;
      }
    }

    // Prevent concurrent fetches for the same course
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);

    try {
      // 1. Enrolled students with names — single query
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('course_enrollments')
        .select('student_id, student:users!student_id(id, full_name, real_name)')
        .eq('course_id', courseId)
        .eq('is_active', true);

      if (enrollmentsError) throw enrollmentsError;

      const studentMap = {};
      (enrollments || []).forEach(e => {
        studentMap[e.student_id] = e.student?.real_name || e.student?.full_name || 'Unknown';
      });
      const studentIds = Object.keys(studentMap);
      const totalStudents = studentIds.length;

      if (totalStudents === 0) {
        const empty = { totalStudents: 0, sessionStats: {}, exerciseStats: {} };
        cache.set(courseId, { data: empty, timestamp: Date.now() });
        setData(empty);
        return;
      }

      // 2. Units → Sessions — two queries
      const { data: units, error: unitsError } = await supabase
        .from('units')
        .select('id')
        .eq('course_id', courseId);

      if (unitsError) throw unitsError;
      const unitIds = (units || []).map(u => u.id);

      if (unitIds.length === 0) {
        const empty = { totalStudents, sessionStats: {}, exerciseStats: {} };
        cache.set(courseId, { data: empty, timestamp: Date.now() });
        setData(empty);
        return;
      }

      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id')
        .in('unit_id', unitIds);

      if (sessionsError) throw sessionsError;
      const sessionIds = (sessions || []).map(s => s.id);

      if (sessionIds.length === 0) {
        const empty = { totalStudents, sessionStats: {}, exerciseStats: {} };
        cache.set(courseId, { data: empty, timestamp: Date.now() });
        setData(empty);
        return;
      }

      // 3. All exercise assignments across the course
      const assignments = await fetchAllPages(() =>
        supabase
          .from('exercise_assignments')
          .select('session_id, exercise_id')
          .in('session_id', sessionIds)
      );

      const sessionExercises = {};
      const allExerciseIds = new Set();
      (assignments || []).forEach(a => {
        if (!sessionExercises[a.session_id]) sessionExercises[a.session_id] = [];
        sessionExercises[a.session_id].push(a.exercise_id);
        allExerciseIds.add(a.exercise_id);
      });

      const exerciseIdArray = [...allExerciseIds];

      if (exerciseIdArray.length === 0) {
        const empty = { totalStudents, sessionStats: {}, exerciseStats: {} };
        cache.set(courseId, { data: empty, timestamp: Date.now() });
        setData(empty);
        return;
      }

      // 4. All user progress — the big one. Chunk the exercise ids so the GET url
      // stays well short of its length limit, and page within each chunk.
      const chunkSize = Math.max(1, Math.floor(PAGE_SIZE / studentIds.length));
      const progress = [];

      for (let i = 0; i < exerciseIdArray.length; i += chunkSize) {
        const chunk = exerciseIdArray.slice(i, i + chunkSize);
        const rows = await fetchAllPages(() =>
          supabase
            .from('user_progress')
            .select('user_id, exercise_id, status, score, max_score')
            .in('user_id', studentIds)
            .in('exercise_id', chunk)
        );
        progress.push(...rows);
      }

      console.log(
        `📊 class stats: ${studentIds.length} students × ${exerciseIdArray.length} exercises → ${progress.length} progress rows`
      );

      // Build lookup: `userId-exerciseId` -> { status, score, max_score }
      const progressMap = {};
      progress.forEach(p => {
        progressMap[`${p.user_id}-${p.exercise_id}`] = {
          status: p.status,
          score: p.score,
          max_score: p.max_score
        };
      });

      // --- Compute exercise-level stats ---
      const exerciseStats = {};
      exerciseIdArray.forEach(exId => {
        const studentDetails = studentIds.map(studentId => {
          const prog = progressMap[`${studentId}-${exId}`];
          const score = prog?.max_score ? Math.round((prog.score / prog.max_score) * 100) : null;
          return {
            id: studentId,
            name: studentMap[studentId],
            status: prog?.status === 'completed' ? 'completed' : prog ? 'in_progress' : 'not_started',
            score
          };
        });
        const completed = studentDetails.filter(s => s.status === 'completed').length;
        exerciseStats[exId] = { completed, total: totalStudents, students: studentDetails };
      });

      // --- Compute session-level stats ---
      const sessionStats = {};
      sessionIds.forEach(sid => {
        const exercises = sessionExercises[sid] || [];
        const studentDetails = studentIds.map(studentId => {
          if (exercises.length === 0) {
            return { id: studentId, name: studentMap[studentId], status: 'not_started', completedExercises: 0, totalExercises: 0 };
          }
          const completedCount = exercises.filter(exId =>
            progressMap[`${studentId}-${exId}`]?.status === 'completed'
          ).length;
          const anyProgress = exercises.some(exId => progressMap[`${studentId}-${exId}`]);
          let status = 'not_started';
          if (completedCount === exercises.length) status = 'completed';
          else if (anyProgress) status = 'in_progress';
          return { id: studentId, name: studentMap[studentId], status, completedExercises: completedCount, totalExercises: exercises.length };
        });
        const completed = studentDetails.filter(s => s.status === 'completed').length;
        sessionStats[sid] = { completed, total: totalStudents, students: studentDetails };
      });

      const result = { totalStudents, sessionStats, exerciseStats };
      cache.set(courseId, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (error) {
      console.error('Error fetching class stats:', error);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    if (courseId && user && isTeacher) {
      // Use cache if available
      const cached = cache.get(courseId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setData(cached.data);
      } else {
        fetchStats();
      }
    }
  }, [courseId, user, isTeacher]);

  return {
    sessionStats: data?.sessionStats || null,
    exerciseStats: data?.exerciseStats || null,
    totalStudents: data?.totalStudents || 0,
    loading,
    refresh: () => fetchStats(true),
  };
};

export default useClassStats;
