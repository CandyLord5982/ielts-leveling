// Vercel Serverless Function: Groq proxy for pet chat/tutor
// Path: /api/pet-chat

export const config = {
  runtime: 'edge'
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const { messages, model = 'openai/gpt-oss-120b', max_tokens = 500, temperature = 0.7 } = await req.json()

    const apiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, max_tokens, temperature })
    })

    if (!apiRes.ok) {
      const errText = await apiRes.text()
      return new Response(JSON.stringify({ error: `Groq error: ${apiRes.status}`, detail: errText }), {
        status: apiRes.status,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const data = await apiRes.json()
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
