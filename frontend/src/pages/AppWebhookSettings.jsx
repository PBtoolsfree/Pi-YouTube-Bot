import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Smartphone, CheckCircle, Loader2, AlertCircle, Beaker } from 'lucide-react'
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

    useEffect(() => {
        // Fetch config
        axios.get(`${API_URL}/config`).then(res => {
            if (res.data?.app_alerts) setAppAlertsConfig(res.data.app_alerts)
            if (res.data?.local_pi) setLocalPiConfig(res.data.local_pi)
        })
        fetchWebhookLogs()
        const logsInterval = setInterval(fetchWebhookLogs, 5000)
        
        // Auto-detect IP
        const hostname = window.location.hostname
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            setLocalIp(hostname)
        }

        return () => clearInterval(logsInterval)
    }, [])

    const fetchWebhookLogs = async () => {
        try {
            const res = await axios.get(`${API_URL}/webhook/logs`)
            setWebhookLogs(res.data.logs || [])
        } catch (e) { }
    }

    const testWebhook = async () => {
        setTestingWebhook(true)
        setWebhookTestResult(null)
        try {
            const res = await axios.post(`${API_URL}/webhook/test`)
            setWebhookTestResult({ type: 'success', message: res.data.message || 'Test alert fired!' })
            await fetchWebhookLogs()
        } catch (e) {
            setWebhookTestResult({ type: 'error', message: e.response?.data?.detail || e.message })
        }
        setTestingWebhook(false)
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
        <div className="animate-fade-in max-w-4xl mx-auto space-y-6">
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
                        <div className="text-xs text-zinc-500">Listen for incoming requests from MacroDroid/Tasker</div>
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
                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Audio (Read Amount & Name)</label>
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
                    <div className="space-y-2">
                        <h2 className="text-xl font-bold flex items-center gap-3">
                            <Smartphone className="text-indigo-400 h-6 w-6" />
                            Cloud Forwarder (Send to Local Pi)
                        </h2>
                        <p className="text-sm text-zinc-400">
                            Configure your Cloud dashboard to automatically forward all incoming donations directly to your local Raspberry Pi.
                        </p>
                    </div>

                    <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                        <div>
                            <div className="font-medium text-zinc-200 mb-1 text-sm">Forward to Local Pi</div>
                            <div className="text-xs text-zinc-500">Sends alerts over internet to your local PC overlay</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={localPiConfig.enabled}
                                onChange={(e) => saveConfig(null, { ...localPiConfig, enabled: e.target.checked })}
                            />
                            <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Local Pi Webhook URL</label>
                        <input
                            type="text"
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            value={localPiConfig.webhook_url}
                            onChange={(e) => saveConfig(null, { ...localPiConfig, webhook_url: e.target.value })}
                            placeholder="https://my-local-pi-tunnel.trycloudflare.com/api/webhook/cloud"
                        />
                        <p className="text-[10px] text-zinc-500">
                            Paste the Cloudflare tunnel URL from your Local Pi dashboard. Make sure it ends in <strong>/api/webhook/cloud</strong>
                        </p>
                    </div>
                </div>

                <div className="pt-4 border-t border-zinc-800 space-y-4">
                    <h3 className="text-sm font-semibold text-zinc-200">📱 How to send Mobile Notifications to Pi Bot</h3>
                    <p className="text-xs text-zinc-400">The easiest way to capture notifications is using the custom <strong>Pi Bot Forwarder</strong> app on your Android phone.</p>

                    <div className="bg-zinc-950 p-4 rounded-lg font-mono text-xs border border-zinc-800 space-y-3">
                        <ol className="list-decimal pl-4 space-y-2 text-zinc-300">
                            <li>Download the <a href="/PiForwarder.apk" download="PiForwarder.apk" className="text-indigo-400 hover:underline font-semibold">Pi Bot Forwarder</a> APK directly to your phone and install it.</li>
                            <li>Open the app and click the large button to grant it <strong>Notification Access</strong> permission.</li>
                            <li>Set the <strong>App Filter</strong> by choosing any or all: <span className="text-emerald-400 font-semibold">paytm, phonepe, gpay</span>.</li>
                            <li>Set the <strong>Webhook URL</strong> to the following: <br /> <span className="text-indigo-300 mt-1 block break-all font-semibold select-all">http://{localIp}:8000/api/webhook/app</span></li>
                            <li>Save the configuration toggles. Every notification from these apps will now be sent directly to your overlay without showing brands!</li>
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
