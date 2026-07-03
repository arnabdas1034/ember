import { store } from './store'

// Desktop sync client. Talks to a self-hosted Ember server so this machine's
// chats/projects/skills/settings stay in step with the web app and other devices.
// Push local → server merges (last-write-wins by updatedAt) → pull merged → save.

function trimUrl(url: string): string {
  return (url || '').replace(/\/+$/, '')
}

async function serverFetch(url: string, path: string, opts: any = {}, token?: string) {
  const res = await fetch(trimUrl(url) + path, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {})
    }
  })
  const text = await res.text()
  let body: any = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { error: text }
  }
  if (!res.ok) throw new Error(body.error || `Server error ${res.status}`)
  return body
}

export const sync = {
  async connect(userId: string, url: string, username: string, password: string, register: boolean) {
    const path = register ? '/api/auth/register' : '/api/auth/login'
    const acct = await serverFetch(url, path, { method: 'POST', body: JSON.stringify({ username, password }) })
    store.setSyncConfig(userId, { url: trimUrl(url), token: acct.token, username: acct.username })
    // Push the account's API key up so the web app can chat too (encrypted server-side).
    const key = store.getApiKey(userId)
    if (key) {
      await serverFetch(url, '/api/key', { method: 'POST', body: JSON.stringify({ key }) }, acct.token).catch(() => {})
    }
    return { connected: true, username: acct.username, url: trimUrl(url) }
  },

  status(userId: string) {
    const cfg = store.getSyncConfig(userId)
    return cfg ? { connected: true, url: cfg.url, username: cfg.username } : { connected: false }
  },

  disconnect(userId: string) {
    store.setSyncConfig(userId, null)
    return { connected: false }
  },

  async now(userId: string) {
    const cfg = store.getSyncConfig(userId)
    if (!cfg) throw new Error('Not connected to a sync server.')
    const local = store.exportData(userId)
    // Push local (server merges by updatedAt), then pull the merged result back.
    await serverFetch(cfg.url, '/api/data', { method: 'PUT', body: JSON.stringify(local) }, cfg.token)
    const merged = await serverFetch(cfg.url, '/api/data', { method: 'GET' }, cfg.token)
    store.importData(userId, merged)
    return {
      ok: true,
      chats: (merged.chats || []).length,
      projects: (merged.projects || []).length,
      at: Date.now()
    }
  }
}
