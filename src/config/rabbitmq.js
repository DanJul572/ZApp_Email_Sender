require('./loadEnv');

const nodeEnv = process.env.NODE_ENV || 'development';

module.exports = {
  // AMQP address. RABBITMQ_USER and RABBITMQ_PASS are added when it has no credentials.
  url: process.env.RABBITMQ_URL,
  user: process.env.RABBITMQ_USER,
  pass: process.env.RABBITMQ_PASS,

  // Built from NODE_ENV like the API, so both meet on one name.
  queueName: {
    // API → this app: send requests and retried emails.
    emailRequest: process.env.EMAIL_REQUEST_QUEUE_NAME || `${nodeEnv}_email_request_queue`,
    // Built emails, one message per row of "emailExecutions". This app publishes and consumes
    // it, so a large request is sent spread over every instance, one email at a time.
    sendEmail: process.env.EMAIL_QUEUE_NAME || `${nodeEnv}_send_email_queue`,
  },
};
