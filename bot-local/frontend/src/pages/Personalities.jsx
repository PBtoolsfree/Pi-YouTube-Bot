import React, { useState, useEffect } from 'react'
import { Save, Smile, Flame, HelpingHand, Sparkles, Edit2, Check, X, RotateCcw } from 'lucide-react'
import { Card, CardHeader, CardContent, CardTitle, CardDescription, Button, Badge, Input, Textarea } from '@/components/ui'
import { PageStatusBar } from '@/components/ServiceStatus'

const DEFAULT_PRESETS = [
    {
        id: 'roast',
        name: 'Roast Master',
        description: 'Savage but playful. Witty one-liners only.',
        icon_name: 'flame',
        prompt: `You are a savage but playful roast bot for live chat.
Reply with short, witty, funny one-liners.
Keep it entertaining, not toxic.
No hate, abuse, or personal attacks.
Max 1–2 lines only.`
    },
    {
        id: 'help',
        name: 'Helpful Assistant',
        description: 'Clear, simple explanations for beginners.',
        icon_name: 'helping',
        prompt: `You are a helpful assistant.
Explain clearly and simply like teaching a beginner.
Use short steps or bullets.
Give direct solutions only.
Avoid long explanations.`
    },
    {
        id: 'funny',
        name: 'High Energy',
        description: 'Goofy, meme-style, and humorous.',
        icon_name: 'smile',
        prompt: `You are goofy, meme-style, and high energy.
Make responses humorous and fun.
Add light jokes or emojis sometimes.
Keep answers short and chat-friendly.`
    },
    {
        id: 'custom',
        name: 'Dynamic Custom',
        description: 'Adapts personality based on user instruction.',
        icon_name: 'sparkles',
        prompt: `You are a dynamic custom AI.
Adapt your personality based on the user's instruction.

Rules:
- Follow the requested tone/style exactly
- Be concise for fast chat
- Keep responses short
- Avoid paragraphs

Examples:
"act like teacher" → explain simply
"be professional" → formal tone
"be funny" → add humor
"short answer" → one sentence only
"motivate me" → encouraging tone

Always adjust automatically to the user's request.`
    }
]

const ICONS = {
    flame: <Flame className="h-6 w-6 text-orange-500" />,
    helping: <HelpingHand className="h-6 w-6 text-blue-500" />,
    smile: <Smile className="h-6 w-6 text-yellow-500" />,
    sparkles: <Sparkles className="h-6 w-6 text-purple-500" />
}

export default function PersonalitiesPage({ config, onSave }) {
    const currentPrompt = config.ai_topology?.system_prompt || ""
    const [presets, setPresets] = useState(config.ai_topology?.presets || DEFAULT_PRESETS)
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState({})

    const handleApply = (preset) => {
        if (editingId) return
        const newConfig = { ...config }
        if (!newConfig.ai_topology) newConfig.ai_topology = {}
        newConfig.ai_topology.system_prompt = preset.prompt
        onSave(newConfig)
    }

    const startEdit = (e, preset) => {
        e.stopPropagation()
        setEditingId(preset.id)
        setEditForm({ ...preset })
    }

    const cancelEdit = (e) => {
        e.stopPropagation()
        setEditingId(null)
        setEditForm({})
    }

    const saveEdit = (e) => {
        e.stopPropagation()
        const newPresets = presets.map(p => p.id === editingId ? editForm : p)
        setPresets(newPresets)

        const newConfig = { ...config }
        if (!newConfig.ai_topology) newConfig.ai_topology = {}
        newConfig.ai_topology.presets = newPresets
        if (currentPrompt === presets.find(p => p.id === editingId)?.prompt) {
            newConfig.ai_topology.system_prompt = editForm.prompt
        }
        onSave(newConfig)
        setEditingId(null)
    }

    const resetToDefaults = () => {
        if (confirm("Reset all personalities to default?")) {
            setPresets(DEFAULT_PRESETS)
            const newConfig = { ...config }
            if (!newConfig.ai_topology) newConfig.ai_topology = {}
            newConfig.ai_topology.presets = DEFAULT_PRESETS
            onSave(newConfig)
        }
    }

    return (
        <div className="space-y-6">
            <PageStatusBar services={['ai']} />
            <div className="flex justify-between items-center px-1">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight text-zinc-100">AI Personalities</h2>
                    <p className="text-sm text-zinc-400">Select or customize a personality mode.</p>
                </div>
                <Button variant="outline" size="sm" onClick={resetToDefaults} className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset Defaults
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                {presets.map((preset) => {
                    const isActive = currentPrompt === preset.prompt
                    const isEditing = editingId === preset.id

                    if (isEditing) {
                        return (
                            <Card key={preset.id} className="bg-zinc-900 border-zinc-800 shadow-sm relative">
                                <CardHeader className="pb-4 border-b border-zinc-800">
                                    <div className="flex justify-between items-center mb-2">
                                        <CardTitle className="text-sm uppercase tracking-wider font-semibold text-zinc-400">Editing {preset.name}</CardTitle>
                                        <div className="flex gap-2">
                                            <Button size="icon" variant="ghost" onClick={saveEdit} className="h-8 w-8 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"><Check className="h-4 w-4" /></Button>
                                            <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-8 w-8 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"><X className="h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <Input
                                            value={editForm.name}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                            placeholder="Personality Name"
                                            className="bg-zinc-950 border-zinc-700 text-zinc-100"
                                        />
                                        <Input
                                            value={editForm.description}
                                            onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                            placeholder="Description"
                                            className="bg-zinc-950 border-zinc-700 text-zinc-100"
                                        />
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    <Textarea
                                        value={editForm.prompt}
                                        onChange={e => setEditForm({ ...editForm, prompt: e.target.value })}
                                        className="font-mono text-xs min-h-[150px] bg-zinc-950 border-zinc-700 text-zinc-300 placeholder:text-zinc-600"
                                        placeholder="System Prompt..."
                                    />
                                </CardContent>
                            </Card>
                        )
                    }

                    return (
                        <Card
                            key={preset.id}
                            className={`cursor-pointer transition-all duration-200 group bg-zinc-900 border-zinc-800 shadow-sm hover:border-zinc-700 ${isActive ? 'ring-1 ring-zinc-500 border-zinc-500' : ''}`}
                            onClick={() => handleApply(preset)}
                        >
                            <CardHeader className="flex flex-row items-center gap-4 relative pb-4">
                                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                                    {ICONS[preset.icon_name] || ICONS.sparkles}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <CardTitle className="text-base font-semibold text-zinc-100">{preset.name}</CardTitle>
                                        {isActive && <Badge variant="secondary" className="bg-zinc-100 text-zinc-900 hover:bg-white font-bold">Active</Badge>}
                                    </div>
                                    <CardDescription className="text-zinc-400 line-clamp-1">{preset.description}</CardDescription>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-white"
                                    onClick={(e) => startEdit(e, preset)}
                                >
                                    <Edit2 className="h-4 w-4" />
                                </Button>
                            </CardHeader>
                            <CardContent className="pt-0 pb-6">
                                <div className="bg-zinc-950/50 p-4 rounded border border-zinc-800/50 text-xs font-mono text-zinc-500 line-clamp-3 group-hover:text-zinc-400 transition-colors">
                                    {preset.prompt}
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
