import http from 'http';
import { latestQrDataUrl, latestPairingCode, isConnectedToWhatsApp } from './client/whatsapp.js';
import { logger } from './utils/logger.js';

export function startWebServer() {
  const port = parseInt(process.env.PORT || '3000', 10);
  
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (isConnectedToWhatsApp) {
      res.end(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Asuna WA Bot - Online</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
            .card { background: #1e293b; padding: 2.5rem; border-radius: 1.2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; max-width: 450px; width: 90%; }
            h1 { color: #22c55e; margin: 0 0 0.5rem; font-size: 1.8rem; }
            p { color: #94a3b8; font-size: 1.05rem; line-height: 1.5; }
            .badge { display: inline-block; background: #166534; color: #4ade80; padding: 0.4rem 1.2rem; border-radius: 9999px; font-weight: 600; font-size: 0.95rem; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>🎉 Asuna Berhasil Terhubung!</h1>
            <p>WhatsApp AI Agent Anda saat ini aktif 24 jam nonstop di cloud Railway.</p>
            <div class="badge">● Status: Terhubung</div>
          </div>
        </body>
        </html>
      `);
      return;
    }

    res.end(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tautkan WhatsApp - Asuna</title>
        <meta http-equiv="refresh" content="8">
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0b1120; color: #f8fafc; padding: 1.5rem; }
          .card { background: #1e293b; padding: 2rem; border-radius: 1.5rem; box-shadow: 0 20px 35px rgba(0,0,0,0.6); text-align: center; max-width: 480px; width: 100%; border: 1px solid #334155; }
          h2 { margin: 0 0 0.5rem; color: #38bdf8; font-size: 1.6rem; }
          .subtitle { color: #94a3b8; font-size: 0.95rem; margin-bottom: 1.2rem; }
          .qr-box { background: #ffffff; padding: 1.2rem; border-radius: 1rem; display: inline-block; box-shadow: 0 8px 16px rgba(0,0,0,0.3); }
          .qr-img { width: 260px; height: 260px; display: block; image-rendering: pixelated; }
          .loading-qr { width: 260px; height: 260px; display: flex; align-items: center; justify-content: center; color: #475569; font-weight: 500; }
          .pairing-card { background: #0f172a; border: 1.5px dashed #475569; border-radius: 1rem; padding: 1rem; margin-top: 1.2rem; }
          .pairing-title { font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.3rem; }
          .pairing-code { font-size: 2rem; font-weight: 800; letter-spacing: 5px; color: #facc15; font-family: monospace; }
          .steps { font-size: 0.85rem; color: #cbd5e1; text-align: left; margin: 0.8rem 0 0; line-height: 1.6; background: #1e293b; padding: 0.8rem 1rem; border-radius: 0.6rem; }
          .footer { font-size: 0.75rem; color: #64748b; margin-top: 1.2rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>👑 Scan WhatsApp - Asuna</h2>
          <div class="subtitle">Buka WhatsApp di ponsel bot lalu scan QR Code di bawah</div>

          <div class="qr-box">
            ${latestQrDataUrl 
              ? `<img class="qr-img" src="${latestQrDataUrl}" alt="WhatsApp QR Code" />`
              : `<div class="loading-qr">Sedang menyiapkan QR Code...</div>`
            }
          </div>

          ${latestPairingCode ? `
          <div class="pairing-card">
            <div class="pairing-title">Atau gunakan Kode Pairing:</div>
            <div class="pairing-code">${latestPairingCode}</div>
            <div class="steps">
              1. Buka WA di HP bot > Perangkat Tertaut > Tautkan<br/>
              2. Klik <b>"Tautkan dengan nomor telepon saja"</b><br/>
              3. Masukkan 8 digit kode di atas
            </div>
          </div>
          ` : ''}

          <div class="footer">Halaman otomatis memperbarui status setiap beberapa detik.</div>
        </div>
      </body>
      </html>
    `);
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info({ port }, `🌐 Web server QR & Pairing aktif di port ${port} (0.0.0.0)`);
  });
}
