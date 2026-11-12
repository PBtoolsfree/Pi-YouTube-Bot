import React, { useState } from 'react'
import axios from 'axios'
import {
    Beaker, MessageSquare, Mic, Send, Trash2, CheckCircle, XCircle,
    Activity, ShieldCheck, Zap, Key, Smartphone, Radio, Mail,
    Layers, Volume2, Play, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Shield
} from 'lucide-react'
import { Card, CardHeader, CardContent, CardTitle, Input, Button, Label } from '@/components/ui'
import { PageStatusBar } from '@/components/ServiceStatus'

const TEST_DEFINITIONS = [
    {
        id: 'website-key',
        endpoint: '/api/test/website-key',
        title: '1. Website Key Verification',
        category: 'SECURITY',
        description: 'Validates SHA-256 verifier, reject on invalid key, and RBAC isolation from Android devices.',
        icon: Key
    },
    {
        id: 'android-device',
        endpoint: '/api/test/android-device',
        title: '2. Android Device Authentication',
        category: 'SECURITY',
        description: 'Tests HMAC-SHA256 signature verification, 5-minute replay-attack blocking, and timestamp skew.',
        icon: Smartphone
    },
    {
        id: 'notification-forwarding',
        endpoint: '/api/test/notification-forwarding',
        title: '3. Notification Forwarding Bridge',
        category: 'BRIDGE',
        description: 'Simulates Paytm Business notification ingestion, parsing ₹ amount, payer name, and store in manager.',
        icon: Radio
    },
    {
        id: 'email-observer',
        endpoint: '/api/test/email-observer',
        title: '4. Email Observer Polling',
        category: 'EMAIL',
        description: 'Tests email regex parsing on standard Paytm payment emails and inspects IMAP observer state.',
        icon: Mail
    },
    {
        id: 'donation-matching',
        endpoint: '/api/test/donation-matching',
        title: '5. Donation Matching & Verification',
        category: 'MANAGER',
        description: 'Creates intent, simulates incoming notification, and asserts deterministic match to VERIFIED state.',
        icon: Layers
    },
    {
        id: 'cloud-overlay',
        endpoint: '/api/test/cloud-overlay',
        title: '6. Cloud OBS Overlay Sync',
        category: 'OVERLAY',
        description: 'Broadcasts a simulated alert over /ws/overlay and confirms delivery to connected browser displays.',
        icon: Activity
    },
    {
        id: 'local-tts',
        endpoint: '/api/test/local-tts',
        title: '7. Local Bot TTS Announcement',
        category: 'TTS AUDIO',
        description: 'Verifies text-to-speech audio queuing via Edge-TTS and Pi client WebSocket interconnect.',
        icon: Volume2
    },
    {
        id: 'complete-system',
        endpoint: '/api/test/complete-system',
        title: '8. Complete End-to-End System Test',
        category: 'FULL SUITE',
        description: 'Simulates complete lifecycle: Intent → Android Notification → Correlation → Overlay → TTS → Duplicate Rejection.',
        icon: ShieldCheck
    }
]

