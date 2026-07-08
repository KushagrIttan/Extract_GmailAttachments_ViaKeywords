# Prompt for Claude: Generate Migration Plan PDF

## Task
Generate a professional, minimalistic PDF migration plan (max 4-5 pages) for migrating the "Gmail Attachment Extraction via Keywords" UiPath project from a local desktop automation to a cloud-native, multi-tenant SaaS architecture.

---

## Project Context (Full Analysis)

### Current Architecture (Local UiPath + Node.js + Ollama)

**Workflows (5 XAML files):**

1. **Main.xaml** - Orchestrator workflow
   - Reads keywords from `Keywords.xlsx` (sheet: "Keywords")
   - Uses UiPath GSuite Activities to search Gmail Inbox for emails matching keywords (subject/body)
   - Downloads attachments to `C:\GmailAttachments\{sender}_{keyword}_{timestamp}\`
   - For each matching email: calls `AnalyzeWithOllama.xaml` (sentiment + summary) + `Email_Voice_Drafter.xaml` (draft reply)
   - Checkpoint-saves results to `Keywords.xlsx` (sheet: "Results") after each email
   - Sends executive summary HTML email to `kushagrgamer26@gmail.com`
   - Calls local Node.js microservice at `http://localhost:3000/api/messages` for WhatsApp queue
   - For each WhatsApp message: invokes `WhatsApp_Triage_Agent.xaml`

2. **AnalyzeWithOllama.xaml**
   - HTTP POST to `http://localhost:11434/api/generate` (Ollama llama3)
   - Prompt: sentiment (Positive/Negative/Neutral/Mixed) + 2-3 sentence summary
   - Returns JSON with `sentiment` and `summary`

3. **WhatsApp_Triage_Agent.xaml**
   - Reads `C:\RPA\Escalations.xlsx` (sheet: "Escalations")
   - Calls Ollama for triage: intent (General/Escalation/Spam/Scam), confidence (0-100), reason, reply options
   - Switch on intent:
     - **General**: POST to `http://localhost:3000/api/telegram_approval` with drafted replies
     - **Escalation**: Append to `Escalations.xlsx`, set `out_EscalationAdded=true`
     - **Spam/Scam** (confidence ≥85): POST to `http://localhost:3000/api/telegram_alert`

4. **Email_Voice_Drafter.xaml**
   - Ingests last 50 sent emails from Gmail (Sent folder) to build writing-style corpus
   - Strips signatures, quoted replies, "On X wrote:" blocks
   - Caches corpus to `C:\RPA\voice_corpus.txt` (24hr TTL, truncated to 12K chars)
   - Few-shot prompt to Ollama: mimic user's tone/vocabulary/greeting/sign-off
   - Creates Gmail draft via GSuite `SendEmailConnections` (SaveAsDraft=true)

5. **Send_Escalation_Digest.xaml**
   - Reads `Escalations.xlsx`, builds raw summary
   - Calls Ollama to generate professional executive brief (3-5 paragraphs)
   - Sends HTML email (High importance) to supervisor

**External Dependencies:**
- UiPath GSuite Activities (Gmail: search, download attachments, send/create drafts)
- Local Ollama server (llama3, 32K context) at `localhost:11434`
- Local Node.js WhatsApp microservice (`whatsapp-web.js` + headless Chrome) at `localhost:3000`
- Local Excel files: `Keywords.xlsx`, `Escalations.xlsx`, `voice_corpus.txt`
- Telegram bot for approvals/alerts

---

## Target Architecture (From Migration Guides)

### n8n SaaS Migration Guide (`n8n_saas_migration_guide.md`)
**$0 Tech Stack:**
1. **Server**: Oracle Cloud "Always Free" ARM (24GB RAM / 4 CPUs)
2. **Automation Engine**: n8n (self-hosted Docker)
3. **WhatsApp Engine**: Evolution API (Docker, multi- multi-tenant WhatsApp)
4. **Database & Auth**: Supabase (PostgreSQL, free tier)
5. **Frontend GUI**: Next.js/React (Vercel free tier)
6. **LLM**: Groq API (Llama 3, free tier)

**Architecture Flow:**
- User signs up on Next.js frontend → Supabase Auth
- Dashboard: Connect Gmail (OAuth), Telegram (bot token), WhatsApp (Evolution API QR code)
- Evolution API manages 500+ WhatsApp sessions, fires webhooks to n8n
- **One Master n8n Workflow** (not per-user):
  1. Webhook trigger from Evolution API
  2. Supabase lookup: user's Telegram token, keywords
  3. Groq API (Llama 3) for AI triage
  4. Telegram node (dynamic token) sends approval buttons
  5. Telegram callback webhook → Evolution API sends WhatsApp reply

### Scalability Blueprint (`scalability.md`)
**Replacements:**
- **LLM**: Local Ollama → Groq API (Llama 3, 800 tok/s) or Gemini 1.5 Flash
- **Core Logic**: UiPath → Node.js backend (native IMAP/Gmail API) OR n8n (visual flows)
- **WhatsApp**: Local Chrome + whatsapp-web.js → Meta Cloud API (1000 free convos/mo) OR Oracle VPS + Evolution API
- **Database**: Local Excel → Supabase (500MB PostgreSQL) or Google Sheets API
- **Frontend**: None → React on Vercel
- **Backend**: UiPath → Node.js Serverless Functions on Vercel/Render

