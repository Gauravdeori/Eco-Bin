import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EcoLogo } from "@/components/eco/primitives";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "How EcoBin Works — Sense, Prioritize, Collect" },
      {
        name: "description",
        content:
          "EcoBin links ESP32 bin telemetry on ThingSpeak with a municipal command centre, citizen reports and field workers.",
      },
      { property: "og:title", content: "How EcoBin Works" },
      {
        property: "og:description",
        content: "From Wokwi ESP32 sensors to ThingSpeak to prioritized municipal collection.",
      },
    ],
  }),
  component: About,
});

const STEPS = [
  {
    title: "Sense",
    body: "A Wokwi ESP32 reads ultrasonic fill level and load-cell weight, drives the LED and buzzer, then posts to ThingSpeak over Wi-Fi.",
  },
  {
    title: "Analyze",
    body: "EcoBin reads the channel through a configurable field map — field1 fill, field2 weight, field3 status, field4 bin ID, field5 priority — and validates every entry. If the channel is unreachable it says so instead of substituting data.",
  },
  {
    title: "Prioritize",
    body: "EcoBin uses the priority the device publishes on field5. When that field is empty it scores the bin itself from fill level, weight, citizen reports and waiting time.",
  },
  {
    title: "Assign",
    body: "The collection queue ranks bins by priority and recommends a truck plus a nearest-neighbour route with distance, duration and expected load.",
  },
  {
    title: "Collect",
    body: "Field workers see their assignments on a mobile view, navigate to the bin, start the collection and log it. The next sensor entry confirms the emptied bin.",
  },
  {
    title: "Measure impact",
    body: "Every completed collection updates analytics and the impact dashboard: trips avoided, distance, fuel and estimated CO₂ reduction.",
  },
];

function About() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" aria-label="EcoBin home">
            <EcoLogo />
          </Link>
          <Button asChild size="sm">
            <Link to="/admin">Open command centre</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="font-display text-4xl font-bold tracking-tight">How EcoBin works</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          EcoBin is a municipal decision-support system powered by real-time IoT data. The sensor
          layer is an ESP32 — simulated in Wokwi or running on real hardware — publishing to a
          ThingSpeak channel.
        </p>

        <pre className="eco-panel mt-8 overflow-x-auto p-5 text-xs leading-relaxed text-muted-foreground">{`WOKWI ESP32
  |-- Ultrasonic sensor      -> fill level
  |-- Load cell              -> weight
  \`-- LED / buzzer           -> on-site alert
      |
      |  Wi-Fi  ·  HTTP
      v
THINGSPEAK CHANNEL
  |-- field1  Fill level
  |-- field2  Weight
  |-- field3  Status
  |-- field4  Bin ID
  \`-- field5  Priority
      |
      |  REST API
      v
ECOBIN DASHBOARD
  |-- Live bin map
  |-- Fill analytics
  |-- Alerts
  |-- Truck assignment
  \`-- Priority bins`}</pre>

        <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="eco-panel p-5">
              <span className="font-display text-xs font-bold text-primary">STEP {i + 1}</span>
              <h2 className="mt-1 font-display text-lg font-bold">{s.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="eco-panel mt-10 p-5 text-sm text-muted-foreground">
          <strong className="text-foreground">Data honesty:</strong> every bin figure in EcoBin
          comes from the connected ThingSpeak channel. There is no sample data set and no simulated
          fallback — when the channel is unreachable the dashboard reports the error rather than
          filling the gap. Collections, citizen reports and the truck fleet are municipal records
          you enter, and impact figures are clearly-labelled estimates built from those records.
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link to="/admin">
              Open command centre <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/report" search={{ bin: undefined }}>
              Report a bin
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
