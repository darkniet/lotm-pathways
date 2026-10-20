import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useExplorer } from './state/explorer'
import './styles/global.css'

if (import.meta.env.DEV) window.__explorer = useExplorer

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
