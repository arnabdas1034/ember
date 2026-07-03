import Anthropic from '@anthropic-ai/sdk'
import type { BrowserWindow } from 'electron'
import type { ChatRequest, ModelInfo, StreamEvent } from '../shared/types'
import { FALLBACK_MODELS } from '../shared/types'
import { join } from 'node:path'
import { buildTools } from './tools'
import { executeMemoryCommand, memoryDigest } from './memory'
import { mcp } from './mcp'
import { agentToolDefs, isAgentTool, executeAgentTool, makeAgentCtx, dirLabel } from './agent'
import { BROWSER_TOOLS, isBrowserTool, runBrowserTool } from './browser'
import { store } from './store'

// Client-executed tool that lets Claude look through the user's past conversations.
function chatSearchToolDef(): any {
  return {
    name: 'search_past_chats',
    description:
      "Search the user's previous conversations for relevant context (things discussed before, decisions, facts they mentioned). Use when the user refers to something from an earlier chat, or when prior context would help.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Keywords to search for across past chats.' } },
      required: ['query']
    }
  }
}

const RESEARCH_PROMPT = `You are in Research mode. Conduct an exhaustive, multi-step investigation before answering:
1. Break the question into sub-questions and angles worth covering.
2. Use web_search repeatedly — different phrasings, follow-up queries, recent-date queries. Do not stop after one or two searches.
3. Use web_fetch to read the most promising sources in full, not just snippets.
4. Cross-check important claims across at least two independent sources; note disagreements.
5. Deliver a structured report: a direct headline answer first, then key findings, then supporting detail, and finish with a "Sources" section listing every URL you used.`

const MEMORY_PROMPT = `You have a persistent memory directory at /memories (via the memory tool). It persists across all conversations with this user. At the start of substantive tasks, check relevant memory files. Save durable facts the user shares (preferences, projects, context about who they are), corrections they give you, and important conclusions — one topic per file, concise markdown. Update or delete stale entries rather than duplicating. Don't store secrets or trivia.`

export function makeClient(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: false })
}

// Verify a key by hitting the (cheap, token-free) models endpoint.
export async function testKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = makeClient(apiKey)
    await client.models.list()
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

// Fetch the live model list and merge with the fallback so the picker always has
// the current defaults AND anything newly released by Anthropic shows up here.
export async function listModels(apiKey: string): Promise<ModelInfo[]> {
  const merged = new Map<string, ModelInfo>()
  for (const m of FALLBACK_MODELS) merged.set(m.id, m)
  try {
    const client = makeClient(apiKey)
    const page = await client.models.list()
    for (const m of (page as any).data || []) {
      merged.set(m.id, {
        id: m.id,
        displayName: m.display_name || m.id,
        maxOutput: m.max_tokens || 0,
        contextWindow: m.max_input_tokens || 0
      })
    }
  } catch {
    // offline / bad key — fall back to the built-in list
  }
  // Keep newest-first-ish ordering: known good models first, then the rest.
  const order = ['fable-5', 'mythos-5', 'opus-4-8', 'sonnet-5', 'opus', 'sonnet', 'haiku']
  return [...merged.values()].sort((a, b) => {
    const ai = order.findIndex((o) => a.id.includes(o))
    const bi = order.findIndex((o) => b.id.includes(o))
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })
}

// Ask a cheap model to name the conversation.
export async function generateTitle(apiKey: string, firstUserText: string): Promise<string> {
  try {
    const client = makeClient(apiKey)
    const res: any = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 24,
      messages: [
        {
          role: 'user',
          content: `Give a short 3-5 word title (no quotes, no punctuation at the end) for a conversation that starts with:\n\n"${firstUserText.slice(0, 500)}"`
        }
      ]
    } as any)
    const text = (res.content || []).find((b: any) => b.type === 'text')?.text || ''
    return text.trim().replace(/^["']|["']$/g, '').slice(0, 60) || 'New chat'
  } catch {
    return 'New chat'
  }
}

