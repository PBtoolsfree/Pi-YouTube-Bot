import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, CardHeader, CardTitle, CardContent, Button, Label } from '@/components/ui'
import { Gift, Trash, Play, Users, Trophy, UserMinus, RefreshCw } from 'lucide-react'

const API_URL = import.meta?.env?.VITE_API_URL || '/api'

export default function Giveaways() {
    const [participants, setParticipants] = useState([])
    const [history, setHistory] = useState([])
    const [isLoading, setIsLoading] = useState(true)

    const fetchData = async () => {
        try {
            const [pRes, hRes] = await Promise.all([
                axios.get(`${API_URL}/giveaway/participants`),
                axios.get(`${API_URL}/giveaway/history`)
            ])
            setParticipants(pRes.data)
            setHistory(hRes.data)
        } catch (e) {
            console.error("Failed to fetch giveaway data", e)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 5000)
        return () => clearInterval(interval)
    }, [])

    const handleClear = async () => {
        if (!confirm("Are you sure you want to clear all participants?")) return
        try {
            await axios.post(`${API_URL}/giveaway/clear`)
            fetchData()
        } catch (e) {
            alert("Failed to clear list")
        }
    }

    const handleRemove = async (author) => {
        try {
            await axios.post(`${API_URL}/giveaway/remove`, { author })
            fetchData()
        } catch (e) {
            alert("Failed to remove participant")
        }
    }

    const handleSpin = async () => {
        if (participants.length === 0) {
            alert("No participants in the giveaway!")
            return
        }
        try {
            await axios.post(`${API_URL}/giveaway/spin`)
        } catch (e) {
            alert("Failed to trigger spin")
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black uppercase italic tracking-wider flex items-center gap-3">
                        <Gift className="h-8 w-8 text-indigo-500" />
                        Giveaway Manager
                    </h1>
                    <p className="text-zinc-400 mt-1">Manage participants and trigger spins.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                    <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-md">
                        <CardHeader className="border-b border-white/5 flex flex-row items-center justify-between">
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                <Users className="h-5 w-5 text-indigo-400" />
                                Active Participants ({participants.length})
                            </CardTitle>
                            <Button variant="destructive" size="sm" onClick={handleClear} disabled={participants.length === 0}>
                                <Trash className="h-4 w-4 mr-2" />
                                Clear All
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isLoading ? (
                                <div className="p-8 text-center text-zinc-500 animate-pulse">Loading participants...</div>
                            ) : participants.length === 0 ? (
                                <div className="p-12 text-center text-zinc-500 flex flex-col items-center">
                                    <Gift className="h-12 w-12 text-zinc-800 mb-4" />
                                    <p>No participants yet.</p>
                                    <p className="text-sm mt-2">Viewers need to redeem a Giveaway Ticket reward.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto">
                                    {participants.map((p, idx) => (
                                        <div key={idx} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors group">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs uppercase border border-indigo-500/40">
                                                    {p.name.charAt(0)}
                                                </div>
                                                <span className="font-semibold text-zinc-200">{p.name}</span>
                                            </div>
                                            <Button variant="ghost" size="icon" onClick={() => handleRemove(p.name)} className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <UserMinus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="border-white/5 bg-indigo-900/10 border-indigo-500/20 shadow-lg shadow-indigo-500/10">
                        <CardContent className="p-6 text-center space-y-4">
                            <div className="h-16 w-16 mx-auto rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/40">
                                <Trophy className="h-8 w-8" />
                            </div>
                            <div>
                                <h3 className="font-bold text-xl text-indigo-100">Draw a Winner</h3>
                                <p className="text-sm text-indigo-300/70 mt-1">Spins the wheel on stream.</p>
                            </div>
                            <div className="flex gap-2 w-full">
                                <Button 
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-12 text-lg shadow-lg shadow-indigo-500/25"
                                    onClick={handleSpin}
                                    disabled={participants.length === 0}
                                >
                                    <Play className="h-5 w-5 mr-2" />
                                    SPIN WHEEL
                                </Button>
                                <Button 
                                    variant="outline"
                                    className="px-4 border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-300 font-bold h-12"
                                    onClick={handleSpin}
                                    disabled={participants.length === 0}
                                    title="Respin with current active participants"
                                >
                                    <RefreshCw className="h-5 w-5 mr-2" />
                                    RESPIN
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-white/5 bg-zinc-900/50">
                        <CardHeader className="border-b border-white/5 pb-3 py-4 flex flex-row items-center justify-between">
                            <CardTitle className="text-md font-bold flex items-center gap-2">
                                <Trophy className="h-4 w-4 text-yellow-400" />
                                Winners History
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {history.length === 0 ? (
                                <div className="p-6 text-center text-zinc-500 text-sm">No winners yet.</div>
                            ) : (
                                <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
                                    {history.map((h, idx) => (
                                        <div key={idx} className="p-3 hover:bg-white/5">
                                            <div className="flex items-center justify-between">
                                                <div className="font-bold text-yellow-400 flex flex-wrap gap-1">
                                                    {h.winners.map(w => (
                                                        <span key={w} className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded text-xs">{w}</span>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-[10px] text-zinc-500 text-right">
                                                        {new Date(h.timestamp * 1000).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                                                    </div>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-6 w-6 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20" 
                                                        onClick={handleSpin} 
                                                        title="Respin Giveaway"
                                                    >
                                                        <RefreshCw className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
