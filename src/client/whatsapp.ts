import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { store } from '../storage/store.js';
import { messageHandler } from '../handlers/messageHandler.js';
import fs from 'fs';

export class WhatsAppClient {
  public socket: WASocket | null = null;
  private isConnecting: boolean = false;
  private messageStore = new Map<string, proto.IMessage>();

  public async start() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(config.authFolder);
      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info({ version, isLatest }, 'Memulai koneksi WhatsApp Multi-Device...');

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: logger.child({ module: 'baileys' }) as any,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        getMessage: async key => {
          if (key.id && this.messageStore.has(key.id)) {
            return this.messageStore.get(key.id);
          }
          return undefined;
        },
      });

      this.socket = sock;
      messageHandler.setClient(this);

      // Handle QR code and Connection Updates
      sock.ev.on('connection.update', async update => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.clear();
          console.log('\n============================================================');
          console.log('  SCAN QR CODE DI BAWAH INI DENGAN WHATSAPP ANDA:');
          console.log('============================================================\n');
          qrcode.generate(qr, { small: true });
          console.log('\nBuka WhatsApp di ponsel > Menu > Perangkat Tertaut > Tautkan Perangkat\n');
        }

        if (connection === 'close') {
          const shouldReconnect =
            (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
          logger.warn(
            { reason: lastDisconnect?.error, shouldReconnect },
            'Koneksi WhatsApp terputus'
          );
          this.isConnecting = false;
          if (shouldReconnect) {
            setTimeout(() => this.start(), 3000);
          } else {
            logger.error('Sesi telah logout, silakan hapus folder auth dan scan ulang QR.');
          }
        } else if (connection === 'open') {
          this.isConnecting = false;
          logger.info('🎉 Berhasil terhubung ke WhatsApp!');

          // Deteksi profil bot & mode operasi (Self-Assistant vs Dedicated Bot)
          if (sock.user) {
            const connectedPhone = (sock.user.id || '').split(':')[0].split('@')[0];
            const connectedLid = ((sock.user as any)?.lid || '').split(':')[0].split('@')[0];
            config.botPhoneNumber = connectedPhone;
            config.botJid = `${connectedPhone}@s.whatsapp.net`;

            if (!config.ownerPhoneNumber) {
              // Jika OWNER_PHONE_NUMBER di .env belum diisi, gunakan nomor login sebagai owner (Self-Bot)
              config.ownerPhoneNumber = connectedPhone;
              config.ownerJid = `${connectedPhone}@s.whatsapp.net`;
              if (connectedLid) config.ownerLid = connectedLid;
              if (sock.user.name) config.ownerName = sock.user.name;
              logger.info({ mode: 'SELF_BOT', ownerJid: config.ownerJid }, 'Mode Self-Assistant Aktif');
            } else {
              config.ownerJid = `${config.ownerPhoneNumber}@s.whatsapp.net`;
              const isDedicated = connectedPhone !== config.ownerPhoneNumber;
              logger.info({
                mode: isDedicated ? 'DEDICATED_BOT' : 'SELF_BOT',
                botPhone: config.botPhoneNumber,
                ownerPhone: config.ownerPhoneNumber,
                ownerJid: config.ownerJid,
              }, 'Sesi Asuna berhasil dihubungkan');

              // Jika berjalan dengan nomor bot khusus, otomatis perbarui foto profil Asuna
              if (isDedicated && fs.existsSync(config.avatarPath)) {
                try {
                  await sock.updateProfilePicture(sock.user.id, { url: config.avatarPath });
                  await sock.updateProfileStatus('Asuna - Personal AI Copilot ⚔️');
                  logger.info('Foto profil dan status Asuna berhasil dipasang di akun WhatsApp bot!');
                } catch (pe) {
                  logger.warn({ err: pe }, 'Gagal memperbarui foto profil otomatis (dapat diubah manual di WA)');
                }
              }
            }
          }

          // Ambil metadata grup yang diikuti untuk populate nama grup
          try {
            const participatingGroups = await sock.groupFetchAllParticipating();
            for (const [jid, groupMeta] of Object.entries(participatingGroups)) {
              store.setGroupName(jid, groupMeta.subject);
            }
            logger.info({ groupCount: Object.keys(participatingGroups).length }, 'Metadata grup berhasil dimuat');
          } catch (e) {
            logger.warn({ err: e }, 'Gagal memuat metadata grup saat startup');
          }

          // Kirim salam pembuka ke pemilik jika sudah dikonfigurasi (TEKS SAJA)
          if (config.ownerJid) {
            const welcomeMsg = `⚔️ *Halo Afab-kun! Asuna AI Assistant sudah aktif!* ✨\n\nSaya menggunakan nomor ini khusus untuk menjadi asisten pribadi kamu. Saya akan memantau:\n• 📩 Chat yang belum kamu buka hari ini (*Daily Unread*)\n• 🔔 Tag/mention penting di grup WhatsApp tempat saya bergabung\n• 📝 Catatan otomatis rapat & Google Meet ke agenda/kalender\n\nKetik */help* kapan saja untuk melihat menu perintah ya! 😊`;
            await this.sendToOwner(welcomeMsg);
          }
        }
      });

      // Simpan credentials saat diperbarui
      sock.ev.on('creds.update', saveCreds);

      // Tangani pesan masuk
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
          if (msg.key.id && msg.message) {
            this.messageStore.set(msg.key.id, msg.message);
          }
          try {
            await messageHandler.handleMessage(msg);
          } catch (err) {
            logger.error({ err, msgId: msg.key.id }, 'Error saat memproses pesan');
          }
        }
      });

      // Tangani pembaruan nama grup
      sock.ev.on('groups.update', async groups => {
        for (const g of groups) {
          if (g.id && g.subject) {
            store.setGroupName(g.id, g.subject);
          }
        }
      });
    } catch (err) {
      this.isConnecting = false;
      logger.error({ err }, 'Gagal memulai koneksi WhatsApp');
      setTimeout(() => this.start(), 5000);
    }
  }

  /**
   * Kirim pesan teks langsung ke ruang obrolan pribadi Pemilik (Owner)
   */
  public async sendToOwner(text: string) {
    if (!this.socket || !config.ownerJid) {
      logger.warn({ ownerJid: config.ownerJid }, 'Tidak dapat mengirim pesan ke owner: socket belum siap atau ownerJid kosong');
      return;
    }

    try {
      const sent = await this.socket.sendMessage(config.ownerJid, { text });
      if (sent?.key?.id && sent.message) {
        this.messageStore.set(sent.key.id, sent.message);
      }
      logger.info('Pesan berhasil terkirim ke Owner');
    } catch (err) {
      logger.error({ err }, 'Gagal mengirim pesan ke Owner');
    }
  }

  /**
   * Kirim pesan gambar (dengan caption) langsung ke obrolan pribadi Pemilik (Owner)
   */
  public async sendImageToOwner(imagePath: string, caption?: string) {
    if (!this.socket || !config.ownerJid) {
      logger.warn({ ownerJid: config.ownerJid }, 'Tidak dapat mengirim gambar: socket belum siap atau ownerJid kosong');
      return;
    }

    try {
      if (fs.existsSync(imagePath)) {
        await this.socket.sendMessage(config.ownerJid, {
          image: fs.readFileSync(imagePath),
          caption: caption || '',
        });
        logger.info({ imagePath }, 'Gambar berhasil terkirim ke Owner');
      } else {
        await this.sendToOwner(caption || '');
      }
    } catch (err) {
      logger.error({ err }, 'Gagal mengirim gambar ke Owner, fallback ke pesan teks');
      if (caption) {
        await this.sendToOwner(caption);
      }
    }
  }
}

export const whatsappClient = new WhatsAppClient();
