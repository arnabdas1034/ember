import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { ember } from '../api'
import { VoiceRecorder, transcribe, speak, cancelSpeech } from '../lib/voice'
import { X } from './Icons'

type Phase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'

// Hands-free conversational voice mode: listen → transcribe (local Whisper) →
// send → speak the reply (browser TTS) → listen again. Fully local STT/TTS;
// only the model call uses the API key.
export function VoiceMode() {
  const { setVoiceMode, send, streamId } = useStore()
  const [phase, setPhase] = useState<Phase>('idle')
  const [caption, setCaption] = useState('Starting…')
  const recorder = useRef<VoiceRecorder | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const closedRef = useRef(false)
  const spokenRef = useRef<string>('')

  const setP = (p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }

  const startListening = async () => {
    if (closedRef.current) return
    try {
      cancelSpeech()
      recorder.current = new VoiceRecorder()
      setP('listening')
      setCaption('Listening…')
      await recorder.current.start(() => {
        // auto-stop on silence
        if (phaseRef.current === 'listening') finishListening()
      })
    } catch {
      setCaption('Microphone blocked. Enable mic access and reopen.')
      setP('idle')
    }
  }

  const finishListening = async () => {
    if (phaseRef.current !== 'listening') return
    setP('transcribing')
    setCaption('Transcribing…')
    try {
      const blob = await recorder.current!.stop()
      const raw = await transcribe(blob)
      const text = (raw || '').trim()
      if (!text) {
        setCaption("Didn't catch that — listening again…")
        return startListening()
      }
      setCaption(text)
      setP('thinking')
      await send(text, [])
    } catch {
      setCaption('Voice error — tap the orb to retry.')
      setP('idle')
    }
  }

  // When a response finishes streaming, speak it, then loop back to listening.
  useEffect(() => {
    if (phaseRef.current !== 'thinking' || streamId) return
    const st = useStore.getState()
    const chat = st.chats.find((c) => c.id === st.currentChatId)
    const lastAssistant = [...(chat?.messages || [])].reverse().find((m) => m.role === 'assistant')
    const reply = lastAssistant?.text?.trim()
    if (!reply || reply === spokenRef.current) return
    spokenRef.current = reply
    setP('speaking')
    setCaption(reply.slice(0, 400))
    speak(reply).then(() => {
      if (!closedRef.current) startListening()
    })
  }, [streamId])

  useEffect(() => {
    startListening()
    return () => {
      closedRef.current = true
      cancelSpeech()
      recorder.current?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = () => {
    closedRef.current = true
    cancelSpeech()
    recorder.current?.cancel()
    setVoiceMode(false)
  }

  const orbTap = () => {
    if (phase === 'listening') finishListening()
    else if (phase === 'speaking') {
      cancelSpeech()
      startListening()
    } else if (phase === 'idle') startListening()
  }

  const ring =
    phase === 'listening'
      ? 'bg-clay animate-pulse'
      : phase === 'speaking'
        ? 'bg-clay/80'
        : phase === 'thinking' || phase === 'transcribing'
          ? 'bg-ink-soft animate-pulse'
          : 'bg-ink-faint'

  const label =
    phase === 'listening'
      ? 'Listening'
      : phase === 'transcribing'
        ? 'Transcribing'
        : phase === 'thinking'
          ? 'Thinking'
          : phase === 'speaking'
            ? 'Speaking'
            : 'Paused'

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-cream/95 backdrop-blur-xl">
      <button onClick={close} className="absolute top-6 right-6 p-2 rounded-lg text-ink-soft hover:bg-cream-sunk" title="Exit voice mode (Esc)">
        <X size={22} />
      </button>

      <button onClick={orbTap} className="relative w-44 h-44 rounded-full flex items-center justify-center" title="Tap to interrupt / talk">
        <span className={`absolute inset-0 rounded-full ${ring} opacity-20`} />
        <span className={`absolute inset-6 rounded-full ${ring} opacity-30`} />
        <span className={`w-24 h-24 rounded-full ${ring} shadow-lg`} />
      </button>

      <div className="mt-10 text-sm font-medium text-clay uppercase tracking-wide">{label}</div>
      <p className="mt-3 max-w-lg text-center text-lg text-ink leading-relaxed px-6">{caption}</p>
      <p className="mt-8 text-xs text-ink-faint">Speak naturally — Ember replies out loud. Tap the orb to interrupt · Esc to exit.</p>
    </div>
  )
}
