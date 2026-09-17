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

// ในฟังก์ชันเชื่อมต่อ WhatsApp ให้ใส่คำสั่งนี้ก่อนเชื่อมต่อ
const phoneNumber = "66941876682"; // ใส่เบอร์ของคุณ (รหัสประเทศ 66 ตัดเลข 0 หน้าสุดออก)

if (!waSock.authState.creds.registered) {
    setTimeout(async () => {
        const code = await waSock.requestPairingCode(phoneNumber);
        console.log(`\n================================`);
        console.log(`🔑 รหัสเชื่อมโยงจริงของคุณคือ: ${code}`);
        console.log(`================================\n`);
    }, 5000);
}
REST API for Base APK Trigger
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
