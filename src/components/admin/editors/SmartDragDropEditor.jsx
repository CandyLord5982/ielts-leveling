import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Eye, EyeOff, HelpCircle, Upload, Copy, Image as ImageIcon, Link as LinkIcon, Music, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { handleRichTextShortcut } from '../../../hooks/useRichTextShortcuts'
import { supabase } from '../../../supabase/client'
import RichTextRenderer from '../../ui/RichTextRenderer'

// Convert simple markdown/HTML to safe HTML for preview
const markdownToHtml = (text) => {
  if (!text) return ''
  let html = text
  // Images markdown ![](url)
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, url) => `<img src="${url}" alt="${alt || ''}" class="max-w-full h-auto rounded-lg my-2" />`)
  // Preserve HTML <img> adding styling
  html = html.replace(/<img([^>]*?)>/g, (m, attrs) => `<img${attrs} class="max-w-full h-auto rounded-lg my-2" />`)
  // Preserve HTML <audio>
  html = html.replace(/<audio([^>]*?)>/g, (m, attrs) => `<audio${attrs} class="w-full my-2"></audio>`)
  // Links [text](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, (m, t, url) => `<a href="${url}" target="_blank" rel="noreferrer">${t || url}</a>`)
  return html
}

// Render question text with HTML content and drop zones
const renderQuestionWithDropZones = (questionText, dropZones, renderDropZone) => {
  const parts = questionText.split(/\[DROP_ZONE_(\w+)\]/)
  return parts.map((part, index) => {
    if (index % 2 === 0) {
      // This is regular text - render with HTML support
      const htmlContent = markdownToHtml(part)
      return (
        <span
          key={index}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      )
    } else {
      // This is a drop zone ID
      const zoneId = part
      return renderDropZone(zoneId, index)
    }
  })
}

