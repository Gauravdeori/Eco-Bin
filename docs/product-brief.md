<!--
  The design brief this project was built from, kept for reference.

  Where the brief and the shipped app differ, the app is authoritative. The
  notable changes:

  * No demo mode. The dashboard renders only data read from ThingSpeak; when the
    channel is unreachable it reports the error instead of substituting sample
    data (brief sections 12 and 11).
  * Field map follows the device pipeline: field1 fill level, field2 weight,
    field3 status, field4 bin ID, field5 priority. The device sends no GPS, so
    bin coordinates live in the in-app bin registry (brief section 10).
  * Priority published on field5 is used as-is; EcoBin only scores a bin itself
    when that field is empty (brief section 13).
  * Waste classification records an operator's categorisation rather than
    generating a model prediction, because no image model is connected
    (brief section 24).
-->

# EcoBin — original product brief

Build a complete, polished, hackathon-ready web application called **EcoBin**.

EcoBin is an intelligent municipal waste-management platform that connects simulated IoT smart bins, ThingSpeak cloud data, citizen reports, collection workers and municipal administrators in one unified system.

The project is being demonstrated using:

**Wokwi ESP32 simulation → Sensors → ThingSpeak → EcoBin Dashboard**

Do NOT assume that physical hardware is available. The Wokwi simulation and ThingSpeak data are the live IoT source for the hackathon demo.

The goal is to make this look like a real municipal waste-management product, not a generic admin dashboard.

---

# 1. PRODUCT VISION

EcoBin should help municipalities:

- Monitor waste-bin fill levels in real time

- Monitor bin weight

- Detect critical/overflowing bins

- Prioritize which bins need collection first

- Track bin locations on a live map

- Receive citizen reports

- Assign collection trucks

- Track collection status

- Analyze historical waste data

- Estimate operational and environmental impact

- Display AI waste-classification results

- Provide a foundation for future automated segregation and route optimization

The central product concept is:

**Sense → Analyze → Prioritize → Assign → Collect → Measure Impact**

The qualifier document defines the core journey as:

**Bin fills → sensor triggers alert → admin dashboard shows bin as full → truck assignment → collection → status reset.**

Preserve this journey throughout the application.

---

# 2. IMPORTANT ARCHITECTURE

Use this architecture:

```text

WOKWI

ESP32 Simulation

      |

      | Wi-Fi / HTTP

      ↓

THINGSPEAK

IoT Cloud Data

      |

      | REST API

      ↓

ECOBIN DATA LAYER

      |

      ├── Bin monitoring

      ├── Priority engine

      ├── Alerts

      ├── Analytics

      ├── Citizen reports

      └── Collection management

      |

      ↓

ECOBIN WEB DASHBOARD

```

ThingSpeak is the IoT data source.

The dashboard must be capable of fetching live ThingSpeak channel data.

Do not hardcode the dashboard around fake sensor values.

However, create a **Demo Mode** so the entire application can still be demonstrated if ThingSpeak is temporarily unavailable.

---

# 3. TECHNOLOGY STACK

Use:

- React

- Vite

- TypeScript

- Tailwind CSS

- shadcn/ui

- React Router

- Recharts

- Leaflet + OpenStreetMap

- Lucide React icons

- Framer Motion for subtle animations

- ThingSpeak REST API

- Local mock/demo data fallback

Keep the architecture modular and production-ready.

Do not introduce unnecessary frameworks.

---

# 4. VISUAL DESIGN

Create a premium environmental technology dashboard.

Design language:

- Clean

- Modern

- Professional

- Municipal/enterprise

- Slightly futuristic

- Sustainability-focused

- Not overly "gaming"

- Not excessively neon

- Not childish

Primary visual identity:

**EcoBin**

Logo concept:

A simple circular/rounded waste-bin icon combined with a leaf or recycling element.

Use a clean typography system.

Use cards with subtle borders and shadows.

Use status colors consistently:

🟢 Normal

🟡 Filling

🟠 High Priority

🔴 Critical

⚪ Offline

The dashboard should look good on:

- Desktop

- Laptop

- Tablet

- Mobile

Use responsive layouts throughout.

---

# 5. APPLICATION STRUCTURE

Create the following major sections:

## PUBLIC

1. Landing Page

2. Citizen Report Page

3. Public Bin Map

4. About / How EcoBin Works

## MUNICIPAL ADMIN

5. Admin Dashboard

6. Live Bin Monitoring

7. Map View

8. Collection Queue

9. Truck Management

10. Citizen Reports

11. Waste Analytics

12. AI Waste Classification

13. Collection History

14. Impact Analytics

15. Settings

