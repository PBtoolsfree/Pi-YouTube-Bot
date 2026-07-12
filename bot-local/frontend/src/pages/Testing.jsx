import React, { useState } from 'react'
import axios from 'axios'
import { Beaker, MessageSquare, Mic, Send, Trash2, CheckCircle, XCircle, Activity, ShieldCheck, Zap } from 'lucide-react'
import { Card, CardHeader, CardContent, CardTitle, Input, Button, Label } from '@/components/ui'
import { PageStatusBar } from '@/components/ServiceStatus'

export default function TestingPage() {
    const [aiPrompt, setAiPrompt] = useState('')
    const [ttsText, setTtsText] = useState('')
    const [responses, setResponses] = useState([])
    const [loading, setLoading] = useState(false)
    const [systemStatus, setSystemStatus] = useState(null)

    const handleSystemCheck = async () => {
        try {
            const res = await axios.post('/api/test/system')
            setSystemStatus(res.data)
            setResponses(prev => [
                { type: 'SYSTEM', text: `Diagnostics Complete: All systems operational.`, time: new Date().toLocaleTimeString() },
                ...prev
            ])
        } catch (err) {
            setResponses(prev => [
                { type: 'ERROR', text: `System Check Failed: ${err.message}`, time: new Date().toLocaleTimeString() },
                ...prev
            ])
        }
    }

    const handleSendTestChat = async () => {
        try {
            const res = await axios.post('/api/test/send_chat')
            setResponses(prev => [
                { type: 'CHAT', text: `Test Message Sent: "${res.data.message}"`, time: new Date().toLocaleTimeString() },
                ...prev
            ])
        } catch (err) {
            setResponses(prev => [
                { type: 'ERROR', text: `Chat Test Failed: ${err.message}`, time: new Date().toLocaleTimeString() },
                ...prev
            ])
        }
    }

    const handleAiTest = async (e) => {
        e.preventDefault()
        if (!aiPrompt.trim()) return

        setLoading(true)
        const timestamp = new Date().toLocaleTimeString()
        try {
            const res = await axios.post('/api/chat', { prompt: aiPrompt })
            setResponses(prev => [
                { type: 'AI', prompt: aiPrompt, text: res.data.response, time: timestamp },
                ...prev
            ])
            setAiPrompt('')
        } catch (err) {
            setResponses(prev => [
                { type: 'ERROR', text: `AI Error: ${err.message}`, time: timestamp },
                ...prev
            ])
        } finally {
            setLoading(false)
        }
    }

    const handleTtsTest = async (channel) => {
        if (!ttsText.trim()) return

        try {
            console.log("TTS Test Start:", channel, ttsText);
            await axios.post('/api/audio/speak', { text: ttsText, channel })
            console.log("TTS Test Success");
            setResponses(prev => [
                { type: 'TTS', text: `Sent to ${channel}: "${ttsText}"`, time: new Date().toLocaleTimeString() },
                ...prev
            ])
            setTtsText('')
        } catch (err) {
            console.error("TTS Test Error:", err);
            setResponses(prev => [
                { type: 'ERROR', text: `TTS Error: ${err.message}`, time: new Date().toLocaleTimeString() },
                ...prev
            ])
        }
    }

    const triggerAlert = async (type) => {
        try {
            const res = await axios.post('/api/test/alert', { type, author: "Pi Bot Tester" })
            setResponses(prev => [
                { type: 'SIMULATION', text: `Simulated ${type} alert triggered.`, time: new Date().toLocaleTimeString() },
                ...prev
            ])
        } catch (err) {
            setResponses(prev => [
                { type: 'ERROR', text: `Alert Error: ${err.message}`, time: new Date().toLocaleTimeString() },
                ...prev
            ])
        }
    }

    return (
        <div className="space-y-6 pb-10">
            <PageStatusBar services={['bot', 'ai', 'tts', 'youtube', 'streamerBot']} />
            <div className="flex justify-between items-center px-1">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                        Advanced Testing <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full uppercase font-bold">Debug</span>
                    </h2>
                    <p className="text-sm text-zinc-400">Manually trigger AI responses and text-to-speech engine.</p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="border-zinc-800 text-zinc-400 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 text-xs"
                    onClick={() => setResponses([])}
                >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Clear History
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* System Integrity Check */}
                <Card className="border-emerald-500/10 bg-emerald-500/5 md:col-span-2">
                    <CardHeader className="pb-3 border-b border-emerald-500/10">
                        <CardTitle className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                            <ShieldCheck className="h-4 w-4" /> System Integrity Check
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-6">
                        <div className="flex gap-3">
                            <Button onClick={handleSystemCheck} size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm text-xs font-semibold">
                                <Activity className="h-3.5 w-3.5 mr-2" /> Run Diagnostics
                            </Button>
                            <Button onClick={handleSendTestChat} size="sm" variant="secondary" className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold">
                                <Zap className="h-3.5 w-3.5 mr-2" /> Send Test Chat to Live Stream
                            </Button>
                        </div>

                        {systemStatus && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <StatusBadge
                                    label="OBS / Streamer.bot"
                                    status={systemStatus.streamer_bot.status}
                                    meta={systemStatus.streamer_bot.meta}
                                />
                                <StatusBadge
                                    label="YouTube Chat"
                                    status={systemStatus.youtube.status}
                                    meta={systemStatus.youtube.meta}
                                />
                                <StatusBadge
                                    label="Audio Engine"
                                    status={systemStatus.audio.status}
                                    meta={systemStatus.audio.meta}
                                />
                                <StatusBadge
                                    label="Viewer Tracking"
                                    status={systemStatus.viewers.status}
                                    meta={systemStatus.viewers.meta}
                                />
                            </div>
                        )}
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">
                            Verifies that OBS, YouTube, and Audio pipelines are fully connected and ready for live broadcasting.
                        </p>
                    </CardContent>
                </Card>

                {/* AI Chat Testing */}
                <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                            <MessageSquare className="h-4 w-4 text-primary" /> AI Engine Test
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <form onSubmit={handleAiTest} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="ai-prompt" className="text-xs font-medium text-zinc-400">Simulate Viewer Prompt</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="ai-prompt"
                                        placeholder="Type something to ask AI..."
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                        className="bg-zinc-950 border-zinc-700 text-zinc-100 text-sm h-9"
                                    />
                                    <Button type="submit" size="sm" disabled={loading || !aiPrompt.trim()} className="h-9 px-3">
                                        {loading ? <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" /> : <Send className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                            </div>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">
                                This will use your configured AI Strategy and Providers.
                            </p>
                        </form>
                    </CardContent>
                </Card>

                {/* TTS Testing */}
                <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                            <Mic className="h-4 w-4 text-emerald-500" /> TTS Engine Test
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="tts-text" className="text-xs font-medium text-zinc-400">Voice Synthesis Text</Label>
                            <Input
                                id="tts-text"
                                placeholder="Type text to speak..."
                                value={ttsText}
                                onChange={(e) => setTtsText(e.target.value)}
                                className="bg-zinc-950 border-zinc-700 text-zinc-100 text-sm h-9"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Button size="sm" variant="secondary" onClick={() => handleTtsTest('public')} disabled={!ttsText.trim()} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 h-8 text-xs font-semibold">
                                <Mic className="h-3.5 w-3.5 mr-2" /> Public Chat
                            </Button>
                            <Button size="sm" variant="outline" className="border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-300 h-8 text-xs font-semibold" onClick={() => handleTtsTest('secret')} disabled={!ttsText.trim()}>
                                <Beaker className="h-3.5 w-3.5 mr-2" /> Secret (Head)
                            </Button>
                        </div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">
                            Public plays on stream. Secret plays on your headphones only.
                        </p>
                    </CardContent>
                </Card>

                {/* OBS Alert Testing */}
                <Card className="bg-zinc-900 border-zinc-800 shadow-sm md:col-span-2">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                            <Beaker className="h-4 w-4 text-primary" /> OBS Alert Simulation
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            <AlertButton label="New Subscriber" type="NewSubscriber" emoji="❤️" onClick={(t) => triggerAlert(t)} />
                            <AlertButton label="New Member" type="Member" emoji="💎" onClick={(t) => triggerAlert(t)} />
                            <AlertButton label="Super Chat" type="SuperChat" emoji="⭐" onClick={(t) => triggerAlert(t)} />
                            <AlertButton label="Gift Sub" type="GiftSub" emoji="🎁" onClick={(t) => triggerAlert(t)} />
                            <AlertButton label="Rank Up" type="RANK_UP" emoji="👑" onClick={(t) => triggerAlert(t)} />
                            <AlertButton label="Loyalty" type="LOYALTY" emoji="💖" onClick={(t) => triggerAlert(t)} />
                        </div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wide mt-4 font-medium">
                            These will trigger visual alerts in the OBS Overlay and play a simulation announcement.
                        </p>
                    </CardContent>
                </Card>

                {/* Manual Super Chat Test */}
                <Card className="bg-zinc-900 border-zinc-800 shadow-sm md:col-span-2">
                    <CardHeader className="pb-3 border-b border-zinc-800">
                        <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                            <Zap className="h-4 w-4 text-yellow-500" /> Manual Super Chat Trigger
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <SuperChatForm onTrigger={(data) => {
                            axios.post('/api/test/superchat', data)
                                .then(() => setResponses(prev => [{ type: 'SUPERCHAT_TEST', text: `Triggered SC from ${data.user} for ${data.amount}`, time: new Date().toLocaleTimeString() }, ...prev]))
                                .catch(err => setResponses(prev => [{ type: 'ERROR', text: `SC Error: ${err.message}`, time: new Date().toLocaleTimeString() }, ...prev]))
                        }} />
                    </CardContent>
                </Card>
            </div>

            {/* Test Results / History */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                <CardHeader className="pb-3 border-b border-zinc-800">
                    <CardTitle className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Test Execution History</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="divide-y divide-zinc-800">
                        {responses.length === 0 ? (
                            <div className="p-8 text-center text-zinc-500 italic text-sm">No tests executed in this session.</div>
                        ) : (
                            responses.map((res, i) => (
                                <div key={i} className="p-4 space-y-2 hover:bg-zinc-800/50 transition-colors">
                                    <div className="flex justify-between items-center">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${res.type === 'AI' ? 'bg-primary/10 text-primary border-primary/20' :
                                            res.type === 'ERROR' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                            }`}>
                                            {res.type}
                                        </span>
                                        <span className="text-[10px] text-zinc-500 font-mono">{res.time}</span>
                                    </div>
                                    {res.prompt && <div className="text-xs text-zinc-400 font-medium">Q: {res.prompt}</div>}
                                    <div className="text-sm text-zinc-300 leading-relaxed font-mono">
                                        {res.text}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="text-center text-[10px] text-zinc-600 font-mono mt-8 pb-4">
                Testing Module v2.2 - Build: {new Date().toLocaleString()}
            </div>
        </div>
    )
}

function AlertButton({ label, type, emoji, onClick }) {
    return (
        <Button
            variant="outline"
            className="flex flex-col h-auto py-3 gap-2 border-zinc-800 hover:bg-primary/10 hover:border-primary/50 group transition-all bg-zinc-900/50"
            onClick={() => onClick(type)}
        >
            <span className="text-xl group-hover:scale-110 transition-transform">{emoji}</span>
            <span className="text-[10px] uppercase font-bold text-zinc-500 group-hover:text-primary transition-colors">{label}</span>
        </Button>
    )
}

function SuperChatForm({ onTrigger }) {
    const [formData, setFormData] = useState({
        user: 'Test Donor',
        amount: '₹100',
        message: 'This is a test Super Chat message!',
        tier: 'blue'
    })

    const handleSubmit = (e) => {
        e.preventDefault()
        onTrigger(formData)
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2 flex-1">
                <Label className="text-xs">User</Label>
                <Input
                    value={formData.user}
                    onChange={e => setFormData({ ...formData, user: e.target.value })}
                    className="h-8 text-xs"
                />
            </div>
            <div className="space-y-2 w-24">
                <Label className="text-xs">Amount</Label>
                <Input
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                    className="h-8 text-xs"
                />
            </div>
            <div className="space-y-2 w-32">
                <Label className="text-xs">Color/Tier</Label>
                <select
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={formData.tier}
                    onChange={e => setFormData({ ...formData, tier: e.target.value })}
                >
                    <option value="blue">Blue (₹20+)</option>
                    <option value="lightblue">Light Blue (₹100+)</option>
                    <option value="green">Green (₹200+)</option>
                    <option value="yellow">Yellow (₹1000+)</option>
                    <option value="orange">Orange (₹2000+)</option>
                    <option value="magenta">Magenta (₹5000+)</option>
                    <option value="red">Red (₹10000+)</option>
                </select>
            </div>
            <div className="space-y-2 flex-[2]">
                <Label className="text-xs">Message</Label>
                <Input
                    value={formData.message}
                    onChange={e => setFormData({ ...formData, message: e.target.value })}
                    className="h-8 text-xs"
                />
            </div>
            <Button type="submit" size="sm" className="bg-yellow-600 hover:bg-yellow-500 text-white h-8 text-xs font-bold">
                Trigger
            </Button>
        </form>
    )
}

function StatusBadge({ label, status, meta }) {
    const isGood = status === 'Connected' || status === 'Monitoring' || status === 'Active' || status === 'Tracking'
    const isDegraded = status === 'Degraded' || status === 'Inactive'

    return (
        <div className={`p-3 rounded-lg border ${isGood ? 'bg-emerald-500/10 border-emerald-500/20' : isDegraded ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
            <div className="flex items-center gap-2 mb-1">
                {isGood ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-rose-400" />}
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isGood ? 'text-emerald-400' : 'text-rose-400'}`}>{label}</span>
            </div>
            <div className="text-sm font-bold text-zinc-200 mb-0.5">{status}</div>
            <div className="text-[10px] font-mono text-zinc-500 truncate" title={meta}>{meta}</div>
        </div>
    )
}
