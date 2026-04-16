/**
 * Mock infrastructure locations for map layer toggles.
 * Coordinates [lat, lng] for Leaflet.
 */

export interface PortLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface LineSegment {
  id: string;
  name?: string;
  coordinates: [number, number][]; // [lat, lng][]
}

export const PORTS: PortLocation[] = [
  { id: "rotterdam", name: "Port of Rotterdam", lat: 51.9022, lng: 4.4667 },
  { id: "amsterdam", name: "Port of Amsterdam", lat: 52.3779, lng: 4.897 },
  { id: "groningen", name: "Groningen Seaports", lat: 53.2194, lng: 6.5667 },
  { id: "vlissingen", name: "North Sea Port (Vlissingen)", lat: 51.4425, lng: 3.5736 },
  { id: "den-helder", name: "Port of Den Helder", lat: 52.9599, lng: 4.7593 },
  { id: "terneuzen", name: "North Sea Port (Terneuzen)", lat: 51.3358, lng: 3.8392 },
];

/** Hydrogen pipeline segments (simplified) – [lat, lng] */
export const HYDROGEN_PIPELINES: LineSegment[] = [
  {
    id: "h2-rotterdam-amsterdam",
    name: "Rotterdam–Amsterdam corridor",
    coordinates: [
      [51.92, 4.48],
      [52.08, 4.65],
      [52.25, 4.85],
      [52.38, 4.9],
    ],
  },
  {
    id: "h2-rotterdam-zeeland",
    name: "Rotterdam–Zeeland",
    coordinates: [
      [51.92, 4.48],
      [51.65, 4.15],
      [51.44, 3.6],
    ],
  },
  {
    id: "h2-north",
    name: "Northern backbone (planned)",
    coordinates: [
      [52.38, 4.9],
      [52.95, 5.5],
      [53.2, 6.5],
    ],
  },
];

/** Power grid / key nodes (simplified) – [lat, lng] */
export const POWER_GRID_POINTS: PortLocation[] = [
  { id: "maasvlakte", name: "Maasvlakte", lat: 51.95, lng: 4.03 },
  { id: "diemen", name: "Diemen", lat: 52.34, lng: 5.0 },
  { id: "eemshaven", name: "Eemshaven", lat: 53.44, lng: 6.83 },
  { id: "borsele", name: "Borssele", lat: 51.43, lng: 3.73 },
];

/** Industrial clusters – [lat, lng] */
export const INDUSTRIAL_CLUSTERS: PortLocation[] = [
  { id: "rotterdam-cluster", name: "Rotterdam industrial area", lat: 51.88, lng: 4.5 },
  { id: "chemelot", name: "Chemelot", lat: 50.97, lng: 5.79 },
  { id: "ijmond", name: "IJmond", lat: 52.47, lng: 4.6 },
  { id: "noordzeekanaal", name: "Noordzeekanaal", lat: 52.42, lng: 4.82 },
];

/** Renewable energy sites (wind/solar) – [lat, lng] */
export const RENEWABLE_SITES: PortLocation[] = [
  { id: "wind-borssele", name: "Borssele wind", lat: 51.65, lng: 2.85 },
  { id: "wind-hollandse-kust", name: "Hollandse Kust", lat: 52.6, lng: 4.0 },
  { id: "eemshaven-wind", name: "Eemshaven wind", lat: 53.45, lng: 6.85 },
  { id: "solar-zeeland", name: "Zeeland solar", lat: 51.5, lng: 3.9 },
];

/** CO₂ transport segments – [lat, lng] */
export const CO2_TRANSPORT: LineSegment[] = [
  {
    id: "co2-rotterdam-offshore",
    name: "Rotterdam CCS corridor",
    coordinates: [
      [51.92, 4.48],
      [51.75, 3.8],
      [51.5, 3.2],
    ],
  },
  {
    id: "co2-zeeland",
    name: "Zeeland CO₂",
    coordinates: [
      [51.44, 3.6],
      [51.5, 3.4],
    ],
  },
];
