import { useState, useEffect } from 'react'
import { useDailyChallenge } from '../../hooks/useDailyChallenge'
import { useExerciseBank } from '../../hooks/useExerciseBank'
import Card from '../ui/Card'
import Button from '../ui/Button'
import {
  Plus,
  Calendar,
  Trophy,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
  Target,
  Clock,
  Award,
  CheckCircle
} from 'lucide-react'
import { getVietnamDate } from '../../utils/vietnamTime'

const DailyChallengeManagement = () => {
  const {
    challenges,
    loading,
    fetchChallenges,
    createChallenge,
    batchCreateChallenges,
    deleteChallenge,
    getChallengeStats,
    getAchievementIds,
    awardWinners
  } = useDailyChallenge()

  const { fetchExercises, fetchFolders } = useExerciseBank()

  const [showModal, setShowModal] = useState(false)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedDifficulty, setSelectedDifficulty] = useState('all')
  const [exercises, setExercises] = useState([])
  const [filteredExercises, setFilteredExercises] = useState([])
  const [challengeStats, setChallengeStats] = useState({})
  const [folders, setFolders] = useState([])
  const [parentFolders, setParentFolders] = useState([])
  const [subFolders, setSubFolders] = useState([])

  const [formData, setFormData] = useState({
    challenge_date: '',
    difficulty_level: 'beginner',
    parent_folder_id: '',
    sub_folder_id: '',
    exercise_id: '',
    base_xp_reward: 50,
    base_gem_reward: 5
  })

  const [batchFormData, setBatchFormData] = useState({
    challenge_date: '',
    beginner_parent_folder: '',
    beginner_sub_folder: '',
    beginner_exercise: '',
    intermediate_parent_folder: '',
    intermediate_sub_folder: '',
    intermediate_exercise: '',
    advanced_parent_folder: '',
    advanced_sub_folder: '',
    advanced_exercise: ''
  })

  const difficultyLevels = [
    { value: 'all', label: 'Tất cả cấp độ', color: 'gray' },
    { value: 'beginner', label: 'Beginner (Lv 1-10)', color: 'green' },
    { value: 'intermediate', label: 'Intermediate (Lv 11-20)', color: 'blue' },
    { value: 'advanced', label: 'Advanced (Lv 21-30)', color: 'purple' }
  ]

  useEffect(() => {
    loadChallenges()
    loadExercises()
    loadFolders()
  }, [])

  useEffect(() => {
    // Load stats for visible challenges
    challenges.forEach(challenge => {
      if (!challengeStats[challenge.id]) {
        loadChallengeStats(challenge.id)
      }
    })
  }, [challenges])

  const loadChallenges = async () => {
    const year = selectedDate.getFullYear()
    const month = selectedDate.getMonth()
    const lastDay = new Date(year, month + 1, 0).getDate()
    const mm = String(month + 1).padStart(2, '0')

    await fetchChallenges({
      startDate: `${year}-${mm}-01`,
      endDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
    })
  }

  const loadExercises = async () => {
    const data = await fetchExercises({ is_in_bank: true })
    setExercises(data || [])
    setFilteredExercises(data || [])
  }

  const loadFolders = async () => {
    const data = await fetchFolders()
    setFolders(data || [])
    // Get parent folders (those with no parent_folder_id)
    const parents = (data || []).filter(f => !f.parent_folder_id)
    setParentFolders(parents)
  }

  const loadChallengeStats = async (challengeId) => {
    const stats = await getChallengeStats(challengeId)
    setChallengeStats(prev => ({
      ...prev,
      [challengeId]: stats
    }))
  }

  const handlePreviousMonth = () => {
    const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1)
    setSelectedDate(newDate)
    setTimeout(loadChallenges, 100)
  }

  const handleNextMonth = () => {
    const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1)
    setSelectedDate(newDate)
    setTimeout(loadChallenges, 100)
  }

  const handleOpenModal = () => {
    setFormData({
      challenge_date: getVietnamDate(),
      difficulty_level: 'beginner',
      parent_folder_id: '',
      sub_folder_id: '',
      exercise_id: '',
      base_xp_reward: 50,
      base_gem_reward: 5
    })
    setSubFolders([])
    setFilteredExercises([])
    setShowModal(true)
  }

  const handleOpenBatchModal = () => {
    setBatchFormData({
      challenge_date: getVietnamDate(),
      beginner_parent_folder: '',
      beginner_sub_folder: '',
      beginner_exercise: '',
      intermediate_parent_folder: '',
      intermediate_sub_folder: '',
      intermediate_exercise: '',
      advanced_parent_folder: '',
      advanced_sub_folder: '',
      advanced_exercise: ''
    })
    setShowBatchModal(true)
  }

  // Batch modal handlers
  const [batchBeginnerSubFolders, setBatchBeginnerSubFolders] = useState([])
  const [batchBeginnerExercises, setBatchBeginnerExercises] = useState([])
  const [batchIntermediateSubFolders, setBatchIntermediateSubFolders] = useState([])
  const [batchIntermediateExercises, setBatchIntermediateExercises] = useState([])
  const [batchAdvancedSubFolders, setBatchAdvancedSubFolders] = useState([])
  const [batchAdvancedExercises, setBatchAdvancedExercises] = useState([])

  const handleBatchParentFolderChange = (level, parentFolderId) => {
    const updates = {
      [`${level}_parent_folder`]: parentFolderId,
      [`${level}_sub_folder`]: '',
      [`${level}_exercise`]: ''
    }
    setBatchFormData({ ...batchFormData, ...updates })

    if (parentFolderId) {
      // Get direct subfolders only (for dropdown)
      const subs = folders.filter(f => f.parent_folder_id === parentFolderId)

      // Get ALL folder IDs recursively (parent + all nested children)
      const allFolderIds = getAllSubfolderIds(parentFolderId)

      // Get exercises from parent and ALL nested subfolders
      const exs = exercises.filter(ex => allFolderIds.includes(ex.folder_id))

      if (level === 'beginner') {
        setBatchBeginnerSubFolders(subs)
        setBatchBeginnerExercises(exs)
      } else if (level === 'intermediate') {
        setBatchIntermediateSubFolders(subs)
        setBatchIntermediateExercises(exs)
      } else if (level === 'advanced') {
        setBatchAdvancedSubFolders(subs)
        setBatchAdvancedExercises(exs)
      }
    } else {
      if (level === 'beginner') {
        setBatchBeginnerSubFolders([])
        setBatchBeginnerExercises([])
      } else if (level === 'intermediate') {
        setBatchIntermediateSubFolders([])
        setBatchIntermediateExercises([])
      } else if (level === 'advanced') {
        setBatchAdvancedSubFolders([])
        setBatchAdvancedExercises([])
      }
    }
  }

  const handleBatchSubFolderChange = (level, subFolderId) => {
    const updates = {
      [`${level}_sub_folder`]: subFolderId,
      [`${level}_exercise`]: ''
    }
    setBatchFormData({ ...batchFormData, ...updates })

    // Get parent folder ID for this level
    const parentFolderId = batchFormData[`${level}_parent_folder`]

    // Filter exercises recursively by subfolder or parent folder
    const exs = subFolderId
      ? exercises.filter(ex => getAllSubfolderIds(subFolderId).includes(ex.folder_id))
      : parentFolderId ? exercises.filter(ex => getAllSubfolderIds(parentFolderId).includes(ex.folder_id)) : []

    if (level === 'beginner') {
      setBatchBeginnerExercises(exs)
    } else if (level === 'intermediate') {
      setBatchIntermediateExercises(exs)
    } else if (level === 'advanced') {
      setBatchAdvancedExercises(exs)
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setShowBatchModal(false)
  }

  // Recursively get all folder IDs under a parent folder (including nested subfolders)
  const getAllSubfolderIds = (parentId) => {
    const subfolders = folders.filter(f => f.parent_folder_id === parentId)
    let allIds = [parentId]

    subfolders.forEach(subfolder => {
      allIds = [...allIds, ...getAllSubfolderIds(subfolder.id)]
    })

    return allIds
  }

  const handleParentFolderChange = (parentFolderId) => {
    setFormData({
      ...formData,
      parent_folder_id: parentFolderId,
      sub_folder_id: '',
      exercise_id: ''
    })

    if (parentFolderId) {
      // Get direct subfolders only (for dropdown)
      const subs = folders.filter(f => f.parent_folder_id === parentFolderId)
      setSubFolders(subs)

      // Get ALL folder IDs recursively (parent + all nested children)
      const allFolderIds = getAllSubfolderIds(parentFolderId)

      // Get exercises from parent and ALL nested subfolders
      const exercisesInTree = exercises.filter(ex => allFolderIds.includes(ex.folder_id))
      setFilteredExercises(exercisesInTree)
    } else {
      setSubFolders([])
      setFilteredExercises([])
    }
  }

  const handleSubFolderChange = async (subFolderId) => {
    setFormData({
      ...formData,
      sub_folder_id: subFolderId,
      exercise_id: ''
    })

    // Filter exercises by selected sub folder or parent folder (recursively)
    if (subFolderId) {
      // Get all nested folder IDs under this subfolder
      const allFolderIds = getAllSubfolderIds(subFolderId)
      const exercisesInTree = exercises.filter(ex => allFolderIds.includes(ex.folder_id))
      setFilteredExercises(exercisesInTree)
    } else if (formData.parent_folder_id) {
      // No subfolder selected, show parent folder + all nested exercises
      const allFolderIds = getAllSubfolderIds(formData.parent_folder_id)
      const exercisesInTree = exercises.filter(ex => allFolderIds.includes(ex.folder_id))
      setFilteredExercises(exercisesInTree)
    } else {
      setFilteredExercises([])
    }
  }


  const handleSubmit = async (e) => {
    e.preventDefault()

    // Get achievement IDs for this difficulty level
    const achievements = await getAchievementIds(formData.difficulty_level)

    // Only send fields that exist in the database (exclude folder selection fields)
    // eslint-disable-next-line no-unused-vars
    const { parent_folder_id, sub_folder_id, ...challengeData } = formData

    const result = await createChallenge({
      ...challengeData,
      ...achievements
    })

    if (result.success) {
      handleCloseModal()
      await loadChallenges()
    } else {
      alert('Lỗi: ' + result.error)
    }
  }

  const handleBatchSubmit = async (e) => {
    e.preventDefault()

    if (!batchFormData.beginner_exercise || !batchFormData.intermediate_exercise || !batchFormData.advanced_exercise) {
      alert('Vui lòng chọn bài tập cho tất cả 3 cấp độ')
      return
    }

    // Get achievement IDs for all levels
    const beginnerAchievements = await getAchievementIds('beginner')
    const intermediateAchievements = await getAchievementIds('intermediate')
    const advancedAchievements = await getAchievementIds('advanced')

    const challenges = [
      {
        challenge_date: batchFormData.challenge_date,
        difficulty_level: 'beginner',
        exercise_id: batchFormData.beginner_exercise,
        base_xp_reward: 50,
        base_gem_reward: 5,
        ...beginnerAchievements
      },
      {
        challenge_date: batchFormData.challenge_date,
        difficulty_level: 'intermediate',
        exercise_id: batchFormData.intermediate_exercise,
        base_xp_reward: 50,
        base_gem_reward: 5,
        ...intermediateAchievements
      },
      {
        challenge_date: batchFormData.challenge_date,
        difficulty_level: 'advanced',
        exercise_id: batchFormData.advanced_exercise,
        base_xp_reward: 50,
        base_gem_reward: 5,
        ...advancedAchievements
      }
    ]

    const result = await batchCreateChallenges(
      batchFormData.challenge_date,
      {
        beginner: batchFormData.beginner_exercise,
        intermediate: batchFormData.intermediate_exercise,
        advanced: batchFormData.advanced_exercise
      },
      {
        beginner: beginnerAchievements,
        intermediate: intermediateAchievements,
        advanced: advancedAchievements
      }
    )

    if (result.success) {
      handleCloseModal()
      await loadChallenges()
    } else {
      alert('Lỗi: ' + result.error)
    }
  }

  const handleAwardWinners = async (challengeId) => {
    if (!confirm('Trao giải cho top 3 của thử thách này?')) return

    const result = await awardWinners(challengeId)
    if (result?.success) {
      alert('Đã trao giải thành công!')
      await loadChallenges()
    } else {
      alert('Lỗi: ' + (result?.error || 'Không thể trao giải'))
    }
  }

  const handleDelete = async (challengeId) => {
    if (!confirm('Bạn có chắc chắn muốn xóa thử thách này?')) return

    const result = await deleteChallenge(challengeId)
    if (result.success) {
      await loadChallenges()
    } else {
      alert('Lỗi: ' + result.error)
    }
  }

  const getDifficultyColor = (level) => {
    switch (level) {
      case 'beginner': return 'bg-green-100 text-green-800 border-green-300'
      case 'intermediate': return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'advanced': return 'bg-purple-100 text-purple-800 border-purple-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getDifficultyLabel = (level) => {
    switch (level) {
      case 'beginner': return 'Beginner'
      case 'intermediate': return 'Intermediate'
      case 'advanced': return 'Advanced'
      default: return level
    }
  }

  const filteredChallenges = selectedDifficulty === 'all'
    ? challenges
    : challenges.filter(c => c.difficulty_level === selectedDifficulty)

  // Group challenges by date
  const challengesByDate = filteredChallenges.reduce((acc, challenge) => {
    const date = challenge.challenge_date
    if (!acc[date]) {
      acc[date] = []
    }
    acc[date].push(challenge)
    return acc
  }, {})

  return (
    <div className="container mx-auto px-4 py-4">

      {/* Difficulty Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {difficultyLevels.map(level => (
          <button
            key={level.value}
            onClick={() => setSelectedDifficulty(level.value)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedDifficulty === level.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            {level.label}
          </button>
        ))}

        <div className="flex gap-2">
          <Button onClick={handleOpenModal} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create
          </Button>
          <Button onClick={handleOpenBatchModal} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700">
            <Plus className="w-4 h-4" />
            Bulk
          </Button>
        </div>
      </div>

      {/* Challenges List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Đang tải...</p>
        </div>
      ) : Object.keys(challengesByDate).length === 0 ? (
        <Card className="text-center py-12">
          <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Chưa có thử thách nào
          </h3>
          <p className="text-gray-600 mb-4">
            Tạo thử thách đầu tiên cho học viên của bạn
          </p>
          <Button onClick={handleOpenModal}>
            <Plus className="w-4 h-4 mr-2" />
            Tạo Challenge
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(challengesByDate)
            .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA))
            .map(([date, dateChallenges]) => (
              <Card key={date} className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-bold text-gray-900">
                    {new Date(date + 'T00:00:00').toLocaleDateString('vi-VN', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </h3>
                  <span className="ml-auto text-sm text-gray-600">
                    {dateChallenges.length}/3 cấp độ
                  </span>
                </div>

                <div className="space-y-3">
                  {dateChallenges.map(challenge => {
                    const stats = challengeStats[challenge.id] || {}
                    return (
                      <div
                        key={challenge.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getDifficultyColor(challenge.difficulty_level)}`}>
                              {getDifficultyLabel(challenge.difficulty_level)}
                            </span>
                            <h4 className="font-semibold text-gray-900">
                              {challenge.exercises?.title || 'Bài tập'}
                            </h4>
                            <span className="text-sm text-gray-500">
                              ({challenge.exercises?.exercise_type || 'N/A'})
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <Trophy className="w-4 h-4" />
                              <span>{challenge.base_xp_reward} XP + {challenge.base_gem_reward} Gems</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              <span>{stats.totalParticipants || 0} người tham gia</span>
                            </div>
                            {stats.avgScore > 0 && (
                              <div className="flex items-center gap-1">
                                <Target className="w-4 h-4" />
                                <span>Điểm TB: {stats.avgScore}%</span>
                              </div>
                            )}
                            {stats.avgTime > 0 && (
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                <span>{Math.round(stats.avgTime / 60)}:{(stats.avgTime % 60).toString().padStart(2, '0')}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {challenge.winners_awarded ? (
                            <span className="flex items-center gap-1 text-xs text-green-600 font-medium px-2 py-1 bg-green-50 rounded-lg border border-green-200">
                              <CheckCircle className="w-4 h-4" />
                              Đã trao giải
                            </span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAwardWinners(challenge.id)}
                              className="text-amber-600 hover:bg-amber-50"
                            >
                              <Award className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/study/${challenge.exercises?.exercise_type}?exerciseId=${challenge.exercise_id}`, '_blank')}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(challenge.id)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            ))}
        </div>
      )}

      {/* Single Challenge Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Tạo Daily Challenge</h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ngày thử thách
                </label>
                <input
                  type="date"
                  value={formData.challenge_date}
                  onChange={(e) => setFormData({ ...formData, challenge_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cấp độ
                </label>
                <select
                  value={formData.difficulty_level}
                  onChange={(e) => setFormData({ ...formData, difficulty_level: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="beginner">Beginner (Levels 1-10)</option>
                  <option value="intermediate">Intermediate (Levels 11-20)</option>
                  <option value="advanced">Advanced (Levels 21-30)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Thư mục chính
                </label>
                <select
                  value={formData.parent_folder_id}
                  onChange={(e) => handleParentFolderChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">-- Chọn thư mục chính --</option>
                  {parentFolders.map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              {formData.parent_folder_id && subFolders.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Thư mục con (không bắt buộc)
                  </label>
                  <select
                    value={formData.sub_folder_id}
                    onChange={(e) => handleSubFolderChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Không chọn thư mục con --</option>
                    {subFolders.map(folder => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formData.parent_folder_id && filteredExercises.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bài tập ({filteredExercises.length} - bao gồm tất cả thư mục con)
                  </label>
                  <select
                    value={formData.exercise_id}
                    onChange={(e) => setFormData({ ...formData, exercise_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">-- Chọn bài tập --</option>
                    {filteredExercises.map(exercise => (
                      <option key={exercise.id} value={exercise.id}>
                        {exercise.title} ({exercise.exercise_type})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phần thưởng XP
                  </label>
                  <input
                    type="number"
                    value={formData.base_xp_reward}
                    onChange={(e) => setFormData({ ...formData, base_xp_reward: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phần thưởng Gems
                  </label>
                  <input
                    type="number"
                    value={formData.base_gem_reward}
                    onChange={(e) => setFormData({ ...formData, base_gem_reward: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                    min="0"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1">
                  Tạo Challenge
                </Button>
                <Button type="button" variant="outline" onClick={handleCloseModal} className="flex-1">
                  Hủy
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Creation Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Tạo Challenge cho cả 3 cấp độ</h2>
              <p className="text-sm text-gray-600 mt-1">Tạo thử thách cho Beginner, Intermediate và Advanced cùng lúc</p>
            </div>

            <form onSubmit={handleBatchSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ngày thử thách
                </label>
                <input
                  type="date"
                  value={batchFormData.challenge_date}
                  onChange={(e) => setBatchFormData({ ...batchFormData, challenge_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              {/* Beginner */}
              <div className="p-4 bg-green-50 rounded-lg border border-green-200 space-y-3">
                <h3 className="font-semibold text-green-900 mb-2">Beginner (Levels 1-10)</h3>

                <select
                  value={batchFormData.beginner_parent_folder}
                  onChange={(e) => handleBatchParentFolderChange('beginner', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">-- Chọn thư mục chính --</option>
                  {parentFolders.map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>

                {batchFormData.beginner_parent_folder && batchBeginnerSubFolders.length > 0 && (
                  <select
                    value={batchFormData.beginner_sub_folder}
                    onChange={(e) => handleBatchSubFolderChange('beginner', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Không chọn thư mục con --</option>
                    {batchBeginnerSubFolders.map(folder => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                )}

                {batchFormData.beginner_parent_folder && batchBeginnerExercises.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      {batchBeginnerExercises.length} bài tập (bao gồm tất cả thư mục con)
                    </label>
                    <select
                      value={batchFormData.beginner_exercise}
                      onChange={(e) => setBatchFormData({ ...batchFormData, beginner_exercise: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      <option value="">-- Chọn bài tập --</option>
                      {batchBeginnerExercises.map(exercise => (
                        <option key={exercise.id} value={exercise.id}>
                          {exercise.title} ({exercise.exercise_type})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Intermediate */}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-3">
                <h3 className="font-semibold text-blue-900 mb-2">Intermediate (Levels 11-20)</h3>

                <select
                  value={batchFormData.intermediate_parent_folder}
                  onChange={(e) => handleBatchParentFolderChange('intermediate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">-- Chọn thư mục chính --</option>
                  {parentFolders.map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>

                {batchFormData.intermediate_parent_folder && batchIntermediateSubFolders.length > 0 && (
                  <select
                    value={batchFormData.intermediate_sub_folder}
                    onChange={(e) => handleBatchSubFolderChange('intermediate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Không chọn thư mục con --</option>
                    {batchIntermediateSubFolders.map(folder => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                )}

                {batchFormData.intermediate_parent_folder && batchIntermediateExercises.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      {batchIntermediateExercises.length} bài tập (bao gồm tất cả thư mục con)
                    </label>
                    <select
                      value={batchFormData.intermediate_exercise}
                      onChange={(e) => setBatchFormData({ ...batchFormData, intermediate_exercise: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      <option value="">-- Chọn bài tập --</option>
                      {batchIntermediateExercises.map(exercise => (
                        <option key={exercise.id} value={exercise.id}>
                          {exercise.title} ({exercise.exercise_type})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Advanced */}
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-3">
                <h3 className="font-semibold text-purple-900 mb-2">Advanced (Levels 21-30)</h3>

                <select
                  value={batchFormData.advanced_parent_folder}
                  onChange={(e) => handleBatchParentFolderChange('advanced', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">-- Chọn thư mục chính --</option>
                  {parentFolders.map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>

                {batchFormData.advanced_parent_folder && batchAdvancedSubFolders.length > 0 && (
                  <select
                    value={batchFormData.advanced_sub_folder}
                    onChange={(e) => handleBatchSubFolderChange('advanced', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Không chọn thư mục con --</option>
                    {batchAdvancedSubFolders.map(folder => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                )}

                {batchFormData.advanced_parent_folder && batchAdvancedExercises.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      {batchAdvancedExercises.length} bài tập (bao gồm tất cả thư mục con)
                    </label>
                    <select
                      value={batchFormData.advanced_exercise}
                      onChange={(e) => setBatchFormData({ ...batchFormData, advanced_exercise: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      <option value="">-- Chọn bài tập --</option>
                      {batchAdvancedExercises.map(exercise => (
                        <option key={exercise.id} value={exercise.id}>
                          {exercise.title} ({exercise.exercise_type})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>Lưu ý:</strong> Mỗi cấp độ sẽ nhận 50 XP + 5 Gems khi hoàn thành.
                  Top 1, Top 2 và Top 3 sẽ nhận phần thưởng bonus tự động vào 00:05 ngày hôm sau.
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1 bg-purple-600 hover:bg-purple-700">
                  Tạo 3 Challenges
                </Button>
                <Button type="button" variant="outline" onClick={handleCloseModal} className="flex-1">
                  Hủy
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default DailyChallengeManagement
