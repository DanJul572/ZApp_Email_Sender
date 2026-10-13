const db = require('../models');
const config = require('../config');
const rabbitmq = require('../helpers/rabbitmq');
const emailExecutionQuery = require('../queries/emailExecutionQuery');

// Rows handled per message batch and per sweep round.
const BATCH_SIZE = 500;
// Rows newer than this are still being handled by the message that announced them.
const MIN_AGE_SECONDS = 60;

/**
 * Publishes rows of "emailExecutions" to the send email queue, one message per row, and marks
 * them published. A row that is published twice is sent once: the send email consumer only
 * sends rows that are still on queue.
 */
async function publish(executionIds, transaction) {
  for (let index = 0; index < executionIds.length; index += BATCH_SIZE) {
    const ids = executionIds.slice(index, index + BATCH_SIZE);

    await rabbitmq.sendToQueue(
      config.rabbitmq.queueName.sendEmail,
      ids.map(executionId => ({ executionId })),
    );
    await emailExecutionQuery.setPublished(ids, transaction);
  }
}

/** Publishes one row put back on queue by a retry from the email log. */
async function publishById(executionId) {
  return await db.sequelize.transaction(async transaction => {
    const ids = await emailExecutionQuery.lockUnpublishedById(executionId, transaction);
    await publish(ids, transaction);
    return ids.length;
  });
}

/**
 * Publishes the rows on queue that never reached the send email queue: the broker was down
 * when they were built or retried. The rows are locked, so two instances of this app never
 * publish the same row at once. Returns the number of rows published.
 */
async function publishMissed() {
  let total = 0;

  for (;;) {
    const count = await db.sequelize.transaction(async transaction => {
      const ids = await emailExecutionQuery.lockUnpublished(
        BATCH_SIZE,
        MIN_AGE_SECONDS,
        transaction,
      );
      await publish(ids, transaction);
      return ids.length;
    });

    total += count;
    if (count < BATCH_SIZE) return total;
  }
}

module.exports = {
  MIN_AGE_SECONDS,
  publish,
  publishById,
  publishMissed,
};