**Phased Build:**
1. Rewrite UiPath logic (Gmail parsing) → Node.js functions
2. Swap `localhost:11434` → `https://api.groq.com`
3. Deploy to GitHub → Vercel/Render (free)
4. Hook Supabase for escalation logging

---

## PDF Requirements

### Format & Style
- **Max 4-5 pages** (A4/Letter)
- **Minimalistic design** - NO default blue/white corporate theme
- **Color palette**: Monochrome/neutral with ONE accent color (e.g., charcoal + warm amber, or slate + sage green, or pure grayscale with red accent)
- **Typography**: Clean sans-serif (Inter, system-ui, or similar), good hierarchy
- **Layout**: Generous whitespace, clear section breaks, no heavy borders/boxes
- **Visual elements**: Simple tables, mermaid-style flow diagrams (text-based), bullet hierarchies

### Content Structure (fit in 4-5 pages)

**Page 1: Executive Summary & Current State**
- Project name, one-paragraph problem statement
- Current architecture diagram (text-based flow)
- Pain points: local-only, single-tenant, Excel persistence, Ollama hardware, WhatsApp browser fragility

**Page 2: Target Architecture Overview**
- High-level target stack table (Current → Target mapping)
- Architecture diagram (text-based): Frontend → Backend → Database → LLM → WhatsApp
- Cost: $0/month (all free tiers)

**Page 3: Migration Phases & Workflows**
- Phase 1: Infrastructure (Oracle, Docker, n8n, Evolution API, Supabase)
- Phase 2: Core Logic Migration (UiPath → n8n Master Workflow + Node.js)
- Phase 3: LLM Migration (Ollama → Groq/Gemini)
- Phase 4: Frontend & Auth (Next.js + Supabase Auth + OAuth flows)
- Phase 5: WhatsApp Multi-tenancy (Evolution API + QR onboarding)

**Page 4: Data Migration & Risks**
- Excel → Supabase schema (users, keywords, escalations, messages, corpus)
- Checkpoint/resume logic adaptation
- Risk matrix: WhatsApp bans, Groq rate limits, Oracle provisioning difficulty, server maintenance
- Mitigations

**Page 5 (if needed): Implementation Checklist & Timeline**
- Week-by-week checklist
- Definition of Done per phase
- Rollback plan

---

## Technical Details for Claude to Include

### Supabase Schema (suggested)
```sql
users (id, email, created_at, gmail_tokens, telegram_token, telegram_chat_id, whatsapp_session_id)
keywords (id, user_id, keyword, created_at)
escalations (id, user_id, sender, message, summary, timestamp, status)
messages (id, user_id, channel, direction, body, intent, confidence, created_at)
corpus (id, user_id, content, updated_at)
```

### n8n Master Workflow Nodes
1. Webhook (Evolution API)
2. Supabase: Get user by whatsapp_session_id
3. Supabase: Get user keywords
4. HTTP Request: Groq API (triage prompt)
5. IF: intent == Escalation → Supabase insert
6. IF: intent == General → Telegram node (dynamic credentials)
7. Webhook: Telegram callback → Evolution API send message

### Key Migration Decisions to Document
- **Why n8n over pure Node.js?** Visual debugging, non-technical workflow edits, built-in retry/error handling, webhook management
- **Why Evolution API over Meta Cloud API?** QR-code onboarding (no Meta Business Verification), full WhatsApp feature parity, self-hosted on free Oracle
- **Why Supabase over Firebase?** PostgreSQL (relational), generous free tier, built-in Auth + Realtime + Storage
- **Why Groq over local Ollama?** Zero infrastructure, 800 tok/s, same Llama 3 weights, free tier generous

---

## Output Instructions for Claude

1. **Generate the PDF programmatically** using a Python script (reportlab, fpdf2, or weasyprint) OR output complete HTML/CSS that renders to PDF via browser print
2. **Save as** `Migration_Plan.pdf` in the project directory
3. **Verify page count** ≤ 5 pages
4. **Use minimalistic styling**: 
   - Background: white/off-white
   - Text: charcoal (#1a1a2e or #2d2d2d)
   - Accent: single color (e.g., #c47600 amber, #2d7d46 sage, or #8b1a1a deep red)
   - Headings: weight 600, no underlines
   - Body: 11pt, line-height 1.6
   - Tables: minimal borders (top/bottom only), left-aligned
   - Code blocks: monospace, subtle background (#f5f5f5)

---

## Reference Files (already analyzed)
- `Main.xaml`, `AnalyzeWithOllama.xaml`, `WhatsApp_Triage_Agent.xaml`, `Email_Voice_Drafter.xaml`, `Send_Escalation_Digest.xaml`
- `n8n_saas_migration_guide.md`
- `scalability.md`

---

## Deliverable
A single PDF file: `Migration_Plan.pdf` (4-5 pages, minimalistic, professional)