import { randomUUID } from 'node:crypto'
import { exec } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { resolve, join, dirname, relative } from 'node:path'
import type { BrowserWindow } from 'electron'
import type { PermissionMode, PermissionRequest } from '../shared/types'
import { store } from './store'

// Local coding agent — the "Claude Code inside" ability. Gives the model bash +
// file tools scoped to a working directory the user picks, with a 3-mode
// permission system (ask / acceptEdits / bypass) mirroring Claude Code.

// Pending approval prompts keyed by request id; resolved when the renderer replies.
const pending = new Map<string, (decision: string) => void>()

export function resolvePermission(id: string, decision: string) {
  const fn = pending.get(id)
  if (fn) {
    pending.delete(id)
    fn(decision)
  }
}

interface AgentCtx {
  win: BrowserWindow
  streamId: string
  workdir: string
  mode: PermissionMode
  userId: string
  alwaysAllow: Set<string> // categories approved for the rest of this run (session-scope)
  cancelled: () => boolean
}

// The tool definitions handed to the Messages API when a workdir is attached.
export function agentToolDefs(): any[] {
  return [
    {
      name: 'run_command',
      description:
        'Run a shell command in the working directory. Use for building, testing, running scripts, git, installing packages, etc.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to run.' },
          description: { type: 'string', description: 'A 3-6 word description of what this does.' }
        },
        required: ['command']
      }
    },
    {
      name: 'read_file',
      description: 'Read a file from the working directory.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path']
      }
    },
    {
      name: 'list_files',
      description: 'List files and folders under a path in the working directory (defaults to root).',
      input_schema: { type: 'object', properties: { path: { type: 'string' } } }
    },
    {
      name: 'write_file',
      description: 'Create or overwrite a file in the working directory.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content']
      }
    },
    {
      name: 'edit_file',
      description: 'Replace an exact string in a file. old_str must appear exactly once.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string' }, old_str: { type: 'string' }, new_str: { type: 'string' } },
        required: ['path', 'old_str', 'new_str']
      }
    }
  ]
}

const AGENT_TOOLS = new Set(['run_command', 'read_file', 'list_files', 'write_file', 'edit_file'])
export function isAgentTool(name: string): boolean {
  return AGENT_TOOLS.has(name)
}

// ---- Checkpoints: snapshot a file's content the first time the agent touches it,
// so the user can revert everything Claude Code changed. null = file was created.
const checkpoints = new Map<string, Map<string, string | null>>() // workdir -> path -> original

function snapshot(workdir: string, absPath: string) {
  let m = checkpoints.get(workdir)
  if (!m) {
    m = new Map()
    checkpoints.set(workdir, m)
  }
  if (!m.has(absPath)) m.set(absPath, existsSync(absPath) ? readFileSync(absPath, 'utf-8') : null)
}

export function changedFiles(workdir: string): string[] {
  return [...(checkpoints.get(workdir)?.keys() || [])]
}

export function revertChanges(workdir: string): number {
  const m = checkpoints.get(workdir)
  if (!m) return 0
  let n = 0
  for (const [absPath, original] of m) {
    try {
      if (original === null) {
        if (existsSync(absPath)) rmSync(absPath, { force: true })
      } else {
        writeFileSync(absPath, original)
      }
      n++
    } catch {
      /* ignore */
    }
  }
  checkpoints.delete(workdir)
  return n
}

function safePath(workdir: string, p: string): string {
  const full = resolve(workdir, p || '.')
  if (full !== workdir && !full.startsWith(workdir + '/')) {
    throw new Error(`Path escapes the working directory: ${p}`)
  }
  return full
}

// Decide whether a tool call may run, prompting the renderer when required.
// Precedence: bypass mode > reads (always) > persistent allowlist (across runs) >
// mode/session grants > prompt the user.
async function authorize(
  ctx: AgentCtx,
  category: 'command' | 'edit' | 'read',
  tool: string,
  summary: string,
  detail?: string
): Promise<boolean> {
  if (ctx.mode === 'bypass') return true
  if (category === 'read') return true

  if (category === 'edit') {
    if (ctx.mode === 'acceptEdits') return true
    if (store.isEditsAlways(ctx.userId, ctx.workdir)) return true
    if (ctx.alwaysAllow.has('edit')) return true
  }
  if (category === 'command') {
    if (detail && store.isCommandAllowed(ctx.userId, ctx.workdir, detail)) return true
    if (ctx.alwaysAllow.has('command')) return true
  }

  const request: PermissionRequest = { id: randomUUID(), tool, category, summary, detail }
  ctx.win.webContents.send('stream', { streamId: ctx.streamId, type: 'permission', request })
  const decision = await new Promise<string>((res) => {
    pending.set(request.id, res)
  })

  if (decision === 'allow_session') {
    ctx.alwaysAllow.add(category)
    return true
  }
  if (decision === 'allow_always') {
    // Persist to disk so this survives across chats and app restarts.
    if (category === 'command' && detail) store.allowCommand(ctx.userId, ctx.workdir, detail)
    else if (category === 'edit') store.allowEditsAlways(ctx.userId, ctx.workdir)
    return true
  }
  return decision === 'allow_once'
}

