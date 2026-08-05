import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { motion } from 'framer-motion'

export default function TickerOverlay() {
    const [viewers, setViewers] = useState([])
    const [donations, setDonations] = useState([])
    const wsRef = useRef(null)

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
            
            {/* Viewers */}
            {viewers.length > 0 && <span className="text-[#00f0ff] uppercase tracking-widest text-sm flex items-center gap-2"><span className="text-xl">👑</span> TOP LOYALTY</span>}
            {viewers.map(v => (
                <div key={v.id || v.name} className="flex items-center gap-2 text-white">
                    <span className="text-[#00f0ff] font-black text-sm">#{v.rank}</span>
                    <span className="text-white drop-shadow-[0_0_5px_rgba(0,240,255,0.5)]">{v.name}</span>
                    <span className="text-zinc-400 font-mono text-sm ml-1">{(v.points || 0).toLocaleString()} PTS</span>
                </div>
            ))}

            <span className="text-zinc-600 font-black tracking-widest">///</span>

            {/* Donations */}
            {donations.length > 0 && <span className="text-[#ffd700] uppercase tracking-widest text-sm flex items-center gap-2"><span className="text-xl">💰</span> TOP DONATIONS</span>}
            {donations.map(d => (
                <div key={d.transaction_id || d.user} className="flex items-center gap-2 text-white">
                    <span className="text-[#ffd700] font-black text-sm">#{d.rank}</span>
                    <span className="text-white drop-shadow-[0_0_5px_rgba(255,215,0,0.5)]">{d.user || 'Anonymous'}</span>
                    <span className="text-zinc-400 font-mono text-sm ml-1">₹{d.amount.toLocaleString()}</span>
                </div>
            ))}
        </div>
    )

    return (
        <div className="w-screen h-screen bg-transparent overflow-hidden flex items-end font-sans">
            <div className="w-full h-[60px] flex items-center bg-zinc-950/90 border-t border-[#00f0ff]/30 backdrop-blur-md relative shadow-[0_-5px_20px_rgba(0,240,255,0.1)]">
                
                {/* News Label */}
                <div className="absolute left-0 top-0 bottom-0 px-8 flex items-center bg-[#00f0ff] text-black font-black text-xl italic tracking-widest z-10 uppercase"
                     style={{ clipPath: 'polygon(0 0, 100% 0, 90% 100%, 0% 100%)', textShadow: '0 0 5px rgba(255,255,255,0.5)' }}>
                    LIVE STATS
                </div>

                {/* Ticker Content */}
                <div className="flex-1 overflow-hidden h-full relative ml-[180px]">
                    <div className="absolute inset-0 flex items-center whitespace-nowrap animate-[marquee_30s_linear_infinite] will-change-transform w-max">
                        <TickerContent />
                        <TickerContent />
                    </div>
                </div>

                {/* Left gradient for smooth text entering behind the label */}
                <div className="absolute left-[160px] top-0 bottom-0 w-24 bg-gradient-to-r from-zinc-950/90 to-transparent z-0 pointer-events-none" />

                {/* Right Edge Decoration */}
                <div className="absolute right-0 top-0 bottom-0 w-2 bg-[#00f0ff] shadow-[0_0_15px_#00f0ff]" />
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                @keyframes marquee {
                    0% { transform: translateX(0%); }
                    100% { transform: translateX(-50%); }
                }
            `}} />
        </div>
    )
}
