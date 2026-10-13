const db = require('../models');
const config = require('../config');
const enums = require('../enums');
const getNextRunAt = require('../helpers/getNextRunAt');
const emailQuery = require('../queries/emailQuery');
const emailSendRequestQuery = require('../queries/emailSendRequestQuery');
const emailSendRequestService = require('../services/emailSendRequestService');

let running = false;

const getSchedulerType = id =>
  Object.keys(enums.emailSchedulerType).find(key => enums.emailSchedulerType[key] === id);

/**
 * Turns every schedule whose next run time has come into a send request and builds it. The
 * next run time is moved forward in the same transaction that saves the request, so an
 * occurrence gets exactly one request; missed occurrences (this app was down) are skipped
 * rather than sent in a burst.
 */
async function requestDueEmails() {
  let requestIds;

  try {
    requestIds = await db.sequelize.transaction(async transaction => {
      const schedulers = await emailQuery.getDueSchedulers(transaction);
      const ids = [];

      for (const scheduler of schedulers) {
        const type = getSchedulerType(scheduler.emailSchedulerTypeId);
        const nextRunAt = getNextRunAt(scheduler.startTime, type);
        await emailQuery.updateNextRunAt(scheduler.id, nextRunAt, transaction);
        ids.push(
          await emailSendRequestQuery.insert(
            scheduler.emailId,
            enums.emailExecutionTrigger.scheduler,
            transaction,
          ),
        );
      }

      return ids;
    });
  } catch (err) {
    console.error('Email scheduler: failed to read the due schedules', err);
    return;
  }

  // A request that fails here stays pending, and the sweep builds it later.
  for (const requestId of requestIds) {
    try {
      const result = await emailSendRequestService.processRequest(requestId);
      console.log(`Email scheduler: request ${requestId}: ${JSON.stringify(result)}`);
    } catch (err) {
      console.error(`Email scheduler: request ${requestId} failed`, err);
    }
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await requestDueEmails();
  } finally {
    running = false;
  }
}

// Checks every EMAIL_SCHEDULER_INTERVAL_SECONDS. Disabled unless EMAIL_SCHEDULER_ENABLED=true.
function start() {
  if (!config.emailScheduler.enabled) return;

  tick();
  setInterval(tick, config.emailScheduler.intervalSeconds * 1000);
}

module.exports = {
  requestDueEmails,
  start,
};
