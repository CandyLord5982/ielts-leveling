import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev middleware to handle /api/transcribe (mirrors api/transcribe.js)
function assemblyAIPlugin() {
  return {
    name: 'assemblyai-transcribe',
    configureServer(server) {
      server.middlewares.use('/api/transcribe', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        const apiKey = process.env.ASSEMBLYAI_API_KEY
        if (!apiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'ASSEMBLYAI_API_KEY not set in .env' }))
          return
        }

        try {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const audioData = Buffer.concat(chunks)

          // Upload
          const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
            method: 'POST',
            headers: { 'Authorization': apiKey, 'Content-Type': 'application/octet-stream' },
            body: audioData
          })
          if (!uploadRes.ok) throw new Error('Upload failed')
          const { upload_url } = await uploadRes.json()

          // Create transcript
          const txRes = await fetch('https://api.assemblyai.com/v2/transcript', {
            method: 'POST',
            headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_url: upload_url, language_code: 'en_us' })
          })
          if (!txRes.ok) throw new Error('Transcript creation failed')
          const { id } = await txRes.json()

          // Poll
          for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 1000))
            const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
              headers: { 'Authorization': apiKey }
            })
            const result = await pollRes.json()
            if (result.status === 'completed') {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                success: true,
                text: result.text || '',
                confidence: result.confidence || 0,
                words: (result.words || []).map(w => ({ text: w.text, confidence: w.confidence }))
              }))
              return
            }
            if (result.status === 'error') throw new Error(result.error || 'Transcription failed')
          }
          throw new Error('Transcription timed out')
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    }
  }
}

// Local dev middleware for /api/transcribe-video (accepts JSON { url } instead of raw bytes)
function transcribeVideoPlugin() {
  return {
    name: 'assemblyai-transcribe-video',
    configureServer(server) {
      server.middlewares.use('/api/transcribe-video', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        const apiKey = process.env.ASSEMBLYAI_API_KEY || process.env.VITE_ASSEMBLYAI_API_KEY
        if (!apiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'ASSEMBLYAI_API_KEY not set in .env' }))
          return
        }

        try {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const body = JSON.parse(Buffer.concat(chunks).toString())
          const { url } = body

          if (!url) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing "url" field' }))
            return
          }

          // Create transcript directly from URL
          const txRes = await fetch('https://api.assemblyai.com/v2/transcript', {
            method: 'POST',
            headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_url: url, language_code: 'en_us' })
          })
          if (!txRes.ok) throw new Error('Transcript creation failed')
          const { id } = await txRes.json()

          // Poll with longer timeout for video
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000))
            const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
              headers: { 'Authorization': apiKey }
            })
            const result = await pollRes.json()
            if (result.status === 'completed') {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                success: true,
                text: result.text || '',
                confidence: result.confidence || 0,
                words: (result.words || []).map(w => ({ text: w.text, confidence: w.confidence }))
              }))
              return
            }
            if (result.status === 'error') throw new Error(result.error || 'Transcription failed')
          }
          throw new Error('Transcription timed out')
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    }
  }
}

// Local dev middleware for /api/ai-analyze (mirrors api/ai-analyze.js)
function aiAnalyzePlugin() {
  return {
    name: 'ai-analyze-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai-analyze', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        const apiKey = process.env.GROQ_API_KEY
        if (!apiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'GROQ_API_KEY not set in .env' }))
          return
        }
        try {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const { messages, max_tokens = 2000, temperature = 0.3 } = JSON.parse(Buffer.concat(chunks).toString())

          const reqBody = JSON.stringify({ model: 'openai/gpt-oss-120b', messages, max_tokens, temperature })
          let apiRes
          for (let attempt = 0; attempt < 3; attempt++) {
            apiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: reqBody
            })
            if (apiRes.ok || (apiRes.status !== 429 && apiRes.status !== 500)) break
            await new Promise(r => setTimeout(r, (attempt + 1) * 2000))
          }
          if (!apiRes.ok) {
            const errText = await apiRes.text()
            res.writeHead(apiRes.status, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `Groq error: ${apiRes.status}`, detail: errText }))
            return
          }
          const data = await apiRes.json()
          const result = data.choices?.[0]?.message?.content
          if (!result) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'No response from AI' }))
            return
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ result }))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    }
  }
}

// Local dev middleware for /api/pet-chat (proxies Groq API for pet chat/tutor)
function petChatPlugin() {
  return {
    name: 'pet-chat-proxy',
    configureServer(server) {
      server.middlewares.use('/api/pet-chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        const apiKey = process.env.GROQ_API_KEY
        if (!apiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'GROQ_API_KEY not set in .env' }))
          return
        }
        try {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const { messages, model = 'openai/gpt-oss-120b', max_tokens = 500, temperature = 0.7 } = JSON.parse(Buffer.concat(chunks).toString())

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
            res.writeHead(apiRes.status, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `Groq error: ${apiRes.status}`, detail: errText }))
            return
          }

          const data = await apiRes.json()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(data))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env so ASSEMBLYAI_API_KEY is available in process.env
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
  plugins: [react(), assemblyAIPlugin(), transcribeVideoPlugin(), aiAnalyzePlugin(), petChatPlugin()],
  server: {
    port: 3001,
    host: true,
    proxy: {
      '/api/audio': {
        target: 'https://xpclass.vn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/audio/, '')
      },
      '/proxy-image': {
        target: 'https://xpclass.vn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy-image/, '')
      },
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
  }
})
