import { useState, useEffect, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../supabase/client";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { useProgress } from "../../hooks/useProgress";
import Button from "../ui/Button";
import AssignExerciseModal from "./modals/AssignExerciseModal";
import EditExerciseModal from "../admin/ExerciseBank/EditExerciseModal";
import { getProgressSummary } from "../../utils/mcProgress";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

// Theme-based background images for exercise map
// Mobile (vertical) images
const themeBackgroundsMobile = {
  blue: assetUrl('/image/theme_exercise/ice1.webp'),
  green: assetUrl('/image/theme_exercise/forest1.webp'),
  purple: assetUrl('/image/theme_exercise/pirate1.webp'),
  orange: assetUrl('/image/theme_exercise/ninja1.webp'),
  red: assetUrl('/image/theme_exercise/dino.webp'),
  yellow: assetUrl('/image/theme_exercise/desert1.webp'),
};

// Desktop (horizontal) images - update these URLs with your horizontal images
const themeBackgroundsDesktop = {
  blue: assetUrl('/image/theme_exercise_PC/ice1.webp'), //blue
  green: assetUrl('/image/theme_exercise_PC/forest1.webp'), //forest
  purple: assetUrl('/image/theme_exercise_PC/pirate1.webp'), //pirate
  orange: assetUrl('/image/theme_exercise_PC/ninja1.webp'), //ninja
  red: assetUrl('/image/theme_exercise_PC/dino.webp'), // dino
  yellow: assetUrl('/image/theme_exercise_PC/desert1.webp'), //desert
};

const getThemeBackgroundImage = (colorTheme, isDesktop = false) => {
  const backgrounds = isDesktop
    ? themeBackgroundsDesktop
    : themeBackgroundsMobile;
  return backgrounds[colorTheme] || backgrounds.blue;
};
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
// Skeleton loading sẽ thay cho spinner
import {
  ArrowLeft,
  Lock,
  BookOpen,
  Plus,
  Edit,
  Trash2,
  GripVertical,
  Star,
  Map,
  List,
  Video,
  Headphones,
  Users,
  Palette,
  CheckCircle,
  ChevronRight,
} from "lucide-react";

import { getMapTheme } from "../../config/mapThemes";
import StudentStatsPopover from "../ui/StudentStatsPopover";
import HudPanel from "../ui/HudPanel";
import CourseOutline from "./CourseOutline";
import { CLIP } from "../ui/hudClip";
import useClassStats from "../../hooks/useClassStats";

import { assetUrl } from '../../hooks/useBranding';
// Every map theme in mapThemes.js exposes 11 node positions per page
const EXERCISES_PER_MAP_PAGE = 11;

// Returns indices of positions where real exercises should be placed
// customMappings comes from the theme config in mapThemes.js
function getExerciseIndices(count, positions, customMappings) {
  if (count <= 0) return [];
  if (count >= positions.length) {
    return positions.map((_, i) => i);
  }

  // Use theme-specific custom mappings if available
  if (customMappings && customMappings[count]) {
    return customMappings[count];
  }

  // Fall back to automatic calculation if no custom mapping exists
  const indices = [];
  for (let i = 0; i < count; i++) {
    const index = Math.round((i / (count - 1)) * (positions.length - 1));
    indices.push(index);
  }
  return indices;
}

// Placeholder rows shown while a session's exercises load (the rest of the page stays put)
const ListSkeleton = ({ count = 4 }) => (
  <div aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="relative pl-9 py-1.5">
        <HudPanel hoverGroup={false}>
          <div className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
            <div className="w-11 h-11 flex-shrink-0 bg-gray-200" style={{ clipPath: CLIP.icon }} />
            <div className="flex-1 min-w-0">
              <div className="h-4 w-1/3 bg-gray-200 mb-2" />
              <div className="h-3 w-1/4 bg-gray-100" />
            </div>
          </div>
        </HudPanel>
      </div>
    ))}
  </div>
);

ListSkeleton.propTypes = { count: PropTypes.number };

const OUTLINE_KEY = "courseOutlineOpen";
const readOutlineOpen = () => {
  if (typeof window === "undefined" || window.innerWidth < 1024) return false;
  try {
    return localStorage.getItem(OUTLINE_KEY) !== "false";
  } catch {
    return true;
  }
};

const EXERCISE_TYPE_LABELS = {
  flashcard: "Flashcards",
  pronunciation: "Pronunciation",
  fill_blank: "Fill in the blank",
  multiple_choice: "Multiple choice",
  dropdown: "Dropdown",
  drag_drop: "Drag and drop",
  ai_fill_blank: "AI fill in the blank",
  image_hotspot: "Image hotspot",
  color_fill: "Colour fill",
  pdf_worksheet: "Worksheet",
  speaking_assessment: "Speaking",
  video_upload: "Video upload",
  ielts_reading: "IELTS reading",
  listening_dictation: "Listening dictation",
};

