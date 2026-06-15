import React, { useState, useEffect } from 'react'
import { Save, Info, ExternalLink } from 'lucide-react'

export default function SuperChatSettings({ config, onSave }) {
    const [settings, setSettings] = useState({
        topMargin: 20,
        nameDisplayMode: 'short',
        enableTips: true,
        enableSuperChats: true,
        msgDuration: 7,
        tiers: {
            t1: 30, t2: 60, t3: 90, t4: 120, t5: 180, t6: 300
        }
    })

    useEffect(() => {
        if (config && config.super_chat) {
            setSettings(prev => ({ ...prev, ...config.super_chat }))
        }
    }, [config])

    const handleChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }))
    }

    const handleTierChange = (tier, value) => {
        setSettings(prev => ({
            ...prev,
            tiers: { ...prev.tiers, [tier]: parseInt(value) || 0 }
        }))
    }

    const handleSave = () => {
        const newConfig = { ...config, super_chat: settings }
        onSave(newConfig)
    }

    const launchOverlay = () => {
        window.open('/overlay/superchat?test=true', '_blank')
    }

    return (
        <div className="p-6 h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    Super Chat Settings
                </h1>
                <div className="flex gap-2">
                    <button
                        onClick={launchOverlay}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                    >
                        <ExternalLink size={18} />
                        Launch Overlay
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                    >
                        <Save size={18} />
                        Save Settings
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                {/* General Settings */}
                <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-white/90 border-b border-white/10 pb-2 mb-4">Layout & Position</h2>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Horizontal Alignment */}
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Horizontal</label>
                            <select
                                value={settings.horizontalAlignment || 'left'}
                                onChange={(e) => handleChange('horizontalAlignment', e.target.value)}
                                className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                            >
                                <option value="flex-start">Left</option>
                                <option value="center">Center</option>
                                <option value="flex-end">Right</option>
                            </select>
                        </div>

                        {/* Vertical Alignment */}
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Vertical</label>
                            <select
                                value={settings.verticalAlignment || 'top'}
                                onChange={(e) => handleChange('verticalAlignment', e.target.value)}
                                className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                            >
                                <option value="top">Top</option>
                                <option value="bottom">Bottom</option>
                            </select>
                        </div>
                    </div>

                    {/* Dimensions */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Max Width (px)</label>
                            <input
                                type="number"
                                value={settings.maxWidth || 480}
                                onChange={(e) => handleChange('maxWidth', parseInt(e.target.value))}
                                className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Side Padding (px)</label>
                            <input
                                type="number"
                                value={settings.sidePadding || 20}
                                onChange={(e) => handleChange('sidePadding', parseInt(e.target.value))}
                                className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    </div>
                </div>

                {/* General Settings */}
                <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-white/90 border-b border-white/10 pb-2 mb-4">Display Configuration</h2>

                    {/* Top/Bottom Margin Contextual */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">
                            {(settings.verticalAlignment === 'bottom') ? 'Bottom ' : 'Top '} Margin (px)
                        </label>
                        <input
                            type="number"
                            value={settings.topMargin}
                            onChange={(e) => handleChange('topMargin', parseInt(e.target.value))}
                            className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>


                    {/* Name Display Mode */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Name in Pill Mode</label>
                        <select
                            value={settings.nameDisplayMode}
                            onChange={(e) => handleChange('nameDisplayMode', e.target.value)}
                            className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                        >
                            <option value="full">Show Full Name</option>
                            <option value="short">Short Name (8 chars)</option>
                        </select>
                    </div>

                    {/* Toggles */}
                    <div className="space-y-2 pt-2">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.enableTips}
                                onChange={(e) => handleChange('enableTips', e.target.checked)}
                                className="w-5 h-5 rounded border-white/10 bg-zinc-950 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-white">Show Tips (StreamElements/UPI)</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.enableSuperChats}
                                onChange={(e) => handleChange('enableSuperChats', e.target.checked)}
                                className="w-5 h-5 rounded border-white/10 bg-zinc-950 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-white">Show Super Chats (YouTube)</span>
                        </label>
                    </div>

                    {/* Message Read Time */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">
                            Message Read Time (seconds)
                            <span className="text-xs text-zinc-500 ml-2">(Before shrinking to ticker)</span>
                        </label>
                        <input
                            type="number"
                            value={settings.msgDuration}
                            onChange={(e) => handleChange('msgDuration', parseInt(e.target.value))}
                            className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>

                {/* Tiers Configuration */}
                <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-white/90 border-b border-white/10 pb-2 mb-4">
                        Duration Tiers (Seconds)
                    </h2>
                    <p className="text-xs text-zinc-500 mb-4">How long the pill stays on screen based on amount (INR equivalent).</p>

                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-blue-400 mb-1">Amount &lt; ₹100 (Blue)</label>
                            <input
                                type="number"
                                value={settings.tiers.t1}
                                onChange={(e) => handleTierChange('t1', e.target.value)}
                                className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-cyan-400 mb-1">Amount ₹100 - ₹199 (Cyan)</label>
                            <input
                                type="number"
                                value={settings.tiers.t2}
                                onChange={(e) => handleTierChange('t2', e.target.value)}
                                className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-green-400 mb-1">Amount ₹200 - ₹999 (Green)</label>
                            <input
                                type="number"
                                value={settings.tiers.t3}
                                onChange={(e) => handleTierChange('t3', e.target.value)}
                                className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-amber-400 mb-1">Amount ₹1000 - ₹1999 (Yellow)</label>
                            <input
                                type="number"
                                value={settings.tiers.t4}
                                onChange={(e) => handleTierChange('t4', e.target.value)}
                                className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-orange-500 mb-1">Amount ₹2000 - ₹4999 (Orange)</label>
                            <input
                                type="number"
                                value={settings.tiers.t5}
                                onChange={(e) => handleTierChange('t5', e.target.value)}
                                className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-rose-500 mb-1">Amount ₹5000+ (Red)</label>
                            <input
                                type="number"
                                value={settings.tiers.t6}
                                onChange={(e) => handleTierChange('t6', e.target.value)}
                                className="w-full bg-zinc-950 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
