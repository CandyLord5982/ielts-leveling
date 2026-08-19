import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';
import {
  Users,
  UserPlus,
  UserMinus,
  Search,
  BookOpen,
  AlertCircle,
  CheckCircle,
  Filter
} from 'lucide-react';

import { useCohorts } from '../../hooks/useCohorts';

const StudentEnrollmentManagement = () => {
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [isCohortModalOpen, setIsCohortModalOpen] = useState(false);
  const [selectedCohort, setSelectedCohort] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const { cohorts, fetchCohortMembers, loading: cohortsLoading } = useCohorts();

  useEffect(() => {
    fetchCourses();
    fetchStudents();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      fetchEnrollments(selectedCourse);
    }
  }, [selectedCourse]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const fetchCourses = async () => {
    try {
      // Try courses table first
      let { data, error } = await supabase
        .from('courses')
        .select(`
          id,
          title,
          level_number,
          teacher:users(full_name)
        `)
        .eq('is_active', true)
        .order('level_number');

      // If courses table doesn't exist, try levels table as fallback
      if (error && error.code === 'PGRST205') {
        console.log('Courses table not found in enrollment management, trying levels table...');
        const fallback = await supabase
          .from('levels')
          .select(`
            id,
            title,
            level_number
          `)
          .eq('is_active', true)
          .order('level_number');

        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;
      setCourses(data || []);
    } catch (error) {
      console.error('Error fetching courses:', error);
      showNotification('Error loading courses: ' + error.message, 'error');
    }
  };

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, xp, current_level')
        .eq('role', 'user')
        .order('full_name');

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
      showNotification('Error loading students: ' + error.message, 'error');
    }
  };

  const fetchEnrollments = async (courseId) => {
    console.log('🔄 Fetching enrollments for course:', courseId);
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('course_enrollments')
        .select(`
          id,
          student_id,
          assigned_at,
          is_active,
          users!student_id(id, full_name, email, xp)
        `)
        .eq('course_id', courseId)
        .eq('is_active', true);

      console.log('📊 Fetch enrollments result:', { data, error });

      if (error) throw error;
      console.log('📝 Setting enrollments state:', data?.length, 'students');
      setEnrollments(data || []);
    } catch (error) {
      console.error('❌ Error fetching enrollments:', error);
      showNotification('Error loading enrollments: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEnrollCohort = async () => {
    if (!selectedCourse) {
      showNotification('Please select a course first', 'error');
      return;
    }
    if (!selectedCohort) {
      showNotification('Please select a cohort', 'error');
      return;
    }

    try {
      setBulkLoading(true);
      const members = await fetchCohortMembers(selectedCohort);
      const activeMembers = (members || []).filter(m => m.is_active);
      if (activeMembers.length === 0) {
        showNotification('Selected cohort has no active members', 'error');
        return;
      }

      const user = (await supabase.auth.getUser()).data.user;
      const rows = activeMembers.map(m => ({
        course_id: selectedCourse,
        student_id: m.student_id,
        assigned_by: user?.id,
        is_active: true,
        cohort_id: selectedCohort // Track which cohort this enrollment came from
      }));

      const { error } = await supabase
        .from('course_enrollments')
        .upsert(rows, { onConflict: 'course_id,student_id' });

      if (error) throw error;

      showNotification(`Enrolled cohort successfully (${activeMembers.length} members)`);
      setIsCohortModalOpen(false);
      setSelectedCohort('');
      await fetchEnrollments(selectedCourse);
    } catch (error) {
      console.error('Error enrolling cohort:', error);
      showNotification('Error enrolling cohort: ' + error.message, 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleEnrollStudent = async (studentId) => {
    console.log('🎓 Starting enrollment:', { studentId, selectedCourse });

    if (!selectedCourse) {
      showNotification('Please select a course first', 'error');
      return;
    }

    try {
      setLoading(true);

      console.log('💾 Upserting enrollment (will update if exists, insert if not)...');
      const currentUser = await supabase.auth.getUser();
      console.log('👤 Current user:', currentUser.data.user?.id);

      const enrollmentData = {
        course_id: selectedCourse,
        student_id: studentId,
        assigned_by: currentUser.data.user.id,
        is_active: true,
        updated_at: new Date().toISOString() // Add timestamp to ensure upsert works
      };
      console.log('📝 Enrollment data:', enrollmentData);

      const { data: result, error } = await supabase
        .from('course_enrollments')
        .upsert(enrollmentData, {
          onConflict: 'course_id,student_id',
          ignoreDuplicates: false // This will update existing records instead of ignoring
        });

      console.log('✅ Upsert result:', result);

      if (error) {
        console.error('❌ Enrollment error:', error);
        throw error;
      }

      console.log('🎉 Enrollment successful!');
      showNotification('Student enrolled successfully!');

      // Add a small delay before fetching to ensure database consistency
      console.log('⏳ Waiting 500ms before refresh...');
      await new Promise(resolve => setTimeout(resolve, 500));

      await fetchEnrollments(selectedCourse);
    } catch (error) {
      console.error('💥 Full error in handleEnrollStudent:', error);
      showNotification('Error enrolling student: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUnenrollStudent = async (enrollmentId, studentName) => {
    if (!confirm(`Are you sure you want to unenroll ${studentName} from this course?`)) {
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('course_enrollments')
        .update({ is_active: false })
        .eq('id', enrollmentId);

      if (error) throw error;

      showNotification('Student unenrolled successfully!');
      await fetchEnrollments(selectedCourse);
    } catch (error) {
      console.error('Error unenrolling student:', error);
      showNotification('Error unenrolling student: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const getEnrolledStudentIds = () => {
    return enrollments.map(enrollment => enrollment.student_id);
  };

  const filteredStudents = students.filter(student =>
    student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availableStudents = filteredStudents.filter(
    student => !getEnrolledStudentIds().includes(student.id)
  );

  const selectedCourseData = courses.find(course => course.id === selectedCourse);

  return (
    <div className="space-y-6">

      {/* Course Selection */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Course
        </label>
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          className="w-full max-w-md p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Choose a course...</option>
          {courses.map(course => (
            <option key={course.id} value={course.id}>
              Course {course.level_number}: {course.title}
              {course.teacher?.full_name && ` - ${course.teacher.full_name}`}
            </option>
          ))}
        </select>

        <div className="mt-4">
          <button
            onClick={() => setIsCohortModalOpen(true)}
            disabled={!selectedCourse}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Enroll Cohort
          </button>
        </div>
      </div>

      {selectedCourse && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Available Students */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  Available Students ({availableStudents.length})
                </h3>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 bottom-[5%] transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search students..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {availableStudents.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  {searchTerm ? 'No students match your search' : 'All students are enrolled in this course'}
                </div>
              ) : (
                availableStudents.map(student => (
                  <div key={student.id} className="flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{student.full_name}</div>
                      <div className="text-sm text-gray-600">{student.email}</div>
                      <div className="text-xs text-gray-500">
                        Level {student.current_level || 1} • {student.xp || 0} XP
                      </div>
                    </div>
                    <button
                      onClick={() => handleEnrollStudent(student.id)}
                      disabled={loading}
                      className="bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      <UserPlus className="w-4 h-4" />
                      Enroll
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Enrolled Students */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Enrolled Students ({enrollments.length})
              </h3>
              {selectedCourseData && (
                <p className="text-sm text-gray-600 mt-1">
                  {selectedCourseData.title}
                </p>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading enrolled students...</p>
                </div>
              ) : enrollments.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  No students enrolled in this course yet
                </div>
              ) : (
                enrollments.map(enrollment => (
                  <div key={enrollment.id} className="flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{enrollment.users.full_name}</div>
                      <div className="text-sm text-gray-600">{enrollment.users.email}</div>
                      <div className="text-xs text-gray-500">
                        {enrollment.users.xp || 0} XP • Enrolled {new Date(enrollment.assigned_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnenrollStudent(enrollment.id, enrollment.users.full_name)}
                      disabled={loading}
                      className="bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      <UserMinus className="w-4 h-4" />
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* No Course Selected */}
      {!selectedCourse && (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Course</h3>
          <p className="text-gray-600">Choose a course above to manage student enrollments</p>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
          notification.type === 'error'
            ? 'bg-red-500 text-white'
            : 'bg-green-500 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'error' ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              <CheckCircle className="w-5 h-5" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {isCohortModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">Enroll Cohort to Selected Course</h3>
              <p className="text-sm text-gray-600 mt-1">Choose a cohort to enroll all its active members.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cohort</label>
                <select
                  value={selectedCohort}
                  onChange={(e) => setSelectedCohort(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose a cohort...</option>
                  {(cohorts || []).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {cohortsLoading && (
                  <div className="text-sm text-gray-500 mt-2">Loading cohorts...</div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
              <button
                onClick={() => setIsCohortModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                disabled={bulkLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleEnrollCohort}
                disabled={!selectedCohort || bulkLoading}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkLoading ? 'Enrolling...' : 'Enroll Cohort'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentEnrollmentManagement;