import PropTypes from 'prop-types'

import { CLIP } from './hudClip'

const TONES = {
  default: 'bg-white border-gray-200 group-hover:border-gray-300',
  accent: 'bg-blue-50 border-blue-300 group-hover:border-blue-400',
  done: 'bg-emerald-50 border-emerald-300',
  muted: 'bg-gray-50 border-gray-200',
  glass: 'bg-white/90 border-gray-200 backdrop-blur-sm',
}

/**
 * A panel with cut corners. The shape/border is drawn on a background layer, so the content on top
 * is never clipped (popovers and tooltips inside still work).
 */
// hoverGroup: lets children use group-hover:*. Turn it off on a panel that contains other panels,
// otherwise hovering the outer one would trigger the hover styles of every inner row.
const HudPanel = ({ tone = 'default', accentBar = false, hoverGroup = true, className = '', children, ...props }) => (
  <div className={`${hoverGroup ? 'group ' : ''}relative ${className}`} {...props}>
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 border transition-colors ${TONES[tone] || TONES.default}`}
      style={{ clipPath: CLIP.card }}
    />
    {accentBar && (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[10px] left-0 w-[2px] h-[calc(100%-10px)] bg-blue-400"
      />
    )}
    <div className="relative">{children}</div>
  </div>
)

HudPanel.propTypes = {
  tone: PropTypes.oneOf(['default', 'accent', 'done', 'muted', 'glass']),
  accentBar: PropTypes.bool,
  hoverGroup: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
}

export default HudPanel
