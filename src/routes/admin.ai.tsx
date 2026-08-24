import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Camera, Upload } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, InfoHint, SectionHeading } from "@/components/eco/primitives";
import { useEco } from "@/store/ecobin-store";
import { fmtDateTime } from "@/lib/ecobin-logic";
import type { WasteCategory } from "@/types/ecobin";

export const Route = createFileRoute("/admin/ai")({
  head: () => ({
    meta: [
      { title: "Waste Classification — EcoBin" },
      {
        name: "description",
        content:
          "Record the waste category found in a bin and turn it into a collection recommendation.",
      },
      { property: "og:title", content: "Waste Classification — EcoBin" },
      { property: "og:description", content: "Waste categorisation wired into EcoBin operations." },
    ],
  }),
  component: ClassificationPage,
});

const CATEGORY_META: Record<
  WasteCategory,
  { label: string; recyclable: boolean; insight: string; action: string }
> = {
  plastic: {
    label: "Plastic",
    recyclable: true,
    insight: "High recyclable content",
    action: "Flag this bin for recyclable recovery before landfill routing.",
  },
  metal: {
    label: "Metal",
    recyclable: true,
    insight: "High-value recyclable content",
    action: "Route to the scrap-recovery yard on the next collection pass.",
  },
  food: {
    label: "Food waste",
    recyclable: false,
    insight: "High organic content",
    action: "Prioritise the organic-waste route to limit odour complaints.",
  },
  plant: {
    label: "Plant waste",
    recyclable: false,
    insight: "Green / garden waste",
    action: "Divert to composting rather than mixed municipal disposal.",
  },
};

const CATEGORIES = Object.keys(CATEGORY_META) as WasteCategory[];

/**
 * EcoBin records classifications rather than inventing them: no image model is
 * connected, so an operator states what the photo shows. Wiring a real
 * YOLO/OpenCV endpoint means replacing this form's submit handler — the stored
 * record, the charts and the bin history already accept the same shape.
 */
function ClassificationPage() {
  const classifications = useEco((s) => s.classifications);
  const addClassification = useEco((s) => s.addClassification);
  const bins = useEco((s) => s.bins);

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<WasteCategory>("plastic");
  const [confidence, setConfidence] = useState("90");
  const [binId, setBinId] = useState("");
  const [saved, setSaved] = useState<WasteCategory | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setSaved(null);
    setPreview(URL.createObjectURL(f));
  };

  const save = () => {
    const value = Math.max(0, Math.min(100, Number(confidence) || 0));
    addClassification({
      category,
      confidence: value,
      ...(file ? { imageName: file.name } : {}),
      ...(binId ? { binId: binId.toUpperCase() } : {}),
    });
    setSaved(category);
    toast.success(`${CATEGORY_META[category].label} recorded`);
  };

  const meta = saved ? CATEGORY_META[saved] : CATEGORY_META[category];

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Waste classification"
        description="Record what a bin actually contains so collection routing can act on it."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="eco-panel p-4">
          <div
            className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border bg-muted/40 p-4"
            aria-label="Image preview area"
          >
            {preview ? (
              <img
                src={preview}
                alt="Selected waste sample"
                className="max-h-56 rounded-lg object-contain"
              />
            ) : (
              <div className="text-center text-sm text-muted-foreground">
                <Camera className="mx-auto mb-2 size-8" aria-hidden />
                Attach a photo of the waste (optional)
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Upload waste image"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            className="mt-3 w-full gap-2"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden /> {file ? file.name : "Attach image"}
          </Button>
        </div>

        <div className="eco-panel space-y-3 p-4">
          <h2 className="font-display text-base font-semibold">
            Record a classification
            <InfoHint>
              No image model is connected, so EcoBin never guesses a category. Enter what the sample
              shows; a real classifier can populate the same record later.
            </InfoHint>
          </h2>

          <div className="space-y-1.5">
            <Label htmlFor="cat">Waste category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as WasteCategory)}>
              <SelectTrigger id="cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="conf">Certainty (%)</Label>
              <Input
                id="conf"
                type="number"
                min={0}
                max={100}
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bin">Bin (optional)</Label>
              <Input
                id="bin"
                list="classify-bins"
                value={binId}
                placeholder="BIN-01"
                onChange={(e) => setBinId(e.target.value.toUpperCase())}
              />
              <datalist id="classify-bins">
                {bins.map((b) => (
                  <option key={b.id} value={b.id} />
                ))}
              </datalist>
            </div>
          </div>

          <Button className="w-full" onClick={save}>
            Save classification
          </Button>

          <motion.div
            key={meta.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-border bg-muted/50 p-3 text-sm"
          >
            <p className="flex items-center gap-2 font-medium">
              {meta.insight}
              <Badge variant={meta.recyclable ? "secondary" : "outline"}>
                {meta.recyclable ? "Recyclable" : "Organic"}
              </Badge>
            </p>
            <p className="mt-1 text-muted-foreground">Recommendation: {meta.action}</p>
          </motion.div>
        </div>
      </div>

      <div className="eco-panel p-4">
        <h2 className="font-display text-base font-semibold">Recorded classifications</h2>
        {!classifications.length ? (
          <EmptyState title="Nothing recorded yet" body="Saved classifications appear here." />
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {classifications.slice(0, 10).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium">{CATEGORY_META[c.category].label}</span>
                <span className="tabular-nums text-muted-foreground">{c.confidence}%</span>
                <Badge variant="outline">{c.recyclable ? "Recyclable" : "Organic"}</Badge>
                {c.binId && <span className="text-muted-foreground">{c.binId}</span>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {fmtDateTime(c.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
