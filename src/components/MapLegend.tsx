"use client";

import { useTranslations } from "next-intl";
import { OPPORTUNITY_COLORS } from "@/lib/constants";

export function MapLegend() {
  const t = useTranslations("map");
  return (
    <div className="rounded-md border border-neutral-200 bg-white/95 p-2 shadow-md backdrop-blur">
      <div className="mb-1.5 text-xs font-semibold text-neutral-600">
        {t("legendTitle")}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-5 rounded border border-neutral-300"
            style={{ backgroundColor: OPPORTUNITY_COLORS.Emerging }}
          />
          <span className="text-xs text-neutral-700">{t("emerging")}</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-5 rounded border border-neutral-300"
            style={{ backgroundColor: OPPORTUNITY_COLORS.Viable }}
          />
          <span className="text-xs text-neutral-700">{t("viable")}</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-5 rounded border border-neutral-300"
            style={{ backgroundColor: OPPORTUNITY_COLORS.Investable }}
          />
          <span className="text-xs text-neutral-700">{t("investable")}</span>
        </div>
      </div>
    </div>
  );
}
