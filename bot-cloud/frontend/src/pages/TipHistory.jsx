import React, { useState, useEffect } from 'react'
import { History, Trash2, CheckCircle, AlertCircle, Loader2, QrCode } from 'lucide-react'
import { Card, Button } from '@/components/ui'
import axios from 'axios'

function TipHistory() {
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)
    const [historyFilter, setHistoryFilter] = useState('ALL')

    useEffect(() => {
        fetchHistory()
        const interval = setInterval(fetchHistory, 4000)
        return () => clearInterval(interval)
    }, [])

    const fetchHistory = async () => {
        try {
            const res = await axios.get('/api/donations')
            if (Array.isArray(res.data)) {
                setHistory(res.data)
            }
        } catch (e) {
            console.error("Failed to fetch tip history", e)
        } finally {
            setLoading(false)
        }
    }

    const clearHistory = async () => {
        if (!window.confirm("Are you sure you want to clear all donation history? This cannot be undone.")) return;
        try {
            await axios.delete('/api/donations')
            await fetchHistory()
        } catch (e) {
            alert("Failed to clear history")
        }
    }

    const deleteSingleItem = async (tx) => {
        if (!window.confirm(`Delete donation from ${tx.user} (₹${tx.amount})?`)) return;
        try {
            await axios.delete('/api/donations/item', {
                data: {
                    id: tx.id,
                    timestamp: tx.timestamp,
                    user: tx.user,
                    amount: tx.amount
                }
            })
            await fetchHistory()
        } catch (e) {
            alert("Failed to delete item")
        }
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                    <History className="h-6 w-6 text-cyan-400" /> Donation & Payment History
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                    Real-time status tracking for all incoming Paytm QR payments, pending email corroborations, and tip intents.
                </p>
            </div>

            <Card className="border-zinc-800 bg-zinc-900 shadow-sm overflow-hidden animate-fade-in">
                <div className="p-4 border-b border-zinc-800 flex flex-wrap gap-3 justify-between items-center bg-zinc-950/40">
                    <div className="flex items-center gap-2">
                        <History className="text-cyan-400 h-5 w-5" />
                        <h3 className="font-semibold text-zinc-100 text-sm">Recent Transactions & Intents</h3>
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-8 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={clearHistory}>
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear History
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs border-zinc-700 text-zinc-300 hover:text-zinc-100" onClick={fetchHistory}>
                            <Loader2 className="h-3.5 w-3.5 mr-1" /> Refresh
                        </Button>
                    </div>
                </div>

                {/* Filter Pills */}
                <div className="px-4 py-2.5 bg-zinc-950/60 border-b border-zinc-800 flex items-center gap-2 overflow-x-auto text-xs">
                    <span className="text-zinc-500 font-semibold text-[11px] uppercase tracking-wider mr-1">Filter:</span>
                    {[
                        { key: 'ALL', label: 'All', count: history.length },
                        { key: 'VERIFIED', label: 'Verified', count: history.filter(h => h.status === 'VERIFIED').length, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
                        { key: 'PENDING_EMAIL', label: 'Pending Email', count: history.filter(h => h.status === 'PENDING_EMAIL').length, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
                        { key: 'WAITING_FOR_PAYMENT', label: 'Waiting Payment', count: history.filter(h => h.status === 'WAITING_FOR_PAYMENT').length, color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' }
                    ].map(f => {
                        const isSelected = historyFilter === f.key;
                        return (
                            <button
                                key={f.key}
                                onClick={() => setHistoryFilter(f.key)}
                                className={`px-3 py-1 rounded-full border text-xs font-medium transition-all ${
                                    isSelected
                                        ? (f.color || 'bg-zinc-800 text-cyan-300 border-cyan-500/50 shadow-sm')
                                        : 'border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                                }`}
                            >
                                {f.label} <span className="opacity-70 text-[10px]">({f.count})</span>
                            </button>
                        );
                    })}
                </div>
                
                <div className="overflow-x-auto max-h-[550px]">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[11px] uppercase bg-zinc-950 text-zinc-500 font-medium sticky top-0 tracking-wider">
                            <tr>
                                <th className="px-4 py-3">Date & Time</th>
                                <th className="px-4 py-3">Donor / User</th>
                                <th className="px-4 py-3">Amount</th>
                                <th className="px-4 py-3">Source</th>
                                <th className="px-4 py-3">Payment Status</th>
                                <th className="px-4 py-3">UTR / Ref</th>
                                <th className="px-4 py-3">Message</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800 text-xs">
                            {loading && history.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-5 py-8 text-center text-zinc-500 text-xs">Loading transaction history...</td>
                                </tr>
                            ) : history.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-5 py-12 text-center text-zinc-500 italic text-xs">No transactions found yet.</td>
                                </tr>
                            ) : (
                                history
                                    .filter(tx => {
                                        if (historyFilter === 'ALL') return true;
                                        return tx.status === historyFilter;
                                    })
                                    .map((tx, idx) => (
                                        <tr key={tx.id || idx} className="hover:bg-zinc-800/40 transition-colors">
                                            <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-[11px] font-mono">{tx.timestamp}</td>
                                            <td className="px-4 py-3 font-semibold text-zinc-200 whitespace-nowrap">{tx.user}</td>
                                            <td className="px-4 py-3 font-bold text-emerald-400 font-mono text-sm whitespace-nowrap">₹{Number(tx.amount || 0).toFixed(2)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                                                    <QrCode className="h-2.5 w-2.5 text-cyan-400" />
                                                    {tx.source || "Paytm QR"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {tx.status === 'VERIFIED' && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                        <CheckCircle className="h-3 w-3" /> Verified
                                                    </span>
                                                )}
                                                {tx.status === 'PENDING_EMAIL' && (
                                                    <span
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 cursor-help"
                                                        title="Payment notification received from Android forwarder. Waiting for Paytm email confirmation."
                                                    >
                                                        <AlertCircle className="h-3 w-3" /> Pending (Waiting for Email)
                                                    </span>
                                                )}
                                                {tx.status === 'WAITING_FOR_PAYMENT' && (
                                                    <span
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 cursor-help"
                                                        title="Viewer opened QR on Tip Page. Waiting for UPI payment."
                                                    >
                                                        <Loader2 className="h-3 w-3 animate-spin" /> Waiting for Payment
                                                    </span>
                                                )}
                                                {tx.status === 'EXPIRED' && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-800/80 text-zinc-400 border border-zinc-700">
                                                        Expired
                                                    </span>
                                                )}
                                                {!['VERIFIED', 'PENDING_EMAIL', 'WAITING_FOR_PAYMENT', 'EXPIRED'].includes(tx.status) && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-300">
                                                        {tx.status_label || tx.status || "Completed"}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                                                {tx.utr && tx.utr !== '—' ? (
                                                    <span className="px-1.5 py-0.5 bg-zinc-950 rounded border border-zinc-800 text-cyan-300">
                                                        {tx.utr}
                                                    </span>
                                                ) : (
                                                    <span className="text-zinc-600">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-zinc-300 max-w-xs truncate" title={tx.message}>
                                                {tx.message || <span className="text-zinc-600 italic">No message</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                                                    onClick={() => deleteSingleItem(tx)}
                                                    title="Delete Item"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    )
}

export default TipHistory
