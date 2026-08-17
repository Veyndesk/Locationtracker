# Location Tracker

Zero-dependency location tool, deploys to Vercel with no build step.
Two independent methods, same as the pattern oticon.global uses:

| | Method | Permission | Typical accuracy |
|---|---|---|---|
| **Precise** | `navigator.geolocation.watchPosition` (GPS/GNSS + WiFi) | Required | ± 5–20 m outdoors, ± 20–100 m indoors |
| **Approximate** | Vercel `x-vercel-ip-*` edge headers (IP database) | None | ± 1–50 km, city level |

## Why `watchPosition` and not `getCurrentPosition`

The first fix a device returns is almost always the coarse one — cached, or
derived from nearby WiFi BSSIDs (± 500–2000 m). The GPS chip needs a few
seconds of sky time before it reports a real lock. A single
`getCurrentPosition()` call usually hands you that first coarse fix and stops.

So this tool watches instead, keeps the reading with the lowest
`coords.accuracy`, and stops early once it hits the target (default ± 15 m) or
the time limit (default 20 s), whichever comes first. The convergence panel
shows every fix as it arrives so you can see it tighten.

Other settings that matter:

- `enableHighAccuracy: true` — asks for GPS rather than the cheap network fix.
- `maximumAge: 0` — refuses a cached position outright.
- Errors with `code === 1` (permission denied) are terminal; codes 2 and 3 are
  not, since a device can fail a fix and then succeed seconds later.

## Requirements

Geolocation only works in a **secure context** — HTTPS, or `localhost`.
Vercel gives you HTTPS automatically.

## Run locally

```bash
node dev-server.js
```

Then open http://localhost:3000. The IP card reports "unavailable" locally,
because `x-vercel-ip-*` headers are injected by Vercel's edge, not by your
machine. Everything else works.

To exercise the IP path locally, fake the headers:

```bash
curl -s http://localhost:3000/api/geo -H "x-vercel-ip-city: Dehiwala" -H "x-vercel-ip-country: LK" -H "x-vercel-ip-latitude: 6.8505" -H "x-vercel-ip-longitude: 79.8603"
```

## Deploy

```bash
npx vercel --prod
```

No framework, no `npm install` — Vercel picks up `public/` as static files and
`api/geo.js` as a serverless function by convention.

## Files

- `public/index.html` — the whole UI and tracking logic, single file
- `api/geo.js` — reads Vercel's IP-geolocation headers, returns JSON
- `dev-server.js` — local static server + `/api/geo` route, no CLI needed
- `vercel.json` — `no-store` on the API, `geolocation=(self)` permissions policy

## Extending

`bestFix` in `public/index.html` is the finished JSON object. To persist fixes,
POST it to a new `api/report.js` and write to your store of choice — but do
that on an explicit user action, and tell people what you keep. Silent
background collection of precise location is a legal problem in most
jurisdictions (GDPR treats it as personal data; iOS Safari and Android Chrome
both surface a persistent indicator anyway).
