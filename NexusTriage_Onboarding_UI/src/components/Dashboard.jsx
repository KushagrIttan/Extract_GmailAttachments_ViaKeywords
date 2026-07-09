import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, MessageSquare, AlertTriangle, FileText, Play, Settings,
  RefreshCw, CheckCircle2, XCircle, Loader2, Zap, Tag, TrendingUp,
  ChevronDown, Clock, ArrowRight, Shield, Smartphone, BarChart3
} from 'lucide-react';

const API = '';

export default function Dashboard({ onReset }) {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState(null);
  const [scanning, setScanning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [st, svc] = await Promise.all([
        fetch(`${API}/api/stats`).then(r => r.json()),
        fetch(`${API}/api/status`).then(r => r.json()),
      ]);
      setStats(st);
      setStatus(svc);
    } catch {}
  }, []);

  useEffect(() => { refresh(); const i = setInterval(refresh, 15000); return () => clearInterval(i); }, [refresh]);

  const triggerScan = async () => {
    setScanning(true);
    try {
      await fetch(`${API}/api/trigger-scan`, { method: 'POST' });
      setTimeout(refresh, 3000);
    } catch {}
    setTimeout(() => setScanning(false), 5000);
  };

  return (
    <div className="dashboard-shell">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-logo">
          <div className="logo-mark" />
          <span>NexusTriage</span>
        </div>
        <div className="dash-header-actions">
          <StatusPill label="Postgres" ok={status?.postgres} />
          <StatusPill label="n8n" ok={status?.n8n} />
          <StatusPill label="WhatsApp" ok={status?.evolution} />
          <button className="btn-icon" onClick={refresh} title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button className="btn-icon" onClick={onReset} title="Settings">
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      {stats && (
        <div className="stats-bar">
          <StatCard icon={<Mail size={16} />} label="Emails Analyzed" value={stats.total_emails} color="#ea4335" />
          <StatCard icon={<MessageSquare size={16} />} label="WA Messages" value={stats.total_wa_messages} color="#25d366" />
          <StatCard icon={<AlertTriangle size={16} />} label="Pending Escalations" value={stats.pending_escalations} color="#f59e0b" />
          <StatCard icon={<FileText size={16} />} label="Drafts Created" value={stats.total_drafts} color="#8b5cf6" />
          <StatCard icon={<Tag size={16} />} label="Keywords" value={stats.total_keywords} color="#2aabee" />
        </div>
      )}

      {/* Run Button */}
      <div className="run-bar">
        <button className={`btn-run ${scanning ? 'scanning' : ''}`} onClick={triggerScan} disabled={scanning}>
          {scanning ? (
            <><Loader2 size={18} className="spin" /> Running Scan...</>
          ) : (
            <><Play size={18} /> Run Email Scan Now</>
          )}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="tab-bar">
        {[
          { id: 'overview', icon: BarChart3, label: 'Emails' },
          { id: 'whatsapp', icon: Smartphone, label: 'WhatsApp' },
          { id: 'escalations', icon: AlertTriangle, label: 'Escalations' },
          { id: 'drafts', icon: FileText, label: 'Drafts' },
        ].map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        <AnimatePresence mode="wait">
          {tab === 'overview' && <EmailsPanel key="emails" />}
          {tab === 'whatsapp' && <WhatsAppPanel key="wa" />}
          {tab === 'escalations' && <EscalationsPanel key="esc" />}
          {tab === 'drafts' && <DraftsPanel key="drafts" />}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatusPill({ label, ok }) {
  return (
    <div className={`status-pill ${ok ? 'ok' : 'err'}`}>
      {ok ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
      {label}
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ color, background: `${color}15` }}>{icon}</div>
      <div className="stat-info">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </div>
    </div>
  );
}

// ═══ Emails Panel ═══
function EmailsPanel() {
  const [rows, setRows] = useState([]);
  useEffect(() => { fetch(`${API}/api/email-results`).then(r => r.json()).then(setRows).catch(() => {}); }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {rows.length === 0 ? (
        <EmptyState icon={<Mail size={32} />} text="No emails analyzed yet. Add keywords and run a scan." />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Keyword</th><th>Sender</th><th>Subject</th><th>Sentiment</th><th>Summary</th><th>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td><span className="badge badge-purple">{r.keyword}</span></td>
                  <td>{r.sender}</td>
                  <td className="td-subject">{r.subject}</td>
                  <td><SentimentBadge s={r.sentiment} /></td>
                  <td className="td-summary">{r.summary}</td>
                  <td className="td-time">{fmtTime(r.processed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

// ═══ WhatsApp Panel ═══
function WhatsAppPanel() {
  const [rows, setRows] = useState([]);
  useEffect(() => { fetch(`${API}/api/wa-messages`).then(r => r.json()).then(setRows).catch(() => {}); }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {rows.length === 0 ? (
        <EmptyState icon={<MessageSquare size={32} />} text="No WhatsApp messages received yet. Make sure WhatsApp is connected." />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sender</th><th>Message</th><th>Intent</th><th>Confidence</th><th>Status</th><th>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{r.sender_name}</td>
                  <td className="td-summary">{r.body}</td>
                  <td><IntentBadge i={r.intent} /></td>
                  <td>{r.confidence ? `${r.confidence}%` : '—'}</td>
                  <td><span className={`badge badge-${r.status === 'sent' ? 'green' : 'gray'}`}>{r.status}</span></td>
                  <td className="td-time">{fmtTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

// ═══ Escalations Panel ═══
function EscalationsPanel() {
  const [rows, setRows] = useState([]);
  useEffect(() => { fetch(`${API}/api/escalations`).then(r => r.json()).then(setRows).catch(() => {}); }, []);

  const resolve = async (id) => {
    await fetch(`${API}/api/escalations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Resolved' })
    });
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: 'Resolved' } : r));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {rows.length === 0 ? (
        <EmptyState icon={<Shield size={32} />} text="No escalations. Your inbox is clean!" />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sender</th><th>Message</th><th>Intent</th><th>Confidence</th><th>Reason</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{r.sender}</td>
                  <td className="td-summary">{r.message}</td>
                  <td><IntentBadge i={r.intent} /></td>
                  <td>{r.confidence ? `${r.confidence}%` : '—'}</td>
                  <td className="td-summary">{r.reason}</td>
                  <td><span className={`badge badge-${r.status === 'Pending' ? 'yellow' : 'green'}`}>{r.status}</span></td>
                  <td>
                    {r.status === 'Pending' && (
                      <button className="btn-sm" onClick={() => resolve(r.id)}>Resolve</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

// ═══ Drafts Panel ═══
function DraftsPanel() {
  const [rows, setRows] = useState([]);
  useEffect(() => { fetch(`${API}/api/email-drafts`).then(r => r.json()).then(setRows).catch(() => {}); }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {rows.length === 0 ? (
        <EmptyState icon={<FileText size={32} />} text="No AI drafts yet. Run a scan to generate drafts for matching emails." />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Original Subject</th><th>Sender</th><th>AI Draft</th><th>Status</th><th>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="td-subject">{r.original_subject}</td>
                  <td>{r.original_sender}</td>
                  <td className="td-summary">{r.draft_body}</td>
                  <td><span className="badge badge-purple">{r.status}</span></td>
                  <td className="td-time">{fmtTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

// ═══ Helpers ═══
function EmptyState({ icon, text }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <p>{text}</p>
    </div>
  );
}

function SentimentBadge({ s }) {
  const colors = { Positive: 'green', Negative: 'red', Neutral: 'gray', Mixed: 'yellow' };
  return <span className={`badge badge-${colors[s] || 'gray'}`}>{s || '—'}</span>;
}

function IntentBadge({ i }) {
  const colors = { General: 'blue', Escalation: 'yellow', Spam: 'gray', Scam: 'red' };
  return <span className={`badge badge-${colors[i] || 'gray'}`}>{i || '—'}</span>;
}

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}
