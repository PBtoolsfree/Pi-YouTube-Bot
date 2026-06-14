import React, { useState, useEffect, useMemo, useRef } from 'react'
import axios from 'axios'
import {
    Heart, Calendar, ArrowUpRight, Award, UserPlus, Clock, Zap, Volume2, Activity,
    Search, Plus, Minus, RotateCcw, Trash2, Settings, Save, ChevronUp, ChevronDown,
    Gift, Edit2, Check, X, Users, TrendingUp, Crown, AlertCircle, Dices, History
} from 'lucide-react'
import { Card, CardHeader, CardContent, CardTitle, Button, Input, Switch } from '@/components/ui'
import { PageStatusBar } from '@/components/ServiceStatus'

function safeFixed(value, digits = 1, fallback = "0") {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : fallback;
}

export default function LoyaltyManagerPage() {
    const [viewers, setViewers] = useState({})
    const [leaderboard, setLeaderboard] = useState([])
    const [activeTab, setActiveTab] = useState("overview")
    const [loyaltyConfig, setLoyaltyConfig] = useState(null)
    const [stats, setStats] = useState({})
    const [search, setSearch] = useState("")
    const [sortKey, setSortKey] = useState("points")
    const [sortDir, setSortDir] = useState("desc")
    const [editingViewer, setEditingViewer] = useState(null)
    const [pointAmount, setPointAmount] = useState("")
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null)
    const [wsLive, setWsLive] = useState(false)
    const [gamblingStats, setGamblingStats] = useState(null)
    const [gamblingHistory, setGamblingHistory] = useState([])

    const wsRef = useRef(null)

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
    }

    const fetchAll = async () => {
        try {
            const [vRes, lbRes, stRes, gbRes, slRes] = await Promise.all([
                axios.get('/api/viewers'),
                axios.get('/api/loyalty/leaderboard'),
                axios.get('/api/loyalty/stats'),
                axios.get('/api/loyalty/gambling-history').catch(() => ({ data: { stats: null, history: [] } }))
            ])
            setViewers(vRes.data)
            setLeaderboard(lbRes.data)
            setStats(stRes.data)
            if (gbRes && gbRes.data) {
                setGamblingStats(gbRes.data.stats)
                setGamblingHistory(gbRes.data.history)
            }
        } catch (e) {
            console.error("Fetch error", e)
        }
    }

    const fetchConfig = async () => {
        try {
            const res = await axios.get('/api/loyalty/config')
            setLoyaltyConfig(res.data)
        } catch (e) {
            console.error("Config fetch error", e)
        }
    }

    useEffect(() => {
        fetchAll()
        fetchConfig()
        
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
                    // Auto-refresh when viewer data changes
                    if (data.type === 'viewer_update') {
                        fetchAll()
                    }
                    if (data.type === 'config_update') {
                        fetchConfig()
                    }
                } catch (e) { }
            }
            wsRef.current = ws
        }
        
        connectWebSocket()

        // Fallback polling (slower now that we have real-time)
        const interval = setInterval(fetchAll, 30000)
        
        return () => {
            clearInterval(interval)
            if (wsRef.current) wsRef.current.close()
        }
    }, [])

    const viewerList = useMemo(() =>
        Object.entries(viewers).map(([name, data]) => ({ name, ...data })),
        [viewers]
    )

    const filteredViewers = useMemo(() => {
        let list = [...viewerList]
        if (search) {
            const q = search.toLowerCase()
            list = list.filter(v => v.name.toLowerCase().includes(q))
        }
        list.sort((a, b) => {
            const aVal = a[sortKey] || 0
            const bVal = b[sortKey] || 0
            if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal
        })
        return list
    }, [viewerList, search, sortKey, sortDir])

    const toggleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortKey(key); setSortDir('desc') }
    }

    const handlePointAction = async (name, action, amount) => {
        try {
            await axios.put(`/api/viewers/${encodeURIComponent(name)}/points`, { action, amount: parseInt(amount) })
            showToast(`${action === 'add' ? 'Added' : action === 'deduct' ? 'Deducted' : 'Set'} ${amount} pts for ${name}`)
            fetchAll()
            setEditingViewer(null)
            setPointAmount("")
        } catch (e) {
            showToast(e.response?.data?.detail || 'Failed', 'error')
        }
    }

    const handleDeleteViewer = async (name) => {
        if (!confirm(`Remove ${name} from the database?`)) return
        try {
            await axios.delete(`/api/viewers/${encodeURIComponent(name)}`)
            showToast(`${name} removed`)
            fetchAll()
        } catch (e) {
            showToast('Delete failed', 'error')
        }
    }

    const handleResetViewer = async (name) => {
        if (!confirm(`Reset ${name}'s points and streak to 0?`)) return
        try {
            await axios.post(`/api/viewers/${encodeURIComponent(name)}/reset`)
            showToast(`${name} reset`)
            fetchAll()
        } catch (e) {
            showToast('Reset failed', 'error')
        }
    }

    const saveConfig = async () => {
        setSaving(true)
        try {
            await axios.post('/api/loyalty/config', loyaltyConfig)
            showToast('Configuration saved!')
        } catch (e) {
            showToast('Save failed', 'error')
        }
        setSaving(false)
    }

    // Stats
    const totalPoints = viewerList.reduce((acc, v) => acc + (v.points || 0), 0)
    const sortedStreaks = [...viewerList].sort((a, b) => (b.consecutive_days || 0) - (a.consecutive_days || 0)).slice(0, 10)

    return (
        <div className="space-y-6 pb-10">
            <PageStatusBar services={['bot', 'youtube']} />

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium border shadow-lg animate-fade-in
                    ${toast.type === 'error' ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
                    {toast.msg}
                </div>
            )}

            <div className="flex justify-between items-center px-1">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                        <Heart className="h-5 w-5 text-pink-500" />
                        Loyalty & Points Manager
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
                    <p className="text-sm text-zinc-400">Manage points, ranks, rewards and your community.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-zinc-800 pb-0 overflow-x-auto">
                <TabButton id="overview" label="Overview" icon={<Activity />} active={activeTab} onClick={setActiveTab} />
                <TabButton id="leaderboard" label="Leaderboard" icon={<Award />} active={activeTab} onClick={setActiveTab} />
                <TabButton id="gambling" label="Games & Economy" icon={<Dices />} active={activeTab} onClick={setActiveTab} />
                <TabButton id="manage" label="Manage Viewers" icon={<Users />} active={activeTab} onClick={setActiveTab} />

                <TabButton id="settings" label="Settings" icon={<Settings />} active={activeTab} onClick={setActiveTab} />
            </div>

            {/* ═══════════════ OVERVIEW ═══════════════ */}
            {activeTab === 'overview' && (
                <>
                    <div className="grid gap-4 md:grid-cols-4">
                        <StatBox title="Active Today" value={stats.active_today || 0} icon={<UserPlus className="text-emerald-500" />} subtext="Unique viewers seen" />
                        <StatBox title="Total Points" value={safeFixed(totalPoints / 1000, 1) + 'k'} icon={<Zap className="text-amber-500" />} subtext="Community points earned" />
                        <StatBox title="Total Viewers" value={stats.total_viewers || 0} icon={<Users className="text-blue-500" />} subtext="All-time registered" />
                        <StatBox title="Diamond Club" value={viewerList.filter(v => (v.points || 0) >= 10000).length} icon={<Crown className="text-cyan-400" />} subtext="Top tier legends" />
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {/* Tier Distribution */}
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm md:col-span-1">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                    <Activity className="h-4 w-4 text-zinc-400" /> Tier Distribution
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                {loyaltyConfig && (loyaltyConfig.ranks || []).length > 0 ? (
                                    [...loyaltyConfig.ranks]
                                        .sort((a, b) => b.min_points - a.min_points)
                                        .map(rank => {
                                            const count = viewerList.filter(v => getTier(v.points || 0, loyaltyConfig).name === rank.name).length
                                            const percent = viewerList.length > 0 ? (count / viewerList.length) * 100 : 0
                                            const tierData = getTier(rank.min_points, loyaltyConfig)
                                            return (
                                                <div key={rank.name} className="space-y-1">
                                                    <div className="flex justify-between text-xs">
                                                        <span className={`font-bold ${tierData.color} flex items-center gap-1`}>{tierData.icon} {rank.name}</span>
                                                        <span className="text-zinc-500">{count} viewers</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50">
                                                        <div className={`h-full rounded-full opacity-80 ${tierData.color}`} style={{ width: `${percent}%`, backgroundColor: 'currentColor' }}></div>
                                                    </div>
                                                </div>
                                            )
                                        })
                                ) : (
                                    ['DIAMOND', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE'].map(tierName => {
                                        const count = viewerList.filter(v => getTier(v.points || 0).name === tierName).length
                                        const percent = viewerList.length > 0 ? (count / viewerList.length) * 100 : 0
                                        const tierData = getTier(tierName === 'DIAMOND' ? 10000 : tierName === 'PLATINUM' ? 5000 : tierName === 'GOLD' ? 2000 : tierName === 'SILVER' ? 500 : 0)
                                        return (
                                            <div key={tierName} className="space-y-1">
                                                <div className="flex justify-between text-xs">
                                                    <span className={`font-bold ${tierData.color} flex items-center gap-1`}>{tierData.icon} {tierName}</span>
                                                    <span className="text-zinc-500">{count} viewers</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50">
                                                    <div className={`h-full rounded-full opacity-80 ${tierData.bg.replace('/10', '')}`} style={{ width: `${percent}%`, backgroundColor: 'currentColor' }}></div>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </CardContent>
                        </Card>

                        {/* Live Loyalty Feed */}
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm md:col-span-2">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                    <Calendar className="h-4 w-4 text-zinc-400" /> Live Loyalty Feed
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs uppercase bg-zinc-950/50 text-zinc-500 font-medium">
                                            <tr>
                                                <th className="px-6 py-3 font-medium">Viewer</th>
                                                <th className="px-6 py-3 text-center font-medium">Tier</th>
                                                <th className="px-6 py-3 text-center font-medium">Streak</th>
                                                <th className="px-6 py-3 text-right font-medium">Last Seen</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800">
                                            {sortedStreaks.map((v) => (
                                                <tr key={v.name} className="hover:bg-zinc-800/50 transition-colors">
                                                    <td className="px-6 py-3 font-medium text-zinc-200">
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-6 w-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 border border-zinc-700">
                                                                {v.name.charAt(0).toUpperCase()}
                                                            </div>
                                                            {v.name}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 text-center"><TierBadge points={v.points} config={loyaltyConfig} /></td>
                                                    <td className="px-6 py-3 text-center">
                                                        <div className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded text-[10px] border border-blue-500/20 font-medium">
                                                            {v.consecutive_days || 1} 🔥
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 text-right text-zinc-500 text-xs font-mono">{v.last_date || 'Today'}</td>
                                                </tr>
                                            ))}
                                            {sortedStreaks.length === 0 && (
                                                <tr><td colSpan="4" className="px-6 py-8 text-center text-zinc-500 italic">No viewer data yet.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Point Economy Summary */}
                    {loyaltyConfig && (
                        <Card className="bg-zinc-900 border-zinc-800">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                    <TrendingUp className="h-4 w-4 text-zinc-400" /> Point Economy
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-center">
                                        <div className="text-lg font-bold text-amber-400">{loyaltyConfig.points_per_message || 10}</div>
                                        <div className="text-[10px] text-zinc-500 uppercase">Per Message</div>
                                    </div>
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-center">
                                        <div className="text-lg font-bold text-emerald-400">{loyaltyConfig.bonus_daily_return || 50}</div>
                                        <div className="text-[10px] text-zinc-500 uppercase">Daily Return Bonus</div>
                                    </div>
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-center">
                                        <div className="text-lg font-bold text-violet-400">{loyaltyConfig.bonus_streak_multiplier || 1.5}x</div>
                                        <div className="text-[10px] text-zinc-500 uppercase">Streak Multiplier</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}

            {/* ═══════════════ LEADERBOARD ═══════════════ */}
            {activeTab === 'leaderboard' && (
                <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                            <Award className="h-4 w-4 text-amber-500" /> Top Loyalists
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs uppercase bg-zinc-950/50 text-zinc-500 font-medium">
                                    <tr>
                                        <th className="px-6 py-3 w-16 font-medium">#</th>
                                        <th className="px-6 py-3 font-medium">Viewer</th>
                                        <th className="px-6 py-3 text-right font-medium">Rank</th>
                                        <th className="px-6 py-3 text-right font-medium">Points</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800">
                                    {leaderboard.map((v, i) => (
                                        <tr key={v.name} className={`hover:bg-zinc-800/50 transition-colors ${i < 3 ? 'bg-zinc-900/40' : ''}`}>
                                            <td className="px-6 py-3 font-mono text-zinc-500 text-xs text-center w-16">
                                                {i === 0 ? <span className="text-lg">🥇</span> :
                                                    i === 1 ? <span className="text-lg">🥈</span> :
                                                        i === 2 ? <span className="text-lg">🥉</span> :
                                                            <span className="opacity-50">#{i + 1}</span>}
                                            </td>
                                            <td className="px-6 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 
                                                        ${i === 0 ? 'bg-amber-500/10 text-amber-500 border-amber-500/50' :
                                                            i === 1 ? 'bg-slate-300/10 text-slate-300 border-slate-300/50' :
                                                                i === 2 ? 'bg-amber-700/10 text-amber-700 border-amber-700/50' :
                                                                    'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                                                        {v.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className={`font-semibold ${i < 3 ? 'text-zinc-100' : 'text-zinc-300'}`}>{v.name}</span>
                                                        <span className="text-[10px] text-zinc-500">Rank {v.rank}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-right"><TierBadge points={v.points} config={loyaltyConfig} /></td>
                                            <td className="px-6 py-3 text-right font-mono font-bold text-sm">
                                                {(v.points || 0).toLocaleString()} <span className="text-zinc-600 text-[10px] font-normal uppercase">PTS</span>
                                            </td>
                                        </tr>
                                    ))}
                                    {leaderboard.length === 0 && (
                                        <tr><td colSpan="4" className="px-6 py-8 text-center text-zinc-500 italic">No leaderboard data yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ═══════════════ GAMBLING ═══════════════ */}
            {activeTab === 'gambling' && (
                <div className="space-y-6">
                    {/* Gambling Stats */}
                    <div className="grid gap-4 md:grid-cols-3">
                        <StatBox 
                            title="Total Actions" 
                            value={gamblingStats?.total_bets || 0} 
                            icon={<Dices className="text-violet-400" />} 
                            subtext="All-time casino spins & economy events" 
                        />
                        <StatBox 
                            title="Total Winnings" 
                            value={gamblingStats?.total_winnings?.toLocaleString() || 0} 
                            icon={<Crown className="text-amber-400" />} 
                            subtext="Points won by community" 
                        />
                        <StatBox 
                            title="Biggest Win" 
                            value={gamblingStats?.biggest_win?.toLocaleString() || 0} 
                            icon={<Award className="text-emerald-400" />} 
                            subtext="Largest single payout" 
                        />
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {/* Guide / How to Play */}
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm md:col-span-1">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                    <AlertCircle className="h-4 w-4 text-zinc-400" /> How to Play
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4 text-sm text-zinc-400 leading-relaxed">
                                <p>Viewers can type these commands in chat to play and earn points:</p>
                                
                                <div className="space-y-2">
                                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                                        <div className="font-bold text-violet-400 mb-1 font-mono">!gamble &lt;amount&gt;</div>
                                        <p className="text-xs">A 50/50 chance game. Double your bet if you win, lose your bet if you fail.</p>
                                    </div>

                                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                                        <div className="font-bold text-amber-400 mb-1 font-mono">!slots &lt;amount&gt;</div>
                                        <p className="text-xs">Spin the slot machine. Matches multiply your bet:</p>
                                        <ul className="list-disc ml-5 mt-1 text-[10px] space-y-0.5">
                                            <li>Triple 7s (7️⃣7️⃣7️⃣) = 10x Jackpot</li>
                                            <li>Triple Diamonds (💎💎💎) = 5x</li>
                                            <li>Other Triples = 3x</li>
                                            <li>Any Pair = 1.5x</li>
                                        </ul>
                                    </div>
                                    
                                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 border-l-4 border-l-blue-500">
                                        <div className="font-bold text-blue-400 mb-1 font-mono">!bowl &lt;amount&gt;</div>
                                        <p className="text-xs">Throw an open challenge! The first person to type <code className="text-amber-400 bg-zinc-900 px-1 rounded">!bat</code> faces your delivery for the set amount.</p>
                                    </div>
                                    
                                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 border-l-4 border-l-amber-500">
                                        <div className="font-bold text-amber-400 mb-1 font-mono">!bat &lt;amount&gt;</div>
                                        <p className="text-xs">Play a solo cricket match or accept a !bowl challenge. Solo rewards:</p>
                                        <ul className="list-disc ml-5 mt-1 text-[10px] space-y-0.5">
                                            <li>Out (40% chance) = Lose points</li>
                                            <li>1 or 2 runs = Get 1x or 1.5x points</li>
                                            <li>4 runs (Boundary) = 2x points</li>
                                            <li>6 runs (Sixer) = 3x points</li>
                                        </ul>
                                    </div>

                                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                                        <div className="font-bold text-emerald-400 mb-1 font-mono">!give &lt;user&gt; &lt;amount&gt;</div>
                                        <p className="text-xs">Transfer some of your available points to another viewer.</p>
                                    </div>
                                    
                                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                                        <div className="font-bold text-red-500 mb-1 font-mono">!rob &lt;user&gt;</div>
                                        <p className="text-xs">Attempt to sneakily steal 10% points from a user. <br/><span className="text-zinc-500">40% Win Chance. 60% Failure gives them a fine instead!</span></p>
                                    </div>
                                    
                                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 border-l-4 border-l-red-500">
                                        <div className="font-bold text-red-400 mb-1 font-mono">!attack &lt;amount&gt;</div>
                                        <p className="text-xs">Fight the live Boss using your points! <br/><span className="text-zinc-500">Top 3 damage dealers share a massive reward pool, and everyone who participates gets a 50pt participation bonus.</span></p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Recent History Table */}
                        <Card className="bg-zinc-900 border-zinc-800 shadow-sm md:col-span-2 flex flex-col">
                            <CardHeader className="pb-3 border-b border-zinc-800">
                                <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                    <History className="h-4 w-4 text-zinc-400" /> Recent Activity
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0 flex-1 flex flex-col min-h-0">
                                <div className="overflow-x-auto flex-1 overflow-y-auto min-h-[300px] max-h-[850px]">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs uppercase bg-zinc-950/50 text-zinc-500 font-medium sticky top-0 z-10">
                                            <tr>
                                                <th className="px-6 py-3 font-medium">Viewer</th>
                                                <th className="px-6 py-3 font-medium text-center">Type</th>
                                                <th className="px-6 py-3 font-medium text-right">Details</th>
                                                <th className="px-6 py-3 font-medium text-right">Payout / Value</th>
                                                <th className="px-6 py-3 font-medium text-center">Result</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800">
                                            {gamblingHistory.map((h, i) => (
                                                <tr key={i} className="hover:bg-zinc-800/50 transition-colors">
                                                    <td className="px-6 py-3 font-medium text-zinc-200">{h.user}</td>
                                                    <td className="px-6 py-3 text-center uppercase tracking-wider text-[10px] font-bold text-zinc-500">
                                                        {h.game}
                                                    </td>
                                                    <td className="px-6 py-3 text-right font-mono text-zinc-400 text-xs">
                                                        {h.game === 'give' ? `To: ${h.target}` : h.game === 'rob' ? `Target: ${h.target}` : h.game === 'boss_fight' ? h.target : `Bet: ${(h.bet || h.amount || 0).toLocaleString()}`}
                                                    </td>
                                                    <td className="px-6 py-3 text-right font-mono font-bold">
                                                        <span className={h.game === 'give' ? 'text-blue-400' : h.game === 'boss_fight' ? 'text-orange-400' : h.win ? 'text-emerald-400' : 'text-zinc-600'}>
                                                            {h.game === 'give' ? (h.amount || 0).toLocaleString() : h.game === 'boss_fight' ? '-' + (h.amount || 0).toLocaleString() : h.win ? '+' + (h.payout || h.amount || 0).toLocaleString() : '0'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3 text-center">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border 
                                                            ${h.game === 'give' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : h.game === 'boss_fight' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : h.win ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                                            {h.game === 'give' ? 'SENT' : h.game === 'boss_fight' ? 'ATTACK' : h.win ? 'WIN' : 'LOSS'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {gamblingHistory.length === 0 && (
                                                <tr><td colSpan="5" className="px-6 py-8 text-center text-zinc-500 italic">No gambling history yet. Play some games!</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* ═══════════════ MANAGE VIEWERS ═══════════════ */}
            {activeTab === 'manage' && (
                <div className="space-y-4">
                    {/* Search */}
                    <div className="flex gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                            <Input
                                className="pl-10 bg-zinc-900 border-zinc-700 text-zinc-200 placeholder-zinc-600"
                                placeholder="Search viewers..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="text-xs text-zinc-500 flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3">
                            {filteredViewers.length} viewer{filteredViewers.length !== 1 ? 's' : ''}
                        </div>
                    </div>

                    {/* Viewer Table */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs uppercase bg-zinc-950/50 text-zinc-500 font-medium">
                                        <tr>
                                            <SortHeader label="Viewer" sortKey="name" current={sortKey} dir={sortDir} onClick={toggleSort} />
                                            <SortHeader label="Points" sortKey="points" current={sortKey} dir={sortDir} onClick={toggleSort} className="text-right" />
                                            <SortHeader label="Rank" sortKey="rank" current={sortKey} dir={sortDir} onClick={toggleSort} className="text-center" />
                                            <SortHeader label="Streak" sortKey="consecutive_days" current={sortKey} dir={sortDir} onClick={toggleSort} className="text-center" />
                                            <SortHeader label="Messages" sortKey="count" current={sortKey} dir={sortDir} onClick={toggleSort} className="text-right" />
                                            <th className="px-4 py-3 font-medium text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {filteredViewers.slice(0, 100).map(v => (
                                            <tr key={v.name} className="hover:bg-zinc-800/30 transition-colors group">
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 border border-zinc-700">
                                                            {v.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="font-medium text-zinc-200 text-sm">{v.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-mono font-bold text-sm text-zinc-100">
                                                    {(v.points || 0).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2.5 text-center"><TierBadge points={v.points} config={loyaltyConfig} /></td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <span className="text-xs text-zinc-400">{v.consecutive_days || 0} 🔥</span>
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-xs text-zinc-500 font-mono">{(v.count || 0).toLocaleString()}</td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <div className="flex gap-1 justify-end">
                                                        {editingViewer === v.name ? (
                                                            <div className="flex items-center gap-1">
                                                                <Input
                                                                    type="number"
                                                                    className="w-20 h-7 text-xs bg-zinc-800 border-zinc-700 text-zinc-200"
                                                                    placeholder="Amount"
                                                                    value={pointAmount}
                                                                    onChange={e => setPointAmount(e.target.value)}
                                                                    autoFocus
                                                                />
                                                                <button onClick={() => handlePointAction(v.name, 'add', pointAmount)} className="h-7 w-7 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 flex items-center justify-center" title="Add">
                                                                    <Plus className="h-3 w-3" />
                                                                </button>
                                                                <button onClick={() => handlePointAction(v.name, 'deduct', pointAmount)} className="h-7 w-7 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center" title="Deduct">
                                                                    <Minus className="h-3 w-3" />
                                                                </button>
                                                                <button onClick={() => handlePointAction(v.name, 'set', pointAmount)} className="h-7 w-7 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 flex items-center justify-center" title="Set exact">
                                                                    <Check className="h-3 w-3" />
                                                                </button>
                                                                <button onClick={() => { setEditingViewer(null); setPointAmount("") }} className="h-7 w-7 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600/50 flex items-center justify-center">
                                                                    <X className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button onClick={() => setEditingViewer(v.name)} className="h-7 w-7 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 flex items-center justify-center" title="Edit points">
                                                                    <Edit2 className="h-3 w-3" />
                                                                </button>
                                                                <button onClick={() => handleResetViewer(v.name)} className="h-7 w-7 rounded bg-zinc-800 text-zinc-400 hover:bg-amber-500/20 hover:text-amber-400 flex items-center justify-center" title="Reset">
                                                                    <RotateCcw className="h-3 w-3" />
                                                                </button>
                                                                <button onClick={() => handleDeleteViewer(v.name)} className="h-7 w-7 rounded bg-zinc-800 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center" title="Delete">
                                                                    <Trash2 className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredViewers.length === 0 && (
                                            <tr><td colSpan="6" className="px-6 py-8 text-center text-zinc-500 italic">
                                                {search ? 'No viewers match your search.' : 'No viewers yet.'}
                                            </td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {filteredViewers.length > 100 && (
                                <div className="px-4 py-2 text-xs text-zinc-500 text-center border-t border-zinc-800">
                                    Showing 100 of {filteredViewers.length} viewers. Use search to narrow down.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}



            {/* ═══════════════ SETTINGS ═══════════════ */}
            {activeTab === 'settings' && loyaltyConfig && (
                <div className="space-y-6">
                    {/* Point Earn Rates */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                <Zap className="h-4 w-4 text-amber-500" /> Point Earn Rates
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="grid md:grid-cols-4 gap-4">
                                <ConfigField label="Points Per Message" value={loyaltyConfig.points_per_message ?? 10}
                                    onChange={v => setLoyaltyConfig(c => ({ ...c, points_per_message: parseInt(v) || 0 }))} type="number" />
                                <ConfigField label="Daily Return Bonus" value={loyaltyConfig.bonus_daily_return ?? 50}
                                    onChange={v => setLoyaltyConfig(c => ({ ...c, bonus_daily_return: parseInt(v) || 0 }))} type="number" />
                                <ConfigField label="Streak Multiplier" value={loyaltyConfig.bonus_streak_multiplier ?? 1.5}
                                    onChange={v => setLoyaltyConfig(c => ({ ...c, bonus_streak_multiplier: parseFloat(v) || 1 }))} type="number" step="0.1" />
                            </div>
                            
                            <div className="pt-2 border-t border-zinc-800">
                                <div className="text-xs font-medium text-emerald-400 mb-3 flex items-center gap-1.5 uppercase">
                                    <Activity className="h-3 w-3" /> Monetization Rewards
                                </div>
                                <div className="grid md:grid-cols-4 gap-3">
                                    <ConfigField label="Pts per Tip (₹1)" value={loyaltyConfig.points_per_tip_rupee ?? 0}
                                        onChange={v => setLoyaltyConfig(c => ({ ...c, points_per_tip_rupee: parseFloat(v) || 0 }))} type="number" step="0.1" />
                                    <ConfigField label="Pts per SuperChat (₹1)" value={loyaltyConfig.points_per_superchat_rupee ?? 0}
                                        onChange={v => setLoyaltyConfig(c => ({ ...c, points_per_superchat_rupee: parseFloat(v) || 0 }))} type="number" step="0.1" />
                                    <ConfigField label="Pts per Sticker (₹1)" value={loyaltyConfig.points_per_supersticker_rupee ?? 0}
                                        onChange={v => setLoyaltyConfig(c => ({ ...c, points_per_supersticker_rupee: parseFloat(v) || 0 }))} type="number" step="0.1" />
                                    <ConfigField label="Pts per Member L1" value={loyaltyConfig.points_per_membership_l1 ?? 0}
                                        onChange={v => setLoyaltyConfig(c => ({ ...c, points_per_membership_l1: parseInt(v) || 0 }))} type="number" />
                                    <ConfigField label="Pts per Member L2" value={loyaltyConfig.points_per_membership_l2 ?? 0}
                                        onChange={v => setLoyaltyConfig(c => ({ ...c, points_per_membership_l2: parseInt(v) || 0 }))} type="number" />
                                    <ConfigField label="Pts per Member L3" value={loyaltyConfig.points_per_membership_l3 ?? 0}
                                        onChange={v => setLoyaltyConfig(c => ({ ...c, points_per_membership_l3: parseInt(v) || 0 }))} type="number" />
                                    <ConfigField label="Pts per Member L4" value={loyaltyConfig.points_per_membership_l4 ?? 0}
                                        onChange={v => setLoyaltyConfig(c => ({ ...c, points_per_membership_l4: parseInt(v) || 0 }))} type="number" />
                                    <ConfigField label="Pts per Membership Gift" value={loyaltyConfig.points_per_gifted_membership ?? 0}
                                        onChange={v => setLoyaltyConfig(c => ({ ...c, points_per_gifted_membership: parseInt(v) || 0 }))} type="number" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Games & Economy Tuning */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                <Dices className="h-4 w-4 text-emerald-500" /> Games & Economy Tuning
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="grid md:grid-cols-4 gap-4">
                                <div className="space-y-1.5 flex flex-col justify-center pb-1">
                                    <label className="text-xs font-medium text-emerald-400">Gamble Enabled</label>
                                    <Switch checked={loyaltyConfig.games?.gamble?.enabled ?? true}
                                        onCheckedChange={val => setLoyaltyConfig(c => ({ ...c, games: { ...c.games, gamble: { ...c.games?.gamble, enabled: val } } }))} />
                                </div>
                                <div className="space-y-1.5 flex flex-col justify-center pb-1">
                                    <label className="text-xs font-medium text-emerald-400">Slots Enabled</label>
                                    <Switch checked={loyaltyConfig.games?.slots?.enabled ?? true}
                                        onCheckedChange={val => setLoyaltyConfig(c => ({ ...c, games: { ...c.games, slots: { ...c.games?.slots, enabled: val } } }))} />
                                </div>
                                <div className="space-y-1.5 flex flex-col justify-center pb-1">
                                    <label className="text-xs font-medium text-emerald-400">Give Enabled</label>
                                    <Switch checked={loyaltyConfig.games?.give?.enabled ?? true}
                                        onCheckedChange={val => setLoyaltyConfig(c => ({ ...c, games: { ...c.games, give: { ...c.games?.give, enabled: val } } }))} />
                                </div>
                                <div className="space-y-1.5 flex flex-col justify-center pb-1">
                                    <label className="text-xs font-medium text-emerald-400">Rob Enabled</label>
                                    <Switch checked={loyaltyConfig.games?.rob?.enabled ?? true}
                                        onCheckedChange={val => setLoyaltyConfig(c => ({ ...c, games: { ...c.games, rob: { ...c.games?.rob, enabled: val } } }))} />
                                </div>
                                <ConfigField label="Gamble Base Win (%)" value={loyaltyConfig.games?.gamble?.win_chance ?? 50}
                                    onChange={v => setLoyaltyConfig(c => ({ ...c, games: { ...c.games, gamble: { ...c.games?.gamble, win_chance: parseInt(v) || 0 } } }))} type="number" />
                                <ConfigField label="Rob Base Win (%)" value={loyaltyConfig.games?.rob?.win_chance ?? 40}
                                    onChange={v => setLoyaltyConfig(c => ({ ...c, games: { ...c.games, rob: { ...c.games?.rob, win_chance: parseInt(v) || 0 } } }))} type="number" />
                            </div>


                        </CardContent>
                    </Card>

                    {/* Boss Fight Controls */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                <Zap className="h-4 w-4 text-red-500" /> Boss Fight Controls
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="flex items-end gap-4">
                                <div className="space-y-1.5 flex-1">
                                    <label className="text-xs font-medium text-red-400">Boss HP (e.g. 5000)</label>
                                    <Input id="bossHpInput" type="number" defaultValue={5000} className="h-9 bg-zinc-950 border-zinc-800 text-sm" />
                                </div>
                                <div className="space-y-1.5 flex-1">
                                    <label className="text-xs font-medium text-red-400">Boss Type</label>
                                    <select id="bossTypeSelect" className="h-9 w-full bg-zinc-950 border border-zinc-800 text-sm text-zinc-300 rounded-md px-3" defaultValue="random">
                                        <option value="random">Random</option>
                                        <option value="thanos">Thanos</option>
                                        <option value="dragon">Dragon</option>
                                        <option value="demon">Demon</option>
                                    </select>
                                </div>
                                <Button className="h-9 px-6 bg-red-600 hover:bg-red-500 text-white font-bold" onClick={async () => {
                                    try {
                                        const hp = parseInt(document.getElementById("bossHpInput").value) || 5000;
                                        let bType = document.getElementById("bossTypeSelect").value;
                                        if (bType === "random") {
                                            const arr = ["thanos", "dragon", "demon"];
                                            bType = arr[Math.floor(Math.random() * arr.length)];
                                        }
                                        await axios.post('/api/loyalty/start_boss', { hp, boss_type: bType });
                                        alert("Boss Spawned!");
                                    } catch (e) {
                                        alert("Error spawning boss: " + e.message);
                                    }
                                }}>
                                    Start Boss Fight
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Rank Thresholds */}
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="pb-3 border-b border-zinc-800 flex flex-row items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                <Crown className="h-4 w-4 text-violet-400" /> Rank Thresholds
                            </CardTitle>
                            <button onClick={() => setLoyaltyConfig(c => ({
                                ...c,
                                ranks: [...(c.ranks || []), { name: "New Rank", emoji: "⭐", min_points: 0, yt_mod: false, mod_duration_days: 0 }]
                            }))} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                                <Plus className="h-3 w-3" /> Add Rank
                            </button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <table className="w-full text-sm">
                                <thead className="text-xs uppercase bg-zinc-950/50 text-zinc-500">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium">Emoji</th>
                                        <th className="px-4 py-2 text-left font-medium">Name</th>
                                        <th className="px-4 py-2 text-right font-medium">Min Points</th>
                                        <th className="px-4 py-2 text-center font-medium">YT Mod</th>
                                        <th className="px-4 py-2 text-right font-medium text-[10px] leading-tight w-24">Auto-<br/>Remove (Days)</th>
                                        <th className="px-4 py-2 w-16"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800">
                                    {(loyaltyConfig.ranks || []).map((rank, idx) => (
                                        <tr key={idx} className="hover:bg-zinc-800/30">
                                            <td className="px-4 py-2">
                                                <Input className="w-16 h-7 text-center bg-zinc-800 border-zinc-700 text-lg" value={rank.emoji}
                                                    onChange={e => {
                                                        const ranks = [...loyaltyConfig.ranks]; ranks[idx] = { ...ranks[idx], emoji: e.target.value }
                                                        setLoyaltyConfig(c => ({ ...c, ranks }))
                                                    }} />
                                            </td>
                                            <td className="px-4 py-2">
                                                <Input className="h-7 text-sm bg-zinc-800 border-zinc-700 text-zinc-200" value={rank.name}
                                                    onChange={e => {
                                                        const ranks = [...loyaltyConfig.ranks]; ranks[idx] = { ...ranks[idx], name: e.target.value }
                                                        setLoyaltyConfig(c => ({ ...c, ranks }))
                                                    }} />
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <Input type="number" className="h-7 text-sm bg-zinc-800 border-zinc-700 text-zinc-200 text-right w-24 ml-auto" value={rank.min_points}
                                                    onChange={e => {
                                                        const ranks = [...loyaltyConfig.ranks]; ranks[idx] = { ...ranks[idx], min_points: parseInt(e.target.value) || 0 }
                                                        setLoyaltyConfig(c => ({ ...c, ranks }))
                                                    }} />
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <div className="flex justify-center">
                                                    <Switch checked={rank.yt_mod || false}
                                                        onCheckedChange={val => {
                                                            const ranks = [...loyaltyConfig.ranks]; ranks[idx] = { ...ranks[idx], yt_mod: val }
                                                            setLoyaltyConfig(c => ({ ...c, ranks }))
                                                        }} />
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <Input type="number" 
                                                    className={`h-7 text-sm text-right w-16 ml-auto ${!rank.yt_mod ? 'bg-zinc-800/50 border-zinc-800 text-zinc-600' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`} 
                                                    value={rank.mod_duration_days || 0}
                                                    disabled={!rank.yt_mod}
                                                    onChange={e => {
                                                        const ranks = [...loyaltyConfig.ranks]; ranks[idx] = { ...ranks[idx], mod_duration_days: parseInt(e.target.value) || 0 }
                                                        setLoyaltyConfig(c => ({ ...c, ranks }))
                                                    }} />
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <button onClick={() => {
                                                    const ranks = loyaltyConfig.ranks.filter((_, i) => i !== idx)
                                                    setLoyaltyConfig(c => ({ ...c, ranks }))
                                                }} className="h-7 w-7 rounded text-zinc-500 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center">
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>


                    {/* Save Button */}
                    <div className="flex justify-end">
                        <Button onClick={saveConfig} disabled={saving}
                            className="bg-violet-600 hover:bg-violet-500 text-white px-6 flex items-center gap-2">
                            <Save className="h-4 w-4" />
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

/* ═══════════════ HELPER COMPONENTS ═══════════════ */

function TabButton({ id, label, icon, active, onClick }) {
    return (
        <button
            onClick={() => onClick(id)}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-sm font-medium transition-all whitespace-nowrap ${active === id ? 'border-zinc-100 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'}`}
        >
            {React.cloneElement(icon, { className: "h-4 w-4" })}
            {label}
        </button>
    )
}

function SortHeader({ label, sortKey, current, dir, onClick, className = '' }) {
    const active = current === sortKey
    return (
        <th className={`px-4 py-3 font-medium cursor-pointer hover:text-zinc-300 select-none ${className}`}
            onClick={() => onClick(sortKey)}>
            <span className="inline-flex items-center gap-1">
                {label}
                {active && (dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
            </span>
        </th>
    )
}

function ConfigField({ label, value, onChange, type = "text", step }) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium uppercase">{label}</label>
            <Input type={type} step={step} className="h-9 bg-zinc-800 border-zinc-700 text-zinc-200" value={value}
                onChange={e => onChange(e.target.value)} />
        </div>
    )
}

const TIER_STYLES = [
    { color: 'text-zinc-400', bg: 'bg-zinc-400/10', border: 'border-zinc-400/20' }, // Noob/gray-like
    { color: 'text-amber-700', bg: 'bg-amber-700/10', border: 'border-amber-700/20' }, // Bronze-like
    { color: 'text-slate-300', bg: 'bg-slate-300/10', border: 'border-slate-300/20' }, // Silver-like
    { color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' }, // Gold-like
    { color: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20' }, // Platinum-like
    { color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20' }, // Diamond-like
    { color: 'text-pink-500', bg: 'bg-pink-500/10', border: 'border-pink-500/20' }, // GOD-like
    { color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' }, // Cosmic-like
    { color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' }, // Supreme-like
    { color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20' } // Legend-like
]

const getTier = (points, config) => {
    const defaultTier = { name: 'Noob', color: 'text-zinc-400', bg: 'bg-zinc-400/10', border: 'border-zinc-400/20', icon: '🐣' }
    if (!config || !config.ranks || config.ranks.length === 0) {
        if (points >= 10000) return { name: 'DIAMOND', color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20', icon: '💎' }
        if (points >= 5000) return { name: 'PLATINUM', color: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20', icon: '💠' }
        if (points >= 2000) return { name: 'GOLD', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20', icon: '👑' }
        if (points >= 500) return { name: 'SILVER', color: 'text-slate-300', bg: 'bg-slate-300/10', border: 'border-slate-300/20', icon: '⚔️' }
        return { name: 'BRONZE', color: 'text-amber-700', bg: 'bg-amber-700/10', border: 'border-amber-700/20', icon: '🛡️' }
    }
    
    const sortedRanks = [...config.ranks].sort((a, b) => a.min_points - b.min_points)
    
    let matchedRank = sortedRanks[0]
    let matchedIdx = 0
    
    for (let i = 0; i < sortedRanks.length; i++) {
        if (points >= sortedRanks[i].min_points) {
            matchedRank = sortedRanks[i]
            matchedIdx = i
        }
    }
    
    if (!matchedRank) return defaultTier
    
    const style = TIER_STYLES[matchedIdx % TIER_STYLES.length]
    return {
        name: matchedRank.name,
        color: style.color,
        bg: style.bg,
        border: style.border,
        icon: matchedRank.emoji || '🛡️'
    }
}

function TierBadge({ points, config }) {
    const tier = getTier(points || 0, config)
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border ${tier.bg} ${tier.color} ${tier.border}`}>
            <span>{tier.icon}</span>
            {tier.name}
        </span>
    )
}

function StatBox({ title, value, icon, subtext }) {
    return (
        <Card className="bg-zinc-900 border-zinc-800 shadow-sm relative overflow-hidden">
            <CardContent className="p-6 flex items-center justify-between z-10 relative">
                <div>
                    <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{title}</div>
                    <div className="text-2xl font-bold mt-1 text-zinc-100">{value}</div>
                    {subtext && <div className="text-[10px] text-zinc-600 mt-1">{subtext}</div>}
                </div>
                <div className="h-10 w-10 rounded-lg bg-zinc-950 flex items-center justify-center border border-zinc-800 text-zinc-400">
                    {icon}
                </div>
            </CardContent>
            <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-gradient-to-br from-zinc-800/20 to-transparent rounded-full blur-xl pointer-events-none" />
        </Card>
    )
}
