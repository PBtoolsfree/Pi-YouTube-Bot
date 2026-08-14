import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Video, RefreshCw, Trash2, ExternalLink, Clock, User, Settings, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'

export default function ClipsPage() {
    const [clips, setClips] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [activeTab, setActiveTab] = useState('logs') // 'logs' or 'settings'
    
    const [settings, setSettings] = useState({
        everyone: { enabled: true, daily_limit: 3, point_cost: 50 },
        member: { enabled: true, daily_limit: 10, point_cost: 0 }
    })
    const [saving, setSaving] = useState(false)

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

    const fetchSettings = async () => {
        try {
            const res = await axios.get(`${API_URL}/config`)
            if (res.data && res.data.clip_settings) {
                setSettings(prev => ({ ...prev, ...res.data.clip_settings }))
            }
        } catch (e) {
            console.error("Failed to fetch clip settings", e)
        }
    }

    const saveSettings = async () => {
        setSaving(true)
        try {
            const res = await axios.get(`${API_URL}/config`)
            const currentConfig = res.data
            currentConfig.clip_settings = settings
            await axios.post(`${API_URL}/config`, { config: currentConfig })
            alert("Settings saved successfully!")
        } catch (e) {
            alert("Failed to save settings: " + (e.response?.data?.detail || e.message))
        } finally {
            setSaving(false)
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
        fetchSettings()
        const interval = setInterval(() => {
            if (activeTab === 'logs') {
                fetchClips()
            }
        }, 10000)
        return () => clearInterval(interval)
    }, [activeTab])

    const handleSettingChange = (tier, field, value) => {
        setSettings(s => ({ ...s, [tier]: { ...s[tier], [field]: value } }))
    }

    return (
        <div className="space-y-6 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
                <div>
                    <h2 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
                        <Video className="h-5 w-5 text-purple-400" />
                        Stream Clips
                    </h2>
                    <p className="text-sm text-zinc-400">Manage real-time clips and viewer limits.</p>
                </div>
                <div className="flex gap-2 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                    <button 
                        onClick={() => setActiveTab('logs')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'logs' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
                    >
                        Clips Log
                    </button>
                    <button 
                        onClick={() => setActiveTab('settings')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${activeTab === 'settings' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
                    >
                        <Settings className="h-4 w-4" /> Settings
                    </button>
                </div>
            </div>

            {activeTab === 'logs' && (
                <div className="space-y-4">
                    <div className="flex justify-end gap-2">
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
            )}

            {activeTab === 'settings' && (
                <div className="space-y-6">
                    <div className="flex justify-end">
                        <Button 
                            onClick={saveSettings} 
                            disabled={saving}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold h-9 px-6"
                        >
                            <Save className={`mr-2 h-4 w-4 ${saving ? 'animate-pulse' : ''}`} />
                            {saving ? 'Saving...' : 'Save Settings'}
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {['everyone', 'member'].map((tier) => (
                            <Card key={tier} className="bg-zinc-900 border-zinc-800">
                                <CardHeader className="bg-zinc-950/50 border-b border-zinc-800 pb-4">
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-sm font-semibold text-zinc-100 capitalize flex items-center gap-2">
                                            {tier === 'member' && <span className="text-green-400">💎</span>}
                                            {tier === 'subscriber' && <span className="text-red-400">⭐</span>}
                                            {tier === 'everyone' && <span className="text-zinc-400">🌍</span>}
                                            {tier} Tier
                                        </CardTitle>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                className="sr-only peer" 
                                                checked={settings[tier]?.enabled ?? true}
                                                onChange={(e) => handleSettingChange(tier, 'enabled', e.target.checked)}
                                            />
                                            <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                                        </label>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-5 space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Points Cost</label>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                min="0"
                                                className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-2 px-3 text-sm text-zinc-100 focus:outline-none focus:border-purple-500 transition-colors"
                                                value={settings[tier]?.point_cost ?? 0}
                                                onChange={(e) => handleSettingChange(tier, 'point_cost', parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                        <p className="text-[11px] text-zinc-500">Cost to generate one clip.</p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Daily Limit</label>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                min="1"
                                                className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-2 px-3 text-sm text-zinc-100 focus:outline-none focus:border-purple-500 transition-colors"
                                                value={settings[tier]?.daily_limit ?? 3}
                                                onChange={(e) => handleSettingChange(tier, 'daily_limit', parseInt(e.target.value) || 1)}
                                            />
                                        </div>
                                        <p className="text-[11px] text-zinc-500">Max clips per viewer per day.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
