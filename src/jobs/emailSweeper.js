const config = require('../config');
const emailPublishService = require('../services/emailPublishService');
const emailSendRequestService = require('../services/emailSendRequestService');
const emailSendRequestQuery = require('../queries/emailSendRequestQuery');

// Requests built per sweep; the rest wait for the next one.
const REQUEST_LIMIT = 50;

let running = false;

/**
 * Picks up the work whose queue message never arrived or was lost: requests the API saved
 * while the broker was down, requests abandoned halfway (this app stopped), and built emails
 * that were never published to the send email queue.
 */
async function sweep() {
  const reset = await emailSendRequestQuery.resetAbandoned(config.emailRequest.timeoutMinutes);
  if (reset) {
    console.log(`Email sweep: ${reset} abandoned request(s) are built again`);
  }

  const requestIds = await emailSendRequestQuery.getPending(
    emailPublishService.MIN_AGE_SECONDS,
    REQUEST_LIMIT,
  );
  for (const requestId of requestIds) {
    const result = await emailSendRequestService.processRequest(requestId);
    console.log(`Email sweep: request ${requestId}: ${JSON.stringify(result)}`);
  }

  const published = await emailPublishService.publishMissed();
  if (published) {
    console.log(`Email sweep: queued ${published} email(s) the send email queue never received`);
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await sweep();
  } catch (err) {
    console.error('Email sweep failed', err);
  } finally {
    running = false;
  }
}

// Runs every EMAIL_SWEEP_INTERVAL_SECONDS.
function start() {
  setInterval(tick, config.emailRequest.sweepIntervalSeconds * 1000);
}

module.exports = {
  start,
  sweep,
};
