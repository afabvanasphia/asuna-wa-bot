import { store, PendingMeetingApproval } from '../storage/store.js';
import { calendarService } from '../services/calendar.js';
import { logger } from '../utils/logger.js';

export class ApprovalHandler {
  /**
   * Format pesan draf konfirmasi jadwal rapat untuk dikirim ke chat privat pengguna
   */
  public formatApprovalPrompt(meeting: PendingMeetingApproval): string {
    return `📅 *DETEKSI JADWAL RAPAT BARU!*
• *Agenda:* *${meeting.title}*
• *Waktu:* ${meeting.date} (${meeting.startTime} - ${meeting.endTime} WIB)
• *Platform/Lokasi:* ${meeting.locationOrLink || 'Online / Belum ditentukan'}
• *Sumber:* Grup *${meeting.groupName}*
${meeting.summary ? `• *Keterangan:* ${meeting.summary}\n` : ''}
----------------------------------------
Ketik *1* atau *Ya* untuk menambahkan ke Google Calendar
Ketik *0* atau *Batal* untuk mengabaikan`;
  }

  /**
   * Memeriksa dan memproses input persetujuan dari pengguna
   */
  public async handleUserResponse(text: string): Promise<string | null> {
    const trimmed = text.trim().toLowerCase();
    const isApproval = ['1', 'ya', 'yes', 'y', 'ok', 'oke', 'setuju', 'jadwalkan'].includes(trimmed);
    const isRejection = ['0', 'batal', 'tidak', 'no', 'cancel', 'abaikan'].includes(trimmed);

    if (!isApproval && !isRejection) {
      return null; // Bukan respons persetujuan
    }

    const latestMeeting = store.getLatestPendingMeeting();
    if (!latestMeeting) {
      return null;
    }

    if (isRejection) {
      store.updateMeetingStatus(latestMeeting.id, 'REJECTED');
      return `❌ Rapat *${latestMeeting.title}* diabaikan dan tidak dimasukkan ke kalender.`;
    }

    if (isApproval) {
      store.updateMeetingStatus(latestMeeting.id, 'APPROVED');

      if (!calendarService.getIsConfigured()) {
        return `⚠️ *Google Calendar Belum Terhubung:*
Jadwal *${latestMeeting.title}* telah disetujui, namun kredensial Google Calendar belum dikonfigurasi di file \`.env\`.
Silakan lengkapi GOOGLE_CLIENT_ID dan GOOGLE_REFRESH_TOKEN untuk otomatisasi kalender.`;
      }

      const result = await calendarService.createMeetingEvent(latestMeeting);
      if (result.success) {
        let msg = `✅ *Berhasil Ditambahkan ke Google Calendar!*\n\n`;
        msg += `• *Acara:* ${latestMeeting.title}\n`;
        msg += `• *Waktu:* ${latestMeeting.date} (${latestMeeting.startTime} - ${latestMeeting.endTime} WIB)\n`;
        if (result.eventLink) {
          msg += `🔗 *Buka di Kalender:* ${result.eventLink}`;
        }
        return msg;
      } else {
        return `❌ Gagal menambahkan ke Google Calendar: ${result.error || 'Terjadi kesalahan'}`;
      }
    }

    return null;
  }
}

export const approvalHandler = new ApprovalHandler();
