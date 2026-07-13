import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  Mail, MessageSquare, QrCode, ArrowRight, Check,
  ChevronRight, Smartphone, Home, Zap, Shield, FileText, Bell, Eye,
  Key, Tag, X, Plus, Loader2
} from 'lucide-react';

const TOTAL_STEPS = 7;

const transition = { duration: 0.4, ease: [0.22, 1, 0.36, 1] };
const slideUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition },
  exit: { opacity: 0, y: -16, transition: { duration: 0.25 } }
};
const stagger = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { ...transition, delay } }
});

export default function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState({
    groq_api_key: '',
    telegram_bot_token: '',
    telegram_chat_id: '',
    google_client_id: '',
    google_client_secret: '',
  });
  const [keywords, setKeywords] = useState([]);

  const next = useCallback(() => setStep(s => Math.min(s + 1, TOTAL_STEPS)), []);

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const saveConfig = async () => {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
  };

  const finishOnboarding = async () => {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarding_complete: 'true' })
    });
    if (onComplete) onComplete();
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Enter' && step < TOTAL_STEPS) next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, next]);

  return (
    <div className="onboarding-shell">
      <div className="top-bar">
        <div className="logo">
          <div className="logo-mark" />
          NexusTriage
        </div>
        <div className="step-counter">
          {step <= 6 ? `Step ${step} of 6` : 'Complete'}
        </div>
      </div>

      <div className="progress-track">
        <motion.div
          className="progress-fill"
          initial={{ width: '0%' }}
          animate={{ width: `${(Math.min(step, 6) / 6) * 100}%` }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        />
      </div>

      <div className="content-area">
        <AnimatePresence mode="wait">
          {step === 1 && <WelcomeStep key="1" onNext={next} />}
          {step === 2 && <ApiKeysStep key="2" onNext={() => { saveConfig(); next(); }} config={config} updateConfig={updateConfig} />}
          {step === 3 && <GmailStep key="3" onNext={() => { saveConfig(); next(); }} config={config} updateConfig={updateConfig} />}
          {step === 4 && <KeywordsStep key="4" onNext={next} keywords={keywords} setKeywords={setKeywords} />}
          {step === 5 && <TelegramStep key="5" onNext={() => { saveConfig(); next(); }} config={config} updateConfig={updateConfig} />}
          {step === 6 && <WhatsAppStep key="6" onNext={next} />}
          {step === 7 && <DoneStep key="7" onFinish={finishOnboarding} />}
        </AnimatePresence>
      </div>

      <Dock step={step} setStep={setStep} />
    </div>
  );
}

