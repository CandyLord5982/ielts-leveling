import { forwardRef, useCallback, useLayoutEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'

const grow = (el) => {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

/**
 * A textarea that stays compact until focused, then grows to show its full text.
 *
 * - Default: behaves like a normal textarea (set `rows` for the collapsed size).
 * - `singleLine`: collapsed it looks like a one-line input (text clipped, no wrap);
 *   focused it wraps and grows. Enter is blocked (and IME composition is left alone).
 *
 * Every other prop (value, onChange, onKeyDown, onPaste, placeholder...) is passed through.
 */
const AutoGrowTextarea = forwardRef(function AutoGrowTextarea(
  { singleLine = false, rows, value, onFocus, onBlur, onKeyDown, className = '', ...rest },
  ref
) {
  const innerRef = useRef(null)
  const [focused, setFocused] = useState(false)

  const setRefs = useCallback((el) => {
    innerRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }, [ref])

  // Re-measure when focused and whenever the text changes (typing, pasted/inserted content).
  useLayoutEffect(() => {
    if (focused && innerRef.current) grow(innerRef.current)
  }, [focused, value])

  // The parent may change this field's width when it gains focus (e.g. a flex row giving it
  // more room). Re-measure whenever the width changes so wrapped text gets the right height.
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!focused || !el || typeof ResizeObserver === 'undefined') return undefined
    let lastWidth = el.offsetWidth
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth !== lastWidth) {
        lastWidth = el.offsetWidth
        grow(el)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [focused])

  const stateClass = focused
    ? `overflow-hidden resize-none ${singleLine ? 'whitespace-pre-wrap break-words' : ''}`
    : singleLine
      ? 'overflow-hidden resize-none whitespace-nowrap'
      : ''

  return (
    <textarea
      {...rest}
      ref={setRefs}
      rows={rows ?? (singleLine ? 1 : 2)}
      value={value}
      className={`${className} ${stateClass}`}
      onFocus={(e) => { setFocused(true); onFocus?.(e) }}
      onBlur={(e) => { setFocused(false); e.target.style.height = ''; onBlur?.(e) }}
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter' && !e.nativeEvent?.isComposing) {
          e.preventDefault()
          return
        }
        onKeyDown?.(e)
      }}
    />
  )
})

AutoGrowTextarea.propTypes = {
  singleLine: PropTypes.bool,
  rows: PropTypes.number,
  value: PropTypes.string,
  onFocus: PropTypes.func,
  onBlur: PropTypes.func,
  onKeyDown: PropTypes.func,
  className: PropTypes.string
}

export default AutoGrowTextarea
