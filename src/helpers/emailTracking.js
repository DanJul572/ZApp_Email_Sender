const crypto = require('crypto');

// Paths of the public tracking routes, relative to the API's "/api" address.
const paths = {
  open: '/email/track/open',
  click: '/email/track/click',
  unsubscribe: '/email/track/unsubscribe',
};

// href of an <a> tag: the part before the value, the quote and the value.
const LINK_PATTERN = /(<a\b[^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gis;
const HTML_ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };

function sign(secretKey, value) {
  if (!secretKey) throw new Error('ENCRYPTION_KEY is not set, so tracked links cannot be signed.');
  return crypto.createHmac('sha256', secretKey).update(value).digest('base64url');
}

function isValidSignature(secretKey, value, signature) {
  const expected = Buffer.from(sign(secretKey, value));
  const actual = Buffer.from(String(signature ?? ''));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const clickValue = (trackingId, url) => `${trackingId}|${url}`;

function decodeHtml(value) {
  return value.replace(/&(amp|quot|#39|lt|gt);/g, entity => HTML_ENTITIES[entity]);
}

function encodeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function getOpenUrl(baseUrl, trackingId) {
  return `${baseUrl}${paths.open}/${trackingId}`;
}

function getClickUrl(baseUrl, secretKey, trackingId, url) {
  const query = new URLSearchParams({ url, sig: sign(secretKey, clickValue(trackingId, url)) });
  return `${baseUrl}${paths.click}/${trackingId}?${query}`;
}

function getUnsubscribeUrl(baseUrl, trackingId) {
  return `${baseUrl}${paths.unsubscribe}/${trackingId}`;
}

function isValidClick(secretKey, trackingId, url, signature) {
  return isValidSignature(secretKey, clickValue(trackingId, url), signature);
}

// The email builder exports a whole HTML document; content goes at the end of its <body>.
function appendToBody(html, content) {
  const index = html.toLowerCase().lastIndexOf('</body');
  if (index === -1) return `${html}${content}`;
  return `${html.slice(0, index)}${content}${html.slice(index)}`;
}

/** Points every http(s) link of the body to the click endpoint. */
function trackLinks(html, toClickUrl) {
  return html.replace(LINK_PATTERN, (match, start, quote, href) => {
    const url = decodeHtml(href.trim());
    if (!/^https?:\/\//i.test(url)) return match;
    return `${start}${quote}${encodeAttribute(toClickUrl(url))}${quote}`;
  });
}

function addOpenPixel(html, openUrl) {
  return appendToBody(
    html,
    `<img src="${encodeAttribute(openUrl)}" width="1" height="1" alt="" border="0" ` +
      'style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;" />',
  );
}

/** The body without its tracking pixel, so showing it in the email log is not an open. */
function removeOpenPixel(html) {
  if (!html) return html;
  return html.replace(new RegExp(`<img\\b[^>]*${paths.open}/[^>]*>`, 'gi'), '');
}

function addUnsubscribeFooter(html, unsubscribeUrl) {
  return appendToBody(
    html,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
      '<tr><td align="center" style="padding:16px;font-family:Arial,Helvetica,sans-serif;' +
      'font-size:12px;line-height:18px;color:#8a8a8a;">' +
      "Don't want to receive this email anymore? " +
      `<a href="${encodeAttribute(unsubscribeUrl)}" style="color:#8a8a8a;text-decoration:underline;">` +
      'Unsubscribe</a></td></tr></table>',
  );
}

/**
 * Adds what the template settings ask for to a rendered body. Links are tracked first, so the
 * unsubscribe link and the pixel are never rewritten.
 *
 * Returns the new body and the extra mail headers (null when there are none).
 */
function apply(body, settings, { baseUrl, secretKey, trackingId }) {
  let html = body || '';
  let headers = null;

  if (settings.clickTracking) {
    html = trackLinks(html, url => getClickUrl(baseUrl, secretKey, trackingId, url));
  }
  if (settings.unsubscribeLink) {
    const unsubscribeUrl = getUnsubscribeUrl(baseUrl, trackingId);
    html = addUnsubscribeFooter(html, unsubscribeUrl);
    // RFC 8058 one-click unsubscribe: the mail client POSTs to the URL.
    headers = {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }
  if (settings.openTracking) {
    html = addOpenPixel(html, getOpenUrl(baseUrl, trackingId));
  }

  return { body: html, headers };
}

module.exports = {
  apply,
  getClickUrl,
  getOpenUrl,
  getUnsubscribeUrl,
  isValidClick,
  removeOpenPixel,
  trackLinks,
};
