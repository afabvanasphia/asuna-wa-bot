import { store, UnreadChatState } from '../storage/store.js';
import { formatTime, formatDate } from '../utils/formatter.js';
import { config } from '../config.js';

export class UnreadTrackerService {
  /**
   * Menghasilkan pesan rangkuman chat yang belum dibuka dalam satu hari itu
   */
  public generateDailyDigest(): string {
    const unreadChats = store.getUnreadChats();

    const personalChats = unreadChats.filter(c => !c.isGroup && c.unreadCount > 0);
    const groupChats = unreadChats.filter(c => c.isGroup && c.unreadCount > 0);

    const now = new Date();
    const dateFormatted = formatDate(now, config.timezone);
    const timeFormatted = formatTime(now, config.timezone);

    if (personalChats.length === 0 && groupChats.length === 0) {
      return `✨ *Halo Afab-kun!* (${dateFormatted}, ${timeFormatted})\n\nSemua obrolan di WhatsApp kamu sudah kamu baca dengan rapi hari ini! Tidak ada chat personal maupun grup yang tertinggal. Kerja bagus! 🌸`;
    }

    const totalUnreadChats = personalChats.length + groupChats.length;
    let report = `⚔️ *LAPORAN CHAT BELUM DIBUKA HARI INI* ⚔️\n`;
    report += `👑 *Asuna Assistant* • ${dateFormatted} (${timeFormatted} WIB)\n\n`;
    report += `Afab-kun, kamu memiliki *${totalUnreadChats} obrolan* yang belum kamu buka:\n\n`;

    if (personalChats.length > 0) {
      report += `💬 *Chat Pribadi Belum Terbaca (${personalChats.length}):*\n`;
      personalChats.forEach((c, idx) => {
        const timeStr = formatTime(c.lastMessageTimestamp, config.timezone);
        report += `${idx + 1}. *${c.chatName}* — ${c.unreadCount} pesan baru (${timeStr})\n`;
        if (c.lastMessageSnippet) {
          const snippet = c.lastMessageSnippet.length > 70
            ? c.lastMessageSnippet.substring(0, 70) + '...'
            : c.lastMessageSnippet;
          report += `   > _"${snippet}"_\n`;
        }
      });
      report += '\n';
    }

    if (groupChats.length > 0) {
      report += `👥 *Grup dengan Pesan Menumpuk (${groupChats.length}):*\n`;
      groupChats.forEach((c, idx) => {
        const timeStr = formatTime(c.lastMessageTimestamp, config.timezone);
        report += `${idx + 1}. *${c.chatName}* — ${c.unreadCount} pesan baru (${timeStr})\n`;
      });
      report += '\n';
    }

    report += `💡 *Tips Asuna:*\n`;
    report += `• Ketik */ringkas [Nama Grup]* untuk merangkum obrolan grup yang panjang.\n`;
    report += `• Ketik */clearunread* jika kamu sudah membaca semua pesan di WhatsApp Web/ponsel.`;
    return report;
  }

  /**
   * Mengambil daftar chat pribadi yang belum dibuka dan sudah melewati batas waktu (default: 2 jam)
   */
  public getOverdueUnopenedPersonalChats(hours: number = 2): UnreadChatState[] {
    const unreadChats = store.getUnreadChats();
    const now = Date.now();
    const overdueMs = hours * 60 * 60 * 1000;

    return unreadChats.filter(c => {
      if (c.isGroup) return false;
      if (c.unreadCount <= 0) return false;

      // Apakah pesan masuk sudah lewat 2 jam
      const isOverdue = now - c.lastMessageTimestamp >= overdueMs;
      // Jangan spam: tunggu minimal 2 jam sejak notifikasi terakhir, dan maksimal 3 kali pengingat
      const canNudge = !c.lastNudgedAt || now - c.lastNudgedAt >= overdueMs;
      const underMaxNudges = (c.nudgeCount || 0) < 3;

      return isOverdue && canNudge && underMaxNudges;
    });
  }

  /**
   * Format pesan pengingat proaktif untuk pesan pribadi yang belum dibuka selama 2 jam
   */
  public formatOverduePersonalChatAlert(chat: UnreadChatState): string {
    const hoursAgo = Math.max(2, Math.round((Date.now() - chat.lastMessageTimestamp) / (1000 * 60 * 60)));
    let alert = `⚠️ *PENGINGAT PESAN BELUM DIBUKA (${hoursAgo} Jam Lalu)* 📩\n\n`;
    alert += `Halo Afab-kun! Ada chat pribadi dari *${chat.chatName}* yang masuk ${hoursAgo} jam lalu dan belum kamu buka:\n\n`;
    if (chat.lastMessageSnippet) {
      alert += `💬 > _"${chat.lastMessageSnippet}"_\n\n`;
    }
    alert += `Jumlah pesan belum dibaca: *${chat.unreadCount} pesan*.\n`;
    alert += `Jangan lupa dicek di WhatsApp ya agar pengirim tidak menunggu terlalu lama! 🌸\n\n`;
    alert += `_Ketik */clearunread* jika kamu sudah membaca pesan ini._`;
    return alert;
  }
}

export const unreadTrackerService = new UnreadTrackerService();
