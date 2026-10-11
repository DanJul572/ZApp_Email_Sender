require('./loadEnv');

const nodeEnv = process.env.NODE_ENV || 'development';

module.exports = {
  // AMQP address. RABBITMQ_USER and RABBITMQ_PASS are added when it has no credentials.
  url: process.env.RABBITMQ_URL,
  user: process.env.RABBITMQ_USER,
  pass: process.env.RABBITMQ_PASS,

  // Built from NODE_ENV like the worker app, so both meet on one name.
  queueName: {
    // Worker → email sender: built emails, one message per row of "emailExecutions".
    sendEmail: process.env.EMAIL_QUEUE_NAME || `${nodeEnv}_send_email_queue`,
  },
};
