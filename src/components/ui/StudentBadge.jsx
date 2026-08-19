import React from 'react'
import { useStudentLevels } from '../../hooks/useStudentLevels'

import { assetUrl } from '../../hooks/useBranding';
// Individual Badge Component
const Badge = ({
  badge,
  size = 'medium',
  showLevel = true,
  showTitle = false,
  showDescription = false,
  className = '',
  animate = false
}) => {
  if (!badge) return null

  const sizeClasses = {
    small: 'w-8 h-8 text-xs',
    medium: 'w-12 h-12 text-sm',
    large: 'w-16 h-16 text-lg',
    xl: 'w-20 h-20 text-xl'
  }

  const tierColors = {
    bronze: 'from-orange-400 to-orange-600 shadow-orange-200',
    silver: 'from-gray-300 to-gray-500 shadow-gray-200',
    gold: 'from-yellow-400 to-yellow-600 shadow-yellow-200',
    platinum: 'from-purple-400 to-purple-600 shadow-purple-200',
    diamond: 'from-blue-400 to-cyan-400 shadow-blue-200'
  }

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      {/* Badge Circle */}
      <div className={`
        ${sizeClasses[size]}
        bg-gradient-to-br ${tierColors[badge.tier]}
        rounded-full
        flex items-center justify-center
        shadow-lg ${tierColors[badge.tier].split(' ')[2]}
        border-2 border-white
        relative
        ${animate ? 'animate-pulse' : ''}
      `}>
        {badge.icon.startsWith('http') ? (
          <img 
            src={badge.icon} 
            alt={badge.name}
            className="w-full h-full object-cover rounded-full"
            onError={(e) => {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'inline'
            }}
          />
        ) : null}
        <span className="font-bold text-white drop-shadow-sm" style={{ display: badge.icon.startsWith('http') ? 'none' : 'inline' }}>
          {badge.icon}
        </span>

        {/* Level Number Overlay */}
        {showLevel && (
          <div className="absolute -bottom-1 -right-1 bg-white text-gray-800 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border shadow-sm">
            {badge.levelNumber}
          </div>
        )}
      </div>

      {/* Badge Name */}
      <div className="text-center mt-1">
        <div className={`font-semibold text-gray-800 ${size === 'small' ? 'text-xs' : 'text-sm'}`}>
          {badge.name}
        </div>

        {/* Title */}
        {showTitle && badge.title && (
          <div className="text-xs text-gray-600 italic">
            {badge.title}
          </div>
        )}

        {/* Description */}
        {showDescription && badge.description && (
          <div className="text-xs text-gray-500 mt-1 max-w-32">
            {badge.description}
          </div>
        )}
      </div>
    </div>
  )
}

// Current Student Badge Display
const StudentBadge = ({
  size = 'medium',
  showLevel = true,
  showTitle = false,
  showDescription = false,
  className = ''
}) => {
  const { currentBadge, loading } = useStudentLevels()

  if (loading) {
    return (
      <div className={`inline-flex flex-col items-center ${className}`}>
        <div className="w-12 h-12 bg-gray-200 rounded-full animate-pulse"></div>
        <div className="w-16 h-3 bg-gray-200 rounded mt-1 animate-pulse"></div>
      </div>
    )
  }

  return (
    <Badge
      badge={currentBadge}
      size={size}
      showLevel={showLevel}
      showTitle={showTitle}
      showDescription={showDescription}
      className={className}
    />
  )
}

// Simple Badge without background
const SimpleBadge = ({ badge, size = 'medium', className = '', showName = false }) => {
  if (!badge) return null

  const sizeClasses = {
    xs: 'max-w-6 max-h-6',
    small: 'max-w-8 max-h-8',
    medium: 'max-w-12 max-h-12',
    large: 'max-w-16 max-h-16',
    xl: 'max-w-20 max-h-20'
  }

  const fallbackSizeClasses = {
    xs: 'w-6 h-6',
    small: 'w-8 h-8',
    medium: 'w-12 h-12',
    large: 'w-16 h-16',
    xl: 'w-20 h-20'
  }

  const textSizeClasses = {
    xs: 'text-[10px]',
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-base',
    xl: 'text-lg'
  }

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      {badge.icon.startsWith('http') ? (
        <img
          src={badge.icon}
          alt={badge.name}
          className={`${sizeClasses[size]} object-contain`}
          onError={(e) => {
            e.target.style.display = 'none'
            e.target.nextSibling.style.display = 'flex'
          }}
        />
      ) : null}
      <div
        className={`${fallbackSizeClasses[size]} flex items-center justify-center text-2xl`}
        style={{ display: badge.icon.startsWith('http') ? 'none' : 'flex' }}
      >
        {badge.icon}
      </div>
      {showName && (
        <div className={`text-center mt-1 ${textSizeClasses[size]} text-gray-700 font-medium`}>
          {badge.name}
        </div>
      )}
    </div>
  )
}

