import React, { useEffect, useRef, useState } from 'react'
import { ember } from '../api'
import { Spark, Send, X } from './Icons'

// The floating Quick Entry overlay. Type a message (and optionally grab a
// screenshot region), then fire it into the main window as a new chat.
export function QuickEntry() {
  const [text, setText] = useState('')
  const [shot, setShot] = useState<{ data: string; mediaType: string } | null>(null)
  const [capturing, setCapturing] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const off = ember.quick.onFocus(() => {
      setText('')
      setShot(null)
      setTimeout(() => ref.current?.focus(), 30)
    })
    setTimeout(() => ref.current?.focus(), 50)
    return off
  }, [])

  const submit = () => {
    if (!text.trim() && !shot) return
    ember.quick.submit({ text: text.trim(), image: shot })
    setText('')
    setShot(null)
  }

  const capture = async () => {
    setCapturing(true)
    try {
      const img = await ember.quick.capture()
      if (img) setShot(img)
    } finally {
      setCapturing(false)
      setTimeout(() => ref.current?.focus(), 30)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') ember.quick.close()
    else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="w-screen h-screen p-3 bg-transparent" style={{ WebkitAppRegion: 'drag' } as any}>
      <div
        className="bg-cream-panel/95 backdrop-blur-xl border border-line-strong rounded-2xl shadow-2xl overflow-hidden"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-1" style={{ WebkitAppRegion: 'drag' } as any}>
          <div className="w-6 h-6 rounded-md bg-clay/15 text-clay flex items-center justify-center">
            <Spark size={15} />
          </div>
          <span className="text-sm font-medium text-ink">Ask Ember</span>
          <span className="text-[11px] text-ink-faint ml-auto">Enter to send · Esc to close</span>
        </div>

        {shot && (
          <div className="px-4 pt-2">
            <div className="relative inline-block">
              <img src={`data:${shot.mediaType};base64,${shot.data}`} className="h-16 rounded-lg border border-line" />
              <button onClick={() => setShot(null)} className="absolute -top-1.5 -right-1.5 bg-ink text-cream rounded-full p-0.5">
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder="Type your message, or grab a screenshot…"
          className="w-full bg-transparent resize-none outline-none px-4 py-3 text-[15px] leading-relaxed placeholder:text-ink-faint"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        />

        <div className="flex items-center gap-2 px-3 pb-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={capture}
            disabled={capturing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-sm text-ink-soft hover:bg-cream-sunk disabled:opacity-50"
          >
            {capturing ? 'Selecting…' : '⌘ Screenshot'}
          </button>
          <button
            onClick={submit}
            disabled={!text.trim() && !shot}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-clay text-white text-sm font-medium hover:bg-clay-dark disabled:opacity-40"
          >
            <Send size={15} /> Send
          </button>
        </div>
      </div>
    </div>
  )
}
