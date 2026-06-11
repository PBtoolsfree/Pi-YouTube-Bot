import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function ChatOverlay() {
    const [messages, setMessages] = useState([])
    const ws = useRef(null)

    useEffect(() => {
        const connect = () => {
            const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
            const uri = `${proto}://${window.location.host}/ws/logs`
            ws.current = new WebSocket(uri)

            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    if (data.type === 'log' && ['CHAT', 'AI_RESPONSE', 'ALERT'].includes(data.category)) {
                        const isBot = data.category === 'AI_RESPONSE'
                        const newMessage = {
                            id: Date.now() + Math.random(),
                            author: data.author || (isBot ? 'Kobe Bot' : 'System'),
                            text: data.message.includes(': ') ? data.message.split(': ').slice(1).join(': ') : data.message,
                            timestamp: Date.now(),
                            isBot,
                        }
                        setMessages(prev => [...prev.slice(-12), newMessage])
                    }
                } catch (e) { }
            }

            ws.current.onclose = () => setTimeout(connect, 3000)
        }
        connect()
        return () => ws.current?.close()
    }, [])

    return (
        <div className="h-screen w-full overflow-hidden flex flex-col justify-end p-6 font-sans">
            {/* Subtle background scanline */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.015]"
                style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,240,255,0.03) 2px, rgba(0,240,255,0.03) 4px)',
                    backgroundSize: '100% 4px',
                }} />

            <div className="space-y-2 max-w-lg relative">
                <AnimatePresence mode="popLayout">
                    {messages.map(msg => (
                        <ChatMessage key={msg.id} msg={msg} />
                    ))}
                </AnimatePresence>
            </div>
        </div>
    )
}

function ChatMessage({ msg }) {
    const [visible, setVisible] = useState(true)

    useEffect(() => {
        const timer = setTimeout(() => setVisible(false), 10000)
        return () => clearTimeout(timer)
    }, [])

    if (!visible) return null

    const borderColor = msg.isBot ? 'var(--gamer-magenta)' : 'var(--gamer-cyan)'
    const nameColor = msg.isBot ? 'var(--gamer-magenta)' : 'var(--gamer-cyan)'
    const glowColor = msg.isBot ? 'rgba(255, 0, 170, 0.15)' : 'rgba(0, 240, 255, 0.15)'

    return (
        <motion.div
            initial={{ opacity: 0, x: -30, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.95, filter: 'blur(4px)' }}
            transition={{
                type: 'spring',
                stiffness: 400,
                damping: 30,
            }}
            className="flex flex-col"
        >
            <div className="flex items-start gap-2">
                <div
                    className="relative px-4 py-2.5 rounded-r-xl rounded-tl-xl overflow-hidden"
                    style={{
                        background: 'rgba(10, 10, 20, 0.8)',
                        backdropFilter: 'blur(16px)',
                        borderLeft: `3px solid ${borderColor}`,
                        boxShadow: `0 4px 24px rgba(0,0,0,0.5), inset 0 0 30px ${glowColor}`,
                    }}
                >
                    {/* Shimmer sweep */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute inset-0 w-[50%] h-full opacity-[0.06]"
                            style={{
                                background: `linear-gradient(90deg, transparent, ${borderColor}, transparent)`,
                                animation: 'shimmerSlide 4s ease-in-out infinite',
                            }} />
                    </div>

                    {/* Author */}
                    <span
                        className="font-black uppercase text-[11px] tracking-[0.15em] block mb-1 relative"
                        style={{
                            color: nameColor,
                            textShadow: `0 0 8px ${glowColor}`,
                        }}
                    >
                        {msg.author}
                    </span>

                    {/* Message Text */}
                    <p className="text-white/90 text-[13px] font-medium leading-snug relative"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                        {msg.text}
                    </p>
                </div>
            </div>
        </motion.div>
    )
}
