// Vercel Serverless Function: Groq Whisper speech-to-text proxy
// Path: /api/transcribe-whisper
// Used by the IELTS speaking assessment. Pronunciation exercises keep using
// /api/transcribe (AssemblyAI) because they need per-word confidence scores.

export const config = {
  runtime: 'edge'
}

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

// Groq detects the audio format from the file name, so pick a matching extension
const extensionFor = (contentType = '') => {
  if (contentType.includes('mp4') || contentType.includes('m4a') || contentType.includes('aac')) return 'm4a'
  if (contentType.includes('ogg')) return 'ogg'
  if (contentType.includes('wav')) return 'wav'
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3'
  return 'webm'
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY
  if (!GROQ_API_KEY) {
    return jsonResponse(500, { error: 'GROQ_API_KEY not configured' })
  }

  try {
    const contentType = req.headers.get('content-type') || 'audio/webm'
    const audioData = await req.arrayBuffer()

    if (audioData.byteLength < 1000) {
      return jsonResponse(400, { error: 'Audio too short or empty' })
    }

    const form = new FormData()
    form.append('file', new Blob([audioData], { type: contentType }), `audio.${extensionFor(contentType)}`)
    form.append('model', 'whisper-large-v3-turbo')
    form.append('language', 'en')
    form.append('response_format', 'json')
    form.append('temperature', '0')

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: form
    })

    if (!res.ok) {
      const detail = await res.text()
      return jsonResponse(res.status, { error: `Groq error: ${res.status}`, detail })
    }

    const result = await res.json()
    return jsonResponse(200, { success: true, text: (result.text || '').trim() })
  } catch (err) {
    return jsonResponse(500, { error: 'Internal error', detail: String(err?.message || err) })
  }
}
