const emailTracking = require('../../helpers/emailTracking');

describe('emailTracking', () => {
  const options = {
    baseUrl: 'https://zapp.example.com/api',
    secretKey: 'test-secret',
    trackingId: '6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7',
  };
  const none = { openTracking: false, clickTracking: false, unsubscribeLink: false };
  const html = content => `<html><body><p>Hi</p>${content}</body></html>`;

  const getClickParams = body => {
    const [, href] = body.match(/href="([^"]+)"/);
    const url = new URL(href.replace(/&amp;/g, '&'));
    return { url, params: url.searchParams };
  };

  it('should leave the body unchanged when every setting is off', () => {
    const body = html('<a href="https://example.com">Link</a>');

    expect(emailTracking.apply(body, none, options)).toEqual({ body, headers: null });
  });

  it('should add the open pixel before </body>', () => {
    const { body } = emailTracking.apply(html(''), { ...none, openTracking: true }, options);

    expect(body).toContain(
      `<img src="https://zapp.example.com/api/email/track/open/${options.trackingId}"`,
    );
    expect(body.indexOf('<img')).toBeLessThan(body.indexOf('</body>'));
  });

  it('should append to a body without a <body> tag', () => {
    const { body } = emailTracking.apply('<p>Hi</p>', { ...none, openTracking: true }, options);

    expect(body.startsWith('<p>Hi</p><img ')).toBe(true);
  });

  it('should sign tracked links so only they are accepted', () => {
    const original = 'https://example.com/page?a=1&b=2';
    const { body } = emailTracking.apply(
      html('<a href="https://example.com/page?a=1&amp;b=2" class="btn">Go</a>'),
      { ...none, clickTracking: true },
      options,
    );
    const { url, params } = getClickParams(body);

    expect(url.pathname).toBe(`/api/email/track/click/${options.trackingId}`);
    expect(params.get('url')).toBe(original);
    expect(body).toContain('class="btn"');
    expect(
      emailTracking.isValidClick(
        options.secretKey,
        options.trackingId,
        original,
        params.get('sig'),
      ),
    ).toBe(true);
    expect(
      emailTracking.isValidClick(
        options.secretKey,
        options.trackingId,
        'https://evil.example.com',
        params.get('sig'),
      ),
    ).toBe(false);
    expect(
      emailTracking.isValidClick(options.secretKey, options.trackingId, original, undefined),
    ).toBe(false);
  });

  it('should only track http(s) links', () => {
    const links =
      '<a href="mailto:a@b.com">Mail</a><a href="tel:123">Call</a><a href="#top">Top</a>';

    expect(emailTracking.trackLinks(links, () => 'tracked')).toBe(links);
  });

  it('should add the unsubscribe footer and one-click headers, without tracking that link', () => {
    const { body, headers } = emailTracking.apply(
      html(''),
      { openTracking: true, clickTracking: true, unsubscribeLink: true },
      options,
    );
    const unsubscribeUrl = `https://zapp.example.com/api/email/track/unsubscribe/${options.trackingId}`;

    expect(body).toContain(`href="${unsubscribeUrl}"`);
    expect(body).not.toContain('/email/track/click/');
    expect(headers).toEqual({
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('should remove the open pixel for the email log preview', () => {
    const { body } = emailTracking.apply(html(''), { ...none, openTracking: true }, options);

    expect(emailTracking.removeOpenPixel(body)).toBe(html(''));
  });
});
