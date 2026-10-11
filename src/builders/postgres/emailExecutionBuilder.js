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
  lockOnQueue,
};
