import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useProgress } from '../../hooks/useProgress'
import { supabase } from '../../supabase/client'
import {
  ArrowLeft, ArrowRight, RotateCcw, Play, Pause, ChevronRight, ChevronLeft,
  CheckCircle, XCircle, SkipForward, Headphones, Star,
  FileText, Settings, Lightbulb, BookOpen, Volume2, Maximize2,
  ChevronDown, Mic, Check, Search, Info, ChevronUp, Link, Download,
  Gauge, Repeat, Languages, Clock, MessageSquare, Trash2, MoreVertical, AlertTriangle
} from 'lucide-react'
import { Slider } from '../../components/ui/slider'


// ─── Diff Engine ─────────────────────────────────────────────────────────────
const normalizeForCompare = (str) => {
  let s = str.toLowerCase().replace(/[.,\/#!$%\^&*;:{}=\-_`~()"""]/g, '').trim()
  const EQUIVALENTS = {
    'colour': 'color', 'centre': 'center', 'programme': 'program',
    'theatre': 'theater', 'travelled': 'traveled', 'marvellous': 'marvelous',
    "it's": 'it is', "don't": 'do not', "can't": 'cannot', "won't": 'will not',
    "i'm": 'i am', "they're": 'they are', "we're": 'we are', "you're": 'you are'
  }
  return EQUIVALENTS[s] || s
}

const getTokens = (text) => {
  if (!text) return []
  return text.trim().split(/\s+/).filter(Boolean).map(w => ({
    original: w,
    norm: normalizeForCompare(w)
  }))
}

const diffWords = (input, answer) => {
  const inputTokens = getTokens(input)
  const ansTokens = getTokens(answer)

  const dp = Array(inputTokens.length + 1).fill(null).map(() => Array(ansTokens.length + 1).fill(0))
  for (let i = 1; i <= inputTokens.length; i++) {
    for (let j = 1; j <= ansTokens.length; j++) {
      if (inputTokens[i - 1].norm === ansTokens[j - 1].norm) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  let i = inputTokens.length, j = ansTokens.length
  const result = []
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && inputTokens[i - 1].norm === ansTokens[j - 1].norm) {
      result.unshift({ type: 'correct', text: inputTokens[i - 1].original })
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'missing', text: ansTokens[j - 1].original })
      j--;
    } else {
      result.unshift({ type: 'extra', text: inputTokens[i - 1].original })
      i--;
    }
  }

  for (let k = 0; k < result.length - 1; k++) {
    if (result[k].type === 'extra' && result[k + 1].type === 'missing') {
      result[k] = { type: 'wrong', studentText: result[k].text, correctText: result[k + 1].text }
      result.splice(k + 1, 1)
    }
  }

  return result
}

const calcErrors = (diffResult) => {
  if (!diffResult) return 0
  return diffResult.filter(t => t.type !== 'correct').length
}

const calcAccuracy = (diffResult) => {
  if (!diffResult?.length) return 0
  const correct = diffResult.filter(t => t.type === 'correct').length
  const errors = calcErrors(diffResult)
  return Math.max(0, Math.round((correct / (correct + errors)) * 100))
}

