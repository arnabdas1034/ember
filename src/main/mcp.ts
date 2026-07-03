import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { McpServerStatus } from '../shared/types'

// MCP connector manager. Config uses the same JSON shape as Claude Desktop's
// claude_desktop_config.json:
//   { "mcpServers": { "<name>": { "command": "npx", "args": [...], "env": {...} } } }
// Servers are spawned over stdio, their tools are exposed to the model as
// custom tools named mcp__<server>__<tool>, and calls are routed back here.

interface Connected {
  client: Client
  tools: { name: string; description: string; inputSchema: any }[]
  error?: string
}

// GUI apps on macOS get a minimal PATH; extend it so npx/uvx/node resolve.
const SPAWN_PATH = [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
  .filter(Boolean)
  .join(':')

const connections = new Map<string, Map<string, Connected>>() // userId -> server -> conn
// prefixed tool name -> { server, tool } per user
const toolRoutes = new Map<string, Map<string, { server: string; tool: string }>>()

interface ServerCfg {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string // remote HTTP/SSE MCP server
  headers?: Record<string, string> // e.g. Authorization: Bearer <token>
  transport?: 'http' | 'sse'
}

function parseConfig(json: string | undefined | null): Record<string, ServerCfg> {
  if (!json?.trim()) return {}
  const parsed = JSON.parse(json)
  return parsed.mcpServers || {}
}

function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
}

async function connectServer(name: string, cfg: ServerCfg): Promise<Connected> {
  const client = new Client({ name: 'ember', version: '0.1.0' })
  let transport: any
  if (cfg.url) {
    // Remote connector (Streamable HTTP, or SSE fallback). The user supplies any
    // auth as headers (e.g. { "Authorization": "Bearer <token>" }), which is the
    // token half of OAuth — for providers that mint personal tokens this is all
    // that's needed; full interactive OAuth can be layered on the same transport.
    const url = new URL(cfg.url)
    const opts = cfg.headers ? { requestInit: { headers: cfg.headers } } : undefined
    transport = cfg.transport === 'sse' ? new SSEClientTransport(url, opts as any) : new StreamableHTTPClientTransport(url, opts as any)
  } else {
    transport = new StdioClientTransport({
      command: cfg.command!,
      args: cfg.args || [],
      env: { ...(process.env as Record<string, string>), ...(cfg.env || {}), PATH: SPAWN_PATH },
      stderr: 'ignore'
    })
  }
  await client.connect(transport)
  const listed = await client.listTools()
  return {
    client,
    tools: (listed.tools || []).map((t: any) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} }
    }))
  }
}

export const mcp = {
  // (Re)connect all servers in the user's config. Called on config save and
  // lazily before a chat that needs tools.
  async ensureConnected(userId: string, configJson: string | null): Promise<void> {
    let cfg: ReturnType<typeof parseConfig>
    try {
      cfg = parseConfig(configJson)
    } catch {
      return // invalid JSON — surfaced via status()
    }
    let userConns = connections.get(userId)
    if (!userConns) {
      userConns = new Map()
      connections.set(userId, userConns)
    }
    // Drop servers removed from config
    for (const name of [...userConns.keys()]) {
      if (!cfg[name]) {
        try {
          await userConns.get(name)?.client.close()
        } catch {}
        userConns.delete(name)
      }
    }
    // Connect new servers
    await Promise.all(
      Object.entries(cfg).map(async ([name, serverCfg]) => {
        if (userConns!.has(name) && !userConns!.get(name)!.error) return
        try {
          userConns!.set(name, await connectServer(name, serverCfg))
        } catch (e: any) {
          userConns!.set(name, { client: null as any, tools: [], error: e?.message || String(e) })
        }
      })
    )
    // Rebuild tool routes
    const routes = new Map<string, { server: string; tool: string }>()
    for (const [server, conn] of userConns) {
      for (const t of conn.tools) {
        routes.set(sanitizeToolName(`mcp__${server}__${t.name}`), { server, tool: t.name })
      }
    }
    toolRoutes.set(userId, routes)
  },

  async disconnectAll(userId: string): Promise<void> {
    const userConns = connections.get(userId)
    if (!userConns) return
    for (const conn of userConns.values()) {
      try {
        await conn.client?.close()
      } catch {}
    }
    connections.delete(userId)
    toolRoutes.delete(userId)
  },

  // Tool definitions for the Messages API `tools` array.
  toolDefinitions(userId: string): any[] {
    const userConns = connections.get(userId)
    if (!userConns) return []
    const defs: any[] = []
    for (const [server, conn] of userConns) {
      for (const t of conn.tools) {
        defs.push({
          name: sanitizeToolName(`mcp__${server}__${t.name}`),
          description: `[${server}] ${t.description}`.slice(0, 1024),
          input_schema: t.inputSchema
        })
      }
    }
    return defs
  },

  isMcpTool(userId: string, name: string): boolean {
    return toolRoutes.get(userId)?.has(name) || false
  },

  async callTool(userId: string, prefixedName: string, args: any): Promise<{ text: string; isError: boolean }> {
    const route = toolRoutes.get(userId)?.get(prefixedName)
    const conn = route && connections.get(userId)?.get(route.server)
    if (!route || !conn?.client) return { text: `Unknown tool: ${prefixedName}`, isError: true }
    try {
      const result: any = await conn.client.callTool({ name: route.tool, arguments: args || {} })
      const text = (result.content || [])
        .map((c: any) => (c.type === 'text' ? c.text : `[${c.type} content]`))
        .join('\n')
      return { text: text || '(no output)', isError: !!result.isError }
    } catch (e: any) {
      return { text: `Tool error: ${e?.message || e}`, isError: true }
    }
  },

  status(userId: string, configJson: string | null): McpServerStatus[] {
    let cfg: ReturnType<typeof parseConfig>
    try {
      cfg = parseConfig(configJson)
    } catch (e: any) {
      return [{ name: '(config)', connected: false, error: 'Invalid JSON: ' + (e?.message || ''), tools: [] }]
    }
    const userConns = connections.get(userId)
    return Object.keys(cfg).map((name) => {
      const conn = userConns?.get(name)
      return {
        name,
        connected: !!conn && !conn.error,
        error: conn?.error,
        tools: (conn?.tools || []).map((t) => ({ name: t.name, description: t.description }))
      }
    })
  }
}
