import React, { useState, useEffect } from 'react'
import { supabase } from '../../../supabase/client'
import { Save, AlertCircle, Tag } from 'lucide-react'
import { EXERCISE_CATEGORIES, EXERCISE_TAGS, ALL_TAGS } from '../../../constants/exerciseTags'
import FlashcardEditor from '../editors/FlashcardEditor'
import MultipleChoiceEditor from '../editors/MultipleChoiceEditor'
import FillBlankEditor from '../editors/FillBlankEditor'
import SmartDragDropEditor from '../editors/SmartDragDropEditor'
import AIFillBlankEditor from '../editors/AIFillBlankEditor'
import SimpleDropdownEditor from '../editors/SimpleDropdownEditor'
import PronunciationEditor from '../editors/PronunciationEditor'
import ImageHotspotEditor from '../editors/ImageHotspotEditor'
import PDFWorksheetEditor from '../editors/PDFWorksheetEditor'
import SpeakingAssessmentEditor from '../editors/SpeakingAssessmentEditor'
import VideoUploadEditor from '../editors/VideoUploadEditor'

const EditExerciseModal = ({ isOpen, onClose, exercise, onUpdate }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    exercise_type: 'flashcard',
    difficulty_level: 1,
    xp_reward: 10,
    score_boost: 0,
    estimated_duration: 5,
    tags: [],
    category: '',
    folder_id: null
  })
  const [content, setContent] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [folders, setFolders] = useState([])

  useEffect(() => {
    if (isOpen && exercise) {
      // Populate form with existing exercise data
      setFormData({
        title: exercise.title || '',
        description: exercise.description || '',
        exercise_type: exercise.exercise_type || 'flashcard',
        difficulty_level: exercise.difficulty_level || 1,
        xp_reward: exercise.xp_reward || 10,
        score_boost: exercise.score_boost || 0,
        estimated_duration: exercise.estimated_duration || 5,
        tags: exercise.tags || [],
        category: exercise.category || '',
        folder_id: exercise.folder_id || null
      })
      setContent(exercise.content || {})
    }
  }, [isOpen, exercise])

  useEffect(() => {
    if (isOpen) {
      fetchFolders()
    }
  }, [isOpen])

  const fetchFolders = async () => {
    try {
      const { data, error } = await supabase
        .from('exercise_folders')
        .select('*')
        .order('name')

      if (error) throw error
      setFolders(data || [])
    } catch (err) {
      console.error('Error fetching folders:', err)
    }
  }

  const getFolderPath = (folderId) => {
    const parts = []
    let current = folderId
    while (current) {
      const folder = folders.find(f => f.id === current)
      if (!folder) break
      parts.unshift(folder.name.replace(/[^a-zA-Z0-9_-]/g, '_'))
      current = folder.parent_folder_id
    }
    return parts.join('/')
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleContentChange = (newContent) => {
    setContent(newContent)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Validate required fields
      if (!formData.title.trim()) {
        throw new Error('Title is required')
      }

      if (!content || Object.keys(content).length === 0) {
        throw new Error('Exercise content is required')
      }

      // Update exercise in database
      const { error } = await supabase
        .from('exercises')
        .update({
          title: formData.title.trim(),
          description: formData.description.trim(),
          exercise_type: formData.exercise_type,
          difficulty_level: 1,
          xp_reward: formData.xp_reward,
          score_boost: formData.score_boost || 0,
          estimated_duration: 5,
          category: formData.category || null,
          tags: formData.tags.length > 0 ? formData.tags : null,
          folder_id: formData.folder_id,
          content: content,
          updated_at: new Date().toISOString()
        })
        .eq('id', exercise.id)

      if (error) throw error

      // Refresh the exercise list
      onUpdate()

      // Close modal
      onClose()

      alert('Exercise updated successfully!')
    } catch (err) {
      console.error('Error updating exercise:', err)
      setError(err.message || 'Failed to update exercise')
    } finally {
      setLoading(false)
    }
  }

  const toggleTag = (tag) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }))
  }

  const availableTags = formData.category
    ? (EXERCISE_TAGS[formData.category] || [])
    : ALL_TAGS

  const renderContentEditor = () => {
    switch (formData.exercise_type) {
      case 'flashcard':
        return (
          <FlashcardEditor
            cards={content.cards || content.flashcards || []}
            onCardsChange={(cards) => handleContentChange({ ...content, cards })}
            folderPath={getFolderPath(formData.folder_id)}
          />
        )
      case 'multiple_choice':
        return (
          <MultipleChoiceEditor
            questions={content.questions || []}
            onQuestionsChange={(questions) => handleContentChange({ ...content, questions })}
            settings={content.settings || {}}
            onSettingsChange={(settings) => handleContentChange({ ...content, settings })}
            intro={content.intro || ''}
            onIntroChange={(intro) => handleContentChange({ ...content, intro })}
            folderPath={getFolderPath(formData.folder_id)}
          />
        )
      case 'fill_blank':
        return (
          <FillBlankEditor
            questions={content.questions || []}
            onQuestionsChange={(questions) => handleContentChange({ ...content, questions })}
            settings={content.settings || {}}
            onSettingsChange={(settings) => handleContentChange({ ...content, settings })}
            intro={content.intro || ''}
            onIntroChange={(intro) => handleContentChange({ ...content, intro })}
            folderPath={getFolderPath(formData.folder_id)}
          />
        )
      case 'drag_drop':
        return (
          <SmartDragDropEditor
            questions={content.questions || []}
            onQuestionsChange={(questions) => handleContentChange({ ...content, questions })}
            intro={content.intro || ''}
            onIntroChange={(intro) => handleContentChange({ ...content, intro })}
            folderPath={getFolderPath(formData.folder_id)}
          />
        )
      case 'dropdown':
        return (
          <SimpleDropdownEditor
            questions={content.questions || []}
            onQuestionsChange={(questions) => handleContentChange({ ...content, questions })}
            intro={content.intro || ''}
            onIntroChange={(intro) => handleContentChange({ ...content, intro })}
            folderPath={getFolderPath(formData.folder_id)}
          />
        )
      case 'pronunciation':
        return (
          <PronunciationEditor
            questions={content.questions || []}
            onQuestionsChange={(questions) => handleContentChange({ ...content, questions })}
          />
        )
      case 'ai_fill_blank':
        return (
          <AIFillBlankEditor
            questions={content.questions || []}
            onQuestionsChange={(questions) => handleContentChange({ ...content, questions })}
            intro={content.intro || ''}
            onIntroChange={(intro) => handleContentChange({ ...content, intro })}
            language={(content?.settings?.language) || 'en'}
            onLanguageChange={(lang) => handleContentChange({
              ...content,
              settings: { ...(content?.settings || {}), language: lang }
            })}
            folderPath={getFolderPath(formData.folder_id)}
          />
        )
      case 'image_hotspot':
        return (
          <ImageHotspotEditor
            content={content}
            onContentChange={(newContent) => handleContentChange(newContent)}
            folderPath={getFolderPath(formData.folder_id)}
          />
        )
      case 'pdf_worksheet':
        return (
          <PDFWorksheetEditor
            content={content}
            onContentChange={(newContent) => handleContentChange(newContent)}
          />
        )
      case 'speaking_assessment':
        return (
          <SpeakingAssessmentEditor
            questions={content.questions || []}
            level={content.level || 'middle'}
            onQuestionsChange={(questions) => handleContentChange({ ...content, questions })}
            onLevelChange={(level) => handleContentChange({ ...content, level })}
            folderPath={getFolderPath(formData.folder_id)}
          />
        )
      case 'video_upload':
        return (
          <VideoUploadEditor
            questions={content.questions || []}
            level={content.level || 'middle'}
            skipScoring={content.skip_scoring || false}
            onQuestionsChange={(questions) => handleContentChange({ ...content, questions })}
            onLevelChange={(level) => handleContentChange({ ...content, level })}
            onSkipScoringChange={(val) => handleContentChange({ ...content, skip_scoring: val })}
          />
        )
      default:
        return (
          <div className="text-center py-8 text-gray-500">
            <p>No editor available for this exercise type.</p>
          </div>
        )
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header with actions */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">Edit Exercise</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Update
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-700">{error}</span>
              </div>
            )}

            {/* Basic Information */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter exercise title"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={formData.exercise_type}
                  disabled
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
                >
                  <option value="flashcard">Flashcard</option>
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="fill_blank">Fill in the Blank</option>
                  <option value="dropdown">Dropdown</option>
                  <option value="drag_drop">Drag & Drop</option>
                  <option value="ai_fill_blank">AI Fill Blank</option>
                  <option value="pronunciation">Pronunciation</option>
                  <option value="image_hotspot">Image Hotspot</option>
                  <option value="pdf_worksheet">PDF Worksheet</option>
                  <option value="speaking_assessment">Speaking Assessment</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Folder</label>
                <select
                  value={formData.folder_id || ''}
                  onChange={(e) => handleInputChange('folder_id', e.target.value || null)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">No folder</option>
                  {folders.map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">XP Reward</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.xp_reward}
                  onChange={(e) => handleInputChange('xp_reward', parseInt(e.target.value))}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Score Boost</label>
                <select
                  value={formData.score_boost}
                  onChange={(e) => handleInputChange('score_boost', parseInt(e.target.value))}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={0}>Normal</option>
                  <option value={15}>Lenient (+15)</option>
                  <option value={25}>Very Lenient (+25)</option>
                </select>
              </div>
            </div>

            {/* Category & Tags */}
            <div className="mb-4 flex items-start gap-3">
              <div className="shrink-0">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  <Tag className="w-3 h-3 inline mr-0.5" />
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All categories</option>
                  {EXERCISE_CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Tags</label>
                <div className="flex flex-wrap gap-1">
                  {availableTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                        formData.tags.includes(tag)
                          ? 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {formData.tags.includes(tag) && '✓ '}{tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Content Editor */}
            {renderContentEditor()}
          </div>

        </form>
      </div>
    </div>
  )
}

export default EditExerciseModal
