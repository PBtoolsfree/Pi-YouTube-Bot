
import { useState, useEffect } from 'react'
import QRCode from 'react-qr-code'
import axios from 'axios'
import { Card, Button } from '@/components/ui'
import { Cloud, Save, Power, Activity, Link, ShieldCheck, Loader2, Play, Square, Copy } from 'lucide-react'

const cn = (...classes) => classes.filter(Boolean).join(' ')

export default function CloudflareSettings() {
    const [config, setConfig] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [token, setToken] = useState('')

    // Tunnel Status
    const [tunnelStatus, setTunnelStatus] = useState({ is_running: false, url: null })
    const [statusLoading, setStatusLoading] = useState(false)

    useEffect(() => {
        fetchConfig()
        const interval = setInterval(fetchTunnelStatus, 5000)
        fetchTunnelStatus()
        return () => clearInterval(interval)
    }, [])

    const fetchConfig = async () => {
        try {
            const res = await axios.get('/api/config')
            setConfig(res.data)
            // Backend reads root level 'cloudflared_token'
            setToken(res.data.cloudflared_token || '')
        } catch (e) {
            console.error("Config Load Error", e)
        } finally {
            setLoading(false)
        }
    }

    const fetchTunnelStatus = async () => {
        try {
            const res = await axios.get('/api/tunnel')
            setTunnelStatus(res.data)
        } catch (e) {
            // ignore
        }
    }



    const handleSave = async () => {
        setSaving(true)
        try {
            // Save to root level as per backend logic
            const newConfig = {
                ...config,
                cloudflared_token: token
            }
            await axios.post('/api/config', { config: newConfig })
            await fetchConfig()

            // AUTO-RESTART LOGIC (Automation Request)
            // 1. Stop existing tunnel (clears state)
            await axios.post('/api/tunnel/stop')

            // 2. Wait a moment for process cleanup
            await new Promise(r => setTimeout(r, 1000))

            // 3. Start it again (will pick up new token)
            // Even if token is empty, it restarts in Quick Mode
            await axios.post('/api/tunnel/start')

            // 4. Force status update
            fetchTunnelStatus()

            alert("Token Saved & Tunnel Restarted!")
        } catch (e) {
            alert("Save Failed: " + e.message)
        }
        setSaving(false)
    }

    const toggleTunnel = async () => {
        setStatusLoading(true)
        try {
            if (tunnelStatus.is_running) {
                await axios.post('/api/tunnel/stop')
            } else {
                await axios.post('/api/tunnel/start')
            }
            // Wait a sec for process to spawn/die
            setTimeout(fetchTunnelStatus, 2000)
        } catch (e) {
            alert("Action Failed: " + e.message)
        }
        setStatusLoading(false)
    }

    if (loading) return <div className="p-10 text-zinc-500 text-sm italic">Loading configuration...</div>

    return (
        <div className="space-y-6 pb-10">

            {/* Header */}
            <div className="flex justify-between items-center px-1">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-zinc-100 bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent w-fit">Cloudflare Tunnel</h1>
                    <p className="text-sm text-zinc-400">Expose your dashboard securely to the internet.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Status Card */}
                <Card className={cn(
                    "p-6 border-zinc-800 shadow-sm transition-colors",
                    tunnelStatus.is_running ? "bg-zinc-900 border-zinc-800" : "bg-zinc-900"
                )}>
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-2">
                            <Activity className={cn("h-4 w-4", tunnelStatus.is_running ? "text-emerald-500" : "text-zinc-500")} />
                            <h2 className="text-base font-semibold text-zinc-100">Service Status</h2>
                        </div>
                        <div className={cn(
                            "px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border",
                            tunnelStatus.is_running ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-zinc-800 text-zinc-500 border-zinc-700"
                        )}>
                            {tunnelStatus.is_running ? "Running" : "Stopped"}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-1.5">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Public URL</label>
                            {tunnelStatus.url ? (
                                <div className="flex items-center gap-2 text-emerald-400 font-mono text-sm break-all">
                                    <Link className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                    <a href={tunnelStatus.url} target="_blank" rel="noreferrer" className="hover:underline hover:text-emerald-300 transition-colors">{tunnelStatus.url}</a>
                                </div>
                            ) : (
                                <div className="text-zinc-600 font-mono text-xs flex items-center gap-2 italic">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    {tunnelStatus.is_running ? "Initializing URL..." : "Service Offline"}
                                </div>
                            )}
                        </div>

                        <Button
                            onClick={toggleTunnel}
                            disabled={statusLoading}
                            className={cn(
                                "w-full h-10 font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm",
                                tunnelStatus.is_running
                                    ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                            )}
                        >
                            {statusLoading ? (
                                <Loader2 className="animate-spin h-4 w-4" />
                            ) : tunnelStatus.is_running ? (
                                <><Square className="h-4 w-4 fill-current" /> Stop Tunnel</>
                            ) : (
                                <><Play className="h-4 w-4 fill-current" /> Start Tunnel</>
                            )}
                        </Button>
                        <p className="text-[10px] text-center text-zinc-500">
                            {tunnelStatus.is_running
                                ? "Service is actively serving traffic."
                                : "Start to generate a new secure public link."}
                        </p>

                        {tunnelStatus.is_running && tunnelStatus.url && (
                            <div className="pt-4 border-t border-zinc-800 animate-fade-in space-y-4">
                                <div className="bg-white p-3 rounded-lg mx-auto w-fit shadow-sm">
                                    <QRCode value={tunnelStatus.url + "/tip"} size={140} />
                                </div>
                                <div className="text-center space-y-1">
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Scan to Pay</p>
                                    <p className="text-xs text-zinc-500">Directs to /tip page</p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        navigator.clipboard.writeText(tunnelStatus.url + "/tip")
                                        alert("Link Copied!")
                                    }}
                                    className="w-full text-xs h-8 border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-300"
                                >
                                    <Copy className="h-3 w-3 mr-2" />
                                    Copy Link
                                </Button>
                            </div>
                        )}
                    </div>
                </Card>


                {/* Configuration Card */}
                <Card className="p-6 space-y-4 border-zinc-800 bg-zinc-900 shadow-sm h-fit">
                    <div className="flex items-center gap-2 mb-2">
                        <Cloud className="text-orange-500 h-4 w-4" />
                        <h2 className="text-base font-semibold text-zinc-100">Tunnel Configuration</h2>
                    </div>

                    <div className="bg-blue-500/5 border border-blue-500/10 p-3 rounded-lg text-xs leading-relaxed text-blue-200/70">
                        <strong className="text-blue-400">Quick Mode:</strong> Leave token empty to get a random ephemeral URL each time you start. <br className="my-1 block" />
                        <strong className="text-blue-400">Persistent Mode:</strong> Enter your Cloudflare Tunnel Token to use a permanent domain.
                    </div>

                    <div className="space-y-2 pt-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Cloudflared Token</label>
                        <textarea
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono text-xs h-24 resize-none"
                            placeholder="eyJhIjoi..."
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                        />
                        <p className="text-[10px] text-zinc-500">
                            Get this from the Cloudflare Zero Trust Dashboard &rarr; Access &rarr; Tunnels.
                        </p>
                    </div>

                    <Button
                        variant="primary"
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-2 mt-4 bg-zinc-100 text-zinc-900 hover:bg-white border-none font-bold text-xs h-9"
                    >
                        {saving ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                        Save Configuration
                    </Button>
                </Card>

            </div>
        </div>
    )
}
