const db = require('../models');
const enums = require('../enums');
const emailBuilderService = require('./emailBuilderService');
const emailPublishService = require('./emailPublishService');
const emailService = require('./emailService');
const emailExecutionQuery = require('../queries/emailExecutionQuery');
const emailSendRequestQuery = require('../queries/emailSendRequestQuery');

// Keeps one INSERT well below the PostgreSQL limit of 65535 bound values.
const INSERT_CHUNK_SIZE = 500;

const { onQueue } = enums.emailExecutionStatus;
const { done, failed } = enums.emailSendRequestStatus;

async function insertExecutions(rows, transaction) {
  const result = [];
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);
    result.push(...(await emailExecutionQuery.insertMany(chunk, transaction)));
  }
  return result;
}

/**
 * Stores the outcome of a claimed request, unless the claim was lost (the request ran past the
 * timeout and was taken over). Returns what `save` returned, or null when the claim was lost.
 */
async function finishClaim(request, claimedAt, save) {
  return await db.sequelize.transaction(async transaction => {
    if (!(await emailSendRequestQuery.lockClaim(request.id, claimedAt, transaction))) {
      return null;
    }
    return await save(transaction);
  });
}

/**
 * Fails a request that could not be built (for example a broken source query). A failed row
 * is added to "emailExecutions", so the reason shows up in the email log.
 */
async function recordFailure(request, claimedAt, template, message) {
  const now = new Date();

  return await finishClaim(request, claimedAt, async transaction => {
    await emailSendRequestQuery.finish(request.id, failed, message, transaction);

    // A deleted template has no email log to show the failure in.
    if (!template) return true;

    await emailExecutionQuery.insertMany(
      [
        {
          batchId: request.id,
          emailId: template.id,
          emailName: template.name,
          trigger: request.trigger,
          priority: template.settings.priority,
          status: enums.emailExecutionStatus.failed,
          errorMessage: message,
          createdAt: now,
          updatedAt: now,
        },
      ],
      transaction,
    );
    return true;
  });
}

async function getTemplate(request) {
  const email = request.emailId ? await emailService.getEmailById(request.emailId) : null;
  if (!email) {
    throw new Error('The email template was deleted before its emails were built.');
  }
  return await emailService.getEmailDetail(email);
}

/**
 * Builds a send request into ready-to-send rows of "emailExecutions" and publishes them to the
 * send email queue. Only a pending request is built, so a request announced twice is built
 * once.
 */
async function processRequest(requestId) {
  const claimedAt = new Date();
  const request = await emailSendRequestQuery.claim(requestId, claimedAt);
  if (!request) return { status: 'skipped' };

  let template = null;
  let executions;
  try {
    template = await getTemplate(request);
    executions = await emailBuilderService.buildExecutions(template, {
      trigger: request.trigger,
      testRecipient: request.testRecipient,
    });

    if (!executions.length) {
      throw new Error(
        'The primary source returned no rows, so there is no one to send this email to.',
      );
    }
  } catch (err) {
    const recorded = await recordFailure(request, claimedAt, template, err.message);
    return recorded ? { status: failed, errorMessage: err.message } : { status: 'skipped' };
  }

  const now = new Date();
  const queuedIds = await finishClaim(request, claimedAt, async transaction => {
    const inserted = await insertExecutions(
      executions.map(execution => ({
        ...execution,
        batchId: request.id,
        createdAt: now,
        updatedAt: now,
      })),
      transaction,
    );
    await emailSendRequestQuery.finish(request.id, done, null, transaction);

    return inserted.filter(row => row.status === onQueue).map(row => row.id);
  });
  if (!queuedIds) return { status: 'skipped' };

  try {
    await emailPublishService.publish(queuedIds);
  } catch (err) {
    console.error(
      `Email request ${request.id}: emails saved but not queued (${err.message}); ` +
        'the sweep queues them later',
    );
  }

  return { status: done, total: executions.length, queued: queuedIds.length };
}

module.exports = {
  processRequest,
};
