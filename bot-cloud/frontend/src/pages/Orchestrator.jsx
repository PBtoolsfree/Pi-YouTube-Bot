import React, { useState } from 'react'
import axios from 'axios'
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Zap, Check, AlertCircle, X } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Switch, Textarea } from '@/components/ui'
import { PageStatusBar } from '@/components/ServiceStatus'

const API_URL = "/api"

export default function Orchestrator({ config, onSave }) {
    const [localConfig, setLocalConfig] = useState(config?.ai_topology || { providers: [] })
    const [testResult, setTestResult] = useState(null)
    const [loading, setLoading] = useState(false)

    // Sync state if prop changes (e.g. remotely updated)
    React.useEffect(() => {
        if (config?.ai_topology) {
            setLocalConfig({ providers: [], ...config.ai_topology })
        }
    }, [config])

    const handleSave = () => {
        // Construct full config to save
        const fullConfig = { ...config, ai_topology: localConfig }
        onSave(fullConfig)
    }

    const updateProvider = (index, field, value) => {
        const newProviders = [...(localConfig.providers || [])]
        newProviders[index][field] = value
        setLocalConfig({ ...localConfig, providers: newProviders })
    }

    const addProvider = () => {
        const newProvider = {
            id: `new_provider_${Date.now()}`,
            name: "New Provider",
            type: "openai",
            api_key: "",
            enabled: true,
            models: []
        }
        setLocalConfig({ ...localConfig, providers: [...(localConfig.providers || []), newProvider] })
    }

    const removeProvider = (index) => {
        const newProviders = [...(localConfig.providers || [])]
        newProviders.splice(index, 1)
        setLocalConfig({ ...localConfig, providers: newProviders })
    }

    const moveProvider = (index, direction) => {
        const newProviders = [...(localConfig.providers || [])]
        if (direction === -1 && index > 0) {
            [newProviders[index], newProviders[index - 1]] = [newProviders[index - 1], newProviders[index]]
        } else if (direction === 1 && index < newProviders.length - 1) {
            [newProviders[index], newProviders[index + 1]] = [newProviders[index + 1], newProviders[index]]
        }
        setLocalConfig({ ...localConfig, providers: newProviders })
    }

    const addModel = (pIndex) => {
        const newProviders = [...(localConfig.providers || [])]
        newProviders[pIndex].models.push({
            id: "new-model",
            priority: newProviders[pIndex].models.length + 1,
            enabled: true
        })
        setLocalConfig({ ...localConfig, providers: newProviders })
    }

    const removeModel = (pIndex, mIndex) => {
        const newProviders = [...(localConfig.providers || [])]
        newProviders[pIndex].models.splice(mIndex, 1)
        setLocalConfig({ ...localConfig, providers: newProviders })
    }

    const moveModel = (pIndex, mIndex, direction) => {
        const newProviders = [...(localConfig.providers || [])]
        const models = newProviders[pIndex].models
        if (direction === -1 && mIndex > 0) {
            [models[mIndex], models[mIndex - 1]] = [models[mIndex - 1], models[mIndex]]
        } else if (direction === 1 && mIndex < models.length - 1) {
            [models[mIndex], models[mIndex + 1]] = [models[mIndex + 1], models[mIndex]]
        }
        models.forEach((m, i) => m.priority = i + 1)
        setLocalConfig({ ...localConfig, providers: newProviders })
    }

    const testProvider = async (provider) => {
        setLoading(true)
        setTestResult(null)
        try {
            // We pass the full provider object so unsaved changes can be tested
            const res = await axios.post(`${API_URL}/providers/test/${provider.id}`, provider)
            setTestResult({ id: provider.id, ...res.data })
        } catch (e) {
            setTestResult({ id: provider.id, status: 'error', message: e.response?.data?.detail || e.message })
        }
        setLoading(false)
    }

    return (
        <div className="space-y-6">
            <PageStatusBar services={['bot', 'ai']} />
            <div className="flex justify-between items-center px-1">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight text-zinc-100">AI Orchestration</h2>
                    <p className="text-sm text-zinc-400">Configure providers, models, and failover priority.</p>
                </div>
                <div className="flex gap-3">
                    <Button onClick={addProvider} variant="outline" className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                        <Plus className="mr-2 h-4 w-4" /> Add Provider
                    </Button>
                    <Button onClick={handleSave} className="bg-zinc-100 text-zinc-900 hover:bg-white">
                        <Save className="mr-2 h-4 w-4" /> Save Changes
                    </Button>
                </div>
            </div>

            <Card className="bg-zinc-900 border-zinc-800 shadow-sm">
                <CardHeader className="pb-3 border-b border-zinc-800">
                    <CardTitle className="text-base font-semibold text-zinc-100">Global System Prompt</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    <div className="space-y-2">
                        <Textarea
                            className="flex min-h-[80px] w-full bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
                            placeholder="You are a helpful AI assistant..."
                            value={localConfig.system_prompt || ''}
                            onChange={(e) => setLocalConfig({ ...localConfig, system_prompt: e.target.value })}
                        />
                        <p className="text-xs text-zinc-500">This prompt is sent to all providers to define the AI's personality and behavior.</p>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6">
                {(localConfig.providers || []).map((provider, pIndex) => (
                    <Card key={provider.id} className="relative overflow-hidden group bg-zinc-900 border-zinc-800 shadow-sm">
                        <div className={`absolute left-0 top-0 bottom-0 w-1 transition-colors ${provider.enabled ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
                        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4 border-b border-zinc-800">
                            <div className="flex-1 grid gap-4">
                                <div className="flex items-center gap-4">
                                    <Input
                                        value={provider.name}
                                        onChange={(e) => updateProvider(pIndex, 'name', e.target.value)}
                                        className="font-semibold text-lg h-9 w-64 border-zinc-800 hover:border-zinc-700 focus:border-zinc-600 bg-zinc-950 text-zinc-100 px-3"
                                    />
                                    <Switch
                                        checked={provider.enabled}
                                        onCheckedChange={(c) => updateProvider(pIndex, 'enabled', c)}
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono bg-zinc-800 px-2 py-1 rounded">
                                        {provider.type}
                                    </span>
                                    <div className="h-4 w-[1px] bg-zinc-800" />
                                    <select
                                        className="text-xs bg-transparent text-zinc-400 border-none outline-none cursor-pointer hover:text-zinc-200"
                                        value={provider.type}
                                        onChange={(e) => updateProvider(pIndex, 'type', e.target.value)}
                                    >
                                        <option value="openai">OpenAI Compatible</option>
                                        <option value="ollama">Ollama</option>
                                        <option value="custom">Custom</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" disabled={pIndex === 0} onClick={() => moveProvider(pIndex, -1)} className="text-zinc-400 hover:text-zinc-100"><ArrowUp className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" disabled={pIndex === localConfig.providers.length - 1} onClick={() => moveProvider(pIndex, 1)} className="text-zinc-400 hover:text-zinc-100"><ArrowDown className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => removeProvider(pIndex)} className="text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="grid gap-6 md:grid-cols-2 mb-8 bg-zinc-950/50 p-6 rounded-lg border border-zinc-800/50">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">API Key</label>
                                    <Input
                                        type="password"
                                        value={provider.api_key || ''}
                                        onChange={(e) => updateProvider(pIndex, 'api_key', e.target.value)}
                                        placeholder="sk-..."
                                        className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Base URL</label>
                                    <Input
                                        value={provider.base_url || ''}
                                        onChange={(e) => updateProvider(pIndex, 'base_url', e.target.value)}
                                        placeholder="https://api.openai.com/v1"
                                        className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-700"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm font-medium pb-2 border-b border-zinc-800">
                                    <span className="text-zinc-300">Models (Priority Order)</span>
                                    <Button variant="ghost" size="sm" onClick={() => addModel(pIndex)} className="h-7 text-xs text-zinc-400 hover:text-zinc-100 px-2"><Plus className="h-3 w-3 mr-1.5" /> Add Model</Button>
                                </div>
                                <div className="space-y-2">
                                    {(provider.models || []).map((model, mIndex) => (
                                        <div key={mIndex} className="flex items-center gap-3 group/model">
                                            <div className="flex flex-col gap-0 opacity-20 group-hover/model:opacity-100 transition-opacity">
                                                <button disabled={mIndex === 0} onClick={() => moveModel(pIndex, mIndex, -1)} className="hover:text-white text-zinc-500 disabled:opacity-0"><ArrowUp className="h-3 w-3" /></button>
                                                <button disabled={mIndex === provider.models.length - 1} onClick={() => moveModel(pIndex, mIndex, 1)} className="hover:text-white text-zinc-500 disabled:opacity-0"><ArrowDown className="h-3 w-3" /></button>
                                            </div>
                                            <span className="font-mono text-[10px] w-4 text-center text-zinc-600">{mIndex + 1}</span>
                                            <Input
                                                value={model.id}
                                                onChange={(e) => {
                                                    const newModels = [...provider.models]
                                                    newModels[mIndex].id = e.target.value
                                                    updateProvider(pIndex, 'models', newModels)
                                                }}
                                                className="h-9 flex-1 font-mono text-xs bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-700"
                                                placeholder="Model ID"
                                            />
                                            <Switch checked={model.enabled} onCheckedChange={(c) => {
                                                const newModels = [...provider.models]
                                                newModels[mIndex].enabled = c
                                                updateProvider(pIndex, 'models', newModels)
                                            }} />
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10" onClick={() => removeModel(pIndex, mIndex)}><X className="h-3.5 w-3.5" /></Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-8 pt-4 border-t border-zinc-800 flex justify-end items-center gap-4">
                                {testResult?.id === provider.id && (
                                    <div className={`text-xs flex items-center gap-2 ${testResult.status === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {testResult.status === 'success' ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                                        {testResult.status === 'success' ? `Connected` : testResult.message}
                                    </div>
                                )}
                                <Button variant="outline" size="sm" disabled={loading} onClick={() => testProvider(provider)} className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                                    {loading && testResult?.id === provider.id ? <div className="animate-spin h-3 w-3 mr-2 border-2 border-zinc-400 border-t-transparent rounded-full" /> : <Zap className="h-3 w-3 mr-2" />}
                                    Test Connection
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
