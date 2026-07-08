# 🌐 Building a Free-Tier Multi-Tenant SaaS with n8n

Transforming your local automation into a fully-fledged SaaS (Software as a Service) where anyone can sign up, scan a QR code, and get their own AI triage agent is a phenomenal project. 

Because you are a student and need to keep costs at **exactly $0.00**, we have to be incredibly strategic about the architecture. n8n is an amazing engine, but out-of-the-box, it is not a user-facing dashboard. We need a modern tech stack to wrap around it.

Here is the master logistics guide on how this architecture works, how to piece it together, and how to host it all for free.

---

## 🏗️ The $0 Tech Stack Blueprint

To achieve a true GUI onboarding experience with zero recurring costs, you will use this exact stack:

1. **The Server:** Oracle Cloud "Always Free" ARM Instance (24GB RAM / 4 CPUs).
2. **The Automation Engine:** n8n (Self-hosted via Docker on Oracle Cloud).
3. **The WhatsApp Engine:** Evolution API (Self-hosted via Docker on Oracle Cloud).
4. **The Database & Auth:** Supabase (Cloud Free Tier).
5. **The Frontend GUI:** Next.js / React (Hosted on Vercel Free Tier).
6. **The LLM:** Groq API (Free Tier).

---

## 🧩 How the Pieces Fit Together (The Logistics)

You cannot have users log directly into n8n. Instead, n8n acts as your invisible backend engine. 

### 1. The User Onboarding (Frontend + Supabase)
You will build a sleek website using Next.js. When a user visits your site:
1. They create an account. **Supabase Auth** handles the secure login for free.
2. They are taken to a Dashboard with 3 setup cards:
   * **Connect Gmail:** They click a button. You use standard Google OAuth to ask for permission to read their emails. Supabase stores their secure access tokens.
   * **Connect Telegram:** An input box asks for their Bot Token and Chat ID. Saved to Supabase.
   * **Connect WhatsApp:** Your website makes an API call to your backend to generate a WhatsApp QR code. The user scans it with their phone right on your website.

### 2. Handling Multiple WhatsApp Accounts (Evolution API)
Your current Node.js script works great for one person, but `whatsapp-web.js` isn't designed to manage 500 different users simultaneously. 
*   **The Solution:** You will install **Evolution API** on your Oracle server. It is a wildly popular, open-source WhatsApp API designed specifically for multi-tenant SaaS. 
*   It generates the QR codes for your frontend, manages hundreds of WhatsApp sessions simultaneously, and fires a standard HTTP Webhook to n8n whenever *any* of your users receives a message.

### 3. The Master n8n Workflow
Instead of building a separate n8n workflow for every single user, you build **One Master Workflow**.
1. **Trigger:** Evolution API hits your n8n Webhook URL: `User #45 received message: "Hello"`.
2. **Lookup:** n8n makes a quick API call to Supabase: *"Give me the Telegram Token and Keywords for User #45"*.
3. **AI Triage:** n8n sends the message to the **Groq API** (Llama 3) for instant, free classification.
4. **Action:** n8n uses the standard Telegram node, dynamically plugging in User #45's token, to send the interactive approval buttons.
5. **Response:** When the user clicks a button in Telegram, Telegram hits another n8n webhook, and n8n tells Evolution API to send the message on WhatsApp.

---

## 🛠️ Step-by-Step Implementation Guide

If you want to build this, tackle it in these phases so you don't get overwhelmed:

### Phase 1: Secure the Server
1. Go to **Oracle Cloud** and sign up for an account. (This is notoriously difficult as their automated credit card system rejects a lot of debit cards, but keep trying. It is the *only* place to get 24GB of RAM for free).
2. Spin up an **Ampere A1 Compute Instance** with 4 OCPUs and 24GB RAM.
3. SSH into the server and install **Docker** and **Docker Compose**.

### Phase 2: Deploy the Backends
1. Find a Docker Compose file for **n8n** and spin it up on your server.
2. Find the Docker Compose file for **Evolution API** (it requires Redis and PostgreSQL, which can also run in Docker on the same server) and spin it up.
3. Test that you can access the n8n visual editor via your server's IP address.

### Phase 3: Build the SaaS Master Workflow in n8n
1. Create a free **Supabase** account. Create a table called `users` with columns: `id`, `telegram_token`, `chat_id`, `whatsapp_session_id`.
2. In n8n, build the master workflow. Set up the Webhook Trigger. Add the Supabase Node to fetch the user's data. Add the HTTP Request node to call Groq API.

### Phase 4: Build the Frontend
1. Create a **Next.js** project.
2. Connect it to Supabase for User Authentication.
3. Build the UI to display the QR Code. (Your Next.js app will make a REST API call to your Evolution API server to request the base64 QR code image, then render it on the screen).
4. Deploy the frontend to **Vercel** for free.

---

### ⚠️ Caveats & Warnings for a Free Stack
* **WhatsApp Bans:** Unofficial WhatsApp APIs (like Evolution API / `whatsapp-web.js`) run a high risk of getting phone numbers banned by Meta if they send spam. Warn your users, or force them to use "burner" numbers.
* **Server Maintenance:** While Oracle Cloud is free, you are the system administrator. If the server crashes, you have to SSH in and restart Docker.
* **Groq Rate Limits:** Groq's free tier is generous, but if your SaaS gets popular (e.g., hundreds of users), you will hit the rate limits and requests will fail. At that point, you would need to start charging your users a small subscription fee to cover a paid API tier.
