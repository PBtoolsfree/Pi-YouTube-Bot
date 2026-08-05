import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function PokemonOverlay() {
    const [spawnedPokemon, setSpawnedPokemon] = useState(null)
    const [battleData, setBattleData] = useState(null)
    const [catchEvent, setCatchEvent] = useState(null)
    const wsRef = useRef(null)

    useEffect(() => {
        document.body.style.background = 'transparent'
        const connect = () => {
            const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
            const ws = new WebSocket(`${proto}://${window.location.host}/ws/logs`)
            
            ws.onmessage = (event) => {
                try {
                    const socketData = JSON.parse(event.data)
                    if (socketData.type !== 'POKEMON_EVENT') return

                    const { action } = socketData

                    if (action === 'spawn') {
                        setSpawnedPokemon(socketData.pokemon)
                        setCatchEvent(null)
                        
                        try {
                            const formattedName = socketData.pokemon.name.toLowerCase().replace(/[^a-z0-9-]/g, '')
                            const audio = new Audio(`https://play.pokemonshowdown.com/audio/cries/${formattedName}.mp3`)
                            audio.volume = 0.5
                            audio.play().catch(e => console.log('Audio play blocked:', e))
                        } catch(e) {
                            console.error('Failed to play pokemon cry', e)
                        }
                        
                        // Auto hide after 60s if not caught
                        setTimeout(() => {
                            setSpawnedPokemon(null)
                        }, 60000)
                    } 
                    else if (action === 'catch') {
                        setSpawnedPokemon(null)
                        setCatchEvent({
                            user: socketData.user,
                            pokemon: socketData.pokemon
                        })
                        
                        // Hide catch message after 5 seconds
                        setTimeout(() => {
                            setCatchEvent(null)
                        }, 5000)
                    }
                    else if (action === 'battle') {
                        setBattleData({
                            challenger: socketData.challenger,
                            target: socketData.target,
                            winner: socketData.winner,
                            bet: socketData.bet
                        })
                        
                        // Hide battle UI after 10 seconds
                        setTimeout(() => {
                            setBattleData(null)
                        }, 10000)
                    }
                } catch (e) {
                    console.error("WebSocket message parse error", e)
                }
            }
            
            ws.onclose = () => {
                setTimeout(connect, 3000)
            }
            
            wsRef.current = ws
        }
        
        connect()
        
        return () => {
            if (wsRef.current) {
                wsRef.current.close()
            }
        }
    }, [])

    return (
        <div className="w-screen h-screen overflow-hidden bg-transparent pointer-events-none relative flex flex-col items-center justify-end pb-20 font-sans">
            
            <AnimatePresence>
                {/* 1. Wild Pokemon Spawn */}
                {spawnedPokemon && !catchEvent && !battleData && (
                    <motion.div
                        initial={{ y: 200, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="bg-zinc-900/90 border-2 border-emerald-500 rounded-3xl p-6 flex flex-col items-center shadow-[0_0_50px_rgba(16,185,129,0.3)] backdrop-blur-md"
                    >
                        <h2 className="text-emerald-400 font-black text-2xl uppercase tracking-widest mb-2 animate-pulse">
                            Wild {spawnedPokemon.name} appeared!
                        </h2>
                        <img 
                            src={spawnedPokemon.sprite} 
                            alt={spawnedPokemon.name} 
                            className="w-48 h-48 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]" 
                        />
                        <p className="text-zinc-300 font-bold text-lg mt-4 bg-zinc-950 px-4 py-2 rounded-xl border border-zinc-800">
                            Type <span className="text-emerald-400">!catch</span> to capture
                        </p>
                    </motion.div>
                )}

                {/* 2. Catch Success */}
                {catchEvent && (
                    <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ y: -100, opacity: 0 }}
                        className="bg-zinc-900/95 border-2 border-cyan-500 rounded-3xl p-6 flex flex-col items-center shadow-[0_0_50px_rgba(6,182,212,0.4)]"
                    >
                        <div className="w-20 h-20 mb-4 rounded-full bg-cyan-500/20 flex items-center justify-center">
                            <span className="text-4xl">🏆</span>
                        </div>
                        <h2 className="text-cyan-400 font-black text-3xl uppercase tracking-widest text-center">
                            @{catchEvent.user} caught {catchEvent.pokemon.name}!
                        </h2>
                        <img 
                            src={catchEvent.pokemon.sprite} 
                            alt={catchEvent.pokemon.name} 
                            className="w-32 h-32 object-contain mt-4" 
                        />
                    </motion.div>
                )}

                {/* 3. Battle UI */}
                {battleData && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 1.2, opacity: 0 }}
                        className="bg-zinc-950/90 border-4 border-rose-500 rounded-3xl p-8 flex flex-col items-center shadow-[0_0_100px_rgba(244,63,94,0.5)] min-w-[600px] backdrop-blur-xl"
                    >
                        <h1 className="text-4xl font-black text-rose-500 uppercase tracking-widest mb-8 animate-pulse drop-shadow-lg">
                            POKEMON BATTLE ({battleData.bet} PTS)
                        </h1>
                        
                        <div className="flex items-center justify-between w-full px-8">
                            {/* Challenger */}
                            <div className="flex flex-col items-center">
                                <span className="text-zinc-400 font-bold mb-2">@{battleData.challenger.name}</span>
                                <img 
                                    src={battleData.challenger.pokemon.sprite} 
                                    className={`w-40 h-40 object-contain ${battleData.winner === battleData.challenger.name ? 'drop-shadow-[0_0_30px_rgba(16,185,129,1)]' : 'opacity-50 grayscale'}`} 
                                />
                                <span className="text-emerald-400 font-bold mt-2 text-xl">
                                    {battleData.challenger.pokemon.name}
                                </span>
                            </div>
                            
                            <div className="text-6xl font-black text-rose-500 italic px-8">VS</div>
                            
                            {/* Target */}
                            <div className="flex flex-col items-center">
                                <span className="text-zinc-400 font-bold mb-2">@{battleData.target.name}</span>
                                <img 
                                    src={battleData.target.pokemon.sprite} 
                                    className={`w-40 h-40 object-contain transform -scale-x-100 ${battleData.winner === battleData.target.name ? 'drop-shadow-[0_0_30px_rgba(16,185,129,1)]' : 'opacity-50 grayscale'}`} 
                                />
                                <span className="text-emerald-400 font-bold mt-2 text-xl">
                                    {battleData.target.pokemon.name}
                                </span>
                            </div>
                        </div>

                        <div className="mt-8 bg-zinc-900 px-8 py-4 rounded-2xl border border-zinc-800 text-center w-full">
                            <span className="text-2xl font-black text-white">
                                <span className="text-emerald-400">@{battleData.winner}</span> won the battle!
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
        </div>
    )
}
