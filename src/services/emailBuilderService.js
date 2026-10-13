const dayjs = require('dayjs');

const db = require('../models');
const enums = require('../enums');
const emailQuery = require('../queries/emailQuery');
const emailTrackingService = require('./emailTrackingService');

// {{tag}} in the subject, body and recipients.
const TAG_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;
// @column@ in an optional source query, replaced with the value of the current primary row.
const PLACEHOLDER_PATTERN = /@(\w+)@/g;
const ADDRESS_SEPARATOR = /[;,]/;
const OPTIONAL_VALUE_SEPARATOR = ';';

const isEmailAddress = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Problems with the template. The message is shown in the email log.
const templateError = message => new Error(message);

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// "source_name.column_name" → { source, column }. Without a dot the column is read from the
// primary source.
function parseColumn(value) {
  const separatorIndex = value.indexOf('.');
  if (separatorIndex === -1) return { source: null, column: value };

  return {
    source: value.slice(0, separatorIndex),
    column: value.slice(separatorIndex + 1),
  };
}

async function runSource(run, source, sql) {
  try {
    return await run(sql);
  } catch (error) {
    throw templateError(`Data source "${source.name}" failed: ${error.message}`);
  }
}

/**
 * Runs the data sources of a template.
 *
 * - The primary source gives one row per email. Without a primary source there is one email.
 * - Every primary row gets all rows of each optional source. An optional query may use
 *   @column@ to filter by the current primary row; it then runs once per primary row,
 *   otherwise it runs once and its rows are shared.
 */
async function runSources(email, primaryLimit) {
  const primary = email.primarySource?.sql?.trim() ? email.primarySource : null;

  return await emailQuery.runReadOnly(async run => {
    let primaryRows = primary ? await runSource(run, primary, primary.sql) : [{}];
    if (primaryLimit) primaryRows = primaryRows.slice(0, primaryLimit);

    const optionalSources = [];
    for (const source of email.optionalSources) {
      const usesPrimaryRow = PLACEHOLDER_PATTERN.test(source.sql);
      PLACEHOLDER_PATTERN.lastIndex = 0;

      if (!usesPrimaryRow) {
        const rows = await runSource(run, source, source.sql);
        optionalSources.push({ name: source.name, rowsPerPrimary: primaryRows.map(() => rows) });
        continue;
      }

      // Primary rows with the same values produce the same query; it runs only once.
      const cache = new Map();
      const rowsPerPrimary = [];
      for (const primaryRow of primaryRows) {
        const sql = source.sql.replace(PLACEHOLDER_PATTERN, (match, column) =>
          column in primaryRow ? db.sequelize.escape(primaryRow[column]) : match,
        );
        if (!cache.has(sql)) cache.set(sql, await runSource(run, source, sql));
        rowsPerPrimary.push(cache.get(sql));
      }
      optionalSources.push({ name: source.name, rowsPerPrimary });
    }

    return { primary, primaryRows, optionalSources };
  });
}

// Checks every merge tag against the sources, so a typo fails the send with a clear message
// instead of mailing a literal {{tag}}.
function resolveTags(mergeTags, primary, primaryRows, optionalSources) {
  return mergeTags.map(mergeTag => {
    const { source, column } = parseColumn(mergeTag.column);
    const fromPrimary = !source || (primary && source === primary.name);
    const optionalSource = optionalSources.find(item => item.name === source);

    if (fromPrimary && !primary) {
      throw templateError(
        `Merge tag {{${mergeTag.tag}}} has no source. Write its column as source_name.column_name.`,
      );
    }
    if (!fromPrimary && !optionalSource) {
      throw templateError(`Merge tag {{${mergeTag.tag}}} uses unknown source "${source}".`);
    }

    const sampleRow = fromPrimary
      ? primaryRows[0]
      : optionalSource.rowsPerPrimary.flat().find(Boolean);
    if (sampleRow && !(column in sampleRow)) {
      throw templateError(
        `Merge tag {{${mergeTag.tag}}}: column "${column}" is not in the result of source ` +
          `"${fromPrimary ? primary.name : source}".`,
      );
    }

    return {
      tag: mergeTag.tag,
      column,
      defaultValue: mergeTag.defaultValue || '',
      optionalSource: fromPrimary ? null : optionalSource,
    };
  });
}