// Level Progress Bar with Badge Preview
const LevelProgressBar = ({ showNextBadge = true, className = '' }) => {
  const {
    currentBadge,
    nextBadge,
    levelProgress,
    isMaxLevel,
    loading
  } = useStudentLevels()

  if (loading) {
    return (
      <div className={`bg-gray-200 rounded-lg p-4 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-300 rounded mb-2"></div>
        <div className="h-2 bg-gray-300 rounded"></div>
      </div>
    )
  }

  if (!currentBadge) return null

  return (
    <div className={`bg-white rounded-lg p-4 border shadow-sm ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <SimpleBadge badge={currentBadge} size="medium" />
          <div>
            <div className="font-semibold text-gray-800">
              Level {currentBadge.levelNumber}
            </div>
            <div className="text-sm text-gray-600">
              {currentBadge.name}
            </div>
          </div>
        </div>

        {showNextBadge && nextBadge && (
          <div className="flex items-center gap-2 opacity-60">
            <div className="text-right">
              <div className="text-xs text-gray-500">Next Level</div>
              <div className="text-sm text-gray-600">{nextBadge.name}</div>
            </div>
            <SimpleBadge badge={nextBadge} size="small" />
          </div>
        )}
      </div>

      {!isMaxLevel ? (
        <>
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Progress to Next Level</span>
            <span>{levelProgress.progressPercentage}%</span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${levelProgress.progressPercentage}%` }}
            ></div>
          </div>

          <div className="text-center mt-2 text-sm text-gray-600 flex items-center justify-center gap-1">
            {levelProgress.xpNeeded.toLocaleString()}
            <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-4 h-4" />
            needed for {nextBadge?.name}
          </div>
        </>
      ) : (
        <div className="text-center">
          <div className="text-lg font-bold text-purple-600 mb-1">
            🎉 Max Level Achieved! 🎉
          </div>
          <div className="text-sm text-gray-600">
            You've reached the highest level!
          </div>
        </div>
      )}
    </div>
  )
}

// Badge Collection/Gallery
const BadgeGallery = ({ userLevel, className = '' }) => {
  const { getAllLevels } = useStudentLevels()
  const allLevels = getAllLevels()

  return (
    <div className={`bg-white rounded-lg p-4 ${className}`}>
      <h3 className="text-lg font-semibold mb-4">Badge Collection</h3>

      <div className="grid grid-cols-5 gap-4">
        {allLevels.map(level => {
          const isUnlocked = userLevel >= level.level_number
          const badgeData = {
            name: level.badge_name,
            tier: level.badge_tier,
            icon: level.badge_icon,
            color: level.badge_color,
            description: level.badge_description,
            title: level.title_unlocked,
            levelNumber: level.level_number
          }

          return (
            <div key={level.id} className={`${!isUnlocked ? 'opacity-30 grayscale' : ''}`}>
              <Badge
                badge={badgeData}
                size="medium"
                showLevel={true}
                showTitle={false}
                showDescription={true}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Compact badge for navigation/header
const CompactBadge = ({ className = '' }) => {
  const { currentBadge, loading } = useStudentLevels()

  if (loading || !currentBadge) {
    return (
      <div className={`w-8 h-8 bg-gray-200 rounded-full animate-pulse ${className}`}></div>
    )
  }

  const tierColors = {
    bronze: 'from-orange-400 to-orange-600',
    silver: 'from-gray-300 to-gray-500',
    gold: 'from-yellow-400 to-yellow-600',
    platinum: 'from-purple-400 to-purple-600',
    diamond: 'from-blue-400 to-cyan-400'
  }

  return (
    <div className={`relative ${className}`}>
      <div className={`
        w-8 h-8 bg-gradient-to-br ${tierColors[currentBadge.tier]}
        rounded-full flex items-center justify-center
        border-2 border-white shadow-lg
      `}>
        {currentBadge.icon.startsWith('http') ? (
          <img 
            src={currentBadge.icon} 
            alt={currentBadge.name}
            className="w-full h-full object-cover rounded-full"
            onError={(e) => {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'inline'
            }}
          />
        ) : null}
        <span className="text-xs text-white font-bold" style={{ display: currentBadge.icon.startsWith('http') ? 'none' : 'inline' }}>
          {currentBadge.icon}
        </span>
      </div>
      <div className="absolute -bottom-1 -right-1 bg-white text-gray-800 text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center border shadow-sm">
        {currentBadge.levelNumber}
      </div>
    </div>
  )
}

export default StudentBadge
export { Badge, SimpleBadge, LevelProgressBar, BadgeGallery, CompactBadge }