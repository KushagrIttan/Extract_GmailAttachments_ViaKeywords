import { useState, useEffect } from 'react';
import './index.css';

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [dbStatus, setDbStatus] = useState('Checking...');
  const [ollamaStatus, setOllamaStatus] = useState('Checking...');

  const [activeIntegration, setActiveIntegration] = useState<string | null>(null);
  
  const [creds, setCreds] = useState({
    telegramToken: '',
    telegramChatId: '',
    gmailClientId: '',
    gmailClientSecret: '',
    greenApiInstanceId: '',
    greenApiToken: ''
  });
  
  const [waQrCode, setWaQrCode] = useState<string | null>(null);
  const [waLoading, setWaLoading] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(data => {
      setCreds(prev => ({
        ...prev,
        telegramToken: data.telegramToken || prev.telegramToken,
        telegramChatId: data.telegramChatId || prev.telegramChatId,
        gmailClientId: data.GMAIL_CLIENT_ID || prev.gmailClientId,
        gmailClientSecret: data.GMAIL_CLIENT_SECRET || prev.gmailClientSecret,
        greenApiInstanceId: data.greenApiInstanceId || prev.greenApiInstanceId,
        greenApiToken: data.greenApiToken || prev.greenApiToken
      }));
      if (data.GmailRefreshToken) setGmailConnected(true);
    });
  }, []);

  const handleCredChange = (field: string, value: string) => {
    setCreds(prev => ({ ...prev, [field]: value }));
  };

  const saveCreds = async () => {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds)
    });
    setActiveIntegration(null);
  };

  const loadWaQr = async () => {
    setActiveIntegration('wa');
    if (waQrCode) return;
    
    setWaLoading(true);
    setWaError(null);
    try {
      const res = await fetch('/api/integrations/whatsapp/qr', { method: 'POST' });
      const data = await res.json();
      if (data.qr) {
        setWaQrCode(data.qr);
      } else {
        setWaError(data.error || 'Evolution API not ready yet. Make sure Docker is running.');
      }
    } catch (e: any) {
      setWaError('Could not reach backend. Is the API running?');
    }
    setWaLoading(false);
  };

  const startGmailAuth = async () => {
    if (!creds.gmailClientId || !creds.gmailClientSecret) {
      alert("Please provide Client ID and Client Secret first.");
      return;
    }
    
    // Save creds via the configure endpoint
    await fetch('/api/integrations/gmail/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: creds.gmailClientId, clientSecret: creds.gmailClientSecret })
    });

    const popup = window.open('/api/integrations/gmail/auth', '_blank', 'width=500,height=400');
    // Poll for popup close to update UI
    const timer = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(timer);
        setGmailConnected(true);
      }
    }, 500);
  };

  const checkReadiness = async () => {
    // In a real implementation this hits health endpoints
    setTimeout(() => setDbStatus('OK 🟢'), 500);
    setTimeout(() => setOllamaStatus('OK 🟢'), 800);
    setTimeout(() => setStep(2), 1500);
  };

  const skipToDashboard = () => {
    // Save to /api/config that onboarding is done
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isOnboarded: 'true' })
    }).then(onComplete);
  };

  return (
    <div className="panel-container" style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
      <div className="panel" style={{width: '600px', border: '1px solid var(--border-color)'}}>
        <h1 className="title" style={{marginBottom: '2rem'}}>SWITCHBOARD // INITIALIZATION</h1>
        
        {step === 1 && (
          <div>
            <h2 className="stat-label">Step 1: System Readiness Check</h2>
            <div className="stat-box" style={{marginTop: '1rem', marginBottom: '1rem'}}>
              <div>PostgreSQL Database: <span className="log-source">{dbStatus}</span></div>
              <div>Ollama Engine: <span className="log-source">{ollamaStatus}</span></div>
            </div>
            <button 
              onClick={checkReadiness}
              style={{padding: '0.5rem 1rem', background: 'var(--bg-base)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', cursor: 'pointer', fontFamily: 'var(--font-mono)'}}>
              RUN DIAGNOSTICS
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="stat-label">Step 2: Connect Integrations</h2>
            <div className="stat-box" style={{marginTop: '1rem', marginBottom: '1rem'}}>
              
              {/* GMAIL */}
              <div style={{marginBottom: '1rem'}}>
                <span>[ Gmail OAuth2 ] </span>
                <button onClick={() => setActiveIntegration(activeIntegration === 'gmail' ? null : 'gmail')} style={{background:'transparent', border:'1px solid var(--text-secondary)', color:'white', marginLeft:'1rem', padding:'0.2rem 0.5rem', cursor: 'pointer'}}>CONFIGURE</button>
                {gmailConnected && <span style={{color: '#4ade80', fontFamily: 'var(--font-mono)', marginLeft: '1rem'}}>CONNECTED 🟢</span>}
                {activeIntegration === 'gmail' && !gmailConnected && (
                  <div style={{marginTop: '1rem', paddingLeft: '1rem', borderLeft: '2px solid var(--accent-primary)'}}>
                    <input type="text" placeholder="Google Client ID" value={creds.gmailClientId} onChange={e => handleCredChange('gmailClientId', e.target.value)} style={{width: '90%', padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'white', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)'}} />
                    <input type="password" placeholder="Google Client Secret" value={creds.gmailClientSecret} onChange={e => handleCredChange('gmailClientSecret', e.target.value)} style={{width: '90%', padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'white', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)'}} />
                    <button onClick={startGmailAuth} style={{padding: '0.3rem 0.8rem', background: 'var(--accent-primary)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer'}}>CONNECT WITH GOOGLE</button>
                  </div>
                )}
              </div>

              {/* WHATSAPP */}
              <div style={{marginBottom: '1rem'}}>
                <span>[ WhatsApp Green API ] </span>
                <button onClick={() => setActiveIntegration(activeIntegration === 'wa' ? null : 'wa')} style={{background:'transparent', border:'1px solid var(--text-secondary)', color:'white', marginLeft:'1rem', padding:'0.2rem 0.5rem', cursor: 'pointer'}}>CONNECT</button>
                {activeIntegration === 'wa' && (
                  <div style={{marginTop: '1rem', paddingLeft: '1rem', borderLeft: '2px solid var(--accent-primary)'}}>
                    <input type="text" placeholder="Instance ID" value={creds.greenApiInstanceId} onChange={e => handleCredChange('greenApiInstanceId', e.target.value)} style={{width: '90%', padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'white', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)'}} />
                    <input type="password" placeholder="API Token" value={creds.greenApiToken} onChange={e => handleCredChange('greenApiToken', e.target.value)} style={{width: '90%', padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'white', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)'}} />
                    <button onClick={saveCreds} style={{padding: '0.3rem 0.8rem', background: 'var(--accent-primary)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer'}}>SAVE CREDENTIALS</button>
                  </div>
                )}
              </div>

              {/* TELEGRAM */}
              <div>
                <span>[ Telegram Bot ] </span>
                <button onClick={() => setActiveIntegration(activeIntegration === 'telegram' ? null : 'telegram')} style={{background:'transparent', border:'1px solid var(--text-secondary)', color:'white', marginLeft:'1rem', padding:'0.2rem 0.5rem'}}>CONNECT</button>
                {activeIntegration === 'telegram' && (
                  <div style={{marginTop: '1rem', paddingLeft: '1rem', borderLeft: '2px solid var(--accent-primary)'}}>
                    <input type="password" placeholder="Bot Token" value={creds.telegramToken} onChange={e => handleCredChange('telegramToken', e.target.value)} style={{width: '90%', padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'white', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)'}} />
                    <input type="text" placeholder="Chat ID" value={creds.telegramChatId} onChange={e => handleCredChange('telegramChatId', e.target.value)} style={{width: '90%', padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'white', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)'}} />
                    <button onClick={saveCreds} style={{padding: '0.3rem 0.8rem', background: 'var(--accent-primary)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer'}}>SAVE</button>
                  </div>
                )}
              </div>

            </div>
            <button 
              onClick={() => setStep(3)}
              style={{padding: '0.5rem 1rem', background: 'var(--bg-base)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', cursor: 'pointer', fontFamily: 'var(--font-mono)'}}>
              NEXT &gt;&gt;
            </button>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="stat-label">Step 3: Define Keyword Rules</h2>
            <div className="stat-box" style={{marginTop: '1rem', marginBottom: '1rem'}}>
              <p style={{color: 'var(--text-secondary)', fontSize: '0.85rem'}}>Enter keywords to flag escalations.</p>
              <input type="text" placeholder="e.g. URGENT, INVOICE, HELP" style={{width: '100%', padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'white', fontFamily: 'var(--font-mono)'}} />
            </div>
            <button 
              onClick={skipToDashboard}
              style={{padding: '0.5rem 1rem', background: 'var(--accent-primary)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 'bold'}}>
              COMPLETE SETUP
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
