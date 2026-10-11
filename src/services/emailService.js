const config = require('../config');
const mailer = require('../helpers/mailer');

async function sendEmail({ to, cc, bcc, subject, text, html, attachments, priority, headers }) {
  return await mailer.sendMail({
    from: config.mailer.from,
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject,
    text,
    html,
    attachments,
    priority,
    headers,
  });
}

module.exports = {
  sendEmail,
};
