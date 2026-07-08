require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
// Fix for ESM/CJS interop in node-telegram-bot-api
const BotConstructor = TelegramBot.default || TelegramBot;

const app = express();
app.use(express.json());
const port = 3000;

// Initialize Telegram Bot (Polling mode)
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
let bot = null;

if (TELEGRAM_TOKEN) {
    bot = new BotConstructor(TELEGRAM_TOKEN, { polling: true });
    console.log('Telegram Bot initialized and polling.');
} else {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN is missing in .env. Telegram features will be disabled.');
}

// In-memory queue for incoming WA messages
let messageQueue = [];

// In-memory store for pending Telegram approvals
// Maps Telegram message ID -> { to: whatsappSenderId, options: [] }
let pendingApprovals = {};

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('\n=============================================');
    console.log('SCAN THIS QR CODE WITH YOUR WHATSAPP APP:');
    console.log('=============================================\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Web client is ready and connected!');
});

client.on('message', async (msg) => {
    if (msg.body) {
        let sender = msg.from;
        try {
            const contact = await msg.getContact();
            if (contact && contact.name) sender = contact.name;
            else if (contact && contact.pushname) sender = contact.pushname;
        } catch (err) {
            console.error("Error getting contact info:", err);
        }

        console.log(`[New Message] From: ${sender} | Body: ${msg.body}`);
        messageQueue.push({
            senderId: msg.from,
            senderName: sender,
            body: msg.body,
            timestamp: new Date().toISOString()
        });
    }
});

client.initialize();

/* =========================================================
   TELEGRAM BOT LISTENERS (Human-in-the-Loop)
   ========================================================= */

if (bot) {
    // 1. Listen for Inline Keyboard Button Clicks
    bot.on('callback_query', async (callbackQuery) => {
        const message = callbackQuery.message;
        const msgId = message.message_id;
        
        // Check if this message is a pending approval
        if (pendingApprovals[msgId]) {
            const approvalData = pendingApprovals[msgId];
            const selectedOptionText = approvalData.options[parseInt(callbackQuery.data)];
            
            try {
                // Send the selected option to WhatsApp
                await client.sendMessage(approvalData.to, selectedOptionText);
                console.log(`[Telegram HITL] Sent Option ${callbackQuery.data} to ${approvalData.to}`);
                
                // Edit the Telegram message to show it was sent
                await bot.editMessageText(`✅ **SENT TO WHATSAPP:**\n"${selectedOptionText}"`, {
                    chat_id: message.chat.id,
                    message_id: msgId,
                    parse_mode: 'Markdown'
                });
                
                // Clear from pending
                delete pendingApprovals[msgId];
            } catch (err) {
                console.error("Error sending from HITL:", err);
            }
        }
    });

    // 2. Listen for Manual Text Replies to the Bot's Approval Request
    bot.on('message', async (msg) => {
        // If the user is replying to a specific message from the bot
        if (msg.reply_to_message) {
            const repliedMsgId = msg.reply_to_message.message_id;
            
            // Check if they are replying to a pending approval message
            if (pendingApprovals[repliedMsgId]) {
                const approvalData = pendingApprovals[repliedMsgId];
                const customText = msg.text;
                
                try {
                    // Send custom text to WhatsApp
                    await client.sendMessage(approvalData.to, customText);
                    console.log(`[Telegram HITL] Sent Custom Reply to ${approvalData.to}`);
                    
                    // Edit the original bot message to reflect the custom response
                    await bot.editMessageText(`✅ **CUSTOM REPLY SENT:**\n"${customText}"`, {
                        chat_id: msg.chat.id,
                        message_id: repliedMsgId,
                        parse_mode: 'Markdown'
                    });
                    
                    delete pendingApprovals[repliedMsgId];
                } catch (err) {
                    console.error("Error sending custom HITL reply:", err);
                }
            }
        }
    });
}

/* =========================================================
   EXPRESS REST API (For UiPath)
   ========================================================= */

app.get('/api/messages', (req, res) => {
    const queuedMessages = [...messageQueue];
    messageQueue = [];
    console.log(`[API] Served ${queuedMessages.length} messages to UiPath.`);
    res.json({ status: 'success', count: queuedMessages.length, messages: queuedMessages });
});

// Backward compatibility: Direct send
app.post('/api/send', async (req, res) => {
    const { to, message } = req.body;
    try {
        await client.sendMessage(to, message);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// NEW: Request Telegram Approval (General Intents)
app.post('/api/telegram_approval', async (req, res) => {
    const { to, senderName, message, options } = req.body;
    
    if (!bot || !TELEGRAM_CHAT_ID) {
        return res.status(500).json({ error: "Telegram Bot not configured." });
    }
    
    const text = `💬 **New WhatsApp Message**\n👤 *From:* ${senderName}\n📝 *Message:* ${message}\n\n*AI Drafts:*\n1️⃣ ${options[0]}\n2️⃣ ${options[1]}\n3️⃣ ${options[2]}\n\n*Choose an AI Draft below, or Reply to this message with your own text:*`;
    
    try {
        // Build Inline Keyboard
        const keyboard = {
            inline_keyboard: [
                [{ text: "1️⃣ Option 1", callback_data: "0" }],
                [{ text: "2️⃣ Option 2", callback_data: "1" }],
                [{ text: "3️⃣ Option 3", callback_data: "2" }]
            ]
        };
        
        // Send to Telegram
        const tgMsg = await bot.sendMessage(TELEGRAM_CHAT_ID, text, {
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify(keyboard)
        });
        
        // Save to pending approvals
        pendingApprovals[tgMsg.message_id] = { to, options };
        
        res.json({ status: 'success' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// NEW: Send Scam/Spam Alert
app.post('/api/telegram_alert', async (req, res) => {
    const { intent, reason, senderName, message, confidence } = req.body;
    
    if (!bot || !TELEGRAM_CHAT_ID) return res.status(500).json({ error: "Telegram Bot not configured." });
    
    const icon = intent.toLowerCase() === 'scam' ? '🚨' : '🛡️';
    const text = `${icon} **${intent.toUpperCase()} DETECTED (${confidence}% confidence)**\n👤 *From:* ${senderName}\n📝 *Message:* ${message}\n🧠 *Reason:* ${reason}`;
    
    try {
        await bot.sendMessage(TELEGRAM_CHAT_ID, text, { parse_mode: 'Markdown' });
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`WhatsApp Microservice REST API running on http://localhost:${port}`);
});
