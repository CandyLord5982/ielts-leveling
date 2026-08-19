import { forwardRef } from 'react'

const Button3D = forwardRef(({
  children,
  onClick,
  disabled = false,
  color = 'blue',
  shadowColor,
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
}, ref) => {
  // Predefined color schemes with their shadows
  const colorSchemes = {
    blue: {
      background: '#3b82f6',
      shadow: '#1e40af'
    },
    green: {
      background: '#10b981',
      shadow: '#047857'
    },
    red: {
      background: '#ef4444',
      shadow: '#b91c1c'
    },
    yellow: {
      background: '#f59e0b',
      shadow: '#b45309'
    },
    purple: {
      background: '#a855f7',
      shadow: '#7e22ce'
    },
    pink: {
      background: '#ec4899',
      shadow: '#be185d'
    },
    orange: {
      background: '#f97316',
      shadow: '#c2410c'
    },
    teal: {
      background: '#14b8a6',
      shadow: '#0f766e'
    },
    indigo: {
      background: '#6366f1',
      shadow: '#4338ca'
    },
    gray: {
      background: '#6b7280',
      shadow: '#374151'
    },
    black: {
      background: '#030813ff',
      shadow: '#202429ff'
    }
  }

  // Get colors from scheme or use custom
  const scheme = colorSchemes[color] || colorSchemes.blue
  const bgColor = scheme.background
  const shadowColorFinal = shadowColor || scheme.shadow

  // Size variants with padding
  const sizes = {
    sm: { text: 'text-sm', padding: '0.6em 1.2em' },
    md: { text: 'text-base', padding: '0.75em 1.5em' },
    lg: { text: 'text-lg', padding: '0.85em 1.75em' },
    xl: { text: 'text-xl', padding: '1em 2em' }
  }

  const buttonClass = `
    ${disabled ? 'bg-gray-300 cursor-not-allowed' : ''}
    ${sizes[size].text}
    font-medium
    ${className}
  `.trim()

  return (
    <button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      className={`${fullWidth ? 'w-full' : ''} border-none rounded-lg transition-all duration-100`}
      style={{
        padding: 0,
        borderRadius: '0.75em',
        backgroundColor: shadowColorFinal
      }}
      {...props}
    >
      <div
        className={buttonClass}
        style={{
          display: 'flex',
          boxSizing: 'border-box',
          transform: disabled ? 'translateY(0)' : 'translateY(-0.2em)',
          transition: 'transform 0.1s ease',
          padding: sizes[size].padding,
          borderRadius: '0.75em',
          backgroundColor: disabled ? '#d1d5db' : bgColor,
          color: '#ffffff'
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.transform = 'translateY(-0.33em)'
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.transform = 'translateY(-0.2em)'
          }
        }}
        onMouseDown={(e) => {
          if (!disabled) {
            e.currentTarget.style.transform = 'translateY(0)'
          }
        }}
        onMouseUp={(e) => {
          if (!disabled) {
            e.currentTarget.style.transform = 'translateY(-0.33em)'
          }
        }}
        onTouchStart={(e) => {
          if (!disabled) {
            e.currentTarget.style.transform = 'translateY(0)'
          }
        }}
        onTouchEnd={(e) => {
          if (!disabled) {
            e.currentTarget.style.transform = 'translateY(-0.2em)'
          }
        }}
      >
        {children}
      </div>
    </button>
  )
})

Button3D.displayName = 'Button3D'

export default Button3D
