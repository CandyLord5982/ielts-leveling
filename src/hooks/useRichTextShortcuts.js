import { useCallback } from 'react'

/**
 * Standalone handler for Ctrl+B/I/U on a textarea.
 * Can be called directly in onKeyDown without using the hook.
 *
 * @param {KeyboardEvent} e
 * @param {HTMLTextAreaElement} textarea - the DOM element
 * @param {string} value - current text value
 * @param {function} onChange - callback with new value
 */
export const handleRichTextShortcut = (e, textarea, value, onChange) => {
  if (!e.ctrlKey && !e.metaKey) return

  const tagMap = { b: 'b', B: 'b', i: 'i', I: 'i', u: 'u', U: 'u' }
  const tag = tagMap[e.key]
  if (!tag) return

  e.preventDefault()
  if (!textarea) return

  const start = textarea.selectionStart || 0
  const end = textarea.selectionEnd || 0
  const text = value || ''
  const selectedText = text.substring(start, end)

  const openTag = `<${tag}>`
  const closeTag = `</${tag}>`
  const tagLen = openTag.length
  const closeLen = closeTag.length

  let newValue, newStart, newEnd

  if (selectedText) {
    const before = text.slice(Math.max(0, start - tagLen), start)
    const after = text.slice(end, Math.min(text.length, end + closeLen))

    if (before === openTag && after === closeTag) {
      newValue = text.slice(0, start - tagLen) + selectedText + text.slice(end + closeLen)
      newStart = start - tagLen
      newEnd = newStart + selectedText.length
    } else {
      newValue = text.slice(0, start) + openTag + selectedText + closeTag + text.slice(end)
      newStart = start + tagLen
      newEnd = newStart + selectedText.length
    }
  } else {
    newValue = text.slice(0, start) + openTag + closeTag + text.slice(end)
    newStart = start + tagLen
    newEnd = newStart
  }

  onChange(newValue)
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(newStart, newEnd)
  }, 0)
}

/**
 * Hook that provides Ctrl+B/I/U keyboard shortcuts for a single textarea.
 *
 * @param {React.RefObject} textareaRef - ref to the textarea element
 * @param {string} value - current text value
 * @param {function} onChange - callback with new value
 * @returns {function} onKeyDown handler to attach to the textarea
 */
const useRichTextShortcuts = (textareaRef, value, onChange) => {
  return useCallback((e) => {
    handleRichTextShortcut(e, textareaRef.current, value, onChange)
  }, [textareaRef, value, onChange])
}

export default useRichTextShortcuts
