const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    Browsers 
} = require('@whiskeysockets/baileys');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SEC_AUTH_KEY_99X';

app.use(cors());
app.use(express.json());

process.on('uncaughtException', (err) => console.error('⚠️ Uncaught:', err.message));
process.on('unhandledRejection', (reason) => console.error('⚠️ Rejection:', reason));

let waSock = null;
let isConnected = false;
let currentRawQr = null;

async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        // ดึงเวอร์ชันล่าสุดของ WhatsApp Web อัตโนมัติ ป้องกัน Error 405
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📡 ใช้งาน WhatsApp Web Version: ${version.join('.')} (Latest: ${isLatest})`);

        waSock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            // แก้ไขปัญหา 405 โดยใช้ Profile มาตรฐานของ Baileys
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000
        });

        waSock.ev.on('creds.update', saveCreds);

        waSock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                currentRawQr = qr;
                console.log('\n======================================================');
                console.log('📱 QR CODE ออกแล้ว! เปิดสแกนที่ลิงก์นี้:');
                console.log('👉 https://sc-fire-test22.onrender.com/qr');
                console.log('======================================================\n');
            }

            if (connection === 'close') {
                currentRawQr = null;
                isConnected = false;
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                
                // ถ้าโดนเตะ 405 หรือ Logout ให้หน่วงเวลา 8 วินาทีแล้วลองใหม่
                console.log(`⚠️ การเชื่อมต่อปิดตัวลง (Status: ${statusCode}) กำลังต่อใหม่ใน 8 วินาที...`);
                setTimeout(connectToWhatsApp, 8000);

            } else if (connection === 'open') {
                currentRawQr = null;
                isConnected = true;
                console.log('\n🎉 ยินดีด้วย! WhatsApp เชื่อมต่อสำเร็จเรียบร้อยแล้ว!\n');
            }
        });
    } catch (err) {
        console.error('❌ ข้อผิดพลาดการเริ่มระบบ Baileys:', err.message);
        setTimeout(connectToWhatsApp, 8000);
    }
}

// 🌐 หน้าเว็บแสดง QR Code สำหรับสแกน
app.get('/qr', (req, res) => {
    if (isConnected) {
        return res.send(`
            <!DOCTYPE html><html><head><meta charset="utf-8"><title>Online</title></head>
            <body style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff;">
                <h1 style="color:#22c55e;">✅ เชื่อมต่อ WhatsApp สำเร็จแล้ว!</h1>
                <p>บอทของคุณออนไลน์พร้อมใช้งานเรียบร้อยแล้ว</p>
                <a href="/api/status" style="color:#38bdf8;">คลิกดูสถานะระบบ /api/status</a>
            </body></html>
        `);
    }

    if (!currentRawQr) {
        return res.send(`
            <!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Loading...</title></head>
            <body style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff;">
                <h2 style="color:#f59e0b;">⏳ กำลังรอ QR Code จาก WhatsApp...</h2>
                <p style="color:#94a3b8;">หน้านี้จะรีเฟรชให้อัตโนมัติทุก 3 วินาที</p>
            </body></html>
        `);
    }

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(currentRawQr)}`;

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta http-equiv="refresh" content="20">
            <title>สแกน QR Code WhatsApp</title>
        </head>
        <body style="font-family:sans-serif; text-align:center; padding:25px; background:#0f172a; color:#fff;">
            <h1 style="color:#38bdf8; font-size:22px;">สแกนเพื่อเชื่อมต่อ WhatsApp</h1>
            <p style="color:#94a3b8; font-size:13px; margin-bottom:15px;">
                เปิด WhatsApp ในมือถือ ➔ เมนู (3 จุด) หรือการตั้งค่า ➔ <b>อุปกรณ์ที่เชื่อมโยง</b> ➔ สแกนรูปด้านล่าง:
            </p>
            <div style="display:inline-block; padding:15px; background:#fff; border-radius:16px;">
                <img src="${qrImageUrl}" alt="WhatsApp QR Code" style="display:block; width:280px; height:280px;" />
            </div>
            <p style="color:#64748b; font-size:12px; margin-top:15px;">⏱️ หน้านี้จะรีเฟรชให้อัตโนมัติเมื่อ QR หมดอายุ</p>
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

// API รับคำสั่งส่งข้อความจาก Base APK
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
    console.log(`🚀 เซิร์ฟเวอร์ทำงานที่พอร์ต ${PORT}`);
    connectToWhatsApp();
});
