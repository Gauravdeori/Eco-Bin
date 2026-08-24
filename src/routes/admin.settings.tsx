import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MapPin, Trash2, Wand2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { InfoHint, SectionHeading } from "@/components/eco/primitives";
import { useEco, resetEcoBin } from "@/store/ecobin-store";
import { DEFAULT_SETTINGS, FIELD_DOCS } from "@/lib/ecobin-config";
import type { ThingSpeakFieldMap } from "@/types/ecobin";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — EcoBin" },
      {
        name: "description",
        content:
          "Connect the ThingSpeak channel, map its fields, set fill thresholds and register bin locations.",
      },
      { property: "og:title", content: "Settings — EcoBin" },
      {
        property: "og:description",
        content: "ThingSpeak connection, field mapping and bin registry.",
      },
    ],
  }),
  component: Settings,
});

function Settings() {
  const settings = useEco((s) => s.settings);
  const updateSettings = useEco((s) => s.updateSettings);
  const resetSettings = useEco((s) => s.resetSettings);
  const refresh = useEco((s) => s.refresh);
  const connection = useEco((s) => s.connection);
  const detectFieldMap = useEco((s) => s.detectFieldMap);
  const [testing, setTesting] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const detect = async () => {
    setDetecting(true);
    const ok = await detectFieldMap();
    setDetecting(false);
    if (ok) {
      toast.success("Field map detected from the channel's own field names");
    } else {
      toast.error(useEco.getState().connection.error ?? "Could not detect the field map.");
    }
  };

  const test = async () => {
    setTesting(true);
    await refresh();
    setTesting(false);
    const { connection: c } = useEco.getState();
    if (c.live) {
      toast.success(
        `Connected${c.channelName ? ` to ${c.channelName}` : ""} — ${c.entriesRead} entries read.`,
      );
    } else {
      toast.error(c.error ?? "Could not reach ThingSpeak.");
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Settings"
        description="ThingSpeak connectivity, field mapping, thresholds and the municipal bin registry."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="ThingSpeak connection"
          hint="Read-only credentials. Never put a write API key in a frontend."
        >
          <div className="space-y-2">
            <Label htmlFor="channel">Channel ID</Label>
            <Input
              id="channel"
              inputMode="numeric"
              value={settings.channelId}
              placeholder="e.g. 2345678"
              onChange={(e) => updateSettings({ channelId: e.target.value })}
            />
            <Label htmlFor="key">Read API key</Label>
            <Input
              id="key"
              type="password"
              value={settings.readApiKey}
              placeholder="Leave blank for a public channel"
              onChange={(e) => updateSettings({ readApiKey: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="refresh" className="text-xs">
                  Refresh interval (s)
                </Label>
                <Input
                  id="refresh"
                  type="number"
                  min={10}
                  className="mt-1"
                  value={settings.refreshIntervalSec}
                  onChange={(e) =>
                    updateSettings({
                      refreshIntervalSec: Math.max(10, Number(e.target.value) || 15),
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="depth" className="text-xs">
                  History depth (entries)
                </Label>
                <Input
                  id="depth"
                  type="number"
                  min={1}
                  max={8000}
                  className="mt-1"
                  value={settings.historyDepth}
                  onChange={(e) =>
                    updateSettings({
                      historyDepth: Math.max(1, Math.min(8000, Number(e.target.value) || 100)),
                    })
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="offline" className="text-xs">
                Mark a bin offline after (minutes without an entry)
              </Label>
              <Input
                id="offline"
                type="number"
                min={1}
                className="mt-1"
                value={settings.offlineAfterMinutes}
                onChange={(e) =>
                  updateSettings({ offlineAfterMinutes: Math.max(1, Number(e.target.value) || 30) })
                }
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void test()} disabled={testing} className="gap-2">
              {testing && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Test connection
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  fieldMap: DEFAULT_SETTINGS.fieldMap,
                  fieldMapSource: "default",
                })
              }
            >
              Reset field map
            </Button>
          </div>

          <div
            className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm ${
              connection.live ? "border-normal/30 bg-normal/10" : "border-border bg-muted/40"
            }`}
          >
            {connection.live ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-normal" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <p>
              {connection.live
                ? `Connected${connection.channelName ? ` to “${connection.channelName}”` : ""}. ${connection.entriesRead} entries read on the last sync.`
                : (connection.error ??
                  "Not connected yet — enter a channel ID and test the connection.")}
            </p>
          </div>
        </Card>

        <Card
          title="Field mapping"
          hint="Match these to the fields your ESP32 sketch writes. Leave a box blank to ignore that field."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => void detect()}
              disabled={detecting}
            >
              {detecting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Wand2 className="size-3.5" aria-hidden />
              )}
              Detect from channel
            </Button>
            <span className="text-xs text-muted-foreground">
              {settings.fieldMapSource === "detected"
                ? "Detected from the channel's field names."
                : settings.fieldMapSource === "manual"
                  ? "Set by hand."
                  : "Using defaults until the channel is read."}
            </span>
          </div>

          <div className="space-y-2">
            {FIELD_DOCS.map(({ key, label, hint, required }) => {
              const mapped = settings.fieldMap[key];
              const channelLabel = mapped ? connection.fieldLabels[mapped] : undefined;
              return (
                <div key={key} className="grid grid-cols-[1fr_7rem] items-center gap-2">
                  <div>
                    <Label htmlFor={`fm-${key}`} className="text-sm">
                      {label}
                      {required && <span className="ml-1 text-critical">*</span>}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {channelLabel ? `Channel calls it “${channelLabel}”` : hint}
                    </p>
                  </div>
                  <Input
                    id={`fm-${key}`}
                    className="h-9"
                    placeholder="unused"
                    value={mapped}
                    onChange={(e) =>
                      updateSettings({
                        fieldMap: { ...settings.fieldMap, [key]: e.target.value.trim() },
                        fieldMapSource: "manual",
                      })
                    }
                  />
                </div>
              );
            })}
          </div>

          {unmappedFields(settings.fieldMap, connection.fieldLabels).length > 0 && (
            <p className="text-xs text-muted-foreground">
              Not mapped:{" "}
              {unmappedFields(settings.fieldMap, connection.fieldLabels)
                .map(([field, label]) => `${field} (${label})`)
                .join(", ")}
              . EcoBin ignores these rather than reading them as something they are not.
            </p>
          )}
        </Card>

        <Card
          title="Status thresholds"
          hint="Fill percentages that drive bin status and the priority score."
        >
          {(["filling", "high", "critical"] as const).map((k) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <Label htmlFor={`th-${k}`} className="capitalize">
                {k} at (%)
              </Label>
              <Input
                id={`th-${k}`}
                type="number"
                min={1}
                max={100}
                className="w-24"
                value={settings.thresholds[k]}
                onChange={(e) =>
                  updateSettings({
                    thresholds: { ...settings.thresholds, [k]: Number(e.target.value) },
                  })
                }
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Thresholds apply only when the device leaves the status field blank — a status published
            on {settings.fieldMap.status || "the status field"} always wins.
          </p>
        </Card>

        <Card title="Alerts">
          {(
            [
              ["critical", "Critical fill level and offline devices"],
              ["reports", "Citizen reports"],
              ["trucks", "Truck status changes"],
              ["collections", "Collection completion"],
            ] as const
          ).map(([k, label]) => (
            <Toggle
              key={k}
              id={`n-${k}`}
              label={label}
              checked={settings.notify[k]}
              onChange={(v) => updateSettings({ notify: { ...settings.notify, [k]: v } })}
            />
          ))}
        </Card>
      </div>

      <BinRegistry />

      <Card title="Reset" hint="Clears everything EcoBin stores in this browser.">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              resetSettings();
              toast.success("Settings restored to defaults");
            }}
          >
            Restore default settings
          </Button>
          <Button
            variant="outline"
            className="gap-2 text-critical"
            onClick={() => {
              resetEcoBin();
              toast.success("All local EcoBin data cleared");
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            Clear all local data
          </Button>
        </div>
      </Card>
    </div>
  );
}

/**
 * The channel carries telemetry only, so bin names, wards and coordinates live
 * here. Every bin ID seen on the channel is registered automatically with an
 * approximate marker until an operator enters the real position.
 */
function BinRegistry() {
  const profiles = useEco((s) => s.binProfiles);
  const bins = useEco((s) => s.bins);
  const upsert = useEco((s) => s.upsertBinProfile);
  const remove = useEco((s) => s.removeBinProfile);

  const ids = [...new Set([...bins.map((b) => b.id), ...Object.keys(profiles)])].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  return (
    <Card
      title="Bin registry"
      hint="ThingSpeak sends no GPS, so locations are held here. Bins with approximate markers are placed near the depot."
    >
      {!ids.length ? (
        <p className="text-sm text-muted-foreground">
          No bins yet. Every bin ID published to the channel is registered here automatically.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-160 text-sm">
            <caption className="sr-only">Bin registry</caption>
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-2">
                  Bin
                </th>
                <th scope="col" className="py-2 pr-2">
                  Name
                </th>
                <th scope="col" className="py-2 pr-2">
                  Ward
                </th>
                <th scope="col" className="py-2 pr-2">
                  Latitude
                </th>
                <th scope="col" className="py-2 pr-2">
                  Longitude
                </th>
                <th scope="col" className="py-2 pr-2">
                  Location
                </th>
                <th scope="col" className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ids.map((id) => {
                const p = profiles[id];
                return (
                  <tr key={id}>
                    <td className="py-2 pr-2 font-medium">{id}</td>
                    <td className="py-2 pr-2">
                      <Input
                        className="h-8 min-w-40"
                        aria-label={`Name for ${id}`}
                        value={p?.name ?? ""}
                        onChange={(e) => upsert(id, { name: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        className="h-8 min-w-36"
                        aria-label={`Ward for ${id}`}
                        value={p?.ward ?? ""}
                        onChange={(e) => upsert(id, { ward: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        className="h-8 w-28"
                        type="number"
                        step="0.000001"
                        aria-label={`Latitude for ${id}`}
                        value={p?.latitude ?? ""}
                        onChange={(e) => upsert(id, { latitude: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        className="h-8 w-28"
                        type="number"
                        step="0.000001"
                        aria-label={`Longitude for ${id}`}
                        value={p?.longitude ?? ""}
                        onChange={(e) => upsert(id, { longitude: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-2 pr-2 text-xs">
                      {p?.approximate === false ? (
                        <span className="inline-flex items-center gap-1 text-normal">
                          <MapPin className="size-3.5" aria-hidden /> Surveyed
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Approximate</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${id} from the registry`}
                        onClick={() => remove(id)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Channel fields the map does not use, so an operator can see what is ignored. */
function unmappedFields(
  map: ThingSpeakFieldMap,
  labels: Record<string, string>,
): [string, string][] {
  const used = new Set(Object.values(map).filter(Boolean));
  return Object.entries(labels).filter(([field]) => !used.has(field));
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="eco-panel space-y-3 p-4">
      <h2 className="font-display text-base font-semibold">
        {title}
        {hint && <InfoHint>{hint}</InfoHint>}
      </h2>
      {children}
    </section>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
