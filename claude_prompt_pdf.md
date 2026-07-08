Act as a technical documentation expert and UI/UX designer. I need you to create a minimalistic, beautifully formatted setup guide that I can export as a PDF. The guide is for a local AI automation project that triages emails and WhatsApp messages using a local LLM.

Please generate the content for this PDF guide. Use a clean, modern structure with clear headings, bullet points, and code blocks where necessary. Keep the tone professional but highly accessible.

Here are the exact details of the project that must be included in the setup guide:

### 1. Prerequisites & Requirements
The user must install the following software on their Windows machine:
- **UiPath Studio** (for the main RPA workflow)
- **Node.js** (v18 or higher, for the WhatsApp/Telegram listener daemon)
- **Ollama** (for running the local AI model)
- **Llama 3** (The user must open their terminal and run `ollama run llama3` to download the 8B model)

### 2. Setting up the Messaging Daemon (Node.js)
The project includes a `WhatsApp_Listener` folder that acts as a local API bridge between WhatsApp, Telegram, and the UiPath bot.
- The user needs to open a terminal in the `WhatsApp_Listener` folder.
- Run `npm install` to install the required dependencies (`whatsapp-web.js`, `node-telegram-bot-api`, `express`, `dotenv`, `qrcode-terminal`).

### 3. Setting up Telegram (Human-in-the-Loop)
The AI sends Spam/Scam alerts and generated reply drafts to the user via Telegram for final human approval.
- The user must open the Telegram app and message **@BotFather** to create a new bot (using `/newbot`) and get the **Bot Token**.
- The user must message **@userinfobot** or **@RawDataBot** to get their personal **Chat ID** (a long number).
- The user must create a file named `.env` inside the `WhatsApp_Listener` folder and add the following lines:
  ```env
  TELEGRAM_BOT_TOKEN=your_bot_token_here
  TELEGRAM_CHAT_ID=your_chat_id_here
  ```

### 4. Running the Listener & Connecting WhatsApp
- After saving the `.env` file, the user must run `node index.js` in the terminal inside the `WhatsApp_Listener` folder.
- A large QR code will automatically appear in the terminal.
- The user must open WhatsApp on their phone, go to **Settings > Linked Devices**, and scan the QR code in the terminal.
- The terminal will soon print "Client is ready!" and "Telegram Bot initialized and polling."

### 5. Running the Main Automation
- Finally, the user should open `Main.xaml` in UiPath Studio.
- Click **Run**.
- The system is now fully active! It will monitor emails and WhatsApp messages, route them through the local Llama 3 model, and send interactive approval buttons directly to the user's Telegram app.

Please format this into a structured, minimalistic setup guide. Suggest a clean, modern design layout (e.g., ample whitespace, sans-serif typography like Inter or Roboto), and provide the output in rich Markdown so I can easily convert it into a beautiful PDF using a Markdown-to-PDF converter.
