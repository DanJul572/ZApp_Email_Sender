require('./loadEnv');

module.exports = {
  // Sends scheduled emails automatically. Disabled unless EMAIL_SCHEDULER_ENABLED=true, so a
  // development machine never mails real recipients by accident.
  enabled: process.env.EMAIL_SCHEDULER_ENABLED === 'true',
  intervalSeconds: parseInt(process.env.EMAIL_SCHEDULER_INTERVAL_SECONDS, 10) || 60,
};
