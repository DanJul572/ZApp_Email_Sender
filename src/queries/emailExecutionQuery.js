const db = require('../models');
const enums = require('../enums');
const { emailExecutionBuilder } = require('../builders');

const { QueryTypes } = db.sequelize;

async function run(query, replacements, type, transaction) {
  try {
    return await db.sequelize.query(query, { replacements, transaction, type });
  } catch (error) {
    throw new Error(error.message, { cause: error });
  }
}

module.exports = {
  async lockOnQueue(id, transaction) {
    const rows = await run(
      emailExecutionBuilder.lockOnQueue(),
      [id, enums.emailExecutionStatus.onQueue],
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
