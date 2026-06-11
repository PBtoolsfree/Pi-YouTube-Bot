import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
    Sparkles, Plus, Trash2, Edit3, Play, Monitor, Timer, Zap,
    AlertTriangle, Check, X, Eye, EyeOff, Clock, Info, Shield, MessageSquare, Gift
} from 'lucide-react'
import { Card, CardHeader, CardContent, CardTitle, Button, Input, Switch, Label } from '@/components/ui'

function safeFixed(value, digits = 1, fallback = "0") {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : fallback;
}

const API = '/api/redeems'

export default function RedeemManager() {
    const [redeems, setRedeems] = useState([])
    const [ranks, setRanks] = useState([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [editing, setEditing] = useState(null) // null = creating new, obj = editing
    const [testingId, setTestingId] = useState(null)
    const [deleteConfirm, setDeleteConfirm] = useState(null)


    // Form state
    const [form, setForm] = useState({
        name: '', cost: 500, type: 'obs', obs_source: '', obs_filter: '',
        sb_action: '', required_rank: '', duration_ms: 5000, mod_duration_days: 7, cooldown_sec: 30, enabled: true,
        eligibility: 'everyone', giveaway_wheel_style: 'roulette', giveaway_elimination: false,
        giveaway_spin_duration: 5, giveaway_multi_winner: 1
    })

    const fetchRedeems = useCallback(async () => {
        try {
            const [redeemsRes, configRes] = await Promise.all([
                 axios.get(API),
                 axios.get('/api/loyalty/config')
            ])
            setRedeems(redeemsRes.data)
            if (configRes.data && configRes.data.ranks) {
                setRanks(configRes.data.ranks)
            }

        } catch (e) {
            console.error('Failed to fetch redeems', e)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchRedeems()
        const iv = setInterval(fetchRedeems, 5000)
        return () => clearInterval(iv)
    }, [fetchRedeems])

    const resetForm = () => {
        setForm({ name: '', cost: 500, type: 'obs', obs_source: '', obs_filter: '', sb_action: '', required_rank: '', duration_ms: 5000, mod_duration_days: 7, cooldown_sec: 30, enabled: true, eligibility: 'everyone', giveaway_wheel_style: 'roulette', giveaway_elimination: false, giveaway_spin_duration: 5, giveaway_multi_winner: 1, giveaway_prize: '' })
        setEditing(null)
        setShowForm(false)
    }

    const openCreate = () => {
        resetForm()
        setShowForm(true)
    }

    const openEdit = (r) => {
        setForm({
            name: r.name, cost: r.cost, type: r.type || 'obs', obs_source: r.obs_source || '',
            obs_filter: r.obs_filter || '', sb_action: r.sb_action || '', required_rank: r.required_rank || '',
            duration_ms: r.duration_ms, mod_duration_days: r.mod_duration_days || 7, cooldown_sec: r.cooldown_sec, enabled: r.enabled,
            eligibility: r.eligibility || 'everyone', giveaway_wheel_style: r.giveaway_wheel_style || 'roulette',
            giveaway_elimination: r.giveaway_elimination || false, giveaway_spin_duration: r.giveaway_spin_duration || 5, giveaway_multi_winner: r.giveaway_multi_winner || 1, giveaway_prize: r.giveaway_prize || ''
        })
        setEditing(r)
        setShowForm(true)
    }

    const handleSave = async () => {
        try {
            if (editing) {
                await axios.put(`${API}/${editing.id}`, form)
            } else {
                await axios.post(API, form)
            }
            resetForm()
            fetchRedeems()
        } catch (e) {
            alert('Save failed: ' + (e.response?.data?.detail || e.message))
        }
    }

    const handleDelete = async (id) => {
        try {
            await axios.delete(`${API}/${id}`)
            setDeleteConfirm(null)
            fetchRedeems()
        } catch (e) {
            alert('Delete failed: ' + e.message)
        }
    }

    const handleTest = async (id) => {
        setTestingId(id)
        try {
            const res = await axios.post(`${API}/${id}/test`)
            if (res.data && res.data.sb_sent === false) {
                alert('⚠️ Streamer.bot is disconnected — the effect may not appear in OBS.')
            }
        } catch (e) {
            alert('Test failed: ' + (e.response?.data?.detail || e.message))
        } finally {
            setTimeout(() => setTestingId(null), 2000)
            fetchRedeems()
        }
    }

    const handleToggle = async (r) => {
        try {
            await axios.put(`${API}/${r.id}`, { enabled: !r.enabled })
            fetchRedeems()
        } catch (e) {
            console.error('Toggle failed', e)
        }
    }

    return (
        <div className="space-y-6 pb-10">
            {/* Header */}
            <div className="flex justify-between items-center px-1">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-purple-500" />
                        Rewards Shop
                    </h2>
                    <p className="text-sm text-zinc-400">
                        Manage effects and rewards that viewers can redeem with Points.
                    </p>
                </div>
                <Button
                    onClick={openCreate}
                    className="h-9 px-4 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold gap-2"
                >
                    <Plus className="h-4 w-4" /> Add Reward
                </Button>
            </div>

            {/* Setup Guide */}
            <Card className="bg-zinc-900/50 border-zinc-800 shadow-sm">
                <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-zinc-400 space-y-1">
                            <p className="text-zinc-300 font-medium">How it works:</p>
                            <p>1. Create a reward below with an OBS source name, filter name, and a Streamer.bot action.</p>
                            <p>2. In <span className="text-cyan-400 font-mono">Streamer.bot</span>, create an action matching the <span className="text-amber-400 font-mono">SB Action Name</span>. Use <span className="text-zinc-300">OBS → Set Source Filter Visibility</span> sub-action.</p>
                            <p>3. Viewers use <span className="text-emerald-400 font-mono">!redeem &lt;name&gt;</span> in chat to trigger the reward.</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Form Modal */}
            {showForm && (
                <Card className="bg-zinc-900 border-purple-500/30 shadow-lg shadow-purple-500/5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500" />
                    <CardHeader className="pb-4 border-b border-zinc-800">
                        <CardTitle className="text-base flex items-center gap-2 text-zinc-100">
                            {editing ? <Edit3 className="h-4 w-4 text-amber-400" /> : <Plus className="h-4 w-4 text-purple-400" />}
                            {editing ? 'Edit Reward' : 'New Reward'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-5 space-y-5">
                        {/* Row 1: Name & Cost */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Name</Label>
                                <Input
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="e.g. Blur Meme"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Cost (Points)</Label>
                                <Input
                                    type="number"
                                    value={form.cost}
                                    onChange={e => setForm({ ...form, cost: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
                                    min={0}
                                />
                            </div>
                        </div>

                        {/* Row 1.5: Type & Role ID */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400 uppercase tracking-wider">Reward Type</Label>
                                <select
                                    value={form.type}
                                    onChange={e => setForm({ ...form, type: e.target.value })}
                                    className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                >
                                    <option value="obs">OBS Effect (Streamer.bot)</option>
                                    <option value="youtube_mod">YouTube Moderator</option>
                                    <option value="giveaway_ticket">Giveaway Ticket</option>
                                </select>
                            </div>
                            {form.type === 'giveaway_ticket' && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400 uppercase tracking-wider">Eligibility</Label>
                                    <select
                                        value={form.eligibility}
                                        onChange={e => setForm({ ...form, eligibility: e.target.value })}
                                        className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                    >
                                        <option value="everyone">Everyone</option>
                                        <option value="member">Members Only</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Row 2: OBS Source & Filter (Conditional) */}
                        {form.type === 'obs' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                                        <Monitor className="h-3 w-3" /> OBS Source Name
                                    </Label>
                                    <Input
                                        value={form.obs_source}
                                        onChange={e => setForm({ ...form, obs_source: e.target.value })}
                                        placeholder="e.g. GameCapture"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                                        <Eye className="h-3 w-3" /> OBS Filter Name
                                    </Label>
                                    <Input
                                        value={form.obs_filter}
                                        onChange={e => setForm({ ...form, obs_filter: e.target.value })}
                                        placeholder="e.g. BlurFilter"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Giveaway Toggles */}
                        {form.type === 'giveaway_ticket' && (
                            <div className="grid grid-cols-2 gap-4 mb-2 p-3 bg-zinc-900/50 rounded-lg border border-indigo-500/20">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 mt-2">
                                        <Switch checked={form.giveaway_elimination} onCheckedChange={v => setForm({ ...form, giveaway_elimination: v })} />
                                        <Label className="text-xs text-rose-300 flex items-center gap-1 font-bold">
                                            Elimination Mode (Reverse) 🔥
                                        </Label>
                                    </div>
                                    <div className="space-y-1.5 mt-2">
                                        <Label className="text-xs text-zinc-400 uppercase tracking-wider">Wheel Style</Label>
                                        <select
                                            value={form.giveaway_wheel_style}
                                            onChange={e => setForm({ ...form, giveaway_wheel_style: e.target.value })}
                                            className="flex h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-100"
                                        >
                                            <option value="roulette">Circular Roulette</option>
                                            <option value="slot">Vertical Slot-Machine</option>
                                            <option value="csgo">Horizontal CS:GO Box</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="space-y-1.5 mt-1">
                                        <Label className="text-xs text-zinc-400 uppercase tracking-wider">Spin Duration (Secs)</Label>
                                        <Input
                                            type="number"
                                            value={form.giveaway_spin_duration}
                                            onChange={e => setForm({ ...form, giveaway_spin_duration: e.target.value === '' ? '' : parseInt(e.target.value) })}
                                            min={1} max={60} className="h-8"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-zinc-400 uppercase tracking-wider">Multi-Winners Count</Label>
                                        <Input
                                            type="number"
                                            value={form.giveaway_multi_winner}
                                            onChange={e => setForm({ ...form, giveaway_multi_winner: e.target.value === '' ? '' : parseInt(e.target.value) })}
                                            min={1} max={50} className="h-8"
                                        />
                                    </div>
                                    <div className="space-y-1.5 mt-2">
                                        <Label className="text-xs text-indigo-300 uppercase tracking-wider font-bold">Prize Description</Label>
                                        <Input
                                            type="text"
                                            placeholder="e.g. $10 Gift Card"
                                            value={form.giveaway_prize}
                                            onChange={e => setForm({ ...form, giveaway_prize: e.target.value })}
                                            className="h-8 border-indigo-500/30"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Row 3: SB Action & Required Rank */}
                        <div className="grid grid-cols-2 gap-4">
                            {form.type === 'obs' ? (
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                                        <Zap className="h-3 w-3" /> Streamer.bot Action Name
                                    </Label>
                                    <Input
                                        value={form.sb_action}
                                        onChange={e => setForm({ ...form, sb_action: e.target.value })}
                                        placeholder="e.g. MemeFilter_Blur (must match...)"
                                    />
                                    <p className="text-[10px] text-zinc-600">Leave blank to auto-generate</p>
                                </div>
                            ) : <div />}
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                                    <Sparkles className="h-3 w-3" /> Required Rank
                                </Label>
                                <select
                                    value={form.required_rank}
                                    onChange={e => setForm({ ...form, required_rank: e.target.value })}
                                    className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                >
                                    <option value="">None (Anyone can redeem)</option>
                                    {ranks.map(r => (
                                        <option key={r.name} value={r.name}>{r.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            {form.type === 'obs' && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                                        <Timer className="h-3 w-3" /> Duration (ms)
                                    </Label>
                                    <Input
                                        type="number"
                                        value={form.duration_ms}
                                        onChange={e => setForm({ ...form, duration_ms: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
                                        min={500}
                                        step={500}
                                    />
                                </div>
                            )}
                            {form.type === 'youtube_mod' && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                                        <Shield className="h-3 w-3" /> Mod Duration (Days)
                                    </Label>
                                    <Input
                                        type="number"
                                        value={form.mod_duration_days}
                                        onChange={e => setForm({ ...form, mod_duration_days: e.target.value === '' ? '' : (parseInt(e.target.value) || 1) })}
                                        min={1}
                                        step={1}
                                    />
                                    <p className="text-[10px] text-zinc-600">How many days of YouTube Moderator status</p>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label className="text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> Cooldown (sec)
                                </Label>
                                <Input
                                    type="number"
                                    value={form.cooldown_sec}
                                    onChange={e => setForm({ ...form, cooldown_sec: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
                                    min={0}
                                />
                            </div>
                            <div className="space-y-1.5 flex items-end pb-1">
                                <div className="flex items-center gap-2">
                                    <Switch checked={form.enabled} onCheckedChange={v => setForm({ ...form, enabled: v })} />
                                    <Label className="text-xs text-zinc-300">Enabled</Label>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <Button
                                onClick={handleSave}
                                className="h-9 px-6 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold gap-2"
                            >
                                <Check className="h-4 w-4" /> {editing ? 'Update' : 'Create'}
                            </Button>
                            <Button
                                onClick={resetForm}
                                variant="ghost"
                                className="h-9 px-4 text-zinc-400 hover:text-white text-sm gap-2"
                            >
                                <X className="h-4 w-4" /> Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Rewards Grid */}
            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full" />
                </div>
            ) : redeems.length === 0 ? (
                <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="p-12 text-center">
                        <Sparkles className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                        <p className="text-zinc-500 text-sm">No rewards yet. Click "Add Reward" to create one!</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {redeems.map(r => (
                        <Card
                            key={r.id}
                            className={`bg-zinc-900 border-zinc-800 shadow-sm relative overflow-hidden group hover:border-zinc-700 transition-all duration-300 ${!r.enabled ? 'opacity-50' : ''} ${r.is_active ? 'border-purple-500/50 shadow-md shadow-purple-500/10' : ''}`}
                        >
                            {/* Active glow */}
                            {r.is_active && (
                                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 pointer-events-none animate-pulse" />
                            )}

                            {/* Top accent bar */}
                            <div className={`h-0.5 w-full ${r.enabled ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-zinc-800'}`} />

                            <CardContent className="p-5 relative z-10">
                                {/* Header */}
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                            {(r.type === 'youtube_mod' || r.type === 'discord_role') ? (
                                                <div className="h-10 w-10 rounded-lg flex items-center justify-center border text-lg bg-blue-500/20 border-blue-500/40">
                                                    {r.type === 'youtube_mod' ? <Shield className="h-5 w-5 text-blue-400" /> : <MessageSquare className="h-5 w-5 text-blue-400" />}
                                                </div>
                                            ) : r.type === 'giveaway_ticket' ? (
                                                <div className="h-10 w-10 rounded-lg flex items-center justify-center border text-lg bg-indigo-500/20 border-indigo-500/40">
                                                    <Gift className="h-5 w-5 text-indigo-400" />
                                                </div>
                                            ) : (
                                                <div className={`h-10 w-10 rounded-lg flex items-center justify-center border text-lg ${r.is_active ? 'bg-purple-500/20 border-purple-500/40' : 'bg-zinc-950 border-zinc-800'}`}>
                                                    🎭
                                                </div>
                                            )}
                                        <div>
                                            <h3 className="font-semibold text-zinc-100 text-sm">{r.name}</h3>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">
                                                    {r.cost.toLocaleString()} Points
                                                </span>
                                                {r.is_active && (
                                                    <span className="text-[10px] font-bold bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20 animate-pulse">
                                                        ACTIVE
                                                    </span>
                                                )}
                                                {r.required_rank && (
                                                    <span className="text-[10px] font-bold bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700">
                                                        Rank: {r.required_rank}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={r.enabled}
                                        onCheckedChange={() => handleToggle(r)}
                                    />
                                </div>

                                {/* Details */}
                                <div className="space-y-2 text-[11px] text-zinc-500 mb-4">
                                    {r.type === 'obs' || !r.type ? (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <Monitor className="h-3 w-3 text-zinc-600" />
                                                <span className="text-zinc-400">{r.obs_source || '—'}</span>
                                                <span className="text-zinc-700">→</span>
                                                <span className="text-zinc-400">{r.obs_filter || '—'}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Zap className="h-3 w-3 text-zinc-600" />
                                                <span className="text-zinc-400 font-mono">{r.sb_action || `MemeFilter_${r.name}`}</span>
                                            </div>
                                        </>

                                    ) : r.type === 'discord_role' ? (
                                        <div className="flex items-center gap-2">
                                            <MessageSquare className="h-3 w-3 text-zinc-600" />
                                            <span className="text-zinc-400">Role ID: <span className="font-mono">{r.role_id || '—'}</span></span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <Shield className="h-3 w-3 text-zinc-600" />
                                            <span className="text-zinc-400">YouTube Moderator</span>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-4">
                                        {(r.type === 'obs' || !r.type) && (
                                            <div className="flex items-center gap-1">
                                                <Timer className="h-3 w-3 text-zinc-600" />
                                                <span>{safeFixed(r.duration_ms / 1000, 1)}s</span>
                                            </div>
                                        )}
                                        {r.type === 'youtube_mod' && (
                                            <div className="flex items-center gap-1">
                                                <Shield className="h-3 w-3 text-zinc-600" />
                                                <span>{r.mod_duration_days || 7} days</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1">
                                            <Clock className="h-3 w-3 text-zinc-600" />
                                            <span>{r.cooldown_sec}s cd</span>
                                            {r.cooldown_remaining > 0 && (
                                                <span className="text-amber-400 font-bold">({Math.ceil(r.cooldown_remaining)}s)</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => handleTest(r.id)}
                                        variant="outline"
                                        size="sm"
                                        disabled={testingId === r.id || r.is_active}
                                        className={`flex-1 h-8 text-xs gap-1.5 ${testingId === r.id ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-300'}`}
                                    >
                                        {testingId === r.id ? <Check className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                                        {testingId === r.id ? 'Sent!' : 'Test'}
                                    </Button>
                                    <Button
                                        onClick={() => openEdit(r)}
                                        variant="outline"
                                        size="sm"
                                        className="h-8 w-8 p-0 bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-400"
                                    >
                                        <Edit3 className="h-3.5 w-3.5" />
                                    </Button>
                                    {deleteConfirm === r.id ? (
                                        <div className="flex gap-1">
                                            <Button
                                                onClick={() => handleDelete(r.id)}
                                                variant="destructive"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                onClick={() => setDeleteConfirm(null)}
                                                variant="outline"
                                                size="sm"
                                                className="h-8 w-8 p-0 bg-zinc-900 border-zinc-700"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            onClick={() => setDeleteConfirm(r.id)}
                                            variant="outline"
                                            size="sm"
                                            className="h-8 w-8 p-0 bg-zinc-900 border-zinc-700 hover:bg-rose-900/30 hover:border-rose-500/30 text-zinc-400 hover:text-rose-400"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Chat Command Reference */}
            <Card className="bg-zinc-900/30 border-zinc-800/50">
                <CardContent className="p-4">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-purple-400" />
                        Chat Commands
                    </h4>
                    <div className="grid gap-2 md:grid-cols-2 text-xs">
                        <div className="bg-zinc-950/50 rounded-lg px-3 py-2 border border-zinc-800/50">
                            <span className="text-emerald-400 font-mono font-bold">!redeem &lt;name&gt;</span>
                            <span className="text-zinc-500 ml-2">— Activate a reward</span>
                        </div>
                        <div className="bg-zinc-950/50 rounded-lg px-3 py-2 border border-zinc-800/50">
                            <span className="text-emerald-400 font-mono font-bold">!redeem / !shop</span>
                            <span className="text-zinc-500 ml-2">— List available rewards</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
