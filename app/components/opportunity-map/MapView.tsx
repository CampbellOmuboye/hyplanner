"use client";

import { useCallback, useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Circle, CircleMarker, Polyline } from "react-leaflet";
import { MOCK_REGIONS, getRegionCenter } from "@/lib/opportunity-map/mockRegions";
import {
  PORTS,
  HYDROGEN_PIPELINES,
  POWER_GRID_POINTS,
  INDUSTRIAL_CLUSTERS,
  RENEWABLE_SITES,
  CO2_TRANSPORT,
} from "@/lib/opportunity-map/infrastructureData";
import { OPPORTUNITY_COLORS, NETHERLANDS_CENTER, NETHERLANDS_DEFAULT_ZOOM } from "@/lib/opportunity-map/constants";
import type { OpportunityClassification } from "@/lib/opportunity-map/types";

/** Circle radius in meters for opportunity indicators */
const REGION_CIRCLE_RADIUS_M = 22_000;

function RegionLayer({
  onRegionClick,
  currentLensId,
}: {
  onRegionClick: (regionId: string) => void;
  currentLensId?: string;
}) {
  const getPathOptions = useCallback(
    (classification: OpportunityClassification) => ({
      fillColor: OPPORTUNITY_COLORS[classification],
      fillOpacity: 0.48,
      color: "#94a3b8",
      weight: 1.2,
    }),
    []
  );

  const fallbackClassification: OpportunityClassification = "Emerging";

  return (
    <>
      {MOCK_REGIONS.map((region) => {
        const raw =
          (currentLensId && region.classificationByLens?.[currentLensId]) ?? region.classification;
        const classification: OpportunityClassification = raw === "Viable" || raw === "Investable" ? raw : fallbackClassification;
        const center = getRegionCenter(region);
        const pathOptions = getPathOptions(classification);
        return (
          <Circle
            key={region.id}
            center={center}
            radius={REGION_CIRCLE_RADIUS_M}
            pathOptions={pathOptions}
            eventHandlers={{
              click: () => onRegionClick(region.id),
              mouseover: (e) => {
                const layer = e.target;
                layer.setStyle({
                  fillOpacity: 0.68,
                  weight: 1.5,
                  color: "#64748b",
                });
                layer.bringToFront();
              },
              mouseout: (e) => {
                e.target.setStyle(pathOptions);
              },
            }}
          />
        );
      })}
    </>
  );
}

function InfrastructureLayers({ activeLayers }: { activeLayers: Set<string> }) {
  return (
    <>
      {activeLayers.has("ports") &&
        PORTS.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={6}
            pathOptions={{ fillColor: "#0ea5e9", color: "#0284c7", weight: 1, fillOpacity: 0.8 }}
          />
        ))}
      {activeLayers.has("hydrogenPipelines") &&
        HYDROGEN_PIPELINES.map((seg) => (
          <Polyline
            key={seg.id}
            positions={seg.coordinates}
            pathOptions={{ color: "#22c55e", weight: 3, opacity: 0.8 }}
          />
        ))}
      {activeLayers.has("powerGrid") &&
        POWER_GRID_POINTS.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={4}
            pathOptions={{ fillColor: "#eab308", color: "#ca8a04", weight: 1, fillOpacity: 0.9 }}
          />
        ))}
      {activeLayers.has("industrialClusters") &&
        INDUSTRIAL_CLUSTERS.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={5}
            pathOptions={{ fillColor: "#a855f7", color: "#9333ea", weight: 1, fillOpacity: 0.8 }}
          />
        ))}
      {activeLayers.has("renewableSites") &&
        RENEWABLE_SITES.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={5}
            pathOptions={{ fillColor: "#84cc16", color: "#65a30d", weight: 1, fillOpacity: 0.8 }}
          />
        ))}
      {activeLayers.has("co2Transport") &&
        CO2_TRANSPORT.map((seg) => (
          <Polyline
            key={seg.id}
            positions={seg.coordinates}
            pathOptions={{ color: "#64748b", weight: 3, opacity: 0.8 }}
          />
        ))}
    </>
  );
}

function NetherlandsBoundaryLayer() {
  const [data, setData] = useState<GeoJSON.GeoJSON | null>(null);

  useEffect(() => {
    const NETHERLANDS_BOUNDARY_URL =
      "https://raw.githubusercontent.com/mattijn/datasets/master/NL_outline_geo.json";
    fetch(NETHERLANDS_BOUNDARY_URL)
      .then((res) => res.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <GeoJSON
      data={data}
      style={{
        fillColor: "#e0f2fe",
        fillOpacity: 0.45,
        color: "#7dd3fc",
        weight: 1.2,
      }}
      interactive={false}
    />
  );
}

export function MapView({
  onRegionClick,
  currentLensId,
  activeLayers = new Set(),
}: {
  onRegionClick: (regionId: string) => void;
  currentLensId?: string;
  activeLayers?: Set<string>;
}) {
  return (
    <MapContainer
      center={NETHERLANDS_CENTER}
      zoom={NETHERLANDS_DEFAULT_ZOOM}
      className="h-full w-full rounded-b-[10px]"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <NetherlandsBoundaryLayer />
      <InfrastructureLayers activeLayers={activeLayers} />
      <RegionLayer onRegionClick={onRegionClick} currentLensId={currentLensId} />
    </MapContainer>
  );
}

