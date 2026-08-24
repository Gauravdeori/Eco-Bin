import { motion } from "motion/react";
import { Leaf, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BinStatus } from "@/types/ecobin";
import { STATUS_LABEL } from "@/lib/ecobin-config";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function EcoLogo({
  className,
  showText = true,
  tone = "default",
}: {
  className?: string;
  showText?: boolean;
  tone?: "default" | "sidebar";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "relative grid size-9 place-items-center rounded-xl",
          tone === "sidebar"
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "bg-primary text-primary-foreground",
        )}
      >
        <Trash2 className="size-4.5" aria-hidden />
        <Leaf
          className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full bg-accent p-0.5 text-accent-foreground"
          aria-hidden
        />
      </span>
      {showText && (
        <span
          className={cn(
            "font-display text-lg font-bold tracking-tight",
            tone === "sidebar" ? "text-sidebar-foreground" : "text-foreground",
          )}
        >
          Eco<span className="text-primary">Bin</span>
        </span>
      )}
    </span>
  );
}

const statusStyles: Record<BinStatus, string> = {
  normal: "bg-normal/12 text-normal border-normal/30",
  filling: "bg-filling/15 text-filling-foreground border-filling/40",
  high: "bg-high/15 text-high border-high/35",
  critical: "bg-critical/12 text-critical border-critical/35",
  offline: "bg-offline/15 text-muted-foreground border-offline/35",
};

export function StatusBadge({
  status,
  className,
  dot = true,
}: {
  status: BinStatus;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        statusStyles[status],
        className,
      )}
    >
      {dot && <StatusDot status={status} />}
      {STATUS_LABEL[status]}
    </span>
  );
}

const dotBg: Record<BinStatus, string> = {
  normal: "bg-normal",
  filling: "bg-filling",
  high: "bg-high",
  critical: "bg-critical",
  offline: "bg-offline",
};

export function StatusDot({ status, className }: { status: BinStatus; className?: string }) {
  return (
    <span className={cn("relative flex size-2", className)}>
      {status === "critical" && (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-70",
            dotBg[status],
          )}
        />
      )}
      <span className={cn("relative inline-flex size-2 rounded-full", dotBg[status])} />
    </span>
  );
}

export function FillBar({ value, status }: { value: number; status: BinStatus }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="presentation">
      <motion.div
        className={cn("h-full rounded-full", dotBg[status])}
        initial={false}
        animate={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </div>
  );
}

export function InfoHint({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="More information"
            className="ml-1.5 inline-grid size-4 translate-y-px place-items-center rounded-full border border-border text-[10px] font-bold text-muted-foreground"
          >
            i
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-xs">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
  accent = "primary",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  accent?: "primary" | "normal" | "filling" | "high" | "critical" | "muted";
}) {
  const accents: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    normal: "text-normal bg-normal/12",
    filling: "text-filling-foreground bg-filling/20",
    high: "text-high bg-high/15",
    critical: "text-critical bg-critical/12",
    muted: "text-muted-foreground bg-muted",
  };
  return (
    <div className="eco-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && (
          <span className={cn("grid size-8 place-items-center rounded-lg", accents[accent])}>
            {icon}
          </span>
        )}
      </div>
      <motion.p
        key={String(value)}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mt-2 font-display text-3xl font-bold tabular-nums"
      >
        {value}
      </motion.p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="eco-panel grid place-items-center p-10 text-center">
      <p className="font-display text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
