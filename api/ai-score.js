// Vercel Serverless Function: AI Scoring Endpoint
// Path: /api/ai-score

export const config = {
  runtime: 'edge'
}

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const levenshtein = (a, b) => {
  const an = a ? a.length : 0
  const bn = b ? b.length : 0
  if (an === 0) return bn
  if (bn === 0) return an
  const matrix = Array.from({ length: bn + 1 }, (_, i) => [i])
  for (let j = 0; j <= an; j++) matrix[0][j] = j
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[bn][an]
}

const similarityPct = (s1, s2) => {
  const longer = s1.length >= s2.length ? s1 : s2
  const shorter = s1.length >= s2.length ? s2 : s1
  if (longer.length === 0) return 100
  const dist = levenshtein(longer, shorter)
  return Math.max(0, ((longer.length - dist) / longer.length) * 100)
}

const keywordScore = (userAns, expected) => {
  const u = userAns.split(/\s+/).filter(Boolean)
  const e = expected.split(/\s+/).filter(Boolean)
  if (e.length === 0) return 0
  const common = u.filter(w => e.some(x => x.includes(w) || w.includes(x)))
  return (common.length / e.length) * 100
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  try {
    const { question, userAnswer, expectedAnswers = [], context, minScore = 70, prompt, language = 'en' } = await req.json()

    if (typeof userAnswer !== 'string' || userAnswer.trim().length === 0) {
      return jsonResponse(400, { error: 'Missing userAnswer' })
    }

    const cleanedAnswer = userAnswer.trim()
    const cleanedExpected = (Array.isArray(expectedAnswers) ? expectedAnswers : []).map(s => String(s).trim()).filter(Boolean)

    // Exact match fast path
    if (cleanedExpected.some(e => e.toLowerCase() === cleanedAnswer.toLowerCase())) {
      return jsonResponse(200, {
        score: 100,
        confidence: 95,
        explanation: 'Exact match with an expected answer.'
      })
    }

    // Prefer OpenAI if configured
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY
    if (OPENAI_API_KEY) {
      const system = 'You score short student answers fairly and explain briefly.'
      const aiPrompt = `Question: "${question || ''}"
Student Answer: "${cleanedAnswer}"
Expected Answers: ${JSON.stringify(cleanedExpected)}
Context: ${context || 'educational assessment'}

Rules:
- Return JSON only: {"score":0-100,"confidence":0-100,"explanation":"..."}
- Reward partial correctness and synonyms. Minor typos should not penalize much.
- Write explanation in ${language === 'vi' ? 'Vietnamese' : 'English'}.`

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          temperature: 0.2,
          max_tokens: 250,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt ? `${prompt}\n\n${aiPrompt}` : aiPrompt }
          ]
        })
      })

      if (res.ok) {
        const data = await res.json()
        const content = data?.choices?.[0]?.message?.content || ''
        try {
          const parsed = JSON.parse(content)
          // Basic sanitize
          const score = Math.min(100, Math.max(0, Number(parsed.score) || 0))
          const confidence = Math.min(100, Math.max(0, Number(parsed.confidence) || 0))
          const explanation = String(parsed.explanation || '').slice(0, 500)
          return jsonResponse(200, { score, confidence, explanation })
        } catch {
          // fallthrough to heuristic
        }
      }
    }

    // Heuristic fallback: similarity + keywords
    let best = 0
    for (const exp of cleanedExpected) {
      const sim = similarityPct(cleanedAnswer.toLowerCase(), exp.toLowerCase())
      const key = keywordScore(cleanedAnswer.toLowerCase(), exp.toLowerCase())
      best = Math.max(best, Math.max(sim, key))
    }

    const score = Math.round(best)
    const confidence = Math.min(95, Math.round(best + 5))
    const explanation = score >= minScore
      ? 'Your answer is sufficiently similar to expected answers.'
      : 'Your answer does not sufficiently match expected answers.'

    return jsonResponse(200, { score, confidence, explanation })
  } catch (err) {
    return jsonResponse(500, { error: 'Internal error', detail: String(err?.message || err) })
  }
}


