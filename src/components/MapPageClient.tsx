"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import { ControlBar } from "@/components/ControlBar";
import { MapLegend } from "@/components/MapLegend";
import { LayerToggles } from "@/components/LayerToggles";
import { RegionInsightPanel } from "@/components/RegionInsightPanel";
import { LENSES } from "@/lib/constants";
import type { Lens } from "@/lib/types";
import type { InfrastructureLayerId } from "@/lib/types";

const MapView = dynamic(
  () => import("@/components/MapView").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-neutral-50">
        <div className="rounded-lg border border-neutral-200 bg-white px-6 py-4 text-sm font-medium text-neutral-600 shadow-sm">
          Loading map…
        </div>
      </div>
    ),
  }
);

export function MapPageClient() {
  const locale = useLocale();
  const [currentLens, setCurrentLens] = useState<Lens>(LENSES[0]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [layers, setLayers] = useState<Set<InfrastructureLayerId | string>>(
    new Set()
  );

  const handleLensChange = useCallback((lens: Lens) => {
    setCurrentLens(lens);
  }, []);

  const handleRegionClick = useCallback((regionId: string) => {
    setSelectedRegionId(regionId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedRegionId(null);
  }, []);

  const handleLayerToggle = useCallback((id: string) => {
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <ControlBar currentLens={currentLens} onLensChange={handleLensChange} />
      <div className="absolute inset-0 top-12">
        <MapView
          onRegionClick={handleRegionClick}
          currentLensId={currentLens.id}
          activeLayers={layers}
        />
        <div className="absolute left-4 top-4 z-[500] flex flex-col gap-4">
          <LayerToggles layers={layers} onToggle={handleLayerToggle} />
          <MapLegend />
        </div>
      </div>
      <RegionInsightPanel
        regionId={selectedRegionId}
        locale={locale}
        onClose={handleClosePanel}
      />
    </div>
  );
}
