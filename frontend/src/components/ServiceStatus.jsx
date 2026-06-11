/**
 * Shared service status components for use across all dashboard pages.
 * Shows live status dots and service health indicators.
 */
import React from 'react'
import axios from 'axios'
import {
    Brain, Volume2, Youtube, Mail, Link2, Power, Bot,
    Wifi, WifiOff, Activity, CheckCircle2, XCircle
} from 'lucide-react'

const API_URL = import.meta?.env?.VITE_API_URL || '/api'

// ─── Live Status Context ─────────────────────────────────────────────────────
// Fetches /api/status and /api/config, provides to children
export function useServiceStatus() {
    const [botStatus, setBotStatus] = React.useState(null)
    const [aiEnabled, setAiEnabled] = React.useState(true)
    const [ttsEnabled, setTtsEnabled] = React.useState(true)

    React.useEffect(() => {
        const fetch = async () => {
            try {
                const [st, cfg] = await Promise.all([
                    axios.get(`${API_URL}/status`),
                    axios.get(`${API_URL}/config`).catch(() => ({ data: {} }))
                ])
                setBotStatus(st.data)
                setAiEnabled(cfg.data?.ai_topology?.enabled !== false)
                setTtsEnabled(cfg.data?.audio?.enabled !== false)
            } catch (e) { }
        }
        fetch()
        const iv = setInterval(fetch, 5000)
        return () => clearInterval(iv)
    }, [])

    const core = botStatus?.bot_core || {}
    const workers = botStatus?.workers || {}

    return {
        botRunning: core.status === 'running',
        youtube: workers.youtube_monitor?.status === 'running',
        email: workers.email_alerts?.status === 'connected',
        streamerBot: workers.streamerbot?.status === 'connected',
        ai: aiEnabled,
        tts: ttsEnabled,
        system: botStatus?.system || null,
    }
}

// ─── PageStatusBar ───────────────────────────────────────────────────────────
// A compact service status bar for the top of each page.
// `services` = array of service keys to show from: 'bot','ai','tts','youtube','email','streamerBot'
export function PageStatusBar({ services = [], extra = [] }) {
    const status = useServiceStatus()

    const ALL_SERVICES = {
        bot: {
            label: 'Bot Core',
            icon: <Power className="h-3 w-3" />,
            active: status.botRunning,
            color: 'emerald',
        },
        ai: {
            label: 'AI Engine',
            icon: <Brain className="h-3 w-3" />,
            active: status.ai,
            color: 'purple',
        },
        tts: {
            label: 'TTS Audio',
            icon: <Volume2 className="h-3 w-3" />,
            active: status.tts,
            color: 'amber',
        },
        youtube: {
            label: 'YouTube',
            icon: <Youtube className="h-3 w-3" />,
            active: status.youtube,
            color: 'red',
        },
        email: {
            label: 'Email',
            icon: <Mail className="h-3 w-3" />,
            active: status.email,
            color: 'blue',
        },
        streamerBot: {
            label: 'Streamer.bot',
            icon: <Link2 className="h-3 w-3" />,
            active: status.streamerBot,
            color: 'cyan',
        },
    }

    const colorMap = {
        emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
        amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        red: 'text-red-400 bg-red-500/10 border-red-500/20',
        blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    }
    const dotMap = {
        emerald: 'bg-emerald-500',
        purple: 'bg-purple-500',
        amber: 'bg-amber-500',
        red: 'bg-red-500',
        blue: 'bg-blue-500',
        cyan: 'bg-cyan-500',
    }

    const shownServices = services.map(k => ALL_SERVICES[k]).filter(Boolean)

    return (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-zinc-900/60 border border-zinc-800 rounded-xl mb-5">
            {shownServices.map((svc) => {
                const c = colorMap[svc.color] || ''
                const dot = dotMap[svc.color] || 'bg-zinc-500'
                return (
                    <div
                        key={svc.label}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all duration-300 ${svc.active ? c : 'text-zinc-600 bg-zinc-800/40 border-zinc-700/40'}`}
                    >
                        <div className="relative flex h-1.5 w-1.5 shrink-0">
                            {svc.active && (
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dot} opacity-60`} />
                            )}
                            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${svc.active ? dot : 'bg-zinc-600'}`} />
                        </div>
                        {svc.icon}
                        <span>{svc.label}</span>
                        <span className={`text-[9px] font-bold uppercase ${svc.active ? 'text-emerald-400' : 'text-zinc-600'}`}>
                            {svc.active ? 'ON' : 'OFF'}
                        </span>
                    </div>
                )
            })}

            {/* Extra custom badges */}
            {extra.map((item, i) => (
                <div key={i}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${item.active
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        : 'text-zinc-600 bg-zinc-800/40 border-zinc-700/40'}`}>
                    {item.icon}
                    <span>{item.label}</span>
                    <span className={`text-[9px] font-bold uppercase ${item.active ? 'text-emerald-400' : 'text-zinc-600'}`}>
                        {item.active ? item.onLabel || 'ON' : item.offLabel || 'OFF'}
                    </span>
                </div>
            ))}

            {/* Right side: overall system status */}
            <div className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500">
                <Activity className="h-3 w-3" />
                <span className="font-mono text-[10px]">
                    {shownServices.filter(s => s.active).length}/{shownServices.length} active
                </span>
            </div>
        </div>
    )
}

// ─── Dot Badge (inline) ───────────────────────────────────────────────────────
// A tiny inline colored dot with optional label — for use in card headers etc.
export function StatusDot({ active, label, color = 'emerald' }) {
    const dotColors = {
        emerald: 'bg-emerald-500',
        red: 'bg-red-500',
        amber: 'bg-amber-500',
        blue: 'bg-blue-500',
    }
    const c = dotColors[color] || dotColors.emerald
    return (
        <div className="flex items-center gap-1.5">
            <div className="relative flex h-2 w-2">
                {active && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c} opacity-75`} />}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${active ? c : 'bg-zinc-600'}`} />
            </div>
            {label && (
                <span className={`text-[10px] font-bold uppercase ${active ? 'text-emerald-400' : 'text-zinc-600'}`}>
                    {label}
                </span>
            )}
        </div>
    )
}
