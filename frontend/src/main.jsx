import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error) {
    // Detect chunk/dynamic-import failures (common after redeployment)
    const msg = error?.message || '';
    const isChunkError =
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk') ||
      msg.includes('Importing a module script failed');
    return { hasError: true, error, isChunkError };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleReload = () => {
    // Force a full page reload (bypass cache) to fetch updated index.html
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isChunkError) {
        return (
          <div style={{ padding: 40, background: '#18181b', color: '#e4e4e7', height: '100vh', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ fontSize: 48 }}>🔄</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fbbf24', margin: 0 }}>Update Available</h1>
            <p style={{ color: '#a1a1aa', fontSize: 14, textAlign: 'center', maxWidth: 400 }}>
              A new version has been deployed. The page needs to reload to get the latest files.
            </p>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 32px', background: '#7c3aed', color: '#fff', border: 'none',
                borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 8
              }}
            >
              Reload Page
            </button>
            <pre style={{ color: '#52525b', fontSize: 10, marginTop: 16, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {this.state.error && this.state.error.toString()}
            </pre>
          </div>
        );
      }

      return (
        <div style={{ padding: 20, background: '#18181b', color: '#ef4444', height: '100vh', fontFamily: 'monospace' }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error && this.state.error.toString()}</pre>
          <button
            onClick={this.handleReload}
            style={{ marginTop: 16, padding: '8px 24px', background: '#3f3f46', color: '#e4e4e7', border: '1px solid #52525b', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <React.Suspense fallback={<div className="h-screen w-screen bg-black flex items-center justify-center text-zinc-500">Loading...</div>}>
        <App />
      </React.Suspense>
    </ErrorBoundary>
  </React.StrictMode>,
)

