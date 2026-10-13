const { randomUUID } = require('crypto');

const db = require('../models');
const enums = require('../enums');
const { emailSendRequestBuilder } = require('../builders');

const { QueryTypes } = db.sequelize;
const { pending, processing } = enums.emailSendRequestStatus;

async function run(query, replacements, type, transaction) {
  try {
    return await db.sequelize.query(query, { replacements, transaction, type });
  } catch (error) {
    throw new Error(error.message, { cause: error });
  }
}

module.exports = {
  /** Saves a pending request and returns its id. */
  async insert(emailId, trigger, transaction) {
    const id = randomUUID();
    await run(
      emailSendRequestBuilder.insert(),
      [id, emailId, trigger, pending],
      QueryTypes.INSERT,
      transaction,
    );
    return id;
  },

  /** Returns the request when it was pending and is now this caller's, otherwise null. */
  async claim(id, claimedAt) {
    const [rows] = await run(
      emailSendRequestBuilder.claim(),
      [processing, claimedAt, id, pending],
      QueryTypes.RAW,
    );
    return rows.length > 0 ? rows[0] : null;
  },

  async lockClaim(id, claimedAt, transaction) {
    const rows = await run(
      emailSendRequestBuilder.lockClaim(),
      [id, processing, claimedAt],
      QueryTypes.SELECT,
      transaction,
    );
    return rows.length > 0;
  },

  async finish(id, status, errorMessage, transaction) {
    await run(
      emailSendRequestBuilder.finish(),
      [status, errorMessage, id],
      QueryTypes.UPDATE,
      transaction,
    );
  },

  /** Ids of requests that have been pending for at least `minAgeSeconds`. */
  async getPending(minAgeSeconds, limit) {
    const rows = await run(
      emailSendRequestBuilder.getPending(),
      [pending, minAgeSeconds, limit],
      QueryTypes.SELECT,
    );
    return rows.map(row => row.id);
  },

  /** Puts requests that have been building for over `minutes` back to pending. */
  async resetAbandoned(minutes) {
    const [, result] = await run(
      emailSendRequestBuilder.resetAbandoned(),
      [pending, processing, minutes],
      QueryTypes.RAW,
    );
    return result?.rowCount ?? 0;
  },
};
