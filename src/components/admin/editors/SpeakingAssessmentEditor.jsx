import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, X, Image as ImageIcon, Music, Upload } from 'lucide-react'
import { LEVELS } from '../../exercises/SpeakingAssessmentExercise'
import { supabase } from '../../../supabase/client'

const emptyQuestion = (idx = 0) => ({
  id: `q${Date.now()}_${idx}`,
  prompt: '',
  instructions: '',
  answer_mode: 'open', // 'open' = AI sub-scores | 'closed' = match expected answer
  expected_answers: [],
  key_points: [],
  time_limit: 0,
  evaluation_criteria: '',
})

const SpeakingAssessmentEditor = ({ questions, level, onQuestionsChange, onLevelChange, folderPath }) => {
  const [localQuestions, setLocalQuestions] = useState(
    (questions || []).length ? questions : [emptyQuestion(0)]
  )
  const [tagInputs, setTagInputs] = useState({})
  const [answerInputs, setAnswerInputs] = useState({})
  const [uploading, setUploading] = useState({})
  const [mediaModal, setMediaModal] = useState(null) // { idx, type } | null
  const [mediaUrl, setMediaUrl] = useState('')
  const [imgSize, setImgSize] = useState('medium')
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [audioCtrls, setAudioCtrls] = useState(true)
  const promptRefs = useRef({})
  const imageInputRefs = useRef({})
  const audioInputRefs = useRef({})

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

  const addExpectedAnswer = (idx) => {
    const ans = (answerInputs[idx] || '').trim()
    const existing = localQuestions[idx].expected_answers || []
    if (!ans || existing.includes(ans)) return
    updateField(idx, 'expected_answers', [...existing, ans])
    setAnswerInputs(prev => ({ ...prev, [idx]: '' }))
  }

  const removeExpectedAnswer = (idx, aIdx) => {
    updateField(idx, 'expected_answers', (localQuestions[idx].expected_answers || []).filter((_, i) => i !== aIdx))
  }

  // ── Media upload (inserts <img>/<audio> HTML into the prompt) ───────────────
  const insertIntoPrompt = (idx, snippet) => {
    const textarea = promptRefs.current[idx]
    const current = localQuestions[idx]?.prompt || ''
    if (!textarea) {
      updateField(idx, 'prompt', current + (current ? '\n' : '') + snippet)
      return
    }
    const start = textarea.selectionStart ?? current.length
    const end = textarea.selectionEnd ?? current.length
    const newValue = current.slice(0, start) + snippet + current.slice(end)
    updateField(idx, 'prompt', newValue)
    setTimeout(() => {
      textarea.focus()
      const caret = start + snippet.length
      textarea.setSelectionRange(caret, caret)
    }, 0)
  }

  const uploadFile = async (file) => {
    const basePath = folderPath ? `exercise_bank/${folderPath}` : 'exercise_bank'
    const path = `${basePath}/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('exercise-files')
      .upload(path, file, { cacheControl: '3600', upsert: true })
    if (uploadError) throw uploadError
    const { data: publicData } = supabase.storage.from('exercise-files').getPublicUrl(path)
    const publicUrl = publicData?.publicUrl
    if (!publicUrl) throw new Error('Cannot get public URL')
    return publicUrl
  }

  const handleMediaUpload = async (idx, file, kind) => {
    if (!file) return
    setUploading(prev => ({ ...prev, [idx]: kind }))
    try {
      const publicUrl = await uploadFile(file)
      const snippet = kind === 'image'
        ? `\n<img src="${publicUrl}" alt="" width="400" />\n`
        : `\n<audio src="${publicUrl}" controls></audio>\n`
      insertIntoPrompt(idx, snippet)
    } catch (e) {
      console.error('Upload failed:', e)
      alert('Upload failed. Please ensure the bucket "exercise-files" exists and RLS allows uploads.')
    } finally {
      setUploading(prev => ({ ...prev, [idx]: null }))
    }
  }

  const handlePromptPaste = async (idx, e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      const isImage = item.type.startsWith('image/')
      const isAudio = item.type.startsWith('audio/')
      if (!isImage && !isAudio) continue
      e.preventDefault()
      const file = item.getAsFile()
      if (file) await handleMediaUpload(idx, file, isImage ? 'image' : 'audio')
      return
    }
  }

  const openMediaModal = (idx, type) => {
    setMediaUrl('')
    setImgSize('medium')
    setCustomW('')
    setCustomH('')
    setAudioCtrls(true)
    setMediaModal({ idx, type })
  }

  const closeMediaModal = () => setMediaModal(null)

  const imgSizeAttr = () => {
    if (imgSize === 'custom') {
      const w = customW ? `width="${customW}"` : ''
      const h = customH ? `height="${customH}"` : ''
      return `${w} ${h}`.trim() || 'width="400"'
    }
    return { small: 'width="200"', medium: 'width="400"', large: 'width="600"', full: 'width="100%"' }[imgSize] || 'width="400"'
  }

  const insertMediaFromModal = () => {
    if (!mediaModal) return
    const url = mediaUrl.trim()
    if (!url) return
    const snippet = mediaModal.type === 'image'
      ? `\n<img src="${url}" alt="" ${imgSizeAttr()} />\n`
      : `\n<audio src="${url}" ${audioCtrls ? 'controls' : ''}></audio>\n`
    insertIntoPrompt(mediaModal.idx, snippet)
    closeMediaModal()
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

      <hr className="border-gray-200" />

      {/* Questions */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Speaking Questions</h3>
        <button
          type="button"
          onClick={addQuestion}
          className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
        >
          <Plus className="w-4 h-4" /> Add Question
        </button>
      </div>

      {localQuestions.map((q, idx) => (
        <div key={q.id} className="border border-gray-200 rounded-lg p-4 space-y-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-purple-700">Question {idx + 1}</span>
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

          {/* Answer mode */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Answer Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'open', title: 'Open response', desc: 'AI scores content, vocabulary, grammar & fluency.' },
                { value: 'closed', title: 'Expected answer', desc: 'AI checks if the student says the right answer.' },
              ].map(opt => {
                const active = (q.answer_mode || 'open') === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateField(idx, 'answer_mode', opt.value)}
                    className={`text-left p-3 rounded-lg border-2 transition-all ${
                      active ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className={`text-sm font-semibold ${active ? 'text-purple-700' : 'text-gray-700'}`}>{opt.title}</div>
                    <div className="text-[11px] text-gray-500 leading-tight mt-0.5">{opt.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">
                Prompt / Topic <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openMediaModal(idx, 'image')}
                  disabled={!!uploading[idx]}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
                  title="Add an image (link or upload)"
                >
                  <ImageIcon className="w-3 h-3" />
                  {uploading[idx] === 'image' ? 'Uploading…' : 'Image'}
                </button>
                <button
                  type="button"
                  onClick={() => openMediaModal(idx, 'audio')}
                  disabled={!!uploading[idx]}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
                  title="Add audio (link or upload)"
                >
                  <Music className="w-3 h-3" />
                  {uploading[idx] === 'audio' ? 'Uploading…' : 'Audio'}
                </button>
                <input
                  ref={(el) => (imageInputRefs.current[idx] = el)}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { handleMediaUpload(idx, e.target.files?.[0], 'image'); e.target.value = ''; closeMediaModal() }}
                />
                <input
                  ref={(el) => (audioInputRefs.current[idx] = el)}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => { handleMediaUpload(idx, e.target.files?.[0], 'audio'); e.target.value = ''; closeMediaModal() }}
                />
              </div>
            </div>
            <textarea
              ref={(el) => (promptRefs.current[idx] = el)}
              value={q.prompt}
              onChange={(e) => updateField(idx, 'prompt', e.target.value)}
              onPaste={(e) => handlePromptPaste(idx, e)}
              rows={5}
              placeholder="e.g. Describe a memorable trip you have taken."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y min-h-[80px]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Click Image or Audio to paste a link (and pick a size) or upload a file. You can also paste a copied image/audio straight into the box. Students see it above the recording button.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Instructions (optional)</label>
            <input
              value={q.instructions}
              onChange={(e) => updateField(idx, 'instructions', e.target.value)}
              placeholder="e.g. Speak for 1-2 minutes. Include specific details."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          {q.answer_mode === 'closed' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Accepted Answers <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-1 mb-2">
                {(q.expected_answers || []).map((ans, aIdx) => (
                  <span key={aIdx} className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                    {ans}
                    <button type="button" onClick={() => removeExpectedAnswer(idx, aIdx)}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={answerInputs[idx] || ''}
                  onChange={(e) => setAnswerInputs(prev => ({ ...prev, [idx]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExpectedAnswer(idx) } }}
                  placeholder="e.g. shirt — then a shirt, it's a shirt"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <button
                  type="button"
                  onClick={() => addExpectedAnswer(idx)}
                  className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm"
                >
                  Add
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Add the main answer plus any phrasings you will accept. The AI is lenient with articles, full sentences, synonyms, and minor mispronunciations.
              </p>
            </div>
          )}

          {q.answer_mode !== 'closed' && (
          <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Key Points to Cover (optional)</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {q.key_points.map((kp, kpIdx) => (
                <span key={kpIdx} className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
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
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>
          </>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Time Limit (seconds, 0 = none)</label>
            <input
              type="number"
              min="0"
              max="600"
              value={q.time_limit}
              onChange={(e) => updateField(idx, 'time_limit', parseInt(e.target.value) || 0)}
              className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>
        </div>
      ))}

      {localQuestions.length === 0 && (
        <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-gray-300 rounded-lg">
          No questions yet. Click "Add Question" to start.
        </div>
      )}

      {/* Media modal (link + size / audio options, with upload fallback) */}
      {mediaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={closeMediaModal}>
          <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {mediaModal.type === 'image' ? 'Add image' : 'Add audio'}
              </h3>
              <button type="button" onClick={closeMediaModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  autoFocus
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertMediaFromModal() } }}
                  placeholder={mediaModal.type === 'image' ? 'https://example.com/image.png' : 'https://example.com/audio.mp3'}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => (mediaModal.type === 'image' ? imageInputRefs.current[mediaModal.idx] : audioInputRefs.current[mediaModal.idx])?.click()}
                    disabled={!!uploading[mediaModal.idx]}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    {uploading[mediaModal.idx] ? 'Uploading…' : 'Or upload from device'}
                  </button>
                </div>
              </div>

              {mediaModal.type === 'image' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Image size</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'small', label: 'Small (200px)' },
                      { value: 'medium', label: 'Medium (400px)' },
                      { value: 'large', label: 'Large (600px)' },
                      { value: 'full', label: 'Full width' },
                    ].map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setImgSize(s.value)}
                        className={`p-2 rounded-lg border text-sm transition-colors ${
                          imgSize === s.value ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 mt-3 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={imgSize === 'custom'}
                      onChange={(e) => setImgSize(e.target.checked ? 'custom' : 'medium')}
                      className="rounded"
                    />
                    Custom size
                  </label>
                  {imgSize === 'custom' && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Width (px)</label>
                        <input type="number" min="50" max="1200" value={customW} onChange={(e) => setCustomW(e.target.value)} placeholder="400" className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Height (px)</label>
                        <input type="number" min="50" max="800" value={customH} onChange={(e) => setCustomH(e.target.value)} placeholder="auto" className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {mediaModal.type === 'audio' && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={audioCtrls} onChange={(e) => setAudioCtrls(e.target.checked)} className="rounded" />
                  Show player controls (play / pause / volume)
                </label>
              )}

              {mediaUrl.trim() && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">Preview:</p>
                  {mediaModal.type === 'image' ? (
                    <img
                      src={mediaUrl}
                      alt="Preview"
                      className="max-w-full object-contain rounded border"
                      style={{
                        width: imgSize === 'custom' && customW ? `${customW}px` : imgSize === 'small' ? '200px' : imgSize === 'medium' ? '400px' : imgSize === 'large' ? '600px' : '100%',
                        height: imgSize === 'custom' && customH ? `${customH}px` : 'auto',
                        maxHeight: '200px',
                      }}
                    />
                  ) : (
                    <audio src={mediaUrl} controls={audioCtrls} className="w-full" />
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={closeMediaModal} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">
                Cancel
              </button>
              <button
                type="button"
                onClick={insertMediaFromModal}
                disabled={!mediaUrl.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
              >
                {mediaModal.type === 'image' ? 'Insert image' : 'Insert audio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SpeakingAssessmentEditor
