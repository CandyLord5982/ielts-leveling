import React, { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react'
import { LEVELS } from '../../exercises/SpeakingAssessmentExercise'

const emptyQuestion = (idx = 0) => ({
  id: `q${Date.now()}_${idx}`,
  prompt: '',
  instructions: '',
  key_points: [],
  evaluation_criteria: '',
  max_file_size_mb: 50,
})

const VideoUploadEditor = ({ questions, level, skipScoring, onQuestionsChange, onLevelChange, onSkipScoringChange }) => {
  const [localQuestions, setLocalQuestions] = useState(
    (questions || []).length ? questions : [emptyQuestion(0)]
  )
  const [tagInputs, setTagInputs] = useState({})

  useEffect(() => {
    if (!(questions || []).length) {
      const initial = [emptyQuestion(0)]
      setLocalQuestions(initial)
      onQuestionsChange(initial)
    }
  }, [])

  const sync = (updated) => {
    setLocalQuestions(updated)
    onQuestionsChange(updated)
  }

  const addQuestion = () => sync([...localQuestions, emptyQuestion(localQuestions.length)])
  const removeQuestion = (idx) => sync(localQuestions.filter((_, i) => i !== idx))

  const moveUp = (idx) => {
    if (idx === 0) return
    const arr = [...localQuestions]
    ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
    sync(arr)
  }

  const moveDown = (idx) => {
    if (idx === localQuestions.length - 1) return
    const arr = [...localQuestions]
    ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
    sync(arr)
  }

  const updateField = (idx, field, value) => {
    sync(localQuestions.map((q, i) => i === idx ? { ...q, [field]: value } : q))
  }

  const addKeyPoint = (idx) => {
    const tag = (tagInputs[idx] || '').trim()
    if (!tag || localQuestions[idx].key_points.includes(tag)) return
    updateField(idx, 'key_points', [...localQuestions[idx].key_points, tag])
    setTagInputs(prev => ({ ...prev, [idx]: '' }))
  }

  const removeKeyPoint = (idx, kpIdx) => {
    updateField(idx, 'key_points', localQuestions[idx].key_points.filter((_, i) => i !== kpIdx))
  }

  const currentLevel = level || 'middle'

  return (
    <div className="space-y-6">

      {/* Level picker */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Student Level</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {LEVELS.map(l => (
            <button
              key={l.value}
              type="button"
              onClick={() => onLevelChange(l.value)}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-center transition-all ${
                currentLevel === l.value
                  ? `${l.color} border-current font-semibold shadow-sm`
                  : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className="text-xl">{l.emoji}</span>
              <span className="text-xs leading-tight">{l.label}</span>
              <span className="text-[10px] opacity-70 leading-tight">{l.ageRange}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          The AI will calibrate its scoring and feedback tone to match this level.
        </p>
      </div>

      {/* Skip scoring toggle */}
      <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <div>
          <span className="text-sm font-medium text-gray-700">Upload Only (No AI Scoring)</span>
          <p className="text-xs text-gray-500">Students just upload their video and move on — no transcription or feedback shown.</p>
        </div>
        <button
          type="button"
          onClick={() => onSkipScoringChange?.(!skipScoring)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${skipScoring ? 'bg-amber-500' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${skipScoring ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      <hr className="border-gray-200" />

      {/* Questions */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Video Upload Questions</h3>
        <button
          type="button"
          onClick={addQuestion}
          className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700"
        >
          <Plus className="w-4 h-4" /> Add Question
        </button>
      </div>

      {localQuestions.map((q, idx) => (
        <div key={q.id} className="border border-gray-200 rounded-lg p-4 space-y-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-teal-700">Question {idx + 1}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => moveUp(idx)} className="p-1 hover:bg-gray-200 rounded" title="Move up">
                <ChevronUp className="w-4 h-4 text-gray-500" />
              </button>
              <button type="button" onClick={() => moveDown(idx)} className="p-1 hover:bg-gray-200 rounded" title="Move down">
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
              {localQuestions.length > 1 && (
                <button type="button" onClick={() => removeQuestion(idx)} className="p-1 hover:bg-red-100 rounded" title="Remove">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Prompt / Topic <span className="text-red-500">*</span>
            </label>
            <textarea
              value={q.prompt}
              onChange={(e) => updateField(idx, 'prompt', e.target.value)}
              rows={3}
              placeholder="e.g. Record a 1-minute self-introduction in English."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Instructions (optional)</label>
            <input
              value={q.instructions}
              onChange={(e) => updateField(idx, 'instructions', e.target.value)}
              placeholder="e.g. Include your name, hobbies, and future plans."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Key Points to Cover (optional)</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {q.key_points.map((kp, kpIdx) => (
                <span key={kpIdx} className="flex items-center gap-1 px-2 py-0.5 bg-teal-100 text-teal-700 text-xs rounded-full">
                  {kp}
                  <button type="button" onClick={() => removeKeyPoint(idx, kpIdx)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInputs[idx] || ''}
                onChange={(e) => setTagInputs(prev => ({ ...prev, [idx]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyPoint(idx) } }}
                placeholder="Type a point and press Enter"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
              <button
                type="button"
                onClick={() => addKeyPoint(idx)}
                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm"
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Evaluation Criteria (optional)</label>
            <input
              value={q.evaluation_criteria}
              onChange={(e) => updateField(idx, 'evaluation_criteria', e.target.value)}
              placeholder="e.g. content relevance, vocabulary, grammar, fluency"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max File Size (MB)</label>
            <input
              type="number"
              min="1"
              max="200"
              value={q.max_file_size_mb || 50}
              onChange={(e) => updateField(idx, 'max_file_size_mb', parseInt(e.target.value) || 50)}
              className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
        </div>
      ))}

      {localQuestions.length === 0 && (
        <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-gray-300 rounded-lg">
          No questions yet. Click "Add Question" to start.
        </div>
      )}
    </div>
  )
}

export default VideoUploadEditor
