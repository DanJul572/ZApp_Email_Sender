function getById() {
  return 'SELECT * FROM "emails" WHERE "id" = ?';
}

function getByEmailId(table) {
  return `SELECT * FROM "${table}" WHERE "emailId" = ? ORDER BY "id"`;
}

// Locks the due schedules, so two instances of this app never send the same occurrence.
function getDueSchedulers() {
  return (
    'SELECT s."id", s."emailId", s."emailSchedulerTypeId", s."startTime", s."endTime", ' +
    's."nextRunAt" ' +
    'FROM "emailSchedulers" s JOIN "emails" e ON e."id" = s."emailId" ' +
    'WHERE e."useScheduler" = true AND s."nextRunAt" IS NOT NULL ' +
    'AND s."nextRunAt" <= NOW() AND s."nextRunAt" <= s."endTime" ' +
    'ORDER BY s."nextRunAt" FOR UPDATE OF s SKIP LOCKED'
  );
}

function updateNextRunAt() {
  return 'UPDATE "emailSchedulers" SET "nextRunAt" = ?, "updatedAt" = NOW() WHERE "id" = ?';
}

module.exports = {
  getByEmailId,
  getById,
  getDueSchedulers,
  updateNextRunAt,
};