// Tidy a raw speech-to-text transcript into a clean prompt — remove filler
// ("um", "uh", false starts, repeats), fix obvious mis-hearings, keep meaning.
// This is the Wispr-Flow-style cleanup step; runs on cheap Haiku, your key.
export async function cleanTranscript(apiKey: string, raw: string): Promise<string> {
  const text = raw.trim()
  if (!text) return ''
  try {
    const client = makeClient(apiKey)
    const res: any = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system:
        'You clean up raw voice dictation into a tight written prompt. Remove filler words (um, uh, like, you know), false starts, and repetition. Fix obvious transcription errors. Keep the user\'s intent and all real content. Do NOT answer, explain, or add anything — output ONLY the cleaned text, nothing else.',
      messages: [{ role: 'user', content: text }]
    } as any)
    const out = (res.content || []).find((b: any) => b.type === 'text')?.text || text
    return out.trim()
  } catch {
    return text
  }
}

interface Live {
  cancelled: boolean
  stream?: any
}
const controllers = new Map<string, Live>()

export function stopStream(streamId: string) {
  const live = controllers.get(streamId)
  if (live) {
    live.cancelled = true
    try {
      live.stream?.abort?.()
    } catch {
      /* ignore */
    }
  }
}

function wantsThinking(model: string): boolean {
  // Fable/Opus4.8/Sonnet5 support adaptive thinking. Always safe to enable.
  return true
}

const AGENT_PROMPT = (dir: string) =>
  `You are acting as a coding agent with local tools (run_command, read_file, write_file, edit_file, list_files) operating in the directory "${dir}". Explore before editing: list and read relevant files first. Make focused changes. After edits that affect behaviour, run the project's tests or a build to verify. Prefer edit_file over rewriting whole files. Keep the user informed of what you're doing.`

// Execute one client-side tool call (agent, memory, MCP, chat search) → tool_result block.
async function runClientTool(userId: string, agentCtx: any, block: any, chatId?: string): Promise<any> {
  if (isAgentTool(block.name) && agentCtx) {
    const res = await executeAgentTool(agentCtx, block)
    return { type: 'tool_result', tool_use_id: block.id, content: res.text, is_error: res.isError }
  }
  if (isBrowserTool(block.name)) {
    const res = await runBrowserTool(block.name, block.input || {})
    return { type: 'tool_result', tool_use_id: block.id, content: res.content, is_error: res.isError }
  }
  if (block.name === 'search_past_chats') {
    const hits = store.searchChats(userId, block.input?.query || '', chatId)
    const content = hits.length
      ? hits
          .map(
            (h) =>
              `• [${new Date(h.when).toLocaleDateString()}] "${h.title}"\n  ${h.snippet}`
          )
          .join('\n\n')
      : 'No relevant past conversations found.'
    return { type: 'tool_result', tool_use_id: block.id, content }
  }
  if (block.name === 'memory') {
    try {
      return { type: 'tool_result', tool_use_id: block.id, content: executeMemoryCommand(userId, block.input) }
    } catch (e: any) {
      return { type: 'tool_result', tool_use_id: block.id, content: String(e?.message || e), is_error: true }
    }
  }
  if (mcp.isMcpTool(userId, block.name)) {
    const res = await mcp.callTool(userId, block.name, block.input)
    return { type: 'tool_result', tool_use_id: block.id, content: res.text, is_error: res.isError }
  }
  return { type: 'tool_result', tool_use_id: block.id, content: `Tool ${block.name} is not available.`, is_error: true }
}

