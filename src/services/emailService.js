const config = require('../config');
const enums = require('../enums');
const mailer = require('../helpers/mailer');
const emailQuery = require('../queries/emailQuery');

const findKey = (map, id) => Object.keys(map).find(key => map[key] === id);

async function getEmailById(id) {
  return await emailQuery.getById(id);
}

/**
 * Returns what building a template needs, in the same shape the API's email builder form uses
 * (without the design, schedule and attachments; the attachments are read when each email is
 * sent).
 */
async function getEmailDetail(email) {
  const [cc, bcc, dataSources, tags, settings] = await Promise.all([
    emailQuery.getByEmailId('emailCC', email.id),
    emailQuery.getByEmailId('emailBCC', email.id),
    emailQuery.getByEmailId('emailDataSources', email.id),
    emailQuery.getByEmailId('emailTags', email.id),
    emailQuery.getByEmailId('emailSettings', email.id),
  ]);

  const primarySource = dataSources.find(
    source => source.emailDataSourceTypeId === enums.emailDataSourceType.primary,
  );
  const setting = settings[0];

  return {
    id: email.id,
    name: email.name,
    to: email.to,
    subject: email.subject,
    body: email.body,
    cc: cc.map(row => row.label),
    bcc: bcc.map(row => row.label),
    primarySource: primarySource
      ? { name: primarySource.name, sql: primarySource.query }
      : { name: '', sql: '' },
    optionalSources: dataSources
      .filter(source => source.emailDataSourceTypeId === enums.emailDataSourceType.optional)
      .map(source => ({ id: source.id, name: source.name, sql: source.query })),
    mergeTags: tags.map(tag => ({
      id: tag.id,
      tag: tag.label,
      column: tag.value,
      defaultValue: tag.defaultValue || '',
    })),
    settings: {
      priority: setting
        ? findKey(enums.emailPriorityLevel, setting.emailPriorityLevelId)
        : 'normal',
      openTracking: !!setting?.openTracking,
      clickTracking: !!setting?.clickTracking,
      unsubscribeLink: !!setting?.unsubscribeLink,
    },
  };
}

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
  getEmailById,
  getEmailDetail,
  sendEmail,
};