function runShell(command: string, cwd: string): Promise<string> {
  return new Promise((res) => {
    exec(command, { cwd, timeout: 120000, maxBuffer: 10 * 1024 * 1024, shell: '/bin/bash' }, (err, stdout, stderr) => {
      const out = [stdout, stderr].filter(Boolean).join('\n').trim()
      if (err && (err as any).killed) return res(`(timed out after 120s)\n${out}`)
      const code = (err as any)?.code
      res(`${out || '(no output)'}${code ? `\n[exit code ${code}]` : ''}`.slice(0, 60000))
    })
  })
}

// Execute one agent tool_use block. Returns the tool_result text (+ error flag).
export async function executeAgentTool(ctx: AgentCtx, block: any): Promise<{ text: string; isError: boolean }> {
  const { name, input } = block
  // Plan mode: investigation only. Reads are allowed; anything that changes state
  // is refused so the model proposes a plan instead of executing it.
  if (ctx.mode === 'plan' && (name === 'write_file' || name === 'edit_file' || name === 'run_command')) {
    return {
      text: 'Plan mode is active — no changes were made. Finish investigating, then present a concrete step-by-step plan for the user to approve before switching off plan mode.',
      isError: false
    }
  }
  try {
    if (name === 'run_command') {
      const cmd = String(input.command || '')
      const ok = await authorize(ctx, 'command', name, input.description || cmd.slice(0, 60), cmd)
      if (!ok) return { text: 'Denied by user.', isError: true }
      return { text: await runShell(cmd, ctx.workdir), isError: false }
    }
    if (name === 'read_file') {
      const target = safePath(ctx.workdir, input.path)
      await authorize(ctx, 'read', name, `Read ${input.path}`)
      if (!existsSync(target)) return { text: `File not found: ${input.path}`, isError: true }
      const lines = readFileSync(target, 'utf-8').split('\n')
      return { text: lines.map((l, i) => `${i + 1}\t${l}`).join('\n').slice(0, 60000), isError: false }
    }
    if (name === 'list_files') {
      const target = safePath(ctx.workdir, input.path || '.')
      await authorize(ctx, 'read', name, `List ${input.path || '.'}`)
      if (!existsSync(target)) return { text: 'Path not found.', isError: true }
      const entries = readdirSync(target, { withFileTypes: true })
        .filter((e) => !e.name.startsWith('.') || e.name === '.env')
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      return { text: entries.join('\n') || '(empty)', isError: false }
    }
    if (name === 'write_file') {
      const target = safePath(ctx.workdir, input.path)
      const exists = existsSync(target)
      const ok = await authorize(
        ctx,
        'edit',
        name,
        `${exists ? 'Overwrite' : 'Create'} ${input.path}`,
        String(input.content || '').slice(0, 4000)
      )
      if (!ok) return { text: 'Denied by user.', isError: true }
      snapshot(ctx.workdir, target)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, String(input.content ?? ''))
      return { text: `Wrote ${input.path}`, isError: false }
    }
    if (name === 'edit_file') {
      const target = safePath(ctx.workdir, input.path)
      if (!existsSync(target)) return { text: `File not found: ${input.path}`, isError: true }
      const text = readFileSync(target, 'utf-8')
      const oldStr = String(input.old_str ?? '')
      const count = text.split(oldStr).length - 1
      if (count === 0) return { text: 'old_str not found.', isError: true }
      if (count > 1) return { text: `old_str appears ${count} times; must be unique.`, isError: true }
      const ok = await authorize(ctx, 'edit', name, `Edit ${input.path}`, makeDiff(oldStr, String(input.new_str ?? '')))
      if (!ok) return { text: 'Denied by user.', isError: true }
      snapshot(ctx.workdir, target)
      writeFileSync(target, text.replace(oldStr, String(input.new_str ?? '')))
      return { text: `Edited ${input.path}`, isError: false }
    }
    return { text: `Unknown agent tool: ${name}`, isError: true }
  } catch (e: any) {
    return { text: e?.message || String(e), isError: true }
  }
}

function makeDiff(oldStr: string, newStr: string): string {
  const minus = oldStr.split('\n').map((l) => `- ${l}`).join('\n')
  const plus = newStr.split('\n').map((l) => `+ ${l}`).join('\n')
  return `${minus}\n${plus}`.slice(0, 4000)
}

export function makeAgentCtx(
  win: BrowserWindow,
  streamId: string,
  workdir: string,
  mode: PermissionMode,
  userId: string,
  cancelled: () => boolean
): AgentCtx {
  return { win, streamId, workdir, mode, userId, alwaysAllow: new Set(), cancelled }
}

export function dirLabel(workdir: string): string {
  return workdir.split('/').filter(Boolean).pop() || workdir
}
export { relative }
