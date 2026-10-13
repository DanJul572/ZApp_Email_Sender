const insertFields = [
  'batchId',
  'emailId',
  'emailName',
  'trigger',
  'to',
  'cc',
  'bcc',
  'subject',
  'body',
  'priority',
  'trackingId',
  'headers',
  'status',
  'errorMessage',
  'createdAt',
  'updatedAt',
];

function insertMany(rows) {
  const fieldQuery = insertFields.map(field => `"${field}"`).join(', ');
  const placeholders = `(${insertFields.map(() => '?').join(', ')})`;
  const values = rows.flatMap(row => insertFields.map(field => row[field] ?? null));

  const query =
    `INSERT INTO "emailExecutions" (${fieldQuery}) ` +
    `VALUES ${rows.map(() => placeholders).join(', ')} RETURNING "id", "status"`;

  return { query, values };
}

// Rows on queue that were never published to the send email queue. Newer rows are left alone:
// the message that announced them is still being handled.
function lockUnpublished() {
  return (
    'SELECT "id" FROM "emailExecutions" ' +
    'WHERE "status" = ? AND "publishedAt" IS NULL ' +
    'AND "updatedAt" < NOW() - (? * INTERVAL \'1 second\') ' +
    'ORDER BY "id" LIMIT ? FOR UPDATE SKIP LOCKED'
  );
}

function lockUnpublishedById() {
  return (
    'SELECT "id" FROM "emailExecutions" ' +
    'WHERE "id" = ? AND "status" = ? AND "publishedAt" IS NULL FOR UPDATE SKIP LOCKED'
  );
}

function setPublished(ids) {
  return (
    'UPDATE "emailExecutions" SET "publishedAt" = NOW() ' +
    `WHERE "id" IN (${ids.map(() => '?').join(', ')})`
  );
}

// Locks a row that is still on queue; a row that is sent, failed or locked by another send is
// skipped, so a message delivered twice never sends the email twice.
function lockOnQueue() {
  return 'SELECT * FROM "emailExecutions" WHERE "id" = ? AND "status" = ? FOR UPDATE SKIP LOCKED';
}

function getAttachments() {
  return (
    'SELECT "fileName", "mimeType", "fileBuffer" FROM "emailAttachments" ' +
    'WHERE "emailId" = ? ORDER BY "id"'
  );
}

function finish() {
  return (
    'UPDATE "emailExecutions" ' +
    'SET "status" = ?, "errorMessage" = ?, "attempts" = "attempts" + 1, ' +
    '"sentAt" = CASE WHEN ? THEN NOW() ELSE "sentAt" END, "updatedAt" = NOW() ' +
    'WHERE "id" = ?'
  );
}

module.exports = {
  finish,
  getAttachments,
  insertMany,
  lockOnQueue,
  lockUnpublished,
  lockUnpublishedById,
  setPublished,
};
