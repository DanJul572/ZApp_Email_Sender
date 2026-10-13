const db = require('../models');
const { emailBuilder } = require('../builders');

module.exports = {
  async getById(id) {
    try {
      const result = await db.sequelize.query(emailBuilder.getById(), {
        replacements: [id],
        type: db.sequelize.QueryTypes.SELECT,
      });
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      throw new Error(error.message, { cause: error });
    }
  },

  async getByEmailId(table, emailId, transaction) {
    try {
      const query = emailBuilder.getByEmailId(table);
      return await db.sequelize.query(query, {
        replacements: [emailId],
        transaction,
        type: db.sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      throw new Error(error.message, { cause: error });
    }
  },

  /**
   * Runs the template's SQL data sources. They are written by users, so they run in a read-only
   * transaction with a time limit: a source can read data but never change it.
   */
  async runReadOnly(callback) {
    try {
      return await db.sequelize.transaction(async transaction => {
        await db.sequelize.query('SET TRANSACTION READ ONLY', { transaction });
        await db.sequelize.query("SET LOCAL statement_timeout = '30s'", { transaction });

        const run = sql =>
          db.sequelize.query(sql, { transaction, type: db.sequelize.QueryTypes.SELECT });

        return await callback(run);
      });
    } catch (error) {
      throw new Error(error.message, { cause: error });
    }
  },

  async getDueSchedulers(transaction) {
    try {
      return await db.sequelize.query(emailBuilder.getDueSchedulers(), {
        transaction,
        type: db.sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      throw new Error(error.message, { cause: error });
    }
  },

  async updateNextRunAt(id, nextRunAt, transaction) {
    try {
      await db.sequelize.query(emailBuilder.updateNextRunAt(), {
        replacements: [nextRunAt, id],
        transaction,
        type: db.sequelize.QueryTypes.UPDATE,
      });
    } catch (error) {
      throw new Error(error.message, { cause: error });
    }
  },
};
