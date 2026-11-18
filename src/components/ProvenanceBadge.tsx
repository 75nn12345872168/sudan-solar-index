import type { DataStatus, PriceBasis } from "@/types/solar";

export function formatObservedTimeAr(iso: string | null): string {
  if (!iso) return "لم يُرصد ميدانياً بعد";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Intl.DateTimeFormat("ar-SD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

export function ProvenanceBadge({
  status,
  compact = false,
}: {
  status: DataStatus;
  compact?: boolean;
}) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        {compact ? "بيانات حية" : "بيانات حية (خلال 24 ساعة)"}
      </span>
    );
  }
  if (status === "stale") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        {compact ? "رصد قديم" : "آخر رصد قديم (>24 ساعة)"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-0.5 text-xs font-semibold text-cyan-400">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
      {compact ? "مرجعي تقديري" : "أسعار مرجعية تقديرية (Demo)"}
    </span>
  );
}

export function PriceBasisBadge({ basis }: { basis: PriceBasis }) {
  const map: Record<PriceBasis, { label: string; cls: string }> = {
    observed: {
      label: "وسيط مرصود",
      cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    },
    manual: {
      label: "تعديل ميداني يدوي",
      cls: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    },
    reference: {
      label: "سعر كتالوج مرجعي",
      cls: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    },
  };
  const cfg = map[basis];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
