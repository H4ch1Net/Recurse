import { Component } from 'react'
import { exportSnapshot } from '../lib/storage'

function downloadBackup() {
  const blob = new Blob([JSON.stringify(exportSnapshot(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'recurse-backup.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Recurse crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="page narrow">
        <div className="card roomy stack">
          <h1 className="page-title">Something broke.</h1>
          <p className="muted">Your progress is stored in this browser and has not been lost. Reloading usually fixes this. If it keeps happening, download a backup first.</p>
          <pre className="small subtle" style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error?.message || this.state.error)}</pre>
          <div className="row wrap">
            <button type="button" className="btn btn-primary" onClick={() => window.location.assign('/')}>Reload</button>
            <button type="button" className="btn" onClick={downloadBackup}>Download backup</button>
          </div>
        </div>
      </div>
    )
  }
}
