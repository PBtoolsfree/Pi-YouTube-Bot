import React, { useState, useEffect, useRef } from 'react'

const ALERT_DURATION = 6000

export default function AlertOverlay() {
    const [alert, setAlert] = useState(null)
    const [visible, setVisible] = useState(false)
    const ws = useRef(null)
    const timerRef = useRef(null)

    useEffect(() => {
        document.documentElement.style.background = 'transparent'
        document.body.style.background = 'transparent'
        document.body.style.backgroundColor = 'transparent'
        return () => {
            document.documentElement.style.background = ''
            document.body.style.background = ''
            document.body.style.backgroundColor = ''
        }
    }, [])

    useEffect(() => {
        const connect = () => {
            const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
            const uri = `${proto}://${window.location.host}/ws/logs`
            ws.current = new WebSocket(uri)

            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    const validCategories = ['alert', 'ALERT', 'RANK_UP', 'LOYALTY', 'DONATION', 'SE_EVENT']
                    if (validCategories.includes(data.category) || data.type === 'alert') {
                        let emoji = '🔥'
                        let title = 'New Alert'
                        let color = '#00f0ff'
                        let particles = '✦'

                        if (data.category === 'DONATION') {
                            emoji = '💰'; title = 'DONATION'; color = '#00ff88'; particles = '💎'
                        } else if (data.category === 'RANK_UP') {
                            emoji = '⭐'; title = 'RANK UP'; color = '#ffd700'; particles = '⭐'
                        } else if (data.category === 'LOYALTY') {
                            emoji = '🏆'; title = 'LOYALTY'; color = '#c084fc'; particles = '🏆'
                        } else if (data.category === 'SE_EVENT') {
                            emoji = '🎯'; title = 'STREAM EVENT'; color = '#00f0ff'; particles = '⚡'
                        } else if (data.category === 'ALERT' || data.category === 'alert') {
                            emoji = '🎉'; title = 'ALERT'; color = '#ff00aa'; particles = '🎉'
                        }

                        if (timerRef.current) clearTimeout(timerRef.current)

                        setAlert({
                            id: Date.now(),
                            title, message: data.message || `${data.author || 'Someone'} triggered an alert`,
                            emoji, color, particles, author: data.author,
                        })
                        setVisible(true)

                        timerRef.current = setTimeout(() => {
                            setVisible(false)
                            setTimeout(() => setAlert(null), 600)
                        }, ALERT_DURATION)
                    }
                } catch (e) { }
            }

            ws.current.onclose = () => setTimeout(connect, 3000)
            ws.current.onerror = () => ws.current?.close()
        }
        connect()
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            ws.current?.close()
        }
    }, [])

    return (
        <>
            <style>{`
                @keyframes alertEnter {
                    0% { opacity: 0; transform: scale(0.3) rotate(-5deg); filter: blur(10px) brightness(3); }
                    50% { opacity: 1; transform: scale(1.04) rotate(1deg); filter: blur(0px) brightness(1.2); }
                    100% { opacity: 1; transform: scale(1) rotate(0deg); filter: blur(0px) brightness(1); }
                }
                @keyframes alertExit {
                    0% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0px); }
                    100% { opacity: 0; transform: scale(0.8) translateY(-30px); filter: blur(8px); }
                }
                @keyframes emojiPop {
                    0% { transform: scale(0) rotate(-20deg); }
                    50% { transform: scale(1.3) rotate(5deg); }
                    70% { transform: scale(0.95) rotate(-2deg); }
                    100% { transform: scale(1) rotate(0deg); }
                }
                @keyframes borderSpin {
                    from { transform: translate(-50%, -50%) rotate(0deg); }
                    to { transform: translate(-50%, -50%) rotate(360deg); }
                }
                @keyframes shimmerAlert {
                    0% { background-position: -200% center; }
                    100% { background-position: 200% center; }
                }
                @keyframes edgeFlashAnim {
                    0% { opacity: 0; }
                    15% { opacity: 0.4; }
                    100% { opacity: 0; }
                }
                @keyframes particleFly {
                    0% { opacity: 1; transform: translate(0, 0) scale(1); }
                    100% { opacity: 0; transform: translate(var(--px), var(--py)) scale(0.3); }
                }
                .alert-enter { animation: alertEnter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
                .alert-exit  { animation: alertExit 0.5s ease-in forwards; }
                .emoji-pop   { animation: emojiPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both; }
                .shimmer-text {
                    background: linear-gradient(90deg, #fff 0%, #fff 40%, #ffffffaa 50%, #fff 60%, #fff 100%);
                    background-size: 200% 100%;
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    animation: shimmerAlert 3s linear infinite;
                }
            `}</style>

            <div style={{
                height: '100vh', width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '48px', background: 'transparent', overflow: 'hidden',
            }}>
                {alert && (
                    <>
                        {/* Screen edge flash */}
                        {visible && (
                            <div style={{
                                position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
                                border: `3px solid ${alert.color}`,
                                borderRadius: '0',
                                animation: 'edgeFlashAnim 1s ease-out forwards',
                                boxShadow: `inset 0 0 100px ${alert.color}30`,
                            }} />
                        )}

                        <div
                            className={visible ? 'alert-enter' : 'alert-exit'}
                            style={{ position: 'relative', zIndex: 1 }}
                        >
                            {/* Outer glow */}
                            <div style={{
                                position: 'absolute', inset: '-24px',
                                background: alert.color, borderRadius: '32px',
                                filter: 'blur(50px)', opacity: 0.25,
                                animation: 'breathe 2s ease-in-out infinite',
                            }} />

                            {/* Spinning border container */}
                            <div style={{
                                position: 'relative', padding: '2px',
                                borderRadius: '20px', overflow: 'hidden',
                            }}>
                                {/* Spinning conic border */}
                                <div style={{
                                    position: 'absolute', top: '50%', left: '50%',
                                    width: '800px', height: '800px',
                                    background: `conic-gradient(from 0deg, transparent 0%, ${alert.color} 25%, white 35%, ${alert.color} 45%, transparent 60%, ${alert.color}88 80%, transparent 100%)`,
                                    animation: 'borderSpin 3s linear infinite',
                                    transform: 'translate(-50%, -50%)',
                                }} />

                                {/* Card */}
                                <div style={{
                                    position: 'relative', zIndex: 1,
                                    background: 'rgba(10, 10, 20, 0.92)',
                                    backdropFilter: 'blur(24px)',
                                    padding: '36px 52px',
                                    borderRadius: '18px',
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', textAlign: 'center',
                                    gap: '14px', minWidth: '420px', maxWidth: '600px',
                                }}>
                                    {/* HUD corners */}
                                    <div style={{ position: 'absolute', top: 8, left: 8, width: 16, height: 16, borderTop: `2px solid ${alert.color}`, borderLeft: `2px solid ${alert.color}`, opacity: 0.5 }} />
                                    <div style={{ position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderTop: `2px solid ${alert.color}`, borderRight: `2px solid ${alert.color}`, opacity: 0.5 }} />
                                    <div style={{ position: 'absolute', bottom: 8, left: 8, width: 16, height: 16, borderBottom: `2px solid ${alert.color}`, borderLeft: `2px solid ${alert.color}`, opacity: 0.5 }} />
                                    <div style={{ position: 'absolute', bottom: 8, right: 8, width: 16, height: 16, borderBottom: `2px solid ${alert.color}`, borderRight: `2px solid ${alert.color}`, opacity: 0.5 }} />

                                    <div className="emoji-pop" style={{ fontSize: '56px' }}>
                                        {alert.emoji}
                                    </div>


                                    <div style={{
                                        color: alert.color,
                                        fontWeight: 900, textTransform: 'uppercase',
                                        letterSpacing: '0.25em', fontSize: '11px',
                                        fontFamily: 'Inter, system-ui, sans-serif',
                                        textShadow: `0 0 10px ${alert.color}`,
                                    }}>
                                        {alert.title}
                                    </div>

                                    <div className="shimmer-text" style={{
                                        fontSize: '22px', fontWeight: 900,
                                        fontFamily: 'Inter, system-ui, sans-serif',
                                        lineHeight: 1.3, maxWidth: '480px', wordBreak: 'break-word',
                                    }}>
                                        {alert.message}
                                    </div>

                                    {/* Decorative line */}
                                    <div style={{
                                        width: '60%', height: '1px', marginTop: '4px',
                                        background: `linear-gradient(90deg, transparent, ${alert.color}60, transparent)`,
                                    }} />
                                </div>
                            </div>

                            {/* Flying particles */}
                            {visible && [...Array(8)].map((_, i) => {
                                const angle = (i / 8) * Math.PI * 2
                                const dist = 80 + Math.random() * 40
                                return (
                                    <div key={i} style={{
                                        position: 'absolute',
                                        top: '50%', left: '50%',
                                        fontSize: '16px',
                                        '--px': `${Math.cos(angle) * dist}px`,
                                        '--py': `${Math.sin(angle) * dist}px`,
                                        animation: `particleFly ${1 + Math.random() * 0.5}s ease-out ${i * 0.05}s forwards`,
                                        pointerEvents: 'none',
                                    }}>
                                        {alert.particles}
                                    </div>
                                )
                            })}
                        </div>
                    </>
                )}
            </div>
        </>
    )
}
