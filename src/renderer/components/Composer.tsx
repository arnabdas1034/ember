import React, { useRef, useState } from 'react'
import { useStore } from '../store'
import { ember, uid } from '../api'
import { ModelPicker } from './ModelPicker'
import { Paperclip, Send, Stop, Globe, Brain, Code, X, File as FileIcon, Search as SearchIcon, Mic, Folder, Shield } from './Icons'
import { VoiceRecorder, transcribe } from '../lib/voice'
import { BUILTIN_STYLES, type Attachment } from '@shared/types'

const TEXT_EXT = ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'csv', 'html', 'css', 'xml', 'yml', 'yaml', 'sh', 'go', 'rs', 'java']

function readFile(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const isImage = file.type.startsWith('image/')
    const isPdf = file.type === 'application/pdf' || ext === 'pdf'
    reader.onerror = () => reject(reader.error)
    if (isImage || isPdf) {
      reader.onload = () => {
        const res = String(reader.result)
        const base64 = res.split(',')[1] || ''
        resolve({
          id: uid(),
          name: file.name,
          kind: isImage ? 'image' : 'pdf',
          mediaType: isImage ? file.type || 'image/png' : 'application/pdf',
          data: base64,
          size: file.size
        })
      }
      reader.readAsDataURL(file)
    } else {
      reader.onload = () => {
        resolve({ id: uid(), name: file.name, kind: 'text', mediaType: 'text/plain', data: String(reader.result), size: file.size })
      }
      reader.readAsText(file)
    }
  })
}

