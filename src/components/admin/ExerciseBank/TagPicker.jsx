import { useState } from 'react'
import PropTypes from 'prop-types'
import { ChevronDown, ChevronUp } from 'lucide-react'

// Collapsible tag list: collapsed shows only selected tags, expanded shows all available ones.
const TagPicker = ({ availableTags, selectedTags, onToggle }) => {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? availableTags : selectedTags

  return (
    <div className="flex-1">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1 hover:text-blue-700"
      >
        Tags
        {selectedTags.length > 0 && <span className="text-blue-600">({selectedTags.length} selected)</span>}
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      <div className="flex flex-wrap gap-1">
        {visible.map(tag => (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
              selectedTags.includes(tag)
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {selectedTags.includes(tag) && '✓ '}{tag}
          </button>
        ))}
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="px-2 py-0.5 text-xs rounded-full border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50"
          >
            {selectedTags.length ? '+ more' : `Show ${availableTags.length} tags`}
          </button>
        )}
      </div>
    </div>
  )
}

TagPicker.propTypes = {
  availableTags: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedTags: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggle: PropTypes.func.isRequired,
}

export default TagPicker
