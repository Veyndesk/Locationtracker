// IP-based geolocation from Vercel's edge headers.
// Vercel injects x-vercel-ip-* on every request (MaxMind-style IP database).
// This is the same mechanism oticon.global uses for /api/getGeolocation.
// Accuracy: city / ISP level (~1-50 km). No user permission required.

const dec = (v) => {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

module.exports = (req, res) => {
  const h = req.headers;

  const country = dec(h['x-vercel-ip-country']);
  const latitude = num(h['x-vercel-ip-latitude']);
  const longitude = num(h['x-vercel-ip-longitude']);

  // First entry of x-forwarded-for is the real client; the rest are proxies.
  const forwarded = (h['x-forwarded-for'] || '').split(',')[0].trim();

  const payload = {
    available: latitude !== null && longitude !== null,
    ip: forwarded || h['x-real-ip'] || null,
    city: dec(h['x-vercel-ip-city']),
    country,
    countryRegion: dec(h['x-vercel-ip-country-region']),
    continent: dec(h['x-vercel-ip-continent']),
    postalCode: dec(h['x-vercel-ip-postal-code']),
    timezone: dec(h['x-vercel-ip-timezone']),
    asn: dec(h['x-vercel-ip-as-number']),
    latitude,
    longitude,
    // Vercel edge region that served this request (e.g. sin1 = Singapore).
    edgeRegion: process.env.VERCEL_REGION || null,
    flag: country ? countryFlag(country) : null,
  };

  if (!payload.available) {
    payload.note =
      'No x-vercel-ip-* headers on this request. Expected when running locally ' +
      '(`vercel dev`) — deploy to Vercel to see real values.';
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).send(JSON.stringify(payload, null, 2));
};

// ISO 3166-1 alpha-2 -> regional indicator pair
function countryFlag(code) {
  if (!/^[A-Za-z]{2}$/.test(code)) return null;
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split('')
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}
