import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function CustomOverlay() {
    const [overlay, setOverlay] = useState(null)
    const [error, setError] = useState(null)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const id = params.get('id')
        if (!id) {
            setError("No overlay ID provided")
            return
        }

        // Fetch using explicit API_URL if defined, else fallback to /api
        const API_URL = import.meta.env?.VITE_API_URL || "/api"
        axios.get(`${API_URL}/custom-overlays/${id}`)
            .then(res => setOverlay(res.data))
            .catch(err => setError(err.message))
    }, [])

    if (error) return <div className="text-red-500 font-mono text-xl p-4">{error}</div>
    if (!overlay) return null

    const host = window.location.host

    const getWidgetUrl = (type) => {
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
            case 'pokemon': return `/overlay/pokemon`
            default: return `/?mode=${type}`
        }
    }

    const res = overlay.resolution || { w: 1920, h: 1080 }

    return (
        <div style={{ position: 'relative', width: `${res.w}px`, height: `${res.h}px`, overflow: 'hidden' }}>
            {overlay.widgets?.map((w, index) => {
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

                if (w.type === 'custom_media') {
                    const isVideo = w.url?.match(/\.(mp4|webm)$/i)
                    if (isVideo) {
                        return <video key={w.id} src={w.url} autoPlay loop muted style={{ ...commonStyle, objectFit: 'contain' }} />
                    } else if (w.url?.startsWith('data:image') || w.url?.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
                        return <img key={w.id} src={w.url} style={{ ...commonStyle, objectFit: 'contain' }} />
                    } else {
                        return <iframe key={w.id} src={w.url || 'about:blank'} style={commonStyle} title={w.type} />
                    }
                }

                return (
                    <iframe
                        key={w.id}
                        src={getWidgetUrl(w.type)}
                        style={commonStyle}
                        title={w.type}
                    />
                )
            })}
        </div>
    )
}
