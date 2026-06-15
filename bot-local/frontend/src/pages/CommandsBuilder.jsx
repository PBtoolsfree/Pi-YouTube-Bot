import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from '@/components/ui'
import { Terminal, Plus, Trash2, Edit3, Save, X, Clock, ToggleLeft, ToggleRight } from 'lucide-react'
import { PageStatusBar } from '@/components/ServiceStatus'

export default function CommandsBuilder() {
    const [commands, setCommands] = useState({})
    const [editing, setEditing] = useState(null)
    const [showAdd, setShowAdd] = useState(false)
    const [form, setForm] = useState({ command: '', response: '', cooldown: 30, enabled: true })

    const fetchCommands = async () => {
        try {
            const res = await axios.get('/api/commands')
            setCommands(res.data || {})
        } catch (e) { console.error(e) }
    }

    useEffect(() => { fetchCommands() }, [])

    const handleSave = async () => {
        if (!form.command || !form.response) return alert('Command and response are required!')
        try {
            const res = await axios.post('/api/commands', form)
            setCommands(res.data.commands || {})
            setShowAdd(false)
            setEditing(null)
            setForm({ command: '', response: '', cooldown: 30, enabled: true })
        } catch (e) { alert('Save failed: ' + e.message) }
    }

    const handleDelete = async (cmd) => {
        if (!confirm(`Delete ${cmd}?`)) return
        try {
            const name = cmd.replace('!', '')
            const res = await axios.delete(`/api/commands/${name}`)
            setCommands(res.data.commands || {})
        } catch (e) { alert('Delete failed: ' + e.message) }
    }

    const startEdit = (cmd, data) => {
        setEditing(cmd)
        setForm({ command: cmd, response: data.response, cooldown: data.cooldown || 30, enabled: data.enabled !== false })
        setShowAdd(true)
    }

    const toggleEnabled = async (cmd, data) => {
        try {
            const res = await axios.post('/api/commands', {
                command: cmd,
                response: data.response,
                cooldown: data.cooldown || 30,
                enabled: !data.enabled
            })
            setCommands(res.data.commands || {})
        } catch (e) { console.error(e) }
    }

    const entries = Object.entries(commands)

    return (
        <div className="space-y-6">
            <PageStatusBar services={['bot', 'youtube']} />
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                        <Terminal className="h-5 w-5 text-cyan-500" /> Custom Chat Commands
                    </h2>
                    <p className="text-sm text-zinc-500 mt-1">Create custom !commands with automatic responses</p>
                </div>
                <Button onClick={() => { setShowAdd(true); setEditing(null); setForm({ command: '', response: '', cooldown: 30, enabled: true }) }}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                    <Plus className="h-4 w-4" /> Add Command
                </Button>
            </div>

            {/* Add/Edit Form */}
            {showAdd && (
                <Card className="bg-zinc-900 border border-cyan-500/30 shadow-lg shadow-cyan-500/5">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="text-sm font-semibold text-zinc-100">
                            {editing ? `Edit ${editing}` : 'New Command'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Command</label>
                                <Input
                                    value={form.command}
                                    onChange={e => setForm({ ...form, command: e.target.value })}
                                    placeholder="!schedule"
                                    disabled={!!editing}
                                    className="bg-zinc-950 border-zinc-700 text-zinc-100 font-mono"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Response</label>
                                <Input
                                    value={form.response}
                                    onChange={e => setForm({ ...form, response: e.target.value })}
                                    placeholder="Stream starts at 8 PM IST daily! 🎮"
                                    className="bg-zinc-950 border-zinc-700 text-zinc-100"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Cooldown (sec)</label>
                                <Input
                                    type="number"
                                    value={form.cooldown}
                                    onChange={e => setForm({ ...form, cooldown: parseInt(e.target.value) || 30 })}
                                    className="bg-zinc-950 border-zinc-700 text-zinc-100"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <Button onClick={handleSave}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold px-5 py-2 rounded-lg flex items-center gap-2">
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

            {/* Commands List */}
            {entries.length === 0 ? (
                <Card className="bg-zinc-900 border border-zinc-800 p-12 text-center">
                    <Terminal className="h-10 w-10 text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500 text-sm">No custom commands yet. Click "Add Command" to create one!</p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {entries.map(([cmd, data]) => (
                        <Card key={cmd} className={`bg-zinc-900 border ${data.enabled !== false ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'} shadow-sm hover:border-zinc-700 transition-colors`}>
                            <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded font-mono text-sm font-bold whitespace-nowrap">
                                        {cmd}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-zinc-300 truncate">{data.response}</p>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                                                <Clock className="h-3 w-3" /> {data.cooldown || 30}s cooldown
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    <button onClick={() => toggleEnabled(cmd, data)}
                                        className="p-1.5 rounded hover:bg-zinc-800 transition-colors" title="Toggle">
                                        {data.enabled !== false
                                            ? <ToggleRight className="h-5 w-5 text-emerald-500" />
                                            : <ToggleLeft className="h-5 w-5 text-zinc-600" />
                                        }
                                    </button>
                                    <button onClick={() => startEdit(cmd, data)}
                                        className="p-1.5 rounded hover:bg-zinc-800 transition-colors" title="Edit">
                                        <Edit3 className="h-4 w-4 text-zinc-400 hover:text-white" />
                                    </button>
                                    <button onClick={() => handleDelete(cmd)}
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
