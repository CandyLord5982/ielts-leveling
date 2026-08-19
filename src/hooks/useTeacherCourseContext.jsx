import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabase/client';
import { useAuth } from './useAuth';

const TeacherCourseContext = createContext();

export const useTeacherCourse = () => {
  const context = useContext(TeacherCourseContext);
  if (!context) {
    throw new Error('useTeacherCourse must be used within a TeacherCourseProvider');
  }
  return context;
};

export const TeacherCourseProvider = ({ children }) => {
  const { user, isAdmin } = useAuth();
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTeacherCourses = async () => {
    try {
      if (courses.length === 0) setLoading(true);
      setError(null);

      if (!user) {
        setCourses([]);
        setLoading(false);
        return;
      }

      if (isAdmin()) {
        const { data, error: fetchError } = await supabase
          .from('courses')
          .select('id, title, level_number, description, teacher_id, is_active')
          .eq('is_active', true)
          .order('level_number');

        if (fetchError) throw fetchError;

        setCourses(data || []);
        if (data?.length > 0 && !selectedCourse) {
          setSelectedCourse(data[0].id);
        }
      } else {
        const { data: courseTeachers, error: fetchError } = await supabase
          .from('course_teachers')
          .select(`
            course:courses(id, title, level_number, description, teacher_id, is_active)
          `)
          .eq('teacher_id', user.id);

        if (fetchError) throw fetchError;

        const teacherCourses = (courseTeachers || [])
          .map(ct => ct.course)
          .filter(c => c && c.is_active)
          .sort((a, b) => a.level_number - b.level_number);

        setCourses(teacherCourses);
        if (teacherCourses.length > 0 && !selectedCourse) {
          setSelectedCourse(teacherCourses[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching teacher courses:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getCourseById = (courseId) => {
    return courses.find(c => c.id === courseId);
  };

  useEffect(() => {
    if (user) {
      fetchTeacherCourses();
    }
  }, [user]);

  const value = {
    courses,
    selectedCourse,
    setSelectedCourse,
    selectedDate,
    setSelectedDate,
    loading,
    error,
    fetchTeacherCourses,
    getCourseById
  };

  return (
    <TeacherCourseContext.Provider value={value}>
      {children}
    </TeacherCourseContext.Provider>
  );
};
