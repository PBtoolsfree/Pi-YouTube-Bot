import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Smartphone, CheckCircle, Loader2, AlertCircle, Beaker, ShieldCheck, Mail, RefreshCw, Key, Check, QrCode } from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils'

const API_URL = import.meta?.env?.VITE_API_URL || '/api'

export default function AppWebhookSettings() {
    const [appAlertsConfig, setAppAlertsConfig] = useState({ enabled: false, min_amount: 0, tts_enabled: true })
    const [localPiConfig, setLocalPiConfig] = useState({ enabled: false, webhook_url: '' })
    const [webhookLogs, setWebhookLogs] = useState([])
    const [testingWebhook, setTestingWebhook] = useState(false)
    const [webhookTestResult, setWebhookTestResult] = useState(null)
    const [localIp, setLocalIp] = useState('192.168.1.X')

    // PB HERO Smart Donation State
    const [donationDashboard, setDonationDashboard] = useState(null)
    const [bridgeDevices, setBridgeDevices] = useState([])
    const [approvingId, setApprovingId] = useState(null)
    const [newDeviceName, setNewDeviceName] = useState('PB HERO Android')
    const [registeredSecret, setRegisteredSecret] = useState(null)

    useEffect(() => {
        // Fetch config
        axios.get(`${API_URL}/config`).then(res => {
            if (res.data?.app_alerts) setAppAlertsConfig(res.data.app_alerts)
            if (res.data?.local_pi) setLocalPiConfig(res.data.local_pi)
        })
        fetchWebhookLogs()
        fetchDonationData()

        const logsInterval = setInterval(fetchWebhookLogs, 5000)
        const donationInterval = setInterval(fetchDonationData, 5000)

        // Auto-detect IP
        const hostname = window.location.hostname
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            setLocalIp(hostname)
        }

        return () => {
            clearInterval(logsInterval)
            clearInterval(donationInterval)
        }
    }, [])

    const fetchWebhookLogs = async () => {
        try {
            const res = await axios.get(`${API_URL}/webhook/logs`)
            setWebhookLogs(res.data.logs || [])
        } catch (e) { }
    }

    const fetchDonationData = async () => {
        try {
            const [dashRes, devRes] = await Promise.all([
                axios.get(`${API_URL}/donation/dashboard`),
                axios.get(`${API_URL}/bridge/devices`)
            ])
            setDonationDashboard(dashRes.data)
            setBridgeDevices(devRes.data?.devices || [])
        } catch (e) { }
    }

    const testWebhook = async () => {
        setTestingWebhook(true)
        setWebhookTestResult(null)
        try {
            const res = await axios.post(`${API_URL}/webhook/test/app`)
            setWebhookTestResult({ type: 'success', message: res.data.message || 'Test alert fired!' })
            await fetchWebhookLogs()
            await fetchDonationData()
        } catch (e) {
            const detail = e.response?.data?.detail;
            const errorMsg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? JSON.stringify(detail) : e.message);
            setWebhookTestResult({ type: 'error', message: errorMsg })
        }
        setTestingWebhook(false)
    }

    const handleManualApprove = async (donationId) => {
        setApprovingId(donationId)
        try {
            await axios.post(`${API_URL}/donation/manual-approve/${donationId}`)
            await fetchDonationData()
        } catch (e) {
            console.error(e)
        }
        setApprovingId(null)
    }

    const handleRegisterDevice = async () => {
        try {
            const res = await axios.post(`${API_URL}/bridge/register`, {
                device_name: newDeviceName
            })
            setRegisteredSecret(res.data)
            await fetchDonationData()
        } catch (e) {
            console.error(e)
        }
    }

    const saveConfig = async (newAppAlerts, newLocalPi) => {
        if (newAppAlerts) setAppAlertsConfig(newAppAlerts)
        if (newLocalPi) setLocalPiConfig(newLocalPi)
        try {
            const res = await axios.get(`${API_URL}/config`)
            const fullConfig = res.data
            if (newAppAlerts) fullConfig.app_alerts = newAppAlerts
            if (newLocalPi) fullConfig.local_pi = newLocalPi
            await axios.post(`${API_URL}/config`, { config: fullConfig })
        } catch (e) {
            console.error("Failed to save webhook config", e)
        }
    }

    return (
        <div className="animate-fade-in max-w-5xl mx-auto space-y-6">
            {/* ── PB HERO SMART DONATION VERIFICATION DASHBOARD ── */}
            <Card className="p-6 border-cyan-800/40 bg-zinc-900 shadow-lg space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="text-cyan-400 h-6 w-6" />
                            <h2 className="text-xl font-black tracking-wide text-zinc-100">
                                PB HERO <span className="text-cyan-400">SMART DONATION</span> MANAGER
                            </h2>
                        </div>
                        <p className="text-xs text-zinc-400">
                            Central verification engine correlating Tip Page Intents, Paytm Business Android Notifications, and Gmail IMAP signals.
                        </p>
                    </div>
                    <button
                        onClick={fetchDonationData}
                        className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                        title="Refresh Status"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>

                {/* Pipeline Status Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Tip Page Intents</span>
                        <span className="text-xl font-bold text-indigo-400 font-mono">{donationDashboard?.total_intents || 0}</span>
                        <span className="text-[10px] text-zinc-500 block mt-1">/tip route active</span>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Android Signals</span>
                        <span className="text-xl font-bold text-cyan-400 font-mono">{donationDashboard?.total_notifications || 0}</span>
                        <span className="text-[10px] text-emerald-400 block mt-1">{bridgeDevices.length} device(s) paired</span>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Paytm Emails</span>
                        <span className="text-xl font-bold text-purple-400 font-mono">{donationDashboard?.total_emails || 0}</span>
                        <span className="text-[10px] text-zinc-500 block mt-1">IMAP Observer</span>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Verified Total</span>
                        <span className="text-xl font-bold text-emerald-400 font-mono">{donationDashboard?.total_verified || 0}</span>
                        <span className="text-[10px] text-emerald-500/80 block mt-1">Strict matching</span>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Dual Announced</span>
                        <span className="text-xl font-bold text-amber-400 font-mono">{donationDashboard?.total_announced || 0}</span>
                        <span className="text-[10px] text-amber-500/80 block mt-1">OBS + Local TTS</span>
                    </div>
                </div>

                {/* Verified Donations Feed */}
                <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-emerald-400" /> Verified Donations &amp; Dual Dispatch History
                    </h3>

                    {!donationDashboard?.recent_verified || donationDashboard.recent_verified.length === 0 ? (
                        <p className="text-xs text-zinc-600 italic bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                            No verified donations yet. Viewer payments from QR or Tip Page will appear here after automated verification.
                        </p>
                    ) : (
                        <div className="bg-zinc-950 rounded-lg border border-zinc-800 overflow-x-auto">
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                                        <th className="text-left px-3 py-2">Event ID</th>
                                        <th className="text-left px-3 py-2">Donor</th>
                                        <th className="text-left px-3 py-2">Amount</th>
                                        <th className="text-left px-3 py-2">UTR / Ref</th>
                                        <th className="text-left px-3 py-2">Status</th>
                                        <th className="text-left px-3 py-2">OBS Overlay</th>
                                        <th className="text-left px-3 py-2">Local TTS</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900">
                                    {donationDashboard.recent_verified.slice(-10).reverse().map((item, idx) => (
                                        <tr key={idx} className="hover:bg-zinc-900/50">
                                            <td className="px-3 py-2 text-zinc-500 font-mono">{item.event_id?.slice(-8)}</td>
                                            <td className="px-3 py-2 font-semibold text-zinc-200">{item.donor_name}</td>
                                            <td className="px-3 py-2 font-bold text-emerald-400 font-mono">₹{item.amount}</td>
                                            <td className="px-3 py-2 text-zinc-400 font-mono">{item.utr || 'N/A'}</td>
                                            <td className="px-3 py-2">
                                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold">
                                                    {item.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className={cn(
                                                    'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                                    item.cloud_overlay_status === 'DELIVERED' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-zinc-800 text-zinc-500'
                                                )}>
                                                    {item.cloud_overlay_status || 'PENDING'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className={cn(
                                                    'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                                    item.local_tts_status === 'DELIVERED' ? 'bg-purple-500/15 text-purple-300' : 'bg-zinc-800 text-zinc-500'
                                                )}>
                                                    {item.local_tts_status || 'PENDING'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Pending Signals & Manual Review */}
                {donationDashboard?.pending_notifications && donationDashboard.pending_notifications.length > 0 && (
                    <div className="space-y-3 pt-2">
                        <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" /> Pending Verification / Waiting for Email Corroboration
                        </h3>
                        <div className="bg-zinc-950 rounded-lg border border-amber-900/30 overflow-x-auto">
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                                        <th className="text-left px-3 py-2">Notification ID</th>
                                        <th className="text-left px-3 py-2">Package</th>
                                        <th className="text-left px-3 py-2">Amount</th>
                                        <th className="text-left px-3 py-2">Payer</th>
                                        <th className="text-left px-3 py-2">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900">
                                    {donationDashboard.pending_notifications.map((n, i) => (
                                        <tr key={i} className="hover:bg-zinc-900/50">
                                            <td className="px-3 py-2 text-zinc-500 font-mono">{n.event_id?.slice(-8)}</td>
                                            <td className="px-3 py-2 text-zinc-400 font-mono">{n.package_name}</td>
                                            <td className="px-3 py-2 font-bold text-amber-400 font-mono">₹{n.amount}</td>
                                            <td className="px-3 py-2 text-zinc-300">{n.payer_name || 'Supporter'}</td>
                                            <td className="px-3 py-2">
                                                <button
                                                    onClick={() => handleManualApprove(n.event_id)}
                                                    disabled={approvingId === n.event_id}
                                                    className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] transition-colors"
                                                >
                                                    {approvingId === n.event_id ? 'Approving...' : 'Approve & Announce'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Device Provisioning for Android App */}
                <div className="pt-4 border-t border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                <Key className="h-4 w-4 text-cyan-400" /> Registered Android Bridge Devices
                            </h3>
                            <p className="text-xs text-zinc-400">Authenticated devices provisioned to forward Paytm Business notifications via signed HMAC.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={newDeviceName}
                                onChange={(e) => setNewDeviceName(e.target.value)}
                                className="bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                                placeholder="Device Name"
                            />
                            <button
                                onClick={handleRegisterDevice}
                                className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all"
                            >
                                Provision Device
                            </button>
                        </div>
                    </div>

                    {registeredSecret && (
                        <div className="bg-cyan-950/40 border border-cyan-800 rounded p-3 text-xs space-y-1">
                            <div className="font-bold text-cyan-300">Device Provisioned Successfully!</div>
                            <div className="text-zinc-400">Device ID: <span className="font-mono text-zinc-200">{registeredSecret.device_id}</span></div>
                            <div className="text-zinc-400">Secret Key: <span className="font-mono text-zinc-200">{registeredSecret.secret_key}</span></div>
                            <div className="text-[11px] text-zinc-500">Configure these in your PB HERO Notification Bridge app Settings.</div>
                        </div>
                    )}

                    {bridgeDevices.length > 0 && (
                        <div className="bg-zinc-950 rounded-lg border border-zinc-800 overflow-x-auto">
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                                        <th className="text-left px-3 py-2">Device ID</th>
                                        <th className="text-left px-3 py-2">Name</th>
                                        <th className="text-left px-3 py-2">Deliveries</th>
                                        <th className="text-left px-3 py-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900">
                                    {bridgeDevices.map((dev, i) => (
                                        <tr key={i} className="hover:bg-zinc-900/50">
                                            <td className="px-3 py-2 text-cyan-400 font-mono">{dev.device_id}</td>
                                            <td className="px-3 py-2 text-zinc-300">{dev.device_name}</td>
                                            <td className="px-3 py-2 font-mono text-zinc-400">{dev.delivery_count || 0}</td>
                                            <td className="px-3 py-2">
                                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold">Active</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Card>

            {/* ── ORIGINAL WEBHOOK CARD (Preserved 100%) ── */}
            <Card className="p-6 border-zinc-800 bg-zinc-900 shadow-sm space-y-6">
                <div className="space-y-2">
                    <h2 className="text-xl font-bold flex items-center gap-3">
                        <Smartphone className="text-indigo-400 h-6 w-6" />
                        Universal App Webhook
                    </h2>
                    <p className="text-sm text-zinc-400">
                        This feature bypasses traditional payment gateways. The Pi Bot will read the <strong>Google Pay, PhonePe, and Paytm</strong> notifications directly from your Android device and show alerts on stream without showing any specific brand to your viewers!
                    </p>
                </div>

                <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                    <div>
                        <div className="font-medium text-zinc-200 mb-1 text-sm">Enable Webhook Alerts</div>
                        <div className="text-xs text-zinc-500">Listen for incoming requests from MacroDroid/Tasker/PB HERO Bridge</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={appAlertsConfig.enabled}
                            onChange={(e) => saveConfig({ ...appAlertsConfig, enabled: e.target.checked }, null)}
                        />
                        <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                    </label>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Minimum Amount (₹)</label>
                        <input
                            type="number"
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            value={appAlertsConfig.min_amount}
                            onChange={(e) => saveConfig({ ...appAlertsConfig, min_amount: Number(e.target.value) }, null)}
                            min="0"
                        />
                        <p className="text-[10px] text-zinc-500">Alerts below this amount will be ignored.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Audio (Read Amount &amp; Name)</label>
                        <div className="flex items-center justify-between bg-zinc-950 p-2.5 rounded-lg border border-zinc-700 h-[42px]">
                            <span className="text-sm text-zinc-300">Enable Text-to-Speech</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={appAlertsConfig.tts_enabled}
                                    onChange={(e) => saveConfig({ ...appAlertsConfig, tts_enabled: e.target.checked }, null)}
                                />
                                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="pt-4 border-t border-zinc-800 space-y-4">
                    <h3 className="text-sm font-semibold text-zinc-200">📱 How to send Mobile Notifications to Pi Bot</h3>
                    <p className="text-xs text-zinc-400">Download the native <strong>PB HERO Notification Bridge</strong> app APK directly onto your Android phone.</p>

                    <div className="bg-zinc-950 p-4 rounded-lg font-mono text-xs border border-zinc-800 space-y-3">
                        <ol className="list-decimal pl-4 space-y-2 text-zinc-300">
                            <li>Download the <a href="/PB-HERO-Notification-Bridge.apk" download="PB-HERO-Notification-Bridge.apk" className="text-cyan-400 hover:underline font-semibold">PB HERO Notification Bridge</a> APK directly to your phone.</li>
                            <li>Grant <strong>Notification Access</strong> permission on the onboarding screen.</li>
                            <li>In the <strong>Apps</strong> tab, ensure <span className="text-emerald-400 font-semibold">com.paytm.business</span> is whitelisted.</li>
                            <li>Set Webhook URL: <br /> <span className="text-indigo-300 mt-1 block break-all font-semibold select-all">http://{localIp}:8000/api/webhook/paytm-bridge</span></li>
                            <li>Every Paytm Business payment will now be corroborated via Gmail IMAP and broadcasted to your OBS Overlay and Local Edge-TTS!</li>
                        </ol>
                    </div>
                </div>

                {/* ── Test & Live Log ── */}
                <div className="pt-4 border-t border-zinc-800 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-zinc-200">🔔 Test &amp; Live Webhook Log</h3>
                        <button
                            onClick={testWebhook}
                            disabled={testingWebhook}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-all"
                        >
                            {testingWebhook
                                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Firing...</>
                                : <><Beaker className="h-3.5 w-3.5" /> Send Test Alert</>
                            }
                        </button>
                    </div>

                    {webhookTestResult && (
                        <div className={cn(
                            'flex items-center gap-2 text-xs px-3 py-2 rounded-lg border',
                            webhookTestResult.type === 'success'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        )}>
                            {webhookTestResult.type === 'success'
                                ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                                : <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            }
                            {webhookTestResult.message}
                        </div>
                    )}

                    {webhookLogs.length === 0 ? (
                        <p className="text-xs text-zinc-600 italic">No webhook events recorded yet. Send a test or wait for a real payment.</p>
                    ) : (
                        <div className="bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden">
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                                        <th className="text-left px-3 py-2 font-medium">Time</th>
                                        <th className="text-left px-3 py-2 font-medium">Provider</th>
                                        <th className="text-left px-3 py-2 font-medium">Status</th>
                                        <th className="text-left px-3 py-2 font-medium">Message</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900">
                                    {webhookLogs.slice(0, 10).map((log, i) => (
                                        <tr key={i} className="hover:bg-zinc-900/50 transition-colors">
                                            <td className="px-3 py-1.5 text-zinc-500 font-mono whitespace-nowrap">{log.timestamp}</td>
                                            <td className="px-3 py-1.5 text-zinc-400 capitalize">{log.provider}</td>
                                            <td className="px-3 py-1.5">
                                                <span className={cn(
                                                    'px-1.5 py-0.5 rounded font-semibold',
                                                    log.status === 'Success' ? 'bg-emerald-500/15 text-emerald-400' :
                                                        log.status === 'Test' ? 'bg-blue-500/15 text-blue-400' :
                                                            log.status === 'Failed' ? 'bg-rose-500/15 text-rose-400' :
                                                                'bg-amber-500/15 text-amber-400'
                                                )}>{log.status}</span>
                                            </td>
                                            <td className="px-3 py-1.5 text-zinc-300 truncate max-w-[180px]" title={log.message}>{log.message}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    )
}
