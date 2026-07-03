import React, { useState } from 'react'
import { useStore } from '../store'
import { uid } from '../api'
import { Layers, Plus, Trash, X } from './Icons'
import type { Skill } from '@shared/types'

export function SkillsManager() {
  const { skills, saveSkill, deleteSkill } = useStore()
  const [editing, setEditing] = useState<Skill | null>(null)

  const blank = (): Skill => ({ id: uid(), name: '', description: '', instructions: '', enabled: true })

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-3xl text-ink flex items-center gap-2">
              <Layers size={26} className="text-clay" /> Skills
            </h1>
            <p className="text-ink-faint text-sm mt-1">
              Reusable instruction packs. Enabled skills are offered to Claude and applied when relevant.
            </p>
          </div>
          <button
            onClick={() => setEditing(blank())}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-clay text-white text-sm font-medium hover:bg-clay-dark"
          >
            <Plus size={17} /> New skill
          </button>
        </div>

        <div className="space-y-3">
          {skills.map((s) => (
            <div key={s.id} className="border border-line rounded-2xl bg-cream-panel p-5 flex items-start gap-4 group">
              <div className="w-10 h-10 rounded-xl bg-clay/12 text-clay flex items-center justify-center shrink-0">
                <Layers size={19} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-ink">{s.name || 'Untitled skill'}</h3>
                <p className="text-sm text-ink-faint mt-0.5">{s.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => saveSkill({ ...s, enabled: !s.enabled })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${s.enabled ? 'bg-clay' : 'bg-line-strong'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-cream shadow transition-all ${s.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
                <button onClick={() => setEditing(s)} className="px-3 py-1.5 rounded-lg border border-line text-sm hover:bg-cream-sunk">
                  Edit
                </button>
                <button onClick={() => deleteSkill(s.id)} className="p-1.5 rounded-lg text-ink-faint opacity-0 group-hover:opacity-100 hover:text-red-500">
                  <Trash size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <SkillEditor
          skill={editing}
          onClose={() => setEditing(null)}
          onSave={(s) => {
            saveSkill(s)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function SkillEditor({ skill, onClose, onSave }: { skill: Skill; onClose: () => void; onSave: (s: Skill) => void }) {
  const [draft, setDraft] = useState<Skill>(skill)
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div className="bg-cream-panel rounded-2xl shadow-2xl w-full max-w-xl p-6 fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-xl">{skill.name ? 'Edit skill' : 'New skill'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-cream-sunk text-ink-soft">
            <X size={18} />
          </button>
        </div>

        <label className="block text-xs font-medium text-ink-soft mb-1.5">Name</label>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-cream text-sm mb-4 outline-none focus:border-clay/60"
          placeholder="e.g. SQL expert"
        />

        <label className="block text-xs font-medium text-ink-soft mb-1.5">Short description</label>
        <input
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-cream text-sm mb-4 outline-none focus:border-clay/60"
          placeholder="When should this skill kick in?"
        />

        <label className="block text-xs font-medium text-ink-soft mb-1.5">Instructions (markdown)</label>
        <textarea
          value={draft.instructions}
          onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
          rows={9}
          className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-cream text-sm mb-5 outline-none focus:border-clay/60 resize-none font-mono"
          placeholder="The full guidance Claude should follow when this skill applies…"
        />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-ink-soft hover:bg-cream-sunk">
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            disabled={!draft.name.trim()}
            className="px-4 py-2 rounded-xl bg-clay text-white text-sm font-medium hover:bg-clay-dark disabled:opacity-40"
          >
            Save skill
          </button>
        </div>
      </div>
    </div>
  )
}
