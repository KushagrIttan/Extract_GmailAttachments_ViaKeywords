-- NexusTriage Database Schema
-- Auto-runs on first Postgres container start

-- Config table (stores onboarding data — API keys, tokens, etc.)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Keywords (replaces Keywords.xlsx)
CREATE TABLE IF NOT EXISTS keywords (
  id SERIAL PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email results (replaces Results sheet in Keywords.xlsx)
CREATE TABLE IF NOT EXISTS email_results (
  id SERIAL PRIMARY KEY,
  keyword TEXT,
  sender TEXT,
  subject TEXT,
  sentiment TEXT,
  summary TEXT,
  message_id TEXT UNIQUE,
  has_attachments BOOLEAN DEFAULT FALSE,
  draft_created BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Escalations (replaces Escalations.xlsx)
CREATE TABLE IF NOT EXISTS escalations (
  id SERIAL PRIMARY KEY,
  sender TEXT,
  sender_id TEXT,
  message TEXT,
  intent TEXT,
  confidence INT,
  reason TEXT,
  status TEXT DEFAULT 'Pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WhatsApp messages log
CREATE TABLE IF NOT EXISTS wa_messages (
  id SERIAL PRIMARY KEY,
  sender_id TEXT,
  sender_name TEXT,
  body TEXT,
  intent TEXT,
  confidence INT,
  reason TEXT,
  ai_options JSONB DEFAULT '[]'::jsonb,
  selected_response TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email drafts log
CREATE TABLE IF NOT EXISTS email_drafts (
  id SERIAL PRIMARY KEY,
  original_subject TEXT,
  original_sender TEXT,
  original_body TEXT,
  draft_body TEXT,
  status TEXT DEFAULT 'drafted',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config keys (will not overwrite if already exist)
INSERT INTO config (key, value) VALUES
  ('groq_api_key', ''),
  ('telegram_bot_token', ''),
  ('telegram_chat_id', ''),
  ('whatsapp_instance_name', 'nexustriage'),
  ('whatsapp_connected', 'false'),
  ('gmail_connected', 'false'),
  ('onboarding_complete', 'false'),
  ('supervisor_email', '')
ON CONFLICT (key) DO NOTHING;
