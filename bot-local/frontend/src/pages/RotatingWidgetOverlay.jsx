import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import TransactionsOverlay from './TransactionsOverlay'
import TopViewersOverlay from './TopViewersOverlay'

export default function RotatingWidgetOverlay() {
    const [config, setConfig] = useState(null)
    const [currentIndex, setCurrentIndex] = useState(0)

    const env = import.meta.env || {}
    const API_URL = env.VITE_API_URL || "/api"

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await axios.get(`${API_URL}/config?t=${Date.now()}`)
                setConfig(res.data)
            } catch (e) {
                console.error("Config fetch error", e)
            }
        }
        fetchConfig()
        const interval = setInterval(fetchConfig, 30000) // update config every 30s
        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        if (!config) return
        
        // Interval is in seconds, fallback to 15s
        const intervalSecs = config.tip_page?.rotating_widget_interval || 15
        
        const timer = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % 3)
        }, intervalSecs * 1000)
        
        return () => clearInterval(timer)
    }, [config])

    if (!config) return null

    const views = [
        <QRCodeView key="qr" config={config} />,
        <TransactionsOverlay key="tx" isRotating={true} />,
        <TopViewersOverlay key="viewers" isRotating={true} />
    ]

    return (
        <div className="w-screen h-screen bg-transparent overflow-hidden font-sans relative">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -100, opacity: 0 }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    className="absolute inset-0"
                >
                    {views[currentIndex]}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}

function QRCodeView({ config }) {
    const qrPath = config.tip_page?.custom_qr_path
    const upiVpa = config.tip_page?.custom_upi_id || config.upi_vpa || config.tip_page?.upi_vpa
    const showCustomUpi = config.tip_page?.show_custom_upi !== false

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-4">
            <motion.h2 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl md:text-5xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500"
                style={{ textShadow: '0 0 30px rgba(0,240,255,0.5)' }}>
                Scan to Donate
            </motion.h2>

            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{
                    opacity: 1,
                    scale: 1,
                }}
                transition={{
                    opacity: { duration: 0.5 },
                }}
                className="relative p-[3px] rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(0,240,255,0.3)] will-change-transform"
            >
                {/* Spinning thin border */}
                <div className="gamer-spin-border"
                    style={{ background: 'conic-gradient(from 0deg, transparent 0%, #00f0ff 25%, #fff 40%, #00f0ff 55%, transparent 75%, #ff8800 88%, transparent 100%)' }} />

                {/* Inner content (QR Code) */}
                <div className="relative bg-white rounded-[22px] overflow-hidden z-10 p-1 flex items-center justify-center">
                    {qrPath ? (
                        <img src={qrPath} alt="Donate QR" className="w-[450px] h-[450px] md:w-[500px] md:h-[500px] object-contain rounded-[18px]" />
                    ) : (
                        <div className="w-[450px] h-[450px] md:w-[500px] md:h-[500px] bg-zinc-900 flex items-center justify-center p-8 text-center rounded-[18px]">
                            <span className="text-sm text-zinc-500 font-medium">Upload a QR Code in Tip Page Settings</span>
                        </div>
                    )}
                </div>
            </motion.div>

            {showCustomUpi && upiVpa && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-col items-center gap-1 z-10">
                    <span className="text-sm text-cyan-400 font-bold uppercase tracking-[0.3em]">UPI ID</span>
                    <span className="text-white font-sans font-bold text-4xl px-8 py-3 rounded-2xl border-2 border-cyan-500/50 bg-black/60 shadow-[0_0_20px_rgba(0,240,255,0.2)] tracking-wider">
                        {upiVpa}
                    </span>
                </motion.div>
            )}
        </div>
    )
}
