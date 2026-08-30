# EcoBin server

Headless dispatch. Runs the ranking, partitioning and routing with **no browser
open**, which is the one thing the dashboard alone cannot do — with nobody
watching, a bin that fills at four in the morning waits until someone opens a tab.

It shares state with the dashboard through Firestore, in the same document
format, so both can run at once and agree.

## Why there is no duplicated logic

Every algorithm is imported from the dashboard's own source, unchanged:

```
src/lib/telemetry.js     ranking, fill rate, collection detection, weight hold
src/lib/emissions.js     fuel and CO2
src/services/routing.js  driving-time matrix, 2-opt, road geometry
src/services/fleet.js    sweep partitioning, run planning
src/services/thingspeak.js  telemetry client
```

Those modules are pure — no React, no DOM, no browser storage — so the server
and the browser cannot drift apart. Fix a scoring rule once and both change.

## Running it

```sh
cd server
cp .env.example .env      # fill in channels and FIREBASE_PROJECT_ID
npm install
npm start                 # or: npm run dev   (restarts on change)
```

Node 18 or newer (it uses the built-in `fetch`).

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/health` | Liveness and current configuration |
| `GET`  | `/api/bins` | Every bin, ranked, with scores and reasons |
| `GET`  | `/api/emissions?km=14.83` | Fuel and CO2 for a distance |
| `POST` | `/api/dispatch` | **Send a truck to one bin** |
| `POST` | `/api/plan` | Split everything due across the free trucks and route each |
| `POST` | `/api/tick` | Run one engine pass now instead of waiting |

### The endpoint n8n calls

```
POST http://your-host:8787/api/dispatch
Content-Type: application/json

{ "channelId": "2345678", "action": "DISPATCH" }
```

Verified response:

```json
{ "ok": true, "bin": "my_house", "channelId": "9",
  "truckId": "TR-01", "driver": "Arjun", "at": "2026-08-30T05:54:14.716Z" }
```

Sending the same bin again while its truck is still out returns
`{"ok": true, "reason": "already-assigned"}` and does **not** send a second
truck — so the n8n workflow can stay stateless and report every full bin on
every poll.

`action` may be `DISPATCH`, `ASSIGN`, `COLLECT` or `FULL`. Anything else is
acknowledged and ignored, so a workflow that emits other events does no harm.

## The heartbeat

Every `TICK_SECONDS` the engine wakes on its own and:

1. Acts on any dispatch command n8n has written into Firestore.
2. If `AUTO_DISPATCH=true`, sends trucks to bins scoring at or above
   `AUTO_DISPATCH_MIN_SCORE` **that also actually need collecting** — a silent
   bin on a flat battery scores high and gets an alert, never a truck.

## Security

`API_TOKEN` protects the write endpoints. Send it as `x-api-token`, or
`?token=` for tools that cannot set headers. Reads stay open; they expose
nothing an operator would mind.

Leaving it blank disables the check, which is fine locally and **not** fine on
a public host.

Firestore access currently uses the REST API against the project's open rules.
When those rules are tightened, `src/firestore.js` is the one file that needs a
service-account token — nothing else changes.

## Deploying

Any Node host: Render, Railway, Fly, a VPS. Set the environment variables from
`.env.example`, run `npm start`, point n8n at `/api/dispatch`.

The service is stateless — all state lives in Firestore — so it can be
restarted or scaled without losing anything.
