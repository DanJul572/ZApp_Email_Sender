# ZApp_Email_Sender

Mengirim email yang sudah disiapkan oleh ZApp_Worker_App. Service ini tidak membangun email:
merge tag, penerima, tracking, dan header sudah final di tabel `emailExecutions`.

## Alur

1. Consume `<NODE_ENV>_send_email_queue`, pesan `{ executionId }`.
2. Kunci baris `emailExecutions` yang masih `onQueue` (`FOR UPDATE SKIP LOCKED`). Baris yang
   sudah terkirim, gagal, atau sedang dikirim instance lain dilewati, sehingga pesan ganda
   tidak mengirim email dua kali.
3. Ambil lampiran dari `emailAttachments`, kirim lewat SMTP (nodemailer).
4. Update `status` (`success`/`failed`), `errorMessage`, `attempts`, `sentAt`.

Email yang gagal bisa dikirim ulang dari halaman Email Log.

## Menjalankan

```bash
cp .env.example .env.development.local   # lalu isi
pnpm install
pnpm dev
```

Untuk development, arahkan SMTP ke Mailpit (`EMAIL_HOST=localhost`, `EMAIL_PORT=1025`).

## Struktur

```
app.js            entry point: koneksi database dan consumer
src/
  config/         konfigurasi dari env (database, rabbitmq, mailer)
  consumers/      consumer RabbitMQ
  services/       logika pengiriman
  queries/        eksekusi query
  builders/       SQL
  helpers/        rabbitmq, mailer (transporter nodemailer)
  enums/
  models/
```
