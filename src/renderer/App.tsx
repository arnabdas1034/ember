import React, { useEffect } from 'react'
import { useStore } from './store'
import { AuthScreen } from './components/AuthScreen'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { ProjectsView } from './components/ProjectsView'
import { SkillsManager } from './components/SkillsManager'
import { ArtifactPanel } from './components/ArtifactPanel'
import { SettingsModal } from './components/SettingsModal'
import { VoiceMode } from './components/VoiceMode'
import { Spark } from './components/Icons'

export default function App() {
  const { ready, user, view, artifactId, showSettings, settings, bootstrap, receiveQuick, voiceMode, setVoiceMode } =
    useStore()

  useEffect(() => {
    bootstrap()
  }, [])

  // Messages fired from the Quick Entry overlay.
  useEffect(() => {
    const off = window.ember.quick.onMessage((payload) => {
      receiveQuick(payload).catch(() => {})
    })
    return off
  }, [receiveQuick])

  // Esc exits voice mode.
  useEffect(() => {
    if (!voiceMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVoiceMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [voiceMode, setVoiceMode])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size-base', `${settings.fontSize}px`)
  }, [settings.fontSize])

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mql.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    window.ember.ui.setTheme(settings.theme).catch(() => {})
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [settings.theme])

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center bg-cream">
        <Spark size={38} className="text-clay animate-pulse" />
      </div>
    )
  }

  if (!user) return <AuthScreen />

  return (
    <div className="h-full flex bg-cream text-ink">
      <Sidebar />
      <main className="flex-1 min-w-0 flex">
        <div className="flex-1 min-w-0 flex flex-col">
          {view === 'chat' && <ChatView />}
          {view === 'projects' && <ProjectsView />}
          {view === 'skills' && <SkillsManager />}
        </div>
        {artifactId && <ArtifactPanel />}
      </main>
      {showSettings && <SettingsModal />}
      {voiceMode && <VoiceMode />}
    </div>
  )
}