## COLLECTION WORKER

16. Worker Dashboard

17. Assigned Collections

18. Collection Details

19. Mark Bin Collected

---

# 6. LANDING PAGE

Create a beautiful landing page.

Hero:

## "Smarter Waste Collection. Cleaner Cities."

Subtitle:

"EcoBin connects smart bins, citizens and municipal teams to detect waste buildup, prioritize collection and optimize waste-management operations."

CTA buttons:

**View Live Dashboard**

**Report a Bin**

**See How It Works**

Show a visual representation of:

```text

Smart Bin

   ↓

Real-Time Data

   ↓

AI Analysis

   ↓

Priority

   ↓

Collection

```

Add feature cards:

- Real-Time Monitoring

- Smart Collection

- Citizen Reporting

- AI Waste Analysis

- Live Municipal Map

- Sustainability Analytics

Add a "How EcoBin Works" section.

---

# 7. ADMIN DASHBOARD

This is the most important screen.

Create a professional municipal command center.

Top navigation/sidebar:

- Overview

- Live Bins

- Map

- Collection Queue

- Trucks

- Citizen Reports

- AI Classification

- Analytics

- History

- Settings

Top bar:

- EcoBin logo

- Municipality name

- Live connection status

- ThingSpeak status

- Demo Mode toggle

- Notification icon

- Admin profile

---

# 8. ADMIN OVERVIEW

Create large KPI cards.

Show:

### Total Bins

Example: 250

### Normal

Example: 176

### Filling

Example: 42

### High Priority

Example: 21

### Critical

Example: 11

### Active Trucks

Example: 14

### Pending Reports

Example: 7

### Collections Today

Example: 83

Do NOT claim these are real-world measurements.

Clearly distinguish between:

**Live ThingSpeak data**

and

**Demo/simulated data**

when appropriate.

---

# 9. LIVE SENSOR DATA

Create a dedicated live monitoring section.

Each bin should display:

- Bin ID

- Fill percentage

- Weight

- Status

- Last updated

- Location

- Battery/device status

- Priority score

- Collection status

Example:

```text

BIN-102

94%

Fill Level

37.4 kg

Weight

CRITICAL

Last updated:

12 seconds ago

Priority Score:

96/100

```

Add animated progress bars.

When fill level increases, the status should automatically change.

Suggested logic:

```text

0–50%    → NORMAL

51–75%   → FILLING

76–90%   → HIGH

91–100%  → CRITICAL

```

Make these thresholds configurable.

---

# 10. THINGSPEAK INTEGRATION

Create a dedicated ThingSpeak service layer.

Use environment variables:

```text

VITE_THINGSPEAK_CHANNEL_ID=

VITE_THINGSPEAK_READ_API_KEY=

```

Do not hardcode API keys.

Fetch ThingSpeak channel data using the ThingSpeak API.

Support fields:

```text

Field 1 = Fill Level %

Field 2 = Weight kg

Field 3 = Bin Status

Field 4 = Bin ID

Field 5 = Latitude

Field 6 = Longitude

Field 7 = Priority Score

Field 8 = Device/Battery Status

```

Make field mapping configurable in one place.

Create a service such as:

```text

thingspeakService.ts

```

Responsibilities:

- Fetch latest feed

- Fetch historical feeds

- Parse sensor values

- Validate data

- Handle errors

- Handle unavailable ThingSpeak

- Return normalized EcoBin data

Do not expose sensitive write credentials in the frontend.

The dashboard only needs read access for the live demonstration.

---

# 11. LIVE CONNECTION INDICATOR

At the top of the dashboard show:

```text

● ThingSpeak Connected

Last sync: 8 seconds ago

```

If unavailable:

```text

● ThingSpeak Offline

Using Demo Data

```

Add a small connection status indicator.

Do not crash the application if ThingSpeak fails.

Fallback automatically to Demo Mode.

---

# 12. DEMO MODE

Create a powerful hackathon demo mode.

Admin can toggle:

**LIVE MODE**

or

**DEMO MODE**

Demo mode should simulate the complete journey.

Add a control:

### Simulate Bin Filling

Clicking it should gradually change:

```text

60%

↓

70%

↓

82%

↓

91%

↓

97%

```

As the level changes:

- Status changes

- Priority changes

- Alert appears

- Bin enters collection queue

- Dashboard counters update

- Map marker changes

- Recommended truck assignment appears

This is extremely important for the live hackathon presentation.

---

# 13. PRIORITY ENGINE

Do not simply display fill level.

Create a calculated:

## EcoBin Priority Score

Score from 0–100.

Use factors such as:

- Fill level

- Weight

- Citizen reports

