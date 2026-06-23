import React, { useState } from 'react'
import { Shield, UserX, Zap, AlertTriangle, Save, Plus, X, Link as LinkIcon, Lock, MessageSquare, Type, Repeat, EyeOff } from 'lucide-react'
import { Card, CardHeader, CardContent, CardTitle, Input, Button, Switch, Textarea } from '@/components/ui'
import { PageStatusBar } from '@/components/ServiceStatus'

export default function ModerationPage({ config, onSave }) {
    const [localConfig, setLocalConfig] = useState(config)

    const updateNested = (path, value) => {
        const parts = path.split('.')
        const newConfig = { ...localConfig }
        let current = newConfig
        for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) current[parts[i]] = {}
            current = current[parts[i]]
        }
        current[parts[parts.length - 1]] = value
        setLocalConfig(newConfig)
    }

    const addItem = (path, value) => {
        if (!value.trim()) return
        const parts = path.split('.')
        let current = localConfig
        for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) current[parts[i]] = {}
            current = current[parts[i]]
        }
        const last = parts[parts.length - 1]
        if (!current[last]) current[last] = []
        
        if (!current[last].includes(value)) {
            const newArray = [...current[last], value]
            updateNested(path, newArray)
        }
    }

    const removeItem = (path, index) => {
        const parts = path.split('.')
        let current = localConfig
        for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) current[parts[i]] = {}
            current = current[parts[i]]
        }
        const last = parts[parts.length - 1]
        if (current[last]) {
            const newArray = current[last].filter((_, i) => i !== index)
            updateNested(path, newArray)
        }
    }

    if (!localConfig || !localConfig.moderation) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
                <AlertTriangle className="h-12 w-12 mb-4 text-orange-500" />
                <h3 className="text-xl font-bold text-zinc-100">Configuration Error</h3>
                <p>Moderation settings are missing from the configuration file.</p>
                <div className="mt-4 p-4 bg-zinc-900 rounded font-mono text-xs text-left w-full max-w-md overflow-auto border border-zinc-800">
                    {JSON.stringify(localConfig, null, 2)}
                </div>
            </div>
        )
    }

    const applyPreset = (mode) => {
        let update = { ...localConfig }
        if (!update.moderation) return

        if (!update.moderation.filters) update.moderation.filters = {}
        if (!update.moderation.protection_logic) update.moderation.protection_logic = {}
        // Initialize if not present
        if (!update.moderation.filters.spam_protection) update.moderation.filters.spam_protection = { enabled: true, limit: 5 }
        if (!update.moderation.filters.excess_symbols) update.moderation.filters.excess_symbols = { enabled: true, limit: 10 }
        if (!update.moderation.filters.caps_protection) update.moderation.filters.caps_protection = { enabled: true, limit: 70 }
        if (!update.moderation.filters.length_protection) update.moderation.filters.length_protection = { enabled: true, limit: 300 }
        if (!update.moderation.filters.repetition_filter) update.moderation.filters.repetition_filter = { enabled: true }
        if (!update.moderation.filters.gibberish_filter) update.moderation.filters.gibberish_filter = { enabled: true }
        if (!update.moderation.filters.identical_message_filter) update.moderation.filters.identical_message_filter = { enabled: true, limit: 3, window: 30 }
        if (!update.moderation.filters.advanced_spam_filter) update.moderation.filters.advanced_spam_filter = { enabled: true, short_spam_limit: 3 }

        if (mode === 'strict') {
            update.moderation.protection_logic.max_warnings = 1
            update.moderation.protection_logic.warning_window = 120
            update.moderation.protection_logic.timeout_duration = 3600
            update.moderation.filters.spam_protection.limit = 3
            update.moderation.filters.excess_symbols.limit = 5
            update.moderation.filters.length_protection.limit = 150
            update.moderation.filters.caps_protection.limit = 50
            update.moderation.filters.identical_message_filter.limit = 2
            update.moderation.filters.advanced_spam_filter.short_spam_limit = 2
        } else if (mode === 'balanced') {
            update.moderation.protection_logic.max_warnings = 3
            update.moderation.protection_logic.warning_window = 60
            update.moderation.protection_logic.timeout_duration = 600
            update.moderation.filters.spam_protection.limit = 5
            update.moderation.filters.excess_symbols.limit = 10
            update.moderation.filters.length_protection.limit = 300
            update.moderation.filters.caps_protection.limit = 70
            update.moderation.filters.identical_message_filter.limit = 3
            update.moderation.filters.advanced_spam_filter.short_spam_limit = 3
        } else if (mode === 'chill') {
            update.moderation.protection_logic.max_warnings = 5
            update.moderation.protection_logic.warning_window = 30
            update.moderation.protection_logic.timeout_duration = 60
            update.moderation.filters.spam_protection.limit = 10
            update.moderation.filters.excess_symbols.limit = 20
            update.moderation.filters.length_protection.limit = 500
            update.moderation.filters.caps_protection.limit = 90
            update.moderation.filters.identical_message_filter.limit = 5
            update.moderation.filters.advanced_spam_filter.short_spam_limit = 5
        }
        setLocalConfig(update)
    }

    return (
        <div className="space-y-6 pb-10">
            <PageStatusBar services={['bot', 'ai']} />
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                        <Shield className="h-5 w-5 text-zinc-100" />
                        Moderation Hub
                    </h2>
                    <p className="text-sm text-zinc-400">Easy-to-use automatic chat rules.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    {/* Global Toggle */}
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1">
                        <span className={`text-xs font-bold uppercase tracking-wider ${localConfig.moderation.enabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            {localConfig.moderation.enabled ? 'Active' : 'Disabled'}
                        </span>
                        <Switch
                            checked={localConfig.moderation?.enabled ?? true}
                            onCheckedChange={(c) => updateNested('moderation.enabled', c)}
                        />
                    </div>

                    {/* Presets */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider hidden lg:inline-block">Presets:</span>
                        <Button size="sm" variant="outline" onClick={() => applyPreset('strict')} className="h-7 text-xs border-rose-500/20 text-rose-500 bg-rose-500/5 hover:bg-rose-500/10">Strict</Button>
                        <Button size="sm" variant="outline" onClick={() => applyPreset('balanced')} className="h-7 text-xs border-amber-500/20 text-amber-500 bg-amber-500/5 hover:bg-amber-500/10">Balanced</Button>
                        <Button size="sm" variant="outline" onClick={() => applyPreset('chill')} className="h-7 text-xs border-emerald-500/20 text-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10">Chill</Button>
                    </div>

                    <div className="h-6 w-px bg-zinc-800 hidden md:block" />
                    <Button
                        onClick={() => onSave(localConfig)}
                        className="bg-zinc-100 text-zinc-900 hover:bg-white font-medium h-8"
                    >
                        <Save className="mr-2 h-3.5 w-3.5" /> Save Changes
                    </Button>
                </div>
            </div>

            {/* Main Grid: 3 Columns */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 items-start">

                {/* Column 1: Bot Settings & Basic Rules */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2 text-zinc-500 mb-2 px-1">
                        <Zap className="h-4 w-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">Bot Settings</span>
                    </div>

                    {/* Ignore Users */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                <UserX className="h-4 w-4 text-rose-500" /> Ignore Users
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <p className="text-[11px] text-zinc-400">Tell the bot which users to completely ignore in the chat.</p>
                            <div className="flex gap-2">
                                <Input
                                    id="ignore-user"
                                    className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs"
                                    placeholder="Add username..."
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            addItem('moderation.ignore_list', e.target.value)
                                            e.target.value = ''
                                        }
                                    }}
                                />
                                <Button className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700 h-8 w-8" size="icon" onClick={() => {
                                    const input = document.getElementById('ignore-user')
                                    addItem('moderation.ignore_list', input.value)
                                    input.value = ''
                                }}><Plus className="h-4 w-4" /></Button>
                            </div>
                            <div className="flex flex-wrap gap-2 min-h-[40px]">
                                {(localConfig.moderation.ignore_list || []).map((user, idx) => (
                                    <div key={idx} className="bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded border border-rose-500/20 text-[10px] font-medium flex items-center gap-2">
                                        {user}
                                        <X className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100" onClick={() => removeItem('moderation.ignore_list', idx)} />
                                    </div>
                                ))}
                                {(localConfig.moderation.ignore_list?.length === 0 || !localConfig.moderation.ignore_list) && <span className="text-[10px] text-zinc-600 italic">No users ignored.</span>}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Ignore Texts (Silent Ignore) */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                <EyeOff className="h-4 w-4 text-zinc-400" /> Ignore Texts
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <p className="text-[11px] text-zinc-400">Silently ignore any messages containing these keywords/phrases (no warning, no AI, no TTS sound).</p>
                            <div className="flex gap-2">
                                <Input
                                    id="ignore-text-input"
                                    className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs"
                                    placeholder="Add keyword/phrase..."
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            addItem('moderation.ignore_text_list', e.target.value)
                                            e.target.value = ''
                                        }
                                    }}
                                />
                                <Button className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700 h-8 w-8" size="icon" onClick={() => {
                                    const input = document.getElementById('ignore-text-input')
                                    addItem('moderation.ignore_text_list', input.value)
                                    input.value = ''
                                }}><Plus className="h-4 w-4" /></Button>
                            </div>
                            <div className="flex flex-wrap gap-2 min-h-[40px]">
                                {(localConfig.moderation.ignore_text_list || []).map((text, idx) => (
                                    <div key={idx} className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700 text-[10px] font-medium flex items-center gap-2">
                                        {text}
                                        <X className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100" onClick={() => removeItem('moderation.ignore_text_list', idx)} />
                                    </div>
                                ))}
                                {(localConfig.moderation.ignore_text_list?.length === 0 || !localConfig.moderation.ignore_text_list) && <span className="text-[10px] text-zinc-600 italic">No text ignored.</span>}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Bot Keywords */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                        <CardHeader className="pb-3 border-b border-zinc-800 flex flex-row items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                                <Zap className="h-4 w-4 text-amber-500" /> Bot Keywords
                            </CardTitle>
                            <Switch
                                checked={localConfig.moderation?.ai_triggers?.enabled ?? true}
                                onCheckedChange={(c) => updateNested('moderation.ai_triggers.enabled', c)}
                            />
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <p className="text-[11px] text-zinc-400">Words or commands that wake up the bot to reply to a user.</p>
                            <div className="space-y-2">
                                <Input
                                    className="bg-zinc-950 border-zinc-700 text-zinc-100 h-8 text-xs placeholder:text-zinc-600"
                                    placeholder="Type word and press Enter..."
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            if (e.target.value.startsWith('!')) addItem('moderation.ai_triggers.prefixes', e.target.value)
                                            else addItem('moderation.ai_triggers.keywords', e.target.value)
                                            e.target.value = ''
                                        }
                                    }}
                                />
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {(localConfig.moderation?.ai_triggers?.prefixes || []).map((pref, idx) => (
                                        <div key={idx} className="bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded text-[10px] border border-amber-500/20 font-medium flex items-center gap-1">
                                            {pref}
                                            <X className="h-2.5 w-2.5 cursor-pointer opacity-60 hover:opacity-100" onClick={() => removeItem('moderation.ai_triggers.prefixes', idx)} />
                                        </div>
                                    ))}
                                    {(localConfig.moderation?.ai_triggers?.keywords || []).map((kw, idx) => (
                                        <div key={idx} className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded text-[10px] border border-blue-500/20 font-medium flex items-center gap-1">
                                            {kw}
                                            <X className="h-2.5 w-2.5 cursor-pointer opacity-60 hover:opacity-100" onClick={() => removeItem('moderation.ai_triggers.keywords', idx)} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Column 2: Chat Filters (Part 1) */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2 text-zinc-500 mb-2 px-1">
                        <Shield className="h-4 w-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">Chat Rules</span>
                    </div>

                    {/* Block Links */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden">
                        <div className="flex flex-row items-center justify-between p-4 bg-zinc-900">
                            <div>
                                <CardTitle className="text-zinc-100 font-semibold text-sm flex items-center gap-2">
                                    <LinkIcon className="h-4 w-4 text-blue-400" /> Block Links
                                </CardTitle>
                                <p className="text-[11px] text-zinc-400 mt-1">Stop people from posting random website links.</p>
                            </div>
                            <Switch
                                checked={localConfig.moderation?.filters?.link_protection?.enabled ?? false}
                                onCheckedChange={(c) => updateNested('moderation.filters.link_protection.enabled', c)}
                            />
                        </div>
                        {localConfig.moderation?.filters?.link_protection?.enabled && (
                            <div className="px-4 pb-4 pt-1 bg-zinc-950/30 border-t border-zinc-800">
                                <div className="mt-3">
                                    <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-2 block">Safe Links (Whitelist)</label>
                                    <Input
                                        className="bg-zinc-950 border-zinc-700 text-zinc-100 h-8 text-xs placeholder:text-zinc-600 mb-2"
                                        placeholder="Add safe site (e.g. youtube.com)"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                addItem('moderation.filters.link_protection.whitelist', e.target.value)
                                                e.target.value = ''
                                            }
                                        }}
                                    />
                                    <div className="flex flex-wrap gap-1.5">
                                        {(localConfig.moderation?.filters?.link_protection?.whitelist || []).map((domain, idx) => (
                                            <div key={idx} className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded text-[10px] border border-blue-500/20 font-medium flex items-center gap-1">
                                                {domain}
                                                <X className="h-2.5 w-2.5 cursor-pointer opacity-60 hover:opacity-100" onClick={() => removeItem('moderation.filters.link_protection.whitelist', idx)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Banned Words */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden">
                        <div className="flex flex-row items-center justify-between p-4 bg-zinc-900">
                            <div>
                                <CardTitle className="text-zinc-100 font-semibold text-sm flex items-center gap-2">
                                    <Lock className="h-4 w-4 text-rose-500" /> Banned Words
                                </CardTitle>
                                <p className="text-[11px] text-zinc-400 mt-1">A list of bad words that are strictly not allowed.</p>
                            </div>
                            <Switch
                                checked={localConfig.moderation?.filters?.word_blacklist?.enabled ?? false}
                                onCheckedChange={(c) => updateNested('moderation.filters.word_blacklist.enabled', c)}
                            />
                        </div>
                        {localConfig.moderation?.filters?.word_blacklist?.enabled && (
                            <div className="px-4 pb-4 pt-4 bg-zinc-950/30 border-t border-zinc-800">
                                <Textarea
                                    className="font-mono text-[10px] min-h-[80px] bg-zinc-950 border-zinc-700 text-zinc-300 resize-y"
                                    value={localConfig.moderation?.filters?.word_blacklist?.words?.join('\n') ?? ""}
                                    onChange={(e) => updateNested('moderation.filters.word_blacklist.words', e.target.value.split('\n'))}
                                    placeholder="Type forbidden words here (one per line)..."
                                />
                            </div>
                        )}
                    </Card>

                    {/* Stop Shouting (Caps) */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden">
                        <div className="flex flex-row items-center justify-between p-4 bg-zinc-900">
                            <div>
                                <CardTitle className="text-zinc-100 font-semibold text-sm flex items-center gap-2">
                                    <Type className="h-4 w-4 text-amber-500" /> Stop Shouting
                                </CardTitle>
                                <p className="text-[11px] text-zinc-400 mt-1">Stops people from typing in ALL CAPS.</p>
                            </div>
                            <Switch
                                checked={localConfig.moderation?.filters?.caps_protection?.enabled ?? false}
                                onCheckedChange={(c) => updateNested('moderation.filters.caps_protection.enabled', c)}
                            />
                        </div>
                        {localConfig.moderation?.filters?.caps_protection?.enabled && (
                            <div className="px-4 pb-4 pt-3 bg-zinc-950/30 border-t border-zinc-800">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] text-zinc-500">Max Caps %</label>
                                    <div className="flex items-center gap-2">
                                        <Input type="number" className="h-7 w-16 text-xs text-center bg-zinc-950 border-zinc-700"
                                            value={localConfig.moderation?.filters?.caps_protection?.limit ?? 70}
                                            onChange={(e) => updateNested('moderation.filters.caps_protection.limit', parseInt(e.target.value))} />
                                        <span className="text-[10px] text-zinc-500">%</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Column 3: Chat Filters & Punishments */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2 text-zinc-500 mb-2 px-1">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">Advanced & Punishments</span>
                    </div>

                    {/* Stop Text Walls */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden">
                        <div className="flex flex-row items-center justify-between p-4 bg-zinc-900">
                            <div>
                                <CardTitle className="text-zinc-100 font-semibold text-sm flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4 text-emerald-500" /> Stop Text Walls
                                </CardTitle>
                                <p className="text-[11px] text-zinc-400 mt-1">Blocks messages that are simply too long.</p>
                            </div>
                            <Switch
                                checked={localConfig.moderation?.filters?.length_protection?.enabled ?? false}
                                onCheckedChange={(c) => updateNested('moderation.filters.length_protection.enabled', c)}
                            />
                        </div>
                        {localConfig.moderation?.filters?.length_protection?.enabled && (
                            <div className="px-4 pb-4 pt-3 bg-zinc-950/30 border-t border-zinc-800">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] text-zinc-500">Max Characters</label>
                                    <Input type="number" className="h-7 w-20 text-xs text-center bg-zinc-950 border-zinc-700"
                                        value={localConfig.moderation?.filters?.length_protection?.limit ?? 300}
                                        onChange={(e) => updateNested('moderation.filters.length_protection.limit', parseInt(e.target.value))} />
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Stop Repeating Words */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden">
                        <div className="flex flex-row items-center justify-between p-4 bg-zinc-900">
                            <div>
                                <CardTitle className="text-zinc-100 font-semibold text-sm flex items-center gap-2">
                                    <Repeat className="h-4 w-4 text-purple-400" /> Stop Repeating Words
                                </CardTitle>
                                <p className="text-[11px] text-zinc-400 mt-1">Stops people from repeating the same word.</p>
                            </div>
                            <Switch
                                checked={localConfig.moderation?.filters?.repetition_filter?.enabled ?? false}
                                onCheckedChange={(c) => updateNested('moderation.filters.repetition_filter.enabled', c)}
                            />
                        </div>
                    </Card>

                    {/* Auto Spam & Gibberish Blocker */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden">
                        <div className="flex flex-row items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800">
                            <div>
                                <CardTitle className="text-zinc-100 font-semibold text-sm flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-violet-400" /> Auto Spam & Gibberish Blocker
                                </CardTitle>
                                <p className="text-[11px] text-zinc-400 mt-1">Automatically detects and mutes repeating characters ("ohhhhh"), spaces, and gibberish.</p>
                            </div>
                            <Switch
                                checked={localConfig.moderation?.filters?.gibberish_filter?.enabled ?? true}
                                onCheckedChange={(c) => updateNested('moderation.filters.gibberish_filter.enabled', c)}
                            />
                        </div>
                        <CardContent className="p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-medium text-zinc-300">Advanced Similar Message Filter</div>
                                    <div className="text-[10px] text-zinc-500">Catches slight message variations & random short letter spam</div>
                                </div>
                                <Switch
                                    className="scale-75 origin-right"
                                    checked={localConfig.moderation?.filters?.advanced_spam_filter?.enabled ?? false}
                                    onCheckedChange={(c) => updateNested('moderation.filters.advanced_spam_filter.enabled', c)}
                                />
                            </div>
                            
                            {localConfig.moderation?.filters?.advanced_spam_filter?.enabled && (
                                <div className="flex items-center justify-between pl-1 border-l-2 border-violet-500/30">
                                    <div>
                                        <div className="text-xs font-medium text-zinc-400">Max Short Messages</div>
                                        <div className="text-[10px] text-zinc-500">Max short gibberish per window (e.g. ko, lo)</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input type="number" min="1" max="10" className="h-7 w-16 text-xs text-center bg-zinc-950 border-zinc-700"
                                            value={localConfig.moderation?.filters?.advanced_spam_filter?.short_spam_limit ?? 3}
                                            onChange={(e) => updateNested('moderation.filters.advanced_spam_filter.short_spam_limit', parseInt(e.target.value))} />
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Identical Message Blocker */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden">
                        <div className="flex flex-row items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800">
                            <div>
                                <CardTitle className="text-zinc-100 font-semibold text-sm flex items-center gap-2">
                                    <Repeat className="h-4 w-4 text-cyan-400" /> Identical Message Blocker
                                </CardTitle>
                                <p className="text-[11px] text-zinc-400 mt-1">Restrict spamming the exact same message.</p>
                            </div>
                            <Switch
                                checked={localConfig.moderation?.filters?.identical_message_filter?.enabled ?? false}
                                onCheckedChange={(c) => updateNested('moderation.filters.identical_message_filter.enabled', c)}
                            />
                        </div>
                        {localConfig.moderation?.filters?.identical_message_filter?.enabled && (
                            <CardContent className="p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-medium text-zinc-300">Max identical messages</div>
                                        <div className="text-[10px] text-zinc-500">Allowed times in a row</div>
                                    </div>
                                    <Input type="number" className="h-7 w-16 text-xs text-center bg-zinc-950 border-zinc-700"
                                        value={localConfig.moderation?.filters?.identical_message_filter?.limit ?? 3}
                                        onChange={(e) => updateNested('moderation.filters.identical_message_filter.limit', parseInt(e.target.value))} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-medium text-zinc-300">Time Window</div>
                                        <div className="text-[10px] text-zinc-500">Window in seconds</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input type="number" className="h-7 w-16 text-xs text-center bg-zinc-950 border-zinc-700"
                                            value={localConfig.moderation?.filters?.identical_message_filter?.window ?? 30}
                                            onChange={(e) => updateNested('moderation.filters.identical_message_filter.window', parseInt(e.target.value))} />
                                        <span className="text-[10px] text-zinc-500 w-10">sec</span>
                                    </div>
                                </div>
                            </CardContent>
                        )}
                    </Card>

                    {/* Spam Blocker & Emoji Spammer */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                        <CardHeader className="p-4 border-b border-zinc-800">
                            <CardTitle className="text-zinc-100 font-semibold text-sm flex items-center gap-2">
                                <Zap className="h-4 w-4 text-indigo-400" /> Fast Spam & Emoji Blocker
                            </CardTitle>
                            <p className="text-[11px] text-zinc-400 mt-1">Stop fast typing or spamming too many emojis.</p>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-medium text-zinc-300">Fast Typing Filter</div>
                                    <div className="text-[10px] text-zinc-500">Max messages in a row</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        className="scale-75 origin-right"
                                        checked={localConfig.moderation?.filters?.spam_protection?.enabled ?? false}
                                        onCheckedChange={(c) => updateNested('moderation.filters.spam_protection.enabled', c)}
                                    />
                                    <Input type="number" className="h-7 w-16 text-xs text-center bg-zinc-950 border-zinc-700"
                                        value={localConfig.moderation?.filters?.spam_protection?.limit ?? 5}
                                        onChange={(e) => updateNested('moderation.filters.spam_protection.limit', parseInt(e.target.value))} />
                                </div>
                            </div>

                            {localConfig.moderation?.filters?.spam_protection?.enabled && (
                                <div className="flex items-center justify-between pl-1 border-l-2 border-indigo-500/30">
                                    <div>
                                        <div className="text-xs font-medium text-zinc-400">Spam Window</div>
                                        <div className="text-[10px] text-zinc-500">Time window in seconds</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input type="number" min="1" max="60" className="h-7 w-16 text-xs text-center bg-zinc-950 border-zinc-700"
                                            value={localConfig.moderation?.filters?.spam_protection?.window ?? 5}
                                            onChange={(e) => updateNested('moderation.filters.spam_protection.window', parseInt(e.target.value))} />
                                        <span className="text-[10px] text-zinc-500 w-10">sec</span>
                                    </div>
                                </div>
                            )}


                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-medium text-zinc-300">Emoji / Symbol Limit</div>
                                    <div className="text-[10px] text-zinc-500">Max emojis per message</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        className="scale-75 origin-right"
                                        checked={localConfig.moderation?.filters?.excess_symbols?.enabled ?? false}
                                        onCheckedChange={(c) => updateNested('moderation.filters.excess_symbols.enabled', c)}
                                    />
                                    <Input type="number" className="h-7 w-16 text-xs text-center bg-zinc-950 border-zinc-700"
                                        value={localConfig.moderation?.filters?.excess_symbols?.limit ?? 10}
                                        onChange={(e) => updateNested('moderation.filters.excess_symbols.limit', parseInt(e.target.value))} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Punishments */}
                    <Card className="bg-zinc-900 border-zinc-800 shadow-sm border-t-2 border-t-rose-500/50">
                        <CardHeader className="pb-3 border-b border-zinc-800">
                            <CardTitle className="text-zinc-100 font-semibold text-sm">Punishments</CardTitle>
                            <p className="text-[11px] text-zinc-400">What the bot should do when rules are broken.</p>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-medium text-zinc-300">Chances Given</label>
                                </div>
                                <p className="text-[10px] text-zinc-500">How many mistakes allowed before getting a timeout.</p>
                                <div className="flex items-center gap-3">
                                    <Input
                                        type="number"
                                        min="0"
                                        max="10"
                                        className="bg-zinc-950 border-zinc-700 text-zinc-100 h-8 w-16 text-center"
                                        value={localConfig.moderation?.protection_logic?.max_warnings ?? 3}
                                        onChange={(e) => updateNested('moderation.protection_logic.max_warnings', parseInt(e.target.value))}
                                    />
                                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-rose-500" style={{ width: `${((localConfig.moderation?.protection_logic?.max_warnings ?? 3) / 10) * 100}%` }} />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-zinc-800 space-y-2">
                                <label className="text-xs font-medium text-zinc-300">Timeout Length</label>
                                <p className="text-[10px] text-zinc-500">How many seconds they will be timed out for.</p>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        className="bg-zinc-950 border-zinc-700 text-zinc-100 h-8 w-24"
                                        value={localConfig.moderation?.protection_logic?.timeout_duration ?? 60}
                                        onChange={(e) => updateNested('moderation.protection_logic.timeout_duration', parseInt(e.target.value))}
                                    />
                                    <span className="text-xs text-zinc-500">seconds</span>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-zinc-800 space-y-2">
                                <label className="text-xs font-medium text-zinc-300">Chances Time Window</label>
                                <p className="text-[10px] text-zinc-500">How long before chances reset (e.g., 5 mistakes in 60s = timeout).</p>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        className="bg-zinc-950 border-zinc-700 text-zinc-100 h-8 w-24"
                                        value={localConfig.moderation?.protection_logic?.warning_window ?? 60}
                                        onChange={(e) => updateNested('moderation.protection_logic.warning_window', parseInt(e.target.value))}
                                    />
                                    <span className="text-xs text-zinc-500">seconds</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                </div>

            </div>
        </div>
    )
}
