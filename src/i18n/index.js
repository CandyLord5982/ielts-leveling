import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Interface translations only — exercise content, word definitions etc. stay as authored.
//
// Strings live in src/i18n/locales/<lang>/<namespace>.json and are picked up automatically:
// add a namespace by adding the same-named file under every language. English is the
// default and the fallback, so a key missing from vi/ shows the English text.

export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'vi', label: 'Tiếng Việt', short: 'VI' },
]
export const DEFAULT_LANGUAGE = 'en'
const STORAGE_KEY = 'app_language'

const files = import.meta.glob('./locales/*/*.json', { eager: true, import: 'default' })
const resources = {}
for (const [path, strings] of Object.entries(files)) {
  const [, lang, ns] = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/)
  resources[lang] = { ...resources[lang], [ns]: strings }
}

const readStored = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES.some((l) => l.code === v) ? v : null
  } catch {
    return null
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: readStored() || DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  ns: Object.keys(resources[DEFAULT_LANGUAGE] || {}),
  interpolation: { escapeValue: false }, // React already escapes
})

const syncHtmlLang = (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng
}
syncHtmlLang(i18n.language)
i18n.on('languageChanged', syncHtmlLang)

// Locale for toLocaleDateString / number formatting, following the chosen language.
export const dateLocale = () => (i18n.resolvedLanguage === 'vi' ? 'vi-VN' : 'en-US')

// Saved per browser; the choice survives reloads and sign-outs on that device.
export const setLanguage = (lng) => {
  i18n.changeLanguage(lng)
  try { localStorage.setItem(STORAGE_KEY, lng) } catch { /* storage blocked: still switches for this visit */ }
}

export default i18n
