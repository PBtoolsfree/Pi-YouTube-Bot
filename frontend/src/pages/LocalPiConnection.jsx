import React, { useState, useEffect } from 'react'
import { Server, Copy, CheckCircle2 } from 'lucide-react'
import { Card, Button } from '@/components/ui'

const LocalPiConnection = () => {
    const [wsUrl, setWsUrl] = useState('')
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        // Automatically determine the correct WebSocket URL based on current host
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = window.location.host
        setWsUrl(`${protocol}//${host}/ws/pi-client`)
    }, [])

    const handleCopy = () => {
        navigator.clipboard.writeText(wsUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-12">
            <div>
                <h1 className="text-3xl font-bold text-zinc-100 flex items-center gap-3">
                    <Server className="w-8 h-8 text-blue-400" />
                    Local Pi Connection
                </h1>
                <p className="text-zinc-400 mt-2">
                    Connect your local Raspberry Pi to this Cloud Server to instantly receive donation alerts.
                </p>
            </div>

            <Card className="p-6 border-zinc-800/50 bg-zinc-900/50 backdrop-blur-sm">
                <div className="space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold text-zinc-200">WebSocket URL</h2>
                        <p className="text-sm text-zinc-400 mb-4">
                            Copy this URL and paste it into your <b>Local Raspberry Pi Dashboard</b> under <b>Settings &gt; Integrations &gt; Cloud Connection</b>.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex-1 bg-black/40 border border-zinc-800 rounded-lg p-3 font-mono text-sm text-blue-400 break-all">
                            {wsUrl}
                        </div>
                        <Button 
                            onClick={handleCopy}
                            variant={copied ? "success" : "primary"}
                            className="shrink-0 flex items-center gap-2"
                        >
                            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copied ? "Copied" : "Copy"}
                        </Button>
                    </div>

                    <div className="pt-4 border-t border-zinc-800">
                        <h3 className="text-sm font-semibold text-emerald-400 mb-2">Why is this better?</h3>
                        <ul className="text-sm text-zinc-400 space-y-2 list-disc pl-5">
                            <li>You do <b>NOT</b> need Cloudflare Tunnel on your Local Raspberry Pi anymore.</li>
                            <li>The connection is instant and real-time.</li>
                            <li>Your Local Raspberry Pi stays completely private and secure.</li>
                        </ul>
                    </div>
                </div>
            </Card>
        </div>
    )
}

export default LocalPiConnection
