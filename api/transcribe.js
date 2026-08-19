// Vercel Serverless Function: AssemblyAI Speech-to-Text proxy
// Path: /api/transcribe

export const config = {
  runtime: 'edge'
}

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export default async function handler(req) {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY
  if (!ASSEMBLYAI_KEY) {
    return jsonResponse(500, { error: 'AssemblyAI API key not configured' })
  }

  try {
    const audioData = await req.arrayBuffer()

    if (audioData.byteLength < 1000) {
      return jsonResponse(400, { error: 'Audio too short or empty' })
    }

    // Step 1: Upload audio to AssemblyAI
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_KEY,
        'Content-Type': 'application/octet-stream'
      },
      body: audioData
    })

    if (!uploadRes.ok) {
      const detail = await uploadRes.text()
      return jsonResponse(500, { error: 'Failed to upload audio', detail })
    }

    const { upload_url } = await uploadRes.json()

    // Step 2: Create transcript
    const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audio_url: upload_url,
        language_code: 'en_us'
      })
    })

    if (!transcriptRes.ok) {
      const detail = await transcriptRes.text()
      return jsonResponse(500, { error: 'Failed to create transcript', detail })
    }

    const { id } = await transcriptRes.json()

    // Step 3: Poll for result (short audio should finish in a few seconds)
    for (let i = 0; i < 20; i++) {
      await sleep(1000)

      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { 'Authorization': ASSEMBLYAI_KEY }
      })

      const result = await pollRes.json()

      if (result.status === 'completed') {
        return jsonResponse(200, {
          success: true,
          text: result.text || '',
          confidence: result.confidence || 0,
          words: (result.words || []).map(w => ({
            text: w.text,
            confidence: w.confidence,
            start: w.start,
            end: w.end
          }))
        })
      }

      if (result.status === 'error') {
        return jsonResponse(500, { error: result.error || 'Transcription failed' })
      }
    }

    return jsonResponse(504, { error: 'Transcription timed out' })
  } catch (err) {
    return jsonResponse(500, { error: 'Internal error', detail: String(err?.message || err) })
  }
}
