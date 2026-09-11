// ==========================================
// SC Fire Core Server & Express REST Bridge
// Port: 10000 | Secret Token Protected
// ==========================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pino = require('pino');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { handleCaseBug } = require('./src/caseBug');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || "SEC_AUTH_KEY_99X";
const BOT_NAME = "SC-Fire-Baileys-Bot";

app.use(cors());
app.use(express.json());

let waSock = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_sessions');
  waSock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  waSock.ev.on('creds.update', saveCreds);
  waSock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) connectToWhatsApp();
    }
  });
}

// REST API for Base APK Trigger
app.post('/api/execute', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader ? authHeader.replace('Bearer ', '') : req.body.secretKey;

  if (token !== SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid Secret Key" });
  }

  const { targetJid, actionType, options } = req.body;
  try {
    const dispatchResult = await handleCaseBug(actionType, targetJid, waSock, options);
    res.json({ success: true, target: targetJid, result: dispatchResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: "ONLINE",
    botName: BOT_NAME,
    waConnected: !!waSock?.user,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SC FIRE] Running on port ${PORT}`);
  connectToWhatsApp();
});