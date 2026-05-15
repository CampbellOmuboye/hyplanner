import type { OfftakeQsAssumptionOverrides } from "./types";

/**
 * Default physical / emissions factors aligned with QuickScan `assumptions.json`
 * (`consumers/service.py` uses the same shapes via the Assumptions model).
 */
export const OFFTAKE_QS_DEFAULTS = {
  chemical_properties: {
    hydrogen: {
      lhv_mass_kwh_per_kg: 33.33,
      lhv_volume_kwh_per_nm3: 3.0,
      density_1_bar_kg_per_nm3: 0.0899,
      fuel_cell_electrical_efficiency_percent: 55,
    },
    co2_emissions: {
      gray_hydrogen_kg_co2_per_nm3_h2: 1.1,
      natural_gas_kg_co2_per_nm3_ng: 1.78,
      diesel_kg_co2_per_l_diesel: 2.6,
    },
    diesel: {
      lhv_diesel_kwh_per_kg: 11.94,
      density_diesel_kg_per_l: 0.83,
      diesel_engine_efficiency_percent: 40,
    },
  },
  natural_gas: {
    lhv_nl_gas_grid_kwh_per_nm3: 8.8,
  },
  electrolyzer: {
    efficiency_kwh_per_kg_h2: 56,
  },
} as const;

export type MergedOfftakeQsAssumptions = {
  h2_lhv_mass_kwh_per_kg: number;
  h2_lhv_volume_kwh_per_nm3: number;
  h2_density_kg_per_nm3: number;
  ng_lhv_kwh_per_nm3: number;
  diesel_lhv_kwh_per_kg: number;
  diesel_density_kg_per_l: number;
  diesel_engine_efficiency_percent: number;
  fuel_cell_electrical_efficiency_percent: number;
  grid_balancing_specific_energy_kwh_per_kg: number;
  ng_kg_co2_per_nm3: number;
  grey_h2_kg_co2_per_nm3: number;
  diesel_kg_co2_per_l: number;
};

export function mergeOfftakeQsAssumptions(overrides?: OfftakeQsAssumptionOverrides | null): MergedOfftakeQsAssumptions {
  const d = OFFTAKE_QS_DEFAULTS;
  return {
    h2_lhv_mass_kwh_per_kg: overrides?.h2_lhv_mass_kwh_per_kg ?? d.chemical_properties.hydrogen.lhv_mass_kwh_per_kg,
    h2_lhv_volume_kwh_per_nm3: overrides?.h2_lhv_volume_kwh_per_nm3 ?? d.chemical_properties.hydrogen.lhv_volume_kwh_per_nm3,
    h2_density_kg_per_nm3: overrides?.h2_density_kg_per_nm3 ?? d.chemical_properties.hydrogen.density_1_bar_kg_per_nm3,
    ng_lhv_kwh_per_nm3: overrides?.ng_lhv_kwh_per_nm3 ?? d.natural_gas.lhv_nl_gas_grid_kwh_per_nm3,
    diesel_lhv_kwh_per_kg: overrides?.diesel_lhv_kwh_per_kg ?? d.chemical_properties.diesel.lhv_diesel_kwh_per_kg,
    diesel_density_kg_per_l: overrides?.diesel_density_kg_per_l ?? d.chemical_properties.diesel.density_diesel_kg_per_l,
    diesel_engine_efficiency_percent: overrides?.diesel_engine_efficiency_percent ?? d.chemical_properties.diesel.diesel_engine_efficiency_percent,
    fuel_cell_electrical_efficiency_percent:
      overrides?.fuel_cell_electrical_efficiency_percent ?? d.chemical_properties.hydrogen.fuel_cell_electrical_efficiency_percent,
    grid_balancing_specific_energy_kwh_per_kg:
      overrides?.grid_balancing_specific_energy_kwh_per_kg ?? d.electrolyzer.efficiency_kwh_per_kg_h2,
    ng_kg_co2_per_nm3: overrides?.ng_kg_co2_per_nm3 ?? d.chemical_properties.co2_emissions.natural_gas_kg_co2_per_nm3_ng,
    grey_h2_kg_co2_per_nm3: overrides?.grey_h2_kg_co2_per_nm3 ?? d.chemical_properties.co2_emissions.gray_hydrogen_kg_co2_per_nm3_h2,
    diesel_kg_co2_per_l: overrides?.diesel_kg_co2_per_l ?? d.chemical_properties.co2_emissions.diesel_kg_co2_per_l_diesel,
  };
}
