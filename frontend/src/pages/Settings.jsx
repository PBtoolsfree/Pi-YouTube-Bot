import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Save, Server, MessageSquare, Database, Youtube, Radio, Key, CheckCircle2, AlertTriangle, ExternalLink, Wifi, WifiOff, Clock, RefreshCw, FileSpreadsheet, Archive, Download, Upload, HardDrive, RotateCcw, FilePlus, Trash2, FolderOpen, Info, Gift, Cpu, Cloud } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Input, Button, Switch, Textarea } from '@/components/ui'
import { PageStatusBar } from '@/components/ServiceStatus'

function safeFixed(value, digits = 1, fallback = "0") {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : fallback;
}

export default function SettingsPage({ config, onSave }) {
    const [localConfig, setLocalConfig] = useState(config || {})

    // Internal save handler
    const handleSave = () => onSave(localConfig)
    const [activeSection, setActiveSection] = useState('youtube') // Start with YouTube as it's the priority

    // Sync localConfig when config prop updates
    React.useEffect(() => {
        if (config) {
            setLocalConfig(config)
        }
    }, [config])

    // Fetch Subscriber Count
    const [subCount, setSubCount] = useState(0)

    // SAFEGUARD: Access env vars safely
    const env = import.meta.env || {}
    const API_URL = env.VITE_API_URL || "/api"

    useEffect(() => {
        axios.get(`${API_URL}/subscriber`).then(res => setSubCount(res.data.count)).catch(e => console.error(e))
    }, [])

    const updateNested = (path, value) => {
        const parts = path.split('.')
        const newConfig = { ...localConfig }
        let current = newConfig
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {}
            current = current[parts[i]]
        }
        current[parts[parts.length - 1]] = value
        setLocalConfig(newConfig)
    }

    const sections = [
        { id: 'youtube', label: 'YouTube & Auth', icon: <Youtube className="h-4 w-4" /> },
        { id: 'general', label: 'Bot Settings', icon: <Server className="h-4 w-4" /> },
        { id: 'ai', label: 'AI & Personality', icon: <MessageSquare className="h-4 w-4" /> },
        { id: 'integrations', label: 'Integrations', icon: <Radio className="h-4 w-4" /> },
        { id: 'sheets', label: 'Google Sheets', icon: <FileSpreadsheet className="h-4 w-4" /> },
    ]

    // ─── BACKUP STATE ───────────────────────────────────────────
    const [bkToasts, setBkToasts] = React.useState([])
    const [bkExportLoading, setBkExportLoading] = React.useState(false)
    const [bkImportLoading, setBkImportLoading] = React.useState(false)
    const [bkSaveLoading, setBkSaveLoading] = React.useState(false)
    const [bkSaveName, setBkSaveName] = React.useState('')
    const [bkBackups, setBkBackups] = React.useState([])
    const [bkListLoading, setBkListLoading] = React.useState(false)
    const [bkIsDragging, setBkIsDragging] = React.useState(false)
    const [bkRestoringFile, setBkRestoringFile] = React.useState(null)
    const [bkDeletingFile, setBkDeletingFile] = React.useState(null)
    const bkFileInputRef = React.useRef(null)

    const bkAddToast = (type, msg) => {
        const id = Date.now()
        setBkToasts(p => [...p, { id, type, msg }])
        setTimeout(() => setBkToasts(p => p.filter(t => t.id !== id)), 5000)
    }

    const bkFormatBytes = (b) => {
        if (!b) return '0 B'
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(b) / Math.log(k))
        return `${parseFloat(safeFixed(b / Math.pow(k, i), 1))} ${sizes[i]}`
    }

    const bkLoadBackups = async () => {
        setBkListLoading(true)
        try {
            const res = await axios.get(`${API_URL}/backup/list`)
            setBkBackups(res.data.backups || [])
        } catch { bkAddToast('error', 'Failed to load backups') }
        finally { setBkListLoading(false) }
    }

    React.useEffect(() => { if (activeSection === 'backup') bkLoadBackups() }, [activeSection])

    const bkExport = async () => {
        setBkExportLoading(true)
        try {
            const res = await axios.get(`${API_URL}/backup/export`, { responseType: 'blob' })
            const url = window.URL.createObjectURL(new Blob([res.data]))
            const a = document.createElement('a')
            const cd = res.headers['content-disposition'] || ''
            const m = cd.match(/filename=(.+)/)
            a.href = url; a.download = m ? m[1] : 'pi-bot-backup.zip'
            document.body.appendChild(a); a.click(); a.remove()
            window.URL.revokeObjectURL(url)
            bkAddToast('success', 'Backup downloaded!')
        } catch (e) { bkAddToast('error', 'Export failed: ' + e.message) }
        finally { setBkExportLoading(false) }
    }

    const bkImportFile = async (file) => {
        if (!file?.name.endsWith('.zip')) { bkAddToast('error', 'Only .zip backup files are accepted'); return }
        setBkImportLoading(true)
        try {
            const fd = new FormData(); fd.append('file', file)
            await axios.post(`${API_URL}/backup/import`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            bkAddToast('success', `✅ "${file.name}" imported and restored!`)
        } catch (e) { bkAddToast('error', 'Import failed: ' + (e.response?.data?.detail || e.message)) }
        finally { setBkImportLoading(false) }
    }

    const bkSave = async () => {
        if (!bkSaveName.trim()) { bkAddToast('error', 'Enter a backup name'); return }
        setBkSaveLoading(true)
        try {
            await axios.post(`${API_URL}/backup/save`, { name: bkSaveName.trim() })
            bkAddToast('success', `Snapshot "${bkSaveName}" saved!`)
            setBkSaveName('')
            bkLoadBackups()
        } catch (e) { bkAddToast('error', 'Save failed: ' + e.message) }
        finally { setBkSaveLoading(false) }
    }

    const bkRestore = async (fname) => {
        setBkRestoringFile(fname)
        try {
            await axios.post(`${API_URL}/backup/restore/${encodeURIComponent(fname)}`)
            bkAddToast('success', `✅ Restored from "${fname}"!`)
        } catch (e) { bkAddToast('error', 'Restore failed: ' + e.message) }
        finally { setBkRestoringFile(null) }
    }

    const bkDelete = async (fname) => {
        setBkDeletingFile(fname)
        try {
            await axios.delete(`${API_URL}/backup/delete/${encodeURIComponent(fname)}`)
            setBkBackups(p => p.filter(b => b.filename !== fname))
            bkAddToast('success', `Deleted "${fname}"`)
        } catch (e) { bkAddToast('error', 'Delete failed: ' + e.message) }
        finally { setBkDeletingFile(null) }
    }

    // Helpers
    const getYoutubeId = () => (localConfig.youtube && localConfig.youtube.video_id) || ''

    // Credentials State
    const [credClientId, setCredClientId] = useState("")
    const [credClientSecret, setCredClientSecret] = useState("")
    const [authStatus, setAuthStatus] = useState({ has_credentials: false, is_connected: false, has_refresh_token: false, fetch_interval: 60 })
    const [credSaving, setCredSaving] = useState(false)
    const [fetchInterval, setFetchInterval] = useState(60)
    const [disconnecting, setDisconnecting] = useState(false)

    // Fetch auth status on mount
    useEffect(() => {
        axios.get(`${API_URL}/auth/status`).then(res => {
            setAuthStatus(res.data)
            setFetchInterval(res.data.fetch_interval || 60)
        }).catch(() => { })
    }, [])

    // Handle OAuth callback query params
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const oauthResult = params.get('oauth')
        if (oauthResult === 'success') {
            alert('✅ YouTube account connected successfully!')
            setAuthStatus(prev => ({ ...prev, is_connected: true, has_credentials: true }))
            window.history.replaceState({}, '', '/settings')
        } else if (oauthResult === 'error') {
            const msg = params.get('message') || 'Unknown error'
            alert('❌ OAuth Error: ' + msg)
            window.history.replaceState({}, '', '/settings')
        }
    }, [])

    const handleSaveCredentials = async () => {
        if (!credClientId.trim() || !credClientSecret.trim()) {
            alert("Both Client ID and Client Secret are required.")
            return
        }
        setCredSaving(true)
        try {
            const res = await axios.post(`${API_URL}/auth/setup`, {
                client_id: credClientId,
                client_secret: credClientSecret
            });
            alert(res.data.message || "Credentials saved!");
            setCredClientId("");
            setCredClientSecret("");
            setAuthStatus(prev => ({ ...prev, has_credentials: true }));
        } catch (e) {
            alert("Error: " + (e.response?.data?.detail || e.message));
        } finally {
            setCredSaving(false)
        }
    }

    const handleDisconnect = async () => {
        if (!confirm('Are you sure you want to disconnect your YouTube account?')) return
        setDisconnecting(true)
        try {
            await axios.post(`${API_URL}/auth/disconnect`)
            setAuthStatus(prev => ({ ...prev, is_connected: false, has_refresh_token: false }))
            alert('YouTube account disconnected.')
        } catch (e) {
            alert('Error: ' + (e.response?.data?.detail || e.message))
        } finally {
            setDisconnecting(false)
        }
    }

    const handleSaveFetchInterval = async () => {
        const val = parseInt(fetchInterval)
        if (isNaN(val) || val < 30) {
            alert('Minimum interval is 30 seconds.')
            return
        }
        updateNested('youtube.fetch_interval', val)
        // Also save immediately
        const updated = { ...localConfig }
        if (!updated.youtube) updated.youtube = {}
        updated.youtube.fetch_interval = val
        onSave(updated)
    }

    // --- Google Sheets Logic ---
    const [sheetsStatus, setSheetsStatus] = useState({ has_credentials: false, connected: false, enabled: false, last_error: null })
    const [jsonContent, setJsonContent] = useState("")
    const [sheetsTesting, setSheetsTesting] = useState(false)
    const [sheetsClientId, setSheetsClientId] = useState("")
    const [sheetsClientSecret, setSheetsClientSecret] = useState("")
    const [sheetsCredSaving, setSheetsCredSaving] = useState(false)
    const [sheetsCredsStatus, setSheetsCredsStatus] = useState({ has_sheets_credentials: false })
    const [creatingSheet, setCreatingSheet] = useState(false)

    useEffect(() => {
        if (activeSection === 'sheets') {
            fetchSheetsStatus()
            axios.get(`${API_URL}/auth/sheets/credentials-status`).then(res => setSheetsCredsStatus(res.data)).catch(() => { })
        }
    }, [activeSection])

    const fetchSheetsStatus = () => {
        axios.get(`${API_URL}/sheets/status`).then(res => setSheetsStatus(res.data)).catch(console.error)
    }

    const handleSaveSheetsCreds = async () => {
        if (!jsonContent.trim()) return alert("Please paste JSON content.")
        try {
            await axios.post(`${API_URL}/sheets/creds`, { json_content: jsonContent })
            alert("Credentials saved!")
            setJsonContent("")
            fetchSheetsStatus()
        } catch (e) {
            alert("Error: " + (e.response?.data?.detail || e.message))
        }
    }

    const handleSaveSheetsOAuthCreds = async () => {
        if (!sheetsClientId.trim() || !sheetsClientSecret.trim()) {
            return alert("Both Client ID and Client Secret are required.")
        }
        setSheetsCredSaving(true)
        try {
            const res = await axios.post(`${API_URL}/auth/sheets/setup`, {
                client_id: sheetsClientId,
                client_secret: sheetsClientSecret
            })
            alert(res.data.message || "Sheets credentials saved!")
            setSheetsClientId("")
            setSheetsClientSecret("")
            setSheetsCredsStatus(prev => ({ ...prev, has_sheets_credentials: true }))
        } catch (e) {
            alert("Error: " + (e.response?.data?.detail || e.message))
        } finally {
            setSheetsCredSaving(false)
        }
    }

    const handleCreateSheet = async () => {
        setCreatingSheet(true)
        try {
            const res = await axios.post(`${API_URL}/sheets/create`, { name: "Pi Bot Transactions" })
            alert("✅ " + res.data.message)
            // Auto-select the new sheet
            if (res.data.sheet_id) {
                updateNested('google_sheets.sheet_id', res.data.sheet_id)
            }
            fetchSheetsStatus()
        } catch (e) {
            alert("Error: " + (e.response?.data?.detail || e.message))
        } finally {
            setCreatingSheet(false)
        }
    }

    const handleTestSheets = async () => {
        setSheetsTesting(true)
        try {
            const res = await axios.post(`${API_URL}/sheets/test`)
            if (res.data.status === 'success') {
                alert("✅ " + res.data.message)
            } else {
                alert("❌ Error: " + res.data.message)
            }
            fetchSheetsStatus()
        } catch (e) {
            alert("Connection Test Failed: " + e.message)
        } finally {
            setSheetsTesting(false)
        }
    }

    return (
        <div className="pb-10 space-y-6">
            <PageStatusBar services={['bot', 'youtube', 'email', 'streamerBot', 'ai', 'tts']} />

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
                <div>
                    <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">System Settings</h2>
                    <p className="text-sm text-zinc-400">Configure global bot behavior.</p>
                </div>
                <Button onClick={() => onSave(localConfig)} className="bg-zinc-100 text-zinc-900 hover:bg-white text-xs font-bold h-9">
                    <Save className="mr-2 h-3.5 w-3.5" /> Save Configuration
                </Button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 pb-0 no-scrollbar">
                {sections.map(section => (
                    <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={`
                            px-4 py-2 font-medium text-sm flex items-center gap-2 transition-all border-b-2 whitespace-nowrap
                            ${activeSection === section.id
                                ? 'border-zinc-100 text-zinc-100'
                                : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-800'}
                        `}
                    >
                        {section.icon}
                        {section.label}
                    </button>
                ))}
            </div>

            {/* --- SECTIONS --- */}
            <div className="grid gap-6">

                {activeSection === 'youtube' && (
                    <div className="grid gap-6 md:grid-cols-2">
                        {/* 1. Connection Info */}
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">
                                    <Youtube className="h-4 w-4 text-red-500" /> Channel Details
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase">Channel ID</label>
                                    <Input
                                        value={localConfig.youtube?.channel_id || ''}
                                        onChange={(e) => updateNested('youtube.channel_id', e.target.value)}
                                        placeholder="Channel ID (e.g. UCbP...)"
                                        className="bg-zinc-950 border-zinc-700 font-mono text-sm text-zinc-100 h-9"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase">Channel Name</label>
                                    <Input
                                        value={localConfig.youtube?.channel_name || ''}
                                        onChange={(e) => updateNested('youtube.channel_name', e.target.value)}
                                        placeholder="For Overlay Display"
                                        className="bg-zinc-950 border-zinc-700 text-sm text-zinc-100 h-9"
                                    />
                                </div>
                                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                                    <div>
                                        <label className="text-sm font-medium text-zinc-300">Automated Moderation</label>
                                        <p className="text-[10px] text-zinc-500">Allow the bot to assign/remove YouTube moderators</p>
                                    </div>
                                    <Switch
                                        checked={localConfig.youtube?.moderation_enabled || false}
                                        onCheckedChange={(c) => updateNested('youtube.moderation_enabled', c)}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* 2. Authentication */}
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">
                                    <Key className="h-4 w-4 text-yellow-500" /> Authentication
                                    {authStatus.has_credentials ? (
                                        <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded-full">
                                            <CheckCircle2 className="h-3 w-3" /> Credentials Set
                                        </span>
                                    ) : (
                                        <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded-full">
                                            <AlertTriangle className="h-3 w-3" /> Not Configured
                                        </span>
                                    )}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-5">

                                {/* Step 1: Credentials Setup */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-zinc-500 uppercase">1. Setup Credentials</label>
                                        <a
                                            href="https://console.cloud.google.com/apis/credentials"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                                        >
                                            <ExternalLink className="h-3 w-3" /> Google Cloud Console
                                        </a>
                                    </div>
                                    <div className="space-y-2">
                                        <Input
                                            value={credClientId}
                                            onChange={(e) => setCredClientId(e.target.value)}
                                            placeholder="Client ID (e.g. 123...apps.googleusercontent.com)"
                                            className="bg-zinc-950 border-zinc-700 font-mono text-[11px] text-zinc-100 h-9"
                                        />
                                        <Input
                                            type="password"
                                            value={credClientSecret}
                                            onChange={(e) => setCredClientSecret(e.target.value)}
                                            placeholder="Client Secret (e.g. GOCSPX-...)"
                                            className="bg-zinc-950 border-zinc-700 font-mono text-[11px] text-zinc-100 h-9"
                                        />
                                    </div>
                                    <Button
                                        size="sm"
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 text-xs"
                                        onClick={handleSaveCredentials}
                                        disabled={credSaving || (!credClientId && !credClientSecret)}
                                    >
                                        {credSaving ? 'Saving...' : authStatus.has_credentials ? '✓ Update Credentials' : 'Save Credentials'}
                                    </Button>
                                    <p className="text-[10px] text-zinc-500">
                                        Create OAuth credentials in Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application).
                                    </p>

                                    {/* Auto-detected Redirect URIs */}
                                    {authStatus.redirect_uris && authStatus.redirect_uris.length > 0 && (
                                        <div className="mt-3 p-3 bg-zinc-950 border border-zinc-700 rounded-lg space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                                                    ⚠ Add these Redirect URIs to Google Console
                                                </label>
                                                <a
                                                    href="https://console.cloud.google.com/apis/credentials"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors bg-blue-950 border border-blue-800 px-2 py-0.5 rounded"
                                                >
                                                    <ExternalLink className="h-2.5 w-2.5" /> Open Google Console
                                                </a>
                                            </div>
                                            {authStatus.redirect_uris.map((uri, i) => (
                                                <div key={i} className="flex items-center gap-2 group">
                                                    <code className="flex-1 text-[10px] text-emerald-400 bg-zinc-900 px-2 py-1.5 rounded border border-zinc-800 font-mono truncate">
                                                        {uri}
                                                    </code>
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(uri)
                                                            const btn = document.getElementById(`copy-btn-${i}`)
                                                            if (btn) { btn.textContent = '✓'; setTimeout(() => btn.textContent = 'Copy', 1500) }
                                                        }}
                                                        id={`copy-btn-${i}`}
                                                        className="text-[10px] px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded border border-zinc-700 transition-colors shrink-0"
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                            ))}
                                            <p className="text-[9px] text-zinc-600">
                                                Copy each URI above and add them as "Authorized redirect URIs" in your Google Cloud Console OAuth client settings.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Step 2: Connection Status & Controls */}
                                <div className="pt-4 border-t border-zinc-800 space-y-3">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase">2. Connection</label>

                                    {/* Status Banner */}
                                    <div className={`flex items-center gap-3 p-3 rounded-lg border ${authStatus.is_connected
                                        ? 'bg-emerald-950/50 border-emerald-800'
                                        : 'bg-zinc-950 border-zinc-700'
                                        }`}>
                                        {authStatus.is_connected ? (
                                            <Wifi className="h-5 w-5 text-emerald-400 shrink-0" />
                                        ) : (
                                            <WifiOff className="h-5 w-5 text-zinc-500 shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-semibold ${authStatus.is_connected ? 'text-emerald-400' : 'text-zinc-400'
                                                }`}>
                                                {authStatus.is_connected ? 'Connected' : 'Disconnected'}
                                            </p>
                                            <div className="text-[10px] text-zinc-500 mt-0.5">
                                                {authStatus.is_connected
                                                    ? (
                                                        <div className="flex flex-col gap-1">
                                                            {!authStatus.streamer_bot_connected ? (
                                                                <span className="text-rose-500 font-semibold animate-pulse text-[11px]">
                                                                    ⚠ Streamer.bot is not connected so API call is not happening
                                                                </span>
                                                            ) : (
                                                                <span className="text-emerald-500/80 font-medium text-[11px]">
                                                                    ✓ Streamer.bot is connected (API Calls Active)
                                                                </span>
                                                            )}
                                                            <span>{authStatus.has_refresh_token ? 'Auto-refreshing token active' : '⚠️ No refresh token — re-login recommended'}</span>
                                                            <span className={authStatus.has_mod_scopes ? 'text-emerald-500/80' : 'text-amber-500/90 font-medium'}>
                                                                {authStatus.has_mod_scopes ? '✓ Mod System Ready' : '⚠ Mod Scopes Missing (Please Re-login)'}
                                                            </span>
                                                        </div>
                                                    )
                                                    : 'Not connected to YouTube'}
                                            </div>
                                        </div>
                                        {authStatus.is_connected && (
                                            <span className="flex h-2.5 w-2.5 shrink-0">
                                                <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                            </span>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-2">
                                        {!authStatus.is_connected ? (
                                            <Button
                                                onClick={async () => {
                                                    try {
                                                        const res = await axios.get(`${API_URL}/auth/youtube/login`);
                                                        if (res.data.url) window.location.href = res.data.url;
                                                        else alert("Error: " + (res.data.error || "No URL returned"));
                                                    } catch (e) { alert("Login Error: " + e.message); }
                                                }}
                                                disabled={!authStatus.has_credentials}
                                                className={`flex-1 ${authStatus.has_credentials
                                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                                    } font-bold h-10`}
                                            >
                                                <Wifi className="h-4 w-4 mr-2" /> Connect with Google
                                            </Button>
                                        ) : (
                                            <>
                                                <Button
                                                    onClick={async () => {
                                                        try {
                                                            const res = await axios.get(`${API_URL}/auth/youtube/login`);
                                                            if (res.data.url) window.location.href = res.data.url;
                                                            else alert("Error: " + (res.data.error || "No URL returned"));
                                                        } catch (e) { alert("Login Error: " + e.message); }
                                                    }}
                                                    size="sm"
                                                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium h-9 text-xs"
                                                >
                                                    <RefreshCw className="h-3 w-3 mr-1.5" /> Re-login
                                                </Button>
                                                <Button
                                                    onClick={handleDisconnect}
                                                    size="sm"
                                                    disabled={disconnecting}
                                                    className="flex-1 bg-red-950 hover:bg-red-900 text-red-400 border border-red-800 font-medium h-9 text-xs"
                                                >
                                                    <WifiOff className="h-3 w-3 mr-1.5" /> {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-zinc-500">
                                        {!authStatus.has_credentials
                                            ? 'Complete Step 1 first to enable connection.'
                                            : authStatus.is_connected
                                                ? 'Re-login refreshes your token. Disconnect removes OAuth access.'
                                                : 'Click Connect to authorize your YouTube account.'}
                                    </p>
                                </div>

                                {/* Step 3: Fetch Interval */}
                                {authStatus.is_connected && (
                                    <div className="pt-4 border-t border-zinc-800 space-y-2">
                                        <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1.5">
                                            <Clock className="h-3 w-3" /> 3. API Fetch Interval
                                        </label>
                                        <div className="flex gap-2 items-center">
                                            <Input
                                                type="number"
                                                min="30"
                                                max="600"
                                                value={fetchInterval}
                                                onChange={(e) => setFetchInterval(e.target.value)}
                                                className="bg-zinc-950 border-zinc-700 font-mono text-sm text-zinc-100 h-9 w-28"
                                            />
                                            <span className="text-xs text-zinc-500">seconds</span>
                                            <Button
                                                size="sm"
                                                className="ml-auto bg-zinc-800 hover:bg-zinc-700 text-zinc-300 h-9 text-xs"
                                                onClick={handleSaveFetchInterval}
                                            >
                                                Save
                                            </Button>
                                        </div>
                                        <p className="text-[10px] text-zinc-500">
                                            How often to fetch subscriber count (min 30s). Daily quota: ~{Math.floor(86400 / (parseInt(fetchInterval) || 60))}/10,000 units.
                                        </p>
                                    </div>
                                )}

                            </CardContent>
                        </Card>
                    </div>
                )}

                {activeSection === 'general' && (
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">Chat Commands</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-6">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-zinc-300">Enable Commands</label>
                                    <Switch
                                        checked={localConfig.commands?.enabled || false}
                                        onCheckedChange={(c) => updateNested('commands.enabled', c)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase">Prefix</label>
                                    <Input
                                        value={localConfig.commands?.prefix || '!'}
                                        onChange={(e) => updateNested('commands.prefix', e.target.value)}
                                        className="w-24 bg-zinc-950 border-zinc-700 font-mono text-center text-sm text-zinc-100 h-9"
                                    />
                                </div>
                            </CardContent>
                        </Card>


                    </div>
                )}

                {activeSection === 'ai' && (
                    <div className="space-y-6">
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="text-zinc-100 text-sm font-semibold">System Prompt</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4">
                                <Textarea
                                    className="min-h-[200px] w-full font-mono text-sm leading-relaxed text-zinc-100 bg-zinc-950 border-zinc-700 p-4"
                                    placeholder="You are a helpful AI..."
                                    value={localConfig.ai_topology?.system_prompt || ''}
                                    onChange={(e) => updateNested('ai_topology.system_prompt', e.target.value)}
                                />
                            </CardContent>
                        </Card>
                        {/* Triggers & Cooldowns condensed for brevity in this refactor, but kept if needed. 
                            If user wants full logic, I'd bring back the previous blocks. 
                            For now, keeping the core AI prompt as it's the most used. 
                            Let's bring back the triggers for completeness since we are refactoring.
                        */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                                <CardHeader className="pb-3 border-b border-zinc-800">
                                    <CardTitle className="text-zinc-100 text-sm font-semibold">Triggers</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-zinc-300">Passive Listening</label>
                                        <Switch
                                            checked={localConfig.moderation?.ai_triggers?.enabled || false}
                                            onCheckedChange={(c) => updateNested('moderation.ai_triggers.enabled', c)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-zinc-500 uppercase">Prefixes</label>
                                        <Input
                                            value={(localConfig.moderation?.ai_triggers?.prefixes || []).join(', ')}
                                            onChange={(e) => updateNested('moderation.ai_triggers.prefixes', e.target.value.split(',').map(s => s.trim()))}
                                            className="bg-zinc-950 border-zinc-700 text-zinc-100 h-9"
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}

                {activeSection === 'integrations' && (
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">Streamer.bot</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-zinc-300">Enabled</label>
                                    <Switch
                                        checked={localConfig.streamer_bot?.enabled || false}
                                        onCheckedChange={(c) => updateNested('streamer_bot.enabled', c)}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-zinc-500 uppercase">Host</label>
                                        <Input
                                            value={localConfig.streamer_bot?.host || ''}
                                            onChange={(e) => updateNested('streamer_bot.host', e.target.value)}
                                            className="bg-zinc-950 border-zinc-700 h-9"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-zinc-500 uppercase">Port</label>
                                        <Input
                                            value={localConfig.streamer_bot?.port || 8080}
                                            onChange={(e) => updateNested('streamer_bot.port', parseInt(e.target.value))}
                                            className="bg-zinc-950 border-zinc-700 h-9"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>




                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">Audio Engine</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-zinc-300">Enabled</label>
                                    <Switch
                                        checked={localConfig.audio?.enabled || false}
                                        onCheckedChange={(c) => updateNested('audio.enabled', c)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase">Target IP</label>
                                    <Input
                                        value={localConfig.audio?.gaming_pc_ip || ''}
                                        onChange={(e) => updateNested('audio.gaming_pc_ip', e.target.value)}
                                        className="bg-zinc-950 border-zinc-700 h-9"
                                        placeholder="192.168.x.x"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">
                                    <Cloud className="h-4 w-4 text-blue-400" />
                                    Cloud Connection
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-zinc-300">Enabled</label>
                                    <Switch
                                        checked={localConfig.cloud_alert_enabled !== false}
                                        onCheckedChange={(c) => updateNested('cloud_alert_enabled', c)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase">Cloud Server WebSocket URL</label>
                                    <Input
                                        value={localConfig.cloud_alert_url || ''}
                                        onChange={(e) => updateNested('cloud_alert_url', e.target.value)}
                                        className="bg-zinc-950 border-zinc-700 h-9 font-mono text-xs"
                                        placeholder="ws://80.225.201.233:8000/ws/pi-client"
                                    />
                                    <p className="text-[10px] text-zinc-500">
                                        The Local Pi will connect to this Cloud Server URL to receive real-time donation alerts. (Copy this from your Cloud Dashboard).
                                    </p>
                                </div>
                            </CardContent>
                        </Card>




                    </div>
                )}


                {activeSection === 'sheets' && (
                    <div className="grid gap-6 md:grid-cols-2">
                        {/* Config */}
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">Sheets Configuration</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-zinc-300">Enabled</label>
                                    <Switch
                                        checked={localConfig.google_sheets?.enabled || false}
                                        onCheckedChange={(c) => updateNested('google_sheets.enabled', c)}
                                    />
                                </div>

                                {/* SEPARATE SHEETS ACCOUNT SETUP */}
                                <div className="space-y-3 pt-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase">Connection</label>

                                    {sheetsStatus.using_oauth ? (
                                        <div className="p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-md text-emerald-200 text-xs space-y-2">
                                            <p className="font-medium flex items-center gap-2">
                                                <CheckCircle2 className="h-4 w-4" /> Connected
                                            </p>
                                            <p className="opacity-80">
                                                Your Google Sheets account is connected.
                                            </p>
                                            <Button
                                                size="sm"
                                                onClick={() => window.location.href = `${API_URL}/auth/sheets/login`}
                                                className="w-full bg-emerald-800 hover:bg-emerald-700 text-white border-none h-8"
                                            >
                                                Reconnect / Switch Account
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-300 text-xs space-y-2">
                                            <p className="font-medium">
                                                Connect a separate Google Account for Sheets
                                            </p>
                                            <p className="opacity-60 text-[10px]">
                                                Use a different account than YouTube to avoid quota limits.
                                            </p>
                                            <Button
                                                size="sm"
                                                onClick={() => window.location.href = `${API_URL}/auth/sheets/login`}
                                                className="w-full bg-white hover:bg-zinc-200 text-black h-8 font-semibold"
                                            >
                                                <ExternalLink className="h-3 w-3 mr-2" />
                                                Connect Google Sheets
                                            </Button>
                                        </div>
                                    )}

                                    <div className="pt-2">
                                        <label className="text-xs font-semibold text-zinc-500 uppercase mb-1 block">Select Sheet</label>
                                        {!sheetsStatus.using_oauth && !authStatus.is_connected && !localConfig.google_sheets?.sheet_id ? (
                                            <div className="text-[10px] text-zinc-500 italic px-1">
                                                Connect an account to load sheets...
                                            </div>
                                        ) : (
                                            <SheetsDropdown
                                                value={localConfig.google_sheets?.sheet_id}
                                                onChange={(val) => updateNested('google_sheets.sheet_id', val)}
                                                apiUrl={API_URL}
                                            />
                                        )}
                                    </div>

                                    <div className="relative pt-2">
                                        <div className="absolute inset-0 flex items-center">
                                            <span className="w-full border-t border-zinc-800" />
                                        </div>
                                        <div className="relative flex justify-center text-[10px] uppercase">
                                            <span className="bg-zinc-950 px-2 text-zinc-500">Or Manual ID</span>
                                        </div>
                                    </div>

                                    <Input
                                        value={localConfig.google_sheets?.sheet_id || ''}
                                        onChange={(e) => updateNested('google_sheets.sheet_id', e.target.value)}
                                        className="bg-zinc-950 border-zinc-700 font-mono text-xs h-9"
                                        placeholder="Paste Sheet ID manually..."
                                    />
                                </div>


                                <div className="pt-4 border-t border-zinc-800 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-zinc-500 uppercase">Status</label>
                                        {sheetsStatus.connected ?
                                            <span className="text-[10px] bg-emerald-950 text-emerald-400 px-2 py-1 rounded border border-emerald-800">Connected</span> :
                                            <span className="text-[10px] bg-red-950 text-red-400 px-2 py-1 rounded border border-red-800">Disconnected</span>
                                        }
                                    </div>
                                    {sheetsStatus.last_error && (
                                        <div className="p-2 bg-red-950/30 border border-red-900/50 rounded text-[10px] text-red-300 font-mono break-all">
                                            {sheetsStatus.last_error}
                                        </div>
                                    )}
                                    <Button
                                        onClick={handleTestSheets}
                                        disabled={sheetsTesting || !localConfig.google_sheets?.enabled}
                                        size="sm"
                                        className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 h-9"
                                    >
                                        {sheetsTesting ? "Testing..." : "Test Connection"}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Sheets OAuth Credentials */}
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">
                                    <Key className="h-4 w-4 text-yellow-500" /> Sheets OAuth Credentials
                                    {sheetsCredsStatus.has_sheets_credentials ? (
                                        <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded-full">
                                            <CheckCircle2 className="h-3 w-3" /> Set
                                        </span>
                                    ) : (
                                        <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded-full">
                                            <AlertTriangle className="h-3 w-3" /> Not Configured
                                        </span>
                                    )}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <p className="text-[10px] text-zinc-500">
                                    Enter your Google Cloud OAuth Client ID &amp; Secret for Google Sheets access.
                                    This is used for OAuth login and auto-connecting on Pi startup.
                                </p>
                                <div className="space-y-2">
                                    <Input
                                        value={sheetsClientId}
                                        onChange={(e) => setSheetsClientId(e.target.value)}
                                        placeholder="Client ID (e.g. 123...apps.googleusercontent.com)"
                                        className="bg-zinc-950 border-zinc-700 font-mono text-[11px] text-zinc-100 h-9"
                                    />
                                    <Input
                                        type="password"
                                        value={sheetsClientSecret}
                                        onChange={(e) => setSheetsClientSecret(e.target.value)}
                                        placeholder="Client Secret (e.g. GOCSPX-...)"
                                        className="bg-zinc-950 border-zinc-700 font-mono text-[11px] text-zinc-100 h-9"
                                    />
                                </div>
                                <Button
                                    size="sm"
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 text-xs"
                                    onClick={handleSaveSheetsOAuthCreds}
                                    disabled={sheetsCredSaving || (!sheetsClientId && !sheetsClientSecret)}
                                >
                                    {sheetsCredSaving ? 'Saving...' : sheetsCredsStatus.has_sheets_credentials ? '✓ Update Credentials' : 'Save Credentials'}
                                </Button>
                                <p className="text-[10px] text-zinc-500">
                                    After saving, click "Connect Google Sheets" on the left to complete OAuth login.
                                </p>

                                {/* Create New Sheet */}
                                <div className="pt-3 border-t border-zinc-800 space-y-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase">Quick Setup</label>
                                    <Button
                                        size="sm"
                                        onClick={handleCreateSheet}
                                        disabled={creatingSheet || (!sheetsStatus.using_oauth && !authStatus.is_connected)}
                                        className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold h-9 text-xs"
                                    >
                                        {creatingSheet ? 'Creating...' : '📊 Create New Sheet (with Headers)'}
                                    </Button>
                                    <p className="text-[10px] text-zinc-500">
                                        Creates a new Google Sheet with Date, Time, User, Amount, Type, Message, Transaction ID columns.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

            </div>

            {/* ─── BACKUP SECTION ─── */}
            {activeSection === 'backup' && (
                <div className="space-y-6">

                    {/* Toast Stack */}
                    {bkToasts.length > 0 && (
                        <div className="fixed top-6 right-6 z-50 space-y-2 w-80">
                            {bkToasts.map(t => (
                                <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl ${t.type === 'success' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                    }`}>
                                    {t.type === 'success'
                                        ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                                        : <AlertTriangle className="h-4 w-4 shrink-0" />}
                                    <span className="flex-1">{t.msg}</span>
                                    <button onClick={() => setBkToasts(p => p.filter(x => x.id !== t.id))} className="opacity-50 hover:opacity-100 text-xs ml-2">✕</button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="grid gap-6 md:grid-cols-2">

                        {/* Export */}
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">
                                    <Download className="h-4 w-4 text-emerald-400" /> Export Backup
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <p className="text-xs text-zinc-500">Download a zip of your config, credentials and data files.</p>
                                <div className="space-y-1">
                                    {['config.json', 'client_secret.json', 'sheets_client_secret.json', '.env', 'data/donations.json', 'data/brain.db'].map(f => (
                                        <div key={f} className="flex items-center gap-2 text-[11px] text-zinc-500">
                                            <div className="h-1 w-1 rounded-full bg-emerald-500" />{f}
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={bkExport}
                                    disabled={bkExportLoading}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold text-sm transition-all"
                                >
                                    {bkExportLoading
                                        ? <><RefreshCw className="h-4 w-4 animate-spin" /> Creating...</>
                                        : <><Download className="h-4 w-4" /> Download Backup</>}
                                </button>
                            </CardContent>
                        </Card>

                        {/* Import */}
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">
                                    <Upload className="h-4 w-4 text-blue-400" /> Import / Restore
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <p className="text-xs text-zinc-500">Upload a <code className="text-blue-400">.zip</code> backup to restore your bot config.</p>
                                <div
                                    onDrop={(e) => { e.preventDefault(); setBkIsDragging(false); if (e.dataTransfer?.files?.[0]) bkImportFile(e.dataTransfer.files[0]) }}
                                    onDragOver={(e) => { e.preventDefault(); setBkIsDragging(true) }}
                                    onDragLeave={() => setBkIsDragging(false)}
                                    onClick={() => bkFileInputRef.current?.click()}
                                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all ${bkIsDragging ? 'border-blue-400 bg-blue-500/10' : 'border-zinc-700 hover:border-blue-500/50 hover:bg-blue-500/5'
                                        } ${bkImportLoading ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                    <input ref={bkFileInputRef} type="file" accept=".zip" className="hidden"
                                        onChange={(e) => { if (e.target.files?.[0]) bkImportFile(e.target.files[0]) }} />
                                    {bkImportLoading
                                        ? <><RefreshCw className="h-6 w-6 text-blue-400 animate-spin" /><p className="text-xs text-blue-300">Restoring...</p></>
                                        : <><Upload className={`h-6 w-6 ${bkIsDragging ? 'text-blue-400' : 'text-zinc-500'}`} />
                                            <p className="text-xs text-zinc-400 text-center">{bkIsDragging ? 'Drop to restore' : 'Drag & drop or click to upload'}</p>
                                            <p className="text-[10px] text-zinc-600">Only .zip files accepted</p></>
                                    }
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                    <Info className="h-3.5 w-3.5 shrink-0" /> Importing overwrites current config and data.
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Save Snapshot */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">
                                <FilePlus className="h-4 w-4 text-violet-400" /> Save Snapshot to Server
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <p className="text-xs text-zinc-500 mb-3">Save a named snapshot on the server before big config changes.</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={bkSaveName}
                                    onChange={e => setBkSaveName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && bkSave()}
                                    placeholder="e.g. before-update, stable-v1..."
                                    className="flex-1 bg-zinc-950 border border-zinc-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none transition-colors"
                                />
                                <button
                                    onClick={bkSave}
                                    disabled={bkSaveLoading || !bkSaveName.trim()}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white font-semibold text-sm transition-all shrink-0"
                                >
                                    {bkSaveLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Save</>}
                                </button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Saved Backups List */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">
                                <Archive className="h-4 w-4 text-amber-400" /> Saved Backups
                                <button onClick={bkLoadBackups} disabled={bkListLoading}
                                    className="ml-auto flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors font-normal">
                                    <RefreshCw className={`h-3 w-3 ${bkListLoading ? 'animate-spin' : ''}`} /> Refresh
                                </button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {bkListLoading && bkBackups.length === 0 ? (
                                <div className="flex items-center justify-center py-8 text-zinc-600 gap-2 text-sm">
                                    <RefreshCw className="h-4 w-4 animate-spin" /> Loading...
                                </div>
                            ) : bkBackups.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-zinc-600 gap-2">
                                    <FolderOpen className="h-8 w-8 opacity-30" />
                                    <p className="text-sm">No saved backups yet.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {bkBackups.map(b => (
                                        <div key={b.filename} className="flex items-center gap-3 bg-zinc-950/60 rounded-lg px-3 py-2.5 border border-white/5 hover:bg-zinc-800/40 transition-all">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">{b.filename}</p>
                                                <div className="flex items-center gap-3 mt-0.5">
                                                    <span className="text-[10px] text-zinc-500">{b.created_at}</span>
                                                    <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                                                        <HardDrive className="h-2.5 w-2.5" />{bkFormatBytes(b.size_bytes)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button onClick={() => bkRestore(b.filename)} disabled={bkRestoringFile === b.filename}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 text-xs font-semibold border border-amber-600/20 transition-all disabled:opacity-50">
                                                    {bkRestoringFile === b.filename ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Restore
                                                </button>
                                                <button onClick={() => bkDelete(b.filename)} disabled={bkDeletingFile === b.filename}
                                                    className="flex items-center p-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600/30 text-rose-400 border border-rose-600/20 transition-all disabled:opacity-50">
                                                    {bkDeletingFile === b.filename ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                </div>
            )}

        </div >
    )
}

function SheetsDropdown({ value, onChange, apiUrl }) {
    const [sheets, setSheets] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        setLoading(true)
        axios.get(`${apiUrl}/sheets/list`)
            .then(res => {
                const list = res.data.sheets || []
                setSheets(list)
                // Auto-select first if none selected? No, let user choose.
            })
            .catch(err => {
                console.error("Failed to fetch sheets:", err)
                setError("Failed to load sheets. Please Try Again.")
            })
            .finally(() => setLoading(false))
    }, [apiUrl])

    if (loading) return <div className="text-xs text-zinc-500 animate-pulse">Loading sheets...</div>
    if (error) return <div className="text-xs text-red-500">{error} <button onClick={() => window.location.reload()} className="underline">Retry</button></div>

    return (
        <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1 text-sm text-zinc-100 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
            <option value="" disabled>Select a Google Sheet...</option>
            {sheets.map(sheet => (
                <option key={sheet.id} value={sheet.id}>
                    {sheet.name}
                </option>
            ))}
        </select>
    )
}
