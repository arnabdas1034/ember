import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, renameSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

// File-backed handler for Anthropic's client-executed memory tool
// ({type:"memory_20250818", name:"memory"}). The model reads/writes files under a
// virtual /memories directory; we map that to a per-user folder on disk so what
// Claude learns in one chat persists across every future chat.

function baseDir(userId: string): string {
  const dir = join(app.getPath('userData'), 'ember-data', 'memories', userId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

// Map a model-supplied /memories path to a real path, refusing escapes.
function realPath(userId: string, memPath: string): string {
  const base = baseDir(userId)
  let rel = String(memPath || '').trim()
  if (rel === '/memories' || rel === '/memories/') rel = ''
  else if (rel.startsWith('/memories/')) rel = rel.slice('/memories/'.length)
  else if (rel.startsWith('/')) rel = rel.slice(1)
  const full = resolve(base, rel)
  if (full !== base && !full.startsWith(base + '/')) {
    throw new Error(`Path must stay within /memories (got: ${memPath})`)
  }
  return full
}

function listDir(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      out.push(`${rel}/`)
      out.push(...listDir(join(dir, entry.name), rel))
    } else {
      out.push(rel)
    }
  }
  return out
}

export function executeMemoryCommand(userId: string, input: any): string {
  const cmd = input?.command
  switch (cmd) {
    case 'view': {
      const target = realPath(userId, input.path || '/memories')
      if (!existsSync(target)) return 'Directory is empty. No memories stored yet.'
      if (statSync(target).isDirectory()) {
        const entries = listDir(target)
        return entries.length
          ? `Contents of ${input.path || '/memories'}:\n${entries.map((e) => `- ${e}`).join('\n')}`
          : 'Directory is empty. No memories stored yet.'
      }
      const lines = readFileSync(target, 'utf-8').split('\n')
      const range: [number, number] | undefined = input.view_range
      const [from, to] = range ? [Math.max(1, range[0]), range[1] === -1 ? lines.length : range[1]] : [1, lines.length]
      return lines
        .slice(from - 1, to)
        .map((l, i) => `${from + i}: ${l}`)
        .join('\n')
    }
    case 'create': {
      const target = realPath(userId, input.path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, String(input.file_text ?? ''))
      return `File created: ${input.path}`
    }
    case 'str_replace': {
      const target = realPath(userId, input.path)
      const text = readFileSync(target, 'utf-8')
      const oldStr = String(input.old_str ?? '')
      const count = text.split(oldStr).length - 1
      if (count === 0) throw new Error('old_str not found in file.')
      if (count > 1) throw new Error(`old_str appears ${count} times; it must be unique.`)
      writeFileSync(target, text.replace(oldStr, String(input.new_str ?? '')))
      return `File updated: ${input.path}`
    }
    case 'insert': {
      const target = realPath(userId, input.path)
      const lines = readFileSync(target, 'utf-8').split('\n')
      const at = Math.max(0, Math.min(lines.length, Number(input.insert_line ?? 0)))
      lines.splice(at, 0, String(input.insert_text ?? ''))
      writeFileSync(target, lines.join('\n'))
      return `Inserted at line ${at} in ${input.path}`
    }
    case 'delete': {
      const target = realPath(userId, input.path)
      if (existsSync(target)) rmSync(target, { recursive: true })
      return `Deleted: ${input.path}`
    }
    case 'rename': {
      const from = realPath(userId, input.old_path)
      const to = realPath(userId, input.new_path)
      mkdirSync(dirname(to), { recursive: true })
      renameSync(from, to)
      return `Renamed ${input.old_path} -> ${input.new_path}`
    }
    default:
      throw new Error(`Unknown memory command: ${cmd}`)
  }
}

// Short digest of stored memories, injected into the system prompt so the model
// knows what it already knows without having to call view first.
export function memoryDigest(userId: string): string {
  try {
    const base = baseDir(userId)
    const entries = listDir(base).filter((e) => !e.endsWith('/'))
    if (!entries.length) return ''
    return `Your memory directory contains: ${entries.join(', ')}`
  } catch {
    return ''
  }
}
