import { useState, useEffect } from 'react'
import axios from 'axios'
import QRCode from 'react-qr-code'
import { Card, Button, Switch } from '@/components/ui'
import { Save, ExternalLink, IndianRupee, CreditCard, Wallet, Settings2, Sliders, QrCode, Globe, Monitor, Beaker, Loader2, History, ShieldCheck, Mail, CheckCircle, AlertCircle, Copy, Check, Smartphone, Trash2 } from 'lucide-react'
import DonationTester from '../components/DonationTester'
import { copyToClipboard } from '@/lib/utils'
import { PageStatusBar } from '@/components/ServiceStatus'

// Helper for conditional classes
const cn = (...classes) => classes.filter(Boolean).join(' ')

export default function TipPageSettings() {
    const [config, setConfig] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState('payment') // payment | share | testing | history | limits | email
    const [copiedMap, setCopiedMap] = useState({})

    const [localTipConfig, setLocalTipConfig] = useState({
        upi_vpa: '',
        upi_name: '',
        message: 'Support the Stream',
        payment_method: 'upi',
        min_amount: '1',
        presets: '20, 50, 100, 500',
        custom_qr_path: '',
        custom_upi_id: '',
        show_custom_upi: true,
        rotating_widget_interval: 15,
        gateway: {
            provider: 'phonepe', // phonepe | razorpay | stripe | other
            merchant_id: '',
            // Generic fields
            key_id: '',
            key_secret: '',
            salt_key: '',
            salt_index: '1',
            publishable_key: '',
            secret_key: '',
            param_1: '',
            param_2: '',
            param_3: ''
        }
    })

    const [externalUrl, setExternalUrl] = useState('')
    const [localIp, setLocalIp] = useState('')
    const [manualPublicUrl, setManualPublicUrl] = useState('')
    const [history, setHistory] = useState([])

    // Email Config State
    const [emailConfig, setEmailConfig] = useState({
        enabled: false,
        email: '',
        app_password: '',
        imap_server: 'imap.gmail.com'
    })
    const [testingEmail, setTestingEmail] = useState(false)

    const [emailStatus, setEmailStatus] = useState('Unknown')

    // App Notifications (Universal) Config State
    const [appAlertsConfig, setAppAlertsConfig] = useState({
        enabled: false,
        min_amount: 0,
        tts_enabled: true
    })
    const [webhookLogs, setWebhookLogs] = useState([])
    const [testingWebhook, setTestingWebhook] = useState(false)
    const [webhookTestResult, setWebhookTestResult] = useState(null) // { type: 'success'|'error', message }

    const handleCopy = async (text, key) => {
        const success = await copyToClipboard(text)
        if (success) {
            setCopiedMap(prev => ({ ...prev, [key]: true }))
            setTimeout(() => {
                setCopiedMap(prev => ({ ...prev, [key]: false }))
            }, 2000)
        }
    }

    const fetchWebhookLogs = async () => {
        try {
            const res = await axios.get('/api/webhook/logs')
            setWebhookLogs(res.data.logs || [])
        } catch (e) { /* ignore */ }
    }

    const testWebhook = async () => {
        setTestingWebhook(true)
        setWebhookTestResult(null)
        try {
            const res = await axios.post('/api/webhook/test/app')
            setWebhookTestResult({ type: 'success', message: res.data.message || 'Test alert fired!' })
            await fetchWebhookLogs()
        } catch (e) {
            setWebhookTestResult({ type: 'error', message: e.response?.data?.detail || e.message })
        } finally {
            setTestingWebhook(false)
        }
    }

    useEffect(() => {
        fetchConfig()
        fetchLocalIp()
        fetchHistory()
        fetchStatus()

        checkTunnel()
        const interval = setInterval(checkTunnel, 5000)
        const statusInterval = setInterval(fetchStatus, 5000) // Poll status every 5s
        
        // Auto-detect IP
        const hostname = window.location.hostname
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            setLocalIp(hostname)
        }

        return () => {
            clearInterval(interval)
            clearInterval(statusInterval)
        }
    }, [])

    const fetchStatus = async () => {
        try {
            const res = await axios.get('/api/status')
            if (res.data?.bot?.email_status) {
                setEmailStatus(res.data.bot.email_status)
            } else if (res.data?.workers?.email_alerts) {
                const ea = res.data.workers.email_alerts;
                setEmailStatus(ea.detail || (ea.status === 'connected' ? 'Connected' : ea.status))
            }
        } catch (e) {
            // ignore
        }
    }

    const fetchHistory = async () => {
        try {
            const res = await axios.get('/api/donations')
            setHistory(res.data)
        } catch (e) { }
    }

    const clearHistory = async () => {
        if (!window.confirm("Are you sure you want to clear all donation history? This cannot be undone.")) return;
        try {
            await axios.delete('/api/donations')
            await fetchHistory()
        } catch (e) {
            alert("Failed to clear history")
        }
    }

    const deleteSingleItem = async (tx) => {
        if (!window.confirm(`Delete donation from ${tx.user} (₹${tx.amount})?`)) return;
        try {
            await axios.delete('/api/donations/item', {
                data: {
                    timestamp: tx.timestamp,
                    user: tx.user,
                    amount: tx.amount
                }
            })
            await fetchHistory()
        } catch (e) {
            alert("Failed to delete item")
        }
    }

    const fetchLocalIp = async () => {
        try {
            const res = await axios.get('/api/ip')
            if (res.data.ip) setLocalIp(res.data.ip)
        } catch (e) {
            console.error("Failed to detect IP", e)
            setLocalIp(window.location.hostname)
        }
    }

    const fetchConfig = async () => {
        try {
            const res = await axios.get('/api/config')
            setConfig(res.data)
            setManualPublicUrl(res.data.public_url || '')

            // Extract or Init Tip Config
            if (res.data.tip_page) {
                setLocalTipConfig(prev => ({
                    ...prev,
                    ...res.data.tip_page,
                    gateway: { ...prev.gateway, ...res.data.tip_page.gateway }
                }))
            } else {
                setLocalTipConfig(prev => ({
                    ...prev,
                    upi_vpa: res.data.upi_vpa || '',
                    upi_name: res.data.upi_name || ''
                }))
            }

            if (res.data.email_verification) {
                setEmailConfig(res.data.email_verification)
            }
            if (res.data.app_alerts) {
                setAppAlertsConfig(res.data.app_alerts)
            }
        } catch (e) {
            console.error("Failed to load config", e)
        } finally {
            setLoading(false)
        }
    }

    const checkTunnel = async () => {
        try {
            const res = await axios.get('/api/tunnel')
            if (res.data.url) {
                let url = res.data.url
                // Fix double /tip issue if backend returns full path
                if (!url.endsWith('/tip')) {
                    url += '/tip'
                }
                setExternalUrl(url)
            }
        } catch (e) {
            // ignore
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const newConfig = {
                ...config,
                tip_page: localTipConfig,
                upi_vpa: localTipConfig.upi_vpa,
                upi_name: localTipConfig.upi_name,
                public_url: manualPublicUrl,
                email_verification: emailConfig,
                app_alerts: appAlertsConfig
            }

            await axios.post('/api/config', { config: newConfig })
            await fetchConfig()
            alert("Settings Saved!")
        } catch (e) {
            alert("Failed to save settings.")
        }
        setSaving(false)
    }

    const testEmailConnection = async () => {
        setTestingEmail(true)
        try {
            // Send current state credentials for testing (even if not saved)
            // We'll assume the API endpoint can handle this or we pass them
            // Actually API at /api/test/email takes payload
            const res = await axios.post('/api/test/email', {
                email: emailConfig.email,
                app_password: emailConfig.app_password,
                imap_server: emailConfig.imap_server
            })
            if (res.data.status === 'success') {
                alert("SUCCESS: Connected to Email! ✅")
            } else {
                alert(`FAILED: ${res.data.message} ❌`)
            }
        } catch (e) {
            alert("Error testing connection.")
        }
        setTestingEmail(false)
    }

    if (loading) return <div className="p-10 text-zinc-500 text-sm italic">Loading configuration...</div>

    const localUrl = `http://${localIp}:8000/tip`

    return (
        <div className="space-y-6 pb-10">
            <PageStatusBar services={['bot', 'email']} />

            {/* Header */}
            <div className="flex justify-between items-center px-1">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-zinc-100 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent w-fit">Tip Page & Payments <span className="text-xs text-zinc-600 font-mono">v2.1 (No-Merchant)</span></h1>
                    <p className="text-sm text-zinc-400">Configure how you receive donations.</p>
                </div>
                <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-zinc-100 text-zinc-900 hover:bg-white text-xs font-bold"
                    size="sm"
                >
                    {saving ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                    Save Changes
                </Button>
            </div>

            {/* Config Tabs */}
            <div className="flex gap-1 border-b border-zinc-800 pb-0 overflow-x-auto scrollbar-hide snap-x" style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}>
                <button
                    onClick={() => setActiveTab('payment')}
                    className={cn(
                        "px-4 py-2 font-medium text-sm transition-all border-b-2 whitespace-nowrap",
                        activeTab === 'payment' ? "border-purple-500 text-purple-400" : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-800"
                    )}
                >
                    Payment Methods
                </button>
                <button
                    onClick={() => setActiveTab('share')}
                    className={cn(
                        "px-4 py-2 font-medium text-sm transition-all border-b-2 whitespace-nowrap flex items-center gap-2",
                        activeTab === 'share' ? "border-pink-500 text-pink-400" : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-800"
                    )}
                >
                    <QrCode className="h-3.5 w-3.5" /> Share & QR
                </button>
                <button
                    onClick={() => setActiveTab('qrupload')}
                    className={cn(
                        "px-4 py-2 font-medium text-sm transition-all border-b-2 whitespace-nowrap flex items-center gap-2",
                        activeTab === 'qrupload' ? "border-cyan-500 text-cyan-400" : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-800"
                    )}
                >
                    <QrCode className="h-3.5 w-3.5" /> Custom QR Upload
                </button>
                <button
                    onClick={() => setActiveTab('testing')}
                    className={cn(
                        "px-4 py-2 font-medium text-sm transition-all border-b-2 whitespace-nowrap flex items-center gap-2",
                        activeTab === 'testing' ? "border-orange-500 text-orange-400" : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-800"
                    )}
                >
                    <Beaker className="h-3.5 w-3.5" /> Testing
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={cn(
                        "px-4 py-2 font-medium text-sm transition-all border-b-2 whitespace-nowrap flex items-center gap-2",
                        activeTab === 'history' ? "border-emerald-500 text-emerald-400" : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-800"
                    )}
                >
                    <History className="h-3.5 w-3.5" /> History
                </button>
                <button
                    onClick={() => setActiveTab('limits')}
                    className={cn(
                        "px-4 py-2 font-medium text-sm transition-all border-b-2 whitespace-nowrap",
                        activeTab === 'limits' ? "border-purple-500 text-purple-400" : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-800"
                    )}
                >
                    Limits
                </button>
                <button
                    onClick={() => setActiveTab('email')}
                    className={cn(
                        "px-4 py-2 font-medium text-sm transition-all border-b-2 whitespace-nowrap flex items-center gap-2",
                        activeTab === 'email' ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-800"
                    )}
                >
                    <Mail className="h-3.5 w-3.5" /> Email
                </button>
            </div>


            {/* ------ TAB: PAYMENT METHODS ------ */}
            {activeTab === 'payment' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">

                    {/* Method Selection */}
                    <Card className="col-span-1 md:col-span-2 p-6 border-zinc-800 bg-zinc-900 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <Wallet className="text-zinc-400 h-5 w-5" />
                            <h2 className="text-lg font-semibold text-zinc-100">Payment Mode</h2>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setLocalTipConfig({ ...localTipConfig, payment_method: 'upi' })}
                                className={cn(
                                    "flex-1 p-4 rounded-xl border transition-all flex flex-col items-center gap-2",
                                    localTipConfig.payment_method === 'upi'
                                        ? "border-emerald-500 bg-emerald-500/10 text-zinc-100"
                                        : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-900 hover:border-zinc-700"
                                )}
                            >
                                <IndianRupee className="h-6 w-6" />
                                <span className="font-semibold text-sm">Direct UPI (QR)</span>
                            </button>

                            <button
                                onClick={() => setLocalTipConfig({ ...localTipConfig, payment_method: 'gateway' })}
                                className={cn(
                                    "flex-1 p-4 rounded-xl border transition-all flex flex-col items-center gap-2",
                                    localTipConfig.payment_method === 'gateway'
                                        ? "border-blue-500 bg-blue-500/10 text-zinc-100"
                                        : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-900 hover:border-zinc-700"
                                )}
                            >
                                <CreditCard className="h-6 w-6" />
                                <span className="font-semibold text-sm">Payment Gateway</span>
                            </button>
                        </div>
                    </Card>

                    {/* Dynamic Config Area */}
                    {localTipConfig.payment_method === 'upi' ? (
                        <Card className="col-span-1 md:col-span-2 p-6 space-y-4 border-emerald-500/10 bg-zinc-900 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <IndianRupee className="text-emerald-500 h-4 w-4" />
                                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">UPI Configuration</h2>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">UPI ID (VPA)</label>
                                    <input
                                        type="text"
                                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                                        placeholder="username@okicici"
                                        value={localTipConfig.upi_vpa}
                                        onChange={(e) => setLocalTipConfig({ ...localTipConfig, upi_vpa: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Display Name</label>
                                    <input
                                        type="text"
                                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                        placeholder="Streamer Name"
                                        value={localTipConfig.upi_name}
                                        onChange={(e) => setLocalTipConfig({ ...localTipConfig, upi_name: e.target.value })}
                                    />
                                </div>
                            </div>
                        </Card>
                    ) : (
                        <Card className="col-span-1 md:col-span-2 p-6 space-y-4 border-blue-500/10 bg-zinc-900 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <Settings2 className="text-blue-500 h-4 w-4" />
                                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">Gateway Configuration</h2>
                            </div>

                            <div className="space-y-4">
                                {/* Provider Selection */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Provider</label>
                                    <select
                                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        value={localTipConfig.gateway?.provider || 'phonepe'}
                                        onChange={(e) => setLocalTipConfig({
                                            ...localTipConfig,
                                            gateway: { ...localTipConfig.gateway, provider: e.target.value }
                                        })}
                                    >
                                        <option value="phonepe">PhonePe</option>
                                        <option value="razorpay">Razorpay</option>
                                        <option value="stripe">Stripe</option>
                                        <option value="other">Other / Generic</option>
                                    </select>
                                </div>

                                {/* Dynamic Fields */}
                                <div className="grid md:grid-cols-2 gap-6 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800">

                                    {/* RAZORPAY */}
                                    {localTipConfig.gateway?.provider === 'razorpay' && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Key ID</label>
                                                <input type="text" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                                    placeholder="rzp_test_..."
                                                    value={localTipConfig.gateway?.key_id || ''}
                                                    onChange={(e) => setLocalTipConfig({ ...localTipConfig, gateway: { ...localTipConfig.gateway, key_id: e.target.value } })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Key Secret</label>
                                                <input type="password" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                                    placeholder="Enter Key Secret"
                                                    value={localTipConfig.gateway?.key_secret || ''}
                                                    onChange={(e) => setLocalTipConfig({ ...localTipConfig, gateway: { ...localTipConfig.gateway, key_secret: e.target.value } })}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {/* PHONEPE */}
                                    {localTipConfig.gateway?.provider === 'phonepe' && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Merchant ID</label>
                                                <input type="text" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                                    placeholder="MERC..."
                                                    value={localTipConfig.gateway?.merchant_id || ''}
                                                    onChange={(e) => setLocalTipConfig({ ...localTipConfig, gateway: { ...localTipConfig.gateway, merchant_id: e.target.value } })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Salt Key</label>
                                                <input type="password" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                                    placeholder="Enter Salt Key"
                                                    value={localTipConfig.gateway?.salt_key || ''}
                                                    onChange={(e) => setLocalTipConfig({ ...localTipConfig, gateway: { ...localTipConfig.gateway, salt_key: e.target.value } })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Salt Index</label>
                                                <input type="text" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                                    placeholder="1"
                                                    value={localTipConfig.gateway?.salt_index || '1'}
                                                    onChange={(e) => setLocalTipConfig({ ...localTipConfig, gateway: { ...localTipConfig.gateway, salt_index: e.target.value } })}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {/* STRIPE */}
                                    {localTipConfig.gateway?.provider === 'stripe' && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Publishable Key</label>
                                                <input type="text" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                                    placeholder="pk_test_..."
                                                    value={localTipConfig.gateway?.publishable_key || ''}
                                                    onChange={(e) => setLocalTipConfig({ ...localTipConfig, gateway: { ...localTipConfig.gateway, publishable_key: e.target.value } })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Secret Key</label>
                                                <input type="password" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                                    placeholder="sk_test_..."
                                                    value={localTipConfig.gateway?.secret_key || ''}
                                                    onChange={(e) => setLocalTipConfig({ ...localTipConfig, gateway: { ...localTipConfig.gateway, secret_key: e.target.value } })}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {/* OTHER */}
                                    {localTipConfig.gateway?.provider === 'other' && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Param 1 (Public ID)</label>
                                                <input type="text" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                                    value={localTipConfig.gateway?.param_1 || ''}
                                                    onChange={(e) => setLocalTipConfig({ ...localTipConfig, gateway: { ...localTipConfig.gateway, param_1: e.target.value } })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Param 2 (Secret)</label>
                                                <input type="password" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                                    value={localTipConfig.gateway?.param_2 || ''}
                                                    onChange={(e) => setLocalTipConfig({ ...localTipConfig, gateway: { ...localTipConfig.gateway, param_2: e.target.value } })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Param 3 (Extra)</label>
                                                <input type="text" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                                    value={localTipConfig.gateway?.param_3 || ''}
                                                    onChange={(e) => setLocalTipConfig({ ...localTipConfig, gateway: { ...localTipConfig.gateway, param_3: e.target.value } })}
                                                />
                                            </div>
                                        </>
                                    )}

                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            )}


            {/* ------ TAB: SHARE & QR ------ */}
            {activeTab === 'share' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">

                    {/* Public QR */}
                    <Card className="p-6 space-y-4 border-pink-500/10 bg-zinc-900 shadow-sm flex flex-col items-center text-center">
                        <div className="flex items-center gap-2 mb-2 w-full justify-center">
                            <Globe className="text-pink-500 h-5 w-5" />
                            <h2 className="text-lg font-semibold text-zinc-100">Public Internet QR</h2>
                        </div>
                        <p className="text-xs text-zinc-400 mb-4 max-w-[250px]">
                            Share this on stream. Viewers can scan this to open your Tip Page from anywhere.
                        </p>


                        {(manualPublicUrl || externalUrl) ? (
                            <div className="bg-white p-3 rounded-lg shadow-sm">
                                <QRCode value={manualPublicUrl || externalUrl} size={150} />
                            </div>
                        ) : (
                            <div className="h-[150px] w-[150px] bg-zinc-950 rounded-lg flex items-center justify-center text-zinc-600 text-xs text-center p-4 border border-zinc-800">
                                Tunnel Offline.<br />Start Cloudflare Tunnel first.
                            </div>
                        )}

                        <div className="mt-4 w-full">
                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block text-left">Public URL</label>

                            {/* Manual Override Input */}
                            <div className="mb-2">
                                <input
                                    type="text"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-300 text-xs focus:ring-1 focus:ring-pink-500 focus:border-pink-500 focus:outline-none mb-1"
                                    placeholder="Enter Manual URL (e.g. https://mysite.com)"
                                    value={manualPublicUrl}
                                    onChange={(e) => setManualPublicUrl(e.target.value)}
                                />
                                <p className="text-[10px] text-zinc-500 text-left">
                                    Override if using a Custom Domain/Token.
                                </p>
                            </div>

                            <div className="flex gap-2 items-center">
                                <div className="flex-1 bg-zinc-950 p-2.5 rounded border border-pink-500/20 text-pink-400 font-mono text-xs break-all text-left">
                                    {manualPublicUrl || externalUrl || "Not Available"}
                                </div>
                                <Button size="icon" variant="outline" className="h-9 w-9 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 shrink-0" onClick={() => handleCopy(manualPublicUrl || externalUrl, 'public')}>
                                    {copiedMap['public'] === true ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* Local QR */}
                    <Card className="p-6 space-y-4 border-emerald-500/10 bg-zinc-900 shadow-sm flex flex-col items-center text-center">
                        <div className="flex items-center gap-2 mb-2 w-full justify-center">
                            <Monitor className="text-emerald-500 h-5 w-5" />
                            <h2 className="text-lg font-semibold text-zinc-100">Private Local QR</h2>
                        </div>
                        <p className="text-xs text-zinc-400 mb-4 max-w-[250px]">
                            Use this to test the Tip Page on your phone while on the same WiFi.
                        </p>

                        <div className="bg-white p-3 rounded-lg shadow-sm">
                            <QRCode value={localUrl} size={150} />
                        </div>

                        <div className="mt-4 w-full space-y-2">
                            <div className="text-left">
                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Local IP Address</label>
                                <input
                                    type="text"
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-200 text-xs font-mono"
                                    value={localIp}
                                    onChange={(e) => setLocalIp(e.target.value)}
                                    placeholder="e.g 192.168.1.5"
                                />
                            </div>
                            <div className="flex gap-2 items-center">
                                <div className="flex-1 bg-zinc-950 p-2.5 rounded border border-emerald-500/20 text-emerald-400 font-mono text-xs break-all text-left">
                                    {localUrl}
                                </div>
                                <Button size="icon" variant="outline" className="h-9 w-9 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 shrink-0" onClick={() => handleCopy(localUrl, 'local')}>
                                    {copiedMap['local'] === true ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    </Card>

                </div>
            )}


            {/* ------ TAB: QR UPLOAD ------ */}
            {activeTab === 'qrupload' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                    <Card className="col-span-1 md:col-span-2 p-6 border-zinc-800 bg-zinc-900 shadow-sm space-y-5">
                        <div className="flex items-center gap-2 mb-2">
                            <QrCode className="text-cyan-400 h-5 w-5" />
                            <h2 className="text-lg font-semibold text-zinc-100">Custom QR Code for OBS Widget</h2>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-zinc-400">
                                Upload your custom UPI QR code image. This will be used in the new "Rotating Stream Hub" OBS widget.
                            </p>
                            <p className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 inline-block px-2 py-1 rounded border border-emerald-500/20">
                                Recommended OBS Size: Width 600px, Height 800px
                            </p>
                        </div>
                        
                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Upload Section */}
                            <div className="space-y-4">
                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide block">Upload QR Image</label>
                                <div className="border-2 border-dashed border-zinc-700 rounded-xl p-6 flex flex-col items-center justify-center bg-zinc-950/50 hover:bg-zinc-900/50 transition-colors">
                                    <input 
                                        type="file" 
                                        accept="image/png, image/jpeg, image/jpg, image/webp"
                                        id="qr-upload"
                                        className="hidden"
                                        onChange={async (e) => {
                                            if (e.target.files && e.target.files[0]) {
                                                const file = e.target.files[0];
                                                const formData = new FormData();
                                                formData.append("file", file);
                                                try {
                                                    const res = await axios.post('/api/upload/qr', formData, {
                                                        headers: { 'Content-Type': 'multipart/form-data' }
                                                    });
                                                    setLocalTipConfig({ ...localTipConfig, custom_qr_path: res.data.path });
                                                    alert("QR Code Uploaded Successfully!");
                                                } catch (err) {
                                                    alert("Upload failed: " + (err.response?.data?.error || err.message));
                                                }
                                            }
                                        }}
                                    />
                                    <label htmlFor="qr-upload" className="cursor-pointer flex flex-col items-center space-y-2">
                                        <div className="h-10 w-10 bg-cyan-500/10 rounded-full flex items-center justify-center text-cyan-500">
                                            <QrCode className="h-5 w-5" />
                                        </div>
                                        <span className="text-sm font-medium text-cyan-400 hover:text-cyan-300">Click to select image</span>
                                        <span className="text-xs text-zinc-500">PNG, JPG, WEBP</span>
                                    </label>
                                </div>
                                
                                {localTipConfig.custom_qr_path && (
                                    <div className="mt-4 p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle className="text-emerald-500 h-4 w-4" />
                                            <span className="text-xs text-zinc-300 truncate max-w-[200px]">{localTipConfig.custom_qr_path}</span>
                                        </div>
                                        <img src={localTipConfig.custom_qr_path + "?t=" + Date.now()} alt="Uploaded QR" className="h-12 w-12 object-contain bg-white rounded" />
                                    </div>
                                )}
                                
                                <div className="mt-4 space-y-3">
                                    <div className="flex items-center justify-between p-3.5 bg-zinc-950/40 rounded-xl border border-zinc-800/80">
                                        <div className="space-y-0.5 pr-4">
                                            <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Display Custom UPI ID in OBS</label>
                                            <p className="text-[10px] text-zinc-400">Toggle whether to show the Custom UPI ID text below the QR code in the OBS widget.</p>
                                        </div>
                                        <Switch
                                            checked={localTipConfig.show_custom_upi !== false}
                                            onCheckedChange={(checked) => setLocalTipConfig({ ...localTipConfig, show_custom_upi: checked })}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Custom UPI ID</label>
                                        <p className="text-[10px] text-zinc-400 mb-2">This UPI ID will be displayed below the QR code in the Rotating Stream Hub.</p>
                                        <input
                                            type="text"
                                            placeholder="e.g. username@bank"
                                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                            value={localTipConfig.custom_upi_id || ''}
                                            onChange={(e) => setLocalTipConfig({ ...localTipConfig, custom_upi_id: e.target.value })}
                                            disabled={localTipConfig.show_custom_upi === false}
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Settings Section */}
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Rotation Interval (Seconds)</label>
                                    <p className="text-[10px] text-zinc-400 mb-2">How long each view (QR Code, Donations, Viewers) stays on screen before sliding.</p>
                                    <input
                                        type="number"
                                        min="5"
                                        max="120"
                                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-sm"
                                        value={localTipConfig.rotating_widget_interval || 15}
                                        onChange={(e) => setLocalTipConfig({ ...localTipConfig, rotating_widget_interval: parseInt(e.target.value) || 15 })}
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* ------ TAB: LIMITS ------ */}
            {activeTab === 'limits' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">

                    <Card className="p-6 space-y-5 border-zinc-800 bg-zinc-900 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Sliders className="text-zinc-400 h-5 w-5" />
                            <h2 className="text-lg font-semibold text-zinc-100">Limits & Presets</h2>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Minimum Tip Amount (₹)</label>
                            <input
                                type="number"
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm"
                                value={localTipConfig.min_amount}
                                onChange={(e) => setLocalTipConfig({ ...localTipConfig, min_amount: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Preset Amounts (Comma Separated)</label>
                            <input
                                type="text"
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm"
                                placeholder="20, 50, 100, 500"
                                value={Array.isArray(localTipConfig.presets) ? localTipConfig.presets.join(', ') : localTipConfig.presets}
                                onChange={(e) => setLocalTipConfig({ ...localTipConfig, presets: e.target.value })}
                            />
                        </div>
                    </Card>

                </div>
            )}

            {/* ------ TAB: TESTING ------ */}
            {activeTab === 'testing' && <DonationTester />}

            {/* ------ TAB: HISTORY ------ */}
            {activeTab === 'history' && (
                <Card className="border-zinc-800 bg-zinc-900 shadow-sm overflow-hidden animate-fade-in">
                    <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/30">
                        <div className="flex items-center gap-2">
                            <History className="text-zinc-500 h-4 w-4" />
                            <h3 className="font-semibold text-zinc-200 text-sm">Recent Transactions</h3>
                        </div>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs border-red-500/30 text-red-500 hover:bg-red-500/10" onClick={clearHistory}>Clear History</Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs border-zinc-700 text-zinc-400 hover:text-zinc-100" onClick={fetchHistory}>Refresh</Button>
                        </div>
                    </div>
                    <div className="overflow-x-auto max-h-[500px]">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs uppercase bg-zinc-950 text-zinc-500 font-medium sticky top-0">
                                <tr>
                                    <th className="px-5 py-3 font-medium">Date</th>
                                    <th className="px-5 py-3 font-medium">User</th>
                                    <th className="px-5 py-3 font-medium">Amount</th>
                                    <th className="px-5 py-3 font-medium">Message</th>
                                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {history.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-5 py-8 text-center text-zinc-500 italic text-xs">No transactions found yet.</td>
                                    </tr>
                                ) : (
                                    history.map((tx, i) => (
                                        <tr key={i} className="hover:bg-zinc-800/50 transition-colors">
                                            <td className="px-5 py-3 font-mono text-xs text-zinc-500 whitespace-nowrap">{tx.timestamp}</td>
                                            <td className="px-5 py-3 font-semibold text-zinc-200">{tx.user}</td>
                                            <td className="px-5 py-3 text-emerald-500 font-mono font-medium">₹{tx.amount}</td>
                                            <td className="px-5 py-3 text-zinc-400 max-w-[200px] truncate text-xs" title={tx.message}>{tx.message}</td>
                                            <td className="px-5 py-3 text-right">
                                                <button
                                                    onClick={() => deleteSingleItem(tx)}
                                                    className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                                                    title="Delete this item"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* ------ TAB: EMAIL ------ */}
            {activeTab === 'email' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                    <Card className="col-span-1 md:col-span-2 p-6 border-zinc-800 bg-zinc-900 shadow-sm space-y-6">
                        <div className="flex items-center gap-2 border-b border-zinc-800 pb-4">
                            <Mail className="text-amber-500 h-5 w-5" />
                            <div>
                                <h2 className="text-lg font-semibold text-zinc-100">Email Verification</h2>
                                <p className="text-xs text-zinc-500">Connect a Gmail account to verify real payments from GPay/PhonePe.</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Replaced Checkbox with explicit buttons for better feedback */}
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={async () => {
                                        setEmailStatus("Connecting...");
                                        try {
                                            const res = await axios.post('/api/email/connect');
                                            setEmailStatus(res.data.status);
                                            setEmailConfig({ ...emailConfig, enabled: true });
                                        } catch (e) {
                                            alert("Failed to connect: " + e.message);
                                            setEmailStatus("Error");
                                        }
                                    }}
                                    disabled={emailStatus === 'Connected' || emailStatus === 'Connecting...'}
                                    className={cn(
                                        "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500",
                                        (emailStatus === 'Connected' || emailStatus === 'Connecting...') && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {emailStatus === 'Connecting...' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                                    Connect
                                </Button>

                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                        try {
                                            const res = await axios.post('/api/email/disconnect');
                                            setEmailStatus(res.data.status);
                                            setEmailConfig({ ...emailConfig, enabled: false });
                                        } catch (e) {
                                            alert("Failed to disconnect");
                                        }
                                    }}
                                    disabled={emailStatus !== 'Connected' && !emailStatus.startsWith("Disconnected")}
                                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                >
                                    Disconnect
                                </Button>
                            </div>

                            <div className="ml-2 text-xs text-zinc-500">
                                {emailConfig.enabled ? "Auto-checking enabled." : "Monitoring disabled."}
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Gmail Address</label>
                                <input
                                    type="email"
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                                    placeholder="example@gmail.com"
                                    value={emailConfig.email}
                                    onChange={(e) => setEmailConfig({ ...emailConfig, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                                    App Password <span className="text-zinc-600">(Not your login password)</span>
                                </label>
                                <input
                                    type="password"
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                                    placeholder="xxxx xxxx xxxx xxxx"
                                    value={emailConfig.app_password}
                                    onChange={(e) => setEmailConfig({ ...emailConfig, app_password: e.target.value })}
                                />
                                <p className="text-[10px] text-zinc-500">
                                    Generate this at <a href="https://myaccount.google.com/apppasswords" target="_blank" className="text-amber-500 hover:underline">Google App Passwords</a>.
                                    2FA must be enabled.
                                </p>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
                            <div className="text-xs text-zinc-500">
                                <p>IMAP Server: <span className="font-mono text-zinc-400">{emailConfig.imap_server}</span></p>

                                {/* Status Indicator */}
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="uppercase tracking-wide font-bold text-[10px]">Status:</span>
                                    {emailStatus === 'Connected' ? (
                                        <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>
                                            Connected
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5 text-red-500 font-medium">
                                            <span className="h-2 w-2 rounded-full bg-red-500"></span>
                                            {emailStatus || 'Unknown'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={testEmailConnection}
                                disabled={testingEmail || !emailConfig.email || !emailConfig.app_password}
                                className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                            >
                                {testingEmail ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-2" /> : <CheckCircle className="h-3.5 w-3.5 mr-2" />}
                                Test Connection
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    )
}
