import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from '@/components/ui'
import { PageStatusBar } from '@/components/ServiceStatus'
import {
    Cpu, Volume2, Radio, Server, Activity, RefreshCw,
    Wifi, WifiOff, CheckCircle2, AlertTriangle, Monitor,
    HardDrive, Play, Square, Headphones, Terminal, ArrowUpRight
} from 'lucide-react'

const API_URL = import.meta?.env?.VITE_API_URL || '/api'

export default function LocalAgentPage() {
    const [status, setStatus] = useState(null)
    const [audioStatus, setAudioStatus] = useState(null)
    const [sbConnected, setSbConnected] = useState(false)
    const [testingPublic, setTestingPublic] = useState(false)
    const [testingPrivate, setTestingPrivate] = useState(false)
    const [pingLatency, setPingLatency] = useState(null)
    const [checkingPing, setCheckingPing] = useState(false)

    const fetchLocalStatus = async () => {
        try {
            const [stRes, audioRes] = await Promise.all([
                axios.get(`${API_URL}/status`),
                axios.get(`${API_URL}/audio/status`).catch(() => ({ data: null }))
            ])
            setStatus(stRes.data)
            setAudioStatus(audioRes.data)
            setSbConnected(stRes.data?.streamer_bot_connected || false)
        } catch (e) {
            console.error("Local status fetch failed:", e)
        }
    }

    useEffect(() => {
        fetchLocalStatus()
        const interval = setInterval(fetchLocalStatus, 5000)
        return () => clearInterval(interval)
    }, [])

    const handleTestPublicAudio = async () => {
        setTestingPublic(true)
        try {
            await axios.post(`${API_URL}/audio/test`, { channel: 'public', text: 'Raspberry Pi Public Audio Engine test successful.' })
        } catch (e) {
            alert("Audio test failed: " + e.message)
        } finally {
            setTestingPublic(false)
        }
    }

    const handleTestPrivateAudio = async () => {
        setTestingPrivate(true)
        try {
            await axios.post(`${API_URL}/audio/test`, { channel: 'private', text: 'Raspberry Pi Private Earphone channel operational.' })
        } catch (e) {
            alert("Private audio test failed: " + e.message)
        } finally {
            setTestingPrivate(false)
        }
    }

    const handleCheckPing = async () => {
        setCheckingPing(true)
        const start = performance.now()
        try {
            await axios.get(`${API_URL}/status`)
            const latency = Math.round(performance.now() - start)
            setPingLatency(latency)
        } catch (e) {
            setPingLatency("Failed")
        } finally {
            setCheckingPing(false)
        }
    }

    const handleReconnectSb = async () => {
        try {
            await axios.post(`${API_URL}/streamerbot/reconnect`)
            alert("Streamer.bot reconnect signal sent.")
            fetchLocalStatus()
        } catch (e) {
            alert("Reconnect error: " + e.message)
        }
    }

    return (
        <div className="space-y-6 pb-10">
            {/* Local Services Status Bar */}
            <PageStatusBar services={['bot', 'streamerBot', 'tts']} />

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 shadow-lg shadow-emerald-500/20 ring-1 ring-white/10">
                        <Cpu className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-zinc-100 tracking-tight">Raspberry Pi Local Execution Hub</h2>
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 rounded-full">
                                Hardware Engine
                            </span>
                        </div>
                        <p className="text-xs text-zinc-400">Streamer.bot bridge, Public & Private Audio playback, and local hardware execution</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-3 py-1.5 rounded-full">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        LOCAL NODE ACTIVE
                    </span>
                </div>
            </div>

            {/* Architecture Role Banner */}
            <div className="p-3.5 rounded-xl bg-violet-950/20 border border-violet-800/40 text-violet-200 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <Activity className="h-4 w-4 text-violet-400 shrink-0" />
                    <span>
                        <strong>Cloud Brain Architecture:</strong> The central AI Brain (Piya), chat moderation, points economy, and Pokémon games run securely on the Cloud Bot. This Raspberry Pi remains lightweight for local hardware, audio playback, and Streamer.bot events.
                    </span>
                </div>
            </div>

            {/* Core Local Responsibilities Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Local Dashboard & Hardware Health */}
                <Card className="bg-zinc-900 border-zinc-800 shadow-md">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                            <Server className="h-4 w-4 text-emerald-400" /> 1. Local Hardware & Health
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                                <span className="text-[10px] uppercase text-zinc-500 font-semibold block">CPU Load</span>
                                <span className="text-sm font-bold text-zinc-200">{status?.cpu_percent ?? 0}%</span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                                <span className="text-[10px] uppercase text-zinc-500 font-semibold block">RAM Used</span>
                                <span className="text-sm font-bold text-zinc-200">{status?.memory_percent ?? 0}%</span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                                <span className="text-[10px] uppercase text-zinc-500 font-semibold block">Uptime</span>
                                <span className="text-sm font-bold text-emerald-400">
                                    {status?.uptime ? `${Math.floor(status.uptime / 60)}m` : '—'}
                                </span>
                            </div>
                        </div>

                        <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs space-y-1.5">
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Service Mode:</span>
                                <span className="text-zinc-200 font-mono">Local Pi Client</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Cloud WS Connection:</span>
                                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Connected (/ws/pi-client)
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Process ID:</span>
                                <span className="text-zinc-300 font-mono">{status?.pid || '—'}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Streamer.bot Connection */}
                <Card className="bg-zinc-900 border-zinc-800 shadow-md">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                            <Radio className="h-4 w-4 text-indigo-400" /> 2. Streamer.bot Connection
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                        <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-zinc-200">WebSocket Status</p>
                                <p className="text-[10px] text-zinc-500">Bridge for YouTube chat events and OBS actions</p>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                sbConnected
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                    : 'bg-red-950 text-red-400 border border-red-800'
                            }`}>
                                {sbConnected ? 'CONNECTED' : 'DISCONNECTED'}
                            </span>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                onClick={handleReconnectSb}
                                size="sm"
                                variant="outline"
                                className="w-full text-xs border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 h-9"
                            >
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reconnect Streamer.bot
                            </Button>
                        </div>

                        <p className="text-[10px] text-zinc-500">
                            Cloud Bot routes chat messages and OBS trigger commands through this local WebSocket connection without requiring direct local API keys.
                        </p>
                    </CardContent>
                </Card>

                {/* 3. Audio Engine (Public & Private Channels) */}
                <Card className="bg-zinc-900 border-zinc-800 shadow-md">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                            <Volume2 className="h-4 w-4 text-violet-400" /> 3. Local Audio Engine
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                        <p className="text-xs text-zinc-400">
                            Executes Cloud-generated TTS audio events through local Raspberry Pi sound hardware:
                        </p>

                        <div className="grid grid-cols-2 gap-2.5">
                            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                                    <Volume2 className="h-4 w-4 text-violet-400" /> Public Channel
                                </div>
                                <p className="text-[10px] text-zinc-500">Stream speakers & virtual cable</p>
                                <Button
                                    onClick={handleTestPublicAudio}
                                    disabled={testingPublic}
                                    size="sm"
                                    className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs h-8"
                                >
                                    {testingPublic ? "Playing..." : "Test Public Audio"}
                                </Button>
                            </div>

                            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                                    <Headphones className="h-4 w-4 text-sky-400" /> Private Channel
                                </div>
                                <p className="text-[10px] text-zinc-500">Streamer private earphone alerts</p>
                                <Button
                                    onClick={handleTestPrivateAudio}
                                    disabled={testingPrivate}
                                    size="sm"
                                    className="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs h-8"
                                >
                                    {testingPrivate ? "Playing..." : "Test Private Audio"}
                                </Button>
                            </div>
                        </div>

                        <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-mono">
                            Status: {audioStatus?.is_busy ? "Playing Audio" : "Idle (Ready for Cloud Events)"}
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Local Diagnostics & Testing */}
                <Card className="bg-zinc-900 border-zinc-800 shadow-md">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                            <Terminal className="h-4 w-4 text-amber-400" /> 4. Local Diagnostics & Settings
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                        <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-zinc-200">Local Response Latency</p>
                                <p className="text-[10px] text-zinc-500">Round-trip time on local node</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {pingLatency !== null && (
                                    <span className="text-xs font-bold text-emerald-400 font-mono">{pingLatency} ms</span>
                                )}
                                <Button
                                    onClick={handleCheckPing}
                                    disabled={checkingPing}
                                    size="sm"
                                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs h-8"
                                >
                                    {checkingPing ? "Testing..." : "Ping"}
                                </Button>
                            </div>
                        </div>

                        <p className="text-[10px] text-zinc-500">
                            Local diagnostic controls are preserved for Raspberry Pi performance monitoring and audio device troubleshooting.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
