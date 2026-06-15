import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from '@/components/ui'
import { Clock, Plus, Trash2, Edit3, Save, X, ToggleLeft, ToggleRight, MessageCircle, Power } from 'lucide-react'
import { PageStatusBar } from '@/components/ServiceStatus'

export default function AutoMessages() {
    const [data, setData] = useState({ enabled: false, messages: [] })
    const [showAdd, setShowAdd] = useState(false)
    const [editing, setEditing] = useState(null)
    const [form, setForm] = useState({ id: '', text: '', interval_minutes: 15, enabled: true })

    const fetchData = async () => {
        try {
            const res = await axios.get('/api/auto-messages')
            setData(res.data || { enabled: false, messages: [] })
        } catch (e) { console.error(e) }
    }

    useEffect(() => { fetchData() }, [])

    const toggleGlobal = async () => {
        try {
            const res = await axios.post('/api/auto-messages/toggle')
            setData(prev => ({ ...prev, enabled: res.data.enabled }))
        } catch (e) { console.error(e) }
    }

    const handleSave = async () => {
        if (!form.id || !form.text) return alert('ID and message text are required!')
        try {
            const res = await axios.post('/api/auto-messages', form)
            setData(res.data.auto_messages || { enabled: false, messages: [] })
            setShowAdd(false)
            setEditing(null)
            setForm({ id: '', text: '', interval_minutes: 15, enabled: true })
        } catch (e) { alert('Save failed: ' + e.message) }
    }

    const handleDelete = async (msgId) => {
        if (!confirm(`Delete auto-message "${msgId}"?`)) return
        try {
            const res = await axios.delete(`/api/auto-messages/${msgId}`)
            setData(res.data.auto_messages || { enabled: false, messages: [] })
        } catch (e) { alert('Delete failed: ' + e.message) }
    }

    const startEdit = (msg) => {
        setEditing(msg.id)
        setForm({ id: msg.id, text: msg.text, interval_minutes: msg.interval_minutes || 15, enabled: msg.enabled !== false })
        setShowAdd(true)
    }

    const toggleMessage = async (msg) => {
        try {
            const res = await axios.post('/api/auto-messages', {
                ...msg,
                enabled: !msg.enabled
            })
            setData(res.data.auto_messages || { enabled: false, messages: [] })
        } catch (e) { console.error(e) }
    }

    const messages = data.messages || []

    return (
        <div className="space-y-6">
            <PageStatusBar services={['bot', 'youtube']} />
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                        <Clock className="h-5 w-5 text-teal-500" /> Scheduled Auto-Messages
                    </h2>
                    <p className="text-sm text-zinc-500 mt-1">Automatically send recurring messages to chat at timed intervals</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Global Toggle */}
                    <button onClick={toggleGlobal}
                        className={`flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-lg transition-all border ${data.enabled
                            ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'text-zinc-500 bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
                            }`}>
                        <Power className="h-4 w-4" />
                        {data.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <Button onClick={() => { setShowAdd(true); setEditing(null); setForm({ id: '', text: '', interval_minutes: 15, enabled: true }) }}
                        className="bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                        <Plus className="h-4 w-4" /> Add Message
                    </Button>
                </div>
            </div>

            {/* Global Status Banner */}
            {!data.enabled && messages.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-sm text-amber-300 flex items-center gap-2">
                    <Power className="h-4 w-4" />
                    Auto-messages are globally disabled. Enable them to start sending.
                </div>
            )}

            {/* Add/Edit Form */}
            {showAdd && (
                <Card className="bg-zinc-900 border border-teal-500/30 shadow-lg shadow-teal-500/5">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="text-sm font-semibold text-zinc-100">
                            {editing ? `Edit: ${editing}` : 'New Auto-Message'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">ID (unique)</label>
                                <Input
                                    value={form.id}
                                    onChange={e => setForm({ ...form, id: e.target.value.replace(/\s/g, '_').toLowerCase() })}
                                    placeholder="follow_reminder"
                                    disabled={!!editing}
                                    className="bg-zinc-950 border-zinc-700 text-zinc-100 font-mono"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Message Text</label>
                                <Input
                                    value={form.text}
                                    onChange={e => setForm({ ...form, text: e.target.value })}
                                    placeholder="💜 Enjoying the stream? Hit that Subscribe button!"
                                    className="bg-zinc-950 border-zinc-700 text-zinc-100"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Interval (min)</label>
                                <Input
                                    type="number"
                                    value={form.interval_minutes}
                                    onChange={e => setForm({ ...form, interval_minutes: parseInt(e.target.value) || 15 })}
                                    min={1}
                                    className="bg-zinc-950 border-zinc-700 text-zinc-100"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <Button onClick={handleSave}
                                className="bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold px-5 py-2 rounded-lg flex items-center gap-2">
                                <Save className="h-4 w-4" /> {editing ? 'Update' : 'Create'}
                            </Button>
                            <Button onClick={() => { setShowAdd(false); setEditing(null) }}
                                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-bold px-5 py-2 rounded-lg flex items-center gap-2 border border-zinc-700">
                                <X className="h-4 w-4" /> Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Messages List */}
            {messages.length === 0 ? (
                <Card className="bg-zinc-900 border border-zinc-800 p-12 text-center">
                    <MessageCircle className="h-10 w-10 text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500 text-sm">No auto-messages configured. Click "Add Message" to create one!</p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {messages.map((msg) => (
                        <Card key={msg.id} className={`bg-zinc-900 border ${msg.enabled !== false ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'} shadow-sm hover:border-zinc-700 transition-colors`}>
                            <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="bg-teal-500/10 text-teal-400 border border-teal-500/20 px-3 py-1 rounded font-mono text-xs font-bold whitespace-nowrap">
                                        {msg.id}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-zinc-300 truncate">{msg.text}</p>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                                                <Clock className="h-3 w-3" /> Every {msg.interval_minutes || 15} min
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    <button onClick={() => toggleMessage(msg)}
                                        className="p-1.5 rounded hover:bg-zinc-800 transition-colors" title="Toggle">
                                        {msg.enabled !== false
                                            ? <ToggleRight className="h-5 w-5 text-emerald-500" />
                                            : <ToggleLeft className="h-5 w-5 text-zinc-600" />
                                        }
                                    </button>
                                    <button onClick={() => startEdit(msg)}
                                        className="p-1.5 rounded hover:bg-zinc-800 transition-colors" title="Edit">
                                        <Edit3 className="h-4 w-4 text-zinc-400 hover:text-white" />
                                    </button>
                                    <button onClick={() => handleDelete(msg.id)}
                                        className="p-1.5 rounded hover:bg-rose-500/10 transition-colors" title="Delete">
                                        <Trash2 className="h-4 w-4 text-zinc-500 hover:text-rose-400" />
                                    </button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
