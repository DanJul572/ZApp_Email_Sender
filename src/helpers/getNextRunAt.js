const dayjs = require('dayjs');

// Scheduler type (the keys of enums.emailSchedulerType) → dayjs unit.
const UNITS = {
  days: 'day',
  month: 'month',
  year: 'year',
};

/**
 * Returns the first occurrence of a schedule that is later than `after`. Occurrences are always
 * counted from the start time (start + n units), so a monthly schedule that starts on the 31st
 * keeps returning to the 31st instead of drifting after a short month.
 */
function getNextRunAt(startTime, type, after = new Date()) {
  const unit = UNITS[type];
  const start = dayjs(startTime);
  const reference = dayjs(after);

  if (!unit || !start.isValid()) return null;
  if (start.isAfter(reference)) return start.toDate();

  let count = Math.max(0, reference.diff(start, unit));
  let next = start.add(count, unit);
  while (!next.isAfter(reference)) {
    count += 1;
    next = start.add(count, unit);
  }

  return next.toDate();
}

module.exports = getNextRunAt;
