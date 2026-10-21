import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { freezeTime, now } from './lib/clock'
import { useExplorer } from './state/explorer'
import './styles/global.css'

// Dev hooks for the screenshot scripts: the store, and the clock its phases run on.
if (import.meta.env.DEV) {
  window.__explorer = useExplorer
  window.__now = now
  window.__freezeTime = freezeTime
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
