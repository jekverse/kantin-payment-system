Keren 👌 — berikut **README.md** lengkap, ditulis gaya profesional dan edukatif, agar kamu (atau orang lain) bisa langsung paham **cara kerja sistem kantin RFID ini dari ujung ke ujung**.

README ini sudah menjelaskan:

* arsitektur sistem
* alur kerja (ESP8266 → server → web UI)
* endpoint API
* logika harian (reset saldo)
* cara install & menjalankan

---

# 🍽️ Kantin Payment System

**RFID-Based Cashless Payment Platform (ESP8266 + Node.js + Web Dashboard)**

---

## 🚀 Gambaran Umum

Sistem ini memungkinkan transaksi **tanpa uang tunai** di kantin menggunakan **kartu RFID**.
Setiap pengguna memiliki kartu dengan saldo harian (contohnya Rp 40.000).
Setiap kali kartu di-tap, sistem otomatis mengirim data UID ke server melalui **WiFi** dan menampilkan saldo serta status transaksi di web dashboard.

**Teknologi yang digunakan:**

* 🧠 **ESP8266 (NodeMCU)** sebagai pembaca RFID (RC522)
* 🌐 **Node.js + Express** sebagai server backend
* 💾 **JSON file (cards.json)** sebagai penyimpanan lokal
* 💻 **Web Dashboard** dengan HTML + JS untuk kasir/admin

---

## 🧩 Arsitektur Sistem

```
+-------------------+         WiFi HTTP POST        +---------------------------+
|  ESP8266 + RC522  |  ─────────────────────────→  |  Node.js Server (Express) |
|  (Kartu di-tap)   |                               |  - /api/card-tap          |
|                   |                               |  - /api/payment           |
|                   |                               |  - /api/register, /topup  |
|                   |                               |                           |
|                   |                               |  Data disimpan di:        |
|                   |                               |   ./data/cards.json       |
+-------------------+                               +-------------+-------------+
                                                                     |
                                                                     | serve HTML UI
                                                                     v
                                                       +----------------------------+
                                                       |  Web Dashboard (Kasir)     |
                                                       |  - Menampilkan pending tap  |
                                                       |  - Input jumlah pembayaran  |
                                                       |  - Register / Top-up kartu  |
                                                       +----------------------------+
```

---

## ⚙️ Alur Kerja Sistem (End-to-End)

### 1️⃣ ESP8266 (Client)

* Membaca UID kartu melalui modul **RC522** (SPI).
* Mengirim HTTP POST ke server:

  ```
  POST /api/card-tap
  {
    "uid": "A1AEC701"
  }
  ```
* Menunggu balasan dari server:

  * `success:true` → kartu terdaftar (server akan menunggu nominal pembayaran)
  * `success:false` → kartu belum terdaftar

---

### 2️⃣ Node.js Server (Backend)

Saat menerima tap (`/api/card-tap`):

1. Mencari kartu berdasarkan UID di `cards.json`.
2. Jika **tidak ditemukan**, set `pendingTransaction = { status: 'not_registered' }`.
3. Jika **ditemukan**:

   * Melakukan **reset saldo harian otomatis** (jika hari berganti).
   * Menyimpan `pendingTransaction = { status:'waiting_amount', uid, name, balance }`.
4. Mengirimkan respons ke ESP8266.

---

### 3️⃣ Web Dashboard (Kasir)

Browser frontend melakukan **polling otomatis** setiap 5 detik:

| Request                  | Tujuan                                    |
| ------------------------ | ----------------------------------------- |
| `GET /api/pending`       | Mengecek apakah ada kartu yang baru ditap |
| `GET /api/cards`         | Memperbarui daftar kartu terdaftar        |
| `POST /api/payment`      | Memproses pembayaran                      |
| `POST /api/register`     | Menambahkan kartu baru                    |
| `POST /api/topup`        | Menambah saldo                            |
| `DELETE /api/cards/:uid` | Menghapus kartu                           |

#### Contoh alur normal:

1. ESP8266 mengirim tap `A1AEC701`.
2. Server tandai pending `{waiting_amount}`.
3. Web UI menampilkan nama & saldo.
4. Kasir mengetik nominal (misal Rp15.000) dan klik **“Proses Pembayaran”**.
5. Browser mengirim `POST /api/payment`.
6. Server mengurangi saldo, menyimpan ke `cards.json`, dan menampilkan hasil sukses/gagal.

---

## 📅 Reset Harian Otomatis

Setiap kartu memiliki field `lastResetDate` (format `YYYYMMDD`).
Saat ada request `/api/card-tap` atau `/api/payment`:

* Jika `lastResetDate !== getTodayDate()`, maka:

  ```
  card.balance = card.initialBalance
  card.lastResetDate = today
  ```
* Dengan demikian, **saldo otomatis kembali ke saldo awal setiap hari**.

---

## 🗂️ Struktur Data (cards.json)

Contoh isi file `data/cards.json`:

```json
[
  {
    "uid": "A1AEC701",
    "name": "Budi Santoso",
    "initialBalance": 40000,
    "balance": 25000,
    "lastResetDate": "20251111",
    "registeredAt": "2025-11-11T08:00:00Z",
    "lastTransaction": {
      "amount": 15000,
      "timestamp": "2025-11-11T09:30:00Z"
    }
  }
]
```

