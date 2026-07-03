import { ipcMain, dialog, nativeTheme, shell, app, type BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { store } from './store'
import { testKey, listModels, runChat, stopStream, generateTitle, cleanTranscript } from './anthropic'
import { mcp } from './mcp'
import { resolvePermission, changedFiles, revertChanges } from './agent'
import { checkForUpdates, quitAndInstall } from './updater'
import { sync } from './sync'
import { runOAuth } from './oauth'
import type { ChatRequest } from '../shared/types'

// The currently signed-in user for this window. Single-window app.
let currentUserId: string | null = null

function requireUser(): string {
  if (!currentUserId) throw new Error('Not signed in.')
  return currentUserId
}

// Wrap a handler so thrown errors return { ok:false, error } instead of rejecting.
function handle(channel: string, fn: (...args: any[]) => any) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      const data = await fn(...args)
      return { ok: true, data }
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) }
    }
  })
}

export function registerIpc(getWindow: () => BrowserWindow | null) {
  // ---- auth ----
  handle('auth:register', (username: string, password: string) => {
    const user = store.register(username, password)
    currentUserId = user.id
    return user
  })
  handle('auth:login', (username: string, password: string) => {
    const user = store.login(username, password)
    currentUserId = user.id
    return user
  })
  handle('auth:logout', async () => {
    if (currentUserId) await mcp.disconnectAll(currentUserId)
    currentUserId = null
    return true
  })
  handle('auth:usernames', () => store.listUsernames())
  handle('auth:me', () => (currentUserId ? store.getPublicUserById(currentUserId) : null))

  // ---- api key ----
  handle('key:set', (apiKey: string) => {
    store.setApiKey(requireUser(), apiKey)
    return store.hasApiKey(requireUser())
  })
  handle('key:has', () => store.hasApiKey(requireUser()))
  handle('key:test', async (apiKey?: string) => {
    const key = apiKey || store.getApiKey(requireUser())
    if (!key) return { ok: false, error: 'No API key set.' }
    return testKey(key)
  })

  // ---- models ----
  handle('models:list', async () => {
    const key = store.getApiKey(requireUser())
    return listModels(key || '')
  })

  // ---- settings ----
  handle('settings:get', () => store.getSettings(requireUser()))
  handle('settings:save', (settings: any) => store.saveSettings(requireUser(), settings))

  // ---- chats ----
  handle('chats:list', () => store.getChats(requireUser()))
  handle('chats:save', (chat: any) => store.saveChat(requireUser(), chat))
  handle('chats:delete', (chatId: string) => {
    store.deleteChat(requireUser(), chatId)
    return true
  })

  // ---- projects ----
  handle('projects:list', () => store.getProjects(requireUser()))
  handle('projects:save', (project: any) => store.saveProject(requireUser(), project))
  handle('projects:delete', (id: string) => {
    store.deleteProject(requireUser(), id)
    return true
  })

  // ---- skills ----
  handle('skills:list', () => store.getSkills(requireUser()))
  handle('skills:save', (skill: any) => store.saveSkill(requireUser(), skill))
  handle('skills:delete', (id: string) => {
    store.deleteSkill(requireUser(), id)
    return true
  })

  // ---- MCP connectors ----
  handle('mcp:get', () => store.getMcpJson(requireUser()))
  handle('mcp:set', async (json: string) => {
    const userId = requireUser()
    if (json.trim()) JSON.parse(json) // validate before saving
    store.setMcpJson(userId, json)
    await mcp.disconnectAll(userId)
    await mcp.ensureConnected(userId, json)
    return mcp.status(userId, json)
  })
  // OAuth-authorize a remote MCP connector: browser sign-in → bearer token → save.
  handle('mcp:oauth', async (opts: any) => {
    const userId = requireUser()
    const result = await runOAuth({
      authUrl: opts.authUrl,
      tokenUrl: opts.tokenUrl,
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      scope: opts.scope
    })
    const json = store.getMcpJson(userId)
    const config = json.trim() ? JSON.parse(json) : {}
    config.mcpServers = config.mcpServers || {}
    let name = opts.name || 'oauth-connector'
    let i = 2
    while (config.mcpServers[name]) name = `${opts.name}-${i++}`
    config.mcpServers[name] = { url: opts.serverUrl, headers: { Authorization: `Bearer ${result.access_token}` } }
    const next = JSON.stringify(config, null, 2)
    store.setMcpJson(userId, next)
    await mcp.disconnectAll(userId)
    await mcp.ensureConnected(userId, next)
    return mcp.status(userId, next)
  })

  handle('mcp:status', async () => {
    const userId = requireUser()
    const json = store.getMcpJson(userId)
    await mcp.ensureConnected(userId, json)
    return mcp.status(userId, json)
  })

  // ---- data import/export ----
  handle('data:export', () => store.exportData(requireUser()))
  handle('data:import', (payload: any) => store.importData(requireUser(), payload))
  handle('data:clear', () => {
    store.clearData(requireUser())
    return true
  })

  // ---- title generation ----
  handle('chat:title', async (firstUserText: string) => {
    const key = store.getApiKey(requireUser())
    if (!key) return 'New chat'
    return generateTitle(key, firstUserText)
  })

  // ---- streaming chat (fire-and-forget; results come over 'stream' channel) ----
  ipcMain.handle('chat:start', async (_e, req: ChatRequest) => {
    try {
      const userId = requireUser()
      const key = store.getApiKey(userId)
      const win = getWindow()
      if (!key) {
        win?.webContents.send('stream', {
          streamId: req.streamId,
          type: 'error',
          error: 'No API key set. Add your Anthropic API key in Settings.'
        })
        return { ok: false, error: 'no-key' }
      }
      // Connect configured MCP servers before the turn (no-op if none/cached).
      await mcp.ensureConnected(userId, store.getMcpJson(userId)).catch(() => {})
      if (win) runChat(win, key, req, userId)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) }
    }
  })
  ipcMain.handle('chat:stop', async (_e, streamId: string) => {
    stopStream(streamId)
    return { ok: true }
  })

  // ---- local agent: permission responses + folder picker ----
  ipcMain.handle('permission:respond', async (_e, id: string, decision: string) => {
    resolvePermission(id, decision)
    return { ok: true }
  })
  handle('agent:pickDir', async () => {
    const win = getWindow()
    if (!win) return null
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    return res.filePaths[0] || null
  })

  // ---- Cowork checkpoints: list / revert files the agent changed ----
  handle('agent:changedFiles', (workdir: string) => (workdir ? changedFiles(workdir) : []))
  handle('agent:revert', (workdir: string) => (workdir ? revertChanges(workdir) : 0))

  // ---- persistent permission rules (view / revoke) ----
  handle('perms:list', () => store.listPermissionRules(requireUser()))
  handle('perms:revoke', (workdir: string, command: string | null) => {
    store.revokePermission(requireUser(), workdir, command)
    return store.listPermissionRules(requireUser())
  })

  // ---- voice: tidy a raw transcript into a clean prompt (uses cheap model) ----
  handle('voice:clean', async (raw: string) => {
    const key = store.getApiKey(requireUser())
    if (!key) return raw
    return cleanTranscript(key, raw)
  })

  // ---- native window chrome theme ----
  ipcMain.handle('ui:theme', (_e, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme
    return { ok: true }
  })

  // ---- file picker for attachments ----
  handle('files:pick', async () => {
    const win = getWindow()
    if (!win) return []
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Supported', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'md', 'json', 'js', 'ts', 'py', 'csv'] }
      ]
    })
    return res.filePaths
  })

  // ---- file outputs: reveal an agent-created file, or save text/code to disk ----
  handle('files:reveal', (absPath: string) => {
    shell.showItemInFolder(absPath)
    return true
  })
  handle('files:open', async (absPath: string) => {
    const err = await shell.openPath(absPath)
    if (err) throw new Error(err)
    return true
  })
  handle('files:saveText', async (defaultName: string, content: string) => {
    const win = getWindow()
    const res = await dialog.showSaveDialog(win!, {
      defaultPath: join(app.getPath('downloads'), defaultName || 'ember-output.txt')
    })
    if (res.canceled || !res.filePath) return null
    writeFileSync(res.filePath, content)
    return res.filePath
  })

  // ---- cross-device sync ----
  handle('sync:status', () => sync.status(requireUser()))
  handle('sync:connect', (url: string, username: string, password: string, register: boolean) =>
    sync.connect(requireUser(), url, username, password, register)
  )
  handle('sync:now', () => sync.now(requireUser()))
  handle('sync:disconnect', () => sync.disconnect(requireUser()))

  // ---- app updates ----
  handle('updates:check', () => checkForUpdates(getWindow(), true))
  ipcMain.handle('updates:restart', () => {
    quitAndInstall()
    return { ok: true }
  })
}
