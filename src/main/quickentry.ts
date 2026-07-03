import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import { exec } from 'node:child_process'
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Quick Entry — a global-shortcut overlay (like Claude Desktop's double-tap-Option
// panel). Summon a small floating composer from any app, optionally drag a
// screenshot region, and fire the message into the main window as a new chat.

let overlay: BrowserWindow | null = null
let getMain: () => BrowserWindow | null = () => null

const SHORTCUT = 'CommandOrControl+Shift+Space'

function createOverlay() {
  const { width } = screen.getPrimaryDisplay().workAreaSize
  overlay = new BrowserWindow({
    width: 640,
    height: 220,
    x: Math.round(width / 2 - 320),
    y: 140,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    transparent: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) overlay.loadURL(devUrl + '#quick')
  else overlay.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'quick' })

  overlay.on('blur', () => {
    // Hide when focus leaves, unless a screenshot picker is mid-capture.
    if (!capturing) hideOverlay()
  })
  overlay.on('closed', () => (overlay = null))
}

function showOverlay() {
  if (!overlay) createOverlay()
  overlay?.show()
  overlay?.focus()
  overlay?.webContents.send('quick:focus')
}

function hideOverlay() {
  overlay?.hide()
}

function toggleOverlay() {
  if (overlay?.isVisible()) hideOverlay()
  else showOverlay()
}

let capturing = false

// Interactive screenshot via macOS `screencapture`. mode 'region' = crosshair drag
// (-i), mode 'window' = click a window to capture it (-iW, like Claude's window
// context). Returns a base64 PNG, or null if the user cancels.
function capture(mode: 'region' | 'window' = 'region'): Promise<{ data: string; mediaType: string } | null> {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(null)
    capturing = true
    const out = join(tmpdir(), `ember-shot-${Date.now()}.png`)
    const flag = mode === 'window' ? '-iW' : '-i'
    // -x no sound. The app briefly hides so it isn't captured.
    const wasVisible = overlay?.isVisible()
    overlay?.hide()
    exec(`screencapture ${flag} -x "${out}"`, () => {
      capturing = false
      if (wasVisible) {
        overlay?.show()
        overlay?.focus()
      }
      if (existsSync(out)) {
        try {
          const data = readFileSync(out).toString('base64')
          rmSync(out, { force: true })
          resolve(data ? { data, mediaType: 'image/png' } : null)
        } catch {
          resolve(null)
        }
      } else {
        resolve(null) // cancelled
      }
    })
  })
}

export function registerQuickEntry(getMainWindow: () => BrowserWindow | null) {
  getMain = getMainWindow

  ipcMain.handle('quick:capture', (_e, mode?: 'region' | 'window') => capture(mode || 'region'))
  ipcMain.handle('quick:close', () => {
    hideOverlay()
    return { ok: true }
  })
  // Overlay submits → focus main window and hand it the message to send.
  ipcMain.handle('quick:submit', (_e, payload: { text: string; image?: { data: string; mediaType: string } | null }) => {
    hideOverlay()
    const main = getMain()
    if (main) {
      if (main.isMinimized()) main.restore()
      main.show()
      main.focus()
      main.webContents.send('quick:message', payload)
    }
    return { ok: true }
  })

  try {
    globalShortcut.register(SHORTCUT, toggleOverlay)
  } catch {
    /* shortcut unavailable */
  }
}

export function quickShortcutLabel() {
  return process.platform === 'darwin' ? '⌘⇧Space' : 'Ctrl+Shift+Space'
}

app.on('will-quit', () => globalShortcut.unregisterAll())
