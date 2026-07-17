# Switchboard: Autonomous AI Communication Triage System

## 📌 Project Overview & Use Case

Switchboard is an intelligent, multi-channel communication hub designed to manage, triage, and draft responses for incoming messages across **Gmail** and **WhatsApp**. It acts as a personal AI assistant that filters out the noise, processes important information, and delegates critical decision-making to you via **Telegram**.

### The Core Problem it Solves
Managing a high volume of emails and WhatsApp messages is overwhelming. Often, you only care about emails containing specific keywords (e.g., invoices, job applications, project updates) or you want to quickly reply to WhatsApp messages without having to type out long responses or open the WhatsApp app.

### The Switchboard Solution
1. **Gmail Auto-Triage**: It silently watches your inbox for specific keywords. When a match is found, it automatically downloads the attachments to your local machine and uses a local AI model to draft a context-aware reply in your Gmail drafts.
2. **WhatsApp AI Proxy**: Instead of dealing with WhatsApp directly, all incoming messages are intercepted. The AI analyzes the intent of the message and generates 3 perfect reply options. These are forwarded to you on Telegram. You simply tap an option in Telegram, and the AI replies on WhatsApp on your behalf.

---

## 🏗️ Architecture & Codebase Structure

The project is built using a modern .NET ecosystem with a React frontend, orchestrated by **.NET Aspire**.

### 1. Backend (`Switchboard.Api`)
An ASP.NET Core API that serves as the brain of the operation.
- **Agents (`/Agents`)**: 
  - `TriageAgent.cs`: The core AI brain. Evaluates incoming WhatsApp messages, determines intent, and generates 3 reply options. Uses `Microsoft.Extensions.AI` to talk to a local Ollama model.
  - `DraftingAgent.cs`: Generates email draft responses.
- **Jobs (`/Jobs`)**: 
  - `GmailPollerJob.cs`: A background Cron job (using Hangfire) that polls the Gmail API, checks for keyword matches, downloads attachments to a local `DownloadedAttachments` folder, and creates Drafts.
- **Endpoints (`/Endpoints`)**: 
  - `WebhookEndpoints.cs`: Receives instant HTTP Webhook `POST` requests from Green API whenever a new WhatsApp message arrives.
  - `ConfigEndpoints.cs` & `KeywordEndpoints.cs`: REST endpoints for the frontend UI to save API keys and manage keywords.
  - `StatsEndpoints.cs`: Powers the frontend dashboard metrics.
- **Workers (`/Workers`)**: 
  - `TelegramListenerWorker.cs`: A background service that maintains a persistent connection to the Telegram Bot API. It listens for your button clicks (when you choose an AI-generated reply) and fires the selected text back to WhatsApp via Green API.
- **Data & Models (`/Data`, `/Models`)**: Entity Framework Core SQLite database context and schemas (`Escalations`, `EmailDrafts`, `WaMessages`, `Configs`).

### 2. Frontend (`Switchboard.UI`)
A **React + Vite** dashboard built with modern, glassmorphic UI principles.
- **Real-time Sync**: Connects to the backend via SignalR (`ActivityHub.cs`) to display live logs of exactly what the AI is doing in the background.
- **Configuration**: An Onboarding screen that allows you to securely input and persist your API Keys (Telegram, Gmail OAuth, Green API).

### 3. Orchestration (`Switchboard.AppHost`)
Uses **.NET Aspire** to seamlessly boot up the backend API and the frontend UI together, providing built-in telemetry and a unified startup experience.

---

## ⚙️ How It Works (The Workflows)

### Workflow A: The WhatsApp Pipeline
1. **Incoming Message**: Someone texts your WhatsApp number.
2. **Webhook**: Green API intercepts this and sends an HTTP POST request to `WebhookEndpoints.cs` (exposed via Ngrok).
3. **AI Evaluation**: `TriageAgent.cs` receives the message text. It completely ignores keywords and asks the local Ollama AI (`Phi-4-mini`) to determine the user's intent and generate 3 possible responses based on your configured voice/tone.
4. **Escalation**: The agent creates an `Escalation` in the database and sends a message to your Telegram Bot containing the sender's name/number, the message, and 3 inline buttons.
5. **Resolution**: You read the message on Telegram and tap "Option 2".
6. **Execution**: `TelegramListenerWorker.cs` catches the callback, reads the text of Option 2, and fires an HTTP POST request to Green API, which sends the message back to the original WhatsApp sender.

### Workflow B: The Gmail Pipeline
1. **Polling**: `GmailPollerJob.cs` wakes up on a schedule.
2. **Filtering**: It queries the Gmail API specifically for unread emails containing your pre-configured keywords (e.g., `"Invoice" OR "Resume"`).
3. **Extraction**: If found, it parses the email structure and extracts any Base64 encoded attachments, saving them to the root `DownloadedAttachments` directory.
4. **Drafting**: It passes the email text to `DraftingAgent.cs`, which generates a reply.
5. **Saving**: A draft is created directly in your Gmail account, and the UI Live Feed is updated with the names of the attachments that were saved.

---

## 🛠️ Required Context for Setup

- **Ngrok**: Green API requires a public URL to send webhooks. You must run `ngrok http https://localhost:7247` and paste the resulting URL + `/api/webhooks/whatsapp` into the Green API console.
- **Local AI (Ollama)**: The system relies on a locally running instance of Ollama to ensure complete privacy of your communications. It is currently configured to use `hf.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF:Q4_K_M`.
- **API Keys**: All keys (Green API Instance ID/Token, Telegram Bot Token, Gmail Client ID/Secret) are stored in the local SQLite database via the `/api/config` endpoints and managed through the UI's "Reconfigure System" button.

---

*This document serves as the architectural source of truth for the Switchboard project.*
