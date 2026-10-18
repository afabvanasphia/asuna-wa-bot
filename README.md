# ⚔️ Asuna - WhatsApp Personal Executive AI Copilot 👑

**Asuna** adalah asisten AI pribadi cerdas untuk WhatsApp yang dirancang khusus untuk memantau pesan masuk, mencatat rapat otomatis, dan menyaring informasi penting. Asuna bekerja di latar belakang untuk:
1. **Memberitahu chat yang belum dibuka dalam satu hari itu (*Daily Unread Tracker*)**.
2. **Melacak mention & tag penting di seluruh grup WhatsApp Anda**.
3. **Mencatat jadwal rapat, Google Meet, & Zoom secara otomatis ke catatan agenda chat dan Google Calendar**.
4. **Merangkum diskusi grup panjang dengan Google Gemini 3.8 Flash**.

![Asuna Avatar](./assets/asuna.png)

---

## 🚀 Fitur Utama

1. **Pemantau Chat Belum Dibuka (*Unopened Chats Tracker*):**
   * Mengirimkan rekap harian otomatis (pukul 08:00, 12:00, 18:00, dan 21:00 WIB) yang merinci chat personal dan grup mana saja yang belum sempat Anda buka pada hari tersebut.
   * Dapat dicek sewaktu-waktu dengan mengetik `/unread` atau `/belumdibaca`.

2. **Catatan Jadwal Rapat & Google Meet Otomatis:**
   * Setiap kali ada obrolan grup yang merencanakan rapat atau membagikan link Google Meet/Zoom, Asuna langsung mengekstrak detailnya dan **menyimpan ke Catatan Agenda Chat**.
   * Jika Google Calendar terhubung, rapat langsung disinkronkan ke kalender Anda.
   * Ketik `/agenda` atau `/jadwal` untuk melihat seluruh agenda yang tersimpan.

3. **Pelacak Mention / Tag di Grup:**
   * Memberitahu Anda secara *real-time* jika di-tag (`@Afab`) di grup.
   * Memberikan pengingat lembut jika tag belum sempat Anda respons setelah 2 jam.

4. **Perangkum Diskusi Grup (Gemini 3.8 Flash):**
   * Ketik `/ringkas [Nama Grup]` untuk mendapatkan kesimpulan padat: Topik Utama, Keputusan Kunci, Action Items & PIC, serta Poin Menggantung.

---

## 📁 Struktur Direktori

```text
wassist-agent/
├── src/
│   ├── index.ts               # Entrypoint & penjadwal otomatis (node-cron)
│   ├── config.ts              # Pengelolaan variabel lingkungan (.env)
│   ├── client/
│   │   └── whatsapp.ts        # Klien WhatsApp Baileys (Multi-Device & QR Code)
│   ├── services/
│   │   ├── gemini.ts          # Integrasi Gemini 3.8 Flash (Summarizer & Extraction)
│   │   ├── calendar.ts        # Integrasi Google Calendar API (OAuth 2.0)
│   │   ├── unreadTracker.ts   # Pembuat laporan Daily Unread Digest
│   │   └── mentionWatcher.ts  # Pelacak @mention & pengingat berkala
│   ├── handlers/
│   │   ├── messageHandler.ts  # Router pesan, perintah, & pendeteksi intent
│   │   └── approvalHandler.ts # Handler persetujuan rapat 1-klik (1/Ya vs 0/Batal)
│   ├── storage/
│   │   └── store.ts           # Penyimpanan lokal (buffer pesan, state unread, draft rapat)
│   └── utils/
│       ├── logger.ts          # Logging sistem (Pino)
│       └── formatter.ts       # Format teks WhatsApp (*tebal*, _miring_, waktu)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## 🛠️ Prasyarat & Persiapan

1. **Node.js:** Versi 18, 20, atau lebih baru.
2. **Gemini API Key:** Dapatkan secara gratis melalui [Google AI Studio](https://aistudio.google.com/).
3. **Google Cloud OAuth (Opsional untuk Calendar Sync):**
   * Buat Proyek di [Google Cloud Console](https://console.cloud.google.com/).
   * Aktifkan **Google Calendar API**.
   * Buat **OAuth 2.0 Client ID** (Desktop App).
   * Dapatkan *Refresh Token* untuk akun Google Calendar Anda.

---

## ⚡ Panduan Instalasi & Menjalankan

### 1. Salin Konfigurasi Environment
```bash
cp .env.example .env
```
Buka file `.env` dan isi variabel penting:
* `GEMINI_API_KEY`: API key dari Google AI Studio.
* `OWNER_PHONE_NUMBER`: Nomor WhatsApp Anda sendiri dengan format internasional (contoh: `6281234567890`, tanpa tanda `+` atau angka `0` di depan).
* `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`: (Jika ingin mengaktifkan sinkronisasi kalender).

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Jalankan Asisten
Dalam mode pengembangan (*development mode*):
```bash
npm run dev
```

### 4. Tautkan Akun WhatsApp (Hanya Pertama Kali)
1. Terminal akan menampilkan sebuah **QR Code**.
2. Buka aplikasi **WhatsApp** di smartphone Anda.
3. Masuk ke **Pengaturan / Titik Tiga** > **Perangkat Tertaut (Linked Devices)**.
4. Pilih **Tautkan Perangkat** dan scan QR Code yang muncul di terminal.
5. Setelah berhasil, sesi akan tersimpan di folder `./auth_info_baileys` sehingga Anda tidak perlu scan ulang setiap kali restart.

---

## 💬 Daftar Perintah Interaktif di WhatsApp

Kirim perintah berikut langsung ke obrolan pribadi Anda dengan asisten:

| Perintah | Deskripsi |
| :--- | :--- |
| `/unread` atau `/belumdibaca` | Menampilkan ringkasan chat personal dan grup yang belum dibuka hari ini. |
| `/agenda` atau `/jadwal` | Menampilkan seluruh catatan jadwal rapat, Google Meet, & Zoom yang tersimpan. |
| `/mentions` | Menampilkan daftar tag/mention grup yang belum Anda tindaklanjuti. |
| `/ringkas [Nama Grup]` | Merangkum intisari diskusi grup menggunakan Gemini 3.8 Flash. |
| `/groups` | Menampilkan daftar grup yang berhasil dipantau oleh Asuna. |
| `/asuna` atau `/profile` | Menampilkan profil Asuna beserta foto dan informasi tugasnya. |
| `/clear` | Menandai semua mention tertunda sebagai selesai. |
| `/clearagenda` | Menghapus seluruh catatan agenda rapat yang tersimpan. |
| `/clearunread` | Mereset tanda pesan belum dibaca. |
| `1` atau `Ya` | Menyetujui jadwal rapat yang terdeteksi ke Google Calendar. |
| `0` atau `Batal` | Mengabaikan jadwal rapat yang terdeteksi. |
| `/help` | Menampilkan daftar menu dan petunjuk penggunaan. |

---

## 🔒 Privasi & Keamanan Data

* **End-to-End Encryption:** Semua koneksi langsung terhubung ke server resmi WhatsApp melalui protokol enkripsi Baileys.
* **Penyimpanan Lokal:** Kredensial sesi dan riwayat percakapan hanya disimpan secara lokal di mesin Anda (`./auth_info_baileys` dan `./data/store.json`).
* **Zero Data Retention:** Percakapan yang dikirim ke Gemini API hanya diproses saat analisis berlangsung (*in-memory*) dan tidak disimpan untuk pelatihan model.
