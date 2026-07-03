import { create } from 'zustand'
import { ember, uid } from './api'
import { extractArtifacts } from './lib/artifacts'
import {
  DEFAULT_SETTINGS,
  BUILTIN_STYLES,
  type Attachment,
  type Chat,
  type ChatMessage,
  type ChatRequest,
  type ContentBlock,
  type ModelInfo,
  type Project,
  type PublicUser,
  type Settings,
  type Skill,
  type StreamEvent
} from '@shared/types'

// Resolve the active response style (built-in or custom) to its instruction text.
function styleInstructions(s: Settings): string {
  const all = [...BUILTIN_STYLES, ...(s.customStyles || [])]
  return all.find((x) => x.id === s.responseStyle)?.instructions?.trim() || ''
}

type View = 'chat' | 'projects' | 'skills'

interface State {
  ready: boolean
  user: PublicUser | null
  hasKey: boolean

  models: ModelInfo[]
  settings: Settings
  chats: Chat[]
  projects: Project[]
  skills: Skill[]

  currentChatId: string | null
  view: View
  activeProjectId: string | null

  streamId: string | null
  artifactId: string | null // open artifact in side panel
  showSettings: boolean
  voiceMode: boolean

  // ---- lifecycle ----
  bootstrap: () => Promise<void>
  refreshAll: () => Promise<void>
  logout: () => Promise<void>
  setUser: (u: PublicUser) => Promise<void>

  // ---- key ----
  setKey: (k: string) => Promise<void>

  // ---- chat ----
  newChat: (projectId?: string | null) => void
  newIncognitoChat: () => void
  receiveQuick: (payload: { text: string; image?: { data: string; mediaType: string } | null }) => Promise<void>
  selectChat: (id: string) => void
  deleteChat: (id: string) => Promise<void>
  renameChat: (id: string, title: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  setChatModel: (id: string, model: string) => Promise<void>
  setWorkdir: (id: string, dir: string | null) => Promise<void>
  setPermissionMode: (id: string, mode: 'plan' | 'ask' | 'acceptEdits' | 'bypass') => Promise<void>
  respondPermission: (chatId: string, messageId: string, id: string, decision: 'allow_once' | 'allow_session' | 'allow_always' | 'deny') => void
  send: (text: string, attachments: Attachment[]) => Promise<void>
  stop: () => void
  regenerate: () => Promise<void>
  editAndResend: (messageId: string, newText: string) => Promise<void>

  // ---- settings ----
  saveSettings: (s: Settings) => Promise<void>

  // ---- projects / skills ----
  saveProject: (p: Project) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  saveSkill: (s: Skill) => Promise<void>
  deleteSkill: (id: string) => Promise<void>

  // ---- ui ----
  setView: (v: View) => void
  setActiveProject: (id: string | null) => void
  openArtifact: (id: string | null) => void
  setShowSettings: (b: boolean) => void
  setVoiceMode: (b: boolean) => void
}

function currentChat(get: () => State): Chat | undefined {
  const s = get()
  return s.chats.find((c) => c.id === s.currentChatId)
}

// Assemble the system prompt from global prefs + project + enabled skills.
function buildSystem(s: State, chat: Chat): string {
  const parts: string[] = []
  if (s.settings.personalInstructions.trim()) {
    parts.push(s.settings.personalInstructions.trim())
  }
  const project = chat.projectId ? s.projects.find((p) => p.id === chat.projectId) : null
  if (project) {
    if (project.instructions.trim()) parts.push(`# Project: ${project.name}\n${project.instructions.trim()}`)
    if (project.knowledge.length) {
      const kn = project.knowledge
        .map((k) => `## ${k.name}\n${k.text.slice(0, 20000)}`)
        .join('\n\n')
      parts.push(`# Project knowledge\n${kn}`)
    }
  }
  const enabledSkills = s.skills.filter((sk) => sk.enabled)
  if (enabledSkills.length) {
    const list = enabledSkills.map((sk) => `- **${sk.name}**: ${sk.description}`).join('\n')
    const bodies = enabledSkills.map((sk) => `## Skill: ${sk.name}\n${sk.instructions}`).join('\n\n')
    parts.push(`# Available skills\nUse these when relevant:\n${list}\n\n${bodies}`)
  }
  const style = styleInstructions(s.settings)
  if (style) parts.push(`# Response style\n${style}`)
  return parts.join('\n\n---\n\n')
}

// Convert stored chat messages into API message payloads (with content blocks).
function toApiMessages(messages: ChatMessage[]): ChatRequest['messages'] {
  return messages
    .filter((m) => m.role === 'user' || (m.text && m.text.trim()))
    .map((m) => {
      if (m.role === 'assistant') {
        return { role: 'assistant' as const, content: m.text }
      }
      const blocks: ContentBlock[] = []
      for (const a of m.attachments || []) {
        if (a.kind === 'image') {
          blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } })
        } else if (a.kind === 'pdf') {
          blocks.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: a.data },
            title: a.name
          })
        } else if (a.kind === 'text') {
          blocks.push({ type: 'text', text: `Attached file "${a.name}":\n\n${a.data}` })
        }
      }
      blocks.push({ type: 'text', text: m.text || '' })
      return { role: 'user' as const, content: blocks }
    })
}

