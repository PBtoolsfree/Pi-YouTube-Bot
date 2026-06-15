import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import CountUp from 'react-countup'

const RANK_CONFIG = {
    1: {
        color: '#ffd700', bg: 'rgba(255, 215, 0, 0.08)', border: 'rgba(255, 215, 0, 0.5)',
        icon: '👑', label: 'GOLD', glow: 'rgba(255, 215, 0, 0.3)',
        gradient: 'conic-gradient(from 0deg, transparent 0%, #ffd700 30%, #fff 42%, #ffd700 55%, transparent 70%, #ff8800 88%, transparent 100%)',
    },
    2: {
        color: '#00f0ff', bg: 'rgba(0, 240, 255, 0.06)', border: 'rgba(0, 240, 255, 0.4)',
        icon: '🥈', label: 'SILVER', glow: 'rgba(0, 240, 255, 0.25)',
        gradient: 'conic-gradient(from 0deg, transparent 0%, #00f0ff 35%, white 45%, #00f0ff 55%, transparent 100%)',
    },
    3: {
        color: '#ff6b35', bg: 'rgba(255, 107, 53, 0.06)', border: 'rgba(255, 107, 53, 0.4)',
        icon: '🥉', label: 'BRONZE', glow: 'rgba(255, 107, 53, 0.2)',
        gradient: 'conic-gradient(from 0deg, transparent 0%, #ff6b35 35%, #ffaa77 45%, #ff6b35 55%, transparent 100%)',
    },
}

export default function TransactionsOverlay({ isRotating = false }) {
    const [transactions, setTransactions] = useState([])
    const wsRef = useRef(null)

    const env = import.meta.env || {}
    const API_URL = env.VITE_API_URL || "/api"

    const fetchTransactions = async () => {
        try {
            const res = await axios.get(`${API_URL}/donations?limit=3`)
            let data = res.data || []
            const sorted = [...data].sort((a, b) => b.amount - a.amount)
            setTransactions(sorted.map((item, index) => ({ ...item, rank: index + 1 })))
        } catch (e) { }
    }

    // WebSocket for instant updates
    useEffect(() => {
        fetchTransactions()
        const interval = setInterval(fetchTransactions, 5000)

        const connect = () => {
            const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
            const ws = new WebSocket(`${proto}://${window.location.host}/ws/logs`)
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    if (data.type === 'log' && ['DONATION', 'SUPERCHAT', 'APP_NOTIFICATION'].includes(data.category)) {
                        fetchTransactions()
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
                    background: 'rgba(255, 215, 0, 0.08)',
                    border: '1px solid rgba(255, 215, 0, 0.2)',
                    boxShadow: '0 0 20px rgba(255, 215, 0, 0.1)',
                }}
            >
                <span className="text-sm">💰</span>
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase"
                    style={{ color: '#ffd700', textShadow: '0 0 8px rgba(255, 215, 0, 0.5)' }}>
                    Top Donations
                </span>
            </motion.div>

            <AnimatePresence mode="popLayout">
                {transactions.map((tx) => (
                    <TransactionCard key={tx.transaction_id || tx.timestamp + tx.user} tx={tx} />
                ))}
            </AnimatePresence>
        </div>
    )
}

function TransactionCard({ tx }) {
    const config = RANK_CONFIG[tx.rank] || RANK_CONFIG[3]

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

                {/* Icon */}
                <div className="text-3xl filter drop-shadow-lg relative">
                    {config.icon}
                    {tx.rank === 1 && (
                        <div className="absolute -inset-2 rounded-full"
                            style={{
                                background: 'radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%)'
                            }} />
                    )}
                </div>

                <div className="flex-1 flex flex-col min-w-0">
                    {/* Name */}
                    <div className="text-lg font-bold tracking-wide uppercase truncate"
                        style={{
                            color: config.color,
                            textShadow: `0 0 10px ${config.glow}`,
                        }}>
                        {tx.user || "Anonymous"}
                    </div>
                    {/* Amount */}
                    <div className="text-white font-black text-2xl tracking-tight leading-none mt-0.5"
                        style={{
                            textShadow: `0 0 15px ${config.glow}, 0 2px 4px rgba(0,0,0,0.8)`,
                        }}>
                        ₹<CountUp end={tx.amount} duration={1.5} separator="," preserveValue />
                    </div>
                </div>

                {/* Rank label */}
                <div className="text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 rounded-full"
                    style={{
                        color: config.color,
                        border: `1px solid ${config.border}`,
                        background: config.bg,
                        opacity: 0.7,
                    }}>
                    #{tx.rank}
                </div>
            </div>
        </motion.div>
    )
}
