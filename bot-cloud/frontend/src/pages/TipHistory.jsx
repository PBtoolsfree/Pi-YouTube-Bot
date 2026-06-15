import React, { useState, useEffect } from 'react'
import { History, Trash2 } from 'lucide-react'
import { Card, Button } from '@/components/ui'
import axios from 'axios'

function TipHistory() {
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchHistory()
        const interval = setInterval(fetchHistory, 10000)
        return () => clearInterval(interval)
    }, [])

    const fetchHistory = async () => {
        try {
            const res = await axios.get('/api/donations')
            setHistory(res.data)
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
        <div className="max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
                    <History className="h-6 w-6 text-indigo-400" />
                    Tip History
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                    View and manage all your recent donations and tips across all platforms.
                </p>
            </div>

            <Card className="border-zinc-800 bg-zinc-900 shadow-sm overflow-hidden animate-fade-in">
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/30">
                    <div className="flex items-center gap-2">
                        <History className="text-zinc-500 h-4 w-4" />
                        <h3 className="font-semibold text-zinc-200 text-sm">Recent Transactions</h3>
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs border-red-500/30 text-red-500 hover:bg-red-500/10" onClick={clearHistory}>
                            Clear History
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs border-zinc-700 text-zinc-400 hover:text-zinc-100" onClick={fetchHistory}>
                            Refresh
                        </Button>
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs uppercase bg-zinc-950 text-zinc-500 font-medium sticky top-0">
                            <tr>
                                <th className="px-5 py-3 font-medium">Date</th>
                                <th className="px-5 py-3 font-medium">User</th>
                                <th className="px-5 py-3 font-medium">Amount</th>
                                <th className="px-5 py-3 font-medium">Source</th>
                                <th className="px-5 py-3 font-medium">Message</th>
                                <th className="px-5 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {loading && history.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-8 text-center text-zinc-500 text-xs">Loading history...</td>
                                </tr>
                            ) : history.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-8 text-center text-zinc-500 italic text-xs">No transactions found yet.</td>
                                </tr>
                            ) : (
                                history.map((tx, idx) => (
                                    <tr key={idx} className="hover:bg-zinc-800/30 transition-colors">
                                        <td className="px-5 py-3 text-zinc-400 whitespace-nowrap text-xs">{tx.timestamp}</td>
                                        <td className="px-5 py-3 font-medium text-zinc-200">{tx.user}</td>
                                        <td className="px-5 py-3 font-bold text-emerald-400">₹{tx.amount}</td>
                                        <td className="px-5 py-3">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300">
                                                {tx.source || "App Notification"}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-zinc-300 max-w-xs truncate" title={tx.message}>
                                            {tx.message || <span className="text-zinc-600 italic">No message</span>}
                                        </td>
                                        <td className="px-5 py-3 text-right">
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
