const database = require('./database');
const mailer = require('./mailer');
const rabbitmq = require('./rabbitmq');

module.exports = {
  database,
  mailer,
  rabbitmq,
};
