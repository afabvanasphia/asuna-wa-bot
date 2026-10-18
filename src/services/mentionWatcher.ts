import { store, TrackedMention } from '../storage/store.js';
import { config } from '../config.js';
import { formatTime, formatDate } from '../utils/formatter.js';

export class MentionWatcherService {
  /**
   * Format pesan notifikasi instan saat pengguna di-mention/tag di grup
   */
  public formatInstantMentionAlert(mention: TrackedMention): string {
    const timeStr = formatTime(mention.timestamp, config.timezone);
    return `🔔 *ANDA DI-TAG DI GRUP!*
👥 *Grup:* ${mention.groupName}
👤 *Oleh:* ${mention.senderName}
⏰ *Waktu:* ${timeStr} WIB

💬 *Isi Pesan:*
> ${mention.messageText}

_Asisten akan mengingatkan kembali jika belum direspons dalam ${config.mentionSnoozeHours} jam._`;
  }

  /**
   * Cek mention yang sudah lewat batas waktu (snooze nudge)
   */
  public getPendingNudges(): TrackedMention[] {
    const unresolved = store.getUnresolvedMentions();
    const now = Date.now();
    const snoozeMs = config.mentionSnoozeHours * 60 * 60 * 1000;

    const dueList: TrackedMention[] = [];
    for (const m of unresolved) {
      if (now - m.lastNotifiedAt >= snoozeMs && m.nudgeCount < 3) {
        dueList.push(m);
      }
    }
    return dueList;
  }

  /**
   * Format pengingat lembut (nudge) untuk tag yang belum ditanggapi
   */
  public formatNudgeAlert(mention: TrackedMention): string {
    const timeAgoHours = Math.round((Date.now() - mention.timestamp) / (1000 * 60 * 60));
    return `⚠️ *PENGINGAT TAG TERTUNDA (${timeAgoHours} Jam Lalu)*
Anda masih memiliki tag dari *${mention.senderName}* di grup *${mention.groupName}* yang belum sempat Anda respons:

💬 _"${mention.messageText}"_

_Ketik */clear* jika Anda sudah membaca/meresponsnya secara langsung._`;
  }

  /**
   * Format daftar semua mention yang masih pending
   */
  public formatPendingMentionsList(): string {
    const unresolved = store.getUnresolvedMentions();
    if (unresolved.length === 0) {
      return '✨ Tidak ada mention atau tag yang tertunda di grup!';
    }

    let report = `📌 *DAFTAR MENTION/TAG TERTUNDA (${unresolved.length}):*\n\n`;
    unresolved.forEach((m, idx) => {
      const timeStr = formatTime(m.timestamp, config.timezone);
      report += `${idx + 1}. *${m.groupName}* (${m.senderName} • ${timeStr} WIB)\n`;
      report += `   💬 _"${m.messageText}"_\n\n`;
    });
    report += `_Ketik */clear* untuk menandai semua mention selesai._`;
    return report;
  }
}

export const mentionWatcherService = new MentionWatcherService();
