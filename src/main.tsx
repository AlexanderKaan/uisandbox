import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { buildTokens } from './tokens/buildTokens'
import { DEFAULT_CONFIG } from './tokens/defaults'
import './styles/chrome.css'
import './styles/panel.css'

/* The panel composes a few --k-* tokens (row heights, spacing, radius). They
 * are set ONCE from the default kit and never follow the knobs: the knobs are
 * for THEIR app in the frame, and our chrome stays put. */
const root = document.documentElement
for (const [k, v] of Object.entries(buildTokens(DEFAULT_CONFIG).vars)) root.style.setProperty(k, String(v))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
