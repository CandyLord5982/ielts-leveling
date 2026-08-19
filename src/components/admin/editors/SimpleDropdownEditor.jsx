import React, { useState, useEffect, useRef } from 'react'
import {
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Info,
  Upload,
  Image as ImageIcon,
  Link as LinkIcon,
  Music,
  AlignLeft,
  AlignCenter,
  AlignRight
} from 'lucide-react'
import RichTextRenderer from '../../ui/RichTextRenderer'
import { handleRichTextShortcut } from '../../../hooks/useRichTextShortcuts'
import { supabase } from '../../../supabase/client'

const SimpleDropdownEditor = ({ questions, onQuestionsChange, intro, onIntroChange, folderPath }) => {
  const [localQuestions, setLocalQuestions] = useState(questions || [])
  const questionTextareasRef = useRef({})
  const explanationTextareasRef = useRef({})
  const introTextareaRef = useRef(null)
  const introFileInputRef = useRef(null)

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

  useEffect(() => {
    setLocalQuestions(questions || [])
  }, [questions])

  const markdownToHtml = (text) => {
    if (!text) return ''
    let html = text
    html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, url) => `<img src="${url}" alt="${alt || ''}" class="max-w-full h-auto rounded-lg my-2" />`)
    html = html.replace(/<img([^>]*?)>/g, (m, attrs) => `<img${attrs} class="max-w-full h-auto rounded-lg my-2" />`)
    html = html.replace(/<audio([^>]*?)>/g, (m, attrs) => `<audio${attrs} class="w-full my-2"></audio>`)
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, (m, t, url) => `<a href="${url}" target="_blank" rel="noreferrer">${t || url}</a>`)
    return html
  }

  // Parse inline syntax [option1, =option2, option3] into dropdown data
  const parseInlineDropdowns = (text) => {
    const dropdowns = []
    // Strip out HTML tags and markdown images/links before parsing dropdowns
    let cleanText = text
    cleanText = cleanText.replace(/<[^>]+>/g, '')
    cleanText = cleanText.replace(/!\[[^\]]*\]\([^)]*\)/g, '')

    const regex = /\[([^\]]+)\]/g
    let match

    while ((match = regex.exec(cleanText)) !== null) {
      const content = match[1]
      const options = content.split(',').map(opt => opt.trim())

      let correctAnswer = ''
      const cleanOptions = []

      options.forEach(opt => {
        if (opt.startsWith('=')) {
          correctAnswer = opt.substring(1).trim()
          cleanOptions.push(correctAnswer)
        } else {
          cleanOptions.push(opt)
        }
      })

      if (cleanOptions.length > 0) {
        dropdowns.push({
          correct_answer: correctAnswer || cleanOptions[0],
          options: cleanOptions
        })
      }
    }

    return dropdowns
  }

  const insertAtCursor = (index, field, snippet) => {
    // Handle intro (index === -1)
    if (index === -1) {
      const textarea = introTextareaRef.current
      const current = intro || ''

      if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const before = current.slice(0, start)
        const after = current.slice(end)
        const newValue = `${before}${snippet}${after}`
        onIntroChange && onIntroChange(newValue)
        setTimeout(() => {
          try {
            const pos = start + snippet.length
            if (textarea) {
              textarea.focus()
              textarea.setSelectionRange(pos, pos)
            }
          } catch {}
        }, 0)
      } else {
        onIntroChange && onIntroChange(current + (current ? '\n' : '') + snippet)
      }
      return
    }

    // Handle question field
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

  const handleImagePaste = async (e, index) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      const isImage = item.type.startsWith('image/')
      const isAudio = item.type.startsWith('audio/')
      if (!isImage && !isAudio) continue
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) return
      try {
        const ext = file.type.split('/')[1] || (isImage ? 'png' : 'mp3')
        const basePath = folderPath ? `exercise_bank/${folderPath}` : 'exercise_bank'
        const path = `${basePath}/${Date.now()}_${Math.random().toString(36).slice(2)}_pasted.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('exercise-files')
          .upload(path, file, { cacheControl: '3600', upsert: true })
        if (uploadError) throw uploadError
        const { data: publicData } = supabase.storage
          .from('exercise-files')
          .getPublicUrl(path)
        const publicUrl = publicData?.publicUrl
        if (!publicUrl) throw new Error('Cannot get public URL')
        if (isImage) {
          const sizeStyle = getImageSizeStyle()
          insertAtCursor(index, 'question', `<img src="${publicUrl}" alt="" ${sizeStyle} />`)
        } else {
          const audioAttrs = getAudioAttributes()
          insertAtCursor(index, 'question', `<audio src="${publicUrl}" ${audioAttrs}></audio>`)
        }
      } catch (err) {
        console.error('Paste upload failed:', err)
        alert(`Failed to upload pasted ${isImage ? 'image' : 'audio'}`)
      }
      return
    }
  }

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return
    try {
      new URL(urlInput.trim())
      const trimmedUrl = urlInput.trim()
      const idx = urlModal.questionIndex
      if (urlModal.type === 'image') {
        const sizeStyle = getImageSizeStyle()
        insertAtCursor(idx, 'question', `<img src="${trimmedUrl}" alt="" ${sizeStyle} />`)
      } else if (urlModal.type === 'link') {
        const text = linkText.trim() || 'Reference'
        insertAtCursor(idx, 'question', `[${text}](${trimmedUrl})`)
      } else if (urlModal.type === 'audio') {
        const audioAttrs = getAudioAttributes()
        insertAtCursor(idx, 'question', `<audio src="${trimmedUrl}" ${audioAttrs}></audio>`)
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

  const applyAlignment = (index, field, alignment) => {
    // For intro (index === -1)
    if (index === -1) {
      const textarea = introTextareaRef.current
      const current = intro || ''
      if (textarea && typeof textarea.selectionStart === 'number') {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const selected = current.slice(start, end)
        const wrapped = `<div style="text-align: ${alignment}">${selected}</div>`
        const newValue = current.slice(0, start) + wrapped + current.slice(end)
        onIntroChange && onIntroChange(newValue)
        setTimeout(() => {
          textarea.focus()
          const pos = start + wrapped.length
          textarea.setSelectionRange(pos, pos)
        }, 0)
      }
      return
    }
    // For question fields
    const textarea = questionTextareasRef.current[index]
    const current = localQuestions[index]?.[field] || ''
    if (textarea && typeof textarea.selectionStart === 'number') {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selected = current.slice(start, end)
      const wrapped = `<div style="text-align: ${alignment}">${selected}</div>`
      const newValue = current.slice(0, start) + wrapped + current.slice(end)
      updateQuestion(index, field, newValue)
      setTimeout(() => {
        const ta = questionTextareasRef.current[index]
        if (ta) {
          ta.focus()
          const pos = start + wrapped.length
          ta.setSelectionRange(pos, pos)
        }
      }, 0)
    }
  }

  const addQuestion = () => {
    const newQuestion = {
      id: `q${Date.now()}`,
      question: '',
      dropdowns: [],
      explanation: ''
    }
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
    const updatedQuestions = localQuestions.map((q, i) => {
      if (i === index) {
        if (field === 'question') {
          // Auto-parse dropdowns from the question text
          const dropdowns = parseInlineDropdowns(value)
          return { ...q, question: value, dropdowns }
        }
        return { ...q, [field]: value }
      }
      return q
    })
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const moveQuestion = (index, direction) => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === localQuestions.length - 1)
    )
      return

    const newIndex = direction === 'up' ? index - 1 : index + 1
    const updatedQuestions = [...localQuestions]
    const temp = updatedQuestions[index]
    updatedQuestions[index] = updatedQuestions[newIndex]
    updatedQuestions[newIndex] = temp

    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  return (
    <>
    <div className="space-y-6">
      {/* Header with Instructions */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Dropdown Questions</h3>
        </div>
        <button
          type="button"
          onClick={addQuestion}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Question
        </button>
      </div>

      {/* Global Intro Section */}
      <div className="bg-white p-4 border border-gray-200 rounded-lg">
        <div className="flex items-center gap-2 mb-1">
          <label className="text-sm font-medium text-gray-700 mr-auto">Exercise Intro (Optional)</label>
          <input
            ref={introFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const path = `dropdown/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`
                const { error: uploadError } = await supabase.storage
                  .from('exercise-images')
                  .upload(path, file, { cacheControl: '3600', upsert: true })
                if (uploadError) throw uploadError

                const { data: publicData } = supabase.storage
                  .from('exercise-images')
                  .getPublicUrl(path)

                const publicUrl = publicData?.publicUrl
                if (!publicUrl) throw new Error('Cannot get public URL')

                const textarea = introTextareaRef.current
                const current = intro || ''
                if (!textarea) {
                  onIntroChange && onIntroChange(current + (current ? '\n\n' : '') + `![](${publicUrl})`)
                  return
                }
                const start = textarea.selectionStart || 0
                const end = textarea.selectionEnd || 0
                const textToInsert = `\n![](${publicUrl})\n`
                const newValue = current.slice(0, start) + textToInsert + current.slice(end)
                onIntroChange && onIntroChange(newValue)
                setTimeout(() => {
                  textarea.focus()
                  const caret = start + textToInsert.length
                  textarea.setSelectionRange(caret, caret)
                }, 0)
                alert('Image uploaded and inserted into intro!')
              } catch (e) {
                console.error('Image upload failed:', e)
                alert('Image upload failed. Please ensure the bucket "exercise-images" exists and RLS allows uploads.')
              }
            }}
          />
          <button type="button" onClick={() => { const input = introFileInputRef.current; if (input) input.click() }} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
            <Upload className="w-3 h-3" /> Upload
          </button>
          <button type="button" onClick={() => { setUrlModal({ isOpen: true, type: 'image', questionIndex: -1 }); setUrlInput(''); setLinkText(''); setImageSize('medium'); setCustomWidth(''); setCustomHeight('') }} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> Image
          </button>
          <button type="button" onClick={() => { setUrlModal({ isOpen: true, type: 'audio', questionIndex: -1 }); setUrlInput(''); setLinkText(''); setImageSize('medium'); setCustomWidth(''); setCustomHeight(''); setAudioControls(true); setAudioAutoplay(false); setAudioLoop(false); setAudioPlaybackRate(1) }} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
            <Music className="w-3 h-3" /> Audio
          </button>
          <button type="button" onClick={() => { setUrlModal({ isOpen: true, type: 'link', questionIndex: -1 }); setUrlInput(''); setLinkText('Reference') }} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
            <LinkIcon className="w-3 h-3" /> Link
          </button>
          <div className="flex gap-1 ml-2 border-l pl-2 border-gray-300">
            <button type="button" onClick={() => applyAlignment(-1, 'intro', 'left')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align left"><AlignLeft className="w-3 h-3" /></button>
            <button type="button" onClick={() => applyAlignment(-1, 'intro', 'center')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align center"><AlignCenter className="w-3 h-3" /></button>
            <button type="button" onClick={() => applyAlignment(-1, 'intro', 'right')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align right"><AlignRight className="w-3 h-3" /></button>
          </div>
        </div>
        <textarea
          ref={introTextareaRef}
          value={intro || ''}
          onChange={(e) => onIntroChange && onIntroChange(e.target.value)}
          onKeyDown={(e) => handleRichTextShortcut(e, introTextareaRef.current, intro || '', (v) => onIntroChange && onIntroChange(v))}
          onPaste={(e) => handleImagePaste(e, -1)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          rows={2}
          placeholder="Enter introductory text for the dropdown exercise..."
        />

        {intro && intro.trim() && (
          <div className="mt-3 p-3 bg-white border rounded-lg">
            <div className="text-xs text-gray-500 mb-2">Intro Preview</div>
            <RichTextRenderer
              content={markdownToHtml(intro)}
              allowImages
              allowLinks
              className="prose max-w-none"
              style={{ whiteSpace: 'pre-wrap' }}
            />
          </div>
        )}
      </div>

      {/* Questions */}
      {localQuestions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500">No questions yet. Click "Add Question" to create one.</p>
        </div>
      ) : (
        localQuestions.map((question, qIndex) => (
          <div key={question.id} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            {/* Question Header */}
            <div className="flex items-center gap-2">
              <h4 className="text-md font-medium text-gray-800 mr-auto">Question {qIndex + 1}</h4>
              <button type="button" onClick={() => handlePasteImageUrl(qIndex)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                <ImageIcon className="w-3 h-3" /> Image
              </button>
              <button type="button" onClick={() => handleInsertAudio(qIndex)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                <Music className="w-3 h-3" /> Audio
              </button>
              <button type="button" onClick={() => handleInsertLink(qIndex)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                <LinkIcon className="w-3 h-3" /> Link
              </button>
              <div className="flex gap-1 ml-2 border-l pl-2 border-gray-300">
                <button type="button" onClick={() => applyAlignment(qIndex, 'question', 'left')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align left"><AlignLeft className="w-3 h-3" /></button>
                <button type="button" onClick={() => applyAlignment(qIndex, 'question', 'center')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align center"><AlignCenter className="w-3 h-3" /></button>
                <button type="button" onClick={() => applyAlignment(qIndex, 'question', 'right')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align right"><AlignRight className="w-3 h-3" /></button>
              </div>
              <div className="flex gap-1 ml-2 border-l pl-2 border-gray-300">
                <button type="button" onClick={() => moveQuestion(qIndex, 'up')} disabled={qIndex === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Move up"><ChevronUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => moveQuestion(qIndex, 'down')} disabled={qIndex === localQuestions.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Move down"><ChevronDown className="w-4 h-4" /></button>
                <button type="button" onClick={() => duplicateQuestion(qIndex)} className="p-1 text-gray-400 hover:text-blue-600" title="Duplicate"><Copy className="w-4 h-4" /></button>
                <button type="button" onClick={() => removeQuestion(qIndex)} className="p-1 text-gray-400 hover:text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Question Text */}
            <div>
              <textarea
                ref={(el) => { questionTextareasRef.current[qIndex] = el }}
                value={question.question}
                onChange={(e) => updateQuestion(qIndex, 'question', e.target.value)}
                onKeyDown={(e) => handleRichTextShortcut(e, questionTextareasRef.current[qIndex], question.question, (v) => updateQuestion(qIndex, 'question', v))}
                onPaste={(e) => handleImagePaste(e, qIndex)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                rows={4}
                placeholder="Example: The cat [sat, =sits, sitting] on the mat."
              />
            </div>

            {/* Preview Detected Dropdowns */}
            {question.dropdowns && question.dropdowns.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm font-medium text-green-800 mb-2">
                  Detected {question.dropdowns.length} dropdown{question.dropdowns.length !== 1 ? 's' : ''}:
                </p>
                <div className="space-y-2">
                  {question.dropdowns.map((dropdown, dIndex) => (
                    <div key={dIndex} className="text-xs bg-white rounded p-2 border border-green-200">
                      <span className="font-medium text-green-700">Dropdown {dIndex + 1}:</span>
                      <div className="mt-1">
                        <span className="text-gray-600">Options: </span>
                        {dropdown.options.map((opt, oIndex) => (
                          <span
                            key={oIndex}
                            className={`inline-block px-2 py-0.5 rounded mr-1 ${
                              opt === dropdown.correct_answer
                                ? 'bg-green-100 text-green-800 font-semibold'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {opt === dropdown.correct_answer ? `✓ ${opt}` : opt}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Explanation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Explanation (Optional)
              </label>
              <textarea
                ref={(el) => { explanationTextareasRef.current[qIndex] = el }}
                value={question.explanation}
                onChange={(e) => updateQuestion(qIndex, 'explanation', e.target.value)}
                onKeyDown={(e) => handleRichTextShortcut(e, explanationTextareasRef.current[qIndex], question.explanation, (v) => updateQuestion(qIndex, 'explanation', v))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={2}
                placeholder="Explain the correct answer..."
              />
            </div>
          </div>
        ))
      )}
    </div>

    {/* URL Modal for Image/Audio/Link */}
    {urlModal.isOpen && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">{urlModal.type === 'image' ? 'Insert Image' : urlModal.type === 'audio' ? 'Insert Audio' : 'Insert Link'}</h3>
            <button onClick={handleUrlCancel} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder={urlModal.type === 'image' ? 'https://example.com/image.jpg' : urlModal.type === 'audio' ? 'https://example.com/audio.mp3' : 'https://example.com/link'} />
            </div>
            {urlModal.type === 'link' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display text (optional)</label>
                <input type="text" value={linkText} onChange={(e) => setLinkText(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Reference" />
              </div>
            )}
            {urlModal.type === 'image' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Image size</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {[
                    { value: 'small', label: 'Small (200px)' },
                    { value: 'medium', label: 'Medium (400px)' },
                    { value: 'large', label: 'Large (600px)' },
                    { value: 'full', label: 'Full width' }
                  ].map(s => (
                    <button key={s.value} type="button" onClick={() => setImageSize(s.value)} className={`p-2 rounded border text-sm ${imageSize === s.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 hover:border-gray-400'}`}>{s.label}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Width (px)</label>
                    <input type="number" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" placeholder="400" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Height (px)</label>
                    <input type="number" value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" placeholder="300" />
                  </div>
                </div>
              </div>
            )}
            {urlModal.type === 'audio' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Audio options</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={audioControls} onChange={(e) => setAudioControls(e.target.checked)} /> Show controls</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={audioAutoplay} onChange={(e) => setAudioAutoplay(e.target.checked)} /> Autoplay</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={audioLoop} onChange={(e) => setAudioLoop(e.target.checked)} /> Loop</label>
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
            <button type="button" onClick={handleUrlCancel} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
            <button type="button" onClick={handleUrlSubmit} disabled={!urlInput.trim()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">Insert</button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

export default SimpleDropdownEditor