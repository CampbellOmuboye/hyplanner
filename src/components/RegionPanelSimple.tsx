"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { getRegionById } from "@/lib/mockRegions";
import { OPPORTUNITY_COLORS } from "@/lib/constants";
import type { OpportunityClassification } from "@/lib/types";

const READINESS_LABELS: { key: "energy" | "infrastructure" | "policy" | "ecosystem"; label: string }[] = [
  { key: "energy", label: "Energy readiness" },
  { key: "infrastructure", label: "Infrastructure readiness" },
  { key: "policy", label: "Policy readiness" },
  { key: "ecosystem", label: "Ecosystem readiness" },
];

function ReadinessBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-sm font-medium text-neutral-700">
        {value}
      </span>
    </div>
  );
}

export function RegionPanelSimple({
  regionId,
  onClose,
}: {
  regionId: string | null;
  onClose: () => void;
}) {
  const region = regionId ? getRegionById(regionId) : null;

  return (
    <Dialog.Root open={!!regionId} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col rounded-l-xl border-l border-neutral-200 bg-white shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
          style={{ boxShadow: "-4px 0 24px -4px rgba(0,0,0,0.08)" }}
          onPointerDownOutside={onClose}
          onEscapeKeyDown={onClose}
        >
          {region && (
            <>
              <div className="flex items-start justify-between border-b border-neutral-100 bg-neutral-50/80 p-5">
                <div className="min-w-0 flex-1 pr-3">
                  <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
                    {region.name}
                  </h2>
                  <span
                    className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium text-white shadow-sm"
                    style={{
                      backgroundColor:
                        OPPORTUNITY_COLORS[
                          region.classification as OpportunityClassification
                        ],
                    }}
                  >
                    {region.classification}
                  </span>
                </div>
                <Dialog.Close
                  className="flex shrink-0 rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                  aria-label="Close"
                >
                  <span className="text-lg leading-none">×</span>
                </Dialog.Close>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <section className="mb-6">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                    Opportunity summary
                  </h3>
                  <p className="text-sm leading-relaxed text-neutral-700">
                    {region.summary}
                  </p>
                </section>

                <section className="mb-6">
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                    Readiness scores
                  </h3>
                  <div className="space-y-3">
                    {READINESS_LABELS.map(({ key, label }) => (
                      <div key={key}>
                        <div className="mb-1 text-xs font-medium text-neutral-600">
                          {label}
                        </div>
                        <ReadinessBar value={region.readiness[key]} />
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                    Infrastructure signals
                  </h3>
                  <ul className="space-y-1.5 text-sm leading-relaxed text-neutral-700">
                    {region.infrastructureSignals.map((signal, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                        <span>{signal}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
