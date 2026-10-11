const amqp = require('amqplib');

const config = require('../config');

const RECONNECT_DELAY_MS = 5000;

let connection = null;
let channel = null;
let connecting = null;
let reconnectTimer = null;
let closing = false;

// Queues this app consumes. They are consumed again after every reconnect.
const consumers = [];

// RABBITMQ_URL may carry the credentials itself; otherwise RABBITMQ_USER and RABBITMQ_PASS are
// added to it.
function getUrl() {
  if (!config.rabbitmq.url) return null;

  const url = new URL(config.rabbitmq.url);
  if (!url.username && config.rabbitmq.user) {
    url.username = encodeURIComponent(config.rabbitmq.user);
    url.password = encodeURIComponent(config.rabbitmq.pass || '');
  }
  return url.toString();
}

function scheduleReconnect() {
  if (closing || reconnectTimer) return;

  console.log(`RabbitMQ: reconnecting in ${RECONNECT_DELAY_MS / 1000} seconds...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

// The channel may have closed while the message was handled; the broker then delivers the
// message again, so there is nothing left to answer.
function settle(activeChannel, msg, ack) {
  try {
    if (ack) activeChannel.ack(msg);
    else activeChannel.nack(msg, false, false);
  } catch (err) {
    console.error('RabbitMQ: could not answer the message:', err.message);
  }
}

async function startConsumer(activeChannel, { queueName, handler, prefetch }) {
  await activeChannel.assertQueue(queueName, { durable: true });
  await activeChannel.prefetch(prefetch);

  await activeChannel.consume(
    queueName,
    async msg => {
      if (!msg) return;

      let payload;
      try {
        payload = JSON.parse(msg.content.toString());
      } catch {
        console.error(`RabbitMQ: invalid message on ${queueName}:`, msg.content.toString());
        settle(activeChannel, msg, false);
        return;
      }

      try {
        await handler(payload);
        settle(activeChannel, msg, true);
      } catch (err) {
        // Not requeued, so one failure is not retried in a loop. The work stays in the
        // database, where the sweep or a retry picks it up again.
        console.error(`RabbitMQ: message on ${queueName} failed:`, err);
        settle(activeChannel, msg, false);
      }
    },
    { noAck: false },
  );
}

async function openChannel() {
  const url = getUrl();
  if (!url) {
    console.warn('RabbitMQ disabled: no URL provided');
    return;
  }

  const newConnection = await amqp.connect(url);
  newConnection.on('error', err => console.error('RabbitMQ connection error:', err.message));
  newConnection.on('close', () => {
    if (connection === newConnection) {
      connection = null;
      channel = null;
    }
    scheduleReconnect();
  });

  try {
    // A confirm channel lets sendToQueue wait until the broker has stored the message.
    const newChannel = await newConnection.createConfirmChannel();
    newChannel.on('error', err => console.error('RabbitMQ channel error:', err.message));
    // A channel the broker closes takes its consumers with it; the whole connection is
    // reopened so they start again.
    newChannel.on('close', () => {
      if (channel === newChannel) newConnection.close().catch(() => {});
    });

    for (const consumer of consumers) {
      await startConsumer(newChannel, consumer);
    }

    connection = newConnection;
    channel = newChannel;
  } catch (err) {
    await newConnection.close().catch(() => {});
    throw err;
  }

  console.log('RabbitMQ connected');
}

async function connect() {
  if (channel) return;

  if (!connecting) {
    connecting = openChannel()
      .catch(err => {
        console.error('RabbitMQ connection failed:', err.message);
        scheduleReconnect();
      })
      .finally(() => {
        connecting = null;
      });
  }

  await connecting;
}

async function getChannel() {
  if (!channel) {
    await connect();
  }
  if (!channel) {
    throw new Error('RabbitMQ is not available');
  }
  return channel;
}

/**
 * Sends one message, or an array of messages, to a durable queue and resolves once the broker
 * has confirmed them.
 */
async function sendToQueue(queueName, message) {
  const activeChannel = await getChannel();
  const messages = Array.isArray(message) ? message : [message];

  await activeChannel.assertQueue(queueName, {
    durable: true,
  });

  messages.forEach(item => {
    activeChannel.sendToQueue(queueName, Buffer.from(JSON.stringify(item)), { persistent: true });
  });

  await activeChannel.waitForConfirms();
}

/**
 * Hands every message of a durable queue to `handler`, at most `prefetch` at a time. A message
 * is acknowledged when the handler resolves and dropped when it throws. Keeps consuming after
 * the connection is lost and comes back.
 */
async function consume(queueName, handler, { prefetch = 1 } = {}) {
  const consumer = { queueName, handler, prefetch };
  consumers.push(consumer);

  if (channel) {
    await startConsumer(channel, consumer);
  } else {
    await connect();
  }
}

async function close() {
  closing = true;
  clearTimeout(reconnectTimer);
  if (connection) {
    await connection.close();
  }
}

module.exports = {
  close,
  connect,
  consume,
  sendToQueue,
};
