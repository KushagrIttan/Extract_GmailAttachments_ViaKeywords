import { useEffect, useState } from 'react';
import './index.css';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  status: string;
  channel: string;
  lastContactedAt: string | null;
  notes: string;
  createdAt: string;
}

const STATUSES = ['New', 'Contacted', 'Replied', 'Converted', 'Dead'];

const STATUS_COLORS: Record<string, string> = {
  New: '#3b82f6',
  Contacted: '#E67E22',
  Replied: '#8b5cf6',
  Converted: '#27AE60',
  Dead: '#6b7280'
};

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [outreachModal, setOutreachModal] = useState<{ lead: Lead; channel: string } | null>(null);
  const [outreachMessage, setOutreachMessage] = useState('');

  const fetchLeads = () => {
    fetch('/api/leads')
      .then(r => r.json())
      .then(data => setLeads(data))
      .catch(err => console.error('Failed to fetch leads:', err));
  };

  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, 10000);
    return () => clearInterval(interval);
  }, []);

  const updateStatus = async (leadId: string, newStatus: string) => {
    await fetch(`/api/leads/${leadId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    fetchLeads();
  };

  const sendOutreach = async () => {
    if (!outreachModal) return;
    await fetch(`/api/leads/${outreachModal.lead.id}/outreach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: outreachModal.channel, message: outreachMessage })
    });
    setOutreachModal(null);
    setOutreachMessage('');
    fetchLeads();
  };

  const handleDragStart = (leadId: string) => setDraggedLead(leadId);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (status: string) => {
    if (draggedLead) {
      updateStatus(draggedLead, status);
      setDraggedLead(null);
    }
  };

  return (
    <div className="leads-view">
      <div className="leads-header">
        <h2 className="stat-label" style={{ fontSize: '1rem', margin: 0 }}>LEAD PIPELINE</h2>
        <span className="stat-label">{leads.length} total leads</span>
      </div>

      <div className="kanban-board">
        {STATUSES.map(status => {
          const columnLeads = leads.filter(l => l.status === status);
          return (
            <div
              key={status}
              className="kanban-column"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(status)}
            >
              <div className="kanban-column-header" style={{ borderBottomColor: STATUS_COLORS[status] }}>
                <span className="kanban-column-title" style={{ color: STATUS_COLORS[status] }}>{status.toUpperCase()}</span>
                <span className="kanban-column-count">{columnLeads.length}</span>
              </div>
              <div className="kanban-column-body">
                {columnLeads.map(lead => (
                  <div
                    key={lead.id}
                    className="kanban-card"
                    draggable
                    onDragStart={() => handleDragStart(lead.id)}
                  >
                    <div className="kanban-card-name">{lead.name || 'Unnamed'}</div>
                    {lead.email && <div className="kanban-card-detail">✉ {lead.email}</div>}
                    {lead.phone && <div className="kanban-card-detail">📱 {lead.phone}</div>}
                    {lead.source && <div className="kanban-card-source">{lead.source}</div>}

                    <div className="kanban-card-actions">
                      <select
                        value={lead.status}
                        onChange={e => updateStatus(lead.id, e.target.value)}
                        className="kanban-status-select"
                        style={{ borderColor: STATUS_COLORS[lead.status] }}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <div className="kanban-action-buttons">
                        <button
                          className="kanban-action-btn"
                          onClick={() => { setOutreachModal({ lead, channel: 'WhatsApp' }); setOutreachMessage(''); }}
                          title="Message via WhatsApp"
                        >💬</button>
                        <button
                          className="kanban-action-btn"
                          onClick={() => { setOutreachModal({ lead, channel: 'Email' }); setOutreachMessage(''); }}
                          title="Message via Email"
                        >📧</button>
                      </div>
                    </div>
                  </div>
                ))}
                {columnLeads.length === 0 && (
                  <div className="kanban-empty">No leads</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Outreach Modal */}
      {outreachModal && (
        <div className="modal-overlay" onClick={() => setOutreachModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="stat-label" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
              {outreachModal.channel === 'WhatsApp' ? '💬' : '📧'} OUTREACH — {outreachModal.lead.name}
            </h3>
            <div className="kanban-card-detail" style={{ marginBottom: '0.5rem' }}>
              Channel: {outreachModal.channel} | Contact: {outreachModal.channel === 'WhatsApp' ? outreachModal.lead.phone : outreachModal.lead.email}
            </div>
            <textarea
              value={outreachMessage}
              onChange={e => setOutreachMessage(e.target.value)}
              placeholder="Enter your message..."
              className="outreach-textarea"
              rows={4}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button onClick={sendOutreach} className="outreach-send-btn">SEND</button>
              <button onClick={() => setOutreachModal(null)} className="outreach-cancel-btn">CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
