import { BrowserWindow } from 'electron'

// In-app controllable browser — Ember's "computer use" / Claude-in-Chrome ability.
// The model drives a real, visible browser window (navigate/click/type/scroll) and
// sees the result via screenshots returned as tool_result images. Scoped to a
// browser window, so Claude never touches the rest of your machine.

const VIEW_W = 1000
const VIEW_H = 720

let win: BrowserWindow | null = null

function ensureWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win
  win = new BrowserWindow({
    width: VIEW_W,
    height: VIEW_H + 40,
    title: 'Ember Browser — controlled by Claude',
    backgroundColor: '#ffffff',
    webPreferences: { sandbox: true, contextIsolation: true, javascript: true }
  })
  win.on('closed', () => (win = null))
  win.loadURL('about:blank')
  return win
}

const wc = () => ensureWindow().webContents

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function screenshotBlock() {
  await wait(400)
  const img = await wc().capturePage()
  const resized = img.resize({ width: VIEW_W })
  const data = resized.toPNG().toString('base64')
  return { type: 'image', source: { type: 'base64', media_type: 'image/png', data } }
}

async function result(text: string, withShot = true): Promise<{ content: any[]; isError: boolean }> {
  const blocks: any[] = [{ type: 'text', text }]
  if (withShot) {
    try {
      blocks.unshift(await screenshotBlock())
    } catch {
      /* ignore capture failure */
    }
  }
  return { content: blocks, isError: false }
}

// Simple US-keyboard key map for common named keys.
function sendKey(key: string) {
  const w = ensureWindow()
  const map: Record<string, string> = {
    enter: 'Return',
    return: 'Return',
    tab: 'Tab',
    escape: 'Escape',
    esc: 'Escape',
    backspace: 'Backspace',
    delete: 'Delete',
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    space: 'Space'
  }
  const keyCode = map[key.toLowerCase()] || key
  w.webContents.sendInputEvent({ type: 'keyDown', keyCode } as any)
  w.webContents.sendInputEvent({ type: 'char', keyCode } as any)
  w.webContents.sendInputEvent({ type: 'keyUp', keyCode } as any)
}

export const BROWSER_TOOLS = [
  {
    name: 'browser_navigate',
    description: 'Open a URL in the browser window. Returns a screenshot of the loaded page.',
    input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }
  },
  {
    name: 'browser_screenshot',
    description: `Take a screenshot of the current page. The viewport is ${VIEW_W}x${VIEW_H} pixels; coordinates for clicks are measured from the top-left.`,
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_click',
    description: 'Click at pixel coordinates (x, y) in the viewport. Returns a screenshot after the click.',
    input_schema: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y']
    }
  },
  {
    name: 'browser_type',
    description: 'Type text into the currently focused element (click a field first). Returns a screenshot.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
  },
  {
    name: 'browser_key',
    description: 'Press a key (e.g. "Enter", "Tab", "Escape", "ArrowDown"). Returns a screenshot.',
    input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] }
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page vertically by dy pixels (positive = down). Returns a screenshot.',
    input_schema: { type: 'object', properties: { dy: { type: 'number' } }, required: ['dy'] }
  },
  {
    name: 'browser_read',
    description: 'Return the visible text content of the current page (no screenshot).',
    input_schema: { type: 'object', properties: {} }
  }
]

const BROWSER_TOOL_NAMES = new Set(BROWSER_TOOLS.map((t) => t.name))
export function isBrowserTool(name: string): boolean {
  return BROWSER_TOOL_NAMES.has(name)
}

export async function runBrowserTool(name: string, input: any): Promise<{ content: any; isError: boolean }> {
  try {
    const w = ensureWindow()
    w.show()
    switch (name) {
      case 'browser_navigate': {
        let url = String(input.url || '')
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url
        await w.loadURL(url).catch(() => {})
        return result(`Navigated to ${url}`)
      }
      case 'browser_screenshot':
        return result('Current page:')
      case 'browser_click': {
        const x = Math.round(input.x)
        const y = Math.round(input.y)
        w.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 } as any)
        w.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 } as any)
        return result(`Clicked (${x}, ${y})`)
      }
      case 'browser_type': {
        w.webContents.insertText(String(input.text || ''))
        return result(`Typed: ${String(input.text || '').slice(0, 80)}`)
      }
      case 'browser_key': {
        sendKey(String(input.key || ''))
        return result(`Pressed ${input.key}`)
      }
      case 'browser_scroll': {
        const dy = Math.round(input.dy || 0)
        w.webContents.sendInputEvent({ type: 'mouseWheel', x: VIEW_W / 2, y: VIEW_H / 2, deltaX: 0, deltaY: -dy, canScroll: true } as any)
        return result(`Scrolled ${dy}px`)
      }
      case 'browser_read': {
        const text = await w.webContents.executeJavaScript('document.body ? document.body.innerText : ""').catch(() => '')
        return { content: String(text).slice(0, 20000) || '(empty page)', isError: false }
      }
      default:
        return { content: `Unknown browser tool: ${name}`, isError: true }
    }
  } catch (e: any) {
    return { content: `Browser error: ${e?.message || e}`, isError: true }
  }
}

export function closeBrowser() {
  if (win && !win.isDestroyed()) win.close()
  win = null
}
