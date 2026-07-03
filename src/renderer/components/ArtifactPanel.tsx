import React, { useMemo, useState } from 'react'
import { useStore } from '../store'
import { isRenderablePreview, isReactArtifact, reactPreviewDoc } from '../lib/artifacts'
import { X, Copy, Eye, Code } from './Icons'

export function ArtifactPanel() {
  const { chats, currentChatId, artifactId, openArtifact } = useStore()
  const chat = chats.find((c) => c.id === currentChatId)

  const artifact = useMemo(() => {
    for (const m of chat?.messages || []) {
      const found = m.artifacts?.find((a) => a.id === artifactId)
      if (found) return found
    }
    return null
  }, [chat, artifactId])

  const renderable = artifact ? isRenderablePreview(artifact) : false
  const [tab, setTab] = useState<'preview' | 'code'>(renderable ? 'preview' : 'code')

  if (!artifact) return null

  const doc = isReactArtifact(artifact)
    ? reactPreviewDoc(artifact.code)
    : artifact.language === 'svg' || /^\s*<svg/i.test(artifact.code)
      ? `<!doctype html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff">${artifact.code}</body></html>`
      : artifact.code
  // data: URL (not srcDoc) so the framed document does NOT inherit our strict CSP —
  // lets React/Babel CDN scripts run inside the sandboxed preview only.
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(doc)}`

  return (
    <div className="w-[46%] max-w-[720px] min-w-[380px] h-full border-l border-line bg-cream-panel flex flex-col fade-up">
      <div className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-line">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink truncate">{artifact.title}</div>
          <div className="text-[11px] text-ink-faint">{artifact.language}</div>
        </div>
        {renderable && (
          <div className="flex gap-1 p-1 bg-cream-sunk rounded-lg">
            <TabBtn active={tab === 'preview'} onClick={() => setTab('preview')} icon={<Eye size={14} />} label="Preview" />
            <TabBtn active={tab === 'code'} onClick={() => setTab('code')} icon={<Code size={14} />} label="Code" />
          </div>
        )}
        <button
          onClick={() => navigator.clipboard.writeText(artifact.code)}
          className="p-2 rounded-lg text-ink-soft hover:bg-cream-sunk"
          title="Copy"
        >
          <Copy size={16} />
        </button>
        <button onClick={() => openArtifact(null)} className="p-2 rounded-lg text-ink-soft hover:bg-cream-sunk" title="Close">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {renderable && tab === 'preview' ? (
          <iframe
            title={artifact.title}
            sandbox="allow-scripts allow-modals allow-popups allow-forms"
            src={dataUrl}
            className="w-full h-full bg-white border-0"
          />
        ) : (
          <pre className="h-full overflow-auto m-0 p-4 text-[13px] leading-relaxed font-mono bg-cream-panel text-ink">
            <code>{artifact.code}</code>
          </pre>
        )}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
        active ? 'bg-cream-panel text-ink shadow-sm font-medium' : 'text-ink-soft'
      }`}
    >
      {icon} {label}
    </button>
  )
}
