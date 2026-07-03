import React, { useState } from 'react'
import { useStore } from '../store'
import { uid } from '../api'
import { Book, Plus, Trash, X, File as FileIcon } from './Icons'
import type { Project } from '@shared/types'

export function ProjectsView() {
  const { projects, chats, saveProject, deleteProject, newChat, selectChat, setActiveProject } = useStore()
  const [editing, setEditing] = useState<Project | null>(null)

  const blank = (): Project => ({ id: uid(), name: '', instructions: '', knowledge: [], createdAt: Date.now() })

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-3xl text-ink flex items-center gap-2">
              <Book size={26} className="text-clay" /> Projects
            </h1>
            <p className="text-ink-faint text-sm mt-1">Give Claude persistent instructions and knowledge for a body of work.</p>
          </div>
          <button
            onClick={() => setEditing(blank())}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-clay text-white text-sm font-medium hover:bg-clay-dark"
          >
            <Plus size={17} /> New project
          </button>
        </div>

        {projects.length === 0 && (
          <div className="text-center py-20 text-ink-faint">
            <Book size={40} className="mx-auto mb-3 opacity-40" />
            No projects yet. Create one to bundle custom instructions and reference files.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {projects.map((p) => {
            const count = chats.filter((c) => c.projectId === p.id).length
            return (
              <div key={p.id} className="border border-line rounded-2xl bg-cream-panel p-5 group">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-clay/12 text-clay flex items-center justify-center mb-3">
                    <Book size={19} />
                  </div>
                  <button
                    onClick={() => deleteProject(p.id)}
                    className="p-1.5 rounded-lg text-ink-faint opacity-0 group-hover:opacity-100 hover:text-red-500"
                  >
                    <Trash size={15} />
                  </button>
                </div>
                <h3 className="font-serif text-lg text-ink">{p.name || 'Untitled project'}</h3>
                <p className="text-sm text-ink-faint mt-1 line-clamp-2 h-10">{p.instructions || 'No instructions set.'}</p>
                <div className="text-xs text-ink-faint mt-2">
                  {count} chat{count === 1 ? '' : 's'} · {p.knowledge.length} file{p.knowledge.length === 1 ? '' : 's'}
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => {
                      setActiveProject(p.id)
                      newChat(p.id)
                    }}
                    className="flex-1 px-3 py-2 rounded-lg bg-clay text-white text-sm hover:bg-clay-dark"
                  >
                    New chat
                  </button>
                  <button onClick={() => setEditing(p)} className="px-3 py-2 rounded-lg border border-line text-sm hover:bg-cream-sunk">
                    Edit
                  </button>
                </div>
                {count > 0 && (
                  <div className="mt-3 pt-3 border-t border-line/70 space-y-0.5">
                    {chats
                      .filter((c) => c.projectId === p.id)
                      .slice(0, 4)
                      .map((c) => (
                        <button
                          key={c.id}
                          onClick={() => selectChat(c.id)}
                          className="block w-full text-left text-sm text-ink-soft truncate hover:text-clay px-1 py-1 rounded"
                        >
                          {c.title}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {editing && (
        <ProjectEditor
          project={editing}
          onClose={() => setEditing(null)}
          onSave={(p) => {
            saveProject(p)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function ProjectEditor({ project, onClose, onSave }: { project: Project; onClose: () => void; onSave: (p: Project) => void }) {
  const [draft, setDraft] = useState<Project>(project)

  const addFiles = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.txt,.md,.json,.js,.ts,.py,.csv,.html'
    input.onchange = async () => {
      const files = Array.from(input.files || [])
      const loaded = await Promise.all(
        files.map(
          (f) =>
            new Promise<{ id: string; name: string; text: string }>((res) => {
              const r = new FileReader()
              r.onload = () => res({ id: uid(), name: f.name, text: String(r.result) })
              r.readAsText(f)
            })
        )
      )
      setDraft((d) => ({ ...d, knowledge: [...d.knowledge, ...loaded] }))
    }
    input.click()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div className="bg-cream-panel rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] overflow-y-auto p-6 fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-xl">{project.name ? 'Edit project' : 'New project'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-cream-sunk text-ink-soft">
            <X size={18} />
          </button>
        </div>

        <label className="block text-xs font-medium text-ink-soft mb-1.5">Name</label>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-cream text-sm mb-4 outline-none focus:border-clay/60"
          placeholder="e.g. Thesis research"
        />

        <label className="block text-xs font-medium text-ink-soft mb-1.5">Custom instructions</label>
        <textarea
          value={draft.instructions}
          onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
          rows={6}
          className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-cream text-sm mb-4 outline-none focus:border-clay/60 resize-none"
          placeholder="How should Claude behave for every chat in this project?"
        />

        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-ink-soft">Knowledge files</label>
          <button onClick={addFiles} className="text-xs text-clay hover:underline flex items-center gap-1">
            <Plus size={13} /> Add files
          </button>
        </div>
        <div className="space-y-1.5 mb-5">
          {draft.knowledge.map((k) => (
            <div key={k.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cream-sunk text-sm">
              <FileIcon size={14} className="text-ink-faint" />
              <span className="flex-1 truncate">{k.name}</span>
              <button onClick={() => setDraft({ ...draft, knowledge: draft.knowledge.filter((x) => x.id !== k.id) })} className="text-ink-faint hover:text-red-500">
                <X size={14} />
              </button>
            </div>
          ))}
          {draft.knowledge.length === 0 && <p className="text-xs text-ink-faint">No files added.</p>}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-ink-soft hover:bg-cream-sunk">
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            disabled={!draft.name.trim()}
            className="px-4 py-2 rounded-xl bg-clay text-white text-sm font-medium hover:bg-clay-dark disabled:opacity-40"
          >
            Save project
          </button>
        </div>
      </div>
    </div>
  )
}