// ═══ STEP 1 — Welcome ═══
function WelcomeStep({ onNext }) {
  return (
    <motion.div className="step-container" {...slideUp} style={{ textAlign: 'center' }}>
      <motion.h1 className="hero-title" {...stagger(0.1)}>NexusTriage</motion.h1>
      <motion.p className="hero-sub" style={{ margin: '0 auto 40px' }} {...stagger(0.2)}>
        Connect your channels. Let AI handle the rest.
      </motion.p>
      <motion.div {...stagger(0.3)}>
        <button className="btn-primary" onClick={onNext}>
          Get Started <ArrowRight size={15} strokeWidth={2.5} />
        </button>
        <div className="kbd-hint">
          Press <span className="kbd">↵</span> to continue
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══ STEP 2 — API Keys (Groq) ═══
function ApiKeysStep({ onNext, config, updateConfig }) {
  const valid = config.groq_api_key.trim().length > 10;
  return (
    <motion.div className="step-container" {...slideUp}>
      <div className="service-badge" style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316' }}>
        <Key size={26} strokeWidth={1.8} />
      </div>
      <h2 className="step-title">AI Engine Setup</h2>
      <p className="step-desc">
        NexusTriage uses Groq's blazing-fast LLM API for email analysis, triage, and draft generation.
      </p>

      <div className="field">
        <label>Groq API Key *</label>
        <input
          type="password"
          placeholder="gsk_..."
          value={config.groq_api_key}
          onChange={e => updateConfig('groq_api_key', e.target.value)}
          autoFocus
        />
        <p className="field-hint">Get your free key at <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" style={{color: '#f97316'}}>console.groq.com</a></p>
      </div>

      <button
        className="btn-primary btn-brand"
        onClick={onNext}
        disabled={!valid}
        style={{ background: valid ? '#f97316' : '#525252', cursor: valid ? 'pointer' : 'not-allowed' }}
      >
        Save & Continue <ChevronRight size={15} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

// ═══ STEP 3 — Gmail Setup ═══
function GmailStep({ onNext, config, updateConfig }) {
  const [loading, setLoading] = useState(false);
  const valid = config.google_client_id.trim().length > 10 && config.google_client_secret.trim().length > 10;

  useEffect(() => {
    // If we just came back from Google OAuth, check URL params
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      setLoading(true);
      fetch('/api/gmail/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      }).then(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
        setLoading(false);
        onNext();
      }).catch(() => setLoading(false));
    }
  }, [onNext]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      // Save temp config to the server so it can use them in the OAuth callback
      const redirectUri = window.location.origin + window.location.pathname;
      const r = await fetch('/api/gmail/auth-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          clientId: config.google_client_id, 
          clientSecret: config.google_client_secret,
          redirectUri
        })
      });
      const data = await r.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    }
  };

  return (
    <motion.div className="step-container" {...slideUp}>
      <div className="service-badge" style={{ background: 'rgba(234,67,53,0.1)', color: '#ea4335' }}>
        <Mail size={26} strokeWidth={1.8} />
      </div>
      <h2 className="step-title">Connect Gmail</h2>
      <p className="step-desc">
        We need a Google Cloud OAuth app to read your emails safely. 
      </p>

      <div className="field">
        <label>Client ID *</label>
        <input
          type="text"
          placeholder="xxxxx.apps.googleusercontent.com"
          value={config.google_client_id}
          onChange={e => updateConfig('google_client_id', e.target.value)}
        />
      </div>
      <div className="field" style={{ marginBottom: 28 }}>
        <label>Client Secret *</label>
        <input
          type="password"
          placeholder="GOCSPX-..."
          value={config.google_client_secret}
          onChange={e => updateConfig('google_client_secret', e.target.value)}
        />
        <p className="field-hint">Need help? Create credentials at <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" style={{color: '#ea4335'}}>Google Cloud Console</a>.</p>
      </div>

      <button
        className="btn-primary btn-brand"
        onClick={handleConnect}
        disabled={!valid || loading}
        style={{ background: valid ? '#ea4335' : '#525252', cursor: valid && !loading ? 'pointer' : 'not-allowed' }}
      >
        {loading ? <Loader2 size={15} className="spin" /> : 'Sign in with Google'}
      </button>
      
      <div style={{ marginTop: 12, textAlign: 'center' }}>
         <button onClick={onNext} style={{ fontSize: 12, color: '#999', background: 'none', border: 'none', cursor: 'pointer' }}>Skip (already connected)</button>
      </div>
    </motion.div>
  );
}

