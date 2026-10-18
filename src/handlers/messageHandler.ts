import { WAMessage, proto } from '@whiskeysockets/baileys';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { store, BufferedMessage, TrackedMention, PendingMeetingApproval, MeetingNote } from '../storage/store.js';
import { geminiService } from '../services/gemini.js';
import { calendarService } from '../services/calendar.js';
import { unreadTrackerService } from '../services/unreadTracker.js';
import { mentionWatcherService } from '../services/mentionWatcher.js';
import { approvalHandler } from './approvalHandler.js';
import { WhatsAppClient } from '../client/whatsapp.js';
import { randomUUID } from 'crypto';
import fs from 'fs';

export class MessageHandler {
  private waClient: WhatsAppClient | null = null;

  public setClient(client: WhatsAppClient) {
    this.waClient = client;
  }

  /**
   * Ekstraksi teks dari berbagai tipe pesan WhatsApp
   */
  private extractText(msg: proto.IMessage | null | undefined): string {
    if (!msg) return '';
    return (
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.imageMessage?.caption ||
      msg.videoMessage?.caption ||
      msg.documentMessage?.caption ||
      ''
    ).trim();
  }

  /**
   * Mendapatkan sender JID yang akurat
   */
  private getSenderJid(m: WAMessage): string {
    return m.key.participant || m.key.remoteJid || '';
  }

  /**
   * Handle setiap pesan masuk dari WhatsApp
   */
  public async handleMessage(m: WAMessage) {
    if (!m.message || !m.key.remoteJid) return;

    const chatJid = m.key.remoteJid;
    const isGroup = chatJid.endsWith('@g.us');
    const isFromMe = m.key.fromMe || false;
    const senderJid = this.getSenderJid(m);
    const senderName = m.pushName || senderJid.split('@')[0];
    const text = this.extractText(m.message);

    if (!text && !m.message.imageMessage && !m.message.audioMessage) return;

    const timestamp = Number(m.messageTimestamp) * 1000 || Date.now();

    // 1. Tangani percakapan privat dari Pemilik (Owner) ke Asisten
    const isFromOwner =
      senderJid.includes(config.ownerPhoneNumber) ||
      Boolean(config.ownerLid && senderJid.includes(config.ownerLid)) ||
      (isFromMe && config.botPhoneNumber === config.ownerPhoneNumber);

    if (!isGroup && isFromOwner) {
      await this.handleOwnerPrivateMessage(text);
      return;
    }

    // Jika pesan privat dari orang lain ke bot Asuna
    if (!isGroup && !isFromOwner && !isFromMe) {
      await this.waClient?.sendToOwner(
        `📩 *Pesan Masuk ke Asuna dari ${senderName} (${senderJid.split('@')[0]}):*\n> "${text}"`
      );
      await this.waClient?.socket?.sendMessage(chatJid, {
        text: `Halo! Saya *Asuna*, asisten AI pribadi milik Afab-kun. Pesan Anda telah saya catat dan sampaikan ke beliau ya! ✨`,
      });
      return;
    }

    // 2. Jika pesan di grup
    if (isGroup) {
      await this.handleGroupMessage(m, chatJid, senderJid, senderName, text, timestamp);
      return;
    }

    // 3. Jika pesan personal dari orang lain ke pengguna
    if (!isGroup && !isFromMe) {
      store.updateUnreadState(chatJid, {
        chatName: senderName,
        isGroup: false,
        unreadCount: (store.getUnreadChats().find(c => c.chatJid === chatJid)?.unreadCount || 0) + 1,
        lastMessageSnippet: text,
        lastMessageTimestamp: timestamp,
        hasPendingResponse: true,
      });
    }
  }

