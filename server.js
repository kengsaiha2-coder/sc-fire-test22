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
let pairingCode = null;

async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        waSock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'),
            syncFullHistory: false
        });

        waSock.ev.on('creds.update', saveCreds);

        waSock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) currentRawQr = qr;

            if (connection === 'close') {
                currentRawQr = null;
                isConnected = false;
                pairingCode = null;
                setTimeout(connectToWhatsApp, 8000);
            } else if (connection === 'open') {
                currentRawQr = null;
                pairingCode = null;
                isConnected = true;
                console.log('\n🎉 เชื่อมต่อ WhatsApp สำเร็จแล้ว!\n');
            }
        });
    } catch (err) {
        setTimeout(connectToWhatsApp, 8000);
    }
}

// 🔢 หน้าเว็บสำหรับกดขอรหัสตัวเลข 8 ตัว (Pairing Code)
app.get('/pair', async (req, res) => {
    const phone = req.query.phone || "66941876682"; // เบอร์ของคุณ (รหัสประเทศ 66 นำหน้า)

    if (isConnected) {
        return res.send('<h2 style="color:green;text-align:center;padding:50px;">✅ เชื่อมต่อ WhatsApp สำเร็จแล้ว ไม่ต้องใส่รหัสแล้วครับ</h2>');
    }

    if (!waSock) {
        return res.send('<h2 style="text-align:center;padding:50px;">⏳ เซิร์ฟเวอร์กำลังสตาร์ท กรุณารอ 5 วินาทีแล้วกดรีเฟรชใหม่ครับ</h2>');
    }

    try {
        if (!pairingCode) {
            pairingCode = await waSock.requestPairingCode(phone);
            console.log('🔑 ได้รับรหัส Pairing Code แล้ว:', pairingCode);
        }

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>รหัสเชื่อมโยง WhatsApp</title>
            </head>
            <body style="font-family:sans-serif; text-align:center; padding:30px; background:#0f172a; color:#fff;">
                <h2 style="color:#38bdf8;">รหัสเชื่อมโยง WhatsApp สำหรับเบอร์ ${phone}</h2>
                <div style="margin:30px auto; padding:20px; background:#1e293b; border-radius:16px; display:inline-block; border:2px solid #38bdf8;">
                    <div style="font-size:36px; font-weight:bold; letter-spacing:6px; color:#4ade80;">
                        ${pairingCode}
                    </div>
                </div>
                <p style="color:#94a3b8; font-size:14px;">
                    👉 นำรหัส 8 ตัวนี้ไปกรอกใน WhatsApp บนมือถือได้เลยครับ (มีอายุประมาณ 60 วินาที)
                </p>
            </body>
            </html>
        `);
    } catch (err) {
        res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:40px; background:#0f172a; color:#fff;">
                <h3 style="color:#ef4444;">⚠️ ไม่สามารถขอรหัสได้ (${err.message})</h3>
                <p style="color:#94a3b8;">WhatsApp อาจไม่อนุญาตให้ขอรหัสผ่านคลาวด์ แนะนำให้ใช้ <a href="/qr" style="color:#38bdf8;">วิธีสแกน QR Code ที่นี่</a> จะติดชัวร์ 100% ครับ</p>
            </div>
        `);
    }
});

// หน้าสแกน QR Code
app.get('/qr', (req, res) => {
    if (isConnected) return res.send('<h2 style="color:green;text-align:center;padding:50px;">✅ เชื่อมต่อแล้ว</h2>');
    if (!currentRawQr) return res.send('<meta http-equiv="refresh" content="3"><h2 style="text-align:center;padding:50px;">⏳ รอ QR Code สักครู่...</h2>');
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(currentRawQr)}`;
    res.send(`<div style="text-align:center;padding:30px;background:#0f172a;color:#fff;"><h2 style="color:#38bdf8;">สแกน QR Code</h2><img src="${qrUrl}" style="background:#fff;padding:10px;border-radius:12px;"/></div>`);
});

app.get('/api/status', (req, res) => {
    res.json({ status: 'ONLINE', waConnected: isConnected });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server on port ${PORT}`);
    connectToWhatsApp();
});
