# EcoBin — Smart Waste Collection Dashboard

An operations console for IoT smart bins. Every number on screen comes from your own
ThingSpeak channels: there is no seeded demo data and no simulator.

![stack](https://img.shields.io/badge/React-19-149eca) ![stack](https://img.shields.io/badge/Vite-8-646cff) ![stack](https://img.shields.io/badge/Tailwind-4-38bdf8)

---

## How the data flows

```
ESP32 / device  →  ThingSpeak channel  →  read API  →  dashboard
   sensors           field1..field8        polling      live views
```

1. Your device writes its readings to a ThingSpeak channel (`field1`, `field2`, …).
2. The dashboard polls `api.thingspeak.com/channels/<id>/feeds.json` for every
   connected channel, in parallel.
3. `src/lib/telemetry.js` maps each entry onto a bin: fill level, weight, battery,
   position, and so on. A measurement your device does not send stays `null` and
   renders as `—` rather than being invented.
4. Statuses, alerts, collection events and analytics are all derived from that
   history. Nothing is hardcoded.

**One channel = one bin.** Add as many as you have devices.

---

## Getting started

```bash
npm install
npm run dev
```

Open the app, go to **Settings**, and paste in your ThingSpeak **Channel ID**
(plus a **Read API key** if the channel is private). The dashboard tests the
connection before saving it.

Prefer configuration in the repo? Copy `.env.example` to `.env` and fill it in —
anything you set in the Settings page overrides the `.env` values, and both survive
a reload.

```bash
cp .env.example .env
```

### Field mapping

By default the app expects:

| Measurement | Field | Notes |
|---|---|---|
| Fill level (%) | `field1` | Clamped to 0–100 |
| Weight (kg) | `field2` | |
| Battery (%) | `field3` | Below 20% raises an alert |
| Latitude | `field4` | Falls back to the channel's own metadata |
| Longitude | `field5` | |
| Temperature (°C) | `field6` | Optional |
| Humidity (%) | `field7` | Optional |
| Lid state | `field8` | Optional |
| Waste category | *unmapped* | `0` Dry · `1` Wet · `2` Mixed · `3` Hazardous |

Change any of these on the Settings page — set a measurement to **Not sent** if your
device does not publish it. If your device sends no coordinates at all, you can type
each bin's position in Settings instead.

### What the app derives for you

| Shown as | Derived from |
|---|---|
| Bin status (Normal / Filling / Full) | Latest fill level against your thresholds |
| Offline | No entry for 30 minutes |
| Collections | A sharp drop in fill level between two readings (threshold configurable) |
| Alerts | Threshold crossings, collections, silence, low battery |
| Collection trend & distribution | The last 7 days of feed history |
| Avg response time | Time from "full detected" to the matching collection |
| Avg fill at collection | How full bins actually were when they were emptied |

Trucks and citizen reports are records you own rather than sensor data, so they live
in this browser's `localStorage`. Add your fleet on the **Trucks** page; reports come
in through the citizen app panel (the phone icon in the header).

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | Oxlint |

---

## Project layout

```
src/
  config/settings.js       runtime + .env configuration, persisted to localStorage
  services/thingspeak.js   read-API client, per-channel error isolation
  hooks/useThingSpeak.js   polling with backoff, tab-visibility pause, abort
  hooks/useLocalState.js   localStorage-backed state
  lib/telemetry.js         feed → bin mapping, status, collections, analytics
  context/EcoBinContext.jsx  single store: live data + operator actions
  components/
    layout/                sidebar, top bar
    dashboard/             stat cards, map, alerts, bin details, trucks, analytics
    pages/                 one file per sidebar destination
    citizen/               citizen reporting app
    ui/Primitives.jsx      cards, buttons, gauges, empty states
```

## Polling and the free tier

ThingSpeak's free tier accepts a write every 15 seconds, so polling faster than that
gains nothing. The client already:

- pauses while the browser tab is hidden and catches up on focus,
- aborts a request still in flight before starting the next one,
- backs off up to 4× the interval after repeated failures,
- isolates failures per channel, so one bad channel does not blank the dashboard.
