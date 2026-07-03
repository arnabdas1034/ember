// Shared types used by both the main and renderer processes.

export interface PublicUser {
  id: string
  username: string
  createdAt: number
  hasKey: boolean
}

export type Role = 'user' | 'assistant'

// A content block, mirroring a subset of the Anthropic Messages API shape.
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string }; title?: string }

export interface Attachment {
  id: string
  name: string
  kind: 'image' | 'pdf' | 'text'
  mediaType: string
  // base64 (image/pdf) or raw text (text)
  data: string
  size: number
}

export interface ToolCall {
  id: string
  name: string
  input?: any
  status: 'running' | 'done'
  result?: string
}

export type PermissionMode = 'plan' | 'ask' | 'acceptEdits' | 'bypass'

export interface PermissionRequest {
  id: string
  tool: string
  category: 'command' | 'edit'
  summary: string
  detail?: string
}

export interface Artifact {
  id: string
  title: string
  language: string // 'html' | 'svg' | 'react' | 'mermaid' | code lang
  code: string
}

export interface ChatMessage {
  id: string
  role: Role
  text: string
  thinking?: string
  attachments?: Attachment[]
  toolCalls?: ToolCall[]
  artifacts?: Artifact[]
  fileOutputs?: { path: string; name: string }[]
  pendingPermission?: PermissionRequest
  model?: string
  usage?: { input_tokens: number; output_tokens: number }
  createdAt: number
  error?: string
}

export interface Chat {
  id: string
  title: string
  projectId?: string | null
  model: string
  pinned?: boolean
  incognito?: boolean
  workdir?: string | null
  permissionMode?: PermissionMode
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface Project {
  id: string
  name: string
  instructions: string // custom system prompt for this project
  knowledge: { id: string; name: string; text: string }[]
  createdAt: number
}

export interface Skill {
  id: string
  name: string
  description: string
  instructions: string
  enabled: boolean
}

export interface ResponseStyle {
  id: string
  name: string
  instructions: string
  builtin?: boolean
}

export const BUILTIN_STYLES: ResponseStyle[] = [
  { id: 'normal', name: 'Normal', instructions: '', builtin: true },
  {
    id: 'concise',
    name: 'Concise',
    instructions:
      'Respond concisely. Lead with the answer, keep to the essential points, and avoid preamble, filler, and repetition. Use short paragraphs or tight lists.',
    builtin: true
  },
  {
    id: 'explanatory',
    name: 'Explanatory',
    instructions:
      'Respond in an educational, thorough way. Explain your reasoning, define terms, give examples and analogies, and anticipate follow-up questions so the reader comes away understanding the topic deeply.',
    builtin: true
  },
  {
    id: 'formal',
    name: 'Formal',
    instructions:
      'Respond in a professional, formal register. Use complete sentences, precise vocabulary, and a neutral, business-appropriate tone. Avoid slang, contractions, and casual asides.',
    builtin: true
  }
]

export interface Settings {
  defaultModel: string
  theme: 'light' | 'dark' | 'system'
  fontSize: number
  personalInstructions: string // global custom instructions
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  maxTokens: number
  thinking: boolean
  memory: boolean // persistent memory across chats
  responseStyle: string // built-in or custom style id
  customStyles: ResponseStyle[]
  tools: {
    webSearch: boolean
    webFetch: boolean
    codeExecution: boolean
    research: boolean
    chatSearch: boolean // let Claude search prior conversations
    browser: boolean // in-app controllable browser (computer use)
  }
}

export interface McpServerStatus {
  name: string
  connected: boolean
  error?: string
  tools: { name: string; description: string }[]
}

export interface ModelInfo {
  id: string
  displayName: string
  maxOutput: number
  contextWindow: number
}

// ---- Chat request from renderer -> main ----
export interface ChatRequest {
  streamId: string
  chatId: string
  model: string
  system: string
  messages: { role: Role; content: string | ContentBlock[] }[]
  thinking: boolean
  effort: string
  maxTokens: number
  cowork: boolean
  memory: boolean
  research: boolean
  chatSearch: boolean
  browser: boolean
  incognito: boolean
  workdir?: string | null
  permissionMode: PermissionMode
  tools: { webSearch: boolean; webFetch: boolean; codeExecution: boolean; research?: boolean; chatSearch?: boolean; browser?: boolean }
}

// ---- Stream events main -> renderer ----
export type StreamEvent =
  | { streamId: string; type: 'text_delta'; text: string }
  | { streamId: string; type: 'thinking_delta'; text: string }
  | { streamId: string; type: 'tool_start'; name: string; input?: any }
  | { streamId: string; type: 'tool_done'; name: string; result?: string }
  | { streamId: string; type: 'file_output'; path: string; name: string }
  | { streamId: string; type: 'permission'; request: PermissionRequest }
  | { streamId: string; type: 'usage'; usage: { input_tokens: number; output_tokens: number } }
  | { streamId: string; type: 'title'; chatId: string; title: string }
  | { streamId: string; type: 'done' }
  | { streamId: string; type: 'error'; error: string }

export const DEFAULT_SETTINGS: Settings = {
  defaultModel: 'claude-fable-5',
  theme: 'light',
  fontSize: 16,
  personalInstructions: '',
  effort: 'high',
  maxTokens: 32000,
  thinking: true,
  memory: true,
  responseStyle: 'normal',
  customStyles: [],
  tools: { webSearch: true, webFetch: true, codeExecution: false, research: false, chatSearch: true, browser: false }
}

// Fallback list, merged with whatever the live /v1/models endpoint returns so the
// picker is never empty and new models appear automatically once released.
export const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'claude-fable-5', displayName: 'Claude Fable 5', maxOutput: 128000, contextWindow: 1000000 },
  { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8', maxOutput: 128000, contextWindow: 1000000 },
  { id: 'claude-sonnet-5', displayName: 'Claude Sonnet 5', maxOutput: 128000, contextWindow: 1000000 },
  { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5', maxOutput: 64000, contextWindow: 200000 }
]
