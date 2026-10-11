require('./loadEnv');

module.exports = {
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10) || 587,
  // true for port 465 (SSL).
  secure: process.env.EMAIL_SECURE === 'true',
  // A local test server (Mailpit, MailHog) usually needs no login.
  user: process.env.EMAIL_USERNAME,
  pass: process.env.EMAIL_PASSWORD,
  from: process.env.EMAIL_FROM || '"ZApp" <no-reply@example.com>',
  // Emails sent at the same time.
  concurrency: parseInt(process.env.EMAIL_CONCURRENCY, 10) || 5,
};
