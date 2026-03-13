import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'

const canUseServiceWorker =
  'serviceWorker' in navigator && (window.location.protocol === 'https:' || isLocalhost)

if (canUseServiceWorker) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('Service worker registration failed', err)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
