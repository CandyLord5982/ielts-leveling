import { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import { Clock, TrendingUp, Award } from 'lucide-react'

const ChallengeAttemptHistory = ({ challengeId, userId }) => {
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (challengeId && userId) {
      fetchAttempts()
    }
  }, [challengeId, userId])

  const fetchAttempts = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.rpc('get_user_challenge_attempts', {
        p_challenge_id: challengeId,
        p_user_id: userId
      })

      if (error) throw error
      setAttempts(data || [])
    } catch (error) {
      console.error('Error fetching attempts:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading || attempts.length === 0) return null

  return (
    <div className="mt-4 space-y-2">
      <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <TrendingUp className="w-4 h-4" />
        Your Attempts
      </h4>
      {attempts.map((attempt) => (
        <div
          key={attempt.attempt_number}
          className={`p-3 rounded-lg border ${
            attempt.is_best
              ? 'bg-yellow-50 border-yellow-300'
              : 'bg-gray-50 border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">Attempt {attempt.attempt_number}</span>
              {attempt.is_best && <Award className="w-4 h-4 text-yellow-600" />}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="font-bold text-blue-700">{attempt.score}%</span>
              <span className="flex items-center gap-1 text-gray-600">
                <Clock className="w-3 h-3" />
                {formatTime(attempt.time_spent)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default ChallengeAttemptHistory
