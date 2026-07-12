import React, { useState } from 'react'
import { Copy, Check, Monitor, Volume2, Info, Settings } from 'lucide-react'
import { Card, CardHeader, CardContent, CardTitle, Button, Input } from '@/components/ui'

import { copyToClipboard as secureCopy } from '@/lib/utils'

export default function OBSPage({ config, onSave }) {
    const [copiedMap, setCopiedMap] = useState({})

    // Config values
    const audioCfg = config?.audio || {}
    const gamingPcIp = audioCfg.gaming_pc_ip || '127.0.0.1'
    const [localIp, setLocalIp] = useState(gamingPcIp)

    // Derived URLs - Use hostname instead of hardcoded localhost
    const host = window.location.host

    const chatOverlayUrl = `http://${host}/?mode=chat`


    // Audio URLs use the Gaming PC IP and dynamic ports
    const publicAudioUrl = `udp://${gamingPcIp}:${audioCfg.udp_ports?.public || 1234}`
    const secretAudioUrl = `udp://${gamingPcIp}:${audioCfg.udp_ports?.secret || 1235}`

    const copyToClipboard = async (text, key) => {
        const success = await secureCopy(text)
        if (success) {
            setCopiedMap(prev => ({ ...prev, [key]: true }))
            setTimeout(() => {
                setCopiedMap(prev => ({ ...prev, [key]: false }))
            }, 2000)
        }
    }

    const handleUpdateIp = () => {
        const newConfig = {
            ...config,
            audio: {
                ...audioCfg,
                gaming_pc_ip: localIp
            }
        }
        onSave(newConfig)
    }

    return (
        <div className="space-y-6 pb-10">
            <div>
                <div className="flex justify-between items-start px-1 mb-6">
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                            <Monitor className="h-5 w-5 text-zinc-100" />
                            OBS Integration
                        </h2>
                        <p className="text-sm text-zinc-400">Quickly set up your stream overlays and audio feeds.</p>
                    </div>

                    <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 p-3 rounded-lg shadow-sm">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide px-1">Gaming PC IP</label>
                            <Input
                                type="text"
                                value={localIp}
                                onChange={(e) => setLocalIp(e.target.value)}
                                className="bg-zinc-950 border-zinc-700 h-8 text-xs font-mono w-40 text-zinc-100"
                                placeholder="192.168.1.10"
                            />
                        </div>
                        <div className="pt-4">
                            <Button
                                onClick={handleUpdateIp}
                                size="sm"
                                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 h-8 text-xs font-semibold"
                            >
                                Set Destination
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">




                    {/* Audio Source Card */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                <Volume2 className="h-4 w-4 text-blue-500" /> Audio Engine (UDP)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-6">
                            <p className="text-xs text-zinc-400">
                                Add these to OBS to hear the AI voice.
                            </p>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wide">Public (Chat)</label>
                                <div className="flex gap-2">
                                    <div className="flex-1 bg-zinc-950 p-2.5 rounded border border-zinc-800 font-mono text-xs truncate text-zinc-300 select-all">
                                        {publicAudioUrl}
                                    </div>
                                    <Button size="icon" variant="outline" className="h-9 w-9 border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300" onClick={() => copyToClipboard(publicAudioUrl, 'public')}>
                                        {copiedMap['public'] ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wide">Secret (System)</label>
                                <div className="flex gap-2">
                                    <div className="flex-1 bg-zinc-950 p-2.5 rounded border border-zinc-800 font-mono text-xs truncate text-zinc-300 select-all">
                                        {secretAudioUrl}
                                    </div>
                                    <Button size="icon" variant="outline" className="h-9 w-9 border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300" onClick={() => copyToClipboard(secretAudioUrl, 'secret')}>
                                        {copiedMap['secret'] ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>

                            <div className="bg-zinc-950/50 p-3 rounded border border-zinc-800/50">
                                <h4 className="text-[10px] font-bold uppercase text-zinc-400 mb-2 flex items-center gap-1.5">
                                    <Settings className="h-3 w-3" /> OBS Setup
                                </h4>
                                <ul className="text-[10px] space-y-1.5 text-zinc-500 list-disc ml-4">
                                    <li>Add <b>Media Source</b></li>
                                    <li>Uncheck <b>Local File</b></li>
                                    <li>Input: UDP URL above</li>
                                    <li>Input Format: <b>mpegts</b></li>
                                </ul>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