let unsub: (() => void) | null = null

export const useStore = create<State>((set, get) => ({
  ready: false,
  user: null,
  hasKey: false,
  models: [],
  settings: { ...DEFAULT_SETTINGS },
  chats: [],
  projects: [],
  skills: [],
  currentChatId: null,
  view: 'chat',
  activeProjectId: null,
  streamId: null,
  artifactId: null,
  showSettings: false,
  voiceMode: false,

  bootstrap: async () => {
    // Route all streaming events to the correct message.
    if (!unsub) unsub = ember.chat.onEvent((ev) => handleStreamEvent(set, get, ev))
    const me = (await ember.auth.me().catch(() => null)) as PublicUser | null
    if (me) {
      await get().setUser(me)
    }
    set({ ready: true })
  },

  refreshAll: async () => {
    const [settings, chats, projects, skills, hasKey] = await Promise.all([
      ember.settings.get() as Promise<Settings>,
      ember.chats.list() as Promise<Chat[]>,
      ember.projects.list() as Promise<Project[]>,
      ember.skills.list() as Promise<Skill[]>,
      ember.key.has()
    ])
    set({ settings, chats, projects, skills, hasKey })
    ember.models
      .list()
      .then((models) => set({ models: models as ModelInfo[] }))
      .catch(() => {})
    if (!get().currentChatId && chats.length) set({ currentChatId: chats[0].id })
  },

  setUser: async (u) => {
    set({ user: u, hasKey: u.hasKey })
    await get().refreshAll()
  },

  logout: async () => {
    await ember.auth.logout()
    set({
      user: null,
      hasKey: false,
      chats: [],
      projects: [],
      skills: [],
      currentChatId: null,
      view: 'chat'
    })
  },

  setKey: async (k) => {
    await ember.key.set(k)
    const has = await ember.key.has()
    set({ hasKey: has })
    ember.models
      .list()
      .then((models) => set({ models: models as ModelInfo[] }))
      .catch(() => {})
  },

  newChat: (projectId = null) => {
    const s = get()
    const chat: Chat = {
      id: uid(),
      title: 'New chat',
      projectId: projectId ?? s.activeProjectId ?? null,
      model: s.settings.defaultModel,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    set({ chats: [chat, ...s.chats], currentChatId: chat.id, view: 'chat', artifactId: null })
  },

  newIncognitoChat: () => {
    const s = get()
    const chat: Chat = {
      id: uid(),
      title: 'Incognito chat',
      projectId: null,
      model: s.settings.defaultModel,
      incognito: true,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    // Not added to the persisted list — lives only in memory for this session.
    set({ chats: [chat, ...s.chats], currentChatId: chat.id, view: 'chat', artifactId: null })
  },

  // A message arriving from the Quick Entry overlay: open a fresh chat and send it.
  receiveQuick: async (payload) => {
    if (!get().user) return
    get().newChat()
    const attachments: Attachment[] = []
    if (payload.image?.data) {
      attachments.push({
        id: uid(),
        name: 'screenshot.png',
        kind: 'image',
        mediaType: payload.image.mediaType || 'image/png',
        data: payload.image.data,
        size: payload.image.data.length
      })
    }
    set({ view: 'chat' })
    await get().send(payload.text || 'What is in this screenshot?', attachments)
  },

  selectChat: (id) => set({ currentChatId: id, view: 'chat', artifactId: null }),

  deleteChat: async (id) => {
    await ember.chats.delete(id)
    const s = get()
    const chats = s.chats.filter((c) => c.id !== id)
    set({ chats, currentChatId: s.currentChatId === id ? chats[0]?.id ?? null : s.currentChatId })
  },

  renameChat: async (id, title) => {
    const chat = get().chats.find((c) => c.id === id)
    if (!chat) return
    const updated = { ...chat, title }
    set({ chats: get().chats.map((c) => (c.id === id ? updated : c)) })
    await ember.chats.save(updated)
  },

  togglePin: async (id) => {
    const chat = get().chats.find((c) => c.id === id)
    if (!chat) return
    const updated = { ...chat, pinned: !chat.pinned }
    set({ chats: get().chats.map((c) => (c.id === id ? updated : c)) })
    await ember.chats.save(updated)
  },

  setChatModel: async (id, model) => {
    const chat = get().chats.find((c) => c.id === id)
    if (!chat) return
    const updated = { ...chat, model }
    set({ chats: get().chats.map((c) => (c.id === id ? updated : c)) })
    await ember.chats.save(updated)
  },

  setWorkdir: async (id, dir) => {
    const chat = get().chats.find((c) => c.id === id)
    if (!chat) return
    const updated = { ...chat, workdir: dir, permissionMode: chat.permissionMode || 'ask' }
    set({ chats: get().chats.map((c) => (c.id === id ? updated : c)) })
    await ember.chats.save(updated)
  },

  setPermissionMode: async (id, mode) => {
    const chat = get().chats.find((c) => c.id === id)
    if (!chat) return
    const updated = { ...chat, permissionMode: mode }
    set({ chats: get().chats.map((c) => (c.id === id ? updated : c)) })
    await ember.chats.save(updated)
  },

  respondPermission: (chatId, messageId, id, decision) => {
    ember.agent.respondPermission(id, decision)
    set((state: any) => ({
      chats: state.chats.map((c: Chat) =>
        c.id !== chatId
          ? c
          : { ...c, messages: c.messages.map((m) => (m.id === messageId ? { ...m, pendingPermission: undefined } : m)) }
      )
    }))
  },

  send: async (text, attachments) => {
    const s = get()
    let chat = currentChat(get)
    if (!chat) {
      s.newChat()
      chat = currentChat(get)!
    }
    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      text,
      attachments,
      createdAt: Date.now()
    }
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: 'assistant',
      text: '',
      thinking: '',
      model: chat.model,
      toolCalls: [],
      createdAt: Date.now()
    }
    const streamId = uid()
    const updatedChat: Chat = {
      ...chat,
      messages: [...chat.messages, userMsg, assistantMsg],
      updatedAt: Date.now()
    }
    set({
      chats: get().chats.map((c) => (c.id === chat!.id ? updatedChat : c)),
      streamId
    })

    await startStream(get, set, streamId, updatedChat, assistantMsg.id)

    // Auto-title the conversation after the first exchange.
    if (updatedChat.title === 'New chat') {
      ember.chat
        .title(text)
        .then((title) => get().renameChat(updatedChat.id, title))
        .catch(() => {})
    }
  },

  stop: () => {
    const id = get().streamId
    if (id) ember.chat.stop(id)
    set({ streamId: null })
  },

  regenerate: async () => {
    const chat = currentChat(get)
    if (!chat || chat.messages.length < 2) return
    // Drop the last assistant message and re-run from the prior user message.
    const msgs = [...chat.messages]
    while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop()
    const trimmed = { ...chat, messages: msgs }
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: 'assistant',
      text: '',
      thinking: '',
      model: chat.model,
      toolCalls: [],
      createdAt: Date.now()
    }
    const withPlaceholder = { ...trimmed, messages: [...msgs, assistantMsg] }
    const streamId = uid()
    set({ chats: get().chats.map((c) => (c.id === chat.id ? withPlaceholder : c)), streamId })
    await startStream(get, set, streamId, withPlaceholder, assistantMsg.id)
  },

  editAndResend: async (messageId, newText) => {
    const chat = currentChat(get)
    if (!chat) return
    const idx = chat.messages.findIndex((m) => m.id === messageId)
    if (idx < 0) return
    const kept = chat.messages.slice(0, idx)
    const editedUser: ChatMessage = { ...chat.messages[idx], text: newText }
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: 'assistant',
      text: '',
      thinking: '',
      model: chat.model,
      toolCalls: [],
      createdAt: Date.now()
    }
    const rebuilt = { ...chat, messages: [...kept, editedUser, assistantMsg] }
    const streamId = uid()
    set({ chats: get().chats.map((c) => (c.id === chat.id ? rebuilt : c)), streamId })
    await startStream(get, set, streamId, rebuilt, assistantMsg.id)
  },

  saveSettings: async (settings) => {
    const saved = (await ember.settings.save(settings)) as Settings
    set({ settings: saved })
  },

  saveProject: async (p) => {
    const saved = (await ember.projects.save(p)) as Project
    const exists = get().projects.some((x) => x.id === saved.id)
    set({ projects: exists ? get().projects.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...get().projects] })
  },
  deleteProject: async (id) => {
    await ember.projects.delete(id)
    set({
      projects: get().projects.filter((p) => p.id !== id),
      activeProjectId: get().activeProjectId === id ? null : get().activeProjectId
    })
  },

  saveSkill: async (s) => {
    const saved = (await ember.skills.save(s)) as Skill
    const exists = get().skills.some((x) => x.id === saved.id)
    set({ skills: exists ? get().skills.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...get().skills] })
  },
  deleteSkill: async (id) => {
    await ember.skills.delete(id)
    set({ skills: get().skills.filter((s) => s.id !== id) })
  },

  setView: (v) => set({ view: v }),
  setActiveProject: (id) => set({ activeProjectId: id }),
  openArtifact: (id) => set({ artifactId: id }),
  setShowSettings: (b) => set({ showSettings: b }),
  setVoiceMode: (b) => set({ voiceMode: b })
}))

