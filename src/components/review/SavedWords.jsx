import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../supabase/client'
import LoadingSpinner from '../ui/LoadingSpinner'
import { ArrowLeft, Pencil, Trash2, Check, X, Search } from 'lucide-react'

// Manage words saved from the dictionary popup: edit the meaning/example, rename, or delete.
const SavedWords = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [words, setWords] = useState([])
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({ word: '', definition: '', example: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('saved_words')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) console.error('Error loading saved words:', err)
        setWords(data || [])
        setLoading(false)
      })
  }, [user])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return words
    return words.filter((w) => w.word.includes(q) || w.definition.toLowerCase().includes(q))
  }, [words, search])

  const startEdit = (w) => {
    setEditingId(w.id)
    setDraft({ word: w.word, definition: w.definition, example: w.example || '' })
    setError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setError('')
  }

  const saveEdit = async () => {
    const word = draft.word.trim().toLowerCase()
    const definition = draft.definition.trim()
    if (!word || !definition) {
      setError('Từ và nghĩa không được để trống.')
      return
    }
    setBusy(true)
    const updates = { word, definition, example: draft.example.trim() || null }
    const { error: err } = await supabase.from('saved_words').update(updates).eq('id', editingId)
    setBusy(false)
    if (err) {
      // 23505 = unique violation (another saved word already has this spelling)
      setError(err.code === '23505' ? 'Bạn đã lưu từ này rồi.' : 'Không thể lưu thay đổi.')
      return
    }
    setWords((list) => list.map((w) => (w.id === editingId ? { ...w, ...updates } : w)))
    setEditingId(null)
    setError('')
  }

  const handleDelete = async (w) => {
    if (!window.confirm(`Xóa từ "${w.word}"?`)) return
    const { error: err } = await supabase.from('saved_words').delete().eq('id', w.id)
    if (err) {
      console.error('Error deleting word:', err)
      alert('Không thể xóa từ này.')
      return
    }
    setWords((list) => list.filter((x) => x.id !== w.id))
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/review/vocab')} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> Ôn tập từ vựng
        </button>
        <span className="text-sm text-gray-500">{words.length} từ</span>
      </div>

      {words.length > 0 && (
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm từ hoặc nghĩa..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 outline-none focus:border-blue-500"
          />
        </div>
      )}

      {words.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Chưa có từ nào được lưu</h2>
          <p className="text-sm text-gray-500">Nhấp đúp vào một từ bất kỳ để tra nghĩa, rồi bấm "Lưu từ".</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">Không tìm thấy từ nào.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((w) => (
            <li key={w.id} data-no-lookup className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              {editingId === w.id ? (
                <div className="space-y-2">
                  <input
                    value={draft.word}
                    onChange={(e) => setDraft((d) => ({ ...d, word: e.target.value }))}
                    placeholder="Từ"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-blue-500 font-semibold"
                  />
                  <textarea
                    value={draft.definition}
                    onChange={(e) => setDraft((d) => ({ ...d, definition: e.target.value }))}
                    placeholder="Nghĩa"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
                  />
                  <input
                    value={draft.example}
                    onChange={(e) => setDraft((d) => ({ ...d, example: e.target.value }))}
                    placeholder="Ví dụ (không bắt buộc)"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-blue-500 text-sm"
                  />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="flex justify-end gap-2">
                    <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <X className="w-4 h-4" /> Hủy
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={busy}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" /> Lưu
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-gray-900">{w.word}</span>
                      {w.part_of_speech && <span className="text-xs text-blue-600 uppercase">{w.part_of_speech}</span>}
                      {w.phonetic && <span className="text-xs text-gray-400">{w.phonetic}</span>}
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{w.definition}</p>
                    {w.example && <p className="text-sm text-gray-400 italic mt-1">&ldquo;{w.example}&rdquo;</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(w)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="Sửa">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(w)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Xóa">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SavedWords
