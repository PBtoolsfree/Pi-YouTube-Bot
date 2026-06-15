import React, { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import '../index.css'

export default function GoalOverlay() {
    const [goal, setGoal] = useState(null)
    const [prevCurrent, setPrevCurrent] = useState(0)
    const wsRef = useRef(null)

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search)
        const id = urlParams.get('id')
        if (!id) return

        const fetchInit = async () => {
            try {
                const API_URL = import.meta.env.VITE_API_URL || '/api'
                const res = await fetch(`${API_URL}/goals`)
                const data = await res.json()
                const found = data.active_goals?.find(g => g.id === id)
                if (found) {
                    setGoal(found)
                    setPrevCurrent(found.current)
                }
            } catch (e) { }
        }
        fetchInit()

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`)

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                if (data.type === 'goal_update' && data.goal?.id === id) {
                    setPrevCurrent(prev => prev)
                    setGoal(data.goal)
                } else if (data.type === 'goal_achieved' && data.goal?.id === id) {
                    setGoal(data.goal)
                } else if (data.type === 'goal_ended' && data.goal?.id === id) {
                    setGoal(data.goal)
                }
            } catch (e) { }
        }
        ws.onclose = () => setTimeout(() => {
            // Reconnect
        }, 3000)
        wsRef.current = ws
        return () => ws.close()
    }, [])

    if (!goal) return null

    const isNoStream = goal.type === 'likes' && goal.current === -1
    const safeCurrent = Math.max(0, goal.current)
    const percent = Math.min(100, Math.max(0, (safeCurrent / goal.target) * 100))
    const isNearComplete = percent >= 90
    const isComplete = percent >= 100 && !isNoStream
    const layout = goal.layout || 'classic'
    const accentColor = goal.color || 'var(--gamer-cyan)'

    const renderLayout = () => {
        switch (layout) {
            case 'youtube':
                return (
                    <div className="w-[600px] font-sans antialiased fixed top-4 left-4">
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            className="relative p-[2px] rounded-2xl overflow-hidden"
                            style={{ boxShadow: `0 0 30px rgba(255, 0, 0, 0.2)` }}
                        >
                            {/* Spinning border */}
                            <div className="gamer-spin-border"
                                style={{ background: 'conic-gradient(from 0deg, transparent 0%, #ff0000 35%, #ff4444 45%, #ff0000 55%, transparent 100%)' }} />

                            <div className="relative z-10 flex items-center gap-5 p-5 rounded-2xl"
                                style={{ background: 'rgba(10, 10, 20, 0.92)', backdropFilter: 'blur(20px)' }}>
                                <div className="hud-corner hud-corner-tl" style={{ borderColor: '#ff0000' }} />
                                <div className="hud-corner hud-corner-tr" style={{ borderColor: '#ff0000' }} />
                                <div className="hud-corner hud-corner-bl" style={{ borderColor: '#ff0000' }} />
                                <div className="hud-corner hud-corner-br" style={{ borderColor: '#ff0000' }} />

                                <div className="flex-1">
                                    <h2 className="text-xl font-black tracking-tight text-white uppercase"
                                        style={{ textShadow: '0 0 10px rgba(255, 0, 0, 0.3)' }}>
                                        {goal.name}
                                    </h2>
                                    <ProgressBar percent={percent} color="#ff0000" isNearComplete={isNearComplete} isComplete={isComplete} />
                                </div>

                                <CountDisplay current={goal.current} target={goal.target} color="#ff0000" />
                            </div>
                        </motion.div>
                    </div>
                )

            case 'modern':
                return (
                    <div className="w-[600px] font-sans antialiased fixed top-4 left-4">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="relative overflow-hidden rounded-xl"
                            style={{
                                background: 'rgba(10, 10, 20, 0.85)',
                                backdropFilter: 'blur(20px)',
                                border: `1px solid ${accentColor}33`,
                                boxShadow: `0 0 30px ${accentColor}20`,
                            }}
                        >
                            {/* Left accent bar */}
                            <div className="absolute top-0 left-0 w-1 h-full"
                                style={{
                                    background: accentColor,
                                    boxShadow: `0 0 12px ${accentColor}`,
                                }} />

                            <div className="p-5 pl-6">
                                <div className="flex justify-between items-center mb-3">
                                    <h2 className="text-lg font-bold tracking-[0.15em] uppercase"
                                        style={{
                                            color: 'rgba(255,255,255,0.9)',
                                            animation: 'glitchFlicker 10s ease-in-out infinite',
                                        }}>
                                        {goal.name}
                                    </h2>
                                    <CountDisplay current={goal.current} target={goal.target} color={accentColor} compact />
                                </div>
                                <ProgressBar percent={percent} color={accentColor} isNearComplete={isNearComplete} isComplete={isComplete} />
                            </div>
                        </motion.div>
                    </div>
                )

            case 'minimal':
                return (
                    <div className="w-[400px] font-sans antialiased fixed top-4 left-4 drop-shadow-xl">
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <div className="flex justify-between items-baseline mb-2 px-1">
                                <h2 className="text-base font-bold text-white uppercase tracking-wide"
                                    style={{ textShadow: `0 0 10px ${accentColor}40` }}>
                                    {goal.name}
                                </h2>
                                <CountDisplay current={goal.current} target={goal.target} color={accentColor} minimalist />
                            </div>
                            <ProgressBar percent={percent} color={accentColor} isNearComplete={isNearComplete} isComplete={isComplete} slim />
                        </motion.div>
                    </div>
                )

            case 'classic':
            default:
                return (
                    <div className="w-[620px] font-sans antialiased fixed top-4 left-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, filter: 'blur(8px)' }}
                            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                            className="relative p-[2px] rounded-2xl overflow-hidden"
                            style={{ boxShadow: `0 0 40px ${accentColor}25` }}
                        >
                            {/* Spinning border */}
                            <div className="gamer-spin-border"
                                style={{
                                    background: `conic-gradient(from 0deg, transparent 0%, ${accentColor} 30%, white 42%, ${accentColor} 55%, transparent 70%, ${accentColor}88 88%, transparent 100%)`,
                                }} />

                            <div className="relative z-10 p-6 rounded-2xl"
                                style={{ background: 'rgba(10, 10, 20, 0.92)', backdropFilter: 'blur(20px)' }}>
                                {/* HUD Corners */}
                                <div className="hud-corner hud-corner-tl" style={{ borderColor: accentColor }} />
                                <div className="hud-corner hud-corner-tr" style={{ borderColor: accentColor }} />
                                <div className="hud-corner hud-corner-bl" style={{ borderColor: accentColor }} />
                                <div className="hud-corner hud-corner-br" style={{ borderColor: accentColor }} />

                                <div className="flex justify-between items-end mb-4">
                                    <h2 className="text-2xl font-black tracking-tight uppercase"
                                        style={{
                                            color: goal.text_color || 'white',
                                            textShadow: `0 0 15px ${accentColor}60`,
                                        }}>
                                        {goal.name}
                                    </h2>
                                    <CountDisplay current={goal.current} target={goal.target} color={accentColor} />
                                </div>

                                <ProgressBar percent={percent} color={accentColor} isNearComplete={isNearComplete} isComplete={isComplete} />

                                {/* Milestone markers */}
                                <div className="relative w-full mt-1 h-3">
                                    {[25, 50, 75].map(milestone => (
                                        <div key={milestone}
                                            className="absolute top-0 flex flex-col items-center"
                                            style={{ left: `${milestone}%`, transform: 'translateX(-50%)' }}>
                                            <div className="w-[1px] h-1.5"
                                                style={{
                                                    background: percent >= milestone ? accentColor : 'rgba(255,255,255,0.1)',
                                                    opacity: percent >= milestone ? 0.8 : 0.3,
                                                }} />
                                            <span className="text-[8px] font-mono mt-0.5"
                                                style={{
                                                    color: percent >= milestone ? accentColor : 'rgba(255,255,255,0.2)',
                                                    opacity: percent >= milestone ? 0.8 : 0.4,
                                                }}>
                                                {milestone}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )
        }
    }

    return renderLayout()
}


// ─── SHARED SUB-COMPONENTS ──────────────────────────────────────────────

function ProgressBar({ percent, color, isNearComplete, isComplete, slim }) {
    const height = slim ? 'h-2' : 'h-7'

    return (
        <div className={`w-full ${height} rounded-full overflow-hidden relative`}
            style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
            }}>
            {/* Fill */}
            <motion.div
                className="h-full relative overflow-hidden rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 2, ease: [0.25, 0.46, 0.45, 0.94] }}
                style={{
                    background: `linear-gradient(90deg, ${color}88, ${color})`,
                    boxShadow: `0 0 12px ${color}60, inset 0 1px 0 rgba(255,255,255,0.2)`,
                }}
            >
                {/* Shimmer sweep */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute inset-0 w-[50%] h-full"
                        style={{
                            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                            animation: 'shimmerSlide 2s ease-in-out infinite',
                        }} />
                </div>

                {/* Particle trail at edge */}
                {!slim && (
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
                        style={{
                            background: 'white',
                            boxShadow: `0 0 8px ${color}, 0 0 16px ${color}`,
                            animation: 'breathe 1s ease-in-out infinite',
                        }} />
                )}
            </motion.div>

            {/* Near completion glow */}
            {isNearComplete && !isComplete && (
                <div className="absolute inset-0 rounded-full"
                    style={{
                        boxShadow: `inset 0 0 20px ${color}40`,
                        animation: 'neonPulse 1.5s ease-in-out infinite',
                    }} />
            )}

            {/* Percentage overlay */}
            {!slim && percent > 15 && (
                <div className="absolute inset-0 flex items-center justify-end pr-3">
                    <span className="text-[11px] font-black text-white/90"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                        {Math.round(percent)}%
                    </span>
                </div>
            )}
        </div>
    )
}

function CountDisplay({ current, target, color, compact, minimalist }) {
    const isNoStream = current === -1;

    if (minimalist) {
        if (isNoStream) {
            return <div className="text-sm font-bold text-rose-500 uppercase tracking-widest animate-pulse">Off</div>
        }
        return (
            <div className="text-sm font-bold" style={{ color }}>
                {current} <span style={{ opacity: 0.4 }}>/ {target}</span>
            </div>
        )
    }

    if (compact) {
        return (
            <div className="text-lg font-mono tracking-wide"
                style={{ color: 'rgba(255,255,255,0.8)' }}>
                {isNoStream ? (
                    <span className="font-bold text-rose-500 uppercase tracking-widest text-sm animate-pulse" style={{ textShadow: `0 0 8px rgba(244,63,94,0.6)` }}>
                        Offline
                    </span>
                ) : (
                    <>
                        <span className="font-bold cursor-default" style={{ color, textShadow: `0 0 8px ${color}60` }}>
                            {current}
                        </span>
                        <span style={{ opacity: 0.3 }}> / {target}</span>
                    </>
                )}
            </div>
        )
    }

    return (
        <div className="text-right px-4 py-2 rounded-lg"
            style={{
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255,255,255,0.05)',
            }}>
            {isNoStream ? (
                 <div className="text-[14px] font-black tracking-widest text-white leading-none uppercase mt-2 animate-pulse"
                 style={{ textShadow: `0 0 10px rgba(255, 255, 255, 0.4)` }}>
                 [Offline]
                </div>
            ) : (
                <>
                    <div className="text-2xl font-black text-white leading-none"
                        style={{ textShadow: `0 0 10px ${color}40` }}>
                        {current}
                    </div>
                    <div className="text-xs font-bold mt-0.5"
                        style={{ color, opacity: 0.7 }}>
                        / {target}
                    </div>
                </>
            )}
        </div>
    )
}
