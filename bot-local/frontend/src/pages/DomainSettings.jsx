import React, { useState } from 'react'
import axios from 'axios'
import { Globe, Save, Copy, Server, Cloud, ExternalLink, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from '@/components/ui'

const API_URL = import.meta.env.VITE_API_URL || "/api"

export default function DomainSettings({ config, onSave }) {
    const [localConfig, setLocalConfig] = useState(config || {})
    const [saving, setSaving] = useState(false)
    const [copied, setCopied] = useState(false)

    // Sync when config prop updates
    React.useEffect(() => {
        if (config) {
            setLocalConfig(config)
        }
    }, [config])

    const updateNested = (path, value) => {
        const parts = path.split('.')
        const newConfig = { ...localConfig }
        let current = newConfig
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {}
            current = current[parts[i]]
        }
        current[parts[parts.length - 1]] = value
        setLocalConfig(newConfig)
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await onSave(localConfig)
            // also trigger a backend save if needed, but onSave should handle it
        } finally {
            setSaving(false)
        }
    }

    const domain = localConfig.public_url || "https://tip.pbherotip.qzz.io/tip"
    const parsedDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')

    const nginxConfig = `server {
    listen 80;
    server_name ${parsedDomain};

    # Force HTTPS (Optional, requires SSL cert)
    # return 301 https://$host$request_uri;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400; # For WebSockets
    }
}`

    const handleCopy = () => {
        navigator.clipboard.writeText(nginxConfig)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="space-y-6 pb-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
                <div>
                    <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Domain Integration</h2>
                    <p className="text-sm text-zinc-400">Configure your custom domain for Oracle Cloud.</p>
                </div>
                <Button onClick={handleSave} disabled={saving} className="bg-zinc-100 text-zinc-900 hover:bg-white text-xs font-bold h-9">
                    <Save className="mr-2 h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
            </div>

            <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                <CardHeader className="pb-3 border-b border-zinc-800">
                    <CardTitle className="text-zinc-100 flex items-center gap-2 text-sm font-semibold">
                        <Globe className="h-4 w-4 text-blue-500" /> Public URL Settings
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-500 uppercase">Bot Public URL</label>
                        <Input
                            value={localConfig.public_url || ''}
                            onChange={(e) => updateNested('public_url', e.target.value)}
                            placeholder="https://your-domain.com"
                            className="bg-zinc-950 border-zinc-700 text-sm text-zinc-100 h-9"
                        />
                        <p className="text-[10px] text-zinc-500">
                            Set this to your custom domain so that Webhooks, YouTube, and the Tip Page can correctly route to your bot. 
                            Include https:// and do not include trailing slashes.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                <CardHeader className="pb-3 border-b border-zinc-800">
                    <CardTitle className="text-zinc-100 flex items-center justify-between text-sm font-semibold">
                        <div className="flex items-center gap-2">
                            <Server className="h-4 w-4 text-emerald-500" /> NGINX Reverse Proxy Config
                        </div>
                        <Button size="sm" onClick={handleCopy} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 h-8 text-xs">
                            {copied ? <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                            {copied ? 'Copied!' : 'Copy Config'}
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                    <p className="text-xs text-zinc-400">
                        If you are hosting this on Oracle Cloud, you can use NGINX to route traffic from ports 80/443 to the bot running on port 8000. Paste this configuration into <code className="text-emerald-400 bg-zinc-950 px-1 py-0.5 rounded">/etc/nginx/sites-available/pibot</code> and symlink it to <code className="text-emerald-400 bg-zinc-950 px-1 py-0.5 rounded">sites-enabled</code>.
                    </p>
                    
                    <div className="relative">
                        <pre className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg overflow-x-auto text-xs font-mono text-zinc-300">
                            {nginxConfig}
                        </pre>
                    </div>

                    <div className="bg-blue-950/30 border border-blue-900/50 p-3 rounded-lg flex items-start gap-3 mt-4">
                        <Cloud className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-blue-200">
                            <strong className="block text-blue-300 mb-1">Using Cloudflare Tunnels Instead?</strong>
                            If your Oracle Cloud IP is blocked or you don't want to expose ports, use Cloudflare Tunnels. 
                            Just go to your Cloudflare Dashboard &rarr; Zero Trust &rarr; Networks &rarr; Tunnels, and route your domain to <code className="text-blue-300 font-bold bg-blue-950 px-1 rounded">http://localhost:8000</code>. No NGINX needed!
                        </div>
                    </div>
                </CardContent>
            </Card>

        </div>
    )
}
