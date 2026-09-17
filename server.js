const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SEC_AUTH_KEY_99X';

app.use(cors());
app.use(express.json());

// ป้องกันเซิร์ฟเวอร์แครชหลุด (Anti-Crash Guard)
process.on('uncaughtException', (err) => {
    console.error('⚠️ ตรวจพบข้อผิดพลาด (ป้องกันเซิร์ฟเวอร์ดับแล้ว):', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled Rejection (ป้องกันเซิร์ฟเวอร์ดับแล้ว):', reason);
});

let waSock = null;
let isConnected = false;
let currentRawQr = null;

async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

        waSock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['SC-Fire-Bot', 'Chrome', '120.0.0']
        });

        waSock.ev.on('creds.update', saveCreds);

        waSock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                currentRawQr = qr;
                console.log('\n======================================================');
                console.log('📱 QR CODE พร้อมสแกนแล้ว!');
                console.log('👉 เปิดสแกนผ่านหน้าเว็บ: https://sc-fire-test22.onrender.com/qr');
                console.log('======================================================\n');
            }

            if (connection === 'close') {
                currentRawQr = null;
                isConnected = false;
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`⚠️ การเชื่อมต่อปิดตัวลง (Status: ${statusCode}) กำลังเชื่อมต่อใหม่ใน 4 วินาที...`);
                if (shouldReconnect) {
                    setTimeout(connectToWhatsApp, 4000);
                }
            } else if (connection === 'open') {
                currentRawQr = null;
                isConnected = true;
                console.log('\n🎉 ยินดีด้วย! WhatsApp เชื่อมต่อสำเร็จเรียบร้อยแล้ว!\n');
            }
        });
    } catch (err) {
        console.error('❌ เกิดข้อผิดพลาดในการต่อ Baileys:', err.message);
        setTimeout(connectToWhatsApp, 5000);
    }
}

// 🌐 หน้าเว็บสแกน QR Code (เปิดดูบนมือถือหรือคอมได้ทันที ไม่ต้องลงไลบรารีเพิ่ม)
app.get('/qr', (req, res) => {
    if (isConnected) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><title>WhatsApp Online</title></head>
            <body style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff;">
                <h1 style="color:#22c55e;">✅ เชื่อมต่อ WhatsApp สำเร็จแล้ว!</h1>
                <p>เซิร์ฟเวอร์ออนไลน์และพร้อมรับคำสั่งส่งข้อความเรียบร้อยแล้วครับ</p>
                <a href="/api/status" style="color:#38bdf8; text-decoration:none;">🔗 ตรวจสอบสถานะ /api/status</a>
            </body>
            </html>
        `);
    }

    if (!currentRawQr) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Loading QR...</title></head>
            <body style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff;">
                <h2 style="color:#f59e0b;">⏳ กำลังเชื่อมต่อเซิร์ฟเวอร์ WhatsApp...</h2>
                <p style="color:#94a3b8;">หน้านี้จะรีเฟรชให้อัตโนมัติทุก 3 วินาทีเพื่อรอ QR Code</p>
            </body>
            </html>
        `);
    }

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(currentRawQr)}`;

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta http-equiv="refresh" content="25">
            <title>สแกน QR Code WhatsApp</title>
        </head>
        <body style="font-family:sans-serif; text-align:center; padding:30px; background:#0f172a; color:#fff;">
            <h1 style="color:#38bdf8; font-size:24px; margin-bottom:8px;">สแกนเพื่อเชื่อมต่อ WhatsApp</h1>
            <p style="color:#94a3b8; font-size:14px; margin-bottom:20px;">
                เปิด WhatsApp ➔ เมนู (3 จุด) หรือการตั้งค่า ➔ <b>อุปกรณ์ที่เชื่อมโยง</b> ➔ สแกนรูปด้านล่าง:
            </p>
            <div style="display:inline-block; padding:16px; background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,0.6);">
                <img src="${qrImageUrl}" alt="WhatsApp QR Code" style="display:block; width:280px; height:280px;" />
            </div>
            <p style="color:#64748b; font-size:12px; margin-top:20px;">
                ⏱️ หาก QR หมดอายุ หน้านี้จะรีเฟรชให้อัตโนมัติ
            </p>
        </body>
        </html>
    `);
});

// API ตรวจสอบสถานะ
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ONLINE',
        botName: 'SC-Fire-Baileys-Bot',
        waConnected: isConnected,
        qrReady: Boolean(currentRawQr),
        timestamp: new Date().toISOString()
    });
});

app.get('/api/ping', (req, res) => {
    res.json({ pong: true, time: Date.now() });
});

// API สำหรับรับคำสั่งส่งข้อความ
app.post('/api/execute', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const bodyKey = req.body.secretKey;
    const incomingKey = authHeader ? authHeader.replace('Bearer ', '') : bodyKey;

    if (incomingKey !== SECRET_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Secret Key' });
    }

    const { targetJid, message = 'ข้อความแจ้งเตือนจากระบบ SC Fire' } = req.body;

    if (!isConnected || !waSock) {
        return res.status(503).json({ error: 'WhatsApp ยังไม่ได้เชื่อมต่อ กรุณาสแกน QR ก่อนครับ' });
    }

    try {
        await waSock.sendMessage(targetJid, { text: message });
        res.json({ success: true, target: targetJid, message: 'ส่งข้อความสำเร็จแล้ว' });
    } catch (err) {
        res.status(500).json({ error: 'ส่งข้อความไม่สำเร็จ', details: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SC-Fire Server กำลังทำงานที่พอร์ต ${PORT}`);
    connectToWhatsApp();
});
