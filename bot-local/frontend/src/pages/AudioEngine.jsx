import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { Volume2, Zap, Clock, Activity, SkipForward, Trash2, Pause, Play, GripVertical, Save, Mic, AlertTriangle, X, Plus, Gauge, Timer, ShieldAlert } from 'lucide-react'
import { Card, CardHeader, CardContent, CardTitle, Button } from '@/components/ui'
import { Reorder } from 'framer-motion'
import { cn } from '@/lib/utils'
import { PageStatusBar } from '@/components/ServiceStatus'

function safeFixed(value, digits = 1, fallback = "0") {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : fallback;
}

const LANGUAGES = [
    { id: 'en-IN', name: 'English (India)', voices: ['en-IN-PrabhatNeural', 'en-IN-NeerjaNeural'] },
    { id: 'hi-IN', name: 'Hindi', voices: ['hi-IN-SwaraNeural', 'hi-IN-MadhurNeural'] },
    { id: 'bn-IN', name: 'Bengali', voices: ['bn-IN-BashkarNeural', 'bn-IN-TanishaaNeural'] }
]

const HEALTH_CONFIG = {
    healthy: { color: 'emerald', label: 'System Healthy', icon: Activity },
    degraded: { color: 'amber', label: 'Degraded', icon: AlertTriangle },
    error: { color: 'rose', label: 'System Error', icon: ShieldAlert },
}

