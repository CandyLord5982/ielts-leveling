import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Check, Folder, Loader2, Search, Shield, Users, X } from 'lucide-react'
import { supabase } from '../../../supabase/client'

const accessLabels = {
  none: 'No access',
  full: 'Entire Exercise Bank',
  folders: 'Selected folders',
}

const teacherName = (teacher = {}) => teacher.real_name?.trim()
  || teacher.full_name?.trim()
  || teacher.email
  || 'Unnamed teacher'

const folderPaths = (folders) => {
  const byId = new Map(folders.map(folder => [folder.id, folder]))
  return folders.map(folder => {
    const names = []
    const visited = new Set()
    let current = folder
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      names.unshift(current.name || 'Unnamed folder')
      current = byId.get(current.parent_folder_id)
    }
    return { ...folder, path: names.join(' / ') }
  }).sort((a, b) => a.path.localeCompare(b.path))
}

const ExerciseBankAccessModal = ({ folders, onClose, onSaved }) => {
  const [teachers, setTeachers] = useState([])
  const [accessByUser, setAccessByUser] = useState({})
  const [foldersByUser, setFoldersByUser] = useState({})
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [mode, setMode] = useState('none')
  const [selectedFolderIds, setSelectedFolderIds] = useState([])
  const [teacherSearch, setTeacherSearch] = useState('')
  const [folderSearch, setFolderSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [success, setSuccess] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const results = await Promise.all([
          supabase.from('users').select('id, full_name, real_name, email').eq('role', 'teacher'),
          supabase.from('exercise_bank_access').select('user_id, access_mode'),
          supabase.from('exercise_bank_folder_access').select('user_id, folder_id'),
        ])
        for (const result of results) {
          if (result.error) throw result.error
        }
        if (!active) return
        const nextTeachers = [...(results[0].data || [])]
          .sort((a, b) => teacherName(a).localeCompare(teacherName(b)))
        const nextAccess = Object.fromEntries((results[1].data || [])
          .map(access => [access.user_id, access.access_mode]))
        const nextFolders = {}
        for (const grant of results[2].data || []) {
          nextFolders[grant.user_id] ||= []
          nextFolders[grant.user_id].push(grant.folder_id)
        }
        const firstTeacherId = nextTeachers[0]?.id || ''
        setTeachers(nextTeachers)
        setAccessByUser(nextAccess)
        setFoldersByUser(nextFolders)
        setSelectedTeacherId(firstTeacherId)
        setMode(nextAccess[firstTeacherId] || 'none')
        setSelectedFolderIds(nextFolders[firstTeacherId] || [])
      } catch (error) {
        if (active) setLoadError(error.message || 'Failed to load teacher permissions.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [loadAttempt])

  const paths = useMemo(() => folderPaths(folders), [folders])
  const visibleFolders = paths.filter(folder => folder.path.toLowerCase().includes(folderSearch.trim().toLowerCase()))
  const visibleTeachers = teachers.filter(teacher => `${teacherName(teacher)} ${teacher.email || ''}`
    .toLowerCase().includes(teacherSearch.trim().toLowerCase()))
  const selectedTeacher = teachers.find(teacher => teacher.id === selectedTeacherId)
  const savedMode = accessByUser[selectedTeacherId] || 'none'
  const savedFolderIds = foldersByUser[selectedTeacherId] || []
  const dirty = mode !== savedMode || (mode === 'folders'
    && JSON.stringify([...selectedFolderIds].sort()) !== JSON.stringify([...savedFolderIds].sort()))

  const confirmDiscard = () => !dirty || window.confirm('Discard unsaved permission changes?')

  const selectTeacher = (teacherId) => {
    if (saving || teacherId === selectedTeacherId || !confirmDiscard()) return
    setSelectedTeacherId(teacherId)
    setMode(accessByUser[teacherId] || 'none')
    setSelectedFolderIds(foldersByUser[teacherId] || [])
    setFolderSearch('')
    setSaveError('')
    setSuccess('')
  }

  const close = () => {
    if (!saving && confirmDiscard()) onClose()
  }

  const toggleFolder = (folderId) => {
    setSelectedFolderIds(current => current.includes(folderId)
      ? current.filter(id => id !== folderId)
      : [...current, folderId])
    setSaveError('')
    setSuccess('')
  }

  const save = async (event) => {
    event.preventDefault()
    if (!selectedTeacherId || saving || loading || loadError) return
    setSaving(true)
    setSaveError('')
    setSuccess('')
    try {
      const folderIds = mode === 'folders' ? [...new Set(selectedFolderIds)] : []
      const { error } = await supabase.rpc('set_exercise_bank_access', {
        target_user_id: selectedTeacherId,
        requested_mode: mode,
        requested_folder_ids: folderIds,
      })
      if (error) throw error
      setAccessByUser(current => {
        const next = { ...current }
        if (mode === 'none') delete next[selectedTeacherId]
        else next[selectedTeacherId] = mode
        return next
      })
      setFoldersByUser(current => ({ ...current, [selectedTeacherId]: folderIds }))
      setSelectedFolderIds(folderIds)
      setSuccess(`Permissions saved for ${teacherName(selectedTeacher)}.`)
    } catch (error) {
      setSaveError(error.message || 'Failed to save permissions. Please try again.')
      return
    } finally {
      setSaving(false)
    }
    onSaved?.()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="bank-access-title" className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-200">
          <div>
            <h2 id="bank-access-title" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" /> Teacher access
            </h2>
            <p className="text-sm text-gray-500 mt-1">Teachers have no Exercise Bank access until an admin grants it. Admins always have full access.</p>
          </div>
          <button type="button" onClick={close} disabled={saving} aria-label="Close teacher access" className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div role="status" className="p-12 text-center text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" /> Loading teacher permissions...
          </div>
        ) : loadError ? (
          <div className="p-6">
            <div role="alert" className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{loadError}</div>
            <button type="button" onClick={() => setLoadAttempt(current => current + 1)} className="mt-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">Try again</button>
          </div>
        ) : teachers.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Users className="w-9 h-9 mx-auto mb-3 text-gray-400" /> No teachers found in the system.
          </div>
        ) : (
          <div className="flex flex-col md:flex-row min-h-0 flex-1 overflow-auto">
            <aside className="md:w-72 md:shrink-0 border-b md:border-b-0 md:border-r border-gray-200 p-4 flex flex-col min-h-0">
              <label className="relative block mb-3">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input aria-label="Search teachers" value={teacherSearch} onChange={event => setTeacherSearch(event.target.value)} placeholder="Search teachers..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </label>
              <div className="space-y-1 overflow-auto max-h-40 md:max-h-none">
                {visibleTeachers.map(teacher => (
                  <button key={teacher.id} type="button" disabled={saving} onClick={() => selectTeacher(teacher.id)} aria-pressed={selectedTeacherId === teacher.id} className={`w-full rounded-lg text-left px-3 py-3 disabled:opacity-50 ${selectedTeacherId === teacher.id ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'}`}>
                    <span className="block text-sm font-medium text-gray-900 break-words">{teacherName(teacher)}</span>
                    <span className="block text-xs text-gray-500 break-all mt-0.5">{teacher.email}</span>
                    <span className="inline-block mt-2 text-xs rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">{accessLabels[accessByUser[teacher.id] || 'none']}</span>
                  </button>
                ))}
                {visibleTeachers.length === 0 && <p className="p-3 text-sm text-gray-500">No matching teachers.</p>}
              </div>
            </aside>

            <form onSubmit={save} className="flex-1 min-w-0 p-5 flex flex-col min-h-0">
              <h3 className="font-semibold text-gray-900 break-words">{teacherName(selectedTeacher)}</h3>
              <p className="text-xs text-gray-500 mt-1 mb-4">Choose which exercises this teacher can browse in the bank.</p>
              <fieldset disabled={saving} className="space-y-2">
                <legend className="sr-only">Exercise Bank access level</legend>
                {Object.entries(accessLabels).map(([value, label]) => (
                  <label key={value} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${mode === value ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="radio" name="bank-access-mode" value={value} checked={mode === value} onChange={() => { setMode(value); setSaveError(''); setSuccess('') }} className="text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm font-medium text-gray-800">{label}</span>
                  </label>
                ))}
              </fieldset>

              {mode === 'folders' && (
                <div className="mt-4 min-h-0 flex flex-col">
                  <p className="text-sm text-gray-600 mb-3">Selected folders include all their subfolders. Access to a child folder does not grant access to exercises in its parent.</p>
                  <label className="relative block mb-2">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input aria-label="Search folders" value={folderSearch} onChange={event => setFolderSearch(event.target.value)} placeholder="Search folder paths..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <div className="border border-gray-200 rounded-lg overflow-auto max-h-56 divide-y divide-gray-100">
                    {visibleFolders.map(folder => (
                      <label key={folder.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={selectedFolderIds.includes(folder.id)} disabled={saving} onChange={() => toggleFolder(folder.id)} className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <Folder className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700 break-words">{folder.path}</span>
                      </label>
                    ))}
                    {visibleFolders.length === 0 && <p className="p-4 text-sm text-gray-500">{folders.length ? 'No matching folders.' : 'No folders available.'}</p>}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{selectedFolderIds.length} folder{selectedFolderIds.length === 1 ? '' : 's'} selected. Selecting no folders grants no bank access.</p>
                </div>
              )}

              {saveError && <div role="alert" className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{saveError}</div>}
              {success && <div role="status" className="mt-4 p-3 rounded-lg bg-green-50 text-sm text-green-700 flex items-start gap-2"><Check className="w-4 h-4 shrink-0 mt-0.5" />{success}</div>}
              <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-gray-200">
                <span className="text-xs text-gray-500">{dirty ? 'Unsaved changes' : 'Permissions are up to date'}</span>
                <button type="submit" disabled={saving || !dirty} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-blue-300 flex items-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Saving...' : 'Save access'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

ExerciseBankAccessModal.propTypes = {
  folders: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    parent_folder_id: PropTypes.string,
  })).isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
}

export default ExerciseBankAccessModal
