import React, { useState } from 'react'
import { useStore } from '../store'
import { ember } from '../api'
import { Markdown } from './Markdown'
import { Brain, Chevron, Copy, Edit, Refresh, Globe, Code, Eye, File as FileIcon, Terminal, Shield, Check, X, Folder } from './Icons'
import type { ChatMessage } from '@shared/types'

export function Message({ message, isLast }: { message: ChatMessage; isLast: boolean }) {
  const { openArtifact, regenerate, editAndResend, streamId, currentChatId, respondPermission } = useStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.text)
  const streaming = !!streamId

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-6 fade-up">
        <div className="max-w-[80%] group">
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end mb-2">
              {message.attachments.map((a) => (
                <AttachmentChip key={a.id} name={a.name} kind={a.kind} data={a.data} media={a.mediaType} />
              ))}
            </div>
          )}
          {editing ? (
            <div className="bg-cream-panel border border-line rounded-2xl p-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full bg-transparent outline-none resize-none text-[15px] leading-relaxed"
                rows={Math.min(10, draft.split('\n').length + 1)}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm rounded-lg text-ink-soft hover:bg-cream-sunk">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setEditing(false)
                    editAndResend(message.id, draft)
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg bg-clay text-white hover:bg-clay-dark"
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-cream-panel border border-line rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">
              {message.text}
            </div>
          )}
          {!editing && !streaming && (
            <div className="flex justify-end gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <IconBtn title="Edit" onClick={() => { setDraft(message.text); setEditing(true) }}>
                <Edit size={14} />
              </IconBtn>
              <IconBtn title="Copy" onClick={() => navigator.clipboard.writeText(message.text)}>
                <Copy size={14} />
              </IconBtn>
            </div>
          )}
        </div>
      </div>
    )
  }

  // assistant
  return (
    <div className="mb-8 fade-up group">
      {message.thinking && <ThinkingBlock text={message.thinking} live={isLast && streaming && !message.text} />}

      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {message.toolCalls.map((t) => (
            <ToolChip key={t.id} name={t.name} status={t.status} input={t.input} />
          ))}
        </div>
      )}

      {message.text ? (
        <Markdown>{message.text}</Markdown>
      ) : (
        !message.error &&
        isLast &&
        streaming && (
          <div className="flex items-center gap-2 text-ink-faint text-sm py-1">
            <span className="caret" /> thinking…
          </div>
        )
      )}

      {message.pendingPermission && currentChatId && (
        <PermissionCard
          request={message.pendingPermission}
          onDecision={(d) => respondPermission(currentChatId, message.id, message.pendingPermission!.id, d)}
        />
      )}

      {message.artifacts && message.artifacts.length > 0 && (
        <div className="flex flex-col gap-2 mt-3">
          {message.artifacts.map((a) => (
            <button
              key={a.id}
              onClick={() => openArtifact(a.id)}
              className="flex items-center gap-3 w-full max-w-md text-left px-4 py-3 rounded-xl border border-line bg-cream-panel hover:border-clay/50 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-clay/12 text-clay flex items-center justify-center">
                <Eye size={17} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink truncate">{a.title}</div>
                <div className="text-xs text-ink-faint">{a.language} · click to preview</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {message.fileOutputs && message.fileOutputs.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {message.fileOutputs.map((f) => (
            <div key={f.path} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-line bg-cream-panel text-sm">
              <FileIcon size={15} className="text-clay" />
              <span className="font-mono text-xs text-ink truncate max-w-[200px]" title={f.path}>{f.name}</span>
              <button onClick={() => ember.files.open(f.path).catch(() => {})} className="text-xs text-clay hover:underline ml-1">Open</button>
              <button onClick={() => ember.files.reveal(f.path).catch(() => {})} className="text-xs text-ink-faint hover:text-ink">Reveal</button>
            </div>
          ))}
        </div>
      )}

      {message.error && (
        <div className="mt-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {message.error}
        </div>
      )}

      {!streaming && message.text && (
        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconBtn title="Copy" onClick={() => navigator.clipboard.writeText(message.text)}>
            <Copy size={14} />
          </IconBtn>
          {isLast && (
            <IconBtn title="Regenerate" onClick={() => regenerate()}>
              <Refresh size={14} />
            </IconBtn>
          )}
          {message.usage && (
            <span className="ml-1 text-[11px] text-ink-faint">
              {message.usage.input_tokens.toLocaleString()} in · {message.usage.output_tokens.toLocaleString()} out
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(live)
  return (
    <div className="mb-3 border border-line rounded-xl bg-cream-panel/60 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-ink-soft hover:bg-cream-sunk/50">
        <Brain size={15} className="text-clay" />
        <span className="font-medium">Thinking</span>
        {live && <span className="caret !h-3.5" />}
        <Chevron size={15} className={`ml-auto transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 text-sm text-ink-soft/90 whitespace-pre-wrap border-t border-line/70 leading-relaxed">
          {text}
        </div>
      )}
    </div>
  )
}

function ToolChip({ name, status, input }: { name: string; status: string; input?: any }) {
  const agent = ['run_command', 'read_file', 'write_file', 'edit_file', 'list_files'].includes(name)
  const icon =
    name === 'run_command' ? <Terminal size={13} /> : agent ? <FileIcon size={13} /> : name.includes('search') || name.includes('fetch') ? <Globe size={13} /> : <Code size={13} />
  const label =
    name === 'web_search'
      ? `Searching${input?.query ? `: ${input.query}` : ' the web'}`
      : name === 'web_fetch'
        ? 'Fetching page'
        : name === 'code_execution'
          ? 'Running code'
          : name === 'memory'
            ? 'Updating memory'
            : name === 'run_command'
              ? input?.description || `Running: ${input?.command || 'command'}`
              : name === 'read_file'
                ? `Reading ${input?.path || 'file'}`
                : name === 'write_file'
                  ? `Writing ${input?.path || 'file'}`
                  : name === 'edit_file'
                    ? `Editing ${input?.path || 'file'}`
                    : name === 'list_files'
                      ? `Listing ${input?.path || 'files'}`
                      : name.startsWith('mcp__')
                        ? name.split('__').slice(1).join(': ')
                        : name
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cream-sunk border border-line text-xs text-ink-soft">
      {status === 'running' ? <span className="caret !h-3 !w-1.5" /> : icon}
      <span className="truncate max-w-[280px] font-mono">{label}</span>
    </div>
  )
}

function PermissionCard({
  request,
  onDecision
}: {
  request: { tool: string; category: string; summary: string; detail?: string }
  onDecision: (d: 'allow_once' | 'allow_session' | 'allow_always' | 'deny') => void
}) {
  const isCommand = request.category === 'command'
  const alwaysLabel = isCommand ? 'Always allow this command' : 'Always allow edits here'
  return (
    <div className="my-3 border-2 border-clay/40 rounded-xl bg-clay/5 overflow-hidden fade-up">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-clay/20">
        {isCommand ? <Terminal size={15} className="text-clay" /> : <Edit size={15} className="text-clay" />}
        <span className="text-sm font-medium text-ink">Permission needed</span>
        <span className="text-xs text-ink-faint ml-auto">{request.summary}</span>
      </div>
      {request.detail && (
        <pre className="px-4 py-3 text-[12px] leading-relaxed font-mono bg-cream-sunk/60 overflow-x-auto max-h-52 m-0 whitespace-pre-wrap">
          {request.detail}
        </pre>
      )}
      <div className="flex flex-wrap gap-2 p-3">
        <button onClick={() => onDecision('allow_once')} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-clay text-white text-sm font-medium hover:bg-clay-dark">
          <Check size={15} /> Allow
        </button>
        <button
          onClick={() => onDecision('allow_always')}
          title="Remembered across chats and restarts, until you revoke it in Settings → Tools"
          className="px-3.5 py-2 rounded-lg border border-line text-sm hover:bg-cream-sunk"
        >
          {alwaysLabel}
        </button>
        <button onClick={() => onDecision('allow_session')} className="px-3.5 py-2 rounded-lg border border-line text-sm text-ink-soft hover:bg-cream-sunk">
          Allow all this run
        </button>
        <button onClick={() => onDecision('deny')} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-line text-sm text-ink-soft hover:bg-cream-sunk ml-auto">
          <X size={15} /> Deny
        </button>
      </div>
    </div>
  )
}

function AttachmentChip({ name, kind, data, media }: { name: string; kind: string; data: string; media: string }) {
  if (kind === 'image') {
    return <img src={`data:${media};base64,${data}`} alt={name} className="h-20 rounded-lg border border-line object-cover" />
  }
  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-cream-sunk border border-line text-xs text-ink-soft">
      <FileIcon size={14} /> {name}
    </div>
  )
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-cream-sunk transition-colors">
      {children}
    </button>
  )
}
