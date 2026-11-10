import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import {
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Check,
  HelpCircle,
  Sparkles,
  X
} from 'lucide-react'
import { handleRichTextShortcut } from '../../../hooks/useRichTextShortcuts'
import RichTextField from './shared/RichTextField'
import AutoGrowTextarea from './shared/AutoGrowTextarea'
import { formatMultipleChoiceWithAI } from '../../../utils/aiQuestionFormatter'

const MultipleChoiceEditor = ({ questions, onQuestionsChange, settings, onSettingsChange, intro, onIntroChange, folderPath, focusQuestionId, exerciseTitle = '', onCreateFromQuestions }) => {
  const normalizeQuestion = (q, idx = 0) => {
    const safeOptions = Array.isArray(q?.options) ? q.options : ['', '', '', '']
    const baseOptionExplanations = Array.isArray(q?.option_explanations)
      ? q.option_explanations
      : Array(safeOptions.length).fill('')
    // Ensure option_explanations length matches options
    const safeOptionExplanations = safeOptions.map((_, i) => baseOptionExplanations[i] || '')
    const safeCorrect = Number.isInteger(q?.correct_answer) ? q.correct_answer : 0
    return {
      id: q?.id || `q${Date.now()}_${idx}`,
      intro: q?.intro || '',
      question: q?.question || '',
      options: safeOptions,
      correct_answer: Math.min(Math.max(0, safeCorrect), Math.max(0, safeOptions.length - 1)),
      explanation: q?.explanation || '',
      option_explanations: safeOptionExplanations,
      original_text: q?.original_text || '',
      image_url: q?.image_url || '',
      reference_url: q?.reference_url || '',
      shuffle_options: q?.shuffle_options !== undefined ? q.shuffle_options : true,
      audio_url: q?.audio_url || '',
      max_audio_plays: q?.max_audio_plays || 0,
      ...(q?.ai_answer_guessed ? { ai_answer_guessed: true } : {})
    }
  }

  const [localQuestions, setLocalQuestions] = useState((questions || []).map((q, i) => normalizeQuestion(q, i)))
  // Option field being edited (`${questionIndex}-${optionIndex}`): it expands to show its full text
  const [focusedOption, setFocusedOption] = useState(null)
  const [bulkImportMode, setBulkImportMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [lastBulkText, setLastBulkText] = useState('')
  const [stripComments, setStripComments] = useState(false)
  const [aiFormatting, setAiFormatting] = useState(false)

  // Load lastBulkText from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('xpclass_last_bulk_text')
      if (saved) setLastBulkText(saved)
    } catch { /* ignore */ }
  }, [])
  const questionInputRefs = useRef({})
  const explanationInputRefs = useRef({})
  const [collapsedQuestions, setCollapsedQuestions] = useState({})
  const [undoHistory, setUndoHistory] = useState({})
  const [redoHistory, setRedoHistory] = useState({})

  // Settings state
  const [localSettings, setLocalSettings] = useState({
    view_mode: 'one-by-one', // 'one-by-one' or 'all-at-once'
    ...settings
  })

  useEffect(() => {
    setLocalQuestions((questions || []).map((q, i) => normalizeQuestion(q, i)))
  }, [questions])

  // Opened from a preview: scroll to (and briefly highlight) the question being viewed.
  const focusedRef = useRef(null)
  useEffect(() => {
    if (!focusQuestionId || focusedRef.current === focusQuestionId) return
    const el = document.querySelector(`[data-question-id="${CSS.escape(String(focusQuestionId))}"]`)
    if (!el) return
    focusedRef.current = focusQuestionId
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('ring-2', 'ring-blue-400')
    const t = setTimeout(() => el.classList.remove('ring-2', 'ring-blue-400'), 2500)
    return () => clearTimeout(t)
  }, [focusQuestionId, localQuestions])

  useEffect(() => {
    if (settings) {
      setLocalSettings(prev => ({ ...prev, ...settings }))
    }
  }, [settings])

  const updateSetting = (key, value) => {
    const newSettings = { ...localSettings, [key]: value }
    setLocalSettings(newSettings)
    if (onSettingsChange) {
      onSettingsChange(newSettings)
    }
  }

  const addQuestion = () => {
    const newQuestion = {
      id: `q${Date.now()}`,
      question: '',
      options: ['', '', '', ''],
      correct_answer: 0,
      explanation: '',
      shuffle_options: true
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

  // --- Select mode: extract questions into new exercises / split into parts ---
  // onCreateFromQuestions is provided by EditExerciseModal: ([{ title, questions }]) => Promise<boolean>
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set()) // indices into localQuestions
  const [bulkBusy, setBulkBusy] = useState(false)

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const toggleSelected = (index) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  // Accepts "1-15, 20, 25-30" (1-based)
  const selectRange = () => {
    const input = window.prompt('Select questions (e.g. 1-15, 20, 25-30):')
    if (!input) return
    const next = new Set(selected)
    for (const part of input.split(',')) {
      const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
      if (!m) continue
      const from = Number(m[1])
      const to = Number(m[2] || m[1])
      for (let n = Math.min(from, to); n <= Math.max(from, to); n++) {
        if (n >= 1 && n <= localQuestions.length) next.add(n - 1)
      }
    }
    setSelected(next)
  }

  // Fresh copies so the new exercises don't share option arrays with this one
  const cloneQuestions = (list) => list.map(q => JSON.parse(JSON.stringify(q)))

  const extractSelected = async () => {
    if (selected.size === 0 || !onCreateFromQuestions) return
    const title = window.prompt('Title for the new exercise:', `${exerciseTitle} (Extract)`.trim())
    if (!title || !title.trim()) return
    const questions = cloneQuestions(localQuestions.filter((_, i) => selected.has(i)))
    setBulkBusy(true)
    const ok = await onCreateFromQuestions([{ title: title.trim(), questions }])
    setBulkBusy(false)
    if (ok) exitSelectMode()
  }

  const removeSelected = () => {
    if (selected.size === 0) return
    if (!window.confirm(`Remove ${selected.size} selected question(s) from this exercise? (Click Save to apply.)`)) return
    const updated = localQuestions.filter((_, i) => !selected.has(i))
    setLocalQuestions(updated)
    onQuestionsChange(updated)
    exitSelectMode()
  }

  const splitIntoParts = async () => {
    if (!onCreateFromQuestions || localQuestions.length < 2) return
    const input = window.prompt(`Split ${localQuestions.length} questions into how many exercises?`, '2')
    const parts = Number(input)
    if (!Number.isInteger(parts) || parts < 2 || parts > localQuestions.length) return
    const size = Math.ceil(localQuestions.length / parts)
    const groups = []
    for (let p = 0; p < parts; p++) {
      const chunk = localQuestions.slice(p * size, (p + 1) * size)
      if (chunk.length) groups.push({ title: `${exerciseTitle} (Part ${p + 1})`.trim(), questions: cloneQuestions(chunk) })
    }
    if (!window.confirm(`Create ${groups.length} new exercises (${groups.map(g => g.questions.length).join(' / ')} questions)? This exercise stays unchanged.`)) return
    setBulkBusy(true)
    const ok = await onCreateFromQuestions(groups)
    setBulkBusy(false)
    if (ok) exitSelectMode()
  }

  const removeQuestion = (index) => {
    const updatedQuestions = localQuestions.filter((_, i) => i !== index)
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const updateQuestion = (index, field, value, saveToHistory = true) => {
    // Save to undo history before updating
    if (saveToHistory && (field === 'question' || field === 'explanation')) {
      const historyKey = `${index}_${field}`
      setUndoHistory(prev => ({
        ...prev,
        [historyKey]: [...(prev[historyKey] || []), localQuestions[index]?.[field] || '']
      }))
      // Clear redo history when new change is made
      setRedoHistory(prev => ({
        ...prev,
        [historyKey]: []
      }))
    }

    const updatedQuestions = localQuestions.map((q, i) => {
      if (i !== index) return q
      const next = { ...q, [field]: value }
      // Teacher confirmed the answer: drop the "AI guessed" flag
      if (field === 'correct_answer') delete next.ai_answer_guessed
      return next
    })
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const handleKeyboardShortcut = (e, index, field = 'question') => {
    // Only handle Ctrl/Cmd key combinations
    if (!e.ctrlKey && !e.metaKey) return

    const textarea = field === 'question'
      ? questionInputRefs.current[index]
      : explanationInputRefs.current[index]
    if (!textarea) return

    const value = localQuestions[index]?.[field] || ''
    const historyKey = `${index}_${field}`

    // Ctrl+B/I/U - Bold/Italic/Underline
    if (/^[biuBIU]$/.test(e.key)) {
      handleRichTextShortcut(e, textarea, value, (v) => updateQuestion(index, field, v))
      return
    }

    // Ctrl+Z - Undo
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault()
      const history = undoHistory[historyKey] || []
      if (history.length > 0) {
        const previousValue = history[history.length - 1]
        const currentValue = localQuestions[index]?.[field] || ''

        // Save current state to redo
        setRedoHistory(prev => ({
          ...prev,
          [historyKey]: [...(prev[historyKey] || []), currentValue]
        }))

        // Remove from undo history
        setUndoHistory(prev => ({
          ...prev,
          [historyKey]: history.slice(0, -1)
        }))

        // Restore previous value
        updateQuestion(index, field, previousValue, false)

        setTimeout(() => {
          textarea.focus()
          textarea.setSelectionRange(previousValue.length, previousValue.length)
        }, 0)
      }
      return
    }

    // Ctrl+Y or Ctrl+Shift+Z - Redo
    if ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
      e.preventDefault()
      const history = redoHistory[historyKey] || []
      if (history.length > 0) {
        const nextValue = history[history.length - 1]
        const currentValue = localQuestions[index]?.[field] || ''

        // Save current state to undo
        setUndoHistory(prev => ({
          ...prev,
          [historyKey]: [...(prev[historyKey] || []), currentValue]
        }))

        // Remove from redo history
        setRedoHistory(prev => ({
          ...prev,
          [historyKey]: history.slice(0, -1)
        }))

        // Restore next value
        updateQuestion(index, field, nextValue, false)

        setTimeout(() => {
          textarea.focus()
          textarea.setSelectionRange(nextValue.length, nextValue.length)
        }, 0)
      }
      return
    }
  }

  const updateOption = (questionIndex, optionIndex, value) => {
    const updatedQuestions = localQuestions.map((q, i) =>
      i === questionIndex
        ? {
            ...q,
            options: q.options.map((opt, oi) => oi === optionIndex ? value : opt),
            option_explanations: (q.option_explanations || Array(q.options.length).fill(''))
              .map((exp, oi) => oi === optionIndex ? (q.option_explanations?.[oi] || '') : exp)
          }
        : q
    )
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const addOption = (questionIndex) => {
    const updatedQuestions = localQuestions.map((q, i) =>
      i === questionIndex
        ? { ...q, options: [...q.options, ''], option_explanations: [...(q.option_explanations || []), ''] }
        : q
    )
    setLocalQuestions(updatedQuestions)
    onQuestionsChange(updatedQuestions)
  }

  const removeOption = (questionIndex, optionIndex) => {
    const question = localQuestions[questionIndex]
    if (question.options.length <= 2) return // Keep at least 2 options

    const updatedQuestions = localQuestions.map((q, i) =>
      i === questionIndex
        ? {
            ...q,
            options: q.options.filter((_, oi) => oi !== optionIndex),
            option_explanations: (q.option_explanations || []).filter((_, oi) => oi !== optionIndex),
            // Adjust correct_answer if needed
            correct_answer: q.correct_answer >= optionIndex ? Math.max(0, q.correct_answer - 1) : q.correct_answer
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

  const toggleCollapse = (index) => {
    setCollapsedQuestions(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  const toggleAllQuestions = () => {
    const anyExpanded = localQuestions.some((_, index) => !collapsedQuestions[index])

    if (anyExpanded) {
      // Collapse all
      const allCollapsed = {}
      localQuestions.forEach((_, index) => {
        allCollapsed[index] = true
      })
      setCollapsedQuestions(allCollapsed)
    } else {
      // Expand all
      setCollapsedQuestions({})
    }
  }

  const processBulkImport = () => {
    try {
      // First, try to detect if this is Moodle Cloze format
      if (bulkText.includes('{1:MCV:') || bulkText.includes('{1:MC:') || bulkText.includes('{1:MCVS:') || bulkText.includes('{=')) {
        processMoodleCloze()
        return
      }

      // Optionally remove comments from the text
      const textWithoutComments = stripComments
        ? bulkText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/[^/\n]+\//g, '')
        : bulkText

      // Pre-process: split lines that have multiple options on one line
      // e.g. "A. cat   B. dog   C. bird   D. fish" or "(A) cat  (B) dog  (C) bird"
      const expandedLines = []
      textWithoutComments.split('\n').forEach(line => {
        const trimmed = line.trim()
        if (!trimmed) return
        // Check if line has multiple options: letter prefix repeated with 2+ spaces or tabs between
        const multiOptionMatch = trimmed.match(/(?:^|\s{2,}|\t+)(?:\(?[A-Da-d]\)?[\s]*[.):]\s*\S)/g)
        if (multiOptionMatch && multiOptionMatch.length >= 2) {
          // Split on 2+ spaces or tabs before a letter prefix
          const parts = trimmed.split(/\s{2,}|\t+/).filter(p => p.trim())
          parts.forEach(p => expandedLines.push(p.trim()))
        } else {
          expandedLines.push(trimmed)
        }
      })

      const lines = expandedLines.filter(line => line.trim())
      const newQuestions = []

      let currentQuestion = null
      let optionCounter = 0
      const introLines = []

      // Regex for question prefixes: Q:, Question 1, Quest 1, Câu 1, Câu hỏi 1, or just number with . ) : -
      const questionRegex = /^(Q\s*\d*[.:)\u002D]|Question\s*\d+|Quest\s*\d+|Câu\s*(hỏi\s*)?\d+|C\d+\s*[.:)\u002D]|\d+[.:)\u002D])/i
      // Regex for option prefixes: A. A: A) (A) (a) or numbered options
      const optionRegex = /^\(?[A-Za-z]\)?[\s]*[.):\u002D]\s*|^\(?[A-Za-z]\)\s+|^\d+[.)\u002D]\s*/
      // Regex for answer/correct line: "Answer: A", "Đáp án: A", "Correct: B"
      const answerLineRegex = /^(Answer|Ans|Correct|Đáp\s*án|Dap\s*an)\s*[.:\u002D]\s*(.+)/i

      const parseOption = (trimmedLine) => {
        const startsWithEquals = trimmedLine.startsWith('=')

        let optionText = trimmedLine
          .replace(/^=\s*/, '')
          .replace(/^\(?([A-Za-z])\)?\s*[.:)\u002D]\s*/, '')  // (A) A. A: A) A-
          .replace(/^\d+\s*[.:)\u002D]\s*/, '')
        let optionExplanation = ''

        if (optionText.includes('#')) {
          const [before, after] = optionText.split('#')
          optionText = before.trim()
          optionExplanation = (after || '').trim()
        }

        // Correct markers: *, bold **text**, or = prefix
        const isCorrect = optionText.includes('*') || startsWithEquals
        optionText = optionText.replace(/\*+/g, '').trim()

        return { optionText, optionExplanation, isCorrect }
      }

      lines.forEach((line, index) => {
        const trimmedLine = line.trim()

        // Question line
        if (trimmedLine.match(questionRegex)) {
          if (currentQuestion) {
            newQuestions.push(currentQuestion)
          }
          currentQuestion = {
            id: `q${Date.now()}_${index}`,
            question: trimmedLine.replace(/^(Q\s*\d*[.:)\u002D]|Question\s*\d+\s*[.:)\u002D]?\s*|Quest\s*\d+\s*[.:)\u002D]?\s*|Câu\s*(hỏi\s*)?\d+\s*[.:)\u002D]?\s*|C\d+\s*[.:)\u002D]\s*|\d+[.:)\u002D]\s*)/i, ''),
            options: [],
            correct_answer: 0,
            explanation: '',
            option_explanations: []
          }
          optionCounter = 0
        }
        // Lines before first question go to intro
        else if (!currentQuestion && trimmedLine && !/^#/.test(trimmedLine)) {
          introLines.push(trimmedLine)
        }
        // Explanation line starting with #
        else if (currentQuestion && /^#/.test(trimmedLine)) {
          const expl = trimmedLine.replace(/^#\s*/, '')
          currentQuestion.explanation = currentQuestion.explanation
            ? currentQuestion.explanation + '\n' + expl
            : expl
        }
        // Answer/correct line: "Answer: A" or "Đáp án: B"
        else if (currentQuestion && trimmedLine.match(answerLineRegex)) {
          const match = trimmedLine.match(answerLineRegex)
          const answerValue = match[2].trim().toUpperCase()
          // If it's a single letter, map to option index
          if (answerValue.length === 1 && answerValue >= 'A' && answerValue <= 'Z') {
            currentQuestion.correct_answer = answerValue.charCodeAt(0) - 65
          }
        }
        // Explanation line (starts with Explanation:)
        else if (currentQuestion && trimmedLine.match(/^(Explanation|Giải\s*thích)\s*[.:\u002D]/i)) {
          currentQuestion.explanation = trimmedLine.replace(/^(Explanation|Giải\s*thích)\s*[.:\u002D]\s*/i, '')
        }
        // Answer options
        else if (currentQuestion && (trimmedLine.match(optionRegex) || trimmedLine.match(/^\(?[A-Za-z]\)\s+/) || trimmedLine.match(/^(True|False|Yes|No|NG|Not Given)/i) || trimmedLine.match(/^[TF]$/i) || trimmedLine.startsWith('='))) {
          const { optionText, optionExplanation, isCorrect } = parseOption(trimmedLine)
          if (optionText) {
            if (isCorrect) {
              currentQuestion.correct_answer = optionCounter
            }
            currentQuestion.options.push(optionText)
            currentQuestion.option_explanations.push(optionExplanation)
            optionCounter++
          }
        }
        // Continue question text
        else if (currentQuestion && trimmedLine) {
          if (currentQuestion.question) {
            currentQuestion.question += '\n' + line
          } else {
            currentQuestion.question = line
          }
        }
      })

      if (currentQuestion) {
        newQuestions.push(currentQuestion)
      }

      if (newQuestions.length > 0) {
        setLastBulkText(bulkText)
        try { localStorage.setItem('xpclass_last_bulk_text', bulkText) } catch { /* ignore */ }
        // Set intro from lines before first question
        if (introLines.length > 0 && onIntroChange) {
          const newIntro = introLines.join('\n')
          const existing = intro || ''
          onIntroChange(existing ? existing + '\n' + newIntro : newIntro)
        }
        // Attach original_text to every imported question
        const updatedQuestions = [...localQuestions, ...newQuestions.map(q => ({ ...q, original_text: bulkText }))]
        setLocalQuestions(updatedQuestions)
        onQuestionsChange(updatedQuestions)
        // Keep modal open and keep the text visible
        alert(`Successfully imported ${newQuestions.length} questions!`)
      }
    } catch {
      alert('Error processing bulk import. Please check your format.')
    }
  }

  // AI Format: let Groq restructure messy pasted text into questions (no content generation)
  const processAIImport = async () => {
    if (!bulkText.trim() || aiFormatting) return
    setAiFormatting(true)
    try {
      const { intro: aiIntro, questions: aiQuestions } = await formatMultipleChoiceWithAI(bulkText)
      if (aiQuestions.length === 0) {
        alert('AI found no questions in the text.')
        return
      }
      setLastBulkText(bulkText)
      try { localStorage.setItem('xpclass_last_bulk_text', bulkText) } catch { /* ignore */ }
      if (aiIntro && onIntroChange) {
        const existing = intro || ''
        onIntroChange(existing ? existing + '\n' + aiIntro : aiIntro)
      }
      const updatedQuestions = [
        ...localQuestions,
        ...aiQuestions.map((q, i) => normalizeQuestion({ ...q, original_text: bulkText }, localQuestions.length + i))
      ]
      setLocalQuestions(updatedQuestions)
      onQuestionsChange(updatedQuestions)
      const guessed = aiQuestions.filter(q => q.ai_answer_guessed).length
      alert(
        `AI imported ${aiQuestions.length} questions.` +
        (guessed ? `\n\n⚠️ ${guessed} had no answer in the text — the AI guessed them. They're marked "AI guessed" — please check.` : '')
      )
    } catch (err) {
      alert(`AI format failed: ${err.message}`)
    } finally {
      setAiFormatting(false)
    }
  }

  const processMoodleCloze = () => {
    try {
      const newQuestions = []

      // First, merge multi-line cloze patterns into single lines
      let processedText = bulkText

      // Replace newlines within cloze patterns with spaces
      // Match opening brace until closing brace, even across newlines
      processedText = processedText.replace(/\{1:(MCV|MC|MULTICHOICE):([^}]*)\}/gs, (match) => {
        // Remove newlines but preserve the structure
        // Keep ~ separators intact by adding space before them if needed
        return match.replace(/\s*\n\s*~/g, '~').replace(/\s*\n\s*/g, ' ')
      })

      const lines = processedText.split('\n')

      let questionCounter = 0
      let currentQuestionText = ''
      let explanationText = ''

      lines.forEach((line) => {
        const trimmed = line.trim()
        if (!trimmed) return

        // Check if this line starts a new question (Question 1, Question 2, etc.)
        if (/^Question\s+\d+/i.test(trimmed)) {
          // Save any accumulated question text and start fresh
          currentQuestionText = ''
          explanationText = ''
          return
        }

        // Explanation lines starting with #
        if (/^#/.test(trimmed)) {
          const expl = trimmed.replace(/^#\s*/, '')
          explanationText = explanationText ? `${explanationText}\n${expl}` : expl
          return
        }

        // Check if line contains a cloze pattern
        const clozeMatches = [
          ...trimmed.matchAll(/\{1:MCV:([^}]+)\}/g),
          ...trimmed.matchAll(/\{1:MC:([^}]+)\}/g),
          ...trimmed.matchAll(/\{1:MULTICHOICE:([^}]+)\}/g)
        ]

        // If no cloze pattern, accumulate this line as part of question text
        if (clozeMatches.length === 0) {
          if (currentQuestionText) {
            currentQuestionText += '\n' + trimmed
          } else {
            currentQuestionText = trimmed
          }
          return
        }

        // Process each cloze pattern on this line
        clozeMatches.forEach((match) => {
          const optionsContent = match[1]
          const rawOptions = optionsContent.split('~').filter(opt => opt.trim())

        const options = []
        const optionExplanations = []
          let correctIndex = 0

          rawOptions.forEach((opt) => {
            if (!opt.trim()) return
            const isCorrect = opt.trim().startsWith('=')
            const clean = opt.replace(/^=/, '').trim()
          // Capture optional inline explanations after # per option
          let optionText = clean
          if (clean.includes('#')) {
            const [before, after] = clean.split('#')
            optionText = before.trim()
            const perOptionExplanation = (after || '').trim()
            // Temporarily push placeholder; set explanation after pushing option
            // We'll align indices with options
            // Note: we don't merge per-option explanation into global explanationText
            // so that UI can show explanation specific to the selected option
            if (perOptionExplanation) {
              optionExplanations.push(perOptionExplanation)
            } else {
              optionExplanations.push('')
            }
          } else {
            optionText = optionText.trim()
            optionExplanations.push('')
          }
            // Remove A., B., C., D. prefixes (or any letter followed by dot/parenthesis)
            optionText = optionText.replace(/^[A-Za-z][.)]\s*/, '')
            if (!optionText) return
            options.push(optionText)
            if (isCorrect) correctIndex = options.length - 1
          })

          if (options.length >= 2) {
            // Combine accumulated question text with current line
            let fullQuestion = currentQuestionText ? currentQuestionText + '\n' + trimmed : trimmed
            // Remove the cloze pattern from the question text
            const displayText = fullQuestion.replace(match[0], '')

            newQuestions.push({
              id: `q${Date.now()}_${questionCounter++}`,
              question: displayText,
              options,
              correct_answer: correctIndex,
            explanation: explanationText,
            option_explanations: optionExplanations,
              shuffle_options: true
            })

            // Reset accumulated text after creating question
            currentQuestionText = ''
            explanationText = ''
          }
        })
      })

      if (newQuestions.length > 0) {
        setLastBulkText(bulkText)
        try { localStorage.setItem('xpclass_last_bulk_text', bulkText) } catch { /* ignore */ }
        // Attach original_text to every imported question
        const updatedQuestions = [...localQuestions, ...newQuestions.map(q => ({ ...q, original_text: bulkText }))]
        setLocalQuestions(updatedQuestions)
        onQuestionsChange(updatedQuestions)
        // Keep modal open and keep the text visible
        alert(`Successfully imported ${newQuestions.length} Moodle Cloze questions!`)
      } else {
        alert('No valid Moodle Cloze questions found. Please check the format.')
      }
    } catch (error) {
      console.error('Moodle Cloze parsing error:', error)
      alert('Error parsing Moodle Cloze format. Please check your format or try the simple format instead.')
    }
  }


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-medium text-gray-900">Multiple Choice Questions</h3>
        <div className="flex flex-wrap gap-2">
        
          {/* Exercise Intro (applies to all questions) */}
          
          <button
            type="button"
            onClick={() => setBulkImportMode(!bulkImportMode)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            Bulk
          </button>
          <button
            type="button"
            onClick={() => updateSetting('view_mode', localSettings.view_mode === 'one-by-one' ? 'all-at-once' : 'one-by-one')}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
          >
            {localSettings.view_mode === 'one-by-one' ? 'One by One' : 'All at Once'}
          </button>
          <button
            type="button"
            onClick={() => updateSetting('layout', localSettings.layout === 'split' ? 'stacked' : 'split')}
            className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm"
            title="Split: question on the left, options stacked on the right (desktop only)"
          >
            Layout: {localSettings.layout === 'split' ? 'Split' : 'Stacked'}
          </button>
          <button
            type="button"
            onClick={() => updateSetting('shuffle_questions', !localSettings.shuffle_questions)}
            className={`flex items-center gap-2 px-3 py-2 text-white rounded-lg text-sm ${localSettings.shuffle_questions ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-400 hover:bg-gray-500'}`}
            title="Randomize the order of questions for each student"
          >
            Shuffle questions: {localSettings.shuffle_questions ? 'On' : 'Off'}
          </button>
          {onCreateFromQuestions && localQuestions.length > 1 && (
            <button
              type="button"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              className={`flex items-center gap-2 px-3 py-2 text-white rounded-lg text-sm ${selectMode ? 'bg-indigo-700' : 'bg-indigo-500 hover:bg-indigo-600'}`}
            >
              {selectMode ? 'Done selecting' : 'Select / Split'}
            </button>
          )}
          {localQuestions.length > 0 && (
            <button
              type="button"
              onClick={toggleAllQuestions}
              className="flex items-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
            >
              {localQuestions.some((_, index) => !collapsedQuestions[index]) ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Expand
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
            Add 1
          </button>
        </div>
      </div>

    {selectMode && (
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm">
        <span className="font-medium text-indigo-900">{selected.size} selected</span>
        <button type="button" onClick={() => setSelected(new Set(localQuestions.map((_, i) => i)))} className="px-2 py-1 text-indigo-700 hover:underline">All</button>
        <button type="button" onClick={() => setSelected(new Set())} className="px-2 py-1 text-indigo-700 hover:underline">None</button>
        <button type="button" onClick={selectRange} className="px-2 py-1 text-indigo-700 hover:underline">Range…</button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={extractSelected}
          disabled={selected.size === 0 || bulkBusy}
          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
        >
          Copy to new exercise
        </button>
        <button
          type="button"
          onClick={removeSelected}
          disabled={selected.size === 0 || bulkBusy}
          className="px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40"
        >
          Remove from this exercise
        </button>
        <button
          type="button"
          onClick={splitIntoParts}
          disabled={bulkBusy}
          className="px-3 py-1.5 bg-white text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-40"
        >
          Split all into N exercises…
        </button>
      </div>
    )}

    {/* Global Intro Section */}
    <div className="bg-white p-4 border-l-4 border-l-blue-400 border border-gray-200 rounded-lg">
      <RichTextField
        value={intro || ''}
        onChange={(v) => onIntroChange && onIntroChange(v)}
        folderPath={folderPath}
        preview={false}
        toolbarLead={
          <label className="text-sm font-semibold text-blue-700 mr-auto">
            Intro
            <span className="text-xs font-normal text-gray-400 ml-1">(Optional)</span>
          </label>
        }
        placeholder="Nhập nội dung giới thiệu chung cho bài trắc nghiệm..."
      />
    </div>


      {/* Bulk Import Mode */}
      {bulkImportMode && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">Bulk Import Questions</h4>
          <div className="text-sm text-blue-700 mb-3 space-y-1">
            <p><strong>Supported formats:</strong></p>
            <p>• Question: <code>Q1.</code> <code>Câu 1:</code> <code>Question 1)</code> <code>1.</code> <code>1-</code></p>
            <p>• Options: <code>A.</code> <code>A)</code> <code>(A)</code> <code>a:</code> — on separate lines or one line with 2+ spaces</p>
            <p>• Correct: <code>*</code> after option, or <code>Answer: A</code> / <code>Đáp án: B</code> on its own line</p>
            <p>• Explanation: <code>#</code> or <code>Explanation:</code> or <code>Giải thích:</code></p>
            <p>• Also supports <strong>Moodle Cloze</strong>: {`{1:MC:=Correct~Wrong~Wrong}`}</p>
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="w-full p-3 border border-blue-300 rounded-lg h-40 font-mono text-sm"
            placeholder={`Q1: What does "Hello" mean in Vietnamese?
A: Xin chào *
B: Tạm biệt
C: Cảm ơn
D: Xin lỗi
# Hello means Xin chào in Vietnamese.

Question 2
Good morning in Vietnamese is {1:MC:=Chào buổi sáng#Correct explanation~Chào buổi chiều#Afternoon greeting~Tạm biệt#Means goodbye}
# Extra note for the whole question`}
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
            <span className="text-xs text-gray-500">Văn bản cuối: {lastBulkText ? `${Math.min(lastBulkText.length, 60)} chars` : 'none'}</span>
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
              onClick={processAIImport}
              disabled={!bulkText.trim() || aiFormatting}
              className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Let AI turn messy text into questions. It restructures only — doesn't write new content."
            >
              <Sparkles className="w-4 h-4" />
              {aiFormatting ? 'AI formatting…' : 'AI Format'}
            </button>
            <button
              type="button"
              onClick={processBulkImport}
              disabled={aiFormatting}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
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
        {localQuestions.map((question, index) => {
          const isCollapsed = collapsedQuestions[index]
          return (
          <div key={question.id || index} data-question-id={question.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50 transition-shadow">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={() => toggleSelected(index)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                )}
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
                  {question.ai_answer_guessed && (
                    <span
                      className="ml-2 px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 rounded"
                      title="No answer was in the pasted text, so the AI picked one. Click the correct option to confirm."
                    >
                      AI guessed answer
                    </span>
                  )}
                  {isCollapsed && question.question && (
                    <span className="ml-2 text-xs text-gray-500 truncate max-w-md inline-block">
                      - {question.question.substring(0, 50)}{question.question.length > 50 ? '...' : ''}
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
              <div>

            {/* Removed per requirement: intro is now global, not per-question */}

            {/* Question Text */}
            <div className="mb-4">
              <RichTextField
                value={question.question || ''}
                onChange={(v) => updateQuestion(index, 'question', v)}
                folderPath={folderPath}
                onKeyDown={(e) => handleKeyboardShortcut(e, index)}
                textareaRef={(el) => (questionInputRefs.current[index] = el)}
                toolbarExtra={
                  <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={question.shuffle_options !== false} onChange={(e) => updateQuestion(index, 'shuffle_options', e.target.checked)} className="w-3 h-3 text-blue-600 rounded" />
                    Randomize
                  </label>
                }
                placeholder="Enter your question here..."
              />
            </div>


            {/* Options */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Options
                </label>
                <button
                  type="button"
                  onClick={() => addOption(index)}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  Add Option
                </button>
              </div>
              {/* Options row */}
              <div className="flex gap-1.5 items-center">
                {(question.options || []).map((option, optionIndex) => (
                  <div key={optionIndex} className={`${focusedOption === `${index}-${optionIndex}` ? 'flex-[4]' : 'flex-1'} flex items-start gap-1 min-w-0`}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => updateQuestion(index, 'correct_answer', optionIndex)}
                      className={`p-1 rounded border-2 transition-colors shrink-0 ${
                        question.correct_answer === optionIndex
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-300 hover:border-green-300'
                      }`}
                      title={question.correct_answer === optionIndex ? 'Correct answer' : 'Click to mark as correct'}
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-medium text-gray-500 shrink-0 pt-1.5">{String.fromCharCode(65 + optionIndex)}</span>
                    <AutoGrowTextarea
                      singleLine
                      value={option}
                      onFocus={() => setFocusedOption(`${index}-${optionIndex}`)}
                      onBlur={() => setFocusedOption(null)}
                      onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && /^[biuBIU]$/.test(e.key)) {
                          handleRichTextShortcut(e, e.target, option, (v) => updateOption(index, optionIndex, v))
                        }
                      }}
                      className="w-full min-w-0 px-2 py-1 text-sm leading-5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      placeholder={String.fromCharCode(65 + optionIndex)}
                    />
                    {question.options.length > 2 && (
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => removeOption(index, optionIndex)} className="p-0.5 mt-1 text-red-400 hover:text-red-600 shrink-0" title="Remove">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {/* Explanations row */}
              <div className="flex gap-1.5">
                {(question.options || []).map((_, optionIndex) => (
                  <input
                    key={optionIndex}
                    type="text"
                    value={(question.option_explanations && question.option_explanations[optionIndex]) || ''}
                    onChange={(e) => {
                      const value = e.target.value
                      const updated = localQuestions.map((q, qi) =>
                        qi === index
                          ? {
                              ...q,
                              option_explanations: (q.option_explanations || Array(q.options.length).fill('')).map((exp, ei) =>
                                ei === optionIndex ? value : exp
                              )
                            }
                          : q
                      )
                      setLocalQuestions(updated)
                      onQuestionsChange(updated)
                    }}
                    className={`${focusedOption === `${index}-${optionIndex}` ? 'flex-[4]' : 'flex-1'} min-w-0 px-2 py-1 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 bg-gray-50`}
                    placeholder={`${String.fromCharCode(65 + optionIndex)} explanation`}
                  />
                ))}
              </div>
            </div>


            {/* Original Import Text */}
            {question.original_text && (
              <div>
                <details className="mt-2">
                  <summary className="text-xs text-gray-600 cursor-pointer">Original import text</summary>
                  <pre className="mt-1 p-2 bg-gray-50 border rounded text-xs whitespace-pre-wrap">{question.original_text}</pre>
                </details>
              </div>
            )}

              </div>
            )}
          </div>
        )
        })}

        {localQuestions.length === 0 && !bulkImportMode && (
          <div className="text-center py-8 text-gray-500">
            <HelpCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>No questions yet. Click &quot;Add Question&quot; or &quot;Bulk Import&quot; to start.</p>
          </div>
        )}
      </div>

    </div>
  )
}


MultipleChoiceEditor.propTypes = {
  questions: PropTypes.array,
  onQuestionsChange: PropTypes.func,
  settings: PropTypes.object,
  onSettingsChange: PropTypes.func,
  intro: PropTypes.string,
  onIntroChange: PropTypes.func,
  folderPath: PropTypes.string
}

export default MultipleChoiceEditor