- Time since last collection

- Current status

- Waste classification if available

Example conceptual calculation:

```text

Fill contribution

+ Weight contribution

+ Report contribution

+ Time contribution

+ Waste urgency

=

Priority Score

```

Example:

```text

BIN-102

Fill: 96%

Weight: 38kg

Reports: 2

Priority: 97/100

CRITICAL

```

Clearly label the score as an EcoBin operational priority score.

---

# 14. LIVE MAP

Create a large interactive map using:

**Leaflet + OpenStreetMap**

Display all bins.

Markers should change based on status:

- Normal

- Filling

- High

- Critical

- Offline

Clicking a marker opens:

```text

BIN-102

Fill: 94%

Weight: 37kg

Priority: 96

Status: Critical

Last Collection:

Today, 08:42

[View Details]

[Assign Truck]

```

Add filters:

- All

- Critical

- High

- Filling

- Normal

- Offline

Also show collection trucks on the map.

---

# 15. COLLECTION QUEUE

Create a smart collection queue.

Sort bins by priority.

Example:

```text

1  BIN-102

   Critical

   97/100

   94%

   37kg

2  BIN-311

   Critical

   93/100

   92%

   34kg

3  BIN-205

   High

   82/100

   84%

   29kg

```

Each item should have:

**Assign Truck**

button.

Also show:

- Estimated distance

- Estimated collection weight

- Status

- Time waiting

---

# 16. TRUCK MANAGEMENT

Create a Truck Management page.

Each truck:

```text

TRUCK-07

Driver:

Rahul Das

Capacity:

2.5 tonnes

Current Load:

1.1 tonnes

Status:

AVAILABLE

Current Location:

Dibrugarh

Assigned Bins:

4

```

Truck states:

- Available

- Assigned

- En Route

- Collecting

- Completed

- Offline

Allow admin to assign a truck to bins.

---

# 17. SMART ROUTE RECOMMENDATION

Create a visually impressive but explainable route recommendation system.

When several bins are critical:

Show:

```text

Recommended Collection Route

Truck #07

START

 ↓

BIN-102

 ↓

BIN-311

 ↓

BIN-205

 ↓

BIN-410

 ↓

DEPOT

```

Display:

- Total distance

- Estimated time

- Expected collected weight

- Number of bins

- Priority handled

This can initially use simulated route calculations.

Do not claim real traffic optimization unless actual traffic data is integrated.

Label it:

**EcoBin Recommended Route**

---

# 18. CITIZEN REPORTING

Create a beautiful public report form.

Citizen can report:

### Report Type

- Overflowing bin

- Damaged bin

- Bad smell

- Garbage outside bin

- Other

Fields:

- Bin ID

- Location

- Description

- Optional photo

- Submit report

After submission:

```text

Report Submitted Successfully

Report ID:

RPT-1042

Status:

Received

The municipal team has been notified.

```

---

# 19. CITIZEN REPORTS ADMIN PAGE

Admin sees:

```text

RPT-1042

Overflowing Bin

BIN-102

2 minutes ago

HIGH

```

Actions:

- View

- Verify

- Add to Collection Queue

- Assign Truck

- Resolve

- Reject

Citizen reports must enter the same operational workflow as sensor alerts.

This is one of EcoBin's important differentiators.

---

# 20. WORKER DASHBOARD

Create a mobile-friendly worker interface.

Show:

### Today's Collections

```text

4 Pending

2 Completed

1 In Progress

```

Each assignment:

```text

BIN-102

94%

37kg

Critical

[Open Navigation]

[Start Collection]

```

After collection:

```text

Collection Completed

[Mark Bin Empty]

```

This should reset the bin status.

---

# 21. COLLECTION HISTORY

Create a historical table.

Columns:

- Bin ID

- Collection date

- Time

- Weight collected

- Worker

- Truck

- Duration

- Status

Add:

- Search

- Date filters

- Bin filters

- Export CSV

---

# 22. ANALYTICS

Create a professional analytics page using Recharts.

Charts:

### Waste Collected Over Time

Line chart

### Average Bin Fill Level

Line chart

### Collections Per Day

Bar chart

### Waste by Category

Pie/donut chart

Categories:

- Plastic

- Metal

- Food

- Plant

### Overflow Incidents

Trend chart

### Collection Efficiency

Compare:

```text

Traditional Fixed Schedule

vs

EcoBin Smart Collection

```

Clearly label simulated comparisons as estimates/demo data.

---

# 23. IMPACT DASHBOARD

Create a dedicated:

## "EcoBin Impact"

page.

Show metrics such as:

- Overflow incidents reduced

- Unnecessary trips avoided

