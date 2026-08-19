import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../../supabase/client';
import {
  FileText,
  ArrowLeft,
  ClipboardCheck,
  BarChart3,
  Calendar,
  Save as SaveIcon,
  Info,
  MessageSquare,
  X,
  Eye,
  Upload
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useTeacherCourse } from '../../../hooks/useTeacherCourseContext';
import { useLessonRecords } from '../../../hooks/useLessonRecords';
import { useLessonInfo } from '../../../hooks/useLessonInfo';

import LessonInfoView from './LessonInfoView';
import RollCallView from './RollCallView';
import HomeworkReportView from './HomeworkReportView';
import ClassPerformanceView from './ClassPerformanceView';
import LessonFeedbackView from './LessonFeedbackView';

const getDraftKey = (courseId, date) => `lesson_draft_${courseId}_${date}`;

const saveDraft = (courseId, date, lessonInfo, records) => {
  try {
    const key = getDraftKey(courseId, date);
    localStorage.setItem(key, JSON.stringify({ lessonInfo, records, savedAt: Date.now() }));
  } catch (e) { /* localStorage full or unavailable */ }
};

const loadDraft = (courseId, date) => {
  try {
    const key = getDraftKey(courseId, date);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    // Expire drafts older than 24 hours
    if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch (e) { return null; }
};

const clearDraft = (courseId, date) => {
  try { localStorage.removeItem(getDraftKey(courseId, date)); } catch (e) { /* */ }
};

const TeacherClassReports = () => {
  const { loading: authLoading } = useAuth();
  const { courses, selectedCourse, setSelectedCourse, selectedDate, setSelectedDate, loading: coursesLoading } = useTeacherCourse();
  const { fetchRecords, saveRecords, loading: recordsLoading } = useLessonRecords();
  const { fetchLessonInfo, saveLessonInfo, loading: infoLoading } = useLessonInfo();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'info');
  const initialCourse = searchParams.get('course');
  const initialDate = searchParams.get('date');
  const fromCourse = searchParams.get('from') === 'course';
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState({});
  const [lessonInfo, setLessonInfo] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [notification, setNotification] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [isDbDraft, setIsDbDraft] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const skipDraftSave = useRef(false);

  // Pre-select course and date from URL params
  useEffect(() => {
    if (initialCourse && courses.length > 0 && courses.some(c => c.id === initialCourse)) {
      setSelectedCourse(initialCourse);
    }
    if (initialDate && !selectedDate) {
      setSelectedDate(initialDate);
    }
  }, [initialCourse, initialDate, courses, setSelectedCourse, selectedDate, setSelectedDate]);

  const selectedCourseData = courses.find(course => course.id === selectedCourse);

  const tabs = [
    { id: 'info', label: 'Info', icon: Info },
    { id: 'roll-call', label: 'Roll Call', icon: ClipboardCheck },
    { id: 'homework', label: 'Homework', icon: FileText },
    { id: 'performance', label: 'Class Work', icon: BarChart3 },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare }
  ];

  // Auto-save draft to localStorage on every change
  useEffect(() => {
    if (skipDraftSave.current || !selectedCourse || !selectedDate) return;
    const hasData = Object.keys(records).length > 0 || lessonInfo.lesson_name || lessonInfo.lesson_mode || lessonInfo.lesson_tags || lessonInfo.feedback;
    if (hasData) {
      saveDraft(selectedCourse, selectedDate, lessonInfo, records);
    }
  }, [records, lessonInfo, selectedCourse, selectedDate]);

  // Warn before closing/refreshing with unsaved data
  useEffect(() => {
    const hasChanges = Object.keys(records).length > 0 || lessonInfo.lesson_name || lessonInfo.lesson_mode || lessonInfo.feedback;
    if (!hasChanges) return;
    const handler = (e) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [records, lessonInfo]);

  // Load data when course/date changes
  // Skip if URL has a course param that hasn't been applied yet
  useEffect(() => {
    if (!selectedCourse || !selectedDate) return;
    if (initialCourse && selectedCourse !== initialCourse) return;
    loadData();
  }, [selectedCourse, selectedDate]);

  const loadData = async () => {
    if (!selectedCourse) return;

    try {
      setLoading(true);

      const { data: enrollments, error: enrollError } = await supabase
        .from('course_enrollments')
        .select(`
          student_id,
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
        .eq('is_active', true)
        .order('student(full_name)');

      if (enrollError) throw enrollError;

      const studentsList = enrollments
        .map(e => e.student)
        .filter(s => s !== null)
        .map(s => ({
          ...s,
          full_name: s.real_name || s.full_name,
          avatar_url: s.real_avatar_url || s.avatar_url
        }));
      setStudents(studentsList);

      const existingInfo = await fetchLessonInfo(selectedCourse, selectedDate);

      // Fetch student records linked to this lesson
      const recordsMap = {};
      if (existingInfo?.id) {
        const existing = await fetchRecords(existingInfo.id);
        existing.forEach(record => {
          recordsMap[record.student_id] = record;
        });
      }

      // Pre-fill attendance_status: 'present' for any student not already in recordsMap
      // so the state matches the visual default shown in RollCallView
      studentsList.forEach(s => {
        if (!recordsMap[s.id]) {
          recordsMap[s.id] = { attendance_status: 'present' };
        }
      });

      // If DB has data, use it. Otherwise check for a localStorage draft.
      const dbHasData = existingInfo?.id;
      if (dbHasData) {
        skipDraftSave.current = true;
        // Derive lesson_type since it's not persisted to DB
        const derivedType = existingInfo.lesson_mode
          ? 'Theo chương trình'
          : existingInfo.lesson_name ? 'Bài tự chọn' : '';
        setLessonInfo({ ...existingInfo, lesson_type: derivedType });
        setRecords(recordsMap);
        setHasDraft(false);
        setIsDbDraft(!!existingInfo.is_draft);
        clearDraft(selectedCourse, selectedDate);
        skipDraftSave.current = false;
      } else {
        const draft = loadDraft(selectedCourse, selectedDate);
        skipDraftSave.current = true;
        if (draft) {
          setLessonInfo(draft.lessonInfo || { course_id: selectedCourse, session_date: selectedDate });
          setRecords(draft.records || {});
          setHasDraft(true);
          showNotification('Draft restored from previous session');
        } else {
          setLessonInfo({ course_id: selectedCourse, session_date: selectedDate });
          setRecords(recordsMap);
          setHasDraft(false);
        }
        setIsDbDraft(false);
        skipDraftSave.current = false;
      }
    } catch (error) {
      console.error('Error loading lesson data:', error);
      showNotification('Error loading data: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLessonInfoChange = (data) => {
    setLessonInfo(prev => ({
      ...prev,
      course_id: selectedCourse,
      session_date: selectedDate,
      ...data
    }));
  };

  const handleRecordChange = (studentId, data) => {
    setRecords(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        student_id: studentId,
        ...data
      }
    }));
  };

  const getIncompleTabs = () => {
    const missing = [];

    // Info: lesson_type required; for curriculum mode need level+unit+skill; for custom need name+skill
    if (!selectedDate || !lessonInfo.lesson_type || !lessonInfo.lesson_name || !lessonInfo.skill ||
        (lessonInfo.lesson_type === 'Theo chương trình' && !lessonInfo.lesson_mode)) {
      missing.push('Info');
    }

    // Roll Call: every student needs attendance
    const allHaveAttendance = students.length > 0 && students.every(s =>
      records[s.id]?.attendance_status
    );
    if (!allHaveAttendance) missing.push('Roll Call');

    // Homework (hand graded): every student needs homework_status
    const allHaveHomework = students.length > 0 && students.every(s =>
      records[s.id]?.homework_status
    );
    if (!allHaveHomework) missing.push('Homework');

    // Performance: every student needs performance_rating
    const allHavePerformance = students.length > 0 && students.every(s =>
      records[s.id]?.performance_rating
    );
    if (!allHavePerformance) missing.push('Class Work');

    // Feedback: feedback text required
    if (!lessonInfo.feedback?.trim()) missing.push('Feedback');

    return missing;
  };

  const incompleteTabs = getIncompleTabs();
  const canSave = incompleteTabs.length === 0;

  const perfXP = { ok: 30, good: 60, wow: 90 };
  const hwXP = { ok: 15, good: 30, wow: 45 };

  const calcXpUpdates = () => {
    const bonus = lessonInfo.xp_bonus || 1;
    const recordsArray = Object.values(records).filter(r => r.student_id);
    return recordsArray
      .map(rec => {
        const isPresent = rec.attendance_status === 'present' || rec.attendance_status === 'late';
        if (!isPresent) return null;

        const perf = perfXP[rec.performance_rating] || 0;
        const hw = hwXP[rec.homework_status] || 0;
        if (perf === 0 && hw === 0) return null;
        let xp = bonus * (perf + hw - (rec.attendance_status === 'late' ? 15 : 0));
        if (xp <= 0) return null;

        return { student_id: rec.student_id, xp };
      })
      .filter(Boolean);
  };

  const handleSaveDraft = async () => {
    try {
      setSavingDraft(true);

      // eslint-disable-next-line no-unused-vars
      const { xp_bonus, lesson_type, ...lessonInfoForDB } = lessonInfo;
      const savedInfo = await saveLessonInfo({
        ...lessonInfoForDB,
        course_id: selectedCourse,
        session_date: selectedDate
      }, { isDraft: true });

      if (!savedInfo) {
        showNotification('Failed to save draft', 'error');
        return;
      }

      const recordsArray = Object.values(records).filter(r => r.student_id);
      if (recordsArray.length > 0) {
        const recordsSuccess = await saveRecords(savedInfo.id, recordsArray);
        if (!recordsSuccess) {
          showNotification('Failed to save draft records', 'error');
          return;
        }
      }

      clearDraft(selectedCourse, selectedDate);
      setHasDraft(false);
      setIsDbDraft(true);
      setLessonInfo(prev => ({ ...prev, id: savedInfo.id }));
      showNotification('Draft saved to cloud');
    } catch (error) {
      console.error('Error saving draft:', error);
      showNotification('Error saving draft', 'error');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSave = async () => {
    setShowOverview(false);
    try {
      setSaving(true);

      // 1. Save lesson info first to get the id
      // eslint-disable-next-line no-unused-vars
      const { xp_bonus, lesson_type, ...lessonInfoForDB } = lessonInfo;
      const savedInfo = await saveLessonInfo({
        ...lessonInfoForDB,
        course_id: selectedCourse,
        session_date: selectedDate
      });

      if (!savedInfo) {
        showNotification('Failed to save lesson info', 'error');
        return;
      }

      // 2. Save student records linked to this lesson
      const recordsArray = Object.values(records).filter(r => r.student_id);
      if (recordsArray.length > 0) {
        const recordsSuccess = await saveRecords(savedInfo.id, recordsArray);
        if (!recordsSuccess) {
          showNotification('Failed to save student records', 'error');
          return;
        }
      }

      // Award XP & missions only on first finalize (new record or was a draft)
      const isFirstFinalize = !lessonInfo.id || isDbDraft;

      // 3. Award XP to students
      if (isFirstFinalize) {
        const xpUpdates = calcXpUpdates();
        if (xpUpdates.length > 0) {
          const { error: xpError } = await supabase.rpc('add_xp_batch', {
            updates: xpUpdates
          });
          if (xpError) console.error('[XP] Error awarding XP:', xpError);
        }

        // 4. Update mission progress for students with all-green lesson
        const allGreenStudents = recordsArray.filter(rec =>
          rec.attendance_status === 'present' &&
          rec.performance_rating === 'wow' &&
          rec.homework_status === 'wow'
        );
        for (const rec of allGreenStudents) {
          supabase.rpc('update_mission_progress', {
            p_user_id: rec.student_id,
            p_goal_type: 'all_green_lesson',
            p_increment: 1
          }).then(() => {}, () => {})
        }
      }

      clearDraft(selectedCourse, selectedDate);
      setHasDraft(false);
      setIsDbDraft(false);
      showNotification('Saved lesson successfully');
      navigate('/teacher/overview');
    } catch (error) {
      console.error('Error saving:', error);
      showNotification('Error saving records', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAll = (field, value) => {
    const newRecords = { ...records };
    students.forEach(student => {
      newRecords[student.id] = {
        ...newRecords[student.id],
        student_id: student.id,
        [field]: value,
      };
    });
    setRecords(newRecords);
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  if (authLoading || coursesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="ml-2 text-gray-600">Loading...</p>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-md text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Courses Assigned</h3>
          <p className="text-gray-600">You haven't been assigned to any courses yet.</p>
          <button
            onClick={() => navigate('/teacher')}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => fromCourse && initialCourse ? navigate(`/study/course/${initialCourse}`) : navigate('/teacher/overview')}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">{fromCourse ? 'Back to Course' : 'Back to Overview'}</span>
                </button>
                <div>
                  <h1 className="text-lg md:text-xl font-bold text-gray-900">Lesson Report</h1>
                  {selectedCourseData && (
                    <p className="text-xs md:text-sm text-gray-600 truncate max-w-[200px] md:max-w-none">
                      Course {selectedCourseData.level_number}: {selectedCourseData.title}
                    </p>
                  )}
                </div>
              </div>

              {/* Date shown as label — picker moved to Info tab */}
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">{selectedDate || 'Chọn ngày ở tab Info'}</span>
              </div>
            </div>

          </div>

          {/* Tabs - horizontally scrollable on mobile */}
          <div className="flex gap-1 mt-3 -mb-3 md:mt-4 md:-mb-4 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isIncomplete = incompleteTabs.includes(tab.label);
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 md:px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap flex-shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-gray-50 text-blue-600 border border-b-0 border-gray-200 -mb-px'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className={`w-2 h-2 rounded-full ${isIncomplete ? 'bg-gray-300' : 'bg-green-400'}`} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 md:pt-6">
          <div
            className={`p-4 rounded-lg ${
              notification.type === 'error'
                ? 'bg-red-50 border border-red-200 text-red-800'
                : 'bg-green-50 border border-green-200 text-green-800'
            }`}
          >
            {notification.message}
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
        <div className={activeTab === 'info' ? '' : 'hidden'}>
          <LessonInfoView
            lessonInfo={lessonInfo}
            onChange={handleLessonInfoChange}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
        </div>
        <div className={activeTab === 'roll-call' ? '' : 'hidden'}>
          <RollCallView
            students={students}
            records={records}
            onChange={handleRecordChange}
            onMarkAllPresent={() => handleMarkAll('attendance_status', 'present')}
            onMarkAllLate={() => handleMarkAll('attendance_status', 'late')}
            onMarkAllAbsent={() => handleMarkAll('attendance_status', 'absent')}
            loading={loading}
          />
        </div>
        <div className={activeTab === 'homework' ? '' : 'hidden'}>
          <HomeworkReportView
            students={students}
            courseId={selectedCourse}
            records={records}
            onChange={handleRecordChange}
            onMarkAll={(value) => handleMarkAll('homework_status', value)}
            loading={loading}
          />
        </div>
        <div className={activeTab === 'performance' ? '' : 'hidden'}>
          <ClassPerformanceView
            students={students}
            courseId={selectedCourse}
            records={records}
            onChange={handleRecordChange}
            onMarkAll={(value) => handleMarkAll('performance_rating', value)}
            loading={loading}
          />
        </div>
        <div className={activeTab === 'feedback' ? '' : 'hidden'}>
          <LessonFeedbackView
            lessonInfo={lessonInfo}
            onChange={handleLessonInfoChange}
          />
        </div>
      </div>

      {/* Save Button - always visible */}
      {selectedCourse && (
        <div className="sticky bottom-0 bg-white border-t shadow-lg">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!canSave && (
                <p className="text-sm text-red-500">
                  Incomplete: {incompleteTabs.join(', ')}
                </p>
              )}
              {isDbDraft && (
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-medium">Draft</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={savingDraft || saving || loading || !selectedDate}
                className="flex items-center gap-2 px-4 py-3 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-5 h-5" />
                {savingDraft ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                onClick={() => setShowOverview(true)}
                disabled={!canSave || saving || loading}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Eye className="w-5 h-5" />
                {saving ? 'Saving...' : 'Review & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Save Overview Modal */}
      {showOverview && (() => {
        const xpUpdates = calcXpUpdates();
        const totalXP = xpUpdates.reduce((sum, u) => sum + u.xp, 0);
        const attendanceLabels = { present: 'Present', late: 'Late', absent: 'Absent' };
        const ratingLabels = { ok: 'OK', good: 'Good', wow: 'Wow' };
        const bonus = lessonInfo.xp_bonus || 1;

        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowOverview(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h2 className="text-lg font-bold text-gray-900">Lesson Overview</h2>
                <button onClick={() => setShowOverview(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto px-5 py-4 space-y-4">
                {/* Lesson Info */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Lesson</span>
                    <span className="font-medium text-gray-900">{lessonInfo.lesson_name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Skill</span>
                    <span className="font-medium text-gray-900 capitalize">{lessonInfo.skill || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Date</span>
                    <span className="font-medium text-gray-900">{selectedDate}</span>
                  </div>
                  {bonus > 1 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">XP Bonus</span>
                      <span className="font-medium text-yellow-600">x{bonus}</span>
                    </div>
                  )}
                </div>

                {/* Student XP Table */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Student XP Awards</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Student</th>
                          <th className="text-center px-2 py-2 font-medium text-gray-600">Attend.</th>
                          <th className="text-center px-2 py-2 font-medium text-gray-600">CW</th>
                          <th className="text-center px-2 py-2 font-medium text-gray-600">Score</th>
                          <th className="text-center px-2 py-2 font-medium text-gray-600">HW</th>
                          <th className="text-center px-2 py-2 font-medium text-gray-600">Score</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">XP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {students.map(s => {
                          const rec = records[s.id] || {};
                          const xpEntry = xpUpdates.find(u => u.student_id === s.id);
                          const isAbsent = rec.attendance_status === 'absent';
                          return (
                            <tr key={s.id} className={isAbsent ? 'text-gray-400' : ''}>
                              <td className="px-3 py-2 truncate max-w-[140px]">{s.full_name}</td>
                              <td className="px-2 py-2 text-center text-xs">
                                <span className={`inline-block px-1.5 py-0.5 rounded-full ${
                                  rec.attendance_status === 'present' ? 'bg-green-100 text-green-700' :
                                  rec.attendance_status === 'late' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {attendanceLabels[rec.attendance_status] || '—'}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-center text-xs">
                                <span className={`inline-block px-1.5 py-0.5 rounded-full ${
                                  rec.performance_rating === 'wow' ? 'bg-green-100 text-green-700' :
                                  rec.performance_rating === 'good' ? 'bg-yellow-100 text-yellow-700' :
                                  rec.performance_rating === 'ok' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {ratingLabels[rec.performance_rating] || '—'}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-center text-xs text-gray-600">
                                {rec.score != null ? `${rec.score}/${rec.max_score ?? '?'}` : '—'}
                              </td>
                              <td className="px-2 py-2 text-center text-xs">
                                <span className={`inline-block px-1.5 py-0.5 rounded-full ${
                                  rec.homework_status === 'wow' ? 'bg-green-100 text-green-700' :
                                  rec.homework_status === 'good' ? 'bg-yellow-100 text-yellow-700' :
                                  rec.homework_status === 'ok' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {ratingLabels[rec.homework_status] || '—'}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-center text-xs text-gray-600">
                                {rec.homework_score != null ? `${rec.homework_score}/${rec.homework_max_score ?? '?'}` : '—'}
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                {xpEntry ? <span className="text-blue-600">+{xpEntry.xp}</span> : <span className="text-gray-300">0</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center mt-2 px-1">
                    <span className="text-sm text-gray-500">{xpUpdates.length} students receiving XP</span>
                    <span className="text-sm font-bold text-blue-600">Total: +{totalXP} XP</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t bg-gray-50">
                <button
                  onClick={() => setShowOverview(false)}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <SaveIcon className="w-4 h-4" />
                  Confirm Save
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default TeacherClassReports;
