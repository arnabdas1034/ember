import { contextBridge, ipcRenderer } from 'electron'
import type { ChatRequest, StreamEvent } from '../shared/types'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function invoke<T>(channel: string, ...args: any[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as Result<T>
  if (!res || res.ok === false) throw new Error((res as any)?.error || 'Request failed')
  return res.data
}

const api = {
  auth: {
    register: (u: string, p: string) => invoke('auth:register', u, p),
    login: (u: string, p: string) => invoke('auth:login', u, p),
    logout: () => invoke('auth:logout'),
    usernames: () => invoke<string[]>('auth:usernames'),
    me: () => invoke('auth:me')
  },
  key: {
    set: (k: string) => invoke<boolean>('key:set', k),
    has: () => invoke<boolean>('key:has'),
    test: (k?: string) => ipcRenderer.invoke('key:test', k) // returns {ok,error} directly
  },
  models: {
    list: () => invoke('models:list')
  },
  settings: {
    get: () => invoke('settings:get'),
    save: (s: any) => invoke('settings:save', s)
  },
  chats: {
    list: () => invoke('chats:list'),
    save: (c: any) => invoke('chats:save', c),
    delete: (id: string) => invoke('chats:delete', id)
  },
  projects: {
    list: () => invoke('projects:list'),
    save: (p: any) => invoke('projects:save', p),
    delete: (id: string) => invoke('projects:delete', id)
  },
  skills: {
    list: () => invoke('skills:list'),
    save: (s: any) => invoke('skills:save', s),
    delete: (id: string) => invoke('skills:delete', id)
  },
  mcp: {
    get: () => invoke<string>('mcp:get'),
    set: (json: string) => invoke('mcp:set', json),
    status: () => invoke('mcp:status')
  },
  sync: {
    status: () => invoke<{ connected: boolean; url?: string; username?: string }>('sync:status'),
    connect: (url: string, username: string, password: string, register: boolean) =>
      invoke<{ connected: boolean; username: string; url: string }>('sync:connect', url, username, password, register),
    now: () => invoke<{ ok: boolean; chats: number; projects: number; at: number }>('sync:now'),
    disconnect: () => invoke('sync:disconnect')
  },
  data: {
    export: () => invoke('data:export'),
    import: (p: any) => invoke('data:import', p),
    clear: () => invoke('data:clear')
  },
  chat: {
    title: (t: string) => invoke<string>('chat:title', t),
    start: (req: ChatRequest) => ipcRenderer.invoke('chat:start', req),
    stop: (streamId: string) => ipcRenderer.invoke('chat:stop', streamId),
    onEvent: (cb: (ev: StreamEvent) => void) => {
      const listener = (_e: unknown, ev: StreamEvent) => cb(ev)
      ipcRenderer.on('stream', listener)
      return () => ipcRenderer.removeListener('stream', listener)
    }
  },
  files: {
    pick: () => invoke<string[]>('files:pick'),
    reveal: (absPath: string) => invoke<boolean>('files:reveal', absPath),
    open: (absPath: string) => invoke<boolean>('files:open', absPath),
    saveText: (defaultName: string, content: string) => invoke<string | null>('files:saveText', defaultName, content)
  },
  updates: {
    check: () => invoke<{ status: string; version?: string; error?: string }>('updates:check'),
    restart: () => ipcRenderer.invoke('updates:restart'),
    onAvailable: (cb: (info: { version?: string }) => void) => {
      const l = (_e: unknown, info: any) => cb(info)
      ipcRenderer.on('app:update-available', l)
      return () => ipcRenderer.removeListener('app:update-available', l)
    },
    onProgress: (cb: (info: { percent: number }) => void) => {
      const l = (_e: unknown, info: any) => cb(info)
      ipcRenderer.on('app:update-progress', l)
      return () => ipcRenderer.removeListener('app:update-progress', l)
    }
  },
  agent: {
    pickDir: () => invoke<string | null>('agent:pickDir'),
    respondPermission: (id: string, decision: 'allow_once' | 'allow_session' | 'allow_always' | 'deny') =>
      ipcRenderer.invoke('permission:respond', id, decision),
    listPermissions: () => invoke<{ workdir: string; command: string | null; editsAlways: boolean }[]>('perms:list'),
    revokePermission: (workdir: string, command: string | null) =>
      invoke<{ workdir: string; command: string | null; editsAlways: boolean }[]>('perms:revoke', workdir, command),
    changedFiles: (workdir: string) => invoke<string[]>('agent:changedFiles', workdir),
    revert: (workdir: string) => invoke<number>('agent:revert', workdir)
  },
  voice: {
    clean: (raw: string) => invoke<string>('voice:clean', raw)
  },
  onUpdateReady: (cb: () => void) => {
    ipcRenderer.on('app:update-ready', cb)
  },
  ui: {
    setTheme: (theme: 'light' | 'dark' | 'system') => ipcRenderer.invoke('ui:theme', theme)
  },
  quick: {
    capture: () => ipcRenderer.invoke('quick:capture') as Promise<{ data: string; mediaType: string } | null>,
    submit: (payload: { text: string; image?: { data: string; mediaType: string } | null }) =>
      ipcRenderer.invoke('quick:submit', payload),
    close: () => ipcRenderer.invoke('quick:close'),
    onFocus: (cb: () => void) => {
      ipcRenderer.on('quick:focus', cb)
      return () => ipcRenderer.removeListener('quick:focus', cb)
    },
    onMessage: (cb: (payload: { text: string; image?: { data: string; mediaType: string } | null }) => void) => {
      const l = (_e: unknown, p: any) => cb(p)
      ipcRenderer.on('quick:message', l)
      return () => ipcRenderer.removeListener('quick:message', l)
    }
  }
}

contextBridge.exposeInMainWorld('ember', api)

export type EmberApi = typeof api
