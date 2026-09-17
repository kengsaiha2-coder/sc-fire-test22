const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SEC_AUTH_KEY_99X';

app.use(cors());
app.use(express.json());

let waSock = null;
let isConnected = false;
let currentQrCode = null; // เก็บ QR Code สดๆ ไว้แสดงบนหน้าเว็บ

async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

        waSock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            // เลียนแบบ Chrome Desktop ให้เสถียรที่สุด ไม่หลุดง่าย
            browser: ['Ubuntu', 'Chrome', '120.0.6099.109'],
            syncFullHistory: false
        });

        waSock.ev.on('creds.update', saveCreds);

        waSock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                currentQrCode = qr;
                console.log('\n======================================================');
                console.log('📱 QR CODE พร้อมแล้ว! (สามารถเปิดสแกนผ่านหน้าเว็บ /qr ได้)');
                console.log('======================================================\n');
                qrcodeTerminal.generate(qr, { small: true });
            }

            if (connection === 'close') {
                currentQrCode = null;
                isConnected = false;
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`⚠️ การเชื่อมต่อปิดตัวลง (Code: ${statusCode}) กำลังลองใหม่...`);
                if (shouldReconnect) {
                    setTimeout(connectToWhatsApp, 3000);
                }
            } else if (connection === 'open') {
                currentQrCode = null;
                isConnected = true;
                console.log('\n🎉 ยินดีด้วย! WhatsApp เชื่อมต่อสำเร็จเรียบร้อยแล้ว!\n');
            }
        });
    } catch (err) {
        console.error('❌ เริ่มการเชื่อมต่อล้มเหลว:', err.message);
        setTimeout(connectToWhatsApp, 5000);
    }
}

// 🌐 1. หน้าเว็บสแกน QR Code แบบรูปภาพ (เปิดผ่านมือถือ/คอมได้เลย)
app.get('/qr', async (req, res) => {
    if (isConnected) {
        return res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff; min-height:100vh;">
                <h1 style="color:#22c55e;">✅ เชื่อมต่อ WhatsApp สำเร็จแล้ว!</h1>
                <p>บอทของคุณออนไลน์พร้อมรับคำสั่งเรียบร้อยแล้วครับ</p>
                <a href="/api/status" style="color:#38bdf8;">คลิกดูสถานะระบบ /api/status</a>
            </div>
        `);
    }

    if (!currentQrCode) {
        return res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff; min-height:100vh;">
                <h2 style="color:#f59e0b;">⏳ กำลังสร้าง QR Code กรุณารอสักครู่...</h2>
                <p>กำลังรีเฟรชอัตโนมัติใน 3 วินาที...</p>
                <script>setTimeout(() => window.location.reload(), 3000);</script>
            </div>
        `);
    }

    try {
        const qrImage = await QRCode.toDataURL(currentQrCode, { width: 320, margin: 2 });
        res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:30px; background:#0f172a; color:#fff; min-height:100vh;">
                <h1 style="color:#38bdf8; margin-bottom:5px;">สแกนเพื่อเชื่อมต่อ WhatsApp</h1>
                <p style="color:#94a3b8; font-size:14px; margin-bottom:20px;">เปิด WhatsApp > เมนู 3 จุด (หรือการตั้งค่า) > อุปกรณ์ที่เชื่อมโยง > สแกน QR Code</p>
                <div style="display:inline-block; padding:15px; background:#fff; border-radius:16px; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
                    <img src="${qrImage}" alt="WhatsApp QR Code" style="display:block;" />
                </div>
                <p style="color:#64748b; font-size:12px; margin-top:20px;">หน้านี้จะรีเฟรชให้อัตโนมัติทุก 20 วินาที</p>
                <script>setTimeout(() => window.location.reload(), 20000);</script>
            </div>
        `);
    } catch (e) {
        res.status(500).send('Error generating QR');
    }
});

// 2. API เช็คสถานะ
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ONLINE',
        botName: 'SC-Fire-Baileys-Bot',
        waConnected: isConnected,
        qrReady: Boolean(currentQrCode),
        timestamp: new Date().toISOString()
    });
});

app.get('/api/ping', (req, res) => {
    res.json({ pong: true, time: Date.now() });
});

// 3. API สั่งส่งข้อความ
app.post('/api/execute', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const bodyKey = req.body.secretKey;
    const incomingKey = authHeader ? authHeader.replace('Bearer ', '') : bodyKey;

    if (incomingKey !== SECRET_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Secret Key' });
    }

    const { targetJid, message = 'ข้อความแจ้งเตือนจากระบบ Base APK' } = req.body;

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
