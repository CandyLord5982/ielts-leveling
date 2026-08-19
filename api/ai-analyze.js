// Vercel Serverless Function: AI Weakness Analysis Proxy
// Path: /api/ai-analyze

export const config = {
  runtime: 'edge'
}

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

export default async function handler(req) {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  try {
    const { messages, max_tokens = 4000, temperature = 0.3 } = await req.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonResponse(400, { error: 'Missing messages array' })
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY

    if (!GROQ_API_KEY) {
      return jsonResponse(500, { error: 'GROQ_API_KEY not configured' })
    }

    const reqBody = JSON.stringify({ model: 'openai/gpt-oss-120b', messages, max_tokens, temperature })
    let response
    for (let attempt = 0; attempt < 5; attempt++) {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: reqBody
      })
      if (response.ok || (response.status !== 429 && response.status !== 500)) break
      await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(2, attempt), 30000)))
    }

    if (!response.ok) {
      const errText = await response.text()
      return jsonResponse(response.status, { error: `Groq error: ${response.status}`, detail: errText })
    }

    const data = await response.json()
    const resultText = data.choices?.[0]?.message?.content

    if (!resultText) {
      return jsonResponse(500, { error: 'No response from AI' })
    }

    return jsonResponse(200, { result: resultText })
  } catch (err) {
    return jsonResponse(500, { error: 'Internal error', detail: String(err?.message || err) })
  }
}
