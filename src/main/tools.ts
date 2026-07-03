import type { ChatRequest } from '../shared/types'

// Models that support the newer dynamic-filtering server-tool variants.
const NEW_TOOL_MODELS = ['fable-5', 'mythos-5', 'opus-4-8', 'opus-4-7', 'opus-4-6', 'sonnet-5', 'sonnet-4-6']

function supportsNewTools(model: string): boolean {
  return NEW_TOOL_MODELS.some((m) => model.includes(m))
}

// Build the `tools` array for the Messages API request based on which capabilities
// the user enabled. These are Anthropic server-side tools — no local execution needed.
export function buildTools(req: ChatRequest): any[] {
  const tools: any[] = []
  const wsVer = supportsNewTools(req.model) ? 'web_search_20260209' : 'web_search_20250305'
  const wfVer = 'web_fetch_20260209'

  // Research mode implies web search + fetch, with far more headroom for an
  // exhaustive multi-step investigation.
  const wantSearch = req.tools.webSearch || req.research
  const wantFetch = (req.tools.webFetch || req.research) && supportsNewTools(req.model)
  const searchUses = req.research ? 30 : 8
  const fetchUses = req.research ? 20 : 8

  if (wantSearch) {
    tools.push({ type: wsVer, name: 'web_search', max_uses: searchUses })
  }
  if (wantFetch) {
    tools.push({ type: wfVer, name: 'web_fetch', max_uses: fetchUses })
  }
  // In Cowork mode (or when explicitly enabled) give the model a sandboxed
  // code-execution environment — this is the "Claude Code / Cowork" ability.
  // Note: the new web_search variant already runs code under the hood, so only
  // declare a standalone code environment when web search is NOT using it.
  if ((req.tools.codeExecution || req.cowork) && !(wantSearch && supportsNewTools(req.model))) {
    tools.push({ type: 'code_execution_20260120', name: 'code_execution' })
  }
  // Persistent memory — client-executed; handled in the chat loop.
  if (req.memory) {
    tools.push({ type: 'memory_20250818', name: 'memory' })
  }
  return tools
}
