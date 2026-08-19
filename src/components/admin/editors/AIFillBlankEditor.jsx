import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Wand2, Eye, EyeOff, HelpCircle, Brain, Image as ImageIcon, Music, Link as LinkIcon, X, Upload, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import RichTextRenderer from '../../ui/RichTextRenderer'
import { handleRichTextShortcut } from '../../../hooks/useRichTextShortcuts'
import { supabase } from '../../../supabase/client'

const AIFillBlankEditor = ({ questions, onQuestionsChange, intro, onIntroChange, language, onLanguageChange, folderPath }) => {
  const [localQuestions, setLocalQuestions] = useState([])
  const introTextareaRef = useRef(null)
  const introFileInputRef = useRef(null)
  const questionTextareasRef = useRef({})
  const [previewMode, setPreviewMode] = useState({})
  const [bulkImportMode, setBulkImportMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
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

  const normalizeQuestion = (q, idx = 0) => {
    return {
      id: q?.id || `q${Date.now()}_${idx}`,
      question: q?.question || '',
      expected_answers: q?.expected_answers || [],
      ai_prompt: q?.ai_prompt || '',
      explanation: q?.explanation || '',
      settings: q?.settings || {
        min_score: 70,
        allow_partial_credit: true,
        max_attempts: 3
      }
    }
  }

  const addQuestion = () => {
    const newQuestion = {
      id: `q${Date.now()}`,
      question: '',
      expected_answers: [],
      ai_prompt: '',
      explanation: '',
      settings: {
        min_score: 70,
        allow_partial_credit: true,
        max_attempts: 3
      }
    }
    const updatedQuestions = [...localQuestions, newQuestion]
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const updateQuestion = (index, field, value) => {
    const updatedQuestions = [...localQuestions]
    updatedQuestions[index] = {
      ...updatedQuestions[index],
      [field]: value
    }
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const appendToField = (index, field, snippet) => {
    // Handle intro (index === -1)
    if (index === -1) {
      const textarea = introTextareaRef.current
      const current = intro || ''
      if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = `${current.slice(0, start)}${snippet}${current.slice(end)}`
        onIntroChange && onIntroChange(newValue)
        setTimeout(() => {
          try {
            const pos = start + snippet.length
            if (textarea) { textarea.focus(); textarea.setSelectionRange(pos, pos) }
          } catch {}
        }, 0)
      } else {
        onIntroChange && onIntroChange(current + (current ? '\n' : '') + snippet)
      }
      return
    }
    const current = (localQuestions[index]?.[field]) || ''
    updateQuestion(index, field, (current + (current ? '\n' : '') + snippet).trim())
  }

  const openUrlModal = (index, type) => {
    setUrlModal({ isOpen: true, type, questionIndex: index })
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
    const isIntro = index === -1
    const textarea = isIntro ? introTextareaRef.current : questionTextareasRef.current[index]
    const current = isIntro ? (intro || '') : (localQuestions[index]?.[field] || '')
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = current.slice(start, end)
    const wrapped = `<div style="text-align: ${alignment}">${selected}</div>`
    const newValue = current.slice(0, start) + wrapped + current.slice(end)
    if (isIntro) {
      onIntroChange && onIntroChange(newValue)
    } else {
      updateQuestion(index, field, newValue)
    }
    setTimeout(() => {
      textarea.focus()
      const pos = start + wrapped.length
      textarea.setSelectionRange(pos, pos)
    }, 0)
  }

  const handleInsertImage = (index) => openUrlModal(index, 'image')
  const handleInsertAudio = (index) => openUrlModal(index, 'audio')
  const handleInsertLink = (index) => openUrlModal(index, 'link')

  const getImageSizeStyle = () => {
    if (imageSize === 'custom') {
      const w = customWidth ? `width="${customWidth}"` : ''
      const h = customHeight ? `height="${customHeight}"` : ''
      return `${w} ${h}`.trim()
    }
    const sizeMap = { small: 'width="200"', medium: 'width="400"', large: 'width="600"', full: 'width="100%"' }
    return sizeMap[imageSize] || sizeMap.medium
  }

  const getAudioAttributes = () => {
    const attrs = []
    if (audioControls) attrs.push('controls')
    if (audioAutoplay) attrs.push('autoplay')
    if (audioLoop) attrs.push('loop')
    if (audioPlaybackRate && audioPlaybackRate !== 1) attrs.push(`data-playback-rate="${audioPlaybackRate}"`)
    return attrs.join(' ')
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
          appendToField(index, 'question', `<img src="${publicUrl}" alt="" ${sizeStyle} />`)
        } else {
          const audioAttrs = getAudioAttributes()
          appendToField(index, 'question', `<audio src="${publicUrl}" ${audioAttrs}></audio>`)
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
      if (urlModal.type === 'image') {
        const sizeStyle = getImageSizeStyle()
        appendToField(urlModal.questionIndex, 'question', `<img src="${trimmedUrl}" alt="" ${sizeStyle} />`)
      } else if (urlModal.type === 'audio') {
        const audioAttrs = getAudioAttributes()
        appendToField(urlModal.questionIndex, 'question', `<audio src="${trimmedUrl}" ${audioAttrs}></audio>`)
      } else if (urlModal.type === 'link') {
        const text = linkText.trim() || trimmedUrl
        appendToField(urlModal.questionIndex, 'question', `<a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`)
      }
      handleUrlCancel()
    } catch {
      // invalid URL — do nothing, user can fix the input
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

  const addExpectedAnswer = (questionIndex) => {
    const updatedQuestions = [...localQuestions]
    if (!updatedQuestions[questionIndex].expected_answers) {
      updatedQuestions[questionIndex].expected_answers = []
    }
    updatedQuestions[questionIndex].expected_answers.push('')
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const updateExpectedAnswer = (questionIndex, answerIndex, value) => {
    const updatedQuestions = [...localQuestions]
    updatedQuestions[questionIndex].expected_answers[answerIndex] = value
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const removeExpectedAnswer = (questionIndex, answerIndex) => {
    const updatedQuestions = [...localQuestions]
    updatedQuestions[questionIndex].expected_answers.splice(answerIndex, 1)
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const removeQuestion = (index) => {
    const updatedQuestions = localQuestions.filter((_, i) => i !== index)
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const togglePreview = (index) => {
    setPreviewMode(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  const generateAIPrompt = (questionIndex) => {
    const question = localQuestions[questionIndex]
    const prompt = `Đánh giá câu trả lời điền vào chỗ trống cho câu hỏi: "${question.question}"

Đáp án mong đợi: ${question.expected_answers.join(', ')}

Yêu cầu đánh giá:
1. Điểm số từ 0-100 dựa trên độ chính xác và sự hiểu biết
2. Mức độ tin cậy từ 0-100
3. Giải thích CHI TIẾT (2-4 câu) bao gồm:
   - Tại sao câu trả lời đúng/sai
   - So sánh với đáp án đúng
   - Điểm mạnh hoặc điểm cần cải thiện
   - Gợi ý học tập (nếu câu trả lời không hoàn hảo)

Tiêu chí chấm điểm:
- Khớp chính xác: 100 điểm
- Khớp một phần: 50-90 điểm (dựa vào mức độ tương đồng)
- Hiểu khái niệm đúng: được khen thưởng
- Lỗi chính tả/ngữ pháp nhỏ: không bị phạt nặng
- Hoàn toàn sai: 0-30 điểm

Trả lời bằng tiếng Việt với giải thích chi tiết, khuyến khích học sinh.`

    updateQuestion(questionIndex, 'ai_prompt', prompt)
  }

  const processBulkImport = () => {
    try {
      // Detect separated Q&A format: numbered questions on top, numbered answers on bottom
      const allBulkLines = bulkText.split('\n')
      const numberedEntries = []
      allBulkLines.forEach((line, idx) => {
        const m = line.trim().match(/^(\d+)[.)]\s+(.+)/)
        if (m) numberedEntries.push({ num: parseInt(m[1]), text: m[2].trim(), lineIdx: idx })
      })

      const numCounts = {}
      numberedEntries.forEach(e => { numCounts[e.num] = (numCounts[e.num] || 0) + 1 })
      const hasRepeatedNums = Object.values(numCounts).some(c => c >= 2)

      if (hasRepeatedNums && numberedEntries.length >= 4) {
        const seen = new Set()
        let splitIdx = -1
        for (let i = 0; i < numberedEntries.length; i++) {
          if (seen.has(numberedEntries[i].num)) {
            splitIdx = i
            break
          }
          seen.add(numberedEntries[i].num)
        }

        const qEntries = numberedEntries.slice(0, splitIdx)
        const aEntries = numberedEntries.slice(splitIdx)
        const answerMap = {}
        aEntries.forEach(a => { answerMap[a.num] = a.text })

        // Collect intro (lines before the first question)
        const firstQLineIdx = qEntries[0].lineIdx
        const introText = allBulkLines.slice(0, firstQLineIdx)
          .map(l => l.trim()).filter(l => l && !/^_{3,}$/.test(l)).join('\n')

        const separatedQuestions = qEntries.map((q, i) => {
          const answerText = answerMap[q.num] || ''
          const answers = answerText.split(/[|/]/).map(a => a.trim()).filter(a => a)
          return {
            id: `q${Date.now()}_${i}`,
            question: q.text,
            expected_answers: answers.length > 0 ? answers : [answerText],
            ai_prompt: '',
            explanation: '',
            settings: {
              min_score: 70,
              allow_partial_credit: true,
              max_attempts: 3
            }
          }
        })

        if (introText && onIntroChange) {
          onIntroChange(intro ? intro + '\n' + introText : introText)
        }

        // Auto-generate AI prompts
        const questionsWithPrompts = separatedQuestions.map(q => ({
          ...q,
          ai_prompt: `Đánh giá câu trả lời điền vào chỗ trống cho câu hỏi: "${q.question}"

Đáp án mong đợi: ${q.expected_answers.join(', ')}

Yêu cầu đánh giá:
1. Điểm số từ 0-100 dựa trên độ chính xác và sự hiểu biết
2. Mức độ tin cậy từ 0-100
3. Giải thích CHI TIẾT (2-4 câu) bao gồm:
   - Tại sao câu trả lời đúng/sai
   - So sánh với đáp án đúng
   - Điểm mạnh hoặc điểm cần cải thiện
   - Gợi ý học tập (nếu câu trả lời không hoàn hảo)

Tiêu chí chấm điểm:
- Khớp chính xác: 100 điểm
- Khớp một phần: 50-90 điểm (dựa vào mức độ tương đồng)
- Hiểu khái niệm đúng: được khen thưởng
- Lỗi chính tả/ngữ pháp nhỏ: không bị phạt nặng
- Hoàn toàn sai: 0-30 điểm

Trả lời bằng tiếng Việt với giải thích chi tiết, khuyến khích học sinh.`
        }))

        const updatedQuestions = [...localQuestions, ...questionsWithPrompts]
        setLocalQuestions(updatedQuestions)
        onQuestionsChange(updatedQuestions)
        setBulkText('')
        setBulkImportMode(false)
        alert(`Successfully imported ${separatedQuestions.length} questions!`)
        return
      }

      const lines = bulkText.split('\n').filter(line => line.trim())
      const newQuestions = []

      let questionCounter = 0
      let currentInstruction = ''
      let accumulatedText = []
      let introLines = []
      let firstQuestionSeen = false

      const processAccumulatedQuestion = () => {
        if (accumulatedText.length === 0) return

        const fullText = accumulatedText.join('\n')

        // Look for expected answers in [answer1|answer2|answer3] format
        const answerMatches = [...fullText.matchAll(/\[([^\]]+)\]/g)]

        if (answerMatches.length === 0) {
          accumulatedText = []
          return
        }

        // Extract all answers (the brackets contain ONLY the expected answers)
        const expectedAnswers = []
        answerMatches.forEach((m) => {
          const answer = m[1]
          const answers = answer.split(/[|/]/).map(a => a.trim()).filter(a => a)
          expectedAnswers.push(...answers)
        })

        // Remove brackets and their content to get the question text
        const displayText = fullText.replace(/\[([^\]]+)\]/g, '')

        if (expectedAnswers.length > 0) {
          const question = {
            id: `q${Date.now()}_${questionCounter++}`,
            question: currentInstruction ? `${currentInstruction}\n\n${displayText}` : displayText,
            expected_answers: expectedAnswers,
            ai_prompt: '',
            explanation: '',
            settings: {
              min_score: 70,
              allow_partial_credit: true,
              max_attempts: 3
            }
          }
          newQuestions.push(question)
        }

        accumulatedText = []
      }

      lines.forEach((line) => {
        const trimmedLine = line.trim()

        const isQuestion = trimmedLine.match(/^\d+\.?\s+/) || trimmedLine.match(/^Q(?:uest(?:ion)?)?\s*\d+[.:)]?\s*/i)
        const isInstruction = trimmedLine.match(/^[A-Z]\.\s+/)

        // Before first numbered question appears, collect into intro
        if (!firstQuestionSeen && !isQuestion && !isInstruction) {
          introLines.push(trimmedLine)
          return
        }
        firstQuestionSeen = true

        // Check if this is an instruction line (starts with letter and period)
        if (isInstruction) {
          processAccumulatedQuestion()
          currentInstruction = trimmedLine
        }
        // Check if this line looks like a new numbered question
        else if (isQuestion) {
          processAccumulatedQuestion()
          accumulatedText.push(trimmedLine)
        }
        // Regular line - add to accumulated text
        else {
          accumulatedText.push(trimmedLine)
        }
      })

      // Process the last accumulated question
      processAccumulatedQuestion()

      if (newQuestions.length > 0) {
        // Set intro from lines that appeared before the first question
        if (introLines.length > 0 && onIntroChange) {
          const newIntro = introLines.join('\n')
          onIntroChange(intro ? intro + '\n' + newIntro : newIntro)
        }
        // Auto-generate AI prompts for imported questions
        const questionsWithPrompts = newQuestions.map(q => ({
          ...q,
          ai_prompt: `Đánh giá câu trả lời điền vào chỗ trống cho câu hỏi: "${q.question}"

Đáp án mong đợi: ${q.expected_answers.join(', ')}

Yêu cầu đánh giá:
1. Điểm số từ 0-100 dựa trên độ chính xác và sự hiểu biết
2. Mức độ tin cậy từ 0-100
3. Giải thích CHI TIẾT (2-4 câu) bao gồm:
   - Tại sao câu trả lời đúng/sai
   - So sánh với đáp án đúng
   - Điểm mạnh hoặc điểm cần cải thiện
   - Gợi ý học tập (nếu câu trả lời không hoàn hảo)

Tiêu chí chấm điểm:
- Khớp chính xác: 100 điểm
- Khớp một phần: 50-90 điểm (dựa vào mức độ tương đồng)
- Hiểu khái niệm đúng: được khen thưởng
- Lỗi chính tả/ngữ pháp nhỏ: không bị phạt nặng
- Hoàn toàn sai: 0-30 điểm

Trả lời bằng tiếng Việt với giải thích chi tiết, khuyến khích học sinh.`
        }))
        const updatedQuestions = [...localQuestions, ...questionsWithPrompts]
        setLocalQuestions(updatedQuestions)
        onQuestionsChange(updatedQuestions)
        setBulkText('')
        setBulkImportMode(false)
        alert(`Successfully imported ${newQuestions.length} questions!`)
      } else {
        alert('No valid questions found. Please check your format.')
      }
    } catch (error) {
      alert('Error processing bulk import. Please check your format.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        {onLanguageChange && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">AI Language</label>
            <select
              value={language || 'en'}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setBulkImportMode(!bulkImportMode)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Bulk
          </button>
          <button
            type="button"
            onClick={addQuestion}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      {/* Exercise Intro Section */}
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
                const path = `ai_fill_blank/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`
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
              } catch (err) {
                console.error('Image upload failed:', err)
                alert('Image upload failed. Please ensure the bucket "exercise-images" exists and RLS allows uploads.')
              }
            }}
          />
          <button type="button" onClick={() => { const input = introFileInputRef.current; if (input) input.click() }} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
            <Upload className="w-3 h-3" /> Upload
          </button>
          <button type="button" onClick={() => openUrlModal(-1, 'image')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> Image
          </button>
          <button type="button" onClick={() => openUrlModal(-1, 'audio')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
            <Music className="w-3 h-3" /> Audio
          </button>
          <button type="button" onClick={() => openUrlModal(-1, 'link')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
            <LinkIcon className="w-3 h-3" /> Link
          </button>
          <div className="flex gap-1 ml-2 border-l pl-2 border-gray-300">
            <button type="button" onClick={() => applyAlignment(-1, 'question', 'left')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align left"><AlignLeft className="w-3 h-3" /></button>
            <button type="button" onClick={() => applyAlignment(-1, 'question', 'center')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align center"><AlignCenter className="w-3 h-3" /></button>
            <button type="button" onClick={() => applyAlignment(-1, 'question', 'right')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align right"><AlignRight className="w-3 h-3" /></button>
          </div>
        </div>
        <textarea
          ref={introTextareaRef}
          value={intro || ''}
          onChange={(e) => onIntroChange && onIntroChange(e.target.value)}
          onKeyDown={(e) => handleRichTextShortcut(e, introTextareaRef.current, intro || '', (v) => onIntroChange && onIntroChange(v))}
          onPaste={(e) => handleImagePaste(e, -1)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          rows={2}
          placeholder="Enter introductory text for the AI fill-in-the-blank exercise..."
        />

        {intro && intro.trim() && (
          <div className="mt-3 p-3 bg-white border rounded-lg">
            <div className="text-xs text-gray-500 mb-2">Intro Preview</div>
            <RichTextRenderer
              content={intro}
              allowImages
              allowLinks
              className="prose max-w-none"
              style={{ whiteSpace: 'pre-wrap' }}
            />
          </div>
        )}
      </div>

      {/* Bulk Import Mode */}
      {bulkImportMode && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">Bulk Import AI Fill-in-the-Blank Questions</h4>
          <p className="text-sm text-blue-700 mb-3">
            Format: Place expected answers in brackets [answer1|answer2|answer3]
            <br />
            The brackets contain ONLY the expected answers. They will be removed from the question text shown to students.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="w-full p-3 border border-blue-300 rounded-lg h-40 font-mono text-sm"
            placeholder={`A. Write about your weekend activities.

1. Describe what you did last Saturday. [went to the beach|visited the beach|was at the beach]

2. What food did you enjoy? [ate seafood|had seafood|enjoyed seafood]

B. Combine these sentences using a relative clause.

1. Friendly People is a comedy. It's my favourite programme. [Friendly People, which is my favourite programme, is a comedy.|Friendly People, which is a comedy, is my favourite programme.]`}
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              onClick={() => setBulkImportMode(false)}
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
        {localQuestions.length === 0 && !bulkImportMode ? (
          <div className="text-center py-8 text-gray-500">
            <Brain className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No AI fill-in-the-blank questions yet. Click "Bulk Import" or "Add Question" to start!</p>
          </div>
        ) : localQuestions.length > 0 ? (
          localQuestions.map((question, index) => (
            <div key={question.id} className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <h4 className="text-lg font-medium text-gray-900 mr-auto">
                  Question {index + 1}
                </h4>
                {!previewMode[index] && (
                  <>
                    <button type="button" onClick={() => handleInsertImage(index)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" /> Image
                    </button>
                    <button type="button" onClick={() => handleInsertAudio(index)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                      <Music className="w-3 h-3" /> Audio
                    </button>
                    <button type="button" onClick={() => handleInsertLink(index)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" /> Link
                    </button>
                    <div className="flex gap-1 ml-2 border-l pl-2 border-gray-300">
                      <button type="button" onClick={() => applyAlignment(index, 'question', 'left')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align left"><AlignLeft className="w-3 h-3" /></button>
                      <button type="button" onClick={() => applyAlignment(index, 'question', 'center')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align center"><AlignCenter className="w-3 h-3" /></button>
                      <button type="button" onClick={() => applyAlignment(index, 'question', 'right')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align right"><AlignRight className="w-3 h-3" /></button>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => togglePreview(index)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                >
                  {previewMode[index] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {previewMode[index] ? 'Hide' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={() => removeQuestion(index)}
                  className="p-1 text-red-600 hover:text-red-800"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {previewMode[index] ? (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h5 className="font-medium text-gray-900 mb-2">Preview:</h5>
                  <div className="space-y-3">
                    <p className="text-gray-700">{question.question}</p>
                    <div className="bg-white p-3 border rounded">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Your Answer:
                      </label>
                      <textarea
                        placeholder="Type your answer here..."
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        rows={2}
                        disabled
                      />
                    </div>
                    <div className="text-sm text-gray-600">
                      <strong>Expected answers:</strong> {question.expected_answers.join(', ')}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Question Text */}
                  <div>
                    <textarea
                      ref={(el) => { questionTextareasRef.current[index] = el }}
                      value={question.question}
                      onChange={(e) => updateQuestion(index, 'question', e.target.value)}
                      onKeyDown={(e) => handleRichTextShortcut(e, questionTextareasRef.current[index], question.question, (v) => updateQuestion(index, 'question', v))}
                      onPaste={(e) => handleImagePaste(e, index)}
                      placeholder="Enter your fill-in-the-blank question here..."
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      rows={3}
                    />
                  </div>

                  {/* Expected Answers */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Expected Answers
                      </label>
                      <button
                        type="button"
                        onClick={() => addExpectedAnswer(index)}
                        className="flex items-center gap-1 px-2 py-1 text-sm text-purple-600 hover:text-purple-800"
                      >
                        <Plus className="w-3 h-3" />
                        Add Answer
                      </button>
                    </div>
                    <div className="space-y-2">
                      {question.expected_answers.map((answer, answerIndex) => (
                        <div key={answerIndex} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={answer}
                            onChange={(e) => updateExpectedAnswer(index, answerIndex, e.target.value)}
                            placeholder="Expected answer..."
                            className="flex-1 p-2 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeExpectedAnswer(index, answerIndex)}
                            className="p-1 text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        AI Scoring Prompt
                      </label>
                      <button
                        type="button"
                        onClick={() => generateAIPrompt(index)}
                        className="flex items-center gap-1 px-2 py-1 text-sm text-purple-600 hover:text-purple-800"
                      >
                        <Wand2 className="w-3 h-3" />
                        Generate
                      </button>
                    </div>
                    <textarea
                      value={question.ai_prompt}
                      onChange={(e) => updateQuestion(index, 'ai_prompt', e.target.value)}
                      placeholder="Custom AI prompt for scoring this question..."
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      rows={4}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Customize how AI should score this question. Leave empty for default behavior.
                    </p>
                  </div>

                  {/* Settings */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Minimum Score (0-100)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={question.settings.min_score}
                        onChange={(e) => updateQuestion(index, 'settings', {
                          ...question.settings,
                          min_score: parseInt(e.target.value) || 70
                        })}
                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max Attempts
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={question.settings.max_attempts}
                        onChange={(e) => updateQuestion(index, 'settings', {
                          ...question.settings,
                          max_attempts: parseInt(e.target.value) || 3
                        })}
                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                    <div className="flex items-center">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={question.settings.allow_partial_credit}
                          onChange={(e) => updateQuestion(index, 'settings', {
                            ...question.settings,
                            allow_partial_credit: e.target.checked
                          })}
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-700">Allow Partial Credit</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : null}
      </div>

      {/* URL Insert Modal */}
      {urlModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {urlModal.type === 'image' ? 'Thêm hình ảnh' :
                 urlModal.type === 'audio' ? 'Thêm âm thanh' : 'Thêm liên kết'}
              </h3>
              <button onClick={handleUrlCancel} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder={
                    urlModal.type === 'image' ? 'https://example.com/image.jpg' :
                    urlModal.type === 'audio' ? 'https://example.com/audio.mp3' :
                    'https://example.com/link'
                  }
                  autoFocus
                />
              </div>

              {urlModal.type === 'link' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Text hiển thị (tùy chọn)</label>
                  <input
                    type="text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="Link text"
                  />
                </div>
              )}

              {urlModal.type === 'image' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Kích thước hình ảnh</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'small', label: 'Nhỏ (200px)' },
                      { value: 'medium', label: 'Trung bình (400px)' },
                      { value: 'large', label: 'Lớn (600px)' },
                      { value: 'full', label: 'Toàn màn hình' }
                    ].map((size) => (
                      <button
                        key={size.value}
                        type="button"
                        onClick={() => setImageSize(size.value)}
                        className={`p-2 rounded-lg border text-sm transition-colors ${
                          imageSize === size.value
                            ? 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {size.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="aiCustomSize"
                      checked={imageSize === 'custom'}
                      onChange={(e) => setImageSize(e.target.checked ? 'custom' : 'medium')}
                      className="rounded"
                    />
                    <label htmlFor="aiCustomSize" className="text-sm text-gray-700">Kích thước tùy chỉnh</label>
                  </div>
                  {imageSize === 'custom' && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Chiều rộng (px)</label>
                        <input type="number" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-lg text-sm" placeholder="400" min="50" max="1200" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Chiều cao (px)</label>
                        <input type="number" value={customHeight} onChange={(e) => setCustomHeight(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-lg text-sm" placeholder="300" min="50" max="800" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {urlModal.type === 'audio' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tùy chọn âm thanh</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={audioControls} onChange={(e) => setAudioControls(e.target.checked)} className="rounded" />
                      <span className="text-sm text-gray-700">Hiển thị controls (play/pause/volume)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={audioAutoplay} onChange={(e) => setAudioAutoplay(e.target.checked)} className="rounded" />
                      <span className="text-sm text-gray-700">Tự động phát (autoplay)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={audioLoop} onChange={(e) => setAudioLoop(e.target.checked)} className="rounded" />
                      <span className="text-sm text-gray-700">Lặp lại (loop)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-gray-700">Tốc độ phát:</span>
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
                </div>
              )}

              {/* Preview */}
              {urlInput && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">Preview:</p>
                  {urlModal.type === 'image' ? (
                    <div>
                      <img src={urlInput} alt="Preview"
                        className="max-w-full object-contain rounded border"
                        style={{
                          width: imageSize === 'custom' && customWidth ? `${customWidth}px` :
                                 imageSize === 'small' ? '200px' :
                                 imageSize === 'large' ? '600px' :
                                 imageSize === 'full' ? '100%' : '400px',
                          height: imageSize === 'custom' && customHeight ? `${customHeight}px` : 'auto',
                          maxHeight: '200px'
                        }}
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    </div>
                  ) : urlModal.type === 'audio' ? (
                    <audio ref={(el) => { if (el) el.playbackRate = audioPlaybackRate }} src={urlInput} controls={audioControls} loop={audioLoop} className="w-full"
                      onError={(e) => { e.target.style.display = 'none' }} />
                  ) : (
                    <a href={urlInput} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                      {linkText || urlInput}
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={handleUrlCancel}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">
                Hủy
              </button>
              <button type="button" onClick={handleUrlSubmit} disabled={!urlInput.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400">
                {urlModal.type === 'image' ? 'Thêm hình ảnh' :
                 urlModal.type === 'audio' ? 'Thêm âm thanh' : 'Thêm liên kết'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AIFillBlankEditor
