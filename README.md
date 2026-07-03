# Ember

A Claude-Desktop–style AI workspace that runs entirely on **your own Anthropic API key**. Multi-user, local-first, and self-hostable for cross-device sync.

Your API key is the fuel: every feature works through the Anthropic Messages API. No Anthropic account or subscription — you pay per token with your own key.

---

## Quick start (development)

```bash
cd ember
npm install
npm run dev
```

Create a local account, paste your Anthropic API key in **Settings → API key**, and start chatting.

## Build a macOS app

```bash
npm run fetch:model   # downloads the offline voice model into resources/ (once)
npm run dist:mac      # produces release/Ember-<version>-arm64.dmg
```

Open the `.dmg`, drag **Ember** to Applications. It's unsigned, so on first launch: right-click → **Open** → **Open**. (Buy an Apple Developer ID if you want to skip that; not required.)

---

## Features

**Chat** — streaming responses, extended thinking, stop/regenerate, edit-and-resend, image + PDF + text attachments, per-message token/cost, auto-titles, pin/rename/delete, search.

**Models** — live model list from your key, so new Claude models appear automatically. Effort and max-tokens controls.

**Projects** — custom instructions + knowledge files, scoped chats.

**Skills** — name + description + instructions, injected when relevant. Starter skills included.

**Memory** — persistent `/memories` per user; Claude remembers facts across every chat.

**Research mode** — exhaustive multi-search + full-page-read investigation with a cited report.

**Artifacts** — live preview of HTML, SVG, and React components in a side panel.

**Response styles** — Normal / Concise / Explanatory / Formal, plus your own custom styles.

**Incognito chats** — ephemeral, never written to disk, no memory writes.

**Past-chat search** — Claude can pull context from your earlier conversations.

**Voice**
- *Dictation* — record → local Whisper transcription (offline, bundled) → cheap-model cleanup → composer.
- *Voice mode* — hands-free two-way conversation: it listens, replies out loud, and listens again.

**Quick Entry** — press **⌘⇧Space** anywhere to summon a floating composer; drag a **screenshot** region and send it to a new chat.

**Cowork / Claude Code (local agent)** — open a folder and Claude gets `run_command`, `read_file`, `write_file`, `edit_file`, `list_files`, scoped to it. Permission modes: **Plan** (read-only, proposes a plan) · **Ask** · **Auto-accept edits** · **Bypass**. Approved commands are remembered across sessions (revoke in Settings → Tools). **Revert** undoes every file it changed.

**Browser (computer use)** — a visible browser window Claude can navigate, click, type, scroll, and screenshot.

**Connectors (MCP)** — one-click directory of popular servers (Filesystem, GitHub, Slack, Brave, SQLite, Puppeteer, …) plus raw `claude_desktop_config.json`-format config. Supports local (stdio) and remote (HTTP/SSE with bearer token) servers.

**Cloud code execution** — sandboxed environment for running code and analysing files.

**Themes** — light / dark / system.

**Auto-update** — checks a GitHub Releases feed and self-updates (set your repo in `package.json` → `build.publish`).

**Multi-user** — separate accounts on one machine, each with its own key, chats, and settings. API keys encrypted at rest via the OS keychain.

---

## Cross-device sync + web app (self-hosted)

The `server/` folder is a small self-hosted server so your devices — the desktop app and the browser — share one login and one set of data.

```bash
cd server
npm install
npm start        # runs on http://localhost:8787  (set PORT to change)
```

- **Web app**: open the server URL in any browser (including your phone). Log in, add your key, chat.
- **Desktop sync**: Settings → **Sync** → enter the server URL + create/login, then **Sync now**. Chats/projects/settings merge across every device (last-write-wins by timestamp).
- **Share links**: publish any conversation as a read-only public page at `/share/<id>`.

Run the server on a machine that stays on (your Mac, a spare box, or a small VPS). To reach it from outside your network, put it behind a tunnel like Tailscale rather than exposing a port. All data lives in `server/data/` — nothing leaves your own server. API keys are encrypted at rest.

Distribute the whole repo on GitHub and every user runs their own server — no shared service, no hosting cost for you.

---

## Architecture

- **Electron main** owns API-key storage, all Anthropic calls, tool execution, MCP, local agent, browser control, and sync. Renderer is sandboxed; the key never reaches it.
- **Renderer** — React + TypeScript + Tailwind, Zustand state.
- **Storage** — JSON in the app's userData dir (no native modules to rebuild). Keys via Electron `safeStorage`.
- **Server** — Express + JSON store; streams the Anthropic API to web/desktop clients and holds the synced source of truth.
