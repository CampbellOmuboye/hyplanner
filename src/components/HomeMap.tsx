"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { RegionPanelSimple } from "@/components/RegionPanelSimple";
import { MapLegendSimple } from "@/components/MapLegendSimple";
import { LayerTogglesSimple } from "@/components/LayerTogglesSimple";

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

export function HomeMap() {
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [layers, setLayers] = useState<Set<string>>(new Set());

  const handleRegionClick = useCallback((id: string) => {
    setSelectedRegionId((prev) => (prev === id ? null : id));
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
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-neutral-50/80 px-6 shadow-sm">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-neutral-900 hover:text-neutral-700"
        >
          Opportunity Atlas
        </Link>
        <Link
          href="/"
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          Home
        </Link>
      </header>
      <div className="relative min-h-0 flex-1">
        <MapView onRegionClick={handleRegionClick} />
        <div className="absolute left-4 top-16 z-[500] flex flex-col gap-4">
          <LayerTogglesSimple layers={layers} onToggle={handleLayerToggle} />
          <MapLegendSimple />
        </div>
      </div>
      <RegionPanelSimple
        regionId={selectedRegionId}
        onClose={handleClosePanel}
      />
    </div>
  );
}