- Estimated distance saved

- Estimated fuel saved

- Estimated CO₂ reduction

- Waste collected

- Recycling potential

Use a methodology/info tooltip explaining that these are:

**demo estimates based on simulated operational data**

Do not present simulated numbers as independently verified real-world results.

---

# 24. AI WASTE CLASSIFICATION

Create an AI Classification page.

UI:

```text

AI Waste Classification

Upload Image

      ↓

Analyze

      ↓

Detected:

Plastic

Confidence:

94%

Category:

Recyclable

```

Categories:

- Plastic

- Metal

- Food Waste

- Plant Waste

Also display recent classifications.

Create a camera/image preview area.

If an actual YOLO model is not connected yet, implement a clean mock inference layer so the UI is ready for integration.

Structure the code so a real YOLO/OpenCV API can be connected later.

---

# 25. CONNECT AI TO OPERATIONS

Do not make AI classification feel like a separate toy.

Show:

```text

Waste Type

     ↓

Operational Insight

```

Example:

```text

Detected Waste:

High Organic Content

Recommendation:

Prioritize organic-waste processing route

```

or:

```text

Detected:

High Recyclable Content

Recommendation:

Flag for recyclable recovery

```

Make it clear that these are recommendations and not automated legal/municipal decisions.

---

# 26. BIN DETAILS PAGE

When admin clicks a bin, open a detailed page.

Show:

### BIN-102

Current:

```text

94% Full

37.4 kg

CRITICAL

Priority 96

```

Location map.

Historical fill chart.

Weight chart.

Collection history.

Citizen reports.

AI classification history.

Current truck assignment.

Buttons:

- Assign Truck

- Mark Collected

- Report Issue

- View History

---

# 27. NOTIFICATION SYSTEM

Create in-app notifications.

Examples:

```text

🔴 BIN-102 has reached 94%

🟠 BIN-205 received a citizen overflow report

🚛 TRUCK-07 assigned to BIN-102

🟢 BIN-311 collection completed

```

Unread notification counter in navbar.

---

# 28. SEARCH

Global search.

Search:

- Bin ID

- Truck ID

- Report ID

- Location

- Worker

Example:

Searching:

`BIN-102`

should open the bin details page.

---

# 29. SETTINGS

Include:

### Threshold Settings

```text

Filling:

50%

High:

75%

Critical:

90%

```

### ThingSpeak Settings

- Channel ID

- Read API key

- Field mapping

- Refresh interval

### Demo Settings

- Demo Mode

- Simulation speed

- Auto-fill simulation

### Notification Settings

- Critical bin alerts

- Citizen reports

- Truck status

- Collection completion

---

# 30. DATABASE / DATA MODELS

Create clean TypeScript interfaces.

### Bin

```ts
interface Bin {
  id: string;

  fillLevel: number;

  weight: number;

  status: "normal" | "filling" | "high" | "critical" | "offline";

  latitude: number;

  longitude: number;

  priorityScore: number;

  lastUpdated: string;

  lastCollected?: string;

  battery?: number;
}
```

### Truck

```ts
interface Truck {
  id: string;

  driver: string;

  capacity: number;

  currentLoad: number;

  status: string;

  latitude: number;

  longitude: number;
}
```

### CitizenReport

```ts
interface CitizenReport {
  id: string;

  binId: string;

  type: string;

  description: string;

  location: string;

  status: string;

  createdAt: string;
}
```

### Collection

```ts
interface Collection {
  id: string;

  binId: string;

  truckId: string;

  workerId: string;

  collectedWeight: number;

  timestamp: string;

  status: string;
}
```

---

# 31. DEMO DATA

Create realistic Assam/Dibrugarh-oriented demo data.

Use fictional/sample locations around:

**Dibrugarh, Assam**

Do not claim these are actual municipal deployments.

Create approximately:

- 20–30 demo bins

- 5–8 trucks

- 10+ citizen reports

- 30+ collection records

Use varied sensor values.

Some bins should be:

- Normal

- Filling

- High

- Critical

- Offline

This makes the dashboard look alive during the presentation.

---

# 32. LIVE DATA + DEMO DATA LOGIC

Implement:

```text

ThingSpeak available?

        |

       YES

        ↓

Use live ThingSpeak data

       NO

        ↓

Use Demo Mode data

```

Show the source clearly:

```text

DATA SOURCE

● ThingSpeak Live

```

or:

```text

DATA SOURCE

● Demo Simulation

```

Never silently mix simulated and live data.

---

# 33. AUTO REFRESH

Implement configurable refresh.

Default:

**15–20 seconds**

because the Wokwi → ThingSpeak demo does not require millisecond-level updates.