const formatTime = (sec) => {
  if (sec == null || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

const DiffResult = ({ tokens }) => (
  <div className="flex flex-wrap gap-x-1.5 gap-y-6 text-[14px] items-start pt-1">
    {tokens.map((t, i) => {
      if (t.type === 'correct') {
        return (
          <span key={i} className="inline-flex flex-col items-center">
            <span className="text-gray-900 leading-[20px] h-[20px]">{t.text}</span>
          </span>
        )
      }
      if (t.type === 'wrong') {
        return (
          <span key={i} className="inline-flex flex-col items-center">
            <span className="text-red-500 underline decoration-red-500 underline-offset-2 leading-[20px] h-[20px]">{t.studentText}</span>
            <span className="text-green-600 font-medium leading-[20px] mt-1">{t.correctText}</span>
          </span>
        )
      }
      if (t.type === 'extra') {
        return (
          <span key={i} className="inline-flex flex-col items-center">
            <span className="text-red-500 line-through decoration-red-500 leading-[20px] h-[20px]">{t.text}</span>
          </span>
        )
      }
      if (t.type === 'missing') {
        return (
          <span key={i} className="inline-flex flex-col items-center min-w-[12px]">
            <span className="opacity-0 select-none leading-[20px] h-[20px]">&nbsp;</span>
            <span className="text-green-600 font-medium leading-[20px] mt-1">{t.text}</span>
          </span>
        )
      }
      return null
    })}
  </div>
)

const ProgressiveHint = ({ input = '', answer = '' }) => {
  const inputTokens = getTokens(input || '')
  const ansTokens = getTokens(answer || '')
  
  let matchCount = 0
  for (let i = 0; i < Math.min(inputTokens.length, ansTokens.length); i++) {
    if (inputTokens[i].norm === ansTokens[i].norm) {
      matchCount++
    } else {
      break
    }
  }

  const parts = answer.split(/(\s+)/)
  let wordIndex = 0
  
  return (
    <div className="text-[16px] text-gray-900 leading-relaxed tracking-wide">
      {parts.map((part, index) => {
        if (part.trim() === '') return <span key={index}>{part}</span>
        
        const isMatched = wordIndex < matchCount
        const isNext = wordIndex === matchCount
        wordIndex++
        
        if (isMatched) return <span key={index} className="text-gray-900">{part}</span>
        if (isNext) return <span key={index} className="text-emerald-600 font-bold">{part}</span>
        
        return <span key={index} className="text-gray-900">{part.replace(/./g, '*')}</span>
      })}
    </div>
  )
}

// ─── Community Comments ────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return 'Just now'
  const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

const HeartIcon = ({ solid, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={solid ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
  </svg>
)

const DictationComments = ({ exerciseId, sentenceIdx, currentUser }) => {
  const [comments, setComments] = useState([])
  const [isWriting, setIsWriting] = useState(false)
  const [draft, setDraft] = useState('')
  const [replyDraft, setReplyDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [sortOrder, setSortOrder] = useState('newest')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [visibleCount, setVisibleCount] = useState(10)

  useEffect(() => {
    if (!exerciseId || sentenceIdx == null) return
    let isMounted = true
    const fetchComments = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('dictation_comments')
          .select(`
            id, content, created_at, user_id, parent_comment_id,
            user:users!user_id(id, full_name, avatar_url),
            likes:dictation_comment_likes(user_id)
          `)
          .eq('exercise_id', exerciseId)
          .eq('sentence_idx', sentenceIdx)

        if (error) throw error

        let processed = (data || []).map(c => ({
          ...c,
          likeCount: c.likes?.length || 0,
          isLiked: c.likes?.some(l => l.user_id === currentUser?.id)
        }))

        if (sortOrder === 'helpful') {
          processed.sort((a, b) => (b.likeCount - a.likeCount) || (new Date(b.created_at) - new Date(a.created_at)))
        } else {
          processed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        }

        if (isMounted) setComments(processed)
      } catch (e) {
        console.error('Failed to fetch comments', e)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchComments()
    return () => { isMounted = false }
  }, [exerciseId, sentenceIdx, sortOrder, currentUser?.id])

  const handlePost = async (parentId = null) => {
    const text = parentId ? replyDraft : draft
    if (!text.trim() || !currentUser) return
    setErrorMsg(null)
    try {
      const newComment = {
        exercise_id: exerciseId,
        sentence_idx: sentenceIdx,
        user_id: currentUser.id,
        content: text.trim(),
        parent_comment_id: parentId
      }
      const { data, error } = await supabase.from('dictation_comments').insert(newComment).select(`
        id, content, created_at, user_id, parent_comment_id,
        user:users!user_id(id, full_name, avatar_url)
      `).single()

      if (error) throw error

      const added = { ...data, likeCount: 0, isLiked: false }
      setComments(prev => [added, ...prev])

      if (parentId) {
        setReplyDraft('')
        setReplyingTo(null)
      } else {
        setDraft('')
        setIsWriting(false)
      }
    } catch (e) {
      console.error(e)
      setErrorMsg("Couldn't post your comment. Make sure the database migration has been run.")
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this comment?")) return
    setErrorMsg(null)
    try {
      const { error } = await supabase.from('dictation_comments').delete().eq('id', id)
      if (error) throw error
      setComments(prev => prev.filter(c => c.id !== id))
    } catch (e) {
      console.error(e)
      setErrorMsg("Couldn't delete comment.")
    }
  }

  const handleEdit = async (id) => {
    if (!editDraft.trim()) return
    setErrorMsg(null)
    try {
      const { error } = await supabase.from('dictation_comments').update({ content: editDraft.trim(), updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      setComments(prev => prev.map(c => c.id === id ? { ...c, content: editDraft.trim() } : c))
      setEditingId(null)
      setEditDraft('')
    } catch (e) {
      console.error(e)
      setErrorMsg("Couldn't save edit.")
    }
  }

  const handleToggleLike = async (comment) => {
    if (!currentUser) return
    setErrorMsg(null)
    try {
      if (comment.isLiked) {
        const { error } = await supabase.from('dictation_comment_likes').delete().eq('comment_id', comment.id).eq('user_id', currentUser.id)
        if (error) throw error
        setComments(prev => prev.map(c => c.id === comment.id ? { ...c, isLiked: false, likeCount: c.likeCount - 1 } : c))
      } else {
        const { error } = await supabase.from('dictation_comment_likes').insert({ comment_id: comment.id, user_id: currentUser.id })
        if (error) throw error
        setComments(prev => prev.map(c => c.id === comment.id ? { ...c, isLiked: true, likeCount: c.likeCount + 1 } : c))
      }
    } catch (e) {
      console.error(e)
      setErrorMsg("Couldn't process your reaction.")
    }
  }

  const rootComments = comments.filter(c => !c.parent_comment_id).slice(0, visibleCount)
  const getReplies = (parentId) => comments.filter(c => c.parent_comment_id === parentId).reverse()

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
      <div className="text-[15px] text-gray-800 font-medium mb-4 pb-4 border-b border-gray-100">
        Comments ({comments.length})
      </div>

      {!loading && (
        <div className="flex items-center gap-4 mb-5">
          <span className="text-[13px] text-gray-600 font-medium">{comments.length} comments</span>
          <div className="flex items-center gap-1.5 text-gray-800">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h10M4 18h4" /></svg>
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
              className="text-[13px] font-medium bg-transparent border-none focus:ring-0 cursor-pointer p-0 pr-4 outline-none"
            >
              <option value="newest">Newest</option>
              <option value="helpful">Most helpful</option>
            </select>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 bg-red-50 text-red-600 text-[13px] px-3 py-2 rounded-lg border border-red-100 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {errorMsg}
        </div>
      )}

      {isWriting ? (
        <div className="mb-4 mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Write a comment..."
            className="w-full text-[13.5px] p-2.5 bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
            rows={2}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsWriting(false)} className="px-3 py-1.5 text-xs text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancel</button>
            <button
              onClick={() => handlePost(null)}
              disabled={!draft.trim()}
              className="px-3.5 py-1.5 text-xs text-white bg-blue-600 font-medium hover:bg-blue-700 rounded-lg disabled:opacity-50 shadow-sm"
            >
              Post
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4 mt-3">
          {loading ? (
            <div className="text-[13px] text-gray-400">Loading...</div>
          ) : rootComments.length === 0 ? (
            <div className="mb-3">
              <div className="text-[14px] text-gray-700 mb-3">No comments yet</div>
              <button onClick={() => setIsWriting(true)} className="px-3.5 py-1.5 text-[13px] text-blue-600 font-medium bg-white border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                Write a comment
              </button>
            </div>
          ) : (
            <button onClick={() => setIsWriting(true)} className="w-full py-2 mb-4 text-[13px] text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-lg transition-colors text-left px-3">
              Write a comment...
            </button>
          )}
        </div>
      )}

      {!loading && rootComments.length > 0 && (
        <div className="space-y-6">
          {rootComments.map(c => (
            <div key={c.id} className="group">
              <div className="flex gap-3.5">
                {c.user?.avatar_url ? (
                  <img src={c.user.avatar_url} className="w-9 h-9 object-cover shrink-0" alt="" />
                ) : (
                  <div className="w-9 h-9 bg-purple-600 text-white flex items-center justify-center font-medium shrink-0 uppercase">
                    {(c.user?.full_name || 'U').charAt(0)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-[13.5px] font-bold text-gray-900">{c.user?.full_name || 'Student'}</span>
                    <span className="text-[11.5px] text-gray-500 font-medium">{timeAgo(c.created_at)}</span>
                  </div>

                  {editingId === c.id ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} className="w-full text-[13px] p-2 bg-white border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-blue-500" rows={2} autoFocus />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancel</button>
                        <button onClick={() => handleEdit(c.id)} className="px-3 py-1.5 text-xs text-white bg-blue-600 font-medium hover:bg-blue-700 rounded-lg">Save</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[13.5px] text-gray-800 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                  )}

                  <div className="flex items-center gap-4 mt-2">
                    <button onClick={() => handleToggleLike(c)} className={`flex items-center gap-1.5 text-[12px] font-medium transition-colors ${c.isLiked ? 'text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}>
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M2 9h4v12H2a1 1 0 01-1-1V10a1 1 0 011-1zm20-1h-6V4a1 1 0 00-1-1 1 1 0 00-1 1v4H9a1 1 0 00-1 1v10a1 1 0 001 1h9.28a2 2 0 001.94-1.53l2-8A2 2 0 0022 8z" /></svg>
                      {c.likeCount > 0 ? c.likeCount : ''}
                    </button>
                    <button className="text-gray-400 hover:text-gray-700">
                      <svg className="w-3.5 h-3.5 fill-current mt-0.5" viewBox="0 0 24 24"><path d="M22 15h-4V3h4a1 1 0 011 1v10a1 1 0 01-1 1zM2 16h6v4a1 1 0 001 1 1 1 0 001-1v-4h5a1 1 0 001-1V5a1 1 0 00-1-1H2.72a2 2 0 00-1.94 1.53l-2 8A2 2 0 002 16z" /></svg>
                    </button>
                    <button onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)} className="text-[12px] text-gray-700 font-bold hover:bg-gray-100 px-2 py-1 rounded transition-colors">
                      Reply
                    </button>
                    {currentUser?.id === c.user_id && (
                      <div className="relative group/menu">
                        <button className="text-gray-400 hover:text-gray-700 p-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14a2 2 0 110-4 2 2 0 010 4zm-7 0a2 2 0 110-4 2 2 0 010 4zm14 0a2 2 0 110-4 2 2 0 010 4z" /></svg>
                        </button>
                        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-lg overflow-hidden hidden group-hover/menu:block z-10 w-24">
                          <button onClick={() => { setEditingId(c.id); setEditDraft(c.content); }} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 font-medium">Edit</button>
                          <button onClick={() => handleDelete(c.id)} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 font-medium">Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Replies */}
              {getReplies(c.id).length > 0 && (
                <div className="ml-12 mt-4 space-y-4">
                  {getReplies(c.id).map(r => (
                    <div key={r.id} className="flex gap-3">
                      {r.user?.avatar_url ? (
                        <img src={r.user.avatar_url} className="w-7 h-7 object-cover shrink-0" alt="" />
                      ) : (
                        <div className="w-7 h-7 bg-emerald-600 text-white flex items-center justify-center font-medium shrink-0 uppercase text-[11px]">
                          {(r.user?.full_name || 'U').charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-[13px] font-bold text-gray-900">{r.user?.full_name || 'Student'}</span>
                          <span className="text-[11px] text-gray-500 font-medium">{timeAgo(r.created_at)}</span>
                        </div>

                        {editingId === r.id ? (
                          <div className="mt-2 flex flex-col gap-2">
                            <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} className="w-full text-[13px] p-2 bg-white border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-blue-500" rows={2} autoFocus />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancel</button>
                              <button onClick={() => handleEdit(r.id)} className="px-3 py-1.5 text-xs text-white bg-blue-600 font-medium hover:bg-blue-700 rounded-lg">Save</button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-wrap">{r.content}</p>
                        )}

                        <div className="flex items-center gap-4 mt-1.5">
                          <button onClick={() => handleToggleLike(r)} className={`flex items-center gap-1.5 text-[12px] font-medium transition-colors ${r.isLiked ? 'text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}>
                            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M2 9h4v12H2a1 1 0 01-1-1V10a1 1 0 011-1zm20-1h-6V4a1 1 0 00-1-1 1 1 0 00-1 1v4H9a1 1 0 00-1 1v10a1 1 0 001 1h9.28a2 2 0 001.94-1.53l2-8A2 2 0 0022 8z" /></svg>
                            {r.likeCount > 0 ? r.likeCount : ''}
                          </button>
                          <button className="text-gray-400 hover:text-gray-700">
                            <svg className="w-3.5 h-3.5 fill-current mt-0.5" viewBox="0 0 24 24"><path d="M22 15h-4V3h4a1 1 0 011 1v10a1 1 0 01-1 1zM2 16h6v4a1 1 0 001 1 1 1 0 001-1v-4h5a1 1 0 001-1V5a1 1 0 00-1-1H2.72a2 2 0 00-1.94 1.53l-2 8A2 2 0 002 16z" /></svg>
                          </button>
                          <button onClick={() => setReplyingTo(replyingTo === r.id ? null : r.id)} className="text-[11px] text-gray-700 font-bold hover:bg-gray-100 px-2 py-1 rounded transition-colors">
                            Reply
                          </button>
                          {currentUser?.id === r.user_id && (
                            <div className="relative group/menu">
                              <button className="text-gray-400 hover:text-gray-700 p-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14a2 2 0 110-4 2 2 0 010 4zm-7 0a2 2 0 110-4 2 2 0 010 4zm14 0a2 2 0 110-4 2 2 0 010 4z" /></svg>
                              </button>
                              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-lg overflow-hidden hidden group-hover/menu:block z-10 w-24">
                                <button onClick={() => { setEditingId(r.id); setEditDraft(r.content); }} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 font-medium">Edit</button>
                                <button onClick={() => handleDelete(r.id)} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 font-medium">Delete</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Input */}
              {replyingTo === c.id && (
                <div className="ml-12 mt-3 flex items-start gap-2">
                  <textarea
                    value={replyDraft}
                    onChange={e => setReplyDraft(e.target.value)}
                    placeholder="Add a reply..."
                    className="flex-1 text-[13px] p-2 bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={1}
                    autoFocus
                  />
                  <button
                    onClick={() => handlePost(c.id)}
                    disabled={!replyDraft.trim()}
                    className="px-3 py-1.5 text-xs text-white bg-blue-600 font-medium hover:bg-blue-700 rounded-lg disabled:opacity-50"
                  >
                    Reply
                  </button>
                </div>
              )}
            </div>
          ))}

          {comments.filter(c => !c.parent_comment_id).length > visibleCount && (
            <button onClick={() => setVisibleCount(v => v + 10)} className="w-full py-2.5 mt-2 text-[13px] font-semibold text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors border border-gray-100">
              View more comments
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Segment Audio Hook ───────────────────────────────────────────────────────
const useSegmentAudio = (audioRef) => {
  const animRef = useRef(null)
  const currentSegRef = useRef(null)
  const isSeekingRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [segDuration, setSegDuration] = useState(0)

  useEffect(() => () => { cancelAnimationFrame(animRef.current); audioRef.current?.pause() }, [])

  const setIsSeeking = useCallback((seeking) => {
    isSeekingRef.current = seeking
  }, [])

  const trackProgress = () => {
    if (!audioRef.current || !currentSegRef.current) return
    const { start, end } = currentSegRef.current
    const curr = audioRef.current.currentTime
    if (curr >= end && !isSeekingRef.current) {
      audioRef.current.pause()
      setProgress(1)
      setElapsed(end - start)
      setPlaying(false)

      if (settingsRef.current?.autoReplay) {
        clearTimeout(autoReplayTimerRef.current)
        autoReplayTimerRef.current = setTimeout(() => {
          playSegment(start, end, speed, false)
        }, (settingsRef.current?.replayDelay || 0) * 1000)
      }

      return
    }

    if (!isSeekingRef.current) {
      setProgress(Math.max(0, (curr - start) / (end - start)))
      setElapsed(Math.max(0, curr - start))
    }

    animRef.current = requestAnimationFrame(trackProgress)
  }

  const playSegment = useCallback((start, end, speed = 1, resume = false) => {
    if (!audioRef.current) return
    cancelAnimationFrame(animRef.current)

    if (!resume || !currentSegRef.current || currentSegRef.current.start !== start) {
      currentSegRef.current = { start, end }
      audioRef.current.currentTime = start
      setProgress(0)
      setElapsed(0)
    } else if (audioRef.current.currentTime >= end - 0.05) {
      audioRef.current.currentTime = start
      setProgress(0)
      setElapsed(0)
    }

    audioRef.current.playbackRate = speed
    audioRef.current.play()
    setPlaying(true)
    setSegDuration(end - start)
    animRef.current = requestAnimationFrame(trackProgress)
  }, [])

  const pauseSegment = useCallback(() => {
    cancelAnimationFrame(animRef.current)
    audioRef.current?.pause()
    setPlaying(false)
  }, [])

  const seekSegment = useCallback((ratio, start, end) => {
    if (!audioRef.current) return
    currentSegRef.current = { start, end }
    const newTime = start + ratio * (end - start)
    audioRef.current.currentTime = Math.min(end, Math.max(start, newTime))
    setProgress(ratio)
    setElapsed(ratio * (end - start))
  }, [])

  return { playing, progress, elapsed, segDuration, playSegment, pauseSegment, seekSegment, setIsSeeking }
}

// ─── Main Component ───────────────────────────────────────────────────────────
const ListeningDictationExercise = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { startExercise, completeExerciseWithXP } = useProgress()

  const searchParams = new URLSearchParams(location.search)
  const exerciseId = searchParams.get('exerciseId')
  const sessionId = searchParams.get('sessionId')
  const courseId = searchParams.get('courseId')
  const unitId = searchParams.get('unitId')

  const backToSession = () => {
    if (sessionId && unitId && courseId) {
      navigate(`/study/course/${courseId}/unit/${unitId}/session/${sessionId}`)
    } else {
      navigate(-1)
    }
  }

  const [exercise, setExercise] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showTimestamps, setShowTimestamps] = useState(false)

  const [mode, setMode] = useState('dictation')
  const [currentIdx, setCurrentIdx] = useState(0)
  const [inputText, setInputText] = useState('')
  const [checked, setChecked] = useState(false)
  const [diffResult, setDiffResult] = useState(null)
  const [skipped, setSkipped] = useState(false)
  const [segmentResults, setSegmentResults] = useState([])
  const [isComplete, setIsComplete] = useState(false)
  const [isReviewMode, setIsReviewMode] = useState(false)
  const [siblingExercises, setSiblingExercises] = useState([])
  const [xpAwarded, setXpAwarded] = useState(0)
  const [speed, setSpeed] = useState(1.0)
  const [volume, setVolume] = useState(1.0)
  const [showFullAudio, setShowFullAudio] = useState(false)

  const defaultSettings = {
    replayKey: 'Control',
    playPauseKey: '`',
    autoReplay: false,
    replayDelay: 0.5,
    wordSuggestions: false,
    showShortcutTips: true
  }
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('listeningDictationSettings')
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings
    } catch { return defaultSettings }
  })
  const updateSetting = (key, val) => {
    setSettings(prev => {
      const next = { ...prev, [key]: val }
      localStorage.setItem('listeningDictationSettings', JSON.stringify(next))
      return next
    })
  }

  const [showSettings, setShowSettings] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [globalTime, setGlobalTime] = useState(0)
  const [isFullPlaying, setIsFullPlaying] = useState(false)
  const [fullDuration, setFullDuration] = useState(0)
  const [transcriptSearch, setTranscriptSearch] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)

  const settingsRef = useRef(settings)
  const autoReplayTimerRef = useRef(null)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])
  const [repeatAudio, setRepeatAudio] = useState(false)
  const [activeSegmentIdx, setActiveSegmentIdx] = useState(-1)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [activeSubMenu, setActiveSubMenu] = useState(null)
  const transcriptListRef = useRef(null)
  const activeRowRef = useRef(null)

  const [segmentNotes, setSegmentNotes] = useState({})
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  const audioRef = useRef(null)
  const inputRef = useRef(null)
  const { playing, progress, elapsed, segDuration, playSegment, pauseSegment, seekSegment, setIsSeeking } = useSegmentAudio(audioRef)

  const segments = exercise?.content?.segments || []
  const seg = segments[currentIdx]
  const totalSegments = segments.length
  const answeredCount = segmentResults.length
  const progressPct = totalSegments > 0 ? Math.round((answeredCount / totalSegments) * 100) : 0

  // Load exercise
  useEffect(() => {
    if (!exerciseId) { setError('No exercise ID'); setLoading(false); return }
    const load = async () => {
      try {
        const { data, error: err } = await supabase.from('exercises').select('*').eq('id', exerciseId).single()
        if (err) throw err
        setExercise(data)
        if (user) startExercise(exerciseId)

        if (data?.session_id) {
          const { data: siblings } = await supabase.from('exercises')
            .select('id, title, order_index')
            .eq('session_id', data.session_id)
            .eq('is_active', true)
            .order('order_index')
          if (siblings) setSiblingExercises(siblings)
        }
      } catch { setError('Không thể tải bài học') } finally { setLoading(false) }
    }
    load()
  }, [exerciseId, user])

  // Apply speed & volume
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed }, [speed])
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume }, [volume])

  // Auto-play on segment change
  useEffect(() => {
    if (!seg || !audioRef.current) return
    const existing = segmentResults.find(r => r.idx === currentIdx)
    if (existing) {
      setInputText(existing.userAnswer || '')
      setChecked(true); setDiffResult(existing.diffResult); setSkipped(existing.skipped)
    } else {
      setInputText(''); setChecked(false); setDiffResult(null); setSkipped(false)
    }
    const t = setTimeout(() => { if (audioRef.current) audioRef.current.playbackRate = speed; playSegment(seg.start_time, seg.end_time, speed) }, 300)
    return () => clearTimeout(t)
  }, [currentIdx, seg?.start_time])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase() || ''
      const inInput = ['input', 'textarea', 'select'].includes(activeTag) || document.activeElement?.isContentEditable

      if (e.key === 'Escape') {
        setShowSettings(false)
        setShowMoreMenu(false)
        setIsEditingNote(false)
      }

      // Helper to match key
      const matchKey = (settingKey, ev) => {
        if (!settingKey || settingKey === 'None') return false;
        if (settingKey === 'Control') return ev.key === 'Control' || ev.ctrlKey;
        if (settingKey === 'Alt') return ev.key === 'Alt' || ev.altKey;
        if (settingKey === 'Shift') return ev.key === 'Shift' || ev.shiftKey;
        if (settingKey === 'Space') return ev.key === ' ' || ev.code === 'Space';
        return ev.key.toLowerCase() === settingKey.toLowerCase();
      }

      // Dynamic Replay Key
      if (matchKey(settings.replayKey, e)) {
        const isModifier = ['Control', 'Alt', 'Shift'].includes(settings.replayKey);
        const isSpecial = ['`', 'Escape', 'Enter'].includes(settings.replayKey);
        if (inInput && !isModifier && !isSpecial && !e.ctrlKey && !e.metaKey) {
          // let user type normally if they set 'r' as shortcut
        } else {
          e.preventDefault();
          handleReplay();
        }
      }

      // Dynamic Play/Pause Key
      if (matchKey(settings.playPauseKey, e)) {
        const isModifier = ['Control', 'Alt', 'Shift'].includes(settings.playPauseKey);
        const isSpecial = ['`', 'Escape', 'Enter'].includes(settings.playPauseKey);
        if (inInput && !isModifier && !isSpecial && !e.ctrlKey && !e.metaKey) {
          // let user type normally
        } else {
          e.preventDefault();
          if (mode === 'full' && audioRef.current) {
            isFullPlaying ? audioRef.current.pause() : audioRef.current.play()
          } else {
            playing ? pauseSegment() : handleReplay()
          }
        }
      }

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!checked) handleCheck(); else handleNext() }
      if (!inInput) {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          if (mode === 'full' && audioRef.current) {
            const nextIdx = activeSegmentIdx >= 0 ? activeSegmentIdx + 1 : 0
            if (nextIdx < segments.length) audioRef.current.currentTime = segments[nextIdx].start_time
          } else if (mode === 'dictation') {
            if (checked || !inputText.trim()) handleNext()
          }
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          if (mode === 'full' && audioRef.current) {
            if (activeSegmentIdx > 0) audioRef.current.currentTime = segments[activeSegmentIdx - 1].start_time
          } else if (mode === 'dictation') {
            handlePrev()
          }
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [checked, inputText, seg, playing, mode, isFullPlaying, segments, activeSegmentIdx, currentIdx, totalSegments, settings, showSettings])

  // Sync active segment with globalTime
  useEffect(() => {
    if (mode === 'full' && segments.length > 0) {
      let idx = segments.findIndex(s => globalTime >= s.start_time && globalTime < s.end_time)
      if (idx === -1) {
        let closestIdx = -1
        for (let i = 0; i < segments.length; i++) {
          if (segments[i].start_time <= globalTime) closestIdx = i
          else break
        }
        idx = closestIdx >= 0 ? closestIdx : 0
      }
      if (idx !== activeSegmentIdx) {
        setActiveSegmentIdx(idx)
      }
    }
  }, [globalTime, mode, segments, activeSegmentIdx])

  // Auto-scroll active row in Full Transcript mode
  useEffect(() => {
    if (autoScroll && mode === 'full' && activeRowRef.current && transcriptListRef.current && activeSegmentIdx !== -1) {
      const container = transcriptListRef.current;
      const el = activeRowRef.current;
      container.scrollTo({
        top: el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2,
        behavior: 'smooth'
      });
    }
  }, [activeSegmentIdx, mode, autoScroll])


  const handleReplay = () => { if (!seg) return; if (audioRef.current) audioRef.current.playbackRate = speed; playSegment(seg.start_time, seg.end_time, speed, true) }

  const handleCheck = () => {
    if (!seg || !inputText.trim()) return
    const allAnswers = [seg.text_content, ...(seg.alt_answers || [])]
    let bestDiff = null, bestAccuracy = 0
    for (const ans of allAnswers) {
      const d = diffWords(inputText, ans); const acc = calcAccuracy(d)
      if (acc > bestAccuracy || bestDiff === null) { bestAccuracy = acc; bestDiff = d }
    }
    setDiffResult(bestDiff);
    
    const errorsCount = calcErrors(bestDiff)
    if (errorsCount === 0) {
      setChecked(true)
      const newResults = [...segmentResults.filter(r => r.idx !== currentIdx),
      { idx: currentIdx, accuracy: bestAccuracy, skipped: false, userAnswer: inputText, diffResult: bestDiff }]
      setSegmentResults(newResults)
      if (autoAdvance && currentIdx < totalSegments - 1) setTimeout(() => handleNext(), 1200)
    } else {
      // Incorrect - keep checking false so they can continue typing
      setChecked(false)
    }
  }

  const handleSkip = () => {
    if (checked) return
    pauseSegment()
    setSkipped(true); setChecked(true); setDiffResult(null)
    setSegmentResults(prev => [...prev.filter(r => r.idx !== currentIdx),
    { idx: currentIdx, accuracy: 0, skipped: true, userAnswer: inputText, diffResult: null }])
  }

  const handleSaveNote = () => {
    if (!noteDraft.trim()) {
      const newNotes = { ...segmentNotes }
      delete newNotes[currentIdx]
      setSegmentNotes(newNotes)
    } else {
      setSegmentNotes(prev => ({ ...prev, [currentIdx]: noteDraft }))
    }
    setIsEditingNote(false)
  }

  const handleNext = () => {
    clearTimeout(autoReplayTimerRef.current)
    if (currentIdx < totalSegments - 1) setCurrentIdx(currentIdx + 1)
    else finishExercise()
  }

  const handlePrev = () => { 
    clearTimeout(autoReplayTimerRef.current)
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1) 
  }

  const finishExercise = async () => {
    setIsComplete(true)
    if (!user || !exerciseId) return
    const answered = segmentResults.filter(r => !r.skipped)
    const avgScore = answered.length ? Math.round(answered.reduce((s, r) => s + r.accuracy, 0) / answered.length) : 0
    try {
      const baseXP = exercise?.xp_reward || 20
      const bonusXP = avgScore >= 90 ? Math.round(baseXP * 0.5) : avgScore >= 75 ? Math.round(baseXP * 0.3) : 0
      const result = await completeExerciseWithXP(exerciseId, baseXP + bonusXP, { score: avgScore, max_score: 100, xp_earned: baseXP + bonusXP })
      if (result?.xpAwarded > 0) setXpAwarded(result.xpAwarded)
    } catch (e) { console.error(e) }
  }

  // ── Loading / Error ──────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#f0f2f8]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Đang tải bài học...</p>
      </div>
    </div>
  )

  if (error) return <div className="flex items-center justify-center h-screen text-red-500">{error}</div>

  const accuracy = segmentResults.find(r => r.idx === currentIdx)?.accuracy

  // ── Completion Screen ────────────────────────────────────────────────────
  if (isComplete) {
    const correct = segmentResults.filter(r => r.accuracy >= 80).length
    const incorrect = segmentResults.filter(r => !r.skipped && r.accuracy < 80).length
    const answered2 = segmentResults.filter(r => !r.skipped)
    const avgAcc = answered2.length ? Math.round(answered2.reduce((s, r) => s + r.accuracy, 0) / answered2.length) : 0
    return (
      <div className="min-h-screen bg-[#f0f2f8] flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
          <div className="w-16 h-16 mx-auto mb-4 bg-indigo-50 rounded-full flex items-center justify-center">
            <Headphones className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Hoàn thành bài luyện</h2>
          <p className="text-gray-500 text-sm mb-6">{exercise?.title}</p>
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Đúng', value: correct, color: 'text-green-600' },
              { label: 'Sai', value: incorrect, color: 'text-red-500' },
              { label: 'Tổng', value: totalSegments, color: 'text-gray-700' },
              { label: 'Chính xác', value: `${avgAcc}%`, color: 'text-indigo-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
          {xpAwarded > 0 && (
            <div className="flex items-center justify-center gap-1.5 text-amber-600 font-semibold mb-5 text-sm">
              <Star className="w-4 h-4" /><span>+{xpAwarded} XP</span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <button onClick={() => { setIsComplete(false); setIsReviewMode(true) }} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors">Xem lại</button>
            <button onClick={() => { setIsComplete(false); setCurrentIdx(0); setSegmentResults([]); setInputText(''); setChecked(false) }} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-colors">Làm lại</button>
            <button onClick={backToSession}className="w-full py-2.5 text-gray-500 hover:text-gray-700 text-sm transition-colors">Về trang học</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Review Screen ────────────────────────────────────────────────────────
  if (isReviewMode) {
    return (
      <div className="min-h-screen bg-[#f0f2f8] flex flex-col">
        <audio ref={audioRef} src={exercise?.content?.audio_url} preload="auto" />
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setIsComplete(true)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"><ArrowLeft className="w-4 h-4" /></button>
          <div><p className="text-sm font-bold text-gray-900">{exercise?.title}</p><p className="text-xs text-gray-400">Xem lại đáp án</p></div>
        </header>
        <main className="flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto w-full space-y-4">
          {segments.map((segment, i) => {
            const res = segmentResults.find(r => r.idx === i)
            const isSkipped = !res || res.skipped
            return (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-700">Câu {i + 1}</span>
                  {isSkipped ? <span className="flex items-center gap-1 text-xs text-amber-500"><SkipForward className="w-3.5 h-3.5" />Bỏ qua</span>
                    : res.accuracy >= 80 ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3.5 h-3.5" />Đúng</span>
                      : <span className="flex items-center gap-1 text-xs text-red-500"><XCircle className="w-3.5 h-3.5" />Sai ({res.accuracy}%)</span>}
                </div>
                <div className="space-y-3 mb-3">
                  {!isSkipped && <div><p className="text-xs text-gray-400 mb-1">Câu bạn nhập:</p><p className="text-gray-700 text-sm">{res.userAnswer}</p></div>}
                  <div><p className="text-xs text-gray-400 mb-1">Đáp án đúng:</p><p className="text-gray-900 text-sm font-medium">{segment.text_content}</p></div>
                  {!isSkipped && res.diffResult && <div><p className="text-xs text-gray-400 mb-1">Chi tiết:</p><DiffResult tokens={res.diffResult} /></div>}
                </div>
                <button onClick={() => playSegment(segment.start_time, segment.end_time, speed)} className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  <Play className="w-3.5 h-3.5" />Nghe lại
                </button>
              </div>
            )
          })}
        </main>
      </div>
    )
  }

  const MoreMenuDropdown = () => (
    <div className="relative shrink-0 flex items-center gap-1.5">
      {speed !== 1.0 && (
        <span className="text-[11px] font-bold text-gray-500 select-none">
          {speed}x
        </span>
      )}
      <button
        onClick={() => { setShowMoreMenu(!showMoreMenu); setActiveSubMenu(null); }}
        className="p-1 hover:bg-gray-200/60 rounded-lg text-gray-500 transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {showMoreMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
          <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-100 py-1.5 z-50 overflow-hidden text-gray-800 font-medium">
            {activeSubMenu === null ? (
              <div className="flex flex-col">
                <div className="px-4 py-2.5 flex items-center gap-3">
                  <Volume2 className="w-4 h-4 text-gray-600 shrink-0" />
                  <span className="text-sm text-gray-800 flex-1">Volume</span>
                  <input type="range" min="0" max="1" step="0.05" value={volume}
                    onChange={e => setVolume(parseFloat(e.target.value))}
                    className="w-20 h-1 accent-blue-600 cursor-pointer" />
                </div>

                <button
                  onClick={() => setActiveSubMenu('speed')}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-100 transition-colors"
                >
                  <Gauge className="w-4 h-4 text-gray-600 shrink-0" />
                  <span className="text-sm text-gray-800 flex-1">Playback speed</span>
                  <span className="text-xs text-gray-500">{speed === 1.0 ? '1x' : `${speed}x`}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>

                <button
                  onClick={() => setRepeatAudio(!repeatAudio)}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-100 transition-colors cursor-pointer"
                  role="switch"
                  aria-checked={repeatAudio}
                >
                  <Repeat className="w-4 h-4 text-gray-600 shrink-0" />
                  <span className="text-sm text-gray-800 flex-1">Repeat sentence</span>
                  <div className={`w-8 h-4 rounded-full relative transition-colors duration-200 ease-in-out ${repeatAudio ? 'bg-blue-600' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform duration-200 ease-in-out ${repeatAudio ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </div>
                </button>

                {exercise?.content?.audio_url && (
                  <a
                    href={exercise.content.audio_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => setShowMoreMenu(false)}
                  >
                    <Download className="w-4 h-4 text-gray-600 shrink-0" />
                    <span className="text-sm text-gray-800 flex-1">Download audio</span>
                  </a>
                )}
              </div>
            ) : activeSubMenu === 'speed' ? (
              <div className="flex flex-col pb-1">
                <button
                  onClick={() => setActiveSubMenu(null)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-100 flex items-center gap-2 border-b border-gray-100 pb-2 mb-1 transition-colors font-medium"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-600" /> Playback speed
                </button>
                {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map(s => (
                  <button
                    key={s}
                    onClick={() => { setSpeed(s); setShowMoreMenu(false); setActiveSubMenu(null); }}
                    className="w-full text-left px-10 py-1.5 text-sm text-gray-800 hover:bg-gray-100 flex items-center relative transition-colors"
                  >
                    {speed === s && <Check className="absolute left-3 w-4 h-4 text-gray-900 font-bold" />}
                    {s === 1.0 ? 'Normal' : `${s}x`}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )

  // ── Main Student UI ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f0f2f8] flex flex-col" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <audio
        ref={audioRef}
        src={exercise?.content?.audio_url}
        preload="auto"
        onTimeUpdate={e => {
          const ct = e.target.currentTime
          if (mode === 'full' && repeatAudio && activeSegmentIdx !== -1) {
            const activeSeg = segments[activeSegmentIdx]
            if (activeSeg && ct >= activeSeg.end_time) {
              e.target.currentTime = activeSeg.start_time
              if (audioRef.current.paused) e.target.play()
              return
            }
          }
          setGlobalTime(ct)
        }}
        onLoadedMetadata={e => setFullDuration(e.target.duration || 0)}
        onEnded={() => setIsFullPlaying(false)}
        onPause={() => setIsFullPlaying(false)}
        onPlay={() => setIsFullPlaying(true)}
      />

      {/* ══════════════ HEADER ══════════════ */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto w-full">
          {/* Row 1: Back to course | Fullscreen */}
          <div className="flex items-center justify-between px-6 pt-2 pb-0">
            <button
              onClick={backToSession}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />Back to course
            </button>
            <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-500 transition-colors">
              <Maximize2 className="w-3 h-3" />Fullscreen
            </button>
          </div>

          {/* Row 2: Title + badge (left) | progress bar + count (right) */}
          <div className="flex items-center justify-between gap-6 px-6 pt-1 pb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-[22px] font-bold text-gray-900 leading-tight tracking-tight">
                  {exercise?.title || 'Listening Dictation'}
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-[#e8eaf6] text-[#3949ab] rounded-md shrink-0">
                  Vocab level: B1
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5 truncate">
                {exercise?.description || 'Listening Dictation'}
              </p>
            </div>

            {/* Progress bar + count */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                {currentIdx + 1} / {totalSegments}
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex px-6 mt-4 border-b border-gray-200 gap-1.5">
            {[
              { id: 'dictation', label: 'Dictation', icon: Headphones },
              { id: 'full', label: 'Full transcript', icon: FileText },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setMode(id)
                  if (id !== 'dictation') { pauseSegment(); if (audioRef.current) audioRef.current.pause() }
                }}
                className={`flex items-center gap-2 px-5 py-2.5 text-sm transition-all rounded-t-xl ${mode === id
                  ? 'text-blue-600 bg-white border border-gray-200 border-b-white -mb-[1px] font-semibold border-t-2 border-t-blue-600'
                  : 'text-gray-500 hover:text-gray-700 font-medium hover:bg-gray-50/80 border border-transparent border-t-2 border-b-0'
                  }`}
              >
                <Icon className={`w-4 h-4 ${mode === id ? 'text-blue-600' : 'text-gray-400'}`} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>


      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[951px] mx-auto px-6 py-6 w-full">

          {/* ════ DICTATION MODE ════ */}
          {mode === 'dictation' && (
            <div className="flex flex-col gap-4">

              {/* UNIFIED DICTATION CARD */}
              <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 pb-5">

                {/* 1. Navigation bar */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-1.5 bg-gray-100/70 p-1 rounded-xl text-gray-700">
                    <button onClick={handlePrev} disabled={currentIdx === 0}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white disabled:opacity-30 transition-all shadow-none hover:shadow-xs">
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-semibold px-2 min-w-[44px] text-center text-gray-700">{currentIdx + 1} / {totalSegments}</span>
                    <button
                      onClick={() => { if (checked || !inputText.trim()) handleNext() }}
                      disabled={!checked && !!inputText.trim()}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white disabled:opacity-30 transition-all shadow-none hover:shadow-xs">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center relative">
                    <button
                      onClick={() => setShowSettings(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors font-medium shadow-xs"
                    >
                      <Settings className="w-3.5 h-3.5 text-gray-500" />Settings
                    </button>
                    {showSettings && (
                      <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-10 w-48">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <div onClick={() => setAutoAdvance(v => !v)}
                            className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${autoAdvance ? 'bg-blue-600' : 'bg-gray-200'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${autoAdvance ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                          </div>
                          <span className="text-xs text-gray-700">Tự động chuyển (≥80%)</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div className={skipped ? "flex flex-col lg:flex-row gap-5" : ""}>
                  <div className={skipped ? "flex-[1.1] flex flex-col gap-1" : ""}>
                    {/* 2. Audio Player */}
                    <div className="flex items-center gap-3 mb-4 bg-gray-50/70 px-3 py-2 rounded-2xl border border-gray-100">
                      <button
                        onClick={playing ? pauseSegment : handleReplay}
                        className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shrink-0 shadow-sm transition-all"
                      >
                        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
                      </button>

                      <span className="text-xs font-medium text-gray-600 shrink-0 whitespace-nowrap">
                        {formatTime(elapsed)} / {formatTime(seg ? seg.end_time - seg.start_time : 0)}
                      </span>

                      {/* Progress bar */}
                      <div className="flex-1">
                        <Slider
                          value={[progress * 100]}
                          max={100}
                          step={0.1}
                          onValueChange={(val) => {
                            if (!seg || !audioRef.current) return
                            seekSegment(val[0] / 100, seg.start_time, seg.end_time, true)
                          }}
                          onPointerDown={() => setIsSeeking(true)}
                          onPointerUp={() => setIsSeeking(false)}
                          className="w-full"
                        />
                      </div>

                      <MoreMenuDropdown />
                    </div>

                    {!skipped ? (
                      <>
                        {/* 3. Text Area */}
                        <p className="text-xs text-gray-500 font-medium mb-1.5">Type what you hear...</p>
                        <div className="relative mb-4">
                          <textarea
                            ref={inputRef}
                            value={inputText}
                            onChange={e => { if (!checked) setInputText(e.target.value) }}
                            disabled={checked}
                            rows={2}
                            maxLength={500}
                            autoComplete={settings.wordSuggestions ? "on" : "off"}
                            autoCorrect={settings.wordSuggestions ? "on" : "off"}
                            spellCheck={settings.wordSuggestions}
                            className="w-full bg-white text-gray-900 text-sm rounded-xl px-4 py-2.5 border border-gray-200/80 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none transition-all placeholder-gray-300 disabled:bg-gray-50/50 disabled:text-gray-700"
                            placeholder="Type what you hear..."
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !checked) { e.preventDefault(); handleCheck() } }}
                          />
                          <button className="absolute bottom-3 right-3 p-1.5 rounded-full bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors">
                            <Mic className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Results/Feedback */}
                        {diffResult && !skipped && (
                          <div className="mb-4 flex flex-col gap-3">
                            {(() => {
                              const errorsCount = calcErrors(diffResult)
                              if (errorsCount === 0) {
                                return (
                                  <div className="p-3.5 bg-green-50 rounded-xl border border-green-100 flex flex-col gap-1.5 shadow-sm">
                                    <div className="flex items-center gap-1.5 text-green-700 font-bold text-[12px] uppercase tracking-wider">
                                      <CheckCircle className="w-3.5 h-3.5" /> Correct!
                                    </div>
                                    <p className="text-gray-900 text-[14px] font-medium leading-relaxed">{seg?.text_content}</p>
                                  </div>
                                )
                              }

                              return (
                                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 shadow-sm flex flex-col gap-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-amber-600 font-bold text-[15px]">
                                      <AlertTriangle className="w-4 h-4" /> Incorrect
                                    </div>
                                    <button onClick={handleSkip} className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-md text-[13px] font-medium hover:bg-gray-50 transition-colors shadow-sm">
                                      Skip
                                    </button>
                                  </div>
                                  <ProgressiveHint input={inputText} answer={seg?.text_content || ''} />
                                </div>
                              )
                            })()}
                          </div>
                        )}

                        {/* 4. Action Buttons */}
                        <div className="flex gap-2.5">
                          {!checked ? (
                            <>
                              <button
                                onClick={handleCheck}
                                disabled={!inputText.trim()}
                                className="px-3.5 h-[30px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-blue-600 disabled:cursor-not-allowed text-white rounded-lg text-[13px] font-medium transition-all shadow-sm flex items-center justify-center gap-1.5"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Check
                              </button>
                              <button
                                onClick={handleSkip}
                                className="px-3.5 h-[30px] bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-[13px] font-medium transition-all flex items-center justify-center gap-1.5"
                              >
                                <SkipForward className="w-3.5 h-3.5 text-gray-500" /> Skip
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Removed Try Again because it's no longer disabled */}
                              <button onClick={handleNext}
                                className="px-3.5 h-[30px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[13px] font-medium transition-all shadow-sm flex items-center justify-center gap-1.5">
                                {currentIdx < totalSegments - 1 ? 'Next' : 'Hoàn thành'}
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Skip Review Mode - Left Column */}
                        <div className="bg-emerald-50/40 border border-emerald-200/60 rounded-xl px-5 py-6 mt-1 flex items-center justify-center min-h-[140px]">
                          <div className="text-[20px] font-medium text-gray-900 text-center leading-relaxed">
                            {seg?.text_content}
                          </div>
                        </div>

                        {/* Inline Note Editor & Display */}
                        {isEditingNote ? (
                          <div className="mt-4 flex flex-col gap-2">
                            <textarea
                              value={noteDraft}
                              onChange={e => setNoteDraft(e.target.value)}
                              placeholder="Write your private note here..."
                              className="w-full text-[13.5px] p-3 bg-amber-50/30 border border-amber-200 rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
                              rows={2}
                              autoFocus
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setIsEditingNote(false)} className="px-3.5 py-1.5 text-xs text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancel</button>
                              <button onClick={handleSaveNote} className="px-3.5 py-1.5 text-xs text-amber-700 bg-amber-100 font-medium hover:bg-amber-200 rounded-lg">Save Note</button>
                            </div>
                          </div>
                        ) : segmentNotes[currentIdx] ? (
                          <div className="mt-4 p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">My Note</span>
                            </div>
                            <p className="text-[13.5px] text-gray-800">{segmentNotes[currentIdx]}</p>
                          </div>
                        ) : null}

                        <div className="flex items-center justify-end gap-3 mt-4 pt-1">
                          {!isEditingNote && (
                            <button
                              onClick={() => { setNoteDraft(segmentNotes[currentIdx] || ''); setIsEditingNote(true); }}
                              className="px-4 h-[34px] bg-white border border-gray-200 text-gray-600 hover:text-gray-900 rounded-lg text-[13px] font-medium transition-all shadow-sm flex items-center gap-1.5"
                            >
                              + Note
                            </button>
                          )}
                          <button onClick={handleNext} className="px-6 h-[34px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[13px] font-medium transition-all shadow-sm flex items-center gap-1.5">
                            {currentIdx < totalSegments - 1 ? 'Next' : 'Hoàn thành'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Skip Review Mode - Right Column */}
                  {skipped && (
                    <div className="flex-[0.9] flex flex-col gap-3.5 pt-1 lg:pt-0">
                      {/* Translation */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
                        <div className="text-[13px] text-gray-500 mb-2">Translation</div>
                        <div className="text-[14px] text-gray-900 font-medium">{seg?.translation || 'Translation not available.'}</div>
                      </div>

                      {/* Pronunciation */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
                        <div className="text-[13px] text-gray-500 mb-3">Pronunciation</div>
                        <div className="flex flex-wrap gap-x-2.5 gap-y-3 text-[15.5px] text-gray-900">
                          {getTokens(seg?.text_content || '').map((t, i) => (
                            <span key={i} className="border-b-[1.5px] border-dotted border-gray-300 pb-0.5 cursor-pointer hover:border-gray-500 hover:text-blue-600 transition-colors">{t.original}</span>
                          ))}
                        </div>
                      </div>

                      {/* Comments */}
                      <DictationComments exerciseId={exercise?.id} sentenceIdx={currentIdx} currentUser={user} />
                    </div>
                  )}
                </div>
              </div>

              {/* ── Tip box ── */}
              <div className="flex items-center justify-between bg-amber-50/70 border border-amber-200/60 rounded-xl px-4 py-3.5">
                <div className="flex items-center gap-2.5 text-xs text-amber-900 font-medium">
                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                  Repeat each sentence a few times before checking your answer.
                </div>
              </div>

              {/* ── Full Audio & Plain Transcript ── */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowFullAudio(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 text-sm font-semibold text-gray-800">
                    <Play className="w-4 h-4 text-gray-600" />
                    Full Audio & Plain Transcript
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showFullAudio ? 'rotate-180' : ''}`} />
                </button>

                {showFullAudio && (
                  <div className="p-6">
                    {/* Minimal Audio Player Row */}
                    <div className="flex items-center gap-3 bg-gray-100/70 w-fit px-4 py-1.5 rounded-full border border-gray-200 mb-6">
                      <button
                        onClick={() => { if (!audioRef.current) return; if (isFullPlaying) audioRef.current.pause(); else audioRef.current.play() }}
                        className="text-gray-900 hover:text-black transition-colors"
                      >
                        {isFullPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                      </button>

                      <span className="text-xs font-medium text-gray-700 shrink-0 min-w-[70px]">
                        {formatTime(globalTime)} / {formatTime(fullDuration)}
                      </span>

                      <div className="w-32 flex items-center">
                        <input
                          type="range"
                          min={0}
                          max={fullDuration || 100}
                          step={0.1}
                          value={globalTime}
                          onChange={(e) => {
                            if (!audioRef.current || !fullDuration) return;
                            const newTime = Number(e.target.value);
                            audioRef.current.currentTime = newTime;
                            setGlobalTime(newTime);
                          }}
                          className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-gray-700"
                        />
                      </div>

                      <button className="text-gray-700 hover:text-black ml-2">
                        <Volume2 className="w-4 h-4" />
                      </button>

                      <button className="text-gray-700 hover:text-black ml-1">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Plain Transcript Text */}
                    <div ref={transcriptListRef} className="max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                      <div className="flex flex-col">
                        {segments.map((segment, i) => {
                          const isActive = activeSegmentIdx === i || (activeSegmentIdx === -1 && globalTime >= segment.start_time && globalTime < segment.end_time);
                          return (
                            <div
                              key={i}
                              ref={isActive ? activeRowRef : null}
                              onClick={() => { if (audioRef.current) { audioRef.current.currentTime = segment.start_time; audioRef.current.play(); } }}
                              className="cursor-pointer"
                            >
                              <span className={`text-[16px] leading-[1.65] transition-colors duration-200 ${isActive ? 'text-[#2563EB] font-semibold' : 'text-gray-800 font-normal hover:text-gray-900'
                                }`}>
                                {segment.text_content}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>



            </div>
          )}

          {/* ════ FULL TRANSCRIPT MODE ════ */}
          {mode === 'full' && (
            <div className="flex flex-col gap-4">

              {/* ── Main Full Transcript Card ── */}
              <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm p-6">

                {/* 1. Top Toolbar */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
                  {/* Translation Selector */}
                  <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white shadow-sm cursor-pointer hover:border-gray-300 transition-colors select-none">
                    <Languages className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-xs md:text-sm">No translation</span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-1" />
                  </div>

                  {/* Repeat Checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer select-none group">
                    <input
                      type="checkbox"
                      checked={repeatAudio}
                      onChange={(e) => setRepeatAudio(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                    />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">Repeat</span>
                  </label>
                </div>

                {/* 2. Grid (Left Column: Player & Card, Right Column: List) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                  {/* LEFT COLUMN */}
                  <div className="lg:col-span-6 flex flex-col gap-4">

                    {/* Audio Player Bar */}
                    <div className="bg-gray-50/90 border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (!audioRef.current) return
                          if (isFullPlaying) audioRef.current.pause()
                          else audioRef.current.play()
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200/80 text-gray-800 transition-colors shrink-0"
                      >
                        {isFullPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                      </button>

                      <span className="text-xs font-semibold text-gray-700 shrink-0 min-w-[65px] font-mono">
                        {formatTime(globalTime)} / {formatTime(fullDuration)}
                      </span>

                      <div className="flex-1 flex items-center">
                        <Slider
                          value={[(globalTime / (fullDuration || 1)) * 100]}
                          max={100}
                          step={0.1}
                          onValueChange={(val) => {
                            if (!audioRef.current || !fullDuration) return
                            const newTime = (val[0] / 100) * fullDuration
                            audioRef.current.currentTime = newTime
                            setGlobalTime(newTime)
                          }}
                          className="w-full"
                        />
                      </div>

                      <button className="p-1.5 text-gray-600 hover:text-black rounded-lg transition-colors">
                        <Volume2 className="w-4 h-4" />
                      </button>
                      <MoreMenuDropdown />
                    </div>

                    {/* Active Sentence Card */}
                    <div className="bg-white border border-gray-200/90 rounded-2xl p-8 min-h-[220px] flex items-center justify-center text-center shadow-sm">
                      <p className="text-base md:text-lg font-normal text-gray-700 leading-relaxed max-w-lg">
                        {segments[activeSegmentIdx]?.text_content || 'No text content'}
                      </p>
                    </div>

                    {/* Sentence Pagination Controls */}
                    <div className="bg-gray-50/80 border border-gray-200/70 rounded-xl py-2.5 px-4 flex items-center justify-center gap-8 select-none">
                      <button
                        onClick={() => {
                          if (activeSegmentIdx > 0 && audioRef.current) {
                            const prevSeg = segments[activeSegmentIdx - 1]
                            audioRef.current.currentTime = prevSeg.start_time
                            if (audioRef.current.paused) audioRef.current.play()
                          }
                        }}
                        disabled={activeSegmentIdx <= 0}
                        className="p-1.5 text-gray-600 hover:text-black hover:bg-gray-200/60 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>

                      <span className="text-sm font-bold text-gray-700 font-mono tracking-wider">
                        {segments.length > 0 ? `${activeSegmentIdx + 1} / ${segments.length}` : '0 / 0'}
                      </span>

                      <button
                        onClick={() => {
                          if (activeSegmentIdx < segments.length - 1 && audioRef.current) {
                            const nextSeg = segments[activeSegmentIdx + 1]
                            audioRef.current.currentTime = nextSeg.start_time
                            if (audioRef.current.paused) audioRef.current.play()
                          }
                        }}
                        disabled={activeSegmentIdx >= segments.length - 1}
                        className="p-1.5 text-gray-600 hover:text-black hover:bg-gray-200/60 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>

                  </div>

                  {/* RIGHT COLUMN */}
                  <div className="lg:col-span-6 flex flex-col gap-3">

                    {/* Scrollable Sentence List */}
                    <div
                      ref={transcriptListRef}
                      className="border border-gray-200 rounded-xl overflow-y-auto max-h-[420px] bg-white custom-scrollbar divide-y divide-gray-100"
                    >
                      {segments.map((segment, i) => {
                        const isActive = activeSegmentIdx === i
                        return (
                          <div
                            key={i}
                            ref={isActive ? activeRowRef : null}
                            onClick={() => {
                              if (audioRef.current) {
                                audioRef.current.currentTime = segment.start_time
                                audioRef.current.play()
                              }
                            }}
                            className={`flex items-start gap-3 p-3.5 cursor-pointer transition-colors ${isActive
                              ? 'bg-blue-50/70 text-gray-900 font-medium'
                              : 'hover:bg-gray-50 text-gray-700 font-normal'
                              }`}
                          >
                            {/* Play icon button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (audioRef.current) {
                                  audioRef.current.currentTime = segment.start_time
                                  audioRef.current.play()
                                }
                              }}
                              className={`mt-0.5 shrink-0 w-6 h-6 rounded-full border flex items-center justify-center transition-all ${isActive
                                ? 'border-blue-600 text-blue-600 bg-blue-100/50'
                                : 'border-gray-400 text-gray-600 hover:border-gray-800 hover:text-gray-800'
                                }`}
                            >
                              <Play className="w-3 h-3 fill-current ml-0.5" />
                            </button>

                            <span className="text-[14px] leading-relaxed flex-1">
                              {segment.text_content}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Auto scroll Checkbox */}
                    <div className="flex justify-end pr-1">
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoScroll}
                          onChange={e => setAutoScroll(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                        />
                        <span className="text-xs font-medium text-gray-500">Auto scroll</span>
                      </label>
                    </div>

                  </div>

                </div>

                {/* 3. Bottom Hotkey Helper */}
                {settings.showShortcutTips && (
                  <div className="mt-6 pt-4 border-t border-gray-100 text-xs font-medium text-gray-500 flex flex-col gap-1 select-none">
                    <p>Press &quot;{settings.playPauseKey}&quot; to Play/Pause.</p>
                    <p>Press &quot;{settings.replayKey}&quot; to Replay sentence.</p>
                    <p>Press &larr; and &rarr; to move between sentences.</p>
                  </div>
                )}

              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default ListeningDictationExercise