export default function TestingPage() {
    const [testResults, setTestResults] = useState({})
    const [runningTests, setRunningTests] = useState({})
    const [expandedDetails, setExpandedDetails] = useState({})
    const [isRunningAll, setIsRunningAll] = useState(false)

    const [systemStatus, setSystemStatus] = useState(null)
    const [aiPrompt, setAiPrompt] = useState('')
    const [ttsText, setTtsText] = useState('')
    const [responses, setResponses] = useState([])
    const [aiLoading, setAiLoading] = useState(false)

    const runTest = async (test) => {
        setRunningTests(prev => ({ ...prev, [test.id]: true }))
        const startTime = Date.now()

        try {
            const res = await axios.post(test.endpoint)
            const duration = Date.now() - startTime
            setTestResults(prev => ({
                ...prev,
                [test.id]: {
                    status: res.data?.status || 'SUCCESS',
                    httpStatus: res.status,
                    duration_ms: res.data?.duration_ms || duration,
                    correlation_id: res.data?.correlation_id || 'N/A',
                    message: res.data?.message || 'Test passed successfully',
                    details: res.data?.details || res.data,
                    timestamp: new Date().toLocaleTimeString()
                }
            }))
        } catch (err) {
            const duration = Date.now() - startTime
            const httpStatus = err.response?.status || 500
            const errDetail = err.response?.data?.detail || err.response?.data?.error || err.message
            setTestResults(prev => ({
                ...prev,
                [test.id]: {
                    status: 'FAILED',
                    httpStatus: httpStatus,
                    duration_ms: duration,
                    correlation_id: 'ERR',
                    message: `Test Failed (${httpStatus}): ${errDetail}`,
                    details: err.response?.data || { error: err.message },
                    timestamp: new Date().toLocaleTimeString()
                }
            }))
        } finally {
            setRunningTests(prev => ({ ...prev, [test.id]: false }))
        }
    }

    const runAllTests = async () => {
        setIsRunningAll(true)
        for (const test of TEST_DEFINITIONS) {
            await runTest(test)
        }
        setIsRunningAll(false)
    }

    const toggleExpand = (id) => {
        setExpandedDetails(prev => ({ ...prev, [id]: !prev[id] }))
    }

    const totalExecuted = Object.keys(testResults).length
    const passedCount = Object.values(testResults).filter(r => r.status === 'SUCCESS').length
    const failedCount = Object.values(testResults).filter(r => r.status === 'FAILED').length

    const handleSystemCheck = async () => {
        try {
            const res = await axios.post('/api/test/system')
            setSystemStatus(res.data)
            setResponses(prev => [
                { type: 'SYSTEM', text: `Diagnostics Complete: Obs, Audio & YouTube inspected.`, time: new Date().toLocaleTimeString() },
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
        setAiLoading(true)
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
            setAiLoading(false)
        }
    }

    const handleTtsTest = async (channel) => {
        if (!ttsText.trim()) return
        try {
            await axios.post('/api/audio/speak', { text: ttsText, channel })
            setResponses(prev => [
                { type: 'TTS', text: `Sent to ${channel}: "${ttsText}"`, time: new Date().toLocaleTimeString() },
                ...prev
            ])
            setTtsText('')
        } catch (err) {
            setResponses(prev => [
                { type: 'ERROR', text: `TTS Error: ${err.message}`, time: new Date().toLocaleTimeString() },
                ...prev
            ])
        }
    }

    const triggerAlert = async (type) => {
        try {
            await axios.post('/api/test/alert', { type, author: "PB HERO Tester" })
            setResponses(prev => [
                { type: 'SIMULATION', text: `Simulated ${type} alert triggered on OBS.`, time: new Date().toLocaleTimeString() },
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
        <div className="space-y-8 pb-12">
            <PageStatusBar services={['bot', 'ai', 'tts', 'youtube', 'streamerBot']} />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                        PB HERO Verification & Security Test Suite
                        <span className="text-[10px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-2.5 py-0.5 rounded-full uppercase font-bold">
                            Production Ready
                        </span>
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">
                        Executes comprehensive authenticated diagnostic tests across Dual Security Keys, Android Bridge, Manager, OBS, and TTS.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        onClick={runAllTests}
                        disabled={isRunningAll}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs h-9 shadow-md"
                    >
                        {isRunningAll ? (
                            <>
                                <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Running All Tests...
                            </>
                        ) : (
                            <>
                                <Play className="h-3.5 w-3.5 mr-2" /> Run All 8 Tests
                            </>
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setTestResults({}); setResponses([]); }}
                        className="border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs h-9"
                    >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear
                    </Button>
                </div>
            </div>

            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                    <div>
                        <strong className="text-emerald-300 font-semibold">Safe Test Mode Active</strong>
                        <p className="text-emerald-400/80 text-[11px] mt-0.5">
                            All simulated donation tests are tagged with <code className="bg-emerald-950/60 px-1 rounded text-emerald-200">is_test=true</code>. Real donor balances, database analytics, and stream stats are protected.
                        </p>
                    </div>
                </div>
                {totalExecuted > 0 && (
                    <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
                        <span className="text-emerald-400 font-bold">{passedCount} PASSED</span>
                        {failedCount > 0 && <span className="text-red-400 font-bold">{failedCount} FAILED</span>}
                        <span className="text-zinc-400">({totalExecuted}/8 COMPLETE)</span>
                    </div>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {TEST_DEFINITIONS.map((test) => {
                    const result = testResults[test.id]
                    const isRunning = runningTests[test.id]
                    const IconComponent = test.icon
                    const isExpanded = expandedDetails[test.id]

                    let badgeColor = 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    let badgeLabel = 'NOT TESTED'
                    if (isRunning) {
                        badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                        badgeLabel = 'TESTING...'
                    } else if (result?.status === 'SUCCESS') {
                        badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        badgeLabel = 'SUCCESS'
                    } else if (result?.status === 'FAILED') {
                        badgeColor = 'bg-red-500/20 text-red-300 border-red-500/30'
                        badgeLabel = 'FAILED'
                    }

                    return (
                        <Card key={test.id} className="bg-zinc-900 border-zinc-800 shadow-sm flex flex-col justify-between overflow-hidden">
                            <CardHeader className="pb-3 border-b border-zinc-800/80 bg-zinc-950/30">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 rounded-lg bg-zinc-800/80 text-cyan-400 border border-zinc-700/60">
                                            <IconComponent className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-sm font-semibold text-zinc-100">
                                                {test.title}
                                            </CardTitle>
                                            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                                                {test.category} • {test.endpoint}
                                            </span>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono border ${badgeColor}`}>
                                        {badgeLabel}
                                    </span>
                                </div>
                            </CardHeader>

                            <CardContent className="pt-3 pb-3 space-y-3 flex-1 flex flex-col justify-between text-xs">
                                <p className="text-zinc-400 text-[11px] leading-relaxed">
                                    {test.description}
                                </p>

                                {result && (
                                    <div className="space-y-1.5 pt-1">
                                        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                                            <span>Duration: <strong className="text-zinc-200">{result.duration_ms} ms</strong></span>
                                            <span>HTTP: <strong className={result.httpStatus === 200 ? 'text-emerald-400' : 'text-red-400'}>{result.httpStatus}</strong></span>
                                            <span>CID: <strong className="text-zinc-300">{result.correlation_id}</strong></span>
                                        </div>

                                        <p className={`text-[11px] font-medium ${result.status === 'SUCCESS' ? 'text-emerald-400/90' : 'text-red-400'}`}>
                                            {result.message}
                                        </p>

                                        <button
                                            onClick={() => toggleExpand(test.id)}
                                            className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 font-mono pt-1"
                                        >
                                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                            {isExpanded ? 'Hide Payload & Details' : 'View Payload & Details'}
                                        </button>

                                        {isExpanded && (
                                            <pre className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-300 max-h-40 overflow-y-auto whitespace-pre-wrap">
                                                {JSON.stringify(result.details, null, 2)}
                                            </pre>
                                        )}
                                    </div>
                                )}

                                <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                                    <span className="text-[10px] text-zinc-500 font-mono">
                                        {result?.timestamp ? `Tested: ${result.timestamp}` : 'Ready to execute'}
                                    </span>
                                    <Button
                                        onClick={() => runTest(test)}
                                        disabled={isRunning}
                                        size="sm"
                                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] h-7 px-3 font-semibold"
                                    >
                                        {isRunning ? (
                                            <>
                                                <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> Testing...
                                            </>
                                        ) : (
                                            <>
                                                <Play className="h-3 w-3 mr-1.5" /> Run Test
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            <div className="pt-6 border-t border-zinc-800/80 space-y-6">
                <div>
                    <h3 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-cyan-400" />
                        Live Stream & Engine Diagnostics
                    </h3>
                    <p className="text-xs text-zinc-400">Quick tests for live chat, OBS overlay visual alerts, and voice engines.</p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm md:col-span-2">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-emerald-400" /> System Integrity Diagnostics
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="flex gap-3">
                                <Button onClick={handleSystemCheck} size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold h-8">
                                    <Activity className="h-3.5 w-3.5 mr-1.5" /> Run Diagnostics
                                </Button>
                                <Button onClick={handleSendTestChat} size="sm" variant="secondary" className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold h-8">
                                    <Zap className="h-3.5 w-3.5 mr-1.5" /> Send Test Chat to Live Stream
                                </Button>
                            </div>

                            {systemStatus && (
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                                    <StatusBadge label="OBS / Streamer.bot" status={systemStatus.streamer_bot?.status} meta={systemStatus.streamer_bot?.meta} />
                                    <StatusBadge label="YouTube Chat" status={systemStatus.youtube?.status} meta={systemStatus.youtube?.meta} />
                                    <StatusBadge label="Audio Engine" status={systemStatus.audio?.status} meta={systemStatus.audio?.meta} />
                                    <StatusBadge label="Viewer Tracking" status={systemStatus.viewers?.status} meta={systemStatus.viewers?.meta} />
                                    <StatusBadge label="Local Link" status={systemStatus.local_link?.status} meta={systemStatus.local_link?.meta} />
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                <MessageSquare className="h-4 w-4 text-cyan-400" /> AI Engine Test
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <form onSubmit={handleAiTest} className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-zinc-400">Simulate Viewer Prompt</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Type something to test AI..."
                                            value={aiPrompt}
                                            onChange={(e) => setAiPrompt(e.target.value)}
                                            className="bg-zinc-950 border-zinc-700 text-zinc-100 text-sm h-9"
                                        />
                                        <Button type="submit" size="sm" disabled={aiLoading || !aiPrompt.trim()} className="h-9 px-3">
                                            {aiLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                        </Button>
                                    </div>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                <Mic className="h-4 w-4 text-emerald-400" /> TTS Voice Synthesis Test
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs text-zinc-400">Text to Speak</Label>
                                <Input
                                    placeholder="Type message to test TTS..."
                                    value={ttsText}
                                    onChange={(e) => setTtsText(e.target.value)}
                                    className="bg-zinc-950 border-zinc-700 text-zinc-100 text-sm h-9"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Button size="sm" variant="secondary" onClick={() => handleTtsTest('public')} disabled={!ttsText.trim()} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 h-8 text-xs font-semibold">
                                    <Volume2 className="h-3.5 w-3.5 mr-1.5" /> Public Stream
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleTtsTest('secret')} disabled={!ttsText.trim()} className="border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-300 h-8 text-xs font-semibold">
                                    <Beaker className="h-3.5 w-3.5 mr-1.5" /> Secret (Headphone)
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm md:col-span-2">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                <Beaker className="h-4 w-4 text-cyan-400" /> OBS Alert Simulation
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                <Button variant="outline" size="sm" onClick={() => triggerAlert('NewSubscriber')} className="border-zinc-800 hover:bg-zinc-800 text-xs">
                                    ❤️ Subscriber
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => triggerAlert('Member')} className="border-zinc-800 hover:bg-zinc-800 text-xs">
                                    💎 Member
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => triggerAlert('SuperChat')} className="border-zinc-800 hover:bg-zinc-800 text-xs">
                                    ⭐ Super Chat
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => triggerAlert('GiftSub')} className="border-zinc-800 hover:bg-zinc-800 text-xs">
                                    🎁 Gift Sub
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => triggerAlert('RANK_UP')} className="border-zinc-800 hover:bg-zinc-800 text-xs">
                                    👑 Rank Up
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => triggerAlert('LOYALTY')} className="border-zinc-800 hover:bg-zinc-800 text-xs">
                                    💖 Loyalty
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

function StatusBadge({ label, status, meta }) {
    const isOnline = status === 'Connected' || status === 'Monitoring' || status === 'Active' || status === 'Tracking'
    const isDegraded = status === 'Degraded'
    return (
        <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 text-xs space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase font-semibold block">{label}</span>
            <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400' : isDegraded ? 'bg-amber-400' : 'bg-red-400'}`} />
                <span className="font-semibold text-zinc-200">{status || 'Offline'}</span>
            </div>
            {meta && <span className="text-[10px] text-zinc-500 font-mono block truncate">{meta}</span>}
        </div>
    )
}
