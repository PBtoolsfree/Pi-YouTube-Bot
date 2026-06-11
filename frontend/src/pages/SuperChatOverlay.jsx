import React, { useState, useEffect, useRef } from 'react'

// --- DEFAULT SETTINGS ---
const DEFAULT_SETTINGS = {
    msgDuration: 7,
    enableTips: true,
    enableSuperChats: true,
    nameDisplayMode: 'short',
    topMargin: 20,
    tiers: {
        t1: 30, t2: 60, t3: 90, t4: 120, t5: 180, t6: 300
    }
}

// --- HELPER FUNCTIONS ---
function getNormalizedAmountInINR(amount, currencyCode) {
    if (!currencyCode) return amount;
    const rates = { 'USD': 90, 'EUR': 98, 'GBP': 115, 'AUD': 60, 'CAD': 65, 'SGD': 66, 'JPY': 0.6, 'INR': 1 };
    const rate = rates[currencyCode] || 1;
    return amount * rate;
}

function getDuration(amount, settings) {
    if (amount < 100) return settings.tiers.t1;
    if (amount < 200) return settings.tiers.t2;
    if (amount < 1000) return settings.tiers.t3;
    if (amount < 2000) return settings.tiers.t4;
    if (amount < 5000) return settings.tiers.t5;
    return settings.tiers.t6;
}

function getTheme(amount) {
    if (amount < 40) return { headerColor: '#1565C0', bodyColor: '#1E88E5', textColor: '#ffffff', shadeColor: '#0D47A1' };
    if (amount < 100) return { headerColor: '#00B8D4', bodyColor: '#00E5FF', textColor: '#000000', shadeColor: '#006064' };
    if (amount < 200) return { headerColor: '#0F9D58', bodyColor: '#1DE9B6', textColor: '#000000', shadeColor: '#1B5E20' };
    if (amount < 1000) return { headerColor: '#FFB300', bodyColor: '#FFCA28', textColor: '#000000', shadeColor: '#FF6F00' };
    if (amount < 2000) return { headerColor: '#E65100', bodyColor: '#F57C00', textColor: '#ffffff', shadeColor: '#E64A19' };
    if (amount < 5000) return { headerColor: '#C2185B', bodyColor: '#E91E63', textColor: '#ffffff', shadeColor: '#880E4F' };
    return { headerColor: '#D00000', bodyColor: '#E62117', textColor: '#ffffff', shadeColor: '#B71C1C' };
}

