import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { QuickEntry } from './components/QuickEntry'
import './index.css'

// The same bundle powers two windows: the main app, and the Quick Entry overlay
// (loaded with the '#quick' hash by the main process).
const isQuick = window.location.hash === '#quick'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isQuick ? <QuickEntry /> : <App />}</React.StrictMode>
)
