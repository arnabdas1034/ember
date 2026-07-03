import type { Artifact } from '@shared/types'
import { uid } from '../api'

// Detect renderable artifacts (HTML / SVG / Mermaid / self-contained UI code) in an
// assistant message so we can offer a live preview in the side panel — Claude's
// "Artifacts" behaviour.
const RENDERABLE = new Set(['html', 'svg', 'mermaid', 'xml'])

export function extractArtifacts(markdown: string): Artifact[] {
  const artifacts: Artifact[] = []
  const fence = /```([\w-]+)?\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  let i = 0
  while ((m = fence.exec(markdown)) !== null) {
    const lang = (m[1] || '').toLowerCase()
    const code = m[2]
    i++
    const isRenderable = RENDERABLE.has(lang) || /^\s*<(!doctype|html|svg)/i.test(code)
    const isBigCode = code.split('\n').length > 18
    if (isRenderable || (isBigCode && ['jsx', 'tsx', 'react', 'javascript', 'js', 'ts'].includes(lang))) {
      artifacts.push({
        id: uid(),
        title: titleFor(lang, i),
        language: lang || (isRenderable ? 'html' : 'code'),
        code: code.trimEnd()
      })
    }
  }
  return artifacts
}

function titleFor(lang: string, i: number): string {
  if (lang === 'svg') return 'SVG Graphic'
  if (lang === 'mermaid') return 'Diagram'
  if (['jsx', 'tsx', 'react'].includes(lang)) return 'Component'
  if (lang === 'html' || !lang) return 'Preview'
  return `Artifact ${i}`
}

export function isReactArtifact(a: Artifact): boolean {
  return (
    ['jsx', 'tsx', 'react'].includes(a.language) ||
    (['javascript', 'js', 'ts'].includes(a.language) && /<[A-Z][\w]*|React\.|useState|useEffect/.test(a.code))
  )
}

export function isRenderablePreview(a: Artifact): boolean {
  return (
    a.language === 'html' ||
    a.language === 'svg' ||
    a.language === 'xml' ||
    /^\s*<(!doctype|html|svg)/i.test(a.code) ||
    isReactArtifact(a)
  )
}

// Wrap a JSX/React artifact in a self-contained page: React + Babel from CDN,
// transpiled in-iframe, auto-mounting the exported/last-defined component.
export function reactPreviewDoc(code: string): string {
  const cleaned = code
    .replace(/^\s*import\s+[^;]+;?\s*$/gm, '') // strip imports; React/hooks provided as globals
    .replace(/^\s*export\s+default\s+function\s+([A-Z]\w*)/m, 'function $1')
    .replace(/^\s*export\s+default\s+([A-Z]\w*)\s*;?\s*$/m, 'window.__EmberRoot = $1;')
    .replace(/^\s*export\s+(const|function|class)\s+/gm, '$1 ')

  // Component names defined in the code, so the mounter can pick one (last wins,
  // 'App' preferred) without relying on globals leaking from Babel's scope.
  const defined = [...cleaned.matchAll(/(?:function|const|class)\s+([A-Z]\w*)/g)].map((m) => m[1])
  const pick = defined.includes('App') ? 'App' : defined[defined.length - 1] || ''

  const bootstrap = `
    const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, Fragment } = React;
    ${cleaned}
    ;(function mount(){
      const el = document.getElementById('root');
      let Root = window.__EmberRoot;
      try { if (!Root) Root = ${pick ? pick : 'null'}; } catch (e) {}
      if (Root) ReactDOM.createRoot(el).render(React.createElement(Root));
      else el.innerHTML = '<pre style="color:#b00;padding:16px">Could not find a component to render. Define an App component or use export default.</pre>';
    })();
  `

  return `<!doctype html><html><head><meta charset="utf-8">
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#fff}#root{min-height:100vh}</style>
</head><body><div id="root"></div>
<script type="text/babel" data-presets="react,typescript">${bootstrap.replace(/<\/script>/g, '<\\/script>')}<\/script>
<script>window.addEventListener('error', e => { const r = document.getElementById('root'); if (r && !r.childElementCount) r.innerHTML = '<pre style="color:#b00;padding:16px;white-space:pre-wrap">' + e.message + '</pre>'; });<\/script>
</body></html>`
}