// ---- streaming plumbing ----

async function startStream(
  get: () => State,
  set: (partial: Partial<State>) => void,
  streamId: string,
  chat: Chat,
  assistantId: string
) {
  const s = get()
  const req: ChatRequest = {
    streamId,
    chatId: chat.id,
    model: chat.model,
    system: buildSystem(s, chat),
    messages: toApiMessages(chat.messages.filter((m) => m.id !== assistantId)),
    thinking: s.settings.thinking,
    effort: s.settings.effort,
    maxTokens: s.settings.maxTokens,
    cowork: s.settings.tools.codeExecution,
    memory: s.settings.memory && !chat.incognito,
    research: s.settings.tools.research,
    chatSearch: !!s.settings.tools.chatSearch && !chat.incognito,
    browser: !!s.settings.tools.browser,
    incognito: !!chat.incognito,
    workdir: chat.workdir || null,
    permissionMode: chat.permissionMode || 'ask',
    tools: s.settings.tools
  }
  // stash the assistant id so stream events know which message to update
  streamTargets.set(streamId, { chatId: chat.id, assistantId })
  await ember.chat.start(req)
}

const streamTargets = new Map<string, { chatId: string; assistantId: string }>()

function updateMessage(
  set: (fn: (state: State) => Partial<State>) => void,
  chatId: string,
  messageId: string,
  updater: (m: ChatMessage) => ChatMessage
) {
  set((state) => ({
    chats: state.chats.map((c) =>
      c.id !== chatId ? c : { ...c, messages: c.messages.map((m) => (m.id === messageId ? updater(m) : m)) }
    )
  }))
}

