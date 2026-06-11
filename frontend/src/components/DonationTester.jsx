import React, { useState } from 'react'
import axios from 'axios'
import { Card, Button } from '@/components/ui'
import { Beaker } from 'lucide-react'

export default function DonationTester() {
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({ user: 'Test User', amount: '100', message: 'This is a test donation!' })

    const handleTest = async () => {
        setLoading(true)
        try {
            await axios.post('/api/donate', {
                user: form.user,
                amount: parseFloat(form.amount),
                message: form.message
            })
            alert("Test Donation Sent! Check your overlay.")
        } catch (e) {
            alert("Failed to send test.")
            console.error(e)
        }
        setLoading(false)
    }

    return (
        <Card className="p-6 space-y-4 border-orange-500/20 bg-zinc-900/50">
            <div className="flex items-center gap-2 mb-2">
                <Beaker className="text-orange-400 h-5 w-5" />
                <h2 className="text-xl font-bold text-white">Donation Simulator</h2>
            </div>
            <p className="text-xs text-zinc-400">Trigger a fake donation alert to test your overlays and TTS.</p>

            <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Sender Name</label>
                    <input
                        className="w-full bg-black/50 border border-zinc-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-orange-500"
                        value={form.user}
                        onChange={e => setForm({ ...form, user: e.target.value })}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Amount (₹)</label>
                    <input
                        type="number"
                        className="w-full bg-black/50 border border-zinc-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-orange-500"
                        value={form.amount}
                        onChange={e => setForm({ ...form, amount: e.target.value })}
                    />
                </div>
                <div className="space-y-1 md:col-span-3">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Message</label>
                    <input
                        className="w-full bg-black/50 border border-zinc-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-orange-500"
                        value={form.message}
                        onChange={e => setForm({ ...form, message: e.target.value })}
                    />
                </div>
            </div>

            <Button
                onClick={handleTest}
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 mt-2"
            >
                {loading ? "Sending..." : "Trigger Simulation"}
            </Button>
        </Card>
    )
}
