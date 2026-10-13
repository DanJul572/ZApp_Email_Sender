const db = require('../models');
const enums = require('../enums');
const emailService = require('./emailService');
const emailExecutionQuery = require('../queries/emailExecutionQuery');

const { success, failed } = enums.emailExecutionStatus;

async function getAttachments(emailId, transaction) {
  if (!emailId) return [];

  const rows = await emailExecutionQuery.getAttachments(emailId, transaction);
  return rows.map(row => ({
    filename: row.fileName,
    content: row.fileBuffer,
    contentType: row.mimeType,
  }));
}

/**
 * Sends one row of "emailExecutions". The merge tags were replaced when the request was built,
 * so the row holds the final recipients, subject and body; the attachments are read from the
 * template.
 *
 * The row is locked while it is sent, and only a row that is still on queue is sent, so a
 * message delivered twice never sends the email twice.
 */
async function processExecution(executionId) {
  return await db.sequelize.transaction(async transaction => {
    const execution = await emailExecutionQuery.lockOnQueue(executionId, transaction);
    if (!execution) return { status: 'skipped' };

    let status = success;
    let errorMessage = null;

    try {
      const info = await emailService.sendEmail({
        to: execution.to,
        cc: execution.cc,
        bcc: execution.bcc,
        subject: execution.subject,
        html: execution.body,
        priority: execution.priority,
        // Extra headers added when the request was built, e.g. List-Unsubscribe.
        headers: execution.headers || undefined,
        attachments: await getAttachments(execution.emailId, transaction),
      });
      console.log(`Email execution ${executionId}: sent as ${info.messageId}`);
    } catch (err) {
      status = failed;
      errorMessage = err.message;
    }

    await emailExecutionQuery.finish(execution.id, status, errorMessage, transaction);

    return { status, errorMessage };
  });
}

module.exports = {
  processExecution,
};
