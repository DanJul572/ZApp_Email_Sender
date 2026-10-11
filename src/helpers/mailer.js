const nodemailer = require('nodemailer');

const config = require('../config');

const transporter = nodemailer.createTransport({
  host: config.mailer.host,
  port: config.mailer.port,
  secure: config.mailer.secure,
  auth: config.mailer.user ? { user: config.mailer.user, pass: config.mailer.pass } : undefined,
});

module.exports = transporter;