---

## 🌐 API Endpoint Summary

| Endpoint             | Method   | Deskripsi                               |
| -------------------- | -------- | --------------------------------------- |
| `/api/card-tap`      | `POST`   | Dikirim oleh ESP8266 ketika kartu ditap |
| `/api/pending`       | `GET`    | Mengecek status kartu yang sedang ditap |
| `/api/payment`       | `POST`   | Memproses pembayaran dari web UI        |
| `/api/register`      | `POST`   | Menambahkan kartu baru                  |
| `/api/topup`         | `POST`   | Menambah saldo kartu                    |
| `/api/cards`         | `GET`    | Mendapatkan semua data kartu            |
| `/api/cards/:uid`    | `DELETE` | Menghapus kartu tertentu                |
| `/api/wipe`          | `POST`   | Menghapus semua data kartu              |
| `/api/clear-pending` | `POST`   | Menghapus status pending saat ini       |

---

## 🧠 State `pendingTransaction`

Server menyimpan state **sementara** untuk sinkronisasi antara **ESP8266** dan **web kasir**.

```js
// Nilai awal
pendingTransaction = null

// Setelah tap kartu belum terdaftar
pendingTransaction = {
  uid: "A1AEC701",
  status: "not_registered",
  timestamp: 1731328033123
}

// Setelah tap kartu terdaftar
pendingTransaction = {
  uid: "A1AEC701",
  name: "Budi",
  balance: 35000,
  status: "waiting_amount",
  timestamp: 1731328033123
}
```

---

## 🖥️ Tampilan Web Dashboard

Fitur UI (semua berbasis HTML & JavaScript murni):

| Komponen              | Fungsi                                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| **Pending Box**       | Menampilkan status tap terbaru (menunggu, belum terdaftar, siap bayar). |
| **Form Pembayaran**   | Input nominal & tombol “Proses Pembayaran”.                             |
| **Daftar Kartu**      | Menampilkan semua kartu terdaftar dan saldo-nya.                        |
| **Form Pendaftaran**  | Input UID, nama, saldo harian untuk kartu baru.                         |
| **Form Top-Up**       | Menambah saldo kartu yang ada.                                          |
| **Form Hapus / Wipe** | Menghapus kartu tertentu atau semua data.                               |

---

## ⚙️ Cara Instalasi & Jalankan

### 1️⃣ Clone atau download project

```bash
git clone https://github.com/yourusername/kantin-rfid.git
cd kantin-rfid/server
```

### 2️⃣ Install dependencies

```bash
npm install express body-parser
```

### 3️⃣ Jalankan server

```bash
node server.js
```

### 4️⃣ Buka di browser

```
http://localhost:3000
```

atau dari perangkat lain di jaringan sama:

```
http://<IP_KOMPUTER>:3000
```

---

## 📡 Integrasi ESP8266

Pastikan ESP8266 kamu menjalankan kode:

```cpp
const char* SERVER_URL = "http://<IP_KOMPUTER>:3000";
```

Contoh log serial:

```
[TAP DETECTED] UID: A1AEC701
Sending POST to: http://192.168.1.11:3000/api/card-tap
Payload: {"uid":"A1AEC701"}
✅ Data sent to server successfully
```

---

## 🧾 Ringkasan Logika Utama

| Tahap | Komponen       | Aksi                                     |
| ----- | -------------- | ---------------------------------------- |
| 1     | ESP8266        | Membaca UID & kirim ke server            |
| 2     | Node.js Server | Validasi kartu → buat pendingTransaction |
| 3     | Web Dashboard  | Polling `/api/pending`, tampilkan status |
| 4     | Kasir          | Input nominal pembayaran                 |
| 5     | Server         | Kurangi saldo, simpan ke `cards.json`    |
| 6     | ESP8266        | Dapat respon sukses/gagal                |
| 7     | Sistem         | Siap menunggu tap berikutnya             |

---

## 🧩 Rencana Fitur Lanjutan

| Fitur                                     | Deskripsi                                               |
| ----------------------------------------- | ------------------------------------------------------- |
| 🔔 **Buzzer/LED feedback**                | Tanda visual/audio di ESP8266 untuk status sukses/gagal |
| ⏰ **Reset otomatis global jam 00:00**     | Semua kartu di-reset tanpa menunggu tap                 |
| 💻 **Dashboard admin lanjutan**           | Statistik harian & total transaksi                      |
| 🔐 **API key / autentikasi**              | Melindungi endpoint dari akses luar                     |
| ☁️ **Integrasi database (MongoDB/MySQL)** | Untuk produksi skala besar                              |

---

## 📜 Lisensi

Proyek ini bersifat open-source dan bebas dimodifikasi untuk kebutuhan edukasi, penelitian, atau implementasi nyata di lingkungan sekolah/kampus.

---

Kalau kamu mau, aku bisa lanjutkan membuat **README versi GitHub lengkap dengan gambar diagram alur (PNG/Markdown)** dan badge (contoh: “Made with Node.js + ESP8266”).
Apakah mau saya tambahkan versi visual-nya juga (gambar diagram + badge GitHub)?
