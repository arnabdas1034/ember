import { app, safeStorage } from 'electron'
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type Chat, type Project, type Settings, type Skill } from '../shared/types'

interface UserRecord {
  id: string
  username: string
  salt: string
  passHash: string
  encKey?: string // base64 of safeStorage-encrypted API key
  createdAt: number
}

interface PermEntry {
  commands: string[]
  editsAlways: boolean
}

interface UserData {
  settings: Settings
  chats: Chat[]
  projects: Project[]
  skills: Skill[]
  mcpJson?: string
  permissions?: Record<string, PermEntry> // keyed by working directory
  sync?: { url: string; token: string; username: string } | null
}

let baseDir = ''
let usersFile = ''

function ensureDirs() {
  baseDir = join(app.getPath('userData'), 'ember-data')
  usersFile = join(baseDir, 'users.json')
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true })
  const dataDir = join(baseDir, 'users')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(usersFile)) writeFileSync(usersFile, '[]')
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as T
  } catch {
    return fallback
  }
}
function writeJson(file: string, value: unknown) {
  writeFileSync(file, JSON.stringify(value, null, 2))
}

function userDataFile(userId: string) {
  return join(baseDir, 'users', `${userId}.json`)
}

function loadUsers(): UserRecord[] {
  return readJson<UserRecord[]>(usersFile, [])
}
function saveUsers(users: UserRecord[]) {
  writeJson(usersFile, users)
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

export const store = {
  init() {
    ensureDirs()
    const seededDefaultSkills = this.buildStarterSkills()
    // (starter skills are attached per-user on registration)
    void seededDefaultSkills
  },

  // ---------- auth ----------
  register(username: string, password: string) {
    const users = loadUsers()
    const uname = username.trim()
    if (!uname || !password) throw new Error('Username and password are required.')
    if (users.some((u) => u.username.toLowerCase() === uname.toLowerCase())) {
      throw new Error('That username is already taken.')
    }
    const salt = randomBytes(16).toString('hex')
    const record: UserRecord = {
      id: randomUUID(),
      username: uname,
      salt,
      passHash: hashPassword(password, salt),
      createdAt: Date.now()
    }
    users.push(record)
    saveUsers(users)
    // seed default data for the new user
    const data: UserData = {
      settings: { ...DEFAULT_SETTINGS },
      chats: [],
      projects: [],
      skills: this.buildStarterSkills()
    }
    writeJson(userDataFile(record.id), data)
    return this.publicUser(record)
  },

  login(username: string, password: string) {
    const users = loadUsers()
    const record = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())
    if (!record) throw new Error('No account with that username.')
    const attempt = Buffer.from(hashPassword(password, record.salt), 'hex')
    const known = Buffer.from(record.passHash, 'hex')
    if (attempt.length !== known.length || !timingSafeEqual(attempt, known)) {
      throw new Error('Incorrect password.')
    }
    return this.publicUser(record)
  },

  listUsernames(): string[] {
    return loadUsers().map((u) => u.username)
  },

  publicUser(record: UserRecord) {
    return {
      id: record.id,
      username: record.username,
      createdAt: record.createdAt,
      hasKey: !!record.encKey
    }
  },

  getPublicUserById(userId: string) {
    const record = loadUsers().find((u) => u.id === userId)
    return record ? this.publicUser(record) : null
  },

  // ---------- api key (encrypted per user) ----------
  setApiKey(userId: string, apiKey: string) {
    const users = loadUsers()
    const record = users.find((u) => u.id === userId)
    if (!record) throw new Error('User not found.')
    if (!apiKey) {
      delete record.encKey
    } else if (safeStorage.isEncryptionAvailable()) {
      record.encKey = safeStorage.encryptString(apiKey).toString('base64')
    } else {
      // Fallback: store lightly-obfuscated (OS keychain unavailable).
      record.encKey = 'plain:' + Buffer.from(apiKey).toString('base64')
    }
    saveUsers(users)
  },

  getApiKey(userId: string): string | null {
    const record = loadUsers().find((u) => u.id === userId)
    if (!record?.encKey) return null
    if (record.encKey.startsWith('plain:')) {
      return Buffer.from(record.encKey.slice(6), 'base64').toString('utf-8')
    }
    try {
      return safeStorage.decryptString(Buffer.from(record.encKey, 'base64'))
    } catch {
      return null
    }
  },

  hasApiKey(userId: string): boolean {
    return !!loadUsers().find((u) => u.id === userId)?.encKey
  },

  // ---------- per-user data ----------
  data(userId: string): UserData {
    return readJson<UserData>(userDataFile(userId), {
      settings: { ...DEFAULT_SETTINGS },
      chats: [],
      projects: [],
      skills: this.buildStarterSkills()
    })
  },
  saveData(userId: string, data: UserData) {
    writeJson(userDataFile(userId), data)
  },

  getSettings(userId: string): Settings {
    const saved = this.data(userId).settings || ({} as Settings)
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      tools: { ...DEFAULT_SETTINGS.tools, ...(saved as any).tools }
    }
  },

  getSyncConfig(userId: string) {
    return this.data(userId).sync || null
  },
  setSyncConfig(userId: string, cfg: { url: string; token: string; username: string } | null) {
    const data = this.data(userId)
    data.sync = cfg
    this.saveData(userId, data)
  },

  getMcpJson(userId: string): string {
    return this.data(userId).mcpJson || ''
  },
  setMcpJson(userId: string, json: string) {
    const data = this.data(userId)
    data.mcpJson = json
    this.saveData(userId, data)
  },

  // ---------- persistent agent permissions (per working directory) ----------
  getPermissions(userId: string): Record<string, PermEntry> {
    return this.data(userId).permissions || {}
  },
  _savePermissions(userId: string, perms: Record<string, PermEntry>) {
    const data = this.data(userId)
    data.permissions = perms
    this.saveData(userId, data)
  },
  // A stored command rule is a prefix: it matches the exact command or any command
  // that starts with it followed by a space (so "npm test" covers "npm test --watch").
  isCommandAllowed(userId: string, workdir: string, cmd: string): boolean {
    const entry = this.getPermissions(userId)[workdir]
    if (!entry) return false
    const c = (cmd || '').trim()
    return entry.commands.some((rule) => c === rule || c.startsWith(rule + ' '))
  },
  allowCommand(userId: string, workdir: string, cmd: string) {
    const perms = this.getPermissions(userId)
    const entry = perms[workdir] || { commands: [], editsAlways: false }
    const c = (cmd || '').trim()
    if (c && !entry.commands.includes(c)) entry.commands.push(c)
    perms[workdir] = entry
    this._savePermissions(userId, perms)
  },
  isEditsAlways(userId: string, workdir: string): boolean {
    return !!this.getPermissions(userId)[workdir]?.editsAlways
  },
  allowEditsAlways(userId: string, workdir: string) {
    const perms = this.getPermissions(userId)
    const entry = perms[workdir] || { commands: [], editsAlways: false }
    entry.editsAlways = true
    perms[workdir] = entry
    this._savePermissions(userId, perms)
  },
  // List rules flattened for the settings UI.
  listPermissionRules(userId: string): { workdir: string; command: string | null; editsAlways: boolean }[] {
    const perms = this.getPermissions(userId)
    const out: { workdir: string; command: string | null; editsAlways: boolean }[] = []
    for (const [workdir, entry] of Object.entries(perms)) {
      if (entry.editsAlways) out.push({ workdir, command: null, editsAlways: true })
      for (const command of entry.commands) out.push({ workdir, command, editsAlways: false })
    }
    return out
  },
  revokePermission(userId: string, workdir: string, command: string | null) {
    const perms = this.getPermissions(userId)
    const entry = perms[workdir]
    if (!entry) return
    if (command === null) {
      // null revokes the editsAlways flag; if no commands remain, drop the entry
      entry.editsAlways = false
      if (!entry.commands.length) delete perms[workdir]
    } else {
      entry.commands = entry.commands.filter((c) => c !== command)
      if (!entry.commands.length && !entry.editsAlways) delete perms[workdir]
    }
    this._savePermissions(userId, perms)
  },
  saveSettings(userId: string, settings: Settings) {
    const data = this.data(userId)
    data.settings = settings
    this.saveData(userId, data)
    return settings
  },

  getChats(userId: string): Chat[] {
    return this.data(userId).chats.sort((a, b) => b.updatedAt - a.updatedAt)
  },

  // Full-text-ish search over the user's saved conversations, for the past-chat
  // retrieval tool. Skips incognito chats. Returns ranked snippets.
  searchChats(userId: string, query: string, excludeChatId?: string, limit = 6) {
    const terms = (query || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1)
    if (!terms.length) return []
    const results: { chatId: string; title: string; when: number; score: number; snippet: string }[] = []
    for (const chat of this.data(userId).chats) {
      if (chat.incognito || chat.id === excludeChatId) continue
      const hay = chat.messages.map((m) => `${m.role}: ${m.text || ''}`).join('\n')
      const lower = hay.toLowerCase()
      let score = 0
      for (const t of terms) {
        const c = lower.split(t).length - 1
        score += c
      }
      if (chat.title && terms.some((t) => chat.title.toLowerCase().includes(t))) score += 3
      if (score <= 0) continue
      // Snippet around the first matching term
      const firstTerm = terms.find((t) => lower.includes(t))
      let snippet = hay.slice(0, 240)
      if (firstTerm) {
        const idx = lower.indexOf(firstTerm)
        snippet = hay.slice(Math.max(0, idx - 100), idx + 160).replace(/\s+/g, ' ').trim()
      }
      results.push({ chatId: chat.id, title: chat.title || 'Untitled', when: chat.updatedAt, score, snippet })
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  },
  saveChat(userId: string, chat: Chat) {
    const data = this.data(userId)
    const idx = data.chats.findIndex((c) => c.id === chat.id)
    chat.updatedAt = Date.now()
    if (idx >= 0) data.chats[idx] = chat
    else data.chats.unshift(chat)
    this.saveData(userId, data)
    return chat
  },
  deleteChat(userId: string, chatId: string) {
    const data = this.data(userId)
    data.chats = data.chats.filter((c) => c.id !== chatId)
    this.saveData(userId, data)
  },

  getProjects(userId: string): Project[] {
    return this.data(userId).projects
  },
  saveProject(userId: string, project: Project) {
    const data = this.data(userId)
    const idx = data.projects.findIndex((p) => p.id === project.id)
    if (idx >= 0) data.projects[idx] = project
    else data.projects.unshift(project)
    this.saveData(userId, data)
    return project
  },
  deleteProject(userId: string, projectId: string) {
    const data = this.data(userId)
    data.projects = data.projects.filter((p) => p.id !== projectId)
    data.chats = data.chats.map((c) => (c.projectId === projectId ? { ...c, projectId: null } : c))
    this.saveData(userId, data)
  },

  getSkills(userId: string): Skill[] {
    return this.data(userId).skills
  },
  saveSkill(userId: string, skill: Skill) {
    const data = this.data(userId)
    const idx = data.skills.findIndex((s) => s.id === skill.id)
    if (idx >= 0) data.skills[idx] = skill
    else data.skills.unshift(skill)
    this.saveData(userId, data)
    return skill
  },
  deleteSkill(userId: string, skillId: string) {
    const data = this.data(userId)
    data.skills = data.skills.filter((s) => s.id !== skillId)
    this.saveData(userId, data)
  },

  exportData(userId: string) {
    return this.data(userId)
  },
  importData(userId: string, incoming: Partial<UserData>) {
    const data = this.data(userId)
    if (incoming.chats) data.chats = incoming.chats
    if (incoming.projects) data.projects = incoming.projects
    if (incoming.skills) data.skills = incoming.skills
    if (incoming.settings) data.settings = { ...DEFAULT_SETTINGS, ...incoming.settings }
    this.saveData(userId, data)
    return data
  },
  clearData(userId: string) {
    this.saveData(userId, {
      settings: { ...DEFAULT_SETTINGS },
      chats: [],
      projects: [],
      skills: this.buildStarterSkills()
    })
  },

  buildStarterSkills(): Skill[] {
    return [
      {
        id: randomUUID(),
        name: 'Code Reviewer',
        description: 'Reviews code for correctness bugs, edge cases, and clarity.',
        instructions:
          'You are a meticulous senior engineer. When reviewing code: identify correctness bugs first, then edge cases, then readability. Cite exact lines. Give a concrete fix for each finding. Be direct and prioritise by severity.',
        enabled: true
      },
      {
        id: randomUUID(),
        name: 'Explain Like I\'m Five',
        description: 'Explains complex topics in simple, friendly language.',
        instructions:
          'Explain the topic as if to a curious beginner. Use everyday analogies, short sentences, and no jargon unless you define it immediately. End with a one-line summary.',
        enabled: false
      }
    ]
  }
}
