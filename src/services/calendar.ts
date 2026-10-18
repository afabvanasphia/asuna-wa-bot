import { google } from 'googleapis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { PendingMeetingApproval } from '../storage/store.js';

export interface CalendarInsertResult {
  success: boolean;
  eventLink?: string;
  error?: string;
}

export class CalendarService {
  private calendar: any = null;
  private isConfigured: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    if (config.googleClientId && config.googleClientSecret && config.googleRefreshToken) {
      try {
        const oauth2Client = new google.auth.OAuth2(
          config.googleClientId,
          config.googleClientSecret
        );
        oauth2Client.setCredentials({
          refresh_token: config.googleRefreshToken,
        });

        this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        this.isConfigured = true;
        logger.info('Google Calendar Service berhasil diinisialisasi');
      } catch (err) {
        logger.error({ err }, 'Gagal menginisialisasi Google Calendar OAuth');
      }
    } else {
      logger.warn('Google Calendar belum dikonfigurasi (GOOGLE_CLIENT_ID / SECRET / REFRESH_TOKEN tidak lengkap di .env)');
    }
  }

  public getIsConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Menambahkan jadwal rapat ke Google Calendar
   */
  public async createMeetingEvent(meeting: PendingMeetingApproval): Promise<CalendarInsertResult> {
    if (!this.isConfigured || !this.calendar) {
      return {
        success: false,
        error: 'Google Calendar API belum dikonfigurasi di file .env',
      };
    }

    try {
      const startTime = meeting.startTime || '09:00';
      const endTime = meeting.endTime || '10:00';

      const startDateTimeStr = `${meeting.date}T${startTime}:00`;
      const endDateTimeStr = `${meeting.date}T${endTime}:00`;

      const response = await this.calendar.events.insert({
        calendarId: config.googleCalendarId,
        requestBody: {
          summary: meeting.title,
          description: `Rapat ini diekstrak otomatis oleh WAssist dari WhatsApp Grup: ${meeting.groupName}\n\nAgenda:\n${meeting.summary}\n\nPeserta:\n${meeting.participants.join(', ')}`,
          location: meeting.locationOrLink || undefined,
          start: {
            dateTime: new Date(startDateTimeStr).toISOString(),
            timeZone: config.timezone,
          },
          end: {
            dateTime: new Date(endDateTimeStr).toISOString(),
            timeZone: config.timezone,
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 30 },
              { method: 'popup', minutes: 10 },
            ],
          },
        },
      });

      logger.info({ id: response.data.id, link: response.data.htmlLink }, 'Event kalender berhasil dibuat');
      return {
        success: true,
        eventLink: response.data.htmlLink || undefined,
      };
    } catch (err: any) {
      logger.error({ err: err.message }, 'Gagal menyisipkan event ke Google Calendar');
      return {
        success: false,
        error: err.message || 'Gagal menyimpan event ke kalender',
      };
    }
  }
}

export const calendarService = new CalendarService();