function getValues(tags, primaryRow, primaryIndex) {
  const values = {};

  tags.forEach(tag => {
    let value;
    if (tag.optionalSource) {
      value = tag.optionalSource.rowsPerPrimary[primaryIndex]
        .map(row => toText(row[tag.column]))
        .filter(text => text !== '')
        .join(OPTIONAL_VALUE_SEPARATOR);
    } else {
      value = toText(primaryRow[tag.column]);
    }
    values[tag.tag] = value !== '' ? value : tag.defaultValue;
  });

  return values;
}

function render(template, values, escape) {
  return (template || '').replace(TAG_PATTERN, (match, tag) => {
    if (!(tag in values)) return match;
    return escape ? escapeHtml(values[tag]) : values[tag];
  });
}

function toAddresses(templates, values) {
  const addresses = templates
    .flatMap(template => render(template, values, false).split(ADDRESS_SEPARATOR))
    .map(address => address.trim())
    .filter(Boolean);

  return [...new Set(addresses)];
}

function getErrorMessage(to, cc, bcc, unsubscribed) {
  if (!to.length && unsubscribed.length) {
    return `Not sent: ${unsubscribed.join(', ')} unsubscribed from this email.`;
  }
  if (!to.length) return 'No recipient: "Email To" is empty for this record.';

  const invalid = [...to, ...cc, ...bcc].filter(address => !isEmailAddress(address));
  if (invalid.length) return `Invalid email address: ${invalid.join(', ')}`;

  return null;
}

/**
 * Turns a template into ready-to-send emails: one per primary source row, with every merge tag
 * replaced and the recipients resolved. Rows whose recipients are missing or invalid are
 * returned as failed, so they show up in the email log.
 *
 * Addresses that unsubscribed from the template are left out. The body gets the tracking pixel,
 * tracked links and unsubscribe link the template settings ask for.
 *
 * A test send uses only the first primary row and goes to `testRecipient` alone, even when that
 * address unsubscribed.
 */
async function buildExecutions(email, { trigger, testRecipient } = {}) {
  const isTest = trigger === enums.emailExecutionTrigger.test;
  const track = emailTrackingService.createTracker(email.settings);
  const unsubscribed = isTest
    ? new Set()
    : await emailTrackingService.getUnsubscribedAddresses(email.id);
  const { primary, primaryRows, optionalSources } = await runSources(email, isTest ? 1 : null);
  const tags = resolveTags(email.mergeTags, primary, primaryRows, optionalSources);

  const isSubscribed = address => !unsubscribed.has(address.toLowerCase());

  return primaryRows.map((primaryRow, index) => {
    const values = getValues(tags, primaryRow, index);

    const allTo = isTest ? [testRecipient] : toAddresses([email.to], values);
    const to = allTo.filter(isSubscribed);
    const cc = isTest ? [] : toAddresses(email.cc, values).filter(isSubscribed);
    const bcc = isTest ? [] : toAddresses(email.bcc, values).filter(isSubscribed);
    const subject = render(email.subject, values, false);
    const errorMessage = getErrorMessage(
      to,
      cc,
      bcc,
      allTo.filter(address => !isSubscribed(address)),
    );
    const { trackingId, body, headers } = track(render(email.body, values, true));

    return {
      emailId: email.id,
      emailName: email.name,
      trigger,
      to: to.join(', ') || null,
      cc: cc.join(', ') || null,
      bcc: bcc.join(', ') || null,
      subject: isTest ? `[TEST] ${subject}` : subject,
      body,
      priority: email.settings.priority,
      trackingId,
      headers,
      status: errorMessage ? enums.emailExecutionStatus.failed : enums.emailExecutionStatus.onQueue,
      errorMessage,
    };
  });
}

module.exports = {
  buildExecutions,
};
