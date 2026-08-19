import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import Card from '../ui/Card'
import Button from '../ui/Button'
// Thay spinner bằng skeleton để tránh chớp màn hình khi điều hướng
import {
  BookOpen,
  Trophy,
  ArrowRight,
  Target
} from 'lucide-react'

const CourseList = () => {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { user, profile } = useAuth()

  // Skeletons
  const SkeletonCard = () => (
    <div className="relative overflow-hidden transition-all duration-300 border rounded-lg p-6 bg-white animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-full bg-gray-200" />
          <div>
            <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-24" />
          </div>
        </div>
        <div className="w-8 h-8 bg-gray-200 rounded-full" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-2/3 mb-4" />
      <div className="h-2 bg-gray-100 rounded w-full" />
    </div>
  )

  useEffect(() => {
    if (user && profile) {
      fetchCoursesAndProgress()
    }
  }, [user, profile])

  const fetchCoursesAndProgress = async () => {
    try {
      setLoading(true)
      setError(null)

      let coursesData = []

      // For students, only show enrolled courses. For admins/teachers, show all courses.
      if (profile?.role === 'user') {
        // Student: fetch only enrolled courses
        const { data: enrollmentData, error: enrollmentError } = await supabase
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
              is_active,
              unlock_requirement
            )
          `)
          .eq('student_id', user.id)
          .eq('is_active', true)
          .eq('courses.is_active', true)
          .order('courses.level_number')

        if (enrollmentError) throw enrollmentError

        // Extract courses from the enrollment data
        coursesData = enrollmentData?.map(enrollment => enrollment.courses).filter(Boolean) || []
      } else {
        // Admin/Teacher: fetch all courses
        const { data, error: coursesError } = await supabase
          .from('courses')
          .select('*')
          .eq('is_active', true)
          .order('level_number')

        if (coursesError) throw coursesError
        coursesData = data || []
      }

      setCourses(coursesData)
    } catch (err) {
      console.error('Error fetching courses:', err)
      setError('Không thể tải danh sách khóa học')
    } finally {
      setLoading(false)
    }
  }

  const getThemeColors = (colorTheme) => {
    const themes = {
      green: {
        bg: 'from-green-400 to-emerald-500',
        text: 'text-green-700',
        border: 'border-green-200',
        icon: 'bg-green-100 text-green-600'
      },
      blue: {
        bg: 'from-blue-400 to-indigo-500', 
        text: 'text-blue-700',
        border: 'border-blue-200',
        icon: 'bg-blue-100 text-blue-600'
      },
      purple: {
        bg: 'from-purple-400 to-pink-500',
        text: 'text-purple-700', 
        border: 'border-purple-200',
        icon: 'bg-purple-100 text-purple-600'
      },
      orange: {
        bg: 'from-orange-400 to-red-500',
        text: 'text-orange-700',
        border: 'border-orange-200', 
        icon: 'bg-orange-100 text-orange-600'
      }
    }
    return themes[colorTheme] || themes.blue
  }

  const renderCourseCard = (course, index) => {
    const theme = getThemeColors(course.color_theme)

    return (
      <Card
        key={course.id} 
        className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-105 cursor-pointer ${theme.border}`}
      >
        {/* Background gradient */}
        <div className={`absolute inset-0 bg-gradient-to-br ${theme.bg} opacity-10`} />
        
        <div className="relative p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className={`w-12 h-12 rounded-full ${theme.icon} flex items-center justify-center`}>
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{course.title}</h3>
                <p className="text-sm text-gray-600">{course.difficulty_label}</p>
              </div>
            </div>
            
            {/* Level number badge */}
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
              <span className="text-sm font-bold text-gray-700">{course.level_number}</span>
            </div>
          </div>

          {/* Description */}
          <p className="text-gray-700 mb-4 line-clamp-2">{course.description}</p>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Target className="w-4 h-4 text-gray-500 mr-1" />
                <span className="text-sm text-gray-600">XP cần</span>
              </div>
              <div className="text-sm font-semibold text-gray-900">
                {course.unlock_requirement}
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Trophy className="w-4 h-4 text-gray-500 mr-1" />
                <span className="text-sm text-gray-600">Phần thưởng</span>
              </div>
              <div className="text-sm font-semibold text-gray-900">
                Chưa
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="flex justify-center">
            <Link to={`/study/course/${course.id}`} className="w-full">
              <Button className="w-full bg-gradient-to-r from-primary-600 to-secondary-600 hover:from-primary-700 hover:to-secondary-700">
                Bắt đầu
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>


      </Card>
    )
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <div className="h-8 bg-gray-200 rounded w-40 mx-auto mb-4 animate-pulse" />
          <div className="h-3 bg-gray-100 rounded w-2/3 mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">{error}</div>
        <Button onClick={fetchLevelsAndProgress} variant="outline">
          Thử lại
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Chọn Khóa học</h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Bắt đầu hành trình học ngôn ngữ của bạn. Mỗi khóa học được thiết kế để giúp bạn
          phát triển từng bước một cách hiệu quả và vui vẻ.
        </p>
      </div>

      {/* Current user stats */}
      <Card className="bg-gradient-to-r from-primary-50 to-secondary-50 border-primary-200">
        <Card.Content className="p-6">
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-2xl font-bold text-primary-700">{user?.profile?.current_level || 1}</div>
              <div className="text-sm text-gray-600">Khóa học hiện tại</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-secondary-700">{user?.profile?.xp || 0}</div>
              <div className="text-sm text-gray-600">Tổng XP</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{user?.profile?.streak_count || 0}</div>
              <div className="text-sm text-gray-600">Chuỗi ngày</div>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Courses grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((course, index) => renderCourseCard(course, index))}
      </div>

      {/* Empty state */}
      {courses.length === 0 && (
        <div className="text-center py-12">
          <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Chưa có khóa học nào</h3>
          <p className="text-gray-600">Các khóa học sẽ sớm được cập nhật!</p>
        </div>
      )}
    </div>
  )
}

export default CourseList
