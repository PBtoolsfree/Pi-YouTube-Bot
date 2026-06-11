import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'

const RANK_CONFIG = {
    1: {
        color: '#ffd700', bg: 'rgba(255, 215, 0, 0.06)', border: 'rgba(255, 215, 0, 0.4)',
        icon: '👑', glow: 'rgba(255, 215, 0, 0.3)',
        gradient: 'conic-gradient(from 0deg, transparent 0%, #ffd700 30%, #fff 42%, #ffd700 55%, transparent 70%, #ff8800 88%, transparent 100%)',
    },
    2: {
        color: '#00f0ff', bg: 'rgba(0, 240, 255, 0.06)', border: 'rgba(0, 240, 255, 0.4)',
        icon: '🥈', glow: 'rgba(0, 240, 255, 0.25)',
        gradient: 'conic-gradient(from 0deg, transparent 0%, #00f0ff 35%, white 45%, #00f0ff 55%, transparent 100%)',
    },
    3: {
        color: '#c084fc', bg: 'rgba(192, 132, 252, 0.06)', border: 'rgba(192, 132, 252, 0.4)',
        icon: '🥉', glow: 'rgba(192, 132, 252, 0.2)',
        gradient: 'conic-gradient(from 0deg, transparent 0%, #c084fc 35%, #e0b0ff 45%, #c084fc 55%, transparent 100%)',
    },
}

export default function TopViewersOverlay({ isRotating = false }) {
    const [viewers, setViewers] = useState([])
    const wsRef = useRef(null)

    const env = import.meta.env || {}
    const API_URL = env.VITE_API_URL || "/api"

    const fetchViewers = async () => {
        try {
            const res = await axios.get(`${API_URL}/loyalty/leaderboard`)
            const top3 = (res.data || []).slice(0, 3)
            setViewers(top3.map((v, i) => ({ ...v, rank: i + 1 })))
        } catch (e) { }
    }

    useEffect(() => {
        fetchViewers()
        const interval = setInterval(fetchViewers, 5000)

        const connect = () => {
            const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
            const ws = new WebSocket(`${proto}://${window.location.host}/ws/logs`)
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    if (data.type === 'log' && ['LOYALTY', 'RANK_UP'].includes(data.category)) {
                        fetchViewers()
                    }
                } catch (e) { }
            }
            ws.onclose = () => setTimeout(connect, 3000)
            wsRef.current = ws
        }
        connect()

        return () => {
            clearInterval(interval)
            wsRef.current?.close()
        }
    }, [])

    return (
        <div className={`w-screen h-screen bg-transparent overflow-hidden font-sans p-8 flex flex-col gap-3 ${isRotating ? 'items-center justify-center' : 'items-start'}`}>
            {/* Header badge */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full mb-1"
                style={{
                    background: 'rgba(0, 240, 255, 0.06)',
                    border: '1px solid rgba(0, 240, 255, 0.2)',
                    boxShadow: '0 0 20px rgba(0, 240, 255, 0.1)',
                }}
            >
                <span className="text-sm">🏆</span>
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase"
                    style={{ color: 'var(--gamer-cyan)', textShadow: '0 0 8px rgba(0, 240, 255, 0.5)' }}>
                    Leaderboard
                </span>
            </motion.div>

            <AnimatePresence mode="popLayout">
                {viewers.map((v) => (
                    <TopViewerCard key={v.name || v.id} viewer={v} />
                ))}
            </AnimatePresence>
        </div>
    )
}

function TopViewerCard({ viewer }) {
    const config = RANK_CONFIG[viewer.rank] || RANK_CONFIG[3]

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -60, scale: 0.9 }}
            animate={{
                opacity: 1,
                x: 0,
                scale: 1,
            }}
            exit={{ opacity: 0, scale: 0.85, x: -40 }}
            transition={{
                opacity: { duration: 0.4 },
                x: { type: 'spring', stiffness: 350, damping: 28 },
            }}
            className="relative p-[2px] rounded-xl overflow-hidden w-[450px] md:w-[500px] will-change-transform"
            style={{ boxShadow: `0 0 30px ${config.glow}` }}
        >
            {/* Spinning border */}
            <div className="gamer-spin-border"
                style={{ background: config.gradient }} />

            {/* Inner content */}
            <div className="relative flex items-center gap-4 px-6 py-4 rounded-[10px] w-full h-full z-10"
                style={{
                    background: config.bg,
                    backgroundColor: 'rgba(10, 10, 15, 0.98)'
                }}>
                {/* HUD corners */}
                <div className="hud-corner hud-corner-tl" style={{ borderColor: config.color, width: 12, height: 12 }} />
                <div className="hud-corner hud-corner-br" style={{ borderColor: config.color, width: 12, height: 12 }} />

                {/* Rank icon */}
                <div className="flex flex-col justify-center items-center w-12 relative">
                    {viewer.rank === 1 && (
                        <>
                            <span className="text-[8px] font-bold uppercase tracking-[0.15em] leading-none mb-1"
                                style={{ color: config.color, textShadow: `0 0 8px ${config.glow}` }}>
                                TOP
                            </span>
                            <div className="absolute -inset-2 rounded-full"
                                style={{
                                    background: 'radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%)'
                                }} />
                        </>
                    )}
                    <div className="text-3xl filter drop-shadow-lg leading-none relative">
                        {config.icon}
                    </div>
                </div>

                {/* Viewer info */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="text-lg font-bold tracking-wide uppercase truncate"
                        style={{
                            color: config.color,
                            textShadow: `0 0 10px ${config.glow}`,
                        }}>
                        {viewer.name}
                    </div>

                    {/* Points */}
                    <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-white/90 font-black text-xl tracking-wide leading-none"
                            style={{ textShadow: `0 0 10px ${config.glow}` }}>
                            {(viewer.points || 0).toLocaleString()}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.15em]"
                            style={{ color: config.color, opacity: 0.6 }}>
                            pts
                        </span>
                    </div>

                    {/* Points Progress bar */}
                    <div className="w-full h-1 mt-2 rounded-full overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <motion.div
                            className="h-full rounded-full relative"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, ((viewer.points || 0) % 1000) / 10)}%` }}
                            transition={{ duration: 1.5, ease: 'easeOut' }}
                            style={{
                                background: `linear-gradient(90deg, ${config.color}, ${config.color}aa)`,
                                boxShadow: `0 0 6px ${config.glow}`,
                            }}
                        />
                    </div>
                </div>

                {/* Rank badge */}
                <div className="text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 rounded-full"
                    style={{
                        color: config.color,
                        border: `1px solid ${config.border}`,
                        background: config.bg,
                        opacity: 0.7,
                    }}>
                    #{viewer.rank}
                </div>
            </div>
        </motion.div>
    )
}
