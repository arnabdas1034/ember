import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const USERS_FILE = join(DATA_DIR, 'users.json')
const SECRET_FILE = join(DATA_DIR, 'secret.key')

function ensure() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (!existsSync(join(DATA_DIR, 'users'))) mkdirSync(join(DATA_DIR, 'users'), { recursive: true })
  if (!existsSync(USERS_FILE)) writeFileSync(USERS_FILE, '[]')
  if (!existsSync(join(DATA_DIR, 'shares.json'))) writeFileSync(join(DATA_DIR, 'shares.json'), '{}')
}
ensure()

// Server encryption secret for API keys at rest (generated once, kept on disk).
function secret() {
  if (!existsSync(SECRET_FILE)) writeFileSync(SECRET_FILE, randomBytes(32).toString('hex'))
  return Buffer.from(readFileSync(SECRET_FILE, 'utf-8').trim(), 'hex')
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return fallback
  }
}
function writeJson(file, val) {
  writeFileSync(file, JSON.stringify(val, null, 2))
}

const users = () => readJson(USERS_FILE, [])
const saveUsers = (u) => writeJson(USERS_FILE, u)
const userFile = (id) => join(DATA_DIR, 'users', `${id}.json`)

function hash(pw, salt) {
  return scryptSync(pw, salt, 64).toString('hex')
}

export function encrypt(text) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', secret(), iv)
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':')
}
export function decrypt(blob) {
  try {
    const [iv, tag, enc] = blob.split(':')
    const d = createDecipheriv('aes-256-gcm', secret(), Buffer.from(iv, 'hex'))
    d.setAuthTag(Buffer.from(tag, 'hex'))
    return Buffer.concat([d.update(Buffer.from(enc, 'hex')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

export const db = {
  register(username, password) {
    const list = users()
    const uname = (username || '').trim()
    if (!uname || !password) throw new Error('Username and password required.')
    if (list.some((u) => u.username.toLowerCase() === uname.toLowerCase())) throw new Error('Username already taken.')
    const salt = randomBytes(16).toString('hex')
    const rec = { id: randomUUID(), username: uname, salt, passHash: hash(password, salt), token: randomBytes(24).toString('hex'), createdAt: Date.now() }
    list.push(rec)
    saveUsers(list)
    writeJson(userFile(rec.id), { settings: {}, chats: [], projects: [], skills: [] })
    return rec
  },
  login(username, password) {
    const rec = users().find((u) => u.username.toLowerCase() === (username || '').trim().toLowerCase())
    if (!rec) throw new Error('No such user.')
    const a = Buffer.from(hash(password, rec.salt), 'hex')
    const b = Buffer.from(rec.passHash, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Incorrect password.')
    return rec
  },
  byToken(token) {
    return users().find((u) => u.token === token) || null
  },
  setKey(id, key) {
    const list = users()
    const rec = list.find((u) => u.id === id)
    if (!rec) return
    rec.encKey = key ? encrypt(key) : undefined
    saveUsers(list)
  },
  getKey(id) {
    const rec = users().find((u) => u.id === id)
    return rec?.encKey ? decrypt(rec.encKey) : null
  },
  hasKey(id) {
    return !!users().find((u) => u.id === id)?.encKey
  },
  getData(id) {
    return readJson(userFile(id), { settings: {}, chats: [], projects: [], skills: [] })
  },
  // Merge incoming data using last-write-wins per chat/project/skill by updatedAt.
  mergeData(id, incoming) {
    const cur = this.getData(id)
    const mergeById = (a = [], b = [], stamp = 'updatedAt') => {
      const map = new Map(a.map((x) => [x.id, x]))
      for (const item of b) {
        const ex = map.get(item.id)
        if (!ex || (item[stamp] || 0) >= (ex[stamp] || 0)) map.set(item.id, item)
      }
      return [...map.values()]
    }
    const next = {
      settings: incoming.settings || cur.settings,
      chats: mergeById(cur.chats, incoming.chats),
      projects: mergeById(cur.projects, incoming.projects, 'createdAt'),
      skills: incoming.skills || cur.skills
    }
    writeJson(userFile(id), next)
    return next
  },
  replaceData(id, data) {
    writeJson(userFile(id), {
      settings: data.settings || {},
      chats: data.chats || [],
      projects: data.projects || [],
      skills: data.skills || []
    })
    return this.getData(id)
  },
  createShare(userId, chatId) {
    const shares = readJson(join(DATA_DIR, 'shares.json'), {})
    const shareId = randomBytes(9).toString('hex')
    shares[shareId] = { userId, chatId, createdAt: Date.now() }
    writeJson(join(DATA_DIR, 'shares.json'), shares)
    return shareId
  },
  getShare(shareId) {
    const shares = readJson(join(DATA_DIR, 'shares.json'), {})
    const s = shares[shareId]
    if (!s) return null
    const chat = this.getData(s.userId).chats.find((c) => c.id === s.chatId)
    return chat ? { title: chat.title, messages: chat.messages, createdAt: chat.createdAt } : null
  }
}
