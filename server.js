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
        const { version } = await fetchLatestBaileysVersion();

        waSock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'), // Profile มาตรฐาน ไม่โดนบล็อก
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000
        });

        waSock.ev.on('creds.update', saveCreds);

        waSock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                currentRawQr = qr;
                console.log('📱 สร้าง QR Code ใหม่สำเร็จ พร้อมสแกน!');
            }

            if (connection === 'close') {
                currentRawQr = null;
                isConnected = false;
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                console.log(`⚠️ การเชื่อมต่อปิดตัวลง (${statusCode}) กำลังต่อใหม่ใน 6 วินาที...`);
                setTimeout(connectToWhatsApp, 6000);
            } else if (connection === 'open') {
                currentRawQr = null;
                isConnected = true;
                console.log('\n🎉 ยินดีด้วย! WhatsApp เชื่อมต่อสำเร็จเรียบร้อยแล้ว!\n');
            }
        });
    } catch (err) {
        setTimeout(connectToWhatsApp, 6000);
    }
}

// 🌐 หน้าเว็บสแกน QR Code (เปิดดูบนมือถือหรือคอมได้ทันที)
app.get('/qr', (req, res) => {
    if (isConnected) {
        return res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff; min-height:100vh;">
                <h1 style="color:#22c55e;">✅ เชื่อมต่อ WhatsApp สำเร็จแล้ว!</h1>
                <p>เซิร์ฟเวอร์ออนไลน์และพร้อมรับคำสั่งส่งข้อความเรียบร้อย</p>
                <a href="/api/status" style="color:#38bdf8;">ตรวจสอบสถานะ /api/status</a>
            </div>
        `);
    }

    if (!currentRawQr) {
        return res.send(`
            <!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Loading...</title></head>
            <body style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff;">
                <h2 style="color:#f59e0b;">⏳ กำลังรอ QR Code จาก WhatsApp...</h2>
                <p style="color:#94a3b8;">หน้านี้จะรีเฟรชให้อัตโนมัติใน 3 วินาที</p>
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
                เปิด WhatsApp ในมือถือ ➔ เมนู (3 จุด) ➔ <b>อุปกรณ์ที่เชื่อมโยง</b> ➔ สแกนรูปด้านล่าง:
            </p>
            <div style="display:inline-block; padding:15px; background:#fff; border-radius:16px;">
                <img src="${qrImageUrl}" alt="WhatsApp QR Code" style="display:block; width:280px; height:280px;" />
            </div>
            <p style="color:#64748b; font-size:12px; margin-top:15px;">⏱️ หน้านี้จะรีเฟรชให้อัตโนมัติเมื่อ QR มีการอัปเดต</p>
        </body>
        </html>
    `);
});

// หน้าเช็คสถานะ
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ONLINE',
        waConnected: isConnected,
        qrReady: Boolean(currentRawQr),
        timestamp: new Date().toISOString()
    });
});

// API ยิงข้อความ
app.post('/api/execute', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const bodyKey = req.body.secretKey;
    const incomingKey = authHeader ? authHeader.replace('Bearer ', '') : bodyKey;

    if (incomingKey !== SECRET_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Secret Key' });
    }

    const { targetJid, message = 'ข้อความแจ้งเตือนจากระบบ SC Fire' } = req.body;

    if (!isConnected || !waSock) {
        return res.status(503).json({ error: 'WhatsApp ยังไม่ได้เชื่อมต่อ' });
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
});const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SEC_AUTH_KEY_99X';

// 📱 เบอร์โทรของคุณสำหรับรับรหัสเชื่อมโยง (66941876682)
const PHONENUMBER = "66941876682"; 

app.use(cors());
app.use(express.json());

let waSock = null;
let isConnected = false;

// ฟังก์ชันเชื่อมต่อ WhatsApp Baileys พร้อมขอรหัสเชื่อมโยง
async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

        waSock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            // จำลอง Browser Desktop เพื่อให้ WhatsApp อนุญาตให้ขอ Pairing Code ได้
            browser: ['Ubuntu', 'Chrome', '20.0.04']
        });

        // บันทึกสถานะ Session
        waSock.ev.on('creds.update', saveCreds);

        // 🔑 ถ้ายังไม่ได้ลงทะเบียน ให้ขอรหัสเชื่อมโยง 8 ตัวส่งออกมาทาง Logs
        if (!waSock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    const code = await waSock.requestPairingCode(PHONENUMBER);
                    console.log(`\n======================================================`);
                    console.log(`📱 รหัสเชื่อมโยง WhatsApp จริงของคุณคือ:`);
                    console.log(`👉👉👉   ${code}   👈👈👈`);
                    console.log(`(นำรหัสนี้ไปกรอกใน WhatsApp บนมือถือก่อนหมดเวลา 60 วินาที)`);
                    console.log(`======================================================\n`);
                } catch (err) {
                    console.error('❌ ไม่สามารถขอรหัส Pairing Code ได้:', err.message);
                }
            }, 5000);
        }

        // ตรวจสอบสถานะการเชื่อมต่อ
        waSock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('⚠️ การเชื่อมต่อหลุด กำลังลองเชื่อมต่อใหม่...', shouldReconnect);
                isConnected = false;
                if (shouldReconnect) {
                    setTimeout(connectToWhatsApp, 5000);
                }
            } else if (connection === 'open') {
                console.log('\n✅ ยินดีด้วย! บอท WhatsApp เชื่อมต่อสำเร็จเรียบร้อยแล้ว!\n');
                isConnected = true;
            }
        });

    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาด:', error);
        setTimeout(connectToWhatsApp, 5000);
    }
}

// API เช็คสถานะเซิร์ฟเวอร์
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ONLINE',
        botName: 'SC-Fire-Baileys-Bot',
        waConnected: isConnected,
        phoneNumber: PHONENUMBER,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/ping', (req, res) => {
    res.json({ pong: true, time: Date.now() });
});

// API สำหรับส่งคำขอทำงานจาก Base APK
app.post('/api/execute', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const bodyKey = req.body.secretKey;
    const incomingKey = authHeader ? authHeader.replace('Bearer ', '') : bodyKey;

    if (incomingKey !== SECRET_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Secret Key' });
    }

    const { targetJid, message = 'ข้อความแจ้งเตือนจากระบบ SC Fire' } = req.body;

    if (!isConnected || !waSock) {
        return res.status(503).json({ 
            error: 'WhatsApp ยังไม่ได้เชื่อมต่อ กรุณากรอก Pairing Code ใน Render Logs ก่อนครับ',
            waConnected: false 
        });
    }

    try {
        await waSock.sendMessage(targetJid, { text: message });
        res.json({ success: true, target: targetJid, message: 'ส่งข้อความสำเร็จแล้ว' });
    } catch (err) {
        res.status(500).json({ error: 'ส่งข้อความไม่สำเร็จ', details: err.message });
    }
});

// เริ่มทำงานเซิร์ฟเวอร์
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 เซิร์ฟเวอร์เริ่มทำงานที่พอร์ต ${PORT}`);
    connectToWhatsApp();
});
