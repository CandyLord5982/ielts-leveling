import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { supabase } from '../../supabase/client'
import { useAuth } from '../../hooks/useAuth'
import { assetUrl } from '../../hooks/useBranding'

const TAUNT_GIF_BASE = assetUrl('/gif/taunt')
const PVP_TAUNTS = {
  messages: ['Better luck next time! 😏','Too easy! 💪','GG EZ 😎','Get rekt! 💀','Not even close! 🔥','You need more practice! 📚','Is that all you got? 🥱','Bow to the champion! 👑'],
  emojis: ['😎', '💪', '🏆', '😂', '🔥', '👑', '💀', '🫡', '🥱', '😤', '🤡', '👋'],
  gifs: Array.from({ length: 12 }, (_, i) => ({ value: `${TAUNT_GIF_BASE}/${i + 1}.gif`, label: ['Deal with it','Victory dance','Bye bye','Too easy','Loser','Cry'][i % 6] })),
}
import { usePet } from '../../hooks/usePet'
import { seededPickMatchWords } from '../../utils/seededRandom'
import PetMatchGame from '../pet/games/PetMatchGame'


const PvPRealtimeMatchGame = ({
  challengeId,
  wordSeed,
  wordBank = [],
  opponent,
  isChallenger,
  onClose,
  petImageUrl,
  petName,
  pvpOpponentPetUrl = null,
}) => {
  const { user } = useAuth()
  const { activePet, playWithPet } = usePet()

  const [phase, setPhase] = useState('lobby')
  const [myReady, setMyReady] = useState(false)
  const [opponentReady, setOpponentReady] = useState(false)
  const [countdown, setCountdown] = useState(3)
  const [opponentProgress, setOpponentProgress] = useState({ score: 0, wordsCompleted: 0 })
  const [opponentFinished, setOpponentFinished] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [opponentPetUrl, setOpponentPetUrl] = useState(pvpOpponentPetUrl)
  const [opponentLeft, setOpponentLeft] = useState(false)
  const [tauntSent, setTauntSent] = useState(false)
  const [receivedTaunt, setReceivedTaunt] = useState(null)

  const channelRef = useRef(null)
  const opponentProgressRef = useRef({ score: 0, wordsCompleted: 0 })
  const myScoreRef = useRef(null)
  const opponentTimeoutRef = useRef(null)

  const resetOpponentTimeout = useCallback(() => {
    if (opponentTimeoutRef.current) clearTimeout(opponentTimeoutRef.current)
    opponentTimeoutRef.current = setTimeout(() => {
      setOpponentLeft(true)
    }, 15000)
  }, [])

  useEffect(() => {
    if (opponentPetUrl || !opponent?.id) return
    const fetchPet = async () => {
      const { data } = await supabase.from('user_pets')
        .select('evolution_stage, pets(image_url, evolution_stages)')
        .eq('user_id', opponent.id)
        .eq('is_active', true)
        .limit(1)
        .single()
      if (data?.pets?.image_url) {
        let img = data.pets.image_url
        if (data.evolution_stage > 0 && data.pets.evolution_stages) {
          const stage = data.pets.evolution_stages.find(s => s.stage === data.evolution_stage)
          if (stage?.image_url) img = stage.image_url
        }
        setOpponentPetUrl(img.startsWith('http') ? img : assetUrl(img))
      }
    }
    fetchPet()
  }, [opponent?.id, opponentPetUrl])

  const source = wordBank
  const gameRounds = useRef(seededPickMatchWords(source, wordSeed)).current

  useEffect(() => {
    const channelName = `pvp-live-${challengeId}`
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'player_ready' }, (payload) => {
        if (payload.payload?.userId !== user.id) {
          resetOpponentTimeout()
          setOpponentReady(true)
          if (payload.payload?.petUrl) setOpponentPetUrl(payload.payload.petUrl)
        }
      })
      .on('broadcast', { event: 'game_start' }, () => {
        resetOpponentTimeout()
        setPhase('countdown')
      })
      .on('broadcast', { event: 'progress' }, (payload) => {
        if (payload.payload?.userId !== user.id) {
          resetOpponentTimeout()
          const p = { score: payload.payload.score, wordsCompleted: payload.payload.wordsCompleted }
          opponentProgressRef.current = p
          setOpponentProgress(p)
        }
      })
      .on('broadcast', { event: 'game_end' }, (payload) => {
        if (payload.payload?.userId !== user.id) {
          if (opponentTimeoutRef.current) clearTimeout(opponentTimeoutRef.current)
          const p = { score: payload.payload.score, wordsCompleted: payload.payload.wordsCompleted }
          opponentProgressRef.current = p
          setOpponentProgress(p)
          setOpponentFinished(true)
        }
      })
      .on('broadcast', { event: 'player_left' }, (payload) => {
        if (payload.payload?.userId !== user.id) {
          if (opponentTimeoutRef.current) clearTimeout(opponentTimeoutRef.current)
          setOpponentLeft(true)
        }
      })
      .on('broadcast', { event: 'taunt' }, (payload) => {
        if (payload.payload?.userId !== user.id) {
          resetOpponentTimeout()
          setReceivedTaunt(payload.payload.taunt)
        }
      })
      .subscribe((status) => {
        setConnectionStatus(status === 'SUBSCRIBED' ? 'connected' : 'connecting')
      })

    channelRef.current = channel
    return () => {
      if (opponentTimeoutRef.current) clearTimeout(opponentTimeoutRef.current)
      supabase.removeChannel(channel)
      supabase.from('pvp_matchmaking').delete().eq('user_id', user.id)
    }
  }, [challengeId, user.id, resetOpponentTimeout])

  useEffect(() => {
    if (myReady && opponentReady && isChallenger && phase === 'lobby') {
      const timer = setTimeout(() => {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'game_start',
          payload: {},
        })
        setPhase('countdown')
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [myReady, opponentReady, isChallenger, phase])

  useEffect(() => {
    if (phase === 'playing') {
      resetOpponentTimeout()
    }
    return () => {
      if (opponentTimeoutRef.current) clearTimeout(opponentTimeoutRef.current)
    }
  }, [phase, resetOpponentTimeout])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setPhase('playing')
      return
    }
    const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000)
    return () => clearTimeout(timer)
  }, [phase, countdown])

  const handleReady = useCallback(() => {
    setMyReady(true)
    const myPetUrl = activePet?.image_url || null
    channelRef.current?.send({
      type: 'broadcast',
      event: 'player_ready',
      payload: { userId: user.id, petUrl: myPetUrl },
    })
  }, [user.id, activePet])

  useEffect(() => {
    if (connectionStatus === 'connected' && !myReady) {
      handleReady()
    }
  }, [connectionStatus, myReady, handleReady])

  const handleProgressUpdate = useCallback((progress) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'progress',
      payload: { userId: user.id, ...progress },
    })
  }, [user.id])

  const handleGameEnd = useCallback(async (score, extras) => {
    myScoreRef.current = score

    channelRef.current?.send({
      type: 'broadcast',
      event: 'game_end',
      payload: { userId: user.id, score, wordsCompleted: extras?.pairsMatched || 0 },
    })

    try {
      const opScore = opponentProgressRef.current.score
      const { data: challengeData } = await supabase.from('pvp_challenges')
        .select('challenger_id, opponent_id').eq('id', challengeId).single()

      if (isChallenger) {
        const winnerId = score > opScore ? challengeData?.challenger_id
          : score < opScore ? challengeData?.opponent_id
          : null
        await supabase.from('pvp_challenges').update({
          challenger_score: score,
          status: opponentFinished ? 'completed' : 'in_progress',
          ...(opponentFinished ? {
            opponent_score: opScore,
            winner_id: winnerId,
          } : {}),
        }).eq('id', challengeId)
      } else {
        const { data: fresh } = await supabase.from('pvp_challenges')
          .select('challenger_score').eq('id', challengeId).single()
        const challengerScore = fresh?.challenger_score ?? opScore

        const winnerId = score > challengerScore ? challengeData?.opponent_id
          : score < challengerScore ? challengeData?.challenger_id
          : null

        await supabase.from('pvp_challenges').update({
          opponent_score: score,
          winner_id: winnerId,
          status: 'completed',
        }).eq('id', challengeId)
      }

      const myWinnerId = score > opponentProgressRef.current.score ? user.id : null
      if (myWinnerId) {
        await supabase.rpc('increment_user_currency', { p_user_id: myWinnerId, p_xp: 10, p_gems: 0 })
        supabase.rpc('update_mission_progress', {
          p_user_id: myWinnerId,
          p_goal_type: 'win_quickmatch',
          p_increment: 1,
        }).catch(() => {})
      }

      if (activePet?.id) {
        playWithPet(activePet.id).catch(() => {})
      }
    } catch (err) {
      console.error('Error saving realtime PvP result:', err)
    }

    setPhase('done')
  }, [user.id, isChallenger, challengeId, opponentFinished, activePet, playWithPet])

  const sendTaunt = useCallback(async (type, value) => {
    const taunt = JSON.stringify({ type, value })
    channelRef.current?.send({ type: 'broadcast', event: 'taunt', payload: { userId: user.id, taunt } })
    await supabase.from('pvp_challenges').update({ winner_taunt: taunt }).eq('id', challengeId)
    setTauntSent(true)
  }, [user.id, challengeId])

  const opponentName = opponent?.full_name?.split(' ').pop() || 'Opponent'

  if (phase === 'lobby') {
    return createPortal(
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-8 text-center relative">
          <button onClick={() => {
            channelRef.current?.send({ type: 'broadcast', event: 'player_left', payload: { userId: user.id } })
            onClose()
          }} className="absolute top-4 right-4 bg-white/20 rounded-full p-2 hover:bg-white/30 transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>

          {opponentLeft ? (
            <>
              <div className="text-5xl mb-4">💨</div>
              <h2 className="text-xl font-bold text-white mb-2">Opponent Left</h2>
              <p className="text-white/60 text-sm mb-6">{opponentName} has left the battle.</p>
              <button onClick={onClose} className="px-8 py-3 bg-white text-indigo-700 rounded-full font-bold shadow-xl hover:scale-105 active:scale-95 transition-transform">Back</button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-5 mb-6 mt-2">
                <div className="flex flex-col items-center gap-2" style={{ animation: 'pvpSlideInLeft 0.5s ease-out' }}>
                  {petImageUrl
                    ? <img src={petImageUrl} alt={petName} className="w-20 h-20 object-contain drop-shadow-lg" />
                    : <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-3xl font-bold text-white">{petName[0]}</div>
                  }
                  <span className="text-white font-bold text-sm">{petName}</span>
                </div>
                <img src={assetUrl('/icon/dashboard/pvp.png')} alt="VS" className="w-16 h-16 object-contain drop-shadow-lg" style={{ animation: 'pvpVsPulse 1s ease-in-out infinite' }} />
                <div className="flex flex-col items-center gap-2" style={{ animation: 'pvpSlideInRight 0.5s ease-out' }}>
                  {opponentPetUrl
                    ? <img src={opponentPetUrl} alt={opponentName} className="w-20 h-20 object-contain drop-shadow-lg" style={{ transform: 'scaleX(-1)' }} />
                    : <div className="w-20 h-20 rounded-full bg-red-500/30 flex items-center justify-center text-3xl font-bold text-white">{opponentName[0]}</div>
                  }
                  <span className="text-white font-bold text-sm">{opponentName}</span>
                </div>
              </div>
              <p className="text-white/70 text-sm animate-pulse">Starting battle...</p>
              <style>{`
                @keyframes pvpSlideInLeft { from { transform: translateX(-40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                @keyframes pvpSlideInRight { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                @keyframes pvpVsPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.2); } }
              `}</style>
            </>
          )}
        </div>
      </div>,
      document.body
    )
  }

  if (phase === 'countdown') {
    return createPortal(
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/60 text-lg mb-4">Battle starts in...</p>
          <div className="text-9xl font-black text-white drop-shadow-2xl" key={countdown}
            style={{ animation: 'typeScorePopIn 0.8s ease-out' }}>
            {countdown > 0 ? countdown : 'GO!'}
          </div>
          <style>{`
            @keyframes typeScorePopIn {
              0% { transform: scale(0); opacity: 0; }
              70% { transform: scale(1.15); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
            }
          `}</style>
        </div>
      </div>,
      document.body
    )
  }

  if (phase === 'playing') {
    return (
      <PetMatchGame
        petImageUrl={petImageUrl}
        petName={petName}
        onGameEnd={handleGameEnd}
        onClose={onClose}
        hideClose={true}
        initialRounds={gameRounds}
        onProgressUpdate={handleProgressUpdate}
        opponentProgress={opponentProgress}
        isRealtimePvP={true}
        pvpOpponentPetUrl={opponentPetUrl}
        chestEnabled={false}
      />
    )
  }

  if (phase === 'done') {
    const myScore = myScoreRef.current || 0
    const opScore = opponentProgressRef.current.score || 0
    const won = myScore > opScore
    const tied = myScore === opScore

    return createPortal(
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 text-center relative max-h-[90vh] overflow-y-auto">
          <button onClick={onClose} className="absolute top-3 right-3 bg-white/20 rounded-full p-2 hover:bg-white/30 transition-colors z-10">
            <X className="w-5 h-5 text-white" />
          </button>

          <div className="text-4xl mb-2">{won ? '🏆' : tied ? '🤝' : '😔'}</div>
          <h2 className="text-2xl font-black text-white mb-1" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            {won ? 'You Win!' : tied ? "It's a Tie!" : 'You Lose!'}
          </h2>
          {won && <p className="text-green-300 font-bold text-sm mb-3">+10 XP</p>}

          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="flex flex-col items-center gap-1">
              {petImageUrl && <img src={petImageUrl} alt={petName} className="w-14 h-14 object-contain drop-shadow-lg" />}
              <span className="text-white text-xs font-bold">{petName}</span>
              <span className={`text-2xl font-black ${won ? 'text-green-400' : 'text-white'}`}>{myScore}</span>
            </div>
            <span className="text-xl font-black text-white/30">vs</span>
            <div className="flex flex-col items-center gap-1">
              {opponentPetUrl
                ? <img src={opponentPetUrl} alt={opponentName} className="w-14 h-14 object-contain drop-shadow-lg" style={{ transform: 'scaleX(-1)' }} />
                : <div className="w-14 h-14 rounded-full bg-red-500/30 flex items-center justify-center text-white text-xl font-bold">{opponentName[0]}</div>
              }
              <span className="text-white text-xs font-bold">{opponentName}</span>
              <span className={`text-2xl font-black ${!won && !tied ? 'text-red-300' : 'text-white'}`}>{opScore}</span>
            </div>
          </div>

          {receivedTaunt && (() => {
            try {
              const t = typeof receivedTaunt === 'string' ? JSON.parse(receivedTaunt) : receivedTaunt
              return (
                <div className="bg-red-500/20 rounded-xl p-3 mb-3 border border-red-400/30">
                  <p className="text-white/50 text-[10px] mb-1">{opponentName} says:</p>
                  {t.type === 'emoji' && <span className="text-4xl">{t.value}</span>}
                  {t.type === 'gif' && t.value.startsWith('http') && <img src={t.value} alt="taunt" className="w-20 h-20 object-cover rounded-lg mx-auto" />}
                  {t.type === 'message' && <p className="text-white font-bold text-sm">&ldquo;{t.value}&rdquo;</p>}
                </div>
              )
            } catch { return null }
          })()}

          {won && !tauntSent && (
            <div className="bg-white/10 rounded-xl p-3 mb-3">
              <p className="text-xs font-bold text-yellow-300 mb-2">Send a taunt! 😈</p>
              <div className="grid grid-cols-6 gap-1 mb-2">
                {PVP_TAUNTS.emojis.map((emoji, i) => (
                  <button key={i} onClick={() => sendTaunt('emoji', emoji)} className="text-2xl p-1 rounded-lg hover:bg-white/10 active:scale-90 transition">{emoji}</button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {PVP_TAUNTS.gifs.slice(0, 6).map((gif, i) => (
                  <button key={i} onClick={() => sendTaunt('gif', gif.value)} className="flex flex-col items-center p-1 rounded-lg hover:bg-white/10 transition">
                    <img src={gif.value} alt={gif.label} className="w-10 h-10 object-cover rounded" />
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                {PVP_TAUNTS.messages.slice(0, 4).map((msg, i) => (
                  <button key={i} onClick={() => sendTaunt('message', msg)} className="w-full text-left px-3 py-1 rounded-lg text-xs font-medium text-white/80 hover:bg-white/10 transition">{msg}</button>
                ))}
              </div>
            </div>
          )}
          {won && tauntSent && (
            <p className="text-green-300 font-bold text-sm mb-3 animate-bounce">Taunt sent! 😈</p>
          )}

          <button onClick={onClose} className="w-full py-3 bg-white text-indigo-700 rounded-full font-bold text-lg shadow-xl hover:scale-105 active:scale-95 transition-transform">
            Done
          </button>
        </div>
      </div>,
      document.body
    )
  }

  return null
}

export default PvPRealtimeMatchGame
