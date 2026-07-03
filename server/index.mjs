import express from 'express'
import cors from 'cors'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './store.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 8787
const ANTHROPIC_VERSION = '2023-06-01'

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.static(join(__dirname, 'public')))

// ---- auth middleware ----
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const user = token && db.byToken(token)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  req.user = user
  next()
}

const publicUser = (u) => ({ id: u.id, username: u.username, token: u.token, hasKey: !!u.encKey })

app.post('/api/auth/register', (req, res) => {
  try {
    res.json(publicUser(db.register(req.body.username, req.body.password)))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.post('/api/auth/login', (req, res) => {
  try {
    res.json(publicUser(db.login(req.body.username, req.body.password)))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)))

// ---- API key ----
app.post('/api/key', auth, (req, res) => {
  db.setKey(req.user.id, req.body.key || '')
  res.json({ hasKey: db.hasKey(req.user.id) })
})
app.get('/api/key/has', auth, (req, res) => res.json({ hasKey: db.hasKey(req.user.id) }))

// ---- data sync (source of truth for all devices) ----
app.get('/api/data', auth, (req, res) => res.json(db.getData(req.user.id)))
app.put('/api/data', auth, (req, res) => res.json(db.mergeData(req.user.id, req.body || {})))
app.post('/api/data/replace', auth, (req, res) => res.json(db.replaceData(req.user.id, req.body || {})))

// ---- share links ----
app.post('/api/share', auth, (req, res) => {
  const id = db.createShare(req.user.id, req.body.chatId)
  res.json({ shareId: id, url: `/share/${id}` })
})
app.get('/api/shared/:id', (req, res) => {
  const chat = db.getShare(req.params.id)
  if (!chat) return res.status(404).json({ error: 'Not found' })
  res.json(chat)
})
app.get('/share/:id', (_req, res) => res.sendFile(join(__dirname, 'public', 'share.html')))

// ---- Anthropic streaming proxy (keeps the API key server-side) ----
app.post('/api/chat', auth, async (req, res) => {
  const key = db.getKey(req.user.id)
  if (!key) return res.status(400).json({ error: 'No API key set for this account.' })
  const body = req.body || {}

  const tools = []
  if (body.webSearch !== false) tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 8 })

  const payload = {
    model: body.model || 'claude-fable-5',
    max_tokens: Math.max(1024, body.maxTokens || 16000),
    system: body.system || undefined,
    messages: body.messages || [],
    stream: true,
    ...(tools.length ? { tools } : {}),
    ...(body.thinking ? { thinking: { type: 'adaptive', display: 'summarized' } } : {})
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify(payload)
    })
    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: errText || 'Upstream error' })
    }
    // Pass the raw SSE stream straight through to the client.
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    const reader = upstream.body.getReader()
    const dec = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(dec.decode(value, { stream: true }))
    }
    res.end()
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message })
    else res.end()
  }
})

app.listen(PORT, () => {
  console.log(`\n  Ember sync server running:  http://localhost:${PORT}`)
  console.log(`  Web app:                    http://localhost:${PORT}`)
  console.log(`  Point the desktop app's Sync settings at this URL.\n`)
})
