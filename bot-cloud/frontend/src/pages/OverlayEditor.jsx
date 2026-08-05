import React, { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { Save, Plus, Trash2, ArrowLeft, MousePointer2, Layers } from 'lucide-react'
import { Button, Input } from '@/components/ui'

const RESOLUTIONS = [
    { label: 'Standard 1080p (1920x1080)', w: 1920, h: 1080 },
    { label: 'Vertical / Shorts (1080x1920)', w: 1080, h: 1920 },
    { label: 'Standard 720p (1280x720)', w: 1280, h: 720 },
]

const WIDGET_TYPES = [
    { type: 'chat', label: 'Chat Overlay', defaultW: 450, defaultH: 700 },
    { type: 'sub_count', label: 'Sub Count', defaultW: 400, defaultH: 200 },
    { type: 'transactions', label: 'Recent Donations', defaultW: 550, defaultH: 400 },
    { type: 'top_viewers', label: 'Top Viewers', defaultW: 550, defaultH: 400 },
    { type: 'superchat', label: 'Superchat Overlay', defaultW: 500, defaultH: 200 },
    { type: 'ticker', label: 'News Ticker (Gaming)', defaultW: 1920, defaultH: 60 },
    { type: 'hub', label: 'Stream Hub', defaultW: 1920, defaultH: 108 },
    { type: 'goal', label: 'Goal Widget', defaultW: 700, defaultH: 150 },
    { type: 'qr_code', label: 'UPI QR Code', defaultW: 300, defaultH: 400 },
    { type: 'rotating_hub', label: 'Rotating Hub', defaultW: 400, defaultH: 400 },
    { type: 'boss', label: 'Boss Fight', defaultW: 500, defaultH: 600 },
    { type: 'giveaway_spin', label: 'Giveaway Spin', defaultW: 800, defaultH: 800 },
]

export default function OverlayEditor() {
    const [overlayId, setOverlayId] = useState(null)
    const [name, setName] = useState('My Custom Overlay')
    const [resolution, setResolution] = useState(RESOLUTIONS[0])
    const [widgets, setWidgets] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [scale, setScale] = useState(1)
    const [selectedWidgetId, setSelectedWidgetId] = useState(null)
    
    const API_URL = import.meta.env?.VITE_API_URL || "/api"
    const canvasRef = useRef(null)

    // Window resize to fit canvas
    useEffect(() => {
        const handleResize = () => {
            const availableWidth = window.innerWidth - 320 - 80 // 320 for sidebar, 80 padding
            const availableHeight = window.innerHeight - 64 - 80
            
            const scaleX = availableWidth / resolution.w
            const scaleY = availableHeight / resolution.h
            
            setScale(Math.min(scaleX, scaleY, 1)) // Don't scale up past 1x
        }
        window.addEventListener('resize', handleResize)
        handleResize()
        return () => window.removeEventListener('resize', handleResize)
    }, [resolution])

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const id = params.get('id')
        if (id) {
            setOverlayId(id)
            fetchOverlay(id)
        } else {
            setLoading(false)
        }
    }, [])

    const fetchOverlay = async (id) => {
        try {
            const res = await axios.get(`${API_URL}/custom-overlays/${id}`)
            setName(res.data.name || 'Untitled')
            if (res.data.resolution) setResolution(res.data.resolution)
            setWidgets(res.data.widgets || [])
            setLoading(false)
        } catch (e) {
            setError(e.message)
            setLoading(false)
        }
    }

    const handleSave = async () => {
        try {
            const payload = { name, resolution, widgets }
            if (overlayId) {
                await axios.put(`${API_URL}/custom-overlays/${overlayId}`, payload)
                alert("Overlay saved successfully!")
            } else {
                const res = await axios.post(`${API_URL}/custom-overlays`, { name })
                const newId = res.data.id
                await axios.put(`${API_URL}/custom-overlays/${newId}`, payload)
                window.location.href = `/overlay-editor?id=${newId}`
            }
        } catch (e) {
            alert("Error saving: " + e.message)
        }
    }

    const addWidget = (wt) => {
        const newWidget = {
            id: `widget_${Date.now()}_${Math.floor(Math.random()*1000)}`,
            type: wt.type,
            x: 100,
            y: 100,
            width: wt.defaultW,
            height: wt.defaultH,
            scale: 1,
            opacity: 1
        }
        setWidgets([...widgets, newWidget])
        setSelectedWidgetId(newWidget.id)
    }

    const removeWidget = (id) => {
        setWidgets(widgets.filter(w => w.id !== id))
        if (selectedWidgetId === id) setSelectedWidgetId(null)
    }

    const updateWidget = (id, newProps) => {
        setWidgets(widgets.map(w => w.id === id ? { ...w, ...newProps } : w))
    }

    // Layer Ordering Functions
    const moveWidgetUp = (e, index) => {
        e.stopPropagation()
        if (index >= widgets.length - 1) return
        const newWidgets = [...widgets]
        const temp = newWidgets[index]
        newWidgets[index] = newWidgets[index + 1]
        newWidgets[index + 1] = temp
        setWidgets(newWidgets)
    }

    const moveWidgetDown = (e, index) => {
        e.stopPropagation()
        if (index <= 0) return
        const newWidgets = [...widgets]
        const temp = newWidgets[index]
        newWidgets[index] = newWidgets[index - 1]
        newWidgets[index - 1] = temp
        setWidgets(newWidgets)
    }

    const goBack = () => {
        window.location.href = '/?mode=obs'
    }

    if (loading) return <div className="flex items-center justify-center h-screen bg-zinc-950 text-white">Loading...</div>
    if (error) return <div className="flex items-center justify-center h-screen bg-zinc-950 text-red-500">{error}</div>

    const getWidgetPreviewUrl = (type) => {
        switch (type) {
            case 'chat': return `/?mode=chat`
            case 'sub_count': return `/?mode=sub_count`
            case 'transactions': return `/?mode=transactions`
            case 'top_viewers': return `/?mode=top_viewers`
            case 'superchat': return `/?mode=superchat`
            case 'ticker': return `/?mode=ticker`
            case 'hub': return `/?mode=hub`
            case 'goal': return `/overlay/goal`
            case 'qr_code': return `/?mode=qrcode`
            case 'rotating_hub': return `/?mode=rotating_hub`
            case 'boss': return `/?mode=boss`
            case 'giveaway_spin': return `/giveawayspin`
            default: return `/?mode=${type}`
        }
    }

    const selectedWidget = widgets.find(w => w.id === selectedWidgetId)

    return (
        <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
            {/* Top Bar */}
            <div className="h-16 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-6 shrink-0 z-20">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={goBack} className="text-zinc-400 hover:text-white">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <div className="h-6 w-px bg-zinc-700"></div>
                    <Input 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        className="bg-zinc-950 border-zinc-800 font-bold w-64 text-sm"
                        placeholder="Overlay Name"
                    />
                    <select 
                        value={JSON.stringify(resolution)} 
                        onChange={e => setResolution(JSON.parse(e.target.value))}
                        className="bg-zinc-950 border border-zinc-800 text-sm rounded-md px-3 py-2 text-zinc-300 outline-none focus:border-emerald-500"
                    >
                        {RESOLUTIONS.map(r => (
                            <option key={r.label} value={JSON.stringify(r)}>{r.label}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-3">
                    <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-900/50">
                        <Save className="w-4 h-4 mr-2" /> Save Overlay
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <div className="w-[320px] bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 z-20 shadow-xl overflow-hidden">
                    
                    {/* Add Widgets */}
                    <div className="p-4 border-b border-zinc-800 shrink-0">
                        <h3 className="font-semibold text-sm mb-1 flex items-center gap-2"><Plus className="w-4 h-4 text-emerald-500"/> Add Widgets</h3>
                    </div>
                    <div className="p-3 grid grid-cols-2 gap-2 overflow-y-auto shrink-0 max-h-[30vh] custom-scrollbar">
                        {WIDGET_TYPES.map(wt => (
                            <div 
                                key={wt.type}
                                onClick={() => addWidget(wt)}
                                className="p-2 bg-zinc-950 border border-zinc-800 rounded-lg hover:border-emerald-500/50 hover:bg-emerald-500/10 cursor-pointer transition-colors flex flex-col justify-center items-center gap-1 text-center"
                            >
                                <div className="text-xs font-medium">{wt.label}</div>
                                <div className="text-[9px] text-zinc-500">{wt.defaultW}x{wt.defaultH}</div>
                            </div>
                        ))}
                    </div>

                    {/* Layers Panel */}
                    <div className="border-t border-b border-zinc-800 bg-zinc-900/50 flex flex-col min-h-[150px] flex-1">
                        <div className="p-3 pb-2 flex justify-between items-center shrink-0">
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                <Layers className="w-4 h-4 text-purple-400" /> Layers
                            </h3>
                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Top to Bottom</span>
                        </div>
                        <div className="p-3 pt-0 space-y-1.5 overflow-y-auto custom-scrollbar flex-1">
                            {/* Render layers in reverse so visual top is array end */}
                            {[...widgets].reverse().map((w, reverseIndex) => {
                                const i = widgets.length - 1 - reverseIndex
                                const isSel = selectedWidgetId === w.id
                                return (
                                    <div 
                                        key={w.id}
                                        onClick={() => setSelectedWidgetId(w.id)}
                                        className={`flex items-center justify-between p-2 rounded-md text-xs cursor-pointer border transition-all ${isSel ? 'border-purple-500/50 bg-purple-500/10 text-purple-300 shadow-inner' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700 text-zinc-400'}`}
                                    >
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 rounded">{i}</span>
                                            <span className="truncate font-medium">{w.type}</span>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            <button 
                                                onClick={(e) => moveWidgetUp(e, i)} 
                                                disabled={i === widgets.length - 1} 
                                                className="p-1 hover:bg-zinc-700 rounded text-zinc-300 disabled:opacity-20 transition-colors"
                                                title="Bring Forward"
                                            >▲</button>
                                            <button 
                                                onClick={(e) => moveWidgetDown(e, i)} 
                                                disabled={i === 0} 
                                                className="p-1 hover:bg-zinc-700 rounded text-zinc-300 disabled:opacity-20 transition-colors"
                                                title="Send Backward"
                                            >▼</button>
                                            <div className="w-px h-4 bg-zinc-700 mx-0.5 my-auto"></div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); removeWidget(w.id) }} 
                                                className="p-1 hover:bg-rose-500/20 text-rose-400 rounded transition-colors"
                                            >✕</button>
                                        </div>
                                    </div>
                                )
                            })}
                            {widgets.length === 0 && (
                                <div className="text-xs text-zinc-500 text-center p-4 italic border border-dashed border-zinc-800 rounded-lg">
                                    No widgets added to canvas
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Properties Panel */}
                    <div className="border-t border-zinc-800 bg-zinc-950 shrink-0 h-[260px] overflow-y-auto">
                        {selectedWidget ? (
                            <div className="p-4">
                                <h3 className="font-semibold text-sm mb-4 text-emerald-400 flex items-center gap-2">
                                    <MousePointer2 className="w-4 h-4" /> Properties ({selectedWidget.type})
                                </h3>
                                
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div>
                                        <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">X Position</label>
                                        <Input 
                                            type="number" 
                                            value={selectedWidget.x} 
                                            onChange={e => updateWidget(selectedWidget.id, { x: parseInt(e.target.value) || 0 })}
                                            className="h-8 bg-zinc-900 border-zinc-800 text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Y Position</label>
                                        <Input 
                                            type="number" 
                                            value={selectedWidget.y} 
                                            onChange={e => updateWidget(selectedWidget.id, { y: parseInt(e.target.value) || 0 })}
                                            className="h-8 bg-zinc-900 border-zinc-800 text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Width (Resize)</label>
                                        <Input 
                                            type="number" 
                                            value={selectedWidget.width} 
                                            onChange={e => updateWidget(selectedWidget.id, { width: parseInt(e.target.value) || 100 })}
                                            className="h-8 bg-zinc-900 border-zinc-800 text-xs text-emerald-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Height (Resize)</label>
                                        <Input 
                                            type="number" 
                                            value={selectedWidget.height} 
                                            onChange={e => updateWidget(selectedWidget.id, { height: parseInt(e.target.value) || 100 })}
                                            className="h-8 bg-zinc-900 border-zinc-800 text-xs text-emerald-400"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Scale/Zoom (%)</label>
                                        <div className="flex gap-2">
                                            <input 
                                                type="range" 
                                                min="10" 
                                                max="300" 
                                                value={Math.round((selectedWidget.scale || 1) * 100)} 
                                                onChange={e => updateWidget(selectedWidget.id, { scale: parseInt(e.target.value) / 100 })}
                                                className="flex-1 accent-emerald-500"
                                            />
                                            <span className="text-xs font-mono w-10 text-right">{Math.round((selectedWidget.scale || 1) * 100)}%</span>
                                        </div>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Opacity (%)</label>
                                        <div className="flex gap-2">
                                            <input 
                                                type="range" 
                                                min="0" 
                                                max="100" 
                                                value={Math.round((selectedWidget.opacity ?? 1) * 100)} 
                                                onChange={e => updateWidget(selectedWidget.id, { opacity: parseInt(e.target.value) / 100 })}
                                                className="flex-1 accent-emerald-500"
                                            />
                                            <span className="text-xs font-mono w-10 text-right">{Math.round((selectedWidget.opacity ?? 1) * 100)}%</span>
                                        </div>
                                    </div>
                                    <div className="col-span-2 flex items-center justify-between mt-2 p-2 bg-zinc-900 rounded-lg border border-zinc-800">
                                        <label className="text-xs text-zinc-300 font-medium cursor-pointer flex-1" htmlFor="bgToggle">
                                            Enable Dark Background
                                        </label>
                                        <input 
                                            id="bgToggle"
                                            type="checkbox" 
                                            checked={!!selectedWidget.hasBackground} 
                                            onChange={e => updateWidget(selectedWidget.id, { hasBackground: e.target.checked })}
                                            className="w-4 h-4 accent-emerald-500 rounded bg-zinc-800 border-zinc-700 cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-zinc-600 text-xs font-medium uppercase tracking-widest">
                                Select a widget to edit
                            </div>
                        )}
                    </div>
                </div>

                {/* Canvas Area */}
                <div 
                    className="flex-1 bg-zinc-950 relative overflow-auto flex items-center justify-center p-10 custom-scrollbar z-10"
                    onClick={() => setSelectedWidgetId(null)}
                >
                    {/* SCALED WRAPPER to prevent massive scrollbars and keep centered */}
                    <div 
                        style={{
                            width: resolution.w * scale,
                            height: resolution.h * scale,
                        }}
                        className="relative shrink-0"
                    >
                        {/* The actual Canvas */}
                        <div 
                            ref={canvasRef}
                            style={{
                                width: resolution.w,
                                height: resolution.h,
                                transform: `scale(${scale})`,
                                transformOrigin: 'top left',
                                backgroundColor: '#0a0a0a', 
                                backgroundImage: 'linear-gradient(45deg, #18181b 25%, transparent 25%, transparent 75%, #18181b 75%, #18181b), linear-gradient(45deg, #18181b 25%, transparent 25%, transparent 75%, #18181b 75%, #18181b)',
                                backgroundSize: '20px 20px',
                                backgroundPosition: '0 0, 10px 10px',
                                boxShadow: '0 0 0 4px #10b981, 0 25px 50px -12px rgba(0,0,0,0.5)',
                            }}
                            className="absolute top-0 left-0 overflow-hidden"
                            onClick={e => e.stopPropagation()} // Prevent unselecting
                        >
                            {/* Title Safe Area Guide */}
                            <div className="absolute top-[5%] bottom-[5%] left-[5%] right-[5%] pointer-events-none z-0 border border-dashed border-zinc-500/30">
                                <span className="absolute bottom-1 right-2 text-zinc-500/50 text-[12px] font-bold tracking-widest">SAFE ZONE (5%)</span>
                            </div>
                            
                            {/* Resolution watermark */}
                            <div className="absolute top-6 left-6 pointer-events-none z-0 text-zinc-600/30 font-bold text-5xl select-none tracking-tighter">
                                {resolution.w} × {resolution.h}
                            </div>

                            {/* Widgets rendered in array order (natural z-index) */}
                            {widgets.map((w, index) => (
                                <DraggableWidget 
                                    key={w.id}
                                    widget={w}
                                    isSelected={selectedWidgetId === w.id}
                                    onSelect={() => setSelectedWidgetId(w.id)}
                                    onUpdate={(newProps) => updateWidget(w.id, newProps)}
                                    previewUrl={getWidgetPreviewUrl(w.type)}
                                    scale={scale}
                                    baseZIndex={index} // Pass the array index as a base z-index so selected items pop up slightly
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function DraggableWidget({ widget, isSelected, onSelect, onUpdate, previewUrl, scale, baseZIndex }) {
    const [isDragging, setIsDragging] = useState(false)
    const [isResizing, setIsResizing] = useState(false)
    
    // For drag/resize delta calculations
    const startPos = useRef({ x: 0, y: 0, w: 0, h: 0, mx: 0, my: 0 })

    const handleDragStart = (e) => {
        e.stopPropagation()
        onSelect()
        setIsDragging(true)
        startPos.current = {
            x: widget.x,
            y: widget.y,
            mx: e.clientX,
            my: e.clientY
        }
    }

    const handleResizeStart = (e) => {
        e.stopPropagation()
        onSelect()
        setIsResizing(true)
        startPos.current = {
            w: widget.width,
            h: widget.height,
            mx: e.clientX,
            my: e.clientY
        }
    }

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDragging) {
                const dx = (e.clientX - startPos.current.mx) / scale
                const dy = (e.clientY - startPos.current.my) / scale
                onUpdate({
                    x: Math.round(startPos.current.x + dx),
                    y: Math.round(startPos.current.y + dy)
                })
            } else if (isResizing) {
                const dx = (e.clientX - startPos.current.mx) / scale
                const dy = (e.clientY - startPos.current.my) / scale
                
                onUpdate({
                    width: Math.max(100, Math.round(startPos.current.w + dx)),
                    height: Math.max(100, Math.round(startPos.current.h + dy))
                })
            }
        }

        const handleMouseUp = () => {
            setIsDragging(false)
            setIsResizing(false)
        }

        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging, isResizing, scale, onUpdate])

    // If selected, boost its z-index slightly above its natural layer position so resizing doesn't get occluded by the very next layer
    const computedZIndex = baseZIndex * 10 + (isSelected ? 5 : 0)

    return (
        <div 
            style={{
                position: 'absolute',
                left: widget.x,
                top: widget.y,
                width: widget.width,
                height: widget.height,
                transform: `scale(${widget.scale || 1})`,
                transformOrigin: 'top left',
                opacity: widget.opacity ?? 1,
                border: isSelected ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.2)', // Purple border for selection
                backgroundColor: isSelected ? 'rgba(168, 85, 247, 0.1)' : (widget.hasBackground ? 'rgba(10, 10, 15, 0.85)' : 'transparent'),
                backdropFilter: widget.hasBackground ? 'blur(10px)' : 'none',
                borderRadius: widget.hasBackground ? '16px' : '0px',
                cursor: isDragging ? 'grabbing' : 'grab',
                zIndex: computedZIndex
            }}
            onMouseDown={handleDragStart}
            className="group hover:!border-purple-400/50 transition-colors"
        >
            {/* The iframe needs pointer-events: none so it doesn't steal mouse events during drag */}
            <iframe 
                src={previewUrl}
                style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                title="Preview"
            />
            
            {/* Label overlay */}
            {(isSelected || true) && (
                <div 
                    className="absolute top-0 left-0 bg-zinc-900/90 text-xs font-mono text-zinc-300 px-2 py-1 select-none pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap overflow-hidden"
                    style={{ transform: `scale(${1 / (widget.scale || 1)})`, transformOrigin: 'top left' }}
                >
                    [{baseZIndex}] {widget.type}
                </div>
            )}

            {/* Resize handle */}
            {isSelected && (
                <div 
                    className="absolute bottom-0 right-0 w-6 h-6 bg-purple-500 cursor-se-resize rounded-tl flex items-center justify-center text-white shadow-lg"
                    style={{ 
                        right: -2, 
                        bottom: -2,
                        transform: `scale(${1 / (widget.scale || 1)})`,
                        transformOrigin: 'bottom right'
                    }}
                    onMouseDown={handleResizeStart}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v6h-6M3 9V3h6M21 3l-7 7M3 21l7-7"/></svg>
                </div>
            )}
        </div>
    )
}
