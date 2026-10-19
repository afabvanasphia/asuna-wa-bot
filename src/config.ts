import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface AppConfig {
  geminiApiKey: string;
  geminiModel: string;
  ownerPhoneNumber: string;
  ownerJid: string;
  ownerLid?: string;
  ownerName?: string;
  botPhoneNumber?: string;
  botJid?: string;
  assistantName: string;
  timezone: string;
  digestHours: number[];
  mentionSnoozeHours: number;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRefreshToken?: string;
  googleCalendarId: string;
  authFolder: string;
  dataStorePath: string;
  avatarPath: string;
}

let rawOwnerNumber = (process.env.OWNER_PHONE_NUMBER || '6281335238814').replace(/[^0-9]/g, '');
const botNumber = (process.env.BOT_PHONE_NUMBER || '628211312197').replace(/[^0-9]/g, '');

// Jika variabel OWNER_PHONE_NUMBER di Railway tidak sengaja terisi nomor bot, paksa kembali ke nomor Owner asli
if (!rawOwnerNumber || rawOwnerNumber.includes('628211312197') || rawOwnerNumber.includes('08211312197') || rawOwnerNumber === botNumber) {
  rawOwnerNumber = '6281335238814';
}
const ownerJid = '6281335238814@s.whatsapp.net';

const rawDigestHours = process.env.DIGEST_HOURS || '8,12,18,21';
const digestHours = rawDigestHours
  .split(',')
  .map(h => parseInt(h.trim(), 10))
  .filter(h => !isNaN(h) && h >= 0 && h <= 23);

export const config: AppConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  ownerPhoneNumber: rawOwnerNumber,
  ownerJid,
  ownerLid: process.env.OWNER_LID || '49151723208777',
  assistantName: process.env.ASSISTANT_NAME || 'Asuna',
  botPhoneNumber: (process.env.BOT_PHONE_NUMBER || '628211312197').replace(/[^0-9]/g, ''),
  timezone: process.env.USER_TIMEZONE || 'Asia/Jakarta',
  digestHours: digestHours.length > 0 ? digestHours : [8, 12, 18, 21],
  mentionSnoozeHours: parseInt(process.env.MENTION_SNOOZE_HOURS || '2', 10),
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  authFolder: path.resolve(process.env.AUTH_FOLDER || './auth_info_baileys'),
  dataStorePath: path.resolve(process.env.DATA_STORE_PATH || './data/store.json'),
  avatarPath: path.resolve('./assets/asuna.png'),
};
