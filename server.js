const express = require('express');
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
