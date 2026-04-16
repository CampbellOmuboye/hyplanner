"use client";

import { INFRASTRUCTURE_LAYERS } from "@/lib/constants";

const LAYER_LABELS: Record<string, string> = {
  ports: "Ports",
  hydrogenPipelines: "Hydrogen pipelines",
  powerGrid: "Power grid",
  industrialClusters: "Industrial clusters",
  renewableSites: "Renewable energy sites",
  co2Transport: "CO₂ transport",
};

export function LayerTogglesSimple({
  layers,
  onToggle,
}: {
  layers: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div
      className="rounded-lg border border-neutral-200/80 bg-white/95 px-4 py-3 shadow-lg backdrop-blur"
      style={{ boxShadow: "var(--panel-shadow)" }}
    >
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        Infrastructure layers
      </div>
      <div className="flex flex-col gap-2">
        {INFRASTRUCTURE_LAYERS.map((layer) => (
          <label
            key={layer.id}
            className="flex cursor-pointer items-center gap-2.5 text-sm text-neutral-700"
          >
            <input
              type="checkbox"
              checked={layers.has(layer.id)}
              onChange={() => onToggle(layer.id)}
              className="h-4 w-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500/30"
            />
            {LAYER_LABELS[layer.id] ?? layer.id}
          </label>
        ))}
      </div>
    </div>
  );
}
