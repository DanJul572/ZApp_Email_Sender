const { randomUUID } = require('crypto');

const config = require('../config');
const emailTracking = require('../helpers/emailTracking');
const emailTrackingQuery = require('../queries/emailTrackingQuery');

const usesTracking = settings =>
  !!(settings.openTracking || settings.clickTracking || settings.unsubscribeLink);

/**
 * Returns a function that gives one rendered body its tracking id, and adds the tracking
 * pixel, tracked links and unsubscribe link the template settings ask for.
 *
 * Fails up front when the settings need EMAIL_PUBLIC_URL and it is not set, instead of sending
 * emails whose links do not work.
 */
function createTracker(settings) {
  const { publicUrl, secretKey } = config.emailTracking;
  const enabled = usesTracking(settings);

  if (enabled && !publicUrl) {
    throw new Error(
      'Tracking or the unsubscribe link is turned on, but EMAIL_PUBLIC_URL is not set on the ' +
        'email sender app, so their links would not work.',
    );
  }

  return body => {
    const trackingId = randomUUID();
    if (!enabled) return { trackingId, body, headers: null };

    const result = emailTracking.apply(body, settings, {
      baseUrl: publicUrl,
      secretKey,
      trackingId,
    });
    return {
      trackingId,
      body: result.body,
      headers: result.headers ? JSON.stringify(result.headers) : null,
    };
  };
}

/** Lower-case addresses that unsubscribed from a template. */
async function getUnsubscribedAddresses(emailId) {
  return await emailTrackingQuery.getUnsubscribedAddresses(emailId);
}

module.exports = {
  createTracker,
  getUnsubscribedAddresses,
};