// Run one full assistant turn (including server-tool pause_turn loops and
// client-tool round trips for memory/MCP) and stream events to the renderer.
export async function runChat(win: BrowserWindow, apiKey: string, req: ChatRequest, userId: string) {
  const client = makeClient(apiKey)
  const live: Live = { cancelled: false }
  controllers.set(req.streamId, live)

  const send = (ev: Omit<StreamEvent, 'streamId'>) =>
    win.webContents.send('stream', { streamId: req.streamId, ...ev } as StreamEvent)

  const hasWorkdir = !!req.workdir
  const agentCtx = hasWorkdir
    ? makeAgentCtx(win, req.streamId, req.workdir as string, req.permissionMode || 'ask', userId, () => live.cancelled)
    : null

  const tools = [
    ...buildTools(req),
    ...(hasWorkdir ? agentToolDefs() : []),
    ...(req.browser ? BROWSER_TOOLS : []),
    ...(req.chatSearch && !req.incognito ? [chatSearchToolDef()] : []),
    ...mcp.toolDefinitions(userId)
  ]
  const messages = req.messages.map((m) => ({ role: m.role, content: m.content }))

  const systemParts = [req.system]
  if (req.research) systemParts.push(RESEARCH_PROMPT)
  if (hasWorkdir) systemParts.push(AGENT_PROMPT(dirLabel(req.workdir as string)))
  if (hasWorkdir && req.permissionMode === 'plan') {
    systemParts.push(
      'PLAN MODE is active. Do not modify files or run commands — those tools are disabled. Investigate by reading and listing files, then present a clear, concrete step-by-step plan and ask the user to review it and switch off plan mode before you make any changes.'
    )
  }
  if (req.memory) {
    const digest = memoryDigest(userId)
    systemParts.push(MEMORY_PROMPT + (digest ? `\n\n${digest}` : ''))
  }
  const system = systemParts.filter(Boolean).join('\n\n---\n\n')

  const baseParams: any = {
    model: req.model,
    max_tokens: Math.max(1024, req.maxTokens || 32000),
    system: system || undefined,
    tools: tools.length ? tools : undefined,
    output_config: { effort: req.research ? 'high' : req.effort || 'high' }
  }
  if (req.thinking && wantsThinking(req.model)) {
    baseParams.thinking = { type: 'adaptive', display: 'summarized' }
  }

  try {
    let guard = 0
    const maxLoops = req.research ? 40 : 20
    while (guard++ < maxLoops) {
      if (live.cancelled) break

      const stream = client.messages.stream({ ...baseParams, messages }) as any
      live.stream = stream

      stream.on('streamEvent', (event: any) => {
        if (event.type === 'content_block_start') {
          const cb = event.content_block
          if (cb?.type === 'server_tool_use' || cb?.type === 'tool_use') {
            send({ type: 'tool_start', name: cb.name, input: cb.input })
          }
        } else if (event.type === 'content_block_delta') {
          const d = event.delta
          if (d?.type === 'text_delta') send({ type: 'text_delta', text: d.text })
          else if (d?.type === 'thinking_delta') send({ type: 'thinking_delta', text: d.thinking })
        }
      })

      let final: any
      try {
        final = await stream.finalMessage()
      } catch (e: any) {
        if (live.cancelled) break
        throw e
      }
      if (live.cancelled) break

      if (final.usage) {
        send({
          type: 'usage',
          usage: {
            input_tokens: final.usage.input_tokens || 0,
            output_tokens: final.usage.output_tokens || 0
          }
        })
      }

      // Handle a refusal gracefully.
      if (final.stop_reason === 'refusal') {
        const cat = final.stop_details?.category
        send({
          type: 'error',
          error: `The request was declined by safety classifiers${cat ? ` (${cat})` : ''}. Try rephrasing.`
        })
        break
      }

      // Server tools paused mid-loop → resume by re-sending with the assistant turn appended.
      if (final.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: final.content })
        continue
      }

      // Client-executed tools (agent, memory, MCP): run them, feed results back, loop.
      if (final.stop_reason === 'tool_use') {
        const toolUses = (final.content || []).filter((b: any) => b.type === 'tool_use')
        if (!toolUses.length) break
        // Agent tools run sequentially (permission prompts + ordered file ops);
        // memory/MCP can run concurrently. Keep it simple: sequential for all.
        const results: any[] = []
        for (const b of toolUses) {
          if (live.cancelled) break
          const r = await runClientTool(userId, agentCtx, b, req.chatId)
          send({ type: 'tool_done', name: b.name, result: typeof r.content === 'string' ? r.content.slice(0, 400) : '' })
          // Surface files the agent created/edited as downloadable outputs.
          if ((b.name === 'write_file' || b.name === 'edit_file') && !r.is_error && req.workdir && b.input?.path) {
            send({ type: 'file_output', path: join(req.workdir as string, b.input.path), name: b.input.path })
          }
          results.push(r)
        }
        if (live.cancelled) break
        messages.push({ role: 'assistant', content: final.content })
        messages.push({ role: 'user', content: results })
        continue
      }

      break
    }
    send({ type: 'done' })
  } catch (e: any) {
    const msg = e?.error?.error?.message || e?.message || String(e)
    send({ type: 'error', error: msg })
  } finally {
    controllers.delete(req.streamId)
  }
}
