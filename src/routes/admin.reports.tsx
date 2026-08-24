import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, SectionHeading } from "@/components/eco/primitives";
import { AssignTruckDialog, useAssignDialog } from "@/components/eco/assign-truck";
import { useEco } from "@/store/ecobin-store";
import { timeAgo } from "@/lib/ecobin-logic";
import type { ReportStatus } from "@/types/ecobin";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [
      { title: "Citizen Reports — EcoBin" },
      {
        name: "description",
        content:
          "Verify, queue, assign and resolve citizen reports inside the same municipal collection workflow.",
      },
      { property: "og:title", content: "Citizen Reports — EcoBin" },
      {
        property: "og:description",
        content: "Citizen reports feed the same operational queue as sensor alerts.",
      },
    ],
  }),
  component: Reports,
});

const TABS: (ReportStatus | "all")[] = [
  "all",
  "received",
  "verified",
  "queued",
  "resolved",
  "rejected",
];

const severityStyle: Record<string, string> = {
  high: "bg-critical/12 text-critical border-critical/30",
  medium: "bg-high/15 text-high border-high/30",
  low: "bg-normal/12 text-normal border-normal/30",
};

function Reports() {
  const reports = useEco((s) => s.reports);
  const setReportStatus = useEco((s) => s.setReportStatus);
  const [tab, setTab] = useState<ReportStatus | "all">("all");
  const [q, setQ] = useState("");
  const assign = useAssignDialog();

  const list = reports
    .filter((r) => (tab === "all" ? true : r.status === tab))
    .filter((r) =>
      q ? `${r.id} ${r.binId} ${r.location}`.toLowerCase().includes(q.toLowerCase()) : true,
    );

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Citizen reports"
        description="Community intelligence merged into EcoBin's prioritized operations workflow."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search report ID, bin or location"
          className="max-w-64"
          aria-label="Search reports"
        />
        {TABS.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? "default" : "outline"}
            className="capitalize"
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>

      {!list.length && (
        <EmptyState title="No reports" body="No citizen reports match this filter." />
      )}

      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id} className="eco-panel flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-48 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-sm font-bold">{r.id}</span>
                <span className="text-sm capitalize">{r.type.replace("-", " ")}</span>
                <Link
                  to="/admin/bins/$binId"
                  params={{ binId: r.binId }}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {r.binId}
                </Link>
                <Badge variant="outline" className={`uppercase ${severityStyle[r.severity]}`}>
                  {r.severity}
                </Badge>
                <Badge variant="secondary" className="capitalize">
                  {r.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
              <p className="text-xs text-muted-foreground">
                {r.location} · {timeAgo(r.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setReportStatus(r.id, "verified")}>
                Verify
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setReportStatus(r.id, "queued");
                  toast.success(`${r.id} added to the collection queue`);
                }}
              >
                Add to queue
              </Button>
              <Button size="sm" variant="secondary" onClick={() => assign.openFor(r.binId)}>
                Assign truck
              </Button>
              <Button size="sm" onClick={() => setReportStatus(r.id, "resolved")}>
                Resolve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReportStatus(r.id, "rejected")}>
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <AssignTruckDialog
        binId={assign.binId}
        open={assign.open}
        onOpenChange={assign.onOpenChange}
      />
    </div>
  );
}
