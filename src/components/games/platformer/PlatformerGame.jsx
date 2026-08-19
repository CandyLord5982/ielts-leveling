import React, { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import { X, Coins, Skull, CheckCircle2, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../supabase/client'
import { useAuth } from '../../../hooks/useAuth'
import PlatformerScene from './PlatformerScene'

const INITIAL = { word: '', round: 1, roundsTotal: 8, totalRounds: 8, level: 1, levelsTotal: 1, correct: 0, wrong: 0, lastResult: null, coins: 0, coinTotal: 0, deaths: 0, won: false }

// 2D platformer vocab quiz: a word shows on top; attack the monster with the correct meaning.
// Phaser owns the canvas; React owns the HUD overlay on top of it.
// `wordBank` (optional): pass a lesson's vocab to override. Omitted → the student's words
// are pulled from Supabase (pet_word_bank, filtered by their level); the scene falls back
// to a built-in sample if fewer than 4 usable words come back.
export default function PlatformerGame({ wordBank }) {
  const containerRef = useRef(null)
  const gameRef = useRef(null)
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [stats, setStats] = useState(INITIAL)

  // Resolved word bank: null until ready (prop given, or the Supabase fetch settles).
  const [bank, setBank] = useState(wordBank ?? null)
  const bankRef = useRef(bank)
  bankRef.current = bank
  const ready = bank !== null

  // Resolve the bank: use the prop if given, else the student's vocab for their level.
  useEffect(() => {
    if (wordBank) { setBank(wordBank); return }
    if (!profile) return   // wait for the profile so we fetch the right level
    let cancelled = false
    ;(async () => {
      const userLevel = profile?.current_level || 1
      const { data, error } = await supabase
        .from('pet_word_bank')
        .select('word, hint, min_level')
        .eq('is_active', true)
        .lte('min_level', userLevel)
      // On success use the rows; on error/empty pass [] so the scene uses its sample.
      if (!cancelled) setBank(error ? [] : (data || []))
    })()
    return () => { cancelled = true }
  }, [wordBank, profile])

  // Boot the Phaser game once the bank is resolved (the scene reads it once at boot).
  useEffect(() => {
    if (!containerRef.current || !ready) return

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#87ceeb',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: '100%',
      },
      physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false },
      },
      callbacks: {
        preBoot: (g) => {
          g.registry.set('onStats', (s) => setStats(s))
          g.registry.set('wordBank', bankRef.current)
        },
      },
      scene: [PlatformerScene],
    })

    gameRef.current = game
    return () => {
      game.destroy(true)
      gameRef.current = null
    }
  }, [ready])

  const restart = () => {
    const game = gameRef.current
    if (game) {
      setStats(INITIAL)
      game.scene.getScene('Platformer').scene.restart()
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-sky-300 overflow-hidden select-none">
      {/* Phaser canvas mounts here */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading the word bank */}
      {!ready && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-sky-300">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

      {/* HUD overlay (React) */}
      <div className="absolute top-0 left-0 right-0 p-4 pointer-events-none">
        <div className="flex items-center gap-3">
          {stats.levelsTotal > 1 && (
            <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur rounded-full px-3.5 py-1.5 text-white font-bold">
              Level {stats.level} / {stats.levelsTotal}
            </div>
          )}
          <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur rounded-full px-3.5 py-1.5 text-white font-bold">
            Round {stats.round} / {stats.roundsTotal}
          </div>
          <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur rounded-full px-3.5 py-1.5 text-white font-bold">
            <CheckCircle2 className="w-5 h-5 text-emerald-300" />
            {stats.correct}
          </div>
          <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur rounded-full px-3.5 py-1.5 text-white font-bold">
            <Coins className="w-5 h-5 text-yellow-300" />
            {stats.coins} / {stats.coinTotal}
          </div>
          <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur rounded-full px-3.5 py-1.5 text-white font-bold">
            <Skull className="w-5 h-5 text-gray-300" />
            {stats.deaths}
          </div>
        </div>
      </div>

      {/* Word prompt */}
      {!stats.won && (
        <div className="absolute top-16 left-0 right-0 flex justify-center pointer-events-none px-4">
          <div className={`rounded-2xl px-6 py-3 text-center shadow-lg backdrop-blur border-2 transition-colors ${
            stats.lastResult === 'correct' ? 'bg-emerald-500/90 border-emerald-300'
            : stats.lastResult === 'wrong' ? 'bg-red-500/90 border-red-300'
            : 'bg-black/40 border-white/20'
          }`}>
            <p className="text-[11px] uppercase tracking-wide text-white/80 font-semibold">
              {stats.lastResult === 'correct' ? 'Correct!' : stats.lastResult === 'wrong' ? 'Oops!' : 'Attack the correct meaning'}
            </p>
            <p className="text-3xl font-black text-white leading-tight">{stats.word}</p>
          </div>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
        <p className="text-white/80 text-xs drop-shadow">
          Move: <span className="font-semibold">A / D or ← →</span> · Jump:{' '}
          <span className="font-semibold">W / ↑</span> (or tap) · Attack:{' '}
          <span className="font-semibold">Space</span> · Hit the monster with the right meaning
        </p>
      </div>

      {/* Win overlay */}
      {stats.won && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-sm w-full mx-4">
            <div className="text-6xl mb-3">{stats.correct === stats.totalRounds ? '🏆' : '⚔️'}</div>
            <h2 className="text-2xl font-black text-gray-800 mb-1">Quiz Complete!</h2>
            <p className="text-gray-500 mb-5">
              You got <span className="font-bold text-emerald-600">{stats.correct}/{stats.totalRounds}</span> correct
              {stats.correct === stats.totalRounds ? ' — perfect!' : '.'}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={restart}
                className="w-full py-3 bg-gradient-to-b from-emerald-400 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-full font-bold text-lg shadow-lg border-b-4 border-emerald-600 active:border-b-0 active:mt-1 transition-all"
              >
                Play Again
              </button>
              <button onClick={() => navigate('/')} className="w-full py-2.5 text-gray-400 hover:text-gray-600 font-medium">
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-4 right-4 z-10 bg-black/25 hover:bg-black/40 backdrop-blur rounded-full p-2 transition-colors pointer-events-auto"
        aria-label="Exit game"
      >
        <X className="w-6 h-6 text-white" />
      </button>
    </div>
  )
}