export default function AudioEnginePage() {
    const [stats, setStats] = useState(null)
    const [config, setConfig] = useState(null)
    const [selectedLang, setSelectedLang] = useState('en-IN')
    const [selectedVoice, setSelectedVoice] = useState('')
    const [hasChanges, setHasChanges] = useState(false)
    const [activeTab, setActiveTab] = useState('private')
    const [autoVoices, setAutoVoices] = useState({
        enabled: true,
        public: { en: '', hi: '', bn: '', default: '' },
        private: { en: '', hi: '', bn: '', default: '' }
    })

    // Audio tuning
    const [rate, setRate] = useState(0)
    const [volume, setVolume] = useState(0)

    // Banned words
    const [bannedWords, setBannedWords] = useState([])
    const [newWord, setNewWord] = useState('')

    // Queues for Reorder
    const [publicQueue, setPublicQueue] = useState([])
    const [priorityQueue, setPriorityQueue] = useState([])

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await axios.get('/api/audio/status')
                setStats(res.data)

                if (res.data.queues) {
                    setPublicQueue(res.data.queues.public || [])
                    setPriorityQueue(res.data.queues.secret || [])
                }
            } catch (e) {
                console.error("Audio stats fetch error", e)
            }
        }

        const fetchConfig = async () => {
            try {
                const res = await axios.get('/api/config')
                setConfig(res.data)
                const currentVoice = res.data.audio?.voice || 'en-IN-PrabhatNeural'
                setSelectedVoice(currentVoice)

                // Auto-detect language from voice prefix
                const lang = LANGUAGES.find(l => currentVoice.startsWith(l.id))
                if (lang) setSelectedLang(lang.id)
                if (res.data.audio?.auto_voices) {
                    setAutoVoices(res.data.audio.auto_voices)
                }

                // Load rate/volume
                const rateStr = res.data.audio?.rate || '+0%'
                const volStr = res.data.audio?.volume || '+0%'
                setRate(parseInt(rateStr.replace('%', '')) || 0)
                setVolume(parseInt(volStr.replace('%', '')) || 0)

                // Load banned words
                if (res.data.audio?.banned_words) {
                    setBannedWords(res.data.audio.banned_words)
                }
            } catch (e) { }
        }

        fetchStats()
        fetchConfig()
        const interval = setInterval(fetchStats, 1000)
        return () => clearInterval(interval)
    }, [])

    const [activePriorityMode, setActivePriorityMode] = useState('public')

    useEffect(() => {
        if (config?.audio?.priority_mode) {
            setActivePriorityMode(config.audio.priority_mode)
        }
    }, [config])

    useEffect(() => {
        if (stats?.config?.priority_mode && !hasChanges) {
            setActivePriorityMode(stats.config.priority_mode)
        }
    }, [stats, hasChanges])


    const handleSave = async () => {
        if (!config) return
        try {
            const rateStr = rate >= 0 ? `+${rate}%` : `${rate}%`
            const volStr = volume >= 0 ? `+${volume}%` : `${volume}%`

            const newConfig = {
                ...config,
                audio: {
                    ...config.audio,
                    voice: selectedVoice,
                    priority_mode: activePriorityMode,
                    auto_voices: autoVoices,
                    rate: rateStr,
                    volume: volStr,
                    banned_words: bannedWords,
                }
            }
            await axios.post('/api/config', { config: newConfig })
            setHasChanges(false)
            alert("Settings saved!")
        } catch (e) { alert("Save failed") }
    }

    const handleSkip = async () => {
        try { await axios.post('/api/audio/skip') } catch (e) { }
    }

    const togglePause = async () => {
        try {
            if (stats?.paused) await axios.post('/api/audio/resume')
            else await axios.post('/api/audio/pause')
        } catch (e) { }
    }

    const handleRemove = async (channel, id) => {
        try {
            if (channel === 'public') setPublicQueue(q => q.filter(i => i.id !== id))
            else setPriorityQueue(q => q.filter(i => i.id !== id))
            await axios.post('/api/audio/queue/remove', { channel, id })
        } catch (e) { console.error(e) }
    }

    const handleReorder = async (channel, newOrder) => {
        if (channel === 'public') setPublicQueue(newOrder)
        else setPriorityQueue(newOrder)

        try {
            await axios.post('/api/audio/queue/reorder', {
                channel,
                items: newOrder.map(i => i.id)
            })
        } catch (e) { }
    }

    const handleSetPriority = async (mode) => {
        try {
            await axios.post('/api/audio/priority', { mode })
            setActivePriorityMode(mode)
            setHasChanges(true)
        } catch (e) { }
    }

    const handleQueuePause = async (channel, paused) => {
        try {
            await axios.post('/api/audio/queue/pause', { channel, paused })
            if (stats) {
                const newQueuePaused = { ...stats.queue_paused, [channel]: paused }
                setStats({ ...stats, queue_paused: newQueuePaused })
            }
        } catch (e) { }
    }

    const addBannedWord = () => {
        const word = newWord.trim().toLowerCase()
        if (word && !bannedWords.includes(word)) {
            setBannedWords([...bannedWords, word])
            setNewWord('')
            setHasChanges(true)
        }
    }

    const removeBannedWord = (word) => {
        setBannedWords(bannedWords.filter(w => w !== word))
        setHasChanges(true)
    }

    const safeStats = stats || {
        metrics: { avg_latency: 0, played_count: 0, dropped_count: 0, edge_tts_failures: 0, gtts_fallbacks: 0, timeout_kills: 0, total_errors: 0 },
        queues: { public: [], secret: [] },
        is_playing: false,
        paused: false,
        config: { voice: "Connecting...", volume: "0%", rate: "0%" },
        health_status: "healthy",
        uptime_seconds: 0,
        last_error: null,
    }

    const healthKey = safeStats.health_status || 'healthy'
    const health = HEALTH_CONFIG[healthKey] || HEALTH_CONFIG.healthy
    const HealthIcon = health.icon
    const ttsErrors = (safeStats.metrics.edge_tts_failures || 0) + (safeStats.metrics.gtts_fallbacks || 0)

    return (
        <div className="space-y-6 pb-20 h-full overflow-y-auto">
            <PageStatusBar services={['bot', 'tts']} />
            {/* Header */}
            <div className="flex justify-between items-center px-1">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                        <Volume2 className="h-5 w-5 text-zinc-100" />
                        Audio Engine
                    </h2>
                    <p className="text-sm text-zinc-400">Real-time performance metrics and TTS management.</p>
                </div>
                <div className="flex items-center gap-4">
                    <Button
                        variant={safeStats.paused ? "destructive" : "secondary"}
                        size="sm"
                        onClick={togglePause}
                        className="gap-2"
                    >
                        {safeStats.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                        {safeStats.paused ? "Resume Playback" : "Pause System"}
                    </Button>
                    <div className={cn(
                        "flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wide transition-all",
                        healthKey === 'healthy' && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                        healthKey === 'degraded' && "bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse",
                        healthKey === 'error' && "bg-rose-500/10 text-rose-500 border-rose-500/20 animate-pulse",
                    )}>
                        <HealthIcon className="h-3.5 w-3.5" />
                        {health.label}
                    </div>
                </div>
            </div>

            {/* Error Banner */}
            {safeStats.last_error && healthKey !== 'healthy' && (
                <div className={cn(
                    "flex items-start gap-3 px-4 py-3 rounded-lg border text-sm",
                    healthKey === 'error' ? "bg-rose-500/5 border-rose-500/20 text-rose-300" : "bg-amber-500/5 border-amber-500/20 text-amber-300"
                )}>
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <span className="font-medium">Last Error: </span>
                        <span className="font-mono text-xs">{safeStats.last_error.message}</span>
                        <span className="text-[10px] text-zinc-500 ml-2">
                            {new Date(safeStats.last_error.timestamp * 1000).toLocaleTimeString()}
                        </span>
                    </div>
                </div>
            )}

            {/* Metrics */}
            <div className="grid gap-4 md:grid-cols-5">
                <MetricCard title="Avg Latency" value={`${safeFixed(safeStats?.metrics?.avg_latency, 2)}s`} icon={<Clock className="text-amber-500" />} desc="Generation + Transport" />
                <MetricCard title="Total Messages" value={safeStats.metrics.played_count} icon={<Volume2 className="text-blue-500" />} desc="Phrases spoken" />
                <MetricCard title="Dropped" value={safeStats.metrics.dropped_count} icon={<Zap className="text-rose-500" />} desc="Queue overflows" />
                <MetricCard title="TTS Errors" value={ttsErrors} icon={<AlertTriangle className="text-orange-500" />} desc={`Edge: ${safeStats.metrics.edge_tts_failures || 0} | gTTS: ${safeStats.metrics.gtts_fallbacks || 0}`} />
                <MetricCard title="Timeouts" value={safeStats.metrics.timeout_kills || 0} icon={<Timer className="text-purple-500" />} desc="Zombie kills" />
            </div>

            {/* Config & Status */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                <CardHeader className="pb-3 border-b border-zinc-800 flex flex-row justify-between items-center">
                    <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                        <Mic className="h-4 w-4 text-zinc-400" /> Voice Configuration
                    </CardTitle>
                    {hasChanges && (
                        <Button size="sm" onClick={handleSave} className="h-8 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                            <Save className="h-3.5 w-3.5" /> Save Changes
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="pt-4 grid sm:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-400 uppercase">Language</label>
                            <div className="flex flex-wrap gap-2">
                                {LANGUAGES.map(l => (
                                    <button
                                        key={l.id}
                                        onClick={() => { setSelectedLang(l.id); setSelectedVoice(l.voices[0]); setHasChanges(true); }}
                                        className={cn(
                                            "px-3 py-1.5 rounded text-xs font-medium transition-colors border",
                                            selectedLang === l.id
                                                ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                                                : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                                        )}
                                    >
                                        {l.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-4">
                            <label className="text-xs font-medium text-zinc-400 uppercase">Voice Profile</label>
                            <div className="relative">
                                <select
                                    className="w-full h-10 rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm text-white ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 appearance-none"
                                    value={selectedVoice}
                                    onChange={(e) => { setSelectedVoice(e.target.value); setHasChanges(true); }}
                                >
                                    {LANGUAGES.find(l => l.id === selectedLang)?.voices.map(v => (
                                        <option key={v} value={v} className="bg-zinc-900 text-zinc-300">
                                            {v}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {/* Rate & Volume Sliders */}
                        <div className="space-y-3">
                            <label className="text-xs font-medium text-zinc-400 uppercase">Speech Rate</label>
                            <div className="flex items-center gap-3">
                                <Gauge className="h-4 w-4 text-zinc-500 shrink-0" />
                                <input
                                    type="range"
                                    min={-50}
                                    max={100}
                                    value={rate}
                                    onChange={(e) => { setRate(parseInt(e.target.value)); setHasChanges(true); }}
                                    className="flex-1 h-2 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:appearance-none"
                                />
                                <span className="text-xs font-mono text-zinc-300 w-14 text-right tabular-nums">
                                    {rate >= 0 ? `+${rate}%` : `${rate}%`}
                                </span>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-xs font-medium text-zinc-400 uppercase">Volume</label>
                            <div className="flex items-center gap-3">
                                <Volume2 className="h-4 w-4 text-zinc-500 shrink-0" />
                                <input
                                    type="range"
                                    min={-50}
                                    max={100}
                                    value={volume}
                                    onChange={(e) => { setVolume(parseInt(e.target.value)); setHasChanges(true); }}
                                    className="flex-1 h-2 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-emerald-500 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:appearance-none"
                                />
                                <span className="text-xs font-mono text-zinc-300 w-14 text-right tabular-nums">
                                    {volume >= 0 ? `+${volume}%` : `${volume}%`}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-xs font-medium text-zinc-400 uppercase">Active Priority Mode</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => { setActivePriorityMode('private'); setHasChanges(true); }}
                                    className={cn(
                                        "px-3 py-2 rounded-md text-xs font-bold border transition-all flex items-center justify-center gap-2",
                                        activePriorityMode === 'private'
                                            ? "bg-amber-500 text-zinc-950 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                                            : "bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300"
                                    )}
                                >
                                    <Zap className="h-3.5 w-3.5" />
                                    Prioritize Private
                                </button>
                                <button
                                    onClick={() => { setActivePriorityMode('public'); setHasChanges(true); }}
                                    className={cn(
                                        "px-3 py-2 rounded-md text-xs font-bold border transition-all flex items-center justify-center gap-2",
                                        activePriorityMode === 'public'
                                            ? "bg-blue-500 text-white border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                                            : "bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300"
                                    )}
                                >
                                    <Volume2 className="h-3.5 w-3.5" />
                                    Prioritize Public
                                </button>
                            </div>
                        </div>
                    </div>


                    {/* Status Box */}
                    <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-4 space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Playback Status</span>
                            {safeStats.is_playing ? (
                                <span className="text-xs text-emerald-500 font-bold animate-pulse">SPEAKING</span>
                            ) : (
                                <span className="text-xs text-zinc-500 font-bold">IDLE</span>
                            )}
                        </div>
                        <div className="border-t border-zinc-900 pt-3">
                            <div className="text-[10px] text-zinc-500 uppercase mb-1">Last Spoken</div>
                            <p className="text-xs text-zinc-300 font-mono italic">
                                "{typeof safeStats.current_text === 'object' ? safeStats.current_text.text : (safeStats.current_text || "...")}"
                            </p>
                        </div>

                        {/* Uptime display */}
                        <div className="border-t border-zinc-900 pt-3">
                            <div className="text-[10px] text-zinc-500 uppercase mb-1">Engine Uptime</div>
                            <p className="text-sm text-zinc-200 font-mono">
                                {formatUptime(safeStats.uptime_seconds || 0)}
                            </p>
                        </div>

                        {/* Temp dir indicator (Pi optimization check) */}
                        {safeStats.temp_dir && (
                            <div className="border-t border-zinc-900 pt-3">
                                <div className="text-[10px] text-zinc-500 uppercase mb-1">Temp Storage</div>
                                <div className="flex items-center gap-1.5">
                                    <div className={cn(
                                        "h-1.5 w-1.5 rounded-full",
                                        safeStats.temp_dir.includes('/dev/shm') ? "bg-emerald-500" : "bg-zinc-600"
                                    )} />
                                    <span className="text-xs text-zinc-400 font-mono">{safeStats.temp_dir}</span>
                                    {safeStats.temp_dir.includes('/dev/shm') && (
                                        <span className="text-[9px] text-emerald-500 bg-emerald-500/10 px-1 rounded">RAM</span>
                                    )}
                                </div>
                            </div>
                        )}

                        <Button size="sm" variant="outline" onClick={handleSkip} className="w-full h-8 gap-2 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs">
                            <SkipForward className="h-3.5 w-3.5" /> Skip Current Phrase
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Auto Voices Config */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                <CardHeader className="pb-3 border-b border-zinc-800 flex flex-row justify-between items-center">
                    <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                        <Mic className="h-4 w-4 text-zinc-400" /> Auto Language Voices
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-400">Enable Auto-Language</label>
                        <input 
                            type="checkbox" 
                            checked={autoVoices.enabled || false}
                            onChange={(e) => {
                                setAutoVoices({...autoVoices, enabled: e.target.checked})
                                setHasChanges(true)
                            }}
                            className="h-4 w-4 rounded border-zinc-800 bg-zinc-950 text-emerald-500 focus:ring-emerald-500/20"
                        />
                    </div>
                </CardHeader>
                {autoVoices.enabled && (
                    <CardContent className="pt-4 grid sm:grid-cols-2 gap-6">
                        {['public', 'private'].map(channel => (
                            <div key={channel} className="space-y-4">
                                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-widest border-b border-zinc-800 pb-2">
                                    {channel === 'public' ? 'Public (Bot)' : 'Private (Viewer)'} Voices
                                </h3>
                                {['en', 'hi', 'bn', 'default'].map(langKey => (
                                    <div key={langKey} className="flex flex-col space-y-1">
                                        <label className="text-[10px] text-zinc-500 uppercase">{langKey === 'default' ? 'Fallback' : langKey} Model</label>
                                        <select
                                            className="w-full h-8 rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1 text-xs text-white"
                                            value={autoVoices[channel]?.[langKey] || ''}
                                            onChange={(e) => {
                                                setAutoVoices(prev => ({
                                                    ...prev,
                                                    [channel]: { ...prev[channel], [langKey]: e.target.value }
                                                }))
                                                setHasChanges(true)
                                            }}
                                        >
                                            <option value="">-- Select Voice --</option>
                                            {LANGUAGES.flatMap(l => l.voices).map(v => (
                                                <option key={v} value={v}>{v}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </CardContent>
                )}
            </Card>

            {/* Banned Words Manager */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                <CardHeader className="pb-3 border-b border-zinc-800">
                    <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                        <ShieldAlert className="h-4 w-4 text-zinc-400" /> TTS Banned Words
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                    <div className="flex gap-2">
                        <input 
                            type="text"
                            value={newWord}
                            onChange={(e) => setNewWord(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addBannedWord()}
                            placeholder="Add word to filter..."
                            className="flex-1 h-9 rounded-md border border-zinc-800 bg-zinc-950/50 px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700"
                        />
                        <Button size="sm" onClick={addBannedWord} className="h-9 gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                            <Plus className="h-3.5 w-3.5" /> Add
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {bannedWords.map(word => (
                            <span key={word} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 group hover:border-rose-500/30 transition-colors">
                                {word}
                                <button
                                    onClick={() => removeBannedWord(word)}
                                    className="text-zinc-600 hover:text-rose-500 transition-colors"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        ))}
                        {bannedWords.length === 0 && (
                            <span className="text-xs text-zinc-600 italic">No banned words configured. Using defaults.</span>
                        )}
                    </div>
                    <p className="text-[10px] text-zinc-600">
                        Words added here will be replaced with *bleep* in TTS output. If empty, a built-in default list is used.
                    </p>
                </CardContent>
            </Card>

            {/* Queue Tabs */}
            <div className="flex flex-col h-[600px]">
                <div className="flex items-center border-b border-zinc-800 mb-4">
                    <button
                        onClick={() => setActiveTab('private')}
                        className={cn(
                            "px-6 py-3 text-sm font-medium transition-all relative",
                            activeTab === 'private'
                                ? "text-amber-500 bg-amber-500/5 border-b-2 border-amber-500"
                                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
                        )}
                    >
                        Priority Private
                        {priorityQueue.length > 0 && (
                            <span className="ml-2 text-xs bg-amber-500/20 text-amber-500 px-1.5 rounded-full">
                                {priorityQueue.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('public')}
                        className={cn(
                            "px-6 py-3 text-sm font-medium transition-all relative",
                            activeTab === 'public'
                                ? "text-blue-500 bg-blue-500/5 border-b-2 border-blue-500"
                                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
                        )}
                    >
                        Public Queue
                        {publicQueue.length > 0 && (
                            <span className="ml-2 text-xs bg-blue-500/20 text-blue-500 px-1.5 rounded-full">
                                {publicQueue.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 min-h-0">
                    {activeTab === 'private' ? (
                        <QueueSlate
                            title="Priority Private Queue"
                            items={priorityQueue}
                            color="amber"
                            isPaused={safeStats.queue_paused?.secret}
                            onTogglePause={() => handleQueuePause('secret', !safeStats.queue_paused?.secret)}
                            onReorder={(order) => handleReorder('secret', order)}
                            onRemove={(id) => handleRemove('secret', id)}
                        />
                    ) : (
                        <QueueSlate
                            title="Public Queue"
                            items={publicQueue}
                            color="blue"
                            isPaused={safeStats.queue_paused?.public}
                            onTogglePause={() => handleQueuePause('public', !safeStats.queue_paused?.public)}
                            onReorder={(order) => handleReorder('public', order)}
                            onRemove={(id) => handleRemove('public', id)}
                        />
                    )}
                </div>
            </div>
        </div >
    )
}

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}h ${m}m ${s}s`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
}

function QueueSlate({ title, items, color, onReorder, onRemove, isPaused, onTogglePause }) {
    const borderColor = color === 'amber' ? 'border-amber-500/20' : 'border-blue-500/20'
    const textColor = color === 'amber' ? 'text-amber-500' : 'text-blue-500'
    const bgColor = color === 'amber' ? 'bg-amber-500/5' : 'bg-blue-500/5'

    return (
        <Card className="bg-zinc-900 border-zinc-800 shadow-sm flex flex-col h-[400px]">
            <CardHeader className="py-3 px-4 border-b border-zinc-800 bg-zinc-950/30 flex flex-row items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <div className={cn("h-2 w-2 rounded-full", color === 'amber' ? 'bg-amber-500' : 'bg-blue-500', isPaused && "animate-pulse bg-rose-500")} />
                    <span className="text-sm font-semibold text-zinc-100">{title}</span>
                    <span className="text-xs text-zinc-500 font-mono bg-zinc-900 border border-zinc-800 px-1.5 rounded">
                        {items?.length || 0}
                    </span>
                    {isPaused && <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 uppercase tracking-wide">Paused</span>}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onTogglePause}
                    className={cn(
                        "h-7 text-xs gap-1.5",
                        isPaused ? "text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" : "text-zinc-400 hover:text-zinc-200"
                    )}
                >
                    {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    {isPaused ? "Resume Queue" : "Pause Queue"}
                </Button>
            </CardHeader>
            <div className="flex-1 overflow-y-auto p-2 bg-zinc-950/20">
                {(!items || items.length === 0) ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-2">
                        <div className="p-3 rounded-full bg-zinc-900/50 border border-zinc-800/50">
                            <Activity className="h-5 w-5 opacity-20" />
                        </div>
                        <p className="text-xs uppercase tracking-widest font-medium">Queue Empty</p>
                    </div>
                ) : (
                    <Reorder.Group axis="y" values={items} onReorder={onReorder} className="space-y-2">
                        {items.map((item) => (
                            <Reorder.Item key={item.id} value={item}>
                                <div className={cn(
                                    "group relative flex items-start gap-3 p-3 rounded border bg-zinc-900 hover:bg-zinc-800/80 transition-colors select-none",
                                    borderColor
                                )}>
                                    <div className="mt-1 cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400">
                                        <GripVertical className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-zinc-200 leading-snug break-words">
                                            {typeof item.text === 'object' ? item.text.text : item.text}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <span className="text-[10px] text-zinc-500 font-mono uppercase">
                                                {new Date(item.timestamp * 1000).toLocaleTimeString()}
                                            </span>
                                            {item.voice && typeof item.voice !== 'object' && (
                                                <span className="text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 px-1 rounded truncate max-w-[100px]">
                                                    {item.voice}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onRemove(item.id)}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-rose-500/10 text-zinc-500 hover:text-rose-500 transition-all"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </Reorder.Item>
                        ))}
                    </Reorder.Group>
                )}
            </div>
        </Card>
    )
}

function MetricCard({ title, value, icon, desc }) {
    return (
        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
            <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">{title}</div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</div>
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight text-zinc-100">{value}</div>
                <p className="text-[10px] text-zinc-500 mt-1 uppercase font-medium">{desc}</p>
            </CardContent>
        </Card>
    )
}
