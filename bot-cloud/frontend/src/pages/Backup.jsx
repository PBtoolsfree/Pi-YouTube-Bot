import React, { useState, useRef, useCallback } from 'react'
import axios from 'axios'
import {
    Download, Upload, Save as SaveIcon, Trash2, RefreshCw, CheckCircle,
    XCircle, Archive, FolderOpen, Clock, HardDrive, RotateCcw,
    FilePlus, Info
} from 'lucide-react'


const API_URL = import.meta?.env?.VITE_API_URL || '/api'

function safeFixed(value, digits = 1, fallback = "0") {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : fallback;
}

function formatBytes(bytes) {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat(safeFixed(bytes / Math.pow(k, i), 1))} ${sizes[i]}`
}

function Toast({ type, message, onClose }) {
    const colors = {
        success: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
        error: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
        info: 'bg-blue-500/15 border-blue-500/30 text-blue-300',
    }
    const Icon = type === 'success' ? CheckCircle : type === 'error' ? XCircle : Info
    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl animate-fade-in ${colors[type]}`}>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{message}</span>
            <button onClick={onClose} className="opacity-60 hover:opacity-100 transition-opacity ml-2 text-xs">✕</button>
        </div>
    )
}

function SectionCard({ title, icon, children, accent = 'violet' }) {
    const accents = {
        violet: 'from-violet-500/10 to-transparent border-violet-500/20',
        emerald: 'from-emerald-500/10 to-transparent border-emerald-500/20',
        blue: 'from-blue-500/10 to-transparent border-blue-500/20',
        amber: 'from-amber-500/10 to-transparent border-amber-500/20',
    }
    const iconColors = {
        violet: 'text-violet-400',
        emerald: 'text-emerald-400',
        blue: 'text-blue-400',
        amber: 'text-amber-400',
    }
    return (
        <div className={`rounded-2xl border bg-gradient-to-b ${accents[accent]} p-6 backdrop-blur-sm`}>
            <div className="flex items-center gap-3 mb-5">
                <div className={`${iconColors[accent]}`}>{React.cloneElement(icon, { className: 'h-5 w-5' })}</div>
                <h2 className="text-base font-bold text-white tracking-tight">{title}</h2>
            </div>
            {children}
        </div>
    )
}

