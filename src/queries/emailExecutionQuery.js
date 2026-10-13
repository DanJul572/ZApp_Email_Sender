const db = require('../models');
const enums = require('../enums');
const { emailExecutionBuilder } = require('../builders');

const { QueryTypes } = db.sequelize;
const { onQueue } = enums.emailExecutionStatus;

async function run(query, replacements, type, transaction) {
  try {
    return await db.sequelize.query(query, { replacements, transaction, type });
  } catch (error) {
    throw new Error(error.message, { cause: error });
  }
}

module.exports = {
  async insertMany(rows, transaction) {
    const { query, values } = emailExecutionBuilder.insertMany(rows);
    const [result] = await run(query, values, QueryTypes.RAW, transaction);
    return result;
  },

  async lockUnpublished(limit, minAgeSeconds, transaction) {
    const rows = await run(
      emailExecutionBuilder.lockUnpublished(),
      [onQueue, minAgeSeconds, limit],
      QueryTypes.SELECT,
      transaction,
    );
    return rows.map(row => row.id);
  },

  async lockUnpublishedById(id, transaction) {
    const rows = await run(
      emailExecutionBuilder.lockUnpublishedById(),
      [id, onQueue],
      QueryTypes.SELECT,
      transaction,
    );
    return rows.map(row => row.id);
  },

  async setPublished(ids, transaction) {
    if (!ids.length) return;

    await run(emailExecutionBuilder.setPublished(ids), ids, QueryTypes.UPDATE, transaction);
  },

  async lockOnQueue(id, transaction) {
    const rows = await run(
      emailExecutionBuilder.lockOnQueue(),
      [id, onQueue],
      QueryTypes.SELECT,
      transaction,
    );
    return rows.length > 0 ? rows[0] : null;
  },

  async getAttachments(emailId, transaction) {
    return await run(
      emailExecutionBuilder.getAttachments(),
      [emailId],
      QueryTypes.SELECT,
      transaction,
    );
  },

  async finish(id, status, errorMessage, transaction) {
    await run(
      emailExecutionBuilder.finish(),
      [status, errorMessage, status === enums.emailExecutionStatus.success, id],
      QueryTypes.UPDATE,
      transaction,
    );
  },
};
