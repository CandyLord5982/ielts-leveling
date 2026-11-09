/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react'
import { X } from 'lucide-react'

// Bulk rename: find & replace, or add a prefix/suffix. Shows a live preview before applying.
export const applyRename = (title, { mode, find, replace, prefix, suffix }) => {
  if (mode === 'replace') {
    return find ? title.split(find).join(replace) : title
  }
  return `${prefix}${title}${suffix}`
}

const BulkRenameModal = ({ exercises, onClose, onApply }) => {
  const [mode, setMode] = useState('replace') // 'replace' | 'affix'
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [prefix, setPrefix] = useState('')
  const [suffix, setSuffix] = useState('')
  const [busy, setBusy] = useState(false)

  const options = { mode, find, replace, prefix, suffix }
  const changes = useMemo(
    () =>
      exercises
        .map(ex => ({ id: ex.id, from: ex.title, to: applyRename(ex.title || '', options).trim() }))
        .filter(c => c.to && c.to !== c.from),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercises, mode, find, replace, prefix, suffix]
  )

  const apply = async () => {
    setBusy(true)
    await onApply(changes)
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Rename {exercises.length} exercises</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setMode('replace')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md ${mode === 'replace' ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`}
            >
              Find &amp; replace
            </button>
            <button
              onClick={() => setMode('affix')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md ${mode === 'affix' ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`}
            >
              Prefix / suffix
            </button>
          </div>

          {mode === 'replace' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-gray-700">
                Find
                <input value={find} onChange={e => setFind(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" autoFocus />
              </label>
              <label className="text-xs font-medium text-gray-700">
                Replace with
                <input value={replace} onChange={e => setReplace(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-gray-700">
                Prefix
                <input value={prefix} onChange={e => setPrefix(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" autoFocus />
              </label>
              <label className="text-xs font-medium text-gray-700">
                Suffix
                <input value={suffix} onChange={e => setSuffix(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </label>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">
              Preview ({changes.length} will change{changes.length > 5 ? ', showing 5' : ''})
            </p>
            <ul className="text-sm space-y-1">
              {changes.slice(0, 5).map(c => (
                <li key={c.id} className="truncate">
                  <span className="text-gray-400 line-through">{c.from}</span>
                  <span className="text-gray-400"> → </span>
                  <span className="text-gray-900">{c.to}</span>
                </li>
              ))}
              {changes.length === 0 && <li className="text-gray-400">Nothing to change yet.</li>}
            </ul>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button
            onClick={apply}
            disabled={busy || changes.length === 0}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Renaming...' : `Rename ${changes.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BulkRenameModal
