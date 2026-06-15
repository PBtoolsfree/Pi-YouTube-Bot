import React, { useState, useEffect, useRef } from 'react'

export default function AppOverlay() {
    const [alerts, setAlerts] = useState([])
    const wsRef = useRef(null)

    useEffect(() => {
        let reconnectTimeout;

        const connect = () => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
            const host = window.location.host
            const wsUrl = `${protocol}//${host}/ws/logs`

            const ws = new WebSocket(wsUrl)
            wsRef.current = ws

            ws.onopen = () => {
                console.log("[AppOverlay] Connected to WebSocket!")
            }

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    // We only care about APP_NOTIFICATION category from the BotService._log_ui
                    if (data.category === 'APP_NOTIFICATION') {
                        triggerAlert(data)
                    }
                } catch (e) {
                    console.error("[AppOverlay] Error parsing WS message:", e)
                }
            }

            ws.onclose = () => {
                console.log("[AppOverlay] Disconnected. Reconnecting in 3s...")
                reconnectTimeout = setTimeout(connect, 3000)
            }

            ws.onerror = (err) => {
                console.error("[AppOverlay] WebSocket error:", err)
            }
        }

        connect()

        return () => {
            clearTimeout(reconnectTimeout)
            if (wsRef.current) {
                wsRef.current.close()
            }
        }
    }, [])

    const triggerAlert = (logData) => {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 5)

        // Log payload usually has structure: user, amount in metadata
        const donorName = logData.author || "Someone"
        const amount = logData.meta?.amount || "0"

        // Check if there is already an alert showing to avoid overlap
        // A simple way is to just push it to state and clear after timeout
        const alertObj = { id, donorName, amount }

        setAlerts(prev => [...prev, alertObj])

        // Add standard ping sound
        try {
            const audio = new Audio('/assets/notification.mp3') // Assume generic notification sound exists, or fail silently
            audio.volume = 0.5;
            audio.play().catch(e => console.log('Audio play blocked or missing file', e))
        } catch (e) { }

        // Remove after 8 seconds
        setTimeout(() => {
            setAlerts(prev => prev.filter(a => a.id !== id))
        }, 8000)
    }

    return (
        <div className="w-screen h-screen overflow-hidden flex flex-col justify-end items-center p-8 pointer-events-none">
            {alerts.map((alert, index) => (
                <div
                    key={alert.id}
                    className="animate-slide-up-fade mb-4 w-full max-w-md relative"
                    style={{ animationDuration: '0.6s' }}
                >
                    {/* Premium Generic App Styling CSS Block */}
                    <div className="bg-zinc-900/90 backdrop-blur-md rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/10 overflow-hidden relative">

                        {/* Top Accent glow */}
                        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-indigo-500/20 to-transparent pointer-events-none"></div>

                        {/* Content Body */}
                        <div className="p-8 pt-10 pb-12 text-center relative z-10">
                            <div className="mx-auto w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mb-6 shadow-[0_0_15px_rgba(99,102,241,0.3)] border border-indigo-500/30">
                                <svg className="w-8 h-8 text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z" />
                                </svg>
                            </div>

                            <h2 className="text-zinc-400 font-medium text-xs tracking-[0.2em] uppercase mb-2">New Payment Received</h2>

                            <div className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 mb-8 truncate px-2 pb-1" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                                {alert.donorName}
                            </div>

                            <div className="inline-flex items-baseline justify-center">
                                <span className="text-3xl font-bold text-zinc-600 mr-2 shrink-0">₹</span>
                                <span className="text-6xl font-black text-white tracking-tighter drop-shadow-md" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                                    {alert.amount}
                                </span>
                            </div>
                        </div>

                        {/* Footer Gradient Edge */}
                        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                    </div>

                    {/* Embedded Animations */}
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        @keyframes slide-up-fade {
                            0% { transform: translateY(100px) scale(0.9); opacity: 0; }
                            50% { transform: translateY(-10px) scale(1.02); opacity: 1; }
                            100% { transform: translateY(0) scale(1); opacity: 1; }
                        }
                        .animate-slide-up-fade {
                            animation: slide-up-fade ease-out forwards;
                        }
                    `}} />
                </div>
            ))}
        </div>
    )
}
