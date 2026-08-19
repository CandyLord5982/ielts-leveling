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
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 10)
    const cutoff = threeDaysAgo.toISOString()

    const { data, error } = await supabase
      .from('training_scores')
      .delete()
      .lt('played_at', cutoff)
      .select('id', { count: 'exact', head: true })

    if (error) throw error

    return res.status(200).json({ deleted: data?.length || 0, cutoff })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