export function Composer() {
  const { settings, saveSettings, send, stop, streamId, currentChatId, chats, setChatModel, setWorkdir, setPermissionMode, setVoiceMode } = useStore()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'working'>('idle')
  const [voiceMsg, setVoiceMsg] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const recorder = useRef<VoiceRecorder | null>(null)

  const chat = chats.find((c) => c.id === currentChatId)
  const model = chat?.model || settings.defaultModel
  const streaming = !!streamId
  const workdir = chat?.workdir || null
  const permMode = chat?.permissionMode || 'ask'

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() || ''
      return f.type.startsWith('image/') || f.type === 'application/pdf' || ext === 'pdf' || TEXT_EXT.includes(ext)
    })
    const parsed = await Promise.all(list.map(readFile))
    setAttachments((a) => [...a, ...parsed])
  }

  const submit = () => {
    if (streaming) return
    if (!text.trim() && attachments.length === 0) return
    send(text.trim(), attachments)
    setText('')
    setAttachments([])
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const autosize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(240, e.target.scrollHeight) + 'px'
  }

  const setTool = (key: 'webSearch' | 'webFetch' | 'codeExecution' | 'research' | 'browser', v: boolean) =>
    saveSettings({ ...settings, tools: { ...settings.tools, [key]: v } })

  const pickFolder = async () => {
    const dir = await ember.agent.pickDir()
    if (dir && chat) setWorkdir(chat.id, dir)
    else if (dir && !chat) {
      // no chat yet — create one, then attach
      useStore.getState().newChat()
      const c = useStore.getState().chats[0]
      if (c) setWorkdir(c.id, dir)
    }
  }

  const toggleVoice = async () => {
    if (voiceState === 'recording') {
      setVoiceState('working')
      setVoiceMsg('Transcribing…')
      try {
        const blob = await recorder.current!.stop()
        const raw = await transcribe(blob, (p: any) => {
          if (p?.status === 'progress' && p?.file?.endsWith?.('.onnx'))
            setVoiceMsg(`Loading voice model… ${Math.round(p.progress || 0)}%`)
        })
        if (raw) {
          setVoiceMsg('Cleaning up…')
          const cleaned = await ember.voice.clean(raw).catch(() => raw)
          setText((t) => (t ? t + ' ' : '') + cleaned)
        }
      } catch (e: any) {
        setVoiceMsg(e?.message?.includes('Permission') ? 'Microphone blocked.' : 'Voice failed.')
        setTimeout(() => setVoiceMsg(''), 2500)
      } finally {
        setVoiceState('idle')
        setTimeout(() => setVoiceMsg(''), 1500)
      }
    } else if (voiceState === 'idle') {
      try {
        recorder.current = new VoiceRecorder()
        await recorder.current.start()
        setVoiceState('recording')
        setVoiceMsg('Listening… tap to stop')
      } catch {
        setVoiceMsg('Microphone access denied.')
        setTimeout(() => setVoiceMsg(''), 2500)
      }
    }
  }

  return (
    <div className="px-4 pb-4 pt-1">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
        }}
        className={`max-w-3xl mx-auto bg-cream-panel border rounded-2xl shadow-sm transition-colors ${
          dragOver ? 'border-clay' : 'border-line'
        }`}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 pb-0">
            {attachments.map((a) => (
              <div key={a.id} className="relative group">
                {a.kind === 'image' ? (
                  <img src={`data:${a.mediaType};base64,${a.data}`} className="h-16 w-16 object-cover rounded-lg border border-line" />
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2 h-16 rounded-lg bg-cream-sunk border border-line text-xs text-ink-soft max-w-[180px]">
                    <FileIcon size={15} />
                    <span className="truncate">{a.name}</span>
                  </div>
                )}
                <button
                  onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                  className="absolute -top-1.5 -right-1.5 bg-ink text-cream rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {workdir && (
          <div className="flex items-center gap-2 px-3 pt-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cream-sunk border border-line text-xs text-ink-soft">
              <Folder size={13} className="text-clay" />
              <span className="font-mono truncate max-w-[220px]" title={workdir}>
                {workdir.split('/').filter(Boolean).pop()}
              </span>
              <button onClick={() => chat && setWorkdir(chat.id, null)} className="text-ink-faint hover:text-red-500 ml-0.5">
                <X size={12} />
              </button>
            </div>
            <PermissionModePicker mode={permMode} onChange={(m) => chat && setPermissionMode(chat.id, m)} />
            <RevertChanges workdir={workdir} streaming={streaming} />
          </div>
        )}

        <textarea
          ref={taRef}
          value={text}
          onChange={autosize}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files)
            if (files.length) {
              e.preventDefault()
              addFiles(files)
            }
          }}
          placeholder="Message Ember…"
          rows={1}
          className="w-full bg-transparent resize-none outline-none px-4 pt-4 pb-2 text-[15px] leading-relaxed placeholder:text-ink-faint"
        />

        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <IconToggle title="Attach files" onClick={() => fileInput.current?.click()}>
            <Paperclip size={18} />
          </IconToggle>
          <IconToggle title="Open a folder for Claude Code" onClick={pickFolder}>
            <Folder size={18} />
          </IconToggle>
          <button
            onClick={toggleVoice}
            disabled={voiceState === 'working'}
            title="Dictate"
            className={`p-2 rounded-lg transition-colors ${
              voiceState === 'recording' ? 'bg-red-500 text-white animate-pulse' : voiceState === 'working' ? 'text-clay' : 'text-ink-soft hover:bg-cream-sunk'
            }`}
          >
            <Mic size={18} />
          </button>
          <button onClick={() => setVoiceMode(true)} title="Voice conversation mode" className="p-2 rounded-lg text-ink-soft hover:bg-cream-sunk transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12a4 4 0 0 0 8 0M12 8v0" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </button>

          <div className="w-px h-5 bg-line mx-1" />

          <Toggle active={settings.thinking} onClick={() => saveSettings({ ...settings, thinking: !settings.thinking })} icon={<Brain size={15} />} label="Think" />
          <Toggle active={settings.tools.webSearch} onClick={() => setTool('webSearch', !settings.tools.webSearch)} icon={<Globe size={15} />} label="Search" />
          <Toggle active={settings.tools.research} onClick={() => setTool('research', !settings.tools.research)} icon={<SearchIcon size={15} />} label="Research" />
          <Toggle active={settings.tools.codeExecution} onClick={() => setTool('codeExecution', !settings.tools.codeExecution)} icon={<Code size={15} />} label="Cowork" />
          <Toggle active={!!settings.tools.browser} onClick={() => setTool('browser', !settings.tools.browser)} icon={<Globe size={15} />} label="Browser" />
          <StylePicker
            value={settings.responseStyle}
            styles={[...BUILTIN_STYLES, ...(settings.customStyles || [])]}
            onChange={(id) => saveSettings({ ...settings, responseStyle: id })}
          />

          <div className="ml-auto flex items-center gap-1">
            {chat?.incognito && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-ink/10 text-ink-soft text-[11px] font-medium" title="This chat is not saved to disk">
                Incognito
              </span>
            )}
            <ModelPicker value={model} onChange={(id) => (chat ? setChatModel(chat.id, id) : saveSettings({ ...settings, defaultModel: id }))} />
            {streaming ? (
              <button onClick={stop} className="w-9 h-9 rounded-xl bg-ink text-cream flex items-center justify-center hover:opacity-90" title="Stop">
                <Stop size={15} />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!text.trim() && attachments.length === 0}
                className="w-9 h-9 rounded-xl bg-clay text-white flex items-center justify-center hover:bg-clay-dark disabled:opacity-40 transition-colors"
                title="Send"
              >
                <Send size={17} />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="text-center text-[11px] text-ink-faint mt-2">
        {voiceMsg || 'Ember runs on your own Anthropic API key. Responses may be inaccurate — verify important information.'}
      </p>
    </div>
  )
}

