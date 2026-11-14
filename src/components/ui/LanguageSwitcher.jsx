import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { LANGUAGES, setLanguage } from '../../i18n'

// "Language  [EN | VI]" row, shown on the student's own profile page.
const LanguageSwitcher = ({ className = '' }) => {
  const { t, i18n } = useTranslation('nav')
  const current = LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) || LANGUAGES[0]

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Globe size={20} className="flex-shrink-0 text-gray-400" aria-hidden />
      <span className="text-sm font-medium text-gray-600 flex-1">{t('language')}</span>
      <div role="group" aria-label={t('language')} className="flex rounded-md border border-gray-200 overflow-hidden text-xs font-semibold">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => setLanguage(l.code)}
            aria-pressed={current.code === l.code}
            title={l.label}
            className={`px-2.5 py-1 transition-colors ${
              current.code === l.code ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {l.short}
          </button>
        ))}
      </div>
    </div>
  )
}

LanguageSwitcher.propTypes = {
  className: PropTypes.string,
}

export default LanguageSwitcher
