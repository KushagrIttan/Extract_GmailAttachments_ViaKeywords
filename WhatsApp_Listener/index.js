const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
const port = 3000;

// In-memory queue to hold incoming messages
let messageQueue = [];

// Initialize WhatsApp client with LocalAuth so it saves the session
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox']
    }
});

// Event: Generate and print QR code to terminal
client.on('qr', (qr) => {
    console.log('\n=============================================');
    console.log('SCAN THIS QR CODE WITH YOUR WHATSAPP APP:');
    console.log('=============================================\n');
    qrcode.generate(qr, { small: true });
});

// Event: Client successfully authenticated
client.on('ready', () => {
    console.log('WhatsApp Web client is ready and connected!');
});

// Event: Message received
client.on('message', async (msg) => {
    // We only want normal chat messages
    if (msg.body) {
        let sender = msg.from;
        
        // Try to get the actual contact name
        try {
            const contact = await msg.getContact();
            if (contact && contact.name) {
                sender = contact.name;
            } else if (contact && contact.pushname) {
                sender = contact.pushname;
            }
        } catch (err) {
            console.error("Error getting contact info:", err);
        }

        console.log(`[New Message] From: ${sender} | Body: ${msg.body}`);
        
        // Push to queue
        messageQueue.push({
            sender: sender,
            body: msg.body,
            timestamp: new Date().toISOString()
        });
    }
});

// Start WhatsApp client
client.initialize();

// Setup Express API
app.get('/api/messages', (req, res) => {
    // Return current queue and clear it
    const queuedMessages = [...messageQueue];
    messageQueue = []; // Clear queue after fetching
    
    console.log(`[API] Served ${queuedMessages.length} messages to UiPath.`);
    
    res.json({
        status: 'success',
        count: queuedMessages.length,
        messages: queuedMessages
    });
});

app.listen(port, () => {
    console.log(`WhatsApp Microservice REST API running on http://localhost:${port}`);
});
