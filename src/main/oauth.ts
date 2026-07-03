import { createServer } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { shell } from 'electron'

// Interactive OAuth 2.0 (Authorization Code + PKCE) with a loopback redirect —
// the standard way a desktop app signs the user into a provider. Ember opens the
// system browser, captures the redirect on a temporary localhost server, and
// exchanges the code for an access token. The resulting token is stored as a
// bearer header on a remote MCP connector.
//
// Note: the provider (Google, Slack, Notion, …) must have an OAuth app registered
// with the redirect URI http://127.0.0.1:<port>/callback allowed. Because the port
// is dynamic, register http://127.0.0.1 as an allowed loopback (most providers
// permit any loopback port for native apps).

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface OAuthConfig {
  authUrl: string
  tokenUrl: string
  clientId: string
  clientSecret?: string
  scope?: string
  extraAuthParams?: Record<string, string>
}

export interface OAuthResult {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
}

export function runOAuth(cfg: OAuthConfig): Promise<OAuthResult> {
  return new Promise((resolve, reject) => {
    const state = base64url(randomBytes(16))
    const verifier = base64url(randomBytes(32))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    let settled = false

    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      if (!url.pathname.startsWith('/callback')) {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const retState = url.searchParams.get('state')
      const err = url.searchParams.get('error')

      const finish = (ok: boolean, msg: string) => {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end(
          `<html><body style="font-family:system-ui;background:#F5F4EE;color:#2A2622;display:flex;height:100vh;align-items:center;justify-content:center;margin:0"><div style="text-align:center"><div style="font-size:40px;color:${ok ? '#CC785C' : '#c0392b'}">${ok ? '✓' : '✕'}</div><h2>${msg}</h2><p style="color:#8A8175">You can close this tab and return to Ember.</p></div></body></html>`
        )
        server.close()
      }

      if (err) {
        finish(false, 'Authorization failed')
        if (!settled) {
          settled = true
          reject(new Error(err))
        }
        return
      }
      if (!code || retState !== state) {
        finish(false, 'Invalid response')
        if (!settled) {
          settled = true
          reject(new Error('State mismatch or missing code.'))
        }
        return
      }

      try {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: `http://127.0.0.1:${port}/callback`,
          client_id: cfg.clientId,
          code_verifier: verifier,
          ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {})
        })
        const tokenRes = await fetch(cfg.tokenUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
          body
        })
        const json: any = await tokenRes.json()
        if (!tokenRes.ok || !json.access_token) throw new Error(json.error_description || json.error || 'Token exchange failed')
        finish(true, 'Connected to Ember')
        if (!settled) {
          settled = true
          resolve(json)
        }
      } catch (e: any) {
        finish(false, 'Token exchange failed')
        if (!settled) {
          settled = true
          reject(e)
        }
      }
    })

    server.on('error', (e) => {
      if (!settled) {
        settled = true
        reject(e)
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: cfg.clientId,
        redirect_uri: `http://127.0.0.1:${port}/callback`,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        ...(cfg.scope ? { scope: cfg.scope } : {}),
        ...(cfg.extraAuthParams || {})
      })
      shell.openExternal(`${cfg.authUrl}?${params.toString()}`)
    })

    // Give the user 5 minutes to complete the browser flow.
    setTimeout(() => {
      if (!settled) {
        settled = true
        try {
          server.close()
        } catch {}
        reject(new Error('OAuth timed out. Please try again.'))
      }
    }, 300000)
  })
}