  /**
   * Tangani perintah dari Pemilik (Owner) melalui chat privat
   */
  private async handleOwnerPrivateMessage(text: string) {
    if (!this.waClient || !text) return;

    // Abaikan pesan yang dihasilkan oleh sistem bot sendiri agar tidak terjadi loop
    if (
      text.startsWith('🤖') ||
      text.startsWith('🔔') ||
      text.startsWith('📅') ||
      text.startsWith('📋') ||
      text.startsWith('⚠️') ||
      text.startsWith('✅') ||
      text.startsWith('❌')
    ) {
      return;
    }

    logger.info({ text }, 'Menerima pesan privat dari Owner');

    // Cek apakah ini persetujuan kalender (1/0/ya/batal)
    const approvalResponse = await approvalHandler.handleUserResponse(text);
    if (approvalResponse) {
      await this.waClient.sendToOwner(approvalResponse);
      return;
    }

    const command = text.trim().toLowerCase();

    // Command: /unread atau /digest
    if (command === '/unread' || command === '/digest') {
      const digest = unreadTrackerService.generateDailyDigest();
      await this.waClient.sendToOwner(digest);
      return;
    }

    // Command: /mentions
    if (command === '/mentions') {
      const mentionsList = mentionWatcherService.formatPendingMentionsList();
      await this.waClient.sendToOwner(mentionsList);
      return;
    }

    // Command: /clear
    if (command === '/clear') {
      const pending = store.getUnresolvedMentions();
      pending.forEach(m => store.resolveMentionsForGroup(m.groupJid));
      await this.waClient.sendToOwner('✅ Semua daftar mention dan antrean pengingat telah ditandai selesai.');
      return;
    }

    // Command: /groups
    if (command === '/groups') {
      const groups = store.getAllGroupNames();
      const entries = Object.entries(groups);
      if (entries.length === 0) {
        await this.waClient.sendToOwner('Belum ada grup yang terekam dalam sesi aktif.');
        return;
      }
      let list = `👥 *Daftar Grup yang Dipantau (${entries.length}):*\n\n`;
      entries.forEach(([jid, name], i) => {
        list += `${i + 1}. *${name}*\n`;
      });
      list += `\n_Ketik */ringkas [Nama Grup]* untuk merangkum obrolan._`;
      await this.waClient.sendToOwner(list);
      return;
    }

    // Command: /ringkas [Nama Grup] atau /summary [Nama Grup]
    if (command.startsWith('/ringkas') || command.startsWith('/summary')) {
      const targetQuery = text.replace(/^\/(ringkas|summary)/i, '').trim().toLowerCase();
      const groups = store.getAllGroupNames();

      let targetJid: string | null = null;
      let matchedName = '';

      for (const [jid, name] of Object.entries(groups)) {
        if (targetQuery && name.toLowerCase().includes(targetQuery)) {
          targetJid = jid;
          matchedName = name;
          break;
        }
      }

      if (!targetJid) {
        await this.waClient.sendToOwner(`⚠️ Grup dengan kata kunci "${targetQuery}" tidak ditemukan.\nKetik */groups* untuk melihat daftar nama grup.`);
        return;
      }

      await this.waClient.sendToOwner(`⏳ Sedang membaca dan merangkum diskusi grup *${matchedName}* dengan Gemini AI...`);
      const recent = store.getRecentMessages(targetJid, 80);
      const summary = await geminiService.summarizeDiscussion(matchedName, recent);
      await this.waClient.sendToOwner(summary);
      return;
    }

    // Command: /agenda atau /jadwal
    if (command === '/agenda' || command === '/jadwal') {
      const notes = store.getMeetingNotes();
      if (notes.length === 0) {
        await this.waClient.sendToOwner('✨ Belum ada catatan jadwal rapat yang tersimpan, Afab-kun! Bila ada obrolan meeting di grup, Asuna akan otomatis mencatatnya di sini. 🌸');
        return;
      }
      let msg = `📝 *DAFTAR CATATAN JADWAL RAPAT (ASUNA)* ⚔️\n\n`;
      notes.forEach((n, idx) => {
        msg += `${idx + 1}. *${n.title}*\n`;
        msg += `   • 📅 Tanggal: ${n.date} (${n.startTime} - ${n.endTime} WIB)\n`;
        msg += `   • 👥 Sumber: Grup ${n.groupName}\n`;
        if (n.locationOrLink) msg += `   • 🔗 Link/Tempat: ${n.locationOrLink}\n`;
        if (n.summary) msg += `   • 📋 Info: ${n.summary}\n`;
        msg += `   • 🗓️ Status Kalender: ${n.calendarSynced ? '✅ Tersinkron ke Google Calendar' : '💾 Tersimpan di Catatan Lokal'}\n\n`;
      });
      msg += `_Ketik */clearagenda* untuk mereset seluruh catatan agenda._`;
      await this.waClient.sendToOwner(msg);
      return;
    }

    // Command: /clearagenda
    if (command === '/clearagenda') {
      store.clearAllMeetingNotes();
      await this.waClient.sendToOwner('✅ Seluruh catatan jadwal rapat telah dibersihkan oleh Asuna.');
      return;
    }

    // Command: /clearunread
    if (command === '/clearunread') {
      const unreadList = store.getUnreadChats();
      unreadList.forEach(c => store.markChatRead(c.chatJid));
      await this.waClient.sendToOwner('✅ Status pesan belum dibaca telah direset.');
      return;
    }

    // Command: /asuna atau /profile
    if (command === '/asuna' || command === '/profile') {
      const profileText = `👑 *ASUNA - AI EXECUTIVE ASSISTANT* ⚔️\n\n` +
        `Halo Afab-kun! Saya Asuna, asisten AI pribadi kamu di WhatsApp. Tugas utama saya:\n` +
        `• 📩 Memberitahu chat mana saja yang belum kamu buka setiap hari (*Daily Unread*)\n` +
        `• 🔔 Mengingatkan tag & mention yang terlewat di grup\n` +
        `• 📝 Mencatat otomatis jadwal rapat, Google Meet, & Zoom ke agenda dan kalender\n` +
        `• 📊 Merangkum diskusi grup panjang dengan Gemini 3.8 Flash\n\n` +
        `Ketik */help* untuk melihat seluruh perintah ya! 🌸`;

      await this.waClient.sendToOwner(profileText);
      return;
    }

    // Command: /help atau /menu
    if (command === '/help' || command === '/menu') {
      const helpMsg = `👑 *MENU ASISTEN ASUNA* ⚔️

Berikut perintah yang dapat kamu gunakan:
• */unread* atau */belumdibaca* : Daftar chat & grup yang belum kamu buka hari ini.
• */agenda* atau */jadwal* : Lihat semua catatan jadwal rapat & link Google Meet yang tersimpan.
• */mentions* : Daftar tag/mention grup yang belum kamu respons.
• */ringkas [Nama Grup]* : Rangkum obrolan grup dengan Gemini 3.8 Flash.
• */groups* : Daftar grup WhatsApp yang dipantau.
• */asuna* : Menampilkan foto profil & informasi asisten Asuna.
• */clear* : Tandai semua mention selesai.
• */clearagenda* : Hapus daftar catatan rapat.
• */clearunread* : Reset tanda pesan belum dibaca.
• *1 / Ya* : Sinkronkan jadwal rapat ke Google Calendar.
• *0 / Batal* : Abaikan jadwal rapat.`;
      await this.waClient.sendToOwner(helpMsg);
      return;
    }

    // Default Fallback
    await this.waClient.sendToOwner(`Halo Afab-kun! Ketik */help* untuk melihat menu Asuna, atau ketik */unread* untuk melihat chat yang belum kamu buka hari ini. 🌸`);
  }

