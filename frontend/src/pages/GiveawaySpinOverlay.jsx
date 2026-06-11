import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy } from 'lucide-react'

const API_URL = import.meta?.env?.VITE_API_URL || '/api'
const WS_URL = window.location.protocol === 'https:' ? `wss://${window.location.host}/ws/logs` : `ws://${window.location.host}/ws/logs`

export default function GiveawaySpinOverlay() {
    const [participants, setParticipants] = useState([])
    const [rewardConfig, setRewardConfig] = useState(null)
    const [isSpinning, setIsSpinning] = useState(false)
    const [winners, setWinners] = useState([])
    const [showWinners, setShowWinners] = useState(false)
    const wsRef = useRef(null)

    // Setup WebSocket
    useEffect(() => {
        const connectWS = () => {
            const ws = new WebSocket(WS_URL)
            ws.onmessage = (e) => {
                const data = JSON.parse(e.data)
                if (data.type === 'giveaway_update') {
                    if (data.action === 'spin') {
                        startSpin()
                    } else {
                        fetchData() // Refresh list on new entry, clear, remove
                    }
                }
            }
            ws.onclose = () => setTimeout(connectWS, 2000)
            wsRef.current = ws
        }
        connectWS()
        fetchData()
        
        return () => {
            if (wsRef.current) wsRef.current.close()
        }
    }, [])

    const fetchData = async () => {
        try {
            const [pRes, rRes] = await Promise.all([
                axios.get(`${API_URL}/giveaway/participants`),
                axios.get(`${API_URL}/redeems`)
            ])
            setParticipants(pRes.data)
            
            const ticket = rRes.data.find(r => r.type === 'giveaway_ticket' && r.enabled)
            if (ticket) setRewardConfig(ticket)
        } catch (e) {
            console.error("Dashboard error:", e)
        }
    }

    const startSpin = async () => {
        if (isSpinning) return
        
        // Refresh participants one last time right before spin to be accurate
        let currentParticipants = []
        let config = null
        try {
            const [pRes, rRes] = await Promise.all([
                axios.get(`${API_URL}/giveaway/participants`),
                axios.get(`${API_URL}/redeems`)
            ])
            currentParticipants = pRes.data
            setParticipants(currentParticipants)
            
            config = rRes.data.find(r => r.type === 'giveaway_ticket' && r.enabled)
            setRewardConfig(config)
        } catch (e) { return }

        if (currentParticipants.length === 0) return
        
        const duration = (config?.giveaway_spin_duration || 5) * 1000
        const winnerCount = Math.min(config?.giveaway_multi_winner || 1, currentParticipants.length)
        
        // Pick winners immediately so the overlay knows where to stop
        const shuffled = [...currentParticipants].sort(() => 0.5 - Math.random())
        const chosenWinners = shuffled.slice(0, winnerCount)
        
        setWinners(chosenWinners)
        setIsSpinning(true)
        setShowWinners(false)

        // Simulate spinning delay
        setTimeout(() => {
            // Unmount spinner and show winners
            setIsSpinning(false)
            setShowWinners(true)
            
            axios.post(`${API_URL}/giveaway/announce`, { 
                winners: chosenWinners.map(w => w.name),
                prize: config?.giveaway_prize || ""
            }).catch(e=>e)
            
            // Post-spin elimination
            if (config?.giveaway_elimination) {
                chosenWinners.forEach(w => {
                    axios.post(`${API_URL}/giveaway/remove`, { author: w.name }).catch(e=>e)
                })
            }
            
            // Hide winners after 10s
            setTimeout(() => {
                setShowWinners(false)
            }, 10000)
            
        }, duration)
    }

    // A spinning wheel UI based on style
    const style = rewardConfig?.giveaway_wheel_style || 'roulette'

    if (!isSpinning && !showWinners) {
        if (!rewardConfig) return null // Totally hidden if no active giveaway ticket in shop

        return (
            <div className="w-full h-full p-8 flex items-end justify-end overflow-hidden pointer-events-none font-sans">
                <motion.div 
                    initial={{ opacity: 0, x: 50 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    className="bg-black/70 backdrop-blur-md border-2 border-indigo-500/40 rounded-2xl p-6 w-[400px] shadow-[0_0_30px_rgba(99,102,241,0.2)]"
                >
                    <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2 uppercase tracking-wide">
                        <Trophy className="h-6 w-6 text-yellow-400" />
                        Live Giveaway
                    </h3>
                    <p className="text-sm text-indigo-300 mb-4 font-semibold">
                        Type <span className="bg-indigo-600 text-white px-2 py-0.5 rounded mx-1">!redeem {rewardConfig.name}</span> to enter!
                    </p>
                    
                    <div className="flex justify-between items-end mb-2 border-b border-white/10 pb-2">
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Entries</span>
                        <span className="text-sm font-black text-indigo-400">{participants.length}</span>
                    </div>

                    <div className="flex flex-col gap-2 max-h-[300px] overflow-hidden relative">
                         {participants.length === 0 ? (
                             <div className="text-center text-zinc-500 text-sm py-4 italic">Waiting for players...</div>
                         ) : (
                             <AnimatePresence>
                                 {participants.slice(-6).map(p => (
                                     <motion.div 
                                         key={p.name}
                                         initial={{ opacity: 0, height: 0, x: 20 }}
                                         animate={{ opacity: 1, height: 'auto', x: 0 }}
                                         exit={{ opacity: 0, height: 0 }}
                                         className="bg-indigo-900/30 border border-indigo-500/30 px-3 py-2.5 rounded-lg text-white font-bold flex items-center justify-between"
                                      >
                                          <span className="truncate max-w-[200px]">{p.name}</span>
                                          <span className="text-[10px] uppercase text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">Entered</span>
                                      </motion.div>
                                 ))}
                             </AnimatePresence>
                         )}
                         {participants.length > 6 && (
                              <div className="text-center text-xs font-bold text-indigo-500 mt-2 bg-indigo-500/10 rounded py-1 border border-indigo-500/10">
                                  + {participants.length - 6} more entries
                              </div>
                         )}
                    </div>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="w-full h-full flex items-center justify-center bg-black/40 backdrop-blur-sm overflow-hidden text-white font-sans">
            <AnimatePresence mode="wait">
                {isSpinning && (
                    <SpinAnimation key="spinning" style={style} participants={participants} winners={winners} duration={rewardConfig?.giveaway_spin_duration || 5} />
                )}
                {showWinners && (
                    <WinnerDisplay key="winners" winners={winners} prize={rewardConfig?.giveaway_prize} />
                )}
            </AnimatePresence>
        </div>
    )
}

function SpinAnimation({ style, participants, duration, winners }) {
    const mainWinner = winners && winners.length > 0 ? winners[0] : participants[0];
    const spinSecs = duration;

    // Helper to generate an array of items for linear styles (csgo, slot)
    const generateStrip = (targetIndex, totalItems) => {
        let items = [];
        for (let i = 0; i < totalItems; i++) {
           if (i === targetIndex) {
               items.push(mainWinner);
           } else {
               const randP = participants[Math.floor(Math.random() * participants.length)];
               items.push(randP);
           }
        }
        return items;
    };

    if (style === 'csgo') {
        const itemWidth = 208; // 192px width + 16px gap
        const targetIndex = 40;
        const totalItems = 50;
        const items = generateStrip(targetIndex, totalItems);
        // Add random offset so it doesn't land perfectly center every time (-75 to +75 px)
        const randomOffset = (Math.random() * 150) - 75;
        const targetX = -(targetIndex * itemWidth) + randomOffset;

        return (
            <motion.div 
                initial={{ opacity: 0, scale: 0.8 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 1.2 }}
                className="bg-zinc-900 border-2 border-indigo-500/50 p-8 rounded-xl shadow-[0_0_50px_rgba(99,102,241,0.3)] w-[900px] max-w-[90vw]"
            >
               <h2 className="text-3xl font-black text-center mb-6 text-indigo-400 uppercase tracking-widest">Rolling...</h2>
               <div className="relative h-40 bg-zinc-950 overflow-hidden rounded-lg border-2 border-white/10 flex items-center shadow-[inset_0_0_50px_rgba(0,0,0,0.8)]">
                   {/* Center indicator */}
                   <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-yellow-400 z-10 shadow-[0_0_15px_yellow]" />
                   
                   <div className="absolute top-0 bottom-0 left-1/2" style={{ width: 0 }}>
                       <motion.div 
                          className="flex gap-4 items-center absolute top-1/2 -translate-y-1/2"
                          style={{ marginLeft: -96 }} // center the first element
                          initial={{ x: 0 }}
                          animate={{ x: targetX }}
                          transition={{ duration: spinSecs, ease: [0.1, 0.9, 0.2, 1] }}
                       >
                           {items.map((p, i) => (
                               <div key={i} className={`min-w-[192px] h-28 rounded-lg flex flex-col items-center justify-center font-bold border-2 shadow-lg ${i === targetIndex ? 'bg-gradient-to-br from-yellow-600 to-yellow-900 border-yellow-400 z-10 scale-110' : 'bg-gradient-to-br from-indigo-900 to-purple-900 border-indigo-400/30'}`}>
                                   <div className="h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center font-bold text-sm uppercase mb-2">
                                       {p.name.charAt(0)}
                                   </div>
                                   <span className="w-full text-center px-2 text-white shadow-black [text-shadow:_0_2px_4px_rgb(0_0_0_/_50%)] text-[15px] leading-tight break-all overflow-hidden h-10">{p.name}</span>
                               </div>
                           ))}
                       </motion.div>
                   </div>
               </div>
            </motion.div>
        )
    }

    if (style === 'slot') {
        const itemHeight = 96; // 80px + 16px gap
        const targetIndex = 40;
        const totalItems = 50;
        const items = generateStrip(targetIndex, totalItems);
        const randomOffset = (Math.random() * 60) - 30;
        const targetY = -(targetIndex * itemHeight) + randomOffset;

         return (
            <motion.div 
                initial={{ opacity: 0, scale: 0.8 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 1.2 }}
                className="bg-gradient-to-b from-zinc-800 to-zinc-950 border-4 border-yellow-500/50 p-8 rounded-3xl shadow-[0_0_50px_rgba(234,179,8,0.3)] w-[400px]"
            >
                <div className="relative h-[400px] w-full bg-zinc-950 overflow-hidden rounded-xl border-2 border-white/10 shadow-[inset_0_0_50px_rgba(0,0,0,0.8)]">
                    {/* Shadow overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-transparent to-black/90 z-10 pointer-events-none" />
                    {/* Center indicator */}
                    <div className="absolute left-0 right-0 top-1/2 h-20 -translate-y-1/2 border-y-4 border-yellow-500 bg-yellow-500/20 z-0" />
                    
                    <div className="absolute top-1/2 left-0 right-0" style={{ height: 0 }}>
                        <motion.div 
                            className="flex flex-col gap-4 text-center items-center absolute w-full"
                            style={{ marginTop: -40 }} // center first element (h-20/2)
                            initial={{ y: 0 }}
                            animate={{ y: targetY }}
                            transition={{ duration: spinSecs, ease: [0.1, 0.9, 0.1, 1] }}
                        >
                            {items.map((p, i) => (
                               <div key={i} className={`h-20 w-64 flex items-center justify-center font-black uppercase relative z-20 rounded-lg ${i === targetIndex ? 'text-yellow-400 scale-110 drop-shadow-[0_0_10px_rgba(234,179,8,0.8)]' : 'text-zinc-500 drop-shadow-md'}`}>
                                   <span className="px-2 text-xl block w-full whitespace-nowrap overflow-hidden text-ellipsis px-4 bg-zinc-900/50 py-2 rounded-md">{p.name}</span>
                               </div>
                           ))}
                        </motion.div>
                    </div>
                </div>
            </motion.div>
         )
    }

    // Default: roulette
    const displayCount = Math.min(participants.length, 24);
    let displayWheel = [...participants].sort(() => 0.5 - Math.random());
    const winnerExists = displayWheel.find(p => p.name === mainWinner.name);
    if (!winnerExists) {
         displayWheel[0] = mainWinner;
    }
    displayWheel = displayWheel.slice(0, displayCount).sort(() => 0.5 - Math.random());
    // Ensure winner is in the display pool
    if (!displayWheel.find(p => p.name === mainWinner.name)) {
        displayWheel[Math.floor(Math.random() * displayWheel.length)] = mainWinner;
    }

    const sliceDegree = 360 / displayCount;
    const winnerSliceIndex = displayWheel.findIndex(p => p.name === mainWinner.name);
    
    // Create vibrant distinct colors
    const colors = ['#4f46e5', '#312e81', '#ec4899', '#be185d', '#eab308', '#854d0e', '#10b981', '#047857', '#8b5cf6', '#4c1d95', '#0ea5e9', '#0369a1'];
    const gradientStops = displayWheel.map((_, i) => {
        const c1 = colors[i % colors.length];
        return `${c1} ${i * sliceDegree}deg ${(i + 1) * sliceDegree}deg`;
    }).join(', ');
    const gradientString = `conic-gradient(${gradientStops})`;

    // Rotate backwards by the center of the winner's slice, plus 8 full fast rotations
    // The pointer is at 0 degrees (top center). 
    // Wheel natural start: Slice 0 is from 0 to sliceDegree. Center is sliceDegree/2.
    // To move slice N center to 0, we rotate -((N * sliceDegree) + (sliceDegree / 2)).
    const targetRotation = (360 * 10) - (winnerSliceIndex * sliceDegree + (sliceDegree / 2));

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.8 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 1.2 }}
            className="relative"
        >
            {/* Pointer */}
            <div className="absolute left-1/2 -top-6 -translate-x-1/2 transform text-yellow-400 z-20 drop-shadow-[0_0_15px_rgba(234,179,8,1)]">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21l-12-18h24z"/></svg>
            </div>
            
            <motion.div 
                className="h-[600px] w-[600px] rounded-full border-[10px] border-zinc-900 shadow-[0_0_80px_rgba(99,102,241,0.6)] overflow-hidden relative bg-zinc-900"
                animate={{ rotate: [0, targetRotation] }}
                transition={{ duration: spinSecs, ease: [0.1, 0.9, 0.1, 1] }}
            >
                {/* Wheel Slices */}
                <div className="absolute inset-0 opacity-90" style={{ background: gradientString }} />
                
                {/* Center Hub */}
                <div className="absolute inset-0 flex items-center justify-center z-30">
                    <div className="h-24 w-24 rounded-full bg-zinc-950 border-4 border-yellow-500 shadow-[0_0_30px_rgba(0,0,0,1)] flex items-center justify-center">
                        <Trophy className="h-10 w-10 text-yellow-500" />
                    </div>
                </div>
                
                {/* Names inside Slices */}
                {displayWheel.map((p, i) => {
                    // Place the text exactly in the middle of each slice.
                    const rotation = (i + 0.5) * sliceDegree;
                    return (
                        <div key={i} className="absolute inset-0 flex items-start justify-center pt-[30px] z-20" style={{ transform: `rotate(${rotation}deg)`}}>
                             <span className="font-bold text-white text-[18px] shadow-black [text-shadow:_0_3px_5px_rgb(0_0_0_/_90%)] max-w-[200px] whitespace-nowrap overflow-hidden text-ellipsis px-4" style={{ transform: 'rotate(-90deg)', transformOrigin: 'center center', display: 'inline-block'}}>{p.name}</span>
                        </div>
                    )
                })}
            </motion.div>
        </motion.div>
    )
}

