import { app, BrowserWindow, shell, nativeTheme, protocol, net } from 'electron'
import { join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { store } from './store'
import { registerIpc } from './ipc'
import { initAutoUpdate } from './updater'
import { registerQuickEntry } from './quickentry'

let mainWindow: BrowserWindow | null = null

// Custom protocol used to serve the bundled offline voice model (Whisper) to the
// renderer's Transformers.js runtime — so speech-to-text needs no download.
// Must be registered as privileged before the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'emodel', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false } }
])

function modelsDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'models') : join(process.cwd(), 'resources', 'models')
}

function registerModelProtocol() {
  const root = modelsDir()
  protocol.handle('emodel', async (request) => {
    try {
      const { pathname } = new URL(request.url)
      const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
      const filePath = join(root, rel)
      if (filePath !== root && !filePath.startsWith(root + '/')) {
        return new Response('Forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 820,
    minHeight: 600,
    show: false,
    title: 'Ember',
    backgroundColor: '#F5F4EE',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Open external links in the system browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  store.init()
  registerModelProtocol()
  nativeTheme.themeSource = 'light'
  registerIpc(() => mainWindow)
  createWindow()
  registerQuickEntry(() => mainWindow)
  initAutoUpdate(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