const ExerciseList = () => {
  const {
    courseId: rawCourseId,
    unitId,
    sessionId,
  } = useParams();
  const sanitizeId = (v) => (v && v !== "undefined" && v !== "null" ? v : null);
  const courseId = sanitizeId(rawCourseId);
  const currentId = courseId;
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [unit, setUnit] = useState(null);
  const [session, setSession] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [allCourseSessions, setAllLevelSessions] = useState([]);
  const [sessionProgress, setSessionProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [units, setUnits] = useState([]);
  const [showAssignExerciseModal, setShowAssignExerciseModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState(null);
  // Session reward states
  const [sessionRewards, setSessionRewards] = useState({});
  const [claimingReward, setClaimingReward] = useState(null);
  const [rewardAmount, setRewardAmount] = useState(0);
  const [rewardGems, setRewardGems] = useState(0);
  const [showChestSelection, setShowChestSelection] = useState(false);
  const [selectedChest, setSelectedChest] = useState(null);
  const [otherCardsXP, setOtherCardsXP] = useState({}); // XP values for non-selected cards
  const [otherCardsGems, setOtherCardsGems] = useState({}); // Gem values for non-selected cards
  const [showLockedModal, setShowLockedModal] = useState(false);
  const [showOpenedModal, setShowOpenedModal] = useState(false);
  // View toggle state
  const [viewMode, setViewMode] = useState("map"); // 'map' (decorated courses) or 'list'
  // Position editor mode - for dragging nodes and getting coordinates
  const [positionEditorMode, setPositionEditorMode] = useState(false);
  const [editorTarget, setEditorTarget] = useState("nodes"); // 'nodes' or 'curves'
  const [editablePositions, setEditablePositions] = useState(null);
  const [editableControlPoints, setEditableControlPoints] = useState(null);
  const [draggingNode, setDraggingNode] = useState(null);
  const [draggingControlPoint, setDraggingControlPoint] = useState(null);
  const [pickedExerciseIndex, setPickedExerciseIndex] = useState(null);
  const [mapPage, setMapPage] = useState(0);
  const [outlineOpen, setOutlineOpenState] = useState(readOutlineOpen);
  const setOutlineOpen = (value) => {
    setOutlineOpenState(value);
    if (window.innerWidth >= 1024) {
      try {
        localStorage.setItem(OUTLINE_KEY, String(value));
      } catch {
        /* ignore */
      }
    }
  };
  const didInitMapPage = useRef(false);
  const mapContainerRef = useRef(null);
  // Desktop detection for responsive node positions
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : false,
  );
  const { user, profile } = useAuth();
  const { canCreateContent } = usePermissions();
  const { userProgress, fetchUserProgress } = useProgress();
  const { exerciseStats: exerciseClassStats } = useClassStats(courseId);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleExercisesAssigned = async () => {
    setShowAssignExerciseModal(false);
    // Refetch data to get the proper structure with assignment IDs
    await fetchData();
  };

  const handleEditExercise = async (exercise) => {
    try {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exercise.id)
        .single()
      if (error) throw error
      setEditingExercise(data)
    } catch (err) {
      console.error('Error fetching exercise for edit:', err)
      setEditingExercise(exercise)
    }
  }

  const handleDeleteExercise = async (exercise) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to remove the exercise "${exercise.title}" from this session?\n\nThis will only remove it from the session, not delete the exercise from the bank.`,
    );

    if (!confirmDelete) return;

    try {
      // Remove assignment instead of deleting exercise
      const { error } = await supabase
        .from("exercise_assignments")
        .delete()
        .eq("id", exercise.assignment_id);

      if (error) throw error;

      // Remove from local state
      setExercises((prev) => prev.filter((e) => e.id !== exercise.id));
    } catch (err) {
      console.error("Error removing exercise:", err);
      alert("Failed to remove exercise: " + (err.message || "Unknown error"));
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = exercises.findIndex((ex) => ex.id === active.id);
    const newIndex = exercises.findIndex((ex) => ex.id === over.id);

    const newExercises = arrayMove(exercises, oldIndex, newIndex);

    // Update local state immediately for smooth UX
    setExercises(newExercises);

    // Update order_index in database
    try {
      // Step 1: Set all order_index to negative temporary values to avoid conflicts
      const tempResults = await Promise.all(
        newExercises.map((ex, i) =>
          supabase
            .from("exercise_assignments")
            .update({ order_index: -(i + 1000) })
            .eq("id", ex.assignment_id),
        ),
      );
      const tempError = tempResults.find((r) => r.error);
      if (tempError?.error) throw tempError.error;

      // Step 2: Set to actual order_index values
      const finalResults = await Promise.all(
        newExercises.map((ex, i) =>
          supabase
            .from("exercise_assignments")
            .update({ order_index: i + 1 })
            .eq("id", ex.assignment_id),
        ),
      );
      const finalError = finalResults.find((r) => r.error);
      if (finalError?.error) throw finalError.error;

      // Update local state with new order_index values
      setExercises(
        newExercises.map((ex, idx) => ({
          ...ex,
          order_index: idx + 1,
        })),
      );

      console.log("✅ Exercise order updated successfully");
    } catch (err) {
      console.error("Error updating exercise order:", err);
      // Revert on error
      setExercises(exercises);
      alert(
        "Failed to update exercise order: " + (err.message || "Unknown error"),
      );
    }
  };

  const moveExerciseToPosition = async (fromIndex, toPosition) => {
    const targetIndex = toPosition - 1;
    if (targetIndex < 0 || targetIndex >= exercises.length || targetIndex === fromIndex) return;

    const newExercises = arrayMove(exercises, fromIndex, targetIndex);
    setExercises(newExercises);

    try {
      const tempResults = await Promise.all(
        newExercises.map((ex, i) =>
          supabase
            .from("exercise_assignments")
            .update({ order_index: -(i + 1000) })
            .eq("id", ex.assignment_id),
        ),
      );
      const tempError = tempResults.find((r) => r.error);
      if (tempError?.error) throw tempError.error;

      const finalResults = await Promise.all(
        newExercises.map((ex, i) =>
          supabase
            .from("exercise_assignments")
            .update({ order_index: i + 1 })
            .eq("id", ex.assignment_id),
        ),
      );
      const finalError = finalResults.find((r) => r.error);
      if (finalError?.error) throw finalError.error;

      setExercises(
        newExercises.map((ex, idx) => ({ ...ex, order_index: idx + 1 })),
      );
    } catch (err) {
      console.error("Error updating exercise order:", err);
      setExercises(exercises);
      alert("Failed to update exercise order: " + (err.message || "Unknown error"));
    }
  };

  const fetchData = useCallback(async (opts) => {
    // Derive effective course id if missing
    try {
      // fetchData({ silent: true }) refreshes in place without the full-page spinner
      if (!opts?.silent) setLoading(true);
      setError(null);

      // Step 1: ensure we have a course id
      let effectiveCourseId = currentId;
      let unitData = null;
      let sessionData = null;

      // Try to derive from unitId if courseId missing
      if (!effectiveCourseId && unitId) {
        const { data: uData, error: uErr } = await supabase
          .from("units")
          .select("*")
          .eq("id", unitId)
          .maybeSingle();
        if (uErr) throw uErr;
        unitData = uData;
        effectiveCourseId = uData?.course_id || null;
      }

      // Try to derive via session -> unit if still missing
      if (!effectiveCourseId && sessionId) {
        const { data: sData, error: sErr } = await supabase
          .from("sessions")
          .select("*")
          .eq("id", sessionId)
          .maybeSingle();
        if (sErr) throw sErr;
        sessionData = sData;
        if (sData?.unit_id && !unitData) {
          const { data: u2Data, error: u2Err } = await supabase
            .from("units")
            .select("*")
            .eq("id", sData.unit_id)
            .maybeSingle();
          if (u2Err) throw u2Err;
          unitData = u2Data;
          effectiveCourseId = u2Data?.course_id || null;
        }
      }

      if (!effectiveCourseId) {
        setLoading(false);
        setError(
          "Không xác định được khóa học từ URL. Vui lòng quay lại chọn đúng lộ trình.",
        );
        return;
      }

      // Step 2: fetch remaining data in parallel
      const [
        courseResult,
        unitResult,
        sessionResult,
        exercisesResult,
        allUnitsResult,
      ] = await Promise.all([
        supabase
          .from("courses")
          .select("*")
          .eq("id", effectiveCourseId)
          .single(),
        unitData
          ? Promise.resolve({ data: unitData, error: null })
          : supabase.from("units").select("*").eq("id", unitId).single(),
        sessionData
          ? Promise.resolve({ data: sessionData, error: null })
          : supabase.from("sessions").select("*").eq("id", sessionId).single(),
        supabase
          .from("exercise_assignments")
          .select(
            `
          id, session_id, exercise_id, order_index,
          exercises (id, title, exercise_type, xp_reward, is_active)
        `,
          )
          .eq("session_id", sessionId)
          .order("order_index"),
        supabase.from("units").select("id, course_id, unit_number, title").order("unit_number"),
      ]);

      if (courseResult.error) throw courseResult.error;
      if (unitResult.error) throw unitResult.error;
      if (sessionResult.error) throw sessionResult.error;
      if (exercisesResult.error) throw exercisesResult.error;
      if (allUnitsResult.error) throw allUnitsResult.error;

      // For students, verify they are enrolled - unless the course is public
      if (profile?.role === "user") {
        const { data: enrollmentData, error: enrollmentError } = await supabase
          .from("course_enrollments")
          .select("id")
          .eq("student_id", user.id)
          .eq("course_id", courseResult.data.id)
          .eq("is_active", true)
          .maybeSingle();
        const isEnrolled = !enrollmentError && !!enrollmentData;

        if (!isEnrolled && !courseResult.data?.is_public) {
          console.error("Student not enrolled in this course");
          setError("Bạn chưa được ghi danh vào khóa học này");
          navigate("/study");
          return;
        }

        // Free preview (mirrors UnitList): a public course with any free unit only
        // lets non-enrolled students into free units (or their own personal unit).
        const thisUnit = unitResult.data;
        if (!isEnrolled && !thisUnit?.is_free && thisUnit?.assigned_student_id !== user.id) {
          const { data: freeUnits, error: freeErr } = await supabase
            .from("units")
            .select("id")
            .eq("course_id", courseResult.data.id)
            .eq("is_free", true)
            .eq("is_active", true)
            .limit(1);
          // freeErr = column not migrated yet -> behave like before (course fully open)
          if (!freeErr && freeUnits?.length > 0) {
            setError("Phần này chỉ dành cho học viên đã ghi danh");
            navigate(`/study/course/${courseResult.data.id}`);
            return;
          }
        }
      }

      setCourse(courseResult.data);
      setUnit(unitResult.data);
      setSession(sessionResult.data);

      // Extract exercises from assignments
      const assignments = exercisesResult.data || [];
      const exercises = assignments.filter((assignment) => assignment.exercises?.id).map((assignment) => ({
        ...assignment.exercises,
        assignment_id: assignment.id,
        order_index: assignment.order_index,
      }));
      setExercises(exercises);

      // Debug logging for exercises
      console.log("📋 All exercise assignments loaded:", assignments);
      console.log("📋 Extracted exercises:", exercises);

      // Fetch all sessions for this course (for sidebar)
      // Build unit ids for this course
      const courseUnitIds =
        allUnitsResult.data
          ?.filter(
            (u) =>
              u.course_id === courseResult.data.id,
          )
          .map((u) => u.id) || [];
      const { data: allCourseSessions, error: allSessionsError } = await supabase
        .from("sessions")
        .select("*")
        .in("unit_id", courseUnitIds)
        .eq("is_active", true)
        .order("session_number");

      if (allSessionsError) {
        console.error("Error fetching all course sessions:", allSessionsError);
      }

      // Fetch session progress for sidebar
      const { data: sessionProgressData, error: sessionProgressError } =
        await supabase
          .from("session_progress")
          .select("*")
          .eq("user_id", user.id)
          .in("session_id", allCourseSessions?.map((s) => s.id) || []);

      if (sessionProgressError) {
        console.error("Error fetching session progress:", sessionProgressError);
      }

      // Exercises per session for progress. Sessions link exercises through exercise_assignments
      // (same source as the current session's list above and as UnitList), not exercises.session_id.
      const { data: allAssignments, error: exercisesErr } = await supabase
        .from("exercise_assignments")
        .select("session_id, exercise:exercises(id, xp_reward, is_active)")
        .in("session_id", allCourseSessions?.map((s) => s.id) || []);

      if (exercisesErr) {
        console.error("Error fetching exercises for progress:", exercisesErr);
      }

      const allExercises = (allAssignments || [])
        .filter((a) => a.exercise?.id)
        .map((a) => ({
          id: a.exercise.id,
          session_id: a.session_id,
          xp_reward: a.exercise.xp_reward,
          is_active: a.exercise.is_active,
        }));

      const exerciseIds = [...new Set(allExercises.map((e) => e.id))];

      // Fetch user's completed exercises among these
      const { data: userCompleted, error: userProgErr } = await supabase
        .from("user_progress")
        .select("exercise_id, status")
        .eq("user_id", user.id)
        .in("exercise_id", exerciseIds);

      if (userProgErr) {
        console.error("Error fetching user progress:", userProgErr);
      }

      // Build maps for progress calculation
      const sessionIdToExercises = {};
      allExercises?.forEach((ex) => {
        if (!sessionIdToExercises[ex.session_id])
          sessionIdToExercises[ex.session_id] = [];
        sessionIdToExercises[ex.session_id].push(ex);
      });

      const completedSet = new Set(
        (userCompleted || [])
          .filter((p) => p.status === "completed")
          .map((p) => p.exercise_id),
      );

      // Build session progress map with calculated values
      const sessionProgressMap = {};

      // Seed with DB rows first
      sessionProgressData?.forEach((progress) => {
        sessionProgressMap[progress.session_id] = progress;
      });

      // Fill/override computed fields
      allCourseSessions?.forEach((s) => {
        const list = sessionIdToExercises[s.id] || [];
        const total = list.length;
        const completedCount = list.filter((ex) =>
          completedSet.has(ex.id),
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
            // A stale "in_progress" row must not hide a session whose exercises are all done
            status:
              total > 0 && completedCount === total ? "completed" : existing.status,
            xp_earned: Math.max(existing.xp_earned || 0, xpEarned),
            progress_percentage: Math.max(
              existing.progress_percentage || 0,
              percentage,
            ),
          };
        } else {
          sessionProgressMap[s.id] = {
            user_id: user.id,
            session_id: s.id,
            status:
              total > 0 && completedCount === total
                ? "completed"
                : completedCount > 0
                  ? "in_progress"
                  : "not_started",
            xp_earned: xpEarned,
            progress_percentage: percentage,
          };
        }
      });

      setUnits(allUnitsResult.data || []);
      setAllLevelSessions(allCourseSessions || []);
      setSessionProgress(sessionProgressMap);
    } catch (err) {
      console.error("Error fetching exercises:", err);
      setError("Không thể tải danh sách exercise");
    } finally {
      setLoading(false);
    }
  }, [courseId, unitId, sessionId]);

  useEffect(() => {
    if (user && unitId && sessionId) {
      fetchData();
    }
  }, [fetchData]);

  // Redirect to test runner if session is marked as test (students only)
  useEffect(() => {
    if (session?.is_test && !canCreateContent()) {
      navigate(`/study/test-runner?sessionId=${sessionId}&courseId=${courseId}&unitId=${unitId}`, { replace: true })
    }
  }, [session])

  // Refresh progress when userProgress changes
  useEffect(() => {
    if (userProgress.length > 0) {
      console.log("📊 Progress updated in ExerciseList:", userProgress);
    }
  }, [userProgress]);

  // Bottom nav Back: go back to unit view (session list)
  useEffect(() => {
    const handleBottomNavBack = () => {
      console.log('🎯 Bottom nav "Back" clicked in ExerciseList');
      const base = courseId
        ? `/study/course/${courseId}`
        : `/study/course/${unit?.course_id || course?.id}`;
      navigate(`${base}/unit/${unitId}`);
    };

    window.addEventListener("bottomNavBack", handleBottomNavBack);
    return () =>
      window.removeEventListener("bottomNavBack", handleBottomNavBack);
  }, [courseId, unitId, navigate]);

  // Handle window resize for responsive node positions
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle node drag in editor mode
  const handleNodeDrag = useCallback(
    (e) => {
      if (!mapContainerRef.current) return;

      const rect = mapContainerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      // Clamp values between 0 and 100
      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));

      if (draggingNode !== null) {
        setEditablePositions((prev) => {
          if (!prev) return prev;
          const newPositions = [...prev];
          newPositions[draggingNode] = {
            x: Math.round(clampedX),
            y: Math.round(clampedY),
          };
          return newPositions;
        });
      } else if (draggingControlPoint !== null) {
        setEditableControlPoints((prev) => {
          if (!prev) return prev;
          const newPoints = [...prev];
          newPoints[draggingControlPoint] = {
            x: Math.round(clampedX),
            y: Math.round(clampedY),
          };
          return newPoints;
        });
      }
    },
    [draggingNode, draggingControlPoint],
  );

  // Global mouse move/up handlers for dragging
  useEffect(() => {
    if (!positionEditorMode) return;

    const handleMouseMove = (e) => handleNodeDrag(e);
    const handleMouseUp = () => {
      setDraggingNode(null);
      setDraggingControlPoint(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [positionEditorMode, handleNodeDrag]);

  // Jump to the page containing the first incomplete exercise on initial load
  useEffect(() => {
    if (didInitMapPage.current) return;
    if (exercises.length === 0) return;
    const idx = exercises.findIndex((ex) => {
      const p = userProgress.find((pr) => pr.exercise_id === ex.id);
      return !p || p.status !== "completed";
    });
    if (idx > 0) {
      setMapPage(Math.floor(idx / EXERCISES_PER_MAP_PAGE));
    }
    didInitMapPage.current = true;
  }, [exercises, userProgress]);

  const getExerciseIcon = (exerciseType) => {
    const IconImg = ({ src, className = "" }) => (
      <img src={src} alt="" className={className} />
    );

    const icons = {
      fill_blank: (props) => (
        <IconImg
          src={assetUrl('/icon/exercise_type/fill_blank.svg')}
          {...props}
        />
      ),
      drag_drop: (props) => (
        <IconImg
          src={assetUrl('/icon/exercise_type/drag_drop.svg')}
          {...props}
        />
      ),
      multiple_choice: (props) => (
        <IconImg
          src={assetUrl('/icon/exercise_type/multiple_choice.svg')}
          {...props}
        />
      ),
      dropdown: (props) => (
        <IconImg
          src={assetUrl('/icon/exercise_type/drop_down.svg')}
          {...props}
        />
      ),
      ai_fill_blank: (props) => (
        <IconImg
          src={assetUrl('/icon/exercise_type/fill_blank.svg')}
          {...props}
        />
      ),
      flashcard: (props) => (
        <IconImg
          src={assetUrl('/icon/exercise_type/flashcard.svg')}
          {...props}
        />
      ),
      image_hotspot: (props) => (
        <IconImg
          src={assetUrl('/icon/exercise_type/hotspot.svg')}
          {...props}
        />
      ),
      pdf_worksheet: (props) => (
        <IconImg
          src={assetUrl('/icon/exercise_type/fill_blank.svg')}
          {...props}
        />
      ),
      speaking_assessment: (props) => (
        <IconImg
          src={assetUrl('/icon/exercise_type/pronunciation.svg')}
          {...props}
        />
      ),
      video_upload: (props) => <Video {...props} />,
      color_fill: (props) => <Palette {...props} />,
      ielts_reading: (props) => <BookOpen {...props} />,
      listening_dictation: (props) => <Headphones {...props} />,
    };
    return icons[exerciseType] || ((props) => <BookOpen {...props} />);
  };

  const getExerciseColor = (exerciseType) => {
    const colors = {
      flashcard: "text-blue-600 bg-blue-100",
      fill_blank: "text-purple-600 bg-purple-100",
      multiple_choice: "text-orange-600 bg-orange-100",
      dropdown: "text-indigo-600 bg-indigo-100",
      image_hotspot: "text-cyan-600 bg-cyan-100",
      color_fill: "text-pink-600 bg-pink-100",
      pdf_worksheet: "text-rose-600 bg-rose-100",
      speaking_assessment: "text-violet-600 bg-violet-100",
      video_upload: "text-teal-600 bg-teal-100",
      ielts_reading: "text-sky-600 bg-sky-100",
      listening_dictation: "text-indigo-600 bg-indigo-100",
    };
    return colors[exerciseType] || "text-gray-600 bg-gray-100";
  };

  const getThemeColors = (colorTheme) => {
    const themes = {
      green: {
        bg: "from-green-400 to-emerald-500",
        text: "text-green-700",
        border: "border-green-200",
        icon: "bg-green-100 text-green-600",
      },
      blue: {
        bg: "from-blue-400 to-indigo-500",
        text: "text-blue-700",
        border: "border-blue-200",
        icon: "bg-blue-100 text-blue-600",
      },
      purple: {
        bg: "from-purple-400 to-pink-500",
        text: "text-purple-700",
        border: "border-purple-200",
        icon: "bg-purple-100 text-purple-600",
      },
      orange: {
        bg: "from-orange-400 to-red-500",
        text: "text-orange-700",
        border: "border-orange-200",
        icon: "bg-orange-100 text-orange-600",
      },
    };
    return themes[colorTheme] || themes.blue;
  };

  const getExerciseStatus = (exercise, index) => {
    const progress = userProgress.find((p) => p.exercise_id === exercise.id);

    // All exercises are now always available (unlocked)
    if (!progress) {
      return { status: "available", canAccess: true };
    }

    return {
      status: progress.status,
      canAccess: true, // Always allow access
    };
  };

  // Started-but-unfinished marker for students. Multiple choice shows how far they got, read from
  // the local resume snapshot (same device only); other types / other devices just get a label.
  // compact = small pill for map nodes.
  const renderUnfinished = (exercise, status, compact = false) => {
    if (canCreateContent() || status !== "in_progress") return null;
    const resume =
      exercise.exercise_type === "multiple_choice" && user
        ? getProgressSummary(user.id, exercise.id, exercise.updated_at)
        : null;
    if (compact) {
      return (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 md:mt-2 px-1.5 py-0.5 rounded-full bg-white/90 shadow text-[9px] md:text-xs font-bold text-amber-600 whitespace-nowrap">
          {resume ? `${resume.answered}/${resume.total}` : "..."}
        </div>
      );
    }
    return (
      <div className="mt-1.5 flex items-center gap-2">
        {resume ? (
          <>
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full"
                style={{ width: `${Math.round((resume.answered / resume.total) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 flex-shrink-0">
              {resume.answered}/{resume.total}
            </span>
          </>
        ) : (
          <span className="text-xs text-amber-600">Đang làm dở</span>
        )}
      </div>
    );
  };

  // Get star count based on score: 95-100 = 3 stars, 90-95 = 2 stars, passed (<90) = 1 star, not passed = 0 stars
  const getStarCount = (score, status, max_score = 100) => {
    if (status !== "completed") return 0;

    // Calculate percentage if max_score is provided and not 100
    const scorePercent = max_score && max_score !== 100 ? (score / max_score) * 100 : score;

    if (scorePercent >= 95) return 3;
    if (scorePercent >= 90) return 2;
    if (scorePercent > 0) return 1;
    return 0;
  };

  // Render stars component
  const renderStars = (score, status, max_score) => {
    console.log(`⭐ renderStars called: score=${score}, status=${status}, max_score=${max_score}`);
    const starCount = getStarCount(score, status, max_score);
    console.log(`⭐ starCount=${starCount}`);
    if (starCount === 0) return null;

    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3].map((i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${
              i <= starCount
                ? "text-yellow-400 fill-yellow-400"
                : "text-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  const getExercisePath = (exercise) => {
    // Map exercise types to their corresponding paths
    const paths = {
      flashcard: "/study/flashcard",
      fill_blank: "/study/fill-blank",
      multiple_choice: "/study/multiple-choice",
      drag_drop: "/study/drag-drop",
      dropdown: "/study/dropdown",
      ai_fill_blank: "/study/ai-fill-blank",
      pronunciation: "/study/pronunciation",
      image_hotspot: "/study/image-hotspot",
      color_fill: "/study/color-fill",
      pdf_worksheet: "/study/pdf-worksheet",
      speaking_assessment: "/study/speaking-assessment",
      video_upload: "/study/video-upload",
      ielts_reading: "/study/ielts-reading",
      listening_dictation: "/study/listening-dictation",
    };

    const basePath = paths[exercise.exercise_type] || "/study/flashcard";
    console.log(
      "🔍 Exercise type:",
      exercise.exercise_type,
      "Available paths:",
      Object.keys(paths),
      "Selected path:",
      basePath,
    );
    return basePath;
  };

  // Check if all exercises in the session are completed with at least 2 stars
  const isSessionComplete = () => {
    if (exercises.length === 0) return false;
    return exercises.every((exercise) => {
      const progress = userProgress.find((p) => p.exercise_id === exercise.id);
      if (!progress || progress.status !== "completed") return false;
      // Check if score is at least 80 (2 stars requirement)
      const scorePercent = progress.max_score && progress.max_score !== 100
        ? (progress.score / progress.max_score) * 100
        : progress.score;
      return scorePercent >= 80;
    });
  };

  // Fetch session rewards
  const fetchSessionRewards = async () => {
    if (!user || !sessionId) return;

    try {
      const { data, error } = await supabase
        .from("session_reward_claims")
        .select("session_id, xp_awarded, gems_awarded, claimed_at")
        .eq("user_id", user.id)
        .eq("session_id", sessionId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching session rewards:", error);
        return;
      }

      if (data) {
        setSessionRewards({
          [sessionId]: {
            claimed: true,
            xp: data.xp_awarded,
            gems: data.gems_awarded || 0,
            claimed_at: data.claimed_at,
          },
        });
      }
    } catch (err) {
      console.error("Error fetching session rewards:", err);
    }
  };

  // Handle claiming session reward
  const handleClaimReward = async () => {
    // TODO: TEMPORARY - Remove these comments after testing  -- reward bypass
    if (!user || claimingReward || sessionRewards[sessionId]?.claimed) return;
    if (!isSessionComplete()) return;

    // Show chest selection modal
    setShowChestSelection(true);
  };

  const handleChestSelect = async (chestNumber) => {
    if (selectedChest !== null) return;

    setSelectedChest(chestNumber);
    setClaimingReward(sessionId);

    // Play chest opening sound
    const audio = new Audio(assetUrl('/sound/woosh.mp3'));
    audio.play().catch((err) => console.error("Error playing sound:", err));

    try {
      // Randomly award either XP or Gems, not both
      const gemChance = 0.10 + (exercises.length * 0.01); // 10% base + 1% per exercise
      const isGemReward = Math.random() < gemChance;

      let xp = 0;
      let gems = 0;
      if (isGemReward) {
        gems = Math.random() < 0.7 ? 1 : 2; // 70% chance 1 gem, 30% chance 2 gems
      } else {
        xp = 5 + exercises.length * 5 + (Math.floor(Math.random() * 10) + 1);
      }

      // Set reward amounts immediately so they show when card flips
      setRewardAmount(xp);
      setRewardGems(gems);

      // Generate random rewards for other cards (what they "could have been")
      const otherXP = {};
      const otherGems = {};
      [1, 2, 3].forEach((num) => {
        if (num !== chestNumber) {
          const otherIsGem = Math.random() < 0.3;
          if (otherIsGem) {
            otherXP[num] = 0;
            otherGems[num] = Math.floor(Math.random() * 2) + 1;
          } else {
            otherXP[num] =
              5 + exercises.length * 3 + (Math.floor(Math.random() * 10) + 1);
            otherGems[num] = 0;
          }
        }
      });
      setOtherCardsXP(otherXP);
      setOtherCardsGems(otherGems);

      // Insert claim record
      const { error: claimError } = await supabase
        .from("session_reward_claims")
        .insert({
          user_id: user.id,
          session_id: sessionId,
          full_name: profile?.full_name || null,
          xp_awarded: xp,
          gems_awarded: gems,
        });

      if (claimError) throw claimError;

      // Update user's totals (only the awarded currency)
      const { data: currentUser, error: fetchError } = await supabase
        .from("users")
        .select("xp, gems")
        .eq("id", user.id)
        .single();

      if (fetchError) throw fetchError;

      const updateData = { updated_at: new Date().toISOString() };
      if (xp > 0) updateData.xp = (currentUser?.xp || 0) + xp;
      if (gems > 0) updateData.gems = (currentUser?.gems || 0) + gems;

      const { error: updateError } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", user.id);

      if (updateError) throw updateError;

      // Reward is now shown until user clicks OK
    } catch (err) {
      console.error("Error claiming reward:", err);
      alert("Không thể nhận phần thưởng. Vui lòng thử lại!");
      setClaimingReward(null);
      setSelectedChest(null);
      setShowChestSelection(false);
      setOtherCardsXP({});
    }
  };

  const handleRewardDismiss = () => {
    setSessionRewards((prev) => ({
      ...prev,
      [sessionId]: {
        claimed: true,
        xp: rewardAmount,
        gems: rewardGems,
        claimed_at: new Date().toISOString(),
      },
    }));
    setShowChestSelection(false);
    setClaimingReward(null);
    setSelectedChest(null);
    setRewardAmount(0);
    setRewardGems(0);
    setOtherCardsXP({});
    setOtherCardsGems({});
  };

  // Fetch session rewards on mount
  useEffect(() => {
    if (user && sessionId) {
      fetchSessionRewards();
    }
  }, [user, sessionId]);

  // Sortable Exercise Card Component
  const openExercise = (exercise) => {
    navigate(
      `${getExercisePath(exercise)}?exerciseId=${exercise.id}&sessionId=${sessionId}&courseId=${courseId}&unitId=${unitId}`,
    );
  };

  // One exercise in the study path: a cut-corner card on a thin progress rail.
  const SortableExerciseCard = ({ exercise, index }) => {
    const { setNodeRef, transform, transition, isDragging } = useSortable({
      id: exercise.id,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const { status } = getExerciseStatus(exercise, index);
    const progress = userProgress.find((p) => p.exercise_id === exercise.id);
    const ExerciseIcon = getExerciseIcon(exercise.exercise_type);
    const isTeacher = canCreateContent();
    const isDone = status === "completed";
    const isNext = !isTeacher && nextExercise?.id === exercise.id;
    const prevDone =
      index > 0 &&
      getExerciseStatus(exercises[index - 1], index - 1).status === "completed";
    const isFirst = index === 0;
    const isLast = index === exercises.length - 1;
    const statusText = isDone
      ? "Completed"
      : status === "in_progress"
        ? "In progress"
        : "Not started";

    return (
      <div ref={setNodeRef} style={style} className="relative pl-9 py-1.5">
        {/* Progress rail: green where the path has been completed */}
        <span
          className={`absolute left-3 w-px -translate-x-1/2 top-0 h-1/2 ${prevDone ? "bg-emerald-400" : "bg-gray-300"} ${isFirst ? "hidden" : ""}`}
        />
        <span
          className={`absolute left-3 w-px -translate-x-1/2 top-1/2 h-1/2 ${isDone ? "bg-emerald-400" : "bg-gray-300"} ${isLast ? "hidden" : ""}`}
        />
        <span
          className={`absolute left-3 top-1/2 -translate-x-1/2 -translate-y-1/2 border ${
            isDone
              ? "w-3 h-3 bg-emerald-500 border-emerald-500"
              : isNext
                ? "w-3 h-3 bg-blue-500 border-blue-500"
                : "w-2.5 h-2.5 bg-white border-gray-300"
          }`}
        />

        <HudPanel
          tone="default"
          accentBar={isNext}
          onClick={() => openExercise(exercise)}
          className="cursor-pointer"
        >
          <div className="flex items-center gap-3 md:gap-4 px-3 py-3 md:px-4 md:py-3.5">
            {/* Reorder handle - admins/teachers only (click to pick up, click a destination) */}
            {isTeacher && (
              <button
                type="button"
                className={`flex-shrink-0 p-1 transition-colors ${
                  pickedExerciseIndex === index
                    ? "text-blue-600 bg-blue-100"
                    : pickedExerciseIndex !== null
                      ? "text-green-600 bg-green-50 hover:bg-green-100 ring-2 ring-green-400"
                      : "text-gray-300 hover:text-gray-600 hover:bg-gray-100"
                }`}
                title={
                  pickedExerciseIndex === index
                    ? "Click another exercise to place it here"
                    : pickedExerciseIndex !== null
                      ? "Click to place here"
                      : "Click to pick up, then click destination"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (pickedExerciseIndex === null) {
                    setPickedExerciseIndex(index);
                  } else if (pickedExerciseIndex === index) {
                    setPickedExerciseIndex(null);
                  } else {
                    moveExerciseToPosition(pickedExerciseIndex, index + 1);
                    setPickedExerciseIndex(null);
                  }
                }}
              >
                <GripVertical className="w-5 h-5" />
              </button>
            )}

            <span className="hidden sm:block flex-shrink-0 font-mono text-xs font-bold tracking-widest text-gray-300">
              {String(index + 1).padStart(2, "0")}
            </span>

            <div
              className={`flex-shrink-0 w-11 h-11 flex items-center justify-center border border-gray-200 ${getExerciseColor(exercise.exercise_type)}`}
              style={{ clipPath: CLIP.icon }}
            >
              <ExerciseIcon className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="truncate text-sm md:text-base font-semibold text-gray-900">
                {exercise.title || EXERCISE_TYPE_LABELS[exercise.exercise_type]}
              </h3>
              <p className="mt-0.5 text-xs text-gray-500 truncate">
                {EXERCISE_TYPE_LABELS[exercise.exercise_type] || "Exercise"}
                <span className="mx-1.5 text-gray-300">/</span>
                <span className={isDone ? "text-emerald-600 font-medium" : status === "in_progress" ? "text-amber-600 font-medium" : ""}>
                  {statusText}
                </span>
              </p>
              {renderUnfinished(exercise, status)}
            </div>

            {/* Students: stars */}
            {!isTeacher && renderStars(progress?.score, status, progress?.max_score)}

            {/* Teachers: class completion + actions */}
            {isTeacher && exerciseClassStats?.[exercise.id] && (
              <StudentStatsPopover
                stats={exerciseClassStats[exercise.id]}
                size="sm"
                position="bottom"
                courseId={courseId}
                sessionId={sessionId}
              />
            )}
            {isTeacher && (
              <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                {profile?.role === "admin" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditExercise(exercise);
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    title="Edit exercise"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteExercise(exercise);
                  }}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Delete exercise"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            <ChevronRight className="flex-shrink-0 w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
          </div>
        </HudPanel>
      </div>
    );
  };

  // First load only: the page frame with placeholders. Later loads keep the page and only
  // swap the list for a skeleton (see `switching` below).
  if (loading && !course) {
    return (
      <div className="relative w-full h-[100vh] overflow-hidden">
        <div className="relative w-full h-full overflow-hidden bg-gray-50">
          <div className="absolute inset-0 overflow-y-auto z-10 pt-28 md:pt-32 pb-24 px-4">
            <div className="max-w-3xl mx-auto">
              <ListSkeleton count={5} />
            </div>
          </div>
          <div className="absolute top-0 inset-x-0 z-50 p-2 md:p-4 pointer-events-none">
            <HudPanel tone="glass" hoverGroup={false} className="mx-auto max-w-3xl">
              <div className="flex items-center gap-3 p-3 animate-pulse">
                <div className="w-10 h-10 flex-shrink-0 bg-gray-200" style={{ clipPath: CLIP.icon }} />
                <div className="flex-1">
                  <div className="h-4 w-1/3 bg-gray-200 mb-2" />
                  <div className="h-2.5 bg-gray-100" />
                </div>
              </div>
            </HudPanel>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">{error}</div>
        <Button onClick={fetchData} variant="outline">
          Thử lại
        </Button>
      </div>
    );
  }

  if (!session || !unit || !course) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600 mb-4">Không tìm thấy thông tin</div>
        <Button
          onClick={() => navigate(`/study/course/${courseId}/unit/${unitId}`)}
          variant="outline"
        >
          Quay lại
        </Button>
      </div>
    );
  }

  const theme = getThemeColors(
    session.color_theme || unit.color_theme || course.color_theme,
  );
  const colorTheme =
    session?.color_theme || unit?.color_theme || course?.color_theme || "blue";
  const mapTheme = getMapTheme(colorTheme);
  // decorated = themed map; anything else (minimal, the default) = study-path list
  const isDecorated = course?.ui_style === "decorated";
  // Loading a different session: keep the top bar and outline, show placeholders for the list
  const switching = loading && session?.id !== sessionId;
  const shownTitle = switching
    ? allCourseSessions.find((x) => x.id === sessionId)?.title || ""
    : session.title;
  const emptyState = (
    <HudPanel hoverGroup={false} className="mx-auto w-full max-w-md">
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span
          className="flex h-12 w-12 items-center justify-center border border-gray-300 text-gray-400"
          style={{ clipPath: CLIP.icon }}
        >
          <BookOpen className="w-6 h-6" />
        </span>
        <h3 className="text-base font-bold tracking-tight text-gray-900">
          {canCreateContent() ? "No exercises yet" : "Exercises coming soon"}
        </h3>
        <p className="text-sm text-gray-500">
          {canCreateContent()
            ? "Add exercises from the bank to build this session."
            : "Exercises for this session haven't been added yet. Check back soon."}
        </p>
        {canCreateContent() && (
          <button
            type="button"
            onClick={() => setShowAssignExerciseModal(true)}
            className="mt-1 inline-flex items-center gap-2 bg-blue-500 px-6 py-2.5 text-sm font-bold text-white transition-all hover:brightness-110"
            style={{ clipPath: CLIP.btn }}
          >
            <Plus className="w-4 h-4" />
            Add exercises
          </button>
        )}
      </div>
    </HudPanel>
  );
  const activeView = isDecorated ? viewMode : "list";
  // The course outline lives beside the list view; the map view stays full screen.
  const showOutline = activeView === "list" && allCourseSessions.length > 0;
  const outlineShift = showOutline && outlineOpen ? "lg:left-72" : "lg:left-0";

  // Use desktop positions if available and on desktop, otherwise use mobile positions
  const allPositions =
    isDesktop && mapTheme.desktopPositions
      ? mapTheme.desktopPositions
      : mapTheme.positions;
  const curveControlPoints =
    isDesktop && mapTheme.desktopControlPoints
      ? mapTheme.desktopControlPoints
      : mapTheme.controlPoints;

  const exercisesPerPage = EXERCISES_PER_MAP_PAGE;
  const totalMapPages = Math.max(1, Math.ceil(exercises.length / exercisesPerPage));
  const currentMapPage = Math.min(mapPage, totalMapPages - 1);

  // Generate the 11 levels for the current page (real exercises + dummy nodes)
  const generateLevels = () => {
    const pageStart = currentMapPage * exercisesPerPage;
    const pageExercises = exercises.slice(
      pageStart,
      pageStart + exercisesPerPage,
    );

    // Use desktop mappings on PC, mobile mappings on mobile
    const customMappings =
      isDesktop && mapTheme.desktopCustomMappings
        ? mapTheme.desktopCustomMappings
        : mapTheme.customMappings;
    const exerciseIndices = getExerciseIndices(
      pageExercises.length,
      allPositions,
      customMappings,
    );

    // Find the first incomplete exercise index (across all pages)
    const currentExerciseIndex = exercises.findIndex((ex) => {
      const p = userProgress.find((pr) => pr.exercise_id === ex.id);
      return !p || p.status !== "completed";
    });

    let exerciseCounter = 0;

    const levels = allPositions.map((pos, posIndex) => {
      const isRealExercise = exerciseIndices.includes(posIndex);

      if (isRealExercise && exerciseCounter < pageExercises.length) {
        const exercise = pageExercises[exerciseCounter];
        const absoluteIndex = pageStart + exerciseCounter;
        const progress = userProgress.find(
          (p) => p.exercise_id === exercise.id,
        );
        const stars =
          progress?.status === "completed"
            ? getStarCount(progress?.score, progress?.status, progress?.max_score)
            : 0;
        const isCurrent = absoluteIndex === currentExerciseIndex;

        const node = {
          id: exercise.id,
          positionIndex: posIndex,
          exerciseNumber: absoluteIndex + 1,
          title: exercise.title,
          x: pos.x,
          y: pos.y,
          stars,
          unlocked: true,
          current: isCurrent,
          completed: progress?.status === "completed",
          exercise,
          isDummy: false,
        };
        exerciseCounter++;
        return node;
      } else {
        // Dummy node
        return {
          id: `dummy-${posIndex}`,
          positionIndex: posIndex,
          exerciseNumber: null,
          title: null,
          x: pos.x,
          y: pos.y,
          stars: 0,
          unlocked: false,
          current: false,
          completed: false,
          exercise: null,
          isDummy: true,
        };
      }
    });

    // Set dummy nodes' completed status based on the next real exercise
    // A dummy node is completed if the next real exercise is completed
    for (let i = levels.length - 1; i >= 0; i--) {
      if (levels[i].isDummy) {
        // Find the next real exercise
        for (let j = i + 1; j < levels.length; j++) {
          if (!levels[j].isDummy) {
            levels[i].completed = levels[j].completed;
            break;
          }
        }
      }
    }

    return levels;
  };

  // Initialize editable positions when entering editor mode
  const initEditablePositions = () => {
    setEditablePositions([...allPositions]);
    setEditableControlPoints([...curveControlPoints]);
  };

  // Copy positions to clipboard
  const copyPositionsToClipboard = () => {
    const positionsStr = editablePositions
      .map((pos, i) => `      { x: ${pos.x}, y: ${pos.y} },  // ${i + 1}`)
      .join("\n");
    navigator.clipboard.writeText(positionsStr);
    alert(
      "Positions copied to clipboard! Paste into mapThemes.js → desktopPositions",
    );
  };

  // Copy control points to clipboard
  const copyControlPointsToClipboard = () => {
    const pointsStr = editableControlPoints
      .map(
        (pos, i) =>
          `      { x: ${pos.x}, y: ${pos.y} },   // curve ${i + 1} → ${i + 2}`,
      )
      .join("\n");
    navigator.clipboard.writeText(pointsStr);
    alert(
      "Control points copied to clipboard! Paste into mapThemes.js → desktopControlPoints",
    );
  };

  const levels = exercises.length > 0 ? generateLevels() : [];

  // Progress summary for the top bar
  const completedCount = exercises.filter(
    (ex) => userProgress.find((p) => p.exercise_id === ex.id)?.status === "completed",
  ).length;
  const earnedStars = exercises.reduce((sum, ex) => {
    const p = userProgress.find((pr) => pr.exercise_id === ex.id);
    return sum + (p ? getStarCount(p.score, p.status, p.max_score) : 0);
  }, 0);
  const progressPct = exercises.length
    ? Math.round((completedCount / exercises.length) * 100)
    : 0;
  const chestReady =
    !sessionRewards[sessionId]?.claimed && isSessionComplete();
  const nextIndex = exercises.findIndex(
    (ex) => userProgress.find((p) => p.exercise_id === ex.id)?.status !== "completed",
  );
  const nextExercise = nextIndex >= 0 ? exercises[nextIndex] : null;

  const handleChestClick = () => {
    // TODO: TEMPORARY - Restore original conditions after testing -- reward bypass (just keep handleClaimReward)
    if (isSessionComplete() && !sessionRewards[sessionId]?.claimed) {
      handleClaimReward();
    } else if (
      !isSessionComplete() &&
      !sessionRewards[sessionId]?.claimed
    ) {
      setShowLockedModal(true);
    } else if (sessionRewards[sessionId]?.claimed) {
      setShowOpenedModal(true);
    }
  };

  // Level Node Component
  // States: done (green + check + stars), current (blue, pulsing, title chip), todo (white), dummy (path dot)
  const LevelNode = ({ level, nodeIndex }) => {
    const {
      exerciseNumber,
      x,
      y,
      stars,
      unlocked,
      current,
      completed,
      exercise,
      isDummy,
    } = level;

    // Use editable position in editor mode
    const displayX =
      positionEditorMode && editablePositions
        ? (editablePositions[nodeIndex]?.x ?? x)
        : x;
    const displayY =
      positionEditorMode && editablePositions
        ? (editablePositions[nodeIndex]?.y ?? y)
        : y;

    const handleClick = () => {
      if (positionEditorMode) return; // Don't navigate in editor mode
      if (unlocked && !isDummy) {
        navigate(
          `${getExercisePath(exercise)}?exerciseId=${exercise.id}&sessionId=${sessionId}&courseId=${courseId}&unitId=${unitId}`,
        );
      }
    };

    const handleMouseDown = (e) => {
      if (!positionEditorMode || editorTarget !== "nodes") return;
      e.preventDefault();
      setDraggingNode(nodeIndex);
    };

    const isNodeEditMode = positionEditorMode && editorTarget === "nodes";
    const interactive = unlocked && !isDummy && !isNodeEditMode;
    const position = { left: `${displayX}%`, top: `${displayY}%` };

    // Small grey dot on the path between exercises
    if (isDummy) {
      return (
        <div
          className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 ${isNodeEditMode ? "cursor-move select-none" : ""}`}
          style={position}
          onMouseDown={handleMouseDown}
        >
          <span className="relative block w-[14px] h-[14px] md:w-[32px] md:h-[32px]">
            <span className="absolute inset-0 rounded-full bg-gray-600" />
            <span className="absolute inset-0 rounded-full bg-gray-400 -translate-y-[10%]" />
          </span>
        </div>
      );
    }

    const progressStatus = userProgress.find(
      (p) => p.exercise_id === exercise?.id,
    )?.status;

    return (
      <div
        className={`group absolute -translate-x-1/2 -translate-y-1/2 ${isNodeEditMode ? "cursor-move select-none" : interactive ? "cursor-pointer" : "cursor-default"} ${current ? "z-20" : "z-10"} ${isNodeEditMode ? "" : "transition-all duration-300"}`}
        style={position}
        onMouseDown={handleMouseDown}
      >
        {/* Title chip: always shown on the current exercise, on hover/focus for the rest */}
        {exercise?.title && !isNodeEditMode && (
          <div
            className={`absolute bottom-full inset-x-0 mb-2 md:mb-3 flex justify-center pointer-events-none z-30 transition-opacity ${current ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
          >
            <div className={current ? "animate-bounce" : ""}>
              <div
                className={`shrink-0 max-w-[10rem] md:max-w-[16rem] truncate whitespace-nowrap px-3 py-1 rounded-full text-[11px] md:text-sm font-semibold shadow-lg ${current ? "bg-blue-600 text-white" : "bg-slate-900/85 text-white"}`}
              >
                {exercise.title}
              </div>
            </div>
          </div>
        )}

        <div className="relative flex items-center justify-center">
          <button
            type="button"
            aria-label={`Exercise ${exerciseNumber}${exercise?.title ? `: ${exercise.title}` : ""}`}
            className={`relative outline-none border-none transition-all duration-300 ${
              !unlocked
                ? "w-[50px] h-[50px] md:w-[72px] md:h-[72px] cursor-not-allowed" // locked which is not used
                : "w-[42px] h-[42px] md:w-[72px] md:h-[72px]" // exercise node
            }`}
            onClick={handleClick}
          >
            {/* Back shadow layer */}
            <span
              className={`absolute inset-0 rounded-full ${
                !unlocked
                  ? "bg-gray-500"
                  : current
                    ? "bg-blue-700"
                    : completed
                      ? "bg-emerald-700"
                      : "bg-gray-600"
              }`}
            />
            {/* Front button layer */}
            <span
              className={`absolute inset-0 rounded-full flex items-center justify-center transition-all duration-150 -translate-y-[10%] ${
                !unlocked
                  ? "bg-gray-300"
                  : current
                    ? "bg-blue-400 active:translate-y-0 active:shadow-none"
                    : completed
                      ? "bg-emerald-400 active:translate-y-0 active:shadow-none"
                      : "bg-gray-400 active:translate-y-0 active:shadow-none"
              }`}
              style={{ boxShadow: "0 0.5em 1em -0.2em rgba(0, 0, 0, 0.3)" }}
            >
              <span
                className={`text-xl md:text-3xl font-bold ${completed || current ? "text-white" : "text-gray-700"}`}
              >
                {exerciseNumber}
              </span>
            </span>
          </button>
        </div>

        {!completed && exercise && renderUnfinished(exercise, progressStatus, true)}
        {completed && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 flex gap-0.5 mt-1 justify-center items-center">
            {[1, 2, 3].map((star) => (
              <img
                key={star}
                src={
                  star <= stars
                    ? assetUrl('/image/star_fill.png')
                    : assetUrl('/image/star_empty.png')
                }
                alt={star <= stars ? "Star filled" : "Star empty"}
                className="w-4 h-4 md:w-8 md:h-8 block"
              />
            ))}
          </div>
        )}

        {/* Teacher: student completion badge on map nodes with hover popover */}
        {canCreateContent() && exerciseClassStats?.[exercise?.id] && (
          <div className="absolute left-1/2 -translate-x-1/2 z-30" style={{ bottom: completed ? '-32px' : '-10px' }}>
            <StudentStatsPopover stats={exerciseClassStats[exercise.id]} position="bottom" courseId={courseId} sessionId={sessionId}>
              <div className={`rounded-full px-1.5 py-0.5 text-[8px] md:text-[10px] font-bold leading-none whitespace-nowrap shadow-sm cursor-default ${
                exerciseClassStats[exercise.id].completed === exerciseClassStats[exercise.id].total
                  ? 'bg-green-500 text-white'
                  : exerciseClassStats[exercise.id].completed > 0
                    ? 'bg-yellow-400 text-gray-800'
                    : 'bg-white/90 text-gray-600'
              }`}>
                {exerciseClassStats[exercise.id].completed}/{exerciseClassStats[exercise.id].total}
              </div>
            </StudentStatsPopover>
          </div>
        )}

        {/* Admin/Teacher action buttons (revealed on hover, beside the node) */}
        {canCreateContent() && !isNodeEditMode && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-20">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleEditExercise(exercise);
              }}
              className="p-1.5 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
              title="Edit exercise"
            >
              <Edit className="w-3.5 h-3.5 text-gray-600" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteExercise(exercise);
              }}
              className="p-1.5 bg-white rounded-full shadow-lg hover:bg-red-100 transition-colors"
              title="Remove exercise"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-600" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative w-full h-[100vh] md:h-[100vh] overflow-hidden">
      <div
        className="relative z-[1] w-full md:w-[100%] h-full md:h-[100vh] mx-auto overflow-hidden md:shadow-2xl bg-gray-50"
        ref={mapContainerRef}
      >
        {/* Background - only for map view */}
        {activeView === "map" && (
          <img
            src={getThemeBackgroundImage(
              session?.color_theme || unit?.color_theme || course?.color_theme,
              isDesktop,
            )}
            alt="Map"
            className="w-full h-full object-cover absolute top-0 left-0 z-0"
          />
        )}

        {/* Map View */}
        {activeView === "map" && (
          <>
            {!switching && exercises.length === 0 && (
              <div className="absolute inset-0 z-20 flex items-center justify-center p-6 pt-28 pointer-events-none">
                <div className="pointer-events-auto w-full">{emptyState}</div>
              </div>
            )}

            {/* Level nodes */}
            <div
              className={`absolute inset-0 w-full h-full ${positionEditorMode && editorTarget === "nodes" ? "z-30" : "z-10"}`}
            >
              {levels.map((level, index) => {
                // Skip dummy nodes on desktop/PC
                if (isDesktop && level.isDummy) return null;
                return (
                  <LevelNode key={level.id} level={level} nodeIndex={index} />
                );
              })}
            </div>

            {/* Page controls when a session has more than one map page worth of exercises */}
            {totalMapPages > 1 && (
              <div
                className={`absolute right-4 z-40 flex items-center gap-2 bg-white/90 backdrop-blur rounded-full shadow-lg ring-1 ring-black/5 px-2 py-1.5 ${
                  canCreateContent() ? "bottom-20" : "bottom-4"
                }`}
              >
                <button
                  onClick={() => setMapPage((p) => Math.max(0, p - 1))}
                  disabled={currentMapPage === 0}
                  className="p-1 rounded-full text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="text-xs font-medium text-gray-800 min-w-[2.5rem] text-center">
                  {currentMapPage + 1} / {totalMapPages}
                </span>
                <button
                  onClick={() =>
                    setMapPage((p) => Math.min(totalMapPages - 1, p + 1))
                  }
                  disabled={currentMapPage >= totalMapPages - 1}
                  className="p-1 rounded-full text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <ArrowLeft className="w-5 h-5 rotate-180" />
                </button>
              </div>
            )}
          </>
        )}

        {/* List View */}
        {activeView === "list" && (
          <div className={`absolute inset-0 ${outlineShift} overflow-y-auto z-10 pt-28 md:pt-32 pb-24 px-4 transition-[left] duration-300`}>
          <div className="max-w-3xl mx-auto">
            {/* Up next - students only */}
            {!switching && !canCreateContent() && exercises.length > 0 && (
              nextExercise ? (
                <button
                  type="button"
                  onClick={() => openExercise(nextExercise)}
                  className="group relative block w-full text-left mb-6"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 border border-blue-300 bg-blue-50 transition-colors group-hover:border-blue-400"
                    style={{ clipPath: CLIP.card }}
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-[10px] left-0 w-[2px] h-[calc(100%-10px)] bg-blue-400"
                  />
                  <span className="relative block p-5 md:p-6">
                    <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-500">
                      <span>[ {completedCount === 0 ? "Start here" : "Up next"} ]</span>
                      <span className="font-mono text-gray-400">
                        {String(nextIndex + 1).padStart(2, "0")}/{String(exercises.length).padStart(2, "0")}
                      </span>
                    </span>
                    <span className="mt-2 block text-xl md:text-2xl font-bold leading-snug tracking-tight text-gray-900">
                      {nextExercise.title || EXERCISE_TYPE_LABELS[nextExercise.exercise_type]}
                    </span>
                    <span className="mt-1.5 block w-16 h-[2px] bg-blue-500" />
                    <span className="mt-2 block text-sm text-gray-500">
                      {EXERCISE_TYPE_LABELS[nextExercise.exercise_type] || "Exercise"}
                    </span>
                    <span
                      className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-400 px-7 py-2.5 text-sm font-bold uppercase tracking-wider text-white transition-all group-hover:brightness-110 group-hover:gap-3"
                      style={{ clipPath: CLIP.btn }}
                    >
                      {userProgress.find((p) => p.exercise_id === nextExercise.id)?.status === "in_progress"
                        ? "Continue"
                        : "Start"}
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </span>
                </button>
              ) : (
                <HudPanel tone="done" className="mb-6">
                  <div className="flex items-center gap-3 p-5">
                    <CheckCircle className="w-8 h-8 flex-shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">All exercises complete</p>
                      <p className="text-sm text-emerald-600">
                        <span className="font-mono font-bold">{earnedStars}</span> stars earned{chestReady ? " - your reward chest is ready" : ""}
                      </p>
                    </div>
                  </div>
                </HudPanel>
              )
            )}
            {switching ? (
              <ListSkeleton count={Math.max(exercises.length, 4)} />
            ) : exercises.length === 0 ? (
              emptyState
            ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={exercises.map((ex) => ex.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-0">
                  {exercises.map((exercise, index) => (
                    <SortableExerciseCard
                      key={exercise.id}
                      exercise={exercise}
                      index={index}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            )}
          </div>
          </div>
        )}

        {showOutline && (
          <CourseOutline
            open={outlineOpen}
            onOpen={() => setOutlineOpen(true)}
            onClose={() => setOutlineOpen(false)}
            course={course}
            units={units}
            sessions={allCourseSessions}
            sessionProgress={sessionProgress}
            currentSessionId={sessionId}
            currentUnitId={unitId}
            isStudent={profile?.role === "user"}
            onBack={() => navigate(`/study/course/${currentId}`)}
            onSelectSession={(target) => {
              if (target.id === sessionId) {
                if (window.innerWidth < 1024) setOutlineOpen(false);
                return;
              }
              navigate(`/study/course/${currentId}/unit/${target.unit_id}/session/${target.id}`);
              if (window.innerWidth < 1024) setOutlineOpen(false);
            }}
          />
        )}

        {/* Top bar: back, session title + progress, admin tools, chest */}
        <div className={`absolute top-0 inset-x-0 ${outlineShift} z-50 p-2 md:p-4 pointer-events-none transition-[left] duration-300`}>
          <HudPanel tone="glass" className="pointer-events-auto mx-auto max-w-3xl">
            <div className="flex items-center gap-2 md:gap-3 p-2 md:px-3 md:py-2.5">
              <button
                type="button"
                onClick={() => navigate(`/study/course/${currentId}`)}
                aria-label="Back to course"
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                style={{ clipPath: CLIP.icon }}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="flex-1 min-w-0">
                <h2 className="truncate text-sm md:text-lg font-bold tracking-tight text-gray-900 leading-tight">
                  {shownTitle}
                </h2>
                {exercises.length > 0 && !switching && (
                  <div className="mt-1 flex items-center gap-2">
                    <div
                      className="relative flex-1 h-2.5 bg-gray-100 border border-gray-200 overflow-hidden"
                      style={{ clipPath: CLIP.bar }}
                      role="progressbar"
                      aria-valuenow={completedCount}
                      aria-valuemin={0}
                      aria-valuemax={exercises.length}
                    >
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] md:text-xs font-bold text-gray-600 tabular-nums">
                      {completedCount}/{exercises.length}
                    </span>
                    <span className="flex items-center gap-0.5 font-mono text-[11px] md:text-xs font-bold text-amber-600 tabular-nums">
                      <Star className="w-3 h-3 md:w-3.5 md:h-3.5 fill-amber-400 text-amber-400" />
                      {earnedStars}
                    </span>
                  </div>
                )}
              </div>

              {/* Map/list toggle + position editor: admins/teachers, decorated (map) courses only */}
              {canCreateContent() && isDecorated && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === "map" ? "list" : "map")}
                    className="w-10 h-10 flex items-center justify-center border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                    style={{ clipPath: CLIP.icon }}
                    title={viewMode === "map" ? "Switch to List View" : "Switch to Map View"}
                    aria-label={viewMode === "map" ? "Switch to List View" : "Switch to Map View"}
                  >
                    {viewMode === "map" ? <List className="w-5 h-5" /> : <Map className="w-5 h-5" />}
                  </button>
                  {viewMode === "map" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!positionEditorMode) {
                          initEditablePositions();
                        }
                        setPositionEditorMode(!positionEditorMode);
                      }}
                      className={`w-10 h-10 flex items-center justify-center border transition-colors ${
                        positionEditorMode
                          ? "bg-red-500 border-red-500 text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                      style={{ clipPath: CLIP.icon }}
                      title={positionEditorMode ? "Exit Editor" : "Edit Node Positions"}
                      aria-label={positionEditorMode ? "Exit Editor" : "Edit Node Positions"}
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}

              {/* Chest - visible for everyone */}
              <button
                type="button"
                onClick={handleChestClick}
                aria-label={sessionRewards[sessionId]?.claimed ? "Reward claimed" : chestReady ? "Claim reward" : "Reward locked"}
                className="relative flex-shrink-0 w-11 h-11 md:w-14 md:h-14"
              >
                <img
                  src={
                    sessionRewards[sessionId]?.claimed
                      ? assetUrl('/image/study/chest_open.png') // Opened
                      : assetUrl('/image/study/chest_lock.png') // Locked or Ready
                  }
                  alt=""
                  className={`w-full h-full object-contain drop-shadow-md ${chestReady ? "animate-bounce" : ""}`}
                />
                {chestReady && (
                  <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
                )}
              </button>
            </div>
          </HudPanel>
        </div>

        {/* Position Editor Panel */}
        {positionEditorMode && editablePositions && editableControlPoints && (
          <div className="absolute top-20 md:top-24 right-4 bg-white rounded-2xl shadow-xl ring-1 ring-black/5 z-50 max-h-[75vh] overflow-y-auto">
            {/* Editor Mode Toggle */}
            <div className="flex rounded-lg overflow-hidden mb-4 border border-gray-200">
              <button
                onClick={() => setEditorTarget("nodes")}
                className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${
                  editorTarget === "nodes"
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                Nodes
              </button>
              <button
                onClick={() => setEditorTarget("curves")}
                className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${
                  editorTarget === "curves"
                    ? "bg-orange-500 text-white"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                Curves
              </button>
            </div>

            {/* Node Positions - shown when editing nodes */}
            {editorTarget === "nodes" && (
              <div className="mb-0">
                <h4 className="text-sm font-semibold text-gray-700 mb-1">
                  Node Positions
                </h4>
                <div className="space-y-1 text-xs font-mono bg-gray-100 p-2 rounded mb-2 max-h-10 overflow-y-auto">
                  {editablePositions.map((pos, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-gray-500">Node {i + 1}:</span>
                      <span>
                        x: {pos.x}, y: {pos.y}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={copyPositionsToClipboard}
                  className="w-full bg-emerald-500 text-white py-2 px-3 rounded text-sm hover:bg-emerald-600 transition-colors"
                >
                  Copy Node Positions
                </button>
              </div>
            )}

            {/* Control Points - shown when editing curves */}
            {editorTarget === "curves" && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-1">
                  Curve Control Points
                </h4>
                <div className="space-y-1 text-xs font-mono bg-orange-50 p-2 rounded mb-2 max-h-10 overflow-y-auto">
                  {editableControlPoints.map((pos, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-gray-500">
                        {i + 1}→{i + 2}:
                      </span>
                      <span>
                        x: {pos.x}, y: {pos.y}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={copyControlPointsToClipboard}
                  className="w-full bg-orange-500 text-white py-2 px-3 rounded text-sm hover:bg-orange-600 transition-colors"
                >
                  Copy Control Points
                </button>
              </div>
            )}
          </div>
        )}

        {/* Add Exercise Button - Only for admins/teachers */}
        {canCreateContent() && (
          <button
            onClick={() => setShowAssignExerciseModal(true)}
            className="absolute bottom-4 right-4 p-3 md:px-5 bg-blue-600 text-white font-semibold rounded-full shadow-lg ring-4 ring-white/60 hover:bg-blue-700 transition-colors z-50 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Add Exercise</span>
          </button>
        )}
      </div>
      {/* Assign Exercise Modal */}
      {showAssignExerciseModal && (
        <AssignExerciseModal
          sessionId={sessionId}
          courseId={courseId}
          onClose={() => setShowAssignExerciseModal(false)}
          onAssigned={handleExercisesAssigned}
        />
      )}

      {/* Edit Exercise Modal */}
      <EditExerciseModal
        isOpen={!!editingExercise}
        onClose={() => setEditingExercise(null)}
        exercise={editingExercise}
        onUpdate={fetchData}
      />

      {/* Chest Selection Modal */}
      {showChestSelection && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            if (selectedChest === null) {
              setShowChestSelection(false);
            }
          }}
        >
          <div
            className="relative isolate drop-shadow-2xl p-4 sm:p-8 max-w-2xl w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 border border-gray-200 bg-white"
              style={{ clipPath: CLIP.card }}
            />
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">[ Reward ]</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 tracking-tight">
              Choose Your Reward!
            </h2>
            <p className="text-sm sm:text-lg text-gray-600 mb-4">
              Pick a card to reveal your reward
            </p>
            <div className="flex items-center justify-center gap-3 mb-4 sm:mb-8">
              <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white py-2 px-4 text-lg font-bold flex items-center justify-center gap-1" style={{ clipPath: CLIP.icon }}>
                {5 + exercises.length * 5 + 1} - {5 + exercises.length * 5 + 10}{" "}
                <img
                  src={assetUrl('/image/study/xp.png')}
                  alt="XP"
                  className="w-6 h-6"
                />
              </div>
              <span className="text-gray-400 font-bold">or</span>
              <div className="bg-gradient-to-r from-emerald-400 to-teal-500 text-white py-2 px-4 text-lg font-bold flex items-center justify-center gap-1" style={{ clipPath: CLIP.icon }}>
                <img
                  src={assetUrl('/image/study/gem.png')}
                  alt="Gem"
                  className="w-6 h-6"
                />
              </div>
            </div>

            <div className="flex justify-center items-center gap-3 sm:gap-6">
              {[1, 2, 3].map((cardNum) => {
                const isSelected = selectedChest === cardNum;
                const isFlipped = selectedChest !== null;
                const cardXP = isSelected
                  ? rewardAmount
                  : otherCardsXP[cardNum] || 0;
                const cardGems = isSelected
                  ? rewardGems
                  : otherCardsGems[cardNum] || 0;
                const isGemCard = cardGems > 0;

                return (
                  <button
                    key={cardNum}
                    onClick={() => handleChestSelect(cardNum)}
                    disabled={selectedChest !== null}
                    className="relative group flex-shrink-0 perspective-1000"
                    style={{ perspective: "1000px" }}
                  >
                    <div
                      className="w-24 h-32 sm:w-32 sm:h-44 relative transition-transform duration-500"
                      style={{
                        transformStyle: "preserve-3d",
                        transform: isFlipped
                          ? "rotateY(180deg)"
                          : "rotateY(0deg)",
                        transitionDelay:
                          isFlipped && !isSelected ? "1000ms" : "0ms",
                      }}
                    >
                      {/* Card Front (Question mark) */}
                      <div
                        className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center border-4 border-purple-300 group-hover:scale-105 transition-transform"
                        style={{ backfaceVisibility: "hidden", clipPath: CLIP.card }}
                      >
                        <div className="text-center">
                          <div className="text-5xl sm:text-6xl font-bold text-white drop-shadow-lg">
                            ?
                          </div>
                          <div className="text-xs sm:text-sm text-purple-200 mt-2">
                            Pick me!
                          </div>
                        </div>
                      </div>

                      {/* Card Back (reward reveal) */}
                      <div
                        className={`absolute inset-0 flex items-center justify-center border-4 ${
                          isSelected
                            ? isGemCard
                              ? "bg-gradient-to-br from-emerald-400 to-teal-500 border-emerald-300"
                              : "bg-gradient-to-br from-yellow-400 to-orange-500 border-yellow-300"
                            : "bg-gradient-to-br from-gray-400 to-gray-500 border-gray-300"
                        }`}
                        style={{
                          backfaceVisibility: "hidden",
                          transform: "rotateY(180deg)",
                          clipPath: CLIP.card,
                        }}
                      >
                        <div className="text-center">
                          {cardXP > 0 || cardGems > 0 ? (
                            isGemCard ? (
                              <>
                                <div className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                                  +{cardGems}
                                </div>
                                <img
                                  src={assetUrl('/image/study/gem.png')}
                                  alt="Gem"
                                  className="w-8 h-8 mx-auto mt-1"
                                />
                              </>
                            ) : (
                              <>
                                <div className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                                  +{cardXP}
                                </div>
                                <img
                                  src={assetUrl('/image/study/xp.png')}
                                  alt="XP"
                                  className="w-8 h-8 mx-auto mt-1"
                                />
                              </>
                            )
                          ) : (
                            <div className="text-xl text-white/80">...</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* OK button appears after card is selected */}
            {selectedChest !== null && (
              <button
                onClick={handleRewardDismiss}
                className="mt-6 bg-gradient-to-r from-blue-500 to-blue-400 hover:brightness-110 text-white font-bold uppercase tracking-wider py-2.5 px-10 transition-all"
              style={{ clipPath: CLIP.btn }}
              >
                OK
              </button>
            )}
          </div>
        </div>
      )}

      {/* Locked Chest Modal */}
      {showLockedModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowLockedModal(false)}
        >
          <div
            className="relative isolate drop-shadow-2xl p-6 sm:p-8 max-w-md w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 border border-gray-200 bg-white"
              style={{ clipPath: CLIP.card }}
            />
            <div className="mb-4">
              <img
                src={assetUrl('/image/study/chest_lock.png')}
                alt="Locked Chest"
                className="w-20 h-20 sm:w-24 sm:h-24 mx-auto object-contain"
              />
            </div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">[ Locked ]</p>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 tracking-tight">
              Chest Locked!
            </h2>
            <p className="text-sm sm:text-base text-gray-600 mb-4">
              Complete all exercises with at least 2 stars to receive reward
            </p>

            <div className="flex items-center justify-center gap-3 mb-4 sm:mb-8">
              <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white py-2 px-4 text-lg font-bold flex items-center justify-center gap-1" style={{ clipPath: CLIP.icon }}>
                {5 + exercises.length * 5 + 1} - {5 + exercises.length * 5 + 10}{" "}
                <img
                  src={assetUrl('/image/study/xp.png')}
                  alt="XP"
                  className="w-6 h-6"
                />
              </div>

              <span className="text-gray-400 font-bold">or</span>
              <div className="bg-gradient-to-r from-emerald-400 to-teal-500 text-white py-2 px-4 text-lg font-bold flex items-center justify-center gap-1" style={{ clipPath: CLIP.icon }}>
                <img
                  src={assetUrl('/image/study/gem.png')}
                  alt="Gem"
                  className="w-6 h-6"
                />
              </div>
            </div>

            <button
              onClick={() => setShowLockedModal(false)}
              className="bg-gradient-to-r from-blue-500 to-blue-400 hover:brightness-110 text-white font-bold uppercase tracking-wider py-2.5 px-10 transition-all"
              style={{ clipPath: CLIP.btn }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Opened Chest Modal */}
      {showOpenedModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowOpenedModal(false)}
        >
          <div
            className="relative isolate drop-shadow-2xl p-6 sm:p-8 max-w-md w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 border border-gray-200 bg-white"
              style={{ clipPath: CLIP.card }}
            />
            <div className="mb-4">
              <img
                src={assetUrl('/image/study/chest_open.png')}
                alt="Opened Chest"
                className="w-20 h-20 sm:w-24 sm:h-24 mx-auto object-contain"
              />
            </div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">[ Claimed ]</p>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 tracking-tight">
              Reward Claimed!
            </h2>
            <p className="text-sm sm:text-base text-gray-600 mb-4 ">
              You earned from this chest:
            </p>
            <div className="flex flex-col items-center gap-2 mb-6">
              {sessionRewards[sessionId]?.xp > 0 ? (
                <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white py-3 px-6 text-2xl sm:text-3xl font-bold shadow-lg flex items-center justify-center gap-2" style={{ clipPath: CLIP.icon }}>
                  <span>+{sessionRewards[sessionId]?.xp}</span>
                  <img
                    src={assetUrl('/image/study/xp.png')}
                    alt="XP"
                    className="w-6 h-6"
                  />
                </div>
              ) : sessionRewards[sessionId]?.gems > 0 ? (
                <div className="bg-gradient-to-r from-emerald-400 to-teal-500 text-white py-3 px-6 text-2xl sm:text-3xl font-bold shadow-lg flex items-center justify-center gap-2" style={{ clipPath: CLIP.icon }}>
                  <span>+{sessionRewards[sessionId]?.gems}</span>
                  <img
                    src={assetUrl('/image/study/gem.png')}
                    alt="Gem"
                    className="w-6 h-6"
                  />
                </div>
              ) : null}
            </div>
            <button
              onClick={() => setShowOpenedModal(false)}
              className="bg-gradient-to-r from-blue-500 to-blue-400 hover:brightness-110 text-white font-bold uppercase tracking-wider py-2.5 px-10 transition-all"
              style={{ clipPath: CLIP.btn }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExerciseList;
