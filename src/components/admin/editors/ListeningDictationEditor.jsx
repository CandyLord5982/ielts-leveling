import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Upload, Mic, Play, Pause, Trash2, Plus, ChevronDown, ChevronUp,
  Wand2, Loader2, Clock, AlertCircle, Link, Copy, Scissors,
  RotateCcw, ChevronLeft, ChevronRight, Volume2, BookOpen
} from 'lucide-react'
import { supabase } from '../../../supabase/client'

// ─── Helpers ───────────────────────────────────────────────────────────────
const fmtTime = (sec) => {
  if (sec == null || isNaN(sec)) return '00:00'
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toFixed(2).padStart(5, '0')
  return `${m}:${s}`
}

const fmtShort = (sec) => {
  if (sec == null || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

const parseTime = (val) => {
  const f = parseFloat(val)
  return isNaN(f) ? 0 : Math.max(0, f)
}

// ─── Validation ───────────────────────────────────────────────────────────
const validateSegments = (segments, audioDuration) => {
  const errors = {}
  segments.forEach((seg, i) => {
    const errs = []
    if (!seg.text_content?.trim()) errs.push('Transcript không được rỗng')
    if (seg.start_time == null || seg.start_time < 0) errs.push('Start time phải >= 0')
    if (seg.end_time == null || seg.end_time <= seg.start_time) errs.push('End time phải lớn hơn Start time')
    if (audioDuration && seg.end_time > audioDuration + 0.5) errs.push(`End time vượt quá độ dài audio (${fmtShort(audioDuration)})`)
    if (i > 0 && seg.start_time < segments[i - 1].end_time - 0.01) {
      errs.push(`Chồng lấp với câu ${i}: kết thúc lúc ${fmtTime(segments[i - 1].end_time)}`)
    }
    if (errs.length) errors[i] = errs
  })
  return errors
}

// ─── Audio Player (custom) ────────────────────────────────────────────────
const AdminAudioPlayer = ({ audioRef, audioUrl, speed, setSpeed, currentTime, duration }) => {
  const [localPlaying, setLocalPlaying] = useState(false)
  const [dragging, setDragging] = useState(false)
  const trackRef = useRef(null)

  const togglePlay = () => {
    if (!audioRef.current) return
    if (localPlaying) { audioRef.current.pause(); setLocalPlaying(false) }
    else { audioRef.current.play(); setLocalPlaying(true) }
  }

  const replay5 = () => {
    if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5)
  }

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onEnded = () => setLocalPlaying(false)
    const onPause = () => setLocalPlaying(false)
    const onPlay = () => setLocalPlaying(true)
    el.addEventListener('ended', onEnded)
    el.addEventListener('pause', onPause)
    el.addEventListener('play', onPlay)
    return () => { el.removeEventListener('ended', onEnded); el.removeEventListener('pause', onPause); el.removeEventListener('play', onPlay) }
  }, [audioRef])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  const handleTrackClick = (e) => {
    if (!audioRef.current || !trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audioRef.current.currentTime = ratio * (duration || 0)
  }

  const pct = duration ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={replay5} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors" title="Tua lùi 5s">
          <RotateCcw className="w-4 h-4" />
        </button>
        <button type="button" onClick={togglePlay}
          className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shrink-0 transition-colors shadow-sm">
          {localPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <div ref={trackRef} onClick={handleTrackClick}
          className="flex-1 relative h-1.5 bg-gray-200 rounded-full cursor-pointer group">
          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-indigo-600 rounded-full shadow -translate-x-1/2"
            style={{ left: `${pct}%` }} />
        </div>
        <span className="text-xs font-mono text-gray-500 whitespace-nowrap w-24 text-right">
          {fmtTime(currentTime)} / {fmtShort(duration || 0)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Volume2 className="w-3.5 h-3.5 text-gray-400" />
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {[0.75, 1.0, 1.25, 1.5].map(s => (
            <button key={s} type="button" onClick={() => setSpeed(s)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${speed === s ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {s === 1.0 ? '1x' : `${s}x`}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-1">
          Cursor: <span className="font-mono text-indigo-600 font-bold">{fmtTime(currentTime)}</span>
        </span>
      </div>
    </div>
  )
}

// ─── Segment Row ─────────────────────────────────────────────────────────────
const SegmentRow = ({ seg, index, audioRef, audioDuration, errors, onUpdate, onDelete, onDuplicate, onMoveUp, onMoveDown, totalCount }) => {
  const [open, setOpen] = useState(true)

  const hasErrors = errors?.length > 0
  const duration = (seg.end_time || 0) - (seg.start_time || 0)

  const handlePreview = (e) => {
    e.preventDefault()
    if (!audioRef.current) return
    audioRef.current.currentTime = seg.start_time || 0
    audioRef.current.play()
    const dur = Math.max(duration * 1000, 200)
    setTimeout(() => audioRef.current?.pause(), dur)
  }

  const setStart = () => {
    if (!audioRef.current) return
    const t = parseFloat(audioRef.current.currentTime.toFixed(2))
    onUpdate(index, 'start_time', t)
  }

  const setEnd = () => {
    if (!audioRef.current) return
    const t = parseFloat(audioRef.current.currentTime.toFixed(2))
    onUpdate(index, 'end_time', t)
  }

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${hasErrors ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-100">
        <span className={`shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${hasErrors ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}>
          {index + 1}
        </span>
        <div className="flex-1 text-xs text-gray-700 truncate">
          {seg.text_content?.trim() || <span className="text-gray-400 italic">Chưa có transcript</span>}
        </div>
        <span className="text-xs font-mono text-gray-400 shrink-0">
          {fmtTime(seg.start_time)} → {fmtTime(seg.end_time)}
          {duration > 0 && <span className="text-indigo-500 ml-1">({duration.toFixed(1)}s)</span>}
        </span>
        {/* Controls */}
        <button type="button" onClick={handlePreview} className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-500 transition-colors" title="Nghe thử">
          <Play className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => onDuplicate(index)} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 transition-colors" title="Nhân đôi câu">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => onMoveUp(index)} disabled={index === 0} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 disabled:opacity-30 transition-colors" title="Lên">
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => onMoveDown(index)} disabled={index === totalCount - 1} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 disabled:opacity-30 transition-colors" title="Xuống">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => setOpen(v => !v)} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={() => onDelete(index)} className="p-1.5 hover:bg-red-100 rounded-lg text-red-400 transition-colors" title="Xóa">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Errors */}
      {hasErrors && (
        <div className="px-3 py-1.5 bg-red-50 border-b border-red-200">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />{e}
            </p>
          ))}
        </div>
      )}

      {/* Editor */}
      {open && (
        <div className="p-3 space-y-3">
          {/* Transcript */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Transcript / Đáp án chuẩn *</label>
            <textarea
              rows={2}
              value={seg.text_content || ''}
              onChange={e => onUpdate(index, 'text_content', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-transparent resize-none placeholder-gray-300"
              placeholder="Good morning everyone, and welcome to our class."
            />
          </div>

          {/* Translation */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-600">Translation / Dịch nghĩa</label>
              <button 
                type="button"
                onClick={async () => {
                  if (!seg.text_content) return;
                  try {
                    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(seg.text_content)}`);
                    const data = await res.json();
                    const vi = data[0].map(x => x[0]).join('');
                    onUpdate(index, 'translation', vi);
                  } catch (e) {
                    alert('Lỗi khi dịch: ' + e.message);
                  }
                }}
                className="text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-0.5 rounded font-semibold transition-colors flex items-center gap-1"
                title="Tự động dịch từ Transcript bằng Google Translate"
              >
                <Wand2 className="w-3 h-3" />
                Dịch tự động
              </button>
            </div>
            <textarea
              rows={2}
              value={seg.translation || ''}
              onChange={e => onUpdate(index, 'translation', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-transparent resize-none placeholder-gray-300"
              placeholder="Chào buổi sáng mọi người, chào mừng đến với lớp học của chúng ta."
            />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Bắt đầu (giây)</label>
              <div className="flex gap-1">
                <input
                  type="number" step="0.01" min="0"
                  value={seg.start_time ?? ''}
                  onChange={e => onUpdate(index, 'start_time', parseTime(e.target.value))}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-transparent font-mono"
                />
                <button type="button" onClick={setStart}
                  className="px-2.5 py-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition-colors whitespace-nowrap"
                  title="Lấy vị trí audio hiện tại làm Start">
                  Set
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Kết thúc (giây)</label>
              <div className="flex gap-1">
                <input
                  type="number" step="0.01" min="0"
                  value={seg.end_time ?? ''}
                  onChange={e => onUpdate(index, 'end_time', parseTime(e.target.value))}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-transparent font-mono"
                />
                <button type="button" onClick={setEnd}
                  className="px-2.5 py-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition-colors whitespace-nowrap"
                  title="Lấy vị trí audio hiện tại làm End">
                  Set
                </button>
              </div>
            </div>
          </div>

          {/* Alt Answers */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Đáp án phụ (cách nhau bằng |)</label>
            <input
              type="text"
              value={(seg.alt_answers || []).join(' | ')}
              onChange={e => onUpdate(index, 'alt_answers', e.target.value.split('|').map(s => s.trim()).filter(Boolean))}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-transparent placeholder-gray-300"
              placeholder="colour | color | 8 am | 8:00 am"
            />
          </div>

          {/* Vocabulary for this segment */}
          <div className="pt-3 border-t border-gray-100">
            <VocabularyEditor
              vocabulary={seg.vocabulary || []}
              onChange={(vocab) => onUpdate(index, 'vocabulary', vocab)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── VocabularyEditor ─────────────────────────────────────────────────────────
function VocabularyEditor({ vocabulary, onChange }) {
  const [open, setOpen] = useState(false)
  const [newWord, setNewWord] = useState('')
  const [newDef, setNewDef] = useState('')

  const addItem = () => {
    if (!newWord.trim()) return
    onChange([...vocabulary, { word: newWord.trim(), definition: newDef.trim() }])
    setNewWord('')
    setNewDef('')
  }

  const removeItem = (idx) => {
    onChange(vocabulary.filter((_, i) => i !== idx))
  }

  const updateItem = (idx, field, val) => {
    const next = [...vocabulary]
    next[idx] = { ...next[idx], [field]: val }
    onChange(next)
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-1.5 text-gray-500 hover:text-gray-700 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <BookOpen className="w-3.5 h-3.5" />
          Từ vựng &amp; ghi chú
          {vocabulary.length > 0 && (
            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">
              {vocabulary.length}
            </span>
          )}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="pt-2 pb-1 space-y-2">
          {/* Existing items */}
          {vocabulary.length > 0 && (
            <div className="space-y-1.5">
              {vocabulary.map((item, idx) => (
                <div key={idx} className="flex gap-1.5 items-start">
                  <input
                    type="text"
                    value={item.word}
                    onChange={e => updateItem(idx, 'word', e.target.value)}
                    className="w-1/3 px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-indigo-300 font-medium"
                    placeholder="Từ"
                  />
                  <input
                    type="text"
                    value={item.definition}
                    onChange={e => updateItem(idx, 'definition', e.target.value)}
                    className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-indigo-300"
                    placeholder="Nghĩa"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded transition-colors shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new */}
          <div className="flex gap-1.5 items-center">
            <input
              type="text"
              value={newWord}
              onChange={e => setNewWord(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              className="w-1/3 px-2 py-1.5 text-xs border border-dashed border-gray-300 rounded focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 placeholder-gray-400"
              placeholder="Từ mới..."
            />
            <input
              type="text"
              value={newDef}
              onChange={e => setNewDef(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              className="flex-1 px-2 py-1.5 text-xs border border-dashed border-gray-300 rounded focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 placeholder-gray-400"
              placeholder="Nghĩa..."
            />
            <button
              type="button"
              onClick={addItem}
              disabled={!newWord.trim()}
              className="p-1.5 bg-indigo-50 text-indigo-600 disabled:opacity-40 hover:bg-indigo-100 rounded text-xs font-semibold transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Editor ─────────────────────────────────────────────────────────────
const ListeningDictationEditor = ({ content, onContentChange }) => {
  const audioRef = useRef(null)
  const fileInputRef = useRef(null)

  const audioUrl = content?.audio_url || ''
  const segments = content?.segments || []
  const fullTranscript = content?.full_transcript || ''

  const [uploading, setUploading] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeError, setTranscribeError] = useState('')
  const [urlTab, setUrlTab] = useState('upload')
  const [directUrl, setDirectUrl] = useState('')
  const [speed, setSpeed] = useState(1.0)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [validationErrors, setValidationErrors] = useState({})
  const [showValidation, setShowValidation] = useState(false)
  const transcriptPanelRef = useRef(null)
  const activeSegRef = useRef(null)

  const update = useCallback((patch) => onContentChange({ ...content, ...patch }), [content, onContentChange])

  // Audio time tracking
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTime = () => setCurrentTime(el.currentTime)
    const onMeta = () => setAudioDuration(el.duration || 0)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('durationchange', onMeta)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('durationchange', onMeta)
    }
  }, [audioUrl])

  // Active segment in transcript panel
  const activeSegIdx = segments.findIndex(s => currentTime >= (s.start_time || 0) && currentTime < (s.end_time || 0))
  useEffect(() => {
    if (activeSegRef.current && transcriptPanelRef.current) {
      activeSegRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeSegIdx])

  // Validate
  useEffect(() => {
    if (showValidation) {
      setValidationErrors(validateSegments(segments, audioDuration))
    }
  }, [segments, audioDuration, showValidation])

  // Segment helpers
  const updateSegment = (idx, field, value) => {
    const segs = [...segments]
    segs[idx] = { ...segs[idx], [field]: value }
    update({ segments: segs })
  }

  const deleteSegment = (idx) => {
    if (!window.confirm(`Xóa câu ${idx + 1}?`)) return
    update({ segments: segments.filter((_, i) => i !== idx) })
  }

  const duplicateSegment = (idx) => {
    const segs = [...segments]
    const copy = { ...segs[idx], text_content: segs[idx].text_content + ' (copy)' }
    segs.splice(idx + 1, 0, copy)
    update({ segments: segs })
  }

  const moveSegment = (idx, dir) => {
    const segs = [...segments]
    const target = idx + dir
    if (target < 0 || target >= segs.length) return
      ;[segs[idx], segs[target]] = [segs[target], segs[idx]]
    update({ segments: segs })
  }

  const addSegment = () => {
    const last = segments[segments.length - 1]
    const startT = last?.end_time ?? 0
    update({
      segments: [...segments, {
        start_time: parseFloat(startT.toFixed(2)),
        end_time: parseFloat((startT + 5).toFixed(2)),
        text_content: '',
        alt_answers: [],
        difficulty: 1
      }]
    })
  }

  // "✂ Kết thúc câu" — cut at current time
  const cutAtCurrentTime = () => {
    if (!audioRef.current) return
    const t = parseFloat(audioRef.current.currentTime.toFixed(2))

    // Find segment that currently spans this time, or append new
    const lastSeg = segments[segments.length - 1]

    if (!lastSeg) {
      // No segments yet: create first from 0 → t
      update({
        segments: [{
          start_time: 0,
          end_time: t,
          text_content: '',
          alt_answers: [],
          difficulty: 1
        }]
      })
      return
    }

    if (t <= (lastSeg.end_time || 0)) {
      alert(`Cursor (${fmtTime(t)}) phải sau điểm kết thúc câu cuối (${fmtTime(lastSeg.end_time)}).`)
      return
    }

    // End current open segment and create next
    const segs = [...segments]
    const lastIdx = segs.length - 1
    if (!segs[lastIdx].end_time || segs[lastIdx].end_time === segs[lastIdx].start_time) {
      segs[lastIdx] = { ...segs[lastIdx], end_time: t }
    }
    segs.push({
      start_time: t,
      end_time: null,
      text_content: '',
      alt_answers: [],
      difficulty: 1
    })
    update({ segments: segs })
  }

  // Upload
  const handleAudioUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const validExts = ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac', 'webm']
    if (!file.type.startsWith('audio/') && !validExts.includes(ext)) {
      alert('File không hợp lệ. Vui lòng chọn file audio (mp3, wav, m4a...).')
      return
    }
    setUploading(true)
    try {
      const path = `exercise_bank/listening/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('exercise-files')
        .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type || 'audio/mpeg' })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from('exercise-files').getPublicUrl(path)
      update({ audio_url: data.publicUrl, segments: [] })
    } catch (err) {
      alert('Upload thất bại: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDirectUrl = () => {
    const url = directUrl.trim()
    if (!url) return
    update({ audio_url: url, segments: [] })
    setDirectUrl('')
  }

  // AI Transcribe
  const handleTranscribe = async () => {
    if (!audioUrl) { alert('Hãy upload file audio trước!'); return }
    setTranscribing(true)
    setTranscribeError('')
    try {
      const audioRes = await fetch(audioUrl)
      const blob = await audioRes.blob()
      const formData = new FormData()
      const ext = audioUrl.split('.').pop()?.split('?')[0] || 'mp3'
      formData.append('file', blob, `audio.${ext}`)
      const { data: authData } = await supabase.auth.getSession()
      const token = authData.session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whisper-transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) { const t = await res.text(); throw new Error(t || 'Server Error') }
      const fnData = await res.json()
      if (fnData?.error) throw new Error(fnData.error)
      const mapped = fnData?.segments || []
      if (!mapped.length) throw new Error('Không tạo được phân đoạn. Thử lại hoặc nhập thủ công.')
      update({ segments: mapped })
    } catch (err) {
      console.error('Transcribe error:', err);
      setTranscribeError('Không thể tự động tạo transcript. Vui lòng thử lại.');
    } finally {
      setTranscribing(false)
    }
  }

  const hasValidationErrors = Object.keys(validationErrors).length > 0

  return (
    <div className="flex gap-4 h-[75vh] min-h-[600px]">
      {/* ── LEFT: Main Editor ── */}
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1">

        {/* Audio Source */}
        <div className="border border-gray-200 rounded-xl bg-white p-4 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Mic className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-800">1. Audio Source</h3>
          </div>

          {/* Hidden audio element */}
          {audioUrl && (
            <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" />
          )}

          {!audioUrl ? (
            <>
              <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-0.5 w-fit">
                <button type="button" onClick={() => setUrlTab('upload')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${urlTab === 'upload' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Upload className="w-3 h-3 inline mr-1" />Upload file
                </button>
                <button type="button" onClick={() => setUrlTab('url')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${urlTab === 'url' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Link className="w-3 h-3 inline mr-1" />Nhập URL
                </button>
              </div>
              {urlTab === 'upload' ? (
                <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-indigo-300 rounded-xl cursor-pointer hover:bg-indigo-50 transition-colors">
                  <Upload className="w-6 h-6 text-indigo-400 mb-1.5" />
                  <span className="text-sm font-medium text-indigo-600">
                    {uploading ? 'Đang tải lên...' : 'Nhấp để chọn file MP3 / WAV'}
                  </span>
                  <span className="text-xs text-gray-400 mt-0.5">1 file audio duy nhất cho toàn bài</span>
                  <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} disabled={uploading} />
                </label>
              ) : (
                <div className="flex gap-2">
                  <input type="url" value={directUrl} onChange={e => setDirectUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleDirectUrl()}
                    placeholder="https://example.com/audio.mp3"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
                  />
                  <button type="button" onClick={handleDirectUrl} disabled={!directUrl.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-all">
                    Dùng URL
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              {/* File info + remove */}
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                <Mic className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="text-xs text-gray-700 truncate flex-1 font-mono">{audioUrl.split('/').pop()}</span>
                <button type="button"
                  onClick={() => { update({ audio_url: '', segments: [] }); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  className="text-red-400 hover:text-red-600 transition-colors shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Custom Player */}
              <AdminAudioPlayer
                audioRef={audioRef}
                audioUrl={audioUrl}
                speed={speed}
                setSpeed={setSpeed}
                currentTime={currentTime}
                duration={audioDuration}
              />

              {/* Cut at cursor */}
              <button type="button" onClick={cutAtCurrentTime}
                className="flex items-center gap-2 w-full px-3 py-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg text-sm text-green-800 font-semibold transition-colors">
                <Scissors className="w-4 h-4 text-green-600" />
                ✂ Kết thúc câu tại {fmtTime(currentTime)}
              </button>
            </div>
          )}
        </div>

        {/* AI Transcribe */}
        {audioUrl && (
          <div className="border border-gray-200 rounded-xl bg-white p-4 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-bold text-gray-800">2. AI Auto-Transcribe</h3>
              </div>
              <button type="button" onClick={handleTranscribe} disabled={transcribing}
                className="flex items-center gap-2 px-4 py-1.5 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-60 transition-all">
                {transcribing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {transcribing ? 'Đang xử lý...' : 'Auto-Transcribe (AI)'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Gửi audio lên <strong>Groq Whisper</strong> để tự động tạo transcript, segments và timestamp. Groq API Key được cấu hình ở server.
            </p>
            {transcribeError && (
              <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{transcribeError}</span>
              </div>
            )}
          </div>
        )}

        {/* Full Transcript */}
        <div className="border border-gray-200 rounded-xl bg-white p-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-800">3. Full Transcript</h3>
            </div>
            <button 
              type="button" 
              onClick={() => {
                if (fullTranscript && !window.confirm('Overwrite current Full Transcript with generated text?')) return
                update({ full_transcript: segments.map(s => s.text_content).join('\n').trim() })
              }}
              disabled={segments.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              Generate from sentences
            </button>
          </div>
          <textarea
            value={fullTranscript}
            onChange={(e) => update({ full_transcript: e.target.value })}
            placeholder="Paste the complete transcript for this audio here..."
            className="w-full h-32 p-3 text-sm text-gray-700 border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <div className="text-right text-[11px] text-gray-400 font-medium mt-1">
            {fullTranscript.length} chars
          </div>
        </div>

        {/* Segments */}
        <div className="border border-gray-200 rounded-xl bg-white p-4 shrink-0">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-green-600" />
              <h3 className="text-sm font-bold text-gray-800">
                4. Phân đoạn câu
                <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-normal">{segments.length} câu</span>
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" 
                id="btn-translate-all"
                onClick={async (e) => {
                  const btn = e.currentTarget;
                  if (!window.confirm('Tự động dịch TẤT CẢ các câu bằng Google Translate? (Sẽ ghi đè các bản dịch hiện tại). Quá trình này sẽ chạy từng câu một.')) return;
                  
                  btn.disabled = true;
                  const originalText = btn.innerHTML;
                  
                  const newSegs = [...segments];
                  for (let i = 0; i < newSegs.length; i++) {
                    if (newSegs[i].text_content) {
                      try {
                        btn.innerHTML = `<span class="animate-pulse">Đang dịch câu ${i+1}/${newSegs.length}...</span>`;
                        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(newSegs[i].text_content)}`);
                        const data = await res.json();
                        const vi = data[0].map(x => x[0]).join('');
                        newSegs[i] = { ...newSegs[i], translation: vi };
                        // Update incrementally so user sees progress
                        update({ segments: [...newSegs] });
                      } catch (err) { console.error(err); }
                      await new Promise(r => setTimeout(r, 200)); // prevent rate limit
                    }
                  }
                  
                  btn.innerHTML = originalText;
                  btn.disabled = false;
                }}
                disabled={segments.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-all">
                <Wand2 className="w-3.5 h-3.5" />Dịch tất cả
              </button>
              <button type="button" onClick={addSegment}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-all">
                <Plus className="w-3.5 h-3.5" />Thêm câu
              </button>
            </div>
          </div>

          {/* Validation summary */}
          {showValidation && hasValidationErrors && (
            <div className="mb-3 shrink-0 p-2.5 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {Object.keys(validationErrors).length} câu có lỗi — vui lòng sửa trước khi xuất bản.
              </p>
            </div>
          )}

          {segments.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-gray-400 text-center">
              <Mic className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Chưa có câu nào.</p>
              <p className="text-xs mt-1">
                Dùng <strong>Auto-Transcribe</strong>, bấm <strong>✂ Kết thúc câu</strong> khi nghe,<br />
                hoặc nhấn <strong>+ Thêm câu</strong> để nhập thủ công.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {segments.map((seg, idx) => (
                <SegmentRow
                  key={idx}
                  seg={seg}
                  index={idx}
                  audioRef={audioRef}
                  audioDuration={audioDuration}
                  errors={validationErrors[idx]}
                  onUpdate={updateSegment}
                  onDelete={deleteSegment}
                  onDuplicate={duplicateSegment}
                  onMoveUp={(i) => moveSegment(i, -1)}
                  onMoveDown={(i) => moveSegment(i, 1)}
                  totalCount={segments.length}
                />
              ))}
            </div>
          )}
        </div>

        {/* Validate button */}
        {segments.length > 0 && (
          <div className="shrink-0">
            <button type="button"
              onClick={() => { setShowValidation(true); const errs = validateSegments(segments, audioDuration); setValidationErrors(errs); if (Object.keys(errs).length === 0) alert('✅ Tất cả segments hợp lệ! Có thể xuất bản.') }}
              className="w-full py-2 text-sm font-semibold border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
              Kiểm tra validation trước khi xuất bản
            </button>
          </div>
        )}
      </div>

      {/* ── RIGHT: Transcript Preview ── */}
      <div className="w-60 shrink-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-3 py-2.5 border-b border-gray-100 shrink-0">
          <p className="text-xs font-bold text-gray-800">Transcript Preview</p>
          <p className="text-[10px] text-gray-400">{segments.length} câu · Click để seek</p>
        </div>

        {segments.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center p-4">
            <p className="text-xs text-gray-400">Thêm segments để xem preview transcript.</p>
          </div>
        ) : (
          <div ref={transcriptPanelRef} className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {segments.map((seg, i) => {
              const isActive = currentTime >= (seg.start_time || 0) && currentTime < (seg.end_time || Infinity)
              return (
                <div
                  key={i}
                  ref={isActive ? activeSegRef : null}
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.currentTime = seg.start_time || 0
                      audioRef.current.play()
                    }
                  }}
                  className={`px-3 py-2.5 cursor-pointer transition-all border-l-4 ${isActive
                    ? 'bg-indigo-50 border-indigo-500'
                    : 'border-transparent hover:bg-gray-50'
                    }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[10px] font-bold font-mono ${isActive ? 'text-indigo-600' : 'text-gray-300'}`}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {fmtTime(seg.start_time)} – {fmtTime(seg.end_time)}
                    </span>
                  </div>
                  <p className={`text-[11px] leading-relaxed line-clamp-2 ${isActive ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                    {seg.text_content?.trim() || <span className="italic text-gray-300">Chưa có transcript</span>}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ListeningDictationEditor
