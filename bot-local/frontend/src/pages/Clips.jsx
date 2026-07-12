import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Video, RefreshCw, Trash2, ExternalLink, Clock, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'

export default function ClipsPage() {
    const [clips, setClips] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    // SAFEGUARD: Access env vars safely
    const env = import.meta.env || {}
    const API_URL = env.VITE_API_URL || "/api"

    const fetchClips = async (isManual = false) => {
        if (isManual) setRefreshing(true)
        try {
            const res = await axios.get(`${API_URL}/clips`)
            setClips(res.data.clips || [])
        } catch (e) {
            console.error("Failed to fetch clips", e)
        } finally {
            setLoading(false)
            if (isManual) setRefreshing(false)
        }
    }

    const clearClips = async () => {
        if (!confirm("Are you sure you want to clear all clips? This cannot be undone.")) return
        try {
            await axios.delete(`${API_URL}/clips`)
            setClips([])
            alert("Clips cleared successfully.")
        } catch (e) {
            alert("Failed to clear clips: " + e.message)
        }
    }

    useEffect(() => {
        fetchClips()
        const interval = setInterval(() => {
            fetchClips()
        }, 10000)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="space-y-6 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
                <div>
                    <h2 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
                        <Video className="h-5 w-5 text-purple-400" />
                        Stream Clips Log
                    </h2>
                    <p className="text-sm text-zinc-400">View real-time clips generated from YouTube Chat via `!clip`.</p>
                </div>
                <div className="flex gap-2">
                    <Button 
                        onClick={() => fetchClips(true)} 
                        disabled={refreshing}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold h-9"
                    >
                        <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> 
                        Refresh
                    </Button>
                    <Button 
                        onClick={clearClips} 
                        className="bg-red-950 hover:bg-red-900 text-red-400 border border-red-800 text-xs font-bold h-9"
                    >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> 
                        Clear Logs
                    </Button>
                </div>
            </div>

            <Card className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden">
                <CardHeader className="bg-zinc-950/50 border-b border-zinc-800 pb-3">
                    <CardTitle className="text-sm font-semibold text-zinc-300">Generated Clips</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-8 text-center text-zinc-500 text-sm">
                            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-zinc-600" />
                            Loading clips...
                        </div>
                    ) : clips.length === 0 ? (
                        <div className="p-8 text-center text-zinc-500 text-sm">
                            <Video className="h-8 w-8 mx-auto mb-3 text-zinc-700" />
                            No clips generated yet. Viewers can type <code className="bg-zinc-800 px-1 rounded text-zinc-300">!clip</code> in chat to capture stream highlights!
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-zinc-950/80 text-zinc-500 text-[10px] uppercase tracking-widest border-b border-zinc-800">
                                        <th className="p-4 font-medium w-1/4"><Clock className="inline h-3 w-3 mr-1" /> Time Generated</th>
                                        <th className="p-4 font-medium w-1/4"><User className="inline h-3 w-3 mr-1" /> Clipped By</th>
                                        <th className="p-4 font-medium w-1/2">URL</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm divide-y divide-zinc-800/50">
                                    {clips.map((clip, idx) => (
                                        <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="p-4 text-zinc-300 font-mono text-xs">
                                                {clip.timestamp}
                                            </td>
                                            <td className="p-4">
                                                <span className="font-semibold text-zinc-200">@{clip.author}</span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <a 
                                                        href={clip.url} 
                                                        target="_blank" 
                                                        rel="noreferrer"
                                                        className="text-blue-400 hover:text-blue-300 transition-colors font-mono text-xs truncate max-w-xs block"
                                                    >
                                                        {clip.url}
                                                    </a>
                                                    <a 
                                                        href={clip.url} 
                                                        target="_blank" 
                                                        rel="noreferrer"
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300" />
                                                    </a>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
