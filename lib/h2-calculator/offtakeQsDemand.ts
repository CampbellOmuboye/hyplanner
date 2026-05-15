import type { OfftakeClusterInputs } from "./types";
import { clamp01 } from "./shared";
import { mergeOfftakeQsAssumptions, type MergedOfftakeQsAssumptions } from "./offtakeQsDefaults";

/** Match QuickScan `_normalize_goal_percent`: accept 0–1 or 0–100. */
export function normalizeReplacementGoal(raw: number | undefined, fallback: number): number {
  let g = raw ?? fallback;
  if (!Number.isFinite(g)) g = fallback;
  if (g > 1) g = g / 100;
  if (g < 0) g = 0;
  if (g > 1) g = 1;
  return g;
}

/** Natural gas consumption → thermal energy (MWh/year); m³ treated as Nm³ with QS grid LHV. */
export function naturalGasThermalMWhPerYear(consumption: number, unit: "m3" | "kWh" | "MWh" | "GWh", a: MergedOfftakeQsAssumptions): number {
  switch (unit) {
    case "m3":
      return (consumption * a.ng_lhv_kwh_per_nm3) / 1000;
    case "kWh":
      return consumption / 1000;
    case "MWh":
      return consumption;
    case "GWh":
      return consumption * 1000;
    default:
      return 0;
  }
}

/** Port of `calculate_h2_demand_from_diesel` → kg/year (QS `consumers/service.py`). */
export function hydrogenKgPerYearFromDieselLiters(
  dieselLitersPerYear: number,
  goal01: number,
  a: MergedOfftakeQsAssumptions
): number {
  const g = clamp01(goal01);
  const dieselLhvKwhPerL = a.diesel_lhv_kwh_per_kg * a.diesel_density_kg_per_l;
  const dieselEnergyKwh = dieselLitersPerYear * dieselLhvKwhPerL;
  const dieselEff = a.diesel_engine_efficiency_percent / 100;
  const fcEff = a.fuel_cell_electrical_efficiency_percent / 100;
  const efficiencyFactor = dieselEff / fcEff;
  const h2EnergyKwh = dieselEnergyKwh * g * efficiencyFactor;
  return h2EnergyKwh / a.h2_lhv_mass_kwh_per_kg;
}

export type OfftakeQsBreakdown = {
  assumptions: MergedOfftakeQsAssumptions;
  /** True when `natural_gas.usage_nm3_per_year` drives the NG branch (QS canonical). */
  natural_gas_from_nm3_path: boolean;
  natural_gas_thermal_mwh_per_year: number;
  replaceable_natural_gas_thermal_mwh_per_year: number;
  hydrogen_kg_from_natural_gas: number;
  hydrogen_kg_from_grey_h2: number;
  hydrogen_kg_from_mobility_diesel: number;
  hydrogen_kg_from_new_green_h2_mobility: number;
  hydrogen_kg_from_grid_balancing: number;
  total_hydrogen_kg_per_year: number;
  total_hydrogen_ton_per_year: number;
  /** QS `ConsumerDemand` baselines (pre-replacement activity). */
  baseline_natural_gas_nm3_per_year: number;
  baseline_grey_h2_nm3_per_year: number;
  baseline_diesel_l_per_year: number;
  hydrogen_nm3_per_year: number;
  hydrogen_energy_mwh_per_year: number;
  avoided_co2_ton_from_natural_gas: number;
  avoided_co2_ton_from_grey_h2: number;
  avoided_co2_ton_from_diesel: number;
  avoided_co2_ton_total: number;
};

