# Switchboard 🎛️

Switchboard is an intelligent, multi-channel communication triage and lead-generation hub. It monitors your inbound communication channels (Gmail, WhatsApp, and LinkedIn), uses local AI to classify and draft responses, pushes escalations to a Telegram Bot for human-in-the-loop approval, and automatically logs lead data into Google Sheets.

## Architecture Overview

The system is built as a monolith utilizing **.NET Aspire** for orchestration. It consists of:
1. **Switchboard.Api**: An ASP.NET Core 10 backend running background workers, AI Agents, and HTTP endpoints.
2. **Switchboard.UI**: A React + Vite frontend for configuration, live monitoring, and analytics.
3. **Switchboard.AppHost**: The Aspire orchestrator that spins up the API, UI, a PostgreSQL database container, and an Ollama container.

### Core Technologies
- **Backend**: C#, ASP.NET Core, Entity Framework Core, SignalR (WebSockets), Hangfire (Background Jobs), Microsoft.Extensions.AI (Abstractions).
- **Frontend**: React, Vite, TypeScript, Vanilla CSS (Glassmorphic UI).
- **Database**: PostgreSQL (pgvector available for future embeddings).
- **LLM**: Ollama (`phi-4-mini`) running locally, with Groq cloud fallback for heavy tasks.

---

## The Agents

The system leverages AI Agents to process incoming text. 

### 1. `TriageAgent.cs` (WhatsApp & Gmail)
- **WhatsApp**: Evaluates incoming messages using `phi-4-mini`, determines the intent, and generates 3 distinct, context-aware reply options. It cleans up any AI hallucinated prefixes (like "Option 1:") and passes the options to Telegram.
- **Gmail**: Skips the LLM verification entirely because the Gmail API's search query (`"is:unread AND (keyword OR keyword)"`) guarantees a match. It simply marks the email for escalation and triggers the `DraftingAgent`.

### 2. `LinkedInTriageAgent.cs`
- Operates exactly like the WhatsApp Triage Agent, but tailored for LinkedIn threads. It analyzes the last 6 messages in a conversation to determine context and generates 3 reply options.

### 3. `DraftingAgent.cs`
- Uses the larger, cloud-hosted **Groq API** (`llama-3.3-70b-versatile`) to generate high-quality, professional email drafts based on the matched keywords.

---

## Background Workers

The application uses `IHostedService` Background Workers to continuously poll APIs that do not support webhooks.

### 1. `GmailPollerJob.cs` (Hangfire)
- Connects to Gmail via OAuth2 using a stored Refresh Token.
- Queries unread messages matching your specific keywords.
- Downloads attachments to the local `/DownloadedAttachments` directory.
- Triggers the `TriageAgent` and `DraftingAgent`.
- Creates a Draft directly in your Gmail account.

### 2. `LinkedInWatcherWorker.cs` (BackgroundService)
- Uses **Playwright** (headless Chromium) to scrape your LinkedIn messages via your `li_at` session cookie.
- Runs every 30 minutes to find unreplied threads.
- Triggers the `LinkedInTriageAgent` and sends options to Telegram.
- **Security Note**: It intentionally *never* sends messages automatically to prevent LinkedIn account bans.

### 3. `TelegramListenerWorker.cs` (BackgroundService)
- Connects to the Telegram Bot API using Long Polling.
- Listens for inline button clicks (Callback Queries).
- **Routing**:
  - `WA|<id>|<option>`: Sends the selected WhatsApp reply via Green API.
  - `LI|<id>|<option>`: Marks the LinkedIn escalation as "Approved" so you can manually copy-paste it from the dashboard.
- Syncs the contact data to the Lead Pipeline.

### 4. `GoogleSheetsSyncWorker.cs` (BackgroundService)
- Periodically pushes any new or updated `Leads` from the PostgreSQL database directly into your connected Google Sheet.

---

## User Interface (UI)

The frontend is a React SPA (Single Page Application) that communicates with the API via standard HTTP calls and SignalR.
- **Onboarding (`Onboarding.tsx`)**: Walks you through connecting your API tokens and OAuth accounts (Gmail, Google Sheets, WhatsApp Green API, Telegram, and LinkedIn).
- **Dashboard (`Dashboard.tsx`)**: Displays live analytics, pending escalations, and the manual-send queue for LinkedIn.
- **Live Activity Feed**: Powered by SignalR (`ActivityHub.cs`), this terminal-style feed shows real-time logs from the AI Agents and Background Workers as they process data.

## Running the Project

To start the entire stack:
1. Ensure Docker Desktop is running.
2. Run `dotnet run --project Switchboard\Switchboard.AppHost`
3. Aspire will start the database, Ollama, the API on `http://localhost:5000`, and the UI on `http://localhost:3000`.

*Note: For Google OAuth to work properly, you must have `http://localhost:5000` registered in your Google Cloud Console as an Authorized Redirect URI.*
