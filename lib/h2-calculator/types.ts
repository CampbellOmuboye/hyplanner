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

/** Optional overrides for QuickScan-aligned offtake demand (defaults match QS `assumptions.json`). */
export type OfftakeQsAssumptionOverrides = {
  h2_lhv_mass_kwh_per_kg?: number;
  h2_lhv_volume_kwh_per_nm3?: number;
  h2_density_kg_per_nm3?: number;
  ng_lhv_kwh_per_nm3?: number;
  diesel_lhv_kwh_per_kg?: number;
  diesel_density_kg_per_l?: number;
  diesel_engine_efficiency_percent?: number;
  fuel_cell_electrical_efficiency_percent?: number;
  grid_balancing_specific_energy_kwh_per_kg?: number;
  ng_kg_co2_per_nm3?: number;
  grey_h2_kg_co2_per_nm3?: number;
  diesel_kg_co2_per_l?: number;
};

export type OfftakeClusterInputs = {
  user_type: "offtake_cluster";
  global: GlobalInputs;
  /**
   * QS primary: `natural_gas.usage_nm3_per_year` — when > 0, used for NG→H₂ (overrides energy row for that stream).
   */
  natural_gas_usage_nm3_per_year?: number;
  /** Alternative: annual gas as energy/volume (converted with QS NG LHV for m³). */
  annual_natural_gas_consumption?: number;
  annual_natural_gas_consumption_unit?: "m3" | "kWh" | "MWh" | "GWh";
  /** QS: `natural_gas.replacement_goal_percent` (0–1 or 0–100 %). */
  replacement_percentage?: number;
  /** QS: `grey_h2.usage_nm3_per_year` */
  grey_h2_usage_nm3_per_year?: number;
  /** QS: `grey_h2.replacement_goal_percent` */
  grey_h2_replacement_percentage?: number;
  /** QS: `mobility.diesel_usage_l_per_year` */
  mobility_diesel_liters_per_year?: number;
  /** QS: `mobility.replacement_goal_percent` */
  mobility_replacement_percentage?: number;
  /** QS: `new_h2_mobility.usage_ton_per_year` */
  new_green_h2_mobility_ton_per_year?: number;
  /**
   * Desk extension (not in QS `derive_consumer_demands` yet): annual **electrical** energy for
   * electrolysis attributed to grid balancing (MWh_e/yr). With optional utilisation and either
   * **system kWh/kg** (default 56) or **η** = electrical→chemical (LHV) efficiency: kg = (MWh×1000×u×η) / LHV_mass.
   */
  grid_balancing_electrolysis_electricity_mwh_per_year?: number;
  /** 0–1 share of the grid-balancing MWh_e applied (default 1). */
  grid_balancing_utilisation_01?: number;
  /** When set (0–1), H₂ kg = (MWh_e×1000×utilisation×η) / LHV_H₂_mass; otherwise use kWh/kg from assumptions. */
  grid_balancing_electrical_to_chemical_efficiency_01?: number;
  offtake_qs_assumptions?: OfftakeQsAssumptionOverrides;
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
