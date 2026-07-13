const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const EVO_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || 'nexus_evo_secret_key';
const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';

// ────────────────────────────────────────────
// HEALTH CHECK
// ────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  const status = { postgres: false, n8n: false, evolution: false };
  try { await pool.query('SELECT 1'); status.postgres = true; } catch {}
  try {
    const r = await fetch(`${N8N_URL}/healthz`);
    status.n8n = r.ok;
  } catch {}
  try {
    const r = await fetch(`${EVO_URL}/instance/fetchInstances`, {
      headers: { apikey: EVO_KEY }
    });
    status.evolution = r.ok;
  } catch {}
  res.json(status);
});

// ────────────────────────────────────────────
// CONFIG (key-value store for onboarding)
// ────────────────────────────────────────────
app.get('/api/config', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM config');
    const cfg = {};
    rows.forEach(r => { cfg[r.key] = r.value; });
    res.json(cfg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config', async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO config (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
      );
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────
// KEYWORDS
// ────────────────────────────────────────────
app.get('/api/keywords', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM keywords ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/keywords', async (req, res) => {
  try {
    const { keyword } = req.body;
    if (!keyword?.trim()) return res.status(400).json({ error: 'Keyword required' });
    const { rows } = await pool.query(
      'INSERT INTO keywords (keyword) VALUES ($1) ON CONFLICT (keyword) DO NOTHING RETURNING *',
      [keyword.trim()]
    );
    res.json(rows[0] || { message: 'Already exists' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/keywords/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM keywords WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────
// EMAIL RESULTS
// ────────────────────────────────────────────
app.get('/api/email-results', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { rows } = await pool.query(
      'SELECT * FROM email_results ORDER BY processed_at DESC LIMIT $1', [limit]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────
// ESCALATIONS
// ────────────────────────────────────────────
app.get('/api/escalations', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM escalations ORDER BY created_at DESC LIMIT 50'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/escalations/:id', async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query('UPDATE escalations SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────
// WHATSAPP MESSAGES
// ────────────────────────────────────────────
app.get('/api/wa-messages', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM wa_messages ORDER BY created_at DESC LIMIT 50'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────
// EMAIL DRAFTS
// ────────────────────────────────────────────
app.get('/api/email-drafts', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM email_drafts ORDER BY created_at DESC LIMIT 50'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────
// WHATSAPP (Evolution API proxy)
// ────────────────────────────────────────────
app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    // Create instance
    const instanceName = 'nexustriage';
    const createResp = await fetch(`${EVO_URL}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhook: `${N8N_URL}/webhook/whatsapp-incoming`,
        webhookByEvents: false,
        webhookBase64: false
      })
    });
    const data = await createResp.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/whatsapp/qr', async (req, res) => {
  try {
    const instanceName = 'nexustriage';
    const r = await fetch(`${EVO_URL}/instance/connect/${instanceName}`, {
      headers: { apikey: EVO_KEY }
    });
    const data = await r.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/whatsapp/status', async (req, res) => {
  try {
    const instanceName = 'nexustriage';
    const r = await fetch(`${EVO_URL}/instance/connectionState/${instanceName}`, {
      headers: { apikey: EVO_KEY }
    });
    const data = await r.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────
// TRIGGER N8N WORKFLOW
// ────────────────────────────────────────────
app.post('/api/trigger-scan', async (req, res) => {
  try {
    const r = await fetch(`${N8N_URL}/webhook/trigger-email-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual', timestamp: new Date().toISOString() })
    });
    const data = await r.json();
    res.json({ success: true, n8n_response: data });
  } catch (e) {
    res.json({ success: false, error: e.message, hint: 'Make sure the n8n workflow is active' });
  }
});

// ────────────────────────────────────────────
// DASHBOARD STATS
// ────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [emails, escalations, messages, drafts, keywords] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM email_results'),
      pool.query("SELECT COUNT(*) as count FROM escalations WHERE status = 'Pending'"),
      pool.query('SELECT COUNT(*) as count FROM wa_messages'),
      pool.query('SELECT COUNT(*) as count FROM email_drafts'),
      pool.query('SELECT COUNT(*) as count FROM keywords'),
    ]);
    res.json({
      total_emails: parseInt(emails.rows[0].count),
      pending_escalations: parseInt(escalations.rows[0].count),
      total_wa_messages: parseInt(messages.rows[0].count),
      total_drafts: parseInt(drafts.rows[0].count),
      total_keywords: parseInt(keywords.rows[0].count),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────
// GMAIL OAUTH & API
// ────────────────────────────────────────────
app.post('/api/gmail/auth-url', async (req, res) => {
  try {
    const { clientId, clientSecret, redirectUri } = req.body;
    await pool.query(`INSERT INTO config (key, value, updated_at) VALUES ('google_client_id', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1`, [clientId]);
    await pool.query(`INSERT INTO config (key, value, updated_at) VALUES ('google_client_secret', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1`, [clientSecret]);
    await pool.query(`INSERT INTO config (key, value, updated_at) VALUES ('google_redirect_uri', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1`, [redirectUri]);

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/gmail.modify']
    });
    res.json({ url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/gmail/callback', async (req, res) => {
  try {
    const { code } = req.body;
    const { rows } = await pool.query("SELECT key, value FROM config WHERE key IN ('google_client_id', 'google_client_secret', 'google_redirect_uri')");
    const cfg = {};
    rows.forEach(r => cfg[r.key] = r.value);
    
    const oauth2Client = new google.auth.OAuth2(cfg.google_client_id, cfg.google_client_secret, cfg.google_redirect_uri);
    const { tokens } = await oauth2Client.getToken(code);
    
    if (tokens.refresh_token) {
      await pool.query(`INSERT INTO config (key, value, updated_at) VALUES ('google_refresh_token', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1`, [tokens.refresh_token]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/gmail/search', async (req, res) => {
  try {
    const { q } = req.body;
    const { rows } = await pool.query("SELECT key, value FROM config WHERE key IN ('google_client_id', 'google_client_secret', 'google_redirect_uri', 'google_refresh_token')");
    const cfg = {};
    rows.forEach(r => cfg[r.key] = r.value);

    const oauth2Client = new google.auth.OAuth2(cfg.google_client_id, cfg.google_client_secret, cfg.google_redirect_uri);
    oauth2Client.setCredentials({ refresh_token: cfg.google_refresh_token });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const searchRes = await gmail.users.messages.list({ userId: 'me', q: q, maxResults: 10 });
    const messages = searchRes.data.messages || [];
    
    const results = [];
    for (const msg of messages) {
      const msgRes = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const payload = msgRes.data.payload;
      const headers = payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const sender = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
      const to = headers.find(h => h.name === 'To')?.value || 'Unknown To';
      
      let body = '';
      if (payload.parts) {
        const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart && textPart.body && textPart.body.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
        }
      } else if (payload.body && payload.body.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf8');
      }

      results.push({ id: msg.id, subject, sender, to, body: body.substring(0, 1000), threadId: msgRes.data.threadId });
    }
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/gmail/draft', async (req, res) => {
  try {
    const { to, subject, body, originalMessageId, threadId } = req.body;
    const { rows } = await pool.query("SELECT key, value FROM config WHERE key IN ('google_client_id', 'google_client_secret', 'google_redirect_uri', 'google_refresh_token')");
    const cfg = {};
    rows.forEach(r => cfg[r.key] = r.value);

    const oauth2Client = new google.auth.OAuth2(cfg.google_client_id, cfg.google_client_secret, cfg.google_redirect_uri);
    oauth2Client.setCredentials({ refresh_token: cfg.google_refresh_token });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const messageParts = [
      `To: ${to}`,
      `Subject: Re: ${subject}`,
      '',
      body,
    ];
    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const draftBody = {
      message: { raw: encodedMessage }
    };
    if (threadId) draftBody.message.threadId = threadId;

    const draftRes = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: draftBody
    });
    res.json({ success: true, draftId: draftRes.data.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`NexusTriage API running on port ${PORT}`);
});
