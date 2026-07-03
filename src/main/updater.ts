import { app, type BrowserWindow } from 'electron'

// Auto-update via a GitHub Releases feed (configured in package.json > build.publish).
// electron-updater reads the generated app-update.yml, polls the GitHub repo's
// Releases, and downloads any newer version. Publishing a new release (a newer
// version tag + the built dmg/zip assets) is all that's needed for installed
// copies to update themselves — including picking up newly-added features.

let cached: any = null
async function updater() {
  if (!cached) {
    const mod = await import('electron-updater')
    cached = (mod as any).autoUpdater
    cached.autoDownload = true
    cached.autoInstallOnAppQuit = true
  }
  return cached
}

function notify(win: BrowserWindow | null, channel: string, payload?: any) {
  win?.webContents.send(channel, payload)
}

// Wire background checks at startup. No-ops safely when unpackaged or when no
// publish feed is configured (e.g. before the user sets their GitHub repo).
export async function initAutoUpdate(win: BrowserWindow | null) {
  if (!app.isPackaged) return
  try {
    const au = await updater()
    au.on('update-available', (info: any) => notify(win, 'app:update-available', { version: info?.version }))
    au.on('download-progress', (p: any) => notify(win, 'app:update-progress', { percent: Math.round(p?.percent || 0) }))
    au.on('update-downloaded', (info: any) => notify(win, 'app:update-ready', { version: info?.version }))
    au.on('error', () => {})
    await au.checkForUpdates()
  } catch {
    // No feed configured yet — silent.
  }
}

// Manual "Check for updates" from the UI. Returns a small status object.
export async function checkForUpdates(win: BrowserWindow | null, interactive = false): Promise<{ status: string; version?: string; error?: string }> {
  if (!app.isPackaged) return { status: 'dev', version: app.getVersion() }
  try {
    const au = await updater()
    const result: any = await au.checkForUpdates()
    const latest = result?.updateInfo?.version
    if (latest && latest !== app.getVersion()) {
      if (interactive) au.downloadUpdate().catch(() => {})
      return { status: 'available', version: latest }
    }
    return { status: 'current', version: app.getVersion() }
  } catch (e: any) {
    return { status: 'error', error: e?.message || 'Update check failed (no feed configured yet).' }
  }
}

// Called from the renderer's "Restart to update" button.
export async function quitAndInstall() {
  try {
    const au = await updater()
    au.quitAndInstall()
  } catch {
    /* ignore */
  }
}