// --- SUB COMPONENT for Individual Card ---
const SuperChatCard = ({ data, onComplete, settings }) => {
    const [mode, setMode] = useState('expanded');
    const [shouldShrink, setShouldShrink] = useState(false);

    // Normalize Amount
    let rawAmount = data.amount;
    // If amount is not a number, try to clean it
    if (typeof rawAmount !== 'number') {
        const amountStr = String(rawAmount);
        const cleanStr = amountStr.replace(/[^0-9.]/g, '');
        rawAmount = parseFloat(cleanStr) || 0;

        // Fallback: Try to extract from message if amount is still 0
        if (rawAmount === 0 && data.message) {
            const match = data.message.match(/tipped\s+.[0-9.]+/i) || data.message.match(/[₹$€£][0-9.]+/);
            if (match) {
                const extracted = match[0].replace(/[^0-9.]/g, '');
                rawAmount = parseFloat(extracted) || 0;
            }
        }
    }

    const amount = rawAmount;
    const currency = data.currency || 'INR';
    const normalizedAmount = getNormalizedAmountInINR(amount, currency);

    // Derived Values
    const theme = getTheme(normalizedAmount);
    const durationSeconds = getDuration(normalizedAmount, settings);
    const visibleDurationMs = durationSeconds * 1000;
    const msgDurationMs = (settings.msgDuration || 7) * 1000;

    const formattedAmount = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: data.currency || 'INR',
        minimumFractionDigits: 0
    }).format(amount);

    useEffect(() => {
        // 1. Switch to Ticker Mode after msgDuration
        const tickerTimer = setTimeout(() => {
            setMode('ticker');
            setShouldShrink(true);
        }, msgDurationMs);

        // 2. Remove Card after Total Duration
        const exitTimer = setTimeout(() => {
            setMode('exit');
            setTimeout(() => {
                onComplete(data.id);
            }, 600);
        }, visibleDurationMs);

        return () => {
            clearTimeout(tickerTimer);
            clearTimeout(exitTimer);
        };
    }, []);

    // Calculate Remaining Time for the "Pill Timer"
    // The pill timer shows how long the *ticker* will stay.
    // Total Duration - Message Duration
    const messageTime = settings.msgDuration || 7;
    const remainingTime = durationSeconds - messageTime;
    const showTimerBar = mode === 'ticker' && remainingTime > 0;

    // Name truncation logic
    const displayName = (settings.nameDisplayMode === 'short' && data.author.length > 8 && mode === 'ticker')
        ? data.author.substring(0, 8) + '...'
        : data.author;

    const displayCurrency = currency === 'INR' || currency === '₹' ? '₹' :
        currency === 'USD' || currency === '$' ? '$' : currency;

    return (
        <div className={`superchat-card ${mode === 'ticker' ? 'ticker-mode' : ''} ${mode === 'exit' ? 'card-exit' : ''}`}>
            <div
                className="pill-wrapper"
                style={{ backgroundColor: mode === 'ticker' ? theme.shadeColor : theme.bodyColor }}
            >
                {/* Timer Bar (Only in Ticker Mode) */}
                {showTimerBar && (
                    <div
                        className="timer-bar shrinking"
                        style={{
                            backgroundColor: theme.bodyColor,
                            animationDuration: `${remainingTime}s`
                        }}
                    />
                )}

                <div className="superchat-header" style={{ backgroundColor: theme.headerColor, color: theme.textColor }}>
                    <img
                        src={`https://api.dicebear.com/7.x/initials/svg?seed=${data.author}`}
                        className="user-avatar"
                        alt="avatar"
                    />
                    <div className="header-text">
                        <span className="username" style={{ color: theme.textColor }}>{displayName}</span>
                        <span className="amount" style={{ color: theme.textColor }}>{displayCurrency}{amount}</span>
                    </div>
                </div>

                <div className="superchat-body" style={{ color: theme.textColor }}>
                    {data.message || `${data.author} sent a tip of ${displayCurrency}${amount}`}
                </div>

                {/* Particles (Always present but hidden until exit) */}
                <div className="particle-container">
                    {[...Array(12)].map((_, i) => (
                        <div
                            key={i}
                            className={`particle p${i + 1}`}
                            style={{ backgroundColor: theme.bodyColor }}
                        ></div>
                    ))}
                </div>
            </div>
        </div>
    )
}

