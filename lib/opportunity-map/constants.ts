import type { Lens, InfrastructureLayerId } from "./types";

export const OPPORTUNITY_COLORS: Record<
  "Emerging" | "Viable" | "Investable",
  string
> = {
  Emerging: "#facc15",
  Viable: "#22c55e",
  Investable: "#166534",
};

export const LENSES: Lens[] = [
  { id: "hydrogenProduction", labelKey: "hydrogenProduction" },
  { id: "hydrogenDemand", labelKey: "hydrogenDemand" },
  { id: "hydrogenTransport", labelKey: "hydrogenTransport" },
  { id: "ccusHubs", labelKey: "ccusHubs" },
  { id: "industrialElectrification", labelKey: "industrialElectrification" },
];

export const INFRASTRUCTURE_LAYERS: { id: InfrastructureLayerId; labelKey: string }[] = [
  { id: "ports", labelKey: "ports" },
  { id: "hydrogenPipelines", labelKey: "hydrogenPipelines" },
  { id: "powerGrid", labelKey: "powerGrid" },
  { id: "industrialClusters", labelKey: "industrialClusters" },
  { id: "renewableSites", labelKey: "renewableSites" },
  { id: "co2Transport", labelKey: "co2Transport" },
];

// [lat, lng] for Leaflet
export const NETHERLANDS_CENTER: [number, number] = [52.1, 5.4];

export const NETHERLANDS_DEFAULT_ZOOM = 6;

