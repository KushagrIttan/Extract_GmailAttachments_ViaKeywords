import { useEffect, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import Onboarding from './Onboarding'
import './index.css'

interface Stats {
  total_emails: number;
  pending_escalations: number;
  total_wa_messages: number;
  total_drafts: number;
  total_keywords: number;
  gmail_connected: boolean;
  wa_connected: boolean;
  telegram_connected: boolean;
}

interface LogEntry {
  id: string;
  time: string;
  source: string;
  message: string;
}

function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [escalations, setEscalations] = useState<any[]>([]);
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [signalRState, setSignalRState] = useState<string>('Connecting...');
  const [waChat, setWaChat] = useState<{sender: string, text: string, intent?: string}[]>([]);
  const [voiceTone, setVoiceTone] = useState<string>('');

  useEffect(() => {
    // Check Config for Onboarding Status and Voice Tone
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setIsOnboarded(data.isOnboarded === 'true');
        if (data.whatsapp_voice_tone) {
            setVoiceTone(data.whatsapp_voice_tone);
        }
      })
      .catch(err => {
        console.error("Config fetch error:", err);
        setIsOnboarded(false);
      });

    // Fetch initial stats and start polling
    const fetchStats = () => {
      fetch('/api/stats')
        .then(res => res.json())
        .then(data => setStats(data))
        .catch(err => console.error("Stats fetch error:", err));

      fetch('/api/stats/escalations')
        .then(res => res.json())
        .then(data => setEscalations(data))
        .catch(err => console.error("Escalations fetch error:", err));
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000); // poll every 5s

    // Connect SignalR (Assumes a Hub named /hub/activity in Phase 4)
    const connection = new signalR.HubConnectionBuilder()
      .withUrl("/hub/activity")
      .withAutomaticReconnect()
      .build();

    connection.on("ReceiveLog", (log: LogEntry) => {
      setLogs(prev => [log, ...prev].slice(0, 50)); // Keep last 50
    });

    connection.on("WhatsAppSimReply", (reply: any) => {
      setWaChat(prev => [...prev, { sender: 'ai', text: reply.reply, intent: reply.intent }]);
    });

    connection.onreconnecting(() => setSignalRState('Reconnecting...'));
    connection.onreconnected(() => setSignalRState('Online'));
    connection.onclose(() => setSignalRState('Disconnected'));

    connection.start().then(() => setSignalRState('Online')).catch(err => {
      console.error("SignalR Connection Error:", err);
      setSignalRState('Disconnected');
    });

    return () => {
      clearInterval(interval);
      connection.stop();
    };
  }, []);

  if (isOnboarded === null) return <div style={{padding: '2rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)'}}>LOADING SYSTEM...</div>;
  if (isOnboarded === false) return <Onboarding onComplete={() => setIsOnboarded(true)} />;

  return (
    <div className="panel-container">
      <header className="header-panel panel">
        <h1 className="title">SWITCHBOARD</h1>
        <div className="status-indicator" style={{ color: signalRState === 'Online' ? 'var(--accent-secondary)' : '#e74c3c' }}>
          <div className="status-dot" style={signalRState !== 'Online' ? { backgroundColor: '#e74c3c', animation: 'pulse-red 2s infinite' } : {}}></div>
          {signalRState.toUpperCase()}
        </div>
      </header>
      
      <main className="panel">
        <section>
          <h2 className="stat-label" style={{marginBottom: '1rem'}}>Global Metrics</h2>
          <div className="stats-grid">
            <div className="stat-box">
              <span className="stat-label">Pending Escalations</span>
              <span className="stat-value" style={{color: 'var(--accent-primary)'}}>{stats?.pending_escalations ?? '-'}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Processed Emails</span>
              <span className="stat-value">{stats?.total_emails ?? '-'}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Drafts Created</span>
              <span className="stat-value">{stats?.total_drafts ?? '-'}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">WA Messages</span>
              <span className="stat-value">{stats?.total_wa_messages ?? '-'}</span>
            </div>
          </div>
        </section>

        <section className="live-feed-panel">
          <h2 className="stat-label" style={{marginBottom: '1rem'}}>Live Activity Feed</h2>
          <div className="logs-container">
            {logs.length === 0 ? (
              <div className="log-entry" style={{color: 'var(--text-secondary)'}}>Waiting for agent activity...</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="log-entry">
                  <span className="log-time">[{log.time}]</span>
                  <span className="log-source">{log.source}</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="live-feed-panel" style={{marginTop: '2rem'}}>
          <h2 className="stat-label" style={{marginBottom: '1rem'}}>Active Escalations</h2>
          <div className="logs-container">
            {escalations.length === 0 ? (
              <div className="log-entry" style={{color: 'var(--text-secondary)'}}>No escalations in queue.</div>
            ) : (
              escalations.map(esc => (
                <div key={esc.id} className="log-entry" style={{borderLeft: '2px solid var(--accent-primary)'}}>
                  <span className="log-source" style={{color: 'var(--accent-primary)'}}>[URGENT]</span>
                  <span className="log-message" style={{color: 'white'}}>{esc.messagePreview}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <aside className="panel sidebar">
        <h2 className="stat-label" style={{marginBottom: '1rem', display: 'flex', justifyContent: 'space-between'}}>
          Connections
          <a href="/hangfire" target="_blank" rel="noreferrer" style={{color: 'var(--accent-primary)', textDecoration: 'none', fontSize: '0.75rem', border: '1px solid var(--accent-primary)', padding: '0.1rem 0.4rem'}}>JOBS DASHBOARD</a>
        </h2>
        <div className="stat-box" style={{marginBottom: '1rem', borderColor: 'var(--accent-secondary)'}}>
          <span className="stat-label">Model Engine</span>
          <span className="log-source" style={{fontSize: '0.7rem', wordBreak: 'break-all'}}>Ollama: hf.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF:Q4_K_M</span>
        </div>
        <div className="stat-box" style={{marginBottom: '1rem'}}>
          <span className="stat-label">WhatsApp Green API</span>
          {stats?.wa_connected ? (
            <span className="log-source" style={{color: '#4ade80'}}>Connected <span className="animated-tick">✔</span></span>
          ) : (
            <span className="log-source" style={{color: 'var(--text-secondary)'}}>Offline 🔴</span>
          )}
        </div>
        <div className="stat-box" style={{marginBottom: '1rem'}}>
          <span className="stat-label">Gmail OAuth</span>
          {stats?.gmail_connected ? (
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
              <span className="log-source" style={{color: '#4ade80'}}>Connected <span className="animated-tick">✔</span></span>
              <button onClick={() => fetch('/api/integrations/gmail/poll', { method: 'POST' })} style={{background: 'transparent', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.7rem'}}>SYNC NOW</button>
            </div>
          ) : (
            <span className="log-source" style={{color: 'var(--text-secondary)'}}>Offline 🔴</span>
          )}
        </div>
        <div className="stat-box" style={{marginBottom: '1rem'}}>
          <span className="stat-label">Telegram Bot</span>
          {stats?.telegram_connected ? (
            <span className="log-source" style={{color: '#4ade80'}}>Connected <span className="animated-tick">✔</span></span>
          ) : (
            <span className="log-source" style={{color: 'var(--text-secondary)'}}>Offline 🔴</span>
          )}
        </div>

        <h2 className="stat-label" style={{marginTop: '3rem', marginBottom: '1rem'}}>Settings</h2>
        <button 
          onClick={() => {
            fetch('/api/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isOnboarded: 'false' })
            }).then(() => setIsOnboarded(false));
          }}
          style={{width: '100%', padding: '0.5rem', background: 'transparent', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', cursor: 'pointer', fontFamily: 'var(--font-mono)'}}>
          RECONFIGURE SYSTEM
        </button>

        <h2 className="stat-label" style={{marginTop: '3rem', marginBottom: '1rem'}}>Keywords & Rules</h2>
        <div className="stat-box" style={{marginBottom: '1rem'}}>
          <span className="stat-label">Total Rules Active</span>
          <span className="stat-value">{stats?.total_keywords ?? '-'}</span>
        </div>
      </aside>
    </div>
  )
}

export default App