  /**
   * Tangani pesan di dalam grup (Buffer, Mention check, Meeting check)
   */
  private async handleGroupMessage(
    m: WAMessage,
    groupJid: string,
    senderJid: string,
    senderName: string,
    text: string,
    timestamp: number
  ) {
    if (!this.waClient) return;

    const groupName = store.getGroupName(groupJid);

    // 1. Simpan pesan ke buffer riwayat grup
    const bufferedMsg: BufferedMessage = {
      id: m.key.id || randomUUID(),
      chatJid: groupJid,
      senderJid,
      senderName,
      text,
      timestamp,
      isGroup: true,
      groupName,
    };
    store.addMessage(bufferedMsg);

    // 2. Perbarui state unread untuk grup
    store.updateUnreadState(groupJid, {
      chatName: groupName,
      isGroup: true,
      unreadCount: (store.getUnreadChats().find(c => c.chatJid === groupJid)?.unreadCount || 0) + 1,
      lastMessageSnippet: `${senderName}: ${text}`,
      lastMessageTimestamp: timestamp,
    });

    // 3. Deteksi Mention / Tag
    const mentionedJids: string[] = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const lowerText = text.toLowerCase();

    const isDirectlyMentioned = mentionedJids.some(jid => {
      const cleanJid = jid.toLowerCase();
      const matchPhone = Boolean(config.ownerPhoneNumber && cleanJid.includes(config.ownerPhoneNumber));
      const matchLid = Boolean(config.ownerLid && cleanJid.includes(config.ownerLid));
      return matchPhone || matchLid;
    });

    const isTextMentioned = Boolean(
      (config.ownerPhoneNumber && lowerText.includes(`@${config.ownerPhoneNumber}`)) ||
      (config.ownerLid && lowerText.includes(`@${config.ownerLid}`)) ||
      (config.ownerName && lowerText.includes(`@${config.ownerName.toLowerCase()}`)) ||
      lowerText.includes('@afab') ||
      lowerText.includes('@asuna')
    );

    const isMentioned = isDirectlyMentioned || isTextMentioned;
    logger.info({
      groupName,
      senderName,
      text,
      mentionedJids,
      isMentioned,
      ownerPhone: config.ownerPhoneNumber,
      ownerLid: config.ownerLid,
    }, 'Pesan grup diproses');

    if (isMentioned) {
      logger.info({ group: groupName, sender: senderName }, 'Mention terdeteksi untuk Pengguna!');

      const trackedMention: TrackedMention = {
        id: randomUUID(),
        groupJid,
        groupName,
        senderJid,
        senderName,
        messageText: text,
        timestamp,
        isResolved: false,
        lastNotifiedAt: Date.now(),
        nudgeCount: 0,
      };

      store.addMention(trackedMention);

      // Kirim notifikasi instan ke chat privat pemilik
      const alertMsg = mentionWatcherService.formatInstantMentionAlert(trackedMention);
      await this.waClient.sendToOwner(alertMsg);
    }

    // 4. Deteksi Jadwal Rapat / Meeting
    await this.checkMeetingIntent(groupJid, groupName, text);
  }

