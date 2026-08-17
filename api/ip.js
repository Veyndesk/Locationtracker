// Look up any IP address against public geolocation databases.
//
// This is a different mechanism from /api/geo. That one reads Vercel's
// x-vercel-ip-* headers, which describe the client that made the request and
// cannot be pointed at an arbitrary address. To look up someone else's IP you
// have to query a geolocation database.
//
// Accuracy ceiling: these databases map IP ranges to the location an ISP
// registered for them. Expect city-level at best (5-50 km), far worse on
// mobile carrier ranges, and the exit node's location for a VPN or proxy.
// No IP lookup returns a street address.

const IPV4 =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^(?=.*:)[0-9a-fA-F:]{2,45}$/;

// Ranges no public database can resolve — they are not routable on the
// internet, so a lookup would either fail or return junk.
function reservedReason(ip) {
  if (!IPV4.test(ip)) {
    const low = ip.toLowerCase();
    if (low === '::1') return 'loopback';
    if (low.startsWith('fe80')) return 'link-local';
    if (/^f[cd]/.test(low)) return 'unique local (private)';
    return null;
  }
  const [a, b] = ip.split('.').map(Number);
  if (a === 0) return 'this network';
  if (a === 10) return 'private (RFC 1918)';
  if (a === 127) return 'loopback';
  if (a === 172 && b >= 16 && b <= 31) return 'private (RFC 1918)';
  if (a === 192 && b === 168) return 'private (RFC 1918)';
  if (a === 169 && b === 254) return 'link-local';
  if (a === 100 && b >= 64 && b <= 127) return 'carrier-grade NAT';
  if (a >= 224) return 'multicast / reserved';
  return null;
}

const fetchJson = async (url) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'locationtracker' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
};

// Both providers are keyless and HTTPS. Shapes differ, so each normalises
// into the same object.
const PROVIDERS = [
  {
    name: 'ipwho.is',
    url: (ip) => 'https://ipwho.is/' + encodeURIComponent(ip),
    parse: (d) => {
      if (d.success === false) throw new Error(d.message || 'lookup failed');
      return {
        city: d.city || null,
        region: d.region || null,
        country: d.country || null,
        countryCode: d.country_code || null,
        flag: d.flag?.emoji || null,
        latitude: d.latitude ?? null,
        longitude: d.longitude ?? null,
        postalCode: d.postal || null,
        timezone: d.timezone?.id || null,
        asn: d.connection?.asn ? String(d.connection.asn) : null,
        isp: d.connection?.isp || d.connection?.org || null,
      };
    },
  },
  {
    name: 'ipapi.co',
    url: (ip) => 'https://ipapi.co/' + encodeURIComponent(ip) + '/json/',
    parse: (d) => {
      if (d.error) throw new Error(d.reason || 'lookup failed');
      return {
        city: d.city || null,
        region: d.region || null,
        country: d.country_name || null,
        countryCode: d.country_code || null,
        flag: null,
        latitude: d.latitude ?? null,
        longitude: d.longitude ?? null,
        postalCode: d.postal || null,
        timezone: d.timezone || null,
        asn: d.asn ? String(d.asn).replace(/^AS/i, '') : null,
        isp: d.org || null,
      };
    },
  },
];

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const send = (code, body) => res.status(code).send(JSON.stringify(body, null, 2));

  const url = new URL(req.url, 'http://localhost');
  // No ?ip= means "look up whoever is asking".
  const raw = (url.searchParams.get('ip') || '')
    .trim()
    .replace(/^\[|\]$/g, ''); // strip brackets from [::1] style input
  const self = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = raw || self;

  if (!ip) {
    return send(400, { error: 'No IP given and none could be read from the request.' });
  }
  // Strict validation before the value reaches a provider URL.
  if (!IPV4.test(ip) && !IPV6.test(ip)) {
    return send(400, { error: 'Not a valid IPv4 or IPv6 address: ' + ip.slice(0, 60) });
  }

  const reserved = reservedReason(ip);
  if (reserved) {
    return send(422, {
      ip,
      error: 'This address is ' + reserved + ' — it is not routable on the public internet, so no database can place it.',
    });
  }

  const failures = [];
  for (const p of PROVIDERS) {
    try {
      const result = p.parse(await fetchJson(p.url(ip)));
      if (result.latitude === null || result.longitude === null) {
        throw new Error('no coordinates in response');
      }
      return send(200, {
        ip,
        isSelf: ip === self,
        provider: p.name,
        ...result,
        accuracyNote:
          'IP geolocation resolves to the range an ISP registered, not a device. ' +
          'Typical error is 5-50 km, and much worse on mobile carrier or VPN ranges.',
        failures,
      });
    } catch (e) {
      failures.push({ provider: p.name, error: String(e.message || e) });
    }
  }

  return send(502, { ip, error: 'Every provider failed.', failures });
};
