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

// เบอร์โทรของคุณ (รหัสประเทศ 66 ตัดเลข 0 หน้าสุดออก)
const MY_PHONE_NUMBER = "66941876682";

app.use(cors());
app.use(express.json());

process.on('uncaughtException', (err) => console.error('⚠️ Error Guard:', err.message));
process.on('unhandledRejection', (reason) => console.error('⚠️ Rejection Guard:', reason));

let waSock = null;
let isConnected = false;
let currentPairCode = null; // เก็บตัวเลข 8 ตัวไว้

async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        waSock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            // เลียนแบบ Chrome บน Mac เพื่อป้องกัน WhatsApp ตัดการเชื่อมต่อ (แก้ Connection Closed)
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000
        });

        waSock.ev.on('creds.update', saveCreds);

        waSock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                isConnected = false;
                currentPairCode = null;
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                console.log(`⚠️ การเชื่อมต่อปิดตัวลง (Status: ${statusCode}) กำลังต่อใหม่...`);
                setTimeout(connectToWhatsApp, 5000);
            } else if (connection === 'open') {
                isConnected = true;
                currentPairCode = null;
                console.log('\n🎉 ยินดีด้วย! WhatsApp เชื่อมต่อสำเร็จเรียบร้อยแล้ว!\n');
            }
        });

    } catch (err) {
        console.error('❌ เริ่มการเชื่อมต่อล้มเหลว:', err.message);
        setTimeout(connectToWhatsApp, 5000);
    }
}

// 🔑 หน้าเว็บแสดงรหัส 8 ตัว (เปิดดูบนมือถือได้เลย)
app.get('/pair', async (req, res) => {
    if (isConnected) {
        return res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff; min-height:100vh;">
                <h1 style="color:#22c55e;">✅ บอทเชื่อมต่อ WhatsApp เรียบร้อยแล้ว!</h1>
                <p>อุปกรณ์ของคุณผูกกับเซิร์ฟเวอร์เรียบร้อย ไม่ต้องขอรหัสแล้วครับ</p>
                <a href="/api/status" style="color:#38bdf8;">ดูสถานะ /api/status</a>
            </div>
        `);
    }

    if (!waSock) {
        return res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff; min-height:100vh;">
                <h2 style="color:#f59e0b;">⏳ เซิร์ฟเวอร์กำลังสตาร์ท กรุณารอ 5 วินาทีแล้วกดรีเฟรชใหม่</h2>
                <script>setTimeout(() => window.location.reload(), 5000);</script>
            </div>
        `);
    }

    try {
        // ขอรหัส 8 ตัวสดๆ จากเซิร์ฟเวอร์ WhatsApp
        currentPairCode = await waSock.requestPairingCode(MY_PHONE_NUMBER);
        console.log(`\n🔑 รหัสเชื่อมโยง WhatsApp ล่าสุด: ${currentPairCode}\n`);

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>รหัสเชื่อมโยง WhatsApp</title>
            </head>
            <body style="font-family:sans-serif; text-align:center; padding:30px; background:#0f172a; color:#fff; min-height:100vh;">
                <h2 style="color:#38bdf8; font-size:20px; margin-bottom:8px;">รหัสเชื่อมโยง WhatsApp (Pairing Code)</h2>
                <p style="color:#94a3b8; font-size:13px; margin-bottom:20px;">สำหรับเบอร์โทร: <b>${MY_PHONE_NUMBER}</b></p>
                
                <div style="margin:20px auto; padding:20px 30px; background:#1e293b; border-radius:16px; display:inline-block; border:2px solid #22c55e; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
                    <div style="font-size:42px; font-weight:bold; letter-spacing:8px; color:#4ade80; font-family:monospace;">
                        ${currentPairCode}
                    </div>
                </div>

                <div style="margin-top:25px; max-width:400px; margin-left:auto; margin-right:auto; text-align:left; background:#1e293b/60; padding:15px; border-radius:12px; border:1px solid #334155; font-size:13px; color:#cbd5e1; line-height:1.6;">
                    <b>📌 วิธีใช้รหัสนี้:</b><br>
                    1. เปิด WhatsApp ➔ <b>อุปกรณ์ที่เชื่อมโยง</b><br>
                    2. กด <b>"เชื่อมโยงอุปกรณ์"</b><br>
                    3. กดคำว่า <b>"หรือเชื่อมโยงด้วยหมายเลขโทรศัพท์"</b> ด้านล่าง<br>
                    4. พิมพ์รหัส 8 ตัวด้านบนนี้ลงไปทันที (มีอายุ 60 วินาที)
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('❌ ไม่สามารถขอรหัสได้:', err.message);
        res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:40px; background:#0f172a; color:#fff; min-height:100vh;">
                <h3 style="color:#ef4444;">⚠️ ขอรหัสไม่สำเร็จ: ${err.message}</h3>
                <p style="color:#94a3b8; font-size:14px; margin-top:10px;">WhatsApp ปิดกั้นการขอรหัสจาก IP คลาวด์ ให้กดเปลี่ยนไปใช้วิธีสแกน QR Code แทนได้ทันที:</p>
                <a href="/qr" style="display:inline-block; margin-top:15px; padding:12px 24px; background:#22c55e; color:#fff; text-decoration:none; border-radius:10px; font-weight:bold;">👉 สลับไปหน้าสแกน QR Code (/qr)</a>
            </div>
        `);
    }
});

// API ตรวจสอบสถานะ
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ONLINE',
        waConnected: isConnected,
        phoneNumber: MY_PHONE_NUMBER,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 เซิร์ฟเวอร์ทำงานที่พอร์ต ${PORT}`);
    connectToWhatsApp();
});