  /**
   * Cek indikasi jadwal rapat berdasarkan kata kunci, lalu verifikasi dengan Gemini AI
   */
  private async checkMeetingIntent(groupJid: string, groupName: string, text: string) {
    if (!this.waClient) return;

    const lower = text.toLowerCase();
    const meetingKeywords = [
      'meeting',
      'rapat',
      'meet',
      'zoom',
      'agenda',
      'evaluasi',
      'sync',
      'call',
      'kumpul',
      'besok jam',
      'senin jam',
      'selasa jam',
      'rabu jam',
      'kamis jam',
      'jumat jam',
      'sabtu jam',
      'minggu jam',
      'pukul',
      'wib',
    ];

    const hasKeyword = meetingKeywords.some(kw => lower.includes(kw));
    if (!hasKeyword) return;

    logger.debug({ groupName }, 'Kata kunci rapat terdeteksi, memicu verifikasi Gemini AI...');

    const recent = store.getRecentMessages(groupJid, 10);
    const extraction = await geminiService.extractMeetingDetails(groupName, recent);

    if (extraction && extraction.is_meeting) {
      const noteId = `M${Date.now().toString().slice(-4)}`;
      const pending: PendingMeetingApproval = {
        id: noteId,
        groupJid,
        groupName,
        title: extraction.title,
        date: extraction.date,
        startTime: extraction.start_time,
        endTime: extraction.end_time,
        locationOrLink: extraction.location_or_link,
        participants: extraction.participants || [],
        summary: extraction.summary || '',
        timestamp: Date.now(),
        status: 'PENDING',
      };

      store.addPendingMeeting(pending);

      // Simpan otomatis ke Catatan Agenda Asuna
      const meetingNote: MeetingNote = {
        id: noteId,
        groupJid,
        groupName,
        title: extraction.title,
        date: extraction.date,
        startTime: extraction.start_time,
        endTime: extraction.end_time,
        locationOrLink: extraction.location_or_link,
        participants: extraction.participants || [],
        summary: extraction.summary || '',
        createdAt: Date.now(),
        calendarSynced: false,
      };
      store.addMeetingNote(meetingNote);

      let calendarMsg = '';
      if (calendarService.getIsConfigured()) {
        const calResult = await calendarService.createMeetingEvent(pending);
        if (calResult.success) {
          meetingNote.calendarSynced = true;
          meetingNote.calendarEventLink = calResult.eventLink;
          store.markMeetingNoteSynced(noteId, calResult.eventLink || '');
          calendarMsg = `\n🗓️ *Google Calendar:* Otomatis tersinkron!\n🔗 *Link:* ${calResult.eventLink}`;
        }
      }

      // Kirim Catatan Rapat ke Chat Pemilik
      let noteCard = `📝 *CATATAN JADWAL RAPAT DARI ASUNA* ⚔️\n\n`;
      noteCard += `📌 *Agenda:* *${extraction.title}*\n`;
      noteCard += `👥 *Grup:* ${groupName}\n`;
      noteCard += `📅 *Tanggal:* ${extraction.date}\n`;
      noteCard += `⏰ *Waktu:* ${extraction.start_time} - ${extraction.end_time} WIB\n`;
      if (extraction.location_or_link) {
        noteCard += `🔗 *Link/Tempat:* ${extraction.location_or_link}\n`;
      }
      if (extraction.summary) {
        noteCard += `📋 *Keterangan:* ${extraction.summary}\n`;
      }
      noteCard += `----------------------------------------\n`;
      noteCard += `💾 *Catatan:* Tersimpan di Agenda Asuna (ID: ${noteId})\n`;
      if (calendarMsg) {
        noteCard += calendarMsg + '\n';
      } else {
        noteCard += `💡 _Ketik *1* atau *Ya* untuk memasukkan ke Google Calendar._\n`;
      }
      noteCard += `_Ketik */agenda* untuk mengecek seluruh jadwal rapat kamu._`;

      await this.waClient.sendToOwner(noteCard);
    }
  }
}

export const messageHandler = new MessageHandler();