// --- MAIN OVERLAY COMPONENT ---
export default function SuperChatOverlay({ config }) {
    const [alerts, setAlerts] = useState([]);
    const [status, setStatus] = useState('Initializing...');
    const [showStatus, setShowStatus] = useState(true);
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const ws = useRef(null);
    const settingsRef = useRef(DEFAULT_SETTINGS);

    // Load Settings from Config
    useEffect(() => {
        if (config && config.super_chat) {
            const newSettings = { ...DEFAULT_SETTINGS, ...config.super_chat };
            setSettings(newSettings);
            settingsRef.current = newSettings;
        }
    }, [config]);

    // Force transparent background for OBS
    useEffect(() => {
        document.documentElement.style.background = 'transparent'
        document.body.style.background = 'transparent'
        return () => {
            document.documentElement.style.background = ''
            document.body.style.background = ''
        }
    }, []);

    useEffect(() => {
        const connect = () => {
            const isSecure = window.location.protocol === 'https:';
            const protocol = isSecure ? 'wss' : 'ws';
            const host = window.location.host;
            const uri = `${protocol}://${host}/ws/logs`;

            setStatus(`Connecting to ${host}...`);

            ws.current = new WebSocket(uri);

            ws.current.onopen = () => {
                setStatus("✅ Super Chat Overlay Connected");
                setTimeout(() => setShowStatus(false), 3000);
            };

            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'NewSubscriber' || data.type === 'NewSponsor' || data.type === 'subscriber_count') {
                        return; // Explicitly ignore subscriber events
                    }

                    const isTip = data.category === 'DONATION' || data.category === 'PAYTM' || data.category === 'APP_NOTIFICATION' || data.type === 'App Notification';
                    const isSuperChat = data.category === 'SUPERCHAT' || data.type === 'SuperChat' || data.type === 'SuperSticker';

                    const currentSettings = settingsRef.current;
                    const showTip = isTip && currentSettings.enableTips !== false;
                    const showSC = isSuperChat && currentSettings.enableSuperChats !== false;

                    if (showTip || showSC) {
                        const newAlert = {
                            id: Date.now() + Math.random(),
                            author: data.author || data.user || 'Anonymous',
                            amount: data.amount || (data.meta && data.meta.amount) || 0,
                            message: data.message || '',
                            currency: data.currency || (data.meta && data.meta.currency) || 'INR'
                        };
                        setAlerts(prev => [...prev, newAlert]);
                    }
                } catch (e) {
                    console.error('WS Parse Error', e);
                }
            };

            ws.current.onclose = () => {
                setStatus("❌ Disconnected. Retrying...");
                setShowStatus(true);
                setTimeout(connect, 3000);
            };
            ws.current.onerror = (err) => {
                console.error("WS Error", err);
                setStatus("⚠️ Connection Error");
                setShowStatus(true);
            };
        };

        connect();

        // CHECK FOR TEST MODE
        const params = new URLSearchParams(window.location.search);
        if (params.get('test')) {
            // Prevent duplicate test alerts (e.g. strict mode)
            if (window.hasRunSuperChatTest) return;
            window.hasRunSuperChatTest = true;

            console.log("Test Mode Active: Generating Sample Super Chat");
            setTimeout(() => {
                setAlerts(prev => [...prev, {
                    id: Date.now(),
                    author: 'Test User',
                    amount: 500,
                    message: 'This is a test Super Chat! Settings are active.',
                    currency: 'INR'
                }]);
            }, 1000);
        }

        return () => {
            if (ws.current) ws.current.close();
        };
    }, []);

    const handleComplete = (id) => {
        setAlerts(prev => prev.filter(a => a.id !== id));
    };

    return (
        <>
            <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
            * { box-sizing: border-box; }

            #alert-container {
                font-family: 'Roboto', sans-serif;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column; /* Force Stack */
                justify-content: ${(settings.verticalAlignment === 'bottom') ? 'flex-end' : 'flex-start'};
                align-items: ${(settings.horizontalAlignment === 'flex-end') ? 'flex-end' : (settings.horizontalAlignment === 'center') ? 'center' : 'flex-start'};
                gap: 10px;
                padding-top: ${(settings.verticalAlignment === 'bottom') ? 0 : settings.topMargin}px;
                padding-bottom: ${(settings.verticalAlignment === 'bottom') ? settings.topMargin : 0}px;
                padding-left: ${settings.sidePadding || 20}px;
                padding-right: ${settings.sidePadding || 20}px;
                pointer-events: none;
            }

            .superchat-card {
                width: 100%;
                max-width: ${settings.maxWidth || 480}px;
                pointer-events: auto;
                position: relative;
                margin-bottom: 8px;
                animation: slideIn 0.4s cubic-bezier(0.0, 0.0, 0.2, 1) forwards;
                transition: all 0.5s cubic-bezier(0.25, 1, 0.5, 1);
                /* Ensure it doesn't stretch full width if aligned to side */
                flex-shrink: 0; 
            }

            .pill-wrapper {
                width: 100%;
                height: 100%;
                border-radius: 16px;
                box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
                overflow: hidden;
                position: relative;
                transition: all 0.5s ease;
            }

            .particle-container {
            }
            .particle {
                position: absolute; width: 8px; height: 8px; border-radius: 50%;
                top: 0; left: 0; opacity: 0; transform: translate(-50%, -50%);
            }
            .timer-bar {
                position: absolute; top: 0; left: 0; height: 100%; width: 100%; z-index: 0; 
            }
            .timer-bar.shrinking {
                animation-name: shrinkWidth; animation-timing-function: linear; animation-fill-mode: forwards;
            }
            .superchat-header {
                position: relative; z-index: 2; padding: 10px 16px; display: flex;
                align-items: center; width: 100%; box-shadow: 0 1px 2px rgba(0,0,0,0.1); 
                transition: background-color 0.3s ease;
            }
            .superchat-body {
                position: relative; z-index: 2; padding: 16px; font-size: 15px; 
                word-wrap: break-word; line-height: 1.5;
            }
            .superchat-card.ticker-mode {
                order: 1; flex-basis: auto; flex-grow: 0; width: auto; max-width: 100%; margin-bottom: 0;    
            }
            .ticker-mode .pill-wrapper {
                width: fit-content; max-width: 280px; min-width: 120px; border-radius: 50px; 
                display: flex; align-items: center; padding-right: 16px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2); 
            }
            .ticker-mode .superchat-body { display: none !important; }
            .ticker-mode .superchat-header {
                background-color: transparent !important; box-shadow: none !important; 
                padding: 4px; width: auto; 
            }
            .ticker-mode .user-avatar {
                width: 32px; height: 32px; margin-right: 10px; border: none; flex-shrink: 0; 
            }
            .ticker-mode .header-text {
                flex-direction: row; align-items: center; gap: 8px; overflow: hidden; white-space: nowrap; 
            }
            .username { font-weight: 700; font-size: 18px; opacity: 1; }
            .ticker-mode .username { font-size: 15px; font-weight: 500; }
            .amount { font-weight: 700; font-size: 15px; }
            .user-avatar { width: 40px; height: 40px; border-radius: 50%; margin-right: 16px; }
            .header-text { display: flex; flex-direction: column; justify-content: center; }
            
            .card-exit .pill-wrapper { opacity: 0; }
            .card-exit .particle { animation: bang 0.6s ease-out forwards; }
            .card-exit .p1 { --tx: 0px; --ty: -80px; } 
            .card-exit .p2 { --tx: 60px; --ty: -60px; } 
            .card-exit .p3 { --tx: 80px; --ty: 0px; }   
            .card-exit .p4 { --tx: 60px; --ty: 60px; }  
            .card-exit .p5 { --tx: 0px; --ty: 80px; }   
            .card-exit .p6 { --tx: -60px; --ty: 60px; } 
            .card-exit .p7 { --tx: -80px; --ty: 0px; }  
            .card-exit .p8 { --tx: -60px; --ty: -60px; } 
            .card-exit .p9  { --tx: 0px; --ty: -40px; }
            .card-exit .p10 { --tx: 40px; --ty: 0px; }
            .card-exit .p11 { --tx: 0px; --ty: 40px; }
            .card-exit .p12 { --tx: -40px; --ty: 0px; }

            @keyframes slideIn { 0% { transform: translateY(-20px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
            @keyframes shrinkWidth { from { width: 100%; } to { width: 0%; } }
            @keyframes bang { 0% { transform: translate(-50%, -50%) scale(1); opacity: 1; } 100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0); opacity: 0; } }
            `}</style>

            {showStatus && (
                <div style={{
                    position: 'fixed', bottom: 20, right: 20,
                    background: 'rgba(0, 0, 0, 0.8)', color: '#fff',
                    padding: '10px 16px', borderRadius: '8px',
                    fontFamily: 'sans-serif', fontSize: '14px', zIndex: 10000,
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    {status}
                </div>
            )}

            <div id="alert-container">
                {alerts.map(alert => (
                    <SuperChatCard
                        key={alert.id}
                        data={alert}
                        onComplete={handleComplete}
                        settings={settings}
                    />
                ))}
            </div>
        </>
    )
}
