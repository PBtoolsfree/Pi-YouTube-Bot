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
            case 'chat': return `http://${host}/?mode=chat`
            case 'sub_count': return `http://${host}/?mode=sub_count`
            case 'transactions': return `http://${host}/?mode=transactions`
            case 'top_viewers': return `http://${host}/?mode=top_viewers`
            case 'hub': return `http://${host}/?mode=hub`
            case 'goal': return `http://${host}/overlay/goal`
            default: return `http://${host}/?mode=${type}`
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
                        border: 'none',
                        backgroundColor: 'transparent'
                    }}
                    title={w.type}
                />
            ))}
        </div>
    )
}
