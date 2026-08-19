import { assetUrl, siteUrl } from '../../hooks/useBranding';
// Theme-based character images
const themeCharacters = {
  blue: {
    standing: assetUrl('/image/theme_header/ice_standing.gif'),
    running: assetUrl('/image/theme_header/ice_running.gif')
  },
  green: {
    standing: assetUrl('/image/theme_header/forest_standing.gif'),
    running: assetUrl('/image/theme_header/forest_running.gif')
  },
  purple: {
    standing: assetUrl('/image/theme_header/pirate_running.png'),
    running: assetUrl('/image/theme_header/pirate_running.png')
  },
  orange: {
    standing: assetUrl('/image/theme_header/ninja_standing.gif'),
    running: assetUrl('/image/theme_header/ninja_running.gif')
  },
  red: {
    standing: assetUrl('/materials/batman_standing.gif'),
    running: siteUrl('/LMS_enhance/gif/Left%20running/batman.gif')
  },
  yellow: {
    standing: assetUrl('/image/theme_header/desert_standing.gif'),
    running: assetUrl('/image/theme_header/desert_running.gif')
  }
}

const getThemeCharacter = (theme) => {
  return themeCharacters[theme] || themeCharacters.blue
}

const ExerciseHeader = ({
  title,
  subtitle,
  currentQuestion,
  totalQuestions,
  progressPercentage,
  isBatmanMoving = false,
  isRetryMode = false,
  retryModeText = 'Retry Wrong Questions',
  showBatman = true,
  showQuestionCounter = true,
  targetInfo,
  showProgressLabel = true,
  customContent,
  colorTheme = 'blue',
  showStarThresholds = true,
  starThresholds = { one: 80, two: 90, three: 95 }
}) => {
  const characterImages = getThemeCharacter(colorTheme)
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 md:p-5 border border-gray-200">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs md:text-sm font-medium text-gray-500 truncate mb-1">
            {isRetryMode ? retryModeText : title}
          </p>
          {subtitle && <h1 className="text-lg md:text-2xl font-bold text-gray-900">{subtitle}</h1>}
          {customContent && customContent}
        </div>
        {targetInfo && (
          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
            <span>{targetInfo}</span>
          </div>
        )}
        {showQuestionCounter && currentQuestion !== undefined && totalQuestions !== undefined && !targetInfo && (
          <div className="text-right flex-shrink-0">
            <div className="text-xl md:text-3xl font-bold text-blue-600">
              {currentQuestion}/{totalQuestions}
            </div>
            <div className="text-xs md:text-sm text-gray-500">
              Question
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {progressPercentage !== undefined && (
        <div className="mt-4 relative">
          {showProgressLabel && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs md:text-sm text-gray-600">Progress</span>
              <span className="text-xs md:text-sm font-semibold text-blue-600">
                {Math.round(progressPercentage)}%
              </span>
            </div>
          )}
          <div className="w-full bg-gray-200 rounded-full h-2.5 relative overflow-visible">
            <div
              className={`h-2.5 rounded-full transition-all duration-[3000ms] ${isRetryMode ? 'bg-yellow-600' : 'bg-blue-600'}`}
              style={{
                width: `${progressPercentage}%`
              }}
            />
            {/* Star Threshold Indicators */}
            {showStarThresholds && (
              <>
                {/* 1 Star Marker */}
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: `${starThresholds.one}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill={progressPercentage >= starThresholds.one ? '#facc15' : '#fff'} stroke={progressPercentage >= starThresholds.one ? '#eab308' : '#9ca3af'} strokeWidth="2">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                  </svg>
                </div>
                {/* 2 Star Marker */}
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: `${starThresholds.two}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill={progressPercentage >= starThresholds.two ? '#facc15' : '#fff'} stroke={progressPercentage >= starThresholds.two ? '#eab308' : '#9ca3af'} strokeWidth="2">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                  </svg>
                </div>
                {/* 3 Star Marker */}
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: `${starThresholds.three}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill={progressPercentage >= starThresholds.three ? '#facc15' : '#fff'} stroke={progressPercentage >= starThresholds.three ? '#eab308' : '#9ca3af'} strokeWidth="2">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                  </svg>
                </div>
              </>
            )}
            {/* Running Character Animation - moves with and stays with progress bar */}
            {showBatman && (
              <img
                src={isBatmanMoving ? characterImages.running : characterImages.standing}
                alt="Character animation"
                className="absolute -top-8 h-12 transition-all duration-[3000ms]"
                style={{
                  left: `calc(${progressPercentage}% - 24px)`,
                  zIndex: 10
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ExerciseHeader
