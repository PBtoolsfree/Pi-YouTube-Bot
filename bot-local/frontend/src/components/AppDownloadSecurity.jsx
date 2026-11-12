import React, { useState, useEffect } from 'react'
import axios from 'axios'
import QRCode from 'react-qr-code'
import {
    Download, QrCode as QrIcon, Shield, ShieldCheck, Key, RefreshCw,
    Smartphone, CheckCircle, XCircle, AlertTriangle, Copy, Check, Clock,
    Wifi, WifiOff, Trash2, RotateCcw, Lock, ExternalLink, Activity
} from 'lucide-react'
import { Card, CardHeader, CardContent, CardTitle, Input, Button, Label } from '@/components/ui'

export default function AppDownloadSecurity() {
    // ─── STATE: APK METADATA ────────────────────────────────────────────────
    const [apkInfo, setApkInfo] = useState({
        status: 'loading',
        app_name: 'PB HERO Notification Bridge',
        version: '1.0.1',
        package_name: 'com.pbhero.notificationbridge',
        min_android: 'Android 8.0 (API 26+)',
        file_size_formatted: '15.15 MB',
        sha256: 'Loading...',
        last_updated: 'Just now',
        download_url: '/PB-HERO-Notification-Bridge.apk'
    })
    const [apkCopied, setApkCopied] = useState(false)

    // ─── STATE: WEBSITE INTEGRATION KEY ─────────────────────────────────────
    const [websiteKey, setWebsiteKey] = useState({
        has_key: false,
        status: 'INACTIVE',
        key_preview: '',
        created_at: null,
        last_used: null
    })
    const [showKeyModal, setShowKeyModal] = useState(false)
    const [newGeneratedSecret, setNewGeneratedSecret] = useState('')
    const [keyCopied, setKeyCopied] = useState(false)
    const [keyLoading, setKeyLoading] = useState(false)

    // ─── STATE: ANDROID PAIRING & DEVICES ───────────────────────────────────
    const [pairingModalOpen, setPairingModalOpen] = useState(false)
    const [pairingSession, setPairingSession] = useState(null)
    const [pairingCountdown, setPairingCountdown] = useState(300)
    const [devices, setDevices] = useState([])
    const [devicesLoading, setDevicesLoading] = useState(false)

    // ─── STATE: LIVE STATUS & AUDIT LOGS ────────────────────────────────────
    const [liveStatus, setLiveStatus] = useState({
        android_app: 'offline',
        local_link: 'standby',
        cloud_bot: 'running',
        streamer_bot: 'disconnected',
        overlay: 'active'
    })
    const [auditLogs, setAuditLogs] = useState([])
    const [logsLoading, setLogsLoading] = useState(false)

    // Fetch initial data
    const fetchApkInfo = async () => {
        try {
            const res = await axios.get('/api/apk/info')
            if (res.data) setApkInfo(res.data)
        } catch (e) {
            console.error('Failed to load APK info:', e)
        }
    }

    const fetchWebsiteKeyStatus = async () => {
        try {
            const res = await axios.get('/api/security/website-key')
            if (res.data) setWebsiteKey(res.data)
        } catch (e) {
            console.error('Failed to load website key status:', e)
        }
    }

    const fetchDevices = async () => {
        setDevicesLoading(true)
        try {
            const res = await axios.get('/api/bridge/devices')
            if (res.data?.devices) setDevices(res.data.devices)
        } catch (e) {
            console.error('Failed to load devices:', e)
        } finally {
            setDevicesLoading(false)
        }
    }

    const fetchAuditLogs = async () => {
        setLogsLoading(true)
        try {
            const res = await axios.get('/api/security/audit-logs')
            if (res.data?.logs) setAuditLogs(res.data.logs)
        } catch (e) {
            console.error('Failed to load audit logs:', e)
        } finally {
            setLogsLoading(false)
        }
    }

    const fetchLiveSystemStatus = async () => {
        try {
            const res = await axios.post('/api/test/system')
            const sbConnected = res.data?.streamer_bot?.status === 'Connected'
            const localLinked = res.data?.local_link?.status === 'Connected'
            setLiveStatus(prev => ({
                ...prev,
                streamer_bot: sbConnected ? 'connected' : 'disconnected',
                local_link: localLinked ? 'connected' : 'standby',
                cloud_bot: 'running'
            }))
        } catch (e) {
            // keep previous state
        }
    }

    useEffect(() => {
        fetchApkInfo()
        fetchWebsiteKeyStatus()
        fetchDevices()
        fetchAuditLogs()
        fetchLiveSystemStatus()

        const interval = setInterval(() => {
            fetchDevices()
            fetchLiveSystemStatus()
        }, 15000)
        return () => clearInterval(interval)
    }, [])

    // Countdown timer for pairing modal
    useEffect(() => {
        if (!pairingModalOpen || !pairingSession) return
        const timer = setInterval(() => {
            setPairingCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [pairingModalOpen, pairingSession])

    // Handlers: Website Key
    const handleGenerateWebsiteKey = async () => {
        if (!window.confirm("Generate a new Website Integration Key? This will grant backend signing authority to your Tip Page.")) return
        setKeyLoading(true)
        try {
            const res = await axios.post('/api/security/website-key/generate')
            if (res.data?.secret_key) {
                setNewGeneratedSecret(res.data.secret_key)
                setShowKeyModal(true)
                fetchWebsiteKeyStatus()
                fetchAuditLogs()
            }
        } catch (e) {
            alert('Failed to generate Website Key: ' + (e.response?.data?.detail || e.message))
        } finally {
            setKeyLoading(false)
        }
    }

    const handleRotateWebsiteKey = async () => {
        if (!window.confirm("Rotate Website Key? The old key will immediately be revoked and stop working. Proceed?")) return
        setKeyLoading(true)
        try {
            const res = await axios.post('/api/security/website-key/rotate')
            if (res.data?.secret_key) {
                setNewGeneratedSecret(res.data.secret_key)
                setShowKeyModal(true)
                fetchWebsiteKeyStatus()
                fetchAuditLogs()
            }
        } catch (e) {
            alert('Failed to rotate Website Key: ' + (e.response?.data?.detail || e.message))
        } finally {
            setKeyLoading(false)
        }
    }

    const handleRevokeWebsiteKey = async () => {
        if (!window.confirm("REVOKE Website Key? Any Tip Page using this key will be blocked immediately.")) return
        setKeyLoading(true)
        try {
            await axios.post('/api/security/website-key/revoke')
            fetchWebsiteKeyStatus()
            fetchAuditLogs()
        } catch (e) {
            alert('Failed to revoke Website Key: ' + (e.response?.data?.detail || e.message))
        } finally {
            setKeyLoading(false)
        }
    }

    // Handlers: Android Pairing
    const handleStartPairing = async () => {
        try {
            const res = await axios.post('/api/bridge/pairing-session')
            if (res.data?.pairing_code) {
                setPairingSession(res.data)
                setPairingCountdown(300)
                setPairingModalOpen(true)
                fetchAuditLogs()
            }
        } catch (e) {
            alert('Failed to create pairing session: ' + (e.response?.data?.detail || e.message))
        }
    }

    const handleRevokeDevice = async (deviceId) => {
        if (!window.confirm(`Revoke device access for ${deviceId}? It will no longer be able to forward notifications.`)) return
        try {
            await axios.post(`/api/bridge/devices/${deviceId}/revoke`)
            fetchDevices()
            fetchAuditLogs()
        } catch (e) {
            alert('Failed to revoke device: ' + (e.response?.data?.detail || e.message))
        }
    }

    const handleRotateDevice = async (deviceId) => {
        if (!window.confirm(`Rotate HMAC credentials for device ${deviceId}? You will need to re-pair or update the secret in the app.`)) return
        try {
            const res = await axios.post(`/api/bridge/devices/${deviceId}/rotate`)
            if (res.data?.device?.secret_key) {
                alert(`New Secret for ${deviceId}:\n${res.data.device.secret_key}`)
            }
            fetchDevices()
            fetchAuditLogs()
        } catch (e) {
            alert('Failed to rotate device secret: ' + (e.response?.data?.detail || e.message))
        }
    }

    const copyToClipboard = (text, setCopied) => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
    }

    const downloadApkUrl = `${window.location.origin}${apkInfo.download_url}`
    const hasOnlineDevice = devices.some(d => d.is_online && d.is_active)

    return (
        <div className="space-y-8">
            {/* SECTION A */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden">
                <CardHeader className="border-b border-zinc-800 bg-zinc-950/40">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-base">
                            <Smartphone className="h-5 w-5 text-cyan-400" />
                            A. Download Android Notification Bridge
                        </CardTitle>
                        <span className="text-[11px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2.5 py-0.5 rounded-full font-mono font-bold">
                            v{apkInfo.version} STABLE
                        </span>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                    <div className="grid gap-6 md:grid-cols-3">
                        <div className="flex flex-col items-center justify-center p-6 bg-zinc-950/60 rounded-xl border border-zinc-800/80 text-center">
                            <div className="p-3 bg-white rounded-lg shadow-md mb-4">
                                <QRCode value={downloadApkUrl} size={130} />
                            </div>
                            <span className="text-xs text-zinc-400 mb-4 flex items-center gap-1.5 font-medium">
                                <QrIcon className="h-3.5 w-3.5 text-cyan-400" /> Scan QR to Download to Phone
                            </span>
                            <a
                                href={apkInfo.download_url}
                                download="PB-HERO-Notification-Bridge.apk"
                                className="w-full"
                            >
                                <Button className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs h-9 shadow-sm">
                                    <Download className="h-3.5 w-3.5 mr-2" /> Download APK ({apkInfo.file_size_formatted})
                                </Button>
                            </a>
                        </div>

                        <div className="md:col-span-2 space-y-3">
                            <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                                Verified Application Metadata
                            </h4>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                                    <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Package Name</span>
                                    <span className="text-zinc-200 font-mono font-medium">{apkInfo.package_name}</span>
                                </div>
                                <div className="p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                                    <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Min Android Version</span>
                                    <span className="text-zinc-200 font-medium">{apkInfo.min_android}</span>
                                </div>
                                <div className="p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                                    <span className="text-zinc-500 block text-[10px] uppercase font-semibold">File Size</span>
                                    <span className="text-zinc-200 font-medium">{apkInfo.file_size_formatted}</span>
                                </div>
                                <div className="p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                                    <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Last Updated</span>
                                    <span className="text-zinc-200 font-medium">{apkInfo.last_updated}</span>
                                </div>
                            </div>

                            <div className="p-3 bg-zinc-950/80 rounded-lg border border-zinc-800 space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-zinc-500 text-[10px] uppercase font-semibold flex items-center gap-1">
                                        <ShieldCheck className="h-3 w-3 text-emerald-400" /> SHA-256 Checksum (SHA-256 Verifier)
                                    </span>
                                    <button
                                        onClick={() => copyToClipboard(apkInfo.sha256, setApkCopied)}
                                        className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
                                    >
                                        {apkCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                        {apkCopied ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                                <p className="font-mono text-[11px] text-zinc-300 break-all bg-zinc-900/60 p-2 rounded border border-zinc-800/60 select-all">
                                    {apkInfo.sha256}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-zinc-950/40 rounded-xl border border-zinc-800/60">
                        <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">
                            Step-by-Step Android Installation Guide
                        </h4>
                        <div className="grid gap-3 md:grid-cols-5 text-xs">
                            <div className="p-3 bg-zinc-900/80 rounded-lg border border-zinc-800 space-y-1">
                                <span className="inline-block px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-[10px] font-bold">1</span>
                                <h5 className="font-semibold text-zinc-200">Unknown Apps</h5>
                                <p className="text-[11px] text-zinc-400">Allow "Install Unknown Apps" for your mobile browser.</p>
                            </div>
                            <div className="p-3 bg-zinc-900/80 rounded-lg border border-zinc-800 space-y-1">
                                <span className="inline-block px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-[10px] font-bold">2</span>
                                <h5 className="font-semibold text-zinc-200">Install APK</h5>
                                <p className="text-[11px] text-zinc-400">Tap the downloaded APK and proceed with installation.</p>
                            </div>
                            <div className="p-3 bg-zinc-900/80 rounded-lg border border-zinc-800 space-y-1">
                                <span className="inline-block px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-[10px] font-bold">3</span>
                                <h5 className="font-semibold text-zinc-200">Grant Access</h5>
                                <p className="text-[11px] text-zinc-400">Enable Notification Listener permission for PB HERO Bridge.</p>
                            </div>
                            <div className="p-3 bg-zinc-900/80 rounded-lg border border-zinc-800 space-y-1">
                                <span className="inline-block px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-[10px] font-bold">4</span>
                                <h5 className="font-semibold text-zinc-200">Battery Saver</h5>
                                <p className="text-[11px] text-zinc-400">Disable battery optimization so Android doesn't kill the app.</p>
                            </div>
                            <div className="p-3 bg-zinc-900/80 rounded-lg border border-zinc-800 space-y-1">
                                <span className="inline-block px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-[10px] font-bold">5</span>
                                <h5 className="font-semibold text-zinc-200">Pair Device</h5>
                                <p className="text-[11px] text-zinc-400">Enter the 6-digit pairing code from Section C below.</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* SECTION B */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden">
                <CardHeader className="border-b border-zinc-800 bg-zinc-950/40">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-base">
                            <Key className="h-5 w-5 text-amber-400" />
                            B. Website Integration Security (Tip Page Secret Key)
                        </CardTitle>
                        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold border ${
                            websiteKey.is_active
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}>
                            {websiteKey.status || 'INACTIVE'}
                        </span>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                    <p className="text-xs text-zinc-400 leading-relaxed">
                        This Website Integration Key is strictly used by your PB HERO Tip Page backend to sign donation payment intents.
                        <strong className="text-amber-400 ml-1">Strict Isolation:</strong> This key cannot masquerade as an Android device.
                        The raw secret is stored only as a SHA-256 hash on the server.
                    </p>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-800">
                            <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Active Key ID</span>
                            <span className="text-zinc-200 font-mono text-xs font-semibold">{websiteKey.key_id || 'None'}</span>
                        </div>
                        <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-800">
                            <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Key Preview</span>
                            <span className="text-zinc-300 font-mono text-xs">{websiteKey.key_preview || 'No active key generated'}</span>
                        </div>
                        <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-800">
                            <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Scope & Permissions</span>
                            <span className="text-emerald-400 text-xs font-semibold">Tip Page Intents Only (RBAC Scoped)</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                        {!websiteKey.has_key || !websiteKey.is_active ? (
                            <Button
                                onClick={handleGenerateWebsiteKey}
                                disabled={keyLoading}
                                className="bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs h-9"
                            >
                                <Key className="h-3.5 w-3.5 mr-2" /> Generate Website Integration Key
                            </Button>
                        ) : (
                            <>
                                <Button
                                    onClick={handleRotateWebsiteKey}
                                    disabled={keyLoading}
                                    className="bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs h-9"
                                >
                                    <RotateCcw className="h-3.5 w-3.5 mr-2" /> Rotate Key
                                </Button>
                                <Button
                                    onClick={handleRevokeWebsiteKey}
                                    disabled={keyLoading}
                                    variant="outline"
                                    className="border-red-500/40 text-red-400 hover:bg-red-500/10 font-semibold text-xs h-9"
                                >
                                    <Lock className="h-3.5 w-3.5 mr-2" /> Revoke Key
                                </Button>
                            </>
                        )}
                        <Button
                            onClick={fetchWebsiteKeyStatus}
                            variant="outline"
                            className="border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs h-9"
                        >
                            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Refresh
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* SECTION C */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden">
                <CardHeader className="border-b border-zinc-800 bg-zinc-950/40">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-base">
                            <Shield className="h-5 w-5 text-purple-400" />
                            C. Android App Security & Pairing (Device Auth)
                        </CardTitle>
                        <Button
                            onClick={handleStartPairing}
                            className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs h-8 shadow-sm"
                        >
                            <QrIcon className="h-3.5 w-3.5 mr-1.5" /> Pair New Android Device
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                    <p className="text-xs text-zinc-400 leading-relaxed">
                        Android devices authenticate using independent, device-specific credentials stored in Android Keystore.
                        Each notification forward is verified using HMAC-SHA256 signatures with 5-minute replay-attack prevention.
                    </p>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                                Registered Android Devices ({devices.length})
                            </h4>
                            <Button
                                onClick={fetchDevices}
                                size="sm"
                                variant="outline"
                                className="border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs h-7"
                            >
                                <RefreshCw className="h-3 w-3 mr-1" /> Reload
                            </Button>
                        </div>

                        {devices.length === 0 ? (
                            <div className="p-6 bg-zinc-950/50 rounded-xl border border-zinc-800 text-center text-xs text-zinc-500">
                                No Android devices paired yet. Click <strong>"Pair New Android Device"</strong> to connect your phone.
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
                                <table className="w-full text-left text-xs text-zinc-300">
                                    <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                                        <tr>
                                            <th className="py-2.5 px-3">Device Name</th>
                                            <th className="py-2.5 px-3">Device ID</th>
                                            <th className="py-2.5 px-3">App Ver</th>
                                            <th className="py-2.5 px-3">Live Status</th>
                                            <th className="py-2.5 px-3">Forward Count</th>
                                            <th className="py-2.5 px-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800/60 font-mono">
                                        {devices.map(dev => (
                                            <tr key={dev.device_id} className="hover:bg-zinc-900/40">
                                                <td className="py-2.5 px-3 font-sans font-medium text-zinc-200">
                                                    {dev.device_name}
                                                </td>
                                                <td className="py-2.5 px-3 text-cyan-400 font-mono text-[11px]">
                                                    {dev.device_id}
                                                </td>
                                                <td className="py-2.5 px-3 text-zinc-400">
                                                    v{dev.app_version || '1.0.1'}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-bold ${
                                                        dev.is_active
                                                            ? (dev.is_online ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400')
                                                            : 'bg-red-500/20 text-red-400'
                                                    }`}>
                                                        {dev.is_active ? (dev.is_online ? 'ONLINE' : 'STANDBY') : 'REVOKED'}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3 text-zinc-400">
                                                    {dev.delivery_count || 0} msgs
                                                </td>
                                                <td className="py-2.5 px-3 text-right space-x-2">
                                                    {dev.is_active && (
                                                        <>
                                                            <button
                                                                onClick={() => handleRotateDevice(dev.device_id)}
                                                                className="text-amber-400 hover:text-amber-300 text-[11px] font-sans font-medium"
                                                            >
                                                                Rotate Secret
                                                            </button>
                                                            <button
                                                                onClick={() => handleRevokeDevice(dev.device_id)}
                                                                className="text-red-400 hover:text-red-300 text-[11px] font-sans font-medium"
                                                            >
                                                                Revoke
                                                            </button>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* SECTION D */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden">
                <CardHeader className="border-b border-zinc-800 bg-zinc-950/40">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-base">
                            <Activity className="h-5 w-5 text-emerald-400" />
                            D. Live Connection Status & Security Audit Log
                        </CardTitle>
                        <Button
                            onClick={() => { fetchAuditLogs(); fetchLiveSystemStatus(); }}
                            size="sm"
                            variant="outline"
                            className="border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs h-8"
                        >
                            <RefreshCw className="h-3 w-3 mr-1.5" /> Refresh
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                        <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Android App</span>
                                <span className="font-semibold text-zinc-200">
                                    {hasOnlineDevice ? 'Connected' : 'Offline'}
                                </span>
                            </div>
                            <span className={`h-2.5 w-2.5 rounded-full ${hasOnlineDevice ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                        </div>

                        <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Local Bot Link</span>
                                <span className="font-semibold text-zinc-200">
                                    {liveStatus.local_link === 'connected' ? 'Connected' : 'Standby'}
                                </span>
                            </div>
                            <span className={`h-2.5 w-2.5 rounded-full ${liveStatus.local_link === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        </div>

                        <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Cloud Bot</span>
                                <span className="font-semibold text-zinc-200">Running (24/7)</span>
                            </div>
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        </div>

                        <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Streamer.bot</span>
                                <span className="font-semibold text-zinc-200">
                                    {liveStatus.streamer_bot === 'connected' ? 'Connected' : 'Disconnected'}
                                </span>
                            </div>
                            <span className={`h-2.5 w-2.5 rounded-full ${liveStatus.streamer_bot === 'connected' ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                        </div>

                        <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] text-zinc-500 uppercase font-semibold block">OBS Overlay</span>
                                <span className="font-semibold text-zinc-200">Active</span>
                            </div>
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                            Security Audit Log (Recent 50 Events)
                        </h4>
                        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/50 max-h-64 overflow-y-auto">
                            <table className="w-full text-left text-xs text-zinc-300">
                                <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800 sticky top-0">
                                    <tr>
                                        <th className="py-2 px-3">Timestamp</th>
                                        <th className="py-2 px-3">Event Type</th>
                                        <th className="py-2 px-3">Actor</th>
                                        <th className="py-2 px-3">Status</th>
                                        <th className="py-2 px-3">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50 font-mono text-[11px]">
                                    {auditLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="py-4 text-center text-zinc-500 font-sans">
                                                No security events logged yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        auditLogs.map((log, i) => (
                                            <tr key={i} className="hover:bg-zinc-900/30">
                                                <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">
                                                    {log.time_str || new Date(log.timestamp * 1000).toLocaleTimeString()}
                                                </td>
                                                <td className="py-2 px-3 font-semibold text-zinc-200">
                                                    {log.event_type}
                                                </td>
                                                <td className="py-2 px-3 text-zinc-400 font-sans">
                                                    {log.actor}
                                                </td>
                                                <td className="py-2 px-3">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold ${
                                                        log.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                                                    }`}>
                                                        {log.status}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 text-zinc-400 font-sans text-[11px] truncate max-w-xs">
                                                    {JSON.stringify(log.details || {})}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* KEY MODAL */}
            {showKeyModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <Card className="w-full max-w-lg bg-zinc-950 border-amber-500/40 shadow-2xl">
                        <CardHeader className="border-b border-zinc-800">
                            <CardTitle className="text-amber-400 text-sm font-semibold flex items-center gap-2">
                                <Key className="h-4 w-4" /> New Website Integration Secret Key
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200 space-y-1">
                                <strong className="flex items-center gap-1 text-amber-400">
                                    <AlertTriangle className="h-3.5 w-3.5" /> One-Time Disclosure Notice
                                </strong>
                                <p>
                                    Save this key into your Tip Page backend environment (`.env`).
                                    For security, this secret key is <strong>never displayed again</strong>.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400">Website Integration Key (Plaintext)</Label>
                                <div className="flex gap-2">
                                    <Input
                                        readOnly
                                        value={newGeneratedSecret}
                                        className="bg-zinc-900 font-mono text-xs text-amber-300 border-zinc-700 select-all"
                                    />
                                    <Button
                                        onClick={() => copyToClipboard(newGeneratedSecret, setKeyCopied)}
                                        size="sm"
                                        className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3"
                                    >
                                        {keyCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                            </div>

                            <Button
                                onClick={() => { setShowKeyModal(false); setNewGeneratedSecret(''); }}
                                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold h-9"
                            >
                                I Have Stored This Secret Safely
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* PAIRING MODAL */}
            {pairingModalOpen && pairingSession && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <Card className="w-full max-w-md bg-zinc-950 border-purple-500/40 shadow-2xl">
                        <CardHeader className="border-b border-zinc-800">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-purple-400 text-sm font-semibold flex items-center gap-2">
                                    <QrIcon className="h-4 w-4" /> Pair Android Device
                                </CardTitle>
                                <span className="text-[11px] font-mono text-amber-400 font-bold flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {Math.floor(pairingCountdown / 60)}:{(pairingCountdown % 60).toString().padStart(2, '0')}
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6 text-center">
                            <div className="p-3 bg-white rounded-xl shadow-lg inline-block mx-auto">
                                <QRCode value={pairingSession.qr_data || pairingSession.pairing_code} size={160} />
                            </div>

                            <div className="space-y-1">
                                <span className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">
                                    One-Time 6-Digit Pairing Code
                                </span>
                                <div className="text-3xl font-black font-mono tracking-widest text-purple-400 bg-purple-500/10 py-2.5 rounded-xl border border-purple-500/30">
                                    {pairingSession.pairing_code}
                                </div>
                                <span className="text-[11px] text-zinc-500 block pt-1">
                                    Enter this code in your PB HERO Android App under Settings &gt; Pair Device
                                </span>
                            </div>

                            <Button
                                onClick={() => { setPairingModalOpen(false); setPairingSession(null); }}
                                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold h-9"
                            >
                                Done / Close
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
