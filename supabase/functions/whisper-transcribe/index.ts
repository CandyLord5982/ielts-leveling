// @ts-nocheck
// Supabase Edge Function — proxies audio to OpenAI Whisper and returns timed segments
// Deploy with: supabase functions deploy whisper-transcribe

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
    if (!GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GROQ_API_KEY not set in Edge Function secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Forward the multipart FormData to Groq Speech-to-Text API
    const formData = await req.formData()

    // Ensure required Groq params are set
    formData.set('model', 'whisper-large-v3')
    formData.set('response_format', 'verbose_json')
    if (!formData.has('timestamp_granularities[]')) {
      formData.append('timestamp_granularities[]', 'segment')
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: formData,
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      return new Response(
        JSON.stringify({ error: errText }),
        { status: groqRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await groqRes.json()

    // Map Groq verbose_json segments → our schema
    const segments = (data.segments || []).map((s) => ({
      start_time: parseFloat(Number(s.start).toFixed(2)),
      end_time:   parseFloat(Number(s.end).toFixed(2)),
      text_content: (s.text || '').trim(),
      alt_answers: [],
      difficulty: 1,
    }))

    return new Response(
      JSON.stringify({ segments, full_text: data.text || '' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
