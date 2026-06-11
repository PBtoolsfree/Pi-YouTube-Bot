import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Server, Save, Loader2, Link, Cloud } from 'lucide-react'
import { Card, Button } from '@/components/ui'

const API_URL = import.meta?.env?.VITE_API_URL || '/api'

export default function LocalPiWebhook() {
    const [localPiConfig, setLocalPiConfig] = useState({ enabled: false, webhook_url: '' })
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        axios.get(`${API_URL}/config`).then(res => {
            if (res.data?.local_pi) setLocalPiConfig(res.data.local_pi)
        })
    }, [])

    const saveConfig = async () => {
        setSaving(true)
        try {
            const res = await axios.get(`${API_URL}/config`)
            const fullConfig = res.data
            fullConfig.local_pi = localPiConfig
            await axios.post(`${API_URL}/config`, { config: fullConfig })
            alert("Configuration Saved!")
        } catch (e) {
            console.error("Failed to save", e)
            alert("Failed to save: " + e.message)
        }
        setSaving(false)
    }

    return (
        <div className="animate-fade-in max-w-3xl mx-auto space-y-6">
            <Card className="p-6 border-zinc-800 bg-zinc-900 shadow-sm space-y-6">
                <div className="space-y-2">
                    <h2 className="text-xl font-bold flex items-center gap-3">
                        <Server className="text-emerald-400 h-6 w-6" />
                        Local Pi Forwarder
                    </h2>
                    <p className="text-sm text-zinc-400">
                        Automatically forward all incoming donations from this Cloud Dashboard directly to your local Raspberry Pi overlay.
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
                            onChange={(e) => setLocalPiConfig({ ...localPiConfig, enabled: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Local Pi Webhook URL</label>
                    <input
                        type="text"
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                        value={localPiConfig.webhook_url}
                        onChange={(e) => setLocalPiConfig({ ...localPiConfig, webhook_url: e.target.value })}
                        placeholder="https://your-tunnel.trycloudflare.com/api/webhook/cloud"
                    />
                    <div className="text-[11px] text-zinc-400 space-y-1 mt-2">
                        <p><strong>How to connect:</strong></p>
                        <ol className="list-decimal pl-4 space-y-1">
                            <li>Open your <strong>Local Raspberry Pi</strong> dashboard.</li>
                            <li>Go to the <strong>Cloudflare</strong> tab and Start the tunnel.</li>
                            <li>Copy the generated Public URL (e.g., <code className="text-emerald-400">https://xyz.trycloudflare.com</code>).</li>
                            <li>Paste it here and add <code className="text-indigo-300">/api/webhook/cloud</code> to the end.</li>
                        </ol>
                    </div>
                </div>

                <Button
                    variant="primary"
                    onClick={saveConfig}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 mt-4 bg-zinc-100 text-zinc-900 hover:bg-white border-none font-bold text-xs h-10"
                >
                    {saving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}
                    Save Configuration
                </Button>
            </Card>
        </div>
    )
}
