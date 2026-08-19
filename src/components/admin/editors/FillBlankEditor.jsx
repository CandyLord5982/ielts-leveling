import React, { useState, useEffect, useRef } from 'react'
import {
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Upload,
  Check,
  HelpCircle,
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
import { firstAnswer } from '../../../utils/splitAnswers'

const FillBlankEditor = ({ questions, onQuestionsChange, settings, onSettingsChange, intro, onIntroChange, folderPath }) => {
  const [localQuestions, setLocalQuestions] = useState(questions || [])
  const [bulkImportMode, setBulkImportMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [lastBulkText, setLastBulkText] = useState('')
  const [stripComments, setStripComments] = useState(false)
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
  const introTextareaRef = useRef(null)
  const introFileInputRef = useRef(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('xpclass_last_bulk_text_fill_blank')
      if (saved) setLastBulkText(saved)
    } catch {}
  }, [])

  useEffect(() => {
    setLocalQuestions(questions || [])
  }, [questions])

  const addQuestion = () => {
    const newQuestion = {
      id: `q${Date.now()}`,
      question: '',
      blanks: [{ text: '', answer: '', case_sensitive: false }],
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
    if (field === 'question') {
      const existingBlanks = localQuestions[index]?.blanks || []

      // Walk through the text left-to-right, building blanks in order
      // Existing _____ keep their blank entry; new [brackets] create new entries
      const resultBlanks = []
      let displayText = ''
      let existingBlankIdx = 0
      let pos = 0
      const text = value

      while (pos < text.length) {
        // Check for existing _____ (5+ underscores)
        const underscoreMatch = text.slice(pos).match(/^_{5,}/)
        if (underscoreMatch) {
          displayText += '_____'
          // Preserve existing blank data at this position
          resultBlanks.push(existingBlanks[existingBlankIdx] || { text: '', answer: '', case_sensitive: false })
          existingBlankIdx++
          pos += underscoreMatch[0].length
          continue
        }

        // Check for [bracket] with hint: [answer] (hint) — space required before ( to distinguish from markdown links
        const hintMatch = text.slice(pos).match(/^(?<!!)\[([^\]]+)\]\s+\(([^)]+)\)/)
        if (hintMatch && (pos === 0 || text[pos - 1] !== '!')) {
          const answers = hintMatch[1].split(/[|]/).map(a => a.trim()).filter(a => a)
          resultBlanks.push({ text: hintMatch[2], answer: answers.join('|'), case_sensitive: false })
          displayText += `_____ (${hintMatch[2]})`
          pos += hintMatch[0].length
          continue
        }

        // Check for [bracket] without hint — not followed by (
        const bracketMatch = text.slice(pos).match(/^(?<!!)\[([^\]]+)\]/)
        if (bracketMatch && (pos === 0 || text[pos - 1] !== '!')) {
          // Make sure it's not a markdown link [text](url)
          const afterBracket = text.slice(pos + bracketMatch[0].length)
          if (!afterBracket.match(/^\s*\(/)) {
            const answers = bracketMatch[1].split(/[|]/).map(a => a.trim()).filter(a => a)
            resultBlanks.push({ text: '', answer: answers.join('|'), case_sensitive: false })
            displayText += '_____'
            pos += bracketMatch[0].length
            continue
          }
        }

        // Regular character
        displayText += text[pos]
        pos++
      }

      const updatedQuestions = localQuestions.map((q, i) =>
        i === index ? { ...q, question: displayText, blanks: resultBlanks } : q
      )
      setLocalQuestions(updatedQuestions)
      onQuestionsChange(updatedQuestions)
      return
    }

    const updatedQuestions = localQuestions.map((q, i) =>
      i === index ? { ...q, [field]: value } : q
    )
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const appendToField = (index, field, snippet) => {
    const current = localQuestions[index]?.[field] || ''
    updateQuestion(index, field, (current + (current ? '\n' : '') + snippet).trim())
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
      // Restore caret after update
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
      // Fallback to append when we cannot detect caret
      appendToField(index, field, snippet)
    }
  }

  const applyAlignment = (index, alignment) => {
    const textarea = questionTextareasRef.current[index]
    if (!textarea) return
    const value = localQuestions[index]?.question || ''
    const start = textarea.selectionStart || 0
    const end = textarea.selectionEnd || 0
    const selected = value.slice(start, end)
    const wrapped = `<div style="text-align: ${alignment}">${selected || 'text here'}</div>`
    const newValue = value.slice(0, start) + wrapped + value.slice(end)
    updateQuestion(index, 'question', newValue)
    setTimeout(() => {
      textarea.focus()
      const caret = start + wrapped.length
      textarea.setSelectionRange(caret, caret)
    }, 0)
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
    setAudioMaxPlays(0)
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
    if (audioMaxPlays > 0) attributes.push(`data-max-plays="${audioMaxPlays}"`)
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
      alert('Vui lòng nhập URL hợp lệ (http/https)')
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
        const field = index === -1 ? 'intro' : 'question'
        if (isImage) {
          const sizeStyle = getImageSizeStyle()
          insertAtCursor(index, field, `<img src="${publicUrl}" alt="" ${sizeStyle} />`)
        } else {
          const audioAttrs = getAudioAttributes()
          insertAtCursor(index, field, `<audio src="${publicUrl}" ${audioAttrs}></audio>`)
        }
      } catch (err) {
        console.error('Paste upload failed:', err)
        alert(`Failed to upload pasted ${isImage ? 'image' : 'audio'}`)
      }
      return
    }
  }

  const updateBlank = (questionIndex, blankIndex, field, value) => {
    const updatedQuestions = localQuestions.map((q, i) =>
      i === questionIndex
        ? {
            ...q,
            blanks: q.blanks.map((blank, bi) =>
              bi === blankIndex ? { ...blank, [field]: value } : blank
            )
          }
        : q
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

  const processBulkImport = () => {
    try {
      // Optionally remove comments from the text
      const textToProcess = stripComments
        ? bulkText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/[^/\n]+\//g, '')
        : bulkText

      // Detect answer-key format: passage with (N) ________ (hint) + "Answer key:" + (N) [answer] #explanation
      const answerKeyMatch = textToProcess.match(/answer\s*key\s*:/i)
      if (answerKeyMatch) {
        const answerKeyIndex = textToProcess.indexOf(answerKeyMatch[0])
        const passageSection = textToProcess.substring(0, answerKeyIndex).trim()
        const answerSection = textToProcess.substring(answerKeyIndex).trim()

        // Parse answer key lines: (N) or N. or N) followed by [answer] #explanation
        const answers = {}
        const explanations = {}
        answerSection.split('\n').forEach(line => {
          const m = line.match(/(?:\((\d+)\)|(\d+)[.)]\s)\s*\[([^\]]+)\]\s*(?:#(.*))?/)
          if (m) {
            const num = m[1] || m[2]
            answers[num] = m[3].trim()
            if (m[4]) explanations[num] = m[4].trim()
          }
        })

        // Find blank numbers in order from the passage: (N) or N. or N) followed by underscores
        const blankNumbers = []
        const blankPattern = /(?:\((\d+)\)|(\d+)[.)]\s)\s*_{2,}/g
        let bm
        while ((bm = blankPattern.exec(passageSection)) !== null) {
          blankNumbers.push(bm[1] || bm[2])
        }

        if (blankNumbers.length > 0 && Object.keys(answers).length > 0) {
          // Split passage into intro (before first blank) and question text
          const passageLines = passageSection.split('\n')
          const introLines = []
          let passageStartIdx = 0
          for (let i = 0; i < passageLines.length; i++) {
            if (/(?:\(\d+\)|\d+[.)]\s)\s*_{2,}/.test(passageLines[i])) {
              passageStartIdx = i
              break
            }
            introLines.push(passageLines[i].trim())
          }

          // Build display text: replace numbered blanks with _____
          const passageText = passageLines.slice(passageStartIdx).join('\n')
            .replace(/(?:\((\d+)\)|(\d+)[.)]\s)\s*_{2,}/g, (_, a, b) => `(${a || b}) _____`)

          // Build blanks array in passage order
          const blanks = blankNumbers.map(num => ({
            text: '',
            answer: answers[num] || '',
            case_sensitive: false
          }))

          // Build combined explanation
          const expParts = blankNumbers
            .filter(num => explanations[num])
            .map(num => `(${num}) ${explanations[num]}`)
          const explanation = expParts.join('\n')

          const question = {
            id: `q${Date.now()}_0`,
            question: passageText,
            blanks,
            explanation
          }

          // Set intro
          if (introLines.length > 0 && onIntroChange) {
            const newIntro = introLines.filter(l => l).join('\n')
            if (newIntro) onIntroChange(intro ? intro + '\n' + newIntro : newIntro)
          }

          setLastBulkText(bulkText)
          try { localStorage.setItem('xpclass_last_bulk_text_fill_blank', bulkText) } catch {}
          const updatedQuestions = [...localQuestions, question]
          setLocalQuestions(updatedQuestions)
          onQuestionsChange(updatedQuestions)
          setBulkText('')
          setBulkImportMode(false)
          alert(`Successfully imported 1 passage with ${blanks.length} blanks!`)
          return
        }
      }

      // Detect separated Q&A format: numbered questions on top, numbered answers on bottom
      // e.g. "1. Statement\n___\n2. Statement\n___\n1. Answer\n2. Answer"
      const allBulkLines = textToProcess.split('\n')
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
        const explanationMap = {}
        aEntries.forEach(a => {
          const hashMatch = a.text.match(/^(.*?)\s*#(.+)$/)
          if (hashMatch) {
            answerMap[a.num] = hashMatch[1].trim()
            explanationMap[a.num] = hashMatch[2].trim()
          } else {
            answerMap[a.num] = a.text
          }
        })

        // Collect intro (lines before the first question)
        const firstQLineIdx = qEntries[0].lineIdx
        const introText = allBulkLines.slice(0, firstQLineIdx)
          .map(l => l.trim()).filter(l => l && !/^_{3,}$/.test(l)).join('\n')

        const separatedQuestions = qEntries.map((q, i) => ({
          id: `q${Date.now()}_${i}`,
          question: q.text,
          blanks: [{ text: '', answer: answerMap[q.num] || '', case_sensitive: false }],
          explanation: explanationMap[q.num] || ''
        }))

        if (introText && onIntroChange) {
          onIntroChange(intro ? intro + '\n' + introText : introText)
        }

        setLastBulkText(bulkText)
        try { localStorage.setItem('xpclass_last_bulk_text_fill_blank', bulkText) } catch {}
        const updatedQuestions = [...localQuestions, ...separatedQuestions]
        setLocalQuestions(updatedQuestions)
        onQuestionsChange(updatedQuestions)
        setBulkText('')
        setBulkImportMode(false)
        alert(`Successfully imported ${separatedQuestions.length} questions!`)
        return
      }

      const lines = textToProcess.split('\n').filter(line => line.trim())
      const newQuestions = []

      let questionCounter = 0
      let currentInstruction = ''
      let accumulatedText = [] // Accumulate lines that belong to the current question
      let currentExplanation = ''
      let introLines = []
      let firstQuestionSeen = false

      const processAccumulatedQuestion = () => {
        if (accumulatedText.length === 0) { currentExplanation = ''; return }

        // Find which lines contain brackets
        const linesWithBrackets = []
        const linesWithoutBrackets = []

        accumulatedText.forEach(line => {
          if (line.includes('[') && line.includes(']')) {
            linesWithBrackets.push(line)
          } else {
            linesWithoutBrackets.push(line)
          }
        })

        if (linesWithBrackets.length === 0) {
          // No brackets found, clear and return
          accumulatedText = []
          return
        }

        // Extract inline explanations (text after # on the same line, outside brackets)
        // e.g. "[Clare] #Girl with long hair" → explanation = "Girl with long hair"
        accumulatedText = accumulatedText.map(line => {
          // Match # that comes after the last ] or at any position outside brackets
          const hashMatch = line.match(/^(.*?\])\s*#(.+)$/)
          if (hashMatch) {
            if (!currentExplanation) {
              currentExplanation = hashMatch[2].trim()
            }
            return hashMatch[1].trim()
          }
          // Also handle # on lines without brackets
          const plainHashMatch = line.match(/^([^#]*?)#(.+)$/)
          if (plainHashMatch && !line.includes('[')) {
            if (!currentExplanation) {
              currentExplanation = plainHashMatch[2].trim()
            }
            return plainHashMatch[1].trim()
          }
          return line
        }).filter(line => line)

        // Combine all text (lines with and without brackets)
        const fullText = accumulatedText.join('\n')

        const blanks = []
        let displayText = fullText

        // With hint: [answer] (hint)
        const withHintMatches = [...fullText.matchAll(/\[([^\]]+)\]\s*\(([^)]+)\)/g)]
        withHintMatches.forEach((m) => {
          const answer = m[1]
          // m[2] is the hint text, which we preserve in the display
          const answers = answer.split(/[|/]/).map(a => a.trim()).filter(a => a)
          const answerText = answers.length > 0 ? answers.join('|') : answer
          blanks.push({ text: '', answer: answerText, case_sensitive: false })
        })
        // Replace with-hint occurrences with blank keeping hint text
        displayText = displayText.replace(/\[([^\]]+)\]\s*\(([^)]+)\)/g, (m, a, h) => `_____ (${h})`)

        // Without hint: [answer] not followed by (...)
        const noHintMatches = [...fullText.matchAll(/\[([^\]]+)\](?!\s*\()/g)]
        noHintMatches.forEach((m) => {
          const answer = m[1]
          const answers = answer.split(/[|/]/).map(a => a.trim()).filter(a => a)
          const answerText = answers.length > 0 ? answers.join('|') : answer
          blanks.push({ text: '', answer: answerText, case_sensitive: false })
        })
        // Replace no-hint occurrences with blank only
        displayText = displayText.replace(/\[([^\]]+)\](?!\s*\()/g, '_____')

        if (blanks.length > 0) {
          const question = {
            id: `q${Date.now()}_${questionCounter++}`,
            question: currentInstruction ? `${currentInstruction}\n\n${displayText}` : displayText,
            blanks: blanks,
            explanation: currentExplanation
          }
          newQuestions.push(question)
        }

        // Clear accumulated text
        accumulatedText = []
        currentExplanation = ''
      }

      lines.forEach((line) => {
        const trimmedLine = line.trim()

        const isQuestion = trimmedLine.match(/^\d+\.?\s+/) || trimmedLine.match(/^Q(?:uest(?:ion)?)?\s*\d+[.:)]?\s*/i)
        const isInstruction = trimmedLine.match(/^[A-Z]\.\s+/)
        const isExplanation = trimmedLine.match(/^#\s*/)

        // Before first numbered question appears, collect into intro
        if (!firstQuestionSeen && !isQuestion) {
          introLines.push(trimmedLine)
          return
        }
        firstQuestionSeen = true

        // Check if this is an instruction line (starts with letter and period)
        if (isInstruction) {
          // Process any accumulated question before changing instruction
          processAccumulatedQuestion()
          currentInstruction = trimmedLine
        }
        // Check if this line looks like a new numbered question (e.g., "1.", "2.", "Quest 1:", "Question 2.", etc.)
        else if (isQuestion) {
          // Process previous accumulated question
          processAccumulatedQuestion()
          // Start accumulating new question
          accumulatedText.push(trimmedLine)
        }
        // Check if this is an explanation line (starts with #)
        else if (isExplanation) {
          currentExplanation = trimmedLine.replace(/^#\s*/, '').trim()
        }
        // Regular line - add to accumulated text
        else {
          accumulatedText.push(trimmedLine)
        }
      })

      // Don't forget to process the last accumulated question
      processAccumulatedQuestion()

      if (newQuestions.length > 0) {
        // Set intro from lines that appeared before the first question
        if (introLines.length > 0 && onIntroChange) {
          const newIntro = introLines.join('\n')
          onIntroChange(intro ? intro + '\n' + newIntro : newIntro)
        }
        setLastBulkText(bulkText)
        try { localStorage.setItem('xpclass_last_bulk_text_fill_blank', bulkText) } catch {}
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
      alert('Error processing bulk import. Please check your format.')
    }
  }

  const exportQuestions = () => {
    if (localQuestions.length === 0) {
      alert('No questions to export')
      return
    }

    const exportText = localQuestions.map((q, index) => {
      // Simply export the question text as-is (already contains _____)
      let text = `${String.fromCharCode(65 + index)}. ${q.question}\n\n`

      // Note: The question text already has _____ blanks in it
      // We could optionally add answer key below for reference
      if (q.blanks && q.blanks.length > 0) {
        text += 'Answers:\n'
        q.blanks.forEach((blank, blankIndex) => {
          text += `${blankIndex + 1}. ${blank.answer}\n`
        })
        text += '\n'
      }

      if (q.explanation) {
        text += `Explanation: ${q.explanation}\n`
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

  // Convert simple markdown/HTML to safe HTML for preview (align with MultipleChoice)
  const markdownToHtml = (text) => {
    if (!text) return ''
    let html = text
    // Highlight blank underscores (_____ exactly 5 underscores) with prominent blue styling
    html = html.replace(
      /(_{5})/g,
      '<span class="inline-block align-baseline text-blue-700 font-bold bg-blue-50 border border-blue-200 rounded px-1">_____</span>'
    )
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

  return (
    <>
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Fill in the Blank Questions</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSettingsChange?.({ ...settings, show_all_questions: !settings?.show_all_questions })}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${settings?.show_all_questions ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            {settings?.show_all_questions ? 'All at Once' : 'One by One'}
          </button>
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
              onClick={exportQuestions}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
            >
              <Copy className="w-4 h-4" />
              Export
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

      {/* Global Intro Section */}
      <div className="bg-white p-4 border-l-4 border-l-blue-400 border border-gray-200 rounded-lg">
        <div className="flex items-center gap-2 mb-1">
          <label className="text-sm font-semibold text-blue-700 mr-auto">
            Intro
            <span className="text-xs font-normal text-gray-400 ml-1">(Optional)</span>
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
                const imgTag = `<img src="${publicUrl}" alt="" ${sizeStyle} />`
                const textarea = introTextareaRef.current
                const current = intro || ''
                if (!textarea) {
                  onIntroChange && onIntroChange(current + (current ? '\n\n' : '') + imgTag)
                  return
                }
                const start = textarea.selectionStart || 0
                const end = textarea.selectionEnd || 0
                const textToInsert = `\n${imgTag}\n`
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
          <button type="button" onClick={() => { setUrlModal({ isOpen: true, type: 'audio', questionIndex: -1 }); setUrlInput(''); setLinkText(''); setImageSize('medium'); setCustomWidth(''); setCustomHeight(''); setAudioControls(true); setAudioAutoplay(false); setAudioLoop(false); setAudioMaxPlays(0); setAudioPlaybackRate(1) }} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
            <Music className="w-3 h-3" /> Audio
          </button>
          <button type="button" onClick={() => { setUrlModal({ isOpen: true, type: 'link', questionIndex: -1 }); setUrlInput(''); setLinkText('Reference') }} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
            <LinkIcon className="w-3 h-3" /> Link
          </button>
        </div>
        <textarea
          ref={introTextareaRef}
          value={intro || ''}
          onChange={(e) => onIntroChange && onIntroChange(e.target.value)}
          onKeyDown={(e) => handleRichTextShortcut(e, introTextareaRef.current, intro || '', (v) => onIntroChange && onIntroChange(v))}
          onPaste={(e) => handleImagePaste(e, -1)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          rows={2}
          placeholder="Enter introductory text for the fill-in-the-blank exercise..."
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
          <h4 className="font-medium text-blue-900 mb-2">Bulk Import Questions</h4>
          <p className="text-sm text-blue-700 mb-3">
            Format: Use [answer] for blanks, or [answer] (hint) for blanks with hints
            <br />
            Multiple answers: [answer1|answer2|answer3] or [answer1/answer2]
            <br />
            Explanation: Add a line starting with # after a question
          </p>
          <div className="text-sm text-blue-700 mb-3 p-2 bg-blue-100 border border-blue-200 rounded">
            <strong>Separated Q&A formats also supported</strong> — put questions and answers in different sections:
            <br />
            <span className="font-medium">Option 1:</span> Numbered questions on top, numbered answers on the bottom (e.g. <code>1. The capital is ___</code> … <code>1. Paris #explanation</code>). Auto-detected when a number repeats.
            <br />
            <span className="font-medium">Option 2:</span> Passage with numbered blanks like <code>(1) ___</code>, followed by an <code>Answer key:</code> line and entries like <code>(1) [answer] #explanation</code>.
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="w-full p-3 border border-blue-300 rounded-lg h-40 font-mono text-sm"
                   placeholder={`A. Complete using the correct past perfect simple form of the verbs in brackets.

1. By the time I arrived, everyone [had left] (leave)!

2. Steve [had already seen] (already / see) the film, so he [hadn't come] (not / come) with us to the cinema.

3. Tina [hadn't finished] (not / finish) doing the housework by seven o'clock, so she [had called] (call) Andrea to tell her she would be late.

B. Fill in the blanks with the correct form.

1. The capital of France is [Paris].
#Paris has been the capital since the 10th century.

2. Water boils at [100] degrees Celsius.`}
          />
          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-1.5 text-sm text-blue-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={stripComments}
                onChange={(e) => setStripComments(e.target.checked)}
                className="rounded"
              />
              Strip comments <span className="text-xs text-gray-500">({`/* */ and /…/`})</span>
            </label>
          </div>
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
        <label className="block text-sm font-semibold text-orange-700">
          Questions
          <span className="text-xs font-normal text-gray-400 ml-1">({localQuestions.length})</span>
        </label>
        {localQuestions.map((question, index) => (
          <div key={question.id || index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-gray-700">Question {index + 1}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => handlePasteImageUrl(index)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" /> Image
                </button>
                <button type="button" onClick={() => handleInsertAudio(index)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                  <Music className="w-3 h-3" /> Audio
                </button>
                <button type="button" onClick={() => handleInsertLink(index)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1">
                  <LinkIcon className="w-3 h-3" /> Link
                </button>
                <div className="flex gap-1 ml-1 border-l pl-2 border-gray-300">
                  <button type="button" onClick={() => applyAlignment(index, 'left')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align left"><AlignLeft className="w-3 h-3" /></button>
                  <button type="button" onClick={() => applyAlignment(index, 'center')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align center"><AlignCenter className="w-3 h-3" /></button>
                  <button type="button" onClick={() => applyAlignment(index, 'right')} className="p-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align right"><AlignRight className="w-3 h-3" /></button>
                </div>
                <div className="flex gap-1 ml-1 border-l pl-2 border-gray-300">
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
            </div>

            {/* Question Text */}
            <div className="mb-4">
              <textarea
                value={question.question || ''}
                onChange={(e) => updateQuestion(index, 'question', e.target.value)}
                onKeyDown={(e) => handleRichTextShortcut(e, questionTextareasRef.current[index], question.question || '', (v) => updateQuestion(index, 'question', v))}
                onPaste={(e) => handleImagePaste(e, index)}
                ref={(el) => { questionTextareasRef.current[index] = el }}
                     className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                     rows={3}
                     placeholder="Type [answer] for blanks, e.g.: By the time I arrived, everyone [had left] (leave)! Use | or / for multiple answers: [I'm|I am]. You can also use _____ manually."
              />
              {/* Preview */}
              {question.question && (
                <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Preview:</p>
                  <div className="prose max-w-none leading-relaxed">
                    {(() => {
                      let blankIdx = 0
                      return question.question.split(/(_{5})/).map((part, i) => {
                        if (part === '_____') {
                          const currentBlank = question.blanks[blankIdx]
                          const answer = firstAnswer(currentBlank?.answer) || ''
                          const width = Math.max(60, answer.length * 10 + 24)
                          blankIdx++
                          return (
                            <span key={i} className="inline-block mx-1 align-baseline">
                              <span
                                className="inline-block border-b-2 border-blue-400 bg-blue-50 rounded-t px-2 py-0.5 text-blue-400 text-sm text-center"
                                style={{ minWidth: `${width}px` }}
                              >
                                {blankIdx}
                              </span>
                            </span>
                          )
                        }
                        return <RichTextRenderer key={i} content={markdownToHtml(part)} allowImages allowLinks className="inline" />
                      })
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Blanks */}
            {question.blanks.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Blanks ({question.blanks.length})
                </label>
                <div className="space-y-1.5">
                  {question.blanks.map((blank, blankIndex) => (
                    <div key={blankIndex} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded w-8 text-center flex-shrink-0">{blankIndex + 1}</span>
                      <input
                        type="text"
                        value={blank.answer}
                        onChange={(e) => updateBlank(index, blankIndex, 'answer', e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="correct answer(s), use | or / to separate"
                      />
                      {blank.text && <span className="text-xs text-gray-400 flex-shrink-0">({blank.text})</span>}
                      <label className="flex items-center gap-1 flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={blank.case_sensitive}
                          onChange={(e) => updateBlank(index, blankIndex, 'case_sensitive', e.target.checked)}
                          className="w-3.5 h-3.5"
                        />
                        <span className="text-xs text-gray-500">Aa</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Explanation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Explanation (Optional)
              </label>
              <textarea
                value={question.explanation || ''}
                onChange={(e) => updateQuestion(index, 'explanation', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Explain the answer or provide additional context..."
              />
            </div>
          </div>
        ))}

        {localQuestions.length === 0 && !bulkImportMode && (
          <div className="text-center py-8 text-gray-500">
            <HelpCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>No questions yet. Click "Add Question" or "Bulk Import" to start.</p>
          </div>
        )}
      </div>
    </div>
    {urlModal.isOpen && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">{urlModal.type === 'image' ? 'Thêm hình ảnh' : urlModal.type === 'audio' ? 'Thêm âm thanh' : 'Thêm liên kết'}</h3>
            <button onClick={handleUrlCancel} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder={urlModal.type === 'image' ? 'https://example.com/image.jpg' : urlModal.type === 'audio' ? 'https://example.com/audio.mp3' : 'https://example.com/link'} />
            </div>
            {urlModal.type === 'link' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Text hiển thị (tùy chọn)</label>
                <input type="text" value={linkText} onChange={(e) => setLinkText(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Reference" />
              </div>
            )}
            {urlModal.type === 'image' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Kích thước hình ảnh</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {[
                    { value: 'small', label: 'Nhỏ (200px)' },
                    { value: 'medium', label: 'Trung bình (400px)' },
                    { value: 'large', label: 'Lớn (600px)' },
                    { value: 'full', label: 'Toàn màn hình' }
                  ].map(s => (
                    <button key={s.value} type="button" onClick={() => setImageSize(s.value)} className={`p-2 rounded border text-sm ${imageSize === s.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 hover:border-gray-400'}`}>{s.label}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Rộng (px)</label>
                    <input type="number" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" placeholder="400" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Cao (px)</label>
                    <input type="number" value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" placeholder="300" />
                  </div>
                </div>
              </div>
            )}
            {urlModal.type === 'audio' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Tùy chọn âm thanh</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={audioControls} onChange={(e) => setAudioControls(e.target.checked)} /> Hiển thị controls</label>
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
                  Tốc độ phát:
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
            <button type="button" onClick={handleUrlCancel} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Hủy</button>
            <button type="button" onClick={handleUrlSubmit} disabled={!urlInput.trim()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">Chèn</button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

export default FillBlankEditor
