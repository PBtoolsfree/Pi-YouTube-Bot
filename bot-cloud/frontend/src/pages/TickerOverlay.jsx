import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { motion } from 'framer-motion'

export default function TickerOverlay({ customText, title, speed, color }) {
    const [viewers, setViewers] = useState([])
    const [donations, setDonations] = useState([])
    const wsRef = useRef(null)

    const params = new URLSearchParams(window.location.search)
    const effectiveTitle = title || params.get('title') || 'LIVE STATS'
    const effectiveSpeed = parseInt(speed || params.get('speed') || '30', 10) || 30
    const effectiveColor = color || params.get('color') || '#00f0ff'
    const effectiveCustomText = customText || params.get('text') || ''

    const API_URL = import.meta.env?.VITE_API_URL || "/api"

    const fetchData = async () => {
        try {
            const vRes = await axios.get(`${API_URL}/loyalty/leaderboard`)
            const dRes = await axios.get(`${API_URL}/donations?limit=3`)

            setViewers((vRes.data || []).slice(0, 3).map((v, i) => ({ ...v, rank: i + 1 })))

            const sortedDonations = [...(dRes.data || [])].sort((a, b) => b.amount - a.amount).slice(0, 3)
            setDonations(sortedDonations.map((item, i) => ({ ...item, rank: i + 1 })))
        } catch (e) { }
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 10000)

        const connect = () => {
            const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
            const ws = new WebSocket(`${proto}://${window.location.host}/ws/logs`)
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    if (data.type === 'log' && ['LOYALTY', 'RANK_UP', 'DONATION', 'SUPERCHAT', 'APP_NOTIFICATION'].includes(data.category)) {
                        fetchData()
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

    const TickerContent = () => (
        <div className="inline-flex items-center gap-16 text-lg font-bold pr-16">
            <span className="text-zinc-600 font-black tracking-widest">///</span>

            {/* Custom announcement text if provided */}
            {effectiveCustomText && (
                <div className="flex items-center gap-2 text-white">
                    <span className="text-xl">📢</span>
                    <span className="text-white drop-shadow-[0_0_5px_rgba(0,240,255,0.5)] uppercase tracking-wide">{effectiveCustomText}</span>
                    <span className="text-zinc-600 font-black tracking-widest ml-8">///</span>
                </div>
            )}

            {/* Viewers */}
            {viewers.length > 0 && <span style={{ color: effectiveColor }} className="uppercase tracking-widest text-sm flex items-center gap-2"><span className="text-xl">👑</span> TOP LOYALTY</span>}
            {viewers.map(v => (
                <div key={v.id || v.name} className="flex items-center gap-2 text-white">
                    <span style={{ color: effectiveColor }} className="font-black text-sm">#{v.rank}</span>
                    <span className="text-white drop-shadow-[0_0_5px_rgba(0,240,255,0.5)]">{v.name}</span>
                    <span className="text-zinc-400 font-mono text-sm ml-1">{(v.points || 0).toLocaleString()} PTS</span>
                </div>
            ))}

            {viewers.length > 0 && <span className="text-zinc-600 font-black tracking-widest">///</span>}

            {/* Donations */}
            {donations.length > 0 && <span className="text-[#ffd700] uppercase tracking-widest text-sm flex items-center gap-2"><span className="text-xl">💰</span> TOP DONATIONS</span>}
            {donations.map(d => (
                <div key={d.transaction_id || d.user} className="flex items-center gap-2 text-white">
                    <span className="text-[#ffd700] font-black text-sm">#{d.rank}</span>
                    <span className="text-white drop-shadow-[0_0_5px_rgba(255,215,0,0.5)]">{d.user || 'Anonymous'}</span>
                    <span className="text-zinc-400 font-mono text-sm ml-1">₹{d.amount.toLocaleString()}</span>
                </div>
            ))}

            {/* Engaging default content if no data yet */}
            {viewers.length === 0 && donations.length === 0 && (
                <>
                    <div className="flex items-center gap-2 text-white">
                        <span className="text-xl">⭐</span>
                        <span className="text-white drop-shadow-[0_0_5px_rgba(0,240,255,0.5)]">WELCOME TO THE LIVE STREAM</span>
                    </div>
                    <span className="text-zinc-600 font-black tracking-widest">///</span>
                    <div className="flex items-center gap-2 text-white">
                        <span className="text-xl">🔔</span>
                        <span className="text-zinc-300">SUBSCRIBE & CHAT TO EARN LOYALTY POINTS</span>
                    </div>
                    <span className="text-zinc-600 font-black tracking-widest">///</span>
                    <div className="flex items-center gap-2 text-white">
                        <span className="text-xl">💬</span>
                        <span style={{ color: effectiveColor }}>COMMANDS: !mypokemon • !catch • !battle</span>
                    </div>
                    <span className="text-zinc-600 font-black tracking-widest">///</span>
                </>
            )}
        </div>
    )

    return (
        <div className="w-full h-full bg-transparent overflow-hidden flex items-center font-sans">
            <div
                className="w-full h-full min-h-[40px] flex items-center bg-zinc-950/90 border-t backdrop-blur-md relative"
                style={{
                    borderColor: `${effectiveColor}4D`,
                    boxShadow: `0 -5px 20px ${effectiveColor}1A`
                }}
            >
                {/* News Label */}
                <div
                    className="absolute left-0 top-0 bottom-0 px-8 flex items-center text-black font-black text-xl italic tracking-widest z-10 uppercase shrink-0"
                    style={{
                        backgroundColor: effectiveColor,
                        clipPath: 'polygon(0 0, 100% 0, 90% 100%, 0% 100%)',
                        textShadow: '0 0 5px rgba(255,255,255,0.5)'
                    }}
                >
                    {effectiveTitle}
                </div>

                {/* Ticker Content */}
                <div className="flex-1 overflow-hidden h-full relative ml-[180px]">
                    <div
                        className="absolute inset-0 flex items-center whitespace-nowrap will-change-transform w-max ticker-marquee"
                        style={{
                            animation: `tickerMarquee ${effectiveSpeed}s linear infinite`
                        }}
                    >
                        <TickerContent />
                        <TickerContent />
                    </div>
                </div>

                {/* Left gradient for smooth text entering behind the label */}
                <div className="absolute left-[160px] top-0 bottom-0 w-24 bg-gradient-to-r from-zinc-950/90 to-transparent z-0 pointer-events-none" />

                {/* Right Edge Decoration */}
                <div
                    className="absolute right-0 top-0 bottom-0 w-2"
                    style={{
                        backgroundColor: effectiveColor,
                        boxShadow: `0 0 15px ${effectiveColor}`
                    }}
                />
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                @keyframes tickerMarquee {
                    0% { transform: translateX(0%); }
                    100% { transform: translateX(-50%); }
                }
            `}} />
        </div>
    )
}
