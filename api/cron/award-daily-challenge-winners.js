import { createClient } from '@supabase/supabase-js'

/**
 * Vercel Cron Job: Award Daily Challenge Winners
 *
 * Runs daily at 00:05 Vietnam time (17:05 UTC)
 * Awards top 1 and top 3 performers for yesterday's challenges
 * across all 3 difficulty levels (beginner, intermediate, advanced)
 */
export default async function handler(req, res) {
  // Verify cron secret for security
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Service role key for admin operations
  )

  try {
    // Call the RPC function to award winners
    const { data, error } = await supabase.rpc('award_daily_challenge_winners')

    if (error) throw error

    console.log('Daily challenge winners awarded:', data)

    return res.status(200).json({
      success: true,
      message: 'Awards processed successfully',
      data
    })
  } catch (error) {
    console.error('Error awarding daily challenge winners:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
}
