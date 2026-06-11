import React from 'react'

export const GamerFrame = () => {
    return (
        <div className="absolute inset-0 pointer-events-none z-50">

            {/* ── CORNER BRACKETS (Top Left) ── */}
            <div className="absolute top-3 left-3 w-24 h-24">
                <div className="absolute top-0 left-0 w-full h-[2px]"
                    style={{ background: 'linear-gradient(90deg, var(--gamer-cyan) 0%, transparent 100%)' }} />
                <div className="absolute top-0 left-0 h-full w-[2px]"
                    style={{ background: 'linear-gradient(180deg, var(--gamer-cyan) 0%, transparent 100%)' }} />
                {/* Inner accent */}
                <div className="absolute top-[6px] left-[6px] w-3 h-3 border-t border-l"
                    style={{ borderColor: 'var(--gamer-cyan)', opacity: 0.5 }} />
                <div className="absolute top-[6px] left-[24px] w-10 h-[1px]"
                    style={{ background: 'var(--gamer-cyan)', opacity: 0.2 }} />
                <div className="absolute top-[24px] left-[6px] w-[1px] h-10"
                    style={{ background: 'var(--gamer-cyan)', opacity: 0.2 }} />
                {/* Dot indicator */}
                <div className="absolute top-[10px] left-[10px] w-1.5 h-1.5 rounded-full"
                    style={{ background: 'var(--gamer-cyan)', boxShadow: '0 0 6px var(--gamer-cyan)', animation: 'neonPulse 2s ease-in-out infinite' }} />
            </div>

            {/* ── CORNER BRACKETS (Top Right) ── */}
            <div className="absolute top-3 right-3 w-24 h-24">
                <div className="absolute top-0 right-0 w-full h-[2px]"
                    style={{ background: 'linear-gradient(270deg, var(--gamer-cyan) 0%, transparent 100%)' }} />
                <div className="absolute top-0 right-0 h-full w-[2px]"
                    style={{ background: 'linear-gradient(180deg, var(--gamer-cyan) 0%, transparent 100%)' }} />
                <div className="absolute top-[6px] right-[6px] w-3 h-3 border-t border-r"
                    style={{ borderColor: 'var(--gamer-cyan)', opacity: 0.5 }} />
                {/* Status text */}
                <div className="absolute top-[10px] right-[28px] text-[8px] font-mono tracking-[0.3em] uppercase"
                    style={{ color: 'var(--gamer-cyan)', opacity: 0.4 }}>
                    SYS
                </div>
            </div>

            {/* ── CORNER BRACKETS (Bottom Left) ── */}
            <div className="absolute bottom-3 left-3 w-24 h-24">
                <div className="absolute bottom-0 left-0 w-full h-[2px]"
                    style={{ background: 'linear-gradient(90deg, var(--gamer-cyan) 0%, transparent 100%)' }} />
                <div className="absolute bottom-0 left-0 h-full w-[2px]"
                    style={{ background: 'linear-gradient(0deg, var(--gamer-cyan) 0%, transparent 100%)' }} />
                <div className="absolute bottom-[6px] left-[6px] w-3 h-3 border-b border-l"
                    style={{ borderColor: 'var(--gamer-cyan)', opacity: 0.5 }} />
                {/* Tech decoration */}
                <div className="absolute bottom-[14px] left-[24px] flex gap-1">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="w-[3px] h-[3px]"
                            style={{ background: 'var(--gamer-cyan)', opacity: 0.15 + (i * 0.1) }} />
                    ))}
                </div>
            </div>

            {/* ── CORNER BRACKETS (Bottom Right) ── */}
            <div className="absolute bottom-3 right-3 w-24 h-24">
                <div className="absolute bottom-0 right-0 w-full h-[2px]"
                    style={{ background: 'linear-gradient(270deg, var(--gamer-cyan) 0%, transparent 100%)' }} />
                <div className="absolute bottom-0 right-0 h-full w-[2px]"
                    style={{ background: 'linear-gradient(0deg, var(--gamer-cyan) 0%, transparent 100%)' }} />
                <div className="absolute bottom-[6px] right-[6px] w-3 h-3 border-b border-r"
                    style={{ borderColor: 'var(--gamer-cyan)', opacity: 0.5 }} />
            </div>

            {/* ── EDGE ACCENTS (Mid-side) ── */}
            <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[2px] h-16"
                style={{ background: 'linear-gradient(180deg, transparent, var(--gamer-cyan-dim), transparent)' }} />
            <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[2px] h-16"
                style={{ background: 'linear-gradient(180deg, transparent, var(--gamer-cyan-dim), transparent)' }} />

            {/* ── TOP CENTER BAR ── */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 flex items-center gap-0">
                <div className="w-32 h-[1px]"
                    style={{ background: 'linear-gradient(90deg, transparent, var(--gamer-cyan-dim))' }} />
                <div className="w-16 h-[2px]"
                    style={{ background: 'var(--gamer-cyan)', boxShadow: '0 0 8px var(--gamer-cyan)' }} />
                <div className="w-32 h-[1px]"
                    style={{ background: 'linear-gradient(270deg, transparent, var(--gamer-cyan-dim))' }} />
            </div>

            {/* ── LIVE INDICATOR ── */}
            <div className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-5 py-1.5 rounded-full"
                style={{
                    background: 'rgba(0, 0, 0, 0.7)',
                    border: '1px solid rgba(255, 51, 85, 0.4)',
                    backdropFilter: 'blur(12px)',
                    boxShadow: '0 0 20px rgba(255, 51, 85, 0.15)'
                }}>
                <div className="relative">
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"
                        style={{ boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)' }} />
                    <div className="absolute inset-0 w-2.5 h-2.5 bg-red-500 rounded-full"
                        style={{ animation: 'ripple 2s ease-out infinite' }} />
                </div>
                <span className="text-red-400 font-bold tracking-[0.25em] text-[10px] uppercase">LIVE</span>
            </div>

            {/* ── SCANNING LINE ── */}
            <div className="absolute inset-0 overflow-hidden opacity-[0.03]">
                <div className="w-full h-[40%] animate-scanline"
                    style={{ background: 'linear-gradient(180deg, transparent, var(--gamer-cyan), transparent)' }} />
            </div>

            {/* ── BOTTOM CENTER STATUS ── */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full"
                        style={{ background: 'var(--gamer-green)', boxShadow: '0 0 6px var(--gamer-green)' }} />
                    <span className="text-[9px] font-mono tracking-[0.2em] uppercase"
                        style={{ color: 'var(--gamer-cyan)', opacity: 0.4 }}>
                        OVERLAY.V2 • ONLINE
                    </span>
                </div>
            </div>
        </div>
    )
}
