import { Link } from 'react-router-dom'
import Card from '../ui/Card'
import Button from '../ui/Button'
import { 
  BookOpen, 
  Mic, 
  Volume2, 
  Music, 
  Video, 
  Star,
  Copy,
  Clock,
  Target,
  Brain
} from 'lucide-react'

const StudyDashboard = () => {
  const exerciseTypes = [
    {
      id: 'flashcard',
      title: 'Flashcard',
      description: 'Học từ vựng với thẻ ghi nhớ',
      icon: BookOpen,
      color: 'bg-blue-600',
      difficulty: 'Dễ',
      duration: '10-15 phút',
      path: '/study/flashcard'
    },
    {
      id: 'pronunciation',
      title: 'Luyện phát âm',
      description: 'Cải thiện khả năng phát âm',
      icon: Mic,
      color: 'bg-red-600',
      difficulty: 'Trung bình',
      duration: '15-20 phút',
      path: '/study/pronunciation'
    },
    {
      id: 'audio-flashcard',
      title: 'Flashcard âm thanh',
      description: 'Học với âm thanh và hình ảnh',
      icon: Volume2,
      color: 'bg-green-600',
      difficulty: 'Dễ',
      duration: '10-15 phút',
      path: '/study/audio-flashcard'
    },
    {
      id: 'video',
      title: 'Học qua video',
      description: 'Xem video và làm bài tập',
      icon: Video,
      color: 'bg-orange-600',
      difficulty: 'Trung bình',
      duration: '15-25 phút',
      path: '/study/video'
    },
    {
      id: 'drag_drop',
      title: 'Kéo thả',
      description: 'Sắp xếp từ và câu theo thứ tự đúng',
      icon: Copy,
      color: 'bg-green-600',
      difficulty: 'Trung bình',
      duration: '10-20 phút',
      path: '/study/drag-drop'
    },
    {
      id: 'ai_fill_blank',
      title: 'Điền từ AI',
      description: 'Điền từ với chấm điểm thông minh bằng AI',
      icon: Brain,
      color: 'bg-purple-600',
      difficulty: 'Trung bình',
      duration: '10-15 phút',
      path: '/study/ai-fill-blank'
    },
  ]

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'Dễ':
        return 'text-green-600 bg-green-100'
      case 'Trung bình':
        return 'text-yellow-600 bg-yellow-100'
      case 'Khó':
        return 'text-red-600 bg-red-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Học tập</h1>
        <p className="text-gray-600">Chọn loại bài tập bạn muốn thực hiện</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 text-center">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <Target className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-lg font-semibold text-gray-900">85%</div>
          <div className="text-xs text-gray-600">Tỷ lệ chính xác</div>
        </Card>

        <Card className="p-4 text-center">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <Star className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-lg font-semibold text-gray-900">12</div>
          <div className="text-xs text-gray-600">Bài hoàn thành</div>
        </Card>

        <Card className="p-4 text-center">
          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <Clock className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-lg font-semibold text-gray-900">2.5h</div>
          <div className="text-xs text-gray-600">Hôm nay</div>
        </Card>
      </div>

      {/* Exercise Types */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Chọn loại bài tập</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exerciseTypes.map((exercise) => (
            <Card key={exercise.id} hover className="overflow-hidden">
              <div className="p-6">
                {/* Icon and Title */}
                <div className="flex items-center space-x-3 mb-4">
                  <div className={`w-12 h-12 ${exercise.color} rounded-lg flex items-center justify-center`}>
                    <exercise.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{exercise.title}</h3>
                    <p className="text-sm text-gray-600">{exercise.description}</p>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Độ khó:</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${getDifficultyColor(exercise.difficulty)}`}>
                      {exercise.difficulty}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Thời gian:</span>
                    <span className="text-sm text-gray-900">{exercise.duration}</span>
                  </div>
                </div>

                {/* Action Button */}
                <Link to={exercise.path}>
                  <Button className="w-full">
                    Bắt đầu
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Recommended Section */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-gray-900">Đề xuất cho bạn</h3>
        </Card.Header>
        <Card.Content>
          <div className="flex items-center space-x-4 p-4 bg-gradient-to-r from-primary-50 to-secondary-50 rounded-lg">
            <div className="w-12 h-12 bg-primary-600 rounded-lg flex items-center justify-center">
              <Mic className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">Luyện phát âm</h4>
              <p className="text-sm text-gray-600">Dựa trên kết quả học tập gần đây</p>
            </div>
            <Link to="/study/pronunciation">
              <Button size="sm">Thử ngay</Button>
            </Link>
          </div>
        </Card.Content>
      </Card>
    </div>
  )
}

export default StudyDashboard
