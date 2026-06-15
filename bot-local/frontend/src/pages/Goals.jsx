import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Trash2, Edit2, Play, Save, CheckCircle2 } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export default function Goals({ backendStatus }) {
    const [goalsConfig, setGoalsConfig] = useState({ enabled: true, active_goals: [] })
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState({})

    const liveSubscribers = backendStatus?.bot?.subscriber_count || 0
    const liveLikes = backendStatus?.bot?.live_likes_count === undefined ? -1 : backendStatus.bot.live_likes_count

    // Auto-fill active subscriber count naturally
    useEffect(() => {
        if (editForm.type === 'subscribers' && editingId === 'new') {
            setEditForm(prev => ({ ...prev, current: liveSubscribers }))
        }
        if (editForm.type === 'likes' && editingId === 'new') {
            setEditForm(prev => ({ ...prev, current: liveLikes }))
        }
    }, [editForm.type, liveSubscribers, liveLikes, editingId])

    const fetchGoals = async () => {
        try {
            const res = await axios.get(`${API_URL}/goals`)
            setGoalsConfig(res.data)
        } catch (e) {
            console.error("Failed to fetch goals", e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchGoals() }, [])

    const toggleEnabled = async () => {
        await axios.post(`${API_URL}/goals/toggle`)
        fetchGoals()
    }

    const startEdit = (goal = null) => {
        if (!goal) {
            setEditingId('new')
            setEditForm({
                name: "New Sub Goal",
                type: "subscribers",
                target: 100,
                current: 0,
                keyword: "hype",
                reward: 500,
                duration: 300,
                color: "#ff0000",
                text_color: "#ffffff",
                layout: "classic"
            })
        } else {
            setEditingId(goal.id)
            setEditForm({ ...goal })
        }
    }

    const saveGoal = async () => {
        if (editingId === 'new') {
            await axios.post(`${API_URL}/goals`, editForm)
        } else {
            await axios.put(`${API_URL}/goals/${editingId}`, editForm)
        }
        setEditingId(null)
        setEditForm({})
        fetchGoals()
    }

    const deleteGoal = async (id) => {
        if (confirm("Delete this goal?")) {
            await axios.delete(`${API_URL}/goals/${id}`)
            fetchGoals()
        }
    }

    const getMetricLabel = () => {
        if (!editForm.type) return 'Amount'
        if (editForm.type === 'subscribers') return 'Subscribers'
        if (editForm.type === 'tips') return 'Tips Amount'
        if (editForm.type === 'likes') return 'Likes'
        return 'Amount'
    }

    if (loading) return <div>Loading...</div>

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-zinc-900 border border-white/10 p-6 rounded-2xl shadow-xl">
                <div>
                    <h2 className="text-2xl font-black text-white">Interactive Goals</h2>
                    <p className="text-zinc-400 text-sm mt-1">Set community goals that trigger point reward windows when achieved!</p>
                </div>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={toggleEnabled}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${goalsConfig.enabled ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
                    >
                        {goalsConfig.enabled ? 'System Enabled' : 'System Disabled'}
                    </button>
                    <button onClick={() => startEdit()} className="px-4 py-2 bg-primary text-white rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-primary/90 transition-all">
                        <Plus className="w-4 h-4" /> New Goal
                    </button>
                </div>
            </div>

            {editingId && (
                <div className="bg-zinc-900 border border-white/10 p-6 rounded-2xl shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
                    <h3 className="text-lg font-black text-white mb-4 uppercase tracking-wider">{editingId === 'new' ? 'Create Target' : 'Edit Target'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Goal Name</label>
                            <input 
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary transition-colors" 
                                value={editForm.name || ''} 
                                onChange={e => setEditForm({...editForm, name: e.target.value})} 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Metric Type</label>
                            <select 
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white outline-none"
                                value={editForm.type || 'subscribers'}
                                onChange={e => setEditForm({...editForm, type: e.target.value})}
                            >
                                <option value="subscribers">YouTube Subscribers</option>
                                <option value="tips">Total Tips</option>
                                <option value="likes">YouTube Likes</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Layout Style</label>
                            <select 
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white outline-none"
                                value={editForm.layout || 'classic'}
                                onChange={e => setEditForm({...editForm, layout: e.target.value})}
                            >
                                <option value="classic">Classic Original</option>
                                <option value="youtube">YouTube Clean</option>
                                <option value="modern">Gamer Glass</option>
                                <option value="minimal">Minimalist</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Target {getMetricLabel()}</label>
                            <input 
                                type="number"
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white" 
                                value={editForm.target || 0} 
                                onChange={e => setEditForm({...editForm, target: parseInt(e.target.value)})} 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Current {getMetricLabel()}</label>
                            {editForm.type === 'subscribers' ? (
                                <div className="w-full bg-black/50 border border-emerald-500/30 rounded-lg px-4 py-2 text-emerald-400 flex justify-between items-center opacity-70">
                                    <span className="font-mono">{liveSubscribers}</span>
                                    <span className="text-[10px] uppercase font-bold tracking-widest opacity-80 bg-emerald-500/20 px-2 py-0.5 rounded">Auto Synced</span>
                                </div>
                            ) : editForm.type === 'likes' ? (
                                <div className="w-full bg-black/50 border border-emerald-500/30 rounded-lg px-4 py-2 text-emerald-400 flex justify-between items-center opacity-70">
                                    <span className="font-mono">{editForm.current === -1 ? 'No live stream' : editForm.current || 0}</span>
                                    <span className="text-[10px] uppercase font-bold tracking-widest opacity-80 bg-emerald-500/20 px-2 py-0.5 rounded">Auto Synced</span>
                                </div>
                            ) : (
                                <input 
                                    type="number"
                                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white" 
                                    value={editForm.current || 0} 
                                    onChange={e => setEditForm({...editForm, current: parseInt(e.target.value)})} 
                                />
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Reward Keyword</label>
                            <input 
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white font-mono text-sm" 
                                value={editForm.keyword || ''} 
                                onChange={e => setEditForm({...editForm, keyword: e.target.value})} 
                                placeholder="hype"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Points Reward</label>
                            <input 
                                type="number"
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white" 
                                value={editForm.reward || 0} 
                                onChange={e => setEditForm({...editForm, reward: parseInt(e.target.value)})} 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Window Duration (sec)</label>
                            <input 
                                type="number"
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white" 
                                value={editForm.duration || 60} 
                                onChange={e => setEditForm({...editForm, duration: parseInt(e.target.value)})} 
                            />
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Bar Color</label>
                                <input 
                                    type="color"
                                    className="w-full h-10 bg-black/50 border border-white/10 rounded-lg cursor-pointer p-1" 
                                    value={editForm.color || '#ff0000'} 
                                    onChange={e => setEditForm({...editForm, color: e.target.value})} 
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Text Color</label>
                                <input 
                                    type="color"
                                    className="w-full h-10 bg-black/50 border border-white/10 rounded-lg cursor-pointer p-1" 
                                    value={editForm.text_color || '#ffffff'} 
                                    onChange={e => setEditForm({...editForm, text_color: e.target.value})} 
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button onClick={() => setEditingId(null)} className="px-5 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 font-bold transition-colors">Cancel</button>
                        <button onClick={saveGoal} className="px-6 py-2 bg-primary hover:bg-primary/80 text-white font-bold rounded-lg transition-colors flex items-center gap-2">
                            <Save className="w-4 h-4" /> Save
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {goalsConfig.active_goals && goalsConfig.active_goals.map(goal => (
                    <div key={goal.id} className="bg-zinc-900 border border-white/5 rounded-2xl p-6 relative overflow-hidden group shadow-lg">
                        <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: goal.color }} />
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl font-black text-white flex items-center gap-2 uppercase tracking-tight">
                                    {goal.name}
                                    {goal.achieved && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                                </h3>
                                <p className="text-zinc-500 text-sm mt-1 uppercase font-bold tracking-widest">{goal.type}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => startEdit(goal)} className="p-2 bg-white/5 hover:bg-white/20 rounded-lg text-zinc-300 transition-colors">
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => deleteGoal(goal.id)} className="p-2 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg text-rose-400 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-zinc-400 font-bold uppercase tracking-wider text-xs">Progress</span>
                                    <span className="text-white font-black">
                                        {goal.type === 'likes' && goal.current === -1 ? 'No live stream' : `${goal.current} / ${goal.target}`}
                                    </span>
                                </div>
                                <div className="w-full bg-black/50 rounded-full h-4 overflow-hidden border border-white/5">
                                    <div 
                                        className="h-full transition-all duration-1000 ease-out" 
                                        style={{ 
                                            width: `${Math.min(100, (goal.current / goal.target) * 100)}%`,
                                            backgroundColor: goal.color
                                        }} 
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5 bg-black/20 p-4 rounded-xl">
                                <div>
                                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Keyword</p>
                                    <p className="text-yellow-400 font-mono font-bold text-sm mt-1">!{goal.keyword}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Reward</p>
                                    <p className="text-emerald-400 font-black text-sm mt-1">+{goal.reward} Points</p>
                                </div>
                                <div className="col-span-2 mt-2 pt-2 border-t border-white/5 flex justify-between items-center">
                                    <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Status</span>
                                    {goal.reward_window_active ? (
                                        <span className="text-xs font-black text-yellow-400 flex items-center gap-1 animate-pulse uppercase tracking-wider"><Play className="w-3 h-3"/> Window Active</span>
                                    ) : goal.achieved ? (
                                        <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">Completed</span>
                                    ) : (
                                        <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">In Progress</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
