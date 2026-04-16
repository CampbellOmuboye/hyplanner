import type { Region } from "./types";

/**
 * Centroid of a region's geometry (first ring only). Returns [lat, lng] for Leaflet.
 */
export function getRegionCenter(region: Region): [number, number] {
  const ring = region.geometry[0];
  if (!ring || ring.length === 0) return [52.1, 5.4];
  const pts =
    ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  let sumLng = 0;
  let sumLat = 0;
  for (const p of pts) {
    sumLng += p[0];
    sumLat += p[1];
  }
  const n = pts.length;
  return [sumLat / n, sumLng / n];
}

/**
 * Simplified polygon rings for Dutch regions (approximate).
 * Each ring is [lng, lat][] with first point repeated at end.
 */
function polygon(ring: number[][]): number[][][] {
  const closed = [...ring];
  if (
    closed.length > 1 &&
    (closed[0][0] !== closed[closed.length - 1][0] || closed[0][1] !== closed[closed.length - 1][1])
  ) {
    closed.push(closed[0]);
  }
  return [closed];
}

export const MOCK_REGIONS: Region[] = [
  {
    id: "rotterdam-den-haag",
    name: "Rotterdam–Den Haag Cluster",
    nameNl: "Rotterdam–Den Haag Cluster",
    classification: "Investable",
    classificationByLens: {
      hydrogenProduction: "Investable",
      hydrogenDemand: "Investable",
      hydrogenTransport: "Investable",
      ccusHubs: "Investable",
      industrialElectrification: "Viable",
    },
    summary:
      "Major port and industrial hub with existing hydrogen initiatives, strong grid connectivity, and policy support for energy transition.",
    summaryNl:
      "Belangrijke haven en industrieel knooppunt met bestaande waterstofinitiatieven, sterke netwerkaansluiting en beleidsondersteuning voor de energietransitie.",
    readiness: {
      energy: 85,
      infrastructure: 90,
      policy: 82,
      ecosystem: 88,
    },
    infrastructureSignals: [
      "Port of Rotterdam – Europe's largest port",
      "Existing natural gas pipeline network",
      "High-voltage grid capacity",
      "Planned H2 backbone connection",
      "CCS infrastructure development",
    ],
    ecosystemActors: [
      { name: "Port of Rotterdam", role: "Port authority / developer" },
      { name: "Shell", role: "Industrial / developer" },
      { name: "Uniper", role: "Developer" },
      { name: "Gasunie", role: "Infrastructure / TSO" },
      { name: "Vopak", role: "Storage / logistics" },
    ],
    opportunityDrivers: [
      "Strategic location for import and distribution",
      "Existing industrial demand and offtake agreements",
      "Strong policy alignment and permitting track record",
      "Mature supply chain and EPC presence",
    ],
    developmentGaps: [
      "Final investment decisions on large-scale production",
      "Grid reinforcement timelines for full electrification",
    ],
    geometry: polygon([
      [4.25, 51.85],
      [4.6, 51.85],
      [4.65, 52.05],
      [4.3, 52.08],
      [4.25, 51.85],
    ]),
  },
  {
    id: "amsterdam-ijmond",
    name: "Amsterdam–IJmond",
    nameNl: "Amsterdam–IJmond",
    classification: "Viable",
    classificationByLens: {
      hydrogenProduction: "Viable",
      hydrogenDemand: "Viable",
      hydrogenTransport: "Viable",
      ccusHubs: "Emerging",
      industrialElectrification: "Viable",
    },
    summary:
      "Industrial and logistics cluster with growing hydrogen demand and good connectivity to planned national H2 backbone.",
    summaryNl:
      "Industrieel en logistiek cluster met groeiende waterstofvraag en goede aansluiting op de geplande nationale H2-backbone.",
    readiness: {
      energy: 72,
      infrastructure: 68,
      policy: 75,
      ecosystem: 70,
    },
    infrastructureSignals: [
      "Port of Amsterdam",
      "Refinery and chemical sites",
      "Grid connection to North Sea wind",
      "Planned H2 pipeline corridor",
    ],
    ecosystemActors: [
      { name: "Port of Amsterdam", role: "Port authority" },
      { name: "Tata Steel", role: "Industrial offtaker" },
      { name: "Nouryon", role: "Industrial" },
      { name: "Alliander", role: "DSO" },
    ],
    opportunityDrivers: [
      "Industrial decarbonization demand",
      "Proximity to offshore wind and import routes",
      "Regional hydrogen strategy support",
    ],
    developmentGaps: [
      "Limited large-scale production projects to date",
      "Grid capacity for green hydrogen production",
    ],
    geometry: polygon([
      [4.7, 52.3],
      [5.05, 52.32],
      [5.1, 52.45],
      [4.75, 52.48],
      [4.7, 52.3],
    ]),
  },
  {
    id: "north-sea-port",
    name: "North Sea Port (Zeeland)",
    nameNl: "North Sea Port (Zeeland)",
    classification: "Viable",
    classificationByLens: {
      hydrogenProduction: "Viable",
      hydrogenDemand: "Viable",
      hydrogenTransport: "Viable",
      ccusHubs: "Investable",
      industrialElectrification: "Viable",
    },
    summary:
      "Cross-border port cluster with heavy industry, ammonia and chemical production, and potential for blue and green hydrogen.",
    summaryNl:
      "Grensoverschrijdend havencluster met zware industrie, ammoniak- en chemieproductie en potentieel voor blauwe en groene waterstof.",
    readiness: {
      energy: 65,
      infrastructure: 78,
      policy: 70,
      ecosystem: 72,
    },
    infrastructureSignals: [
      "North Sea Port (NL–BE)",
      "Ammonia and fertilizer plants",
      "Existing pipeline infrastructure",
      "CO2 transport potential",
    ],
    ecosystemActors: [
      { name: "North Sea Port", role: "Port authority" },
      { name: "Yara", role: "Industrial / offtaker" },
      { name: "Dow", role: "Industrial" },
      { name: "ArcelorMittal", role: "Industrial" },
    ],
    opportunityDrivers: [
      "Existing hydrogen and ammonia demand",
      "Port synergies and cross-border cooperation",
      "CCUS and blue H2 pathway",
    ],
    developmentGaps: [
      "Large-scale renewable supply for green ammonia",
      "Permitting for new pipeline connections",
    ],
    geometry: polygon([
      [3.65, 51.32],
      [4.05, 51.35],
      [4.2, 51.52],
      [3.8, 51.5],
      [3.65, 51.32],
    ]),
  },
  {
    id: "groningen-emmen",
    name: "Groningen–Emmen",
    nameNl: "Groningen–Emmen",
    classification: "Emerging",
    classificationByLens: {
      hydrogenProduction: "Emerging",
      hydrogenDemand: "Viable",
      hydrogenTransport: "Viable",
      ccusHubs: "Emerging",
      industrialElectrification: "Emerging",
    },
    summary:
      "Northern cluster with gas heritage, potential for green hydrogen from offshore wind and role in future H2 backbone.",
    summaryNl:
      "Noordelijk cluster met gaserfgoed, potentieel voor groene waterstof uit offshore wind en rol in toekomstige H2-backbone.",
    readiness: {
      energy: 58,
      infrastructure: 62,
      policy: 65,
      ecosystem: 55,
    },
    infrastructureSignals: [
      "Gas infrastructure legacy",
      "Offshore wind development",
      "Planned H2 backbone northern branch",
      "Storage potential (salt caverns)",
    ],
    ecosystemActors: [
      { name: "Gasunie", role: "TSO" },
      { name: "Groningen Seaports", role: "Port authority" },
      { name: "NOM", role: "Regional development" },
      { name: "Nouryon", role: "Industrial" },
    ],
    opportunityDrivers: [
      "Offshore wind and green H2 potential",
      "Storage and backbone positioning",
      "Regional transition support",
    ],
    developmentGaps: [
      "Early stage of project pipeline",
      "Grid reinforcement for large-scale production",
    ],
    geometry: polygon([
      [6.35, 52.95],
      [6.95, 53.0],
      [7.0, 53.25],
      [6.4, 53.22],
      [6.35, 52.95],
    ]),
  },
  {
    id: "limburg",
    name: "Limburg Industrial Corridor",
    nameNl: "Limburg Industrieel Corridor",
    classification: "Emerging",
    classificationByLens: {
      hydrogenProduction: "Emerging",
      hydrogenDemand: "Viable",
      hydrogenTransport: "Viable",
      ccusHubs: "Emerging",
      industrialElectrification: "Viable",
    },
    summary:
      "Industrial and logistics region with potential for hydrogen demand from industry and transport; connection to Belgian and German corridors.",
    summaryNl:
      "Industrieel en logistiek gebied met potentieel voor waterstofvraag uit industrie en transport; aansluiting op Belgische en Duitse corridors.",
    readiness: {
      energy: 52,
      infrastructure: 55,
      policy: 60,
      ecosystem: 50,
    },
    infrastructureSignals: [
      "Chemelot chemical park",
      "Logistics and inland shipping",
      "Cross-border pipeline links",
      "Grid connection to neighbouring countries",
    ],
    ecosystemActors: [
      { name: "Chemelot", role: "Industrial park" },
      { name: "Brightlands", role: "Innovation cluster" },
      { name: "Limburg province", role: "Government" },
    ],
    opportunityDrivers: ["Industrial cluster decarbonization", "Strategic location for H2 corridors"],
    developmentGaps: [
      "Limited production projects so far",
      "Dependency on cross-border infrastructure",
    ],
    geometry: polygon([
      [5.65, 50.85],
      [6.2, 50.9],
      [6.25, 51.25],
      [5.7, 51.2],
      [5.65, 50.85],
    ]),
  },
  {
    id: "noord-holland-noord",
    name: "North Holland North",
    nameNl: "Noord-Holland Noord",
    classification: "Viable",
    classificationByLens: {
      hydrogenProduction: "Viable",
      hydrogenDemand: "Emerging",
      hydrogenTransport: "Viable",
      ccusHubs: "Emerging",
      industrialElectrification: "Viable",
    },
    summary:
      "Region with strong renewable potential, port activity at Den Helder, and growing interest in green hydrogen for industry and mobility.",
    summaryNl:
      "Regio met sterk hernieuwbaar potentieel, havenactiviteit in Den Helder en groeiende belangstelling voor groene waterstof voor industrie en mobiliteit.",
    readiness: {
      energy: 70,
      infrastructure: 64,
      policy: 72,
      ecosystem: 65,
    },
    infrastructureSignals: [
      "Den Helder port",
      "Offshore wind and grid connections",
      "Agricultural and industrial demand",
      "Planned H2 infrastructure",
    ],
    ecosystemActors: [
      { name: "Port of Den Helder", role: "Port authority" },
      { name: "TenneT", role: "TSO" },
      { name: "Regional developers", role: "Developer" },
    ],
    opportunityDrivers: ["Proximity to offshore wind", "Diverse demand potential"],
    developmentGaps: ["Scale of production projects to be confirmed", "Grid capacity for new demand"],
    geometry: polygon([
      [4.7, 52.5],
      [5.25, 52.55],
      [5.35, 52.75],
      [4.8, 52.72],
      [4.7, 52.5],
    ]),
  },
];

export function getRegionById(id: string): Region | undefined {
  return MOCK_REGIONS.find((r) => r.id === id);
}

