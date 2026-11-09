// Pick one definition out of a dictionary entry (see utils/dictionaryApi.js for the shape).
// A choice is { mi, di }: meaning index + definition index.
// Options are role="button" divs rather than <button>s so a double-click on a word inside a
// definition still opens the global WordLookupPopup (which ignores real buttons).

export const firstChoice = (meanings) => {
  const mi = (meanings || []).findIndex((m) => m.definitions?.length)
  return mi === -1 ? null : { mi, di: 0 }
}

export const resolveChoice = (meanings, choice) => {
  const meaning = choice && meanings?.[choice.mi]
  const def = meaning?.definitions?.[choice.di]
  return def ? { meaning, def } : null
}

const MeaningPicker = ({ meanings, selected, onSelect, limit }) => (
  <div className="space-y-3">
    {(meanings || []).map((meaning, mi) =>
      meaning.definitions?.length ? (
        <div key={mi}>
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">{meaning.partOfSpeech}</p>
          <div className="space-y-1">
            {meaning.definitions.slice(0, limit).map((def, di) => {
              const active = selected?.mi === mi && selected?.di === di
              const choose = () => onSelect({ mi, di })
              return (
                <div
                  key={di}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  onClick={choose}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      choose()
                    }
                  }}
                  className={`flex gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                    active ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  <span className="text-gray-500 flex-shrink-0 tabular-nums">{di + 1}.</span>
                  <div className="min-w-0">
                    <span className="text-gray-800">{def.definition}</span>
                    {def.example && <span className="block text-gray-400 italic">&ldquo;{def.example}&rdquo;</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null,
    )}
  </div>
)

export default MeaningPicker