Show:

```text

Last synchronized:

12 seconds ago

```

Include a manual refresh button.

---

# 34. ERROR HANDLING

Handle:

- ThingSpeak unavailable

- Invalid API key

- Empty channel

- Invalid sensor data

- Missing fields

- Network timeout

- API rate limits

Never show a blank white page.

Show useful states:

```text

ThingSpeak temporarily unavailable.

EcoBin has switched to Demo Mode.

```

---

# 35. SECURITY

Do not expose write API keys.

Use environment variables.

Separate:

```text

LIVE DATA

DEMO DATA

```

Keep secrets out of source code.

If a backend proxy is required for secure production deployment, structure the application so one can be added later.

---

# 36. HACKATHON DEMO MODE

This is extremely important.

Create a special hidden/admin-accessible:

## "Start Demo"

button.

When clicked:

### STEP 1

Show:

```text

BIN-102

Fill Level: 68%

Status: FILLING

```

### STEP 2

Automatically simulate:

```text

76%

84%

91%

96%

```

### STEP 3

Trigger:

```text

🚨 CRITICAL BIN ALERT

BIN-102 requires collection

```

### STEP 4

Add it to:

**Collection Queue**

### STEP 5

Calculate:

**Priority Score: 96**

### STEP 6

Recommend:

**TRUCK-07**

### STEP 7

Display:

**Recommended Route**

### STEP 8

Worker marks:

**Collected**

### STEP 9

Bin resets:

```text

Fill: 5%

Weight: 0kg

Status: NORMAL

```

### STEP 10

Analytics updates automatically.

This should allow the entire project story to be demonstrated in approximately 2–3 minutes.

---

# 37. MICRO-INTERACTIONS

Use subtle Framer Motion animations.

Examples:

- KPI cards animate when values change

- Critical alert slides in

- Map markers update

- Collection queue updates

- Status transitions animate

- Charts smoothly update

Do NOT overuse animations.

The application must remain professional.

---

# 38. ACCESSIBILITY

Include:

- Keyboard navigation

- Proper button labels

- Good contrast

- Responsive layout

- Accessible form inputs

- Tooltips for unfamiliar metrics

---

# 39. CODE QUALITY

Use:

- Reusable components

- Clean folder structure

- TypeScript types

- API service layer

- Data normalization layer

- Central configuration

- Error boundaries

- Loading states

- Empty states

Suggested structure:

```text

src/

 ├── components/

 ├── pages/

 ├── layouts/

 ├── services/

 │    ├── thingspeakService.ts

 │    ├── demoService.ts

 │    └── analyticsService.ts

 ├── hooks/

 ├── types/

 ├── utils/

 ├── data/

 ├── lib/

 └── App.tsx

```

---

# 40. MOST IMPORTANT PRODUCT PRINCIPLE

Do not make EcoBin look like:

**"A dashboard that reads sensor data."**

Make it look like:

**"An intelligent municipal decision-support system powered by real-time IoT data."**

The dashboard should answer three questions immediately:

### 1. WHAT IS HAPPENING?

Which bins are filling or critical?

### 2. WHAT SHOULD WE DO?

Which bins should be collected first and which truck should handle them?

### 3. WHAT IMPACT ARE WE CREATING?

How much waste was collected, how many overflow incidents were avoided and how efficiently are collection operations running?

---

# 41. FINAL HOMEPAGE MESSAGE

Use this positioning:

## EcoBin

### Smarter Waste Collection. Cleaner Cities.

**Real-time IoT monitoring + citizen intelligence + AI-powered waste insights for smarter municipal waste operations.**

CTA:

**Open Command Center**

Secondary:

**Report a Bin**

---

# 42. FINAL IMPLEMENTATION REQUIREMENT

Build the application completely rather than only creating static UI screens.

Every major button should work.

The following must be functional:

- Navigation

- ThingSpeak data fetching

- Demo Mode

- Sensor simulation

- Bin status calculation

- Priority calculation

- Map markers

- Bin details

- Collection queue

- Truck assignment

- Citizen reporting

- Worker collection flow

- Notifications

- Charts

- Analytics

- AI classification demo

- Search

- Filters

- Settings

- Responsive layouts

If an external service is not configured, use a realistic fallback rather than breaking the UI.

Before finishing, test the complete journey:

**Wokwi/ThingSpeak data → dashboard → critical alert → priority calculation → collection queue → truck assignment → worker collection → bin reset → analytics update.**

The final result should look like a **real startup-grade municipal technology platform suitable for a hackathon finalist demonstration**, while clearly distinguishing live IoT data from simulated/demo data.
