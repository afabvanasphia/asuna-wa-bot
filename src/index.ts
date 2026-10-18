import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}

import cron from 'node-cron';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { whatsappClient } from './client/whatsapp.js';
import { unreadTrackerService } from './services/unreadTracker.js';
import { mentionWatcherService } from './services/mentionWatcher.js';
import { store } from './storage/store.js';
import { startWebServer } from './server.js';

async function bootstrap() {
  console.log(`
  ============================================================
    ⚔️ Asuna - Personal WhatsApp Executive AI Copilot 👑
    Powered by Gemini 3.8 Flash & Baileys Multi-Device
  ============================================================
  `);

  logger.info({
    assistant: config.assistantName,
    owner: config.ownerPhoneNumber || 'BELUM DIISI',
    model: config.geminiModel,
    timezone: config.timezone,
    digestHours: config.digestHours,
  }, 'Konfigurasi sistem dimuat');

  if (!config.ownerPhoneNumber) {
    logger.warn('⚠️ OWNER_PHONE_NUMBER belum diisi di .env! Asisten tidak tahu nomor siapa yang harus diberi notifikasi.');
  }

  // 0. Jalankan Web Server untuk menampilkan QR Code & Pairing Code di Browser
  startWebServer();

  // 1. Inisialisasi Klien WhatsApp
  await whatsappClient.start();

  // 2. Setup Cron Scheduler untuk Daily Unread Digest
  for (const hour of config.digestHours) {
    // Jalankan setiap jam yang ditentukan, menit 00
    const cronExpr = `0 ${hour} * * *`;
    cron.schedule(
      cronExpr,
      async () => {
        logger.info({ hour }, 'Menjalankan jadwal Daily Unread Digest...');
        const digest = unreadTrackerService.generateDailyDigest();
        await whatsappClient.sendToOwner(digest);
      },
      {
        timezone: config.timezone,
      }
    );
    logger.info({ schedule: `${hour}:00 ${config.timezone}` }, 'Jadwal Daily Digest aktif');
  }

  // 3. Setup Cron Scheduler untuk Mention Nudge (cek tiap 30 menit)
  cron.schedule('*/30 * * * *', async () => {
    const dueNudges = mentionWatcherService.getPendingNudges();
    if (dueNudges.length > 0) {
      logger.info({ count: dueNudges.length }, 'Mengirimkan pengingat tag tertunda ke Owner...');
      for (const m of dueNudges) {
        const nudgeText = mentionWatcherService.formatNudgeAlert(m);
        await whatsappClient.sendToOwner(nudgeText);
        store.updateMentionNudge(m.id);
      }
    }
  });

  // 4. Setup Cron Scheduler untuk Pesan Pribadi Belum Dibuka 2 Jam (cek tiap 15 menit)
  cron.schedule('*/15 * * * *', async () => {
    const overduePersonal = unreadTrackerService.getOverdueUnopenedPersonalChats(2);
    if (overduePersonal.length > 0) {
      logger.info({ count: overduePersonal.length }, 'Mengirimkan pengingat pesan personal tertunda 2 jam ke Owner...');
      for (const c of overduePersonal) {
        const alertMsg = unreadTrackerService.formatOverduePersonalChatAlert(c);
        await whatsappClient.sendToOwner(alertMsg);
        store.updateUnreadNudge(c.chatJid);
      }
    }
  });

  // Graceful Shutdown
  const shutdown = () => {
    logger.info('Menutup aplikasi secara aman...');
    store.save();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch(err => {
  logger.fatal({ err }, 'Terjadi kegagalan fatal saat startup aplikasi');
});
