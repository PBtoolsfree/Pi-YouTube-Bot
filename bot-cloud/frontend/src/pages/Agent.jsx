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
    Database, Search, User, ArrowLeft, Settings2, Sparkles, Coins, Swords,
    CreditCard, ExternalLink, Globe
} from 'lucide-react'

const API_URL = import.meta?.env?.VITE_API_URL || '/api'

function safeFixed(value, digits = 1, fallback = "0") {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : fallback;
}

// ─────────────────────────────────────────────
// MAIN CLOUD AGENT CONTROL CENTER
// ─────────────────────────────────────────────
export default function AgentPage() {
    const [activeSection, setActiveSection] = useState('overview')

    const sections = [
        { id: 'overview', label: '⚡ Piya Control Center' },
        { id: 'chat', label: '💬 Chat Logs' },
        { id: 'memory', label: '🧠 YouTube Memory' },
        { id: 'tippage', label: '💳 Tip Page Link' },
        { id: 'commands', label: '🤖 Bot Commands' },
    ]

    return (
        <div className="space-y-5 pb-10">
            {/* Status Bar */}
            <PageStatusBar services={['bot', 'ai', 'tts', 'youtube']} />

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-indigo-600 shadow-lg shadow-violet-500/25 ring-1 ring-white/20">
                        <Bot className="h-7 w-7 text-white animate-pulse" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-zinc-100 tracking-tight">Piya — Central AI Brain</h2>
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-violet-950/80 text-violet-300 border border-violet-700/50 rounded-full">
                                Cloud Intelligence
                            </span>
                        </div>
                        <p className="text-xs text-zinc-400">Natural language chat, real bot data retrieval, Pokémon battles, points transfer & safe tool execution</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-3 py-1.5 rounded-full shadow-inner">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        BRAIN ONLINE
                    </span>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto no-scrollbar">
                {sections.map(s => (
                    <button
                        key={s.id}
                        onClick={() => setActiveSection(s.id)}
                        className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all
                            ${activeSection === s.id
                                ? 'border-violet-500 text-violet-300 bg-violet-950/20 rounded-t-lg'
                                : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            {activeSection === 'overview' && <PiyaOverviewSection />}
            {activeSection === 'chat' && <ChatLogsSection />}
            {activeSection === 'memory' && <YouTubeMemorySection />}
            {activeSection === 'tippage' && <TipPageLinkSection />}
            {activeSection === 'commands' && <BotCommandsSection />}
        </div>
    )
}

// ─────────────────────────────────────────────
// PIYA OVERVIEW SECTION
// ─────────────────────────────────────────────
function PiyaOverviewSection() {
    const [agentData, setAgentData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [testPrompt, setTestPrompt] = useState("")
    const [testLoading, setTestLoading] = useState(false)
    const [testReply, setTestReply] = useState("")

    // Local form state
    const [agentName, setAgentName] = useState("Piya")
    const [personality, setPersonality] = useState("helpful, witty and engaging")
    const [language, setLanguage] = useState("Hinglish")
    const [replyLength, setReplyLength] = useState("concise")
    const [tone, setTone] = useState("friendly, smart and playful")

    const fetchAgentStatus = async () => {
        try {
            const res = await axios.get(`${API_URL}/agent/status`)
            setAgentData(res.data)
            if (res.data) {
                setAgentName(res.data.name || "Piya")
                setPersonality(res.data.personality || "helpful, witty and engaging")
                setLanguage(res.data.language || "Hinglish")
                setReplyLength(res.data.reply_length || "concise")
                setTone(res.data.tone || "friendly, smart and playful")
            }
        } catch (e) {
            console.error("Failed to load agent status:", e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchAgentStatus()
        const interval = setInterval(fetchAgentStatus, 5000)
        return () => clearInterval(interval)
    }, [])

    const handleSaveConfig = async () => {
        setSaving(true)
        try {
            await axios.post(`${API_URL}/agent/config`, {
                name: agentName,
                personality: personality,
                language: language,
                reply_length: replyLength,
                tone: tone
            })
            await fetchAgentStatus()
            alert("✅ Piya configuration saved successfully!")
        } catch (e) {
            alert("Error saving config: " + (e.response?.data?.detail || e.message))
        } finally {
            setSaving(false)
        }
    }

    const handleToggleSwitch = async (switchKey) => {
        try {
            await axios.post(`${API_URL}/agent/toggle`, { switch: switchKey })
            await fetchAgentStatus()
        } catch (e) {
            console.error("Toggle error:", e)
        }
    }

    const handleUpdateAutoChat = async (key, val) => {
        try {
            const updated = { ...(agentData?.auto_chat || {}), [key]: val }
            await axios.post(`${API_URL}/agent/config`, { auto_chat: updated })
            await fetchAgentStatus()
        } catch (e) {
            console.error("Auto chat update error:", e)
        }
    }

    const handleRunTestChat = async () => {
        if (!testPrompt.trim()) return
        setTestLoading(true)
        setTestReply("")
        try {
            const res = await axios.post(`${API_URL}/chat`, { prompt: testPrompt })
            setTestReply(res.data.botReply || "No response received.")
            await fetchAgentStatus()
        } catch (e) {
            setTestReply("Error: " + (e.response?.data?.detail || e.message))
        } finally {
            setTestLoading(false)
        }
    }

    const switches = agentData?.switches || {}
    const autoChat = agentData?.auto_chat || {}
    const metrics = agentData?.metrics || {}

    return (
        <div className="space-y-6">
            {/* Top Stat Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-zinc-900/80 border-zinc-800 p-4">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs">
                        <Cpu className="h-4 w-4 text-violet-400" /> Total AI Requests
                    </div>
                    <div className="text-2xl font-bold text-zinc-100 mt-2">
                        {metrics.requests_total || 0}
                    </div>
                </Card>

                <Card className="bg-zinc-900/80 border-zinc-800 p-4">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs">
                        <Zap className="h-4 w-4 text-amber-400" /> Tools Executed
                    </div>
                    <div className="text-2xl font-bold text-amber-400 mt-2">
                        {metrics.tool_executions || 0}
                    </div>
                </Card>

                <Card className="bg-zinc-900/80 border-zinc-800 p-4">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs">
                        <Shield className="h-4 w-4 text-red-400" /> Denied Actions
                    </div>
                    <div className="text-2xl font-bold text-red-400 mt-2">
                        {metrics.denied_total || 0}
                    </div>
                </Card>

                <Card className="bg-zinc-900/80 border-zinc-800 p-4">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs">
                        <Clock className="h-4 w-4 text-emerald-400" /> Last Latency
                    </div>
                    <div className="text-2xl font-bold text-emerald-400 mt-2">
                        {metrics.last_latency_ms ? `${metrics.last_latency_ms} ms` : '—'}
                    </div>
                </Card>
            </div>

            {/* Agent Identity & Persona */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="bg-zinc-900 border-zinc-800 lg:col-span-1 shadow-md">
                    <CardHeader className="pb-3 border-b border-zinc-800/80">
                        <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-violet-400" /> Agent Identity
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                        <div>
                            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                                Agent Display Name
                            </label>
                            <Input
                                value={agentName}
                                onChange={(e) => setAgentName(e.target.value)}
                                placeholder="e.g. Piya"
                                className="bg-zinc-950 border-zinc-700 text-zinc-100 font-bold"
                            />
                            <p className="text-[10px] text-zinc-500 mt-1">Configurable name used in greetings, replies & live chat wake words.</p>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                                Reply Language
                            </label>
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="w-full h-9 rounded-md bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs px-2.5"
                            >
                                <option value="Hinglish">Hinglish (Hindi + English mix)</option>
                                <option value="Hindi">Hindi (Pure/Casual)</option>
                                <option value="English">English</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                                Reply Length
                            </label>
                            <select
                                value={replyLength}
                                onChange={(e) => setReplyLength(e.target.value)}
                                className="w-full h-9 rounded-md bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs px-2.5"
                            >
                                <option value="concise">Concise (Recommended for YouTube chat)</option>
                                <option value="normal">Normal (Moderate detail)</option>
                                <option value="detailed">Detailed (Thorough explanations)</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                                Tone & Personality
                            </label>
                            <Input
                                value={personality}
                                onChange={(e) => setPersonality(e.target.value)}
                                placeholder="helpful, witty, gamer vibe"
                                className="bg-zinc-950 border-zinc-700 text-zinc-200 text-xs"
                            />
                        </div>

                        <Button
                            onClick={handleSaveConfig}
                            disabled={saving}
                            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs h-9 mt-2"
                        >
                            {saving ? "Saving..." : "Save Identity Settings"}
                        </Button>
                    </CardContent>
                </Card>

                {/* Persisted Feature Switches */}
                <Card className="bg-zinc-900 border-zinc-800 lg:col-span-2 shadow-md">
                    <CardHeader className="pb-3 border-b border-zinc-800/80">
                        <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                            <Settings2 className="h-4 w-4 text-emerald-400" /> Backend-Enforced Feature Switches
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                                { key: 'agent_enabled', label: 'Master Piya Agent', desc: 'Central AI reasoning loop', icon: <Bot className="h-4 w-4 text-violet-400" /> },
                                { key: 'normal_llm', label: 'Normal LLM Replies', desc: 'Conversational replies to questions', icon: <MessageSquare className="h-4 w-4 text-sky-400" /> },
                                { key: 'auto_chat', label: 'Automatic / Random Chat', desc: 'Occasional spontaneous replies', icon: <Zap className="h-4 w-4 text-amber-400" /> },
                                { key: 'viewer_support', label: 'Viewer Support & Help', desc: 'Command guides and bot status', icon: <Users className="h-4 w-4 text-blue-400" /> },
                                { key: 'loyalty_actions', label: 'Loyalty & Point Transfers', desc: 'Balances, ranks and transfers', icon: <Coins className="h-4 w-4 text-yellow-400" /> },
                                { key: 'pokemon_actions', label: 'Pokémon Inventory & Battles', desc: 'Collection, summon and duels', icon: <Swords className="h-4 w-4 text-emerald-400" /> },
                                { key: 'chat_moderation', label: 'Chat Moderation Tools', desc: 'Ban, timeout and ignore', icon: <Shield className="h-4 w-4 text-red-400" /> },
                                { key: 'tts_actions', label: 'TTS Audio Playback', desc: 'Voice announcements via audio engine', icon: <Volume2 className="h-4 w-4 text-indigo-400" /> },
                                { key: 'obs_actions', label: 'OBS & Streamer.bot Actions', desc: 'Overlay and streaming actions', icon: <Monitor className="h-4 w-4 text-purple-400" /> },
                                { key: 'integration_tools', label: 'Integration Status Tools', desc: 'Health and connection inspections', icon: <Wifi className="h-4 w-4 text-teal-400" /> },
                                { key: 'memory_enabled', label: 'Persistent Brain Memory', desc: 'Learn and recall facts across sessions', icon: <Brain className="h-4 w-4 text-pink-400" /> },
                                { key: 'chat_history', label: 'YouTube Memory Retention', desc: '7-day chat context tracking', icon: <Database className="h-4 w-4 text-orange-400" /> },
                            ].map(item => (
                                <div key={item.key} className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60 hover:border-zinc-700/80 transition-all">
                                    <div className="flex items-start gap-2.5">
                                        <div className="mt-0.5">{item.icon}</div>
                                        <div>
                                            <p className="text-xs font-semibold text-zinc-200">{item.label}</p>
                                            <p className="text-[10px] text-zinc-500">{item.desc}</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={switches[item.key] ?? (item.key === 'auto_chat' ? false : true)}
                                        onCheckedChange={() => handleToggleSwitch(item.key)}
                                    />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Auto-Chat & Test Console */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Auto Chat Config */}
                <Card className="bg-zinc-900 border-zinc-800 shadow-md">
                    <CardHeader className="pb-3 border-b border-zinc-800/80">
                        <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                            <Zap className="h-4 w-4 text-amber-400" /> Automatic / Random Viewer Conversation
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                        <p className="text-xs text-zinc-400">
                            Piya can occasionally chime into live chat conversations naturally without requiring explicit mentions. Modifying tools are strictly disabled during random chat.
                        </p>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                            <div>
                                <p className="text-xs font-semibold text-zinc-200">Enable Automatic Chat</p>
                                <p className="text-[10px] text-zinc-500">Master switch: allow Piya to chat spontaneously without mentions</p>
                            </div>
                            <Switch
                                checked={Boolean(autoChat.enabled && (switches.auto_chat ?? false))}
                                onCheckedChange={(val) => {
                                    handleUpdateAutoChat('enabled', val)
                                    handleToggleSwitch('auto_chat')
                                }}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                                    Response Probability
                                </label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max="1.0"
                                    value={autoChat.probability ?? 0.05}
                                    onChange={(e) => handleUpdateAutoChat('probability', parseFloat(e.target.value))}
                                    className="bg-zinc-950 border-zinc-700 text-xs h-9"
                                />
                                <span className="text-[10px] text-zinc-500">e.g. 0.05 = 5% of eligible messages</span>
                            </div>

                            <div>
                                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                                    Global Cooldown (sec)
                                </label>
                                <Input
                                    type="number"
                                    min="10"
                                    value={autoChat.global_cooldown ?? 60}
                                    onChange={(e) => handleUpdateAutoChat('global_cooldown', parseInt(e.target.value))}
                                    className="bg-zinc-950 border-zinc-700 text-xs h-9"
                                />
                                <span className="text-[10px] text-zinc-500">Minimum time between any auto-replies</span>
                            </div>

                            <div>
                                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                                    Per-Viewer Cooldown (sec)
                                </label>
                                <Input
                                    type="number"
                                    min="30"
                                    value={autoChat.user_cooldown ?? 180}
                                    onChange={(e) => handleUpdateAutoChat('user_cooldown', parseInt(e.target.value))}
                                    className="bg-zinc-950 border-zinc-700 text-xs h-9"
                                />
                                <span className="text-[10px] text-zinc-500">Wait time before re-replying to same user</span>
                            </div>

                            <div>
                                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                                    Max Session Replies
                                </label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={autoChat.max_session_replies ?? 50}
                                    onChange={(e) => handleUpdateAutoChat('max_session_replies', parseInt(e.target.value))}
                                    className="bg-zinc-950 border-zinc-700 text-xs h-9"
                                />
                                <span className="text-[10px] text-zinc-500">Cap on auto replies per stream session</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                            <div>
                                <p className="text-xs font-semibold text-zinc-200">Stream Live Requirement</p>
                                <p className="text-[10px] text-zinc-500">Only trigger auto chat when stream is live</p>
                            </div>
                            <Switch
                                checked={autoChat.stream_live_only ?? true}
                                onCheckedChange={(val) => handleUpdateAutoChat('stream_live_only', val)}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Interactive Test Console */}
                <Card className="bg-zinc-900 border-zinc-800 shadow-md">
                    <CardHeader className="pb-3 border-b border-zinc-800/80">
                        <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                            <Terminal className="h-4 w-4 text-sky-400" /> Interactive Piya Test Console
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                        <p className="text-xs text-zinc-400">
                            Test natural language queries directly through Piya as an authenticated Owner:
                        </p>

                        <div className="flex flex-wrap gap-1.5">
                            {[
                                "Mere paas kitne points hain?",
                                "Mera rank kya hai?",
                                "Mere Pokémon kaun-kaun se hain?",
                                "Top viewers kaun hain?",
                                "Bot ke commands explain karo",
                            ].map(sample => (
                                <button
                                    key={sample}
                                    onClick={() => setTestPrompt(sample)}
                                    className="text-[10px] px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
                                >
                                    {sample}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Input
                                value={testPrompt}
                                onChange={(e) => setTestPrompt(e.target.value)}
                                placeholder="Ask Piya anything in Hindi, Hinglish, or English..."
                                onKeyDown={(e) => e.key === 'Enter' && handleRunTestChat()}
                                className="bg-zinc-950 border-zinc-700 text-xs h-10"
                            />
                            <Button
                                onClick={handleRunTestChat}
                                disabled={testLoading || !testPrompt.trim()}
                                className="bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs px-4 h-10"
                            >
                                {testLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </div>

                        {testReply && (
                            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs space-y-1 mt-3">
                                <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                                    {agentName} Reply:
                                </span>
                                <p className="text-zinc-200 whitespace-pre-wrap">{testReply}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Audit Trail & Action History */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-md">
                <CardHeader className="pb-3 border-b border-zinc-800/80 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-violet-400" /> Protected Audit Trail (Recent Actions)
                    </CardTitle>
                    <span className="text-[10px] text-zinc-500">Real-time log of tool calls and permission checks</span>
                </CardHeader>
                <CardContent className="pt-4">
                    {!agentData?.recent_actions || agentData.recent_actions.length === 0 ? (
                        <div className="text-center py-6 text-xs text-zinc-500">
                            No recent tool executions recorded yet.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-zinc-800 text-[10px] font-semibold text-zinc-500 uppercase">
                                        <th className="pb-2">Time</th>
                                        <th className="pb-2">Caller</th>
                                        <th className="pb-2">Role</th>
                                        <th className="pb-2">Tool</th>
                                        <th className="pb-2">Status</th>
                                        <th className="pb-2">Result</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/60">
                                    {agentData.recent_actions.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-zinc-800/30 transition">
                                            <td className="py-2.5 font-mono text-[10px] text-zinc-400 whitespace-nowrap">
                                                {new Date(item.timestamp * 1000).toLocaleTimeString()}
                                            </td>
                                            <td className="py-2.5 font-semibold text-zinc-200">
                                                {item.user}
                                            </td>
                                            <td className="py-2.5">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                    item.role === 'owner' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                                                    item.role === 'moderator' ? 'bg-blue-950 text-blue-400 border border-blue-800' :
                                                    'bg-zinc-800 text-zinc-300'
                                                }`}>
                                                    {item.role}
                                                </span>
                                            </td>
                                            <td className="py-2.5 font-mono text-[11px] text-violet-300">
                                                {item.tool}
                                            </td>
                                            <td className="py-2.5">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                    item.status === 'success' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                                                    item.status === 'denied' ? 'bg-red-950 text-red-400 border border-red-800' :
                                                    'bg-amber-950 text-amber-400 border border-amber-800'
                                                }`}>
                                                    {item.status}
                                                </span>
                                            </td>
                                            <td className="py-2.5 text-zinc-300 font-mono text-[11px] max-w-xs truncate" title={item.result}>
                                                {item.result}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

// ─────────────────────────────────────────────
// CHAT LOGS SECTION
// ─────────────────────────────────────────────
function ChatLogsSection() {
    const [messages, setMessages] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all')
    const [search, setSearch] = useState('')

    const fetchLogs = async () => {
        try {
            const res = await axios.get(`${API_URL}/chat/logs?limit=50`)
            const rawMsgs = Array.isArray(res.data) ? res.data : (res.data?.messages || [])
            setMessages(rawMsgs)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchLogs()
        const i = setInterval(fetchLogs, 5000)
        return () => clearInterval(i)
    }, [])

    const filtered = messages.filter(m => {
        if (filter === 'ai' && !m.ai_reply) return false
        if (filter === 'commands' && !m.message?.startsWith('!')) return false
        if (search) {
            const q = search.toLowerCase()
            return m.user?.toLowerCase().includes(q) || m.message?.toLowerCase().includes(q)
        }
        return true
    })

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <div className="flex gap-2">
                    {['all', 'ai', 'commands'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                                filter === f ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                        >
                            {f === 'all' ? 'All Messages' : f === 'ai' ? 'AI Replies' : 'Commands'}
                        </button>
                    ))}
                </div>
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search chat..."
                    className="bg-zinc-900 border-zinc-700 text-xs h-8 sm:w-64"
                />
            </div>

            <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="pt-4 divide-y divide-zinc-800">
                    {filtered.length === 0 ? (
                        <p className="text-center py-8 text-xs text-zinc-500">No chat messages found.</p>
                    ) : (
                        filtered.map((m, idx) => (
                            <div key={idx} className="py-2.5 text-xs flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-zinc-200">{m.user || 'Viewer'}</span>
                                    <span className="text-[10px] text-zinc-500 font-mono">
                                        {m.timestamp ? new Date(m.timestamp * 1000).toLocaleTimeString() : ''}
                                    </span>
                                </div>
                                <p className="text-zinc-300">{m.message}</p>
                                {m.ai_reply && (
                                    <div className="p-2 rounded bg-violet-950/40 border border-violet-800/40 text-violet-200 mt-1">
                                        <span className="text-[10px] font-bold text-violet-400 uppercase">Piya: </span>
                                        {m.ai_reply}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

// ─────────────────────────────────────────────
// YOUTUBE MEMORY SECTION
// ─────────────────────────────────────────────
function YouTubeMemorySection() {
    const [stats, setStats] = useState(null)
    const [users, setUsers] = useState([])
    const [selectedUser, setSelectedUser] = useState(null)
    const [history, setHistory] = useState([])
    const [cleaning, setCleaning] = useState(false)

    const fetchMemory = async () => {
        try {
            const [st, u] = await Promise.all([
                axios.get(`${API_URL}/memory/stats`).catch(() => axios.get(`${API_URL}/youtube-memory/stats`)),
                axios.get(`${API_URL}/memory/users`).catch(() => axios.get(`${API_URL}/youtube-memory/users`))
            ])
            setStats(st.data)
            const rawUsers = u.data?.users || []
            const userList = rawUsers.map(item => (typeof item === 'string' ? item : item.user || item.username || ''))
            setUsers(userList.filter(Boolean))
        } catch (e) {
            console.error(e)
        }
    }

    useEffect(() => {
        fetchMemory()
    }, [])

    const loadUserHistory = async (user) => {
        setSelectedUser(user)
        try {
            const res = await axios.get(`${API_URL}/memory/user/${user}`).catch(() => axios.get(`${API_URL}/youtube-memory/user/${user}`))
            setHistory(res.data?.messages || [])
        } catch (e) {
            console.error(e)
        }
    }

    const handleCleanup = async () => {
        if (!confirm("Run 7-day memory cleanup now?")) return
        setCleaning(true)
        try {
            const res = await axios.post(`${API_URL}/memory/cleanup`).catch(() => axios.post(`${API_URL}/youtube-memory/cleanup`))
            alert(res.data?.message || "Cleanup complete.")
            fetchMemory()
        } catch (e) {
            alert("Error: " + e.message)
        } finally {
            setCleaning(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="bg-zinc-900 border-zinc-800 p-4">
                    <p className="text-xs text-zinc-500 uppercase font-semibold">Total Memories</p>
                    <p className="text-2xl font-bold text-zinc-100 mt-1">{stats?.total_messages || 0}</p>
                </Card>
                <Card className="bg-zinc-900 border-zinc-800 p-4">
                    <p className="text-xs text-zinc-500 uppercase font-semibold">Remembered Viewers</p>
                    <p className="text-2xl font-bold text-violet-400 mt-1">{stats?.total_users || users.length}</p>
                </Card>
                <Card className="bg-zinc-900 border-zinc-800 p-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-zinc-500 uppercase font-semibold">Retention Policy</p>
                        <p className="text-sm font-bold text-emerald-400 mt-1">7 Days Auto-Clean</p>
                    </div>
                    <Button onClick={handleCleanup} disabled={cleaning} size="sm" variant="outline" className="text-xs border-zinc-700">
                        {cleaning ? "Cleaning..." : "Run Cleanup"}
                    </Button>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-zinc-900 border-zinc-800 md:col-span-1">
                    <CardHeader className="pb-2 border-b border-zinc-800">
                        <CardTitle className="text-xs font-bold text-zinc-300 uppercase">Viewers</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2 max-h-96 overflow-y-auto space-y-1">
                        {users.map(u => (
                            <button
                                key={u}
                                onClick={() => loadUserHistory(u)}
                                className={`w-full text-left px-3 py-2 rounded text-xs transition ${
                                    selectedUser === u ? 'bg-violet-900/40 text-violet-200 font-semibold' : 'text-zinc-400 hover:bg-zinc-800'
                                }`}
                            >
                                @{u}
                            </button>
                        ))}
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900 border-zinc-800 md:col-span-2">
                    <CardHeader className="pb-2 border-b border-zinc-800">
                        <CardTitle className="text-xs font-bold text-zinc-300 uppercase">
                            {selectedUser ? `Memory History for @${selectedUser}` : 'Select a viewer'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3 max-h-96 overflow-y-auto space-y-2">
                        {!selectedUser ? (
                            <p className="text-center py-10 text-xs text-zinc-500">Select a viewer on the left to see memories.</p>
                        ) : history.length === 0 ? (
                            <p className="text-center py-10 text-xs text-zinc-500">No memories found for @{selectedUser}.</p>
                        ) : (
                            history.map((h, i) => (
                                <div key={i} className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-xs space-y-1">
                                    <div className="flex justify-between text-[10px] text-zinc-500">
                                        <span className="font-semibold text-zinc-300">Message</span>
                                        <span>{h.timestamp ? new Date(h.timestamp * 1000).toLocaleString() : ''}</span>
                                    </div>
                                    <p className="text-zinc-200">{h.message}</p>
                                    {h.ai_reply && (
                                        <div className="pt-1 text-violet-300 border-t border-zinc-800/60 mt-1">
                                            <span className="text-[10px] text-violet-400 font-bold">Piya: </span>
                                            {h.ai_reply}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────
// TIP PAGE LINK SECTION
// ─────────────────────────────────────────────
function TipPageLinkSection() {
    const [customUrl, setCustomUrl] = useState('')
    const [upiVpa, setUpiVpa] = useState('')
    const [instructions, setInstructions] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [verifying, setVerifying] = useState(false)
    const [verifyResult, setVerifyResult] = useState(null)
    const [statusMessage, setStatusMessage] = useState(null)
    const [errorMessage, setErrorMessage] = useState(null)

    const fetchTipLink = async () => {
        try {
            setLoading(true)
            const res = await axios.get(`${API_URL}/agent/tip-link`)
            if (res.data) {
                setCustomUrl(res.data.custom_url || '')
                setUpiVpa(res.data.upi_vpa || '')
                setInstructions(res.data.donation_instructions || '')
            }
        } catch (e) {
            console.error('Failed to fetch tip link settings', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchTipLink()
    }, [])

    const handleSave = async () => {
        setStatusMessage(null)
        setErrorMessage(null)

        const trimmed = customUrl.trim()
        if (trimmed) {
            if (!/^https?:\/\//i.test(trimmed)) {
                setErrorMessage('URL must start with http:// or https://')
                return
            }
            try {
                const parsed = new URL(trimmed)
                if (parsed.username || parsed.password) {
                    setErrorMessage('Embedded credentials in URL are not allowed')
                    return
                }
            } catch (err) {
                setErrorMessage('Invalid URL format. Please check and try again.')
                return
            }
        }

        setSaving(true)
        try {
            const res = await axios.post(`${API_URL}/agent/tip-link`, {
                custom_url: trimmed,
                upi_vpa: upiVpa.trim(),
                donation_instructions: instructions.trim()
            })
            setStatusMessage('Tip Page link settings saved successfully!')
            setErrorMessage(null)
            if (res.data?.tip_page) {
                setCustomUrl(res.data.tip_page.custom_url || '')
                setUpiVpa(res.data.tip_page.upi_vpa || '')
                setInstructions(res.data.tip_page.donation_instructions || '')
            }
        } catch (e) {
            setErrorMessage(e.response?.data?.detail || e.message || 'Failed to save tip link')
        } finally {
            setSaving(false)
        }
    }

    const handleVerifyReachability = async () => {
        const trimmed = customUrl.trim()
        if (!trimmed) {
            setErrorMessage('Please enter a Custom Tip Page URL first')
            return
        }
        setVerifying(true)
        setVerifyResult(null)
        try {
            const res = await axios.post(`${API_URL}/agent/tip-link/verify`, { url: trimmed })
            setVerifyResult(res.data)
        } catch (e) {
            setVerifyResult({
                reachable: false,
                warning: e.response?.data?.detail || e.message || 'Reachability test failed'
            })
        } finally {
            setVerifying(false)
        }
    }

    const openPreview = () => {
        const trimmed = customUrl.trim()
        if (trimmed) {
            window.open(trimmed, '_blank', 'noopener,noreferrer')
        }
    }

    return (
        <div className="space-y-4 max-w-4xl">
            <Card className="bg-zinc-900 border-zinc-800 shadow-md">
                <CardHeader className="pb-3 border-b border-zinc-800/80">
                    <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-violet-400" /> Dedicated Tip Page & Payment Configuration
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                    <p className="text-xs text-zinc-400">
                        Configure the authoritative public donation URL and payment details for PB HERO LIVE.
                        Piya will return this exact link without modifying or appending extra paths.
                    </p>

                    {statusMessage && (
                        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-xs text-emerald-300 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                            <span>{statusMessage}</span>
                        </div>
                    )}

                    {errorMessage && (
                        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                                Custom Tip Page URL (Complete Public Link)
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    value={customUrl}
                                    onChange={(e) => {
                                        setCustomUrl(e.target.value)
                                        setVerifyResult(null)
                                        setErrorMessage(null)
                                    }}
                                    placeholder="https://yourdomain.com/tip"
                                    className="bg-zinc-950 border-zinc-700 text-xs font-mono h-9 flex-1"
                                />
                                <Button
                                    type="button"
                                    onClick={openPreview}
                                    disabled={!customUrl.trim()}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300"
                                >
                                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Preview
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleVerifyReachability}
                                    disabled={verifying || !customUrl.trim()}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300"
                                >
                                    {verifying ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <Globe className="h-3.5 w-3.5 mr-1" />}
                                    Test Link
                                </Button>
                            </div>
                            <span className="text-[10px] text-zinc-500 mt-1 block">
                                Enter the full public link including scheme (e.g., https://pbherolive.com/tip).
                            </span>
                        </div>

                        {verifyResult && (
                            <div className={`p-3 rounded-lg text-xs flex items-start gap-2 border ${
                                verifyResult.reachable
                                    ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                                    : 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                            }`}>
                                {verifyResult.reachable ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                ) : (
                                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                                )}
                                <div>
                                    <p className="font-semibold">
                                        {verifyResult.reachable
                                            ? `Link reachable (HTTP ${verifyResult.status_code || 200})`
                                            : 'Reachability Warning'}
                                    </p>
                                    {verifyResult.warning && (
                                        <p className="text-[11px] opacity-90 mt-0.5">{verifyResult.warning}</p>
                                    )}
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                                UPI ID / VPA (Optional)
                            </label>
                            <Input
                                value={upiVpa}
                                onChange={(e) => setUpiVpa(e.target.value)}
                                placeholder="creator@upi or paytmqr281005@paytm"
                                className="bg-zinc-950 border-zinc-700 text-xs font-mono h-9"
                            />
                            <span className="text-[10px] text-zinc-500 mt-1 block">
                                Viewers asking how to donate via UPI will receive this ID.
                            </span>
                        </div>

                        <div>
                            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                                Donation Instructions (Optional)
                            </label>
                            <Input
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                placeholder="Scan the QR on stream or use UPI via PhonePe, GPay, or Paytm."
                                className="bg-zinc-950 border-zinc-700 text-xs h-9"
                            />
                            <span className="text-[10px] text-zinc-500 mt-1 block">
                                Concise instructions for payment methods supported on your stream.
                            </span>
                        </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs px-5 h-9"
                        >
                            {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> : null}
                            Save Changes
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

// ─────────────────────────────────────────────
// BOT COMMANDS SECTION
// ─────────────────────────────────────────────
function BotCommandsSection() {
    const commandList = [
        { cmd: '!points', desc: 'Check current points balance & rank tier', category: 'Economy' },
        { cmd: '!top / !leaderboard', desc: 'Display top 10 chatters on points leaderboard', category: 'Economy' },
        { cmd: '!give <user> <amount>', desc: 'Transfer your loyalty points to another viewer', category: 'Economy' },
        { cmd: '!rob <user>', desc: '40% chance to steal 10% points (60s cooldown)', category: 'Economy' },
        { cmd: '!gamble <amount>', desc: '50/50 double-or-nothing coinflip', category: 'Games' },
        { cmd: '!slots <amount>', desc: 'Spin slot machine for up to 10x jackpot', category: 'Games' },
        { cmd: '!bowl <amount>', desc: 'Start a 1v1 cricket duel challenge', category: 'Games' },
        { cmd: '!bat [amount]', desc: 'Bat solo or accept an opponent bowl challenge', category: 'Games' },
        { cmd: '!catch', desc: 'Capture a currently spawned wild Pokémon', category: 'Pokémon' },
        { cmd: '!pokemon', desc: 'View your Pokémon collection and active buddy', category: 'Pokémon' },
        { cmd: '!summon <name>', desc: 'Summon an owned Pokémon as stream buddy', category: 'Pokémon' },
        { cmd: '!battle @user <bet>', desc: 'Challenge another viewer to a Pokémon duel', category: 'Pokémon' },
        { cmd: 'piya <question>', desc: 'Ask Piya any question naturally in live chat', category: 'AI Brain' },
    ]

    return (
        <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3 border-b border-zinc-800">
                <CardTitle className="text-sm font-bold text-zinc-100">Live Bot Command Index</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 divide-y divide-zinc-800/80">
                {commandList.map((c, i) => (
                    <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                            <span className="font-mono font-bold text-violet-300">{c.cmd}</span>
                            <p className="text-zinc-400 text-[11px] mt-0.5">{c.desc}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300">
                            {c.category}
                        </span>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
