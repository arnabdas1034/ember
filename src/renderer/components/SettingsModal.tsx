import React, { useEffect, useState } from 'react'
import { useStore } from '../store'
import { ember } from '../api'
import { X, Gear, Spark, Layers, File as FileIcon, Sun, Moon } from './Icons'
import { BUILTIN_STYLES, type Settings } from '@shared/types'
import { CONNECTORS, buildServerConfig, type ConnectorDef } from '../lib/connectors'

type Tab = 'key' | 'general' | 'instructions' | 'tools' | 'connectors' | 'sync' | 'data'

export function SettingsModal() {
  const { settings, saveSettings, setShowSettings, hasKey, setKey, models } = useStore()
  const [tab, setTab] = useState<Tab>(hasKey ? 'general' : 'key')
  const [local, setLocal] = useState<Settings>(settings)

  useEffect(() => setLocal(settings), [settings])

  const patch = (p: Partial<Settings>) => {
    const next = { ...local, ...p }
    setLocal(next)
    saveSettings(next)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-6" onClick={() => setShowSettings(false)}>
      <div
        className="bg-cream-panel rounded-2xl shadow-2xl w-full max-w-3xl h-[640px] flex overflow-hidden fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-48 shrink-0 bg-cream-sunk border-r border-line p-3">
          <div className="flex items-center gap-2 px-2 py-2 mb-2">
            <Gear size={17} className="text-clay" />
            <span className="font-serif text-lg">Settings</span>
          </div>
          {(
            [
              ['key', 'API Key'],
              ['general', 'General'],
              ['instructions', 'Instructions'],
              ['tools', 'Tools'],
              ['connectors', 'Connectors'],
              ['sync', 'Sync'],
              ['data', 'Data']
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
                tab === id ? 'bg-cream-panel text-ink font-medium shadow-sm' : 'text-ink-soft hover:bg-cream-panel/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-12 flex items-center justify-end px-4">
            <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-cream-sunk text-ink-soft">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-8 pb-8">
            {tab === 'key' && <KeySection hasKey={hasKey} setKey={setKey} />}
            {tab === 'general' && <GeneralSection local={local} patch={patch} models={models} />}
            {tab === 'instructions' && <InstructionsSection local={local} patch={patch} />}
            {tab === 'tools' && <ToolsSection local={local} patch={patch} />}
            {tab === 'connectors' && <ConnectorsSection />}
            {tab === 'sync' && <SyncSection />}
            {tab === 'data' && <DataSection />}
          </div>
        </div>
      </div>
    </div>
  )
}

function KeySection({ hasKey, setKey }: { hasKey: boolean; setKey: (k: string) => Promise<void> }) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [msg, setMsg] = useState('')

  const test = async () => {
    setStatus('testing')
    const res: any = await ember.key.test(value || undefined)
    if (res?.ok) {
      setStatus('ok')
      setMsg('Key is valid.')
    } else {
      setStatus('fail')
      setMsg(res?.error || 'Key rejected.')
    }
  }

  const save = async () => {
    if (!value.trim()) return
    await setKey(value.trim())
    setValue('')
    setStatus('ok')
    setMsg('Saved and encrypted on this device.')
  }

  return (
    <div>
      <h2 className="font-serif text-2xl mb-1">Anthropic API Key</h2>
      <p className="text-sm text-ink-faint mb-6">
        This key is the fuel for Ember. It is encrypted with your operating system keychain and never leaves this
        device. Get one at <span className="text-clay">console.anthropic.com</span>.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${hasKey ? 'bg-green-500' : 'bg-ink-faint/50'}`} />
        <span className="text-sm text-ink-soft">{hasKey ? 'A key is currently saved.' : 'No key saved yet.'}</span>
      </div>

      <label className="block text-xs font-medium text-ink-soft mb-1.5">
        {hasKey ? 'Replace key' : 'Paste key'}
      </label>
      <input
        type="password"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setStatus('idle')
        }}
        placeholder="sk-ant-..."
        className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-cream text-sm font-mono outline-none focus:border-clay/60"
      />

      <div className="flex items-center gap-2 mt-4">
        <button onClick={save} disabled={!value.trim()} className="px-4 py-2 rounded-xl bg-clay text-white text-sm font-medium hover:bg-clay-dark disabled:opacity-40">
          Save key
        </button>
        <button onClick={test} disabled={status === 'testing' || (!value.trim() && !hasKey)} className="px-4 py-2 rounded-xl border border-line text-sm hover:bg-cream-sunk">
          {status === 'testing' ? 'Testing…' : 'Test key'}
        </button>
        {status === 'ok' && <span className="text-sm text-green-600">✓ {msg}</span>}
        {status === 'fail' && <span className="text-sm text-red-600">✕ {msg}</span>}
      </div>
    </div>
  )
}

function GeneralSection({ local, patch, models }: { local: Settings; patch: (p: Partial<Settings>) => void; models: any[] }) {
  return (
    <div>
      <h2 className="font-serif text-2xl mb-6">General</h2>

      <Field label="Theme">
        <div className="flex gap-1 p-1 bg-cream-sunk rounded-xl w-fit">
          {(
            [
              ['light', 'Light', <Sun key="s" size={14} />],
              ['dark', 'Dark', <Moon key="m" size={14} />],
              ['system', 'System', null]
            ] as [any, string, any][]
          ).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => patch({ theme: id })}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm transition-colors ${
                local.theme === id ? 'bg-cream-panel text-ink shadow-sm font-medium' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Default model">
        <select value={local.defaultModel} onChange={(e) => patch({ defaultModel: e.target.value })} className="input">
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
          {!models.some((m) => m.id === local.defaultModel) && <option value={local.defaultModel}>{local.defaultModel}</option>}
        </select>
      </Field>

      <Field label="Reasoning effort" hint="Higher effort = deeper thinking, more tokens.">
        <select value={local.effort} onChange={(e) => patch({ effort: e.target.value as any })} className="input">
          {['low', 'medium', 'high', 'xhigh', 'max'].map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </Field>

      <Field label={`Max response tokens (${local.maxTokens.toLocaleString()})`}>
        <input
          type="range"
          min={4000}
          max={128000}
          step={4000}
          value={local.maxTokens}
          onChange={(e) => patch({ maxTokens: Number(e.target.value) })}
          className="w-full accent-clay"
        />
      </Field>

      <Field label="Extended thinking">
        <ToggleSwitch on={local.thinking} onClick={() => patch({ thinking: !local.thinking })} />
      </Field>

      <Field label={`Font size (${local.fontSize}px)`}>
        <input
          type="range"
          min={13}
          max={20}
          value={local.fontSize}
          onChange={(e) => patch({ fontSize: Number(e.target.value) })}
          className="w-full accent-clay"
        />
      </Field>

      <StylesField local={local} patch={patch} />
      <UpdatesRow />

      <style>{`.input{width:100%;padding:9px 12px;border-radius:10px;border:1px solid #E4E1D6;background:rgb(var(--cream));font-size:14px;outline:none}`}</style>
    </div>
  )
}

function StylesField({ local, patch }: { local: Settings; patch: (p: Partial<Settings>) => void }) {
  const builtinIds = new Set(BUILTIN_STYLES.map((s) => s.id))
  const all = [...BUILTIN_STYLES, ...(local.customStyles || [])]
  const [name, setName] = useState('')
  const [instr, setInstr] = useState('')
  const addStyle = () => {
    if (!name.trim() || !instr.trim()) return
    const id = 'custom-' + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.abs(hash(instr)).toString(36).slice(0, 4)
    patch({ customStyles: [...(local.customStyles || []), { id, name: name.trim(), instructions: instr.trim() }], responseStyle: id })
    setName('')
    setInstr('')
  }
  const removeStyle = (id: string) =>
    patch({
      customStyles: (local.customStyles || []).filter((s) => s.id !== id),
      responseStyle: local.responseStyle === id ? 'normal' : local.responseStyle
    })
  return (
    <Field label="Response style" hint="How Claude writes its answers. Applies to every chat.">
      <div className="flex flex-wrap gap-2 mb-2">
        {all.map((s) => (
          <span key={s.id} className={`inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg text-sm border ${local.responseStyle === s.id ? 'border-clay bg-clay/10 text-clay' : 'border-line text-ink-soft'}`}>
            <button onClick={() => patch({ responseStyle: s.id })}>{s.name}</button>
            {!builtinIds.has(s.id) && (
              <button onClick={() => removeStyle(s.id)} className="text-ink-faint hover:text-red-500">
                <X size={12} />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="space-y-2 border border-line rounded-xl p-3 bg-cream-panel">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Custom style name (e.g. Bullet points only)" className="input" />
        <textarea value={instr} onChange={(e) => setInstr(e.target.value)} rows={2} placeholder="Instructions, e.g. Always answer as a bulleted list. No paragraphs." className="input" style={{ resize: 'none' }} />
        <button onClick={addStyle} disabled={!name.trim() || !instr.trim()} className="px-3 py-1.5 rounded-lg bg-clay text-white text-sm font-medium hover:bg-clay-dark disabled:opacity-40">
          Add style
        </button>
      </div>
    </Field>
  )
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i)
  return h
}

function UpdatesRow() {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const check = async () => {
    setBusy(true)
    setStatus('Checking…')
    try {
      const r = await ember.updates.check()
      setStatus(
        r.status === 'available'
          ? `Update ${r.version} available — downloading…`
          : r.status === 'current'
            ? `You're on the latest version (${r.version}).`
            : r.status === 'dev'
              ? 'Updates apply to installed builds only (running in dev).'
              : r.error || 'No update feed configured yet.'
      )
    } catch (e: any) {
      setStatus(e?.message || 'Update check failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Field label="App updates" hint="Ember checks your GitHub Releases feed for new versions.">
      <div className="flex items-center gap-3">
        <button onClick={check} disabled={busy} className="px-4 py-2 rounded-xl border border-line text-sm hover:bg-cream-sunk disabled:opacity-50">
          Check for updates
        </button>
        {status && <span className="text-sm text-ink-soft">{status}</span>}
      </div>
    </Field>
  )
}

function InstructionsSection({ local, patch }: { local: Settings; patch: (p: Partial<Settings>) => void }) {
  const [text, setText] = useState(local.personalInstructions)
  useEffect(() => setText(local.personalInstructions), [local.personalInstructions])
  return (
    <div>
      <h2 className="font-serif text-2xl mb-1">Personal instructions</h2>
      <p className="text-sm text-ink-faint mb-5">
        Applied as a system prompt to every conversation. Tell Ember how you'd like it to respond, who you are, or any
        standing preferences.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => patch({ personalInstructions: text })}
        rows={12}
        placeholder="e.g. I'm a software engineer. Be concise and prefer code examples in TypeScript…"
        className="w-full px-4 py-3 rounded-xl border border-line bg-cream text-sm leading-relaxed outline-none focus:border-clay/60 resize-none"
      />
    </div>
  )
}

function ToolsSection({ local, patch }: { local: Settings; patch: (p: Partial<Settings>) => void }) {
  const setTool = (k: 'webSearch' | 'webFetch' | 'codeExecution' | 'research' | 'chatSearch', v: boolean) =>
    patch({ tools: { ...local.tools, [k]: v } })
  return (
    <div>
      <h2 className="font-serif text-2xl mb-1">Tools & abilities</h2>
      <p className="text-sm text-ink-faint mb-6">
        These run server-side on Anthropic's infrastructure via your key — no extra setup needed.
      </p>
      <ToolRow
        title="Web search"
        desc="Let Claude search the live web and cite sources (research)."
        on={local.tools.webSearch}
        onClick={() => setTool('webSearch', !local.tools.webSearch)}
      />
      <ToolRow
        title="Web fetch"
        desc="Let Claude read the full content of specific URLs."
        on={local.tools.webFetch}
        onClick={() => setTool('webFetch', !local.tools.webFetch)}
      />
      <ToolRow
        title="Code execution (Cowork)"
        desc="Give Claude a sandboxed environment to run code, analyse files and build things."
        on={local.tools.codeExecution}
        onClick={() => setTool('codeExecution', !local.tools.codeExecution)}
      />
      <ToolRow
        title="Research mode"
        desc="Exhaustive multi-step research: many searches, full-page reads, cited report."
        on={local.tools.research}
        onClick={() => setTool('research', !local.tools.research)}
      />
      <ToolRow
        title="Memory"
        desc="Claude remembers facts about you and your work across every chat."
        on={local.memory}
        onClick={() => patch({ memory: !local.memory })}
      />
      <ToolRow
        title="Search past chats"
        desc="Let Claude look through your previous conversations for relevant context."
        on={!!local.tools.chatSearch}
        onClick={() => setTool('chatSearch', !local.tools.chatSearch)}
      />
      <SavedApprovals />
    </div>
  )
}

function SavedApprovals() {
  const [rules, setRules] = useState<{ workdir: string; command: string | null; editsAlways: boolean }[]>([])
  useEffect(() => {
    ember.agent.listPermissions().then(setRules).catch(() => {})
  }, [])
  const revoke = async (workdir: string, command: string | null) => {
    const next = await ember.agent.revokePermission(workdir, command).catch(() => rules)
    setRules(next)
  }
  const shortDir = (p: string) => p.split('/').filter(Boolean).pop() || p
  if (!rules.length) return null
  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold text-ink mb-1">Saved command approvals</h3>
      <p className="text-xs text-ink-faint mb-3">
        Commands and edits you told Claude Code it can always run. Revoke any to make it ask again.
      </p>
      <div className="space-y-1.5">
        {rules.map((r, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-cream-sunk border border-line">
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-cream-panel text-ink-faint font-mono" title={r.workdir}>
              {shortDir(r.workdir)}
            </span>
            <span className="flex-1 text-sm font-mono text-ink-soft truncate">
              {r.editsAlways ? 'all file edits' : r.command}
            </span>
            <button onClick={() => revoke(r.workdir, r.command)} className="text-xs text-ink-faint hover:text-red-500">
              Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function SyncSection() {
  const { refreshAll } = useStore()
  const [status, setStatus] = useState<{ connected: boolean; url?: string; username?: string }>({ connected: false })
  const [url, setUrl] = useState('http://localhost:8787')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ember.sync.status().then(setStatus).catch(() => {})
  }, [])

  const connect = async () => {
    setBusy(true)
    setMsg('')
    try {
      const s = await ember.sync.connect(url, username, password, mode === 'register')
      setStatus({ connected: true, url: s.url, username: s.username })
      setPassword('')
      setMsg('Connected. Run a sync to push and pull your data.')
    } catch (e: any) {
      setMsg(e?.message || 'Could not connect.')
    } finally {
      setBusy(false)
    }
  }

  const syncNow = async () => {
    setBusy(true)
    setMsg('Syncing…')
    try {
      const r = await ember.sync.now()
      await refreshAll()
      setMsg(`Synced — ${r.chats} chats, ${r.projects} projects up to date on all your devices.`)
    } catch (e: any) {
      setMsg(e?.message || 'Sync failed.')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    await ember.sync.disconnect().catch(() => {})
    setStatus({ connected: false })
    setMsg('Disconnected. Your local data stays on this Mac.')
  }

  return (
    <div>
      <h2 className="font-serif text-2xl mb-1">Sync across devices</h2>
      <p className="text-sm text-ink-faint mb-5">
        Run the Ember server (in the <code className="text-xs">server/</code> folder) on a machine that stays on, then
        connect here and on the web. Your chats, projects and settings stay in step everywhere. Fully self-hosted — your
        data only ever touches your own server.
      </p>

      {status.connected ? (
        <div className="border border-line rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm">
              Connected to <span className="font-mono text-xs">{status.url}</span> as <b>{status.username}</b>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={syncNow} disabled={busy} className="px-4 py-2 rounded-xl bg-clay text-white text-sm font-medium hover:bg-clay-dark disabled:opacity-50">
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
            <button onClick={disconnect} className="px-4 py-2 rounded-xl border border-line text-sm hover:bg-cream-sunk">
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-line rounded-xl p-4 space-y-2.5">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Server URL (e.g. http://localhost:8787)" className="input" />
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Sync username" className="input" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Sync password" className="input" />
          <div className="flex items-center gap-3 pt-1">
            <button onClick={connect} disabled={busy || !username || !password} className="px-4 py-2 rounded-xl bg-clay text-white text-sm font-medium hover:bg-clay-dark disabled:opacity-50">
              {mode === 'register' ? 'Create account & connect' : 'Connect'}
            </button>
            <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="text-sm text-clay hover:underline">
              {mode === 'login' ? 'Create a new sync account' : 'I already have an account'}
            </button>
          </div>
        </div>
      )}
      {msg && <p className="text-sm text-ink-soft mt-3">{msg}</p>}
      <style>{`.input{width:100%;padding:9px 12px;border-radius:10px;border:1px solid #E4E1D6;background:rgb(var(--cream));font-size:14px;outline:none}`}</style>
    </div>
  )
}

function ConnectorDirectory({ onAdd }: { onAdd: (def: ConnectorDef, values: Record<string, string>) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [vals, setVals] = useState<Record<string, string>>({})

  const start = (def: ConnectorDef) => {
    if (!def.needs?.length) return onAdd(def, {})
    setVals({})
    setOpenId(openId === def.id ? null : def.id)
  }

  return (
    <>
    <div className="grid grid-cols-2 gap-2.5">
      {CONNECTORS.map((def) => (
        <div key={def.id} className="border border-line rounded-xl p-3.5 bg-cream-panel">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink flex items-center gap-1.5">
                {def.name}
                {def.kind === 'remote' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-clay/10 text-clay">remote</span>}
              </div>
              <div className="text-xs text-ink-faint mt-0.5 leading-snug">{def.description}</div>
            </div>
            <button onClick={() => start(def)} className="shrink-0 px-2.5 py-1 rounded-lg bg-clay text-white text-xs font-medium hover:bg-clay-dark">
              {def.needs?.length ? 'Add…' : 'Add'}
            </button>
          </div>
          {openId === def.id && def.needs && (
            <div className="mt-3 space-y-2">
              {def.needs.map((f) => (
                <input
                  key={f.key}
                  value={vals[f.key] || ''}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={`${f.label} — ${f.placeholder}`}
                  className="w-full px-3 py-1.5 rounded-lg border border-line bg-cream text-xs outline-none focus:border-clay/60"
                />
              ))}
              <button
                onClick={() => {
                  onAdd(def, vals)
                  setOpenId(null)
                }}
                className="px-3 py-1.5 rounded-lg bg-clay text-white text-xs font-medium hover:bg-clay-dark"
              >
                Connect
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
    <OAuthConnectorForm />
    </>
  )
}

function OAuthConnectorForm() {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', serverUrl: '', authUrl: '', tokenUrl: '', clientId: '', clientSecret: '', scope: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }))
  const authorize = async () => {
    setBusy(true)
    setMsg('A browser window will open — sign in, then return here.')
    try {
      await ember.mcp.oauth(f)
      setMsg(`Connected "${f.name}" via OAuth.`)
    } catch (e: any) {
      setMsg(e?.message || 'OAuth failed.')
    } finally {
      setBusy(false)
    }
  }
  const fields: [string, string, string?][] = [
    ['name', 'Connector name', 'my-drive'],
    ['serverUrl', 'MCP server URL', 'https://mcp.example.com/mcp'],
    ['authUrl', 'Authorization URL', 'https://accounts.google.com/o/oauth2/v2/auth'],
    ['tokenUrl', 'Token URL', 'https://oauth2.googleapis.com/token'],
    ['clientId', 'Client ID', 'from the provider'],
    ['clientSecret', 'Client secret (optional)', ''],
    ['scope', 'Scopes (space-separated)', 'https://www.googleapis.com/auth/drive.readonly']
  ]
  return (
    <div className="mt-4 border border-line rounded-xl p-3.5 bg-cream-panel">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-medium text-ink w-full">
        <span className="text-clay">{open ? '▾' : '▸'}</span> Connect with OAuth (Google, Slack, Notion…)
        <span className="ml-auto text-xs text-ink-faint">browser sign-in</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-ink-faint leading-snug">
            Register an OAuth app with the provider, allow redirect URI <code className="text-[11px]">http://127.0.0.1</code>{' '}
            (any loopback port), then paste its details here and authorize in your browser.
          </p>
          {fields.map(([k, label, ph]) => (
            <input
              key={k}
              value={(f as any)[k]}
              onChange={(e) => set(k, e.target.value)}
              placeholder={`${label}${ph ? ` — ${ph}` : ''}`}
              className="w-full px-3 py-1.5 rounded-lg border border-line bg-cream text-xs outline-none focus:border-clay/60"
            />
          ))}
          <button
            onClick={authorize}
            disabled={busy || !f.name || !f.serverUrl || !f.authUrl || !f.tokenUrl || !f.clientId}
            className="px-3 py-1.5 rounded-lg bg-clay text-white text-xs font-medium hover:bg-clay-dark disabled:opacity-50"
          >
            {busy ? 'Waiting for sign-in…' : 'Authorize in browser'}
          </button>
          {msg && <p className="text-xs text-ink-soft">{msg}</p>}
        </div>
      )}
    </div>
  )
}

function ConnectorsSection() {
  const [json, setJson] = useState('')
  const [status, setStatus] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ember.mcp.get().then((j) => setJson(j || '')).catch(() => {})
    ember.mcp.status().then((s: any) => setStatus(s)).catch(() => {})
  }, [])

  const save = async () => {
    setBusy(true)
    setMsg('')
    try {
      const s: any = await ember.mcp.set(json)
      setStatus(s)
      setMsg('Saved. Servers reconnected.')
    } catch (e: any) {
      setMsg(e?.message || 'Invalid config.')
    } finally {
      setBusy(false)
    }
  }

  const placeholder = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/you/Desktop"]
    }
  }
}`

  // Merge a directory connector into the config JSON and save immediately.
  const addConnector = async (def: ConnectorDef, values: Record<string, string>) => {
    let config: any = {}
    try {
      config = json.trim() ? JSON.parse(json) : {}
    } catch {
      setMsg('Fix the JSON below before adding a connector.')
      return
    }
    config.mcpServers = config.mcpServers || {}
    let name = def.id
    let i = 2
    while (config.mcpServers[name]) name = `${def.id}-${i++}`
    config.mcpServers[name] = buildServerConfig(def, values)
    const next = JSON.stringify(config, null, 2)
    setJson(next)
    setBusy(true)
    setMsg('')
    try {
      const s: any = await ember.mcp.set(next)
      setStatus(s)
      setMsg(`Added "${def.name}". Connecting…`)
    } catch (e: any) {
      setMsg(e?.message || 'Could not connect.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="font-serif text-2xl mb-1">Connectors (MCP)</h2>
      <p className="text-sm text-ink-faint mb-5">
        Add popular connectors in one click, or connect any MCP server with the same JSON format as{' '}
        <code className="text-xs">claude_desktop_config.json</code>. Their tools become available to Claude in every
        chat.
      </p>

      <ConnectorDirectory onAdd={addConnector} />

      <div className="text-sm font-semibold text-ink mt-8 mb-2">Advanced — raw config</div>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl border border-line bg-cream text-[13px] leading-relaxed outline-none focus:border-clay/60 resize-none font-mono"
      />
      <div className="flex items-center gap-3 mt-3">
        <button onClick={save} disabled={busy} className="px-4 py-2 rounded-xl bg-clay text-white text-sm font-medium hover:bg-clay-dark disabled:opacity-50">
          {busy ? 'Connecting…' : 'Save & reconnect'}
        </button>
        {msg && <span className="text-sm text-ink-soft">{msg}</span>}
      </div>

      {status.length > 0 && (
        <div className="mt-6 space-y-3">
          {status.map((s: any) => (
            <div key={s.name} className="border border-line rounded-xl p-4">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${s.connected ? 'bg-green-500' : 'bg-red-400'}`} />
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs text-ink-faint ml-auto">
                  {s.connected ? `${s.tools.length} tool${s.tools.length === 1 ? '' : 's'}` : 'not connected'}
                </span>
              </div>
              {s.error && <p className="text-xs text-red-600 mt-1.5">{s.error}</p>}
              {s.tools.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {s.tools.map((t: any) => (
                    <span key={t.name} title={t.description} className="px-2 py-1 rounded-md bg-cream-sunk text-[11px] font-mono text-ink-soft">
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DataSection() {
  const [msg, setMsg] = useState('')
  const exportData = async () => {
    const data = await ember.data.export()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ember-backup-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const importData = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        await ember.data.import(JSON.parse(text))
        setMsg('Imported. Reloading…')
        setTimeout(() => location.reload(), 700)
      } catch {
        setMsg('Invalid backup file.')
      }
    }
    input.click()
  }
  const clearData = async () => {
    if (!confirm('Delete all chats, projects and skills for this account? This cannot be undone.')) return
    await ember.data.clear()
    location.reload()
  }
  return (
    <div>
      <h2 className="font-serif text-2xl mb-6">Data</h2>
      <div className="space-y-3">
        <button onClick={exportData} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-line hover:bg-cream-sunk text-left">
          <FileIcon size={18} />
          <div>
            <div className="text-sm font-medium">Export everything</div>
            <div className="text-xs text-ink-faint">Download all your chats, projects and skills as JSON.</div>
          </div>
        </button>
        <button onClick={importData} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-line hover:bg-cream-sunk text-left">
          <Layers size={18} />
          <div>
            <div className="text-sm font-medium">Import backup</div>
            <div className="text-xs text-ink-faint">Restore from a previously exported JSON file.</div>
          </div>
        </button>
        <button onClick={clearData} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-left">
          <X size={18} />
          <div>
            <div className="text-sm font-medium">Clear all data</div>
            <div className="text-xs opacity-80">Permanently delete this account's chats, projects and skills.</div>
          </div>
        </button>
        {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-ink-soft">{label}</label>
      </div>
      {children}
      {hint && <p className="text-xs text-ink-faint mt-1">{hint}</p>}
    </div>
  )
}

function ToggleSwitch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-11 h-6 rounded-full transition-colors relative ${on ? 'bg-clay' : 'bg-line-strong'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-cream shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

function ToolRow({ title, desc, on, onClick }: { title: string; desc: string; on: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-line/70">
      <div className="flex-1">
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="text-xs text-ink-faint mt-0.5">{desc}</div>
      </div>
      <ToggleSwitch on={on} onClick={onClick} />
    </div>
  )
}
