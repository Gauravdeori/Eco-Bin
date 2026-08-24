import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Cloud,
  Cpu,
  LayoutDashboard,
  Loader2,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEco } from "@/store/ecobin-store";
import { DEFAULT_FIELD_MAP } from "@/lib/ecobin-config";
import { cn } from "@/lib/utils";

/**
 * The EcoBin data pipeline, drawn the way the hardware is wired:
 * ESP32 sensors -> ThingSpeak channel fields -> this dashboard.
 */
export function PipelineStrip({ className }: { className?: string }) {
  const channelName = useEco((s) => s.connection.channelName);
  const channelId = useEco((s) => s.settings.channelId);
  const live = useEco((s) => s.connection.live);
  const entries = useEco((s) => s.connection.entriesRead);
  const bins = useEco((s) => s.bins.length);

  const stages = [
    {
      icon: Cpu,
      title: "Wokwi ESP32",
      lines: ["Ultrasonic sensor", "Load cell", "LED / buzzer"],
    },
    {
      icon: Cloud,
      title: channelName || (channelId ? `Channel ${channelId}` : "ThingSpeak"),
      lines: [
        `${DEFAULT_FIELD_MAP.fillLevel} fill · ${DEFAULT_FIELD_MAP.weight} weight`,
        `${DEFAULT_FIELD_MAP.status} status · ${DEFAULT_FIELD_MAP.binId} bin ID`,
        `${DEFAULT_FIELD_MAP.priority} priority`,
      ],
    },
    {
      icon: LayoutDashboard,
      title: "EcoBin dashboard",
      lines: [
        live ? `${entries} entries read` : "Waiting for data",
        live ? `${bins} bin${bins === 1 ? "" : "s"} tracked` : "No bins yet",
        "Map · analytics · dispatch",
      ],
    },
  ];

  return (
    <div className={cn("eco-panel flex flex-wrap items-stretch gap-2 p-3", className)}>
      {stages.map((stage, i) => (
        <div key={stage.title} className="flex min-w-56 flex-1 items-center gap-2">
          <div className="flex flex-1 items-start gap-2.5 rounded-lg bg-muted/50 px-3 py-2">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <stage.icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{stage.title}</p>
              {stage.lines.map((line) => (
                <p key={line} className="truncate text-[11px] text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
          </div>
          {i < stages.length - 1 && (
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}

/** Shown wherever bin data is expected but no channel has been connected yet. */
export function ChannelSetupNotice() {
  return (
    <section className="eco-panel p-6">
      <h2 className="font-display text-lg font-bold">Connect your ThingSpeak channel</h2>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
        EcoBin shows only real telemetry — there is no sample data behind this screen. Point it at
        the ThingSpeak channel your ESP32 publishes to and every page fills in automatically.
      </p>
      <ol className="mt-4 space-y-2 text-sm">
        {[
          "Run the EcoBin sketch on the Wokwi ESP32 (or real hardware) and let it write to your channel.",
          `Publish fill level to ${DEFAULT_FIELD_MAP.fillLevel}, weight to ${DEFAULT_FIELD_MAP.weight}, status to ${DEFAULT_FIELD_MAP.status}, bin ID to ${DEFAULT_FIELD_MAP.binId} and priority to ${DEFAULT_FIELD_MAP.priority}.`,
          "Paste the channel ID (and read API key, for private channels) into Settings.",
        ].map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              {i + 1}
            </span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>
      <Button asChild className="mt-5 gap-2">
        <Link to="/admin/settings">
          <Settings className="size-4" aria-hidden />
          Open Settings
        </Link>
      </Button>
    </section>
  );
}

/** Inline banner for a configured channel that is currently failing or empty. */
export function ConnectionAlert() {
  const error = useEco((s) => s.connection.error);
  const loading = useEco((s) => s.connection.loading);
  const channelId = useEco((s) => s.settings.channelId);
  const refresh = useEco((s) => s.refresh);

  if (!channelId.trim() || !error) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-critical/30 bg-critical/10 px-4 py-3"
    >
      <AlertTriangle className="size-4 shrink-0 text-critical" aria-hidden />
      <p className="min-w-40 flex-1 text-sm">
        <span className="font-semibold">ThingSpeak sync failed.</span> {error}
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={() => void refresh()}
        className="gap-2"
      >
        {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        Retry now
      </Button>
      <Button asChild size="sm" variant="ghost">
        <Link to="/admin/settings">Settings</Link>
      </Button>
    </div>
  );
}

/**
 * Wraps any page that needs bin telemetry: shows the setup card when no channel
 * is configured, an error banner when the fetch fails, and the page otherwise.
 */
export function RequiresChannel({ children }: { children: React.ReactNode }) {
  const channelId = useEco((s) => s.settings.channelId);
  const bins = useEco((s) => s.bins.length);
  const loading = useEco((s) => s.connection.loading);
  const lastSync = useEco((s) => s.connection.lastSync);

  if (!channelId.trim()) return <ChannelSetupNotice />;

  return (
    <div className="space-y-4">
      <ConnectionAlert />
      {bins === 0 && !lastSync && loading ? (
        <div className="eco-panel grid place-items-center gap-2 p-10 text-center">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Reading the ThingSpeak channel…</p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
