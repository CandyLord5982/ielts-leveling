import React, { useState } from 'react'
import { supabase } from '../../../supabase/client'
import { BookOpen, Edit3, Mic, HelpCircle, Tag, Copy, Brain, ChevronDown, Image, FileText, Video, Plus } from 'lucide-react'
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

const CreateExerciseModal = ({ folders, selectedFolder, onClose, onCreated, allowedTypes = null }) => {
  const [formData, setFormData] = useState({
    title: '',
    exercise_type: allowedTypes?.length === 1 ? allowedTypes[0] : 'flashcard',
    folder_id: selectedFolder?.id || '',
    difficulty_level: 1,
    xp_reward: 10,
    score_boost: 0,
    category: '',
    tags: [],
    estimated_duration: 5,
    content: {}
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const allExerciseTypes = [
    { value: 'flashcard', label: 'Flashcard', icon: BookOpen },
    { value: 'pronunciation', label: 'Pronunciation', icon: Mic },
    { value: 'fill_blank', label: 'Fill in the Blank', icon: Edit3 },
    { value: 'multiple_choice', label: 'Multiple Choice', icon: HelpCircle },
    { value: 'drag_drop', label: 'Drag & Drop', icon: Copy },
    { value: 'dropdown', label: 'Dropdown', icon: ChevronDown },
    { value: 'ai_fill_blank', label: 'Fill in AI Score', icon: Brain },
    { value: 'image_hotspot', label: 'Image Hotspot', icon: Image },
    { value: 'pdf_worksheet', label: 'PDF Worksheet', icon: FileText },
    { value: 'speaking_assessment', label: 'Speaking Assessment', icon: Mic },
    { value: 'video_upload', label: 'Video Upload', icon: Video },
  ]
  const exerciseTypes = allowedTypes
    ? allExerciseTypes.filter(t => allowedTypes.includes(t.value))
    : allExerciseTypes

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error } = await supabase
        .from('exercises')
        .insert({
          title: formData.title.trim(),
          exercise_type: formData.exercise_type,
          content: formData.content,
          folder_id: formData.folder_id || null,
          difficulty_level: 1,
          xp_reward: formData.xp_reward,
          score_boost: formData.score_boost || 0,
          category: formData.category || null,
          tags: formData.tags.length > 0 ? formData.tags : null,
          estimated_duration: 5,
          is_in_bank: true,
          is_active: true,
          session_id: null, // Not assigned to session yet
          order_index: 0
        })

      if (error) throw error

      onCreated()
    } catch (err) {
      console.error('Error creating exercise:', err)
      setError(err.message || 'Failed to create exercise')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleContentChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      content: {
        ...prev.content,
        [key]: value
      }
    }))
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

  // Build folder options
  const buildFolderOptions = (folders, parentId = null, level = 0) => {
    return folders
      .filter(folder => folder.parent_folder_id === parentId)
      .flatMap(folder => [
        <option key={folder.id} value={folder.id}>
          {'  '.repeat(level) + folder.name}
        </option>,
        ...buildFolderOptions(folders, folder.id, level + 1)
      ])
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-lg shadow-xl w-full max-h-[90vh] flex flex-col ${formData.exercise_type === 'pdf_worksheet' || formData.exercise_type === 'image_hotspot' ? 'max-w-6xl' : 'max-w-4xl'}`}>
        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* Header with actions */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">Create New Exercise</h2>
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
                disabled={loading || !formData.title.trim()}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
          <div className="overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Basic Information */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter exercise title"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type *</label>
              <select
                value={formData.exercise_type}
                onChange={(e) => handleChange('exercise_type', e.target.value)}
                disabled={Object.values(formData.content).some(v => Array.isArray(v) ? v.length > 0 : v !== '' && v !== undefined && v !== null)}
                className={`w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${Object.values(formData.content).some(v => Array.isArray(v) ? v.length > 0 : v !== '' && v !== undefined && v !== null) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              >
                {exerciseTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Folder</label>
              <select
                value={formData.folder_id}
                onChange={(e) => handleChange('folder_id', e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">No Folder</option>
                {buildFolderOptions(folders)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">XP Reward</label>
              <input
                type="number"
                value={formData.xp_reward}
                onChange={(e) => handleChange('xp_reward', parseInt(e.target.value))}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1"
                max="100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Score Boost</label>
              <select
                value={formData.score_boost}
                onChange={(e) => handleChange('score_boost', parseInt(e.target.value))}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={0}>Normal</option>
                <option value={15}>Lenient (+15)</option>
                <option value={25}>Very Lenient (+25)</option>
              </select>
            </div>
          </div>

          {/* Category & Tags */}
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                <Tag className="w-3 h-3 inline mr-0.5" />
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

          {/* Exercise Content Editors */}
          <div>

            {formData.exercise_type === 'flashcard' && (
              <FlashcardEditor
                cards={formData.content.cards || []}
                onCardsChange={(cards) => handleContentChange('cards', cards)}
                folderPath={getFolderPath(formData.folder_id)}
              />
            )}

            {formData.exercise_type === 'multiple_choice' && (
              <MultipleChoiceEditor
                questions={formData.content.questions || []}
                onQuestionsChange={(questions) => handleContentChange('questions', questions)}
                settings={formData.content.settings || {}}
                onSettingsChange={(settings) => handleContentChange('settings', settings)}
                intro={formData.content.intro || ''}
                onIntroChange={(intro) => handleContentChange('intro', intro)}
                folderPath={getFolderPath(formData.folder_id)}
              />
            )}

            {formData.exercise_type === 'drag_drop' && (
              <div className="space-y-4">
                <SmartDragDropEditor
                  questions={formData.content.questions || []}
                  onQuestionsChange={(questions) => handleContentChange('questions', questions)}
                  intro={formData.content.intro || ''}
                  onIntroChange={(intro) => handleContentChange('intro', intro)}
                  folderPath={getFolderPath(formData.folder_id)}
                />
              </div>
            )}

            {formData.exercise_type === 'fill_blank' && (
              <FillBlankEditor
                questions={formData.content.questions || []}
                onQuestionsChange={(questions) => handleContentChange('questions', questions)}
                settings={formData.content.settings || {}}
                onSettingsChange={(settings) => handleContentChange('settings', settings)}
                intro={formData.content.intro || ''}
                onIntroChange={(intro) => handleContentChange('intro', intro)}
                folderPath={getFolderPath(formData.folder_id)}
              />
            )}

            {formData.exercise_type === 'dropdown' && (
              <SimpleDropdownEditor
                questions={formData.content.questions || []}
                onQuestionsChange={(questions) => handleContentChange('questions', questions)}
                intro={formData.content.intro || ''}
                onIntroChange={(intro) => handleContentChange('intro', intro)}
                folderPath={getFolderPath(formData.folder_id)}
              />
            )}

            {formData.exercise_type === 'pronunciation' && (
              <PronunciationEditor
                questions={formData.content.questions || []}
                onQuestionsChange={(questions) => handleContentChange('questions', questions)}
              />
            )}


            {formData.exercise_type === 'ai_fill_blank' && (
              <div className="space-y-4">
                <AIFillBlankEditor
                  questions={formData.content.questions || []}
                  onQuestionsChange={(questions) => handleContentChange('questions', questions)}
                  intro={formData.content.intro || ''}
                  onIntroChange={(intro) => handleContentChange('intro', intro)}
                  language={formData?.content?.settings?.language || 'en'}
                  onLanguageChange={(lang) => {
                    const currentSettings = formData?.content?.settings || {}
                    handleContentChange('settings', { ...currentSettings, language: lang })
                  }}
                  folderPath={getFolderPath(formData.folder_id)}
                />
              </div>
            )}

            {formData.exercise_type === 'image_hotspot' && (
              <ImageHotspotEditor
                content={formData.content}
                onContentChange={(content) => setFormData({ ...formData, content })}
                folderPath={getFolderPath(formData.folder_id)}
              />
            )}

            {formData.exercise_type === 'pdf_worksheet' && (
              <PDFWorksheetEditor
                content={formData.content}
                onContentChange={(content) => setFormData(prev => ({ ...prev, content }))}
              />
            )}

            {formData.exercise_type === 'speaking_assessment' && (
              <SpeakingAssessmentEditor
                questions={formData.content.questions || []}
                level={formData.content.level || 'middle'}
                onQuestionsChange={(questions) => handleContentChange('questions', questions)}
                onLevelChange={(level) => handleContentChange('level', level)}
                folderPath={getFolderPath(formData.folder_id)}
              />
            )}

            {formData.exercise_type === 'video_upload' && (
              <VideoUploadEditor
                questions={formData.content.questions || []}
                level={formData.content.level || 'middle'}
                skipScoring={formData.content.skip_scoring || false}
                onQuestionsChange={(questions) => handleContentChange('questions', questions)}
                onLevelChange={(level) => handleContentChange('level', level)}
                onSkipScoringChange={(val) => handleContentChange('skip_scoring', val)}
              />
            )}
          </div>
          </div>

        </form>
      </div>
    </div>
  )
}

export default CreateExerciseModal