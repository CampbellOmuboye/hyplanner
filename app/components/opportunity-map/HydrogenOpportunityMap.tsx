"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

import { MapLegendSimple } from "./MapLegendSimple";
import { RegionInsightPanel } from "./RegionInsightPanel";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-50">
      <div className="rounded-lg border border-zinc-200 bg-white px-6 py-4 text-sm font-medium text-zinc-600 shadow-sm">
        Loading map…
      </div>
    </div>
  ),
});

type Signals = {
  renewables: boolean;
  grid: boolean;
  transport: boolean;
  industry: boolean;
};

function computeLensId(signals: Signals): string {
  if (signals.transport) return "hydrogenTransport";
  if (signals.industry) return "hydrogenDemand";
  return "hydrogenProduction";
}

function computeActiveLayers(signals: Signals): Set<string> {
  const layers = new Set<string>();

  if (signals.renewables) layers.add("renewableSites");
  if (signals.grid) layers.add("powerGrid");
  if (signals.transport) {
    layers.add("hydrogenPipelines");
    layers.add("co2Transport");
  }
  if (signals.industry) {
    layers.add("industrialClusters");
    layers.add("ports");
  }

  return layers;
}

export function HydrogenOpportunityMap({
  signals,
  onSelectRegion,
}: {
  signals: Signals;
  onSelectRegion?: (regionId: string) => void;
}) {
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const currentLensId = useMemo(() => computeLensId(signals), [signals]);
  const activeLayers = useMemo(() => computeActiveLayers(signals), [signals]);
  const locale = useMemo(() => {
    if (typeof navigator === "undefined") return "en";
    return navigator.language?.toLowerCase().startsWith("nl") ? "nl" : "en";
  }, []);

  return (
    <div className="w-full">
      <div className="relative h-[420px] w-full overflow-hidden rounded-xl border border-zinc-200 bg-white md:h-[520px] lg:h-[640px]">
        <MapView
          onRegionClick={(regionId) => {
            setSelectedRegionId(regionId);
            onSelectRegion?.(regionId);
          }}
          currentLensId={currentLensId}
          activeLayers={activeLayers}
        />
        <div className="pointer-events-none absolute left-3 top-3 z-[400]">
          <div className="pointer-events-auto">
            <MapLegendSimple />
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        Click a region to view readiness and infrastructure signals.
      </p>

      <RegionInsightPanel
        regionId={selectedRegionId}
        locale={locale}
        onClose={() => setSelectedRegionId(null)}
      />
    </div>
  );
}