function handleStreamEvent(
  set: (fn: (state: State) => Partial<State>) => void,
  get: () => State,
  ev: StreamEvent
) {
  const target = streamTargets.get(ev.streamId)
  if (!target) return
  const { chatId, assistantId } = target

  switch (ev.type) {
    case 'text_delta':
      updateMessage(set, chatId, assistantId, (m) => ({ ...m, text: m.text + ev.text }))
      break
    case 'thinking_delta':
      updateMessage(set, chatId, assistantId, (m) => ({ ...m, thinking: (m.thinking || '') + ev.text }))
      break
    case 'tool_start':
      updateMessage(set, chatId, assistantId, (m) => ({
        ...m,
        toolCalls: [...(m.toolCalls || []), { id: uid(), name: ev.name, input: ev.input, status: 'running' }]
      }))
      break
    case 'tool_done':
      updateMessage(set, chatId, assistantId, (m) => {
        const calls = [...(m.toolCalls || [])]
        for (let i = calls.length - 1; i >= 0; i--) {
          if (calls[i].name === ev.name && calls[i].status === 'running') {
            calls[i] = { ...calls[i], status: 'done', result: ev.result }
            break
          }
        }
        return { ...m, toolCalls: calls }
      })
      break
    case 'file_output':
      updateMessage(set, chatId, assistantId, (m) => {
        const existing = m.fileOutputs || []
        if (existing.some((f) => f.path === ev.path)) return m
        return { ...m, fileOutputs: [...existing, { path: ev.path, name: ev.name }] }
      })
      break
    case 'permission':
      updateMessage(set, chatId, assistantId, (m) => ({ ...m, pendingPermission: ev.request }))
      break
    case 'usage':
      updateMessage(set, chatId, assistantId, (m) => ({ ...m, usage: ev.usage }))
      break
    case 'error':
      updateMessage(set, chatId, assistantId, (m) => ({
        ...m,
        error: ev.error,
        toolCalls: (m.toolCalls || []).map((t) => ({ ...t, status: 'done' }))
      }))
      finalize(set, get, ev.streamId, chatId, assistantId)
      break
    case 'done':
      updateMessage(set, chatId, assistantId, (m) => ({
        ...m,
        artifacts: extractArtifacts(m.text),
        toolCalls: (m.toolCalls || []).map((t) => ({ ...t, status: 'done' }))
      }))
      finalize(set, get, ev.streamId, chatId, assistantId)
      break
  }
}

function finalize(
  set: (fn: (state: State) => Partial<State>) => void,
  get: () => State,
  streamId: string,
  chatId: string,
  _assistantId: string
) {
  streamTargets.delete(streamId)
  set((state) => ({ streamId: state.streamId === streamId ? null : state.streamId }))
  const chat = get().chats.find((c) => c.id === chatId)
  // Incognito chats are never written to disk.
  if (chat && !chat.incognito) ember.chats.save(chat).catch(() => {})
}
