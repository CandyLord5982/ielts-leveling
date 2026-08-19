import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  X, 
  AlertCircle, 
  CheckCircle,
  Eye,
  Copy
} from 'lucide-react';

const CourseManagement = () => {
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    fetchCourses();
    fetchTeachers();
  }, []);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const fetchCourses = async () => {
    try {
      setLoading(true);

      // Try courses table first
      let { data, error } = await supabase
        .from('courses')
        .select(`
          *,
          course_teachers(
            teacher:users(id, full_name, email)
          )
        `)
        .order('level_number');

      // If courses table doesn't exist, try levels table as fallback
      if (error && error.code === 'PGRST205') {
        console.log('Courses table not found in admin, trying levels table...');
        const fallback = await supabase
          .from('levels')
          .select('*')
          .order('level_number');

        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;
      setCourses(data || []);
    } catch (error) {
      console.error('Error fetching courses:', error);
      showNotification('Error loading courses: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'teacher');

      if (error) throw error;
      setTeachers(data || []);
    } catch (error) {
      console.error('Error fetching teachers:', error);
      showNotification('Error loading teachers: ' + error.message, 'error');
    }
  };

  const handleSaveCourse = async (courseData) => {
    try {
      setLoading(true);

      const { teacher_ids, ...courseFields } = courseData;

      if (editingCourse) {
        // Update existing course - try courses table first
        let { error } = await supabase
          .from('courses')
          .update(courseFields)
          .eq('id', editingCourse.id);

        // If courses table doesn't exist, try levels table as fallback
        if (error && error.code === 'PGRST205') {
          console.log('Courses table not found for update, trying levels table...');
          const fallback = await supabase
            .from('levels')
            .update(courseFields)
            .eq('id', editingCourse.id);
          error = fallback.error;
        }

        if (error) throw error;

        // Update teacher assignments
        // Delete existing assignments
        await supabase
          .from('course_teachers')
          .delete()
          .eq('course_id', editingCourse.id);

        // Insert new assignments
        if (teacher_ids && teacher_ids.length > 0) {
          const assignments = teacher_ids.map(teacher_id => ({
            course_id: editingCourse.id,
            teacher_id
          }));
          const { error: assignError } = await supabase
            .from('course_teachers')
            .insert(assignments);

          if (assignError) throw assignError;
        }

        showNotification('Course updated successfully!');
      } else {
        // Create new course - try courses table first
        let { data: newCourse, error } = await supabase
          .from('courses')
          .insert(courseFields)
          .select()
          .single();

        // If courses table doesn't exist, try levels table as fallback
        if (error && error.code === 'PGRST205') {
          console.log('Courses table not found for insert, trying levels table...');
          const fallback = await supabase
            .from('levels')
            .insert(courseFields)
            .select()
            .single();
          newCourse = fallback.data;
          error = fallback.error;
        }

        if (error) throw error;

        // Insert teacher assignments for new course
        if (teacher_ids && teacher_ids.length > 0 && newCourse) {
          const assignments = teacher_ids.map(teacher_id => ({
            course_id: newCourse.id,
            teacher_id
          }));
          const { error: assignError } = await supabase
            .from('course_teachers')
            .insert(assignments);

          if (assignError) throw assignError;
        }

        showNotification('Course created successfully!');
      }

      setShowModal(false);
      setEditingCourse(null);
      await fetchCourses();
    } catch (error) {
      console.error('Error saving course:', error);
      showNotification('Error saving course: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCourse = async (courseId) => {
    if (!confirm('Are you sure? This will delete the course and all its related content.')) {
      return;
    }

    try {
      setLoading(true);

      // Try courses table first
      let { error } = await supabase
        .from('courses')
        .delete()
        .eq('id', courseId);

      // If courses table doesn't exist, try levels table as fallback
      if (error && error.code === 'PGRST205') {
        console.log('Courses table not found for delete, trying levels table...');
        const fallback = await supabase
          .from('levels')
          .delete()
          .eq('id', courseId);
        error = fallback.error;
      }

      if (error) throw error;
      showNotification('Course deleted successfully!');
      await fetchCourses();
    } catch (error) {
      console.error('Error deleting course:', error);
      showNotification('Error deleting course: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };


  const handleToggleLock = async (courseId, newStatus) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('courses')
        .update({ is_active: newStatus })
        .eq('id', courseId);

      if (error) throw error;

      showNotification(`Course ${newStatus ? 'unlocked' : 'locked'} successfully!`);
      await fetchCourses();
    } catch (error) {
      console.error('Error toggling course lock:', error);
      showNotification('Error updating course status: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => {
            setEditingCourse(null);
            setShowModal(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Course
        </button>
      </div>

      {/* Courses List */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading && courses.length === 0 ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading courses...</p>
          </div>
        ) : courses.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No courses yet</h3>
            <p className="text-gray-600 mb-4">Create your first course to get started</p>
            <button
              onClick={() => {
                setEditingCourse(null);
                setShowModal(true);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Create First Course
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thumbnail
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Course
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title & Description
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Teachers
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>

              
              <tbody className="divide-y divide-gray-200">
                {courses.map((course) => (
                  <tr key={course.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                        {course.thumbnail_url ? (
                          <img
                            src={course.thumbnail_url}
                            alt={course.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-2xl">
                            {course.level_number === 1 ? '🌱' :
                             course.level_number === 2 ? '📚' :
                             course.level_number === 3 ? '🏆' : '🎯'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-800 font-bold">{course.level_number}</span>
                        </div>

                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">{course.title}</div>
                        <div className="text-sm text-gray-600">{course.description}</div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {course.course_teachers && course.course_teachers.some(ct => ct.teacher) ? (
                        <div className="space-y-1">
                          {course.course_teachers.filter(ct => ct.teacher).map((ct, index) => (
                            <div key={index}>
                              <div className="text-sm font-medium text-gray-900">{ct.teacher?.full_name || 'Unknown teacher'}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500 italic">No teachers assigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          course.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {course.is_active ? 'Unlocked' : 'Locked'}
                        </span>
                        <button
                          onClick={() => handleToggleLock(course.id, !course.is_active)}
                          className={`p-1 rounded transition-colors ${
                            course.is_active
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                          title={course.is_active ? 'Lock course' : 'Unlock course'}
                        >
                          {course.is_active ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingCourse(course);
                            setShowModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900 p-1"
                          title="Edit course"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCourse(course.id)}
                          className="text-red-600 hover:text-red-900 p-1"
                          title="Delete course"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <CourseModal
          course={editingCourse}
          teachers={teachers}
          onSave={handleSaveCourse}
          onCancel={() => {
            setShowModal(false);
            setEditingCourse(null);
          }}
          loading={loading}
        />
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
    </div>
  );
};

// Course Modal Component
const CourseModal = ({ course, teachers, onSave, onCancel, loading }) => {
  const [formData, setFormData] = useState({
    title: course?.title || '',
    description: course?.description || '',
    level_number: course?.level_number || '',
    difficulty_label: course?.difficulty_label || 'Beginner',
    color_theme: course?.color_theme || 'blue',
    unlock_requirement: course?.unlock_requirement || 0,
    thumbnail_url: course?.thumbnail_url || '',
    teacher_ids: course?.course_teachers?.map(ct => ct.teacher.id) || [],
    is_active: course?.is_active ?? true
  });
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const ext = file.name.split('.').pop();
      const path = `${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('course-backgrounds')
        .upload(path, file, { cacheControl: '3600', upsert: true });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage
        .from('course-backgrounds')
        .getPublicUrl(path);
      handleInputChange('thumbnail_url', publicData.publicUrl);
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.level_number || formData.level_number < 1) {
      newErrors.level_number = 'Level number must be greater than 0';
    }

    if (formData.unlock_requirement < 0) {
      newErrors.unlock_requirement = 'Unlock requirement cannot be negative';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      const { teacher_ids, ...courseData } = formData;
      onSave({
        ...courseData,
        level_number: parseInt(formData.level_number),
        unlock_requirement: parseInt(formData.unlock_requirement),
        teacher_ids: teacher_ids
      });
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">
            {course ? 'Edit Course' : 'Create New Course'}
          </h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Course Number *
              </label>
              <input
                type="number"
                min="1"
                value={formData.level_number}
                onChange={(e) => handleInputChange('level_number', e.target.value)}
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.level_number ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="1"
              />
              {errors.level_number && (
                <p className="text-red-600 text-sm mt-1">{errors.level_number}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assigned Teachers
              </label>
              <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                {teachers.length === 0 ? (
                  <p className="text-sm text-gray-500">No teachers available</p>
                ) : (
                  teachers.map(teacher => (
                    <label key={teacher.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={formData.teacher_ids.includes(teacher.id)}
                        onChange={(e) => {
                          const newTeacherIds = e.target.checked
                            ? [...formData.teacher_ids, teacher.id]
                            : formData.teacher_ids.filter(id => id !== teacher.id);
                          handleInputChange('teacher_ids', newTeacherIds);
                        }}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900">
                        {teacher.full_name} <span className="text-gray-500">({teacher.email})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {formData.teacher_ids.length} teacher{formData.teacher_ids.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.title ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g., Spanish Beginner"
            />
            {errors.title && (
              <p className="text-red-600 text-sm mt-1">{errors.title}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.description ? 'border-red-300' : 'border-gray-300'
              }`}
              rows="3"
              placeholder="Describe what students will learn in this course..."
            />
            {errors.description && (
              <p className="text-red-600 text-sm mt-1">{errors.description}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Background Image
            </label>
            <div className="flex items-center gap-3">
              {formData.thumbnail_url && (
                <img src={formData.thumbnail_url} alt="Preview" className="w-20 h-20 object-cover rounded-lg border" />
              )}
              <div className="flex-1">
                <label className={`inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  {uploading ? 'Uploading...' : formData.thumbnail_url ? 'Change Image' : 'Upload Image'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
                {formData.thumbnail_url && (
                  <button
                    type="button"
                    onClick={() => handleInputChange('thumbnail_url', '')}
                    className="ml-2 text-sm text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  Optional: Custom background for unit cards (uses theme default if empty)
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Difficulty
              </label>
              <select
                value={formData.difficulty_label}
                onChange={(e) => handleInputChange('difficulty_label', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color Theme
              </label>
              <select
                value={formData.color_theme}
                onChange={(e) => handleInputChange('color_theme', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="blue">Blue</option>
                <option value="green">Green</option>
                <option value="purple">Purple</option>
                <option value="orange">Orange</option>
                <option value="red">Red</option>
                <option value="pink">Pink</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unlock Requirement (XP)
              </label>
              <input
                type="number"
                min="0"
                value={formData.unlock_requirement}
                onChange={(e) => handleInputChange('unlock_requirement', e.target.value)}
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.unlock_requirement ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0"
              />
              {errors.unlock_requirement && (
                <p className="text-red-600 text-sm mt-1">{errors.unlock_requirement}</p>
              )}
            </div>
          </div>

          {/* Level Status */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => handleInputChange('is_active', e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
              Course is unlocked (users can access this course)
            </label>
            <div className="text-xs text-gray-500 ml-auto">
              {formData.is_active ? '✅ Unlocked' : '🔒 Locked'}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {course ? 'Update Course' : 'Create Course'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CourseManagement;

