import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../supabase/client";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import Button from "../ui/Button";
import AddUnitModal from "./modals/AddUnitModal";
import EditUnitModal from "./modals/EditUnitModal";
import AddSessionModal from "./modals/AddSessionModal";
import EditSessionModal from "./modals/EditSessionModal";
import { assetUrl } from '../../hooks/useBranding';
// Thay spinner bằng skeleton để điều hướng mượt hơn
import {
  ArrowLeft,
  Star,
  Lock,
  BookOpen,
  Flame,
  Plus,
  Edit,
  List,
  Trash2,
  FileText,
  BarChart3,
  ClipboardList,
  Swords,
  ChevronUp,
  ChevronDown,
  User,
  Users,
  Copy,
  Clock,
} from "lucide-react";
import StudentStatsPopover from "../ui/StudentStatsPopover";
import useClassStats from "../../hooks/useClassStats";
import useClassWar from "../../hooks/useClassWar";
import ClassWarPanel from "../classwar/ClassWarPanel";
import ClassWarBanner from "../classwar/ClassWarBanner";
import ClassWarModal from "../classwar/ClassWarModal";
import ClassWarSetupModal from "../classwar/ClassWarSetupModal";
import { FEATURES } from "../../config/features";

// Theme-based background images for unit cards
const getThemeBackground = (colorTheme) => {
  const themeBackgrounds = {
    blue: assetUrl('/image/theme_unit/ice.webp'),
    green: assetUrl('/image/theme_unit/forest.webp'),
    purple: assetUrl('/image/theme_unit/pirate.webp'),
    orange: assetUrl('/image/theme_unit/ninja.PNG'),
    red: assetUrl('/image/theme_unit/dino.webp'),
    yellow: assetUrl('/image/theme_unit/dessert.webp'),
  };
  return themeBackgrounds[colorTheme] || themeBackgrounds.blue;
};

// Theme-based ribbon colors for unit titles
const getRibbonColors = (colorTheme) => {
  const themeRibbons = {
    blue: { bg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', shadow: '#1e3a8a', fold: '#1e40af' },
    green: { bg: 'linear-gradient(135deg, #22c55e, #15803d)', shadow: '#14532d', fold: '#166534' },
    purple: { bg: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', shadow: '#4c1d95', fold: '#5b21b6' },
    orange: { bg: 'linear-gradient(135deg, #f97316, #c2410c)', shadow: '#7c2d12', fold: '#9a3412' },
    red: { bg: 'linear-gradient(135deg, #ef4444, #b91c1c)', shadow: '#7f1d1d', fold: '#991b1b' },
    yellow: { bg: 'linear-gradient(135deg, #eab308, #ca8a04)', shadow: '#713f12', fold: '#a16207' },
  };
  return themeRibbons[colorTheme] || themeRibbons.blue;
};

// Theme-based border colors for unit cards
const getBorderColor = (colorTheme) => {
  const themeBorders = {
    blue: "border-blue-500",
    green: "border-green-500",
    purple: "border-purple-500",
    orange: "border-orange-500",
    red: "border-red-500",
    yellow: "border-yellow-500",
  };
  return themeBorders[colorTheme] || themeBorders.blue;
};

const UnitList = () => {
  const { levelId: rawLevelId, courseId: rawCourseId } = useParams();
  const sanitizeId = (v) => (v && v !== "undefined" && v !== "null" ? v : null);
  const levelId = sanitizeId(rawLevelId);
  const courseId = sanitizeId(rawCourseId);
  // Support both level and course routes for backward compatibility
  const currentId = courseId || levelId;
  const navigate = useNavigate();
  const [level, setLevel] = useState(null);
  const [units, setUnits] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [unitProgress, setUnitProgress] = useState({});
  const [sessionProgress, setSessionProgress] = useState({});
  const [userStats, setUserStats] = useState({ xp: 0, streak: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [showEditUnitModal, setShowEditUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [addSessionUnitId, setAddSessionUnitId] = useState(null);
  const { user, profile } = useAuth();
  const { canCreateContent } = usePermissions();
  const { sessionStats: classStats } = useClassStats(currentId);
  const [copyingUnit, setCopyingUnit] = useState(null);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [copyingInProgress, setCopyingInProgress] = useState(false);
  const [courseExerciseIdSet, setCourseExerciseIdSet] = useState(new Set());
  const [studentNameMap, setStudentNameMap] = useState({});
  const [personalFilter, setPersonalFilter] = useState('shared');
  const [contextMenu, setContextMenu] = useState(null); // { x, y, session, unitId }
  const [copiedSession, setCopiedSession] = useState(null);
  const [editingSession, setEditingSession] = useState(null);
  const [showWarModal, setShowWarModal] = useState(false);
  const [showWarSetup, setShowWarSetup] = useState(false);
  const [bulkPasteModal, setBulkPasteModal] = useState(null); // { unitId }
  const [bulkPasteStudents, setBulkPasteStudents] = useState([]);
  const [bulkPasteSelected, setBulkPasteSelected] = useState(new Set());
  const [bulkPasteLoading, setBulkPasteLoading] = useState(false);

  // Class War
  const { war: activeWar, teamA, teamB, teamAXP, teamBXP, userTeam, rewards: warRewards, refresh: refreshWar } = useClassWar(currentId);

  // Compute course-level stats: how many exercises each student has done (excluding test sessions)
  const courseStudentStats = (() => {
    if (!classStats || sessions.length === 0) return null;

    // Get non-test session IDs
    const nonTestSessionIds = sessions.filter(s => !s.is_test).map(s => s.id);
    const relevantSessions = nonTestSessionIds
      .map(id => classStats[id])
      .filter(Boolean);
    if (relevantSessions.length === 0) return null;

    const studentMap = {};
    relevantSessions.forEach(({ students }) => {
      (students || []).forEach(({ id, name, completedExercises = 0, totalExercises = 0 }) => {
        if (!studentMap[id]) studentMap[id] = { id, name, completedExercises: 0, totalExercises: 0 };
        studentMap[id].completedExercises += completedExercises;
        studentMap[id].totalExercises += totalExercises;
      });
    });

    const studentList = Object.values(studentMap).map(s => ({
      ...s,
      status: s.completedExercises === s.totalExercises && s.totalExercises > 0 ? 'completed'
        : s.completedExercises > 0 ? 'in_progress' : 'not_started'
    }));
    const completed = studentList.filter(s => s.status === 'completed').length;

    return { completed, total: studentList.length, students: studentList };
  })();

  // Skeletons
  const SkeletonCard = () => (
    <div className="relative overflow-hidden bg-white border rounded-lg p-6 animate-pulse">
      <div className="flex items-center space-x-3 mb-2">
        <div className="w-12 h-12 rounded-full bg-gray-200" />
        <div className="flex-1 min-w-0">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-1" />
          <div className="h-3 bg-gray-100 rounded w-1/4" />
        </div>
      </div>
      <div className="h-3 bg-gray-100 rounded w-2/3 mt-2" />
    </div>
  );

  useEffect(() => {
    if (user && currentId) {
      fetchLevelAndUnits();
    }
  }, [user, currentId]);

  const fetchLevelAndUnits = async () => {
    if (!currentId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      // Fetch level data
      const { data: levelData, error: levelError } = await supabase
        .from("courses")
        .select("*")
        .eq("id", currentId)
        .single();

      if (levelError) throw levelError;

      // For students, verify they are enrolled in this course
      if (profile?.role === "user") {
        const { data: enrollmentData, error: enrollmentError } = await supabase
          .from("course_enrollments")
          .select("id")
          .eq("student_id", user.id)
          .eq("course_id", currentId)
          .eq("is_active", true)
          .single();

        if (enrollmentError || !enrollmentData) {
          console.error(
            "Student not enrolled in this course:",
            enrollmentError
          );
          setError("Bạn chưa được ghi danh vào khóa học này");
          navigate("/study");
          return;
        }
      }

      // Fetch user stats (XP and streak)
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("xp, streak_count")
        .eq("id", user.id)
        .single();

      if (userError) {
        console.error("Error fetching user stats:", userError);
      } else {
        setUserStats({
          xp: userData?.xp || 0,
          streak: userData?.streak_count || 0,
        });
      }

      // Fetch units for this level
      const { data: rawUnitsData, error: unitsError } = await supabase
        .from("units")
        .select("*")
        .eq("course_id", currentId)
        .eq("is_active", true)
        .order("unit_number");

      if (unitsError) throw unitsError;

      // Students only see shared units + their own personal units
      const unitsData = profile?.role === "user"
        ? (rawUnitsData || []).filter(u => !u.assigned_student_id || u.assigned_student_id === user.id)
        : rawUnitsData || [];

      // Fetch sessions for these units to calculate progress
      const { data: rawSessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select("*")
        .in("unit_id", unitsData?.map((u) => u.id) || [])
        .eq("is_active", true)
        .order("session_number");

      if (sessionsError) throw sessionsError;

      // Students only see shared sessions + their own personal sessions
      const sessionsData = profile?.role === "user"
        ? (rawSessionsData || []).filter(s => !s.assigned_student_id || s.assigned_student_id === user.id)
        : rawSessionsData || [];

      // Fetch student names for personal content badges (teachers only)
      if (profile?.role !== "user") {
        const personalStudentIds = [
          ...new Set([
            ...(unitsData || []).filter(u => u.assigned_student_id).map(u => u.assigned_student_id),
            ...(sessionsData || []).filter(s => s.assigned_student_id).map(s => s.assigned_student_id),
          ])
        ];
        if (personalStudentIds.length > 0) {
          const { data: studentNames } = await supabase
            .from("users")
            .select("id, real_name")
            .in("id", personalStudentIds);
          const nameMap = {};
          (studentNames || []).forEach(s => { nameMap[s.id] = s.real_name || "Unknown"; });
          setStudentNameMap(nameMap);
        }
      }

      // Get all session IDs for these units
      const sessionIds = sessionsData?.map((s) => s.id) || [];

      // Fetch user's progress for exercises in these sessions
      const { data: progressData, error: progressError } = await supabase
        .from("user_progress")
        .select(
          `
          *,
          exercises!inner(
            id,
            session_id,
            sessions!inner(
              id,
              unit_id
            )
          )
        `
        )
        .eq("user_id", user.id)
        .in("exercises.session_id", sessionIds);

      if (progressError) {
        console.error("Progress fetch error:", progressError);
        // If the complex query fails, try a simpler approach
        const { data: simpleProgressData, error: simpleError } = await supabase
          .from("user_progress")
          .select("*")
          .eq("user_id", user.id);

        if (simpleError) throw simpleError;

        // Calculate progress for each unit with simple data
        const progressMap = {};
        unitsData?.forEach((unit) => {
          const unitSessions =
            sessionsData?.filter((s) => s.unit_id === unit.id) || [];
          const totalSessions = unitSessions.length;

          progressMap[unit.id] = {
            unit_id: unit.id,
            total_sessions: totalSessions,
            sessions_completed: 0,
            progress_percentage: 0,
            status: "not_started",
            xp_earned: 0,
          };
        });
        setUnitProgress(progressMap);
        setSessions([]);
        setSessionProgress({});
        return;
      }

      // Calculate progress for each unit - PLACEHOLDER, will be updated after sessionProgressMap is ready
      const progressMap = {};
      unitsData?.forEach((unit) => {
        progressMap[unit.id] = {
          unit_id: unit.id,
          total_sessions: 0,
          sessions_completed: 0,
          progress_percentage: 0,
          status: "not_started",
          xp_earned: 0,
        };
      });

      // Calculate session progress
      const sessionProgressMap = {};

      // Fetch user's session progress (explicit session_progress rows)
      const { data: sessionProgressData, error: sessionProgressError } =
        await supabase
          .from("session_progress")
          .select("*")
          .eq("user_id", user.id)
          .in("session_id", sessionIds);

      if (sessionProgressError) {
        console.error("Error fetching session progress:", sessionProgressError);
      }

      // Fetch all assigned exercises for these sessions via linking table
      const { data: allAssignments, error: assignmentsErr } = await supabase
        .from("exercise_assignments")
        .select(
          `
          id,
          session_id,
          exercise:exercises(id, xp_reward, is_active)
        `
        )
        .in("session_id", sessionIds);

      if (assignmentsErr) {
        console.error("Error fetching exercise assignments:", assignmentsErr);
      }

      const exerciseIds = (allAssignments || [])
        .map((a) => a.exercise?.id)
        .filter(Boolean);

      setCourseExerciseIdSet(new Set(exerciseIds));

      // Fetch user's completed exercises among these
      const { data: userCompleted, error: userProgErr } = await supabase
        .from("user_progress")
        .select("exercise_id, status")
        .eq("user_id", user.id)
        .in("exercise_id", exerciseIds);

      if (userProgErr) {
        console.error("Error fetching user progress:", userProgErr);
      }

      // Build maps
      const sessionIdToExercises = {};
      (allAssignments || []).forEach((a) => {
        const ex = a.exercise;
        if (!ex) return;
        if (!sessionIdToExercises[a.session_id])
          sessionIdToExercises[a.session_id] = [];
        sessionIdToExercises[a.session_id].push({
          id: ex.id,
          session_id: a.session_id,
          xp_reward: ex.xp_reward,
          is_active: ex.is_active,
        });
      });

      const completedSet = new Set(
        (userCompleted || [])
          .filter((p) => p.status === "completed")
          .map((p) => p.exercise_id)
      );

      // Seed with DB rows first
      sessionProgressData?.forEach((progress) => {
        sessionProgressMap[progress.session_id] = progress;
      });

      // Fill/override computed fields
      sessionsData?.forEach((s) => {
        const list = sessionIdToExercises[s.id] || [];
        const total = list.length;
        const completedCount = list.filter((ex) =>
          completedSet.has(ex.id)
        ).length;
        const xpEarned = list
          .filter((ex) => completedSet.has(ex.id))
          .reduce((sum, ex) => sum + (ex.xp_reward || 0), 0);
        const percentage =
          total > 0 ? Math.round((completedCount / total) * 100) : 0;

        const existing = sessionProgressMap[s.id];
        if (existing) {
          sessionProgressMap[s.id] = {
            ...existing,
            xp_earned: Math.max(existing.xp_earned || 0, xpEarned),
            progress_percentage: Math.max(
              existing.progress_percentage || 0,
              percentage
            ),
          };
        } else {
          sessionProgressMap[s.id] = {
            user_id: user.id,
            session_id: s.id,
            status:
              total > 0 && completedCount === total
                ? "completed"
                : "in_progress",
            xp_earned: xpEarned,
            progress_percentage: percentage,
          };
        }
      });

      // NOW calculate unit progress based on sessionProgressMap
      unitsData?.forEach((unit) => {
        const unitSessions =
          sessionsData?.filter((s) => s.unit_id === unit.id) || [];
        const totalSessions = unitSessions.length;

        // Count sessions where ALL exercises are completed
        const completedSessions = unitSessions.filter((session) => {
          const sessionProg = sessionProgressMap[session.id];
          return sessionProg?.status === "completed";
        });
        const sessionsCompleted = completedSessions.length;
        const progressPercentage =
          totalSessions > 0
            ? Math.round((sessionsCompleted / totalSessions) * 100)
            : 0;

        progressMap[unit.id] = {
          unit_id: unit.id,
          total_sessions: totalSessions,
          sessions_completed: sessionsCompleted,
          progress_percentage: progressPercentage,
          status:
            sessionsCompleted === totalSessions && totalSessions > 0
              ? "completed"
              : sessionsCompleted > 0
                ? "in_progress"
                : "not_started",
          xp_earned: completedSessions.reduce(
            (sum, s) => sum + (sessionProgressMap[s.id]?.xp_earned || 0),
            0
          ),
        };
      });

      setLevel(levelData);
      setUnits(unitsData || []);
      setSessions(sessionsData || []);
      setUnitProgress(progressMap);
      setSessionProgress(sessionProgressMap);

    } catch (err) {
      console.error("Error fetching units:", err);
      setError("Không thể tải danh sách unit");
    } finally {
      setLoading(false);
    }
  };

  const handleSessionCreated = (newSession) => {
    setSessions((prev) => [...prev, newSession]);
    setAddSessionUnitId(null);
  };

  const handleUnitCreated = (newUnit) => {
    setUnits((prev) => [...prev, newUnit]);
    setShowAddUnitModal(false);
    // Show success message
    alert("Unit created successfully!");
  };

  const handleUnitUpdated = (updatedUnit) => {
    setUnits((prev) =>
      prev.map((unit) => (unit.id === updatedUnit.id ? updatedUnit : unit))
    );
    setShowEditUnitModal(false);
    setEditingUnit(null);
    // Show success message
    alert("Unit updated successfully!");
  };

  const handleSwapUnit = async (unitIndex, direction) => {
    const targetIndex = unitIndex + direction;
    if (targetIndex < 0 || targetIndex >= units.length) return;

    const unitA = units[unitIndex];
    const unitB = units[targetIndex];
    const numA = unitA.unit_number;
    const numB = unitB.unit_number;

    try {
      // Sequential to avoid deadlock
      const resA = await supabase.from("units").update({ unit_number: -1 }).eq("id", unitA.id);
      if (resA.error) throw resA.error;
      const resB = await supabase.from("units").update({ unit_number: numA }).eq("id", unitB.id);
      if (resB.error) throw resB.error;
      const resC = await supabase.from("units").update({ unit_number: numB }).eq("id", unitA.id);
      if (resC.error) throw resC.error;

      setUnits((prev) => {
        const next = [...prev];
        next[unitIndex] = { ...unitA, unit_number: numB };
        next[targetIndex] = { ...unitB, unit_number: numA };
        next.sort((a, b) => (a.unit_number || 0) - (b.unit_number || 0));
        return next;
      });
    } catch (err) {
      console.error("Error swapping units:", err);
      alert("Failed to reorder units: " + (err.message || err));
    }
  };

  const handleEditUnit = (unit) => {
    setEditingUnit(unit);
    setShowEditUnitModal(true);
  };

  const handleDeleteUnit = async (unit) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the unit "${unit.title}"?\n\nThis will also delete all sessions and exercises in this unit. This action cannot be undone.`
    );

    if (!confirmDelete) return;

    try {
      const { error } = await supabase.from("units").delete().eq("id", unit.id);

      if (error) throw error;

      // Remove from local state
      setUnits((prev) => prev.filter((u) => u.id !== unit.id));
      // Remove sessions for this unit
      setSessions((prev) => prev.filter((s) => s.unit_id !== unit.id));

      alert("Unit deleted successfully!");
    } catch (err) {
      console.error("Error deleting unit:", err);
      alert("Failed to delete unit: " + (err.message || "Unknown error"));
    }
  };

  const handleCopyUnit = async (unit) => {
    // Fetch available courses (excluding current)
    const { data: courses, error } = await supabase
      .from("courses")
      .select("id, title")
      .order("title");
    if (error) {
      alert("Failed to load courses: " + error.message);
      return;
    }
    setAvailableCourses(courses || []);
    setCopyingUnit(unit);
  };

  const handleCopyUnitToCourse = async (targetCourseId) => {
    setCopyingInProgress(true);
    try {
      // 1. Get max unit_number in target course
      const { data: targetUnits } = await supabase
        .from("units")
        .select("unit_number")
        .eq("course_id", targetCourseId)
        .order("unit_number", { ascending: false })
        .limit(1);
      const nextUnitNumber = targetUnits?.length > 0 ? targetUnits[0].unit_number + 1 : 1;

      // 2. Clone the unit
      const { data: newUnit, error: unitError } = await supabase
        .from("units")
        .insert({
          course_id: targetCourseId,
          title: copyingUnit.title,
          description: copyingUnit.description,
          unit_number: nextUnitNumber,
          color_theme: copyingUnit.color_theme,
          unlock_requirement: copyingUnit.unlock_requirement,
          is_active: copyingUnit.is_active,
          thumbnail_url: copyingUnit.thumbnail_url,
          estimated_duration: copyingUnit.estimated_duration,
        })
        .select()
        .single();
      if (unitError) throw unitError;

      // 3. Get sessions for this unit
      const { data: unitSessions, error: sessError } = await supabase
        .from("sessions")
        .select("*")
        .eq("unit_id", copyingUnit.id)
        .order("session_number");
      if (sessError) throw sessError;

      // 4. Clone each session and its exercise assignments
      for (const sess of unitSessions || []) {
        const { data: newSession, error: newSessError } = await supabase
          .from("sessions")
          .insert({
            unit_id: newUnit.id,
            title: sess.title,
            description: sess.description,
            session_number: sess.session_number,
            session_type: sess.session_type,
            difficulty_level: sess.difficulty_level,
            xp_reward: sess.xp_reward,
            unlock_requirement: sess.unlock_requirement,
            is_active: sess.is_active,
            thumbnail_url: sess.thumbnail_url,
            estimated_duration: sess.estimated_duration,
            is_test: sess.is_test,
          })
          .select()
          .single();
        if (newSessError) throw newSessError;

        // 5. Get exercise assignments for this session
        const { data: assignments, error: assignError } = await supabase
          .from("exercise_assignments")
          .select("exercise_id, order_index")
          .eq("session_id", sess.id)
          .order("order_index");
        if (assignError) throw assignError;

        if (assignments?.length > 0) {
          const newAssignments = assignments.map((a) => ({
            session_id: newSession.id,
            exercise_id: a.exercise_id,
            order_index: a.order_index,
          }));
          const { error: insertError } = await supabase
            .from("exercise_assignments")
            .insert(newAssignments);
          if (insertError) throw insertError;
        }
      }

      alert(`Unit "${copyingUnit.title}" copied successfully!`);
      setCopyingUnit(null);
    } catch (err) {
      console.error("Error copying unit:", err);
      alert("Failed to copy unit: " + (err.message || "Unknown error"));
    } finally {
      setCopyingInProgress(false);
    }
  };

  // --- Context menu handlers ---
  const handleSessionContextMenu = (e, session, unitId) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, session, unitId });
  };

  const closeContextMenu = () => setContextMenu(null);

  // Close context menu on any click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => closeContextMenu();
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleCopySession = (session) => {
    setCopiedSession(session);
    closeContextMenu();
  };

  const handlePasteSession = async (targetUnitId) => {
    if (!copiedSession) return;
    closeContextMenu();
    try {
      // Get next session_number
      const { data: existing } = await supabase
        .from('sessions')
        .select('session_number')
        .eq('unit_id', targetUnitId)
        .order('session_number', { ascending: false })
        .limit(1);
      const nextNum = existing?.length > 0 ? existing[0].session_number + 1 : 1;

      // Clone session
      const { data: newSession, error: sessError } = await supabase
        .from('sessions')
        .insert({
          unit_id: targetUnitId,
          title: copiedSession.title,
          description: copiedSession.description,
          session_number: nextNum,
          session_type: copiedSession.session_type,
          difficulty_level: copiedSession.difficulty_level,
          xp_reward: copiedSession.xp_reward,
          is_active: copiedSession.is_active,
          estimated_duration: copiedSession.estimated_duration,
          is_test: copiedSession.is_test,
          assigned_student_id: copiedSession.assigned_student_id,
          open_date: copiedSession.open_date,
          close_date: copiedSession.close_date,
        })
        .select()
        .single();
      if (sessError) throw sessError;

      // Clone exercise assignments
      const { data: assignments, error: assignError } = await supabase
        .from('exercise_assignments')
        .select('exercise_id, order_index')
        .eq('session_id', copiedSession.id)
        .order('order_index');
      if (assignError) throw assignError;

      if (assignments?.length > 0) {
        const { error: insertError } = await supabase
          .from('exercise_assignments')
          .insert(assignments.map(a => ({
            session_id: newSession.id,
            exercise_id: a.exercise_id,
            order_index: a.order_index,
          })));
        if (insertError) throw insertError;
      }

      setSessions(prev => [...prev, newSession]);
      alert(`Session "${copiedSession.title}" pasted successfully!`);
    } catch (err) {
      console.error('Error pasting session:', err);
      alert('Failed to paste session: ' + (err.message || 'Unknown error'));
    }
  };

  const handleDeleteSession = async (session) => {
    closeContextMenu();
    if (!window.confirm(`Delete "${session.title}"?\n\nThis will also delete all exercise assignments. This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('sessions').delete().eq('id', session.id);
      if (error) throw error;
      setSessions(prev => prev.filter(s => s.id !== session.id));
    } catch (err) {
      console.error('Error deleting session:', err);
      alert('Failed to delete session: ' + (err.message || 'Unknown error'));
    }
  };

  const openBulkPasteModal = async (unitId) => {
    closeContextMenu();
    if (!copiedSession) return;
    setBulkPasteModal({ unitId });
    setBulkPasteSelected(new Set());
    setBulkPasteLoading(false);
    try {
      const { data, error: fetchError } = await supabase
        .from('course_enrollments')
        .select('student_id, student:users!student_id(id, full_name, real_name)')
        .eq('course_id', currentId)
        .eq('is_active', true);
      if (fetchError) throw fetchError;
      setBulkPasteStudents((data || []).map(e => ({
        id: e.student?.id || e.student_id,
        name: e.student?.real_name || e.student?.full_name || 'Unknown',
      })));
    } catch (err) {
      console.error('Error fetching students:', err);
      setBulkPasteStudents([]);
    }
  };

  const handleBulkPaste = async () => {
    if (!copiedSession || !bulkPasteModal || bulkPasteSelected.size === 0) return;
    setBulkPasteLoading(true);
    const targetUnitId = bulkPasteModal.unitId;
    try {
      // Get exercises for the copied session
      const { data: assignments, error: assignError } = await supabase
        .from('exercise_assignments')
        .select('exercise_id, order_index')
        .eq('session_id', copiedSession.id)
        .order('order_index');
      if (assignError) throw assignError;

      // Get next session_number
      const { data: existing } = await supabase
        .from('sessions')
        .select('session_number')
        .eq('unit_id', targetUnitId)
        .order('session_number', { ascending: false })
        .limit(1);
      let nextNum = existing?.length > 0 ? existing[0].session_number + 1 : 1;

      const newSessions = [];
      for (const studentId of bulkPasteSelected) {
        const { data: newSession, error: sessError } = await supabase
          .from('sessions')
          .insert({
            unit_id: targetUnitId,
            title: copiedSession.title,
            description: copiedSession.description,
            session_number: nextNum++,
            session_type: copiedSession.session_type,
            difficulty_level: copiedSession.difficulty_level,
            xp_reward: copiedSession.xp_reward,
            is_active: copiedSession.is_active,
            estimated_duration: copiedSession.estimated_duration,
            is_test: copiedSession.is_test,
            assigned_student_id: studentId,
            open_date: copiedSession.open_date,
            close_date: copiedSession.close_date,
          })
          .select()
          .single();
        if (sessError) throw sessError;

        if (assignments?.length > 0) {
          const { error: insertError } = await supabase
            .from('exercise_assignments')
            .insert(assignments.map(a => ({
              session_id: newSession.id,
              exercise_id: a.exercise_id,
              order_index: a.order_index,
            })));
          if (insertError) throw insertError;
        }
        newSessions.push(newSession);
      }

      setSessions(prev => [...prev, ...newSessions]);
      alert(`Pasted "${copiedSession.title}" to ${newSessions.length} student(s)!`);
      setBulkPasteModal(null);
    } catch (err) {
      console.error('Error bulk pasting:', err);
      alert('Failed to bulk paste: ' + (err.message || 'Unknown error'));
    } finally {
      setBulkPasteLoading(false);
    }
  };

  const handleSessionUpdated = async (updatedSession) => {
    // Refetch all sessions for this unit since reordering may have changed multiple session_numbers
    const { data: refreshed } = await supabase
      .from('sessions')
      .select('*')
      .eq('unit_id', updatedSession.unit_id)
      .order('session_number');
    if (refreshed) {
      setSessions(prev => {
        const otherUnits = prev.filter(s => s.unit_id !== updatedSession.unit_id);
        return [...otherUnits, ...refreshed];
      });
    } else {
      setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
    }
    setEditingSession(null);
  };

  const getSessionStatus = (session, index) => {
    const progress = sessionProgress[session.id];
    const now = new Date();

    // Check open/close dates for students
    if (profile?.role === 'user') {
      if (session.open_date && new Date(session.open_date) > now) {
        return { status: "scheduled", canAccess: false };
      }
      if (session.close_date && new Date(session.close_date) < now) {
        return { status: "closed", canAccess: false };
      }
    }

    // All sessions are now always available (unlocked)
    if (!progress) {
      return { status: "available", canAccess: true };
    }

    return {
      status: progress.status,
      canAccess: true, // Always allow access
    };
  };

  const handleSessionClick = async (session) => {
    // Always go to exercise list regardless of exercise count
    const base = levelId
      ? `/study/level/${levelId}`
      : `/study/course/${currentId}`;
    navigate(`${base}/unit/${session.unit_id}/session/${session.id}`);
  };

  const renderSessionCard = (session, index, colorTheme) => {
    const { status, canAccess } = getSessionStatus(session, index);
    const progress = sessionProgress[session.id];
    const isLocked = !canAccess;
    const progressPercentage = progress?.progress_percentage || 0;

    // Theme-based colors for completed status
    const themeBackColors = {
      blue: "bg-blue-700",
      green: "bg-green-700",
      purple: "bg-purple-700",
      orange: "bg-orange-700",
      red: "bg-red-700",
      yellow: "bg-yellow-700",
    };

    const themeFrontColors = {
      blue: "bg-blue-500",
      green: "bg-green-500",
      purple: "bg-purple-500",
      orange: "bg-orange-500",
      red: "bg-red-500",
      yellow: "bg-yellow-500",
    };

    // Get colors based on status
    const getBackColor = () => {
      if (status === "completed") return themeBackColors[colorTheme] || "bg-green-700";
      return "bg-gray-400";
    };

    const getFrontColor = () => {
      if (status === "completed") return themeFrontColors[colorTheme] || "bg-green-500";
      return "bg-gray-300";
    };

    return (
      <div
        key={session.id}
        onClick={() => !isLocked && handleSessionClick(session)}
        onContextMenu={canCreateContent() ? (e) => handleSessionContextMenu(e, session, session.unit_id) : undefined}
        className={`block ${isLocked ? "cursor-not-allowed" : "cursor-pointer"
          } w-full`}
      >
        <div
          className="relative w-full"
          style={{ aspectRatio: "4/3" }}
        >
          {/* Back shadow layer */}
          <span
            className={`absolute inset-0 rounded-lg ${getBackColor()}`}
          />
          {/* Front button layer */}
          <span
            className={`absolute inset-0 rounded-lg flex items-center justify-center transition-all duration-150 ${getFrontColor()} ${!isLocked ? "active:translate-y-0 active:shadow-none" : ""
              }`}
            style={{
              transform: 'translateY(-10%)',
              boxShadow: '0 0.5em 1em -0.2em rgba(0, 0, 0, 0.3)'
            }}
            onMouseEnter={(e) => {
              if (!isLocked) {
                e.currentTarget.style.transform = 'translateY(-15%)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isLocked) {
                e.currentTarget.style.transform = 'translateY(-10%)'
              }
            }}
            onMouseDown={(e) => {
              if (!isLocked) {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }
            }}
            onMouseUp={(e) => {
              if (!isLocked) {
                e.currentTarget.style.transform = 'translateY(-15%)'
                e.currentTarget.style.boxShadow = '0 0.5em 1em -0.2em rgba(0, 0, 0, 0.3)'
              }
            }}
            onTouchStart={(e) => {
              if (!isLocked) {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }
            }}
            onTouchEnd={(e) => {
              if (!isLocked) {
                e.currentTarget.style.transform = 'translateY(-10%)'
                e.currentTarget.style.boxShadow = '0 0.5em 1em -0.2em rgba(0, 0, 0, 0.3)'
              }
            }}
          >
            {/* Lock icon */}
            {isLocked && (
              <div className="absolute top-2 right-2 z-40">
                <Lock className="w-4 h-4 text-gray-600" />
              </div>
            )}

            {/* Incomplete red dot */}
            {!isLocked && status !== 'completed' && status !== 'scheduled' && (
              <span className="absolute top-0 right-0 z-40 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white" />
            )}

            {/* Test badge */}
            {session.is_test && (
              <div className="absolute top-1 left-1 z-40">
                <div className="bg-orange-500 rounded px-1 py-0.5 flex items-center gap-0.5 shadow-sm">
                  <FileText className="w-2.5 h-2.5 text-white" />
                  <span className="text-white text-[7px] font-bold leading-none">TEST</span>
                </div>
              </div>
            )}

            {/* Personal badge */}
            {session.assigned_student_id && (
              <div className={`absolute ${session.is_test ? 'top-1 right-1' : 'top-1 left-1'} z-40`}>
                <div className="bg-purple-500 rounded px-1 py-0.5 flex items-center gap-0.5 shadow-sm">
                  <User className="w-2.5 h-2.5 text-white" />
                  <span className="text-white text-[7px] font-bold leading-none">
                    {profile?.role === 'user' ? 'YOU' : (studentNameMap[session.assigned_student_id]?.split(' ').pop() || '1:1')}
                  </span>
                </div>
              </div>
            )}

            {/* Scheduled / Closed badge */}
            {(session.open_date || session.close_date) && (
              <div className="absolute bottom-1 left-1 z-40">
                <div className={`rounded px-1 py-0.5 flex items-center gap-0.5 shadow-sm ${
                  status === 'closed' ? 'bg-red-500' : status === 'scheduled' ? 'bg-amber-500' : 'bg-emerald-500'
                }`}>
                  <Clock className="w-2.5 h-2.5 text-white" />
                  <span className="text-white text-[7px] font-bold leading-none">
                    {status === 'closed' ? 'CLOSED' : status === 'scheduled' ? 'SCHEDULED' : 'OPEN'}
                  </span>
                </div>
              </div>
            )}

            {/* Session Title */}
            <div className="absolute inset-0 flex items-center justify-center px-2">
              <h3 className={`font-bold text-[11px] text-center leading-tight line-clamp-2 ${status === "completed" || progressPercentage > 0 ? "text-white" : "text-gray-700"
                }`}>
                {session.title}
              </h3>
            </div>

            {/* Teacher stats badge with hover popover */}
            {canCreateContent() && classStats?.[session.id] && (() => {
              const raw = classStats[session.id];
              const displayStats = session.assigned_student_id
                ? (() => {
                    const filtered = (raw.students || []).filter(st => st.id === session.assigned_student_id);
                    const completed = filtered.filter(st => st.status === 'completed').length;
                    return { ...raw, completed, total: filtered.length, students: filtered };
                  })()
                : raw;
              return (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-40">
                <StudentStatsPopover stats={displayStats}>
                  <div className={`rounded px-1.5 py-0.5 text-[8px] font-bold leading-none whitespace-nowrap shadow-sm cursor-default ${
                    displayStats.completed === displayStats.total
                      ? 'bg-green-500 text-white'
                      : displayStats.completed > 0
                        ? 'bg-yellow-400 text-gray-800'
                        : 'bg-gray-200 text-gray-600'
                  }`}>
                    {displayStats.completed}/{displayStats.total}
                  </div>
                </StudentStatsPopover>
              </div>
              );
            })()}
          </span>
        </div>
      </div>
    );
  };

  if (loading && units.length === 0) {
    return (
      <div className="flex bg-white">
        {/* Main content skeleton */}
        <div className="flex-1 flex flex-col overflow-hidden p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <SkeletonCard key={idx} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">{error}</div>
        <Button onClick={fetchLevelAndUnits} variant="outline">
          Thử lại
        </Button>
      </div>
    );
  }

  if (!level) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600 mb-4">Không tìm thấy level</div>
        <Button onClick={() => navigate("/study")} variant="outline">
          Quay lại
        </Button>
      </div>
    );
  }

  return (
    <div className="flex bg-white -mx-4 -my-6">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/study")}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Quay lại
              </Button>
            </div>
            {canCreateContent() && (
              <div className="flex items-center space-x-2">
                {courseStudentStats && (
                  <StudentStatsPopover stats={courseStudentStats} size="md" />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/teacher/class-reports?course=${currentId}&from=course`)}
                  className="flex items-center space-x-2 bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>Điểm danh</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/teacher/unit-report/${currentId}`)}
                  className="flex items-center space-x-2 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                >
                  <FileText className="w-4 h-4" />
                  <span>Unit Report</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/teacher/course-report/${currentId}`)}
                  className="flex items-center space-x-2 bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Report</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/teacher/live-battle/${currentId}`)}
                  className="flex items-center space-x-2 bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
                >
                  <Swords className="w-4 h-4" />
                  <span>Live Battle</span>
                </Button>
                {activeWar ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowWarSetup(true)}
                    className="flex items-center space-x-2 bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100"
                  >
                    <Swords className="w-4 h-4" />
                    <span>Edit War</span>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowWarSetup(true)}
                    className="flex items-center space-x-2 bg-gradient-to-r from-red-50 to-blue-50 border-purple-200 text-purple-700 hover:from-red-100 hover:to-blue-100"
                  >
                    <Swords className="w-4 h-4" />
                    <span>Class War</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Mobile: Class War Banner */}
          {FEATURES.classwar && activeWar && (
            <div className="lg:hidden">
              <ClassWarBanner
                war={activeWar}
                teamAXP={teamAXP}
                teamBXP={teamBXP}
                userTeam={userTeam}
                onClick={() => setShowWarModal(true)}
              />
            </div>
          )}

          <div className="flex gap-4">
            {/* Desktop: Left Team Panel */}
            {FEATURES.classwar && activeWar && (
              <div className="hidden lg:block w-64 shrink-0">
                <ClassWarPanel
                  team="A"
                  teamName={activeWar.team_a_name}
                  members={teamA}
                  totalXP={teamAXP}
                  opponentXP={teamBXP}
                  userId={user?.id}
                  rewards={warRewards}
                  isTeacher={profile?.role !== 'user'}
                />
              </div>
            )}

            {/* Center: existing content */}
            <div className="flex-1 min-w-0">
          {/* Teacher filter for personal content */}
          {canCreateContent() && Object.keys(studentNameMap).length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-sm text-gray-500">View:</span>
              {[
                { value: 'all', label: 'All' },
                { value: 'shared', label: 'Shared' },
                { value: 'personal', label: 'Personal' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPersonalFilter(opt.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    personalFilter === opt.value
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              {Object.entries(studentNameMap).map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => setPersonalFilter(personalFilter === id ? 'all' : id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    personalFilter === id
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          <>
            {/* Units with Sessions */}
            {(() => {
              const renderUnitCard = (unit, unitIndex) => {
                const unitSessions = sessions
                  .filter((session) => session.unit_id === unit.id)
                  .filter((session) => {
                    if (profile?.role === 'user') return true;
                    if (personalFilter === 'all') return true;
                    if (personalFilter === 'shared') return !session.assigned_student_id;
                    if (personalFilter === 'personal') return !!session.assigned_student_id;
                    return session.assigned_student_id === personalFilter;
                  })
                  .sort((a, b) => (a.session_number || 0) - (b.session_number || 0));

                const progress = unitProgress[unit.id];
                const backgroundImage = unit.thumbnail_url || getThemeBackground(unit.color_theme);

                return (
                  <div
                    key={unit.id}
                    className={`relative rounded-lg border-4 ${getBorderColor(unit.color_theme)} p-4 overflow-visible`}
                    style={{
                      backgroundImage: `url(${backgroundImage})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    <div className="absolute inset-0 bg-white/30" />
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-20">
                      {(() => {
                        const ribbon = getRibbonColors(unit.color_theme);
                        return (
                          <div className="relative flex items-center">
                            {/* Main ribbon */}
                            <div
                              className="relative px-6 py-2 text-white font-bold text-lg drop-shadow-md whitespace-nowrap"
                              style={{
                                background: ribbon.bg,
                                borderRadius: '4px',
                                boxShadow: `0 3px 6px ${ribbon.shadow}40`,
                              }}
                            >
                              {unit.title}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Personal unit badge */}
                    {unit.assigned_student_id && (
                      <div className="absolute top-1 right-1 z-30">
                        <div className="bg-purple-600 rounded-full px-2.5 py-1 flex items-center gap-1 shadow-sm">
                          <User className="w-3 h-3 text-white" />
                          <span className="text-white text-[10px] font-bold">
                            {profile?.role === 'user' ? 'FOR YOU' : studentNameMap[unit.assigned_student_id] || '1:1'}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="relative mb-3 mt-6 flex items-center justify-end">

                      <div className="flex items-center space-x-2">
                        {canCreateContent() && (
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => handleSwapUnit(unitIndex, -1)}
                              disabled={unitIndex === 0}
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move up"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleSwapUnit(unitIndex, 1)}
                              disabled={unitIndex === units.length - 1}
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move down"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEditUnit(unit)}
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Edit unit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCopyUnit(unit)}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                              title="Copy to another course"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUnit(unit)}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                              title="Delete unit"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {unitSessions.length > 0 ? (
                      <div
                        className="relative grid grid-cols-3 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-3 gap-3"
                        style={{ gridAutoFlow: "dense" }}
                      >
                        {unitSessions.map((session, index) => (
                          <div key={session.id} className="flex justify-center items-start">
                            <div style={{ width: "80px", height: "80px" }}>
                              {renderSessionCard(session, index, unit.color_theme)}
                            </div>
                          </div>
                        ))}
                        {canCreateContent() && (
                          <div className="flex justify-center items-start">
                            <div
                              style={{ width: "80px", height: "80px" }}
                              onClick={() => setAddSessionUnitId(unit.id)}
                              className="cursor-pointer"
                            >
                              <div className="relative w-full" style={{ aspectRatio: "4/3" }}>
                                <span className="absolute inset-0 rounded-lg bg-gray-400" />
                                <span
                                  className="absolute inset-0 rounded-lg bg-gray-300 flex items-center justify-center transition-all duration-150"
                                  style={{
                                    transform: 'translateY(-10%)',
                                    boxShadow: '0 0.5em 1em -0.2em rgba(0, 0, 0, 0.3)'
                                  }}
                                >
                                  <Plus className="w-5 h-5 text-gray-700" />
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                        {canCreateContent() ? (
                          <Button
                            onClick={() => setAddSessionUnitId(unit.id)}
                            className="bg-green-600 text-white hover:bg-green-700"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Sessions
                          </Button>
                        ) : (
                          <p className="text-sm text-gray-500">Sessions will be available soon</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              };

              const addUnitCard = canCreateContent() ? (
                <div key="add-unit" className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-8 text-center hover:border-blue-400 transition-colors">
                  <div className="flex flex-col items-center space-y-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Plus className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-gray-600">Create a new learning unit for this level</p>
                    </div>
                    <Button onClick={() => setShowAddUnitModal(true)} className="bg-blue-600 text-white hover:bg-blue-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Unit
                    </Button>
                  </div>
                </div>
              ) : null;

              // Apply teacher filter — also show shared units that contain matching personal sessions
              const filteredUnits = units.filter(u => {
                if (profile?.role === 'user') return true;
                if (personalFilter === 'all') return true;
                if (personalFilter === 'shared') return !u.assigned_student_id;
                // For 'personal' or specific student: show unit if the unit itself matches OR it contains matching sessions
                const unitMatches = personalFilter === 'personal'
                  ? !!u.assigned_student_id
                  : u.assigned_student_id === personalFilter;
                if (unitMatches) return true;
                // Check if this unit has any sessions that match the filter
                const hasMatchingSessions = sessions.some(s => {
                  if (s.unit_id !== u.id) return false;
                  return personalFilter === 'personal'
                    ? !!s.assigned_student_id
                    : s.assigned_student_id === personalFilter;
                });
                return hasMatchingSessions;
              });

              const sortedUnits = [...filteredUnits].sort((a, b) => {
                const aPersonal = a.assigned_student_id ? 1 : 0;
                const bPersonal = b.assigned_student_id ? 1 : 0;
                if (aPersonal !== bPersonal) return aPersonal - bPersonal;
                return (a.unit_number || 0) - (b.unit_number || 0);
              });

              const allItems = [
                ...sortedUnits.map((u, i) => ({ type: 'unit', unit: u, unitIndex: i })),
                ...(addUnitCard ? [{ type: 'add' }] : []),
              ];
              const cols = [[], []];
              allItems.forEach((item, i) => cols[i % 2].push(item));

              return (
                <div className="flex flex-col lg:flex-row gap-6 mt-4 items-start">
                  {cols.map((col, colIdx) => (
                    <div key={colIdx} className="w-full lg:flex-1 flex flex-col gap-10 min-w-0">
                      {col.map((item) =>
                        item.type === 'add' ? addUnitCard : renderUnitCard(item.unit, item.unitIndex)
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Empty state */}
            {units.length === 0 && (
              <div className="text-center py-12">
                <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Chưa có unit nào
                </h3>
                <p className="text-gray-600">
                  Các unit học tập sẽ sớm được cập nhật!
                </p>
                {canCreateContent() && (
                  <Button
                    onClick={() => setShowAddUnitModal(true)}
                    className="mt-4 bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Unit
                  </Button>
                )}
              </div>
            )}
          </>
            </div>{/* end flex-1 min-w-0 (center content) */}

            {/* Desktop: Right Team Panel */}
            {FEATURES.classwar && activeWar && (
              <div className="hidden lg:block w-64 shrink-0">
                <ClassWarPanel
                  team="B"
                  teamName={activeWar.team_b_name}
                  members={teamB}
                  totalXP={teamBXP}
                  opponentXP={teamAXP}
                  userId={user?.id}
                  rewards={warRewards}
                  isTeacher={profile?.role !== 'user'}
                />
              </div>
            )}
          </div>{/* end flex gap-4 */}

          {/* Mobile: Class War Modal */}
          {FEATURES.classwar && showWarModal && activeWar && (
            <ClassWarModal
              war={activeWar}
              teamA={teamA}
              teamB={teamB}
              teamAXP={teamAXP}
              teamBXP={teamBXP}
              userTeam={userTeam}
              userId={user?.id}
              rewards={warRewards}
              isTeacher={profile?.role !== 'user'}
              onClose={() => setShowWarModal(false)}
            />
          )}
        </div>
      </div>

      {/* Class War Setup Modal */}
      {FEATURES.classwar && showWarSetup && (
        <ClassWarSetupModal
          courseId={currentId}
          existingWar={activeWar}
          teamAXP={teamAXP}
          teamBXP={teamBXP}
          teamAMembers={teamA}
          teamBMembers={teamB}
          onClose={() => { setShowWarSetup(false); }}
          onStarted={() => refreshWar()}
        />
      )}

      {/* Add Unit Modal */}
      {showAddUnitModal && (
        <AddUnitModal
          levelId={currentId}
          onClose={() => setShowAddUnitModal(false)}
          onCreated={handleUnitCreated}
        />
      )}

      {/* Add Session Modal */}
      {addSessionUnitId && (
        <AddSessionModal
          unitId={addSessionUnitId}
          courseId={currentId}
          parentAssignedStudentId={units.find(u => u.id === addSessionUnitId)?.assigned_student_id || null}
          onClose={() => setAddSessionUnitId(null)}
          onCreated={handleSessionCreated}
        />
      )}

      {/* Edit Unit Modal */}
      {showEditUnitModal && editingUnit && (
        <EditUnitModal
          unit={editingUnit}
          sessionCount={sessions.filter(s => s.unit_id === editingUnit.id).length}
          onClose={() => {
            setShowEditUnitModal(false);
            setEditingUnit(null);
          }}
          onUpdated={handleUnitUpdated}
        />
      )}

      {/* Edit Session Modal */}
      {editingSession && (
        <EditSessionModal
          session={editingSession}
          courseId={currentId}
          onClose={() => setEditingSession(null)}
          onUpdated={handleSessionUpdated}
        />
      )}

      {/* Session Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setEditingSession(contextMenu.session); closeContextMenu(); }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2"
          >
            <Edit className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => handleCopySession(contextMenu.session)}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2"
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
          {copiedSession && (
            <>
              <button
                onClick={() => handlePasteSession(contextMenu.unitId)}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> Paste &ldquo;{copiedSession.title}&rdquo;
              </button>
              <button
                onClick={() => openBulkPasteModal(contextMenu.unitId)}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2"
              >
                <Users className="w-3.5 h-3.5" /> Bulk Paste to Students
              </button>
            </>
          )}
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => handleDeleteSession(contextMenu.session)}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}

      {/* Bulk Paste to Students Modal */}
      {bulkPasteModal && copiedSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              Bulk Paste to Students
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Paste &ldquo;<span className="font-medium">{copiedSession.title}</span>&rdquo; as a personal session for:
              {(copiedSession.open_date || copiedSession.close_date) && (
                <span className="block text-xs text-gray-400 mt-1">
                  {copiedSession.open_date && <>Start: {new Date(copiedSession.open_date).toLocaleString()}</>}
                  {copiedSession.open_date && copiedSession.close_date && ' — '}
                  {copiedSession.close_date && <>End: {new Date(copiedSession.close_date).toLocaleString()}</>}
                </span>
              )}
            </p>

            {bulkPasteStudents.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No enrolled students found</p>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => {
                      if (bulkPasteSelected.size === bulkPasteStudents.length) {
                        setBulkPasteSelected(new Set());
                      } else {
                        setBulkPasteSelected(new Set(bulkPasteStudents.map(s => s.id)));
                      }
                    }}
                    className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                  >
                    {bulkPasteSelected.size === bulkPasteStudents.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-xs text-gray-400">
                    {bulkPasteSelected.size} / {bulkPasteStudents.length} selected
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 mb-4">
                  {bulkPasteStudents.map(student => (
                    <label
                      key={student.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        bulkPasteSelected.has(student.id)
                          ? 'bg-purple-50 border border-purple-200'
                          : 'bg-gray-50 border border-transparent hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={bulkPasteSelected.has(student.id)}
                        onChange={() => {
                          setBulkPasteSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(student.id)) next.delete(student.id);
                            else next.add(student.id);
                            return next;
                          });
                        }}
                        className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                      />
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-800">{student.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setBulkPasteModal(null)}
                disabled={bulkPasteLoading}
                className="flex-1 py-2 text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkPaste}
                disabled={bulkPasteLoading || bulkPasteSelected.size === 0}
                className="flex-1 py-2 text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {bulkPasteLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Users className="w-4 h-4" />
                )}
                {bulkPasteLoading ? 'Pasting...' : `Paste to ${bulkPasteSelected.size} Student${bulkPasteSelected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Unit to Course Modal */}
      {copyingUnit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-bold mb-1">Copy Unit</h3>
            <p className="text-sm text-gray-500 mb-4">
              Copy "<span className="font-medium">{copyingUnit.title}</span>" to:
            </p>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {availableCourses.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No other courses found</p>
              ) : (
                availableCourses.map((course) => (
                  <button
                    key={course.id}
                    disabled={copyingInProgress}
                    onClick={() => handleCopyUnitToCourse(course.id)}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    {course.title}
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => setCopyingUnit(null)}
              disabled={copyingInProgress}
              className="w-full py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default UnitList;
