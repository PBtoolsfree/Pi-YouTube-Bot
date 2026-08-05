import React, { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { Save, Plus, Trash2, ArrowLeft, MousePointer2 } from 'lucide-react'
import { Button, Input } from '@/components/ui'

const WIDGET_TYPES = [
    { type: 'chat', label: 'Chat Overlay', defaultW: 400, defaultH: 600 },
    { type: 'sub_count', label: 'Sub Count', defaultW: 300, defaultH: 150 },
    { type: 'transactions', label: 'Recent Donations', defaultW: 400, defaultH: 300 },
    { type: 'top_viewers', label: 'Top Viewers', defaultW: 350, defaultH: 300 },
    { type: 'hub', label: 'Stream Hub', defaultW: 1920, defaultH: 108 },
    { type: 'goal', label: 'Goal Widget', defaultW: 600, defaultH: 100 },
]

export default function OverlayEditor() {
    const [overlayId, setOverlayId] = useState(null)
    const [name, setName] = useState('My Custom Overlay')
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
            if (canvasRef.current) {
                const parent = canvasRef.current.parentElement
                const availableWidth = window.innerWidth - 300 - 40 // 40 for padding
                const availableHeight = window.innerHeight - 64 - 40
                
                const scaleX = availableWidth / 1920
                const scaleY = availableHeight / 1080
                
                setScale(Math.min(scaleX, scaleY, 1)) // Don't scale up past 1x
            }
        }
        window.addEventListener('resize', handleResize)
        handleResize()
        return () => window.removeEventListener('resize', handleResize)
    }, [])

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
            setWidgets(res.data.widgets || [])
            setLoading(false)
        } catch (e) {
            setError(e.message)
            setLoading(false)
        }
    }

    const handleSave = async () => {
        try {
            if (overlayId) {
                await axios.put(`${API_URL}/custom-overlays/${overlayId}`, { name, widgets })
                alert("Overlay saved successfully!")
            } else {
                const res = await axios.post(`${API_URL}/custom-overlays`, { name })
                const newId = res.data.id
                await axios.put(`${API_URL}/custom-overlays/${newId}`, { name, widgets })
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
            case 'hub': return `/?mode=hub`
            case 'goal': return `/overlay/goal`
            default: return `/?mode=${type}`
        }
    }

    const selectedWidget = widgets.find(w => w.id === selectedWidgetId)

    return (
        <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
            {/* Top Bar */}
            <div className="h-16 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-6 shrink-0 z-10">
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
                </div>
                <div className="flex items-center gap-3">
                    <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
                        <Save className="w-4 h-4 mr-2" /> Save Overlay
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <div className="w-[300px] bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 z-10">
                    <div className="p-4 border-b border-zinc-800">
                        <h3 className="font-semibold text-sm mb-1">Add Widgets</h3>
                        <p className="text-xs text-zinc-400">Click to add a widget to the canvas.</p>
                    </div>
                    <div className="p-4 space-y-2 overflow-y-auto flex-1">
                        {WIDGET_TYPES.map(wt => (
                            <div 
                                key={wt.type}
                                onClick={() => addWidget(wt)}
                                className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg hover:border-emerald-500/50 hover:bg-emerald-500/10 cursor-pointer transition-colors flex items-center gap-3"
                            >
                                <Plus className="w-4 h-4 text-emerald-500" />
                                <div>
                                    <div className="text-sm font-medium">{wt.label}</div>
                                    <div className="text-[10px] text-zinc-500">{wt.defaultW}x{wt.defaultH}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Properties Panel */}
                    {selectedWidget && (
                        <div className="p-4 border-t border-zinc-800 bg-zinc-950 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.5)]">
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
                                    <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Base Width</label>
                                    <Input 
                                        type="number" 
                                        value={selectedWidget.width} 
                                        onChange={e => updateWidget(selectedWidget.id, { width: parseInt(e.target.value) || 100 })}
                                        className="h-8 bg-zinc-900 border-zinc-800 text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Base Height</label>
                                    <Input 
                                        type="number" 
                                        value={selectedWidget.height} 
                                        onChange={e => updateWidget(selectedWidget.id, { height: parseInt(e.target.value) || 100 })}
                                        className="h-8 bg-zinc-900 border-zinc-800 text-xs"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Scale (%)</label>
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
                            </div>

                            <Button variant="destructive" size="sm" className="w-full" onClick={() => removeWidget(selectedWidget.id)}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete Widget
                            </Button>
                        </div>
                    )}
                </div>

                {/* Canvas Area */}
                <div 
                    className="flex-1 bg-zinc-950 relative overflow-auto flex items-center justify-center p-5 custom-scrollbar"
                    onClick={() => setSelectedWidgetId(null)}
                >
                    {/* The 1920x1080 container */}
                    <div 
                        ref={canvasRef}
                        style={{
                            width: 1920,
                            height: 1080,
                            transform: `scale(${scale})`,
                            transformOrigin: 'center center',
                            backgroundColor: '#0a0a0a', // Darker background to contrast with border
                            backgroundImage: 'linear-gradient(45deg, #18181b 25%, transparent 25%, transparent 75%, #18181b 75%, #18181b), linear-gradient(45deg, #18181b 25%, transparent 25%, transparent 75%, #18181b 75%, #18181b)',
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0, 10px 10px',
                            boxShadow: '0 0 0 4px #000, 0 25px 50px -12px rgba(0,0,0,0.5)',
                        }}
                        className="relative overflow-hidden shrink-0 border border-zinc-700"
                        onClick={e => e.stopPropagation()} // Prevent unselecting
                    >
                        {/* Title Safe Area Guide */}
                        <div className="absolute inset-0 pointer-events-none z-0 border-[4px] border-emerald-500/10"></div>
                        <div className="absolute top-[5%] bottom-[5%] left-[5%] right-[5%] pointer-events-none z-0 border border-dashed border-zinc-500/30">
                            <span className="absolute bottom-1 right-2 text-zinc-500/50 text-[10px] font-mono">SAFE ZONE (5%)</span>
                        </div>
                        
                        {/* 1920x1080 watermark */}
                        <div className="absolute top-4 left-4 pointer-events-none z-0 text-zinc-600/30 font-bold text-4xl select-none">
                            1920 × 1080
                        </div>

                        {widgets.map(w => (
                            <DraggableWidget 
                                key={w.id}
                                widget={w}
                                isSelected={selectedWidgetId === w.id}
                                onSelect={() => setSelectedWidgetId(w.id)}
                                onUpdate={(newProps) => updateWidget(w.id, newProps)}
                                previewUrl={getWidgetPreviewUrl(w.type)}
                                scale={scale}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

function DraggableWidget({ widget, isSelected, onSelect, onUpdate, previewUrl, scale }) {
    const [isDragging, setIsDragging] = useState(false)
    const [isResizing, setIsResizing] = useState(false)
    
    // For drag/resize delta calculations
    const startPos = useRef({ x: 0, y: 0, w: 0, scale: 1, mx: 0, my: 0 })

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
            scale: widget.scale || 1,
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
                
                // Calculate new scale based on drag distance
                const originalDisplayWidth = startPos.current.w * startPos.current.scale
                const newDisplayWidth = Math.max(50, originalDisplayWidth + dx)
                const newScale = newDisplayWidth / startPos.current.w
                
                onUpdate({
                    scale: newScale
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
                border: isSelected ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.2)',
                backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0,0,0,0.5)',
                cursor: isDragging ? 'grabbing' : 'grab',
                zIndex: isSelected ? 10 : 1
            }}
            onMouseDown={handleDragStart}
            className="group"
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
                    {widget.type} [{widget.width}x{widget.height}] {widget.scale && widget.scale !== 1 ? `x${widget.scale.toFixed(2)}` : ''}
                </div>
            )}

            {/* Resize handle */}
            {isSelected && (
                <div 
                    className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 cursor-se-resize rounded-tl flex items-center justify-center text-white"
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
