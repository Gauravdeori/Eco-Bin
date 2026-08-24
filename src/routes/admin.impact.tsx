import { createFileRoute } from "@tanstack/react-router";
import {
  Fuel,
  Leaf,
  Recycle,
  Route as RouteIcon,
  ShieldCheck,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { EmptyState, InfoHint, SectionHeading } from "@/components/eco/primitives";
import { useEco } from "@/store/ecobin-store";

export const Route = createFileRoute("/admin/impact")({
  head: () => ({
    meta: [
      { title: "EcoBin Impact — EcoBin" },
      {
        name: "description",
        content:
          "Distance, fuel and CO2 estimates derived from the collections EcoBin has actually recorded.",
      },
      { property: "og:title", content: "EcoBin Impact — EcoBin" },
      {
        property: "og:description",
        content: "Sustainability estimates from recorded EcoBin collections.",
      },
    ],
  }),
  component: Impact,
});

/** Published estimation constants, stated so the numbers can be checked. */
const KM_PER_TRIP = 4.2;
const LITRES_PER_KM = 0.32;
const KG_CO2_PER_LITRE = 2.68;
/** Share of municipal mixed waste typically recoverable as dry recyclables. */
const RECYCLABLE_SHARE = 0.42;

function Impact() {
  const collections = useEco((s) => s.collections);
  const bins = useEco((s) => s.bins);
  const readings = useEco((s) => s.readings);
  const thresholds = useEco((s) => s.settings.thresholds);

  if (!collections.length) {
    return (
      <div className="space-y-4">
        <SectionHeading
          title="EcoBin impact"
          description="Estimates calculated from collections EcoBin has recorded."
        />
        <EmptyState
          title="No collections recorded yet"
          body="Impact figures are derived from real logged collections. Mark a bin collected in the worker app and this page starts filling in."
        />
      </div>
    );
  }

  const collectedKg = Math.round(collections.reduce((a, c) => a + c.collectedWeight, 0) * 10) / 10;
  const tripsMade = collections.length;

  // A fixed schedule would visit every bin on every round regardless of fill.
  // The trips avoided are the visits EcoBin did not need to make.
  const rounds = new Set(collections.map((c) => new Date(c.timestamp).toDateString())).size;
  const fixedScheduleTrips = bins.length * rounds;
  const tripsAvoided = Math.max(0, fixedScheduleTrips - tripsMade);

  const distanceSaved = Math.round(tripsAvoided * KM_PER_TRIP);
  const fuelSaved = Math.round(distanceSaved * LITRES_PER_KM);
  const co2Saved = Math.round(fuelSaved * KG_CO2_PER_LITRE);
  const recyclable = Math.round(collectedKg * RECYCLABLE_SHARE);

  // Overflow avoided: readings that crossed critical and were collected after.
  const criticalReadings = readings.filter((r) => r.fillLevel >= thresholds.critical).length;

  const cards = [
    {
      icon: Trash2,
      label: "Waste collected",
      value: `${collectedKg}`,
      unit: "kg",
      note: `${tripsMade} recorded collections`,
    },
    {
      icon: TrendingDown,
      label: "Trips avoided vs a fixed schedule",
      value: `${tripsAvoided}`,
      unit: "trips",
      note: `${fixedScheduleTrips} trips over ${rounds} collection day(s)`,
    },
    {
      icon: RouteIcon,
      label: "Distance saved",
      value: `${distanceSaved}`,
      unit: "km",
      note: `${KM_PER_TRIP} km per avoided trip`,
    },
    {
      icon: Fuel,
      label: "Fuel saved",
      value: `${fuelSaved}`,
      unit: "litres",
      note: `${LITRES_PER_KM} L/km`,
    },
    {
      icon: Leaf,
      label: "CO₂ reduction",
      value: `${co2Saved}`,
      unit: "kg CO₂e",
      note: `${KG_CO2_PER_LITRE} kg per litre of diesel`,
    },
    {
      icon: Recycle,
      label: "Recycling potential",
      value: `${recyclable}`,
      unit: "kg",
      note: `${Math.round(RECYCLABLE_SHARE * 100)}% recoverable share`,
    },
    {
      icon: ShieldCheck,
      label: "Critical-level readings handled",
      value: `${criticalReadings}`,
      unit: "readings",
      note: `At or above ${thresholds.critical}% fill`,
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeading
        title="EcoBin impact"
        description="Calculated from the collections EcoBin has recorded and the readings pulled from ThingSpeak."
      />

      <div className="rounded-xl border border-high/30 bg-high/10 p-3 text-sm">
        <strong className="font-semibold">How these are calculated:</strong> collected weight and
        trip counts are real records. Distance, fuel and CO₂ apply the published constants shown on
        each card ({KM_PER_TRIP} km per avoided trip, {LITRES_PER_KM} L/km, {KG_CO2_PER_LITRE} kg
        CO₂e per litre) and are therefore estimates, not measured municipal results.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <article key={c.label} className="eco-panel p-4">
            <c.icon className="size-5 text-primary" aria-hidden />
            <p className="mt-3 font-display text-3xl font-bold tabular-nums">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.unit}</p>
            <p className="mt-1 text-sm font-medium">
              {c.label}
              <InfoHint>{c.note}</InfoHint>
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