export default function Backup() {
    const [toasts, setToasts] = useState([])
    const [exportLoading, setExportLoading] = useState(false)
    const [importLoading, setImportLoading] = useState(false)
    const [saveLoading, setSaveLoading] = useState(false)
    const [saveName, setSaveName] = useState('')
    const [backups, setBackups] = useState([])
    const [backupsLoading, setBackupsLoading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [restoringFile, setRestoringFile] = useState(null)
    const [deletingFile, setDeletingFile] = useState(null)
    const fileInputRef = useRef(null)

    const addToast = (type, message) => {
        const id = Date.now()
        setToasts(prev => [...prev, { id, type, message }])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
    }

    const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

    // ─── EXPORT ───────────────────────────────────────────────────────────
    const handleExport = async () => {
        setExportLoading(true)
        try {
            const res = await axios.get(`${API_URL}/backup/export`, { responseType: 'blob' })
            const url = window.URL.createObjectURL(new Blob([res.data]))
            const link = document.createElement('a')
            const cd = res.headers['content-disposition'] || ''
            const match = cd.match(/filename=(.+)/)
            link.href = url
            link.download = match ? match[1] : 'pi-bot-backup.zip'
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
            addToast('success', 'Backup downloaded successfully!')
        } catch (e) {
            addToast('error', `Export failed: ${e.response?.data?.detail || e.message}`)
        } finally {
            setExportLoading(false)
        }
    }

    // ─── IMPORT ───────────────────────────────────────────────────────────
    const handleImportFile = async (file) => {
        if (!file || !file.name.endsWith('.zip')) {
            addToast('error', 'Please upload a valid .zip backup file')
            return
        }
        setImportLoading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            await axios.post(`${API_URL}/backup/import`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            addToast('success', `✅ Backup "${file.name}" imported! Bot config has been restored.`)
        } catch (e) {
            addToast('error', `Import failed: ${e.response?.data?.detail || e.message}`)
        } finally {
            setImportLoading(false)
        }
    }

    const handleDrop = useCallback((e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer?.files?.[0]
        if (file) handleImportFile(file)
    }, [])

    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
    const handleDragLeave = () => setIsDragging(false)

    // ─── SAVE NAMED SNAPSHOT ──────────────────────────────────────────────
    const handleSave = async () => {
        if (!saveName.trim()) { addToast('error', 'Please enter a backup name'); return }
        setSaveLoading(true)
        try {
            await axios.post(`${API_URL}/backup/save`, { name: saveName.trim() })
            addToast('success', `Snapshot "${saveName}" saved to server!`)
            setSaveName('')
            loadBackups()
        } catch (e) {
            addToast('error', `Save failed: ${e.response?.data?.detail || e.message}`)
        } finally {
            setSaveLoading(false)
        }
    }

    // ─── LIST BACKUPS ─────────────────────────────────────────────────────
    const loadBackups = async () => {
        setBackupsLoading(true)
        try {
            const res = await axios.get(`${API_URL}/backup/list`)
            setBackups(res.data.backups || [])
        } catch (e) {
            addToast('error', 'Failed to load saved backups')
        } finally {
            setBackupsLoading(false)
        }
    }

    React.useEffect(() => { loadBackups() }, [])

    // ─── RESTORE ──────────────────────────────────────────────────────────
    const handleRestore = async (filename) => {
        setRestoringFile(filename)
        try {
            await axios.post(`${API_URL}/backup/restore/${encodeURIComponent(filename)}`)
            addToast('success', `✅ Restored from "${filename}"! Config has been reloaded.`)
        } catch (e) {
            addToast('error', `Restore failed: ${e.response?.data?.detail || e.message}`)
        } finally {
            setRestoringFile(null)
        }
    }

    // ─── DELETE ───────────────────────────────────────────────────────────
    const handleDelete = async (filename) => {
        setDeletingFile(filename)
        try {
            await axios.delete(`${API_URL}/backup/delete/${encodeURIComponent(filename)}`)
            addToast('success', `Deleted "${filename}"`)
            setBackups(prev => prev.filter(b => b.filename !== filename))
        } catch (e) {
            addToast('error', `Delete failed: ${e.response?.data?.detail || e.message}`)
        } finally {
            setDeletingFile(null)
        }
    }

    return (
        <div className="space-y-6">
            {/* Toast Stack */}
            {toasts.length > 0 && (
                <div className="fixed top-6 right-6 z-50 space-y-2 w-80">
                    {toasts.map(t => (
                        <Toast key={t.id} type={t.type} message={t.message} onClose={() => removeToast(t.id)} />
                    ))}
                </div>
            )}

            {/* Page Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Backup System</h1>
                    <p className="text-zinc-400 text-sm mt-1">Export, import and manage your bot configuration backups</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                    <Info className="h-3.5 w-3.5" />
                    Backup includes: config, credentials & data
                </div>
            </div>

            {/* Top Row: Export + Import */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Export */}
                <SectionCard title="Export Backup" icon={<Download />} accent="emerald">
                    <p className="text-zinc-400 text-sm mb-5">
                        Download a complete zip file containing your <code className="text-emerald-400 bg-zinc-800 px-1 rounded text-xs">config.json</code>,
                        <code className="text-emerald-400 bg-zinc-800 px-1 rounded text-xs mx-1">credentials</code> and
                        <code className="text-emerald-400 bg-zinc-800 px-1 rounded text-xs">data/</code> folder.
                    </p>
                    <div className="bg-zinc-900/60 rounded-xl p-4 mb-5 border border-white/5">
                        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-3">Files included</p>
                        <div className="space-y-1.5">
                            {['config.json', '.env', 'viewers.db', 'data/donations.json', 'data/brain.db', 'data/youtube_memory.db'].map(f => (
                                <div key={f} className="flex items-center gap-2 text-xs text-zinc-400">
                                    <div className="h-1 w-1 rounded-full bg-emerald-500" />
                                    {f}
                                </div>
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={handleExport}
                        disabled={exportLoading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-emerald-900/30 hover:shadow-emerald-700/30"
                    >
                        {exportLoading
                            ? <><RefreshCw className="h-4 w-4 animate-spin" /> Creating zip...</>
                            : <><Download className="h-4 w-4" /> Download Backup</>
                        }
                    </button>
                </SectionCard>

                {/* Import */}
                <SectionCard title="Import / Restore" icon={<Upload />} accent="blue">
                    <p className="text-zinc-400 text-sm mb-5">
                        Upload a previously exported <code className="text-blue-400 bg-zinc-800 px-1 rounded text-xs">.zip</code> backup file to restore your bot configuration instantly.
                    </p>

                    {/* Drop Zone */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={() => fileInputRef.current?.click()}
                        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all duration-200
              ${isDragging
                                ? 'border-blue-400 bg-blue-500/15 scale-[1.01]'
                                : 'border-zinc-700 bg-zinc-900/40 hover:border-blue-500/50 hover:bg-blue-500/5'
                            } ${importLoading ? 'pointer-events-none opacity-50' : ''}`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".zip"
                            className="hidden"
                            onChange={(e) => { if (e.target.files?.[0]) handleImportFile(e.target.files[0]) }}
                        />
                        {importLoading
                            ? <>
                                <RefreshCw className="h-8 w-8 text-blue-400 animate-spin" />
                                <p className="text-sm text-blue-300 font-medium">Restoring backup...</p>
                            </>
                            : <>
                                <div className={`p-3 rounded-full transition-colors ${isDragging ? 'bg-blue-500/20' : 'bg-zinc-800'}`}>
                                    <Upload className={`h-6 w-6 ${isDragging ? 'text-blue-400' : 'text-zinc-400'}`} />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-medium text-white">{isDragging ? 'Drop to restore' : 'Drag & drop backup zip'}</p>
                                    <p className="text-xs text-zinc-500 mt-1">or <span className="text-blue-400 underline">click to browse</span></p>
                                </div>
                                <p className="text-[10px] text-zinc-600">Only .zip backup files are accepted</p>
                            </>
                        }
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        Importing will overwrite your current config and data files.
                    </div>
                </SectionCard>
            </div>

            {/* Save Named Snapshot */}
            <SectionCard title="Save Snapshot to Server" icon={<FilePlus />} accent="violet">
                <p className="text-zinc-400 text-sm mb-4">
                    Save a named backup on the Raspberry Pi server. Useful before making big config changes.
                </p>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={saveName}
                        onChange={e => setSaveName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                        placeholder="e.g. before-update, stable-v1..."
                        className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition-colors"
                    />
                    <button
                        onClick={handleSave}
                        disabled={saveLoading || !saveName.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 shrink-0"
                    >
                        {saveLoading
                            ? <RefreshCw className="h-4 w-4 animate-spin" />
                            : <><SaveIcon className="h-4 w-4" /> Save</>
                        }
                    </button>
                </div>
            </SectionCard>

            {/* Saved Backups List */}
            <SectionCard title="Saved Backups" icon={<Archive />} accent="amber">
                <div className="flex items-center justify-between mb-4">
                    <p className="text-zinc-400 text-sm">All snapshots saved on the server.</p>
                    <button
                        onClick={loadBackups}
                        disabled={backupsLoading}
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${backupsLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                {backupsLoading && backups.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-zinc-600">
                        <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading...
                    </div>
                ) : backups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-zinc-600 gap-3">
                        <FolderOpen className="h-10 w-10 opacity-30" />
                        <p className="text-sm">No saved backups yet. Save your first snapshot above!</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {backups.map((b) => (
                            <div
                                key={b.filename}
                                className="flex items-center gap-4 bg-zinc-900/60 hover:bg-zinc-800/60 rounded-xl px-4 py-3 border border-white/5 transition-all duration-150 group"
                            >
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{b.filename}</p>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                                            <Clock className="h-3 w-3" /> {b.created_at}
                                        </span>
                                        <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                                            <HardDrive className="h-3 w-3" /> {formatBytes(b.size_bytes)}
                                        </span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => handleRestore(b.filename)}
                                        disabled={restoringFile === b.filename}
                                        title="Restore this backup"
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 text-xs font-semibold border border-amber-600/20 transition-all disabled:opacity-50"
                                    >
                                        {restoringFile === b.filename
                                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                            : <RotateCcw className="h-3.5 w-3.5" />
                                        }
                                        Restore
                                    </button>
                                    <button
                                        onClick={() => handleDelete(b.filename)}
                                        disabled={deletingFile === b.filename}
                                        title="Delete this backup"
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600/30 text-rose-400 border border-rose-600/20 transition-all disabled:opacity-50"
                                    >
                                        {deletingFile === b.filename
                                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                            : <Trash2 className="h-3.5 w-3.5" />
                                        }
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>
        </div>
    )
}
