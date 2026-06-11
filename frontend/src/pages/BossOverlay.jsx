import React, { useState, useEffect, useRef } from 'react'

export default function BossOverlay() {
    const [boss, setBoss] = useState(null)
    const [damagePopups, setDamagePopups] = useState([])
    const [hitShake, setHitShake] = useState(false)
    const [defeatedMsg, setDefeatedMsg] = useState(null)
    
    const ws = useRef(null)
    
    useEffect(() => {
        document.documentElement.style.background = 'transparent'
        document.body.style.background = 'transparent'
        document.body.style.backgroundColor = 'transparent'
        return () => {
            document.documentElement.style.background = ''
            document.body.style.background = ''
            document.body.style.backgroundColor = ''
        }
    }, [])

    useEffect(() => {
        const connect = () => {
            const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
            const uri = `${proto}://${window.location.host}/ws/overlay`
            ws.current = new WebSocket(uri)

            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    
                    if (data.type === 'boss_spawned') {
                        let emoji = '👹'
                        if (data.boss_type === 'thanos') emoji = '🦹‍♂️'
                        if (data.boss_type === 'dragon') emoji = '🐉'
                        if (data.boss_type === 'demon') emoji = '👿'
                        
                        setBoss({
                            hp: data.hp,
                            maxHp: data.hp,
                            type: data.boss_type,
                            emoji: emoji
                        })
                        setDefeatedMsg(null)
                    } 
                    else if (data.type === 'boss_attacked') {
                        setBoss(prev => prev ? { ...prev, hp: data.current_hp } : prev)
                        
                        // Hit shake
                        setHitShake(true)
                        setTimeout(() => setHitShake(false), 300)
                        
                        // Damage popup
                        const id = Date.now() + Math.random()
                        const offset = (Math.random() - 0.5) * 200
                        setDamagePopups(prev => [...prev, { id, attacker: data.attacker, damage: data.damage, offset }])
                        
                        setTimeout(() => {
                            setDamagePopups(prev => prev.filter(p => p.id !== id))
                        }, 2000)
                    }
                    else if (data.type === 'boss_defeated') {
                        setBoss(prev => prev ? { ...prev, hp: 0 } : null)
                        setDefeatedMsg(data.top_rewards)
                        setTimeout(() => {
                            setBoss(null)
                            setDefeatedMsg(null)
                        }, 10000) // Show defeated message for 10s
                    }
                } catch (e) { console.error(e) }
            }

            ws.current.onclose = () => setTimeout(connect, 3000)
            ws.current.onerror = () => ws.current?.close()
        }
        connect()
        return () => {
            ws.current?.close()
        }
    }, [])

    if (!boss && !defeatedMsg) return <div className="bg-transparent w-screen h-screen"></div>

    const hpPercent = boss ? Math.max(0, (boss.hp / boss.maxHp) * 100) : 0

    return (
        <>
            <style>{`
                @keyframes floatBoss {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-20px); }
                    100% { transform: translateY(0px); }
                }
                @keyframes shakeBoss {
                    0% { transform: translate(1px, 1px) rotate(0deg) scale(1.1); filter: brightness(2) hue-rotate(-50deg); }
                    10% { transform: translate(-10px, -12px) rotate(-5deg) scale(1.1); }
                    20% { transform: translate(-15px, 0px) rotate(5deg) scale(1.1); }
                    30% { transform: translate(15px, 10px) rotate(0deg) scale(1.1); }
                    40% { transform: translate(5px, -5px) rotate(5deg) scale(1.1); }
                    50% { transform: translate(-5px, 10px) rotate(-5deg) scale(1.1); }
                    60% { transform: translate(-15px, 5px) rotate(0deg) scale(1.1); }
                    70% { transform: translate(15px, 1px) rotate(-5deg) scale(1.1); }
                    80% { transform: translate(-5px, -5px) rotate(5deg) scale(1.1); filter: brightness(1) hue-rotate(0deg); }
                    90% { transform: translate(5px, 10px) rotate(0deg) scale(1); }
                    100% { transform: translate(1px, -2px) rotate(-5deg) scale(1); }
                }
                @keyframes flyUpFade {
                    0% { opacity: 1; transform: translateY(0) scale(1); }
                    100% { opacity: 0; transform: translateY(-150px) scale(1.5); }
                }
                @keyframes bossDeath {
                    0% { transform: scale(1); filter: brightness(2) grayscale(0); }
                    50% { transform: scale(1.2); filter: brightness(5) grayscale(1); }
                    100% { transform: scale(0); filter: brightness(0) grayscale(1); opacity: 0; }
                }
                @keyframes winnerPop {
                    0% { transform: scale(0); opacity: 0; }
                    80% { transform: scale(1.1); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                .boss-shake { animation: shakeBoss 0.3s cubic-bezier(.36,.07,.19,.97) both; }
                .boss-float { animation: floatBoss 4s ease-in-out infinite; }
                .boss-die { animation: bossDeath 1.5s ease-out forwards; }
            `}</style>

            <div style={{
                height: '100vh', width: '100%',
                display: 'flex', flexDirection: 'column', 
                alignItems: 'center', justifyContent: 'center',
                background: 'transparent', overflow: 'hidden',
                position: 'relative'
            }}>
                {/* Boss Character */}
                {boss && !defeatedMsg && (
                    <div style={{ position: 'relative', marginTop: '100px' }}>
                        <div 
                            className={`text-[200px] ${hitShake ? 'boss-shake' : 'boss-float'}`}
                            style={{
                                textShadow: '0 0 50px rgba(255, 0, 0, 0.8), 0 0 100px rgba(255, 0, 0, 0.5)',
                                transition: 'all 0.1s ease',
                                userSelect: 'none'
                            }}
                        >
                            {boss.emoji}
                        </div>
                        
                        {/* Damage Popups */}
                        {damagePopups.map(p => (
                            <div key={p.id} style={{
                                position: 'absolute',
                                top: '50%',
                                left: `calc(50% + ${p.offset}px)`,
                                color: '#ff3333',
                                fontWeight: 900,
                                fontSize: '40px',
                                textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 0 20px #ff0000',
                                fontFamily: 'Impact, sans-serif',
                                whiteSpace: 'nowrap',
                                transform: 'translate(-50%, -50%)',
                                animation: 'flyUpFade 1.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                                zIndex: 50
                            }}>
                                <span style={{fontSize: '24px', color: '#fff'}}>{p.attacker}</span> <br/>
                                -{p.damage}
                            </div>
                        ))}
                    </div>
                )}

                {/* Death Animation Trigger */}
                {boss && boss.hp <= 0 && !defeatedMsg && (
                    <div className="text-[200px] boss-die" style={{textShadow: '0 0 100px red'}}>
                        {boss.emoji}
                    </div>
                )}

                {/* Health Bar UI */}
                {boss && !defeatedMsg && (
                    <div style={{
                        marginTop: '40px',
                        width: '600px',
                        background: 'rgba(0,0,0,0.8)',
                        border: '4px solid #333',
                        borderRadius: '20px',
                        padding: '6px',
                        boxShadow: '0 0 30px rgba(255,0,0,0.4)',
                        position: 'relative'
                    }}>
                        <div style={{
                            width: `${hpPercent}%`,
                            height: '40px',
                            background: 'linear-gradient(90deg, #ff0000, #ff5555)',
                            borderRadius: '12px',
                            transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: 'inset 0 0 10px rgba(255,255,255,0.5)'
                        }} />
                        <div style={{
                            position: 'absolute',
                            top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            color: 'white',
                            fontWeight: 900,
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '24px',
                            textShadow: '2px 2px 4px #000',
                            letterSpacing: '2px'
                        }}>
                            {boss.hp} / {boss.maxHp} HP
                        </div>
                        <div style={{
                            position: 'absolute',
                            top: '-40px', left: '50%',
                            transform: 'translateX(-50%)',
                            color: '#ffaa00',
                            fontWeight: 900,
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '28px',
                            textShadow: '0 0 10px #ff0000',
                            textTransform: 'uppercase',
                            letterSpacing: '4px'
                        }}>
                            {boss.type}
                        </div>
                    </div>
                )}

                {/* Defeated Message & Winners */}
                {defeatedMsg && (
                    <div style={{
                        background: 'rgba(20, 0, 0, 0.9)',
                        border: '4px solid #ffaa00',
                        padding: '40px 60px',
                        borderRadius: '24px',
                        boxShadow: '0 0 100px rgba(255, 170, 0, 0.5), inset 0 0 50px rgba(255, 0, 0, 0.5)',
                        textAlign: 'center',
                        animation: 'winnerPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
                    }}>
                        <h1 style={{
                            fontSize: '64px',
                            color: '#ff3333',
                            fontWeight: 900,
                            fontFamily: 'Impact, sans-serif',
                            margin: '0 0 20px 0',
                            textShadow: '0 0 20px #ff0000, 2px 2px 0px #fff'
                        }}>BOSS DEFEATED!</h1>
                        
                        <h2 style={{ color: '#fff', fontSize: '28px', marginBottom: '20px', fontFamily: 'Inter' }}>Top Attackers</h2>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {defeatedMsg.map((winner, index) => {
                                const colors = ['#FFD700', '#C0C0C0', '#CD7F32'] // Gold, Silver, Bronze
                                const color = colors[index] || '#fff'
                                return (
                                    <div key={index} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        background: 'rgba(255,255,255,0.1)',
                                        padding: '15px 30px',
                                        borderRadius: '12px',
                                        fontSize: '24px',
                                        fontWeight: 'bold',
                                        color: '#fff',
                                        borderLeft: `6px solid ${color}`,
                                        width: '400px',
                                        margin: '0 auto'
                                    }}>
                                        <span><span style={{color}} className="mr-2">#{index + 1}</span> {winner[0]}</span>
                                        <span style={{ color: '#00ff88' }}>+{winner[1]} pts</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}
