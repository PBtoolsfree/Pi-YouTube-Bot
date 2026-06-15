import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import CountUp from 'react-countup'

export default function HubOverlay() {
    const [subCount, setSubCount] = useState(0)
    const [prevSubCount, setPrevSubCount] = useState(0)
    const [channelName, setChannelName] = useState("YOUTUBE CHANNEL")
    const [channelLogo, setChannelLogo] = useState(null)
    const [lastDiff, setLastDiff] = useState(0)
    const wsRef = useRef(null)

    const [transactions, setTransactions] = useState([])

    const env = import.meta.env || {}
    const API_URL = env.VITE_API_URL || "/api"

    useEffect(() => {
        const fetchData = async () => {
            try {
                const configRes = await axios.get(`${API_URL}/config`)
                if (configRes.data.youtube?.channel_name) setChannelName(configRes.data.youtube.channel_name)
                if (configRes.data.youtube?.logo_url) setChannelLogo(configRes.data.youtube.logo_url)

                const subRes = await axios.get(`${API_URL}/subscriber`)
                setSubCount(subRes.data.count || 0)
                setPrevSubCount(subRes.data.count || 0)
            } catch (e) { }
        }
        fetchData()
        fetchTransactions()
        const txInterval = setInterval(fetchTransactions, 5000)
        connectWebSocket()
        return () => {
            clearInterval(txInterval)
            if (wsRef.current) wsRef.current.close()
        }
    }, [])

    const fetchTransactions = async () => {
        try {
            const res = await axios.get(`${API_URL}/donations?limit=3`)
            let data = res.data || []
            const sorted = [...data].sort((a, b) => b.amount - a.amount)
            setTransactions(sorted.map((item, index) => ({ ...item, rank: index + 1 })))
        } catch (e) { }
    }

    const connectWebSocket = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        let host = window.location.host
        if (API_URL.startsWith('http')) {
            try { host = new URL(API_URL).host } catch (e) { }
        }

        const ws = new WebSocket(`${protocol}//${host}/ws/overlay`)
        ws.onclose = () => setTimeout(connectWebSocket, 3000)
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                if (data.type === 'subscriber_count') {
                    setSubCount(prev => {
                        const diff = data.count - prev
                        if (diff !== 0) {
                            setLastDiff(diff)
                            setTimeout(() => setLastDiff(0), 4000)
                            setPrevSubCount(prev)
                        }
                        return data.count
                    })
                }
            } catch (e) { }
        }
        wsRef.current = ws
    }

    return (
        <div
            className="w-screen h-screen bg-cover bg-center bg-no-repeat overflow-hidden font-sans relative"
            style={{ backgroundImage: "url('/assets/bg-room.jpg')" }}
        >
            {/* Dark vignette overlay */}
            <div className="absolute inset-0"
                style={{
                    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.5) 100%)',
                }} />

            {/* Scanline texture */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.02]"
                style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,240,255,0.03) 2px, rgba(0,240,255,0.03) 4px)',
                }} />

            {/* 4:3 SAFE AREA */}
            <div className="relative h-full aspect-[4/3] mx-auto">

                {/* ── HUD Corner Brackets ── */}
                <div className="absolute top-4 left-4 w-16 h-16 pointer-events-none">
                    <div className="absolute top-0 left-0 w-full h-[2px]"
                        style={{ background: 'linear-gradient(90deg, var(--gamer-cyan), transparent)' }} />
                    <div className="absolute top-0 left-0 h-full w-[2px]"
                        style={{ background: 'linear-gradient(180deg, var(--gamer-cyan), transparent)' }} />
                </div>
                <div className="absolute top-4 right-4 w-16 h-16 pointer-events-none">
                    <div className="absolute top-0 right-0 w-full h-[2px]"
                        style={{ background: 'linear-gradient(270deg, var(--gamer-cyan), transparent)' }} />
                    <div className="absolute top-0 right-0 h-full w-[2px]"
                        style={{ background: 'linear-gradient(180deg, var(--gamer-cyan), transparent)' }} />
                </div>
                <div className="absolute bottom-4 left-4 w-16 h-16 pointer-events-none">
                    <div className="absolute bottom-0 left-0 w-full h-[2px]"
                        style={{ background: 'linear-gradient(90deg, var(--gamer-cyan), transparent)' }} />
                    <div className="absolute bottom-0 left-0 h-full w-[2px]"
                        style={{ background: 'linear-gradient(0deg, var(--gamer-cyan), transparent)' }} />
                </div>
                <div className="absolute bottom-4 right-4 w-16 h-16 pointer-events-none">
                    <div className="absolute bottom-0 right-0 w-full h-[2px]"
                        style={{ background: 'linear-gradient(270deg, var(--gamer-cyan), transparent)' }} />
                    <div className="absolute bottom-0 right-0 h-full w-[2px]"
                        style={{ background: 'linear-gradient(0deg, var(--gamer-cyan), transparent)' }} />
                </div>

                {/* ── NOW LIVE Indicator ── */}
                <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-5 py-1.5 rounded-full z-20"
                    style={{
                        background: 'rgba(10, 10, 20, 0.75)',
                        border: '1px solid rgba(255, 51, 85, 0.3)',
                        backdropFilter: 'blur(12px)',
                        boxShadow: '0 0 20px rgba(255, 51, 85, 0.15)',
                    }}>
                    <div className="relative">
                        <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"
                            style={{ boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)' }} />
                        <div className="absolute inset-0 w-2.5 h-2.5 bg-red-500 rounded-full"
                            style={{ animation: 'ripple 2s ease-out infinite' }} />
                    </div>
                    <span className="text-red-400 font-bold tracking-[0.25em] text-[10px] uppercase">NOW LIVE</span>
                </div>

                {/* ── SUBSCRIBER PANEL ── */}
                <div className="absolute top-[12%] left-[3%]">
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                        className="relative p-[2px] rounded-2xl overflow-hidden"
                        style={{ boxShadow: '0 0 30px rgba(0, 240, 255, 0.15)' }}
                    >
                        {/* Spinning border */}
                        <div className="absolute top-1/2 left-1/2 w-[800px] h-[800px]"
                            style={{
                                background: 'conic-gradient(from 0deg, transparent 0%, #00f0ff 30%, white 40%, #00f0ff 50%, transparent 70%, #ff00aa 85%, transparent 100%)',
                                animation: 'spinBorder 4s linear infinite',
                            }} />

                        <div className="relative z-10 flex items-center gap-5 p-5 rounded-2xl"
                            style={{
                                background: 'rgba(10, 10, 20, 0.88)',
                                backdropFilter: 'blur(20px)',
                            }}>
                            {/* HUD Corners */}
                            <div className="hud-corner hud-corner-tl" />
                            <div className="hud-corner hud-corner-tr" />
                            <div className="hud-corner hud-corner-bl" />
                            <div className="hud-corner hud-corner-br" />

                            {/* Logo */}
                            <div className="relative">
                                <div className="absolute -inset-3 rounded-full"
                                    style={{
                                        background: 'var(--gamer-cyan)',
                                        filter: 'blur(12px)', opacity: 0.35,
                                        animation: 'neonPulse 3s ease-in-out infinite',
                                    }} />
                                <img src="/assets/asset-2.png" alt="Logo"
                                    className="relative w-20 h-20 rounded-full object-cover"
                                    style={{
                                        border: '2px solid rgba(0, 240, 255, 0.5)',
                                        boxShadow: '0 0 15px rgba(0, 240, 255, 0.3)',
                                    }} />
                            </div>

                            {/* Text */}
                            <div className="flex flex-col items-start min-w-[180px]">
                                <div className="font-bold tracking-[0.2em] text-[10px] uppercase mb-1"
                                    style={{
                                        color: 'var(--gamer-cyan)',
                                        textShadow: '0 0 8px rgba(0, 240, 255, 0.5)',
                                        animation: 'glitchFlicker 8s ease-in-out infinite',
                                    }}>
                                    Subscribers
                                </div>
                                <div className="text-white font-black text-6xl tracking-tighter leading-none"
                                    style={{ textShadow: '0 0 25px rgba(0,240,255,0.5), 0 4px 8px rgba(0,0,0,1)' }}>
                                    <CountUp start={prevSubCount} end={subCount} duration={0.5} separator="," useEasing={true} />
                                </div>
                                <div className="font-medium text-xs tracking-[0.15em] uppercase mt-1.5"
                                    style={{ color: 'rgba(255, 255, 255, 0.45)' }}>
                                    {channelName}
                                </div>
                            </div>

                            {/* Diff popup */}
                            <AnimatePresence>
                                {lastDiff !== 0 && (
                                    <motion.div
                                        initial={{ y: 0, opacity: 0, scale: 0.5 }}
                                        animate={{ y: -80, opacity: 1, scale: 1.3 }}
                                        exit={{ opacity: 0, y: -100, filter: 'blur(6px)' }}
                                        className="absolute -top-8 right-0 pointer-events-none z-20"
                                    >
                                        <span className="font-black text-5xl"
                                            style={{
                                                color: lastDiff > 0 ? 'var(--gamer-green)' : 'var(--gamer-red)',
                                                textShadow: `0 0 20px ${lastDiff > 0 ? 'rgba(0,255,136,0.8)' : 'rgba(255,51,85,0.8)'}, 0 4px 8px rgba(0,0,0,1)`,
                                            }}>
                                            {lastDiff > 0 ? '+' : ''}{lastDiff}
                                        </span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </div>

                {/* ── TRANSACTIONS LIST ── */}
                <div className="absolute top-[12%] right-[3%] flex flex-col gap-3 w-[380px]">
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-end gap-2 mb-1"
                    >
                        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full"
                            style={{
                                background: 'rgba(255, 215, 0, 0.06)',
                                border: '1px solid rgba(255, 215, 0, 0.2)',
                                backdropFilter: 'blur(8px)',
                                boxShadow: '0 0 15px rgba(255, 215, 0, 0.1)',
                            }}>
                            <span className="text-xs">💰</span>
                            <span className="text-[9px] font-bold uppercase tracking-[0.15em]"
                                style={{ color: '#ffd700', textShadow: '0 0 6px rgba(255,215,0,0.5)' }}>
                                Top Supporters
                            </span>
                        </div>
                    </motion.div>

                    <AnimatePresence mode="popLayout">
                        {transactions.map((tx) => (
                            <HubTransactionCard key={tx.transaction_id || tx.timestamp + tx.user} tx={tx} />
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
}

// ─── Transaction Card ────────────────────────────────────────────────────

const TX_CONFIG = {
    1: {
        color: '#ffd700', bg: 'rgba(255,215,0,0.06)', border: 'rgba(255,215,0,0.3)',
        icon: '👑', glow: 'rgba(255,215,0,0.2)',
        gradient: 'conic-gradient(from 0deg, transparent 0%, #ffd700 30%, #fff 42%, #ffd700 55%, transparent 100%)',
    },
    2: {
        color: '#00f0ff', bg: 'rgba(0,240,255,0.06)', border: 'rgba(0,240,255,0.3)',
        icon: '🥈', glow: 'rgba(0,240,255,0.15)',
        gradient: 'conic-gradient(from 0deg, transparent 0%, #00f0ff 35%, white 45%, #00f0ff 55%, transparent 100%)',
    },
    3: {
        color: '#ff6b35', bg: 'rgba(255,107,53,0.06)', border: 'rgba(255,107,53,0.3)',
        icon: '🥉', glow: 'rgba(255,107,53,0.15)',
        gradient: 'conic-gradient(from 0deg, transparent 0%, #ff6b35 35%, #ffaa77 45%, #ff6b35 55%, transparent 100%)',
    },
}

function HubTransactionCard({ tx }) {
    const cfg = TX_CONFIG[tx.rank] || TX_CONFIG[3]

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 50, filter: 'blur(6px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
            className="relative p-[2px] rounded-xl overflow-hidden"
            style={{ boxShadow: `0 0 20px ${cfg.glow}` }}
        >
            {/* Spinning border */}
            <div className="gamer-spin-border"
                style={{ background: cfg.gradient }} />

            <div className="relative z-10 flex items-center gap-4 px-5 py-3 rounded-[10px]"
                style={{
                    background: 'rgba(10, 10, 20, 0.88)',
                    backdropFilter: 'blur(16px)',
                }}>
                <div className="text-2xl filter drop-shadow-lg">{cfg.icon}</div>
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="text-sm font-bold tracking-wide uppercase truncate"
                        style={{ color: cfg.color, textShadow: `0 0 8px ${cfg.glow}` }}>
                        {tx.user || "Anonymous"}
                    </div>
                    <div className="text-white font-black text-xl tracking-tight leading-none"
                        style={{ textShadow: `0 0 10px ${cfg.glow}` }}>
                        ₹<CountUp end={tx.amount} duration={1.5} separator="," />
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
