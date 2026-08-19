const DEFAULT_AVATAR_RATIO = 66 // avatar takes ~66% of the container, frame fills 100%

const AvatarWithFrame = ({
  avatarUrl,
  frameUrl,
  frameRatio,
  size = 80,
  fallback,
  onClick,
  className = '',
}) => {
  const hasFrame = frameUrl && frameUrl.startsWith('http')
  const avatarRatio = frameRatio || DEFAULT_AVATAR_RATIO

  const renderAvatar = () => {
    if (avatarUrl) {
      if (avatarUrl.startsWith('http')) {
        return (
          <img
            src={avatarUrl}
            alt="Avatar"
            className="w-full h-full object-cover rounded-full"
            onError={(e) => {
              e.target.style.display = 'none'
              if (e.target.nextSibling) e.target.nextSibling.style.display = 'inline'
            }}
          />
        )
      }
      return <span className="text-2xl">{avatarUrl}</span>
    }
    if (fallback) {
      return <span className="text-2xl font-bold">{fallback}</span>
    }
    return <span className="text-2xl font-bold">U</span>
  }

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Avatar - if frame exists, shrink to center; otherwise fill container */}
      <div
        className={`absolute rounded-full overflow-hidden flex items-center justify-center ${
          hasFrame ? 'bg-white/50' : ''
        } ${onClick ? 'cursor-pointer hover:bg-white/80 transition-colors' : ''}`}
        style={hasFrame ? {
          width: `${avatarRatio}%`,
          height: `${avatarRatio}%`,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        } : {
          width: '100%',
          height: '100%',
        }}
        onClick={onClick}
      >
        {renderAvatar()}
        {fallback && (
          <span className="hidden text-2xl font-bold">{fallback}</span>
        )}
      </div>
      {/* Frame covers the full container */}
      {hasFrame && (
        <img
          src={frameUrl}
          alt=""
          className="absolute inset-0 w-full h-full pointer-events-none"
          draggable={false}
        />
      )}
      {/* Transparent overlay to prevent right-click saving */}
      <div
        className="absolute inset-0 z-10"
        onClick={onClick}
        style={onClick ? { cursor: 'pointer' } : undefined}
        onContextMenu={(e) => e.preventDefault()}
        draggable={false}
      />
    </div>
  )
}

export default AvatarWithFrame
