import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const { data, error } = await supabase.rpc('award_weekly_scramble_champion')
    if (error) throw error

    console.log('Weekly scramble champion awarded:', data)
    return res.status(200).json({ success: true, data })
  } catch (error) {
    console.error('Error awarding weekly scramble champion:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
}
