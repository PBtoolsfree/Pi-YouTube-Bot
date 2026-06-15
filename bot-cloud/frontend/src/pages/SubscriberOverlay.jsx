import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import CountUp from 'react-countup'

export default function SubscriberOverlay() {
    const [count, setCount] = useState(0)
    const [prevCount, setPrevCount] = useState(0)
    const [channelName, setChannelName] = useState("YOUTUBE CHANNEL")
    const [channelLogo, setChannelLogo] = useState(null)
    const [lastDiff, setLastDiff] = useState(0)
    const wsRef = useRef(null)

    const env = import.meta.env || {}
    const API_URL = env.VITE_API_URL || "/api"

    useEffect(() => {
        axios.get(`${API_URL}/config`).then(res => {
            if (res.data.youtube?.channel_name) setChannelName(res.data.youtube.channel_name)
            if (res.data.youtube?.logo_url) setChannelLogo(res.data.youtube.logo_url)
        }).catch(() => { })

        axios.get(`${API_URL}/subscriber`).then(res => {
            setCount(res.data.count || 0)
            setPrevCount(res.data.count || 0)
        }).catch(() => { })

        connectWebSocket()
        return () => { if (wsRef.current) wsRef.current.close() }
    }, [])

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
                    setCount(prev => {
                        const diff = data.count - prev
                        if (diff !== 0) {
                            setLastDiff(diff)
                            setTimeout(() => setLastDiff(0), 4000)
                            setPrevCount(prev)
                        }
                        return data.count
                    })
                }
            } catch (e) { }
        }
        wsRef.current = ws
    }

    return (
        <div className="flex flex-col items-center justify-center w-screen h-screen bg-transparent overflow-hidden font-sans">

            {/* ── HUD PANEL ── */}
            <div className="relative p-[2px] rounded-2xl overflow-hidden"
                style={{ boxShadow: '0 0 40px rgba(0, 240, 255, 0.15)' }}>

                {/* Spinning neon border */}
                <div className="absolute top-1/2 left-1/2 w-[800px] h-[800px]"
                    style={{
                        background: 'conic-gradient(from 0deg, transparent 0%, #00f0ff 30%, white 40%, #00f0ff 50%, transparent 70%, #ff00aa 85%, transparent 100%)',
                        animation: 'spinBorder 4s linear infinite',
                    }} />

                {/* Inner panel */}
                <div className="relative z-10 flex items-center gap-6 px-8 py-6 rounded-2xl"
                    style={{
                        background: 'rgba(10, 10, 20, 0.92)',
                        backdropFilter: 'blur(24px)',
                    }}>

                    {/* HUD Corner brackets */}
                    <div className="hud-corner hud-corner-tl" />
                    <div className="hud-corner hud-corner-tr" />
                    <div className="hud-corner hud-corner-bl" />
                    <div className="hud-corner hud-corner-br" />

                    {/* LOGO */}
                    <div className="relative">
                        {/* Glow ring */}
                        <div className="absolute -inset-3 rounded-full"
                            style={{
                                background: 'var(--gamer-cyan)',
                                filter: 'blur(12px)',
                                opacity: 0.4,
                                animation: 'neonPulse 3s ease-in-out infinite',
                            }} />
                        {/* Ring border */}
                        <div className="absolute -inset-1 rounded-full"
                            style={{
                                border: '2px solid var(--gamer-cyan)',
                                opacity: 0.5,
                                animation: 'hexPulse 2s ease-in-out infinite',
                            }} />
                        {channelLogo ? (
                            <img src={channelLogo} alt="Logo"
                                className="relative w-24 h-24 rounded-full object-cover"
                                style={{
                                    border: '3px solid rgba(0, 240, 255, 0.6)',
                                    boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)',
                                }} />
                        ) : (
                            <div className="relative w-24 h-24 rounded-full flex items-center justify-center"
                                style={{
                                    background: 'rgba(0, 240, 255, 0.1)',
                                    border: '3px solid rgba(0, 240, 255, 0.5)',
                                    boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)',
                                }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"
                                    style={{ color: 'var(--gamer-cyan)' }}>
                                    <path fill="currentColor" d="M21.543 6.498C22 8.28 22 12 22 12s0 3.72-.457 5.502c-.254.985-.997 1.76-1.938 2.022C17.896 20 12 20 12 20s-5.893 0-7.605-.476c-.945-.266-1.687-1.04-1.938-2.022C2 15.72 2 12 2 12s0-3.72.457-5.502c.254-.985.997-1.76 1.938-2.022C6.107 4 12 4 12 4s5.896 0 7.605.476c.945.266 1.687 1.04 1.938 2.022M10 15.5l6-3.5-6-3.5z" />
                                </svg>
                            </div>
                        )}
                    </div>

                    {/* TEXT CONTENT */}
                    <div className="flex flex-col items-start">
                        {/* Label with glitch effect */}
                        <div className="font-bold tracking-[0.25em] text-sm uppercase mb-1"
                            style={{
                                color: 'var(--gamer-cyan)',
                                textShadow: '0 0 8px rgba(0, 240, 255, 0.5)',
                                animation: 'glitchFlicker 8s ease-in-out infinite',
                            }}>
                            Subscribers
                        </div>

                        {/* COUNT */}
                        <div className="font-black text-8xl tracking-tighter leading-none text-white"
                            style={{
                                textShadow: '0 0 30px rgba(0, 240, 255, 0.6), 0 0 60px rgba(0, 240, 255, 0.2), 0 4px 10px rgba(0,0,0,1)'
                            }}>
                            <CountUp
                                start={prevCount}
                                end={count}
                                duration={2.5}
                                separator=","
                                useEasing={true}
                            />
                        </div>

                        {/* CHANNEL NAME */}
                        <div className="font-medium text-base tracking-[0.15em] uppercase mt-2"
                            style={{
                                color: 'rgba(255, 255, 255, 0.5)',
                                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                            }}>
                            {channelName}
                        </div>
                    </div>

                    {/* DIFFERENCE POPUP */}
                    <AnimatePresence>
                        {lastDiff !== 0 && (
                            <motion.div
                                initial={{ y: 0, opacity: 0, scale: 0.5 }}
                                animate={{ y: -110, opacity: 1, scale: 1.3 }}
                                exit={{ opacity: 0, y: -140, scale: 0.8, filter: 'blur(8px)' }}
                                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                className="absolute -top-6 right-4 flex justify-center pointer-events-none z-20"
                            >
                                <span className="font-black text-6xl"
                                    style={{
                                        color: lastDiff > 0 ? 'var(--gamer-green)' : 'var(--gamer-red)',
                                        textShadow: lastDiff > 0
                                            ? '0 0 20px rgba(0, 255, 136, 0.8), 0 4px 8px rgba(0,0,0,1)'
                                            : '0 0 20px rgba(255, 51, 85, 0.8), 0 4px 8px rgba(0,0,0,1)',
                                    }}>
                                    {lastDiff > 0 ? '+' : ''}{lastDiff}
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
}
