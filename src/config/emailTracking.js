require('./loadEnv');

module.exports = {
  // The API's "/api" address as the recipients' mail clients reach it. The tracking pixel,
  // tracked links and unsubscribe links point here.
  publicUrl: (process.env.EMAIL_PUBLIC_URL || '').trim().replace(/\/+$/, ''),
  // Signs tracked links; the API checks them with the same key.
  secretKey: process.env.ENCRYPTION_KEY,
};
