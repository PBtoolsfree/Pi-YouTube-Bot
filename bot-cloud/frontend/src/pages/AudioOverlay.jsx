import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Activity } from 'lucide-react'

function safeFixed(value, digits = 1, fallback = "0") {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : fallback;
}

export default function AudioOverlay() {
    const [status, setStatus] = useState(null)
    const [isVisible, setIsVisible] = useState(false)
    const [alert, setAlert] = useState(null)

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await axios.get('/api/audio/status')
                setStatus(res.data)
                if (res.data.is_playing) setIsVisible(true)
                else {
                    setTimeout(() => {
                        if (!res.data.is_playing) setIsVisible(false)
                    }, 2000)
                }
            } catch (e) {
                console.error("Overlay sync error", e)
            }
        }, 1000)

        // Listen for Real-time alerts
        const ws = new WebSocket(`ws://${window.location.host}/ws/logs`)
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (data.type === 'alert' && data.category === 'rank_up') {
                setAlert(data)
                setTimeout(() => setAlert(null), 8000)
            }
        }

        return () => {
            clearInterval(interval)
            ws.close()
        }
    }, [])

    if (!status) return null

    return (
        <div className="h-screen w-screen flex flex-col items-center justify-end p-12 overflow-hidden bg-transparent select-none">
            {/* Rank Up Alert Banner (Top) */}
            {alert && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 w-full max-w-xl animate-in fade-in slide-in-from-top-8 duration-700">
                    <div className="bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 p-[2px] rounded-xl shadow-[0_0_40px_rgba(251,191,36,0.5)]">
                        <div className="bg-black/90 rounded-xl p-6 flex items-center justify-between overflow-hidden relative">
                            {/* Animated Background Glow */}
                            <div className="absolute inset-0 bg-amber-500/10 animate-pulse" />

                            <div className="relative flex items-center gap-4">
                                <div className="text-5xl animate-bounce">{alert.emoji}</div>
                                <div>
                                    <h3 className="text-amber-500 font-black text-xl uppercase tracking-tighter">New Rank Attained!</h3>
                                    <p className="text-white text-3xl font-bold">{alert.author}</p>
                                </div>
                            </div>

                            <div className="relative text-right">
                                <div className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Level Up</div>
                                <div className="text-amber-400 text-4xl font-black italic">{alert.rank}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Now Playing Card */}
            <div className={`
                bg-black/80 border-l-4 border-primary p-6 rounded-r-xl shadow-2xl transition-all duration-700 max-w-2xl w-full
                ${isVisible ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}
            `}>
                <div className="flex items-center gap-4 mb-3">
                    <div className="p-2 bg-primary/20 rounded-lg">
                        <Activity className={`h-6 w-6 text-primary ${status.is_playing ? 'animate-pulse' : ''}`} />
                    </div>
                    <div>
                        <h2 className="text-white font-bold text-lg uppercase tracking-widest flex items-center gap-2">
                            AI Voice Activity
                            <span className="text-[10px] bg-red-500 px-1.5 py-0.5 rounded text-white animate-pulse">LIVE</span>
                        </h2>
                        <p className="text-muted-foreground text-xs font-mono">Channel: Public (1234)</p>
                    </div>
                </div>

                <div className="relative">
                    <p className="text-zinc-100 text-2xl font-medium leading-relaxed italic">
                        "{typeof status.current_text === 'object' ? status.current_text.text : (status.current_text || '...')}"
                    </p>
                    {/* Progress indicator */}
                    <div className="absolute -bottom-4 left-0 h-1 bg-primary/30 w-full rounded-full overflow-hidden">
                        <div
                            className={`h-full bg-primary transition-all duration-300 ${status.is_playing ? 'w-full' : 'w-0'}`}
                            style={{ transitionDuration: status.is_playing ? '5s' : '0.5s' }}
                        />
                    </div>
                </div>
            </div>

            {/* Minor Stats (Optional, very subtle) */}
            <div className={`
                mt-4 flex gap-6 text-[10px] font-mono text-white/30 transition-opacity duration-1000
                ${isVisible ? 'opacity-100' : 'opacity-0'}
            `}>
                <div>LATENCY: {safeFixed(status?.metrics?.avg_latency, 2)}s</div>
                <div>DROPPED: {status.metrics.dropped_count}</div>
                <div>UPTIME: {new Date().toLocaleTimeString()}</div>
            </div>
        </div>
    )
}
