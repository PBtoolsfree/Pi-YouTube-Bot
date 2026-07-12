import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Card, CardContent, CardHeader, CardTitle, Input, Button, Switch } from '@/components/ui'
import { PageStatusBar } from '@/components/ServiceStatus'
import {
    Bot, MessageSquare, Zap, Power, Volume2, Brain, RefreshCw,
    Send, Download, Wifi, WifiOff, Monitor, Server,
    CheckCircle2, AlertTriangle, Clock, Users, Award,
    PhoneCall, Cpu, Activity, Shield, BarChart3, Trash2,
    ChevronRight, Terminal, Mic, MicOff, Play, Square,
    Database, Search, User, ArrowLeft
} from 'lucide-react'

const API_URL = import.meta?.env?.VITE_API_URL || '/api'

function safeFixed(value, digits = 1, fallback = "0") {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : fallback;
}

// ─────────────────────────────────────────────
// MAIN AGENT PAGE
// ─────────────────────────────────────────────
export default function AgentPage() {
    const [activeSection, setActiveSection] = useState('overview')

    const sections = [
        { id: 'overview', label: '⚡ Overview', },
        { id: 'chat', label: '💬 Chat Logs', },
        { id: 'memory', label: '🧠 YouTube Memory', },
        { id: 'commands', label: '🤖 Bot Commands', },
    ]

    return (
        <div className="space-y-5 pb-10">
            {/* Status Bar */}
            <PageStatusBar services={['bot', 'ai', 'tts', 'youtube']} />

            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20">
                    <Bot className="h-6 w-6 text-white" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-zinc-100 tracking-tight">Agent Control Center</h2>
                    <p className="text-xs text-zinc-500">A to Z — Sab kuch yahan se control karo</p>
                </div>
                <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-emerald-400 bg-emerald-950 border border-emerald-800 px-3 py-1.5 rounded-full">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    LIVE
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto no-scrollbar">
                {sections.map(s => (
                    <button
                        key={s.id}
                        onClick={() => setActiveSection(s.id)}
                        className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all
                            ${activeSection === s.id
                                ? 'border-violet-500 text-violet-300'
                                : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            {activeSection === 'overview' && <OverviewSection />}
            {activeSection === 'chat' && <ChatLogsSection />}
            {activeSection === 'memory' && <YouTubeMemorySection />}
            {activeSection === 'commands' && <BotCommandsSection />}
        </div>
    )
}

// ─────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────
function OverviewSection() {
    const [status, setStatus] = useState(null)
    const [aiOn, setAiOn] = useState(true)
    const [ttsOn, setTtsOn] = useState(true)
    const [restarting, setRestarting] = useState(false)
    const [chatStats, setChatStats] = useState(null)

    const fetchAll = async () => {
        try {
            const [st, cfg, cs] = await Promise.all([
                axios.get(`${API_URL}/status`),
                axios.get(`${API_URL}/config`),
                axios.get(`${API_URL}/chat/logs/stats`).catch(() => ({ data: null }))
            ])
            setStatus(st.data)
            setAiOn(cfg.data?.ai_topology?.enabled !== false)
            setTtsOn(cfg.data?.audio?.enabled !== false)
            setChatStats(cs.data)
        } catch (e) { }
    }

    useEffect(() => { fetchAll(); const iv = setInterval(fetchAll, 5000); return () => clearInterval(iv) }, [])

    const fmt = (s) => {
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    }

    const toggleAI = async () => {
        const r = await axios.post(`${API_URL}/bot/toggle-ai`); setAiOn(r.data.ai_enabled)
    }
    const toggleTTS = async () => {
        const r = await axios.post(`${API_URL}/bot/toggle-tts`); setTtsOn(r.data.tts_enabled)
    }
    const restart = async () => {
        if (!confirm('Bot restart karein?')) return
        setRestarting(true)
        await axios.post(`${API_URL}/bot/restart`).catch(() => { })
        setTimeout(() => { setRestarting(false); fetchAll() }, 3000)
    }

    const uptime = status?.bot?.start_time ? Date.now() / 1000 - status.bot.start_time : 0

    return (
        <div className="space-y-5">
            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Uptime" value={fmt(uptime)} icon={<Clock className="h-4 w-4 text-violet-400" />} />
                <KpiCard label="CPU" value={`${safeFixed(status?.system?.cpu, 1)}%`} icon={<Cpu className="h-4 w-4 text-blue-400" />} />
                <KpiCard label="RAM" value={`${safeFixed(status?.system?.memory, 1)}%`} icon={<Server className="h-4 w-4 text-indigo-400" />} />
                <KpiCard label="Today Msgs" value={chatStats?.total_messages ?? '—'} icon={<MessageSquare className="h-4 w-4 text-emerald-400" />} />
            </div>

            <div className="grid md:grid-cols-3 gap-5">
                {/* Quick Switches */}
                <Card className="bg-zinc-900 border-zinc-800 md:col-span-1">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                            <Zap className="h-4 w-4 text-amber-400" /> Quick Controls
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                        <ToggleRow label="AI Engine" sub="Auto-reply to chat" on={aiOn} onToggle={toggleAI} color="violet" />
                        <ToggleRow label="TTS Audio" sub="Text-to-speech" on={ttsOn} onToggle={toggleTTS} color="amber" />
                        <button onClick={restart} disabled={restarting}
                            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-2.5 transition disabled:opacity-50 mt-2">
                            <RefreshCw className={`h-3.5 w-3.5 ${restarting ? 'animate-spin' : ''}`} />
                            {restarting ? 'Restarting...' : 'Restart Bot'}
                        </button>
                    </CardContent>
                </Card>

                {/* Stats */}
                <Card className="bg-zinc-900 border-zinc-800 md:col-span-2">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-blue-400" /> Today's Session
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        {chatStats ? (
                            <div className="grid grid-cols-3 gap-4">
                                <StatBox label="Total Messages" value={chatStats.total_messages} color="text-zinc-100" />
                                <StatBox label="AI Replies" value={chatStats.ai_replies} color="text-violet-300" />
                                <StatBox label="Unique Viewers" value={chatStats.unique_authors} color="text-emerald-300" />
                            </div>
                        ) : (
                            <p className="text-zinc-500 text-sm text-center py-4">Chat logging disabled ya abhi tak koi message nahi aaya.</p>
                        )}
                        <TopViewers />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

function TopViewers() {
    const [viewers, setViewers] = useState([])
    useEffect(() => {
        axios.get(`${API_URL}/loyalty/leaderboard`).then(r => setViewers(r.data?.slice(0, 5) || [])).catch(() => { })
    }, [])
    if (!viewers.length) return null
    return (
        <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                <Award className="h-3 w-3 text-amber-400" /> Top Loyal Viewers
            </p>
            <div className="space-y-1.5">
                {viewers.map((v, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                        <span className="text-sm text-zinc-300 font-medium">
                            <span className="text-zinc-600 mr-2">#{i + 1}</span>{v.name}
                        </span>
                        <span className="text-xs text-amber-400 font-bold font-mono">{(v.points || 0).toLocaleString()} Points</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────
// CHAT LOGS
// ─────────────────────────────────────────────
function ChatLogsSection() {
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(false)
    const [n, setN] = useState(50)
    const endRef = useRef(null)

    const fetch = async () => {
        setLoading(true)
        try {
            const r = await axios.get(`${API_URL}/chat/logs?n=${n}`)
            setLogs(Array.isArray(r.data) ? r.data.reverse() : [])
        } catch (e) {
            setLogs([])
        } finally { setLoading(false) }
    }

    useEffect(() => { fetch() }, [n])
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

    const exportCSV = async () => {
        try {
            const r = await axios.get(`${API_URL}/chat/logs/export`, { responseType: 'blob' })
            const url = URL.createObjectURL(r.data)
            const a = document.createElement('a'); a.href = url; a.download = 'chat_log.csv'; a.click()
            URL.revokeObjectURL(url)
        } catch (e) { alert('Export failed: ' + e.message) }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <select value={n} onChange={e => setN(Number(e.target.value))}
                    className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-2">
                    {[25, 50, 100, 200].map(v => <option key={v} value={v}>{v} messages</option>)}
                </select>
                <button onClick={fetch} className="flex items-center gap-2 text-xs font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-2 transition">
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </button>
                <button onClick={exportCSV} className="ml-auto flex items-center gap-2 text-xs font-bold text-emerald-300 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 rounded-lg px-3 py-2 transition">
                    <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
            </div>

            <Card className="bg-zinc-900 border-zinc-800">
                <div className="divide-y divide-zinc-800 max-h-[600px] overflow-y-auto">
                    {logs.length === 0 && (
                        <p className="text-zinc-500 text-sm text-center py-10">
                            {loading ? 'Loading...' : 'Koi log nahi mila. Chat logging enabled hai?'}
                        </p>
                    )}
                    {logs.map((entry, i) => (
                        <div key={i} className="p-4 hover:bg-zinc-800/40 transition group">
                            <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold text-sm text-zinc-200">{entry.author}</span>
                                        {entry.rank && entry.rank !== 'Viewer' && (
                                            <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded font-bold">{entry.rank}</span>
                                        )}
                                        {entry.points > 0 && (
                                            <span className="text-[10px] text-zinc-500 font-mono">{entry.points} Points</span>
                                        )}
                                        <span className="ml-auto text-[10px] text-zinc-600 font-mono">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-sm text-zinc-300">{entry.message}</p>
                                    {entry.ai_reply && (
                                        <div className="mt-2 pl-3 border-l-2 border-violet-500/40">
                                            <p className="text-xs text-violet-300"><span className="font-bold text-violet-400">🤖 AI:</span> {entry.ai_reply}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={endRef} />
                </div>
            </Card>
        </div>
    )
}

// ─────────────────────────────────────────────
// YOUTUBE MEMORY
// ─────────────────────────────────────────────
function YouTubeMemorySection() {
    const [stats, setStats] = useState(null)
    const [users, setUsers] = useState([])
    const [filteredUsers, setFilteredUsers] = useState([])
    const [search, setSearch] = useState('')
    const [selectedUser, setSelectedUser] = useState(null)
    const [messages, setMessages] = useState([])
    const [loading, setLoading] = useState(false)
    const [cleaning, setCleaning] = useState(false)

    const fetchStats = async () => {
        try {
            const r = await axios.get(`${API_URL}/youtube-memory/stats`)
            setStats(r.data)
        } catch (e) { }
    }

    const fetchUsers = async () => {
        try {
            const r = await axios.get(`${API_URL}/youtube-memory/users`)
            const u = r.data?.users || []
            setUsers(u)
            setFilteredUsers(u)
        } catch (e) { }
    }

    const fetchUserMessages = async (user) => {
        setLoading(true)
        setSelectedUser(user)
        try {
            const r = await axios.get(`${API_URL}/youtube-memory/user/${encodeURIComponent(user)}`)
            setMessages(r.data?.messages || [])
        } catch (e) { setMessages([]) }
        finally { setLoading(false) }
    }

    const deleteUser = async (user) => {
        if (!confirm(`"${user}" ki puri history delete karein?`)) return
        try {
            await axios.delete(`${API_URL}/youtube-memory/user/${encodeURIComponent(user)}`)
            setSelectedUser(null)
            setMessages([])
            fetchUsers()
            fetchStats()
        } catch (e) { alert('Delete failed: ' + e.message) }
    }

    const runCleanup = async () => {
        setCleaning(true)
        try {
            const r = await axios.post(`${API_URL}/youtube-memory/cleanup`)
            alert(`Cleanup done: ${r.data.message}`)
            fetchStats()
            fetchUsers()
        } catch (e) { alert('Cleanup failed: ' + e.message) }
        finally { setCleaning(false) }
    }

    useEffect(() => { fetchStats(); fetchUsers() }, [])
    useEffect(() => {
        if (!search.trim()) { setFilteredUsers(users); return }
        setFilteredUsers(users.filter(u => u.user.toLowerCase().includes(search.toLowerCase())))
    }, [search, users])

    const fmtTime = (ts) => {
        if (!ts) return '—'
        const d = new Date(ts * 1000)
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    }

    return (
        <div className="space-y-5">
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Total Messages" value={stats?.total_messages ?? '—'} icon={<Database className="h-4 w-4 text-violet-400" />} />
                <KpiCard label="Unique Users" value={stats?.total_users ?? '—'} icon={<Users className="h-4 w-4 text-blue-400" />} />
                <KpiCard label="AI Replies" value={stats?.ai_replies ?? '—'} icon={<Brain className="h-4 w-4 text-emerald-400" />} />
                <KpiCard label="DB Size" value={stats?.db_size_mb ? `${stats.db_size_mb} MB` : '—'} icon={<Server className="h-4 w-4 text-amber-400" />} />
            </div>

            {/* Retention Info + Cleanup */}
            <div className="flex items-center gap-3">
                <div className="flex-1 text-xs text-zinc-500">
                    <span className="text-emerald-400 font-bold">Auto-Purge:</span> Messages older than {stats?.retention_days ?? 7} days are automatically deleted.
                    {stats?.oldest_message_days > 0 && (
                        <span className="ml-2">Oldest: <span className="text-zinc-300 font-mono">{stats.oldest_message_days}d</span> ago</span>
                    )}
                </div>
                <button onClick={runCleanup} disabled={cleaning}
                    className="flex items-center gap-2 text-xs font-bold text-amber-300 bg-amber-950 hover:bg-amber-900 border border-amber-800 rounded-lg px-3 py-2 transition disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${cleaning ? 'animate-spin' : ''}`} />
                    {cleaning ? 'Cleaning...' : 'Manual Cleanup'}
                </button>
                <button onClick={() => { fetchStats(); fetchUsers() }}
                    className="flex items-center gap-2 text-xs font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-2 transition">
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
            </div>

            {/* Main Content: User List + Conversation */}
            <div className="grid md:grid-cols-3 gap-5">
                {/* User List (Left) */}
                <Card className="bg-zinc-900 border-zinc-800 md:col-span-1">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-400" /> Users ({filteredUsers.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3 space-y-2">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search user..."
                                className="w-full bg-zinc-950 border border-zinc-700 text-sm rounded-lg pl-9 pr-3 py-2 text-zinc-100 placeholder-zinc-600" />
                        </div>
                        {/* User Entries */}
                        <div className="max-h-[500px] overflow-y-auto space-y-1">
                            {filteredUsers.length === 0 && (
                                <p className="text-zinc-600 text-xs text-center py-6">Koi user nahi mila.</p>
                            )}
                            {filteredUsers.map((u, i) => (
                                <button key={i} onClick={() => fetchUserMessages(u.user)}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition
                                        ${selectedUser === u.user
                                            ? 'bg-violet-950 border-violet-700 text-violet-200'
                                            : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-800'}`}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium truncate">{u.user}</span>
                                        <span className="text-[10px] text-zinc-500 font-mono">{u.message_count} msgs</span>
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5">
                                        <span className="text-[10px] text-zinc-600 truncate max-w-[70%]">{u.last_message}</span>
                                        {u.ai_replies > 0 && (
                                            <span className="text-[9px] text-violet-400 font-bold">{u.ai_replies} AI</span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Conversation Panel (Right) */}
                <Card className="bg-zinc-900 border-zinc-800 md:col-span-2">
                    <CardHeader className="pb-3 border-b border-zinc-800 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-emerald-400" />
                            {selectedUser ? `${selectedUser}'s History` : 'Select a user'}
                        </CardTitle>
                        {selectedUser && (
                            <button onClick={() => deleteUser(selectedUser)}
                                className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-950/50 hover:bg-red-900/50 border border-red-800/50 rounded-lg px-2.5 py-1.5 transition">
                                <Trash2 className="h-3 w-3" /> Delete History
                            </button>
                        )}
                    </CardHeader>
                    <CardContent className="pt-3">
                        <div className="max-h-[550px] overflow-y-auto space-y-1">
                            {!selectedUser && (
                                <p className="text-zinc-600 text-sm text-center py-16">← Kisi user ko select karein to uska chat history dekhein</p>
                            )}
                            {selectedUser && loading && (
                                <p className="text-zinc-500 text-sm text-center py-16">Loading...</p>
                            )}
                            {selectedUser && !loading && messages.length === 0 && (
                                <p className="text-zinc-600 text-sm text-center py-16">Koi message nahi mila.</p>
                            )}
                            {messages.map((m, i) => (
                                <div key={i} className="p-3 hover:bg-zinc-800/40 transition rounded-lg">
                                    <div className="flex items-center gap-2 mb-1">
                                        <User className="h-3 w-3 text-blue-400" />
                                        <span className="text-xs font-bold text-zinc-300">{m.user}</span>
                                        <span className="ml-auto text-[10px] text-zinc-600 font-mono">{fmtTime(m.timestamp)}</span>
                                    </div>
                                    <p className="text-sm text-zinc-300 ml-5">{m.message}</p>
                                    {m.ai_reply && (
                                        <div className="mt-1.5 ml-5 pl-3 border-l-2 border-violet-500/40">
                                            <p className="text-xs text-violet-300"><span className="font-bold text-violet-400">🤖 AI:</span> {m.ai_reply}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}


// ─────────────────────────────────────────────

// PC CONTROL
// ─────────────────────────────────────────────


// ─────────────────────────────────────────────
// BOT COMMANDS CONSOLE
// ─────────────────────────────────────────────
function BotCommandsSection() {
    const [chatInput, setChatInput] = useState('')
    const [sending, setSending] = useState(false)
    const [ttsInput, setTtsInput] = useState('')
    const [speaking, setSpeaking] = useState(false)

    const [output, setOutput] = useState([])

    const addLog = (label, text, ok = true) => {
        setOutput(p => [{ label, text, ok, time: new Date().toLocaleTimeString() }, ...p].slice(0, 30))
    }

    const sendChat = async () => {
        if (!chatInput.trim()) return
        setSending(true)
        try {
            const r = await axios.post(`${API_URL}/chat`, { prompt: chatInput })
            addLog('Chat→AI', r.data?.response || 'Queued', true)
            setChatInput('')
        } catch (e) {
            addLog('Chat→AI', e.response?.data?.detail || e.message, false)
        } finally { setSending(false) }
    }

    const speakTTS = async () => {
        if (!ttsInput.trim()) return
        setSpeaking(true)
        try {
            await axios.post(`${API_URL}/audio/speak`, { text: ttsInput, channel: 'public' })
            addLog('TTS Speak', ttsInput, true)
            setTtsInput('')
        } catch (e) {
            addLog('TTS Speak', e.message, false)
        } finally { setSpeaking(false) }
    }



    const quickActions = [
        { label: 'AI ON', action: () => axios.post(`${API_URL}/bot/toggle-ai`).then(() => addLog('Toggle', 'AI toggled ✅')) },
        { label: 'TTS ON', action: () => axios.post(`${API_URL}/bot/toggle-tts`).then(() => addLog('Toggle', 'TTS toggled ✅')) },
        { label: 'Skip TTS', action: () => axios.post(`${API_URL}/audio/skip`).then(() => addLog('Audio', 'Skipped ✅')) },
        { label: 'Test Alert', action: () => axios.post(`${API_URL}/test/alert`, { type: 'NewSubscriber', author: 'TestUser' }).then(() => addLog('Alert', 'Test alert sent ✅')) },
        { label: 'Restart Bot', action: async () => { await axios.post(`${API_URL}/bot/restart`); addLog('Restart', 'Bot restarting... ⏳') } },
    ]

    return (
        <div className="grid md:grid-cols-2 gap-5">
            {/* Left - Input Panels */}
            <div className="space-y-4">
                {/* Send to AI Chat */}
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2 border-b border-zinc-800">
                        <CardTitle className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                            <Brain className="h-3.5 w-3.5 text-violet-400" /> AI Chat (Force)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3 flex gap-2">
                        <Input value={chatInput} onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendChat()}
                            placeholder="AI ko kuch poochein..."
                            className="flex-1 bg-zinc-950 border-zinc-700 text-sm h-9 text-zinc-100" />
                        <Button onClick={sendChat} disabled={sending || !chatInput.trim()} size="sm"
                            className="bg-violet-700 hover:bg-violet-600 text-white h-9 px-3">
                            <Send className="h-4 w-4" />
                        </Button>
                    </CardContent>
                </Card>

                {/* TTS Speak */}
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2 border-b border-zinc-800">
                        <CardTitle className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                            <Volume2 className="h-3.5 w-3.5 text-amber-400" /> Speak via TTS
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3 flex gap-2">
                        <Input value={ttsInput} onChange={e => setTtsInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && speakTTS()}
                            placeholder="Jo bolna ho likhein..."
                            className="flex-1 bg-zinc-950 border-zinc-700 text-sm h-9 text-zinc-100" />
                        <Button onClick={speakTTS} disabled={speaking || !ttsInput.trim()} size="sm"
                            className="bg-amber-700 hover:bg-amber-600 text-white h-9 px-3">
                            <Mic className="h-4 w-4" />
                        </Button>
                    </CardContent>
                </Card>



                {/* Quick Actions */}
                <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2 border-b border-zinc-800">
                        <CardTitle className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5 text-blue-400" /> Quick Actions
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3 flex flex-wrap gap-2">
                        {quickActions.map((qa, i) => (
                            <button key={i} onClick={() => qa.action().catch(e => addLog('Error', e.message, false))}
                                className="text-xs font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-2 transition">
                                {qa.label}
                            </button>
                        ))}
                    </CardContent>
                </Card>
            </div>

            {/* Right - Output Console */}
            <Card className="bg-zinc-950 border-zinc-800 flex flex-col">
                <CardHeader className="pb-2 border-b border-zinc-800 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                        <Terminal className="h-3.5 w-3.5 text-emerald-400" /> Agent Console
                    </CardTitle>
                    <button onClick={() => setOutput([])} className="text-[10px] text-zinc-600 hover:text-zinc-400 flex items-center gap-1">
                        <Trash2 className="h-3 w-3" /> Clear
                    </button>
                </CardHeader>
                <CardContent className="pt-3 flex-1 overflow-y-auto max-h-[500px] font-mono space-y-1.5">
                    {output.length === 0 && (
                        <p className="text-zinc-600 text-xs italic">Koi command nahi chali abhi tak...</p>
                    )}
                    {output.map((o, i) => (
                        <div key={i} className={`text-xs p-2 rounded border ${o.ok ? 'border-emerald-800/30 bg-emerald-950/10' : 'border-red-800/30 bg-red-950/10'}`}>
                            <span className="text-zinc-600">{o.time} </span>
                            <span className={`font-bold ${o.ok ? 'text-emerald-400' : 'text-red-400'}`}>[{o.label}]</span>
                            <span className="text-zinc-300 ml-1">{o.text}</span>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    )
}

// ─────────────────────────────────────────────
// SHARED SMALL COMPONENTS
// ─────────────────────────────────────────────
function KpiCard({ label, value, icon }) {
    return (
        <Card className="bg-zinc-900 border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-2">{icon}<span className="text-xs text-zinc-500">{label}</span></div>
            <div className="text-xl font-bold font-mono text-zinc-100">{value}</div>
        </Card>
    )
}

function StatBox({ label, value, color }) {
    return (
        <div className="text-center">
            <div className={`text-3xl font-bold font-mono ${color}`}>{value ?? '—'}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{label}</div>
        </div>
    )
}

function ToggleRow({ label, sub, on, onToggle, color }) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-zinc-200">{label}</p>
                <p className="text-[11px] text-zinc-500">{sub}</p>
            </div>
            <button onClick={onToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full border transition
                    ${on ? `bg-${color}-600 border-${color}-500` : 'bg-zinc-700 border-zinc-600'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>
    )
}


