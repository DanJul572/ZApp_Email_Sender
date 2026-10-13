require('./loadEnv');

module.exports = {
  // Send requests built at the same time. Building runs the templates' source queries.
  concurrency: parseInt(process.env.EMAIL_REQUEST_CONCURRENCY, 10) || 2,
  // How often rows the queue messages missed are picked up (the broker was down when the
  // API saved them, or this app stopped halfway).
  sweepIntervalSeconds: parseInt(process.env.EMAIL_SWEEP_INTERVAL_SECONDS, 10) || 60,
  // A request still being built after this long is taken as abandoned and built again.
  timeoutMinutes: parseInt(process.env.EMAIL_REQUEST_TIMEOUT_MINUTES, 10) || 30,
};
