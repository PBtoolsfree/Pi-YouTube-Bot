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
            case 'hub': return `/?mode=hub`
            case 'goal': return `/overlay/goal`
            default: return `/?mode=${type}`
        }
    }

    return (
        <div style={{ position: 'relative', width: '1920px', height: '1080px', overflow: 'hidden' }}>
            {overlay.widgets?.map(w => (
                <iframe
                    key={w.id}
                    src={getWidgetUrl(w.type)}
                    style={{
                        position: 'absolute',
                        left: `${w.x}px`,
                        top: `${w.y}px`,
                        width: `${w.width}px`,
                        height: `${w.height}px`,
                        transform: `scale(${w.scale || 1})`,
                        transformOrigin: 'top left',
                        opacity: w.opacity ?? 1,
                        border: 'none',
                        backgroundColor: 'transparent'
                    }}
                    title={w.type}
                />
            ))}
        </div>
    )
}