export function computeOfftakeQsBreakdown(input: OfftakeClusterInputs): OfftakeQsBreakdown {
  const a = mergeOfftakeQsAssumptions(input.offtake_qs_assumptions);

  const ngGoal = normalizeReplacementGoal(input.replacement_percentage, 0);
  const ngNm3Dedicated = input.natural_gas_usage_nm3_per_year ?? 0;
  const ngConsumption = input.annual_natural_gas_consumption ?? 0;
  const ngUnit = input.annual_natural_gas_consumption_unit ?? "MWh";

  let natural_gas_from_nm3_path = false;
  let natural_gas_thermal_mwh_per_year = 0;
  let replaceable_natural_gas_thermal_mwh_per_year = 0;
  let hydrogen_kg_from_natural_gas = 0;

  if (ngNm3Dedicated > 0) {
    natural_gas_from_nm3_path = true;
    const ngEnergyKwh = ngNm3Dedicated * a.ng_lhv_kwh_per_nm3;
    natural_gas_thermal_mwh_per_year = ngEnergyKwh / 1000;
    replaceable_natural_gas_thermal_mwh_per_year = natural_gas_thermal_mwh_per_year * ngGoal;
    hydrogen_kg_from_natural_gas = (replaceable_natural_gas_thermal_mwh_per_year * 1000) / a.h2_lhv_mass_kwh_per_kg;
  } else if (ngConsumption > 0 && input.annual_natural_gas_consumption_unit) {
    natural_gas_thermal_mwh_per_year = naturalGasThermalMWhPerYear(ngConsumption, ngUnit, a);
    replaceable_natural_gas_thermal_mwh_per_year = natural_gas_thermal_mwh_per_year * ngGoal;
    hydrogen_kg_from_natural_gas = (replaceable_natural_gas_thermal_mwh_per_year * 1000) / a.h2_lhv_mass_kwh_per_kg;
  }

  const greyNm3 = input.grey_h2_usage_nm3_per_year ?? 0;
  const greyGoal = normalizeReplacementGoal(input.grey_h2_replacement_percentage, greyNm3 > 0 ? 0.3 : 0);
  const greyEnergyKwh = greyNm3 > 0 ? greyNm3 * a.h2_lhv_volume_kwh_per_nm3 * greyGoal : 0;
  const hydrogen_kg_from_grey_h2 = greyEnergyKwh / a.h2_lhv_mass_kwh_per_kg;

  const dieselL = input.mobility_diesel_liters_per_year ?? 0;
  const mobGoal = normalizeReplacementGoal(input.mobility_replacement_percentage, dieselL > 0 ? 0.3 : 0);
  const hydrogen_kg_from_mobility_diesel = dieselL > 0 ? hydrogenKgPerYearFromDieselLiters(dieselL, mobGoal, a) : 0;

  const newTon = input.new_green_h2_mobility_ton_per_year ?? 0;
  const hydrogen_kg_from_new_green_h2_mobility = newTon > 0 ? newTon * 1000 : 0;

  const gridMwh = input.grid_balancing_electrolysis_electricity_mwh_per_year ?? 0;
  const gridUtil =
    input.grid_balancing_utilisation_01 !== undefined && Number.isFinite(input.grid_balancing_utilisation_01)
      ? clamp01(input.grid_balancing_utilisation_01)
      : gridMwh > 0
        ? 1
        : 0;
  const gridEta = input.grid_balancing_electrical_to_chemical_efficiency_01;
  const specKwhKg = a.grid_balancing_specific_energy_kwh_per_kg;

  let hydrogen_kg_from_grid_balancing = 0;
  if (gridMwh > 0) {
    const eKwh = gridMwh * 1000 * gridUtil;
    if (gridEta !== undefined && Number.isFinite(gridEta) && gridEta > 0) {
      hydrogen_kg_from_grid_balancing = (eKwh * clamp01(gridEta)) / a.h2_lhv_mass_kwh_per_kg;
    } else if (specKwhKg > 0) {
      hydrogen_kg_from_grid_balancing = eKwh / specKwhKg;
    }
  }

  const total_hydrogen_kg_per_year =
    hydrogen_kg_from_natural_gas +
    hydrogen_kg_from_grey_h2 +
    hydrogen_kg_from_mobility_diesel +
    hydrogen_kg_from_new_green_h2_mobility +
    hydrogen_kg_from_grid_balancing;

  const total_hydrogen_ton_per_year = total_hydrogen_kg_per_year / 1000;
  const hydrogen_nm3_per_year = a.h2_density_kg_per_nm3 > 0 ? total_hydrogen_kg_per_year / a.h2_density_kg_per_nm3 : 0;
  const hydrogen_energy_mwh_per_year = (total_hydrogen_kg_per_year * a.h2_lhv_mass_kwh_per_kg) / 1000;

  /** QS UC14-style baselines */
  const baseline_natural_gas_nm3_per_year =
    ngNm3Dedicated > 0 ? ngNm3Dedicated : natural_gas_thermal_mwh_per_year > 0 ? (natural_gas_thermal_mwh_per_year * 1000) / a.ng_lhv_kwh_per_nm3 : 0;
  const baseline_grey_h2_nm3_per_year = greyNm3;
  const baseline_diesel_l_per_year = dieselL;

  const replaceable_nm3_gas =
    ngNm3Dedicated > 0
      ? ngNm3Dedicated * ngGoal
      : replaceable_natural_gas_thermal_mwh_per_year > 0
        ? (replaceable_natural_gas_thermal_mwh_per_year * 1000) / a.ng_lhv_kwh_per_nm3
        : 0;

  const avoided_co2_ton_from_natural_gas = replaceable_nm3_gas > 0 ? (replaceable_nm3_gas * a.ng_kg_co2_per_nm3) / 1000 : 0;

  const replaced_grey_nm3 = greyNm3 * greyGoal;
  const avoided_co2_ton_from_grey_h2 = replaced_grey_nm3 > 0 ? (replaced_grey_nm3 * a.grey_h2_kg_co2_per_nm3) / 1000 : 0;

  const replaced_diesel_l = dieselL * mobGoal;
  const avoided_co2_ton_from_diesel = replaced_diesel_l > 0 ? (replaced_diesel_l * a.diesel_kg_co2_per_l) / 1000 : 0;

  const avoided_co2_ton_total = avoided_co2_ton_from_natural_gas + avoided_co2_ton_from_grey_h2 + avoided_co2_ton_from_diesel;

  return {
    assumptions: a,
    natural_gas_from_nm3_path,
    natural_gas_thermal_mwh_per_year,
    replaceable_natural_gas_thermal_mwh_per_year,
    hydrogen_kg_from_natural_gas,
    hydrogen_kg_from_grey_h2,
    hydrogen_kg_from_mobility_diesel,
    hydrogen_kg_from_new_green_h2_mobility,
    hydrogen_kg_from_grid_balancing,
    total_hydrogen_kg_per_year,
    total_hydrogen_ton_per_year,
    baseline_natural_gas_nm3_per_year,
    baseline_grey_h2_nm3_per_year,
    baseline_diesel_l_per_year,
    hydrogen_nm3_per_year,
    hydrogen_energy_mwh_per_year,
    avoided_co2_ton_from_natural_gas,
    avoided_co2_ton_from_grey_h2,
    avoided_co2_ton_from_diesel,
    avoided_co2_ton_total,
  };
}

export function offtakeHasAnyDemandStream(input: OfftakeClusterInputs): boolean {
  const ngNm3 = (input.natural_gas_usage_nm3_per_year ?? 0) > 0;
  const ngEnergy = (input.annual_natural_gas_consumption ?? 0) > 0;
  const grey = (input.grey_h2_usage_nm3_per_year ?? 0) > 0;
  const diesel = (input.mobility_diesel_liters_per_year ?? 0) > 0;
  const newH2 = (input.new_green_h2_mobility_ton_per_year ?? 0) > 0;
  const grid = (input.grid_balancing_electrolysis_electricity_mwh_per_year ?? 0) > 0;
  return ngNm3 || ngEnergy || grey || diesel || newH2 || grid;
}
