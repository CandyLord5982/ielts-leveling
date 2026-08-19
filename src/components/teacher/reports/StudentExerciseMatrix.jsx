import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabase/client';
import { useAuth } from '../../../hooks/useAuth';
import { CheckCircle, XCircle, Clock, Minus, RotateCcw, Eye, X, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Video, Send, Star, FileText, User } from 'lucide-react';
import SingleExerciseReview from './SingleExerciseReview';

const VIDEO_TYPES = ['video', 'video_upload', 'speaking', 'speaking_assessment'];

const StudentExerciseMatrix = ({ selectedCourse, initialSessionId }) => {
  const { user, isAdmin } = useAuth();
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(initialSessionId || 'all');
  const [students, setStudents] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [progressMatrix, setProgressMatrix] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [questionAttempts, setQuestionAttempts] = useState([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [showAllExercises, setShowAllExercises] = useState(false);
  const [averageMode, setAverageMode] = useState('all'); // 'all' or 'attempted'
  const [allExercisesFetched, setAllExercisesFetched] = useState(false);
  const [overriding, setOverriding] = useState(null); // Track which attempt is being overridden
  const [exerciseDetail, setExerciseDetail] = useState(null); // Exercise info for the modal

  // Video submission state
  const [videoSubmissionsMap, setVideoSubmissionsMap] = useState(new Map());
  const [videoSubmissions, setVideoSubmissions] = useState([]);
  const [isVideoExercise, setIsVideoExercise] = useState(false);
  const [teacherScores, setTeacherScores] = useState({});
  const [teacherFeedbacks, setTeacherFeedbacks] = useState({});
  const [submittingReview, setSubmittingReview] = useState(null);

  useEffect(() => {
    if (selectedCourse) {
      fetchUnits();
    }
  }, [selectedCourse]);

  useEffect(() => {
    if (selectedUnit !== 'all') {
      fetchSessions();
    } else {
      setSessions([]);
      setSelectedSession('all');
    }
  }, [selectedUnit]);

  useEffect(() => {
    if (selectedCourse) {
      setShowAllExercises(false);
      setAllExercisesFetched(false);
      fetchMatrixData(15);
    }
  }, [selectedCourse, selectedUnit, selectedSession]);

  const fetchUnits = async () => {
    try {
      const { data, error } = await supabase
        .from('units')
        .select('id, title, unit_number')
        .eq('course_id', selectedCourse)
        .order('unit_number');

      if (error) throw error;

      setUnits(data || []);

      // If initialSessionId is provided, find its unit and auto-select
      if (initialSessionId) {
        const { data: sessionData } = await supabase
          .from('sessions')
          .select('unit_id')
          .eq('id', initialSessionId)
          .single();

        if (sessionData && data?.some(u => u.id === sessionData.unit_id)) {
          setSelectedUnit(sessionData.unit_id);
          return; // Don't reset — fetchSessions will run from the unit effect
        }
      }

      setSelectedUnit('all'); // Reset to "All Units" when course changes
    } catch (error) {
      console.error('Error fetching units:', error);
    }
  };

  const fetchSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, title, session_number, is_test, assigned_student_id')
        .eq('unit_id', selectedUnit)
        .order('session_number');

      if (error) throw error;

      setSessions((data || []).filter(s => !s.is_test));

      // Keep initialSessionId if it belongs to this unit's sessions
      if (initialSessionId && data?.some(s => s.id === initialSessionId)) {
        setSelectedSession(initialSessionId);
      } else {
        setSelectedSession('all');
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  const fetchMatrixData = async (limit = null) => {
    if (!selectedCourse) return;

    try {
      setLoading(true);

      // Fetch students enrolled in the course
      const { data: enrollments, error: studentsError } = await supabase
        .from('course_enrollments')
        .select(`
          student_id,
          assigned_at,
          student:users!student_id(
            id,
            full_name,
            real_name,
            email,
            avatar_url,
            real_avatar_url
          )
        `)
        .eq('course_id', selectedCourse)
        .eq('is_active', true);

      if (studentsError) throw studentsError;

      const studentList = (enrollments || []).map(enrollment => {
        if (!enrollment.student) return null;
        const s = enrollment.student;
        return { ...s, full_name: s.real_name || s.full_name, avatar_url: s.real_avatar_url || s.avatar_url, assigned_at: enrollment.assigned_at };
      }).filter(Boolean);
      setStudents(studentList);

      // Get units in this course (filter by selected unit if not 'all')
      let unitIds = [];
      if (selectedUnit === 'all') {
        const { data: units, error: unitsError } = await supabase
          .from('units')
          .select('id')
          .eq('course_id', selectedCourse);

        if (unitsError) throw unitsError;

        unitIds = (units || []).map(u => u.id);
      } else {
        unitIds = [selectedUnit];
      }

      if (unitIds.length === 0) {
        setExercises([]);
        setProgressMatrix(new Map());
        return;
      }

      // Get sessions in these units (filter by selected session if not 'all')
      let sessionIds = [];
      let sessionsData = [];

      if (selectedSession !== 'all') {
        sessionIds = [selectedSession];
        const { data: sessionData, error: sessionError } = await supabase
          .from('sessions')
          .select('id, title, session_number, unit_id, is_test, assigned_student_id')
          .eq('id', selectedSession)
          .single();

        if (sessionError) throw sessionError;
        sessionsData = sessionData && !sessionData.is_test ? [sessionData] : [];
      } else {
        const { data: sessions, error: sessionsError } = await supabase
          .from('sessions')
          .select('id, title, session_number, unit_id, is_test, assigned_student_id')
          .in('unit_id', unitIds)
          .order('session_number');

        if (sessionsError) throw sessionsError;

        sessionsData = (sessions || []).filter(s => !s.is_test);
        sessionIds = sessionsData.map(s => s.id);
      }
      if (sessionIds.length === 0) {
        setExercises([]);
        setProgressMatrix(new Map());
        return;
      }

      // Get exercises via assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from('exercise_assignments')
        .select(`
          session_id,
          exercise:exercises(
            id,
            title,
            exercise_type
          )
        `)
        .in('session_id', sessionIds);

      if (assignmentsError) throw assignmentsError;

      // Build exercises list with session info - deduplicate by exercise ID
      const exerciseMap = new Map();
      const exerciseIds = [];
      (assignments || []).forEach(assignment => {
        const exercise = assignment.exercise;
        if (exercise?.id && !exerciseMap.has(exercise.id)) {
          const session = sessionsData.find(s => s.id === assignment.session_id);
          exerciseMap.set(exercise.id, {
            ...exercise,
            session_title: session?.title || 'Unknown Session',
            session_number: session?.session_number || 0,
            assigned_student_id: session?.assigned_student_id || null
          });
          exerciseIds.push(exercise.id);
        }
      });

      let exerciseList = Array.from(exerciseMap.values());

      // Sort: shared exercises first, then personal; within each group sort by title (descending)
      exerciseList.sort((a, b) => {
        const aPersonal = a.assigned_student_id ? 1 : 0;
        const bPersonal = b.assigned_student_id ? 1 : 0;
        if (aPersonal !== bPersonal) return aPersonal - bPersonal;
        return b.title.localeCompare(a.title);
      });

      // Apply limit if specified
      if (limit) {
        exerciseList = exerciseList.slice(0, limit);
      } else {
        setAllExercisesFetched(true);
      }

      setExercises(exerciseList);

      if (studentList.length === 0 || exerciseList.length === 0) {
        setProgressMatrix(new Map());
        return;
      }

      // Fetch user progress for all students and limited exercises
      const limitedExerciseIds = exerciseList.map(ex => ex.id);
      const studentIds = studentList.map(s => s.id);
      const { data: progressData, error: progressError } = await supabase
        .from('user_progress')
        .select('user_id, exercise_id, status, score, max_score, attempts, completed_at')
        .in('user_id', studentIds)
        .in('exercise_id', limitedExerciseIds);

      if (progressError) throw progressError;

      // Build progress matrix: Map<student_id-exercise_id, progressData>
      const matrix = new Map();
      (progressData || []).forEach(progress => {
        const key = `${progress.user_id}-${progress.exercise_id}`;
        matrix.set(key, progress);
      });

      // Fetch question_attempts to calculate scores based on latest attempts (like the modal)
      // Batch by exercise to avoid query size limits
      const attemptsByCell = new Map();

      for (const exerciseId of limitedExerciseIds) {
        const { data: exerciseAttempts, error: attemptsError } = await supabase
          .from('question_attempts')
          .select('user_id, exercise_id, question_id, is_correct, selected_answer, correct_answer, exercise_type, created_at')
          .in('user_id', studentIds)
          .eq('exercise_id', exerciseId);

        if (attemptsError) {
          console.error('Error fetching attempts for exercise:', exerciseId, attemptsError);
          continue;
        }

        // Expand old fill_blank attempts (single row with comma-separated answers) into per-blank rows
        const expandedAttempts = [];
        (exerciseAttempts || []).forEach(attempt => {
          if (attempt.exercise_type === 'fill_blank' && attempt.question_index == null) {
            const selected = (attempt.selected_answer || '').split(',').map(s => s.trim());
            const correct = (attempt.correct_answer || '').split(',').map(s => s.trim());
            if (selected.length > 1) {
              selected.forEach((sel, bi) => {
                const corr = correct[bi] || '';
                expandedAttempts.push({
                  ...attempt,
                  question_index: bi,
                  selected_answer: sel,
                  correct_answer: corr,
                  is_correct: corr ? corr.toLowerCase() === sel.toLowerCase() : attempt.is_correct
                });
              });
              return;
            }
          }
          expandedAttempts.push(attempt);
        });

        // Group attempts by student-exercise, then by question+blank, keeping latest attempt
        expandedAttempts.forEach(attempt => {
          const key = `${attempt.user_id}-${attempt.exercise_id}`;
          if (!attemptsByCell.has(key)) {
            attemptsByCell.set(key, new Map());
          }
          const questionMap = attemptsByCell.get(key);
          const attemptKey = `${attempt.question_id}_${attempt.question_index ?? 'x'}`;
          const existing = questionMap.get(attemptKey);
          if (!existing || new Date(attempt.created_at) > new Date(existing.created_at)) {
            questionMap.set(attemptKey, attempt);
          }
        });
      }

      // Override progress scores with calculated scores from latest attempts
      attemptsByCell.forEach((questionMap, key) => {
        const latestAttempts = Array.from(questionMap.values());
        const correctCount = latestAttempts.filter(a => a.is_correct).length;
        const totalCount = latestAttempts.length;

        let progress = matrix.get(key);
        if (!progress) {
          progress = {};
          matrix.set(key, progress);
        }
        progress.score = correctCount;
        progress.max_score = totalCount;
      });

      setProgressMatrix(matrix);

      // Fetch video submissions for video-type exercises
      const videoExerciseIds = exerciseList
        .filter(ex => VIDEO_TYPES.includes(ex.exercise_type))
        .map(ex => ex.id);

      if (videoExerciseIds.length > 0 && studentIds.length > 0) {
        const { data: videoSubs } = await supabase
          .from('video_submissions')
          .select('id, user_id, exercise_id, question_index, video_url, transcription, ai_result, ai_score, status, teacher_score, teacher_feedback, reviewed_by, reviewed_at, created_at')
          .in('user_id', studentIds)
          .in('exercise_id', videoExerciseIds);

        const vMap = new Map();
        (videoSubs || []).forEach(sub => {
          const key = `${sub.user_id}-${sub.exercise_id}`;
          if (!vMap.has(key)) vMap.set(key, []);
          vMap.get(key).push(sub);
        });
        setVideoSubmissionsMap(vMap);
      } else {
        setVideoSubmissionsMap(new Map());
      }

    } catch (error) {
      console.error('Error fetching matrix data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProgressForCell = (studentId, exerciseId) => {
    return progressMatrix.get(`${studentId}-${exerciseId}`);
  };

  const getScorePercentage = (progress) => {
    if (!progress || !progress.max_score || progress.score === null) {
      return null;
    }
    return Math.round((progress.score / progress.max_score) * 100);
  };

  const getScoreColor = (percentage) => {
    if (percentage === null) return 'bg-gray-100';
    if (percentage >= 90) return 'bg-green-500 text-white';
    if (percentage >= 75) return 'bg-blue-500 text-white';
    if (percentage >= 60) return 'bg-yellow-200 text-yellow-800';
    return 'bg-red-200 text-red-800';
  };

  const getStudentAverage = (studentId) => {
    if (exercises.length === 0) return null;

    let totalPercentage = 0;
    let count = 0;

    exercises.forEach(exercise => {
      // Skip personal exercises assigned to other students
      if (exercise.assigned_student_id && exercise.assigned_student_id !== studentId) return;

      const progress = getProgressForCell(studentId, exercise.id);
      if (progress && progress.score !== null && progress.max_score) {
        totalPercentage += (progress.score / progress.max_score) * 100;
        count++;
      } else if (averageMode === 'all') {
        // Only count unattempted as 0% when in 'all' mode
        count++;
      }
    });

    if (count === 0) return null;
    return Math.round(totalPercentage / count);
  };

  const fetchQuestionAttempts = async (studentId, studentName, exerciseId, exerciseTitle) => {
    setLoadingAttempts(true);
    setSelectedCell({ studentId, studentName, exerciseId, exerciseTitle });
    setIsVideoExercise(false);
    setVideoSubmissions([]);

    try {
      // Fetch question attempts
      const { data: attemptsData, error: attemptsError } = await supabase
        .from('question_attempts')
        .select('*')
        .eq('user_id', studentId)
        .eq('exercise_id', exerciseId)
        .order('created_at', { ascending: false });

      if (attemptsError) throw attemptsError;

      // Fetch exercise content and details
      const { data: exerciseData, error: exerciseError } = await supabase
        .from('exercises')
        .select('content, description, exercise_type, difficulty_level, xp_reward, estimated_duration')
        .eq('id', exerciseId)
        .single();

      if (exerciseError) throw exerciseError;

      setExerciseDetail(exerciseData);

      // Expand old fill_blank attempts (single row with comma-separated answers) into per-blank rows
      let processedAttempts = attemptsData || [];
      if (exerciseData?.exercise_type === 'fill_blank' && exerciseData?.content?.questions) {
        const expanded = [];
        processedAttempts.forEach(attempt => {
          const hasIndex = attempt.question_index != null;
          const selected = (attempt.selected_answer || '').split(',').map(s => s.trim());
          const correct = (attempt.correct_answer || '').split(',').map(s => s.trim());
          if (!hasIndex && selected.length > 1) {
            const qi = exerciseData.content.questions.findIndex(q => q.id === attempt.question_id);
            const qIdx = qi >= 0 ? qi : 0;
            selected.forEach((sel, bi) => {
              const corr = correct[bi] || '';
              expanded.push({
                ...attempt,
                question_index: qIdx * 100 + bi,
                selected_answer: sel,
                correct_answer: corr,
                is_correct: corr ? corr.toLowerCase() === sel.toLowerCase() : attempt.is_correct
              });
            });
          } else {
            expanded.push(attempt);
          }
        });
        processedAttempts = expanded;
      }

      // Group by question_id + question_index to show latest attempt for each question/blank
      const latestAttempts = {};
      (processedAttempts).forEach(attempt => {
        const key = `${attempt.question_id}_${attempt.question_index ?? 'x'}`;
        if (!latestAttempts[key] ||
            new Date(attempt.created_at) > new Date(latestAttempts[key].created_at)) {
          latestAttempts[key] = attempt;
        }
      });

      // Match attempts with actual question text from exercise content
      const attemptsWithQuestions = Object.values(latestAttempts).map(attempt => {
        let questionText = 'Question not found';

        // Try to find the question in exercise content
        if (exerciseData?.content?.questions) {
          const question = exerciseData.content.questions.find(q => q.id === attempt.question_id);
          if (question) {
            // Remove HTML tags and trim for cleaner display
            questionText = question.question?.replace(/<[^>]*>/g, '').trim() || question.question || 'Question not found';
          }
        }

        return {
          ...attempt,
          questionText
        };
      });

      setQuestionAttempts(attemptsWithQuestions);
    } catch (err) {
      console.error('Error fetching question attempts:', err);
    } finally {
      setLoadingAttempts(false);
    }
  };

  const closeModal = () => {
    setSelectedCell(null);
    setQuestionAttempts([]);
    setExerciseDetail(null);
    setVideoSubmissions([]);
    setIsVideoExercise(false);
    setTeacherScores({});
    setTeacherFeedbacks({});
  };

  const [resetting, setResetting] = useState(false);

  const handleResetProgress = async () => {
    if (!selectedCell || !isAdmin) return;
    const { studentId, studentName, exerciseId, exerciseTitle } = selectedCell;
    if (!window.confirm(`Reset all progress for "${studentName}" on "${exerciseTitle}"?\n\nThis will delete their score, attempts, and question history for this exercise.`)) return;

    setResetting(true);
    try {
      // Delete question_attempts first, then user_progress
      await supabase
        .from('question_attempts')
        .delete()
        .eq('user_id', studentId)
        .eq('exercise_id', exerciseId);

      await supabase
        .from('user_progress')
        .delete()
        .eq('user_id', studentId)
        .eq('exercise_id', exerciseId);

      // Refresh matrix data and close modal
      closeModal();
      fetchMatrixData(exercises.length || 15);
    } catch (err) {
      console.error('Error resetting progress:', err);
      alert('Failed to reset progress. Check console for details.');
    } finally {
      setResetting(false);
    }
  };

  const handleVideoCell = async (studentId, studentName, exerciseId, exerciseTitle) => {
    setLoadingAttempts(true);
    setSelectedCell({ studentId, studentName, exerciseId, exerciseTitle });
    setIsVideoExercise(true);
    setQuestionAttempts([]);

    try {
      const { data: exerciseData } = await supabase
        .from('exercises')
        .select('content, description, exercise_type, difficulty_level, xp_reward, estimated_duration')
        .eq('id', exerciseId)
        .single();

      setExerciseDetail(exerciseData);

      const { data: subs, error } = await supabase
        .from('video_submissions')
        .select('*')
        .eq('user_id', studentId)
        .eq('exercise_id', exerciseId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVideoSubmissions(subs || []);
    } catch (err) {
      console.error('Error fetching video submissions:', err);
    } finally {
      setLoadingAttempts(false);
    }
  };

  const handleVideoReview = async (submission) => {
    const score = teacherScores[submission.id];
    if (score === undefined || score === null || score === '') return;

    const numScore = parseInt(score);
    if (isNaN(numScore) || numScore < 0 || numScore > 100) return;

    try {
      setSubmittingReview(submission.id);
      const feedback = teacherFeedbacks[submission.id] || '';

      const { error: updateError } = await supabase
        .from('video_submissions')
        .update({
          teacher_score: numScore,
          teacher_feedback: feedback,
          status: 'reviewed',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submission.id);

      if (updateError) throw updateError;

      // Update user_progress with teacher's score
      const baseXP = 15;
      const bonusXP = numScore >= 90 ? Math.round(baseXP * 0.5) : numScore >= 80 ? Math.round(baseXP * 0.3) : 0;
      const totalXP = baseXP + bonusXP;

      await supabase.from('user_progress').upsert({
        user_id: submission.user_id,
        exercise_id: submission.exercise_id,
        session_id: submission.session_id,
        score: numScore,
        max_score: 100,
        status: numScore >= 75 ? 'completed' : 'attempted',
        completed_at: new Date().toISOString(),
        xp_earned: numScore >= 75 ? totalXP : 0,
      }, { onConflict: 'user_id,exercise_id' });

      // Refresh the video submissions in the modal
      const { data: refreshedSubs } = await supabase
        .from('video_submissions')
        .select('*')
        .eq('user_id', submission.user_id)
        .eq('exercise_id', submission.exercise_id)
        .order('created_at', { ascending: false });

      setVideoSubmissions(refreshedSubs || []);

      // Refresh matrix data
      await fetchMatrixData(showAllExercises ? null : 15);
    } catch (error) {
      console.error('Error reviewing submission:', error);
    } finally {
      setSubmittingReview(null);
    }
  };

  const handleOverrideCorrectness = async (attemptId, currentIsCorrect) => {
    if (!user) return;

    try {
      setOverriding(attemptId);

      // Toggle the is_correct value
      const newIsCorrect = !currentIsCorrect;

      // Update the question_attempts table
      const { error: updateError } = await supabase
        .from('question_attempts')
        .update({
          is_correct: newIsCorrect,
          manually_overridden: true,
          overridden_by: user.id,
          overridden_at: new Date().toISOString()
        })
        .eq('id', attemptId);

      if (updateError) throw updateError;

      // Recalculate the score for this exercise
      await recalculateExerciseScore(
        selectedCell.studentId,
        selectedCell.exerciseId
      );

      // Refresh the question attempts to show updated data
      await fetchQuestionAttempts(
        selectedCell.studentId,
        selectedCell.studentName,
        selectedCell.exerciseId,
        selectedCell.exerciseTitle
      );

      // Refresh the matrix to show updated scores
      await fetchMatrixData(showAllExercises ? null : 15);

    } catch (err) {
      console.error('Error overriding correctness:', err);
      alert('Failed to override answer. Please try again.');
    } finally {
      setOverriding(null);
    }
  };

  const recalculateExerciseScore = async (studentId, exerciseId) => {
    try {
      // Get all question attempts for this student and exercise
      const { data: attempts, error: attemptsError } = await supabase
        .from('question_attempts')
        .select('question_id, is_correct')
        .eq('user_id', studentId)
        .eq('exercise_id', exerciseId);

      if (attemptsError) throw attemptsError;

      // Get unique questions (latest attempt for each)
      const uniqueQuestions = {};
      attempts.forEach(attempt => {
        if (!uniqueQuestions[attempt.question_id]) {
          uniqueQuestions[attempt.question_id] = attempt;
        }
      });

      const totalQuestions = Object.keys(uniqueQuestions).length;
      const correctAnswers = Object.values(uniqueQuestions).filter(
        attempt => attempt.is_correct
      ).length;

      const newScore = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
      const maxScore = 100;
      const meetingRequirement = newScore >= 75;

      // Build update object
      const updateData = {
        score: newScore,
        max_score: maxScore,
        updated_at: new Date().toISOString()
      };

      // Update status to completed if score meets threshold (75%)
      if (meetingRequirement) {
        updateData.status = 'completed';
        updateData.completed_at = new Date().toISOString();
      } else {
        updateData.status = 'attempted';
        updateData.completed_at = null;
      }

      // Update user_progress table
      const { error: progressError } = await supabase
        .from('user_progress')
        .update(updateData)
        .eq('user_id', studentId)
        .eq('exercise_id', exerciseId);

      if (progressError) throw progressError;

    } catch (err) {
      console.error('Error recalculating score:', err);
      throw err;
    }
  };

  if (!selectedCourse) {
    return (
      <div className="text-center py-8 text-gray-500">
        Please select a course to view the student-exercise matrix.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading matrix data...</p>
      </div>
    );
  }

  if (students.length === 0 || exercises.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No students or exercises found for this course.
      </div>
    );
  }

  const handleShowAllExercises = async () => {
    if (!allExercisesFetched) {
      await fetchMatrixData(); // Fetch all exercises
    }
    setShowAllExercises(true);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Student-Exercise Matrix</h3>
            <p className="text-sm text-gray-600">
              {students.length} students • {exercises.length} exercises {!showAllExercises && !allExercisesFetched && '(showing first 15)'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Unit Selection */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Unit:</span>
              <div className="relative">
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="appearance-none bg-white border border-gray-300 rounded px-3 py-1.5 pr-8 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Units</option>
                  {units.map(unit => (
                    <option key={unit.id} value={unit.id}>
                      {unit.title}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 bottom-[5%] transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Session Selection - only show when a unit is selected */}
            {selectedUnit !== 'all' && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Lesson:</span>
                <div className="relative">
                  <select
                    value={selectedSession}
                    onChange={(e) => setSelectedSession(e.target.value)}
                    className="appearance-none bg-white border border-gray-300 rounded px-3 py-1.5 pr-8 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Lessons</option>
                    {sessions.map(session => (
                      <option key={session.id} value={session.id}>
                        {session.assigned_student_id ? '👤 ' : ''}{session.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 bottom-[5%] transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              {!allExercisesFetched && !showAllExercises && (
                <button
                  onClick={handleShowAllExercises}
                  className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-600 hover:border-blue-800 rounded whitespace-nowrap"
                >
                  Show All
                </button>
              )}
              <button
                onClick={() => fetchMatrixData(showAllExercises ? null : 15)}
                className="flex items-center space-x-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border rounded"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-900 border-r">
                Student
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-900 min-w-[100px] border-r bg-gray-100">
                <div className="space-y-1">
                  <div>Average</div>
                  <button
                    onClick={() => setAverageMode(averageMode === 'all' ? 'attempted' : 'all')}
                    className="text-xs px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
                    title={averageMode === 'all' ? 'Currently: All exercises (unattempted = 0%)' : 'Currently: Attempted only'}
                  >
                    {averageMode === 'all' ? 'All' : 'Attempted'}
                  </button>
                </div>
              </th>
              {exercises.map(exercise => (
                <th
                  key={exercise.id}
                  className="px-3 py-3 text-center text-xs font-medium text-gray-600 min-w-[120px] border-r"
                  title={`${exercise.title} (${exercise.exercise_type}) - ${exercise.session_title}`}
                >
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-gray-900 truncate">{exercise.title}</div>
                    <div className="text-xs text-gray-500 truncate flex items-center justify-center gap-1">
                      {exercise.assigned_student_id && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-purple-100 text-purple-700 text-[9px] font-bold flex-shrink-0">
                          <User className="w-2.5 h-2.5" />1:1
                        </span>
                      )}
                      <span className="truncate">{exercise.session_title}</span>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {students.map(student => (
              <tr key={student.id} className="hover:bg-gray-50">
                <td className="sticky left-0 bg-white px-4 py-3 border-r">
                  <div className="flex items-center">
                    {student.avatar_url ? (
                      <img src={student.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover mr-3" />
                    ) : (
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                        <span className="text-blue-600 font-semibold text-sm">
                          {student.full_name?.charAt(0).toUpperCase() || '?'}
                        </span>
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {student.full_name || 'No name'}
                      </div>
                      <div className="text-xs text-gray-600">{student.email}</div>
                      {student.assigned_at && (
                        <div className="text-[10px] text-gray-400">
                          Enrolled {new Date(student.assigned_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                {/* Average Column */}
                <td className="px-2 py-3 text-center border-r bg-gray-50">
                  {(() => {
                    const avg = getStudentAverage(student.id);
                    return avg !== null ? (
                      <span className={`text-sm px-2 py-1 rounded-full font-semibold ${getScoreColor(avg)}`}>
                        {avg}%
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    );
                  })()}
                </td>
                {exercises.map(exercise => {
                  // Personal session: only show data for the assigned student
                  const isPersonalForOther = exercise.assigned_student_id && exercise.assigned_student_id !== student.id;
                  if (isPersonalForOther) {
                    return (
                      <td key={`${student.id}-${exercise.id}`} className="px-2 py-3 text-center border-r bg-gray-50">
                        <span className="text-[10px] text-gray-300">—</span>
                      </td>
                    );
                  }

                  const progress = getProgressForCell(student.id, exercise.id);
                  const scorePercentage = getScorePercentage(progress);
                  const isVideo = VIDEO_TYPES.includes(exercise.exercise_type);
                  const videoSubs = isVideo ? videoSubmissionsMap.get(`${student.id}-${exercise.id}`) || [] : [];
                  const pendingVideoCount = videoSubs.filter(s => s.status === 'pending').length;
                  const reviewedVideoCount = videoSubs.filter(s => s.status === 'reviewed').length;

                  return (
                    <td
                      key={`${student.id}-${exercise.id}`}
                      className="px-2 py-3 text-center border-r"
                    >
                      {isVideo ? (
                        <div className="flex flex-col items-center justify-center space-y-1">
                          {videoSubs.length === 0 ? (
                            <span className="text-xs text-gray-400">-</span>
                          ) : (
                            <>
                              <div className="flex items-center space-x-1">
                                {reviewedVideoCount > 0 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-green-500 text-white">
                                    {Math.round(videoSubs.filter(s => s.status === 'reviewed').reduce((sum, s) => sum + (s.teacher_score || 0), 0) / reviewedVideoCount)}
                                  </span>
                                )}
                                {pendingVideoCount > 0 && (
                                  <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                                    <Clock className="w-3 h-3" />
                                    {pendingVideoCount}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => handleVideoCell(student.id, student.full_name, exercise.id, exercise.title)}
                                className="text-blue-600 hover:text-blue-800 transition-colors"
                                title="Review video submissions"
                              >
                                <Video className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center space-y-1">
                          <div className="flex items-center space-x-1">
                            {scorePercentage !== null && (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${getScoreColor(scorePercentage)}`}
                              >
                                {scorePercentage}%
                              </span>
                            )}
                            {progress?.attempts && (
                              <span className="text-xs text-gray-500">
                                {progress.attempts}x
                              </span>
                            )}
                          </div>
                          {progress && (
                            <button
                              onClick={() => fetchQuestionAttempts(student.id, student.full_name, exercise.id, exercise.title)}
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              title="View question attempts"
                            >
                              <Eye className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Legend:</h4>
        <div className="flex flex-wrap gap-4 text-xs text-gray-600">
         
          <div className="flex items-center space-x-1">
            <span className="px-1.5 py-0.5 bg-green-400 text-green-800 rounded-full">90%+</span>
            <span>Excellent</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 rounded-full">75%+</span>
            <span>Good</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded-full">60%+</span>
            <span>Fair</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="px-1.5 py-0.5 bg-red-200 text-red-800 rounded-full">&lt;60%</span>
            <span>Needs Help</span>
          </div>
          <span className="text-gray-300">|</span>
          <div className="flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Video Pending</span>
          </div>
          <div className="flex items-center space-x-1">
            <Video className="w-3.5 h-3.5 text-blue-600" />
            <span>Video Review</span>
          </div>
        </div>
      </div>

      {/* Question Attempts Modal */}
      {selectedCell && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedCell.exerciseTitle}</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Student: <span className="font-medium text-gray-900">{selectedCell.studentName}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const exIdx = exercises.findIndex(e => e.id === selectedCell.exerciseId)
                    const prevEx = exercises[exIdx - 1]
                    const nextEx = exercises[exIdx + 1]
                    return (
                      <>
                        <button
                          onClick={() => fetchQuestionAttempts(selectedCell.studentId, selectedCell.studentName, prevEx.id, prevEx.title)}
                          disabled={!prevEx}
                          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title={prevEx ? prevEx.title : ''}
                        >
                          <ChevronLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <span className="text-xs text-gray-400">{exIdx + 1} / {exercises.length}</span>
                        <button
                          onClick={() => fetchQuestionAttempts(selectedCell.studentId, selectedCell.studentName, nextEx.id, nextEx.title)}
                          disabled={!nextEx}
                          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title={nextEx ? nextEx.title : ''}
                        >
                          <ChevronRight className="w-5 h-5 text-gray-600" />
                        </button>
                      </>
                    )
                  })()}
                  {isAdmin && (
                    <button
                      onClick={handleResetProgress}
                      disabled={resetting}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 ml-2"
                      title="Reset this student's progress on this exercise"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
                      {resetting ? 'Resetting...' : 'Reset'}
                    </button>
                  )}
                  <button
                    onClick={closeModal}
                    className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 min-h-0">
              {/* Exercise Info */}
              {exerciseDetail && (
                <div className="mb-6 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
                      {exerciseDetail.exercise_type?.replace(/_/g, ' ')}
                    </span>
                    {exerciseDetail.difficulty_level && (
                      <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                        Difficulty: {exerciseDetail.difficulty_level}/5
                      </span>
                    )}
                    {exerciseDetail.xp_reward && (
                      <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                        {exerciseDetail.xp_reward} XP
                      </span>
                    )}
                    {exerciseDetail.estimated_duration && (
                      <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                        ~{exerciseDetail.estimated_duration} min
                      </span>
                    )}
                    {exerciseDetail.content?.questions && (
                      <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                        {exerciseDetail.content.questions.length} questions
                      </span>
                    )}
                  </div>
                  {exerciseDetail.description && (
                    <p className="text-sm text-gray-600">{exerciseDetail.description}</p>
                  )}
                  {exerciseDetail.content?.intro && (
                    <div className="text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3"
                      dangerouslySetInnerHTML={{ __html: exerciseDetail.content.intro }}
                    />
                  )}
                </div>
              )}
              {loadingAttempts ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="ml-3 text-gray-600">Loading...</p>
                </div>
              ) : isVideoExercise ? (
                /* Video Submissions Content */
                videoSubmissions.length === 0 ? (
                  <div className="text-center py-12">
                    <Video className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600">No video submissions from this student.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {videoSubmissions.map((sub, idx) => {
                      const isReviewed = sub.status === 'reviewed';
                      return (
                        <div key={sub.id} className={`border rounded-lg overflow-hidden ${isReviewed ? 'border-green-200' : 'border-amber-200'}`}>
                          {/* Submission header */}
                          <div className={`px-4 py-2 flex items-center justify-between ${isReviewed ? 'bg-green-50' : 'bg-amber-50'}`}>
                            <span className="text-sm font-medium text-gray-700">
                              Q{sub.question_index + 1}
                            </span>
                            <div className="flex items-center gap-2">
                              {isReviewed ? (
                                <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                                  <CheckCircle className="w-3.5 h-3.5" /> {sub.teacher_score}/100
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs font-medium text-amber-700">
                                  <Clock className="w-3.5 h-3.5" /> Pending
                                </span>
                              )}
                              <span className="text-xs text-gray-400">AI: {sub.ai_score || 0}</span>
                            </div>
                          </div>

                          <div className="p-4 space-y-3">
                            {/* Video player */}
                            <div className="rounded-lg overflow-hidden bg-black">
                              <video src={sub.video_url} controls className="w-full max-h-72 object-contain" />
                            </div>

                            {/* Transcription */}
                            {sub.transcription && (
                              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                <p className="text-xs font-semibold text-gray-500 mb-1">Transcription:</p>
                                <p className="text-sm text-gray-800">{sub.transcription}</p>
                              </div>
                            )}

                            {/* AI scores */}
                            {sub.ai_result && (
                              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-xs font-semibold text-blue-600 mb-2">AI Reference Score: {sub.ai_score}/100</p>
                                <div className="grid grid-cols-4 gap-2 mb-2">
                                  {['content_score', 'vocabulary_score', 'grammar_score', 'fluency_score'].map(key => (
                                    <div key={key} className="text-center">
                                      <div className="text-sm font-bold text-blue-700">{Math.round(sub.ai_result[key] || 0)}</div>
                                      <div className="text-[10px] text-blue-500 capitalize">{key.replace('_score', '')}</div>
                                    </div>
                                  ))}
                                </div>
                                {sub.ai_result.strengths && (
                                  <p className="text-xs text-blue-700"><strong>Strengths:</strong> {sub.ai_result.strengths}</p>
                                )}
                                {sub.ai_result.suggestions && (
                                  <p className="text-xs text-blue-700 mt-1"><strong>Suggestions:</strong> {sub.ai_result.suggestions}</p>
                                )}
                              </div>
                            )}

                            {/* Already reviewed */}
                            {isReviewed && (
                              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-1">
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                  <p className="text-sm font-semibold text-green-800">Teacher Score: {sub.teacher_score}/100</p>
                                </div>
                                {sub.teacher_feedback && (
                                  <p className="text-sm text-green-700">{sub.teacher_feedback}</p>
                                )}
                                <p className="text-xs text-green-500 mt-1">
                                  Reviewed on {new Date(sub.reviewed_at).toLocaleDateString()}
                                </p>
                              </div>
                            )}

                            {/* Teacher scoring form */}
                            {!isReviewed && (
                              <div className="p-4 border-2 border-teal-200 rounded-lg space-y-3">
                                <p className="text-sm font-semibold text-teal-800">Your Rating</p>
                                <div className="flex items-center gap-3">
                                  <label className="text-sm text-gray-600 w-16">Score:</label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={teacherScores[sub.id] ?? ''}
                                    onChange={(e) => setTeacherScores(prev => ({ ...prev, [sub.id]: e.target.value }))}
                                    placeholder={`AI suggests ${sub.ai_score}`}
                                    className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                                  />
                                  <span className="text-xs text-gray-400">/ 100</span>
                                </div>
                                <div>
                                  <label className="text-sm text-gray-600">Feedback (optional):</label>
                                  <textarea
                                    value={teacherFeedbacks[sub.id] || ''}
                                    onChange={(e) => setTeacherFeedbacks(prev => ({ ...prev, [sub.id]: e.target.value }))}
                                    rows={2}
                                    placeholder="Write feedback for the student..."
                                    className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                                  />
                                </div>
                                <button
                                  onClick={() => handleVideoReview(sub)}
                                  disabled={submittingReview === sub.id || !teacherScores[sub.id]}
                                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                  {submittingReview === sub.id ? (
                                    <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting...</>
                                  ) : (
                                    <><Send className="w-4 h-4" /> Submit Review</>
                                  )}
                                </button>
                              </div>
                            )}

                            <p className="text-xs text-gray-400">
                              Submitted {new Date(sub.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : questionAttempts.length === 0 ? (
                <div className="space-y-4">
                  {/* Score from user_progress */}
                  {(() => {
                    const progress = getProgressForCell(selectedCell.studentId, selectedCell.exerciseId);
                    const score = getScorePercentage(progress);
                    return progress ? (
                      <div className="flex items-center gap-3 mb-4 text-sm">
                        <span className={`px-3 py-1.5 rounded-lg font-bold ${getScoreColor(score)}`}>
                          Score: {progress.score}/{progress.max_score} ({score}%)
                        </span>
                        {progress.completed_at && (
                          <span className="text-xs text-gray-500">
                            Completed {new Date(progress.completed_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    ) : null;
                  })()}

                  {/* Answer key for pdf_worksheet */}
                  {exerciseDetail?.exercise_type === 'pdf_worksheet' && exerciseDetail?.content?.pages?.length > 0 && (
                    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Answer Key
                      </h4>
                      <div className="space-y-1.5">
                        {exerciseDetail.content.pages.flatMap((page, pi) =>
                          (page.fields || []).map((field, fi) => (
                            <div key={`${pi}-${fi}`} className="flex items-center gap-2 text-sm">
                              <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold text-xs">
                                {exerciseDetail.content.pages.slice(0, pi).reduce((sum, p) => sum + (p.fields?.length || 0), 0) + fi + 1}
                              </span>
                              <span className="text-gray-600">{field.label || `Field ${fi + 1}`}:</span>
                              <span className="font-medium text-green-800 bg-green-50 px-2 py-0.5 rounded">
                                {field.type === 'text' && field.correct_answer}
                                {field.type === 'dropdown' && (field.options?.[field.correct_option] || 'N/A')}
                                {field.type === 'checkbox' && (field.correct_answer === 'true' ? 'Checked' : 'Unchecked')}
                              </span>
                              <span className="text-xs text-gray-400 capitalize">({field.type})</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Answer key for fill_blank / dropdown / multiple_choice / drag_drop etc. */}
                  {exerciseDetail?.content?.questions?.length > 0 && (
                    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Answer Key
                      </h4>
                      <div className="space-y-2">
                        {exerciseDetail.content.questions.map((q, qi) => {
                          const exType = exerciseDetail.exercise_type;
                          return (
                            <div key={qi} className="flex items-start gap-2 text-sm">
                              <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold text-xs mt-0.5">
                                {qi + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                {q.question && (
                                  <p className="text-gray-600 text-xs mb-1" dangerouslySetInnerHTML={{ __html: q.question.replace(/<img[^>]*>/gi, '').substring(0, 200) }} />
                                )}
                                <div className="flex flex-wrap items-center gap-1">
                                  {exType === 'multiple_choice' && q.options && (
                                    <span className="font-medium text-green-800 bg-green-50 px-2 py-0.5 rounded">
                                      {q.options[q.correct_answer] || `Option ${q.correct_answer}`}
                                    </span>
                                  )}
                                  {exType === 'fill_blank' && q.blanks?.map((blank, bi) => (
                                    <span key={bi} className="font-medium text-green-800 bg-green-50 px-2 py-0.5 rounded">
                                      {blank.answer}
                                    </span>
                                  ))}
                                  {exType === 'dropdown' && q.dropdowns?.map((dd, di) => (
                                    <span key={di} className="font-medium text-green-800 bg-green-50 px-2 py-0.5 rounded">
                                      {dd.correct_answer}
                                    </span>
                                  ))}
                                  {exType === 'drag_drop' && q.drop_zones?.map((zone, zi) => (
                                    <span key={zi} className="font-medium text-green-800 bg-green-50 px-2 py-0.5 rounded">
                                      {zone.label}: {q.items?.find(it => it.id === q.correct_order?.[zi])?.text || q.correct_order?.[zi]}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!exerciseDetail?.content?.pages?.length && !exerciseDetail?.content?.questions?.length && (
                    <div className="text-center py-8">
                      <p className="text-gray-500 text-sm">No detailed question data available for this attempt.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <div className="flex items-center gap-3 mb-4 text-sm">
                    <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 font-bold">
                      <CheckCircle className="w-4 h-4" />
                      {questionAttempts.filter(a => a.is_correct).length} correct
                    </span>
                    <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 font-bold">
                      <XCircle className="w-4 h-4" />
                      {questionAttempts.filter(a => !a.is_correct).length} incorrect
                    </span>
                    <span className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 font-bold text-blue-700">
                      {Math.round((questionAttempts.filter(a => a.is_correct).length / questionAttempts.length) * 100)}% accuracy
                    </span>
                  </div>

                  <SingleExerciseReview
                    exercise={exerciseDetail}
                    questionAttempts={questionAttempts}
                    onOverride={handleOverrideCorrectness}
                    overriding={overriding}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentExerciseMatrix;