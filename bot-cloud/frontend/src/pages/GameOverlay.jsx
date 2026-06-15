import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import CountUp from 'react-countup'

const env = import.meta.env || {}
const API_URL = env.VITE_API_URL || "/api"

// ─── MAIN OVERLAY ───────────────────────────────────────────────────────────
export default function GameOverlay() {
    const [donations, setDonations] = useState([])
    const [viewers, setViewers] = useState([])
    const [chatMessages, setChatMessages] = useState([])
    const wsRef = useRef(null)
    const videoRef = useRef(null)

    // ── Avatar State ──
    const [isTalking, setIsTalking] = useState(false)
    const [isDonation, setIsDonation] = useState(false)
    const [mouthOpen, setMouthOpen] = useState(false)
    const [isVisible, setIsVisible] = useState(false)
    const mouthIntervalRef = useRef(null)
    const hideTimerRef = useRef(null)

    const fetchDonationsRef = useRef(null)
    const fetchViewersRef = useRef(null)

    const fetchDonations = async () => {
        try {
            const res = await axios.get(`${API_URL}/donations?limit=10`)
            const sorted = [...(res.data || [])].sort((a, b) => b.amount - a.amount)
            setDonations(sorted.slice(0, 3).map((d, i) => ({ ...d, rank: i + 1 })))
        } catch (e) { }
    }
    fetchDonationsRef.current = fetchDonations

    const fetchViewers = async () => {
        try {
            const res = await axios.get(`${API_URL}/loyalty/leaderboard`)
            setViewers((res.data || []).slice(0, 3))
        } catch (e) { }
    }
    fetchViewersRef.current = fetchViewers

    useEffect(() => {
        fetchDonations()
        fetchViewers()
        const ivD = setInterval(fetchDonations, 5000)
        const ivV = setInterval(fetchViewers, 5000)
        return () => { clearInterval(ivD); clearInterval(ivV) }
    }, [])

    // ── Avatar Animations ──
    useEffect(() => {
        if (isTalking || isDonation) {
            if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
            setIsVisible(true)
        } else {
            hideTimerRef.current = setTimeout(() => setIsVisible(false), 1500)
        }
        return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
    }, [isTalking, isDonation])

    useEffect(() => {
        if (isTalking) {
            mouthIntervalRef.current = setInterval(() => setMouthOpen(p => !p), 200)
        } else {
            clearInterval(mouthIntervalRef.current)
            setMouthOpen(false)
        }
        return () => clearInterval(mouthIntervalRef.current)
    }, [isTalking])

    const triggerAvatarDonation = () => {
        setIsDonation(true)
        setTimeout(() => setIsDonation(false), 4000)
    }

    // ── WebSocket ──
    useEffect(() => {
        const connect = () => {
            const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
            const ws = new WebSocket(`${proto}://${window.location.host}/ws/logs`)

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)

                    if (data.type === 'tts_event' && data.channel === 'public') {
                        if (data.state === 'start') setIsTalking(true)
                        else if (data.state === 'end') setIsTalking(false)
                    }

                    if (data.type === 'superchat_alert' || data.type === 'donation_alert' ||
                        data.source === 'DONATION' || data.source === 'SUPERCHAT') {
                        triggerAvatarDonation()
                    }

                    if (data.type !== 'log') return
                    const cat = data.category

                    if (['CHAT', 'AI_RESPONSE'].includes(cat)) {
                        let author = data.author || (cat === 'AI_RESPONSE' ? 'Bot' : 'System')
                        let text = data.message || ''
                        const isBot = cat === 'AI_RESPONSE'

                        if (cat === 'CHAT' && text.includes(': ')) {
                            const colonIdx = text.indexOf(': ')
                            const beforeColon = text.substring(0, colonIdx).replace(/^\[.*?\]\s*/, '')
                            if (beforeColon) author = beforeColon
                            text = text.substring(colonIdx + 2)
                        }

                        setChatMessages(prev => [...prev.slice(-8), {
                            id: Date.now() + Math.random(),
                            author, text, ts: Date.now(), isBot,
                        }])
                    }

                    if (['DONATION', 'SUPERCHAT', 'APP_NOTIFICATION'].includes(cat)) {
                        fetchDonationsRef.current?.()
                    }

                    if (['LOYALTY', 'RANK_UP'].includes(cat)) {
                        fetchViewersRef.current?.()
                    }
                } catch (err) { }
            }
            ws.onerror = () => { }
            ws.onclose = () => setTimeout(connect, 2000)
            wsRef.current = ws
        }
        connect()
        return () => wsRef.current?.close()
    }, [])



    return (
        <div className="w-[1920px] h-[1080px] relative overflow-hidden font-sans select-none text-white" style={{ background: 'transparent' }}>
            {/* ════════════ VIDEO AVATAR (Chroma Keyed) ════════════ */}
            <ChromaVideo />

            {/* ════════════ BOTTOM BANNER DATA LAYER (Top zIndex) ════════════ */}
            <div className="absolute bottom-0 left-0 right-0 overflow-hidden pointer-events-none" style={{ height: 100, zIndex: 100 }}>
                <div className="relative flex items-stretch h-full">
                    {/* Left spacer (facecam area) */}
                    <div className="shrink-0" style={{ width: 480 }} />

                    {/* Data strip */}
                    <div className="flex-1 flex items-stretch gap-6 h-full px-6 overflow-hidden" style={{ paddingRight: 20 }}>

                        {/* 💰 TOP DONATIONS */}
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[10px] font-black uppercase tracking-[0.15em]"
                                    style={{ color: 'var(--gamer-gold)', textShadow: '0 0 8px rgba(255,215,0,0.5)' }}>
                                    💰 Top
                                </span>
                                <span className="text-[9px] font-bold uppercase tracking-wider"
                                    style={{ color: 'rgba(255,215,0,0.6)' }}>
                                    Donations
                                </span>
                            </div>
                            <div className="flex flex-col justify-center gap-1.5 py-1" style={{ maxHeight: 90 }}>
                                <AnimatePresence mode="popLayout">
                                    {donations.slice(0, 3).map((d, i) => (
                                        <DonationRow key={`d-${i}-${d.transaction_id || d.amount}`} d={d} rank={i + 1} />
                                    ))}
                                </AnimatePresence>
                                {donations.length === 0 && (
                                    <span className="text-[10px] italic" style={{ color: 'rgba(255,255,255,0.25)' }}>No donations yet</span>
                                )}
                            </div>
                        </div>

                        {/* Neon divider */}
                        <div className="shrink-0 my-3 w-[1px]"
                            style={{
                                background: 'linear-gradient(180deg, transparent, var(--gamer-cyan-dim), transparent)',
                                boxShadow: '0 0 4px var(--gamer-cyan-dim)',
                            }} />

                        {/* 👥 TOP VIEWERS */}
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[10px] font-black uppercase tracking-[0.15em]"
                                    style={{ color: 'var(--gamer-cyan)', textShadow: '0 0 8px rgba(0,240,255,0.5)' }}>
                                    👥 Top
                                </span>
                                <span className="text-[9px] font-bold uppercase tracking-wider"
                                    style={{ color: 'rgba(0,240,255,0.6)' }}>
                                    Viewers
                                </span>
                            </div>
                            <div className="flex flex-col justify-center gap-1.5 py-1" style={{ maxHeight: 90 }}>
                                <AnimatePresence mode="popLayout">
                                    {viewers.slice(0, 3).map((v, i) => (
                                        <ViewerRow key={`v-${i}-${v.name}`} v={v} rank={i + 1} />
                                    ))}
                                </AnimatePresence>
                                {viewers.length === 0 && (
                                    <span className="text-[10px] italic" style={{ color: 'rgba(255,255,255,0.25)' }}>No viewer data</span>
                                )}
                            </div>
                        </div>

                        {/* Neon divider */}
                        <div className="shrink-0 my-3 w-[1px]"
                            style={{
                                background: 'linear-gradient(180deg, transparent, var(--gamer-magenta-dim, rgba(255,0,170,0.3)), transparent)',
                                boxShadow: '0 0 4px rgba(255,0,170,0.2)',
                            }} />

                        {/* 💬 LIVE CHAT */}
                        <div className="flex-1 flex items-center gap-4 min-w-0 overflow-hidden">
                            <span className="text-[10px] font-black uppercase tracking-[0.15em] shrink-0"
                                style={{ color: 'var(--gamer-green)', textShadow: '0 0 8px rgba(0,255,136,0.5)' }}>
                                💬 Chat
                            </span>
                            <div className="flex flex-col justify-center gap-1.5 py-1 overflow-hidden flex-1" style={{ maxHeight: 90 }}>
                                <AnimatePresence mode="popLayout">
                                    {chatMessages.slice(-3).map(msg => (
                                        <ChatBubble key={msg.id} msg={msg} />
                                    ))}
                                </AnimatePresence>
                                {chatMessages.length === 0 && (
                                    <span className="text-[10px] italic" style={{ color: 'rgba(255,255,255,0.25)' }}>Waiting for messages…</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ════════════ HUD CORNER ACCENTS ════════════ */}
            {/* Top-left */}
            <div className="absolute top-4 left-4 w-12 h-12 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-[2px]"
                    style={{ background: 'linear-gradient(90deg, var(--gamer-cyan), transparent)' }} />
                <div className="absolute top-0 left-0 h-full w-[2px]"
                    style={{ background: 'linear-gradient(180deg, var(--gamer-cyan), transparent)' }} />
            </div>
            {/* Top-right */}
            <div className="absolute top-4 right-4 w-12 h-12 pointer-events-none">
                <div className="absolute top-0 right-0 w-full h-[2px]"
                    style={{ background: 'linear-gradient(270deg, var(--gamer-cyan), transparent)' }} />
                <div className="absolute top-0 right-0 h-full w-[2px]"
                    style={{ background: 'linear-gradient(180deg, var(--gamer-cyan), transparent)' }} />
            </div>

            {/* ════════════ AVATAR ZONE (Bottom Right) ════════════ */}
            <div
                className={`absolute right-0 bottom-0 w-[450px] h-[500px] flex items-end justify-center pointer-events-none transition-all duration-500 ease-in-out origin-bottom
                    ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                style={{ zIndex: 10 }}
            >
                {isDonation && (
                    <>
                        <div className="absolute top-[20%] left-[20%] text-3xl z-20" style={{ animation: 'floatUp 2s ease-out forwards' }}>🎉</div>
                        <div className="absolute top-[30%] left-[80%] text-2xl z-20" style={{ animation: 'floatUp 2.5s ease-out 0.3s forwards' }}>💖</div>
                        <div className="absolute top-[10%] left-[70%] text-2xl z-20" style={{ animation: 'floatUp 2.2s ease-out 0.5s forwards' }}>⭐</div>
                        <div className="absolute inset-0 rounded-full -z-10"
                            style={{ background: 'rgba(255, 215, 0, 0.15)', filter: 'blur(80px)', animation: 'breathe 1s ease-in-out infinite' }} />
                    </>
                )}
            </div>
        </div>
    )
}


// ─── SUB-COMPONENTS ─────────────────────────────────────────────────────────

function ChromaVideo() {
    const canvasRef = useRef(null)
    const videoRef = useRef(null)

    useEffect(() => {
        const v = videoRef.current
        const c = canvasRef.current
        if (!v || !c) return
        const ctx = c.getContext('2d', { willReadFrequently: true })

        let animId
        const processor = () => {
            if (v.paused || v.ended) {
                animId = requestAnimationFrame(processor)
                return
            }
            ctx.drawImage(v, 0, 0, 1920, 1080)
            const frame = ctx.getImageData(0, 0, 1920, 1080)
            const d = frame.data
            const l = d.length

            for (let i = 0; i < l; i += 4) {
                const r = d[i]
                const g = d[i + 1]
                const b = d[i + 2]
                
                const maxOther = Math.max(r, b)
                const diff = g - maxOther
                if (diff > 15) {
                    const alpha = 255 - (diff * 4)
                    d[i + 3] = alpha < 0 ? 0 : alpha
                    if (d[i + 3] > 0) d[i + 1] = maxOther + (diff * 0.2) // Smooth spill blend
                }
            }
            ctx.putImageData(frame, 0, 0)
            animId = requestAnimationFrame(processor)
        }

        v.addEventListener('play', () => { animId = requestAnimationFrame(processor) })
        v.play().catch(()=>{})

        return () => { if (animId) cancelAnimationFrame(animId) }
    }, [])

    return (
        <div className="absolute inset-0 w-[1920px] h-[1080px] pointer-events-none" style={{ zIndex: 80 }}>
            <canvas ref={canvasRef} width="1920" height="1080" className="w-full h-full" />
            <video ref={videoRef} src="/assets/overlay.mp4" loop muted autoPlay playsInline crossOrigin="anonymous" style={{ display: 'none' }} />
        </div>
    )
}

const RANK_STYLES = {
    1: { icon: '👑', color: '#ffd700', bg: 'rgba(255,215,0,0.12)', border: 'rgba(255,215,0,0.4)' },
    2: { icon: '🥈', color: '#00f0ff', bg: 'rgba(0,240,255,0.10)', border: 'rgba(0,240,255,0.4)' },
    3: { icon: '🥉', color: '#ff6b35', bg: 'rgba(255,107,53,0.10)', border: 'rgba(255,107,53,0.4)' },
}

function DonationRow({ d, rank }) {
    const s = RANK_STYLES[rank] || RANK_STYLES[3]
    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -15 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full whitespace-nowrap"
            style={{
                background: s.bg,
                border: `1px solid ${s.border}`,
                backdropFilter: 'blur(8px)',
                boxShadow: `0 0 8px ${s.bg}`,
            }}
        >
            <span className="text-[11px] leading-none">{s.icon}</span>
            <span className="text-[13px] font-bold max-w-[100px] truncate leading-tight"
                style={{ color: s.color, textShadow: `0 0 6px ${s.bg}` }}>
                {d.user || 'Anon'}
            </span>
            <span className="text-white font-black text-[13px] leading-tight"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                ₹<CountUp end={d.amount} duration={1} separator="," preserveValue />
            </span>
        </motion.div>
    )
}

function ViewerRow({ v, rank }) {
    const s = RANK_STYLES[rank] || RANK_STYLES[3]
    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -15 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full whitespace-nowrap"
            style={{
                background: s.bg,
                border: `1px solid ${s.border}`,
                backdropFilter: 'blur(8px)',
                boxShadow: `0 0 8px ${s.bg}`,
            }}
        >
            <span className="text-[11px] leading-none">{s.icon}</span>
            <span className="text-[13px] font-bold max-w-[100px] truncate leading-tight"
                style={{ color: s.color, textShadow: `0 0 6px ${s.bg}` }}>
                {v.name}
            </span>
            <span className="text-white/80 font-bold text-[12px] leading-tight"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>
                {(v.points || 0).toLocaleString()} pts
            </span>
        </motion.div>
    )
}

function ChatBubble({ msg }) {
    const nameColor = msg.isBot ? 'var(--gamer-magenta)' : 'var(--gamer-cyan)'
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="flex items-center gap-2 px-3 py-1 rounded-full whitespace-nowrap max-w-full"
            style={{
                background: 'rgba(10, 10, 20, 0.6)',
                border: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(8px)',
            }}
        >
            <span className="text-[11px] font-black uppercase tracking-wide leading-tight"
                style={{ color: nameColor, textShadow: `0 0 6px ${nameColor}40` }}>
                {msg.author}
            </span>
            <span className="text-[12px] text-white/90 truncate leading-tight"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                {msg.text}
            </span>
        </motion.div>
    )
}
