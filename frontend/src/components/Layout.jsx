import React from 'react'
import axios from 'axios'
import {
    LayoutDashboard, Settings, Cpu, Activity, Power, Monitor, Shield, Users,
    ShieldBan, Volume2, Heart, Share2, Beaker, Sparkles, IndianRupee, Cloud,
    Gem, Terminal, Clock, Bot, Brain, Youtube, Mail, Link2, Radio, Archive, Clapperboard, Target, Gift, Smartphone, Server, History
} from 'lucide-react'
import { cn } from '@/lib/utils'

const API_URL = import.meta?.env?.VITE_API_URL || '/api'

export default function Layout({ activeTab, setActiveTab, status, config, children }) {
    const [svcStatus, setSvcStatus] = React.useState(null)
    const [aiOn, setAiOn] = React.useState(true)
    const [ttsOn, setTtsOn] = React.useState(true)

    React.useEffect(() => {
        const poll = async () => {
            try {
                const [st, cfg] = await Promise.all([
                    axios.get(`${API_URL}/status`),
                    axios.get(`${API_URL}/config`).catch(() => ({ data: {} }))
                ])
                setSvcStatus(st.data)
                setAiOn(cfg.data?.ai_topology?.enabled !== false)
                setTtsOn(cfg.data?.audio?.enabled !== false)
            } catch (e) { }
        }
        poll()
        const iv = setInterval(poll, 5000)
        return () => clearInterval(iv)
    }, [])

    // Check for both old and new API structures safely
    const isBotRunning = svcStatus?.bot_core?.status === 'running' || svcStatus?.bot === 'running' || svcStatus?.detailed_bot?.is_running || svcStatus?.bot?.is_running
    
    const svc = {
        bot: !!isBotRunning,
        ai: aiOn,
        tts: ttsOn,
        youtube: svcStatus?.workers?.youtube_monitor?.status === 'running' || svcStatus?.youtube_chat === 'connected' || !!svcStatus?.bot?.youtube_monitored,
        email: svcStatus?.workers?.email_alerts?.status === 'connected' || svcStatus?.email_status === 'Connected' || svcStatus?.bot?.email_status === 'Connected',
        streamer: svcStatus?.workers?.streamerbot?.status === 'connected' || svcStatus?.obs_streamerbot === 'connected' || !!svcStatus?.bot?.streamer_bot_connected,
    }

    // Which dot color to show per nav item (based on relevant service)
    // null = no dot, 'green' = running, 'yellow' = partial, 'red' = stopped
    const navDot = (id) => {
        if (!svcStatus) return null
        switch (id) {
            case 'dashboard': return svc.bot ? 'green' : 'red'
            case 'goals': return svc.bot ? 'green' : 'red'
            case 'agent': return svc.ai && svc.bot ? 'green' : svc.ai ? 'yellow' : 'red'
            case 'personalities': return svc.ai ? 'green' : 'yellow'
            case 'orchestrator': return svc.bot ? 'green' : 'red'
            case 'moderation': return svc.bot ? 'green' : 'red'
            case 'ignore_list': return null
            case 'viewers': return svc.bot ? 'green' : 'red'
            case 'loyalty': return svc.bot ? 'green' : 'red'
            case 'giveaways': return null
            case 'streamer_bot': return svc.streamer ? 'green' : 'red'
            case 'audio_engine': return svc.tts ? 'green' : 'red'
            case 'obs': return null
            case 'testing': return svc.bot ? 'green' : 'red'
            case 'tip_page_settings': return svc.email ? 'green' : 'yellow'
            case 'super_chat_settings': return svc.bot ? 'green' : 'red'
            case 'cloudflare': return svcStatus?.tunnel?.is_running ? 'green' : 'red'
            case 'local_pi_connection': return svcStatus?.workers?.cloud_client?.status === 'connected' ? 'green' : 'red'
            case 'backup': return null
            case 'redeems': return svc.streamer ? 'green' : 'yellow'
            case 'settings': return null
            default: return null
        }
    }

    const dotColor = {
        green: 'bg-emerald-500',
        yellow: 'bg-amber-500',
        red: 'bg-rose-600',
    }

    return (
        <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-16 md:w-64 border-r border-sidebar-accent bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300">
                <div className="h-16 flex items-center justify-center md:justify-start md:px-6 border-b border-sidebar-accent bg-sidebar-accent/50 shrink-0">
                    <div className="font-bold text-xl tracking-tight hidden md:block text-white">Pi Bot <span className="text-primary">v2</span></div>
                    <div className="font-bold text-xl tracking-tight md:hidden text-white">Pi</div>
                </div>

                <div className="flex-1 overflow-y-auto py-2">
                    <nav className="p-4 space-y-1">
                        {config?.is_cloud ? (
                            <>
                                <NavItem id="tip_page_settings" icon={<IndianRupee />} label="Tip Page Settings" active={activeTab} onClick={setActiveTab} dot={navDot('tip_page_settings')} dotColor={dotColor} />
                                <NavItem id="local_pi_connection" icon={<Server />} label="Local Pi Connection" active={activeTab} onClick={setActiveTab} dot={navDot('local_pi_connection')} dotColor={dotColor} />
                                <NavItem id="cloudflare" icon={<Cloud />} label="Cloudflare" active={activeTab} onClick={setActiveTab} dot={navDot('cloudflare')} dotColor={dotColor} />
                                <NavItem id="app_webhook" icon={<Smartphone />} label="App Webhook" active={activeTab} onClick={setActiveTab} dot={navDot('app_webhook')} dotColor={dotColor} />
                            </>
                        ) : (
                            <>
                                <NavItem id="dashboard" icon={<Activity />} label="Dashboard" active={activeTab} onClick={setActiveTab} dot={navDot('dashboard')} dotColor={dotColor} />
                                <NavItem id="goals" icon={<Target />} label="Goals" active={activeTab} onClick={setActiveTab} dot={navDot('goals')} dotColor={dotColor} />
                                <NavItem id="agent" icon={<Bot />} label="🤖 Agent" active={activeTab} onClick={setActiveTab} dot={navDot('agent')} dotColor={dotColor} />
                                <NavItem id="personalities" icon={<Sparkles />} label="Personalities" active={activeTab} onClick={setActiveTab} dot={navDot('personalities')} dotColor={dotColor} />
                                <NavItem id="orchestrator" icon={<Cpu />} label="Orchestrator" active={activeTab} onClick={setActiveTab} dot={navDot('orchestrator')} dotColor={dotColor} />
                                <NavItem id="moderation" icon={<Shield />} label="Moderation" active={activeTab} onClick={setActiveTab} dot={navDot('moderation')} dotColor={dotColor} />
                                <NavItem id="ignore_list" icon={<ShieldBan />} label="Ignore List" active={activeTab} onClick={setActiveTab} dot={navDot('ignore_list')} dotColor={dotColor} />
                                <NavItem id="viewers" icon={<Users />} label="Audience" active={activeTab} onClick={setActiveTab} dot={navDot('viewers')} dotColor={dotColor} />
                                <NavItem id="loyalty" icon={<Heart />} label="Loyalty Log" active={activeTab} onClick={setActiveTab} dot={navDot('loyalty')} dotColor={dotColor} />
                                <NavItem id="tip_history" icon={<History />} label="Tip History" active={activeTab} onClick={setActiveTab} />
                                <NavItem id="giveaways" icon={<Gift />} label="Giveaways" active={activeTab} onClick={setActiveTab} dot={navDot('giveaways')} dotColor={dotColor} />
                                <NavItem id="redeems" icon={<Clapperboard />} label="Rewards Shop" active={activeTab} onClick={setActiveTab} dot={navDot('redeems')} dotColor={dotColor} />
                                <NavItem id="streamer_bot" icon={<Share2 />} label="Integrations" active={activeTab} onClick={setActiveTab} dot={navDot('streamer_bot')} dotColor={dotColor} />
                                <NavItem id="audio_engine" icon={<Volume2 />} label="Audio Engine" active={activeTab} onClick={setActiveTab} dot={navDot('audio_engine')} dotColor={dotColor} />
                                <NavItem id="obs" icon={<Monitor />} label="OBS Source" active={activeTab} onClick={setActiveTab} dot={navDot('obs')} dotColor={dotColor} />
                                <NavItem id="testing" icon={<Beaker />} label="Testing" active={activeTab} onClick={setActiveTab} dot={navDot('testing')} dotColor={dotColor} />
                                <NavItem id="super_chat_settings" icon={<Gem />} label="Super Chat" active={activeTab} onClick={() => setActiveTab('super_chat_settings')} dot={navDot('super_chat_settings')} dotColor={dotColor} />
                                <NavItem id="backup" icon={<Archive />} label="Backup" active={activeTab} onClick={setActiveTab} dot={navDot('backup')} dotColor={dotColor} />
                                <NavItem id="settings" icon={<Settings />} label="Settings" active={activeTab} onClick={() => setActiveTab('settings')} dot={navDot('settings')} dotColor={dotColor} />
                            </>
                        )}
                    </nav>
                </div>

                {/* Bottom: Mini feature status */}
                {!config?.is_cloud && (
                    <div className="p-4 border-t border-sidebar-accent bg-sidebar-accent/30 shrink-0 space-y-2">
                        {/* Service mini indicators */}
                        <div className="hidden md:flex flex-col gap-1.5 pb-1">
                            <div className="flex items-center gap-2 text-xs">
                                <div className={`h-2 w-2 rounded-full ${svc.bot ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                <span className="text-zinc-300">Bot: <span className="font-bold">{svc.bot ? 'Running' : 'Stopped'}</span></span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <div className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-blue-500' : status === 'reconnecting' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                                <span className="text-zinc-300">Logs: <span className="font-bold capitalize">{status || 'Disconnected'}</span></span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <div className={`h-2 w-2 rounded-full ${svc.streamer ? 'bg-cyan-500' : 'bg-zinc-600'}`} />
                                <span className="text-zinc-300">Streamer.bot: <span className="font-bold">{svcStatus?.workers?.streamerbot?.status || (svc.streamer ? 'Connected' : 'Disconnected')}</span></span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <div className={`h-2 w-2 rounded-full ${svc.youtube ? 'bg-red-500' : 'bg-zinc-600'}`} />
                                <span className="text-zinc-300">YouTube: <span className="font-bold">{svcStatus?.workers?.youtube_monitor?.status || (svc.youtube ? 'Connected' : 'Disconnected')}</span></span>
                            </div>
                        </div>
                        
                        {/* Mobile minimal view */}
                        <div className="flex md:hidden items-center justify-center">
                            <div className={`w-3 h-3 rounded-full shadow-sm ${svc.bot ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        </div>
                    </div>
                )}
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden bg-background">
                <header className="h-16 border-b flex items-center px-8 justify-between bg-white/5 backdrop-blur-sm shadow-sm z-10 border-white/5">
                    <h1 className="font-bold text-2xl capitalize text-zinc-100 tracking-tight">
                        {activeTab === 'loyalty' ? 'Loyalty Log' : activeTab.replace(/_/g, ' ')}
                    </h1>
                    <div className="flex items-center gap-4">
                        {/* Quick status badges */}
                        {svcStatus && (
                            <div className="hidden lg:flex items-center gap-2">
                                <StatusBadge on={svc.ai} icon={<Brain className="h-3 w-3" />} label="AI" color="purple" />
                                <StatusBadge on={svc.tts} icon={<Volume2 className="h-3 w-3" />} label="TTS" color="amber" />
                                <StatusBadge on={svc.youtube} icon={<Youtube className="h-3 w-3" />} label="YT" color="red" />
                                <StatusBadge on={svc.email} icon={<Mail className="h-3 w-3" />} label="Email" color="blue" />
                                <StatusBadge on={svc.streamer} icon={<Link2 className="h-3 w-3" />} label="SB" color="cyan" />
                            </div>
                        )}

                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-600 text-primary-foreground flex items-center justify-center font-bold text-sm shadow-lg shadow-primary/20">
                            PI
                        </div>
                    </div>
                </header>
                <div className="flex-1 overflow-auto p-8 relative">
                    <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
                    <div className="max-w-7xl mx-auto space-y-6 relative z-0">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    )
}

function StatusBadge({ on, icon, label, color }) {
    const colors = {
        purple: on ? 'bg-purple-500/15 border-purple-500/30 text-purple-300' : 'bg-zinc-800/40 border-zinc-700/30 text-zinc-600',
        amber: on ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-zinc-800/40 border-zinc-700/30 text-zinc-600',
        red: on ? 'bg-red-500/15 border-red-500/30 text-red-300' : 'bg-zinc-800/40 border-zinc-700/30 text-zinc-600',
        blue: on ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-zinc-800/40 border-zinc-700/30 text-zinc-600',
        cyan: on ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300' : 'bg-zinc-800/40 border-zinc-700/30 text-zinc-600',
    }
    return (
        <div className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold uppercase transition-all duration-300 ${colors[color]}`}>
            {icon}
            {label}
        </div>
    )
}

function NavItem({ id, icon, label, active, onClick, dot, dotColor }) {
    return (
        <button
            onClick={() => onClick(id)}
            className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                active === id
                    ? "bg-primary text-white shadow-lg shadow-primary/25"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
            )}
        >
            <div className={cn(
                "absolute left-0 top-0 h-full w-1 bg-white transition-all duration-300",
                active === id ? "opacity-20" : "opacity-0 group-hover:opacity-10"
            )} />

            <div className="relative z-10 flex items-center gap-3 flex-1">
                {React.cloneElement(icon, { className: "h-5 w-5 shrink-0" })}
                <span className="hidden md:inline flex-1">{label}</span>
            </div>

            {/* Status dot (only on md+) */}
            {dot && (
                <div className={`hidden md:block h-2 w-2 rounded-full shrink-0 ${dotColor[dot]} ${dot === 'green' ? 'shadow-sm shadow-emerald-500/50' : ''} transition-colors duration-300`} />
            )}
        </button>
    )
}