function WinnerDisplay({ winners, prize }) {
    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.5, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="flex flex-col items-center justify-center relative z-50"
        >
            <motion.div 
                animate={{ y: [0, -20, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
                <Trophy className="h-32 w-32 text-yellow-400 mb-8 drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]" />
            </motion.div>
            
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-500 to-yellow-600 uppercase tracking-widest drop-shadow-lg mb-4">
                {winners.length > 1 ? "Winners!" : "Winner!"}
            </h1>
            
            {prize && (
                <motion.div 
                    initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, type: 'spring' }}
                    className="text-4xl font-black text-white mb-8 bg-indigo-600/80 px-8 py-3 rounded-full border-2 border-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.6)]"
                >
                    Won: {prize}
                </motion.div>
            )}
            
            <div className="flex flex-wrap justify-center gap-6 max-w-6xl">
                {winners.map((w, i) => (
                     <motion.div 
                        key={i}
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.2 }}
                        className="bg-zinc-900/80 border-2 border-yellow-500/50 p-6 rounded-2xl shadow-[0_0_30px_rgba(234,179,8,0.3)] backdrop-blur-md min-w-64 text-center"
                    >
                        <span className="text-4xl font-bold text-white uppercase tracking-wider">{w.name}</span>
                    </motion.div>
                ))}
            </div>
            
            <div className="absolute inset-0 pointer-events-none flex justify-center items-center overflow-hidden">
                 {/* Fake Confetti using DOM nodes */}
                 {Array.from({ length: 50 }).map((_, i) => (
                    <motion.div
                        key={i}
                        className={`absolute w-3 h-3 ${['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500'][i % 5]}`}
                        initial={{ 
                            y: "100vh", 
                            x: `${Math.random() * 100}vw`,
                            rotate: 0 
                        }}
                        animate={{ 
                            y: "-10vh", 
                            x: `${Math.random() * 100}vw`,
                            rotate: Math.random() * 360 
                        }}
                        transition={{ 
                            duration: 2 + Math.random() * 2, 
                            repeat: Infinity,
                            delay: Math.random() * 2 
                        }}
                    />
                 ))}
            </div>
        </motion.div>
    )
}
