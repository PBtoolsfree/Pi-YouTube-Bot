import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'

export default function PokemonOverlay() {
    const [spawnedPokemon, setSpawnedPokemon] = useState(null)
    const [battleData, setBattleData] = useState(null)
    const [catchEvent, setCatchEvent] = useState(null)
    const [remainingSeconds, setRemainingSeconds] = useState(60)
    const [imageError, setImageError] = useState(false)
    const [gameSettings, setGameSettings] = useState({
        enable_images: true,
        enable_cries: true,
        catch_cost: 10
    })

    const wsRef = useRef(null)
    const timerRef = useRef(null)
    const reconnectTimeoutRef = useRef(null)

    // Ensure document and body are completely transparent in OBS Browser Source
    useEffect(() => {
        document.body.style.backgroundColor = 'transparent'
        document.body.style.background = 'transparent'
        document.documentElement.style.backgroundColor = 'transparent'
        document.documentElement.style.background = 'transparent'
        if (document.body.classList.contains('bg-zinc-950')) {
            document.body.classList.remove('bg-zinc-950')
        }
    }, [])

    // Load Game Configuration (images, cries, catch cost)
    const loadGameConfig = async () => {
        try {
            const res = await axios.get('/api/loyalty/config')
            if (res.data?.games?.pokemon) {
                const pokeCfg = res.data.games.pokemon
                setGameSettings({
                    enable_images: pokeCfg.enable_images !== false,
                    enable_cries: pokeCfg.enable_cries !== false,
                    catch_cost: pokeCfg.catch_cost ?? 10
                })
            }
        } catch (e) {
            console.debug("Loyalty config load skipped:", e.message)
        }
    }

    // Recover Active Wild Pokemon State upon Mount / Reconnect
    const recoverActivePokemon = async () => {
        try {
            const res = await axios.get('/api/loyalty/pokemon/active')
            if (res.data?.active && res.data.pokemon) {
                const rem = res.data.remaining_seconds || 60
                setSpawnedPokemon({
                    ...res.data.pokemon,
                    is_test: Boolean(res.data.is_test)
                })
                setRemainingSeconds(rem)
                setImageError(false)
                startCountdown(rem)
            }
        } catch (e) {
            console.debug("Active pokemon recovery skipped:", e.message)
        }
    }

    const startCountdown = (initialSeconds) => {
        if (timerRef.current) clearInterval(timerRef.current)
        setRemainingSeconds(initialSeconds)
        timerRef.current = setInterval(() => {
            setRemainingSeconds((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current)
                    setSpawnedPokemon(null)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }

    const playPokemonCry = (pokemonName) => {
        if (!gameSettings.enable_cries) return
        try {
            const formattedName = pokemonName.toLowerCase().replace(/[^a-z0-9-]/g, '')
            const audio = new Audio(`https://play.pokemonshowdown.com/audio/cries/${formattedName}.mp3`)
            audio.volume = 0.5
            audio.play().catch(e => console.debug('Audio playback blocked or unavailable:', e))
        } catch (e) {
            console.debug('Failed to play pokemon cry:', e)
        }
    }

    // Real-time WebSocket connection to /ws/overlay
    useEffect(() => {
        loadGameConfig()
        recoverActivePokemon()

        let isUnmounted = false

        const connect = () => {
            if (isUnmounted) return
            const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
            const wsUrl = `${proto}//${window.location.host}/ws/overlay`
            const ws = new WebSocket(wsUrl)

            ws.onopen = () => {
                console.log("[OBS Pokemon Overlay] Connected to overlay websocket.")
                // Refresh active state upon websocket (re)connect
                recoverActivePokemon()
            }

            ws.onmessage = (event) => {
                try {
                    const socketData = JSON.parse(event.data)
                    const type = (socketData.type || '').toLowerCase()
                    if (type !== 'pokemon_event') return

                    const action = (socketData.action || '').toLowerCase()

                    if (action === 'spawn') {
                        const poke = socketData.pokemon
                        if (!poke) return

                        const rem = socketData.remaining_seconds || 60
                        setSpawnedPokemon({
                            ...poke,
                            is_test: Boolean(socketData.is_test)
                        })
                        setCatchEvent(null)
                        setBattleData(null)
                        setImageError(false)

                        playPokemonCry(poke.name)
                        startCountdown(rem)
                    } 
                    else if (action === 'despawn') {
                        if (timerRef.current) clearInterval(timerRef.current)
                        setSpawnedPokemon(null)
                    }
                    else if (action === 'catch') {
                        if (timerRef.current) clearInterval(timerRef.current)
                        setSpawnedPokemon(null)
                        setCatchEvent({
                            user: socketData.user,
                            pokemon: socketData.pokemon
                        })
                        setTimeout(() => setCatchEvent(null), 6000)
                    }
                    else if (action === 'battle') {
                        setBattleData({
                            challenger: socketData.challenger,
                            target: socketData.target,
                            winner: socketData.winner,
                            bet: socketData.bet
                        })
                        setTimeout(() => setBattleData(null), 10000)
                    }
                    else if (action === 'show') {
                        setSpawnedPokemon({
                            name: socketData.pokemon.name,
                            sprite: socketData.pokemon.sprite,
                            type: socketData.pokemon.type,
                            power: socketData.pokemon.power,
                            isShow: true,
                            user: socketData.user
                        })
                        setCatchEvent(null)
                        setBattleData(null)
                        setTimeout(() => setSpawnedPokemon(null), 8000)
                    }
                } catch (e) {
                    console.debug("[OBS Pokemon Overlay] WS message parse error:", e)
                }
            }

            ws.onclose = () => {
                console.warn("[OBS Pokemon Overlay] WebSocket disconnected. Reconnecting in 3s...")
                if (!isUnmounted) {
                    reconnectTimeoutRef.current = setTimeout(connect, 3000)
                }
            }

            ws.onerror = (err) => {
                console.debug("[OBS Pokemon Overlay] WebSocket error:", err)
            }

            wsRef.current = ws
        }

        connect()

        return () => {
            isUnmounted = true
            if (timerRef.current) clearInterval(timerRef.current)
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
            if (wsRef.current) wsRef.current.close()
        }
    }, [])

    return (
        <div className="w-screen h-screen overflow-hidden bg-transparent pointer-events-none relative flex flex-col items-center justify-end pb-16 font-sans select-none">
            
            <AnimatePresence>
                {/* 1. Wild Pokemon Spawn & Show */}
                {spawnedPokemon && !catchEvent && !battleData && (
                    <motion.div
                        key={`pokemon-${spawnedPokemon.name}-${spawnedPokemon.is_test ? 'test' : 'live'}`}
                        initial={{ y: 220, opacity: 0, scale: 0.85 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 150, opacity: 0, scale: 0.9 }}
                        transition={{ type: "spring", stiffness: 350, damping: 28 }}
                        className={`border-2 rounded-3xl p-6 flex flex-col items-center backdrop-blur-xl shadow-2xl relative ${
                            spawnedPokemon.isShow 
                                ? 'bg-zinc-950/90 border-fuchsia-500 shadow-[0_0_50px_rgba(217,70,239,0.45)]' 
                                : spawnedPokemon.is_test
                                    ? 'bg-zinc-950/90 border-amber-400 shadow-[0_0_50px_rgba(251,191,36,0.45)]'
                                    : 'bg-zinc-950/90 border-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.4)]'
                        }`}
                        style={{ minWidth: '340px', maxWidth: '440px' }}
                    >
                        {/* Test Spawn or Show Badge */}
                        {spawnedPokemon.is_test && !spawnedPokemon.isShow && (
                            <div className="mb-2 px-3 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 font-black text-xs uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                                <span className="animate-pulse">⚡</span> TEST SPAWN
                            </div>
                        )}

                        {/* Title Header */}
                        <h2 className={`font-black text-2xl uppercase tracking-wider text-center drop-shadow-md ${
                            spawnedPokemon.isShow 
                                ? 'text-fuchsia-400' 
                                : spawnedPokemon.is_test
                                    ? 'text-amber-300'
                                    : 'text-emerald-400 animate-pulse'
                        }`}>
                            {spawnedPokemon.isShow 
                                ? `@${spawnedPokemon.user} showed ${spawnedPokemon.name}!` 
                                : `Wild ${spawnedPokemon.name} appeared!`}
                        </h2>

                        {/* Type & Power Chips */}
                        {(spawnedPokemon.type || spawnedPokemon.power) && (
                            <div className="flex items-center gap-2 mt-1 mb-2">
                                {spawnedPokemon.type && (
                                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-zinc-800/90 text-zinc-300 border border-zinc-700">
                                        Type: {spawnedPokemon.type}
                                    </span>
                                )}
                                {spawnedPokemon.power && (
                                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-zinc-800/90 text-amber-300 border border-zinc-700">
                                        PWR {spawnedPokemon.power}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Pokemon Graphic */}
                        {gameSettings.enable_images ? (
                            <div className="relative w-44 h-44 flex items-center justify-center my-1">
                                {!imageError && spawnedPokemon.sprite ? (
                                    <img 
                                        src={spawnedPokemon.sprite} 
                                        alt={spawnedPokemon.name}
                                        onError={() => setImageError(true)}
                                        className="w-44 h-44 object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.45)] transform hover:scale-105 transition-transform" 
                                    />
                                ) : (
                                    <div className="w-36 h-36 rounded-full bg-zinc-900 border-2 border-zinc-700 flex flex-col items-center justify-center shadow-inner">
                                        <span className="text-5xl">🔴</span>
                                        <span className="text-zinc-400 font-bold text-xs uppercase mt-1">{spawnedPokemon.name}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="py-4 text-center">
                                <span className="text-4xl">🐾</span>
                            </div>
                        )}

                        {/* Call to action & timer */}
                        {!spawnedPokemon.isShow && (
                            <div className="w-full mt-3 flex flex-col items-center gap-2">
                                <div className="text-zinc-200 font-bold text-sm bg-zinc-900/90 px-4 py-1.5 rounded-xl border border-zinc-800 flex items-center gap-2 shadow-inner">
                                    Type <span className="text-emerald-400 font-extrabold font-mono">!catch</span> to capture
                                    {gameSettings.catch_cost > 0 && (
                                        <span className="text-zinc-500 text-xs font-semibold">({gameSettings.catch_cost} pts)</span>
                                    )}
                                </div>
                                <div className="w-full flex items-center justify-between text-[11px] text-zinc-400 px-2 font-mono">
                                    <span>Safari Event</span>
                                    <span className="text-rose-400 font-bold">Despawns in {remainingSeconds}s</span>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* 2. Catch Success Event */}
                {catchEvent && (
                    <motion.div
                        key={`catch-${catchEvent.user}`}
                        initial={{ scale: 0.6, opacity: 0, y: 50 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ y: -80, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className="bg-zinc-950/95 border-2 border-cyan-400 rounded-3xl p-6 flex flex-col items-center shadow-[0_0_60px_rgba(6,182,212,0.5)] backdrop-blur-xl"
                        style={{ minWidth: '340px' }}
                    >
                        <div className="w-16 h-16 mb-2 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shadow-md">
                            <span className="text-3xl animate-bounce">🏆</span>
                        </div>
                        <h2 className="text-cyan-300 font-black text-2xl uppercase tracking-wider text-center drop-shadow-sm">
                            @{catchEvent.user} caught {catchEvent.pokemon.name}!
                        </h2>
                        {catchEvent.pokemon.sprite && (
                            <img 
                                src={catchEvent.pokemon.sprite} 
                                alt={catchEvent.pokemon.name} 
                                className="w-32 h-32 object-contain mt-2 drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]" 
                            />
                        )}
                        <span className="mt-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">
                            Added to Viewer Pokédex
                        </span>
                    </motion.div>
                )}

                {/* 3. Duel Battle UI */}
                {battleData && (
                    <motion.div
                        key={`battle-${battleData.challenger.name}-${battleData.target.name}`}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 1.1, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 26 }}
                        className="bg-zinc-950/95 border-4 border-rose-500 rounded-3xl p-8 flex flex-col items-center shadow-[0_0_100px_rgba(244,63,94,0.55)] min-w-[580px] backdrop-blur-2xl"
                    >
                        <h1 className="text-3xl font-black text-rose-500 uppercase tracking-widest mb-6 animate-pulse drop-shadow-lg">
                            POKÉMON DUEL ({battleData.bet} PTS)
                        </h1>
                        
                        <div className="flex items-center justify-between w-full px-6">
                            {/* Challenger */}
                            <div className="flex flex-col items-center w-48">
                                <span className="text-zinc-300 font-bold mb-1 text-sm truncate max-w-[160px]">@{battleData.challenger.name}</span>
                                <img 
                                    src={battleData.challenger.pokemon.sprite} 
                                    alt={battleData.challenger.pokemon.name}
                                    className={`w-36 h-36 object-contain ${
                                        battleData.winner === battleData.challenger.name 
                                            ? 'drop-shadow-[0_0_30px_rgba(16,185,129,1)] scale-105' 
                                            : 'opacity-40 grayscale'
                                    }`} 
                                />
                                <span className="text-emerald-400 font-bold mt-1 text-base">
                                    {battleData.challenger.pokemon.name}
                                </span>
                            </div>
                            
                            <div className="text-5xl font-black text-rose-500 italic px-4 select-none">VS</div>
                            
                            {/* Target */}
                            <div className="flex flex-col items-center w-48">
                                <span className="text-zinc-300 font-bold mb-1 text-sm truncate max-w-[160px]">@{battleData.target.name}</span>
                                <img 
                                    src={battleData.target.pokemon.sprite} 
                                    alt={battleData.target.pokemon.name}
                                    className={`w-36 h-36 object-contain transform -scale-x-100 ${
                                        battleData.winner === battleData.target.name 
                                            ? 'drop-shadow-[0_0_30px_rgba(16,185,129,1)] scale-105' 
                                            : 'opacity-40 grayscale'
                                    }`} 
                                />
                                <span className="text-emerald-400 font-bold mt-1 text-base">
                                    {battleData.target.pokemon.name}
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 bg-zinc-900 px-8 py-3 rounded-2xl border border-zinc-800 text-center w-full shadow-inner">
                            <span className="text-xl font-black text-white">
                                👑 <span className="text-emerald-400">@{battleData.winner}</span> won the duel!
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
        </div>
    )
}
