# ZApp_Email_Sender

Membangun dan mengirim email ZApp: request dari API (manual, test, retry), email terjadwal, dan
pemulihan pesan yang hilang.

## Alur

```
API ──email_request_queue──▶ [build] ──send_email_queue──▶ [send] ──SMTP
                              ├ job emailScheduler
                              └ job emailSweeper
```

Build dan send ada di app yang sama tetapi dipisah oleh `send_email_queue`. Satu request bisa
menghasilkan ribuan email; dengan satu pesan per email, pengirimannya terbagi ke semua instance
dan concurrency build (`EMAIL_REQUEST_CONCURRENCY`) dan send (`EMAIL_CONCURRENCY`) diatur
terpisah.

| Tugas | Sumber | Hasil |
| --- | --- | --- |
| Build email | Pesan `build` dari API (`emailSendRequests`) | Baris `emailExecutions`, lalu pesan ke `send_email_queue` |
| Kirim ulang | Pesan `publish` dari API (retry di Email Log) | Pesan ke `send_email_queue` |
| Kirim | Pesan `{ executionId }` di `send_email_queue` | Email terkirim lewat SMTP, status di `emailExecutions` |
| Email terjadwal | Job `emailScheduler` (`emailSchedulers.nextRunAt`) | Baris `emailSendRequests` dengan trigger `scheduler`, lalu di-build |
| Sweep | Job `emailSweeper` | Mengambil request/email yang pesannya hilang (broker mati, app berhenti) |

### Build

1. Klaim request yang masih `pending` (`pending` → `processing`), sehingga pesan ganda tidak
   membangun request dua kali.
2. Jalankan data source template di transaksi read-only (timeout 30 detik), ganti merge tag,
   tentukan penerima, tambahkan tracking dan link unsubscribe.
3. Simpan baris `emailExecutions`, lalu publish satu pesan per email dan isi `publishedAt`.

### Send

1. Kunci baris `emailExecutions` yang masih `onQueue` (`FOR UPDATE SKIP LOCKED`). Baris yang
   sudah terkirim, gagal, atau sedang dikirim instance lain dilewati, sehingga pesan ganda
   tidak mengirim email dua kali.
2. Ambil lampiran dari `emailAttachments`, kirim lewat SMTP (nodemailer).
3. Update `status` (`success`/`failed`), `errorMessage`, `attempts`, `sentAt`.

Email yang gagal bisa dikirim ulang dari halaman Email Log.

## Queue

| Queue (default) | Dari → Ke | Pesan |
| --- | --- | --- |
| `<NODE_ENV>_email_request_queue` | API → app ini | `{ type: 'build', requestId }`, `{ type: 'publish', executionId }` |
| `<NODE_ENV>_send_email_queue` | app ini → app ini | `{ executionId }` |

Pesan hanya berisi id. Datanya selalu dibaca dari database, sehingga pesan yang terkirim dua
kali tidak memproses data dua kali. Beberapa instance boleh berjalan bersamaan.

## Menjalankan

```bash
cp .env.example .env   # lalu isi
pnpm install
pnpm dev
```

Untuk development, arahkan SMTP ke Mailpit (`EMAIL_HOST=localhost`, `EMAIL_PORT=1025`).
Migration ada di ZApp_API_App (`pnpm migrate`).

## Struktur

```
app.js            entry point: koneksi database, consumer dan job
src/
  config/         konfigurasi dari env (database, rabbitmq, mailer, email)
  consumers/      consumer RabbitMQ (emailRequest, sendEmail)
  jobs/           pekerjaan berkala (scheduler, sweep)
  services/       logika (build, publish, kirim)
  queries/        eksekusi query
  builders/       SQL
  helpers/        rabbitmq, mailer, emailTracking, getNextRunAt
  enums/
  models/
```
