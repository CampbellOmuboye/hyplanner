export type UserType =
  | "production_hub"
  | "distribution_logistics"
  | "offtake_cluster"
  | "transport_corridor";

export type HydrogenType = "Blue" | "Green";
export type PriceScenario = "High" | "Medium" | "Low" | "All";

export type GlobalInputs = {
  hydrogen_type?: HydrogenType;
  period_start?: number;
  period_end?: number;
  natural_gas_price_scenario?: PriceScenario;
  co2_price_scenario?: PriceScenario;
};

export type OfftakeClusterInputs = {
  user_type: "offtake_cluster";
  global: GlobalInputs;
  annual_natural_gas_consumption?: number;
  annual_natural_gas_consumption_unit?: "m3" | "kWh" | "MWh" | "GWh";
  replacement_percentage?: number; // 0..1
};

export type ProductionHubInputs = {
  user_type: "production_hub";
  global: GlobalInputs;
  electrolyzer_capacity_MW?: number;
  reformer_capacity_MW?: number;
  capacity_factor?: number; // 0..1
  efficiency_kWh_per_kg?: number;
  /** Annualized capex (EUR/year) — desk 1.0 */
  capex?: number;
  /** Annual opex (EUR/year) — desk 1.0 */
  opex?: number;
  /** Optional: grid electricity (EUR/MWh); used for Green H₂ variable €/kg */
  annual_electricity_price_eur_per_MWh?: number;
};

export type DistributionLogisticsInputs = {
  user_type: "distribution_logistics";
  global: GlobalInputs;
  hydrogen_volume_input_method?: "from_production" | "from_demand";
  hydrogen_input_value_kg?: number;
  transport_distance_km?: number;
  transport_mode?: "truck" | "pipeline";
  cost_per_km_per_kg?: number;
};

export type TransportCorridorInputs = {
  user_type: "transport_corridor";
  global: GlobalInputs;
  node_demands_kg?: number[];
  average_distance_between_nodes?: number;
  cost_per_km_per_kg?: number;
  /** 0–1: share lost (compression, boil-off, etc.); desk 1.0 default 0 */
  loss_factor?: number;
};

export type DemandModelInput =
  | OfftakeClusterInputs
  | ProductionHubInputs
  | DistributionLogisticsInputs
  | TransportCorridorInputs;

export type DemandModelResult = {
  user_type: UserType;
  yearly_results: Array<Record<string, unknown>>;
  cumulative_results: Record<string, unknown>;
  summary_metrics: Record<string, unknown>;
};

export type ValidationIssue = { field: string; message: string };
