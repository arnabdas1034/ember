import React, { useMemo, useState } from 'react'
import { useStore } from '../store'
import { Spark, Plus, Search, Book, Layers, Gear, Logout, Pin, Trash } from './Icons'
import type { Chat } from '@shared/types'

function groupChats(chats: Chat[]): { label: string; items: Chat[] }[] {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 86400000
  const buckets: Record<string, Chat[]> = { Pinned: [], Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] }
  for (const c of chats) {
    if (c.pinned) buckets['Pinned'].push(c)
    else if (c.updatedAt >= startOfDay) buckets['Today'].push(c)
    else if (c.updatedAt >= startOfDay - day) buckets['Yesterday'].push(c)
    else if (c.updatedAt >= startOfDay - 7 * day) buckets['Previous 7 days'].push(c)
    else buckets['Older'].push(c)
  }
  return Object.entries(buckets)
    .filter(([, v]) => v.length)
    .map(([label, items]) => ({ label, items }))
}

export function Sidebar() {
  const {
    chats,
    currentChatId,
    view,
    user,
    newChat,
    newIncognitoChat,
    selectChat,
    deleteChat,
    togglePin,
    setView,
    setShowSettings,
    logout
  } = useStore()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return chats
    return chats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.text.toLowerCase().includes(q))
    )
  }, [chats, query])

  const groups = useMemo(() => groupChats(filtered), [filtered])

  return (
    <aside className="w-[264px] shrink-0 h-full bg-cream-sunk border-r border-line flex flex-col drag">
      <div className="h-14 flex items-center px-4 gap-2 no-drag" style={{ paddingLeft: 76 }}>
        <Spark size={19} className="text-clay" />
        <span className="font-serif text-lg text-ink">Ember</span>
      </div>

      <div className="px-3 no-drag">
        <div className="flex items-center gap-2">
          <button
            onClick={() => newChat()}
            className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-clay text-white text-sm font-medium hover:bg-clay-dark transition-colors"
          >
            <Plus size={17} /> New chat
          </button>
          <button
            onClick={() => newIncognitoChat()}
            title="New incognito chat (not saved, no memory)"
            className="px-3 py-2.5 rounded-xl bg-cream-panel border border-line text-ink-soft hover:bg-cream-sunk transition-colors"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h18M6 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0m6 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0M9 8l1.5-2h3L15 8" />
            </svg>
          </button>
        </div>

        <div className="mt-3 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-cream-panel border border-line text-sm outline-none focus:border-clay/50"
          />
        </div>
      </div>

      <nav className="px-3 mt-3 no-drag flex gap-1">
        <NavButton active={view === 'projects'} onClick={() => setView('projects')} icon={<Book size={16} />} label="Projects" />
        <NavButton active={view === 'skills'} onClick={() => setView('skills')} icon={<Layers size={16} />} label="Skills" />
      </nav>

      <div className="flex-1 overflow-y-auto px-2 mt-2 no-drag">
        {groups.length === 0 && <p className="text-xs text-ink-faint px-3 py-4">No chats yet.</p>}
        {groups.map((g) => (
          <div key={g.label} className="mb-2">
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint flex items-center gap-1">
              {g.label === 'Pinned' && <Pin size={11} />}
              {g.label}
            </div>
            {g.items.map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                active={c.id === currentChatId && view === 'chat'}
                onClick={() => selectChat(c.id)}
                onDelete={() => deleteChat(c.id)}
                onPin={() => togglePin(c.id)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-line no-drag">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-clay/15 text-clay flex items-center justify-center text-sm font-medium">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <span className="flex-1 text-sm text-ink-soft truncate">{user?.username}</span>
          <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-lg hover:bg-cream-panel text-ink-soft" title="Settings">
            <Gear size={17} />
          </button>
          <button onClick={() => logout()} className="p-1.5 rounded-lg hover:bg-cream-panel text-ink-soft" title="Sign out">
            <Logout size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? 'bg-cream-panel text-ink font-medium shadow-sm' : 'text-ink-soft hover:bg-cream-panel/60'
      }`}
    >
      {icon} {label}
    </button>
  )
}

function ChatRow({
  chat,
  active,
  onClick,
  onDelete,
  onPin
}: {
  chat: Chat
  active: boolean
  onClick: () => void
  onDelete: () => void
  onPin: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-1 pl-3 pr-1.5 py-2 rounded-lg cursor-pointer transition-colors ${
        active ? 'bg-cream-panel shadow-sm' : 'hover:bg-cream-panel/60'
      }`}
    >
      <span className="flex-1 text-sm text-ink-soft truncate">{chat.title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onPin()
        }}
        className={`p-1 rounded ${chat.pinned ? 'text-clay' : 'text-ink-faint opacity-0 group-hover:opacity-100 hover:text-ink'}`}
        title={chat.pinned ? 'Unpin' : 'Pin'}
      >
        <Pin size={13} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="p-1 rounded text-ink-faint opacity-0 group-hover:opacity-100 hover:text-red-500"
        title="Delete"
      >
        <Trash size={13} />
      </button>
    </div>
  )
}
