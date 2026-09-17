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

// เบอร์โทรของคุณ
const MY_PHONE_NUMBER = "66941876682";

app.use(cors());
app.use(express.json());

process.on('uncaughtException', (err) => console.error('⚠️ Error Guard:', err.message));
process.on('unhandledRejection', (reason) => console.error('⚠️ Rejection Guard:', reason));

let waSock = null;
let isConnected = false;
let currentRawQr = null;
let lastGeneratedCode = null;

async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        waSock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000
        });

        waSock.ev.on('creds.update', saveCreds);

        waSock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) currentRawQr = qr;

            if (connection === 'close') {
                isConnected = false;
                lastGeneratedCode = null;
                currentRawQr = null;
                setTimeout(connectToWhatsApp, 6000);
            } else if (connection === 'open') {
                isConnected = true;
                lastGeneratedCode = null;
                currentRawQr = null;
                console.log('\n🎉 ยินดีด้วย! WhatsApp เชื่อมต่อสำเร็จเรียบร้อยแล้ว!\n');
            }
        });

    } catch (err) {
        setTimeout(connectToWhatsApp, 6000);
    }
}

// 🔑 1. หน้าเว็บกดขอรหัสตัวเลข 8 ตัวใหม่ (กดรีเฟรชเพื่อขอรหัสใหม่ได้ตลอด)
app.get('/pair', async (req, res) => {
    if (isConnected) {
        return res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff; min-height:100vh;">
                <h1 style="color:#22c55e;">✅ บอทเชื่อมต่อ WhatsApp สำเร็จแล้ว!</h1>
                <p>อุปกรณ์ของคุณผูกกับระบบเรียบร้อย ไม่จำเป็นต้องขอรหัสแล้วครับ</p>
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
        // สั่งสร้างรหัส 8 ตัวสดๆ จาก WhatsApp
        lastGeneratedCode = await waSock.requestPairingCode(MY_PHONE_NUMBER);
        console.log(`🔑 รหัส Pairing Code ใหม่: ${lastGeneratedCode}`);

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>ขอรหัสเชื่อมโยง WhatsApp ใหม่</title>
            </head>
            <body style="font-family:sans-serif; text-align:center; padding:30px; background:#0f172a; color:#fff; min-height:100vh;">
                <h2 style="color:#38bdf8; font-size:20px; margin-bottom:6px;">รหัสเชื่อมโยง WhatsApp ใหม่</h2>
                <p style="color:#94a3b8; font-size:13px; margin-bottom:20px;">เบอร์โทร: <b>${MY_PHONE_NUMBER}</b></p>
                
                <div style="margin:20px auto; padding:20px 30px; background:#1e293b; border-radius:16px; display:inline-block; border:2px solid #22c55e; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                    <div style="font-size:42px; font-weight:bold; letter-spacing:8px; color:#4ade80; font-family:monospace;">
                        ${lastGeneratedCode}
                    </div>
                </div>

                <div style="margin-top:20px;">
                    <a href="/pair" style="display:inline-block; padding:10px 20px; background:#334155; color:#fff; text-decoration:none; border-radius:8px; font-size:13px; font-weight:bold;">🔄 กดตรงนี้เพื่อขอรหัสใหม่อีกครั้ง</a>
                </div>

                <div style="margin-top:30px; max-width:400px; margin-left:auto; margin-right:auto; text-align:left; background:#1e293b/60; padding:16px; border-radius:12px; border:1px solid #334155; font-size:13px; color:#cbd5e1; line-height:1.6;">
                    <b>📌 วิธีใช้:</b><br>
                    1. เปิด WhatsApp ➔ <b>อุปกรณ์ที่เชื่อมโยง</b> ➔ <b>เชื่อมโยงอุปกรณ์</b><br>
                    2. แตะคำว่า <b>"หรือเชื่อมโยงด้วยหมายเลขโทรศัพท์"</b> ด้านล่าง<br>
                    3. พิมพ์รหัส 8 ตัวด้านบนนี้ลงไปทันที (มีอายุ 60 วินาที)<br><br>
                    <i>⚠️ หาก WhatsApp ตัดการเชื่อมต่อ (Connection Closed) แนะนำให้ใช้ <a href="/qr" style="color:#38bdf8; text-decoration:underline;">หน้าสแกน QR Code (/qr)</a> จะติดแน่นอน 100% ครับ</i>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('❌ ขอรหัสล้มเหลว:', err.message);
        res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:40px; background:#0f172a; color:#fff; min-height:100vh;">
                <h3 style="color:#ef4444;">⚠️ ขอรหัสไม่สำเร็จ: ${err.message}</h3>
                <p style="color:#94a3b8; font-size:14px; margin:15px auto; max-width:400px;">
                    WhatsApp ปิดกั้นการขอรหัสจากเครื่อง Server คลาวด์ ให้กดเปลี่ยนไปใช้วิธีสแกน QR Code แทนได้ทันทีครับ:
                </p>
                <a href="/qr" style="display:inline-block; margin-top:10px; padding:12px 24px; background:#22c55e; color:#fff; text-decoration:none; border-radius:10px; font-weight:bold;">👉 เปิดหน้าสแกน QR Code (/qr)</a>
                <br><br>
                <a href="/pair" style="color:#94a3b8; font-size:12px;">หรือลองกดขอรหัสใหม่อีกครั้ง</a>
            </div>
        `);
    }
});

// 📱 2. หน้าเว็บสแกน QR Code
app.get('/qr', (req, res) => {
    if (isConnected) {
        return res.send('<h2 style="color:#22c55e;text-align:center;padding:50px;background:#0f172a;color:#fff;min-height:100vh;">✅ WhatsApp เชื่อมต่อสำเร็จแล้ว!</h2>');
    }

    if (!currentRawQr) {
        return res.send(`
            <!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Loading...</title></head>
            <body style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#fff; min-height:100vh;">
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
            <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="20">
            <title>สแกน QR Code WhatsApp</title>
        </head>
        <body style="font-family:sans-serif; text-align:center; padding:25px; background:#0f172a; color:#fff; min-height:100vh;">
            <h1 style="color:#38bdf8; font-size:22px;">สแกนเพื่อเชื่อมต่อ WhatsApp</h1>
            <p style="color:#94a3b8; font-size:13px; margin-bottom:15px;">เปิด WhatsApp ➔ อุปกรณ์ที่เชื่อมโยง ➔ สแกนรูปด้านล่าง:</p>
            <div style="display:inline-block; padding:15px; background:#fff; border-radius:16px;">
                <img src="${qrImageUrl}" alt="WhatsApp QR" style="display:block; width:280px; height:280px;" />
            </div>
            <p style="color:#64748b; font-size:12px; margin-top:15px;">⏱️ หน้านี้จะรีเฟรชให้อัตโนมัติ</p>
        </body>
        </html>
    `);
});

// หน้าเช็คสถานะ
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ONLINE',
        botName: 'SC-Fire-Baileys-Bot',
        waConnected: isConnected,
        phoneNumber: MY_PHONE_NUMBER,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 เซิร์ฟเวอร์ทำงานที่พอร์ต ${PORT}`);
    connectToWhatsApp();
});
