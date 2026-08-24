# EcoBin — Smart Waste Monitoring Dashboard

EcoBin turns ESP32 bin telemetry published to a **ThingSpeak** channel into a live
municipal collection dashboard: a bin map, fill analytics, alerts, truck
assignment and a priority-ranked collection queue.

```
┌──────────────────────────┐
│         WOKWI            │
│    ESP32 Simulation      │
│                          │
│   Ultrasonic Sensor      │
│   Load Cell              │
│   LED / Buzzer           │
└────────────┬─────────────┘
             │  Wi-Fi · HTTP
             ▼
┌──────────────────────────┐
│        THINGSPEAK        │
│                          │
│   Field 1: Fill Level    │
│   Field 2: Weight        │
│   Field 3: Status        │
│   Field 4: Bin ID        │
│   Field 5: Priority      │
└────────────┬─────────────┘
             │  REST API
             ▼
┌──────────────────────────┐
│    ECOBIN DASHBOARD      │
│                          │
│   Live Bin Map           │
│   Fill Analytics         │
│   Alerts                 │
│   Truck Assignment       │
│   Priority Bins          │
└──────────────────────────┘
```

## No sample data

Every bin figure in EcoBin comes from the connected ThingSpeak channel. There is
no seeded data set and no simulated fallback — if the channel is unreachable the
dashboard says so rather than filling the gap. Until you connect a channel, the
bin pages show a setup card instead of numbers.

Three things are municipal records rather than telemetry, so you enter them and
EcoBin keeps them in the browser's local storage:

| Record        | Where you add it             | Why it is not from ThingSpeak            |
| ------------- | ---------------------------- | ---------------------------------------- |
| Bin locations | Settings → Bin registry      | The device publishes no GPS              |
| Truck fleet   | Trucks → Add truck           | Vehicles are not sensors                 |
| Collections   | Worker app / bin detail page | Logged by a person completing the pickup |

## Quick start

```sh
npm install
npm run dev          # http://localhost:3000
```

Then open **/admin/settings**, paste your ThingSpeak **Channel ID** (plus a read
API key if the channel is private) and press **Test connection**. Every page
fills in from that point on.

To bake the channel into a build instead, create `.env`:

```sh
VITE_THINGSPEAK_CHANNEL_ID=2345678
VITE_THINGSPEAK_READ_API_KEY=            # optional, public channels need none
```

Settings entered in the UI take precedence over these defaults.

## Field mapping

Channels rarely publish in the same order, so EcoBin maps by the **field labels
you set in ThingSpeak**, not by position. On the first read of a channel it
detects the map automatically; Settings also has a **Detect from channel**
button, and every field can be overridden by hand.

A field whose label EcoBin does not recognise is left unmapped and ignored —
safer than reading it as something it is not. Settings lists what was skipped.

Recognised labels:

| Mapping    | Matched on labels containing                         |
| ---------- | ---------------------------------------------------- |
| Fill level | fill, level, percent, ultrasonic, distance, capacity |
| Weight     | weight, load, mass, kg, gram                         |
| Bin ID     | bin id / bin no, device id, node id, id              |
| Priority   | priority, urgency, score, rank                       |
| Battery    | battery, volt, charge, power                         |
| Status     | status, state, condition                             |

## Publishing from the device

Only the fill level is required. The table below uses the diagram's field order;
your own order does not matter as long as the labels are descriptive.

| Field  | Meaning    | Accepted values                                                                                                        |
| ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| field1 | Fill level | `0`–`100` (clamped). Rows without a number here are skipped.                                                           |
| field2 | Weight     | Kilograms.                                                                                                             |
| field3 | Status     | `0` normal, `1` filling, `2` high, `3` critical, `4` offline — or the words. Blank derives status from the thresholds. |
| field4 | Bin ID     | `7`, `BIN-7`, `bin 7` all resolve to `BIN-7`. Blank groups every entry into one bin.                                   |
| field5 | Priority   | `0`–`100`. Blank makes EcoBin score the bin itself.                                                                    |

A minimal ESP32 write looks like this:

```cpp
String url = "http://api.thingspeak.com/update?api_key=" + WRITE_KEY +
             "&field1=" + String(fillPercent) +   // ultrasonic
             "&field2=" + String(weightKg, 1) +   // load cell
             "&field3=" + String(statusCode) +    // 0..3
             "&field4=" + String(BIN_ID) +        // e.g. 7
             "&field5=" + String(priority);       // 0..100
```

ThingSpeak's free tier accepts one write roughly every 15 seconds, which is also
EcoBin's default refresh interval.

Publishing a different field order is fine — EcoBin detects it, and you can
always remap under **Settings → Field mapping**. Leave a box blank to ignore a
field.

> **Status field.** EcoBin reads `field3` as a five-level status
> (`0` normal … `3` critical). A two-state "collection required" flag is a
> different thing, so leave the status mapping blank for that and let the fill
> thresholds decide — otherwise `1` would read as _filling_ when it means _full_.

## How EcoBin reads the channel

1. `GET /channels/{id}/feeds.json?results={historyDepth}` on every refresh.
2. Each entry is parsed into a reading; rows with no numeric fill level are
   discarded rather than guessed at.
3. Entries are grouped by bin ID — the newest entry per bin becomes that bin's
   current state, and the full set drives the history charts.
4. A bin with no entry for longer than the offline grace period (30 minutes by
   default) is shown as offline.
5. Priority comes from field5 when the device publishes it. Otherwise EcoBin
   scores the bin from fill level (60), weight (20), open citizen reports (12)
   and time since the last collection (8).

Errors are surfaced, never swallowed: a bad channel ID, a wrong read key, a rate
limit, an empty channel or a field-map mismatch each produce a specific message
in the connection banner.

## Pages

| Route              | What it does                                                    |
| ------------------ | --------------------------------------------------------------- |
| `/`                | Public landing page                                             |
| `/map`             | Public bin map                                                  |
| `/report`          | Citizen report form                                             |
| `/worker`          | Field worker view — assignments, navigation, log a collection   |
| `/admin`           | Overview: KPIs, priority bins, live map, fill analytics, alerts |
| `/admin/bins`      | Live bin monitoring                                             |
| `/admin/map`       | Full-screen bin map with status filters                         |
| `/admin/queue`     | Priority queue and recommended route                            |
| `/admin/trucks`    | Fleet register and assignments                                  |
| `/admin/reports`   | Citizen report workflow                                         |
| `/admin/ai`        | Waste classification records                                    |
| `/admin/analytics` | Fill and weight trends from the channel history                 |
| `/admin/impact`    | Distance, fuel and CO₂ estimates from logged collections        |
| `/admin/history`   | Collection log with CSV export                                  |
| `/admin/settings`  | ThingSpeak connection, field mapping, thresholds, bin registry  |

## Tech stack

React 19 · TanStack Start (SSR) · TanStack Router · Zustand · Tailwind CSS 4 ·
shadcn/ui · Recharts · React Leaflet + OpenStreetMap · Vite 8.

## Scripts

```sh
npm run dev        # dev server
npm run build      # production build
npm run preview    # preview the build
npm run lint       # eslint + prettier
npm run format     # prettier --write
```

## Docs

- [`docs/product-brief.md`](docs/product-brief.md) — the original design brief,
  with a note on where the shipped app deliberately differs.

## Credits

Built by **Gauravdeori**.

Map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors. Sensor data via [ThingSpeak](https://thingspeak.com).