// ═══ STEP 4 — Keywords ═══
function KeywordsStep({ onNext, keywords, setKeywords }) {
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  const addKeyword = async () => {
    if (!input.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: input.trim() })
      });
      const data = await r.json();
      if (data.id) setKeywords(prev => [data, ...prev]);
      setInput('');
    } catch {}
    setSaving(false);
  };

  const removeKeyword = async (id) => {
    await fetch(`/api/keywords/${id}`, { method: 'DELETE' });
    setKeywords(prev => prev.filter(k => k.id !== id));
  };

  useEffect(() => {
    fetch('/api/keywords').then(r => r.json()).then(setKeywords).catch(() => {});
  }, []);

  return (
    <motion.div className="step-container" {...slideUp}>
      <div className="service-badge" style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
        <Tag size={26} strokeWidth={1.8} />
      </div>
      <h2 className="step-title">Email Keywords</h2>
      <p className="step-desc">
        Add keywords to search your Gmail inbox for. Matching emails will be analyzed by AI.
      </p>

      <div className="keyword-input-row">
        <input
          type="text"
          placeholder="e.g. invoice, urgent, project update"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addKeyword()}
          autoFocus
        />
        <button className="btn-add-keyword" onClick={addKeyword} disabled={saving}>
          {saving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
        </button>
      </div>

      {keywords.length > 0 && (
        <div className="keyword-tags">
          {keywords.map(k => (
            <div key={k.id} className="keyword-tag">
              {k.keyword}
              <button onClick={() => removeKeyword(k.id)}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      <button
        className="btn-primary btn-brand"
        onClick={onNext}
        style={{ background: '#8b5cf6', marginTop: 24 }}
      >
        Continue <ChevronRight size={15} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

// ═══ STEP 5 — Telegram ═══
function TelegramStep({ onNext, config, updateConfig }) {
  return (
    <motion.div className="step-container" {...slideUp}>
      <div className="service-badge" style={{ background: 'rgba(42,171,238,0.1)', color: '#2aabee' }}>
        <MessageSquare size={26} strokeWidth={1.8} />
      </div>
      <h2 className="step-title">Telegram Bot</h2>
      <p className="step-desc">
        Where you'll receive triage alerts, approve WhatsApp replies, and get digest summaries.
      </p>

      <div className="field">
        <label>Bot Token</label>
        <input
          type="text"
          placeholder="Paste from @BotFather"
          value={config.telegram_bot_token}
          onChange={e => updateConfig('telegram_bot_token', e.target.value)}
          autoFocus
        />
      </div>

      <div className="field" style={{ marginBottom: 28 }}>
        <label>Chat ID</label>
        <input
          type="text"
          placeholder="e.g. 5188465720"
          value={config.telegram_chat_id}
          onChange={e => updateConfig('telegram_chat_id', e.target.value)}
        />
      </div>

      <button
        className="btn-primary btn-brand"
        onClick={onNext}
        style={{ background: '#2aabee' }}
      >
        Save & Continue <ChevronRight size={15} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

// ═══ STEP 6 — WhatsApp ═══
function WhatsAppStep({ onNext }) {
  const [qrData, setQrData] = useState(null);
  const [status, setStatus] = useState('disconnected');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        // Try to create instance first
        await fetch('/api/whatsapp/connect', { method: 'POST' });
      } catch {}
      // Then get QR
      fetchQR();
    };
    init();
  }, []);

  const fetchQR = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/whatsapp/qr');
      const data = await r.json();
      if (data.base64) setQrData(data.base64);
      else if (data.code) setQrData(data.code);
      else if (data.instance?.state === 'open') setStatus('connected');
    } catch {}
    setLoading(false);
  };

  // Poll connection status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const r = await fetch('/api/whatsapp/status');
        const data = await r.json();
        if (data.instance?.state === 'open' || data.state === 'open') {
          setStatus('connected');
          clearInterval(interval);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div className="step-container" {...slideUp}>
      <div className="service-badge" style={{ background: 'rgba(37,211,102,0.1)', color: '#25d366' }}>
        <Smartphone size={26} strokeWidth={1.8} />
      </div>
      <h2 className="step-title">Link WhatsApp</h2>
      <p className="step-desc">
        {status === 'connected'
          ? 'WhatsApp connected successfully!'
          : 'Scan this QR code with your phone to connect.'}
      </p>

      {status === 'connected' ? (
        <div className="wa-connected">
          <div className="done-check" style={{ marginBottom: 16 }}>
            <svg viewBox="0 0 80 80" style={{ width: 60, height: 60 }}>
              <circle className="check-circle" cx="40" cy="40" r="38" style={{ stroke: '#25d366' }} />
              <polyline className="check-mark" points="25,42 35,52 55,30" style={{ stroke: '#25d366' }} />
            </svg>
          </div>
        </div>
      ) : (
        <div className="qr-container">
          <div className="qr-frame">
            {loading ? (
              <div style={{ width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={32} className="spin" color="#8b5cf6" />
              </div>
            ) : qrData ? (
              <img src={qrData.startsWith('data:') ? qrData : `data:image/png;base64,${qrData}`} alt="QR Code" style={{ width: 200, height: 200 }} />
            ) : (
              <div style={{ width: 140, height: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <QrCode size={80} color="#999" strokeWidth={1} />
                <button onClick={fetchQR} style={{ fontSize: 11, color: '#8b5cf6', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
              </div>
            )}
            {!loading && (
              <motion.div
                className="qr-scanner"
                animate={{ top: ['0%', '100%', '0%'], opacity: [0, 0.7, 0.7, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                style={{ background: '#25d366', boxShadow: '0 0 12px rgba(37,211,102,0.5)' }}
              />
            )}
          </div>
        </div>
      )}

      <button
        className="btn-primary btn-brand"
        onClick={onNext}
        style={{ background: '#25d366' }}
      >
        {status === 'connected' ? 'Continue' : "Skip for now"} <ChevronRight size={15} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

// ═══ STEP 7 — Done ═══
function DoneStep({ onFinish }) {
  return (
    <motion.div className="step-container" style={{ textAlign: 'center' }} {...slideUp}>
      <div className="done-check">
        <svg viewBox="0 0 80 80">
          <circle className="check-circle" cx="40" cy="40" r="38" />
          <polyline className="check-mark" points="25,42 35,52 55,30" />
        </svg>
      </div>
      <motion.h2 className="done-title" {...stagger(0.5)}>You're all set</motion.h2>
      <motion.p className="done-body" {...stagger(0.6)}>
        All channels configured successfully.<br />
        NexusTriage is ready to go.
      </motion.p>
      <motion.div {...stagger(0.7)}>
        <button className="btn-primary" onClick={onFinish} style={{ marginTop: 24 }}>
          Open Dashboard <ArrowRight size={15} strokeWidth={2.5} />
        </button>
      </motion.div>
    </motion.div>
  );
}

// ═══ DOCK ═══
const DOCK_ITEMS = [
  { icon: Home, label: 'Welcome', s: 1 },
  { icon: Key, label: 'API Keys', s: 2 },
  { icon: Mail, label: 'Gmail', s: 3 },
  { icon: Tag, label: 'Keywords', s: 4 },
  { icon: MessageSquare, label: 'Telegram', s: 5 },
  { icon: Smartphone, label: 'WhatsApp', s: 6 },
  { icon: Zap, label: 'Done', s: 7 },
];

function Dock({ step, setStep }) {
  const mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      className="dock-wrap"
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.6, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="dock-bar"
        onMouseMove={e => mouseX.set(e.pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
      >
        {DOCK_ITEMS.map(item => (
          <DockIcon
            key={item.s}
            mouseX={mouseX}
            active={step === item.s}
            completed={step > item.s}
            onClick={() => setStep(item.s)}
            label={item.label}
          >
            <item.icon size={16} strokeWidth={2} />
          </DockIcon>
        ))}
      </div>
    </motion.div>
  );
}

function DockIcon({ children, mouseX, active, completed, onClick, label }) {
  const ref = useRef(null);
  const [hovered, setHovered] = useState(false);
  const dist = useTransform(mouseX, val => {
    const r = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - r.x - r.width / 2;
  });
  const size = useSpring(
    useTransform(dist, [-100, 0, 100], [38, 52, 38]),
    { mass: 0.08, stiffness: 180, damping: 14 }
  );
  const cls = `dock-btn${active ? ' active' : ''}${completed && !active ? ' completed' : ''}`;
  return (
    <motion.button
      ref={ref}
      style={{ width: size, height: size }}
      className={cls}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {completed && !active ? <Check size={14} strokeWidth={2.5} /> : children}
      <AnimatePresence>
        {hovered && (
          <motion.span
            className="dock-tooltip"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 3 }}
            transition={{ duration: 0.12 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
