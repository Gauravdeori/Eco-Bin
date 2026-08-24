import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Brain,
  Gauge,
  MapPin,
  MessageSquareWarning,
  Truck,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { EcoLogo } from "@/components/eco/primitives";
import heroImage from "@/assets/ecobin-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EcoBin — Smarter Waste Collection. Cleaner Cities." },
      {
        name: "description",
        content:
          "EcoBin connects smart IoT bins, citizens and municipal teams to detect waste buildup, prioritize collection and optimize operations.",
      },
      { property: "og:title", content: "EcoBin — Smarter Waste Collection. Cleaner Cities." },
      {
        property: "og:description",
        content:
          "Real-time IoT monitoring, citizen intelligence and AI waste insights for municipal waste operations.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Gauge,
    title: "Real-Time Monitoring",
    body: "Live fill level, weight, battery and device health for every smart bin on the network.",
  },
  {
    icon: Truck,
    title: "Smart Collection",
    body: "A priority-ranked queue with truck assignment and an explainable recommended route.",
  },
  {
    icon: MessageSquareWarning,
    title: "Citizen Reporting",
    body: "Public reports enter the same operational workflow as sensor alerts.",
  },
  {
    icon: Brain,
    title: "Waste Classification",
    body: "Log plastic, metal, food and plant waste per bin and turn it into routing recommendations.",
  },
  {
    icon: MapPin,
    title: "Live Municipal Map",
    body: "Every bin and truck plotted on OpenStreetMap with status-coded markers and filters.",
  },
  {
    icon: BarChart3,
    title: "Sustainability Analytics",
    body: "Trips avoided, distance, fuel and estimated CO₂ reduction from smarter collection.",
  },
];

const FLOW = ["Wokwi ESP32", "ThingSpeak", "EcoBin Dashboard", "Priority", "Collection"];

function Landing() {
  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <EcoLogo />
          <div className="flex items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/about">How it works</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/map">Bin map</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/worker">Worker app</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/admin">Command centre</Link>
            </Button>
          </div>
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <img
          src={heroImage}
          alt="Smart waste bin with a sensor indicator on a city street at golden hour"
          width={1600}
          height={1008}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/92 to-background/40" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:py-32">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl"
          >
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              ESP32 · ThingSpeak · Municipal operations
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
              Smarter Waste Collection.
              <br />
              Cleaner Cities.
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              EcoBin connects smart bins, citizens and municipal teams to detect waste buildup,
              prioritize collection and optimize waste-management operations.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/admin">
                  Open Command Center <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/report" search={{ bin: undefined }}>
                  Report a Bin
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link to="/about">See How It Works</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/30 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center font-display text-2xl font-bold">
            Sense → Analyze → Prioritize → Assign → Collect
          </h2>
          <ol className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {FLOW.map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span className="eco-panel px-5 py-3 text-sm font-semibold">{step}</span>
                {i < FLOW.length - 1 && (
                  <>
                    <ArrowRight
                      className="hidden size-4 text-muted-foreground sm:block"
                      aria-hidden
                    />
                    <ArrowDown className="size-4 text-muted-foreground sm:hidden" aria-hidden />
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-3xl font-bold">
            One platform for the whole collection cycle
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Real-time IoT monitoring, citizen intelligence and waste insights for smarter municipal
            operations.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <motion.article key={f.title} whileHover={{ y: -3 }} className="eco-panel p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-3 font-display text-lg font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-bold">How EcoBin works</h2>
            <p className="mt-2 text-muted-foreground">
              A Wokwi ESP32 publishes fill level, weight, status, bin ID and priority to a
              ThingSpeak channel. EcoBin normalizes that feed, ranks the collection queue and
              recommends the truck and route — then measures the impact of each completed
              collection.
            </p>
            <Button asChild variant="outline" className="mt-5 gap-2">
              <Link to="/about">
                Read the full architecture <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
          <ol className="space-y-3">
            {[
              "Bin fills and the sensor triggers an alert",
              "The command centre shows the bin as critical",
              "The priority engine ranks it in the collection queue",
              "A truck is assigned with a recommended route",
              "The worker collects the bin and logs the pickup",
              "The next sensor entry confirms it and analytics update",
            ].map((s, i) => (
              <li key={s} className="eco-panel flex items-center gap-3 p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 font-display text-sm font-bold text-primary">
                  {i + 1}
                </span>
                <span className="text-sm">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-sm text-muted-foreground">
          <EcoLogo />
          <p>
            Built by Gauravdeori · every bin figure comes from the connected ThingSpeak channel.
          </p>
        </div>
      </footer>
    </main>
  );
}
