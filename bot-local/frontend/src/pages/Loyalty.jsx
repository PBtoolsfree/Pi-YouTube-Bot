import React, { useState, useEffect, useMemo, useRef } from 'react'
import axios from 'axios'
import {
    History, Clock, Search, Filter, AlertCircle, ArrowUpRight, Activity
} from 'lucide-react'
import { Card, CardHeader, CardContent, CardTitle, Input } from '@/components/ui'
import { PageStatusBar } from '@/components/ServiceStatus'

function formatRelativeTime(timestamp) {
    if (!timestamp) return 'Just now'
    const seconds = Math.floor((new Date().getTime() - timestamp * 1000) / 1000)
    if (seconds < 0) return 'Just now'
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}

function formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp * 1000)
    if (isNaN(date.getTime())) return ''
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp * 1000)
    if (isNaN(date.getTime())) return ''
    return date.toLocaleDateString()
}

export default function LoyaltyPage() {
    const [gamblingHistory, setGamblingHistory] = useState([])
    const [search, setSearch] = useState("")
    const [actionFilter, setActionFilter] = useState("all")
    const [wsLive, setWsLive] = useState(false)
    const [stats, setStats] = useState({ total_bets: 0, total_winnings: 0, biggest_win: 0 })
    const [loading, setLoading] = useState(true)

    const wsRef = useRef(null)

    const fetchHistory = async () => {
        try {
            const res = await axios.get('/api/loyalty/gambling-history')
            if (res.data) {
                setGamblingHistory(res.data.history || [])
                if (res.data.stats) {
                    setStats(res.data.stats)
                }
            }
        } catch (e) {
            console.error("Failed to fetch gambling history", e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchHistory()

        // ── WEBSOCKET FOR LIVE UPDATES ──
        const connectWebSocket = () => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
            const wsUrl = `${protocol}//${window.location.host}/ws/logs`
            const ws = new WebSocket(wsUrl)
            
            ws.onopen = () => setWsLive(true)
            ws.onclose = () => {
                setWsLive(false)
                setTimeout(connectWebSocket, 5000)
            }
            ws.onerror = () => setWsLive(false)
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    // Auto-refresh when viewer points or actions update
                    if (data.type === 'viewer_update') {
                        fetchHistory()
                    }
                } catch (e) { }
            }
            wsRef.current = ws
        }
        
        connectWebSocket()

        const interval = setInterval(fetchHistory, 30000)
        
        return () => {
            clearInterval(interval)
            if (wsRef.current) wsRef.current.close()
        }
    }, [])

    const filteredHistory = useMemo(() => {
        return gamblingHistory.filter(h => {
            // Filter by search text (username, target, or game)
            const matchesSearch = !search || 
                h.user?.toLowerCase().includes(search.toLowerCase()) ||
                h.target?.toLowerCase().includes(search.toLowerCase()) ||
                h.game?.toLowerCase().includes(search.toLowerCase())

            // Filter by action type
            let matchesAction = false
            if (actionFilter === "all") {
                matchesAction = true
            } else if (actionFilter === "admin") {
                matchesAction = h.game?.startsWith("admin_")
            } else {
                matchesAction = h.game === actionFilter
            }

            return matchesSearch && matchesAction
        })
    }, [gamblingHistory, search, actionFilter])

    return (
        <div className="space-y-6 pb-10">
            <PageStatusBar services={['bot', 'youtube']} />

            {/* Header section */}
            <div className="flex justify-between items-center px-1">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                        <History className="h-5 w-5 text-pink-500" />
                        Loyalty Log
                        {wsLive ? (
                            <span className="ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Live Sync
                            </span>
                        ) : (
                            <span className="ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                <AlertCircle className="h-3 w-3" /> Reconnecting
                            </span>
                        )}
                    </h2>
                    <p className="text-sm text-zinc-400">Real-time log of points earned, deducted, and games played across the community.</p>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-3">
                <StatCard title="Total Transactions" value={stats.total_bets} icon={<Activity className="text-pink-500" />} />
                <StatCard title="Total Winnings" value={stats.total_winnings?.toLocaleString()} icon={<ArrowUpRight className="text-emerald-500" />} />
                <StatCard title="Biggest Win" value={stats.biggest_win?.toLocaleString()} icon={<History className="text-amber-500" />} />
            </div>

            {/* Filter and Table Card */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-sm flex flex-col">
                <CardHeader className="pb-3 border-b border-zinc-800 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <CardTitle className="text-zinc-100 font-semibold text-base flex items-center gap-2">
                            <Clock className="h-4 w-4 text-zinc-400" /> Recent Activity Logs
                        </CardTitle>
                        
                        {/* Search and Filters */}
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <Input
                                    className="pl-10 h-9 bg-zinc-950 border-zinc-800 text-zinc-200 placeholder-zinc-600 text-sm focus:border-zinc-700"
                                    placeholder="Search viewer, target or action..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                            
                            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-3 h-9">
                                <Filter className="h-3.5 w-3.5 text-zinc-500" />
                                <select
                                    className="bg-transparent border-none text-zinc-300 text-sm focus:outline-none cursor-pointer pr-4"
                                    value={actionFilter}
                                    onChange={e => setActionFilter(e.target.value)}
                                >
                                    <option value="all" className="bg-zinc-950 text-zinc-300">All Actions</option>
                                    <option value="gamble" className="bg-zinc-950 text-zinc-300">Gamble</option>
                                    <option value="slots" className="bg-zinc-950 text-zinc-300">Slots</option>
                                    <option value="rob" className="bg-zinc-950 text-zinc-300">Rob</option>
                                    <option value="give" className="bg-zinc-950 text-zinc-300">Give/Transfer</option>
                                    <option value="bat" className="bg-zinc-950 text-zinc-300">Bat Solo</option>
                                    <option value="bat_duel" className="bg-zinc-950 text-zinc-300">Bat Duel</option>
                                    <option value="boss_fight" className="bg-zinc-950 text-zinc-300">Boss Fight</option>
                                    <option value="daily_bonus" className="bg-zinc-950 text-zinc-300">Daily Bonus</option>
                                    <option value="chat_message" className="bg-zinc-950 text-zinc-300">Chat Reward</option>
                                    <option value="admin" className="bg-zinc-950 text-zinc-300">Admin Actions</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto min-h-[300px] max-h-[850px] overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs uppercase bg-zinc-950/50 text-zinc-500 font-medium sticky top-0 z-10 border-b border-zinc-800">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Time</th>
                                    <th className="px-6 py-3 font-medium">Viewer</th>
                                    <th className="px-6 py-3 text-center font-medium">Action</th>
                                    <th className="px-6 py-3 text-right font-medium">Details</th>
                                    <th className="px-6 py-3 text-right font-medium">Value (Pts)</th>
                                    <th className="px-6 py-3 text-center font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {filteredHistory.map((h, i) => (
                                    <tr key={i} className="hover:bg-zinc-800/30 transition-colors group">
                                        <td className="px-6 py-3.5 text-zinc-500 text-xs font-mono">
                                            <div className="flex flex-col">
                                                <span className="text-zinc-300 font-medium">{formatRelativeTime(h.timestamp)}</span>
                                                <span className="text-[10px] text-zinc-600">{formatDate(h.timestamp)} {formatTime(h.timestamp)}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3.5 font-medium text-zinc-200">
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 border border-zinc-700">
                                                    {h.user?.charAt(0).toUpperCase()}
                                                </div>
                                                {h.user}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3.5 text-center">
                                            <span className="text-zinc-400 text-xs font-semibold px-2 py-1 rounded bg-zinc-950 border border-zinc-800 uppercase tracking-wider">
                                                {h.game === 'bat_duel' ? 'Duel' : h.game === 'boss_fight' ? 'Boss' : h.game === 'daily_bonus' ? 'Bonus' : h.game === 'chat_message' ? 'Chat' : h.game === 'admin_add' ? 'Admin Add' : h.game === 'admin_deduct' ? 'Admin Ded' : h.game === 'admin_set' ? 'Admin Set' : h.game}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3.5 text-right font-mono text-zinc-400 text-xs">
                                            {h.game === 'give' ? (
                                                <span>Sent to: <strong className="text-zinc-200">{h.target}</strong></span>
                                            ) : h.game === 'rob' ? (
                                                <span>Target: <strong className="text-zinc-200">{h.target}</strong></span>
                                            ) : h.game === 'boss_fight' ? (
                                                <span className="text-orange-400">{h.target}</span>
                                            ) : h.game === 'bat_duel' ? (
                                                <span>vs: <strong className="text-zinc-200">{h.target}</strong></span>
                                            ) : (h.game === 'daily_bonus' || h.game === 'chat_message' || h.game?.startsWith('admin_')) ? (
                                                <span>{h.target || 'System Action'}</span>
                                            ) : (
                                                <span>Bet: <strong className="text-zinc-200">{(h.bet || h.amount || 0).toLocaleString()}</strong></span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3.5 text-right font-mono font-bold">
                                            <span className={
                                                h.game === 'give' ? 'text-blue-400' : 
                                                h.game === 'boss_fight' ? 'text-orange-400' : 
                                                (h.game === 'daily_bonus' || h.game === 'chat_message' || h.game === 'admin_add') ? 'text-emerald-400' :
                                                h.game === 'admin_deduct' ? 'text-rose-500/70' :
                                                h.game === 'admin_set' ? (h.win ? 'text-emerald-400' : 'text-rose-500/70') :
                                                h.win ? 'text-emerald-400' : 'text-rose-500/70'
                                            }>
                                                {h.game === 'give' ? (h.amount || 0).toLocaleString() : 
                                                 h.game === 'boss_fight' ? '-' + (h.amount || 0).toLocaleString() : 
                                                 (h.game === 'daily_bonus' || h.game === 'chat_message' || h.game === 'admin_add') ? '+' + (h.payout || h.amount || 0).toLocaleString() :
                                                 h.game === 'admin_deduct' ? '-' + (h.amount || 0).toLocaleString() :
                                                 h.game === 'admin_set' ? (h.win ? '+' : '-') + (h.payout || h.amount || 0).toLocaleString() :
                                                 h.win ? '+' + (h.payout || h.amount || 0).toLocaleString() : 
                                                 '-' + (h.bet || h.amount || 0).toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3.5 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold border 
                                                ${h.game === 'give' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                                                  h.game === 'boss_fight' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 
                                                  (h.game === 'daily_bonus' || h.game === 'chat_message') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                  h.game === 'admin_add' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                                  h.game === 'admin_deduct' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                  h.game === 'admin_set' ? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' :
                                                  h.win ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                                  'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                                {h.game === 'give' ? 'SENT' : 
                                                 h.game === 'boss_fight' ? 'ATTACK' : 
                                                 h.game === 'daily_bonus' ? 'BONUS' :
                                                 h.game === 'chat_message' ? 'REWARD' :
                                                 h.game === 'admin_add' ? 'ADDED' :
                                                 h.game === 'admin_deduct' ? 'DEDUCTED' :
                                                 h.game === 'admin_set' ? 'SET' :
                                                 h.win ? 'WIN' : 'LOSS'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {filteredHistory.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-zinc-500 italic">
                                            No activity logs found.
                                        </td>
                                    </tr>
                                )}
                                {loading && (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-zinc-500">
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                                                <span>Loading logs...</span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function StatCard({ title, value, icon }) {
    return (
        <Card className="bg-zinc-900 border-zinc-800 shadow-sm relative overflow-hidden">
            <CardContent className="p-6 flex items-center justify-between z-10 relative">
                <div>
                    <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{title}</div>
                    <div className="text-2xl font-bold mt-1 text-zinc-100">{value}</div>
                </div>
                <div className="h-10 w-10 rounded-lg bg-zinc-950 flex items-center justify-center border border-zinc-800 text-zinc-400">
                    {icon}
                </div>
            </CardContent>
            <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-gradient-to-br from-zinc-800/20 to-transparent rounded-full blur-xl pointer-events-none" />
        </Card>
    )
}
