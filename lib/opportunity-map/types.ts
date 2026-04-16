export type OpportunityClassification = "Emerging" | "Viable" | "Investable";

export interface ReadinessScores {
  energy: number;
  infrastructure: number;
  policy: number;
  ecosystem: number;
}

export interface EcosystemActor {
  name: string;
  role: string;
}

export interface Region {
  id: string;
  name: string;
  nameNl?: string;
  classification: OpportunityClassification;
  /**
   * Per-lens classification for map coloring when lens changes (lens id -> classification)
   * Example lens ids: "hydrogenProduction", "hydrogenDemand", ...
   */
  classificationByLens?: Partial<Record<string, OpportunityClassification>>;
  summary: string;
  summaryNl?: string;
  readiness: ReadinessScores;
  infrastructureSignals: string[];
  ecosystemActors: EcosystemActor[];
  opportunityDrivers: string[];
  developmentGaps: string[];
  /**
   * GeoJSON Polygon coordinates [ring][point][lng, lat] - close the ring
   * (We treat coordinates as simplified rings in this MVP.)
   */
  geometry: number[][][];
}

export interface Lens {
  id: string;
  labelKey: string;
}

export type InfrastructureLayerId =
  | "ports"
  | "hydrogenPipelines"
  | "powerGrid"
  | "industrialClusters"
  | "renewableSites"
  | "co2Transport";

