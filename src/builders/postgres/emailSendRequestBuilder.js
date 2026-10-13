function insert() {
  return (
    'INSERT INTO "emailSendRequests" ("id", "emailId", "trigger", "status", "createdAt", "updatedAt") ' +
    'VALUES (?, ?, ?, ?, NOW(), NOW())'
  );
}

// Takes a pending request. "updatedAt" is set to the claim time, which identifies this claim.
function claim() {
  return (
    'UPDATE "emailSendRequests" SET "status" = ?, "errorMessage" = NULL, "updatedAt" = ? ' +
    'WHERE "id" = ? AND "status" = ? RETURNING *'
  );
}

// Finds the request only while the claim is still this one (it was not taken over after the
// timeout), and locks it until the transaction ends.
function lockClaim() {
  return (
    'SELECT "id" FROM "emailSendRequests" WHERE "id" = ? AND "status" = ? AND "updatedAt" = ? ' +
    'FOR UPDATE'
  );
}

function finish() {
  return (
    'UPDATE "emailSendRequests" SET "status" = ?, "errorMessage" = ?, "updatedAt" = NOW() ' +
    'WHERE "id" = ?'
  );
}

function getPending() {
  return (
    'SELECT "id" FROM "emailSendRequests" ' +
    'WHERE "status" = ? AND "updatedAt" < NOW() - (? * INTERVAL \'1 second\') ' +
    'ORDER BY "createdAt" LIMIT ?'
  );
}

function resetAbandoned() {
  return (
    'UPDATE "emailSendRequests" SET "status" = ?, "updatedAt" = NOW() ' +
    'WHERE "status" = ? AND "updatedAt" < NOW() - (? * INTERVAL \'1 minute\')'
  );
}

module.exports = {
  claim,
  finish,
  getPending,
  insert,
  lockClaim,
  resetAbandoned,
};
