const db = require('../models');
const { emailTrackingBuilder } = require('../builders');

module.exports = {
  async getUnsubscribedAddresses(emailId) {
    try {
      const rows = await db.sequelize.query(emailTrackingBuilder.getUnsubscribedAddresses(), {
        replacements: [emailId],
        type: db.sequelize.QueryTypes.SELECT,
      });
      return new Set(rows.map(row => row.address));
    } catch (error) {
      throw new Error(error.message, { cause: error });
    }
  },
};
