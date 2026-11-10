import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, X, Send, Users, Lock, ArrowLeft, Trash2, CornerUpLeft } from 'lucide-react'
import { supabase } from '../../supabase/client'

// Chat between students and the teacher in an Online Battle room. Students never talk
// to each other directly:
//   Class   - public questions, everyone in the room sees them (and the teacher's answers)
//   Private - only the student and the teacher see it
// The teacher sees every private conversation and can reply in class or privately.
// Rules (who sees what, who may post) are enforced by online_battle_send_message /
// online_battle_messages in the database; this component only displays.

const POLL_MS = 8000 // backup in case a realtime 'chat' ping is missed

const SEND_ERRORS = {
  empty: 'Type a message first.',
  too_long: 'Messages can be at most 500 characters.',
  closed: 'The battle has ended, chat is closed.',
  not_participant: 'You are not in this battle room.',
  question_open: 'Class chat is paused during a question. Use Private to ask your teacher.',
  too_fast: 'Slow down a little, then try again.',
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const ms = (iso) => new Date(iso).getTime()

const bucketOf = (m, isTeacher) => {
  if (!m.is_private) return 'public'
  return isTeacher ? `private:${m.student_id}` : 'private'
}

const OnlineBattleChat = ({
  roomId,
  myUserId,
  isTeacher = false,
  participants = [],
  closed = false,
  questionOpen = false,
  pingTick = 0,
  onSent,
}) => {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('public') // 'public' | 'private'
  const [threadStudentId, setThreadStudentId] = useState(null) // teacher: open private thread
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)

  // When each conversation was last read on this device: { public: ms, private: ms, 'private:<id>': ms }
  const seenKey = `online-battle-chat-seen-${roomId}`
  const [seen, setSeen] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(seenKey) || '{}') || {} } catch { return {} }
  })

  const load = useCallback(async () => {
    if (!roomId) return
    const { data, error: err } = await supabase.rpc('online_battle_messages', { p_room_id: roomId })
    if (!err && Array.isArray(data)) setMessages(data)
  }, [roomId])

  useEffect(() => { load() }, [load, pingTick])

  useEffect(() => {
    if (!roomId || closed) return
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => clearInterval(poll)
  }, [roomId, closed, load])

  const nameOf = useMemo(() => {
    const map = {}
    participants.forEach(p => { map[p.user_id] = p.student_name })
    return map
  }, [participants])

  // Group messages by conversation
  const buckets = useMemo(() => {
    const out = {}
    messages.forEach(m => {
      const key = bucketOf(m, isTeacher)
      ;(out[key] = out[key] || []).push(m)
    })
    return out
  }, [messages, isTeacher])

  const unreadIn = useCallback((key) => (buckets[key] || [])
    .filter(m => m.sender_id !== myUserId && ms(m.created_at) > (seen[key] || 0)).length, [buckets, seen, myUserId])

  // Teacher: one row per student who has a private conversation, newest first
  const threads = useMemo(() => {
    if (!isTeacher) return []
    return Object.keys(buckets)
      .filter(k => k.startsWith('private:'))
      .map(k => {
        const list = buckets[k]
        const studentId = k.slice('private:'.length)
        const fromStudent = list.find(m => !m.from_teacher)
        return {
          key: k,
          studentId,
          name: nameOf[studentId] || fromStudent?.sender_name || 'Student',
          last: list[list.length - 1],
          unread: unreadIn(k),
        }
      })
      .sort((x, y) => ms(y.last.created_at) - ms(x.last.created_at))
  }, [isTeacher, buckets, nameOf, unreadIn])

  const publicUnread = unreadIn('public')
  const privateUnread = isTeacher ? threads.reduce((s, t) => s + t.unread, 0) : unreadIn('private')
  const totalUnread = publicUnread + privateUnread

  // What's on screen right now
  let viewKey = null
  if (tab === 'public') viewKey = 'public'
  else if (!isTeacher) viewKey = 'private'
  else if (threadStudentId) viewKey = `private:${threadStudentId}`
  const viewMessages = useMemo(() => (viewKey ? buckets[viewKey] || [] : []), [buckets, viewKey])

  // Mark the visible conversation as read
  useEffect(() => {
    if (!open || !viewKey || viewMessages.length === 0) return
    const latest = ms(viewMessages[viewMessages.length - 1].created_at)
    if ((seen[viewKey] || 0) >= latest) return
    setSeen(prev => {
      const next = { ...prev, [viewKey]: latest }
      try { sessionStorage.setItem(seenKey, JSON.stringify(next)) } catch { /* badge just resets on refresh */ }
      return next
    })
  }, [open, viewKey, viewMessages, seen, seenKey])

  // Keep the newest message in view
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [open, viewKey, viewMessages.length])

  useEffect(() => { setError('') }, [tab, threadStudentId])

  const studentPublicBlocked = !isTeacher && tab === 'public' && questionOpen
  const canType = !closed && viewKey && !studentPublicBlocked

  const send = async (e) => {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || sending || !canType) return
    setSending(true)
    setError('')
    const isPrivate = tab === 'private'
    const { data, error: err } = await supabase.rpc('online_battle_send_message', {
      p_room_id: roomId,
      p_body: body,
      p_private: isPrivate,
      p_student_id: isTeacher && isPrivate ? threadStudentId : null,
    })
    setSending(false)
    if (err) {
      setError(`Could not send: ${err.message}`)
      return
    }
    if (!data?.sent) {
      setError(SEND_ERRORS[data?.reason] || 'Could not send the message.')
      return
    }
    setDraft('')
    await load()
    onSent?.()
  }

  const removeMessage = async (m) => {
    if (!window.confirm('Delete this message for everyone?')) return
    setMessages(prev => prev.filter(x => x.id !== m.id))
    const { error: err } = await supabase.from('online_battle_messages').delete().eq('id', m.id)
    if (err) setError(`Could not delete: ${err.message}`)
    onSent?.()
  }

  const replyPrivately = (m) => {
    setTab('private')
    setThreadStudentId(m.sender_id)
  }

  const senderLabel = (m) => {
    if (m.sender_id === myUserId) return 'You'
    if (m.from_teacher) return 'Teacher'
    return nameOf[m.sender_id] || m.sender_name || 'Student'
  }

  const tabButton = (key, icon, label, unread) => (
    <button
      onClick={() => { setTab(key); if (key === 'public') setThreadStudentId(null) }}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-bold border-b-2 transition-colors ${tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
    >
      {icon}
      {label}
      {unread > 0 && (
        <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-red-500 text-white text-xs leading-5">{unread}</span>
      )}
    </button>
  )

  const threadName = threadStudentId
    ? (nameOf[threadStudentId] || threads.find(t => t.studentId === threadStudentId)?.name || 'Student')
    : ''

  let placeholder = 'Ask your teacher in front of the class...'
  if (isTeacher) placeholder = tab === 'public' ? 'Message the whole class...' : `Reply privately to ${threadName}...`
  else if (tab === 'private') placeholder = 'Ask your teacher privately...'

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg transition ${privateUnread > 0 ? 'animate-bounce' : ''}`}
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm">{isTeacher ? 'Chat' : 'Ask teacher'}</span>
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[1.5rem] h-6 px-1 rounded-full bg-red-500 text-white text-xs leading-6 text-center border-2 border-white">
              {totalUnread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 right-4 z-[60] w-[23rem] max-w-[calc(100vw-2rem)] h-[30rem] max-h-[calc(100vh-2rem)] flex flex-col rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-indigo-600 text-white">
            <span className="flex items-center gap-2 font-bold text-sm">
              <MessageCircle className="w-4 h-4" />
              {isTeacher ? 'Student questions' : 'Ask your teacher'}
            </span>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/20" aria-label="Close chat">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex border-b">
            {tabButton('public', <Users className="w-4 h-4" />, 'Class', publicUnread)}
            {tabButton('private', <Lock className="w-4 h-4" />, 'Private', privateUnread)}
          </div>

          {/* Teacher: list of private conversations */}
          {isTeacher && tab === 'private' && !threadStudentId ? (
            <div className="flex-1 overflow-y-auto">
              {threads.length === 0 ? (
                <p className="text-center text-sm text-gray-400 px-6 py-10">
                  No private questions yet. Students can message you here without the class seeing.
                </p>
              ) : (
                <ul className="divide-y">
                  {threads.map(t => (
                    <li key={t.key}>
                      <button
                        onClick={() => setThreadStudentId(t.studentId)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`truncate text-sm ${t.unread ? 'font-black text-gray-900' : 'font-semibold text-gray-700'}`}>{t.name}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">{timeOf(t.last.created_at)}</span>
                          </div>
                          <p className="truncate text-xs text-gray-500">
                            {t.last.from_teacher ? 'You: ' : ''}{t.last.body}
                          </p>
                        </div>
                        {t.unread > 0 && (
                          <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-red-500 text-white text-xs leading-5 text-center">{t.unread}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              {isTeacher && tab === 'private' && (
                <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-gray-50">
                  <button onClick={() => setThreadStudentId(null)} className="p-1 rounded hover:bg-gray-200" aria-label="All private chats">
                    <ArrowLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  <span className="text-sm font-bold text-gray-700 truncate">{threadName}</span>
                </div>
              )}
              {!isTeacher && tab === 'private' && (
                <div className="flex items-center gap-1.5 px-4 py-1.5 border-b bg-amber-50 text-xs text-amber-800">
                  <Lock className="w-3 h-3" />
                  Only your teacher can see these messages.
                </div>
              )}

              <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-gray-50">
                {viewMessages.length === 0 && (
                  <p className="text-center text-sm text-gray-400 px-4 py-8">
                    {tab === 'public'
                      ? (isTeacher ? 'Questions students ask in front of the class show up here.' : 'No questions yet. Ask your teacher anything!')
                      : 'No messages yet. No question is too easy to ask!'}
                  </p>
                )}
                {viewMessages.map(m => {
                  const mine = m.sender_id === myUserId
                  return (
                    <div key={m.id} className={`group flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      <span className={`text-[11px] mb-0.5 ${m.from_teacher && !mine ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}>
                        {senderLabel(m)} · {timeOf(m.created_at)}
                      </span>
                      <div className="flex items-center gap-1 max-w-[85%]">
                        {isTeacher && !mine && (
                          <span className="order-2 flex opacity-0 group-hover:opacity-100 transition-opacity">
                            {!m.is_private && !m.from_teacher && (
                              <button onClick={() => replyPrivately(m)} className="p-1 text-gray-400 hover:text-indigo-600" title="Reply privately">
                                <CornerUpLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => removeMessage(m)} className="p-1 text-gray-400 hover:text-red-600" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        )}
                        {isTeacher && mine && (
                          <button onClick={() => removeMessage(m)} className="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div
                          className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${mine
                            ? 'bg-indigo-600 text-white rounded-br-sm'
                            : m.from_teacher
                              ? 'bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-bl-sm'
                              : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'}`}
                        >
                          {m.body}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {error && <p className="px-3 py-1.5 text-xs text-red-600 bg-red-50 border-t border-red-100">{error}</p>}

              {closed ? (
                <p className="px-3 py-3 text-center text-xs text-gray-500 border-t">The battle has ended, chat is closed.</p>
              ) : studentPublicBlocked ? (
                <div className="px-3 py-3 border-t text-center text-xs text-gray-600">
                  Class chat is paused during a question.{' '}
                  <button onClick={() => setTab('private')} className="font-bold text-indigo-600 hover:underline">
                    Ask privately
                  </button>
                </div>
              ) : (
                <form onSubmit={send} className="flex items-end gap-2 px-3 py-2 border-t bg-white">
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value.slice(0, 500))}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e)
                    }}
                    rows={1}
                    placeholder={placeholder}
                    className="flex-1 resize-none max-h-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || sending}
                    className="p-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white"
                    aria-label="Send"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

export default OnlineBattleChat
