import React, { useMemo } from 'react'
import axios from 'axios'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
    Terminal, Shield, MessageSquare, Zap, Activity, AlertCircle, BarChart3,
    Heart, Award, Server, Thermometer, Volume2, RefreshCw, Brain, Wifi,
    Youtube, Mail, Globe, Bot, Power, Link2, CheckCircle2, XCircle, Loader2,
    Radio, Cpu, HardDrive
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function safeFixed(value, digits = 1, fallback = "0") {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : fallback;
}

export default function Dashboard({ logs }) {
    const displayedLogs = logs.slice(0, 5)
    const modActions = logs.filter(l => l.category === 'MOD').length
    const chatCount = logs.filter(l => l.category === 'CHAT').length

    // Process logs for chart
    const chartData = useMemo(() => {
        const now = Math.floor(Date.now() / 1000)
        const groups = {}
        for (let i = 0; i < 10; i++) {
            groups[now - i * 60] = {
                time: new Date((now - i * 60) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                chat: 0,
                alert: 0
            }
        }
        logs.forEach(log => {
            const keys = Object.keys(groups).map(Number).sort((a, b) => b - a)
            const closest = keys.find(k => Math.abs(k - log.timestamp) < 60)
            if (closest && groups[closest]) {
                if (log.category === 'CHAT') groups[closest].chat++
                if (['alert', 'RANK_UP', 'LOYALTY', 'DONATION', 'MOD', 'AGENT_ACTION', 'SYSTEM_STATUS'].includes(log.category)) groups[closest].alert++
            }
        })
        return Object.values(groups).reverse()
    }, [logs])

    const [uptime, setUptime] = React.useState(0)

    React.useEffect(() => {
        const fetchUptime = async () => {
            try {
                const res = await axios.get('/api/status')
                if (res.data.system?.uptime_seconds !== undefined) {
                    setUptime(res.data.system.uptime_seconds)
                }
            } catch (e) { }
        }
        fetchUptime()
        const interval = setInterval(() => {
            setUptime(prev => prev + 1)
        }, 1000)
        return () => clearInterval(interval)
    }, [])

    const formatUptime = (seconds) => {
        const h = Math.floor(seconds / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        const s = Math.floor(seconds % 60)
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }

    return (
        <div className="flex flex-col gap-5 min-h-0 bg-zinc-950 text-zinc-100">
            {/* Top Stats Row */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <StatCard
                    title="System Uptime"
                    value={formatUptime(uptime)}
                    icon={<Activity className="h-4 w-4 text-zinc-400" />}
                />
                <StatCard
                    title="Live Chat Messages"
                    value={chatCount.toLocaleString()}
                    icon={<MessageSquare className="h-4 w-4 text-blue-500" />}
                />
                <StatCard
                    title="Mod Actions"
                    value={modActions}
                    icon={<Shield className="h-4 w-4 text-rose-500" />}
                />
                <QuickControls />
            </div>

            {/* Middle Row: Chart + Features Running */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[260px]">
                {/* Chart */}
                <Card className="lg:col-span-7 flex flex-col bg-zinc-900 border border-zinc-800 shadow-sm">
                    <CardHeader className="py-3 px-5 border-b border-zinc-800 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-zinc-400" /> Event Velocity
                        </CardTitle>
                        <div className="flex gap-3">
                            <LegendItem color="bg-blue-500" label="Chat" />
                            <LegendItem color="bg-rose-500" label="Events" />
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-3 min-h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorChat" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorAlert" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="time" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} dy={8} />
                                <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} dx={-8} />
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '6px' }}
                                    itemStyle={{ color: '#e4e4e7', fontSize: '11px' }}
                                    labelStyle={{ color: '#a1a1aa', fontSize: '10px', marginBottom: '2px' }}
                                    cursor={{ stroke: '#3f3f46', strokeWidth: 1 }}
                                />
                                <Area type="monotone" dataKey="chat" stroke="#3b82f6" fillOpacity={1} fill="url(#colorChat)" strokeWidth={2} />
                                <Area type="monotone" dataKey="alert" stroke="#ef4444" fillOpacity={1} fill="url(#colorAlert)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Features Running Panel */}
                <div className="lg:col-span-5">
                    <FeaturesPanel />
                </div>
            </div>

            {/* Bottom: System Stats + Logs in 2 columns */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
                {/* System Hardware Stats */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                    <SystemStats />
                    <div className="grid grid-cols-2 gap-4 flex-1">
                        <AudioStats />
                        <LoyaltyStats />
                    </div>
                </div>

                {/* System Manifest (Logs) */}
                <Card className="lg:col-span-8 flex flex-col overflow-hidden bg-zinc-900 border border-zinc-800 shadow-sm min-h-0">
                    <CardHeader className="py-2.5 px-5 border-b border-zinc-800 bg-zinc-900/50 flex flex-row items-center justify-between shrink-0">
                        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                            <Terminal className="h-4 w-4 text-zinc-400" /> System Manifest
                        </CardTitle>
                        <div className="flex gap-3">
                            <LegendItem color="bg-blue-500" label="Chat" />
                            <LegendItem color="bg-rose-500" label="Mod" />
                            <LegendItem color="bg-purple-500" label="AI" />
                        </div>
                    </CardHeader>
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-zinc-900/50 sticky top-0 z-10 backdrop-blur-sm">
                                <tr>
                                    <th className="py-2 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider w-[100px]">Time</th>
                                    <th className="py-2 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider w-[120px]">Type</th>
                                    <th className="py-2 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Detail</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                                {logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="p-8 text-center text-zinc-600 text-sm">
                                            Waiting for system events...
                                        </td>
                                    </tr>
                                ) : (
                                    displayedLogs.map((log, i) => (
                                        <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                                            <td className="py-2 px-4 text-xs text-zinc-500 font-mono tabular-nums">
                                                {(() => {
                                                    if (!log.timestamp) return '-'
                                                    const ts = typeof log.timestamp === 'number'
                                                        ? log.timestamp > 1e12 ? log.timestamp : log.timestamp * 1000
                                                        : typeof log.timestamp === 'string' ? Date.parse(log.timestamp) : NaN
                                                    const d = new Date(ts)
                                                    return isNaN(d.getTime()) ? '-' : d.toLocaleTimeString([], { hour12: false })
                                                })()}
                                            </td>
                                            <td className="py-2 px-3">
                                                <Badge type={log.category || '-'} />
                                            </td>
                                            <td className="py-2 px-3 text-sm text-zinc-300">
                                                {log.author && (
                                                    <span className="font-medium text-zinc-200 mr-2">@{log.author}</span>
                                                )}
                                                <span className={log.category === 'MOD' ? 'text-rose-300' : ''}>
                                                    {typeof log.message === 'object' ? JSON.stringify(log.message) : log.message}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    )
}

// ────────────────────────────────────────────────────────────────────────────────
// FEATURES RUNNING PANEL
// ────────────────────────────────────────────────────────────────────────────────
function FeaturesPanel() {
    const [status, setStatus] = React.useState(null)
    const [aiEnabled, setAiEnabled] = React.useState(true)
    const [ttsEnabled, setTtsEnabled] = React.useState(true)
    const [loading, setLoading] = React.useState({})

    const fetchStatus = React.useCallback(async () => {
        try {
            const res = await axios.get('/api/status')
            setStatus(res.data)
        } catch (e) { }
    }, [])

    React.useEffect(() => {
        const loadConfig = async () => {
            try {
                const res = await axios.get('/api/config')
                setAiEnabled(res.data?.ai_topology?.enabled !== false)
                setTtsEnabled(res.data?.audio?.enabled !== false)
            } catch (e) { }
        }
        loadConfig()
        fetchStatus()
        const interval = setInterval(fetchStatus, 3000)
        return () => clearInterval(interval)
    }, [fetchStatus])

    const setLoadingKey = (key, val) => setLoading(prev => ({ ...prev, [key]: val }))

    const toggle = async (key, action) => {
        setLoadingKey(key, true)
        try {
            const res = await axios.post(`/api/bot/${action}`)
            if (action === 'toggle-ai') setAiEnabled(res.data.ai_enabled)
            if (action === 'toggle-tts') setTtsEnabled(res.data.tts_enabled)
            await fetchStatus()
        } catch (e) { console.error(e) }
        setLoadingKey(key, false)
    }

    const core = status?.bot_core || {}
    const workers = status?.workers || {}
    const emailOk = workers.email_alerts?.status === 'connected'

    const features = [
        {
            key: 'ai',
            label: 'AI Engine',
            desc: 'Brain / LLM responses',
            icon: <Brain className="h-4 w-4" />,
            color: 'purple',
            active: workers.ai_engine?.status === 'running',
            statusLabel: workers.ai_engine?.status,
            toggleAction: 'toggle-ai',
            canToggle: true,
        },
        {
            key: 'tts',
            label: 'TTS Audio',
            desc: 'Text-to-speech engine',
            icon: <Volume2 className="h-4 w-4" />,
            color: 'amber',
            active: workers.tts_audio?.status === 'running',
            statusLabel: workers.tts_audio?.status,
            toggleAction: 'toggle-tts',
            canToggle: true,
        },
        {
            key: 'youtube',
            label: 'YouTube Monitor',
            desc: 'Live chat listener',
            icon: <Youtube className="h-4 w-4" />,
            color: 'red',
            active: workers.youtube_monitor?.status === 'running',
            statusLabel: workers.youtube_monitor?.status,
            canToggle: false,
        },
        {
            key: 'streamer_bot',
            label: 'Streamer.bot',
            desc: 'Action integrations',
            icon: <Link2 className="h-4 w-4" />,
            color: 'cyan',
            active: workers.streamerbot?.status === 'connected',
            statusLabel: workers.streamerbot?.status,
            canToggle: false,
        },
        {
            key: 'bot',
            label: 'Bot Core',
            desc: 'Main service process',
            icon: <Power className="h-4 w-4" />,
            color: 'green',
            active: core.status === 'running',
            statusLabel: core.status,
            canToggle: false,
        },
        {
            key: 'cloud_client',
            label: 'Cloud Connection',
            desc: 'Real-time WebSocket alerts',
            icon: <Globe className="h-4 w-4" />,
            color: 'cyan',
            active: workers.cloud_client?.status === 'connected',
            statusLabel: workers.cloud_client?.status,
            canToggle: false,
        },
    ]

    const activeCount = features.filter(f => f.active).length

    const colorMap = {
        purple: { dot: 'bg-purple-500', ring: 'ring-purple-500/30', text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', btn: 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300' },
        amber: { dot: 'bg-amber-500', ring: 'ring-amber-500/30', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', btn: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300' },
        red: { dot: 'bg-red-500', ring: 'ring-red-500/30', text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', btn: 'bg-red-500/20 hover:bg-red-500/30 text-red-300' },
        blue: { dot: 'bg-blue-500', ring: 'ring-blue-500/30', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', btn: 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300' },
        cyan: { dot: 'bg-cyan-500', ring: 'ring-cyan-500/30', text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', btn: 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300' },
        green: { dot: 'bg-emerald-500', ring: 'ring-emerald-500/30', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', btn: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300' },
    }

    if (!status) return (
        <Card className="h-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-zinc-600 animate-spin" />
        </Card>
    )

    return (
        <Card className="h-full bg-zinc-900 border border-zinc-800 shadow-sm flex flex-col overflow-hidden">
            <CardHeader className="py-3 px-5 border-b border-zinc-800 flex flex-row items-center justify-between shrink-0">
                <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <Radio className="h-4 w-4 text-zinc-400" /> Features Running
                </CardTitle>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-zinc-400">
                        <span className="text-emerald-400 font-bold">{activeCount}</span>
                        <span className="text-zinc-600">/{features.length}</span>
                    </span>
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
            </CardHeader>

            <div className="flex-1 overflow-y-auto p-3 min-h-0">
                <div className="grid grid-cols-2 gap-2">
                    {features.map(feat => {
                        const c = colorMap[feat.color]
                        const isOn = !!feat.active
                        const isLoading = !!loading[feat.key]
                        return (
                            <div
                                key={feat.key}
                                className={`relative rounded-lg border p-3 flex flex-col gap-1.5 transition-all duration-300 ${isOn
                                    ? `${c.bg} ${c.border}`
                                    : 'bg-zinc-800/30 border-zinc-700/50'
                                    }`}
                            >
                                {/* Status dot */}
                                <div className="absolute top-2.5 right-2.5">
                                    <div className={`relative flex h-2 w-2`}>
                                        {isOn && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.dot} opacity-60`} />}
                                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isOn ? c.dot : 'bg-zinc-600'}`} />
                                    </div>
                                </div>

                                {/* Icon + Label */}
                                <div className={`flex items-center gap-2 ${isOn ? c.text : 'text-zinc-500'}`}>
                                    {feat.icon}
                                    <span className="text-xs font-bold text-zinc-200">{feat.label}</span>
                                </div>

                                <p className="text-[10px] text-zinc-500 leading-tight">{feat.desc}</p>

                                {/* Status + Toggle */}
                                <div className="flex items-center justify-between mt-auto pt-1">
                                    <span className={`text-[10px] font-bold uppercase tracking-wide ${isOn ? 'text-emerald-400' : 'text-zinc-600'}`}>
                                        {feat.statusLabel ? feat.statusLabel.toUpperCase() : 'UNKNOWN'}
                                    </span>
                                    {feat.canToggle && (
                                        <button
                                            onClick={() => toggle(feat.key, feat.toggleAction)}
                                            disabled={isLoading}
                                            className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border transition-all duration-200 ${isOn
                                                ? `${c.btn} border-transparent`
                                                : 'bg-zinc-700/50 hover:bg-zinc-600/50 text-zinc-400 border-zinc-600/50'
                                                } disabled:opacity-40`}
                                        >
                                            {isLoading ? '...' : isOn ? 'STOP' : 'START'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </Card>
    )
}

function StatCard({ title, value, icon }) {
    return (
        <Card className="bg-zinc-900 border border-zinc-800 shadow-sm p-5 flex flex-col justify-between h-full">
            <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-medium text-zinc-400">{title}</span>
                {icon}
            </div>
            <div className="text-2xl font-semibold text-white tracking-tight">{value}</div>
        </Card>
    )
}

function SystemStats() {
    const [stats, setStats] = React.useState(null)

    React.useEffect(() => {
        const fetchS = async () => {
            try {
                const res = await axios.get('/api/status')
                if (res.data && res.data.system) setStats(res.data.system)
            } catch (e) { }
        }
        fetchS()
        const interval = setInterval(fetchS, 2000)
        return () => clearInterval(interval)
    }, [])

    if (!stats) return null

    const getTempColor = (t) => {
        if (t < 50) return 'text-emerald-500'
        if (t < 70) return 'text-amber-500'
        return 'text-rose-500'
    }
    const getBarColor = (usage) => {
        if (usage < 50) return 'bg-cyan-500'
        if (usage < 80) return 'bg-amber-500'
        return 'bg-rose-500'
    }

    return (
        <Card className="bg-zinc-900 border border-zinc-800 shadow-sm p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <Server className="h-4 w-4 text-indigo-500" />
                    <span>System Health</span>
                </div>
                {stats?.temp > 0 && (
                    <div className="flex items-center gap-1 bg-zinc-950/50 px-2 py-0.5 rounded border border-zinc-800">
                        <Thermometer className="h-3 w-3 text-zinc-500" />
                        <span className={`text-xs font-mono font-bold ${getTempColor(stats.temp)}`}>
                            {safeFixed(stats?.temp, 1)}°C
                        </span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: 'CPU', value: stats.cpu, icon: <Cpu className="h-3 w-3 text-zinc-500" /> },
                    { label: 'RAM', value: stats.memory, icon: <Server className="h-3 w-3 text-zinc-500" /> },
                    { label: 'Disk', value: stats.disk || 0, icon: <HardDrive className="h-3 w-3 text-zinc-500" /> },
                ].map(({ label, value, icon }) => (
                    <div key={label} className="space-y-1.5">
                        <div className="flex justify-between items-end">
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                                {icon}{label}
                            </span>
                            <span className="text-sm font-mono font-bold text-white">{safeFixed(value, 0)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50">
                            <div
                                className={`h-full ${getBarColor(value || 0)} transition-all duration-500`}
                                style={{ width: `${Math.min(value || 0, 100)}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    )
}

function AudioStats() {
    const [stats, setStats] = React.useState(null)

    React.useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await axios.get('/api/audio/status')
                if (res.data && res.data.queues) setStats(res.data)
            } catch (e) { }
        }, 2000)
        return () => clearInterval(interval)
    }, [])

    if (!stats) return (
        <Card className="flex-1 bg-zinc-900 border border-zinc-800 shadow-sm p-4 flex items-center justify-center text-zinc-600 text-xs">
            Audio Offline
        </Card>
    )

    return (
        <Card className="flex-1 bg-zinc-900 border border-zinc-800 shadow-sm p-4 flex flex-col gap-2">
            <div className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-amber-500" /> Neural Latency
            </div>
            <div className="flex items-baseline gap-1">
                <div className="text-xl font-bold text-white">
                    {safeFixed(stats?.metrics?.avg_latency, 0)}
                </div>
                <div className="text-xs text-zinc-500">ms</div>
            </div>
            <div className="flex gap-3 text-[10px] text-zinc-500 border-t border-zinc-800 pt-2">
                <div><span className="text-zinc-300 font-bold">{stats.queues?.public?.length || 0}</span> Pub</div>
                <div><span className="text-zinc-300 font-bold">{stats.queues?.secret?.length || 0}</span> Sec</div>
                <div><span className="text-zinc-300 font-bold">{stats.metrics.played_count}</span> Played</div>
            </div>
        </Card>
    )
}

function LoyaltyStats() {
    const [stats, setStats] = React.useState(null)

    React.useEffect(() => {
        const fetchL = async () => {
            try {
                const res = await axios.get('/api/viewers')
                const viewers = Object.values(res.data)
                const totalPoints = viewers.reduce((acc, v) => acc + (v.points || 0), 0)
                const topViewer = viewers.sort((a, b) => (b.points || 0) - (a.points || 0))[0]
                setStats({ totalPoints, topViewer, count: viewers.length })
            } catch (e) { }
        }
        fetchL()
        const interval = setInterval(fetchL, 10000)
        return () => clearInterval(interval)
    }, [])

    if (!stats) return null

    return (
        <Card className="flex-1 bg-zinc-900 border border-zinc-800 shadow-sm p-4 flex flex-col gap-2">
            <div className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <Heart className="h-3 w-3 text-pink-500" /> Loyalty
            </div>
            <div className="flex items-baseline gap-1">
                <div className="text-xl font-bold text-white">
                    {safeFixed(stats?.totalPoints / 1000, 1)}k
                </div>
                <div className="text-xs text-zinc-500">Points</div>
            </div>
            {stats.topViewer && (
                <div className="flex items-center gap-1.5 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-800/50">
                    <Award className="h-3 w-3 text-amber-500 shrink-0" />
                    <span className="text-[10px] text-zinc-300 truncate font-medium">{stats.topViewer.name}</span>
                </div>
            )}
        </Card>
    )
}

function LegendItem({ color, label }) {
    return (
        <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-xs text-zinc-400">{label}</span>
        </div>
    )
}

function QuickControls() {
    const [restarting, setRestarting] = React.useState(false)
    const [aiEnabled, setAiEnabled] = React.useState(true)
    const [ttsEnabled, setTtsEnabled] = React.useState(true)

    React.useEffect(() => {
        const load = async () => {
            try {
                const res = await axios.get('/api/config')
                setAiEnabled(res.data?.ai_topology?.enabled !== false)
                setTtsEnabled(res.data?.audio?.enabled !== false)
            } catch (e) { }
        }
        load()
    }, [])

    const toggleAI = async () => {
        try {
            const res = await axios.post('/api/bot/toggle-ai')
            setAiEnabled(res.data.ai_enabled)
        } catch (e) { }
    }
    const toggleTTS = async () => {
        try {
            const res = await axios.post('/api/bot/toggle-tts')
            setTtsEnabled(res.data.tts_enabled)
        } catch (e) { }
    }
    const restartBot = async () => {
        if (!confirm('Restart bot? All services will briefly disconnect.')) return
        setRestarting(true)
        try { await axios.post('/api/bot/restart') } catch (e) { }
        setTimeout(() => setRestarting(false), 4000)
    }

    return (
        <Card className="bg-zinc-900 border border-zinc-800 shadow-sm flex flex-col p-4 gap-2">
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Controls</span>
                <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-[10px] font-bold text-emerald-500 uppercase">LIVE</span>
                </div>
            </div>
            <button onClick={toggleAI}
                className={`flex items-center justify-between text-xs font-bold px-3 py-2 rounded border transition-all ${aiEnabled
                    ? 'text-purple-300 bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20'
                    : 'text-zinc-500 bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700'}`}>
                <span className="flex items-center gap-1.5"><Brain className="h-3 w-3" />AI Engine</span>
                <span className={`text-[10px] font-bold ${aiEnabled ? 'text-emerald-400' : 'text-zinc-600'}`}>{aiEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <button onClick={toggleTTS}
                className={`flex items-center justify-between text-xs font-bold px-3 py-2 rounded border transition-all ${ttsEnabled
                    ? 'text-amber-300 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20'
                    : 'text-zinc-500 bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700'}`}>
                <span className="flex items-center gap-1.5"><Volume2 className="h-3 w-3" />TTS Audio</span>
                <span className={`text-[10px] font-bold ${ttsEnabled ? 'text-emerald-400' : 'text-zinc-600'}`}>{ttsEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <button onClick={restartBot} disabled={restarting}
                className="flex items-center justify-center gap-1.5 text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded border border-zinc-700 transition-colors disabled:opacity-50">
                <RefreshCw className={`h-3 w-3 ${restarting ? 'animate-spin' : ''}`} />
                {restarting ? 'Restarting...' : 'Restart Bot'}
            </button>
        </Card>
    )
}

function Badge({ type }) {
    const styles = {
        CHAT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        AI_RESPONSE: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        MOD: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        ERROR: 'bg-red-500/10 text-red-400 border-red-500/20',
        ALERT: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        DONATION: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        LOYALTY: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
        default: 'bg-zinc-800 text-zinc-400 border-zinc-700'
    }
    const style = styles[type] || styles['default']
    return (
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${style}`}>
            {type === 'MOD' && <Shield className="h-3 w-3" />}
            {type === 'AI_RESPONSE' && <Zap className="h-3 w-3" />}
            {type === 'ERROR' && <AlertCircle className="h-3 w-3" />}
            {type === 'DONATION' && <Heart className="h-3 w-3" />}
            {type}
        </div>
    )
}
