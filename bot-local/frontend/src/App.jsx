import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import axios from 'axios'
import Layout from './components/Layout'

// Overlay Pages (eagerly loaded — rendered immediately on URL match)
import AudioOverlay from './pages/AudioOverlay'
import TipPage from './pages/TipPage'

// Dashboard Pages (lazy loaded — only fetched when tab is opened)
const Dashboard = lazy(() => import('./pages/Dashboard'))
const GoalsPage = lazy(() => import('./pages/Goals'))
const Orchestrator = lazy(() => import('./pages/Orchestrator'))
const OBSPage = lazy(() => import('./pages/OBS'))
const ModerationPage = lazy(() => import('./pages/Moderation'))
const ViewersPage = lazy(() => import('./pages/Viewers'))
const AudioEnginePage = lazy(() => import('./pages/AudioEngine'))
const LoyaltyPage = lazy(() => import('./pages/Loyalty'))
const LoyaltyManagerPage = lazy(() => import('./pages/LoyaltyManager'))
const TipHistoryPage = lazy(() => import('./pages/TipHistory'))
const PersonalitiesPage = lazy(() => import('./pages/Personalities'))
const StreamerBotPage = lazy(() => import('./pages/StreamerBot'))
const TestingPage = lazy(() => import('./pages/Testing'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const IgnoreListPage = lazy(() => import('./pages/IgnoreList'))
const TipPageSettings = lazy(() => import('./pages/TipPageSettings'))
const CloudflareSettings = lazy(() => import('./pages/CloudflareSettings'))
const AppWebhookSettings = lazy(() => import('./pages/AppWebhookSettings'))
const LocalPiConnection = lazy(() => import('./pages/LocalPiConnection'))
const SuperChatSettings = lazy(() => import('./pages/SuperChatSettings'))
const AgentPage = lazy(() => import('./pages/Agent'))
const BackupPage = lazy(() => import('./pages/Backup'))
const RedeemManagerPage = lazy(() => import('./pages/RedeemManager'))
const GiveawaysPage = lazy(() => import('./pages/Giveaways'))
const ClipsPage = lazy(() => import('./pages/Clips'))
const DomainSettings = lazy(() => import('./pages/DomainSettings'))

// SAFEGUARD: Access env vars safely (Force Update)
const env = import.meta.env || {}
const API_URL = env.VITE_API_URL || "/api"

function App() {
  // 1. HOOKS ALWAYS FIRST (Fixes React Violation)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [config, setConfig] = useState(null)
  const [logs, setLogs] = useState([])
  const [backendStatus, setBackendStatus] = useState(null)
  const [status, setStatus] = useState('disconnected')
  const [error, setError] = useState(null)
  const [isPublicMode, setIsPublicMode] = useState(() => {
    // SAFEGUARD: Access env vars safely
    // ONLY force public mode if we are on a known public domain (Vercel, Cloudflare, etc)
    // OR if the user is explicitly visiting /tip
    const hostname = window.location.hostname;
    if (hostname.includes('pbhero.qzz.io')) {
      return false;
    }
    return (
      hostname.includes('vercel.app') ||
      hostname.includes('trycloudflare.com') ||
      hostname.includes('qzz.io') ||
      hostname.includes('pbherotip') ||
      window.location.pathname === '/tip'
    )
  })
  const wsRef = useRef(null)

  useEffect(() => {
    // If specific route, don't fetch config
    if (window.location.pathname === '/tip') return

    fetchConfig()
    fetchStatus()
    connectWebSocket()

    // Fetch Log History
    axios.get(`${API_URL}/logs/history`).then(res => {
      if (Array.isArray(res.data)) {
        const displayableLogs = res.data.filter(data => data.category || data.message)
        setLogs(displayableLogs.reverse()) // Reverse because append order vs display order (display often new-at-top)
      }
    }).catch(e => console.error("Log History Error", e))

    const interval = setInterval(fetchStatus, 5000)
    return () => {
      if (wsRef.current) wsRef.current.close()
      clearInterval(interval)
    }
  }, [])

  const fetchStatus = async () => {
    if (isPublicMode) return
    try {
      const res = await axios.get(`${API_URL}/status`)
      setBackendStatus(res.data)
    } catch (e) {
      console.error("Status Load Error", e)
    }
  }

  const fetchConfig = async () => {
    try {
      setError(null)
      const res = await axios.get(`${API_URL}/config?t=${Date.now()}`)
      if (res.data && typeof res.data === 'object') {
        setConfig(res.data)
        if (res.data.is_cloud) {
          setActiveTab('tip_page_settings')
        }
      } else {
        throw new Error("Invalid config response")
      }
    } catch (e) {
      console.error("Config Load Error", e)

      // AUTO-DETECT PUBLIC MODE (Host based only)
      if (
        window.location.hostname &&
        !window.location.hostname.includes('pbhero.qzz.io') &&
        (window.location.hostname.includes('vercel.app') || 
         window.location.hostname.includes('trycloudflare.com') ||
         window.location.hostname.includes('qzz.io') ||
         window.location.hostname.includes('pbherotip'))
      ) {
        console.log("Detecting Public Mode via Hostname")
        setIsPublicMode(true)
        return
      }

      setError(e.message)
    }
  }

  const connectWebSocket = () => {
    if (window.location.protocol === 'https:' && !window.location.hostname.includes('localhost')) {
      // Allow fallback to wss but avoid breaking if tunneling handles it differently
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/logs`
    const ws = new WebSocket(wsUrl)
    ws.onopen = () => setStatus('connected')
    ws.onclose = () => {
      if (!isPublicMode) {
        setStatus('reconnecting')
        setTimeout(connectWebSocket, 3000)
      } else {
        setStatus('disconnected')
      }
    }
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'config_update') {
        setConfig(data.config)
        return
      }
      if (data.type !== 'log') return
      setLogs(prev => [data, ...prev].slice(0, 200))
    }
    wsRef.current = ws
  }

  const handleSaveConfig = async (newConfig) => {
    try {
      await axios.post(`${API_URL}/config`, { config: newConfig })
      setConfig(newConfig)
      alert("Configuration Saved!")
    } catch (e) {
      alert("Save Failed: " + e.message)
    }
  }

  // 2. ROUTING & CONDITIONAL RETURNS
  const isOverlay = window.location.search.includes('mode=overlay')


  console.log("Routing Debug:", { pathname: window.location.pathname, search: window.location.search })

  // Explicit Route or Fallback Public Mode
  if (window.location.pathname === '/tip' || isPublicMode) {
    return <TipPage />
  }

  if (isOverlay) return <div className="bg-transparent h-screen w-screen"><AudioOverlay /></div>


  if (!config) return (
    <div className="flex flex-col h-screen items-center justify-center bg-zinc-950 text-white gap-4">
      {error ? (
        <>
          <div className="text-rose-500 font-bold text-xl">Connection Error</div>
          <div className="text-zinc-400 font-mono text-sm bg-zinc-900 p-4 rounded-lg border border-white/5">{error}</div>
          <button onClick={fetchConfig} className="px-4 py-2 bg-primary rounded-lg text-sm font-bold">Retry Connection</button>

          <div className="mt-4 pt-4 border-t border-white/10 text-center">
            <p className="text-zinc-500 text-xs mb-2">Trying to access the Tip Page?</p>
            <a href="/tip" className="text-blue-400 hover:text-blue-300 underline">Go to /tip</a>
          </div>
        </>
      ) : (
        <>
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          <div className="text-zinc-500 animate-pulse uppercase tracking-widest text-xs font-bold">Initializing Pi Bot v2...</div>
        </>
      )}
    </div>
  )

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      status={status}
      config={config}
    >
      <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-4 border-violet-500 border-t-transparent rounded-full" /></div>}>
        {activeTab === 'dashboard' && <Dashboard logs={logs} config={config} />}
        {activeTab === 'goals' && <GoalsPage backendStatus={backendStatus} />}
        {activeTab === 'orchestrator' && <Orchestrator config={config} onSave={handleSaveConfig} />}
        {activeTab === 'backup' && <BackupPage />}
        {activeTab === 'moderation' && <ModerationPage config={config} onSave={handleSaveConfig} logs={logs} />}
        {activeTab === 'viewers' && <ViewersPage />}
        {activeTab === 'loyalty' && (config?.is_cloud ? <LoyaltyManagerPage /> : <LoyaltyPage />)}
        {activeTab === 'tip_history' && <TipHistoryPage />}
        {activeTab === 'personalities' && <PersonalitiesPage config={config} onSave={handleSaveConfig} />}
        {activeTab === 'streamer_bot' && <StreamerBotPage logs={logs} config={config} onSave={handleSaveConfig} backendStatus={backendStatus} />}
        {activeTab === 'ignore_list' && <IgnoreListPage config={config} onSave={handleSaveConfig} />}
        {activeTab === 'audio_engine' && <AudioEnginePage />}
        {activeTab === 'obs' && <OBSPage config={config} onSave={handleSaveConfig} />}
        {activeTab === 'testing' && <TestingPage />}
        {activeTab === 'settings' && <SettingsPage config={config} onSave={handleSaveConfig} />}
        {activeTab === 'tip_page_settings' && <TipPageSettings />}
        {activeTab === 'app_webhook' && <AppWebhookSettings />}
        {activeTab === 'local_pi_connection' && <LocalPiConnection />}
        {activeTab === 'super_chat_settings' && <SuperChatSettings config={config} onSave={handleSaveConfig} />}
        {activeTab === 'cloudflare' && <CloudflareSettings />}
        {activeTab === 'agent' && <AgentPage />}
        {activeTab === 'backup' && <BackupPage />}
        {activeTab === 'redeems' && <RedeemManagerPage />}
        {activeTab === 'giveaways' && <GiveawaysPage />}
        {activeTab === 'clips' && <ClipsPage />}
        {activeTab === 'domain' && <DomainSettings config={config} onSave={handleSaveConfig} />}
      </Suspense>
    </Layout>
  )
}

export default App
