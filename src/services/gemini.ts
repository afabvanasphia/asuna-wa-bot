import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { BufferedMessage } from '../storage/store.js';

export interface MeetingExtractionResult {
  is_meeting: boolean;
  confidence: number;
  title: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  location_or_link: string;
  participants: string[];
  summary: string;
}

export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    if (config.geminiApiKey) {
      this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
      logger.info({ model: config.geminiModel }, 'Gemini AI Service diinisialisasi');
    } else {
      logger.warn('GEMINI_API_KEY belum dikonfigurasi di .env!');
    }
  }

  /**
   * Ekstraksi jadwal rapat dari percakapan menggunakan Gemini 3.8 Flash dengan Structured Output JSON Schema
   */
  public async extractMeetingDetails(
    groupName: string,
    recentMessages: BufferedMessage[]
  ): Promise<MeetingExtractionResult | null> {
    if (!this.ai) {
      logger.error('Gemini AI belum siap: API Key tidak ditemukan');
      return null;
    }

    try {
      const now = new Date();
      const currentDateStr = now.toISOString().split('T')[0];
      const currentTimeStr = now.toLocaleTimeString('id-ID', {
        timeZone: config.timezone,
        hour12: false,
      });

      const conversationText = recentMessages
        .map(m => `[${new Date(m.timestamp).toLocaleTimeString('id-ID')}] ${m.senderName}: ${m.text}`)
        .join('\n');

      const systemPrompt = `Anda adalah AI Assistant yang ahli mengekstrak jadwal rapat atau pertemuan dari obrolan WhatsApp grup.
Waktu saat ini: Tanggal ${currentDateStr}, Pukul ${currentTimeStr} (${config.timezone}).
Grup: "${groupName}".

Tugas Anda:
1. Analisis apakah pesan-pesan terakhir menyepakati/mengumumkan sebuah jadwal rapat, pertemuan, evaluasi, atau panggilan sinkronisasi.
2. Abaikan percakapan santai yang tidak spesifik menentukan waktu (misal: "kapan-kapan ngopi yuk").
3. Jika rapat valid terdeteksi, ekstrak judul, tanggal pasti (format YYYY-MM-DD berdasarkan waktu saat ini), jam mulai (HH:MM), jam selesai (HH:MM - default 1 jam setelah mulai jika tidak disebutkan), lokasi/link meeting (Zoom/Meet), dan ringkasan agenda.
4. Output WAJIB berupa JSON sesuai skema yang ditentukan.`;

      const interaction = await this.ai.interactions.create({
        model: config.geminiModel,
        system_instruction: systemPrompt,
        input: `Berikut cuplikan percakapan grup terbaru:\n\n${conversationText}\n\nApakah ada jadwal rapat yang baru disepakati/diumumkan?`,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: {
            type: 'object',
            properties: {
              is_meeting: {
                type: 'boolean',
                description: 'Set true jika ada jadwal rapat/meeting/call yang disepakati atau diumumkan secara spesifik.',
              },
              confidence: {
                type: 'number',
                description: 'Tingkat keyakinan deteksi dari 0.0 sampai 1.0',
              },
              title: {
                type: 'string',
                description: 'Judul rapat yang jelas dan ringkas dalam Bahasa Indonesia.',
              },
              date: {
                type: 'string',
                description: 'Tanggal rapat dalam format YYYY-MM-DD.',
              },
              start_time: {
                type: 'string',
                description: 'Waktu mulai dalam format 24 jam HH:MM.',
              },
              end_time: {
                type: 'string',
                description: 'Waktu selesai dalam format 24 jam HH:MM.',
              },
              location_or_link: {
                type: 'string',
                description: 'Link platform virtual (Google Meet, Zoom) atau nama tempat fisik jika ada.',
              },
              participants: {
                type: 'array',
                items: { type: 'string' },
                description: 'Daftar nama orang yang terlibat atau diundang.',
              },
              summary: {
                type: 'string',
                description: 'Ringkasan singkat 1-2 kalimat tentang agenda rapat.',
              },
            },
            required: ['is_meeting', 'confidence', 'title'],
          },
        },
      });

      const responseText = interaction.output_text;
      if (!responseText) return null;

      const result = JSON.parse(responseText) as MeetingExtractionResult;
      if (result.is_meeting && result.confidence >= 0.75) {
        logger.info({ meeting: result.title, date: result.date, time: result.start_time }, 'Jadwal rapat terdeteksi oleh AI');
        return result;
      }
      return null;
    } catch (err) {
      logger.error({ err }, 'Error saat mengekstrak jadwal rapat via Gemini');
      return null;
    }
  }

  /**
   * Menyimpulkan diskusi obrolan grup menggunakan Gemini 3.8 Flash
   */
  public async summarizeDiscussion(
    groupName: string,
    messages: BufferedMessage[]
  ): Promise<string> {
    if (!this.ai) {
      return '⚠️ Gemini AI belum dikonfigurasi. Harap isi GEMINI_API_KEY di file .env.';
    }

    if (messages.length === 0) {
      return 'Belum ada riwayat pesan yang terekam pada grup ini untuk dirangkum.';
    }

    try {
      const transcript = messages
        .map(m => `[${new Date(m.timestamp).toLocaleTimeString('id-ID')}] ${m.senderName}: ${m.text}`)
        .join('\n');

      const systemPrompt = `Anda adalah Eksekutif AI Copilot profesional.
Tugas Anda adalah merangkum percakapan grup WhatsApp dengan padat, informatif, dan terstruktur untuk seorang eksekutif yang sibuk.
Gunakan format berikut dalam Bahasa Indonesia yang lugas dan rapi:

*📊 RINGKASAN DISKUSI: [Nama Grup]*
_Rentang: ${messages.length} pesan terakhir_

📌 *Topik Utama:*
(1-3 kalimat inti bahasan)

💡 *Keputusan Kunci (Decisions Made):*
• (Poin keputusan 1)
• (Poin keputusan 2)

✅ *Daftar Tugas & Penanggung Jawab (Action Items):*
• [Nama PIC]: [Tugas / Deadline]

❓ *Poin Terbuka / Menggantung (Open Issues):*
• (Pertanyaan atau hal yang belum diputuskan)

Gunakan format teks WhatsApp (*tebal*, _miring_). Jangan tambahkan basa-basi pengantar atau penutup.`;

      const interaction = await this.ai.interactions.create({
        model: config.geminiModel,
        system_instruction: systemPrompt,
        input: `Berikut adalah riwayat percakapan grup "${groupName}":\n\n${transcript}\n\nMohon buatkan ringkasannya sekarang.`,
      });

      return interaction.output_text || 'Gagal menghasilkan ringkasan diskusi.';
    } catch (err) {
      logger.error({ err }, 'Error saat membuat ringkasan grup via Gemini');
      return 'Terjadi kendala saat merangkum diskusi grup. Silakan coba beberapa saat lagi.';
    }
  }
}

export const geminiService = new GeminiService();
