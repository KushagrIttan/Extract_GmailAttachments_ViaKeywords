import { useEffect, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import Onboarding from './Onboarding'
import Leads from './Leads'
import './index.css'

interface Stats {
  total_emails: number;
  pending_escalations: number;
  total_wa_messages: number;
  total_drafts: number;
  total_keywords: number;
  total_leads: number;
  gmail_connected: boolean;
  wa_connected: boolean;
  telegram_connected: boolean;
  sheets_connected: boolean;
  linkedin_connected: boolean;
}

interface LeadStats {
  total: number;
  byStatus: { status: string; count: number }[];
  bySource: { source: string; count: number }[];
  pctContacted: number;
  pctConverted: number;
}

interface LogEntry {
  id: string;
  time: string;
  source: string;
  message: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'leads'>('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [escalations, setEscalations] = useState<any[]>([]);
  const [linkedinQueue, setLinkedinQueue] = useState<any[]>([]);
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [signalRState, setSignalRState] = useState<string>('Connecting...');
  const [voiceTone, setVoiceTone] = useState<string>('');
  const [connHealth, setConnHealth] = useState<Record<string, {status: string, message: string}>>({});

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setIsOnboarded(data.isOnboarded === 'true');
        if (data.whatsapp_voice_tone) setVoiceTone(data.whatsapp_voice_tone);
      })
      .catch(err => {
        console.error("Config fetch error:", err);
        setIsOnboarded(false);
      });

    const fetchStats = () => {
      fetch('/api/stats')
        .then(res => res.json())
        .then(data => setStats(data))
        .catch(err => console.error("Stats fetch error:", err));

      fetch('/api/stats/escalations')
        .then(res => res.json())
        .then(data => setEscalations(data))
        .catch(err => console.error("Escalations fetch error:", err));
        
      fetch('/api/stats/leads')
        .then(res => res.json())
        .then(data => setLeadStats(data))
        .catch(err => console.error("Lead stats fetch error:", err));

      fetch('/api/stats/linkedin-queue')
        .then(res => res.json())
        .then(data => setLinkedinQueue(data))
        .catch(err => console.error("LinkedIn queue fetch error:", err));
    };

    const fetchConnections = () => {
      fetch('/api/health/all')
        .then(res => res.json())
        .then(data => setConnHealth(data))
        .catch(err => console.error("Connection health fetch error:", err));
    };

    fetchStats();
    fetchConnections();
    
    // Poll stats every 30 seconds, connections every 60 seconds
    const statsInterval = setInterval(fetchStats, 30000);
    const connInterval = setInterval(fetchConnections, 60000);

    const connection = new signalR.HubConnectionBuilder()
      .withUrl("/hub/activity")
      .withAutomaticReconnect()
      .build();

    connection.on("ReceiveLog", (log: LogEntry) => {
      setLogs(prev => [log, ...prev].slice(0, 100));
      // Refetch stats when activity occurs so scores update instantly
      fetchStats();
      fetchConnections();
    });
    
    connection.on("LeadStatusChanged", () => {
      fetchStats();
    });

    connection.onreconnecting(() => setSignalRState('Reconnecting...'));
    connection.onreconnected(() => { setSignalRState('Online'); fetchConnections(); });
    connection.onclose(() => setSignalRState('Disconnected'));

    connection.start().then(() => { setSignalRState('Online'); fetchConnections(); }).catch(err => {
      console.error("SignalR Connection Error:", err);
      setSignalRState('Disconnected');
    });

    return () => {
      clearInterval(statsInterval);
      clearInterval(connInterval);
      connection.stop();
    };
  }, []);

  const handleCopyLinkedin = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    // Mark as resolved locally for now
    setLinkedinQueue(prev => prev.filter(q => q.id !== id));
  };

  if (isOnboarded === null) return <div style={{padding: '2rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)'}}>LOADING SYSTEM...</div>;
  if (isOnboarded === false) return <Onboarding onComplete={() => setIsOnboarded(true)} />;

  return (
    <div className="panel-container">
      <header className="header-panel panel">
        <div style={{display: 'flex', alignItems: 'center', gap: '2rem'}}>
          <h1 className="title">SWITCHBOARD</h1>
          <div style={{display: 'flex', gap: '1rem'}}>
            <button 
              onClick={() => setActiveTab('dashboard')} 
              style={{background: activeTab === 'dashboard' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'dashboard' ? 'var(--bg-base)' : 'var(--text-primary)', border: '1px solid var(--accent-primary)', padding: '0.3rem 1rem', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 'bold'}}>
              DASHBOARD
            </button>
            <button 
              onClick={() => setActiveTab('leads')} 
              style={{background: activeTab === 'leads' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'leads' ? 'var(--bg-base)' : 'var(--text-primary)', border: '1px solid var(--accent-primary)', padding: '0.3rem 1rem', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 'bold'}}>
              LEADS PIPELINE
            </button>
          </div>
        </div>
        <div className="status-indicator" style={{ color: signalRState === 'Online' ? 'var(--accent-secondary)' : '#e74c3c' }}>
          <div className="status-dot" style={signalRState !== 'Online' ? { backgroundColor: '#e74c3c', animation: 'pulse-red 2s infinite' } : {}}></div>
          {signalRState.toUpperCase()}
        </div>
      </header>
      
      <main className="panel">
        {activeTab === 'leads' ? (
          <Leads />
        ) : (
          <>
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
                  <span className="stat-label">Total Leads</span>
                  <span className="stat-value">{stats?.total_leads ?? '-'}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">WA Messages</span>
                  <span className="stat-value">{stats?.total_wa_messages ?? '-'}</span>
                </div>
              </div>
            </section>
            
            <section style={{marginTop: '2rem'}}>
              <h2 className="stat-label" style={{marginBottom: '1rem'}}>Lead Conversions</h2>
              <div className="stats-grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'}}>
                <div className="stat-box" style={{borderColor: '#8b5cf6'}}>
                  <span className="stat-label">Contact Rate</span>
                  <span className="stat-value">{leadStats?.pctContacted ?? 0}%</span>
                </div>
                <div className="stat-box" style={{borderColor: 'var(--accent-secondary)'}}>
                  <span className="stat-label">Conversion Rate</span>
                  <span className="stat-value" style={{color: 'var(--accent-secondary)'}}>{leadStats?.pctConverted ?? 0}%</span>
                </div>
              </div>
            </section>

            <section className="live-feed-panel" style={{marginTop: '2rem'}}>
              <h2 className="stat-label" style={{marginBottom: '1rem'}}>LinkedIn Manual-Send Queue</h2>
              <div className="logs-container">
                {linkedinQueue.length === 0 ? (
                  <div className="log-entry" style={{color: 'var(--text-secondary)'}}>No pending LinkedIn replies.</div>
                ) : (
                  linkedinQueue.map(esc => {
                    const payload = JSON.parse(esc.fullMessagePayload);
                    // Match the cleanup regex from backend to strip "Option X:"
                    const replyText = payload.options ? payload.options[0].replace(/^(Option \d+:|Option\s\d+\s*-|Option\s\d+\.)\s*/i, '').trim() : "View in LinkedIn";
                    
                    return (
                      <div key={esc.id} className="log-entry" style={{borderLeft: '2px solid #3b82f6', flexDirection: 'column', alignItems: 'flex-start'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '0.5rem'}}>
                          <span className="log-source" style={{color: '#3b82f6'}}>[LI APPROVED] {payload.senderName}</span>
                          <a href={esc.threadUrl} target="_blank" rel="noreferrer" style={{color: '#3b82f6', fontSize: '0.75rem'}}>Open Thread ↗</a>
                        </div>
                        <div style={{color: 'white', background: '#1a1a1a', padding: '0.5rem', borderRadius: '4px', width: '100%', marginBottom: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.8rem'}}>
                          {replyText}
                        </div>
                        <button 
                          onClick={() => handleCopyLinkedin(replyText, esc.id)}
                          style={{background: '#3b82f6', color: 'white', border: 'none', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem'}}>
                          COPY TO CLIPBOARD
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            <section className="live-feed-panel" style={{marginTop: '2rem'}}>
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
          </>
        )}
      </main>

      <aside className="panel sidebar">
        <h2 className="stat-label" style={{marginBottom: '1rem', display: 'flex', justifyContent: 'space-between'}}>
          Connections
          <a href="/hangfire" target="_blank" rel="noreferrer" style={{color: 'var(--accent-primary)', textDecoration: 'none', fontSize: '0.75rem', border: '1px solid var(--accent-primary)', padding: '0.1rem 0.4rem'}}>JOBS DASHBOARD</a>
        </h2>
        
        {/* Helper to render a connection status row */}
        {[
          { key: 'sheets', label: 'Google Sheets Sync', okText: 'Connected', errText: 'Offline' },
          { key: 'linkedin', label: 'LinkedIn Poller', okText: 'Watching', errText: 'No Cookie' },
          { key: 'whatsapp', label: 'WhatsApp Green API', okText: 'Connected', errText: 'Offline' },
          { key: 'gmail', label: 'Gmail OAuth', okText: 'Connected', errText: 'Offline' },
          { key: 'telegram', label: 'Telegram Bot', okText: 'Connected', errText: 'Offline' },
        ].map(({ key, label, okText, errText }) => {
          const h = connHealth[key];
          const status = h?.status ?? 'unknown';
          const message = h?.message ?? 'Checking...';
          const isConnected = status === 'ok';
          return (
            <div key={key} className="stat-box" style={{marginBottom: '1rem'}}>
              <span className="stat-label">{label}</span>
              {isConnected ? (
                <span className="log-source" style={{color: '#4ade80'}}>{okText} <span className="animated-tick">✔</span></span>
              ) : (
                <span className="log-source" style={{color: status === 'unknown' ? 'var(--text-secondary)' : '#e74c3c'}} title={message}>
                  {status === 'not_configured' ? `${errText} 🔴` : status === 'error' ? `⚠ ${message}` : 'Checking...'}
                </span>
              )}
              {key === 'sheets' && isConnected && (
                <button onClick={() => fetch('/api/integrations/sheets/sync', { method: 'POST' })} style={{background: 'transparent', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.7rem', marginTop: '0.25rem'}}>SYNC</button>
              )}
            </div>
          );
        })}

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
      </aside>
    </div>
  )
}

export default App
