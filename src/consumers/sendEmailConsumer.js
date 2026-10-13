const config = require('../config');
const rabbitmq = require('../helpers/rabbitmq');
const emailExecutionService = require('../services/emailExecutionService');

async function handle({ executionId }) {
  const result = await emailExecutionService.processExecution(executionId);
  console.log(`Email execution ${executionId}: ${result.status}`);
}

/** Consumes the built emails, one message ({ executionId }) per email. */
async function start() {
  await rabbitmq.consume(config.rabbitmq.queueName.sendEmail, handle, {
    prefetch: config.mailer.concurrency,
  });
  console.log(
    `Send email consumer: waiting for messages on ${config.rabbitmq.queueName.sendEmail}`,
  );
}

module.exports = {
  handle,
  start,
};
