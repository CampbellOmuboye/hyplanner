"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { getRegionById } from "@/lib/opportunity-map/mockRegions";
import { OPPORTUNITY_COLORS } from "@/lib/opportunity-map/constants";
import type { OpportunityClassification } from "@/lib/opportunity-map/types";

function label(locale: string, en: string, nl: string) {
  return locale === "nl" ? nl : en;
}

function ClassificationBadge({
  classification,
  locale,
}: {
  classification: OpportunityClassification;
  locale: string;
}) {
  const text =
    classification === "Emerging"
      ? label(locale, "Emerging", "In ontwikkeling")
      : classification === "Viable"
        ? label(locale, "Viable", "Levensvatbaar")
        : label(locale, "Investable", "Investeerbaar");

  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: OPPORTUNITY_COLORS[classification] }}
    >
      {text}
    </span>
  );
}

export function RegionInsightPanel({
  regionId,
  locale,
  onClose,
}: {
  regionId: string | null;
  locale: string;
  onClose: () => void;
}) {
  const region = regionId ? getRegionById(regionId) : null;
  const name = region
    ? locale === "nl" && region.nameNl
      ? region.nameNl
      : region.name
    : "";
  const summary = region
    ? locale === "nl" && region.summaryNl
      ? region.summaryNl
      : region.summary
    : "";

  return (
    <Dialog.Root open={!!regionId} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[600] bg-black/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed right-0 top-0 z-[700] flex h-full w-full max-w-md flex-col border-l border-neutral-200 bg-white shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
          onPointerDownOutside={onClose}
          onEscapeKeyDown={onClose}
        >
          {region && (
            <>
              <div className="flex items-center justify-between border-b border-neutral-100 p-4">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">{name}</h2>
                  <ClassificationBadge classification={region.classification} locale={locale} />
                </div>
                <Dialog.Close
                  className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                  aria-label={label(locale, "Close", "Sluiten")}
                >
                  ✕
                </Dialog.Close>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <section className="mb-4">
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {label(locale, "Opportunity summary", "Samenvatting")}
                  </h3>
                  <p className="text-sm text-neutral-700">{summary}</p>
                </section>

                <section className="mb-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {label(locale, "Readiness scores", "Gereedheidsscores")}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-neutral-100 bg-neutral-50/50 p-2">
                      <div className="text-xs text-neutral-500">
                        {label(locale, "Energy readiness", "Energie")}
                      </div>
                      <div className="text-lg font-semibold text-neutral-800">
                        {region.readiness.energy}
                        <span className="text-xs font-normal text-neutral-500">/100</span>
                      </div>
                    </div>
                    <div className="rounded-md border border-neutral-100 bg-neutral-50/50 p-2">
                      <div className="text-xs text-neutral-500">
                        {label(locale, "Infrastructure readiness", "Infrastructuur")}
                      </div>
                      <div className="text-lg font-semibold text-neutral-800">
                        {region.readiness.infrastructure}
                        <span className="text-xs font-normal text-neutral-500">/100</span>
                      </div>
                    </div>
                    <div className="rounded-md border border-neutral-100 bg-neutral-50/50 p-2">
                      <div className="text-xs text-neutral-500">
                        {label(locale, "Policy readiness", "Beleid")}
                      </div>
                      <div className="text-lg font-semibold text-neutral-800">
                        {region.readiness.policy}
                        <span className="text-xs font-normal text-neutral-500">/100</span>
                      </div>
                    </div>
                    <div className="rounded-md border border-neutral-100 bg-neutral-50/50 p-2">
                      <div className="text-xs text-neutral-500">
                        {label(locale, "Ecosystem readiness", "Ecosysteem")}
                      </div>
                      <div className="text-lg font-semibold text-neutral-800">
                        {region.readiness.ecosystem}
                        <span className="text-xs font-normal text-neutral-500">/100</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="mb-4">
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {label(locale, "Infrastructure signals", "Infrastructuursignalen")}
                  </h3>
                  <ul className="list-inside list-disc space-y-0.5 text-sm text-neutral-700">
                    {region.infrastructureSignals.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </section>

                <section className="mb-4">
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {label(locale, "Ecosystem actors", "Ecosysteemactoren")}
                  </h3>
                  <ul className="space-y-1.5">
                    {region.ecosystemActors.map((a, i) => (
                      <li key={i} className="rounded border border-neutral-100 bg-white p-2 text-sm">
                        <span className="font-medium text-neutral-900">{a.name}</span>
                        <span className="text-neutral-500"> — {a.role}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="mb-4">
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {label(locale, "Opportunity drivers", "Drijvers")}
                  </h3>
                  <ul className="list-inside list-disc space-y-0.5 text-sm text-neutral-700">
                    {region.opportunityDrivers.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {label(locale, "Development gaps", "Ontwikkelgaten")}
                  </h3>
                  <ul className="list-inside list-disc space-y-0.5 text-sm text-neutral-700">
                    {region.developmentGaps.map((g, i) => (
                      <li key={i}>{g}</li>
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

