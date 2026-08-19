import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { assetUrl } from '../../hooks/useBranding'
import { X, Play, Pause, RotateCcw, Minimize2 } from 'lucide-react'

const PRESET_TIMES = [10, 15, 20, 30, 45, 60, 90, 120, 180, 300]

const formatTime = (s) => {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

const formatPreset = (s) => {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? (sec > 0 ? `${m}m${sec}s` : `${m}m`) : `${s}s`
}

const TimerModal = ({ visible, onHide, onActiveChange, onRemainingChange }) => {
  const [phase, setPhase] = useState('setup') // setup | running | paused | finished
  const [duration, setDuration] = useState(30)
  const [customTime, setCustomTime] = useState('')
  const [remaining, setRemaining] = useState(0)

  const intervalRef = useRef(null)
  const alarmRef = useRef(null)

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const stopAlarm = useCallback(() => {
    if (alarmRef.current) {
      alarmRef.current.pause()
      alarmRef.current.currentTime = 0
      alarmRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => { clearTimer(); stopAlarm() }
  }, [clearTimer, stopAlarm])

  // Report active/remaining state to parent for the button badge
  useEffect(() => {
    onActiveChange(phase === 'running' || phase === 'paused')
  }, [phase, onActiveChange])

  useEffect(() => {
    onRemainingChange(remaining)
  }, [remaining, onRemainingChange])

  const startTimer = () => {
    const time = customTime ? parseInt(customTime) : duration
    if (!time || time < 1) return
    stopAlarm()
    setRemaining(time)
    setPhase('running')
  }

  useEffect(() => {
    clearTimer()
    if (phase !== 'running') return

    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearTimer()
          setPhase('finished')
          const audio = new Audio(assetUrl('/class-battle/Applause.mp3'))
          audio.volume = 0.7
          audio.play().catch(() => {})
          alarmRef.current = audio
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return clearTimer
  }, [phase, clearTimer])

  const togglePause = () => {
    if (phase === 'running') setPhase('paused')
    else if (phase === 'paused') setPhase('running')
  }

  const resetTimer = () => {
    clearTimer()
    stopAlarm()
    setPhase('setup')
    setRemaining(0)
  }

  const handleClose = () => {
    clearTimer()
    stopAlarm()
    setPhase('setup')
    setRemaining(0)
    onHide()
  }

  const totalDuration = customTime ? parseInt(customTime) || duration : duration
  const progress = phase === 'setup' ? 0 : 1 - remaining / totalDuration
  const isLow = remaining <= 5 && remaining > 0 && phase === 'running'

  return createPortal(
    <div className={`fixed inset-0 z-50 select-none overflow-hidden bg-black/70 flex items-center justify-center transition-opacity ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <style>{`
        @keyframes timerPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes timerShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        @keyframes finishBurst {
          0% { opacity: 0; transform: scale(0.5); }
          50% { transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes ringPulse {
          0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.4); }
          100% { box-shadow: 0 0 0 40px rgba(255,255,255,0); }
        }
      `}</style>

      <div className="relative w-full max-w-lg mx-4 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          background: phase === 'finished'
            ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
            : 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          minHeight: 420,
        }}>

        {/* Top-right buttons */}
        <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
          {/* Minimize — hides modal but timer keeps running */}
          {(phase === 'running' || phase === 'paused') && (
            <button onClick={onHide}
              className="bg-white/10 hover:bg-white/20 backdrop-blur rounded-full p-2 transition-colors"
              title="Minimize — timer keeps running">
              <Minimize2 className="w-5 h-5 text-white" />
            </button>
          )}
          {/* Close — stops everything */}
          <button onClick={handleClose}
            className="bg-white/10 hover:bg-white/20 backdrop-blur rounded-full p-2 transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Header */}
        <div className="text-center pt-8 pb-2">
          <h2 className="text-2xl font-black text-white drop-shadow-lg">
            {phase === 'finished' ? "Time's Up!" : '⏱️ Timer'}
          </h2>
        </div>

        {/* SETUP */}
        {phase === 'setup' && (
          <div className="flex-1 flex flex-col items-center gap-5 px-6 pb-6 pt-4">
            <div className="bg-white/10 backdrop-blur rounded-2xl px-5 py-4 w-full">
              <div className="text-white/70 text-sm font-bold mb-3 text-center">Pick Duration</div>
              <div className="grid grid-cols-5 gap-2">
                {PRESET_TIMES.map(t => (
                  <button key={t} onClick={() => { setDuration(t); setCustomTime('') }}
                    className={`px-2 py-2.5 rounded-xl font-bold text-sm transition-all ${
                      duration === t && !customTime
                        ? 'bg-teal-400 text-teal-900 scale-105 shadow-lg'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}>
                    {formatPreset(t)}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 justify-center">
                <span className="text-white/50 text-xs">Custom:</span>
                <input type="number" placeholder="seconds" value={customTime} onChange={e => setCustomTime(e.target.value)}
                  className="w-24 bg-white/10 text-white text-center rounded-lg px-2 py-1.5 text-sm placeholder-white/30 border border-white/20 focus:outline-none focus:border-teal-400" />
              </div>
            </div>

            {/* Preview */}
            <div className="text-6xl font-black text-white/30 font-mono">
              {formatTime(customTime ? parseInt(customTime) || 0 : duration)}
            </div>

            <button onClick={startTimer}
              className="flex items-center gap-2 px-8 py-3 rounded-2xl font-black text-lg shadow-lg bg-teal-500 hover:bg-teal-400 text-white hover:shadow-xl hover:scale-105 active:scale-95 transition-all">
              <Play className="w-6 h-6" />
              Start Timer
            </button>
          </div>
        )}

        {/* RUNNING / PAUSED */}
        {(phase === 'running' || phase === 'paused') && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pb-6">
            {/* Progress ring */}
            <div className="relative">
              <svg width="220" height="220" viewBox="0 0 220 220" className="transform -rotate-90">
                <circle cx="110" cy="110" r="95" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
                <circle cx="110" cy="110" r="95" fill="none"
                  stroke={isLow ? '#ef4444' : '#2dd4bf'}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 95}
                  strokeDashoffset={2 * Math.PI * 95 * progress}
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`text-6xl font-black font-mono text-white ${isLow ? 'text-red-400' : ''}`}
                  style={{ animation: isLow ? 'timerShake 0.3s ease-in-out infinite' : 'none' }}>
                  {formatTime(remaining)}
                </div>
              </div>
              {phase === 'running' && (
                <div className="absolute inset-0 rounded-full"
                  style={{ animation: 'ringPulse 2s ease-out infinite' }} />
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
              <button onClick={togglePause}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-base shadow-lg transition-all hover:scale-105 active:scale-95 ${
                  phase === 'paused'
                    ? 'bg-teal-500 hover:bg-teal-400 text-white'
                    : 'bg-white/20 hover:bg-white/30 text-white'
                }`}>
                {phase === 'paused' ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                {phase === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button onClick={resetTimer}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-base shadow-lg bg-white/10 hover:bg-white/20 text-white transition-all hover:scale-105 active:scale-95">
                <RotateCcw className="w-5 h-5" />
                Reset
              </button>
            </div>
          </div>
        )}

        {/* FINISHED */}
        {phase === 'finished' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pb-6"
            style={{ animation: 'finishBurst 0.5s ease-out' }}>
            <div className="text-8xl" style={{ animation: 'timerPulse 1s ease-in-out infinite' }}>
              ⏰
            </div>
            <div className="text-4xl font-black text-white drop-shadow-lg">00:00</div>
            <div className="flex items-center gap-4">
              <button onClick={resetTimer}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-base shadow-lg bg-white/30 hover:bg-white/40 text-white transition-all hover:scale-105 active:scale-95">
                <RotateCcw className="w-5 h-5" />
                New Timer
              </button>
              <button onClick={handleClose}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-base shadow-lg bg-white/20 hover:bg-white/30 text-white transition-all hover:scale-105 active:scale-95">
                <X className="w-5 h-5" />
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default TimerModal
