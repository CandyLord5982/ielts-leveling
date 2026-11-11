import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, X, Image as ImageIcon, Music, Upload } from 'lucide-react'
import { IELTS_LEVELS, DEFAULT_IELTS_LEVEL } from '../../exercises/SpeakingAssessmentExercise'
import { supabase } from '../../../supabase/client'

const emptyQuestion = (idx = 0) => ({
  id: `q${Date.now()}_${idx}`,
  prompt: '',
  instructions: '',
  time_limit: 0,
})

const SpeakingAssessmentEditor = ({ questions, level, onQuestionsChange, onLevelChange, folderPath }) => {
  const [localQuestions, setLocalQuestions] = useState(
    (questions || []).length ? questions : [emptyQuestion(0)]
  )
  const [uploading, setUploading] = useState({})
  const [mediaModal, setMediaModal] = useState(null) // { idx, type } | null
  const [mediaUrl, setMediaUrl] = useState('')
  const [imgSize, setImgSize] = useState('medium')
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [audioControls, setAudioControls] = useState(true)
  const [audioAutoplay, setAudioAutoplay] = useState(false)
  const [audioLoop, setAudioLoop] = useState(false)
  const [audioMaxPlays, setAudioMaxPlays] = useState(0)
  const [audioPlaybackRate, setAudioPlaybackRate] = useState(1)
  const promptRefs = useRef({})
  const imageInputRefs = useRef({})
  const audioInputRefs = useRef({})

  useEffect(() => {
    if (!(questions || []).length) {
      const initial = [emptyQuestion(0)]
      setLocalQuestions(initial)
      onQuestionsChange(initial)
    }
    // Save a valid IELTS level (old exercises may have kindergarten/primary/etc.)
    if (!IELTS_LEVELS.some(l => l.value === level)) onLevelChange(DEFAULT_IELTS_LEVEL)
  }, [])

  const sync = (updated) => {
    setLocalQuestions(updated)
    onQuestionsChange(updated)
  }

  const addQuestion = () => sync([...localQuestions, emptyQuestion(localQuestions.length)])

  // Bulk import: each non-empty line becomes one question
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const bulkLines = bulkText.split('\n').map(l => l.trim()).filter(Boolean)

  const importBulk = () => {
    if (!bulkLines.length) return
    const stamp = Date.now()
    const imported = bulkLines.map((line, i) => ({ ...emptyQuestion(i), id: `q${stamp}_b${i}`, prompt: line }))
    // Drop untouched blank questions so the import doesn't leave an empty one at the top
    const kept = localQuestions.filter(q => (q.prompt || '').trim() || (q.instructions || '').trim())
    sync([...kept, ...imported])
    setBulkText('')
    setBulkOpen(false)
  }
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
    setAudioControls(true)
    setAudioAutoplay(false)
    setAudioLoop(false)
    setAudioMaxPlays(0)
    setAudioPlaybackRate(1)
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
    let audioAttrs = ''
    if (mediaModal.type === 'audio') {
      const attrs = []
      if (audioControls) attrs.push('controls')
      if (audioAutoplay) attrs.push('autoplay')
      if (audioLoop) attrs.push('loop')
      if (audioMaxPlays > 0) attrs.push(`data-max-plays="${audioMaxPlays}"`)
      if (audioPlaybackRate && audioPlaybackRate !== 1) attrs.push(`data-playback-rate="${audioPlaybackRate}"`)
      audioAttrs = attrs.join(' ')
    }
    const snippet = mediaModal.type === 'image'
      ? `\n<img src="${url}" alt="" ${imgSizeAttr()} />\n`
      : `\n<audio src="${url}" ${audioAttrs}></audio>\n`
    insertIntoPrompt(mediaModal.idx, snippet)
    closeMediaModal()
  }

  const currentLevel = IELTS_LEVELS.some(l => l.value === level) ? level : DEFAULT_IELTS_LEVEL

  return (
    <div className="space-y-6">

      {/* Level picker */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Student Level</label>
        <div className="grid grid-cols-3 gap-2">
          {IELTS_LEVELS.map(l => (
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
              <span className="text-[10px] opacity-70 leading-tight">{l.bandRange}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          The AI rates each answer against IELTS band descriptors and tailors its feedback to this level.
        </p>
      </div>

      <hr className="border-gray-200" />

      {/* Questions */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Speaking Questions</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBulkOpen(o => !o)}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Bulk
          </button>
          <button
            type="button"
            onClick={addQuestion}
            className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
          >
            <Plus className="w-4 h-4" /> Add Question
          </button>
        </div>
      </div>

      {bulkOpen && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-1">Bulk Import Questions</h4>
          <p className="text-sm text-blue-700 mb-2">One question per line. Empty lines are skipped.</p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={8}
            placeholder={`Do you work or are you a student?\nWhat do you like to do in your free time?\nDescribe a place you would like to visit.`}
            className="w-full p-3 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={() => setBulkOpen(false)}
              className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={importBulk}
              disabled={!bulkLines.length}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
            >
              Import {bulkLines.length || ''} {bulkLines.length === 1 ? 'question' : 'questions'}
            </button>
          </div>
        </div>
      )}

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
              rows={2}
              placeholder="e.g. Describe a memorable trip you have taken. You should say: where you went, who you went with, and why it was memorable."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y"
            />
          </div>

          <div className="flex gap-3 items-end">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-600 mb-1">Instructions (optional)</label>
              <input
                value={q.instructions}
                onChange={(e) => updateField(idx, 'instructions', e.target.value)}
                placeholder="e.g. Speak for 1-2 minutes. Include specific details."
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
          <div className="flex-shrink-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">Time limit (s, 0 = none)</label>
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
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700">Tùy chọn âm thanh</h4>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={audioControls} onChange={(e) => setAudioControls(e.target.checked)} className="rounded" />
                    Hiển thị controls (play/pause/volume)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={audioAutoplay} onChange={(e) => setAudioAutoplay(e.target.checked)} className="rounded" />
                    Tự động phát (autoplay)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={audioLoop} onChange={(e) => setAudioLoop(e.target.checked)} className="rounded" />
                    Lặp lại (loop)
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700 w-24">Giới hạn phát:</label>
                    <input 
                      type="number" 
                      min="0"
                      value={audioMaxPlays} 
                      onChange={(e) => setAudioMaxPlays(parseInt(e.target.value) || 0)} 
                      className="w-20 p-1 border border-gray-300 rounded text-sm"
                    />
                    <span className="text-xs text-gray-500">(0 = không giới hạn)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700 w-24">Tốc độ phát:</label>
                    <select
                      value={audioPlaybackRate}
                      onChange={(e) => setAudioPlaybackRate(parseFloat(e.target.value))}
                      className="w-32 p-1 border border-gray-300 rounded text-sm"
                    >
                      <option value={0.5}>0.5x (Rất chậm)</option>
                      <option value={0.75}>0.75x (Chậm)</option>
                      <option value={1}>1x (Bình thường)</option>
                      <option value={1.25}>1.25x (Nhanh)</option>
                      <option value={1.5}>1.5x (Rất nhanh)</option>
                    </select>
                  </div>
                </div>
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
                    <audio src={mediaUrl} controls={audioControls} className="w-full" />
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
