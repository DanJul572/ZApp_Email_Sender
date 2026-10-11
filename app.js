require('./src/config/loadEnv');

const db = require('./src/models');
const rabbitmq = require('./src/helpers/rabbitmq');

const consumers = require('./src/consumers');

async function start() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connected');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }

  await consumers.sendEmailConsumer.start();
}

async function stop() {
  try {
    await rabbitmq.close();
    await db.sequelize.close();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

start();
