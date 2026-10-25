import React, { useEffect, useState } from 'react'
import axios from 'axios'
import TickerOverlay from './TickerOverlay'

export default function CustomOverlay() {
    const [overlay, setOverlay] = useState(null)
    const [error, setError] = useState(null)

    useEffect(() => {
        document.body.style.backgroundColor = 'transparent'
        document.body.style.background = 'transparent'
        document.documentElement.style.backgroundColor = 'transparent'
        document.documentElement.style.background = 'transparent'

        const params = new URLSearchParams(window.location.search)
        const id = params.get('id')
        const API_URL = import.meta.env?.VITE_API_URL || "/api"

        if (!id) {
            // If no ID provided, try to fetch the first existing overlay
            axios.get(`${API_URL}/custom-overlays`)
                .then(res => {
                    if (res.data && res.data.length > 0) {
                        setOverlay(res.data[0])
                    } else {
                        setError("No overlay ID provided and no custom overlays found.")
                    }
                })
                .catch(err => setError(err.message))
            return
        }

        axios.get(`${API_URL}/custom-overlays/${id}`)
            .then(res => setOverlay(res.data))
            .catch(err => setError(err.message))
    }, [])

    if (error) return <div className="text-red-500 font-mono text-xl p-4 bg-zinc-950/80 rounded m-4">{error}</div>
    if (!overlay) return null

    const getWidgetUrl = (w) => {
        const type = w.type
        switch (type) {
            case 'chat': return `/?mode=chat`
            case 'sub_count': return `/?mode=sub_count`
            case 'transactions': return `/?mode=transactions`
            case 'top_viewers': return `/?mode=top_viewers`
            case 'superchat': return `/?mode=superchat`
            case 'ticker': {
                const qs = new URLSearchParams()
                if (w.tickerTitle) qs.set('title', w.tickerTitle)
                if (w.tickerSpeed) qs.set('speed', w.tickerSpeed)
                if (w.tickerColor) qs.set('color', w.tickerColor)
                if (w.customText) qs.set('text', w.customText)
                const qStr = qs.toString()
                return `/?mode=ticker${qStr ? '&' + qStr : ''}`
            }
            case 'hub': return `/?mode=hub`
            case 'goal': return `/overlay/goal`
            case 'qr_code': return `/?mode=qrcode`
            case 'rotating_hub': return `/?mode=rotating_hub`
            case 'boss': return `/?mode=boss`
            case 'giveaway_spin': return `/giveawayspin`
            case 'pokemon': return `/overlay/pokemon`
            default: return `/?mode=${type}`
        }
    }

    const res = overlay.resolution || { w: 1920, h: 1080 }

    return (
        <div style={{ position: 'relative', width: `${res.w}px`, height: `${res.h}px`, overflow: 'hidden', backgroundColor: 'transparent' }}>
            {overlay.widgets?.filter(w => w.visible !== false).map((w, index) => {
                const commonStyle = {
                    position: 'absolute',
                    left: `${w.x}px`,
                    top: `${w.y}px`,
                    width: `${w.width}px`,
                    height: `${w.height}px`,
                    transform: `scale(${w.scale || 1})`,
                    transformOrigin: 'top left',
                    opacity: w.opacity ?? 1,
                    clipPath: `inset(${w.cropTop || 0}px ${w.cropRight || 0}px ${w.cropBottom || 0}px ${w.cropLeft || 0}px)`,
                    border: 'none',
                    backgroundColor: w.hasBackground ? 'rgba(10, 10, 15, 0.85)' : 'transparent',
                    backdropFilter: w.hasBackground ? 'blur(10px)' : 'none',
                    borderRadius: w.hasBackground ? '16px' : '0px',
                    zIndex: index
                }

                if (w.type === 'ticker') {
                    return (
                        <div key={w.id} style={commonStyle}>
                            <TickerOverlay
                                customText={w.customText}
                                title={w.tickerTitle}
                                speed={w.tickerSpeed}
                                color={w.tickerColor}
                            />
                        </div>
                    )
                }

                if (w.type === 'custom_media') {
                    const isVideo = w.url?.match(/\.(mp4|webm)$/i)
                    if (isVideo) {
                        return <video key={w.id} src={w.url} autoPlay loop muted style={{ ...commonStyle, objectFit: 'contain' }} />
                    } else if (w.url?.startsWith('data:image') || w.url?.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
                        return <img key={w.id} src={w.url} style={{ ...commonStyle, objectFit: 'contain' }} />
                    } else {
                        return <iframe key={w.id} src={w.url || 'about:blank'} style={commonStyle} allowTransparency="true" title={w.type} />
                    }
                }

                return (
                    <iframe
                        key={w.id}
                        src={getWidgetUrl(w)}
                        style={commonStyle}
                        allowTransparency="true"
                        title={w.type}
                    />
                )
            })}
        </div>
    )
}
