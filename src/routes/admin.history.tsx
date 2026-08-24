import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, SectionHeading } from "@/components/eco/primitives";
import { useEco } from "@/store/ecobin-store";
import { fmtDateTime } from "@/lib/ecobin-logic";

export const Route = createFileRoute("/admin/history")({
  head: () => ({
    meta: [
      { title: "Collection History — EcoBin" },
      {
        name: "description",
        content:
          "Searchable, filterable and exportable log of every completed bin collection with weight and duration.",
      },
      { property: "og:title", content: "Collection History — EcoBin" },
      { property: "og:description", content: "Every completed collection, exportable as CSV." },
    ],
  }),
  component: History,
});

function History() {
  const collections = useEco((s) => s.collections);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = collections
    .filter((c) =>
      q ? `${c.binId} ${c.truckId} ${c.workerName}`.toLowerCase().includes(q.toLowerCase()) : true,
    )
    .filter((c) => (from ? c.timestamp >= from : true))
    .filter((c) => (to ? c.timestamp <= `${to}T23:59:59Z` : true))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const exportCsv = () => {
    const header = [
      "Collection ID",
      "Bin",
      "Date/Time",
      "Weight (kg)",
      "Worker",
      "Truck",
      "Duration (min)",
      "Status",
    ];
    const body = rows.map((c) =>
      [
        c.id,
        c.binId,
        c.timestamp,
        c.collectedWeight,
        c.workerName,
        c.truckId,
        c.durationMinutes,
        c.status,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ecobin-collection-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Collection history"
        description="Complete operational record of collections across the fleet."
      />

      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search bin, truck or worker"
          className="max-w-64"
          aria-label="Search collection history"
        />
        <label className="text-xs text-muted-foreground">
          From
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
        </label>
        <Button variant="outline" className="ml-auto gap-2" onClick={exportCsv}>
          <Download className="size-4" aria-hidden /> Export CSV
        </Button>
      </div>

      {!rows.length ? (
        <EmptyState title="No collections" body="No records match the current filters." />
      ) : (
        <div className="eco-panel overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Collection history</caption>
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Bin
                </th>
                <th scope="col" className="px-3 py-2">
                  Date &amp; time
                </th>
                <th scope="col" className="px-3 py-2">
                  Weight
                </th>
                <th scope="col" className="px-3 py-2">
                  Worker
                </th>
                <th scope="col" className="px-3 py-2">
                  Truck
                </th>
                <th scope="col" className="px-3 py-2">
                  Duration
                </th>
                <th scope="col" className="px-3 py-2">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-medium">{c.binId}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(c.timestamp)}</td>
                  <td className="px-3 py-2 tabular-nums">{c.collectedWeight} kg</td>
                  <td className="px-3 py-2">{c.workerName}</td>
                  <td className="px-3 py-2">{c.truckId}</td>
                  <td className="px-3 py-2 tabular-nums">{c.durationMinutes} min</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="capitalize">
                      {c.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
