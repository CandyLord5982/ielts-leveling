import React, { useState, useEffect, useRef } from 'react'
import {
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Volume2,
  HelpCircle,
  Image as ImageIcon,
  Link as LinkIcon,
  Music
} from 'lucide-react'
import RichTextRenderer from '../../ui/RichTextRenderer'
import { handleRichTextShortcut } from '../../../hooks/useRichTextShortcuts'

const PronunciationEditor = ({ questions, onQuestionsChange }) => {
  const normalizeQuestion = (q, idx = 0) => ({
    id: q?.id || `q${Date.now()}_${idx}`,
    text: q?.text || '',
    audio_url: q?.audio_url || '',
    max_audio_plays: q?.max_audio_plays || 0,
    time_limit: q?.time_limit || 0
  })

  const [localQuestions, setLocalQuestions] = useState((questions || []).map((q, i) => normalizeQuestion(q, i)))
  const [bulkImportMode, setBulkImportMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [collapsedQuestions, setCollapsedQuestions] = useState({})
  const [urlModal, setUrlModal] = useState({ isOpen: false, type: '', questionIndex: -1 })
  const [urlInput, setUrlInput] = useState('')
  const [linkText, setLinkText] = useState('')
  const [imageSize, setImageSize] = useState('medium')
  const [customWidth, setCustomWidth] = useState('')
  const [customHeight, setCustomHeight] = useState('')
  const [audioControls, setAudioControls] = useState(true)
  const [audioAutoplay, setAudioAutoplay] = useState(false)
  const [audioLoop, setAudioLoop] = useState(false)
  const [audioPlaybackRate, setAudioPlaybackRate] = useState(1)
  const questionTextareasRef = useRef({})

  useEffect(() => {
    setLocalQuestions((questions || []).map((q, i) => normalizeQuestion(q, i)))
  }, [questions])

  const addQuestion = () => {
    const newQuestion = normalizeQuestion({}, localQuestions.length)
    const updatedQuestions = [...localQuestions, newQuestion]
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const duplicateQuestion = (index) => {
    const questionToDuplicate = { ...localQuestions[index] }
    questionToDuplicate.id = `q${Date.now()}`
    const updatedQuestions = [...localQuestions]
    updatedQuestions.splice(index + 1, 0, questionToDuplicate)
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const removeQuestion = (index) => {
    const updatedQuestions = localQuestions.filter((_, i) => i !== index)
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const updateQuestion = (index, field, value) => {
    const updatedQuestions = localQuestions.map((q, i) =>
      i === index ? { ...q, [field]: value } : q
    )
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const moveQuestion = (index, direction) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= localQuestions.length) return

    const updatedQuestions = [...localQuestions]
    const temp = updatedQuestions[index]
    updatedQuestions[index] = updatedQuestions[newIndex]
    updatedQuestions[newIndex] = temp

    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const toggleCollapse = (index) => {
    setCollapsedQuestions(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  const toggleAllQuestions = () => {
    const anyExpanded = localQuestions.some((_, index) => !collapsedQuestions[index])

    if (anyExpanded) {
      const allCollapsed = {}
      localQuestions.forEach((_, index) => {
        allCollapsed[index] = true
      })
      setCollapsedQuestions(allCollapsed)
    } else {
      setCollapsedQuestions({})
    }
  }

  const playAudio = (url) => {
    if (url) {
      const audio = new Audio(url)
      audio.play()
    }
  }

  const insertAtCursor = (index, field, snippet) => {
    const textarea = questionTextareasRef.current[index]
    const current = localQuestions[index]?.[field] || ''

    if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const before = current.slice(0, start)
      const after = current.slice(end)
      const newValue = `${before}${snippet}${after}`
      updateQuestion(index, field, newValue)
      setTimeout(() => {
        try {
          const pos = start + snippet.length
          const ta = questionTextareasRef.current[index]
          if (ta) {
            ta.focus()
            ta.setSelectionRange(pos, pos)
          }
        } catch {}
      }, 0)
    } else {
      updateQuestion(index, field, current + (current ? '\n' : '') + snippet)
    }
  }

  const handlePasteImageUrl = (index) => {
    setUrlModal({ isOpen: true, type: 'image', questionIndex: index })
    setUrlInput('')
    setLinkText('')
    setImageSize('medium')
    setCustomWidth('')
    setCustomHeight('')
  }

  const handleInsertAudio = (index) => {
    setUrlModal({ isOpen: true, type: 'audio', questionIndex: index })
    setUrlInput('')
    setLinkText('')
    setImageSize('medium')
    setCustomWidth('')
    setCustomHeight('')
    setAudioControls(true)
    setAudioAutoplay(false)
    setAudioLoop(false)
    setAudioPlaybackRate(1)
  }

  const handleInsertLink = (index) => {
    setUrlModal({ isOpen: true, type: 'link', questionIndex: index })
    setUrlInput('')
    setLinkText('Reference')
  }

  const getImageSizeStyle = () => {
    if (imageSize === 'custom') {
      const width = customWidth ? `width="${customWidth}"` : ''
      const height = customHeight ? `height="${customHeight}"` : ''
      return `${width} ${height}`.trim()
    }
    const sizeMap = { small: 'width="200"', medium: 'width="400"', large: 'width="600"', full: 'width="100%"' }
    return sizeMap[imageSize] || sizeMap['medium']
  }

  const getAudioAttributes = () => {
    const attributes = []
    if (audioControls) attributes.push('controls')
    if (audioAutoplay) attributes.push('autoplay')
    if (audioLoop) attributes.push('loop')
    if (audioPlaybackRate && audioPlaybackRate !== 1) attributes.push(`data-playback-rate="${audioPlaybackRate}"`)
    return attributes.join(' ')
  }

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return
    try {
      new URL(urlInput.trim())
      const trimmedUrl = urlInput.trim()
      const idx = urlModal.questionIndex
      if (urlModal.type === 'image') {
        const sizeStyle = getImageSizeStyle()
        insertAtCursor(idx, 'text', `<img src="${trimmedUrl}" alt="" ${sizeStyle} />`)
      } else if (urlModal.type === 'link') {
        const text = linkText.trim() || 'Reference'
        insertAtCursor(idx, 'text', `[${text}](${trimmedUrl})`)
      } else if (urlModal.type === 'audio') {
        const audioAttrs = getAudioAttributes()
        insertAtCursor(idx, 'text', `<audio src="${trimmedUrl}" ${audioAttrs}></audio>`)
      }
      handleUrlCancel()
    } catch (e) {
      alert('Please enter a valid URL (http/https)')
    }
  }

  const handleUrlCancel = () => {
    setUrlModal({ isOpen: false, type: '', questionIndex: -1 })
    setUrlInput('')
    setLinkText('')
    setImageSize('medium')
    setCustomWidth('')
    setCustomHeight('')
    setAudioControls(true)
    setAudioAutoplay(false)
    setAudioLoop(false)
    setAudioPlaybackRate(1)
  }

  const markdownToHtml = (text) => {
    if (!text) return ''
    let html = text
    html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, url) => `<img src="${url}" alt="${alt || ''}" class="max-w-full h-auto rounded-lg my-2" />`)
    html = html.replace(/<img([^>]*?)>/g, (m, attrs) => `<img${attrs} class="max-w-full h-auto rounded-lg my-2" />`)
    html = html.replace(/<audio([^>]*?)>/g, (m, attrs) => `<audio${attrs} class="w-full my-2"></audio>`)
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, (m, t, url) => `<a href="${url}" target="_blank" rel="noreferrer">${t || url}</a>`)
    return html
  }

  const processBulkImport = () => {
    try {
      const lines = bulkText.split('\n').filter(line => line.trim())
      const newQuestions = []

      lines.forEach((line, index) => {
        const trimmed = line.trim()

        // Format: text | audio_url
        // Example: Hello | https://example.com/audio.mp3
        const parts = trimmed.split('|').map(p => p.trim())

        if (parts.length >= 1 && parts[0]) {
          newQuestions.push({
            id: `q${Date.now()}_${index}`,
            text: parts[0] || '',
            audio_url: parts[1] || '',
            max_audio_plays: 0
          })
        }
      })

      if (newQuestions.length > 0) {
        const updatedQuestions = [...localQuestions, ...newQuestions]
        setLocalQuestions(updatedQuestions)
        onQuestionsChange(updatedQuestions)
        setBulkText('')
        setBulkImportMode(false)
        alert(`Successfully imported ${newQuestions.length} questions!`)
      } else {
        alert('No valid questions found. Please check your format.')
      }
    } catch (error) {
      console.error('Bulk import error:', error)
      alert('Error processing bulk import. Please check your format.')
    }
  }

  return (
    <div className="space-y-4 p-4 border border-gray-200 rounded-lg">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Pronunciation Questions</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setBulkImportMode(!bulkImportMode)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            Bulk
          </button>
          {localQuestions.length > 0 && (
            <button
              type="button"
              onClick={toggleAllQuestions}
              className="flex items-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
            >
              {localQuestions.some((_, index) => !collapsedQuestions[index]) ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Collapse All
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Expand All
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={addQuestion}
            className="flex items-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      {/* Bulk Import Mode */}
      {bulkImportMode && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">Bulk Import Questions</h4>
          <p className="text-sm text-blue-700 mb-3">
            Format: <code className="bg-blue-100 px-2 py-1 rounded">text | audio_url</code>
            <br />
            Example: <code className="bg-blue-100 px-2 py-1 rounded">Hello | https://example.com/audio.mp3</code>
            <br />
            One question per line. Audio URL is optional.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="w-full p-3 border border-blue-300 rounded-lg h-40 font-mono text-sm"
            placeholder="Hello
World
Pronunciation | https://example.com/audio.mp3"
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              onClick={() => {
                setBulkImportMode(false)
                setBulkText('')
              }}
              className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={processBulkImport}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              Import Questions
            </button>
          </div>
        </div>
      )}

      {/* Questions List */}
      <div className="space-y-4">
        {localQuestions.map((question, index) => {
          const isCollapsed = collapsedQuestions[index]
          return (
            <div key={question.id || index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(index)}
                    className="p-1 text-gray-600 hover:text-gray-900"
                    title={isCollapsed ? "Expand" : "Collapse"}
                  >
                    {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    Question {index + 1}
                    {isCollapsed && question.text && (
                      <span className="ml-2 text-xs text-gray-500 truncate max-w-md inline-block">
                        - {question.text.substring(0, 50)}{question.text.length > 50 ? '...' : ''}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveQuestion(index, 'up')}
                    disabled={index === 0}
                    className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    title="Move up"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveQuestion(index, 'down')}
                    disabled={index === localQuestions.length - 1}
                    className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    title="Move down"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateQuestion(index)}
                    className="p-1 text-blue-600 hover:text-blue-800"
                    title="Duplicate"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(index)}
                    className="p-1 text-red-600 hover:text-red-800"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {!isCollapsed && (
                <div className="space-y-4">
                  {/* Text */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Text/Word/Phrase <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-2 mb-2">
                      <button type="button" onClick={() => handlePasteImageUrl(index)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> Image
                      </button>
                      <button type="button" onClick={() => handleInsertAudio(index)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                        <Music className="w-3 h-3" /> Audio
                      </button>
                      <button type="button" onClick={() => handleInsertLink(index)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                        <LinkIcon className="w-3 h-3" /> Link
                      </button>
                    </div>
                    <textarea
                      value={question.text || ''}
                      onChange={(e) => updateQuestion(index, 'text', e.target.value)}
                      onKeyDown={(e) => handleRichTextShortcut(e, questionTextareasRef.current[index], question.text || '', (v) => updateQuestion(index, 'text', v))}
                      ref={(el) => { questionTextareasRef.current[index] = el }}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="Enter word or phrase to pronounce..."
                    />
                    {question.text && (
                      <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Preview:</p>
                        <div className="prose max-w-none">
                          <RichTextRenderer content={markdownToHtml(question.text)} allowImages allowLinks />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Max Audio Plays */}
                  {question.audio_url && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Audio Play Limit
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={question.max_audio_plays || 0}
                          onChange={(e) => updateQuestion(index, 'max_audio_plays', parseInt(e.target.value) || 0)}
                          className="w-24 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-600">
                          {question.max_audio_plays === 0 ? 'Unlimited plays' : `Max ${question.max_audio_plays} play${question.max_audio_plays !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Set to 0 for unlimited plays, or limit how many times students can listen
                      </p>
                    </div>
                  )}

                  {/* Time Limit */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Time Limit (seconds)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        max="300"
                        value={question.time_limit || 0}
                        onChange={(e) => updateQuestion(index, 'time_limit', parseInt(e.target.value) || 0)}
                        className="w-24 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-600">
                        {question.time_limit === 0 ? 'No time limit' : `${question.time_limit} second${question.time_limit !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Set to 0 for no time limit. Question will auto-submit when time runs out.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {localQuestions.length === 0 && !bulkImportMode && (
          <div className="text-center py-8 text-gray-500">
            <HelpCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>No questions yet. Click "Add Question" or "Bulk Import" to start.</p>
          </div>
        )}
      </div>

      {/* URL Modal */}
      {urlModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {urlModal.type === 'image' ? 'Insert Image' : urlModal.type === 'audio' ? 'Insert Audio' : 'Insert Link'}
              </h3>
              <button onClick={handleUrlCancel} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={urlModal.type === 'image' ? 'https://example.com/image.jpg' : urlModal.type === 'audio' ? 'https://example.com/audio.mp3' : 'https://example.com/link'}
                />
              </div>
              {urlModal.type === 'link' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Link Text (optional)</label>
                  <input
                    type="text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Reference"
                  />
                </div>
              )}
              {urlModal.type === 'image' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Image Size</label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {[
                      { value: 'small', label: 'Small (200px)' },
                      { value: 'medium', label: 'Medium (400px)' },
                      { value: 'large', label: 'Large (600px)' },
                      { value: 'full', label: 'Full Width' }
                    ].map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setImageSize(s.value)}
                        className={`p-2 rounded border text-sm ${imageSize === s.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 hover:border-gray-400'}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Width (px)</label>
                      <input
                        type="number"
                        value={customWidth}
                        onChange={(e) => setCustomWidth(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        placeholder="400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Height (px)</label>
                      <input
                        type="number"
                        value={customHeight}
                        onChange={(e) => setCustomHeight(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        placeholder="300"
                      />
                    </div>
                  </div>
                </div>
              )}
              {urlModal.type === 'audio' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Audio Options</label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={audioControls} onChange={(e) => setAudioControls(e.target.checked)} />
                    Show controls
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={audioAutoplay} onChange={(e) => setAudioAutoplay(e.target.checked)} />
                    Autoplay
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={audioLoop} onChange={(e) => setAudioLoop(e.target.checked)} />
                    Loop
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    Playback speed:
                    <select
                      value={audioPlaybackRate}
                      onChange={(e) => setAudioPlaybackRate(parseFloat(e.target.value))}
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value={0.5}>0.5x</option>
                      <option value={0.75}>0.75x</option>
                      <option value={1}>1x</option>
                      <option value={1.25}>1.25x</option>
                      <option value={1.5}>1.5x</option>
                      <option value={2}>2x</option>
                    </select>
                  </label>
                </div>
              )}
              {urlInput && (
                <div className="p-3 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600 mb-2">Preview:</div>
                  {urlModal.type === 'image' ? (
                    <img src={urlInput} alt="Preview" className="max-w-full rounded border" />
                  ) : urlModal.type === 'audio' ? (
                    <audio ref={(el) => { if (el) el.playbackRate = audioPlaybackRate }} src={urlInput} controls={audioControls} autoPlay={audioAutoplay} loop={audioLoop} className="w-full" />
                  ) : (
                    <a href={urlInput} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{linkText || urlInput}</a>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={handleUrlCancel}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PronunciationEditor
