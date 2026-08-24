import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Send } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EcoLogo } from "@/components/eco/primitives";
import { useEco } from "@/store/ecobin-store";
import { useEcoSync } from "@/hooks/use-eco-sync";
import type { ReportType } from "@/types/ecobin";

export const Route = createFileRoute("/report")({
  validateSearch: (search: Record<string, unknown>): { bin?: string | undefined } => ({
    bin: typeof search["bin"] === "string" ? (search["bin"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Report a Bin — EcoBin" },
      {
        name: "description",
        content:
          "Report an overflowing, damaged or smelly waste bin. Your report reaches the municipal collection team instantly.",
      },
      { property: "og:title", content: "Report a Bin — EcoBin" },
      {
        property: "og:description",
        content: "Tell the municipal team about a waste problem in your neighbourhood.",
      },
    ],
  }),
  component: ReportPage,
});

const TYPES: { value: ReportType; label: string }[] = [
  { value: "overflowing", label: "Overflowing bin" },
  { value: "damaged", label: "Damaged bin" },
  { value: "smell", label: "Bad smell" },
  { value: "garbage-outside", label: "Garbage outside bin" },
  { value: "other", label: "Other" },
];

function ReportPage() {
  useEcoSync();
  const { bin } = Route.useSearch();
  const submitReport = useEco((s) => s.submitReport);
  const bins = useEco((s) => s.bins);

  const [binId, setBinId] = useState(bin || "");
  const [type, setType] = useState<ReportType>("overflowing");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photoName, setPhotoName] = useState<string | undefined>(undefined);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const created = submitReport({
      binId: binId || "UNKNOWN",
      type,
      description,
      location: location || bins.find((b) => b.id === binId)?.ward || "Dibrugarh",
      photoName,
    });
    setSubmitted(created.id);
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" aria-label="EcoBin home">
            <EcoLogo />
          </Link>
          <Link to="/map" className="text-sm font-medium text-primary hover:underline">
            Public bin map
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10">
        {submitted ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="eco-panel p-8 text-center"
          >
            <CheckCircle2 className="mx-auto size-12 text-normal" aria-hidden />
            <h1 className="mt-4 font-display text-2xl font-bold">Report submitted successfully</h1>
            <p className="mt-2 text-sm text-muted-foreground">Report ID</p>
            <p className="font-display text-3xl font-bold">{submitted}</p>
            <p className="mt-3 text-sm">
              Status: <strong>Received</strong>
              <br />
              The municipal team has been notified and this report now feeds the EcoBin collection
              queue.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="outline" onClick={() => setSubmitted(null)}>
                Report another bin
              </Button>
              <Button asChild>
                <Link to="/">Back to home</Link>
              </Button>
            </div>
          </motion.div>
        ) : (
          <>
            <h1 className="font-display text-3xl font-bold">Report a bin</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Citizen reports are prioritised alongside live sensor alerts inside the municipal
              command centre.
            </p>
            <form onSubmit={onSubmit} className="eco-panel mt-6 space-y-4 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="type">Report type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="binId">Bin ID</Label>
                  <Input
                    id="binId"
                    list="bin-options"
                    value={binId}
                    onChange={(e) => setBinId(e.target.value.toUpperCase())}
                    placeholder="BIN-01"
                  />
                  <datalist id="bin-options">
                    {bins.map((b) => (
                      <option key={b.id} value={b.id} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Street, ward or landmark"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desc">Description</Label>
                <Textarea
                  id="desc"
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what you saw"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="photo">Photo (optional)</Label>
                <Input
                  id="photo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoName(e.target.files?.[0]?.name)}
                />
              </div>
              <Button type="submit" className="w-full gap-2">
                <Send className="size-4" aria-hidden /> Submit report
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
