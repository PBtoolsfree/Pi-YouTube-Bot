import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Users, Trophy, MessageSquare, Clock, Search } from 'lucide-react'
import { Card, CardHeader, CardContent, CardTitle, Input } from '@/components/ui'
import { PageStatusBar } from '@/components/ServiceStatus'

export default function ViewersPage() {
    const [viewers, setViewers] = useState({})
    const [search, setSearch] = useState('')

    useEffect(() => {
        const fetchViewers = async () => {
            try {
                const res = await axios.get('/api/viewers')
                setViewers(res.data)
            } catch (e) {
                console.error("Viewers fetch error", e)
            }
        }
        fetchViewers()
        const div = setInterval(fetchViewers, 10000)
        return () => clearInterval(div)
    }, [])

    const sortedViewers = Object.entries(viewers)
        .map(([name, data]) => ({ name, ...data }))
        .filter(v => v.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => b.count - a.count)

    const getRankInfo = (count) => {
        if (count >= 1000) return { name: "GOD", emoji: "👑", color: "text-amber-400" }
        if (count >= 500) return { name: "Diamond", emoji: "💎", color: "text-blue-400" }
        if (count >= 200) return { name: "Gold", emoji: "🥇", color: "text-yellow-500" }
        if (count >= 50) return { name: "Silver", emoji: "🥈", color: "text-zinc-300" }
        if (count >= 10) return { name: "Bronze", emoji: "🥉", color: "text-orange-400" }
        return { name: "Noob", emoji: "🐣", color: "text-zinc-500" }
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <PageStatusBar services={['bot', 'youtube']} />
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Viewer Memory</h2>
                    <p className="text-muted-foreground">Persistent tracking of your most active audience members.</p>
                </div>
                <div className="flex items-center gap-2 bg-muted px-4 py-2 rounded-lg border border-zinc-800">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="font-bold">{Object.keys(viewers).length}</span>
                    <span className="text-xs text-muted-foreground uppercase text-[10px] ml-1">Total Viewers</span>
                </div>
            </div>

            <Card className="border-zinc-800 bg-black/40">
                <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Trophy className="h-5 w-5 text-amber-500" /> Audience Leaderboard
                    </CardTitle>
                    <div className="relative w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search user..."
                            className="pl-9 h-9"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs uppercase bg-white/5 text-muted-foreground border-b border-white/5">
                                <tr>
                                    <th className="px-6 py-3 font-medium text-zinc-300">Rank</th>
                                    <th className="px-6 py-3 font-medium text-zinc-300">Username</th>
                                    <th className="px-6 py-3 font-medium text-center text-zinc-300">Messages</th>
                                    <th className="px-6 py-3 font-medium text-center text-zinc-300">Current Level</th>
                                    <th className="px-6 py-3 font-medium text-right text-zinc-300">Last Seen</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {sortedViewers.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-12 text-center text-muted-foreground">
                                            No viewers found.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedViewers.map((viewer, idx) => {
                                        const rank = getRankInfo(viewer.count)
                                        return (
                                            <tr key={viewer.name} className="hover:bg-white/5 transition-colors group">
                                                <td className="px-6 py-4 font-mono text-zinc-400">#{idx + 1}</td>
                                                <td className="px-6 py-4 font-bold text-white">{viewer.name}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="inline-flex items-center gap-1.5 bg-muted px-2 py-1 rounded border border-white/5">
                                                        <MessageSquare className="h-3 w-3 text-blue-400" />
                                                        {viewer.count}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${rank.color.replace('text', 'border')}/20 ${rank.color.replace('text', 'bg')}/10 ${rank.color}`}>
                                                        {rank.emoji} {rank.name}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right text-xs text-muted-foreground font-mono">
                                                    {new Date(viewer.last_seen * 1000).toLocaleString()}
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
