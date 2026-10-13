const config = require('../config');
const enums = require('../enums');
const rabbitmq = require('../helpers/rabbitmq');
const emailPublishService = require('../services/emailPublishService');
const emailSendRequestService = require('../services/emailSendRequestService');

async function handle(message) {
  switch (message.type) {
    case enums.emailRequestMessageType.build: {
      const result = await emailSendRequestService.processRequest(message.requestId);
      console.log(`Email request ${message.requestId}: ${JSON.stringify(result)}`);
      break;
    }
    case enums.emailRequestMessageType.publish: {
      const published = await emailPublishService.publishById(message.executionId);
      console.log(`Email execution ${message.executionId}: ${published ? 'queued' : 'skipped'}`);
      break;
    }
    default:
      console.warn('Email request consumer: unknown message', message);
  }
}

/** Consumes the messages the API sends: new send requests and emails retried from the log. */
async function start() {
  await rabbitmq.consume(config.rabbitmq.queueName.emailRequest, handle, {
    prefetch: config.emailRequest.concurrency,
  });
  console.log(
    `Email request consumer: waiting for messages on ${config.rabbitmq.queueName.emailRequest}`,
  );
}

module.exports = {
  handle,
  start,
};
