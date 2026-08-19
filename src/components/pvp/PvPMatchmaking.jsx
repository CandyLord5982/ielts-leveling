import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Search } from 'lucide-react'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import { usePet } from '../../hooks/usePet'
import { assetUrl } from '../../hooks/useBranding'
import PvPRealtimeWordType from './PvPRealtimeWordType'
import PvPRealtimeWordScramble from './PvPRealtimeWordScramble'
import PvPRealtimeMatchGame from './PvPRealtimeMatchGame'
import { getSetting } from '../../utils/siteSettings'

const PvPMatchmaking = ({ onClose, wordBank = [] }) => {
  const { user, profile } = useAuth()
  const { activePet } = usePet()

  const [phase, setPhase] = useState('searching') // searching | matched | playing
  const [searchTime, setSearchTime] = useState(0)
  const [opponent, setOpponent] = useState(null)
  const [challengeId, setChallengeId] = useState(null)
  const [wordSeed, setWordSeed] = useState(null)
  const [isChallenger, setIsChallenger] = useState(false)
  const [error, setError] = useState(null)
  const [queueCount, setQueueCount] = useState(0)
  const [playingCount, setPlayingCount] = useState(0)
  const [gameType, setGameType] = useState('wordtype')

  const queueRowId = useRef(null)
  const matchedRef = useRef(false)
  const pollRef = useRef(null)
  const pollingRef = useRef(false)

  const petImage = activePet?.image_url || assetUrl('/image/pet/default.png')
  const petName = activePet?.nickname || activePet?.name || 'Your Pet'

  const gameTypeRef = useRef('wordtype')

  // Fetch admin-configured quick match game type, then join the queue
  useEffect(() => {
    let cancelled = false

    const joinQueue = async () => {
      // Fetch configured game type (shared cache)
      const quickmatchGameType = await getSetting('quickmatch_game_type')
      if (quickmatchGameType) {
        gameTypeRef.current = quickmatchGameType
        setGameType(quickmatchGameType)
      }

      if (cancelled) return

      // Clean up ALL stale entries from this user first
      await supabase.from('pvp_matchmaking')
        .delete()
        .eq('user_id', user.id)

      if (cancelled) return

      // Double-check no rows exist for this user before inserting
      const { data: existing } = await supabase.from('pvp_matchmaking')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'waiting')
        .limit(1)

      if (existing && existing.length > 0) {
        // Already have a waiting row (e.g. React strict mode double-mount)
        queueRowId.current = existing[0].id
        return
      }

      if (cancelled) return

      // Insert into queue
      const { data, error } = await supabase.from('pvp_matchmaking').insert({
        user_id: user.id,
        game_type: gameTypeRef.current,
        status: 'waiting',
      }).select('id').single()

      if (error) {
        setError('Failed to join queue. Try again.')
        return
      }
      if (cancelled) {
        // Component unmounted before insert finished
        supabase.from('pvp_matchmaking').delete().eq('id', data.id)
        return
      }
      queueRowId.current = data.id
    }

    joinQueue()

    return () => {
      cancelled = true
      // Leave queue on unmount — clean up ALL rows for this user
      supabase.from('pvp_matchmaking').delete().eq('user_id', user.id)
    }
  }, [user.id])

  // Poll for matches
  useEffect(() => {
    if (phase !== 'searching') return

    const checkForMatch = async () => {
      if (matchedRef.current || !queueRowId.current || pollingRef.current) return
      pollingRef.current = true
      try {

      // Fetch queue count and playing count
      const gt = gameTypeRef.current
      const { count } = await supabase.from('pvp_matchmaking')
        .select('id', { count: 'exact', head: true })
        .eq('game_type', gt)
        .in('status', ['waiting', 'matching'])
      setQueueCount(count || 0)

      const { count: playing } = await supabase.from('pvp_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'in_progress')
        .eq('realtime_mode', true)
        .eq('game_type', gt)
      setPlayingCount((playing || 0) * 2)

      // First check if we've been matched by someone else
      const { data: myRow } = await supabase.from('pvp_matchmaking')
        .select('status, challenge_id')
        .eq('id', queueRowId.current)
        .single()

      if (myRow?.status === 'matched' && myRow?.challenge_id) {
        // We've been matched by the other player
        matchedRef.current = true

        // Fetch the challenge details
        const { data: challenge } = await supabase.from('pvp_challenges')
          .select('id, challenger_id, word_seed, challenger:users!pvp_challenges_challenger_id_fkey(id, full_name, avatar_url)')
          .eq('id', myRow.challenge_id)
          .single()

        if (challenge) {
          setChallengeId(challenge.id)
          setWordSeed(challenge.word_seed)
          setIsChallenger(false)
          setOpponent(challenge.challenger)
          setPhase('matched')
          setPhase('playing')
        }
        return
      }

      // Look for another waiting player — only the earlier entry creates the match
      const { data: waiting } = await supabase.from('pvp_matchmaking')
        .select('id, user_id, created_at, users:user_id(id, full_name, avatar_url)')
        .eq('game_type', gt)
        .eq('status', 'waiting')
        .neq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)

      if (waiting && waiting.length > 0 && !matchedRef.current) {
        const match = waiting[0]

        // Only one player creates the match — deterministic: lower user_id wins
        if (user.id > match.user_id) {
          // We have the higher user_id — wait for the other player to create the match
          return
        }

        // Atomically claim the opponent by setting their status (only if still waiting)
        const { data: claimed } = await supabase.from('pvp_matchmaking')
          .update({ status: 'matching' })
          .eq('id', match.id)
          .eq('status', 'waiting')
          .select('id')

        if (!claimed || claimed.length === 0) {
          // Someone else already claimed them
          return
        }

        // Also mark ourselves as matching so no one else claims us
        await supabase.from('pvp_matchmaking')
          .update({ status: 'matching' })
          .eq('id', queueRowId.current)

        matchedRef.current = true

        // Create challenge
        const seed = Math.floor(Math.random() * 2147483647)
        const { data: challenge } = await supabase.from('pvp_challenges').insert({
          challenger_id: user.id,
          opponent_id: match.user_id,
          game_type: gt,
          challenger_score: 0,
          status: 'in_progress',
          realtime_mode: true,
          word_seed: seed,
        }).select('id').single()

        if (challenge) {
          // Update both queue entries to matched
          await supabase.from('pvp_matchmaking')
            .update({ status: 'matched', challenge_id: challenge.id })
            .eq('id', match.id)

          await supabase.from('pvp_matchmaking')
            .update({ status: 'matched', challenge_id: challenge.id })
            .eq('id', queueRowId.current)

          setChallengeId(challenge.id)
          setWordSeed(seed)
          setIsChallenger(true)
          setOpponent(match.users)
          setPhase('matched')
          setPhase('playing')
        }
      }
    } finally {
      pollingRef.current = false
    }
    }

    // Poll every 2 seconds
    checkForMatch()
    pollRef.current = setInterval(checkForMatch, 2000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [phase, user.id])

  // Search timer
  useEffect(() => {
    if (phase !== 'searching') return
    const timer = setInterval(() => setSearchTime(prev => prev + 1), 1000)
    return () => clearInterval(timer)
  }, [phase])

  // Auto-cancel after 60 seconds
  useEffect(() => {
    if (searchTime >= 60 && phase === 'searching') {
      if (queueRowId.current) {
        supabase.from('pvp_matchmaking').delete().eq('id', queueRowId.current)
        queueRowId.current = null
      }
      setError('No opponents found. Try again later.')
    }
  }, [searchTime, phase])

  const handleClose = useCallback(async () => {
    await supabase.from('pvp_matchmaking').delete().eq('user_id', user.id)
    if (challengeId && phase !== 'playing') {
      await supabase.from('pvp_challenges').delete().eq('id', challengeId)
    }
    onClose()
  }, [onClose, challengeId, phase, user.id])

  // Playing phase
  if (phase === 'playing' && challengeId && wordSeed) {
    const realtimeProps = {
      challengeId,
      wordSeed,
      wordBank,
      opponent,
      isChallenger,
      onClose: handleClose,
      onComplete: () => handleClose(),
      petImageUrl: petImage,
      petName,
    }
    if (gameType === 'scramble') return <PvPRealtimeWordScramble {...realtimeProps} />
    if (gameType === 'matchgame') return <PvPRealtimeMatchGame {...realtimeProps} />
    return <PvPRealtimeWordType {...realtimeProps} />
  }

  // Searching / Matched / Error phases
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-8 text-center relative overflow-hidden">
        <button onClick={handleClose} className="absolute top-4 right-4 bg-white/20 rounded-full p-2 hover:bg-white/30 transition-colors z-10">
          <X className="w-5 h-5 text-white" />
        </button>

        {error ? (
          <>
            <div className="text-5xl mb-4">😔</div>
            <h2 className="text-xl font-bold text-white mb-2">No Match Found</h2>
            <p className="text-white/60 text-sm mb-6">{error}</p>
            <button
              onClick={handleClose}
              className="px-8 py-3 bg-white text-indigo-700 rounded-full font-bold shadow-xl hover:scale-105 active:scale-95 transition-transform"
            >
              Close
            </button>
          </>
        ) : phase === 'matched' ? (
          <>
            <div className="text-5xl mb-4" style={{ animation: 'matchPulse 0.6s ease-out' }}>⚔️</div>
            <h2 className="text-2xl font-black text-white mb-2" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
              Match Found!
            </h2>
            <div className="flex items-center justify-center gap-4 mt-4">
              <div className="flex flex-col items-center gap-1">
                {petImage && <img src={petImage} alt={petName} className="w-14 h-14 object-contain drop-shadow-lg" />}
                <span className="text-white text-xs font-bold">{profile?.full_name?.split(' ').pop() || 'You'}</span>
              </div>
              <span className="text-2xl font-black text-red-400" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>VS</span>
              <div className="flex flex-col items-center gap-1">
                {opponent?.avatar_url
                  ? <img src={opponent.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-red-400" />
                  : <div className="w-14 h-14 rounded-full bg-red-500/30 flex items-center justify-center text-white text-xl font-bold">{opponent?.full_name?.[0]?.toUpperCase() || '?'}</div>
                }
                <span className="text-white text-xs font-bold">{opponent?.full_name?.split(' ').pop() || 'Opponent'}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Searching animation */}
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-white/10" />
              <div className="absolute inset-0 rounded-full border-4 border-t-white/80 border-r-transparent border-b-transparent border-l-transparent"
                style={{ animation: 'spin 1s linear infinite' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Search className="w-8 h-8 text-white/80" />
              </div>
            </div>

            <h2 className="text-xl font-black text-white mb-1" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
              Finding Opponent...
            </h2>
            <p className="text-white/50 text-sm mb-4">{{ wordtype: 'Word Type', scramble: 'Word Scramble', matchgame: 'Match Up' }[gameType] || gameType} - Live Battle</p>

            <div className="flex items-center gap-3 mb-6">
              <div className="bg-white/10 rounded-full px-4 py-2 inline-flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-white/70 text-sm font-medium">{searchTime}s</span>
              </div>
              <div className="bg-white/10 rounded-full px-4 py-2 inline-flex items-center gap-2">
                <span className="text-white/70 text-sm font-medium">{queueCount} in queue</span>
              </div>
              {playingCount > 0 && (
                <div className="bg-white/10 rounded-full px-4 py-2 inline-flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  <span className="text-white/70 text-sm font-medium">{playingCount} playing</span>
                </div>
              )}
            </div>

            {petImage && (
              <div className="flex justify-center">
                <img src={petImage} alt={petName} className="w-16 h-16 object-contain drop-shadow-lg"
                  style={{ animation: 'float 2s ease-in-out infinite' }}
                />
              </div>
            )}
          </>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes float {
            0%, 100% { transform: translateY(-4px); }
            50% { transform: translateY(4px); }
          }
          @keyframes matchPulse {
            0% { transform: scale(0); }
            70% { transform: scale(1.2); }
            100% { transform: scale(1); }
          }
        `}</style>
      </div>
    </div>,
    document.body
  )
}

export default PvPMatchmaking
