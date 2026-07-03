import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Chevron } from './Icons'

export function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const models = useStore((s) => s.models)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const current = models.find((m) => m.id === value)
  const label = current?.displayName || value

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm text-ink-soft hover:bg-cream-sunk transition-colors"
      >
        <span className="font-medium">{label}</span>
        <Chevron size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-72 max-h-80 overflow-y-auto bg-cream-panel border border-line rounded-xl shadow-lg p-1.5 z-30">
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onChange(m.id)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-2 rounded-lg hover:bg-cream-sunk transition-colors ${
                m.id === value ? 'bg-cream-sunk' : ''
              }`}
            >
              <div className="text-sm font-medium text-ink">{m.displayName}</div>
              <div className="text-[11px] text-ink-faint font-mono">{m.id}</div>
            </button>
          ))}
          {models.length === 0 && <div className="px-3 py-2 text-xs text-ink-faint">Add an API key to load models.</div>}
        </div>
      )}
    </div>
  )
}
