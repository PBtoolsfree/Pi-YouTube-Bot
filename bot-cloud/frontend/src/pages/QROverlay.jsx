import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { motion } from 'framer-motion'
import QRCode from 'react-qr-code'

export default function QROverlay() {
    const [config, setConfig] = useState(null)
    const [error, setError] = useState(null)
    const API_URL = import.meta.env?.VITE_API_URL || "/api"

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await axios.get(`${API_URL}/config`)
                setConfig(res.data)
            } catch (err) {
                setError("Failed to fetch configuration")
            }
        }
        fetchConfig()
        const interval = setInterval(fetchConfig, 30000)
        return () => clearInterval(interval)
    }, [])

    if (!config) return null
    if (error) return <div className="text-red-500 bg-black p-4 font-mono">{error}</div>

    const qrPath = config.tip_page?.custom_qr_path
    const upiVpa = config.tip_page?.custom_upi_id || config.upi_vpa || config.tip_page?.upi_vpa
    const payeeName = config.tip_page?.payee_name || config.channel_name || "Creator"
    const showCustomUpi = config.tip_page?.show_custom_upi !== false

    const baseParams = `pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(payeeName)}&cu=INR`
    const upiUrlQR = `upi://pay?${baseParams}`

    return (
        <div className="w-screen h-screen overflow-hidden bg-transparent flex flex-col items-center justify-center p-8 gap-4 font-sans">
            <motion.h2 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl md:text-3xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 drop-shadow-lg"
                style={{ textShadow: '0 0 15px rgba(0,240,255,0.5)' }}>
                Scan to Support
            </motion.h2>

            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ opacity: { duration: 0.5 } }}
                className="relative p-[3px] rounded-3xl overflow-hidden shadow-[0_0_40px_rgba(0,240,255,0.2)] will-change-transform"
            >
                {/* Spinning thin border */}
                <div className="absolute inset-0 z-0 animate-[spin_4s_linear_infinite]"
                    style={{ background: 'conic-gradient(from 0deg, transparent 0%, #00f0ff 25%, #fff 40%, #00f0ff 55%, transparent 75%, #10b981 88%, transparent 100%)' }} />

                {/* Inner content (QR Code) */}
                <div className="relative bg-white rounded-[22px] overflow-hidden z-10 p-2 flex items-center justify-center w-[300px] h-[300px] md:w-[400px] md:h-[400px]">
                    {qrPath ? (
                        <img src={qrPath} alt="Donate QR" className="w-full h-full object-contain rounded-[18px]" />
                    ) : upiVpa ? (
                        <QRCode value={upiUrlQR} size={400} className="w-full h-full p-2 object-contain" />
                    ) : (
                        <div className="bg-zinc-900 w-full h-full flex items-center justify-center p-8 text-center rounded-[18px]">
                            <span className="text-sm text-zinc-500 font-medium">Please set UPI ID in Tip Settings</span>
                        </div>
                    )}
                </div>
            </motion.div>

            {showCustomUpi && upiVpa && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 px-6 py-2 rounded-full border border-cyan-500/30 bg-zinc-950/80 backdrop-blur-md shadow-[0_0_20px_rgba(0,240,255,0.15)]"
                >
                    <span className="text-cyan-400 font-mono text-sm md:text-lg font-bold tracking-wider">{upiVpa}</span>
                </motion.div>
            )}
        </div>
    )
}
