import React, { useState } from 'react'
import { useStore } from '../store'
import { ember } from '../api'
import { Spark } from './Icons'
import type { PublicUser } from '@shared/types'

export function AuthScreen() {
  const setUser = useStore((s) => s.setUser)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = (await (mode === 'login'
        ? ember.auth.login(username, password)
        : ember.auth.register(username, password))) as PublicUser
      await setUser(user)
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-cream drag">
      <div className="no-drag w-[380px] fade-up">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-clay/12 flex items-center justify-center mb-4">
            <Spark size={30} className="text-clay" />
          </div>
          <h1 className="font-serif text-3xl text-ink">Ember</h1>
          <p className="text-ink-faint text-sm mt-1.5">Your Claude workspace, on your own key.</p>
        </div>

        <form onSubmit={submit} className="bg-cream-panel border border-line rounded-2xl p-6 shadow-sm">
          <div className="flex gap-1 p-1 bg-cream-sunk rounded-xl mb-5">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setError('')
                }}
                className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
                  mode === m ? 'bg-cream-panel text-ink shadow-sm font-medium' : 'text-ink-faint hover:text-ink-soft'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <label className="block text-xs font-medium text-ink-soft mb-1.5">Username</label>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-cream text-sm mb-4 outline-none focus:border-clay/60"
            placeholder="e.g. arnab"
          />

          <label className="block text-xs font-medium text-ink-soft mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-cream text-sm outline-none focus:border-clay/60"
            placeholder="••••••••"
          />

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <button
            type="submit"
            disabled={busy || !username || !password}
            className="w-full mt-5 py-2.5 rounded-xl bg-clay text-white text-sm font-medium hover:bg-clay-dark disabled:opacity-50 transition-colors"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-xs text-ink-faint mt-5 leading-relaxed">
          Each account keeps its own API key, chats, projects and skills — all stored locally and encrypted on this
          device.
        </p>
      </div>
    </div>
  )
}
