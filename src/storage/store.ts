import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface BufferedMessage {
  id: string;
  chatJid: string;
  senderJid: string;
  senderName: string;
  text: string;
  timestamp: number;
  isGroup: boolean;
  groupName?: string;
}

export interface TrackedMention {
  id: string;
  groupJid: string;
  groupName: string;
  senderJid: string;
  senderName: string;
  messageText: string;
  timestamp: number;
  isResolved: boolean;
  lastNotifiedAt: number;
  nudgeCount: number;
}

export interface UnreadChatState {
  chatJid: string;
  chatName: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessageSnippet: string;
  lastMessageTimestamp: number;
  hasPendingResponse: boolean;
  lastNudgedAt?: number;
  nudgeCount?: number;
}

export interface PendingMeetingApproval {
  id: string;
  groupJid: string;
  groupName: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  locationOrLink: string;
  participants: string[];
  summary: string;
  timestamp: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface MeetingNote {
  id: string;
  groupJid: string;
  groupName: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  locationOrLink: string;
  participants: string[];
  summary: string;
  createdAt: number;
  calendarSynced: boolean;
  calendarEventLink?: string;
}

interface StoreSchema {
  recentMessages: Record<string, BufferedMessage[]>; // groupJid -> messages (max 100 per group)
  trackedMentions: TrackedMention[];
  unreadChats: Record<string, UnreadChatState>;
  pendingMeetings: PendingMeetingApproval[];
  meetingNotes: MeetingNote[];
  groupNames: Record<string, string>;
}

class Store {
  private data: StoreSchema = {
    recentMessages: {},
    trackedMentions: [],
    unreadChats: {},
    pendingMeetings: [],
    meetingNotes: [],
    groupNames: {},
  };

  private filePath: string;

  constructor() {
    this.filePath = config.dataStorePath;
    this.load();
  }

  private load() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = { ...this.data, ...JSON.parse(raw) };
        logger.info({ count: Object.keys(this.data.recentMessages).length }, 'Database storage loaded');
      }
    } catch (err) {
      logger.error({ err }, 'Gagal memuat database store, menggunakan state kosong');
    }
  }

  public save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      logger.error({ err }, 'Gagal menyimpan database store');
    }
  }

  // --- Group Name Cache ---
  public setGroupName(groupJid: string, name: string) {
    this.data.groupNames[groupJid] = name;
    this.save();
  }

  public getGroupName(groupJid: string): string {
    return this.data.groupNames[groupJid] || groupJid.replace('@g.us', '');
  }

  public getAllGroupNames(): Record<string, string> {
    return this.data.groupNames;
  }

  // --- Message Buffer ---
  public addMessage(msg: BufferedMessage) {
    if (!this.data.recentMessages[msg.chatJid]) {
      this.data.recentMessages[msg.chatJid] = [];
    }
    const list = this.data.recentMessages[msg.chatJid];
    list.push(msg);
    // Keep max 150 messages per chat
    if (list.length > 150) {
      list.shift();
    }
    this.save();
  }

  public getRecentMessages(chatJid: string, limit: number = 60): BufferedMessage[] {
    const list = this.data.recentMessages[chatJid] || [];
    return list.slice(-limit);
  }

  // --- Mentions ---
  public addMention(mention: TrackedMention) {
    this.data.trackedMentions.push(mention);
    this.save();
  }

  public getUnresolvedMentions(): TrackedMention[] {
    return this.data.trackedMentions.filter(m => !m.isResolved);
  }

  public resolveMentionsForGroup(groupJid: string) {
    for (const m of this.data.trackedMentions) {
      if (m.groupJid === groupJid && !m.isResolved) {
        m.isResolved = true;
      }
    }
    this.save();
  }

  public updateMentionNudge(id: string) {
    const m = this.data.trackedMentions.find(x => x.id === id);
    if (m) {
      m.lastNotifiedAt = Date.now();
      m.nudgeCount += 1;
      this.save();
    }
  }

  // --- Unread Chats ---
  public updateUnreadState(chatJid: string, update: Partial<UnreadChatState>) {
    const existing = this.data.unreadChats[chatJid] || {
      chatJid,
      chatName: chatJid,
      isGroup: chatJid.endsWith('@g.us'),
      unreadCount: 0,
      lastMessageSnippet: '',
      lastMessageTimestamp: Date.now(),
      hasPendingResponse: false,
    };
    this.data.unreadChats[chatJid] = { ...existing, ...update };
    this.save();
  }

  public markChatRead(chatJid: string) {
    if (this.data.unreadChats[chatJid]) {
      this.data.unreadChats[chatJid].unreadCount = 0;
      this.data.unreadChats[chatJid].hasPendingResponse = false;
      this.save();
    }
  }

  public updateUnreadNudge(chatJid: string) {
    if (this.data.unreadChats[chatJid]) {
      this.data.unreadChats[chatJid].lastNudgedAt = Date.now();
      this.data.unreadChats[chatJid].nudgeCount = (this.data.unreadChats[chatJid].nudgeCount || 0) + 1;
      this.save();
    }
  }

  public getUnreadChats(): UnreadChatState[] {
    return Object.values(this.data.unreadChats).filter(
      c => c.unreadCount > 0 || c.hasPendingResponse
    );
  }

  // --- Pending Meeting Approvals ---
  public addPendingMeeting(meeting: PendingMeetingApproval) {
    this.data.pendingMeetings.push(meeting);
    this.save();
  }

  public getPendingMeetings(): PendingMeetingApproval[] {
    return this.data.pendingMeetings.filter(m => m.status === 'PENDING');
  }

  public getLatestPendingMeeting(): PendingMeetingApproval | undefined {
    return this.data.pendingMeetings
      .filter(m => m.status === 'PENDING')
      .sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  public updateMeetingStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    const m = this.data.pendingMeetings.find(x => x.id === id);
    if (m) {
      m.status = status;
      this.save();
    }
  }

  // --- Catatan Agenda & Jadwal Rapat (Meeting Notes) ---
  public addMeetingNote(note: MeetingNote) {
    if (!this.data.meetingNotes) {
      this.data.meetingNotes = [];
    }
    // Cegah duplikasi agenda yang sama persis
    const exists = this.data.meetingNotes.find(
      n => n.title.toLowerCase() === note.title.toLowerCase() && n.date === note.date && n.groupJid === note.groupJid
    );
    if (!exists) {
      this.data.meetingNotes.push(note);
      this.save();
    }
  }

  public getMeetingNotes(): MeetingNote[] {
    return (this.data.meetingNotes || []).sort((a, b) => {
      // Urutkan berdasarkan tanggal & waktu
      return new Date(`${a.date}T${a.startTime || '00:00'}`).getTime() - new Date(`${b.date}T${b.startTime || '00:00'}`).getTime();
    });
  }

  public deleteMeetingNote(id: string): boolean {
    if (!this.data.meetingNotes) return false;
    const initialLen = this.data.meetingNotes.length;
    this.data.meetingNotes = this.data.meetingNotes.filter(n => n.id.toLowerCase() !== id.toLowerCase());
    if (this.data.meetingNotes.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public clearAllMeetingNotes() {
    this.data.meetingNotes = [];
    this.save();
  }

  public markMeetingNoteSynced(id: string, link: string) {
    const note = this.data.meetingNotes?.find(n => n.id.toLowerCase() === id.toLowerCase());
    if (note) {
      note.calendarSynced = true;
      note.calendarEventLink = link;
      this.save();
    }
  }
}

export const store = new Store();
