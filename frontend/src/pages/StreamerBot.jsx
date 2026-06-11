import React, { useState, useEffect, useRef } from 'react'
import { copyToClipboard } from '@/lib/utils'
import { Activity, Radio, Database, ShieldAlert, CheckCircle2, XCircle, Clock, Copy } from 'lucide-react'
import { Card, CardHeader, CardContent, CardTitle, Button, Input } from '@/components/ui'
import axios from 'axios'
import { PageStatusBar } from '@/components/ServiceStatus'

const API_URL = "/api"

export default function StreamerBotPage({ logs, config, onSave, backendStatus }) {
    const sbEvents = logs.filter(l => l.category === 'ALERT' || l.message?.includes('Streamer.bot'))

    // Prioritize backendStatus if available, fallback to log sniffing
    const isConnected = backendStatus
        ? (backendStatus?.workers?.streamerbot?.status === 'connected' || backendStatus?.obs_streamerbot === 'connected' || !!backendStatus?.bot?.streamer_bot_connected)
        : (logs.some(l => l.message === 'Connected to Streamer.bot WS') &&
            !logs.find(l => l.message === 'Streamer.bot WS Disconnected. Retrying...' && l.timestamp > logs.find(l2 => l2.message === 'Connected to Streamer.bot WS')?.timestamp))

    const sbConfig = config?.streamer_bot || {}
    const [host, setHost] = useState(sbConfig.host || '127.0.0.1')
    const [port, setPort] = useState(sbConfig.port || 8080)

    // Update local state when config changes elsewhere
    useEffect(() => {
        setHost(sbConfig.host || '127.0.0.1')
        setPort(sbConfig.port || 8080)
    }, [sbConfig.host, sbConfig.port])

    const handleToggle = () => {
        const newEnabled = !sbConfig.enabled
        const newConfig = {
            ...config,
            streamer_bot: {
                ...sbConfig,
                enabled: newEnabled,
                host: host,
                port: parseInt(port)
            }
        }
        onSave(newConfig)
    }

    const handleUpdate = () => {
        const newConfig = {
            ...config,
            streamer_bot: {
                ...sbConfig,
                host: host,
                port: parseInt(port)
            }
        }
        onSave(newConfig)
    }

    return (
        <div className="space-y-6 pb-10">
            <PageStatusBar services={['bot', 'streamerBot', 'email']} />
            <div className="flex justify-between items-start px-1">
                <div className="flex flex-col gap-4">
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Streamer.bot Integration</h2>
                        <p className="text-sm text-zinc-400">Manage your connection to Streamer.bot WebSockets.</p>
                    </div>

                    <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 p-4 rounded-lg shadow-sm">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide px-1">Host IP</label>
                            <Input
                                type="text"
                                value={host}
                                onChange={(e) => setHost(e.target.value)}
                                className="bg-zinc-950 border-zinc-700 h-9 rounded-md text-sm font-mono w-40 text-zinc-100"
                                placeholder="127.0.0.1"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide px-1">Port</label>
                            <Input
                                type="number"
                                value={port}
                                onChange={(e) => setPort(e.target.value)}
                                className="bg-zinc-950 border-zinc-700 h-9 rounded-md text-sm font-mono w-24 text-zinc-100"
                                placeholder="8080"
                            />
                        </div>
                        <div className="pt-5">
                            <Button
                                onClick={handleUpdate}
                                variant="secondary"
                                size="sm"
                                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 h-9"
                            >
                                Update
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-3">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium uppercase tracking-wide ${isConnected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                        {isConnected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </div>

                    <Button
                        onClick={handleToggle}
                        className={`w-32 font-semibold shadow-sm ${sbConfig.enabled ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                    >
                        {sbConfig.enabled ? 'Disconnect' : 'Connect'}
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <StatBox title="Subscribers" value={sbEvents.filter(e => e.message?.includes('NewSubscriber') || e.message?.includes('NewSponsor')).length} icon={<Radio className="text-blue-500" />} />
                <StatBox title="Members" value={sbEvents.filter(e => e.message?.includes('Member')).length} icon={<Database className="text-purple-500" />} />
                <StatBox title="Super Chats" value={sbEvents.filter(e => e.message?.includes('SuperChat') || e.message?.includes('SuperSticker')).length} icon={<Activity className="text-emerald-500" />} />
                <StatBox title="WS Alerts" value={sbEvents.filter(e => e.category === 'ALERT').length} icon={<ShieldAlert className="text-amber-500" />} />
            </div>

            <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                <CardHeader className="pb-3 border-b border-zinc-800">
                    <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                        <Clock className="h-4 w-4 text-zinc-400" /> Live Event Stream
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="max-h-[500px] overflow-y-auto font-mono text-xs">
                        <table className="w-full text-left">
                            <thead className="bg-zinc-950/50 sticky top-0 border-b border-zinc-800 uppercase text-zinc-500 font-medium">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Time</th>
                                    <th className="px-4 py-3 font-medium">Event</th>
                                    <th className="px-4 py-3 font-medium">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {sbEvents.length === 0 ? (
                                    <tr>
                                        <td colSpan="3" className="px-4 py-8 text-center text-zinc-500 italic">No events recorded yet. Ensure Streamer.bot is running with WebSockets enabled.</td>
                                    </tr>
                                ) : (
                                    [...sbEvents].reverse().map((e, idx) => (
                                        <tr key={idx} className="hover:bg-zinc-800/50 transition-colors">
                                            <td className="px-4 py-3 text-zinc-500">{new Date(e.timestamp * 1000).toLocaleTimeString()}</td>
                                            <td className="px-4 py-3 font-bold text-zinc-300">{e.category || 'EVENT'}</td>
                                            <td className="px-4 py-3 text-zinc-400">{e.message}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-6">

                {/* Dashboard Port Section */}
                <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="text-sm font-semibold text-zinc-100">System Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                        <div className="flex items-end gap-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide px-1">Dashboard Port</label>
                                <Input
                                    type="number"
                                    value={config?.server?.port || 8000}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 8000
                                        onSave({
                                            ...config,
                                            server: {
                                                ...config.server,
                                                port: val
                                            }
                                        })
                                    }}
                                    className="bg-zinc-950 border-zinc-700 w-24 text-zinc-100"
                                />
                            </div>
                            <div className="text-[10px] text-zinc-500 mb-2.5">
                                ⚠️ Changing this will restart the server.
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Test Controls Section */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-sm border-dashed">
                <CardHeader className="pb-3 border-b border-zinc-800/50">
                    <CardTitle className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                        <Activity className="h-4 w-4" /> Manual Test Controls
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    <div className="flex flex-wrap gap-3">
                        <TestButton
                            label="Test Subscriber"
                            color="bg-emerald-600 hover:bg-emerald-500"
                            onClick={() => axios.post(API_URL + '/test/alert', { type: 'NewSubscriber', author: 'Test User' })}
                        />
                        <TestButton
                            label="Test Super Chat"
                            color="bg-amber-600 hover:bg-amber-500"
                            onClick={() => axios.post(API_URL + '/test/alert', { type: 'SuperChat', author: 'Rich User', message: 'Take my money!' })}
                        />
                        <TestButton
                            label="Test Member"
                            color="bg-purple-600 hover:bg-purple-500"
                            onClick={() => axios.post(API_URL + '/test/alert', { type: 'Member', author: 'Loyal Fan' })}
                        />
                        <TestButton
                            label="Test Chat Message"
                            color="bg-blue-600 hover:bg-blue-500"
                            onClick={() => axios.post(API_URL + '/sb/chat', { user: 'Chatter', message: 'Hello bot! This is a test.' })}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function TestButton({ label, color, onClick }) {
    const [loading, setLoading] = useState(false)
    const handleClick = async () => {
        setLoading(true)
        try {
            await onClick()
        } catch (err) {
            console.error(err)
        }
        setTimeout(() => setLoading(false), 500)
    }
    return (
        <Button
            onClick={handleClick}
            disabled={loading}
            className={`${color} text-white text-xs font-bold uppercase tracking-wider shadow-sm`}
            size="sm"
        >
            {loading ? 'Sending...' : label}
        </Button>
    )
}

function StatBox({ title, value, icon }) {
    return (
        <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
                <div>
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">{title}</div>
                    <div className="text-2xl font-bold mt-0.5 text-zinc-100">{value}</div>
                </div>
                <div className="h-10 w-10 rounded-lg bg-zinc-950 flex items-center justify-center border border-zinc-800 text-zinc-400">
                    {icon}
                </div>
            </CardContent>
        </Card>
    )
}
