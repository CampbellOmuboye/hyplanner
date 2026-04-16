"use client";

import { OPPORTUNITY_COLORS } from "@/lib/constants";

const ITEMS: { key: keyof typeof OPPORTUNITY_COLORS; label: string }[] = [
  { key: "Investable", label: "Investable" },
  { key: "Viable", label: "Viable" },
  { key: "Emerging", label: "Emerging" },
];

export function MapLegendSimple() {
  return (
    <div
      className="rounded-lg border border-neutral-200/80 bg-white/95 px-4 py-3 shadow-lg backdrop-blur"
      style={{ boxShadow: "var(--panel-shadow)" }}
    >
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        Opportunity classification
      </div>
      <div className="flex flex-col gap-2.5">
        {ITEMS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2.5">
            <div
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: OPPORTUNITY_COLORS[key] }}
            />
            <span className="text-sm text-neutral-700">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
