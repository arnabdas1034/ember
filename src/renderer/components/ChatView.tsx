import React, { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { Message } from './Message'
import { Composer } from './Composer'
import { Spark } from './Icons'

export function ChatView() {
  const { chats, currentChatId, hasKey, user, projects, setShowSettings } = useStore()
  const chat = chats.find((c) => c.id === currentChatId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messages = chat?.messages || []
  const streamId = useStore((s) => s.streamId)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, currentChatId])

  useEffect(() => {
    // keep pinned to bottom while streaming
    const el = scrollRef.current
    if (el && streamId) el.scrollTop = el.scrollHeight
  })

  const project = chat?.projectId ? projects.find((p) => p.id === chat.projectId) : null

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full">
      <header className="h-14 shrink-0 flex items-center px-6 border-b border-line/70 drag">
        <div className="no-drag min-w-0">
          <div className="text-sm font-medium text-ink truncate">{chat?.title || 'New chat'}</div>
          {project && <div className="text-[11px] text-ink-faint">in {project.name}</div>}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {messages.length === 0 ? (
            <Greeting hasKey={hasKey} name={user?.username} onSettings={() => setShowSettings(true)} />
          ) : (
            messages.map((m, i) => <Message key={m.id} message={m} isLast={i === messages.length - 1} />)
          )}
        </div>
      </div>

      <Composer />
    </div>
  )
}

function Greeting({ hasKey, name, onSettings }: { hasKey: boolean; name?: string; onSettings: () => void }) {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return (
    <div className="flex flex-col items-center justify-center min-h-[52vh] text-center">
      <div className="w-14 h-14 rounded-2xl bg-clay/12 flex items-center justify-center mb-5">
        <Spark size={30} className="text-clay" />
      </div>
      <h1 className="font-serif text-3xl text-ink mb-2">
        Good {part}{name ? `, ${name}` : ''}
      </h1>
      <p className="text-ink-faint mb-6">How can I help you today?</p>
      {!hasKey && (
        <button
          onClick={onSettings}
          className="px-4 py-2.5 rounded-xl bg-clay text-white text-sm font-medium hover:bg-clay-dark transition-colors"
        >
          Add your Anthropic API key to begin
        </button>
      )}
    </div>
  )
}
