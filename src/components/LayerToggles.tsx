"use client";

import { useTranslations } from "next-intl";
import { INFRASTRUCTURE_LAYERS } from "@/lib/constants";
import type { InfrastructureLayerId } from "@/lib/types";

export function LayerToggles({
  layers,
  onToggle,
}: {
  layers: Set<InfrastructureLayerId | string>;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("map");
  const tLayers = useTranslations("layers");
  return (
    <div className="rounded-md border border-neutral-200 bg-white/95 p-2 shadow-md backdrop-blur">
      <div className="mb-1.5 text-xs font-semibold text-neutral-600">
        {t("layersTitle")}
      </div>
      <div className="flex flex-col gap-1">
        {INFRASTRUCTURE_LAYERS.map((layer) => (
          <label
            key={layer.id}
            className="flex cursor-pointer items-center gap-2 text-xs text-neutral-700"
          >
            <input
              type="checkbox"
              checked={layers.has(layer.id)}
              onChange={() => onToggle(layer.id)}
              className="h-3.5 w-3.5 rounded border-neutral-300"
            />
            {tLayers(layer.labelKey)}
          </label>
        ))}
      </div>
    </div>
  );
}
