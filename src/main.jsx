import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{
          minHeight: '100vh',
          padding: 24,
          background: '#0e0f11',
          color: '#f4f2ec',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'left',
        }}>
          <h1 style={{ fontSize: 24, margin: '0 0 12px' }}>Dashboard error</h1>
          <pre style={{
            whiteSpace: 'pre-wrap',
            color: '#e0584f',
            background: '#16181b',
            border: '1px solid #2a2d31',
            borderRadius: 6,
            padding: 16,
          }}>
            {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
          </pre>
        </main>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=9`, { updateViaCache: 'none' })
    registration.update()
  })
}