function RevertChanges({ workdir, streaming }: { workdir: string; streaming: boolean }) {
  const [count, setCount] = useState(0)
  React.useEffect(() => {
    if (streaming) return
    ember.agent.changedFiles(workdir).then((f) => setCount(f.length)).catch(() => setCount(0))
  }, [workdir, streaming])
  if (count === 0) return null
  const revert = async () => {
    await ember.agent.revert(workdir).catch(() => {})
    setCount(0)
  }
  return (
    <button
      onClick={revert}
      title="Undo every file Claude Code changed in this folder this session"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-line text-ink-soft hover:bg-cream-sunk"
    >
      Revert {count} file{count === 1 ? '' : 's'}
    </button>
  )
}

type PMode = 'plan' | 'ask' | 'acceptEdits' | 'bypass'
function PermissionModePicker({ mode, onChange }: { mode: PMode; onChange: (m: PMode) => void }) {
  const [open, setOpen] = useState(false)
  const opts: { id: PMode; label: string; desc: string }[] = [
    { id: 'plan', label: 'Plan mode', desc: 'Read-only — investigates and proposes a plan, makes no changes' },
    { id: 'ask', label: 'Ask each time', desc: 'Approve every command and file change' },
    { id: 'acceptEdits', label: 'Auto-accept edits', desc: 'File edits run free; commands still ask' },
    { id: 'bypass', label: 'Bypass permissions', desc: 'Everything runs without asking — be careful' }
  ]
  const current = opts.find((o) => o.id === mode)!
  const danger = mode === 'bypass'
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          danger ? 'bg-red-500/10 text-red-600 border-red-300' : 'bg-cream-sunk text-ink-soft border-line hover:bg-cream-panel'
        }`}
      >
        <Shield size={13} /> {current.label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 w-72 bg-cream-panel border border-line rounded-xl shadow-lg p-1.5 z-30">
            {opts.map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  onChange(o.id)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2 rounded-lg hover:bg-cream-sunk ${o.id === mode ? 'bg-cream-sunk' : ''}`}
              >
                <div className={`text-sm font-medium ${o.id === 'bypass' ? 'text-red-600' : 'text-ink'}`}>{o.label}</div>
                <div className="text-[11px] text-ink-faint">{o.desc}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StylePicker({
  value,
  styles,
  onChange
}: {
  value: string
  styles: { id: string; name: string }[]
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current = styles.find((s) => s.id === value) || styles[0]
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Response style"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          value && value !== 'normal' ? 'bg-clay/12 text-clay' : 'text-ink-faint hover:bg-cream-sunk'
        }`}
      >
        {current?.name || 'Normal'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 w-52 bg-cream-panel border border-line rounded-xl shadow-lg p-1.5 z-30">
            <div className="px-2.5 py-1 text-[10px] uppercase tracking-wide text-ink-faint">Response style</div>
            {styles.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onChange(s.id)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm hover:bg-cream-sunk ${s.id === value ? 'bg-cream-sunk text-clay' : 'text-ink'}`}
              >
                {s.name}
              </button>
            ))}
            <div className="px-2.5 pt-1 pb-0.5 text-[10px] text-ink-faint">Add custom styles in Settings → General</div>
          </div>
        </>
      )}
    </div>
  )
}

function Toggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active ? 'bg-clay/12 text-clay' : 'text-ink-faint hover:bg-cream-sunk'
      }`}
    >
      {icon} {label}
    </button>
  )
}

function IconToggle({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="p-2 rounded-lg text-ink-soft hover:bg-cream-sunk transition-colors">
      {children}
    </button>
  )
}