const SmartDragDropEditor = ({ questions, onQuestionsChange, intro, onIntroChange, folderPath }) => {
  const [localQuestions, setLocalQuestions] = useState([])
  const [previewMode, setPreviewMode] = useState(false)
  const [bulkImportMode, setBulkImportMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [lastBulkText, setLastBulkText] = useState('')
  const [urlModal, setUrlModal] = useState({ isOpen: false, type: '', questionIndex: -1 })
  const [urlInput, setUrlInput] = useState('')
  const [linkText, setLinkText] = useState('')
  const [imageSize, setImageSize] = useState('medium')
  const [customWidth, setCustomWidth] = useState('')
  const [customHeight, setCustomHeight] = useState('')
  const [audioControls, setAudioControls] = useState(true)
  const [audioAutoplay, setAudioAutoplay] = useState(false)
  const [audioLoop, setAudioLoop] = useState(false)
  const [audioMaxPlays, setAudioMaxPlays] = useState(0)
  const [audioPlaybackRate, setAudioPlaybackRate] = useState(1)
  const questionTextareasRef = useRef({})
  const explanationTextareasRef = useRef({})
  const introTextareaRef = useRef(null)
  const introFileInputRef = useRef(null)
  const savedCursorPos = useRef({ start: 0, end: 0 })

  useEffect(() => {
    try {
      const saved = localStorage.getItem('xpclass_last_bulk_text_drag_drop')
      if (saved) setLastBulkText(saved)
    } catch {}
  }, [])

  useEffect(() => {
    setLocalQuestions(questions || [])
  }, [questions])

  // Parse phrase and extract dragable words
  const parsePhrase = (phrase) => {
    const regex = /\[([^\]]+)\]/g
    const matches = []
    let match
    
    while ((match = regex.exec(phrase)) !== null) {
      matches.push({
        word: match[1],
        position: match.index,
        placeholder: `[${match[1]}]`
      })
    }
    
    return matches
  }

  // Generate question from phrase
  const generateQuestion = (phrase, distractorWords = []) => {
    const dragableWords = parsePhrase(phrase)
    
    if (dragableWords.length === 0) {
      return null
    }

    // Create items (dragable words + distractors)
    const items = [
      ...dragableWords.map((word) => ({
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: word.word,
        type: 'correct'
      })),
      ...distractorWords.map((word) => ({
        id: `distractor_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: word,
        type: 'distractor'
      }))
    ]

    // Create inline drop zones - replace [word] with drop zone
    const createInlineQuestion = (phrase) => {
      let questionText = phrase
      const dropZones = []
      let zoneIndex = 1
      
      // Replace each [word] with a drop zone placeholder
      questionText = questionText.replace(/\[([^\]]+)\]/g, (match, word) => {
        const zoneId = `zone_${zoneIndex}`
        dropZones.push({
          id: zoneId,
          label: `Drop ${word} here`,
          word: word,
          position: zoneIndex - 1
        })
        zoneIndex++
        return `[DROP_ZONE_${zoneId}]`
      })
      
      return { questionText, dropZones }
    }

    const { questionText, dropZones } = createInlineQuestion(phrase)

    // Create correct order - map each drop zone to its correct item
    const correctOrder = dropZones.map(zone => 
      items.find(item => item.text === zone.word)?.id
    ).filter(Boolean)

    return {
      id: `q${Date.now()}`,
      question: questionText,
      items: items,
      drop_zones: dropZones,
      correct_order: correctOrder,
      explanation: '',
      settings: {
        allow_undo: true,
        show_hints: true,
        max_attempts: 3,
        time_limit: 300
      }
    }
  }

  const addQuestion = () => {
    const newQuestion = {
      id: `q${Date.now()}`,
      question: '',
      items: [],
      drop_zones: [],
      correct_order: [],
      explanation: '',
      settings: {
        allow_undo: true,
        show_hints: true,
        max_attempts: 3,
        time_limit: 300
      }
    }
    const updatedQuestions = [...localQuestions, newQuestion]
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const removeQuestion = (questionId) => {
    const updatedQuestions = localQuestions.filter(q => q.id !== questionId)
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  // Convert internal [DROP_ZONE_xxx] format back to [word] for editing
  const toEditableText = (question) => {
    if (!question.question) return ''
    let text = question.question
    question.drop_zones?.forEach(zone => {
      text = text.replace(`[DROP_ZONE_${zone.id}]`, `[${zone.word}]`)
    })
    return text
  }

  // When user edits the raw text, auto-detect [brackets] and rebuild drop zones + correct items
  const updateQuestionText = (questionId, rawText) => {
    const question = localQuestions.find(q => q.id === questionId)
    if (!question) return

    // Parse [bracket] words from raw text
    const bracketRegex = /\[([^\]]+)\]/g
    const bracketWords = []
    let match
    while ((match = bracketRegex.exec(rawText)) !== null) {
      // Skip existing DROP_ZONE references and media tags
      if (!match[1].startsWith('DROP_ZONE_')) {
        bracketWords.push(match[1])
      }
    }

    // Build drop zones and internal question text
    let questionText = rawText
    const dropZones = []
    let zoneIndex = 1

    bracketWords.forEach(word => {
      const zoneId = `zone_${zoneIndex}`
      // Replace first occurrence of [word] with [DROP_ZONE_xxx]
      questionText = questionText.replace(`[${word}]`, `[DROP_ZONE_${zoneId}]`)
      dropZones.push({
        id: zoneId,
        label: `Drop ${word} here`,
        word: word,
        position: zoneIndex - 1
      })
      zoneIndex++
    })

    // Build correct items from bracket words, reuse existing IDs where possible
    const existingCorrectItems = question.items.filter(i => i.type === 'correct')
    const correctItems = bracketWords.map((word) => {
      const existing = existingCorrectItems.find(i => i.text === word)
      return existing || {
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: word,
        type: 'correct'
      }
    })

    // Keep distractors
    const distractors = question.items.filter(i => i.type === 'distractor')
    const allItems = [...correctItems, ...distractors]

    // Build correct order
    const correctOrder = dropZones.map(zone =>
      allItems.find(item => item.text === zone.word)?.id
    ).filter(Boolean)

    const updatedQuestions = localQuestions.map(q =>
      q.id === questionId
        ? { ...q, question: questionText, drop_zones: dropZones, items: allItems, correct_order: correctOrder }
        : q
    )
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const updateQuestion = (questionId, field, value) => {
    const updatedQuestions = localQuestions.map(q =>
      q.id === questionId ? { ...q, [field]: value } : q
    )
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const addItem = (questionId, type = 'distractor') => {
    const question = localQuestions.find(q => q.id === questionId)
    if (!question) return

    const newItem = {
      id: `${type}_${Date.now()}`,
      text: type === 'correct' ? 'New item' : 'New distractor',
      type
    }

    const updatedItems = [...question.items, newItem]
    updateQuestion(questionId, 'items', updatedItems)
  }

  const addDistractor = (questionId) => addItem(questionId, 'distractor')

  const removeItem = (questionId, itemId) => {
    const question = localQuestions.find(q => q.id === questionId)
    if (!question) return

    const updatedItems = question.items.filter(item => item.id !== itemId)
    const updatedCorrectOrder = question.correct_order.filter(id => id !== itemId)

    updateQuestion(questionId, 'items', updatedItems)
    updateQuestion(questionId, 'correct_order', updatedCorrectOrder)
  }

  const handleRemoveItem = (e, questionId, itemId) => {
    e.preventDefault()
    e.stopPropagation()
    removeItem(questionId, itemId)
  }

  const updateItemText = (questionId, itemId, newText) => {
    const question = localQuestions.find(q => q.id === questionId)
    if (!question) return

    const updatedItems = question.items.map(item =>
      item.id === itemId ? { ...item, text: newText } : item
    )

    updateQuestion(questionId, 'items', updatedItems)
  }

  const togglePreview = () => {
    setPreviewMode(!previewMode)
  }

  const processBulkImport = () => {
    try {
      const textToProcess = bulkText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      const lines = textToProcess.split('\n').filter(line => line.trim())
      const newQuestions = []

      let questionCounter = 0
      let currentQuestion = null
      let currentDistractors = []
      let introLines = []
      let firstQuestionSeen = false

      lines.forEach((line) => {
        const trimmedLine = line.trim()

        const isQuestion = trimmedLine.match(/^(Q\s*\d+\s*[.:)]?|Q[.:)]|Quest(ion)?\s*\d+\s*[.:)]?|\d+\.?\s)/i)

        // Before first question appears, collect into intro
        if (!firstQuestionSeen && !isQuestion) {
          introLines.push(trimmedLine)
          return
        }
        firstQuestionSeen = true

        // Check if this is a new question (starts with Q: or number.)
        if (isQuestion) {
          // Save previous question if exists
          if (currentQuestion) {
            newQuestions.push(currentQuestion)
          }

          // Start new question - extract the question title
          const questionTitle = trimmedLine.replace(/^(Q\s*\d+\s*[.:)]?|Q[.:)]|Quest(ion)?\s*\d+\s*[.:)]?|\d+\.?\s)\s*/i, '')
          // Extract parenthesized content into question field, rest stays as explanation
          const parenMatch = questionTitle.match(/^\(([^)]+)\)\s*(.*)$/)
          const questionText = parenMatch ? parenMatch[1].trim() : ''
          const explanationText = parenMatch ? (parenMatch[2] || '').trim() : ''
          currentQuestion = {
            id: `q${Date.now()}_${questionCounter++}`,
            question: questionText,
            items: [],
            drop_zones: [],
            correct_order: [],
            explanation: explanationText,
            settings: {
              allow_undo: true,
              show_hints: true,
              max_attempts: 3,
              time_limit: 300
            }
          }
          currentDistractors = []

          // If the title itself contains brackets, process them as drag items
          const titleToProcess = parenMatch ? (parenMatch[2] || '').trim() : questionTitle
          if (titleToProcess.includes('[') && titleToProcess.includes(']')) {
            const newQuestionData = generateQuestion(titleToProcess, currentDistractors)
            if (newQuestionData) {
              const prefix = currentQuestion.question ? currentQuestion.question + '\n\n' : ''
              currentQuestion.question = prefix + newQuestionData.question
              currentQuestion.items = newQuestionData.items
              currentQuestion.drop_zones = newQuestionData.drop_zones
              currentQuestion.correct_order = newQuestionData.correct_order
            }
          }
        }
        // Check if this is a slash-separated ordering line: =word1/ word2/ word3. #explanation
        else if (trimmedLine.startsWith('=') && trimmedLine.includes('/') && currentQuestion) {
          let sentencePart = trimmedLine.slice(1) // remove leading =
          let explanation = ''
          const hashIndex = sentencePart.indexOf('#')
          if (hashIndex !== -1) {
            explanation = sentencePart.slice(hashIndex + 1).trim()
            sentencePart = sentencePart.slice(0, hashIndex).trim()
          }

          const pieces = sentencePart.split('/').map(p => p.trim()).filter(p => p.length > 0)
          if (pieces.length > 0) {
            const items = pieces.map((word, i) => ({
              id: `item_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
              text: word,
              type: 'correct'
            }))
            // Add any distractors
            currentDistractors.forEach((word, i) => {
              items.push({
                id: `distractor_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
                text: word,
                type: 'distractor'
              })
            })

            const dropZones = pieces.map((word, i) => ({
              id: `zone_${i + 1}`,
              label: `Drop ${word} here`,
              word: word,
              position: i
            }))

            const questionText = dropZones.map(z => `[DROP_ZONE_${z.id}]`).join(' ')
            const correctOrder = dropZones.map(zone =>
              items.find(item => item.text === zone.word)?.id
            ).filter(Boolean)

            const prefix = currentQuestion.question ? currentQuestion.question + '\n\n' : ''
            currentQuestion.question = prefix + questionText
            currentQuestion.items = items
            currentQuestion.drop_zones = dropZones
            currentQuestion.correct_order = correctOrder
            if (explanation) {
              currentQuestion.explanation = explanation
            }
          }
        }
        // Check if this line contains dragable words in [brackets]
        else if (trimmedLine.includes('[') && trimmedLine.includes(']') && currentQuestion) {
          const distractorWords = currentDistractors
          const newQuestionData = generateQuestion(trimmedLine, distractorWords)

          if (newQuestionData) {
            // Prepend any existing question text (e.g. from parenthesized content)
            const prefix = currentQuestion.question ? currentQuestion.question + '\n\n' : ''
            currentQuestion.question = prefix + newQuestionData.question
            currentQuestion.items = newQuestionData.items
            currentQuestion.drop_zones = newQuestionData.drop_zones
            currentQuestion.correct_order = newQuestionData.correct_order
          }
        }
        // Check if this is a distractors line
        else if (trimmedLine.match(/^Distractors?:\s*/i) && currentQuestion) {
          const distractorText = trimmedLine.replace(/^Distractors?:\s*/i, '')
          currentDistractors = distractorText
            .split(',')
            .map(word => word.trim())
            .filter(word => word.length > 0)
        }
        // Regular line (no special format)
        else if (trimmedLine && currentQuestion && !trimmedLine.includes('[')) {
          // If no items parsed yet, this is part of the question text (e.g. image comments)
          if (currentQuestion.items.length === 0) {
            if (currentQuestion.question) {
              currentQuestion.question += '\n' + trimmedLine
            } else {
              currentQuestion.question = trimmedLine
            }
          } else {
            if (currentQuestion.explanation) {
              currentQuestion.explanation += '\n' + trimmedLine
            } else {
              currentQuestion.explanation = trimmedLine
            }
          }
        }
      })

      // Save the last question
      if (currentQuestion && currentQuestion.items.length > 0) {
        newQuestions.push(currentQuestion)
      }

      if (newQuestions.length > 0) {
        if (introLines.length > 0 && onIntroChange) {
          const newIntro = introLines.join('\n')
          onIntroChange(intro ? intro + '\n' + newIntro : newIntro)
        }
        setLastBulkText(bulkText)
        try { localStorage.setItem('xpclass_last_bulk_text_drag_drop', bulkText) } catch {}
        const updatedQuestions = [...localQuestions, ...newQuestions]
        setLocalQuestions(updatedQuestions)
        onQuestionsChange(updatedQuestions)
        setBulkText('')
        setBulkImportMode(false)
        alert(`Successfully imported ${newQuestions.length} drag & drop questions!`)
      } else {
        alert('No valid questions found. Please check your format.')
      }
    } catch (error) {
      console.error('Bulk import error:', error)
      alert('Error processing bulk import. Please check your format.')
    }
  }

  const exportQuestions = () => {
    if (localQuestions.length === 0) {
      alert('No questions to export')
      return
    }

    const exportText = localQuestions.map((q, index) => {
      let text = `${index + 1}. ${q.explanation || 'Drag & Drop Question'}\n`

      // Extract the original phrase with [brackets] from the question
      let phrase = q.question
      q.drop_zones.forEach((zone, idx) => {
        const placeholder = `[DROP_ZONE_${zone.id}]`
        phrase = phrase.replace(placeholder, `[${zone.word}]`)
      })

      text += `${phrase}\n`

      // Add distractors if any
      const distractors = q.items.filter(item => item.type === 'distractor')
      if (distractors.length > 0) {
        const distractorWords = distractors.map(d => d.text).join(', ')
        text += `Distractors: ${distractorWords}\n`
      }

      return text
    }).join('\n')

    navigator.clipboard.writeText(exportText).then(() => {
      alert('Questions exported to clipboard!')
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = exportText
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      alert('Questions copied to clipboard!')
    })
  }

  const insertAtCursor = (index, field, snippet) => {
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

    const textarea = questionTextareasRef.current[index]
    const question = localQuestions[index]
    if (!question) return

    // For the question field, the textarea shows the editable form (toEditableText)
    // and writes go through updateQuestionText to re-derive drop zones.
    // Other fields write directly via updateQuestion (matched by question.id).
    const isQuestionField = field === 'question'
    const current = isQuestionField ? toEditableText(question) : (question[field] || '')
    const writeBack = (newValue) => {
      if (isQuestionField) updateQuestionText(question.id, newValue)
      else updateQuestion(question.id, field, newValue)
    }

    if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const before = current.slice(0, start)
      const after = current.slice(end)
      const newValue = `${before}${snippet}${after}`
      writeBack(newValue)
      // Restore caret after update
      setTimeout(() => {
        try {
          const pos = start + snippet.length
          const ta = questionTextareasRef.current[index]
          if (ta) {
            ta.focus()
            ta.setSelectionRange(pos, pos)
          }
        } catch { /* ignore caret restore failures */ }
      }, 0)
    } else {
      writeBack(current + (current ? '\n' : '') + snippet)
    }
  }

  const applyAlignment = (index, field, alignment) => {
    const isIntro = index === -1
    const textarea = isIntro ? introTextareaRef.current : questionTextareasRef.current[index]
    const current = isIntro ? (intro || '') : (localQuestions[index]?.[field] || '')

    if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selected = current.slice(start, end)
      const wrapped = `<div style="text-align: ${alignment}">${selected}</div>`
      const newValue = `${current.slice(0, start)}${wrapped}${current.slice(end)}`
      if (isIntro) {
        onIntroChange && onIntroChange(newValue)
      } else {
        updateQuestion(index, field, newValue)
      }
      setTimeout(() => {
        try {
          const pos = start + wrapped.length
          const ta = isIntro ? introTextareaRef.current : questionTextareasRef.current[index]
          if (ta) { ta.focus(); ta.setSelectionRange(pos, pos) }
        } catch {}
      }, 0)
    }
  }

  const saveCursorPosition = (index) => {
    const textarea = questionTextareasRef.current[index]
    if (textarea && typeof textarea.selectionStart === 'number') {
      savedCursorPos.current = { start: textarea.selectionStart, end: textarea.selectionEnd }
    } else {
      const current = localQuestions[index]?.question || ''
      savedCursorPos.current = { start: current.length, end: current.length }
    }
  }

  const handlePasteImageUrl = (index) => {
    saveCursorPosition(index)
    setUrlModal({ isOpen: true, type: 'image', questionIndex: index })
    setUrlInput('')
    setLinkText('')
    setImageSize('medium')
    setCustomWidth('')
    setCustomHeight('')
  }

  const handleInsertAudio = (index) => {
    saveCursorPosition(index)
    setUrlModal({ isOpen: true, type: 'audio', questionIndex: index })
    setUrlInput('')
    setLinkText('')
    setImageSize('medium')
    setCustomWidth('')
    setCustomHeight('')
    setAudioControls(true)
    setAudioAutoplay(false)
    setAudioLoop(false)
    setAudioMaxPlays(0)
    setAudioPlaybackRate(1)
  }

  const handleInsertLink = (index) => {
    saveCursorPosition(index)
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

  const getAudioAttributes = () => {
    const attributes = []
    if (audioControls) attributes.push('controls')
    if (audioAutoplay) attributes.push('autoplay')
    if (audioLoop) attributes.push('loop')
    if (audioMaxPlays > 0) attributes.push(`data-max-plays="${audioMaxPlays}"`)
    if (audioPlaybackRate && audioPlaybackRate !== 1) attributes.push(`data-playback-rate="${audioPlaybackRate}"`)
    return attributes.join(' ')
  }

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return
    try {
      new URL(urlInput.trim())
      const trimmedUrl = urlInput.trim()
      const questionIndex = urlModal.questionIndex

      let snippet = ''
      if (urlModal.type === 'image') {
        const sizeStyle = getImageSizeStyle()
        snippet = `<img src="${trimmedUrl}" alt="" ${sizeStyle} />`
      } else if (urlModal.type === 'link') {
        const text = linkText.trim() || 'Reference'
        snippet = `[${text}](${trimmedUrl})`
      } else if (urlModal.type === 'audio') {
        const audioAttrs = getAudioAttributes()
        snippet = `<audio src="${trimmedUrl}" ${audioAttrs}></audio>`
      }

      // Handle intro (questionIndex === -1)
      if (questionIndex === -1) {
        insertAtCursor(-1, 'question', snippet)
        handleUrlCancel()
        return
      }

      const questionId = localQuestions[questionIndex]?.id
      if (!questionId) {
        alert('Question not found')
        return
      }

      // Update question directly using saved cursor position
      const currentQuestion = localQuestions[questionIndex]
      const textarea = questionTextareasRef.current[questionIndex]
      const { start, end } = savedCursorPos.current
      const current = currentQuestion.question || ''
      const before = current.slice(0, start)
      const after = current.slice(end)
      const newValue = `${before}${snippet}${after}`

      updateQuestion(questionId, 'question', newValue)

      if (textarea) {
        setTimeout(() => {
          try {
            const pos = start + snippet.length
            textarea.focus()
            textarea.setSelectionRange(pos, pos)
          } catch {}
        }, 0)
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
    setAudioMaxPlays(0)
    setAudioPlaybackRate(1)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Smart Drag & Drop Editor</h3>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addQuestion}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-orange-600 text-white hover:bg-orange-700 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
          <button
            type="button"
            onClick={() => setBulkImportMode(!bulkImportMode)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-800 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Bulk
          </button>
          {localQuestions.length > 0 && (
            <button
              type="button"
              onClick={exportQuestions}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg"
            >
              <Copy className="w-4 h-4" />
              Export
            </button>
          )}
          <button
            type="button"
            onClick={togglePreview}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            {previewMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {previewMode ? 'Edit' : 'Preview'}
          </button>
        </div>
      </div>


      {/* Global Intro Section */}
      <div className="bg-white p-4 border border-gray-200 rounded-lg">
        <div className="flex items-center gap-2 mb-1">
          <label className="text-sm font-medium text-gray-700 mr-auto">
            Exercise Intro (Optional)
          </label>
          <input
            ref={introFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const basePath = folderPath ? `exercise_bank/${folderPath}` : 'exercise_bank'
                const path = `${basePath}/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`
                const { error: uploadError } = await supabase.storage
                  .from('exercise-files')
                  .upload(path, file, { cacheControl: '3600', upsert: true })
                if (uploadError) throw uploadError

                const { data: publicData } = supabase.storage
                  .from('exercise-files')
                  .getPublicUrl(path)

                const publicUrl = publicData?.publicUrl
                if (!publicUrl) throw new Error('Cannot get public URL')

                const sizeStyle = getImageSizeStyle()
                const textarea = introTextareaRef.current
                const current = intro || ''
                if (!textarea) {
                  onIntroChange && onIntroChange(current + (current ? '\n\n' : '') + `<img src="${publicUrl}" alt="" ${sizeStyle} />`)
                  return
                }
                const start = textarea.selectionStart || 0
                const end = textarea.selectionEnd || 0
                const textToInsert = `\n<img src="${publicUrl}" alt="" ${sizeStyle} />\n`
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
          <button type="button" onClick={() => { setUrlModal({ isOpen: true, type: 'image', questionIndex: -1 }); setUrlInput(''); setLinkText(''); setImageSize('medium'); setCustomWidth(''); setCustomHeight('') }} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> Image
          </button>
          <button type="button" onClick={() => { setUrlModal({ isOpen: true, type: 'audio', questionIndex: -1 }); setUrlInput(''); setLinkText(''); setImageSize('medium'); setCustomWidth(''); setCustomHeight(''); setAudioControls(true); setAudioAutoplay(false); setAudioLoop(false); setAudioMaxPlays(0); setAudioPlaybackRate(1) }} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
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
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mt-1"
          rows={2}
          placeholder="Enter introductory text for the drag & drop exercise..."
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

      {/* Bulk Import Mode */}
      {bulkImportMode && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">Bulk Import Drag & Drop Questions</h4>
          <p className="text-sm text-blue-700 mb-3">
            Format: Start with "Q:" or "1." followed by question title, then phrase with [words] in brackets
            <br />
            Add "Distractors: word1, word2" line for incorrect options
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="w-full p-3 border border-blue-300 rounded-lg h-40 font-mono text-sm"
            placeholder={`Q: Complete the sentence by dragging the correct words
Hello [my] [name] [is] John
Distractors: wrong, incorrect, false

1. Fill in the missing words in order
The capital of [France] [is] [Paris]
Distractors: Germany, London, Italy

2: Put the words in the correct sequence
She [has] [been] [studying] English for 3 years`}
          />
          <div className="flex justify-between items-center mt-2">
            <button
              type="button"
              onClick={() => setBulkText(lastBulkText)}
              disabled={!lastBulkText}
              className={`px-3 py-2 rounded-lg text-sm ${lastBulkText ? 'bg-gray-200 hover:bg-gray-300 text-gray-800' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              title={lastBulkText ? 'Restore last imported text' : 'No previous import yet'}
            >
              Restore last import
            </button>
            <span className="text-xs text-gray-500">Last text: {lastBulkText ? `${Math.min(lastBulkText.length, 60)} chars` : 'none'}</span>
          </div>
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
        {localQuestions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <HelpCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No questions yet. Add your first question above!</p>
          </div>
        ) : (
          localQuestions.map((question, index) => (
            <div key={question.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium text-gray-800 mr-auto">
                      Question {index + 1}
                    </h4>
                    {!previewMode && (
                      <>
                        <button type="button" onClick={() => handlePasteImageUrl(index)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> Image
                        </button>
                        <button type="button" onClick={() => handleInsertAudio(index)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                          <Music className="w-3 h-3" /> Audio
                        </button>
                        <button type="button" onClick={() => handleInsertLink(index)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                          <LinkIcon className="w-3 h-3" /> Link
                        </button>
                        <div className="flex gap-1 ml-2 border-l pl-2 border-gray-300">
                          <button type="button" onClick={() => applyAlignment(index, 'questionText', 'left')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align left"><AlignLeft className="w-3 h-3" /></button>
                          <button type="button" onClick={() => applyAlignment(index, 'questionText', 'center')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align center"><AlignCenter className="w-3 h-3" /></button>
                          <button type="button" onClick={() => applyAlignment(index, 'questionText', 'right')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align right"><AlignRight className="w-3 h-3" /></button>
                        </div>
                      </>
                    )}
                  </div>

                  {previewMode ? (
                    <div className="bg-gray-50 p-3 rounded-lg">
                      {/* Inline question with drop zones */}
                      <div className="mb-4">
                        <div className="text-gray-700 text-lg leading-relaxed">
                          {renderQuestionWithDropZones(
                            question.question,
                            question.drop_zones,
                            (zoneId, index) => {
                              const zone = question.drop_zones.find(z => z.id === zoneId)
                              return (
                                <span
                                  key={index}
                                  className="inline-block relative mx-1"
                                >
                                  <span className="bg-gray-200 text-gray-600 px-3 py-1 rounded border-2 border-dashed border-gray-400 text-sm font-medium min-w-[60px] text-center">
                                    ___
                                  </span>
                                </span>
                              )
                            }
                          )}
                        </div>
                      </div>
                      
                      {/* Dragable items */}
                      <div className="flex flex-wrap gap-2">
                        {question.items.map((item) => (
                          <span
                            key={item.id}
                            className={`px-3 py-1 rounded-full text-sm cursor-move ${
                              item.type === 'correct'
                                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                : 'bg-red-100 text-red-800 border border-red-300'
                            }`}
                          >
                            {item.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <textarea
                          value={toEditableText(question)}
                          onChange={(e) => updateQuestionText(question.id, e.target.value)}
                          onKeyDown={(e) => handleRichTextShortcut(e, questionTextareasRef.current[index], toEditableText(question), (v) => updateQuestionText(question.id, v))}
                          onPaste={(e) => handleImagePaste(e, index)}
                          ref={(el) => { questionTextareasRef.current[index] = el }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          rows={3}
                          placeholder="My [name] is [Kevin] — words in [brackets] become drop zones"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Dragable Items
                        </label>
                        <div className="space-y-2">
                          {question.items.map((item) => (
                            <div key={item.id} className="flex items-center gap-2">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  item.type === 'correct'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {item.type}
                              </span>
                              <input
                                type="text"
                                value={item.text}
                                onChange={(e) => updateItemText(question.id, item.id, e.target.value)}
                                className="flex-1 px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedQuestions = localQuestions.map(q =>
                                    q.id === question.id
                                      ? {
                                          ...q,
                                          items: q.items.filter(i => i.id !== item.id),
                                          correct_order: q.correct_order.filter(id => id !== item.id)
                                        }
                                      : q
                                  )
                                  setLocalQuestions(updatedQuestions)
                                  onQuestionsChange(updatedQuestions)
                                }}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addDistractor(question.id)}
                            className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700"
                          >
                            <Plus className="w-4 h-4" />
                            Add Distractor
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Explanation (optional)
                        </label>
                        <textarea
                          ref={(el) => { explanationTextareasRef.current[index] = el }}
                          value={question.explanation}
                          onChange={(e) => updateQuestion(question.id, 'explanation', e.target.value)}
                          onKeyDown={(e) => handleRichTextShortcut(e, explanationTextareasRef.current[index], question.explanation, (v) => updateQuestion(question.id, 'explanation', v))}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Explain the correct answer..."
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removeQuestion(question.id)}
                  className="ml-4 text-red-500 hover:text-red-700"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* URL Modal */}
      {urlModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {urlModal.type === 'image' ? 'Add Image' : urlModal.type === 'audio' ? 'Add Audio' : 'Add Link'}
              </h3>
              <button onClick={handleUrlCancel} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder={urlModal.type === 'image' ? 'https://example.com/image.jpg' : urlModal.type === 'audio' ? 'https://example.com/audio.mp3' : 'https://example.com/link'} />
              </div>
              {urlModal.type === 'link' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Text (optional)</label>
                  <input type="text" value={linkText} onChange={(e) => setLinkText(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Reference" />
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Audio Options</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={audioControls} onChange={(e) => setAudioControls(e.target.checked)} /> Show controls</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={audioAutoplay} onChange={(e) => setAudioAutoplay(e.target.checked)} /> Autoplay</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={audioLoop} onChange={(e) => setAudioLoop(e.target.checked)} /> Loop</label>
                  <label className="flex items-center gap-2 text-sm">
                    Giới hạn phát:
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={audioMaxPlays}
                      onChange={(e) => setAudioMaxPlays(parseInt(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <span className="text-gray-500">{audioMaxPlays === 0 ? '(không giới hạn)' : 'lần'}</span>
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
              <button type="button" onClick={handleUrlCancel} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
              <button type="button" onClick={handleUrlSubmit} disabled={!urlInput.trim()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">Insert</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SmartDragDropEditor
