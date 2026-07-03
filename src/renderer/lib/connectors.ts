// Curated directory of popular MCP connectors — the "one-click" catalog, like
// Claude Desktop's connector list. Each entry produces an mcpServers config block.
// `needs` fields are collected from the user before adding (paths, tokens, keys).

export interface ConnectorField {
  key: string
  label: string
  placeholder: string
  target: 'arg' | 'env' | 'header'
  envKey?: string // for target 'env'
}

export interface ConnectorDef {
  id: string
  name: string
  description: string
  kind: 'local' | 'remote'
  command?: string
  args?: string[]
  argsAppendFields?: string[] // keys of `needs` appended to args in order
  env?: Record<string, string>
  url?: string
  headerTemplate?: Record<string, string> // may contain {{key}} placeholders
  needs?: ConnectorField[]
}

export const CONNECTORS: ConnectorDef[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read and write files in a folder you choose.',
    kind: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    argsAppendFields: ['path'],
    needs: [{ key: 'path', label: 'Folder path', placeholder: '/Users/you/Documents', target: 'arg' }]
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Search repos, read issues/PRs, manage files on GitHub.',
    kind: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '{{token}}' },
    needs: [{ key: 'token', label: 'GitHub personal access token', placeholder: 'ghp_…', target: 'env', envKey: 'GITHUB_PERSONAL_ACCESS_TOKEN' }]
  },
  {
    id: 'fetch',
    name: 'Web Fetch',
    description: 'Fetch and read the contents of any URL.',
    kind: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch']
  },
  {
    id: 'memory',
    name: 'Knowledge Graph Memory',
    description: 'A structured long-term memory graph the model can query.',
    kind: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory']
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Step-by-step structured reasoning scratchpad.',
    kind: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking']
  },
  {
    id: 'puppeteer',
    name: 'Browser (Puppeteer)',
    description: 'Drive a headless browser: navigate, click, screenshot, scrape.',
    kind: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer']
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query and modify a local SQLite database.',
    kind: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path'],
    argsAppendFields: ['db'],
    needs: [{ key: 'db', label: 'Database file path', placeholder: '/Users/you/data.db', target: 'arg' }]
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web search via the Brave Search API.',
    kind: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '{{key}}' },
    needs: [{ key: 'key', label: 'Brave API key', placeholder: 'BSA…', target: 'env', envKey: 'BRAVE_API_KEY' }]
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Read channels and post messages in your Slack workspace.',
    kind: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    env: { SLACK_BOT_TOKEN: '{{token}}', SLACK_TEAM_ID: '{{team}}' },
    needs: [
      { key: 'token', label: 'Slack bot token', placeholder: 'xoxb-…', target: 'env', envKey: 'SLACK_BOT_TOKEN' },
      { key: 'team', label: 'Slack team ID', placeholder: 'T01234567', target: 'env', envKey: 'SLACK_TEAM_ID' }
    ]
  },
  {
    id: 'remote-custom',
    name: 'Remote connector (URL + token)',
    description: 'Connect any hosted MCP server over HTTP with a bearer token.',
    kind: 'remote',
    url: '{{url}}',
    headerTemplate: { Authorization: 'Bearer {{token}}' },
    needs: [
      { key: 'url', label: 'Server URL', placeholder: 'https://mcp.example.com/mcp', target: 'header' },
      { key: 'token', label: 'Access token (optional)', placeholder: 'paste token', target: 'header' }
    ]
  }
]

// Build an mcpServers[name] block from a connector + collected field values.
export function buildServerConfig(def: ConnectorDef, values: Record<string, string>): any {
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_m, k) => values[k] ?? '')
  if (def.kind === 'remote') {
    const cfg: any = { url: fill(def.url || '') }
    if (def.headerTemplate) {
      const headers: Record<string, string> = {}
      for (const [h, v] of Object.entries(def.headerTemplate)) {
        const filled = fill(v)
        if (!filled.includes('Bearer ') || values['token']) headers[h] = filled
      }
      if (Object.keys(headers).length && values['token']) cfg.headers = headers
    }
    return cfg
  }
  const cfg: any = { command: def.command, args: [...(def.args || [])] }
  for (const k of def.argsAppendFields || []) if (values[k]) cfg.args.push(values[k])
  if (def.env) {
    cfg.env = {}
    for (const [k, v] of Object.entries(def.env)) cfg.env[k] = fill(v)
  }
  return cfg
}
